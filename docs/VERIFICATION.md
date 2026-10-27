# Verification record

## Collection hierarchy, programme folio and visual planning — 26 October 2026

The viewer now presents the collection title and shared colour above an explicit Block 1/2/3 label. Ordinal controls navigate between related blocks. Collection association also accompanies live programming metadata and the player label. There are still exactly two timeline lanes. The running order uses numbered panels, a wider treatment for long works, synopsis excerpts and a bar showing each work's proportion of the block.

The default window is three hours with half-hour ticks. Full day uses the selected British day for scheduled programming, or a relative 24-hour window for a collection. The selected collection block focuses its own three-hour window. Display scales preserve broadcast timings.

Studio groups blocks under collections, links parent/child editors, offers a clickable proportional programme sequence, and shows miniature rundowns on collection cards. Its cycle/weekly board distinguishes blocks, hatched gaps and red overlaps. Gap selection opens a fitting-block chooser. Native drag-and-drop places blocks at a snapped time or moves an existing occurrence; slot forms retain exact-time editing. The shared geometry handles midnight crossings, Sunday-to-Monday wrapping and repeated weekly slots.

**48 Python and 38 JavaScript tests pass.** Added checks cover player/guide collection identity, three-hour/full-day switching, hierarchy controls, gap placement, gap/overlap unions, midnight/week wrapping, overrun identification and moving one repeated occurrence. JavaScript syntax, Python compilation and whitespace checks pass.

The built-in browser verified the actual collection label, Block 1 and Block 2 navigation, a 00:00–24:00 collection view containing three blocks and 30 works, and a 03:00–06:00 view containing block two's eight works. Desktop and measured 389×843 CSS phone views were inspected. Programme panels retain chronological order and the phone has no horizontal page or guide-sheet overflow.

In Studio, an unsaved weekly test placed block one in Tuesday's gap at 00:00–03:00. Adding another block at Monday 19:00 produced a visible 1m54s overlap. A native browser drag moved that block to 21:00 and cleared the warning. The form showed starts 19:00, 00:00 and 21:00. Discard changes restored saved/published revision 5; no test schedule was published. Surfacing synopsis excerpts exposed an old archive-access qualifier in The Family. That qualifier was removed in Studio and the cleaner copy was published as revision 6, with the original cycle and running order retained. The grouped block library and proportional programme sequence were also inspected.

Fresh local captures, ignored by Git:

- `test-results/hierarchy-guide-desktop.png`
- `test-results/hierarchy-programme-folio.png`
- `test-results/hierarchy-guide-phone.png`
- `test-results/hierarchy-folio-phone.png`
- `test-results/hierarchy-studio.png`
- `test-results/hierarchy-schedule-draft.png` (the unsaved overlap test)

## SQLite Studio and clean viewer copy — 26 October 2026

Studio runs as a separate local FastAPI service on port 8001. SQLite stores programme records, reusable blocks, ordered rundown items, collections, schedule settings and revisions. First use imports the existing JSON/Markdown configuration. Saving keeps a draft; publishing validates scheduled dependencies and atomically replaces one delivery bundle. The public service loads its schedule, catalogue and editorial content together without restarting. The database and editor routes are absent from the public service.

The viewer guide has no development caveats, preview warnings, About notes, advisory panels, archive explanation or running-order instruction. Programme descriptions, source credits, relative collection times and the two aligned lanes remain. “Back to live guide” returns to the current block after time has passed.

**47 Python and 31 JavaScript tests pass.** New checks cover SQLite persistence and foreign keys, draft/publication separation, revision restoration, stale edits, missing scheduled media, pairing a prepared asset by ID, measured durations, overlaps, corrupt-publication recovery, fill duration including adverts, local client/Host/origin restrictions and the absence of editor routes on the viewer service. DOM tests exercise editing, reordering, save-before-publish and return to the current broadcast. JavaScript syntax, Python compilation and whitespace checks pass.

The desktop built-in browser verified rundown reordering and saving; exact six-second fill of the 114-second block; restoring its original seven-item order from a saved revision; publishing; and removing the remaining sample-copy qualifier through the programme editor. The final local published edition is revision 5, with the original running order and cleaner copy. Public metadata loaded the publication without a station restart. Native video reached readyState 4 while playing, with status Live and a same-origin prepared-media URL.

