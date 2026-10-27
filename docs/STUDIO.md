# Oddity Studio

A small content and scheduling desk for one operator. SQLite is the authoring source. The viewer app remains a separate, read-only service.

## Run locally

Use the existing virtual environment and prepared media. Start the two services in separate terminals:

```sh
.venv/bin/uvicorn station.app:app --host 127.0.0.1 --port 8000 --no-access-log --no-server-header --no-proxy-headers
.venv/bin/uvicorn station.studio:app --host 127.0.0.1 --port 8001 --no-access-log --no-server-header --no-proxy-headers
```

Open [Studio](http://127.0.0.1:8001/) to edit and [the station](http://127.0.0.1:8000/) to watch. Both accept `STATION_CONFIG` and `STATION_MEDIA` directories. Studio runs on the operator's computer. It has no accounts or login. Loopback client and Host checks, same-origin writes and a required custom request header keep the editor separate from the public player. Do not reverse-proxy Studio onto the public site. Proxy headers are disabled so the client check uses the actual connection.

On first use Studio imports the current catalogue, schedule and resolved JSON/Markdown editorial content. Existing planned works become programme records with expected media IDs. Later edits are stored in `config/studio.sqlite3`; there is no repeated import overwriting the database.

## Everyday workflow

1. **Programmes:** create or edit a title, synopsis, type, year, tags and estimated duration. Set its expected media ID. Select prepared media to match an existing asset. An unfinished programme remains usable in a draft.
2. **Blocks:** write the block title, premise and introduction; choose its colour edition and artwork. Add programmes to its running order. Drag rows to reorder, or use the labelled up/down buttons. Edit source in-points, excerpt duration and advert-break rules within a row. The same programme record can occur in several blocks.
3. **Schedule:** use the visual cycle/weekly board to place blocks. Hatched regions show gaps that run continuity; red regions show overlaps. Click a gap to choose a block that fits. Drag a block from the shelf onto a time, or drag a scheduled block to move it. Weekly placement snaps to five minutes; exact starts remain editable in the slot form. Moving one occurrence of a repeated weekly slot keeps its other days intact. Place blocks in repeating-cycle or weekly slots. Drag a library block into the schedule, or use `+ Schedule`, then set its start. Weekly days and UK wall-clock time follow the existing Europe/London scheduler. Cycle offsets and origin retain deterministic repeat timing. Choose continuity programme IDs for the space between blocks.
4. **Collections:** group and order related blocks, and choose their shared colour. The block library nests blocks under their collection. A block editor links to its parent collection and shows a clickable, proportional programme sequence; programme records link back to the blocks that use them. Collection cards show miniature rundowns and open the block editor. A collection supplies reading context without adding another EPG timeline layer.
5. **Save draft:** store the whole edit in one SQLite transaction. Saving has no effect on viewers. **Publish:** validate and activate the saved revision. The button saves outstanding local changes first.

A programme's expected media ID pairs with `config/catalog.json`. Prepare/import media with that same ID using the existing CLI, then the idle Studio rechecks it within 15 seconds; Reload checks immediately. Measured duration replaces the estimate when calculating the running order. Matching uses the stable ID, with no filename guessing. A missing scheduled file prevents publication; unfinished programmes can stay in unscheduled blocks and saved drafts. The importer still handles actual media preparation. Studio does not upload or transcode video.

### Fill rules

`Fill to a target duration` adds a draft tail using prepared media of a chosen type and optional tag. It counts programme excerpts and inserted adverts, chooses the longest matching piece that fits, repeats when needed, and trims the last continuity piece to the remaining time. Automatic trimming is restricted to idents, interstitials, adverts and trailers. Film programmes are excluded. The resulting items are ordinary editable rundown rows. No random selection runs independently in viewers.

## Data structure

SQLite contains these tables:

| Table | Purpose |
| --- | --- |
| `programmes` | Stable record ID, expected media ID, editorial metadata and estimated duration |
| `blocks` | Reusable block identity and presentation |
| `rundown` | Block ID, ordered position, programme foreign key, excerpt and advert rules |
| `collections` / `collection_blocks` | Optional ordered groups of blocks |
| `settings` | Schedule pattern, fixed slots, continuity choices and presentation defaults |
| `revisions` | Last 30 saved authoring documents |
| `publications` | Last 10 validated publication bundles and their draft revision |

Foreign keys protect the principal relationships. Advert references, continuity IDs, slot profiles and collection membership are validated before save. Stale draft revisions return HTTP 409, preserving the other edit. Programme and block metadata are stored as small JSON records inside SQLite so adding an editorial field does not require a separate column migration. Rundown ordering and primary relationships have their own tables.

The read/write API is available **only on the Studio service**:

- `GET /api/studio`: current draft, revision, readiness, prepared assets and publishing checks.
- `PUT /api/studio`: save `{document, revision}`.
- `POST /api/publish`: activate `{revision}`.
- `POST /api/restore`: recover `{history_id, revision}` as a new draft.
- `POST /api/fill`: propose a new rundown in a supplied document; saving remains explicit.

The viewer service has none of these routes. Its EPG endpoints remain read-only.

## Publication

Publishing compiles the saved document into a single `config/published.json` bundle containing schedule, delivery catalogue and clean editorial content. A temporary file is flushed and atomically replaced. The player, block guide and XMLTV read the same coherent snapshot. A changed bundle is validated and loaded without restarting the viewer service; existing ten-second browser polls pick up the new revision. An invalid replacement retains the last valid runtime.

Programme descriptions and timing come from the same records. Published blocks contain their full running order. Unscheduled collections use relative programme time and have no live playback action. Development labels, internal notes, advisory panels and explanatory archive captions are absent from the viewer interface. Archive source links remain as credits. Private catalogue provenance and source metadata are excluded from the compiled delivery catalogue.

Once a publication exists it takes precedence over the original JSON/Markdown files. Those files remain a bootstrap and CLI import source. Update editorial content in Studio, and republish after media imports or schedule changes. Removing the publication file deliberately returns the viewer service to the original configuration; keep this as an operator recovery action. Reusing an asset ID for a different video is unsupported: prepared media versions need distinct IDs so issued URLs remain stable.

To deploy on a separate public host, copy the prepared media and `published.json` into its read-only configuration directory. The public process does not need the SQLite database or Studio. For an initial deployment using only a publication, no legacy schedule/catalogue files are required. Keep the private import catalogue on the operator machine. Public configuration files are never served through a generic file endpoint.

Back up the database through SQLite's backup API, including a transaction-consistent view of WAL data:

```python
import sqlite3
with sqlite3.connect('config/studio.sqlite3') as source:
    with sqlite3.connect('oddity-studio-backup.sqlite3') as destination:
        source.backup(destination)
```

`Export JSON` downloads the current authoring document, including unsaved local edits. The Reload button becomes Discard changes while there are unsaved edits. Saved revisions can be restored as drafts from the footer; restoring does not publish. Back up prepared media and the import catalogue separately. The database, WAL files and publication are ignored by Git.

## Scheduling references and scope

Nebula provides the useful macro/micro distinction: a schedule of blocks, then a detailed rundown inside each block. Its asset model also supports records with estimated durations before files are ready. These concepts informed Oddity's SQLite model and editor. Sources: [Nebula interface](https://docs.nebulabroadcast.com/basics/interface/) and [linear scheduling](https://docs.nebulabroadcast.com/usage/linear-broadcasting/), reviewed 26 October 2026.

Oddity uses its existing schedule compiler and native browser playback. No Nebula or Dramatica source code has been copied and neither is installed as a service. Nebula's documented deployment includes PostgreSQL, Redis, server and workers; that is more infrastructure than this single-operator desk needs. See [Nebula deployment](https://docs.nebulabroadcast.com/installation/docker/). The Dramatica URL linked from Nebula's README returned 404 during this review, so no dependency or API contract is assumed.

This version covers one channel, local prepared media, estimated records, block scheduling, simple duration/type/tag fill, editorial publishing and recovery. Live ingest, device control, watch folders, arbitrary scheduling plugins, dated calendar exceptions and multi-operator permissions are outside this version. Weekly/cycle scheduling uses the existing fixed-start semantics and rejects overlaps; it has no Nebula soft-start or manual-trigger modes. Publication activates on the next metadata refresh and may change the current broadcast when its timings change. Schedule changes should be prepared for a suitable station boundary.

## Viewer hierarchy and timeline scale

The guide presents collection → numbered block → programmes. The collection title, colour label and ordinal markers stay together above the block title. The two timeline lanes remain Blocks and Programmes. Collection membership also accompanies live now/next metadata and the player block label. Longer works receive larger panels in the vertical running order; every panel retains its chronological number, time, type and duration. The small measure at its foot shows its share of the block.

The viewer defaults to a three-hour window with half-hour ticks. Full day uses the selected British calendar day, including its 23/25-hour clock-change length. Unscheduled collection pages use relative programme time, initially focused on the selected block's three-hour window; Full day shows the corresponding 24-hour relative window. Earlier/later controls pan either view. These are display scales and do not change broadcast timing.
