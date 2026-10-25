# Reused code and provenance

## VT323 pixel font

Copyright 2011, The VT323 Project Authors (peter.hull@oikoi.com). SIL Open Font License 1.1. The unmodified font is bundled at `web/fonts/vt323.ttf`; the complete copyright/licence is in `vendor/vt323/OFL.txt` and included in the Docker image.

Source: https://github.com/google/fonts/tree/main/ofl/vt323. Upstream `VT323-Regular.ttf` Git blob: `afa69098f15bf64849d397f133d9467486904053`. The downloaded binary was verified against that hash. Earlier published revisions used this font for the retro interface. The neutral interface no longer references it; the bundled asset, compatibility route and licence are retained. There are no external font/CDN requests. Native subtitle text remains sans-serif.

## Ringmast4r-TV — ringmast4r

Source: https://github.com/Ringmast4r/Ringmast4r-TV, commit `145a2eb91a446cd4ed791c0f150dc25cf67326fe`.

An earlier revision adapted `startGuideAuto`, `stopGuideAuto` and wheel-pause handling from upstream `player/index.html` (blob `7ebe5b57284902e468fca98539f6257897898dd4`). The current time-grid wrapper replaces that scrolling guide implementation. This source/notice is retained for provenance of the earlier published revisions. The current grid, British-date helpers and JSON integration are project integration code.
MIT License. Copyright (c) 2026 ringmast4r. Full notice: `vendor/ringmast4r/LICENSE` (also included in the Docker image).

The project operator confirmed on 24 October 2026: “We have a permissive licence for channel 2 and jellyfin TV to reuse and build on their code.” The adaptations below rely on that grant. No standard licence identifier or wording has been invented. Keep the operator's licence documents with the source/deployment and follow their actual terms.

## Channel Two — cfinke

Source: https://github.com/cfinke/Channel-Two

Reference commit: `05ed0ef3022abd9926ca67414034944e0580091f`.

Original `channel-two.js` blob: `e8c229688dc245c9e78cf8cdfd07bf6169a6af0e`. Unmodified reference: `vendor/channel-two/channel-two.js`.

Adaptation: `web/channel-two-playback.js`, extracted from `play(path)`'s clear/source/load/play sequence. jQuery/UI was removed. Seeking waits for metadata and uses the shared clock; only station asset URLs are accepted. Viewer-local advert decisions and debug skipping are not used.

The transport now also has preparation/ready callbacks for native subtitle tracks and a playback-intent guard so a pending metadata event cannot undo a viewer's pause. Subtitle conversion, private prefetch, local controls and the viewing-state rules are new integration code.

## JellyfinTV — DrewThomasson

Source: https://github.com/DrewThomasson/JellyfinTV

Reference commit: `d295ca46325ba0e2cd498b8365fd804474cbd156`.

Original `jellyfin_client.py` blob: `dd9468cc14e85bc60332590d7cf692801006e8d0`.

Original `scheduler.py` blob: `aef1bad5cfd594e3db2e0e529a654d09c88e4aaa`.

Unmodified references: `vendor/jellyfintv/`.

Adaptation: `station/jellyfintv.py` extracts `search_items` criteria construction and the scheduler's content-chunk/mid-roll loop. The importer supplies pagination. The chunk loop yields schedule entries instead of SQL rows, uses measured advert durations instead of assumed 30-second ads, supports excerpts and makes no viewer-local random choices. Upstream direct Jellyfin URLs/tokens are not exposed publicly.

Original source files contained no additional licence/copyright notices. No upstream advertisement or other media asset was copied. Vendored references are not executed or served; the named adaptations are active.

Other dependencies retain their licences: FastAPI (MIT), Starlette (BSD-3-Clause), Uvicorn (BSD-3-Clause), HTTPX (BSD-3-Clause). FFmpeg and enabled codecs have their distribution-specific LGPL/GPL terms; the tools image uses Debian's FFmpeg package. Original synthetic demo media is offered under CC0.
