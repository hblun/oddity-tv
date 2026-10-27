import asyncio
from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import httpx
from station.app import create_app, load_schedule
from station.blocks import airing_id, block_detail, block_list, planned_block
from station.content import ContentSnapshot, ContentStore
from station.schedule import Schedule


class BlockTests(unittest.TestCase):
    def setUp(self):
        self.station=load_schedule()
        self.editorial=ContentSnapshot()

    def test_collection_identity_is_available_in_the_player_and_block_guide(self):
        editorial=ContentSnapshot(collections={'family':{'title':'A family collection','theme':'citrus','blocks':['after-hours']}})
        event=self.station.timeline(self.station.origin,self.station.origin+1)[0]
        association=editorial.public(self.station,event)['programming']['collection']
        self.assertEqual(association,{'id':'family','title':'A family collection','theme':'citrus','part':1,'total':1})
        self.assertEqual(block_list(self.station,editorial,event.start,event.end)[0]['collection'],association)

    def test_full_airing_and_authored_work_survive_partial_window_and_advert_break(self):
        now=self.station.origin+87
        summary=block_list(self.station,self.editorial,now,now+2)[0]
        self.assertEqual(summary['start'],self.station.origin)
        self.assertEqual(summary['end'],self.station.origin+114)
        detail=block_detail(self.station,self.editorial,summary['id'],now)
        feature=[w for w in detail['works'] if w['asset']=='feature']
        self.assertEqual(len(feature),1)
        self.assertEqual(len(feature[0]['segments']),3)
        self.assertEqual([s['kind'] for s in feature[0]['segments']],['programme','advert','programme'])
        self.assertEqual(feature[0]['segments'][2]['source_in'],20)
        self.assertEqual(feature[0]['duration'],48)
        self.assertEqual(len(detail['works']),len(self.station.blocks[0]['items']))
        self.assertEqual(detail['works'][0]['start'],summary['start'])
        self.assertEqual(detail['works'][-1]['end'],summary['end'])
        self.assertNotIn('url',json.dumps(detail))
        self.assertNotIn('source_metadata',json.dumps(detail))

    def test_airings_have_occurrence_identity_and_continuity_has_one_interval(self):
        a=block_list(self.station,self.editorial,self.station.origin,self.station.origin+360)
        self.assertEqual(len(a),6)
        self.assertEqual(len({b['id'] for b in a}),6)
        self.assertNotEqual(a[0]['id'],a[2]['id'])
        self.assertEqual(a[0]['profile_id'],a[2]['profile_id'])
        gap=block_detail(self.station,self.editorial,a[1]['id'],self.station.origin+115)
        self.assertEqual(gap['title'],'Between blocks')
        self.assertEqual(gap['start'],self.station.origin+114)
        self.assertEqual(gap['end'],self.station.origin+120)

    def test_three_hour_block_is_complete_even_from_a_one_minute_guide_slice(self):
        config=deepcopy(self.station.config);catalog={'assets':deepcopy(self.station.assets)}
        catalog['assets']['feature']['duration']=10800
        config['period_seconds']=21600
        config['blocks']=[{'profile':'after-hours','offset':0,'items':[{'asset':'feature'}]}]
        station=Schedule(config,catalog,self.station.root)
        now=station.origin+7200
        summary=block_list(station,self.editorial,now,now+60)[0]
        detail=block_detail(station,self.editorial,summary['id'],now)
        self.assertEqual(detail['start'],station.origin)
        self.assertEqual(detail['end'],station.origin+10800)
        self.assertEqual(detail['works'][0]['duration'],10800)


class BlockDeliveryTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        async def heartbeat():
            while True: await asyncio.sleep(.01)
        self.pulse=asyncio.create_task(heartbeat())
        self.station=load_schedule()
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.addCleanup(self.temp.cleanup)
        (self.root/'descriptions').mkdir()
        (self.root/'descriptions'/'notes.md').write_text('A **curator** note.\n\nA second paragraph.')
        self.data={'collections':{'family':{'title':'A family collection','description':'Three related transmissions.','blocks':['one','two','three']}},
                   'strands':{key:{'title':key,'premise':'A premise','notes_file':'descriptions/notes.md',
                                  'lineup':[{'title':'Opening','duration':120,'kind':'ident'},{'title':'A film','duration':10680,'kind':'programme','year':1999}]} for key in ('one','two','three')}}
        (self.root/'content.json').write_text(json.dumps(self.data))
        self.client=httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app(self.station,content_root=self.root)),base_url='https://station.test')

    async def asyncTearDown(self):
        await self.client.aclose();self.pulse.cancel()

    async def test_block_paging_detail_and_unplayable_editorial_collection(self):
        with patch('station.app.time.time',return_value=self.station.origin+65):
            query={'start':self.station.origin,'end':self.station.origin+360,'limit':1}
            first=(await self.client.get('/api/blocks',params=query)).json()
            second=(await self.client.get('/api/blocks',params={**query,'after':first['next_cursor']})).json()
            self.assertNotEqual(first['blocks'][0]['id'],second['blocks'][0]['id'])
            detail=await self.client.get('/api/blocks/'+first['blocks'][0]['id'])
            self.assertEqual(detail.status_code,200)
            self.assertTrue(detail.json()['block']['works'])
            collection=(await self.client.get('/api/collections/family')).json()['collection']
            self.assertEqual(len(collection['blocks']),3)
            self.assertTrue(all(b['airing'] is None and b['preview'] for b in collection['blocks']))
            plan=(await self.client.get('/api/block-plans/two')).json()['block']
            self.assertFalse(plan['scheduled'])
            self.assertNotIn('start',plan)
            self.assertEqual(plan['duration'],10800)
            self.assertEqual(plan['works'][1]['offset'],120)
            self.assertEqual(plan['collection']['part'],2)
            self.assertNotIn('notes',plan)
            self.assertNotIn('url',json.dumps(plan))
            self.assertNotIn('notes_file',json.dumps(plan))
            self.assertNotIn(str(self.root),json.dumps(plan))
            for url in ('/api/blocks/nan:inline','/api/blocks/0:missing','/api/block-plans/missing','/api/collections/missing'):
                self.assertEqual((await self.client.get(url)).status_code,404)
            self.assertEqual((await self.client.get('/api/blocks',params={'start':'nan'})).status_code,422)

    async def test_collection_and_markdown_revisions_reload_and_invalid_relationships_are_retained(self):
        first=(await self.client.get('/api/block-plans/one')).json()
        (self.root/'descriptions'/'notes.md').write_text('Updated curator note.')
        revised=(await self.client.get('/api/block-plans/one')).json()
        self.assertNotEqual(first['content_revision'],revised['content_revision'])
        self.assertNotIn('notes',revised['block'])
        self.data['collections']['bad']={'title':'Invalid duplicate','blocks':['one']}
        (self.root/'content.json').write_text(json.dumps(self.data))
        with self.assertLogs('station.content',level='WARNING'):
            retained=(await self.client.get('/api/block-plans/one')).json()
        self.assertEqual(retained['content_revision'],revised['content_revision'])
        with self.assertRaises(ValueError):ContentStore(self.root).snapshot(strict=True)
