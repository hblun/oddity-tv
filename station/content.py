"""Live editorial overlays. Media paths and broadcast timing stay in the catalogue."""
from dataclasses import dataclass, field
import hashlib
import json
import logging
from pathlib import Path
import re
from threading import Lock
from .metadata import public_metadata, tags, text

THEMES = {'cobalt', 'coral', 'citrus', 'nocturne'}
ARTWORK = {'moon-walking', 'radio-hat'}
KINDS = {'programme', 'archive', 'advert', 'trailer', 'ident', 'public-information', 'interstitial'}
SLUG = re.compile(r'[a-zA-Z0-9_-]{1,100}')
log = logging.getLogger(__name__)


def markdown_text(value, paragraphs=False):
    """Synopsis Markdown is prose: retain words, render no HTML or remote media."""
    value = re.sub(r'!?\[([^\]\n]*)\]\([^\n)]*\)', r'\1', value)
    value = re.sub(r'^\s{0,3}(?:#{1,6}\s+|>\s?|[-+*]\s+|\d+[.)]\s+)', '', value, flags=re.M)
    value = re.sub(r'^(?:```|~~~).*$', '', value, flags=re.M)
    for marker in ('**', '__', '~~', '*', '_', '`'):
        value = re.sub(re.escape(marker) + r'(.+?)' + re.escape(marker), r'\1', value)
    if paragraphs:
        return '\n\n'.join(filter(None, (text(p) for p in re.split(r'\n\s*\n', value))))[:12000]
    return text(value)


@dataclass(frozen=True)
class ContentSnapshot:
    programmes: dict = field(default_factory=dict)
    strands: dict = field(default_factory=dict)
    defaults: dict = field(default_factory=dict)
    revision: str = 'catalogue'
    collections: dict = field(default_factory=dict)

    def collection(self, profile):
        for key, collection in self.collections.items():
            if profile in collection['blocks']:
                return {'id': key, 'title': collection['title'], 'part': collection['blocks'].index(profile)+1,
                        'total': len(collection['blocks']), 'theme': collection.get('theme', 'coral')}
        return None

    def public(self, station, event):
        entry = station.public(event)
        programme = self.programmes.get(event.asset, {})
        metadata = public_metadata(station.assets[event.asset])
        metadata.update({k: v for k, v in programme.items() if k in metadata})
        for key, value in metadata.items():
            if value is None or value == '':
                entry.pop(key, None)
            else:
                entry[key] = value
        if 'title' in programme:
            entry['title'] = programme['title']
        strand = self.strands.get(event.block_id, {})
        if entry['programming']:
            entry['programming'] = {**entry['programming'], **{k: v for k, v in strand.items() if k in ('title', 'description', 'tags')}}
            collection = self.collection(event.block_id)
            if collection:
                entry['programming']['collection'] = collection
            entry['block'] = entry['programming']['title']
        entry['tags'] = tags(metadata['tags'] + (entry['programming']['tags'] if entry['programming'] else []))
        # Explicit programme choice, then explicit strand choice, then clip defaults.
        appearance = {**self.defaults.get(entry['kind'], {}), **{k: v for k, v in strand.items() if k in ('theme', 'artwork')},
                      **{k: v for k, v in programme.items() if k in ('theme', 'artwork')}}
        if appearance:
            entry['presentation'] = appearance
        return entry

    def guide(self, station, now, hours=6):
        events = station.timeline(now, now + hours * 3600)
        return {'channel': station.channel, 'timezone': str(station.zone), 'server_time': now,
                'content_revision': self.revision,
                'now': next((self.public(station, e) for e in events if e.start <= now < e.end), None),
                'upcoming': [self.public(station, e) for e in events if e.start > now]}


def stamp(path):
    try:
        info = path.stat()
        return info.st_mtime_ns, info.st_size, info.st_ino
    except FileNotFoundError:
        return None


