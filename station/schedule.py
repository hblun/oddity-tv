"""Compile operator-authored blocks into an immutable broadcast timeline.

All durations and offsets are seconds; all public timestamps are Unix seconds.
No per-viewer state, random choices or background playback process is involved.
"""
from dataclasses import dataclass, replace
from datetime import datetime, timedelta, timezone
import math
from pathlib import Path
import re
from zoneinfo import ZoneInfo
from .jellyfintv import content_chunks
from .metadata import public_metadata, text, tags


def positive(value, name):
    value = float(value)
    if not math.isfinite(value) or value <= 0:
        raise ValueError(f"{name} must be finite and positive")
    return value


@dataclass(frozen=True)
class Event:
    asset: str
    start: float
    end: float
    source_in: float = 0
    block: str = "Continuity"
    block_id: str | None = None
    block_description: str = ""
    block_tags: tuple = ()
    block_start: float | None = None
    block_end: float | None = None


class Schedule:
    def __init__(self, config, catalog, media_root):
        self.config = config
        self.channel = str(config.get("channel", "Oddity Television"))
        self.zone = ZoneInfo(config.get("timezone", "Europe/London"))
        self.root = Path(media_root).resolve()
        self.assets = catalog["assets"]
        if not self.assets:
            raise ValueError("Empty media catalogue")
        for key, asset in self.assets.items():
            if not re.fullmatch(r"[a-zA-Z0-9_-]{1,100}", key):
                raise ValueError("Asset IDs must be opaque slugs")
            positive(asset["duration"], "asset duration")
            path = (self.root / asset["file"]).resolve()
            if not path.is_relative_to(self.root) or not path.is_file():
                raise ValueError(f"Missing or unsafe media for asset {key}")
            if path.suffix.lower() != ".mp4":
                raise ValueError("Prepare assets as browser-compatible MP4 first")
            seen_tracks = set()
            for track in asset.get("captions", []):
                if not re.fullmatch(r"[a-zA-Z0-9_-]{1,100}", track["id"]) or track["id"] in seen_tracks:
                    raise ValueError("Caption track IDs must be unique slugs")
                seen_tracks.add(track["id"])
                caption = (self.root / track["file"]).resolve()
                if not caption.is_relative_to(self.root) or caption.suffix.lower() != ".vtt" or not caption.is_file():
                    raise ValueError(f"Missing or unsafe captions for asset {key}")
                with caption.open(encoding="utf-8-sig") as handle:
                    if handle.read(6) != "WEBVTT":
                        raise ValueError(f"Captions for asset {key} must be WebVTT")
                if not re.fullmatch(r"[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*", track.get("language", "und")):
                    raise ValueError("Caption language must be a language tag such as en or en-GB")
        self.block_definitions = config.get("programming_blocks", {})
        if not isinstance(self.block_definitions, dict):
            raise ValueError("programming_blocks must be an object of named definitions")
        for key, definition in self.block_definitions.items():
            if not re.fullmatch(r"[a-zA-Z0-9_-]{1,100}", key) or not isinstance(definition, dict):
                raise ValueError("Programming block definitions need slug IDs and objects")
            if not text(definition.get("title"), 200):
                raise ValueError("Programming blocks need a title")
        self.blocks = config["blocks"]
        self.filler = config.get("filler", [])
        if not self.blocks or not self.filler:
            raise ValueError("At least one block and one filler asset are required")
        for key in self.filler:
            self.assets[key]
        self.mode = config.get("mode", "cycle")
        if self.mode == "cycle":
            self.period = positive(config["period_seconds"], "cycle period")
            self.origin = datetime.fromisoformat(config["origin"].replace("Z", "+00:00"))
            if self.origin.tzinfo is None:
                raise ValueError("Cycle origin must include a timezone")
            self.origin = self.origin.timestamp()
            events = []
            for block in self.blocks:
                offset = float(block["offset"])
                if not math.isfinite(offset) or offset < 0:
                    raise ValueError("Block offset must be finite and non-negative")
                events.extend(self.expand(block, offset))
            self.check_overlaps(events)
            if max(e.end for e in events) > self.period:
                raise ValueError("Programming overruns the cycle")
        elif self.mode == "weekly":
            for block in self.blocks:
                if not block["days"] or any(type(d) is not int or d not in range(7) for d in block["days"]):
                    raise ValueError("days uses Monday=0 through Sunday=6")
                datetime.strptime(block["at"], "%H:%M:%S")
                if sum(e.end - e.start for e in self.expand(block, 0)) > 86400:
                    raise ValueError("A block must fit within 24 hours")
        else:
            raise ValueError("Unknown schedule mode")
        self.allowed = set(self.filler)
        for block in self.blocks:
            self.allowed.update(item["asset"] for item in block["items"])
            for item in block["items"]:
                self.allowed.update(item.get("ads", []))

    def expand(self, block, start):
        events = []
        block_start = start
        profile = block.get("profile")
        if profile is not None and profile not in self.block_definitions:
            raise ValueError("Unknown programming block profile")
        definition = {**self.block_definitions.get(profile, {}), **block}
        title = text(definition.get("title", "Programme"), 200)
        if not block["items"]:
            raise ValueError("Empty programming block")
        for item in (chunk for authored in block["items"] for chunk in content_chunks(authored, self.assets)):
            key = item["asset"]
            total = float(self.assets[key]["duration"])
            source = float(item.get("in", 0))
            duration = positive(item.get("duration", total - source), "item duration")
            if not math.isfinite(source) or source < 0 or source + duration > total + .001:
                raise ValueError(f"Scheduled excerpt exceeds asset {key}")
            events.append(Event(key, start, start + duration, source, title))
            start += duration
        return [replace(event, block_id=profile, block_description=text(definition.get("description")),
                        block_tags=tuple(tags(definition.get("tags", []))),
                        block_start=block_start, block_end=start) for event in events]

    @staticmethod
    def check_overlaps(events):
        ordered = sorted(events, key=lambda e: e.start)
        if any(a.end > b.start + .001 for a, b in zip(ordered, ordered[1:])):
            raise ValueError("Scheduled blocks overlap; shorten a block or move its fixed start")
        return ordered

    def fixed_events(self, start, end):
        events = []
        if self.mode == "cycle":
            first = math.floor((start - self.origin) / self.period)
            last = math.floor((end - self.origin) / self.period) + 1
            for index in range(first, last + 1):
                base = self.origin + index * self.period
                for block in self.blocks:
                    events.extend(self.expand(block, base + float(block["offset"])))
        else:
            first = datetime.fromtimestamp(start, self.zone).date() - timedelta(days=8)
            last = datetime.fromtimestamp(end, self.zone).date() + timedelta(days=8)
            day = first
            while day <= last:
                for block in self.blocks:
                    if day.weekday() not in block["days"]:
                        continue
                    clock = datetime.strptime(block["at"], "%H:%M:%S").time()
                    local = datetime.combine(day, clock, self.zone)
                    # A weekly wall-clock slot in a missing/ambiguous DST hour is
                    # deliberately refused, so the operator must choose a safe hour.
                    restored = local.astimezone(timezone.utc).astimezone(self.zone)
                    if restored != local or local.utcoffset() != local.replace(fold=1).utcoffset():
                        raise ValueError("A slot falls in a DST clock change; choose another time")
                    events.extend(self.expand(block, local.timestamp()))
                day += timedelta(days=1)
        return self.check_overlaps(events)

    def fill(self, start, end):
        index = 0
        while start < end - .001:
            key = self.filler[index % len(self.filler)]
            stop = min(end, start + float(self.assets[key]["duration"]))
            yield Event(key, start, stop)
            start = stop
            index += 1

    def timeline(self, start, end):
        # Look behind the requested window to anchor filler to a real block end.
        lookbehind = self.period if self.mode == "cycle" else 9 * 86400
        fixed = self.fixed_events(start - lookbehind, end)
        events = []
        for index, event in enumerate(fixed):
            if event.end > start and event.start < end:
                events.append(event)
            if index + 1 < len(fixed):
                gap_end = fixed[index + 1].start
                if gap_end > start and event.end < end:
                    # Skip full filler rounds without changing the phase.
                    duration = sum(float(self.assets[k]["duration"]) for k in self.filler)
                    skip = max(0, math.floor((start - event.end) / duration))
                    for filler in self.fill(event.end + skip * duration, min(gap_end, end)):
                        if filler.end > start:
                            events.append(filler)
        return sorted(events, key=lambda e: e.start)

    def public(self, event):
        asset = self.assets[event.asset]
        metadata = {key: value for key, value in public_metadata(asset).items() if value is not None and value != ""}
        metadata["tags"] = tags(metadata["tags"] + list(event.block_tags))
        programming = None if event.block_start is None else {
            "id": event.block_id, "title": event.block, "description": event.block_description,
            "tags": list(event.block_tags), "start": event.block_start, "end": event.block_end}
        return {**metadata, "programming": programming, "id": f"{event.start:.3f}:{event.asset}", "asset": event.asset,
                "title": asset["title"], "kind": asset.get("kind", "programme"),
                "block": event.block, "start": event.start, "end": event.end,
                "source_in": event.source_in, "source_duration": float(asset["duration"]), "url": f"/media/{event.asset}.mp4",
                "captions": [{"id": t["id"], "language": t.get("language", "und"),
                              "label": t.get("label", t.get("language", "Subtitles")), "default": t.get("default", False),
                              "url": f"/captions/{event.asset}/{t['id']}.vtt"} for t in asset.get("captions", [])]}

    def guide(self, now, hours=6):
        events = self.timeline(now, now + hours * 3600)
        return {"channel": self.channel, "timezone": str(self.zone), "server_time": now,
                "now": next((self.public(e) for e in events if e.start <= now < e.end), None),
                "upcoming": [self.public(e) for e in events if e.start > now]}
