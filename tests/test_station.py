import asyncio
from copy import deepcopy
from datetime import datetime
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import httpx
from station.schedule import Schedule
from station.app import create_app, load_schedule
from station.jellyfin import Jellyfin
from station.jellyfintv import content_chunks, search_params


class ScheduleTests(unittest.TestCase):
    def setUp(self):
        self.station = load_schedule()
        self.origin = self.station.origin

    def test_late_join_break_and_resume_have_one_shared_timeline(self):
        # 19:00 ident, programme, commercials etc., repeated every 120s.
        first = self.station.guide(self.origin + 14)["now"]
        second = self.station.guide(self.origin + 19)["now"]
        self.assertEqual(first["id"], second["id"])
        self.assertEqual(self.origin + 19 - second["start"], 11)
        before = self.station.guide(self.origin + 77.9)["now"]
        advert = self.station.guide(self.origin + 78)["now"]
        resumed = self.station.guide(self.origin + 86)["now"]
        self.assertEqual(before["asset"], "feature")
        self.assertEqual(advert["asset"], "advert")
        self.assertEqual(resumed["asset"], "feature")
        self.assertEqual(resumed["source_in"], 20)

    def test_continuous_timeline_and_cycle_boundary(self):
        events = self.station.timeline(self.origin + 13, self.origin + 3600)
        self.assertTrue(events[0].start <= self.origin + 13 < events[0].end)
        for a, b in zip(events, events[1:]):
            self.assertAlmostEqual(a.end, b.start)
        self.assertEqual(self.station.guide(self.origin + 120)["now"]["asset"], "ident")

    def test_filler_phase_does_not_depend_on_request_time(self):
        a = self.station.guide(self.origin + 115)["now"]
        b = self.station.guide(self.origin + 118)["now"]
        self.assertEqual(a["id"], b["id"])
        self.assertEqual(a["asset"], "oddity")
        self.assertEqual(a["end"], self.origin + 120)

    def test_restart_does_not_reset_broadcast(self):
        self.assertEqual(self.station.guide(self.origin + 123), load_schedule().guide(self.origin + 123))

    def test_overlap_overrun_nan_and_path_escape_refused(self):
        for mutate in [
            lambda c: c["blocks"].append(deepcopy(c["blocks"][0])),
            lambda c: c.update(period_seconds=10),
            lambda c: c.update(period_seconds=float('nan')),
            lambda c: c["blocks"][0]["items"][0].update(duration=999),
        ]:
            config = deepcopy(self.station.config)
            mutate(config)
            with self.assertRaises(ValueError):
                Schedule(config, {"assets": self.station.assets}, self.station.root)
        catalog = {"assets": deepcopy(self.station.assets)}
        catalog["assets"]["ident"]["file"] = "../requirements.txt"
        with self.assertRaises(ValueError):
            Schedule(self.station.config, catalog, self.station.root)

    def test_weekly_slots_follow_british_time_across_dst(self):
        config = {"mode": "weekly", "timezone": "Europe/London", "filler": ["ident"],
                  "blocks": [{"days": list(range(7)), "at": "19:00:00", "items": [{"asset": "documentary"}]}]}
        station = Schedule(config, {"assets": self.station.assets}, self.station.root)
        summer = datetime.fromisoformat("2026-10-24T18:00:00+00:00").timestamp()
        winter = datetime.fromisoformat("2026-10-25T19:00:00+00:00").timestamp()
        self.assertEqual(station.guide(summer)["now"]["asset"], "documentary")
        self.assertEqual(station.guide(winter)["now"]["asset"], "documentary")


class DeliveryTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        # This workspace blocks cross-thread socket wakeups. A short heartbeat
        # lets Starlette's real file I/O threads complete without changing them.
        async def heartbeat():
            while True:
                await asyncio.sleep(.01)
        self.heartbeat = asyncio.create_task(heartbeat())
        self.station = load_schedule()
        self.app = create_app(self.station)
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="https://station.test")

    async def asyncTearDown(self):
        await self.client.aclose()
        self.heartbeat.cancel()

    async def test_two_independent_viewers_and_byte_range_seek(self):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="https://station.test") as second:
            with patch("station.app.time.time", return_value=self.station.origin + 65):
                a, b = await asyncio.gather(self.client.get("/api/channel"), second.get("/api/channel"))
            self.assertEqual(a.json(), b.json())
            self.assertEqual(a.json()["now"]["asset"], "feature")
            self.assertEqual(a.headers["cache-control"], "no-store")
            url = a.json()["now"]["url"]
            part = await second.get(url, headers={"Range": "bytes=100-199"})
            self.assertEqual(part.status_code, 206)
            self.assertEqual(len(part.content), 100)
            self.assertTrue(part.headers["content-range"].startswith("bytes 100-199/"))
            expected = (self.station.root / "feature.mp4").read_bytes()[100:200]
            self.assertEqual(part.content, expected)

    async def test_public_surface_has_no_secrets_and_no_path_or_proxy_access(self):
        with patch.dict("os.environ", {"JELLYFIN_API_KEY": "PRIVATE_TEST_TOKEN", "JELLYFIN_URL": "http://private-jellyfin:8096"}):
            for url in ["/", "/player.js", "/epg.js", "/tv-controls.js", "/channel-two-playback.js", "/style.css", "/api/channel", "/api/guide", "/guide.xml"]:
                response = await self.client.get(url)
                self.assertEqual(response.status_code, 200)
                for private in ["PRIVATE_TEST_TOKEN", "private-jellyfin", str(self.station.root), "provenance", "X-Emby-Token"]:
                    self.assertNotIn(private, response.text)
                self.assertIn("frame-ancestors 'none'", response.headers["content-security-policy"])
        for url in ["/.env", "/config/catalog.json", "/docs", "/openapi.json", "/media/unknown.mp4", "/api/proxy?url=http://private-jellyfin", "/media/%2e%2e%2frequirements.txt.mp4"]:
            self.assertEqual((await self.client.get(url)).status_code, 404, url)
        response = await self.client.get("/?filename=../.env&content_type=text/plain")
        self.assertIn("<!doctype html>", response.text)

    async def test_http_head_invalid_range_and_guide_xml(self):
        result = await self.client.head("/media/ident.mp4")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.content, b"")
        result = await self.client.get("/media/ident.mp4", headers={"Range": "bytes=999999999999-"})
        self.assertEqual(result.status_code, 416)
        from xml.etree.ElementTree import fromstring
        xml = fromstring((await self.client.get("/guide.xml")).text)
        self.assertEqual(xml.tag, "tv")
        self.assertTrue(xml.findall("programme"))
        self.assertEqual((await self.client.get("/api/channel?hours=999")).status_code, 422)

    async def test_epg_pagination_has_no_missing_or_repeated_transmissions(self):
        now = self.station.origin + 65
        params = {"start": now, "end": now+120, "limit": 3}
        found = []
        with patch("station.app.time.time", return_value=now):
            while True:
                response = await self.client.get('/api/guide', params=params)
                self.assertEqual(response.status_code, 200)
                data = response.json()
                self.assertLessEqual(len(data['events']), 3)
                self.assertEqual(response.headers['cache-control'],'no-store')
                found.extend(data['events'])
                if data['next_cursor'] is None:
                    break
                params['after'] = data['next_cursor']
        expected = [self.station.public(e) for e in self.station.timeline(now,now+120)]
        self.assertEqual(found, expected)
        self.assertEqual(len({e['id'] for e in found}),len(found))

    async def test_epg_search_and_programme_filter_apply_before_pagination(self):
        now = self.station.origin + 65
        with patch('station.app.time.time',return_value=now):
            result = await self.client.get('/api/guide', params={'q':'night shift','programmes_only':True,'limit':5})
            data = result.json()
            self.assertEqual(len(data['events']),5)
            self.assertTrue(all('night shift' in e['title'].lower() and e['kind']=='programme' for e in data['events']))
            self.assertIsNotNone(data['next_cursor'])
            empty = (await self.client.get('/api/guide',params={'q':'no such programme'})).json()
            self.assertEqual(empty['events'],[])
            self.assertIsNone(empty['next_cursor'])

    async def test_epg_bounds_payload_and_invalid_windows(self):
        now = self.station.origin + 65
        with patch('station.app.time.time',return_value=now):
            result = await self.client.get('/api/guide')
            self.assertEqual(len(result.json()['events']),60)
            self.assertLess(len(result.content),35000)
            for params in [{'limit':101},{'start':'nan'},{'start':now,'end':now-1},
                           {'start':now,'end':now+37*3600},{'start':now,'after':now-1},
                           {'q':'x'*101}]:
                self.assertEqual((await self.client.get('/api/guide',params=params)).status_code,422,params)
            # A DST autumn day is valid even though it lasts 25 hours.
            self.assertEqual((await self.client.get('/api/guide',params={'start':now,'end':now+25*3600})).status_code,200)


