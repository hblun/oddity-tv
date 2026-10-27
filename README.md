# Oddity Television

A small, self-hosted British-flavoured television demonstration: one deliberately programmed channel, programmes already in progress, adverts, idents and peculiar interruptions. It runs from a common clock rather than a continuously encoding live stream.

It reuses Channel Two's native video transport sequence and JellyfinTV's metadata-query and mid-roll planning code under the operator's confirmed permissive licences. Original sources, changes and attribution are recorded in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

This is a working implementation to validate locally, **not a deployed public station**. The supplied media is original synthetic video with quiet test tones, clearly labelled as demonstration material. No real Jellyfin server or historic archive was connected in this workspace.

## Start the demonstration

Requires Docker Engine and the Compose plugin. Run from this directory on your host:

From a fresh checkout, generate the sample media and broadcast schedule first. The repository contains source and example configuration; it excludes personal settings and media:

```sh
mkdir -p config media imports
cp .env.example .env
docker compose --profile tools run --rm tools demo
docker compose --profile tools run --rm tools validate
docker compose up -d --build station
```

Open **http://localhost:8000**, press **Tune in**, then enable sound if wanted. Open a second browser/device and tune in later: it should join the same clip at approximately the same position. Use a LAN bind address in `.env` for another physical device; restart Compose after changing it. Keep loopback when using a reverse proxy on the same host.

The demo loops every two minutes on even UTC minute boundaries. It contains an ident, a short programme, an advert, a public-information parody, a trailer, a feature excerpt, an advert break, the resumed feature, continuity and a short oddity filling the remaining gap. Restarting the server preserves the clock position. Demo generation refuses to overwrite an existing catalogue or schedule.

The public image has no FFmpeg. The tools profile has FFmpeg for one-time generation/preparation and can be stopped afterwards. On Linux with a different numeric user/group, set `OPERATOR_UID` and `OPERATOR_GID` in `.env` to the output of `id -u` and `id -g`; ensure `config` and `media` are writable by that user. Images and dependencies download on the first build. If using the separately supplied prepared demo archive, the media/configuration is already generated: start with `docker compose up -d --build station`.

### Without Docker

Use Python 3.12, FFmpeg/ffprobe with libx264 and drawtext, and DejaVu Sans fonts:

```sh
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python -m station.cli demo
python -m station.cli validate
uvicorn station.app:app --host 127.0.0.1 --port 8000 --no-access-log --no-server-header
```

## Bring in Jellyfin programmes

Set `JELLYFIN_URL` and a dedicated API key in the private `.env` on a machine that can reach Jellyfin. The key is passed only to the short-lived tools container. The station receives neither setting. Do not commit `.env`.

```sh
# Discover all playable movies, episodes and videos; paginated automatically.
docker compose --profile tools run --rm tools discover
# Restrict to a Jellyfin library, collection or series ID and optional metadata.
docker compose --profile tools run --rm tools discover --parent COLLECTION_ID --genre Documentary --tag british
# Reused JellyfinTV filters also support repeated years, studios and ratings.
docker compose --profile tools run --rm tools discover --year 1975 --year 1976 --studio BBC --rating PG
# Prefetch one item and encode it once to browser-compatible H.264/AAC.
docker compose --profile tools run --rm tools import-jellyfin JELLYFIN_ITEM_ID --id evening-film --title "The Evening Film"
```

The importer downloads the original using Jellyfin's static video endpoint, without requesting a Jellyfin transcode. It then prepares an MP4 in `media/` and records its **measured output duration** in `config/catalog.json`. With an already compatible H.264/yuv420p and AAC source, append `--copy` to remux without video encoding. Incompatible streams are refused in copy mode. Keys go in request headers, redirects are refused, and errors do not echo upstream URLs.

Embedded text subtitles are extracted automatically to WebVTT. The Jellyfin importer also prefetches external text subtitles for the selected media source through authenticated server-side calls. Viewer caption requests go only to the station cache. This adds text conversion, not live video encoding. Bitmap subtitles such as PGS/DVD need OCR or a supplied SRT/WebVTT sidecar; they are reported and skipped. The live Jellyfin subtitle endpoints still need verification against your server.

