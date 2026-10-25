# Programming blocks, tags and descriptions

A programming block gives a run of programmes its own identity. Define it once in `config/schedule.json`, then reference it from daily/weekly slots. The existing inline `title` format still works.

```json
{
  "programming_blocks": {
    "saturday-cartoons": {
      "title": "Saturday Morning Cartoons",
      "description": "An animated start to the weekend, with a few familiar interruptions.",
      "tags": ["Animation", "Saturday morning"]
    },
    "after-hours": {
      "title": "Past Watershed Strangeness",
      "description": "Unusual films, peculiar public information and things best seen after dark.",
      "tags": ["Late night", "Oddities"]
    }
  },
  "blocks": [
    {
      "profile": "saturday-cartoons",
      "days": [5],
      "at": "08:00:00",
      "items": [
        {"asset": "ident"},
        {"asset": "cartoon-episode-01", "break_every": 600, "ads": ["advert"]},
        {"asset": "cartoon-episode-02"}
      ]
    },
    {
      "profile": "after-hours",
      "days": [4, 5],
      "at": "23:00:00",
      "items": [{"asset": "ident"}, {"asset": "strange-feature"}, {"asset": "oddity"}]
    }
  ]
}
```

This is a fragment: keep the channel, timezone, mode and filler fields from your real schedule, and replace example asset IDs with imported media. Monday is `0`, Sunday is `6`. Weekly slots use British wall-clock time. Cycle schedules use the same `profile` field with `offset` instead of `days`/`at`. See [weekly.example.json](../config/weekly.example.json) for a complete schedule using the synthetic demo assets.

The block lasts for the measured duration of its items, including adverts. Its identity, introduction and tags carry through breaks and resumed programmes. Gaps return to ordinary continuity. A slot may override `title`, `description` or `tags` from its profile. Names describe editorial intent: “past watershed” is not an age gate or an automatic content-rating rule.

Viewers see the block name with the now/next overlay. In the guide, the selected programme shows the block name and short introduction, its own synopsis, episode/film details and up to five tags/genres. A long synopsis can be expanded. Browsing another programme updates this context without changing playback. The ordinary picture stays free of descriptions and tag lists. Short clips have separate, larger buttons below the mobile timeline.

## Descriptions from Jellyfin

New `import-jellyfin` imports fetch the item's Overview, series name, season/episode numbers, production year, genres and tags. These are plain-text snapshots in the private catalogue's `source_metadata`; no Jellyfin URL or credential goes to viewers. HTML is reduced to text and metadata fields are explicitly allowlisted. Video import and one-time encoding work as before.

Refresh metadata for an existing prepared asset without downloading or encoding the film again:

```bash
docker compose run --rm tools sync-metadata --id night-shift --item-id JELLYFIN_ITEM_ID
```

The item ID is remembered privately. Later refreshes need only:

```bash
docker compose run --rm tools sync-metadata --id night-shift
```

This also attaches older imports, which did not store their Jellyfin ID. Source refresh is an operator action, not a public/browser fetch or a background connection from the delivery server. Run it from the private tools host with Jellyfin access.

## Admin descriptions and editorial tags

Add an introduction or tags at import time with `--description` and repeated `--tag` arguments on `add` or `import-jellyfin`. Edit existing assets without re-encoding:

```bash
docker compose run --rm tools metadata --id night-shift \
  --description "A night porter discovers that the last train never quite leaves." \
  --tag "Cult cinema" --tag "British"
```

For longer prose, put a UTF-8 text file in your configured import directory and use `--description-file /imports/synopsis.txt`. Admin fields take priority over source metadata and survive subsequent Jellyfin refreshes. Repeated `--tag` values replace the asset's editorial tag list; block tags are added automatically. `--description ""` explicitly suppresses a synopsis; `--tag ""` explicitly clears asset tags. Restore the source values with:

```bash
docker compose run --rm tools metadata --id night-shift \
  --use-source-description --use-source-tags
```

You may also edit `config/catalog.json` directly:

```json
{
  "title": "The Last Train",
  "description": "Your public programme introduction.",
  "tags": ["Cult cinema", "British"],
  "series": "Archive Playhouse",
  "season": 2,
  "episode": 4,
  "year": 1978
}
```

These fields belong inside the existing asset object; preserve its file, duration and captions. Omit a field to fall back to `source_metadata`; an explicit empty value suppresses it. Source-only and editorial tags remain distinct from genres. Descriptions are limited to 4,000 characters and tag lists to 24 distinct labels of up to 48 characters each.

After editing or syncing:

```bash
docker compose run --rm tools validate
docker compose restart station
```

The server loads configuration at startup. Public JSON and XMLTV exports use the same resolved synopsis, episode details and tags. Guide search also matches descriptions, series, genres and tags. This release uses private CLI/config administration; it does not add a public administration endpoint or a web editor.

## Playback and mobile behaviour

The overlay shows current title, source progress, block name, and the immediately following transmission and time. A resumed film's progress includes its earlier sections. When locally paused, the displayed progress stays with the paused picture; Play still rejoins the shared live schedule.

The player prepares one next clip within ten seconds of a transition using a paused, hidden video element. If ready, it swaps into view and seeks using the shared clock, retaining volume and subtitle preferences. If not ready, it uses the existing single-element loading path. PiP, native video fullscreen and unmuted Apple browsers keep the active element and use that fallback. This reduces loading gaps but does not promise gapless playout. Preloading is skipped with browser data saver or a reported 2G connection. Browser buffering policy determines how much of the next file is cached; there is no continuous server transcoding.

On mobile, the guide is a bottom card. Drag its handle downward to dismiss it, or use ×, Escape or the area outside. The timeline remains horizontally scrollable, and the short-clip buttons avoid tiny advert/ident targets. Reduced-motion settings disable animated entrances and transitions.
