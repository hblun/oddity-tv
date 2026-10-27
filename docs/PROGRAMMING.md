# Content authoring

Use [Oddity Studio](STUDIO.md) for the current SQLite workflow. Programmes are reusable records; blocks own ordered rundown items; schedule slots place blocks in time. Draft saves and publication are separate. Once `published.json` exists it takes precedence over the configuration files described below. The public guide has two timeline lanes and carries no internal editorial notes or development labels.

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

Viewers see the block name with the now/next overlay. In the guide, the selected programme shows its synopsis and transmission time. Programme notes reveals the block name and introduction, episode/film details and up to five tags/genres. A long synopsis can be expanded. Browsing another programme updates this context without changing playback. The ordinary picture stays free of descriptions and tag lists. On phones, Short clips expands larger buttons below the timeline when useful.

## Live editorial content: JSON and Markdown

Use `config/content.json` for copy and presentation changes while the station runs. It overlays the media catalogue and schedule, without changing their timing, media paths or subtitle tracks. The bundled file uses the existing demonstration copy, now also held in `config/descriptions/*.md`.

```json
{
  "defaults": {
    "programme": {"theme": "cobalt", "artwork": "moon-walking"},
    "advert": {"theme": "coral", "artwork": "radio-hat"},
    "ident": {"theme": "citrus", "artwork": "moon-walking"}
  },
  "programmes": {
    "feature": {
      "title": "The Night Shift",
      "description_file": "descriptions/feature.md",
      "tags": ["Cult cinema", "British"],
      "theme": "nocturne",
      "artwork": "moon-walking"
    }
  },
  "strands": {
    "after-hours": {
      "description_file": "descriptions/strand-after-hours.md"
    }
  }
}
```

This is a complete small editorial overlay, independent of `schedule.json`. Programme keys are catalogue asset IDs; strand keys are schedule profile IDs. Unmentioned assets and fields retain their existing catalogue/source values. Programme overrides accept `title`, `description` or `description_file`, `tags`, `genres`, `series`, `season`, `episode`, `year`, `theme` and `artwork`. Strand overrides accept title, description/description_file, tags, theme and artwork. Use an explicit empty description or empty tag list to clear it. Tags from the resolved strand are then added to programme tags.

Write `config/descriptions/feature.md` as UTF-8 prose, for example:

```markdown
An excursion into the **slightly peculiar**. Demonstration feature
```

Markdown here is a restricted prose format. Heading, list, emphasis and inline-link notation is reduced to safe plain text for the guide and XMLTV; HTML is never rendered. A description may instead be an inline JSON string. Choose one of `description` and `description_file`. Markdown files must stay inside `config/descriptions/`, including when symlinks are used. Public APIs expose the resolved copy, never the Markdown path or private catalogue/source fields. The original Markdown and JSON files have no public download route.

**Save and keep watching.** The server checks the editorial file and referenced Markdown files on metadata requests. The player polls every ten seconds and refreshes the guide when the content revision changes, including a manually selected programme. Valid changes normally appear within ten seconds plus request time. There is no page reload, server restart, schedule reset or video encoding for these edits. A partial/invalid save retains the last valid content and logs a warning. Save a corrected file to publish it. Use atomic file saves when available. `python -m station.cli validate` also checks the editorial JSON and its Markdown references; CLI exports, API search and XMLTV use the same resolved copy.

Available themes are `cobalt`, `coral`, `citrus` and `nocturne`. Available artwork IDs are the two curated archive placeholders, `moon-walking` and `radio-hat`, each retaining its factual credit and source link. New archive files still need an explicit application route and source record. The presentation priority is programme override, explicit strand override, then defaults for that clip kind. Leave a strand's theme unset for the changing colours between programmes, adverts and idents. A film retains its colour on resumption because its override is keyed to the asset, rather than the transmission ID. Selection and live-status colours retain their common meaning.

The remaining files have separate jobs:

| File | Purpose | Publication |
| --- | --- | --- |
| `content.json` and `descriptions/*.md` | Live copy, tags, display metadata, palette and placeholder artwork choices | Automatic on metadata refresh |
| `catalog.json` | Prepared media, durations, subtitles, cached Jellyfin metadata and fallback copy | Validate and restart after changes |
| `schedule.json` | Programme order, times, breaks, reusable strand definitions | Validate and restart after changes |

The existing CLI metadata commands below still edit the catalogue. Use the live editorial file for changes that should appear without a restart. To return a field to the catalogue/Jellyfin fallback, remove that field or its `description_file` from the editorial entry. To use freshly synced source descriptions, remove the editorial description override as well as any catalogue override. The public station remains read-only; editing happens in local files or on the private tools host.

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

