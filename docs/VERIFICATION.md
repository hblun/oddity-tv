# Verification record — 24 October 2026

## EPG update

The viewer now has a full-width programme board, separate now/next cards, British-date browsing, search, programme-only filtering, per-transmission details and optional Prevue-style scrolling. Ringmast4r-TV's MIT-licensed guide informed the presentation; the scrolling timer is adapted and credited in `THIRD_PARTY_NOTICES.md`.

Updated checks: **16 Python tests and 11 JavaScript tests pass**. The additions verify stable paginated guide pages without duplicate/missing events, server-side search/filtering, small payloads, window/cursor validation, precise short-clip timings, British date boundaries and both DST transitions. All public routes, including the new guide endpoint/module, retain private-data checks. JavaScript syntax, Python compilation, Compose configuration, HTML element references and whitespace checks also pass.

The new `scripts/epg_acceptance.py` checks desktop/mobile navigation, programme dialogs/Escape, playback while browsing, pagination, search, filtering, auto-scroll, network failure, reduced motion and overflow. It captures desktop/mobile screenshots when run successfully against the demo. **It has not been executed here**, because socket restrictions still block a local HTTP server and browser startup. No screenshot or visual-browser pass is claimed. The CSS has been reviewed as source, not rendered in this workspace.

## Completed in this workspace

- Original synthetic sample MP4s generated with FFmpeg 7.1.5: seven files, about 1.5 MB total.
- `python -m station.cli validate`: passes prepared media codec/duration checks and 24-hour scheduling validation, including 7,200 upcoming demo entries.
- `python -m unittest discover -s tests -v`: **16 tests pass** after the EPG update.
- JavaScript clock, guide and Channel Two transport tests: **11 tests pass**, run directly with Node 24.19.0.
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