class JellyfinTests(unittest.TestCase):
    def test_reused_query_builder_supports_multiple_metadata_values(self):
        params = search_params({"genres": ["Drama", "Documentary"], "years": [1960, 1970],
                                "tags": ["british", "archive"], "studios": ["BFI"], "ratings": ["U", "PG"]})
        self.assertEqual(params["Genres"], "Drama|Documentary")
        self.assertEqual(params["Years"], "1960,1970")
        self.assertEqual(params["Tags"], "british|archive")
        self.assertEqual(params["Studios"], "BFI")
        self.assertEqual(params["OfficialRatings"], "U|PG")

    def test_reused_midroll_loop_resumes_source_and_measures_adverts(self):
        station = load_schedule()
        item = {"asset": "feature", "in": 5, "duration": 31, "break_every": 12, "ads": ["advert", "pif"]}
        chunks = list(content_chunks(item, station.assets))
        programmes = [c for c in chunks if c["asset"] == "feature"]
        self.assertEqual([c["in"] for c in programmes], [5, 17, 29])
        self.assertEqual([c["duration"] for c in programmes], [12, 12, 7])
        config = deepcopy(station.config)
        config["blocks"] = [{"offset": 0, "items": [item]}]
        planned = Schedule(config, {"assets": station.assets}, station.root)
        events = planned.expand(config["blocks"][0], 0)
        self.assertEqual(events[-1].end, 31 + 2 * (8 + 10))
        self.assertIn("pif", planned.allowed)
        for bad in [0, -10, float('nan')]:
            with self.assertRaises(ValueError):
                list(content_chunks({**item, "break_every": bad}, station.assets))

    def test_discovery_pagination_filters_and_private_prefetch(self):
        calls = []
        def upstream(request):
            calls.append(request)
            self.assertEqual(request.headers["X-Emby-Token"], "secret-key")
            self.assertNotIn("secret-key", str(request.url))
            if request.url.path.endswith("/Items"):
                self.assertEqual(request.url.params["ParentId"], "collection-1")
                self.assertEqual(request.url.params["Genres"], "Documentary")
                self.assertEqual(request.url.params["Tags"], "british")
                offset = int(request.url.params["StartIndex"])
                return httpx.Response(200, json={"Items": [{"Id": f"item-{offset}", "Name": "Archive", "RunTimeTicks": 20_000_000,
                                                            "Path": "/private/home/film.mkv"}], "TotalRecordCount": 2})
            self.assertEqual(request.url.params["Static"], "true")
            return httpx.Response(200, content=b"prepared-media-source")
        client = Jellyfin("http://jellyfin:8096/base", "secret-key", httpx.MockTransport(upstream))
        try:
            items = list(client.items("collection-1", "Documentary", "british"))
            self.assertEqual(len(items), 2)
            self.assertNotIn("private", json.dumps(items))
            with tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / "film"
                client.download("item-0", path)
                self.assertEqual(path.read_bytes(), b"prepared-media-source")
        finally:
            client.close()
        self.assertEqual(len(calls), 3)

    def test_redirect_is_refused_without_leaking_token(self):
        calls = []
        def upstream(request):
            calls.append(request)
            return httpx.Response(302, headers={"Location": "https://other-host.test/stolen"})
        client = Jellyfin("http://jellyfin:8096", "secret-key", httpx.MockTransport(upstream))
        try:
            with tempfile.TemporaryDirectory() as tmp:
                with self.assertRaises(httpx.HTTPStatusError):
                    client.download("film", Path(tmp) / "film")
        finally:
            client.close()
        self.assertEqual(len(calls), 1)


if __name__ == "__main__":
    unittest.main()
