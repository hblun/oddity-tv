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

`JELLYFIN_URL` may include the server's configured base path. HTTP is suitable only over a trusted private network or tunnel; use HTTPS otherwise. No original library files are changed. The CLI currently requires operator selection; it does not choose the next series episode or shuffle a collection automatically.

### Local programmes, adverts and archive media

Put licensed/local source files in `imports/`, which is mounted read-only into the tools container. Use a fresh asset ID for every version:

```sh
docker compose --profile tools run --rm tools add /imports/advert.mov --id tea-ad-01 --title "A Proper Cup" --kind advert --provenance "Source URL; permission or licence; acquisition date"
docker compose --profile tools run --rm tools add /imports/ident.mp4 --id ident-02 --title "The Evening Service" --kind ident --copy --provenance "Original station artwork"
```

Kinds include `programme`, `advert`, `ident`, `trailer`, `archive`, `public-information` and `interstitial`. Source and rights notes stay in the private catalogue. British Pathé, BFI and British Council material is not automatically cleared for internet rebroadcast; record the permission for each asset. No archive scraping/downloading is performed automatically.

## Programme the channel

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

The server loads a snapshot at startup; there are no public write/admin endpoints or hot reload. Replacing the schedule is the manual override mechanism in this slice. Changes reach viewers on the next guide refresh, normally within ten seconds. For special dated broadcasts, supply a dedicated cycle configuration with the intended origin; a full exceptions/calendar editor is deferred.

## Delivery and synchronisation

### The programme guide

The viewer now has a full-width Prevue-inspired programme board, drawing on the MIT-licensed [Ringmast4r-TV](https://github.com/Ringmast4r/Ringmast4r-TV) guide. The live picture stays on while you browse. Now/next cards show timings, remaining duration and programme resumes after breaks.

Browse **From now**, **Today** or **Tomorrow**, search titles/programming blocks, or show programmes only. Short adverts and idents retain seconds in their timings. Click a listing for its broadcast time, duration and block; “Watch the live channel” always joins the current transmission. Listings are paginated, so the short demo's thousands of daily entries are not all downloaded at once. Search and filtering cover the selected period, including entries beyond the loaded page.

British dates follow `Europe/London`, including 23- and 25-hour clock-change days. Now/next and on-air markers update from the shared clock. The default “From now” board refreshes once a minute when you are at its top and not interacting; Refresh updates other views manually. Loading a further page appends rows without replacing the ones you are reading.

Optional **Auto-scroll** borrows Ringmast4r's guide-channel idea; it is off initially, pauses during manual navigation, focus, details and hidden tabs, and is disabled when reduced motion is requested. Native buttons and a modal dialog support keyboard use. **G** focuses guide search, **L** rejoins live, and **Escape** closes programme details. All scripts and fonts remain local.

`GET /api/guide` returns up to 60 entries per page (maximum 100), plus `next_cursor`. Pass the returned `start`/`end` back with `after=next_cursor` for a stable next page. Optional `q` searches titles/blocks and `programmes_only=true` filters before pagination. Date windows may span up to 36 hours near today, covering full British DST days. This endpoint shares the existing schedule and exposes only public event fields.

`GET /api/channel?hours=6` gives now and upcoming entries (maximum 24 hours). `GET /guide.xml` supplies the next 24 hours as XMLTV. `python -m station.cli export guide.json` exports advance JSON. The same schedule drives all outputs. There is **no IPTV stream or M3U/HLS endpoint yet**; this release takes the permitted browser-player route.

The browser estimates server time from the response and half of the round-trip time, then advances a monotonic clock. It seeks to `source_in + (server time − event start)`, changes clips at boundaries and corrects drift above 1.25 seconds. Smaller differences receive a gentle playback-rate correction. Target: roughly 1–2 seconds between viewers on a stable connection, not frame-accurate broadcast synchronisation. Buffering, long keyframe intervals in copied sources and slow networks can increase the difference. Encoding once inserts two-second keyframes for practical seeking.

The browser starts muted following a click, supports sound/fullscreen, rejoins after visibility/network changes, and retries failed media. A cached 15-minute guide lets transitions continue during a short guide outage. An unavailable programme produces a retry message; this slice has no automatic emergency-media substitution. It requires an H.264-capable modern browser. Clip transitions can have a brief loading gap; seamless playout and native captions are future work.

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
node --test tests/*.test.mjs
```

Tests cover contiguous schedules, midway joins, advert/resume boundaries, filler phase, restart stability, British DST evening slots, invalid schedules, path traversal, HTTP ranges/HEAD, two independent HTTP clients, public-data isolation and mock Jellyfin pagination/prefetch/redirect rejection. JavaScript tests cover two independent clock anchors and cached-guide transitions.

For the actual browser acceptance test, install Playwright in a development environment with Chromium and run the server first:

```sh
pip install playwright
python -m playwright install chromium
python scripts/browser_acceptance.py --url http://127.0.0.1:8000
python scripts/epg_acceptance.py --url http://127.0.0.1:8000
```

That test tunes in two independent browser contexts at different times, checks rendered video position, waits across at least two automatic programme changes and checks for private requests. It takes up to 65 seconds against the supplied demo. It is intended for this short demo schedule, before substituting feature-length media.

Workspace verification results and remaining acceptance work are in [docs/VERIFICATION.md](docs/VERIFICATION.md). Candidate research and architecture tradeoffs are in [docs/DECISIONS.md](docs/DECISIONS.md).

## Scope after this slice

Before building more custom scheduling functionality, reconsider Tunarr. The most useful next steps are an actual Jellyfin import, two-device playback on the intended hardware, then a shared pre-segmented HLS output and optional scheduling UI. Series sequencing, random/metadata rules, automatic archive acquisition, multiple channels, captions and automatic failure slates are not implemented.