The viewer collection and block were checked at a wide desktop size and measured 389×843 CSS phone size. Both lanes remain, note elements are absent, no development disclaimer text is rendered and no horizontal page or guide-sheet overflow was observed on the phone. The operator's programme, block and schedule screens were inspected in the browser. Native drag-and-drop handlers are supplied; the rendered reorder check used the labelled keyboard buttons. Full Nebula/Dramatica services, live ingest and remote deployment were not exercised.

Fresh local captures, ignored by Git: `test-results/sqlite-studio.png`, `test-results/clean-published-guide.png`, `test-results/clean-published-phone.png`. Operating instructions and the database model are in [STUDIO.md](STUDIO.md).

## Two-layer block guide — 26 October 2026

The timeline has exactly two aligned lanes: Blocks and Programmes. Collections remain optional reading context. Selecting a block opens its full running order; selecting a programme in either lane opens its parent block and expands that work without calling the playback action. Interrupted films retain their advert and continuation segments within one work. JSON supplies the hierarchy and running order, with Markdown files supplying longer editorial copy.

The supplied nine-hour treatment is available through Guide → Collections as three unscheduled editorial previews containing 30 works. Its timeline uses relative programme times, with no live playhead or play action. Existing demo media remains the broadcast source.

**41 Python and 30 JavaScript tests pass.** Coverage includes complete airings from partial query windows, work grouping, preview and collection metadata, content reload validation, the two-lane DOM flow, retained work expansion, stale-response handling and recoverable request failures. Whitespace checks pass. The terminal browser acceptance scripts were updated but were not executed in this pass.

The desktop app's built-in browser verified the real guide at a wide desktop viewport and a measured 389×843 CSS phone viewport. Both showed two aligned lanes, three preview blocks and 30 programme spans. Selecting Ratcatcher opened part two and expanded its details. The preview stayed selected through subsequent live clock updates. No horizontal page or guide-sheet overflow was observed on the phone; the timeline itself intentionally pans horizontally. This pass checked guide navigation and layout; video decoding and physical-device playback were not rechecked.

Fresh local screenshots, ignored by Git:

- `test-results/block-layers-desktop.png`
- `test-results/block-layers-phone.png`

## Simplified guide and player — 26 October 2026

The guide now has two editorial columns and one navigation area. A single header clock and the timeline playhead retain real live orientation. The separate TX/facts card, duplicate progress readout, decorative archive numbering and large channel-name rail are removed. Native Programme notes and mobile Short clips disclosures retain the original copy and short-transmission targets. The main player strip has five buttons; volume, subtitles and rejoin live remain in Settings. Watch live is conditional on idle/paused playback. The changing palettes, glass panels, motion and live content publishing remain.

**36 Python and 25 JavaScript tests pass.** HTML IDs, JavaScript element references, CSS parsing, JavaScript syntax and whitespace checks pass. The supplied terminal browser acceptance scripts were updated for the new selectors/controls, but were not executed; this pass used the desktop app’s built-in browser.

Rendered checks used measured CSS viewports **1440×1000**, **389×843** and the default **870×1095**. No page or guide horizontal overflow was observed. Video reached readyState 4 while playing. Guide browsing works before tune-in; Watch live joins the picture and closes the guide, then hides when playback is active. Programme notes reveals the unchanged strand copy and tags. Short clips expands readable buttons; selecting an advert changes details and restores coral. Keyboard left/right selection works. Tomorrow opens at British midnight, Later advances the window and Now restores the live marker. Settings exposes volume and subtitle choices; a one-step volume adjustment and English subtitle selection were verified, then restored to 70%, muted and subtitles Off. Escape returns guide focus to its explicit opener; Settings close returns focus to its toggle. Guide focus is restored after pointer dismissal settles, including Safari. No programming copy or editorial configuration was changed.

Captures: `test-results/simplified-guide-phone.png` and `test-results/simplified-guide-desktop.png` (ignored by Git). The temporary responsive viewport override was reset after review.

## Changing palettes and live JSON/Markdown content — 26 October 2026