`JELLYFIN_URL` may include the server's configured base path. HTTP is suitable only over a trusted private network or tunnel; use HTTPS otherwise. No original library files are changed. The CLI currently requires operator selection; it does not choose the next series episode or shuffle a collection automatically.

### Local programmes, adverts and archive media

Put licensed/local source files in `imports/`, which is mounted read-only into the tools container. Use a fresh asset ID for every version:

```sh
docker compose --profile tools run --rm tools add /imports/advert.mov --id tea-ad-01 --title "A Proper Cup" --kind advert --provenance "Source URL; permission or licence; acquisition date"
docker compose --profile tools run --rm tools add /imports/ident.mp4 --id ident-02 --title "The Evening Service" --kind ident --copy --provenance "Original station artwork"
```

Kinds include `programme`, `advert`, `ident`, `trailer`, `archive`, `public-information` and `interstitial`. Source and rights notes stay in the private catalogue. British Pathé, BFI and British Council material is not automatically cleared for internet rebroadcast; record the permission for each asset. No archive scraping/downloading is performed automatically.

### Supply subtitles

Add a subtitle sidecar to an existing prepared programme without re-encoding its video:

```sh
docker compose --profile tools run --rm --build tools add-subtitles /imports/film.en.srt --id evening-film --language en --label "English"
docker compose restart station
```

Use SRT, WebVTT, ASS/SSA or another text format supported by FFmpeg. Repeat the command for other languages or SDH tracks. For a new local import, `add` also accepts repeated `--subtitle /imports/file.srt` arguments and `--subtitle-language en`. Subtitles follow the original source timeline: a resumed programme excerpt retains its original cue times across advert breaks. Track labels/languages and opaque URLs are public; source paths remain private. Keep the generated `.vtt` files alongside the prepared MP4s when copying the broadcast cache to another host.

New demos include original descriptive captions for the synthetic test tones. To add them to an existing demo, without regenerating video:

```sh
docker compose --profile tools run --rm --build tools demo-subtitles
docker compose restart station
```

This only touches assets marked as the original synthetic demo. It does not generate speech transcripts, translate subtitles or invent subtitles for real programmes. Previously imported assets whose subtitles were stripped need a supplied sidecar or a fresh import from the original source with a new asset ID.

## Oddity Studio: content and scheduling

The lightweight local editor runs on **SQLite**. It manages programme records, block running orders, weekly/repeating slots, collections, media readiness and simple fill rules. Its visual schedule shows gaps and overlaps, supports timed drag-and-drop placement, and opens a block chooser from a gap. Drafts and saved revisions remain separate from published content. No user accounts are required.

```sh
.venv/bin/uvicorn station.studio:app --host 127.0.0.1 --port 8001 --no-access-log --no-server-header --no-proxy-headers
```

Open **http://127.0.0.1:8001/**. First use imports the existing configuration into `config/studio.sqlite3`. Save draft, then Publish to update the running station and EPG without a restart. The public player stays on port 8000 and has no editor endpoints. [Studio instructions and data model](docs/STUDIO.md) cover media matching, publishing and recovery.

## Programme the channel with configuration files

These are the bootstrap and CLI workflows. Once Studio has published, its `published.json` snapshot takes precedence; make subsequent editorial and scheduling changes in Studio and republish.

Edit `config/schedule.json`, using the asset IDs in `config/catalog.json`. An item plays its full measured duration unless `in` and/or `duration` selects an excerpt. An advert inserted between two excerpts pauses the **programme timeline** for all viewers together:

```json
[
  {"asset": "evening-film", "in": 0, "duration": 1800},
  {"asset": "tea-ad-01"},
  {"asset": "evening-film", "in": 1800}
]
```

The adapted JellyfinTV mid-roll planner also accepts a rule such as `{"asset":"evening-film","break_every":1800,"ads":["tea-ad-01"]}`. It splits the programme into source excerpts and inserts the listed adverts between them. Advert time is additional; fixed blocks must allow for it. The demo uses this rule with a 20-second interval.

