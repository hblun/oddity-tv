"""Block-first public guide, with full airings and separate editorial previews."""
import math
from fastapi import HTTPException, Query


def airing_id(event):
    if event.block_start is not None:
        return f'{event.block_start:.3f}:{event.block_id or "inline"}'
    return f'{event.continuity_start if event.continuity_start is not None else event.start:.3f}:continuity'


def collection_for(editorial, profile):
    return editorial.collection(profile)


def block_summary(station, editorial, event):
    entry = editorial.public(station, event)
    programming = entry['programming']
    profile = event.block_id
    definition = editorial.strands.get(profile, {})
    return {'id': airing_id(event), 'profile_id': profile, 'scheduled': True,
            'kind': 'block' if programming else 'continuity',
            'title': programming['title'] if programming else 'Between blocks',
            'description': programming['description'] if programming else 'Short transmissions between the programmed blocks.',
            'premise': definition.get('premise', ''),
            'start': event.block_start if programming else event.continuity_start if event.continuity_start is not None else event.start,
            'end': event.block_end if programming else event.continuity_end if event.continuity_end is not None else event.end,
            'tags': programming['tags'] if programming else [],
            'presentation': entry.get('presentation', {}),
            'collection': collection_for(editorial, profile),
            }


def block_list(station, editorial, start, end):
    result = {}
    for event in station.timeline(start, end):
        key = airing_id(event)
        if key not in result:
            result[key] = block_summary(station, editorial, event)
    return sorted(result.values(), key=lambda block: block['start'])


def public_work(entry):
    # Keep delivery URLs and private selection/file references out of the reading UI.
    allowed = ('id', 'asset', 'title', 'description', 'kind', 'start', 'end', 'source_in', 'source_duration',
               'year', 'series', 'season', 'episode', 'tags', 'genres', 'presentation')
    return {key: entry[key] for key in allowed if key in entry}


def block_detail(station, editorial, key, now):
    try:
        start = float(key.partition(':')[0])
    except ValueError:
        raise HTTPException(404, 'Unknown block airing')
    if not math.isfinite(start) or not now - 9*86400 - .01 <= start <= now + 3*86400:
        raise HTTPException(404, 'Block airing is outside this guide')
    # Millisecond identifiers also work for durations with sub-millisecond fractions.
    event = next((e for e in station.timeline(start-.002, start+.002) if airing_id(e) == key), None)
    if event is None:
        raise HTTPException(404, 'Unknown block airing')
    block = block_summary(station, editorial, event)
    window_start = max(block['start'], min(now, block['end']-.001)) if block['kind'] == 'continuity' else block['start']
    window_end = min(block['end'], window_start+900) if block['kind'] == 'continuity' else block['end']
    events = [e for e in station.timeline(window_start, window_end) if airing_id(e) == key]
    if block['kind'] == 'continuity':
        events = events[:20]
        block['contents_complete'] = False
    works = {}
    for event in events:
        entry = public_work(editorial.public(station, event))
        work_id = f'item-{event.item_index}' if event.item_index is not None else entry['id']
        if work_id not in works:
            works[work_id] = {**entry, 'id': work_id, 'segments': [], 'duration': 0}
        work = works[work_id]
        work['segments'].append(entry)
        work['end'] = event.end
        work['duration'] += event.end-event.start
    block['works'] = list(works.values())
    return block


def preview_timeline(editorial, collection):
    if not collection:
        return []
    result = []
    offset = 0
    for profile in editorial.collections[collection['id']]['blocks']:
        definition = editorial.strands[profile]
        if not definition.get('lineup'):
            return []
        start = offset
        works = []
        for work in definition['lineup']:
            works.append({**{k: v for k, v in work.items() if k != 'content_information'}, 'start': offset, 'end': offset + work['duration']})
            offset += work['duration']
        result.append({'id': f'plan:{profile}', 'profile_id': profile, 'scheduled': False,
                       'kind': 'block', 'title': definition.get('title', profile),
                       'start': start, 'end': offset, 'works': works, 'collection': collection_for(editorial, profile),
                       'presentation': {k: definition[k] for k in ('theme', 'artwork') if k in definition}})
    return result


