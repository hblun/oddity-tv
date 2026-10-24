# Verification record — 24 October 2026

## Retro red-button styling update

The two-surface layout remains intact. Its skin now uses bundled VT323 pixel lettering, square red selection blocks, black/deep-blue panels, cyan clock/ruler text, yellow focus outlines and hard borders. Native subtitle text retains its sans-serif face. The original 153,116-byte font matches upstream Git blob `afa69098f15bf64849d397f133d9467486904053`; its complete SIL Open Font License accompanies the source and Docker image. The font route uses the correct MIME type and a one-day cache lifetime.

Current checks: **22 Python tests and 18 JavaScript tests pass**, including a new real HTTP test of the bundled font response. The browser acceptance script now waits for font loading before screenshots. Browser rendering remains unavailable here; the new visual styling is source-reviewed, not a rendered visual pass.

## Stream-and-guide wrapper update

The page now has exactly two main surfaces: live video and a Freeview-style horizontal programme guide. The masthead, promotional headings, separate now/next cards, decorative receiver strip and footer are removed. The guide has a fixed channel rail, proportional cells, shared time ruler, current-time playhead and inline selected-programme information. Today/Tomorrow, earlier/later windows and Now replace the previous board's search/filter/paging/auto-scroll controls. The public guide API retains its query and pagination features.

The sample clips use a two-minute timescale, short programmes 20 minutes and normal films two hours. Unit checks verify scale selection, clipped cells, proportional positioning and day-window boundaries. Existing caption, pause, scheduling and delivery checks continue to pass: **21 Python tests and 18 JavaScript tests**. HTML nesting, exactly two top-level sections, all JavaScript element references, syntax, compilation, Compose and whitespace checks pass.

`scripts/epg_acceptance.py` now checks the simplified wrapper, timeline selection/arrow keys, day/window navigation, live playhead, playback while browsing, fixed mobile rail and network failure. The other browser scripts target the new markup. These browser checks remain **unexecuted** because of workspace socket restrictions; no rendered visual match or screenshot is claimed. The design uses familiar Freeview guide conventions rather than a captured, pixel-matched Freeview device screen.

## Television controls and subtitles update

The receiver now includes local play/pause, volume, native WebVTT subtitles and track/size selection, programme OSD, theatre/full-screen/PiP controls, picture framing and an optional static CRT texture. Pause freezes the local picture without changing the station schedule; play explicitly returns to live. Text subtitles are prepared once from embedded streams, operator sidecars or private Jellyfin external-subtitle endpoints. Bitmap OCR and DVR playback are not implemented.

Current results: **21 Python tests and 15 JavaScript tests pass**. Real FFmpeg tests mux/extract a text stream and preserve a cue near its original 22-second position after an advert break. Matroska/AAC priming may shift timestamps by about 21ms; the test accounts for this while rejecting a reset to the excerpt start. Another test verifies a failed subtitle import is retryable and does not change the original media. Caption routes are checked for correct MIME/HEAD, same-origin opaque URLs, private-path omission, traversal and symlink rejection. Mock Jellyfin checks verify authenticated subtitle prefetch never follows metadata's external `DeliveryUrl`. The endpoint route shape was checked against Jellyfin's upstream `SubtitleController.cs`; no live server response is claimed.

JavaScript checks cover pause through a scheduled event change, explicit live resume, blocking late metadata autoplay, caption language fallback and malformed/blocked local storage. Syntax, compilation, HTML element-reference, Compose and whitespace checks pass.

`scripts/tv_acceptance.py` is supplied to check actual native cues, pause across a programme boundary, live resume, volume, picture/CC sizing, OSD, CRT/theatre preferences, full-screen controls when supported, persistence and mobile overflow. It is **not run here**: the workspace socket restriction still prevents the local browser/server path. No browser/native-caption, fullscreen/PiP, visual screenshot or live Jellyfin pass is claimed. Existing browser acceptance scripts are also still pending on a normal host.

## EPG update

The viewer now has a full-width programme board, separate now/next cards, British-date browsing, search, programme-only filtering, per-transmission details and optional Prevue-style scrolling. Ringmast4r-TV's MIT-licensed guide informed the presentation; the scrolling timer is adapted and credited in `THIRD_PARTY_NOTICES.md`.

Updated checks: **16 Python tests and 11 JavaScript tests pass**. The additions verify stable paginated guide pages without duplicate/missing events, server-side search/filtering, small payloads, window/cursor validation, precise short-clip timings, British date boundaries and both DST transitions. All public routes, including the new guide endpoint/module, retain private-data checks. JavaScript syntax, Python compilation, Compose configuration, HTML element references and whitespace checks also pass.

