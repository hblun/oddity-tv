from copy import deepcopy
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import asyncio
import httpx
from station.app import create_app, load_schedule
from station.captions import caption_record, extract_embedded
from station.schedule import Schedule
from station.jellyfin import Jellyfin


class CaptionPreparationTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'),'FFmpeg required')
    def test_failed_caption_import_is_retryable_and_preserves_the_original(self):
        from types import SimpleNamespace
        from station.cli import register
        import hashlib
        source=load_schedule().root/'feature.mp4'
        original=hashlib.sha256(source.read_bytes()).hexdigest()
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp); args=SimpleNamespace(config=root/'config',media=root/'media')
            with patch('station.captions.caption_record',side_effect=ValueError('Invalid subtitle')):
                with self.assertRaises(ValueError):
                    register(args,'film','Film',source,'programme',True,subtitles=[{'source':root/'bad.srt'}])
            self.assertFalse((args.media/'film.mp4').exists())
            self.assertFalse((args.config/'catalog.json').exists())
            register(args,'film','Film',source,'programme',True)
            self.assertTrue((args.media/'film.mp4').exists())
            self.assertEqual(json.loads((args.config/'catalog.json').read_text())['assets']['film']['captions'],[])
        self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(),original)

    @unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'),'FFmpeg required')
    def test_real_ffmpeg_extracts_text_and_preserves_cues_after_midroll_offset(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            srt=root/'english.srt'
            srt.write_text('1\n00:00:01,000 --> 00:00:03,000\nBefore the break.\n\n2\n00:00:22,000 --> 00:00:24,000\nAfter the break.\n')
            source=root/'embedded.mkv'
            subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(load_schedule().root/'feature.mp4'),
                            '-i',str(srt),'-map','0:v:0','-map','0:a:0','-map','1:s:0','-c','copy',
                            '-metadata:s:s:0','language=eng','-metadata:s:s:0','title=English SDH',str(source)],check=True)
            tracks=extract_embedded(source,'film',root)
            self.assertEqual(len(tracks),1)
            self.assertEqual(tracks[0]['language'],'en')
            self.assertEqual(tracks[0]['label'],'English SDH')
            vtt=(root/tracks[0]['file']).read_text()
            self.assertTrue(vtt.startswith('WEBVTT'))
            # Matroska may offset all streams by AAC's ~21ms priming delay.
            # A cue must stay near its source time, not reset to the second part.
            import re
            cue=float(re.search(r'00:(22\.\d{3})',vtt).group(1))
            self.assertAlmostEqual(cue,22,delta=.05)
            self.assertIn('After the break.',vtt)
            sidecar=caption_record('film',root,srt,'en-GB','British English')
            self.assertEqual(sidecar['language'],'en-GB')
            self.assertIn('Before the break.',(root/sidecar['file']).read_text())


class CaptionDeliveryTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        async def heartbeat():
            while True: await asyncio.sleep(.01)
        self.heartbeat=asyncio.create_task(heartbeat())
        self.temp=tempfile.TemporaryDirectory()
        self.root=Path(self.temp.name)
        (self.root/'film.mp4').write_bytes(b'prepared broadcast video')
        (self.root/'english.vtt').write_text('WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nA programme caption.\n')
        self.catalog={'assets':{'film':{'title':'Film','file':'film.mp4','duration':40,'kind':'programme',
            'captions':[{'id':'en-cc','file':'english.vtt','language':'en','label':'English'}]}}}
        self.config={'mode':'cycle','origin':'2026-01-01T00:00:00Z','period_seconds':60,'filler':['film'],
                     'blocks':[{'offset':0,'items':[{'asset':'film'}]}]}
        self.station=Schedule(self.config,self.catalog,self.root)
        self.client=httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app(self.station)),base_url='http://station.test')

    async def asyncTearDown(self):
        await self.client.aclose(); self.heartbeat.cancel(); self.temp.cleanup()

    async def test_public_tracks_are_same_origin_and_hide_private_paths(self):
        response=await self.client.get('/api/channel?hours=0.01')
        track=response.json()['now']['captions'][0]
        self.assertEqual(track['url'],'/captions/film/en-cc.vtt')
        self.assertNotIn('file',track)
        self.assertNotIn(str(self.root),response.text)
        vtt=await self.client.get(track['url'])
        self.assertEqual(vtt.status_code,200)
        self.assertTrue(vtt.headers['content-type'].startswith('text/vtt'))
        self.assertIn('A programme caption.',vtt.text)
        self.assertEqual((await self.client.head(track['url'])).content,b'')
        for url in ['/captions/film/unknown.vtt','/captions/unknown/en-cc.vtt','/captions/film/%2e%2e%2fsecret.vtt']:
            self.assertEqual((await self.client.get(url)).status_code,404)

    async def test_caption_path_escape_and_symlink_replacement_are_refused(self):
        catalog=deepcopy(self.catalog); catalog['assets']['film']['captions'][0]['file']='../outside.vtt'
        with self.assertRaises(ValueError): Schedule(self.config,catalog,self.root)
        (self.root/'english.vtt').unlink()
        (self.root/'english.vtt').symlink_to('/etc/hosts')
        self.assertEqual((await self.client.get('/captions/film/en-cc.vtt')).status_code,404)


class JellyfinCaptionTests(unittest.TestCase):
    def test_external_subtitles_use_private_headers_and_the_selected_media_source(self):
        calls=[]
        def upstream(request):
            calls.append(request)
            self.assertEqual(request.headers['X-Emby-Token'],'private-caption-key')
            self.assertNotIn('private-caption-key',str(request.url))
            if request.url.path.endswith('/Items/film'):
                return httpx.Response(200,json={'MediaSources':[{'Id':'source-1','MediaStreams':[
                    {'Index':2,'Type':'Subtitle','IsExternal':True,'Codec':'srt','Language':'eng','DisplayTitle':'English',
                     'DeliveryUrl':'https://untrusted.test/do-not-use'}]}]})
            self.assertTrue(request.url.path.endswith('/Videos/film/source-1/Subtitles/2/0/Stream.vtt'))
            return httpx.Response(200,text='WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello\n')
        client=Jellyfin('https://jellyfin.private','private-caption-key',httpx.MockTransport(upstream))
        try:
            source=client.media_source('film')
            with tempfile.TemporaryDirectory() as temp:
                tracks=client.download_external_captions('film',source,temp)
                self.assertEqual(len(tracks),1)
                self.assertTrue(tracks[0]['source'].read_text().startswith('WEBVTT'))
        finally: client.close()
        self.assertEqual(len(calls),2)
        self.assertTrue(all(r.url.host=='jellyfin.private' for r in calls))


if __name__=='__main__': unittest.main()