**36 Python tests and 25 JavaScript tests pass.** The private editorial layer resolves JSON defaults, programme overrides and strand overrides, plus local Markdown prose, into public API/search/XMLTV/CLI exports. Tests verify edit detection, revision changes, unchanged media/timing/captions, source preservation, invalid/partial-save recovery, newly referenced file recovery, unreadable-file fallback, unsafe paths and symlink refusal, field allowlisting, safe prose and appearance priority. Station CLI validation passes for seven assets and 7,200 upcoming demo transmissions. JavaScript syntax and whitespace checks pass.

The real station was restarted for the new backend. In the built-in browser, a manually selected documentary showed its existing synopsis and cobalt edition. Its Markdown file was temporarily appended with a verification sentence. The sentence appeared automatically, without a page reload, while video remained readyState 4 and playing. Focus stayed on the same transmission button after the guide refreshed. The original file was then restored and the original synopsis reappeared automatically. No verification wording remains in the content files.

Selecting an advert gave the coral header and cream facts; selecting an ident gave the citrus edition. The programme had already shown cobalt. Individual programme choices retain their edition on resumption; the previous fixed-strand default is superseded. The existing glass surfaces, shared-clock live signals and finite motion toolkit remain.

New authoring files: `config/content.json` and `config/descriptions/*.md`. Catalogue and schedule changes still require validation/restart. Public APIs return a content revision and resolved fields; no editorial file paths are exposed. The player polls every ten seconds and refreshes selected guide content on a changed revision. The Markdown syntax is deliberately restricted and presented as plain text. Artwork IDs select from the two credited local archive placeholders.

Capture: `test-results/live-content-changing-colours.png` (ignored by Git).

## Strand identity, motion toolkit and frosted panels — 26 October 2026

**30 Python tests and 25 JavaScript tests pass.** New checks cover stable strand colour through adverts/idents/resumptions, deterministic unknown-strand fallback, rapid-wipe cancellation, reduced-motion changes during active gestures, finite animation completion and missing animation APIs. The motion module is explicitly served and included in the public-route checks. JavaScript syntax, CSS parsing and whitespace checks pass. Four palette contrast checks pass: translucent header text has a worst-case ratio of at least 5.45:1 against black/white backdrops; facts text is at least 10.32:1.

The built-in browser connection recovered. The real station was reloaded and tuned in successfully; video reached readyState 4 while playing. The guide was checked at measured CSS viewports **1440×1000 and 389×843**, plus the default 870×1095. Neither page nor guide had horizontal overflow. The viewport override was reset afterwards. The browser’s viewport command used a scaling factor, so dimensions were verified from the rendered document rather than inferred from requested settings.

Observed: live TX time and playhead advance; selecting an advert retains the After Hours edition; selected historical details remain stable while the live signal advances; Now restores current selection; settings open/close and focus returns to the settings control; Back to live closes the guide and playback continues. The console contains no warnings/errors during this review. Computed styles confirm smoked controls (66% ink with 18px blur), the guide sleeve (33% stock with 24px blur) and pale settings (91% stock with 20px blur). Reading areas remain opaque. Reduced-motion cancellation/final states are verified by the toolkit tests and stylesheet; no OS preference was changed for this review.

Local captures, ignored by Git:
- `test-results/identity-glass-guide.png`
- `test-results/identity-glass-phone.png`
- `test-results/identity-glass-settings.png`

The earlier browser limitation below records the preceding pass and is resolved for this review.

## Archive-led composition and kinetic editions — 26 October 2026

The current pass adds a three-column guide with a large archive image, offset programme title and narrow facts panel. Four edition palettes vary with transmission type, while acid selection stays consistent. The two images are real, locally cached archive downloads: NASA’s Moon-walking simulator and Nationaal Archief / Spaarnestad’s 1931 radio hat. Source credits, links, reuse statements and hashes are retained. No generated replacement image is referenced by the project.

Guide acquisition, first tune-in and changed-selection transitions are finite and respect reduced motion. Decoding precedes the image wipe, stale async selections are ignored and the TX display uses the shared clock and actual live progress. Programme metadata, broadcast timing and playback transport are preserved.

Validation: **30 Python tests and 21 JavaScript tests pass**. Checks include JPEG MIME/signature, HEAD/cache responses, explicit asset allowlisting, source attribution and stable art direction across programme resumptions. HTML IDs/JavaScript element references, CSS parsing, JavaScript syntax, whitespace and the real HTTP routes pass. The local station was restarted successfully.

