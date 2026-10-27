"""Small, single-operator SQLite content desk. Never mounted on the viewer app."""
from copy import deepcopy
from contextlib import contextmanager
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import sqlite3
import tempfile
import time
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from .content import ARTWORK, KINDS, SLUG, THEMES, ContentStore
from .jellyfintv import content_chunks
from .metadata import public_metadata, text, tags
from .schedule import Schedule

BASE = Path(__file__).resolve().parent.parent


def encoded(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(',', ':'))


def number(value, name, minimum=0, maximum=86400):
    if type(value) not in (int, float) or not math.isfinite(value) or not minimum <= value <= maximum:
        raise ValueError(f'{name} must be between {minimum} and {maximum}')
    return value


def validate_document(data):
    if not isinstance(data, dict) or set(data) != {'programmes', 'blocks', 'collections', 'schedule', 'defaults'}:
        raise ValueError('A Studio document needs programmes, blocks, collections, schedule and defaults')
    if len(encoded(data)) > 1_000_000:
        raise ValueError('The content desk is limited to 1 MB of editorial data')
    data = deepcopy(data)
    for scope in ('programmes', 'blocks', 'collections'):
        records = data[scope]
        if not isinstance(records, dict) or len(records) > 1000:
            raise ValueError(f'{scope} must be an object of up to 1,000 records')
        for key, value in records.items():
            if not SLUG.fullmatch(key) or not isinstance(value, dict):
                raise ValueError('Records need stable slug IDs and objects')
            if not isinstance(value.get('title'), str) or not text(value['title'], 200):
                raise ValueError(f'{scope}: {key} needs a title')
            for field in ('title', 'description', 'premise', 'series'):
                if field in value:
                    if not isinstance(value[field], str): raise ValueError(f'{field} must be text')
                    value[field] = text(value[field], 4000 if field == 'description' else 200)
            if 'theme' in value and value['theme'] not in THEMES: raise ValueError('Unknown colour edition')
            if 'artwork' in value and value['artwork'] not in ARTWORK: raise ValueError('Unknown artwork')
            for field in ('tags', 'genres'):
                if field in value:
                    if not isinstance(value[field], list) or any(not isinstance(t, str) for t in value[field]): raise ValueError('Tags must be text labels')
                    value[field] = tags(value[field])
    assigned = set()
    for key, record in data['programmes'].items():
        if set(record) - {'title', 'description', 'kind', 'duration', 'asset_id', 'year', 'series', 'season', 'episode', 'tags', 'genres', 'theme', 'artwork'}:
            raise ValueError('Unknown programme fields')
        if record.get('kind', 'programme') not in KINDS: raise ValueError('Unknown programme kind')
        number(record.get('duration'), 'Estimated duration', .001)
        asset_id = record.get('asset_id', key)
        if not isinstance(asset_id, str) or not SLUG.fullmatch(asset_id): raise ValueError('Media IDs must be slugs')
        if asset_id in assigned: raise ValueError('Use one programme record for each media ID')
        assigned.add(asset_id)
        record['asset_id'] = asset_id
        for field in ('year', 'season', 'episode'):
            if field in record and (type(record[field]) is not int or not 0 <= record[field] <= 9999): raise ValueError(f'Invalid {field}')
    for key, block in data['blocks'].items():
        if set(block) - {'title', 'description', 'premise', 'theme', 'artwork', 'tags', 'items'}: raise ValueError('Unknown block fields')
        if not isinstance(block.get('items'), list) or not 1 <= len(block['items']) <= 200: raise ValueError('A block needs 1 to 200 rundown items')
        for item in block['items']:
            if not isinstance(item, dict) or set(item) - {'programme_id', 'in', 'duration', 'break_every', 'ads'}: raise ValueError('Unknown rundown fields')
            if item.get('programme_id') not in data['programmes']: raise ValueError('A rundown refers to an unknown programme')
            for field in ('in', 'duration', 'break_every'):
                if field in item: number(item[field], field, 0 if field == 'in' else .001)
            if 'ads' in item and (not isinstance(item['ads'], list) or any(a not in data['programmes'] for a in item['ads'])): raise ValueError('Unknown advert in rundown')
    owners = []
    for collection in data['collections'].values():
        if set(collection) - {'title', 'description', 'blocks', 'theme'}: raise ValueError('Unknown collection fields')
        if not isinstance(collection.get('blocks'), list) or not collection['blocks'] or any(b not in data['blocks'] for b in collection['blocks']): raise ValueError('A collection needs existing blocks')
        owners.extend(collection['blocks'])
    if len(set(owners)) != len(owners): raise ValueError('A block can belong to one collection')
    schedule = data['schedule']
    if not isinstance(schedule, dict) or set(schedule) - {'channel', 'timezone', 'mode', 'origin', 'period_seconds', 'filler', 'blocks'}: raise ValueError('Unknown schedule fields')
    if schedule.get('mode') not in ('cycle', 'weekly'): raise ValueError('Choose cycle or weekly scheduling')
    if not isinstance(schedule.get('channel', ''), str) or not isinstance(schedule.get('timezone', 'Europe/London'), str):
        raise ValueError('Channel and timezone must be text')
    ZoneInfo(schedule.get('timezone', 'Europe/London'))
    if schedule['mode'] == 'cycle':
        if not isinstance(schedule.get('origin'), str): raise ValueError('Cycle origin must be an ISO date with a timezone')
        origin = datetime.fromisoformat(schedule['origin'].replace('Z', '+00:00'))
        if origin.tzinfo is None: raise ValueError('Cycle origin must include a timezone')
    if not isinstance(schedule.get('blocks'), list) or not 1 <= len(schedule['blocks']) <= 200: raise ValueError('Schedule 1 to 200 block slots')
    for slot in schedule['blocks']:
        allowed = {'profile', 'offset'} if schedule['mode'] == 'cycle' else {'profile', 'days', 'at'}
        if not isinstance(slot, dict) or set(slot) != allowed or slot.get('profile') not in data['blocks']: raise ValueError('A schedule slot needs an existing block and its start time')
        if schedule['mode'] == 'cycle': number(slot['offset'], 'Slot offset', 0, 604800)
        elif not isinstance(slot['days'], list) or not slot['days'] or any(type(d) is not int or not 0 <= d <= 6 for d in slot['days']): raise ValueError('Choose weekdays for each slot')
        elif not isinstance(slot['at'], str): raise ValueError('Choose a slot time')
        else: datetime.strptime(slot['at'], '%H:%M:%S')
    if not isinstance(schedule.get('filler'), list) or not schedule['filler'] or any(p not in data['programmes'] for p in schedule['filler']): raise ValueError('Choose continuity programmes')
    if schedule['mode'] == 'cycle': number(schedule.get('period_seconds'), 'Cycle length', 1, 604800)
    ContentStore.from_data({'defaults': data['defaults']})
    return data


