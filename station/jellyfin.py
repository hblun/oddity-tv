"""Operator-only Jellyfin discovery and prefetch; never imported by app.py."""
import os
from urllib.parse import quote, urlparse
import httpx
from .jellyfintv import search_params


class Jellyfin:
    def __init__(self, url=None, token=None, transport=None):
        url = url or os.environ["JELLYFIN_URL"]
        token = token or os.environ["JELLYFIN_API_KEY"]
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError("JELLYFIN_URL must be an HTTP(S) server URL without credentials")
        if parsed.query or parsed.fragment:
            raise ValueError("JELLYFIN_URL must not contain a query or fragment")
        # Authentication is a header, never a logged URL. Redirects are refused.
        self.client = httpx.Client(base_url=url.rstrip("/") + "/", headers={"X-Emby-Token": token},
                                   follow_redirects=False, timeout=httpx.Timeout(120, connect=15), transport=transport)

    def close(self):
        self.client.close()

    def items(self, parent=None, genre=None, tag=None, years=None, studios=None, ratings=None):
        offset = 0
        while True:
            params = search_params({"genres": [genre] if genre else [], "tags": [tag] if tag else [],
                                    "years": years or [], "studios": studios or [], "ratings": ratings or []})
            params.update({"StartIndex": offset, "Limit": 100, "SortBy": "SortName", "SortOrder": "Ascending"})
            if parent:
                params["ParentId"] = parent
            response = self.client.get("Items", params=params)
            response.raise_for_status()
            data = response.json()
            batch = data.get("Items", [])
            for item in batch:
                # Explicitly select metadata; do not persist private paths or URLs.
                yield {"id": item["Id"], "title": item["Name"], "type": item.get("Type"),
                       "duration": item.get("RunTimeTicks", 0) / 10_000_000,
                       "series": item.get("SeriesName"), "season": item.get("ParentIndexNumber"),
                       "episode": item.get("IndexNumber"), "genres": item.get("Genres", []), "tags": item.get("Tags", [])}
            offset += len(batch)
            if not batch or offset >= data.get("TotalRecordCount", offset):
                break

    def download(self, item_id, destination):
        with self.client.stream("GET", f"Videos/{quote(item_id, safe='')}/stream", params={"Static": "true"}) as response:
            response.raise_for_status()
            with open(destination, "wb") as output:
                for chunk in response.iter_bytes(1024 * 1024):
                    output.write(chunk)