**Fresh rendered verification is pending:** the Codex app browser bridge returned “Codex app tool request failed”; browser inventory returned no available browser and the same connection error. Native control of the Codex app was explicitly unavailable. No different browser or control bypass was used. Earlier captures below belong to the preceding design pass. This pass has no new browser screenshot or claimed rendered desktop/mobile result.

## Transmission-sheet design and local browser review — 26 October 2026

The project was cloned to `TVStation/oddity-tv` and run locally using the documented Python setup. The Mac’s default FFmpeg lacks drawtext. A development-only `imageio-ffmpeg` binary with drawtext was installed in the ignored virtual environment and exposed as `.venv/bin/ffmpeg` to generate the original demo. FFprobe and station validation pass: seven assets and 7,200 transmissions over 24 hours. The public station still has no FFmpeg dependency.

The user supplied five graphic references during the review. The resulting transmission sheet replaces the earlier restrained wine/lilac exploration with oversized Bricolage Grotesque lettering, an italic Instrument Serif signature, IBM Plex Mono facts, a circular channel index, double ledger rules, black ink on warm stock and bounded acid/pink/cyan highlights. Rules and reference interpretation are in `DESIGN_SYSTEM.md`. All programme copy and timing are retained.

### Rendered checks

The Codex desktop built-in browser was used against `http://127.0.0.1:8000`. Observed CSS viewports included 1440×1000 and 389×843; an earlier compact check used 358×657. The final desktop and phone views have no horizontal page or guide-sheet overflow. Native video reached readyState 4 while playing. Automatic programme changes were observed during browsing.

Verified interactions: tune in; Guide opening/dismissal; Tomorrow at British midnight; programme selection; left/right keyboard movement; Now/live visibility; fixed channel rail; horizontal position retained on refresh; settings opening/dismissal; local pause and resume during the review. Focus returns to Guide or Settings after closing, including after resizing. The focus decision now happens before hiding a sheet, because Safari can immediately blur a hidden descendant.

Live-follow scrolling is triggered on opening, live updates and viewport resizing. Viewer input stops following; programmatic scrolling does not. Mobile short clips have labels, and strand notes follow the timetable. The current desktop and mobile captures were taken with the synthetic broadcast playing behind the guide.

Local captures, ignored by Git:

- `test-results/transmission-arrival-desktop.jpg`
- `test-results/transmission-guide-desktop.jpg`
- `test-results/transmission-guide-mobile.jpg`
- `test-results/browser-review.json`

### Automated checks

All **29 Python tests and 19 JavaScript tests pass**. Station validation, JavaScript syntax and `git diff --check` pass. New delivery checks verify all four WOFF2 fonts, MIME types, HEAD, caching and the explicit font allowlist. Full font licences ship beside their files. The metadata fallback fixture explicitly removes the demo’s newer tag override; the default-guide payload budget accounts for current captions and strand context.

This review used the built-in browser directly. The complete standalone Playwright acceptance scripts were not run. Physical-device synchronisation, fullscreen, PiP, a real Jellyfin import, Docker deployment and public hosting remain separate acceptance work. No public site, pull request, issue or GitHub comment was created. The earlier records below describe their original environments and limitations.

## Programme-sheet redesign — 25 October 2026

A substantial compositional change replaces the prior dark modal treatment: an ink-dark player with a ruled control strip, and a warm paper guide with a dark green channel index and selection. The selected work leads in large serif type; timings and index labels use a monospaced face, with neutral sans-serif descriptions. Desktop programme information leads the wider column; strand context sits alongside it. On mobile, programme information leads and strand notes follow. Source titles, descriptions, schedule data and copy are preserved; only the Live label is wrapped for narrow-screen layout, with an explicit accessible button name. The stylesheet is rewritten as one coherent system rather than accumulating prior skin overrides.

Validation: all 28 Python tests and the JavaScript suites pass. HTML nesting/IDs/hidden states, CSS structure and variables, JavaScript syntax, Python compilation and whitespace checks pass. Static contrast pairs are 11.46:1 for paper text, 5.54:1 for secondary paper text, 8.60:1 for selected titles, 7.08:1 for secondary selected text and 6.86:1 for channel focus. The 320px control row is given an explicit compact rule. These checks do not constitute rendered layout or full accessibility verification. Chromium launch was attempted and remains blocked by sandbox socket operations; no rendered screenshots or device pass are claimed.