def seed_document(config):
    """One-time migration. Subsequent editing happens in SQLite."""
    published = config/'published.json'
    if published.exists():
        bundle = json.loads(published.read_text())
        schedule, catalog, editorial = bundle['schedule'], bundle['catalog'], ContentStore.from_data(bundle['content'])
    else:
        schedule = json.loads((config/'schedule.json').read_text())
        catalog = json.loads((config/'catalog.json').read_text())
        editorial = ContentStore(config).snapshot(strict=True)
    programmes = {}
    for key, asset in catalog['assets'].items():
        programmes[key] = {**{k: v for k, v in public_metadata(asset).items() if v is not None},
                           **editorial.programmes.get(key, {}), 'title': editorial.programmes.get(key, {}).get('title', asset['title']),
                           'kind': asset.get('kind', 'programme'), 'duration': asset['duration'], 'asset_id': key}
    blocks = {}
    slots = []
    for index, slot in enumerate(schedule['blocks']):
        profile = slot.get('profile') or f'block-{index+1}'
        definition = {**schedule.get('programming_blocks', {}).get(profile, {}), **slot, **editorial.strands.get(profile, {})}
        items = [{('programme_id' if k == 'asset' else k): v for k, v in item.items()} for item in slot['items']]
        if profile in blocks and blocks[profile]['items'] != items: raise ValueError('Shared profiles with different rundowns need distinct IDs before migration')
        blocks[profile] = {k: definition[k] for k in ('title', 'description', 'premise', 'theme', 'artwork', 'tags') if k in definition}
        blocks[profile].setdefault('title', 'Programme block')
        blocks[profile]['items'] = items
        slots.append({**{k: v for k, v in slot.items() if k in ('days', 'at', 'offset')}, 'profile': profile})
    for profile, strand in editorial.strands.items():
        if profile in blocks or not strand.get('lineup'): continue
        block = {k: strand[k] for k in ('title', 'description', 'premise', 'theme', 'artwork', 'tags') if k in strand}
        block['items'] = []
        for index, work in enumerate(strand['lineup']):
            key = f'{profile}-{index+1:03}'
            programmes[key] = {k: v for k, v in work.items() if k in ('title', 'description', 'kind', 'year', 'duration')}
            programmes[key]['asset_id'] = key
            block['items'].append({'programme_id': key})
        blocks[profile] = block
    return validate_document({'programmes': programmes, 'blocks': blocks,
                             'collections': {key: {k: value[k] for k in ('title', 'description', 'blocks', 'theme') if k in value} for key, value in editorial.collections.items()},
                             'defaults': editorial.defaults,
                             'schedule': {**{k: v for k, v in schedule.items() if k not in ('blocks', 'programming_blocks')}, 'blocks': slots}})


