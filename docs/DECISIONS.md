# Broadcaster evaluation

Reviewed upstream READMEs, repository metadata and, for Tunarr, the licence text through the GitHub connector on 24 October 2026. These are repository-level findings, not runtime benchmarks. Shell network requests and Docker execution were unavailable in this workspace; none of these broadcasters was run here.

| Candidate | Evidence and licence | Fit for the first slice |
| --- | --- | --- |
| [Tunarr](https://github.com/chrisbenincasa/tunarr) | README documents Jellyfin/local libraries, time slots, filler, M3U, browser playback and Docker ARM64 support. [Zlib licence](https://github.com/chrisbenincasa/tunarr/blob/main/LICENSE) permits adaptation. | Best general-purpose choice. Prefer it when IPTV, a scheduling UI and library rules matter more than minimising the running delivery process. The README documents transcoding profiles; we have **not** established that its direct/stream-copy modes satisfy this station's mixed-file, public, credential-isolation requirements. Do not interpret this as a claim Tunarr always transcodes. |
| [Channel Two](https://github.com/cfinke/Channel-Two) | Browser playback, cron-style schedule, alphabetical series sequencing and fade-to-black commercial insertion. Operator-confirmed permissive reuse licence. | Reuse its native transport sequence. Keep advert decisions in the shared timeline rather than independently choosing ads in each browser. |
| [JellyfinTV](https://github.com/DrewThomasson/JellyfinTV) | Clock-position joining, metadata filters and direct Jellyfin-to-browser streaming. Operator-confirmed permissive reuse licence. | Reuse metadata queries and mid-roll chunking. Replace public Jellyfin access with private prefetch and prepared media. |
| [FieldStation42](https://github.com/shane-mason/FieldStation42) | MPL-2.0 reported by repository metadata. README describes Python/MPV playback, schedule blocks, bumps, web management and Raspberry Pi support. | Strong local retro-TV reference. Internet multi-viewer delivery and Jellyfin prefetch are not established by the README. |
| [SurfArr](https://github.com/f00d4tehg0dz/surfarr) | GPL-3.0; README documents YouTube/Internet Archive channels, FFmpeg/yt-dlp container, M3U, XMLTV and a remote catalogue API. | Useful archive/channel-surfing reference. Broader ingestion and remote catalogue dependencies than this private-library slice needs. |

## Choice

This slice adapts focused parts of Channel Two and JellyfinTV within a small integration because it offers a concrete resource and privacy advantage: **the public runtime neither contains FFmpeg nor contacts Jellyfin**. Prepared H.264/AAC MP4s are served by Starlette's existing `FileResponse`, including HTTP ranges. FastAPI, Uvicorn, HTTPX and FFmpeg provide HTTP, file delivery, discovery and media preparation.

After the initial metadata review, the operator confirmed permissive reuse rights for both projects. Active adaptations and original source snapshots are documented in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). This integrates extracted components, rather than forking both full applications. Exact licence wording was not supplied, so no standard licence identifier has been asserted.

The integration adds an authored timeline, private Jellyfin prefetch and browser clock control. Fixed blocks, excerpts, mid-roll rules and deterministic filler are enough to test the television experience. It does not introduce a general-purpose cron parser, transcoding service, stream proxy, archive scraper, programme database or scheduling admin UI.

Choosing this path trades an existing scheduling UI and IPTV compatibility for a smaller running service. Reassess Tunarr before adding those features. Implement an adapter from the published timeline if adopting another broadcaster; keep catalogue and importer private. An IPTV M3U must point to a genuine linear output; a list of programme MP4 files is not an equivalent replacement.

## Extension boundaries

1. **Discovery/preparation:** private CLI, Jellyfin API, local files, rights/source notes, one-time FFmpeg preparation.
2. **Programming:** JSON blocks compiled into absolute UTC events with a British-time weekly mode. Public event objects do not contain catalogue file paths or provenance.
3. **Delivery:** read-only MP4 range requests. Replacing this with pre-segmented shared HLS would require one segment timeline, discontinuities, sequence numbers and timestamp handling across excerpts; that work is deferred.
4. **Viewer:** same-origin native HTML video and server-clock control. The guide is JSON plus XMLTV from the same timeline.

No multi-service control plane is required. Media can be copied to a public cache host independently of the scheduling process.

## EPG presentation

The EPG update adapts Ringmast4r-TV's Prevue guide-channel idea and opt-in scrolling timer. Its source and full MIT notice are recorded in `THIRD_PARTY_NOTICES.md` and `vendor/ringmast4r/LICENSE`. This does not add ErsatzTV, HLS.js, a live transcoder or remote assets to the station. A single-channel programme board is easier to read than duration-scaled grid cells for the demo's eight-second adverts. Now/next cards keep the current transmission visible; paginated day listings provide the wider schedule, with server-side title/block search and programme filtering. Calendar windows use British civil dates rather than assuming every day lasts 24 hours.

The subsequent wrapper revision follows the operator's request for only stream and EPG, aligned to Freeview-style guide conventions. It replaces the earlier Prevue board/cards with a horizontal channel/time grid, inline details and a red live marker. The short-demo readability problem is handled by a smaller automatic timescale, with concise labels for short adverts/idents and full titles on selection. The real clock/durations remain unchanged. There is one row for the one actual channel; no themed channels are fabricated. Search/filtering remain API features while the visible guide uses day/time navigation. The Ringmast4r scrolling adapter is no longer active; its earlier-revision notice is retained for provenance.

## Local receiver controls and subtitles

Pause is an explicit local viewing state, separate from the shared broadcast event. It prevents source replacement and drift correction, including a metadata callback that arrives after pause. Resuming returns to live and is labelled accordingly. This meets the request for local controls without adding a DVR scheduler or creating a separate broadcast timeline per viewer. OS/native pause/play events are handled where browsers expose them.

Subtitles use native text tracks, prepared once as WebVTT. The underlying video source time drives cues, so programme excerpts after mid-roll breaks do not need retimed files. Preparation extracts embedded text subtitles before they are stripped from the browser MP4 and privately caches external Jellyfin tracks for the selected media source. The public process still has no Jellyfin connection or FFmpeg dependency. Subtitle files share the existing scheduled-asset allowlist and path containment boundary. Import preparation is staged so failed text conversion leaves a retryable asset ID. Caption language, volume and picture preferences remain in browser storage, with no viewing history or server-side preference records.

## The station interface is a functional frame

The player and guide have distinct but related surfaces: ink-dark playback and a warm paper programme sheet. A three-role type hierarchy gives the selected programme a large serif title, uses monospaced type for times and indexing, and keeps descriptions and controls in a neutral sans-serif. Dark green marks the channel and selected transmission. Programme titles retain their supplied case; descriptions, tags and block introductions carry the editorial voice. The app does not generate editorial jokes, rename programmes or apply a common visual treatment to the video itself.

Live status, keyboard focus and programme selection have explicit, consistent treatments. A dark selection against the paper timetable identifies the selected guide cell; colour alone is not the selection indicator. Motion explains control visibility or sheet movement and respects reduced-motion preferences. The source picture stays free of station watermarks and synthetic CRT/film effects, including preferences saved by older versions.

The stream remains the first surface, with the guide and settings opened on demand. New editorial identities should fit this stable frame through their programming and metadata, rather than changing navigation, button styles or viewer behaviour for each block. Reference artwork and proposed programme names are not imported as application branding.
