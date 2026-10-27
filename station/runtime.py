"""Read one coherent publication for playback, EPG and XMLTV."""
from dataclasses import dataclass, replace
import hashlib
import json
import logging
from pathlib import Path
from threading import RLock
import time
from .content import ContentStore, ContentSnapshot, stamp
from .schedule import Schedule

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Publication:
    schedule: Schedule
    editorial: ContentSnapshot


class RuntimeStore:
    def __init__(self, config, media, schedule=None, content_root=None):
        self.config, self.media = Path(config), Path(media)
        self.fixed = schedule
        self.content = ContentStore(content_root)
        self.current = None
        self.signature = None
        self.failed = None
        self.lock = RLock()
        self.media_assets = {}

    def snapshot(self, strict=False):
        with self.lock:
            path = self.config / 'published.json'
            signature = stamp(path) if self.fixed is None else None
            try:
                if signature is not None:
                    if signature == self.signature and self.current:
                        return self.current
                    if signature == self.failed and self.current and not strict:
                        return self.current
                    if path.stat().st_size > 8_000_000:
                        raise ValueError('Publication exceeds its size limit')
                    data = json.loads(path.read_text())
                    if data.get('version') != 1:
                        raise ValueError('Unknown publication version')
                    station = Schedule(data['schedule'], data['catalog'], self.media)
                    editorial = ContentStore.from_data(data['content'])
                    editorial = replace(editorial, revision=hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()[:16])
                    station.guide(time.time(), 24)
                else:
                    station = self.fixed or (self.current.schedule if self.current and self.signature is None else
                              Schedule(json.loads((self.config/'schedule.json').read_text()),
                                       json.loads((self.config/'catalog.json').read_text()), self.media))
                    editorial = self.content.snapshot(strict=strict)
                self.current = Publication(station, editorial)
                self.signature, self.failed = signature, None
                # Recently issued media URLs remain playable across a publication.
                # Asset IDs identify immutable prepared versions.
                self.media_assets.update({key: station.assets[key] for key in station.allowed})
            except (ValueError, OSError, KeyError, TypeError) as error:
                if strict or self.current is None:
                    raise
                if self.failed != signature:
                    log.warning('Publication rejected; retaining the last valid station (%s)', type(error).__name__)
                self.failed = signature
            return self.current
