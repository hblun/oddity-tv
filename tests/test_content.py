"""Live editorial publishing, invalid-save recovery and private-file boundaries."""
import asyncio
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import httpx
from station.app import create_app, load_schedule
from station.content import ContentStore, markdown_text


class ContentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'descriptions').mkdir()
        self.path = self.root / 'content.json'
        self.prose = self.root / 'descriptions' / 'feature.md'
        self.prose.write_text('A **strange** film.\n\nA [railway](https://example.test) story.\n')
        self.data = {'programmes': {'feature': {'title': 'The Night Shift', 'description_file': 'descriptions/feature.md',
                     'tags': ['Cult'], 'theme': 'coral', 'artwork': 'radio-hat'}},
                     'strands': {'after-hours': {'title': 'Past Watershed Strangeness', 'tags': ['Late night']}}}
        self.save()
        self.store = ContentStore(self.root)
        self.station = load_schedule()

    def save(self):
        self.path.write_text(json.dumps(self.data))

    def test_json_and_markdown_edits_publish_without_changing_timing_media_or_source_metadata(self):
        first = self.store.snapshot(strict=True)
        event = self.station.timeline(self.station.origin + 65, self.station.origin + 66)[0]
        entry = first.public(self.station, event)
        base = self.station.public(event)
        self.assertEqual(entry['description'], 'A strange film. A railway story.')
        self.assertEqual(entry['tags'], ['Cult', 'Late night'])
        self.assertEqual(entry['presentation'], {'theme': 'coral', 'artwork': 'radio-hat'})
        for key in ('id', 'start', 'end', 'source_in', 'source_duration', 'url', 'captions'):
            self.assertEqual(entry[key], base[key])
        self.prose.write_text('Revised description, saved while watching.\n')
        revised = self.store.snapshot()
        self.assertNotEqual(first.revision, revised.revision)
        self.assertEqual(revised.public(self.station,event)['description'], 'Revised description, saved while watching.')
        self.assertEqual(self.station.public(event),base)
        self.data['programmes']['feature']['title'] = 'An editorial title'
        self.save()
        self.assertEqual(self.store.snapshot().public(self.station,event)['title'], 'An editorial title')

    def test_invalid_partial_save_keeps_the_last_valid_snapshot_then_recovers(self):
        first = self.store.snapshot(strict=True)
        self.path.write_text('{"programmes":')
        with self.assertLogs('station.content',level='WARNING'):
            self.assertIs(self.store.snapshot(),first)
        with self.assertRaises(ValueError): self.store.snapshot(strict=True)
        self.save()
        self.assertEqual(self.store.snapshot().revision,first.revision)
        # A newly referenced file may be saved after its JSON reference.
        self.data['programmes']['feature']['description_file']='descriptions/new.md';self.save()
        with self.assertLogs('station.content',level='WARNING'):
            self.assertEqual(self.store.snapshot().revision,first.revision)
        (self.root / 'descriptions' / 'new.md').write_text('Now ready.')
        self.assertNotEqual(self.store.snapshot().revision,first.revision)

    def test_content_cannot_change_transport_or_read_outside_the_markdown_directory(self):
        for field,value in [('file','private.mp4'),('duration',999),('url','https://example.test'),('theme',{}),('artwork','unknown')]:
            with self.subTest(field=field):
                self.data['programmes']['feature']={field:value};self.save()
                with self.assertRaises(ValueError): self.store.snapshot(strict=True)
        outside=self.root/'private.md';outside.write_text('private secret')
        (self.root/'descriptions'/'linked.md').symlink_to(outside)
        for value in ('../private.md','private.md',str(outside),'descriptions/linked.md'):
            self.data['programmes']['feature']={'description_file':value};self.save()
            with self.assertRaises(ValueError): self.store.snapshot(strict=True)

    def test_unreadable_file_status_retains_the_previous_version(self):
        first=self.store.snapshot(strict=True)
        with patch('station.content.stamp',side_effect=PermissionError('unreadable')):
            with self.assertLogs('station.content',level='WARNING'):
                self.assertIs(self.store.snapshot(),first)
            with self.assertRaises(PermissionError): self.store.snapshot(strict=True)
        self.assertEqual(self.store.snapshot().revision,first.revision)

    def test_safe_prose_and_appearance_precedence(self):
        self.assertEqual(markdown_text('# A heading\n\nA **film** with <script>secret()</script> words.'),'A heading A film with words.')
        self.data['defaults']={'advert':{'theme':'coral'}}
        self.data['strands']['after-hours']['theme']='citrus'
        self.save();snapshot=self.store.snapshot(strict=True)
        film=snapshot.guide(self.station,self.station.origin+65)['now']
        advert=snapshot.guide(self.station,self.station.origin+79)['now']
        self.assertEqual(film['presentation']['theme'],'coral') # programme override
        self.assertEqual(advert['presentation']['theme'],'citrus') # strand override
        self.data['strands']['after-hours'].pop('theme');self.save()
        self.assertEqual(self.store.snapshot().guide(self.station,self.station.origin+79)['now']['presentation']['theme'],'coral')
        self.path.unlink()
        self.assertEqual(self.store.snapshot().revision,'catalogue')


class ContentDeliveryTests(unittest.IsolatedAsyncioTestCase):
    async def test_live_api_search_xmltv_and_revisions_share_one_editorial_source(self):
        fixture=ContentTests();fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        async def heartbeat():
            while True: await asyncio.sleep(.01)
        pulse=asyncio.create_task(heartbeat())
        app=create_app(fixture.station, content_root=fixture.root)
        try:
            with patch('station.app.time.time',return_value=fixture.station.origin+65):
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='https://station.test') as client:
                    first=(await client.get('/api/channel',params={'hours':.01})).json()
                    fixture.prose.write_text('An unusual description saved live.')
                    second=(await client.get('/api/channel',params={'hours':.01})).json()
                    self.assertNotEqual(first['content_revision'],second['content_revision'])
                    self.assertEqual(first['now']['id'],second['now']['id'])
                    self.assertEqual(second['now']['description'],'An unusual description saved live.')
                    guide=await client.get('/api/guide',params={'q':'saved live','limit':3})
                    self.assertTrue(guide.json()['events'])
                    self.assertTrue(all(e['description']==second['now']['description'] for e in guide.json()['events']))
                    self.assertEqual(guide.json()['content_revision'],second['content_revision'])
                    xml=await client.get('/guide.xml')
                    self.assertIn('An unusual description saved live.',xml.text)
                    self.assertEqual(xml.headers['cache-control'],'no-store')
                    for private in ('description_file','source_metadata',str(fixture.root)):
                        self.assertNotIn(private,json.dumps(second))
                    self.assertEqual((await client.get('/config/content.json')).status_code,404)
                    self.assertEqual((await client.get('/descriptions/feature.md')).status_code,404)
        finally:
            pulse.cancel()
