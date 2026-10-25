"""Small public metadata allowlist shared by private imports and guide output."""
from html.parser import HTMLParser
import re


class PlainText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.skip += 1
        elif tag in ('p', 'br', 'div', 'li'):
            self.parts.append(' ')

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.skip = max(0, self.skip - 1)
        elif tag in ('p', 'div', 'li'):
            self.parts.append(' ')

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def text(value, limit=4000):
    if not isinstance(value, str):
        return ''
    parser = PlainText()
    parser.feed(value)
    return re.sub(r'\s+', ' ', ''.join(parser.parts)).strip()[:limit]


def tags(value):
    if not isinstance(value, list):
        return []
    result, seen = [], set()
    for raw in value:
        tag = text(raw, 48)
        if tag and tag.casefold() not in seen:
            result.append(tag)
            seen.add(tag.casefold())
        if len(result) == 24:
            break
    return result


def public_metadata(asset):
    # Explicit asset values override source metadata, including empty values.
    source = asset.get('source_metadata', {})
    if not isinstance(source, dict):
        source = {}
    merged = {**source, **asset}
    result = {key: text(merged.get(key), 4000 if key == 'description' else 200)
              for key in ('description', 'series')}
    result.update({key: tags(merged.get(key, [])) for key in ('tags', 'genres')})
    for key in ('season', 'episode', 'year'):
        value = merged.get(key)
        result[key] = value if type(value) is int and 0 <= value <= 9999 else None
    return result


def jellyfin_metadata(item):
    return public_metadata({'description': item.get('Overview', ''), 'series': item.get('SeriesName', ''),
        'season': item.get('ParentIndexNumber'), 'episode': item.get('IndexNumber'),
        'year': item.get('ProductionYear'), 'genres': item.get('Genres', []), 'tags': item.get('Tags', [])})