The complete example at [config/weekly.example.json](config/weekly.example.json) uses the generated demo assets. Copy it to `config/schedule.json` to try fixed daily 19:00 blocks and Saturday 19:30 cinema. `days` uses Monday=0 through Sunday=6. `at` is `HH:MM:SS` in `Europe/London`, so evening broadcasts follow BST/GMT changes. Slots in a missing or ambiguous DST hour are rejected; choose a safe hour. Blocks can cross midnight but must last no more than 24 hours. Overlapping blocks fail validation rather than silently cutting programmes.

The alternate `cycle` mode repeats blocks at offsets from an explicit timezone-aware `origin`, with `period_seconds` defining the cycle. It is useful for the short demo or a deliberately repeating daily/weekly UTC service.

Between blocks, the `filler` IDs play in their listed order. Filler phase is anchored to the preceding block end, so joining/restarting does not reshuffle it. The final filler is cut at the next fixed start. Use short filler if abrupt endings are undesirable. Filler currently has no metadata or time-of-day selection rules.

After any change:

```sh
docker compose --profile tools run --rm tools validate
docker compose restart station
```

Without a Studio publication, the server loads schedule and media snapshots at startup and editorial JSON/Markdown hot reloads separately. Studio publications replace all three together without restarting. There are no public write/admin endpoints. Replacing the schedule is the manual override mechanism in this slice. Changes reach viewers on the next guide refresh, normally within ten seconds. For special dated broadcasts, supply a dedicated cycle configuration with the intended origin; a full exceptions/calendar editor is deferred.

## Delivery and synchronisation

### Programming identities and descriptions