def planned_block(editorial, profile):
    definition = editorial.strands.get(profile, {})
    if not definition.get('lineup'):
        raise HTTPException(404, 'No editorial preview for this block')
    offset = 0
    works = []
    for entry in definition['lineup']:
        works.append({**{k: v for k, v in entry.items() if k != 'content_information'}, 'offset': offset, 'segments': []})
        offset += entry['duration']
    collection = collection_for(editorial, profile)
    timeline = preview_timeline(editorial, collection)
    if not timeline:
        timeline = [{'id': f'plan:{profile}', 'profile_id': profile, 'scheduled': False, 'kind': 'block',
                     'title': definition.get('title', profile), 'start': 0, 'end': offset,
                     'presentation': {key: definition[key] for key in ('theme', 'artwork') if key in definition},
                     'works': [{**work, 'start': work['offset'], 'end': work['offset']+work['duration']} for work in works]}]
    return {'id': f'plan:{profile}', 'profile_id': profile, 'scheduled': False, 'kind': 'block',
            'title': definition.get('title', profile), 'description': definition.get('description', ''),
            'premise': definition.get('premise', ''),
            'tags': definition.get('tags', []),
            'presentation': {key: definition[key] for key in ('theme', 'artwork') if key in definition},
            'collection': collection, 'duration': offset, 'works': works,
            'preview_timeline': timeline}


def collection_detail(station, editorial, collection_id, now):
    collection = editorial.collections.get(collection_id)
    if not collection:
        raise HTTPException(404, 'Unknown collection')
    configured = {b.get('profile') for b in station.blocks}
    # Use configured fixed events, rather than expanding days of repeated filler.
    airings = {}
    events = station.fixed_events(now-2*86400, now+3*86400) if configured.intersection(collection['blocks']) else []
    for event in events:
        if event.block_id in collection['blocks'] and event.end > now-2*86400 and event.start < now+3*86400:
            airings.setdefault(airing_id(event), block_summary(station, editorial, event))
    blocks = []
    for profile in collection['blocks']:
        definition = {**station.block_definitions.get(profile, {}), **editorial.strands[profile]}
        slots = sorted((b for b in airings.values() if b['profile_id'] == profile), key=lambda b:b['start'])
        next_slot = next((b for b in slots if b['end'] > now), None)
        blocks.append({'profile_id': profile, 'title': definition.get('title', profile),
                       'description': definition.get('description', ''), 'premise': definition.get('premise', ''),
                       'preview': bool(definition.get('lineup')), 'duration': sum(w['duration'] for w in definition.get('lineup', [])),
                       'airing': next_slot, 'airings': slots,
                       'status': 'Scheduled' if next_slot else ''})
    return {'id': collection_id, 'title': collection['title'], 'theme': collection.get('theme', 'coral'), 'description': collection.get('description', ''),
            'blocks': blocks}


def register_block_routes(app, runtime, clock):
    @app.get('/api/blocks')
    def blocks(start: float | None = None, end: float | None = None, after: float | None = None,
               limit: int = Query(default=30, ge=1, le=100)):
        now = clock()
        start = now if start is None else start
        end = start+21600 if end is None else end
        values = [start, end] + ([] if after is None else [after])
        if not all(math.isfinite(t) for t in values) or start < now-2*86400 or end > now+3*86400 or not 0 < end-start <= 36*3600 or (after is not None and not start <= after <= end):
            raise HTTPException(422, 'Choose a block window near today, up to 36 hours')
        current = runtime.snapshot()
        station, editorial = current.schedule, current.editorial
        all_blocks = block_list(station, editorial, start if after is None else after, end)
        # Pagination uses the complete airing end, so one block appears once.
        page = all_blocks[:limit]
        for block in page:
            full = block_detail(station, editorial, block['id'], now)
            block['works'] = [{k: work[k] for k in ('id', 'title', 'kind', 'start', 'end', 'duration', 'presentation') if k in work} for work in full['works']]
        scale = {'span': 10800, 'tick': 1800}
        return {'channel': station.channel, 'server_time': now, 'scale': scale, 'content_revision': editorial.revision,
                'start': start, 'end': end, 'blocks': page,
                'next_cursor': page[-1]['end'] if len(all_blocks) > limit else None}

    @app.get('/api/blocks/{key}')
    def block(key: str):
        current = runtime.snapshot()
        station, editorial = current.schedule, current.editorial
        return {'block': block_detail(station, editorial, key, clock()), 'content_revision': editorial.revision}

    @app.get('/api/block-plans/{profile}')
    def plan(profile: str):
        current = runtime.snapshot()
        station, editorial = current.schedule, current.editorial
        return {'block': planned_block(editorial, profile), 'content_revision': editorial.revision}

    @app.get('/api/collections')
    def collections():
        current = runtime.snapshot()
        station, editorial = current.schedule, current.editorial
        return {'collections': [{'id': key, 'title': value['title'], 'description': value.get('description', ''),
                                 'block_count': len(value['blocks'])} for key, value in editorial.collections.items()],
                'content_revision': editorial.revision}

    @app.get('/api/collections/{key}')
    def collection(key: str):
        current = runtime.snapshot()
        station, editorial = current.schedule, current.editorial
        return {'collection': collection_detail(station, editorial, key, clock()), 'content_revision': editorial.revision}