def compile_document(document, catalog, media):
    data = validate_document(document)
    catalog = deepcopy(catalog)
    assets = catalog['assets']
    ready = {}
    for key, programme in data['programmes'].items():
        asset = assets.get(programme['asset_id'])
        path = (media/asset['file']).resolve() if asset else None
        ready[key] = bool(path and path.is_relative_to(media.resolve()) and path.is_file() and path.suffix.lower() == '.mp4')
        if ready[key]: assets[programme['asset_id']]['kind'] = programme.get('kind', 'programme')
    content = {'programmes': {}, 'strands': {}, 'collections': data['collections'], 'defaults': data['defaults']}
    for key, programme in data['programmes'].items():
        if ready[key]: content['programmes'][programme['asset_id']] = {k: v for k, v in programme.items() if k not in ('asset_id', 'duration', 'kind')}
    issues, compiled_items, durations = [], {}, {}
    for key, block in data['blocks'].items():
        lineup, items, duration = [], [], 0
        for item in block['items']:
            programme = data['programmes'][item['programme_id']]
            media_id = programme['asset_id']
            scheduled_item = {('asset' if k == 'programme_id' else k): (media_id if k == 'programme_id' else [data['programmes'][a]['asset_id'] for a in v] if k == 'ads' else v) for k, v in item.items()}
            total = float(assets[media_id]['duration'] if ready[item['programme_id']] else programme['duration'])
            length = item.get('duration', total - item.get('in', 0))
            if item.get('in', 0) + length > total + .001 or length <= 0: raise ValueError(f'{block["title"]}: excerpt exceeds {programme["title"]}')
            if item.get('break_every') and length/item['break_every']*(1+len(item.get('ads', []))) > 2000:
                raise ValueError('An advert rule produces too many segments')
            dependencies = [item['programme_id'], *item.get('ads', [])]
            if all(ready[p] for p in dependencies):
                chunks = list(content_chunks(scheduled_item, assets))
                length = sum(c.get('duration', float(assets[c['asset']]['duration'])-c.get('in', 0)) for c in chunks)
            elif any(slot['profile'] == key for slot in data['schedule']['blocks']):
                issues.append(f'{block["title"]}: media missing for '+', '.join(data['programmes'][p]['title'] for p in dependencies if not ready[p]))
            lineup.append({**{k: programme[k] for k in ('title', 'description', 'year', 'kind') if k in programme}, 'duration': length})
            items.append(scheduled_item);duration += length
        if duration > 86400: raise ValueError(f'{block["title"]} exceeds 24 hours')
        durations[key] = duration
        content['strands'][key] = {**{k: v for k, v in block.items() if k != 'items'}, 'lineup': lineup}
        compiled_items[key] = items
    filler = []
    for key in data['schedule']['filler']:
        if not ready[key]: issues.append(f'Continuity media missing: {data["programmes"][key]["title"]}')
        filler.append(data['programmes'][key]['asset_id'])
    schedule = {**data['schedule'], 'filler': filler,
                'programming_blocks': {key: {k: v for k, v in b.items() if k in ('title', 'description', 'tags')} for key, b in data['blocks'].items()},
                'blocks': [{**slot, 'items': compiled_items[slot['profile']]} for slot in data['schedule']['blocks']]}
    ContentStore.from_data(content)
    if not issues:
        station = Schedule(schedule, catalog, media)
        segments = sum(len(station.expand(block, 0)) for block in station.blocks)
        daily_segments = segments*math.ceil(86400/station.period) if station.mode == 'cycle' else segments
        if daily_segments > 100000:
            raise ValueError('This pattern exceeds 100,000 scheduled segments per day')
        station.guide(time.time(), 24)
    delivery_catalog = {'assets': {key: {**public_metadata(asset),
        **{k: asset[k] for k in ('title', 'kind', 'duration', 'file', 'captions') if k in asset}}
        for key, asset in assets.items()}}
    return {'version': 1, 'schedule': schedule, 'content': content, 'catalog': delivery_catalog}, ready, durations, issues