**Studio stores published editorial content in SQLite.** Its Publish action updates the live player and EPG together. For the original configuration-file workflow, editorial changes live in **`config/content.json`**, with longer descriptions in **`config/descriptions/*.md`**. Save valid copy, tag, palette or placeholder-artwork edits and the player/guide pick them up on the next metadata poll, normally within ten seconds. A failed save keeps the last valid content. The catalogue still supplies cached Jellyfin metadata and media details; the schedule supplies broadcast order and timings. Changes to those two underlying files still require validation and a station restart. [The programming guide](docs/PROGRAMMING.md#live-editorial-content-json-and-markdown) documents fields, examples and precedence.

Give recurring slots a reusable identity such as **Saturday Morning Cartoons** or **Past Watershed Strangeness**. Named block profiles carry a title, introduction and tags through programmes, adverts and resumptions. Viewers see the block label with now/next and its introduction in the guide. Programme descriptions and episode/year details come from cached Jellyfin metadata, with private refresh and admin overrides; local/archive assets support the same editorial fields. See [the programming guide](docs/PROGRAMMING.md) for configuration, import, refresh and override commands.

### The programme guide

The stream fills the screen. **Guide** opens a floating programme card without stopping playback; close it with ×, Escape or a tap outside. **G** opens the guide from the picture. The guide has a fixed channel column, horizontal time ruler, duration-proportional programme cells and selected-programme details. There is no site masthead or footer.

The player has five main controls: play/pause, sound, Guide, Settings and full screen. Settings holds volume, subtitle track/size, picture framing, rejoin live, programme information and picture-in-picture. Controls fade after inactivity and return on movement, a picture tap or keyboard focus. C still toggles available subtitles from the picture. The now/next overlay retains strand identity and programme progress.

The guide has **two aligned timeline layers**: programming blocks above and their individual programmes/works below. Collection names and shared colour labels sit above numbered blocks. Select a block to read its premise and complete ordered contents; select a work to expand its details in place. The list includes the whole block, even when the visible timetable covers only part of it. An interrupted film stays one authored work, with its break and continuation shown as segments. The now/next strand label also opens block exploration.

Collections are optional context through a text link and the Collections button; they have no third timeline lane. The supplied **he's turned the weans against you** treatment is included as a programme collection: three three-hour blocks and 30 works, using relative 00:00–09:00 programme time. Its unscheduled blocks use relative times and have no play action or live playhead. The existing synthetic demo remains the actual broadcast. Back to live guide restores the scheduled view. Reading another block never retunes the picture.

Bricolage Grotesque headings, Instrument Serif signatures, monospaced facts, changing transmission colours, real monochrome archive photographs and translucent panels preserve the graphic style. Local fonts avoid external requests. Archive source credits remain visible. A first-picture aperture and brief information wipe settle completely and respect reduced motion; the header clock and timetable marker follow real broadcast time. Reduced transparency receives solid panels. [The design system](docs/DESIGN_SYSTEM.md) records the rules, with sources in [design references](docs/DESIGN_REFERENCES.md).

**Today** opens near the current transmission. **Tomorrow** opens at the next British midnight. Earlier/later arrows move through time windows; **Now** returns to the current transmission. Selection changes the programme information while playback continues. Left/right arrow keys move between cells. Watch live closes the guide and joins the current broadcast.

The guide defaults to a three-hour window with half-hour divisions. **Full day** shows the selected British calendar day. Collection pages use relative time and initially focus on the selected block's three-hour window. The running order uses numbered programme panels, larger feature entries and proportionate duration bars. These display choices retain actual durations. The mobile timetable pans horizontally while the lane labels stay fixed.

All dates use `Europe/London`, including clock-change days. A live playhead and on-air status follow the shared clock. The default view follows live until you select or scroll through programmes. **Now** restores following; day/time browsing holds the chosen window. **G** opens the card and focuses the timeline. Closing restores focus to the opening control. **L** rejoins the live stream. A failed guide refresh keeps the previous cells visible and leaves playback running.

`GET /api/guide` remains available to integrations with up to 60 entries per page (maximum 100), plus `next_cursor`. Pass the returned `start`/`end` with `after=next_cursor` for the next page. Optional `q` searches titles/blocks and `programmes_only=true` filters before pagination. The compact wrapper requests just its displayed time window, including all transmissions. `GET /guide.xml` continues to provide the full XMLTV export.

`GET /api/channel?hours=6` gives now and upcoming entries (maximum 24 hours). `GET /guide.xml` supplies the next 24 hours as XMLTV. `python -m station.cli export guide.json` exports advance JSON. The same schedule drives all outputs. There is **no IPTV stream or M3U/HLS endpoint yet**; this release takes the permitted browser-player route.

The browser estimates server time from the response and half of the round-trip time, then advances a monotonic clock. It seeks to `source_in + (server time − event start)`, changes clips at boundaries and corrects drift above 1.25 seconds. Smaller differences receive a gentle playback-rate correction. Target: roughly 1–2 seconds between viewers on a stable connection, not frame-accurate broadcast synchronisation. Buffering, long keyframe intervals in copied sources and slow networks can increase the difference. Encoding once inserts two-second keyframes for practical seeking.

The browser waits for a tune-in click and starts muted on a new device. It rejoins after visibility/network changes and retries failed media while playing. A cached 15-minute guide lets transitions continue during a short guide outage. An unavailable programme produces a retry message; this slice has no automatic emergency-media substitution. It requires an H.264-capable modern browser. One imminent clip is prepared in a second, paused video element within ten seconds of a boundary; data saver/2G skip this. A ready clip can replace the picture at the shared-clock boundary. The existing loading path remains the fallback, including PiP/native fullscreen and unmuted Apple browsers. Loading gaps can still occur; this is not a promise of gapless playout.

### Television controls

The receiver has **play/pause**, mute/volume, **CC**, programme information, picture-in-picture where available, and full screen. Full screen includes the remote and settings on browsers supporting element fullscreen; Safari's native video fullscreen uses the browser's own controls. The picture menu offers fitted video, 4:3 and 16:9 frames, optional edge cropping and larger subtitles. The source picture is not styled or filtered by the station interface.

Pause freezes only your screen, including through scheduled programme changes. The station and guide continue. **Play** rejoins the current shared broadcast position; this is not a DVR that resumes from the paused point. The paused overlay makes that behaviour explicit. There is no scrub/seek bar into future programmes. Native/PiP pause controls follow the same rule where the browser exposes them.

Subtitles use native WebVTT tracks, with a language/track selector and normal/large sizes. CC is disabled when a transmission has no supplied tracks, and the language preference returns on the next programme that supports it. PiP subtitle display varies by browser. Volume, caption language/size and picture framing preferences stay in local browser storage; no viewing history or preferences are sent to the server. Blocked local storage is supported.

Keyboard controls: **Space/K** play or pause, **M** mute, **C** subtitles, **F** full screen, **I** programme information, **G** guide timeline, **L** live. Shortcuts yield to inputs, buttons, menus and programme listings. The current title appears with the controls; programme information opens from Settings or **I**.

## Put it on the internet without exposing home Jellyfin

Recommended topology:

```text
Private operator machine                       Separate public VPS/cache host
Jellyfin → private CLI → prepared MP4s/config → copy → read-only station → HTTPS viewers
```

Run discovery and preparation privately, then copy **only** `media/`, `config/catalog.json` and `config/schedule.json` to the public host. Keep source notes free of personal details. Do not copy `.env`, Jellyfin credentials, source mounts or private library exports. Do not run the tools profile on the public host. The runtime has no Jellyfin proxy, redirects, remote media URLs or arbitrary-path endpoint. Only assets referenced by the schedule/filler are served, via opaque IDs. All frontend requests are same-origin; there are no trackers, external fonts or peer connections.

Use the example [Caddyfile](docs/Caddyfile.example) for HTTPS with a domain pointing to the VPS. Keep port 8000 bound to loopback; expose only Caddy's 80/443 through the host/provider firewall. Use normal SSH/key controls for the host. Public requests terminate at the VPS, so viewers receive its IP rather than your home address. A domain with registration privacy avoids publishing operator contact details. Hosting this directly at home does **not** hide the home IP: a separate origin or relay is required. Viewers connect independently and do not learn one another's IP addresses. Access logging is disabled by default in the supplied configuration; hosting providers still see traffic.

This is a public broadcast: scheduled MP4s are retrievable by URL. If the intended audience is private, add authentication at the reverse proxy. The app does not administer accounts.

## Cost and hardware

At viewing time, CPU work is ordinary HTTP file serving and small schedule calculations. Preparation may be CPU intensive, but happens once on the operator machine. Native MP4 playback suits a Pi 4/5, home server or small VPS; hardware limits and browser behaviour still need measurement on your chosen host. The default Docker Python image is multi-architecture; this project has not run an ARM build here.

Bandwidth is the main ongoing cost. At 1.5 Mbit/s, each viewer consumes about **0.675 GB/hour**; ten simultaneous viewers consume about 6.75 GB/hour. Storage and bandwidth allowances determine whether an existing machine or free allocation is enough. A private home origin plus an internet relay is not guaranteed to be free, and a VPS has its own costs. There is no peer-to-peer bandwidth sharing or permanent free-hosting dependency.

## Verification

With the generated demo present:

```sh
python -m station.cli validate
python -m unittest discover -s tests -v
npm ci
npm test
```

The DOM flow tests use jsdom as a development-only dependency; use Node.js 26+ for these checks. The public Python station has no Node.js dependency.

Tests cover contiguous schedules, midway joins, advert/resume boundaries, filler phase, restart stability, British DST evening slots, invalid schedules, path traversal, HTTP ranges/HEAD, two independent HTTP clients, public-data isolation and mock Jellyfin pagination/prefetch/redirect rejection. JavaScript tests cover two independent clock anchors and cached-guide transitions.

For the actual browser acceptance test, install Playwright in a development environment with Chromium and run the server first:

```sh
pip install playwright
python -m playwright install chromium
python scripts/browser_acceptance.py --url http://127.0.0.1:8000
python scripts/epg_acceptance.py --url http://127.0.0.1:8000
python scripts/tv_acceptance.py --url http://127.0.0.1:8000
```

That test tunes in two independent browser contexts at different times, checks rendered video position, waits across at least two automatic programme changes and checks for private requests. It takes up to 65 seconds against the supplied demo. It is intended for this short demo schedule, before substituting feature-length media.

Workspace verification results and remaining acceptance work are in [docs/VERIFICATION.md](docs/VERIFICATION.md). Candidate research and architecture tradeoffs are in [docs/DECISIONS.md](docs/DECISIONS.md).

## Scope after this slice

Before building more custom scheduling functionality, reconsider Tunarr. The most useful next steps are an actual Jellyfin import, two-device playback on the intended hardware, then a shared pre-segmented HLS output and optional scheduling UI. Series sequencing, random/metadata rules, automatic archive acquisition, multiple channels, bitmap-subtitle OCR, DVR time-shifting and automatic failure slates are not implemented.
