import asyncio
from copy import deepcopy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import httpx
from station.app import load_schedule, create_app
from station.schedule import Schedule
from station.metadata import public_metadata, jellyfin_metadata
from station.jellyfin import Jellyfin
from station.cli import main


class MetadataTests(unittest.TestCase):
    def setUp(self):
        self.base = load_schedule()
        self.config = deepcopy(self.base.config)
        self.catalog = {'assets': deepcopy(self.base.assets)}
        self.config['programming_blocks'] = {'oddities': {
            'title': 'Past Watershed Strangeness', 'description': 'Things get unusual.', 'tags': ['Late night', 'Archive']}}
        self.config['blocks'][0]['profile'] = 'oddities'
        self.config['blocks'][0].pop('title', None)
        self.catalog['assets']['feature'].update(source_metadata={
            'description': 'Source synopsis', 'series': 'Night films', 'season': 1, 'episode': 2,
            'year': 1982, 'tags': ['Archive', 'British'], 'genres': ['Drama'], 'Path': '/private/home'},
            description='<p>An admin introduction.</p><script>secret()</script>', jellyfin_id='private-item-id')
        # The current demo supplies editorial tags. This fixture exercises the
        # source-tag fallback, so it must explicitly remove that override.
        self.catalog['assets']['feature'].pop('tags', None)

    def test_block_context_survives_adverts_and_resume_with_stable_boundaries(self):
        station = Schedule(self.config, self.catalog, self.base.root)
        film, advert, resumed = [station.guide(station.origin+t)['now'] for t in (65, 79, 87)]
        self.assertEqual(film['programming'], advert['programming'])
        self.assertEqual(film['programming'], resumed['programming'])
        self.assertEqual(film['programming']['start'], station.origin)
        self.assertEqual(film['programming']['end'], station.origin+114)
        self.assertEqual(film['programming']['title'], 'Past Watershed Strangeness')
        self.assertEqual(film['tags'], ['Archive', 'British', 'Late night'])
        self.assertEqual(film['description'], 'An admin introduction.')
        self.assertEqual(film['episode'], 2)
        self.assertEqual(resumed['source_in'], 20)
        self.assertIsNone(station.guide(station.origin+115)['now']['programming'])
        for private in ('private-item-id', '/private/home', 'source_metadata', 'secret()'):
            self.assertNotIn(private, json.dumps(film))

    def test_source_fallback_explicit_empty_overrides_and_normalisation(self):
        source={'description':'<p>A film &amp; its story.</p>', 'tags':['British', 'british', '<b>Archive</b>'],
                'genres':['Drama'], 'season':True, 'episode':2}
        self.assertEqual(public_metadata({'source_metadata':source})['description'], 'A film & its story.')
        self.assertEqual(public_metadata({'source_metadata':source})['tags'], ['British','Archive'])
        self.assertIsNone(public_metadata(source)['season'])
        value=public_metadata({'source_metadata':source,'description':'','tags':[]})
        self.assertEqual(value['description'],'')
        self.assertEqual(value['tags'],[])
        self.assertLessEqual(len(public_metadata({'description':'x'*5000})['description']),4000)

    def test_unknown_profile_refused_and_inline_legacy_blocks_still_work(self):
        self.config['blocks'][0]['profile']='missing'
        with self.assertRaises(ValueError): Schedule(self.config,self.catalog,self.base.root)
        self.assertTrue(self.base.guide(self.base.origin)['now']['block'])

    def test_private_jellyfin_metadata_fetch_only_keeps_allowed_public_fields(self):
        def upstream(request):
            self.assertEqual(request.headers['X-Emby-Token'],'secret')
            self.assertIn('Overview',request.url.params['Fields'])
            return httpx.Response(200,json={'Overview':'<b>Episode story.</b>', 'SeriesName':'Test series',
                'ParentIndexNumber':3,'IndexNumber':4,'ProductionYear':1978,'Genres':['Comedy'],
                'Tags':['British'],'Path':'/private/home','RemoteTrailers':[{'Url':'https://private.test'}]})
        client=Jellyfin('https://private.test','secret',httpx.MockTransport(upstream))
        try: metadata=client.metadata('opaque-item')
        finally: client.close()
        self.assertEqual(metadata['description'],'Episode story.')
        self.assertEqual(metadata['season'],3)
        self.assertNotIn('private',json.dumps(metadata))

    def test_cli_edits_and_sync_keeps_admin_overrides_without_encoding(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'catalog.json';path.write_text(json.dumps(self.catalog))
            def run(*args):
                with patch('sys.argv',['station.cli','--config',tmp,*args]): main()
            run('metadata','--id','feature','--description','My introduction','--tag','Cult')
            with patch('station.jellyfin.Jellyfin') as client:
                client.return_value.metadata.return_value={'description':'Updated source','tags':['New source']}
                run('sync-metadata','--id','feature')
            asset=json.loads(path.read_text())['assets']['feature']
            self.assertEqual(public_metadata(asset)['description'],'My introduction')
            self.assertEqual(public_metadata(asset)['tags'],['Cult'])
            run('metadata','--id','feature','--use-source-description','--use-source-tags')
            self.assertEqual(public_metadata(json.loads(path.read_text())['assets']['feature'])['description'],'Updated source')


class MetadataDeliveryTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        async def heartbeat():
            while True: await asyncio.sleep(.01)
        self.heartbeat=asyncio.create_task(heartbeat())

    async def asyncTearDown(self):
        self.heartbeat.cancel()

    async def test_guide_search_and_xmltv_share_metadata(self):
        from xml.etree.ElementTree import fromstring
        fixture=MetadataTests();fixture.setUp()
        station=Schedule(fixture.config,fixture.catalog,fixture.base.root)
        app=create_app(station)
        with patch('station.app.time.time',return_value=station.origin+65):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='https://station.test') as client:
                response=await client.get('/api/guide',params={'q':'British','limit':3})
                self.assertEqual(response.status_code,200)
                self.assertTrue(response.json()['events'])
                self.assertTrue(all('British' in e['tags'] for e in response.json()['events']))
                # Import-time summaries and admin overrides flow into IPTV guide exports too.
                xml=fromstring((await client.get('/guide.xml')).content)
        film=next(p for p in xml.findall('programme') if p.findtext('desc')=='An admin introduction.')
        self.assertEqual(film.findtext('episode-num'),'S01E02')
        self.assertEqual(film.findtext('date'),'1982')
        self.assertIn('Late night',[c.text for c in film.findall('category')])
