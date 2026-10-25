"""Public, read-only delivery. Jellyfin is never contacted by this process."""
import json
import math
import os
from pathlib import Path
import time
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, Response
from .schedule import Schedule

BASE = Path(__file__).resolve().parent.parent


def load_schedule():
    config = Path(os.getenv("STATION_CONFIG", BASE / "config"))
    root = Path(os.getenv("STATION_MEDIA", BASE / "media"))
    return Schedule(json.loads((config / "schedule.json").read_text()),
                    json.loads((config / "catalog.json").read_text()), root)


def create_app(schedule=None):
    @asynccontextmanager
    async def lifespan(app):
        app.state.schedule = schedule or load_schedule()
        # Validate current transitions/weekly overlaps before accepting viewers.
        app.state.schedule.guide(time.time(), 24)
        yield

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    if schedule:
        app.state.schedule = schedule

    @app.middleware("http")
    async def privacy_headers(request, call_next):
        response = await call_next(request)
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self'; "
            "media-src 'self'; connect-src 'self'; img-src 'self'; "
            "frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/healthz")
    def health():
        return {"status": "ok"}

    @app.get("/api/channel")
    def channel(hours: float = Query(default=6, ge=0.01, le=24)):
        return app.state.schedule.guide(time.time(), hours)

    @app.get("/api/guide")
    def programme_guide(start: float | None = None, end: float | None = None,
                        after: float | None = None, limit: int = Query(default=60, ge=1, le=100),
                        q: str = Query(default="", max_length=100), programmes_only: bool = False):
        now = time.time()
        start = now if start is None else start
        end = start + 86400 if end is None else end
        if (not all(math.isfinite(t) for t in [start, end] + ([] if after is None else [after]))
                or start < now - 2 * 86400 or end > now + 3 * 86400
                or end <= start or end - start > 36 * 3600
                or (after is not None and not start <= after <= end)):
            raise HTTPException(422, "Choose a guide window of up to 36 hours near today")
        station = app.state.schedule
        events = station.timeline(start if after is None else after, end)
        query = q.strip().casefold()
        matches = []
        for event in events:
            if after is not None and event.start < after - .0001:
                continue
            asset = station.assets[event.asset]
            if programmes_only and asset.get("kind", "programme") != "programme":
                continue
            public = station.public(event)
            searchable = " ".join([public["title"], event.block, public.get("description", ""),
                                   public.get("series", ""), *public["tags"], *public["genres"]])
            if query and query not in searchable.casefold():
                continue
            matches.append(event)
            if len(matches) > limit:
                break
        page = matches[:limit]
        return {"channel": station.channel, "timezone": str(station.zone), "server_time": now,
                "start": start, "end": end, "events": [station.public(e) for e in page],
                "next_cursor": page[-1].end if len(matches) > limit else None}

    @app.api_route("/media/{asset_id}.mp4", methods=["GET", "HEAD"])
    def media(asset_id: str):
        station = app.state.schedule
        if asset_id not in station.allowed:
            raise HTTPException(404, "Unknown broadcast asset")
        path = (station.root / station.assets[asset_id]["file"]).resolve()
        # Recheck containment in case an operator replaced a path with a symlink.
        if not path.is_relative_to(station.root) or not path.is_file():
            raise HTTPException(404, "Broadcast asset unavailable")
        return FileResponse(path, media_type="video/mp4", headers={"Cache-Control": "public, max-age=3600"})

    @app.api_route("/captions/{asset_id}/{track_id}.vtt", methods=["GET", "HEAD"])
    def captions(asset_id: str, track_id: str):
        station = app.state.schedule
        if asset_id not in station.allowed:
            raise HTTPException(404, "Unknown broadcast captions")
        track = next((t for t in station.assets[asset_id].get("captions", []) if t["id"] == track_id), None)
        if not track:
            raise HTTPException(404, "Unknown broadcast captions")
        path = (station.root / track["file"]).resolve()
        if not path.is_relative_to(station.root) or path.suffix.lower() != ".vtt" or not path.is_file():
            raise HTTPException(404, "Captions unavailable")
        return FileResponse(path, media_type="text/vtt; charset=utf-8", headers={"Cache-Control": "public, max-age=3600"})

    @app.get("/guide.xml")
    def xmltv():
        from xml.etree.ElementTree import Element, SubElement, tostring
        from datetime import datetime, timezone
        station = app.state.schedule
        now = time.time()
        tv = Element("tv", {"generator-info-name": "Oddity Television"})
        c = SubElement(tv, "channel", {"id": "oddity-1"})
        SubElement(c, "display-name").text = station.channel
        for event in station.timeline(now, now + 86400):
            stamp = lambda t: datetime.fromtimestamp(t, timezone.utc).strftime("%Y%m%d%H%M%S +0000")
            p = SubElement(tv, "programme", {"channel": "oddity-1", "start": stamp(event.start), "stop": stamp(event.end)})
            entry = station.public(event)
            SubElement(p, "title", {"lang": "en"}).text = entry["title"]
            if entry.get("description"):
                SubElement(p, "desc", {"lang": "en"}).text = entry["description"]
            for category in dict.fromkeys([entry["kind"], *([entry["block"]] if entry["programming"] else []), *entry["tags"], *entry["genres"]]):
                SubElement(p, "category").text = category
            if entry.get("series"):
                SubElement(p, "sub-title", {"lang": "en"}).text = entry["series"]
            if entry.get("season") is not None and entry.get("episode") is not None:
                SubElement(p, "episode-num", {"system": "onscreen"}).text = f"S{entry['season']:02}E{entry['episode']:02}"
            if entry.get("year") is not None:
                SubElement(p, "date").text = str(entry["year"])
        return Response(tostring(tv, encoding="utf-8", xml_declaration=True), media_type="application/xml")

    for route, filename, content_type in [("/", "index.html", "text/html"), ("/player.js", "player.js", "text/javascript"), ("/epg.js", "epg.js", "text/javascript"), ("/tv-controls.js", "tv-controls.js", "text/javascript"), ("/channel-two-playback.js", "channel-two-playback.js", "text/javascript"), ("/style.css", "style.css", "text/css"), ("/fonts/vt323.ttf", "fonts/vt323.ttf", "font/ttf")]:
        def make_static(name, mime):
            def static_file():
                headers = {"Cache-Control": "public, max-age=86400"} if mime == "font/ttf" else {}
                return FileResponse(BASE / "web" / name, media_type=mime, headers=headers)
            return static_file
        methods = ["GET", "HEAD"] if content_type == "font/ttf" else ["GET"]
        app.add_api_route(route, make_static(filename, content_type), methods=methods, include_in_schema=False)
    return app


app = create_app()
