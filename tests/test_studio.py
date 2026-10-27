import asyncio
from copy import deepcopy
from dataclasses import asdict
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import httpx
from station.app import create_app, load_schedule
from station.content import ContentStore
from station.runtime import RuntimeStore
from station.studio import StudioStore, Conflict, create_studio, fill_block


class StudioTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.config=Path(self.temp.name)
        self.station=load_schedule()
        self.media=self.station.root
        (self.config/'catalog.json').write_text(json.dumps({'assets':self.station.assets}))
        (self.config/'schedule.json').write_text(json.dumps(self.station.config))
        editorial=asdict(ContentStore(Path(__file__).resolve().parents[1]/'config').snapshot(strict=True));editorial.pop('revision')
        for strand in editorial['strands'].values():
            for item in strand.get('lineup',[]):item.pop('id',None)
        (self.config/'content.json').write_text(json.dumps(editorial))
        self.store=StudioStore(self.config,self.media)

    def test_sqlite_draft_publish_and_restore_are_separate_and_runtime_reloads_one_bundle(self):
        initial=self.store.state();runtime=RuntimeStore(self.config,self.media,content_root=self.config)
        old=runtime.snapshot(strict=True)
        draft=deepcopy(initial['document']);draft['blocks']['after-hours']['title']='New block title'
        saved=self.store.save(draft,initial['revision'])
        self.assertEqual(runtime.snapshot().editorial.strands['after-hours'].get('title'),old.editorial.strands['after-hours'].get('title'))
        reopened=StudioStore(self.config,self.media)
        self.assertEqual(reopened.state()['document'],saved['document'])
        reopened.publish(saved['revision'])
        new=runtime.snapshot()
        self.assertEqual(new.editorial.strands['after-hours']['title'],'New block title')
        self.assertNotEqual(new.editorial.revision,old.editorial.revision)
        self.assertEqual(new.schedule.config['blocks'],old.schedule.config['blocks'])
        bundle=json.loads((self.config/'published.json').read_text())
        self.assertTrue(all('provenance' not in a and 'source_metadata' not in a for a in bundle['catalog']['assets'].values()))
        restored=reopened.restore(initial['revision'],saved['revision'])
        self.assertGreater(restored['revision'],saved['revision'])
        self.assertEqual(restored['document'],initial['document'])
        self.assertEqual(runtime.snapshot().editorial.strands['after-hours']['title'],'New block title')
        with reopened.connect() as db:
            self.assertEqual(db.execute('PRAGMA foreign_keys').fetchone()[0],1)
            self.assertTrue(db.execute('SELECT count(*) FROM rundown').fetchone()[0]>0)

    def test_invalid_references_and_stale_edits_cannot_damage_the_draft(self):
        initial=self.store.state();bad=deepcopy(initial['document']);del bad['programmes']['ident']
        with self.assertRaises(ValueError):self.store.save(bad,initial['revision'])
        self.assertEqual(self.store.state()['revision'],initial['revision'])
        self.store.save(initial['document'],initial['revision'])
        with self.assertRaises(Conflict):self.store.save(initial['document'],initial['revision'])
        with self.assertRaises(Conflict):self.store.publish(initial['revision'])
        self.assertFalse((self.config/'published.json').exists())

    def test_planned_assets_pair_by_id_and_missing_scheduled_media_blocks_publication(self):
        state=self.store.state();draft=state['document']
        key=draft['blocks']['weans-01']['items'][0]['programme_id']
        self.assertFalse(state['ready'][key])
        draft['schedule']['blocks']=[{'profile':'weans-01','offset':0}]
        draft['schedule']['period_seconds']=86400
        saved=self.store.save(draft,state['revision'])
        self.assertTrue(saved['issues'])
        with self.assertRaises(ValueError):self.store.publish(saved['revision'])
        self.assertFalse((self.config/'published.json').exists())
        # An import that uses the expected ID pairs without modifying the rundown.
        catalog=json.loads((self.config/'catalog.json').read_text())
        catalog['assets'][key]={**catalog['assets']['ident'],'duration':130}
        (self.config/'catalog.json').write_text(json.dumps(catalog))
        paired=self.store.state()
        self.assertTrue(paired['ready'][key])
        self.assertEqual(paired['document']['blocks']['weans-01']['items'][0]['programme_id'],key)
        self.assertEqual(paired['durations']['weans-01'],10810)

    def test_overlaps_and_corrupt_publications_keep_the_current_runtime(self):
        state=self.store.state();self.store.publish(state['revision'])
        runtime=RuntimeStore(self.config,self.media,content_root=self.config);valid=runtime.snapshot(strict=True)
        draft=state['document'];draft['schedule']['blocks'].append(deepcopy(draft['schedule']['blocks'][0]))
        saved=self.store.save(draft,state['revision'])
        with self.assertRaises(ValueError):self.store.publish(saved['revision'])
        self.assertIs(runtime.snapshot(),valid)
        (self.config/'published.json').write_text('{')
        with self.assertLogs('station.runtime',level='WARNING'):self.assertIs(runtime.snapshot(),valid)

    def test_fill_counts_adverts_and_trims_only_the_selected_continuity_material(self):
        draft=self.store.state()['document']
        filled=fill_block(draft,'after-hours',120,'ident')
        self.assertEqual(len(filled['blocks']['after-hours']['items']),8)
        self.assertEqual(filled['blocks']['after-hours']['items'][-1],{'programme_id':'ident','duration':6})
        with self.assertRaises(ValueError):fill_block(draft,'after-hours',120,'programme')
        with self.assertRaises(ValueError):fill_block(draft,'after-hours',120,'ident','no-match')
        with self.assertRaises(ValueError):fill_block(draft,'after-hours',120,'ident',available=set())
        self.assertEqual(len(draft['blocks']['after-hours']['items']),7)


class StudioDeliveryTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.fixture=StudioTests();self.fixture.setUp();self.addCleanup(self.fixture.doCleanups)
        self.app=create_studio(self.fixture.config,self.fixture.media)
        self.client=httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app,client=('127.0.0.1',1234)),base_url='http://127.0.0.1:8001')
        async def heartbeat():
            while True:await asyncio.sleep(.01)
        self.pulse=asyncio.create_task(heartbeat())
    async def asyncTearDown(self):
        await self.client.aclose();self.pulse.cancel()
    async def test_local_studio_checks_origin_conflicts_and_public_app_has_no_editor(self):
        state=(await self.client.get('/api/studio')).json();body={'document':state['document'],'revision':state['revision']}
        self.assertEqual((await self.client.put('/api/studio',json=body)).status_code,403)
        self.assertEqual((await self.client.put('/api/studio',json=body,headers={'X-Oddity-Studio':'1','Origin':'https://elsewhere.test'})).status_code,403)
        good=await self.client.put('/api/studio',json=body,headers={'X-Oddity-Studio':'1','Origin':'http://127.0.0.1:8001'})
        self.assertEqual(good.status_code,200)
        self.assertEqual((await self.client.put('/api/studio',json=body,headers={'X-Oddity-Studio':'1'})).status_code,409)
        self.assertEqual((await self.client.get('/api/studio',headers={'Host':'elsewhere.test'})).status_code,403)
        bad=deepcopy(good.json()['document']);bad['schedule']['origin']=123
        self.assertEqual((await self.client.put('/api/studio',json={'document':bad,'revision':good.json()['revision']},headers={'X-Oddity-Studio':'1'})).status_code,422)
        remote=httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app,client=('192.0.2.1',1234)),base_url='http://127.0.0.1:8001')
        async with remote:self.assertEqual((await remote.get('/api/studio')).status_code,403)
        # A query parameter cannot turn the static route into a file reader.
        self.assertNotIn('assets', (await self.client.get('/?filename=../config/catalog.json')).text[:100])
        public=create_app(self.fixture.station,content_root=self.fixture.config)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=public),base_url='http://station.test') as viewer:
            for url in ('/api/studio','/studio','/studio.js','/config/studio.sqlite3','/config/published.json'):
                self.assertEqual((await viewer.get(url)).status_code,404)
            plan=(await viewer.get('/api/block-plans/weans-02')).json()['block']
            self.assertNotIn('notes',plan);self.assertNotIn('content_information',json.dumps(plan))