The new `scripts/epg_acceptance.py` checks desktop/mobile navigation, programme dialogs/Escape, playback while browsing, pagination, search, filtering, auto-scroll, network failure, reduced motion and overflow. It captures desktop/mobile screenshots when run successfully against the demo. **It has not been executed here**, because socket restrictions still block a local HTTP server and browser startup. No screenshot or visual-browser pass is claimed. The CSS has been reviewed as source, not rendered in this workspace.

## Completed in this workspace

- Original synthetic sample MP4s generated with FFmpeg 7.1.5: seven files, about 1.5 MB total.
- `python -m station.cli validate`: passes prepared media codec/duration checks and 24-hour scheduling validation, including 7,200 upcoming demo entries.
- `python -m unittest discover -s tests -v`: **21 tests pass** after the television controls/subtitles update.
- JavaScript clock, guide, local controls and Channel Two transport tests: **15 tests pass**, run directly with Node 24.19.0.
- Python source compilation and JavaScript syntax checks pass.
- `docker compose config --quiet` passes; Compose YAML and JSON configuration parse successfully.
- Vendored upstream files match the Git blob hashes recorded in `THIRD_PARTY_NOTICES.md` exactly.

Delivery tests exercise the real FastAPI/Starlette application using HTTPX's in-process ASGI transport. They verify two independent clients receive identical events at a fixed broadcast instant, byte-range responses contain the correct file bytes, HEAD and invalid ranges work, XMLTV parses, and private configuration/traversal/proxy URLs are inaccessible. Jellyfin tests use an HTTPX mock upstream; they verify pagination, header-only tokens, static download and redirect rejection. They do not establish interoperability with a particular live Jellyfin server.

The Python test harness uses a short asynchronous heartbeat because this workspace blocks cross-thread socket wakeups. Application delivery and file-serving implementations are not replaced or mocked to make those checks pass.

## Acceptance criteria status

| Criterion | Evidence and remaining work |
| --- | --- |
| Two viewers share a position | Independent HTTP-client and JavaScript clock tests pass. Actual two-browser decoding/synchronisation is still to be run. |
| Automatic progression | Compiled timeline is contiguous through programme, advert, resumed feature and filler. Browser transition test is supplied but not executed. |
| Midway joining | Shared-clock offset and delayed-metadata seeking tests pass. Physical-device playback remains to be measured. |
| Transitions without intervention | Schedule and transport tests pass. Real browser loading gaps/error recovery remain to be observed. |
| No continuous video re-encoding | Public code has no FFmpeg calls and Dockerfile omits FFmpeg from the public image. Container/process CPU measurement has not been performed. |
| Public interface hides Jellyfin secrets/paths | In-process public-route and traversal checks pass. Separate-host deployment is documented; public-network isolation has not been penetration-tested. |
| Recreate deployment from configuration | Dockerfile, Compose, dependency pins, generation commands and example schedules are supplied. Container build/start has not run here. |

## Environment limitations

The managed command sandbox refused network socket operations (`Operation not permitted`). Docker's local socket check failed at connection time, although a daemon process was present. Chromium exited during startup when a socket operation was denied. Command-line repository lookups with additional network access stalled and were cancelled; subsequent source research used the connected GitHub tools successfully.

No Docker build, container start, live browser playback, live Jellyfin import, internet publication or ARM-hardware benchmark is claimed. No public site was published.

## Finish on the target host

1. Start the prepared demo with `docker compose up -d --build station` and confirm `/healthz` is healthy.
2. Run `python scripts/browser_acceptance.py --url http://127.0.0.1:8000` with Playwright/Chromium installed. It produces `test-results/browser.json` and a screenshot after passing; no success artefact from that script exists yet.
3. Tune in from two physical devices and compare position through one complete two-minute cycle. Check sound, seek, return-from-background and recovery after a brief connection outage.
4. Configure the private Jellyfin connection, discover/import one real item, validate and author its broadcast block. Confirm the public host receives only prepared files/configuration and no Jellyfin environment variables.
5. Place the public cache behind HTTPS and inspect browser network requests for same-origin-only delivery. Measure idle/viewing CPU and bandwidth on the intended hardware.

Software reuse is authorised by the operator's stated permissive licences; the precise grants should accompany any source distribution as recorded in the third-party notice. This is a documentation task, not a blocker imposed on development.
