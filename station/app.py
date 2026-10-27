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
from .runtime import RuntimeStore
from .blocks import register_block_routes

BASE = Path(__file__).resolve().parent.parent


def load_schedule():
    config = Path(os.getenv("STATION_CONFIG", BASE / "config"))
    root = Path(os.getenv("STATION_MEDIA", BASE / "media"))
    return Schedule(json.loads((config / "schedule.json").read_text()),
                    json.loads((config / "catalog.json").read_text()), root)


def create_app(schedule=None, content_root=None):
    config = Path(os.getenv("STATION_CONFIG", BASE / "config"))
    media_root = Path(os.getenv("STATION_MEDIA", BASE / "media"))
    runtime = RuntimeStore(config, media_root, schedule=schedule,
                           content_root=content_root if content_root is not None else (config if schedule is None else None))
    @asynccontextmanager
    async def lifespan(app):
        runtime.snapshot(strict=True)
        yield

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.runtime = runtime

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
        current = runtime.snapshot()
        return current.editorial.guide(current.schedule, time.time(), hours)

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
        current = runtime.snapshot()
        station, editorial = current.schedule, current.editorial
        events = station.timeline(start if after is None else after, end)
        query = q.strip().casefold()
        matches = []
        for event in events:
            if after is not None and event.start < after - .0001:
                continue
            asset = station.assets[event.asset]
            if programmes_only and asset.get("kind", "programme") != "programme":
                continue
            public = editorial.public(station, event)
            searchable = " ".join([public["title"], public["block"], public.get("description", ""),
                                   public.get("series", ""), *public["tags"], *public["genres"]])
            if query and query not in searchable.casefold():
                continue
            matches.append((event, public))
            if len(matches) > limit:
                break
        page = matches[:limit]
        return {"channel": station.channel, "timezone": str(station.zone), "server_time": now,
                "start": start, "end": end, "events": [entry for _, entry in page], "content_revision": editorial.revision,
                "next_cursor": page[-1][0].end if len(matches) > limit else None}

    @app.api_route("/media/{asset_id}.mp4", methods=["GET", "HEAD"])
    def media(asset_id: str):
        station = runtime.snapshot().schedule
        asset = runtime.media_assets.get(asset_id)
        if asset is None:
            raise HTTPException(404, "Unknown broadcast asset")
        path = (station.root / asset["file"]).resolve()
        # Recheck containment in case an operator replaced a path with a symlink.
        if not path.is_relative_to(station.root) or not path.is_file():
            raise HTTPException(404, "Broadcast asset unavailable")
        return FileResponse(path, media_type="video/mp4", headers={"Cache-Control": "public, max-age=3600"})

    @app.api_route("/captions/{asset_id}/{track_id}.vtt", methods=["GET", "HEAD"])
    def captions(asset_id: str, track_id: str):
        station = runtime.snapshot().schedule
        asset = runtime.media_assets.get(asset_id)
        if asset is None:
            raise HTTPException(404, "Unknown broadcast captions")
        track = next((t for t in asset.get("captions", []) if t["id"] == track_id), None)
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
        current = runtime.snapshot()
        station, editorial = current.schedule, current.editorial
        now = time.time()
        tv = Element("tv", {"generator-info-name": "Oddity Television"})
        c = SubElement(tv, "channel", {"id": "oddity-1"})
        SubElement(c, "display-name").text = station.channel
        for event in station.timeline(now, now + 86400):
            stamp = lambda t: datetime.fromtimestamp(t, timezone.utc).strftime("%Y%m%d%H%M%S +0000")
            p = SubElement(tv, "programme", {"channel": "oddity-1", "start": stamp(event.start), "stop": stamp(event.end)})
            entry = editorial.public(station, event)
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
        return Response(tostring(tv, encoding="utf-8", xml_declaration=True), media_type="application/xml", headers={"Cache-Control": "no-store"})

    register_block_routes(app, runtime, lambda: time.time())

    static_routes = [("/", "index.html", "text/html"), ("/player.js", "player.js", "text/javascript"), ("/epg.js", "epg.js", "text/javascript"), ("/tv-controls.js", "tv-controls.js", "text/javascript"), ("/channel-two-playback.js", "channel-two-playback.js", "text/javascript"), ("/style.css", "style.css", "text/css"), ("/fonts/vt323.ttf", "fonts/vt323.ttf", "font/ttf")]
    static_routes.append(("/art-direction.js", "art-direction.js", "text/javascript"))
    static_routes.append(("/block-guide.js", "block-guide.js", "text/javascript"))
    static_routes.append(("/identity-motion.js", "identity-motion.js", "text/javascript"))
    for name in ("moon-walking.jpg", "radio-hat.jpg"):
        static_routes.append((f"/artwork/{name}", f"artwork/{name}", "image/jpeg"))
    # Explicit public font allowlist, rather than an arbitrary file-path route.
    for name in ("instrument-serif/InstrumentSerif-Regular.woff2", "instrument-serif/InstrumentSerif-Italic.woff2",
                 "bricolage-grotesque/BricolageGrotesque.woff2", "ibm-plex-mono/IBMPlexMono-Regular.woff2"):
        static_routes.append((f"/fonts/{name}", f"fonts/{name}", "font/woff2"))
    for route, filename, content_type in static_routes:
        def make_static(name, mime):
            def static_file():
                headers = {"Cache-Control": "public, max-age=86400"} if mime.startswith(("font/", "image/")) else {}
                return FileResponse(BASE / "web" / name, media_type=mime, headers=headers)
            return static_file
        methods = ["GET", "HEAD"] if content_type.startswith(("font/", "image/")) else ["GET"]
        app.add_api_route(route, make_static(filename, content_type), methods=methods, include_in_schema=False)
    return app


app = create_app()