class Conflict(ValueError): pass


class StudioStore:
    """Foreign keys protect the library; every save is one SQLite transaction."""
    def __init__(self, config, media):
        self.config, self.media = Path(config), Path(media)
        self.path = self.config/'studio.sqlite3'
        self.config.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS programmes(id TEXT PRIMARY KEY, data TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS blocks(id TEXT PRIMARY KEY, data TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS rundown(block_id TEXT REFERENCES blocks(id), position INTEGER,
                    programme_id TEXT REFERENCES programmes(id), data TEXT NOT NULL, PRIMARY KEY(block_id,position));
                CREATE TABLE IF NOT EXISTS collections(id TEXT PRIMARY KEY, data TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS collection_blocks(collection_id TEXT REFERENCES collections(id), position INTEGER,
                    block_id TEXT REFERENCES blocks(id), PRIMARY KEY(collection_id,position));
                CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, data TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS revisions(id INTEGER PRIMARY KEY AUTOINCREMENT, saved_at TEXT NOT NULL, document TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS publications(id INTEGER PRIMARY KEY AUTOINCREMENT, revision INTEGER NOT NULL, published_at TEXT NOT NULL, bundle TEXT NOT NULL);
            ''')
            if not db.execute('SELECT 1 FROM revisions LIMIT 1').fetchone():
                self._write(db, seed_document(self.config))

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.execute('PRAGMA foreign_keys=ON');db.execute('PRAGMA journal_mode=WAL')
        try:
            with db:
                yield db
        finally:
            db.close()

    def _read(self, db):
        data = {scope: {key: json.loads(raw) for key, raw in db.execute(f'SELECT id,data FROM {scope} ORDER BY rowid')} for scope in ('programmes', 'blocks', 'collections')}
        for key, block in data['blocks'].items():
            block['items'] = [{'programme_id': p, **json.loads(raw)} for p, raw in db.execute('SELECT programme_id,data FROM rundown WHERE block_id=? ORDER BY position', (key,))]
        for key, collection in data['collections'].items():
            collection['blocks'] = [row[0] for row in db.execute('SELECT block_id FROM collection_blocks WHERE collection_id=? ORDER BY position', (key,))]
        data.update({key: json.loads(raw) for key, raw in db.execute('SELECT key,data FROM settings')})
        return data

    def _write(self, db, data):
        for table in ('rundown', 'collection_blocks', 'blocks', 'collections', 'programmes', 'settings'):
            db.execute(f'DELETE FROM {table}')
        for key, value in data['programmes'].items(): db.execute('INSERT INTO programmes VALUES (?,?)', (key, encoded(value)))
        for key, value in data['blocks'].items():
            db.execute('INSERT INTO blocks VALUES (?,?)', (key, encoded({k: v for k, v in value.items() if k != 'items'})))
            for position, item in enumerate(value['items']): db.execute('INSERT INTO rundown VALUES (?,?,?,?)', (key, position, item['programme_id'], encoded({k: v for k, v in item.items() if k != 'programme_id'})))
        for key, value in data['collections'].items():
            db.execute('INSERT INTO collections VALUES (?,?)', (key, encoded({k: v for k, v in value.items() if k != 'blocks'})))
            for position, block in enumerate(value['blocks']): db.execute('INSERT INTO collection_blocks VALUES (?,?,?)', (key, position, block))
        for key in ('schedule', 'defaults'): db.execute('INSERT INTO settings VALUES (?,?)', (key, encoded(data[key])))
        cursor = db.execute('INSERT INTO revisions(saved_at,document) VALUES (?,?)', (datetime.now(timezone.utc).isoformat(), encoded(data)))
        db.execute('DELETE FROM revisions WHERE id NOT IN (SELECT id FROM revisions ORDER BY id DESC LIMIT 30)')
        return cursor.lastrowid

    def catalog(self):
        return json.loads((self.config/'catalog.json').read_text())

    def state(self):
        with self.connect() as db:
            document = self._read(db)
            revision = db.execute('SELECT max(id) FROM revisions').fetchone()[0]
            history = [{'id': row[0], 'saved_at': row[1]} for row in db.execute('SELECT id,saved_at FROM revisions ORDER BY id DESC LIMIT 10')]
            last = db.execute('SELECT revision,published_at FROM publications ORDER BY id DESC LIMIT 1').fetchone()
        catalog = self.catalog()
        try:
            _, ready, durations, issues = compile_document(document, catalog, self.media)
        except (ValueError, KeyError, TypeError) as error:
            ready, durations, issues = {}, {}, [str(error)]
        return {'document': document, 'revision': revision, 'history': history,
                'published': {'revision': last[0], 'at': last[1]} if last else None,
                'ready': ready, 'durations': durations, 'issues': issues,
                'assets': [{'id': key, 'title': value['title'], 'duration': value['duration']} for key, value in catalog['assets'].items()]}

    def save(self, document, revision):
        data = validate_document(document)
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            self._check(db, revision)
            self._write(db, data)
        return self.state()

    @staticmethod
    def _check(db, revision):
        if type(revision) is not int or db.execute('SELECT max(id) FROM revisions').fetchone()[0] != revision:
            raise Conflict('This draft changed in another tab. Reload before saving.')

    def restore(self, history_id, revision):
        with self.connect() as db:
            row = db.execute('SELECT document FROM revisions WHERE id=?', (history_id,)).fetchone()
        if not row: raise ValueError('Saved revision unavailable')
        return self.save(json.loads(row[0]), revision)

    def publish(self, revision):
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE');self._check(db, revision)
            bundle, _, _, issues = compile_document(self._read(db), self.catalog(), self.media)
            if issues: raise ValueError('\n'.join(issues))
            bundle['revision'] = revision
            payload = encoded(bundle)
            if len(payload.encode()) > 8_000_000:
                raise ValueError('Publication exceeds 8 MB')
            # One atomic replace activates schedule, catalogue and EPG together.
            descriptor, filename = tempfile.mkstemp(prefix='.publication-', dir=self.config)
            try:
                with os.fdopen(descriptor, 'w') as handle:
                    handle.write(payload);handle.flush();os.fsync(handle.fileno())
                os.replace(filename, self.config/'published.json')
            finally:
                Path(filename).unlink(missing_ok=True)
            db.execute('INSERT INTO publications(revision,published_at,bundle) VALUES (?,?,?)', (revision, datetime.now(timezone.utc).isoformat(), payload))
            db.execute('DELETE FROM publications WHERE id NOT IN (SELECT id FROM publications ORDER BY id DESC LIMIT 10)')
        return self.state()


def fill_block(document, key, target, kind, tag='', available=None):
    """Deterministic, duration-aware tail fill, restricted to continuity material."""
    if kind not in {'ident', 'interstitial', 'advert', 'trailer'}: raise ValueError('Choose continuity, advert, trailer or interstitial fill')
    number(target, 'Target duration', 1)
    data = deepcopy(document)
    block = data['blocks'].get(key)
    if not block: raise ValueError('Unknown block')
    virtual_assets = {key: {'duration': programme['duration']} for key, programme in data['programmes'].items()}
    used = 0
    for item in block['items']:
        authored = {('asset' if k == 'programme_id' else k): v for k, v in item.items()}
        used += sum(chunk.get('duration', virtual_assets[chunk['asset']]['duration']-chunk.get('in', 0)) for chunk in content_chunks(authored, virtual_assets))
    remaining = target-used
    if remaining <= .001: raise ValueError('The block already meets or exceeds its target')
    choices = [(key, programme) for key, programme in sorted(data['programmes'].items()) if programme.get('kind') == kind
               and (available is None or key in available) and (not tag or tag in programme.get('tags', []))]
    if not choices: raise ValueError('No programmes match this fill rule')
    while remaining > .001 and len(block['items']) < 200:
        fitting = [(key, p) for key, p in choices if p['duration'] <= remaining+.001]
        key, p = max(fitting, key=lambda pair: pair[1]['duration']) if fitting else min(choices, key=lambda pair: pair[1]['duration'])
        duration = min(remaining, p['duration'])
        block['items'].append({'programme_id': key, **({'duration': duration} if duration < p['duration'] else {})})
        remaining -= duration
    if remaining > .001: raise ValueError('Fill would exceed 200 rundown items')
    return validate_document(data)


def create_studio(config=None, media=None):
    config = Path(config or os.getenv('STATION_CONFIG', BASE/'config'))
    media = Path(media or os.getenv('STATION_MEDIA', BASE/'media'))
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    store = None
    def desk():
        nonlocal store
        if store is None: store = StudioStore(config, media)
        return store

    @app.middleware('http')
    async def local_desk(request: Request, call_next):
        host = request.url.hostname
        if host not in ('localhost', '127.0.0.1', '::1') or request.client is None or request.client.host not in ('127.0.0.1', '::1'):
            return JSONResponse({'detail': 'Studio is available on this computer only'}, status_code=403)
        if request.method not in ('GET', 'HEAD'):
            origin = request.headers.get('origin')
            if request.headers.get('x-oddity-studio') != '1' or (origin and origin != f'{request.url.scheme}://{request.url.netloc}'):
                return JSONResponse({'detail': 'Use the local Studio to save changes'}, status_code=403)
            if len(await request.body()) > 1_100_000:
                return JSONResponse({'detail': 'Draft exceeds its size limit'}, status_code=413)
        try:
            response = await call_next(request)
        except Conflict as error:
            return JSONResponse({'detail': str(error)}, status_code=409)
        except (ValueError, KeyError, TypeError) as error:
            return JSONResponse({'detail': str(error)}, status_code=422)
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
        return response

    @app.get('/api/studio')
    def state(): return desk().state()

    @app.put('/api/studio')
    def save(body: dict): return desk().save(body['document'], body['revision'])

    @app.post('/api/publish')
    def publish(body: dict): return desk().publish(body['revision'])

    @app.post('/api/restore')
    def restore(body: dict): return desk().restore(body['history_id'], body['revision'])

    @app.post('/api/fill')
    def fill(body: dict):
        # Fill the supplied unsaved draft, return a proposed rundown. Saving is explicit.
        data = validate_document(body['document'])
        catalog = desk().catalog()
        available = set()
        for key, programme in data['programmes'].items():
            asset = catalog['assets'].get(programme['asset_id'])
            if asset:
                path = (media/asset['file']).resolve()
                if path.is_relative_to(media.resolve()) and path.is_file(): available.add(key)
                programme['duration'] = float(asset['duration'])
        return {'document': fill_block(data, body['block_id'], body['target'], body['kind'], body.get('tag', ''), available)}

    for route, name, mime in (('/', 'studio.html', 'text/html'), ('/studio.js', 'studio.js', 'text/javascript'), ('/studio.css', 'studio.css', 'text/css'), ('/schedule-layout.js', 'schedule-layout.js', 'text/javascript')):
        def static_file(filename, content_type):
            def serve(): return FileResponse(BASE/'web'/filename, media_type=content_type)
            return serve
        app.add_api_route(route, static_file(name, mime), methods=['GET'])
    for name in ('bricolage-grotesque/BricolageGrotesque.woff2', 'ibm-plex-mono/IBMPlexMono-Regular.woff2'):
        app.add_api_route('/fonts/'+name, static_file('fonts/'+name, 'font/woff2'), methods=['GET'])
    return app


app = create_studio()