class ContentStore:
    def __init__(self, root=None):
        self.root = Path(root).resolve() if root is not None else None
        self._current = ContentSnapshot()
        self._dependencies = []
        self._signature = self._failed = None
        self._lock = Lock()

    def snapshot(self, strict=False):
        if self.root is None:
            return self._current
        with self._lock:
            signature = ('unreadable',)
            try:
                signature = tuple(stamp(p) for p in [self.root / 'content.json', *self._dependencies])
                if not strict and signature == self._signature:
                    return self._current
                snapshot, dependencies, loaded_signature = self._load()
            except (ValueError, OSError) as error:
                if strict:
                    raise
                if self._failed != signature:
                    log.warning('Editorial update rejected; retaining the last valid content (%s). Run python -m station.cli validate.', type(error).__name__)
                self._failed = signature
                return self._current
            self._current, self._dependencies = snapshot, dependencies
            self._signature = loaded_signature
            self._failed = None
            return snapshot

    @classmethod
    def from_data(cls, data):
        """Validate a self-contained publication, without resolving file references."""
        return cls()._load(data)[0]

    def _load(self, data=None):
        def read(path, limit):
            before = stamp(path)
            with path.open('rb') as handle:
                value = handle.read(limit + 1)
            if len(value) > limit:
                raise ValueError('Editorial file exceeds its size limit')
            if before != stamp(path):
                raise ValueError('Editorial file changed while reading; save and retry')
            return value, before
        if data is None:
            path = self.root / 'content.json'
            if not path.exists():
                return ContentSnapshot(), [], (None,)
            raw, json_stamp = read(path, 1_000_000)
            data = json.loads(raw)
        else:
            raw, json_stamp = json.dumps(data, allow_nan=False).encode(), None
            if len(raw) > 1_000_000:
                raise ValueError('Editorial file exceeds its size limit')
        loaded_signature = [json_stamp]
        if not isinstance(data, dict) or set(data) - {'programmes', 'strands', 'defaults', 'collections'}:
            raise ValueError('content.json accepts programmes, strands, defaults and collections')
        digest = hashlib.sha256(raw)
        dependencies = []

        def entry(value, scope):
            metadata_keys = {'title', 'description', 'description_file', 'tags', 'theme', 'artwork'}
            if scope == 'programmes':
                metadata_keys |= {'genres', 'series', 'season', 'episode', 'year'}
            if scope == 'strands':
                metadata_keys |= {'premise', 'notes', 'notes_file', 'lineup', 'content_information'}
            if scope == 'collections':
                metadata_keys = {'title', 'description', 'description_file', 'notes', 'notes_file', 'blocks', 'theme'}
            if scope == 'defaults':
                metadata_keys = {'theme', 'artwork'}
            if not isinstance(value, dict) or set(value) - metadata_keys:
                raise ValueError(f'Unknown or invalid fields in content {scope}')
            value = dict(value)
            for prose_key in ('description', 'notes'):
                file_key = prose_key + '_file'
                if prose_key in value and file_key in value:
                    raise ValueError(f'Use {prose_key} or {file_key}, not both')
                if file_key not in value:
                    continue
                if self.root is None:
                    raise ValueError('Published content must contain prose, not file references')
                relative = value.pop(file_key)
                if not isinstance(relative, str):
                    raise ValueError(f'{file_key} must be a relative Markdown path')
                document = self.root / relative
                resolved = document.resolve()
                allowed_root = (self.root / 'descriptions').resolve()
                if not allowed_root.is_relative_to(self.root) or not resolved.is_relative_to(allowed_root) or resolved.suffix != '.md':
                    raise ValueError('Editorial prose must be .md files inside config/descriptions')
                payload, document_stamp = read(document, 64_000)
                dependencies.append(document)
                loaded_signature.append(document_stamp)
                digest.update(relative.encode()); digest.update(payload)
                value[prose_key] = markdown_text(payload.decode('utf-8-sig'), paragraphs=prose_key == 'notes')
            for key in ('title', 'description', 'series', 'premise', 'content_information', 'notes'):
                if key in value:
                    if not isinstance(value[key], str):
                        raise ValueError(f'{key} must be text')
                    value[key] = markdown_text(value[key], paragraphs=True) if key == 'notes' else text(value[key], 4000 if key == 'description' else 200)
                    if key == 'title' and not value[key]:
                        raise ValueError('Titles cannot be empty')
            for key in ('tags', 'genres'):
                if key in value:
                    if not isinstance(value[key], list) or not all(isinstance(v, str) for v in value[key]):
                        raise ValueError(f'{key} must be a list of text labels')
                    value[key] = tags(value[key])
            for key in ('season', 'episode', 'year'):
                if key in value and (type(value[key]) is not int or not 0 <= value[key] <= 9999):
                    raise ValueError(f'{key} must be an integer from 0 to 9999')
            if 'theme' in value and (not isinstance(value['theme'], str) or value['theme'] not in THEMES):
                raise ValueError('Unknown content theme')
            if 'artwork' in value and (not isinstance(value['artwork'], str) or value['artwork'] not in ARTWORK):
                raise ValueError('Unknown archive artwork ID')
            if 'blocks' in value:
                blocks = value['blocks']
                if not isinstance(blocks, list) or not blocks or len(blocks) > 100 or any(not isinstance(v, str) or not SLUG.fullmatch(v) for v in blocks) or len(set(blocks)) != len(blocks):
                    raise ValueError('Collections need distinct block profile IDs')
            if scope == 'collections' and (not value.get('title') or not value.get('blocks')):
                raise ValueError('Collections need a title and ordered blocks')
            if 'lineup' in value:
                if not value.get('title'):
                    raise ValueError('An editorial preview needs a block title')
                lineup = value['lineup']
                if not isinstance(lineup, list) or not lineup or len(lineup) > 200:
                    raise ValueError('An editorial lineup needs 1 to 200 works')
                clean = []
                for index, work in enumerate(lineup):
                    allowed = {'title', 'kind', 'year', 'description', 'duration', 'content_information'}
                    if not isinstance(work, dict) or set(work) - allowed or not text(work.get('title'), 200):
                        raise ValueError('Planned works need a title and supported fields')
                    duration = work.get('duration')
                    if type(duration) not in (int, float) or not 0 < duration <= 86400:
                        raise ValueError('Planned work duration must be positive seconds')
                    if not isinstance(work.get('kind', 'programme'), str) or work.get('kind', 'programme') not in KINDS:
                        raise ValueError('Unknown planned work kind')
                    if 'year' in work and (type(work['year']) is not int or not 0 <= work['year'] <= 9999):
                        raise ValueError('Planned work year must be an integer')
                    item = {k: text(work[k], 4000 if k == 'description' else 200) for k in ('title', 'description', 'content_information') if k in work}
                    item.update(id=f'item-{index}', duration=float(duration), kind=work.get('kind', 'programme'))
                    if 'year' in work: item['year'] = work['year']
                    clean.append(item)
                if sum(w['duration'] for w in clean) > 86400:
                    raise ValueError('A planned block cannot exceed 24 hours')
                value['lineup'] = clean
            return value

        sections = {}
        for scope in ('programmes', 'strands', 'defaults', 'collections'):
            mapping = data.get(scope, {})
            if not isinstance(mapping, dict):
                raise ValueError(f'{scope} must be an object keyed by ID')
            for key in mapping:
                if not SLUG.fullmatch(key) or (scope == 'defaults' and key not in KINDS):
                    raise ValueError(f'Unknown kind or invalid ID in {scope}')
            sections[scope] = {key: entry(value, scope) for key, value in mapping.items()}
        owners = [profile for collection in sections['collections'].values() for profile in collection['blocks']]
        if len(set(owners)) != len(owners):
            raise ValueError('A block profile can belong to one collection')
        if any(profile not in sections['strands'] for profile in owners):
            raise ValueError('Collection blocks need an editorial strand definition')
        return ContentSnapshot(**sections, revision=digest.hexdigest()[:16]), dependencies, tuple(loaded_signature)