Catalogue and schedule configuration loads at startup; the editorial JSON/Markdown layer reloads separately as described above. Public JSON and XMLTV exports use the same resolved synopsis, episode details and tags. Guide search also matches descriptions, series, genres and tags. This release uses private CLI/config administration; it does not add a public administration endpoint or a web editor.

## Playback and mobile behaviour

The overlay shows current title, source progress, block name, and the immediately following transmission and time. A resumed film's progress includes its earlier sections. When locally paused, the displayed progress stays with the paused picture; Play still rejoins the shared live schedule.

The player prepares one next clip within ten seconds of a transition using a paused, hidden video element. If ready, it swaps into view and seeks using the shared clock, retaining volume and subtitle preferences. If not ready, it uses the existing single-element loading path. PiP, native video fullscreen and unmuted Apple browsers keep the active element and use that fallback. This reduces loading gaps but does not promise gapless playout. Preloading is skipped with browser data saver or a reported 2G connection. Browser buffering policy determines how much of the next file is cached; there is no continuous server transcoding.

On mobile, the guide is a bottom card. Drag its handle downward to dismiss it, or use ×, Escape or the area outside. The timeline remains horizontally scrollable, and the short-clip buttons avoid tiny advert/ident targets. Reduced-motion settings disable animated entrances and transitions.

## Block and programme timeline layers

The EPG now has exactly two aligned lanes: **Blocks** and **Programmes**. Both use the same horizontal time axis. A block opens its complete running order; a programme in the lower lane selects its parent block and expands that work. Collections provide optional context and navigation, with no extra timeline lane. The selected block/work and expanded details are held while the live clock advances. Now explicitly returns to live.

Scheduled work times come from the compiled schedule. A block’s actual airing identity combines its start with its profile, so repeated editions remain distinct. The server returns the whole airing independently of the visible EPG window. A single authored item split by inserted adverts remains one work, with ordered playback segments. Named advert packages keep their own authored entries. Continuity gaps share an interval; their view shows bounded current/next transmissions rather than pretending that a long repeating gap is an authored festival.

### Optional collections and editorial previews

`content.json` accepts an additional `collections` object. Collections name an ordered list of strand IDs. Each listed strand must have an editorial definition. An optional `lineup` makes an unscheduled strand readable as a preview:

```json
{
  "collections": {
    "family": {
      "title": "A family programme",
      "description_file": "descriptions/family.md",
      "notes_file": "descriptions/family-notes.md",
      "blocks": ["family-one", "family-two"]
    }
  },
  "strands": {
    "family-one": {
      "title": "The first block",
      "premise": "A short editorial premise",
      "description_file": "descriptions/family-one.md",
      "notes_file": "descriptions/family-one-notes.md",
      "theme": "coral",
      "lineup": [
        {"title": "Opening", "kind": "ident", "duration": 120},
        {"title": "A film", "kind": "programme", "year": 1999, "duration": 10680, "description": "The work’s editorial introduction."}
      ]
    },
    "family-two": {"title": "The second block", "description": "Another block."}
  }
}
```

This fragment illustrates the schema; the bundled `weans` collection has three complete 180-minute lineups. Durations are seconds. Work IDs and offsets are derived in order. Preview work fields are title, kind, year, duration, description and optional content_information. Strand fields also accept premise, notes/notes_file and content_information. Collection fields are title, description/description_file, notes/notes_file and ordered blocks. Notes preserve safe paragraph breaks and are limited to 12,000 characters. All referenced Markdown remains under config/descriptions.

A preview is labelled **Editorial preview · unscheduled**. Its two timeline lanes use relative programme time; the running list labels offsets within the selected block. A nine-hour collection can show all three blocks and all 30 work spans without inventing broadcast dates. Previews carry no media URL and no play action. Adding a lineup does not import any video or alter the station schedule. When a block profile is genuinely scheduled, its airing and measured media timings supply the public broadcast view. Draft allocations never override those timings.

The complete supplied treatment is included under strand IDs `weans-01`, `weans-02` and `weans-03`. Its programme names, sequence and allocated durations are retained from the attachment. The source’s narrative notes are separated into Markdown; production/clearance notes have not been presented as programme availability. The archive photographs remain labelled illustrative references.

### Read-only block APIs

- `GET /api/blocks?start=...&end=...`: occurrence summaries and programme spans for the two timeline lanes; bounded pagination and a suggested display scale.
- `GET /api/blocks/{airing-id}`: the complete scheduled running order, including grouped breaks/resumptions.
- `GET /api/collections`: collection summaries.
- `GET /api/collections/{id}`: ordered blocks and airings in the current guide horizon.
- `GET /api/block-plans/{profile-id}`: an unscheduled preview and its relative two-layer timeline.

All use the same validated live editorial snapshot as channel metadata, including revision hashes. Private filenames, Markdown paths and Jellyfin fields remain excluded. Published video transport is unchanged.
