"""Adapted from DrewThomasson/JellyfinTV; see THIRD_PARTY_NOTICES.md.

Extracted query construction and content-chunk/mid-roll planning. Unmodified
source references are preserved in vendor/jellyfintv/.
"""


def search_params(criteria):
    """JellyfinTV.search_items query construction, without HTTP/credentials."""
    params = {
        "Recursive": "true",
        "Fields": "Overview,RunTimeTicks,ProductionYear,Genres,Tags,SeriesName,SeriesId,ParentIndexNumber,IndexNumber",
        "IncludeItemTypes": ",".join(criteria.get("item_types", ["Movie", "Episode", "Video"])),
    }
    if criteria.get("genres"):
        params["Genres"] = "|".join(criteria.get("genres"))
    if criteria.get("years"):
        params["Years"] = ",".join(str(year) for year in criteria.get("years"))
    if criteria.get("tags"):
        params["Tags"] = "|".join(criteria.get("tags"))
    if criteria.get("studios"):
        params["Studios"] = "|".join(criteria.get("studios"))
    if criteria.get("ratings"):
        params["OfficialRatings"] = "|".join(criteria.get("ratings"))
    return params


def content_chunks(item, assets):
    """Adapt JellyfinTV's mid-roll loop to explicit assets and measured durations."""
    import math
    if "break_every" not in item:
        yield item
        return
    interval_seconds = float(item["break_every"])
    if not math.isfinite(interval_seconds) or interval_seconds <= 0:
        raise ValueError("break_every must be finite and positive")
    ads = item.get("ads", [])
    if not ads:
        raise ValueError("A mid-roll rule requires an explicit ads list")
    for ad in ads:
        assets[ad]
    offset = float(item.get("in", 0))
    remaining_duration = float(item.get("duration", float(assets[item["asset"]]["duration"]) - offset))
    if not math.isfinite(remaining_duration) or remaining_duration <= 0:
        raise ValueError("Programme excerpt must have a positive finite duration")
    if not math.isfinite(offset) or offset < 0 or offset + remaining_duration > float(assets[item["asset"]]["duration"]) + .001:
        raise ValueError("Mid-roll programme excerpt exceeds source asset")
    while remaining_duration > .000001:
        chunk_duration = min(remaining_duration, interval_seconds)
        yield {"asset": item["asset"], "in": offset, "duration": chunk_duration}
        remaining_duration -= chunk_duration
        offset += chunk_duration
        if remaining_duration > .000001:
            for ad in ads:
                yield {"asset": ad}