## Restrained, ruled interface treatment — 25 October 2026

The stream-first layout, hidden guide, programme metadata and schedules are retained. The interface uses a single neutral sans-serif family, charcoal and slate surfaces, off-white text and limited state accents. Selected guide cells use a light/dark reversal; focus remains explicit. Pixel typography, the large standby glyph, decorative on-picture watermark and synthetic CRT option/filter are removed. Previously saved CRT preferences are ignored rather than silently reapplying the retired effect. A fading, non-interactive scrim supports readable now/next text and controls while they are visible. Programme names, descriptions, blocks and their supplied capitalisation are unchanged; no proposed strand titles or reference artwork are imported. Following research into Mast’s Innovation Endeavors identity, the desktop guide places block context beside a larger programme title/synopsis in a 1:3 grid, separated by fine rules. Mobile stacks those regions and keeps its guide header available while scrolling. The proportional timeline retains its own time-based scale. Research provenance and the lack of usable reference-image pixels are recorded in `docs/DESIGN_REFERENCES.md`.

Verification: the 28 Python tests and JavaScript suites pass, including migration away from saved texture preferences. Syntax, HTML references/initial hidden states, CSS structure, source privacy and whitespace checks pass. Computed colour-pair contrast checks cover primary, secondary and selected guide text and focus against the relevant static surfaces; these are not a full accessibility audit. Browser acceptance now expects neutral guide type and retains playback, settings, subtitles, guide navigation, swipe and mobile overflow checks. Rendered browser/device checks remain unavailable in this environment, so visual fidelity and on-video contrast are not claimed as verified.


## Now/next, programming context and clip preparation

The controls overlay now shows a block label, source-aware programme progress and the following transmission/time. The mobile guide has a downward drag handle and a separate row of adequately sized short-clip buttons. Selected programme details include an expandable synopsis, episode/film metadata and tags; block descriptions remain in the guide.

New named programming profiles carry identity, descriptions and tags through advert/resume boundaries. Existing inline block titles remain compatible. Jellyfin imports and private metadata refresh populate an explicit public metadata allowlist; catalogue overrides survive source refresh, with commands to return to source values. JSON, guide search and XMLTV share the resolved metadata. A second paused video prepares only an imminent clip, skipping data saver/2G; promotion preserves viewing preferences and shared-clock seeking, with the single-element fallback retained.

Validation: **28 Python tests pass**, covering metadata precedence, HTML-to-text conversion, private-field isolation, block boundaries through adverts, CLI edit/sync, searchable tags and XMLTV descriptions/episode data, plus the existing delivery, scheduling, import and caption checks. JavaScript tests pass, including preload timing/data-saver rules and source-aware progress. Syntax, Python compilation, HTML ID/reference checks and whitespace validation pass. Browser scripts now select the active video explicitly, count actual active transmissions rather than speculative preloads, and exercise mobile sheet dismissal. Browser rendering, swipe gestures and real dual-video transition timing remain **unverified in this environment** because local sockets/Chromium execution are blocked; no gapless-playback or visual-verification claim is made.


## Stream-first viewer update

The picture fills the viewport, with the guide hidden on arrival. Guide opens a floating card; close, outside click and Escape dismiss it and restore focus. Tune-in/live resume also dismiss the guide. Settings have their own popover, with secondary controls moved out of the main bar. Icon controls and the current title fade after inactivity; keyboard focus, pause and idle states keep controls available. Sans-serif programme titles and settings improve readability, with pixel accents and red selections retained. Pause and reconnect messages are shorter. Redundant theatre mode is removed because the default layout already fills the viewport. Motion respects the operating system's reduced-motion setting.

Validation: all 22 Python tests and the JavaScript clock/schedule/control suites pass; JavaScript syntax, Python compilation and whitespace checks pass. The browser acceptance scripts now check the hidden guide, explicit opening, dismissal/focus return and the settings popover. Browser execution remains blocked: Chromium cannot launch in this sandbox and a local HTTP listener cannot bind. No screenshot or rendered mobile verification is claimed for this update.


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
