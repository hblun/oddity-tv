# Oddity — transmission sheet

26 October 2026. The implemented visual system for the receiver and programme guide.

## Design premise

A broadcast service with the graphic confidence of a printed programme, a record sleeve and a carefully typeset document. Large, heavy station lettering sits against very small facts. Double rules, a circular channel index and a strict timetable provide the structure. Colour behaves like a marker applied to information.

The picture fills the viewport. Guide opens a temporary transmission sheet. Preserve programme titles, descriptions, timings and supplied capitalisation. Source films keep their own picture, texture and identity.

## The supplied visual references

The user supplied five images on 26 October 2026. They inform a synthesis, rather than a reproduction:

| Reference | Principle used here |
| --- | --- |
| Slit Rail System poster | Oversized grotesk lettering, marginal facts, circular indexing and strong changes of scale. |
| Les sorties summer programmes | Heavy, friendly display type and confident colour used in bounded areas. |
| Otto Kitzing invoice | Document hierarchy, serif italic identity, monospaced facts, double horizontal rules and fine vertical divisions. |
| Galaxia record sleeve | Acid yellow against pink and a recognisable masthead. Original sleeve photography and lettering are not reused. |
| Define architecture index | Compact highlighted labels, a strict information grid and clearly separated records. |

These references do not provide approved station artwork or programme copy. Their scans, photographs, logos and textures are not bundled into the app. The earlier wine/lilac exploration is superseded by this direction.

## Typography

| Role | Typeface | Rule |
| --- | --- | --- |
| Station wordmark | Bricolage Grotesque, 800 | Uppercase, optical size 96, tightly spaced. Up to 380px on arrival; 112px in the desktop guide. |
| Selected programme | Bricolage Grotesque, 800 | Supplied title case; up to 74px on desktop, 34–44px on phones. Tight letter spacing, explicit word spacing and up to three balanced lines. |
| Station signature and strand | Instrument Serif, italic | 40px guide signature; 34px strand title. The italic is a distinct register, reserved for identity. |
| Times, states and small actions | IBM Plex Mono, regular | 10–12px, tabular figures. Uppercase only for short functional labels. |
| Timetable programme names | Bricolage Grotesque, 650 | 18–19px, short lines, generous contrast. Junctions use concise monospaced labels. |
| Synopsis and settings | Helvetica / Arial | 13–15px and a comfortable line height. |

The actual typefaces remain their authors’ work. Their selection, typesetting and role system form this station’s composition. Complete WOFF2 files are bundled locally with SIL Open Font Licence notices; system fallbacks remain specified. No runtime font CDN is used.

## Colour

| Token | Value | Use |
| --- | --- | --- |
| Stock | `#f2f1e9` | Arrival and programme sheet |
| Ink | `#171c18` | Type, rules, index and playback controls |
| Secondary ink | `#596058` | Supporting facts |
| Acid | `#e4ee65` | Tune in, current day, selection and keyboard signal |
| Pink | `#efa7c7` | Underline beneath a strand identity |
| Cyan | `#b7e6e9` | First programme-tag marker |
| Screen | `#191718` | Dark receiver surround |

Most of the sheet is stock and ink. Use colour on a labelled state, identity or fact. Avoid large ornamental colour panels. Colour is always supported by text, a rule, pressed state or explicit playhead. Hover and focus remain distinguishable from selection.

## Layout and graphic grammar

- Work from a 4px spacing base. Main guide margins are 28px on desktop, 14–18px on phones.
- A large station masthead occupies its own row. Guide controls and the British clock form a separate factual row beneath it.
- Double horizontal rules mark major divisions. Fine vertical lines divide actual columns and strand context. Avoid arbitrary ornamental grids.
- The selected work leads the broad column. Strand context occupies the narrow column with an italic title and pink underline; it has no surrounding card.
- The channel’s real index, 01, sits inside a fine circle. The circular close control is its counterpart. Other controls remain square.
- On phones, reduce the masthead while keeping its signature. Show selected-programme facts, navigation and the timetable before strand context. The sheet scrolls vertically with a sticky header.
- Timeline width always means elapsed duration. The channel rail stays fixed during horizontal browsing. Short clips retain readable junction labels and full accessible names.
- Programme information remains usable before tuning in. Playback continues while browsing.

## Behaviour

Opening the guide and pressing Now reveal the live position. Automatic scrolling and resizing keep following the station. Viewer input holds their chosen timeline position; refresh preserves it within the same window. Day/window navigation starts at the requested window’s beginning.

The selected cell has an acid fill and a black top rule. The moving playhead and On air label identify the transmission independently of selection. Selecting future programming changes the information, while the shared broadcast continues.

The picture’s controls fade after inactivity. Motion is limited to a short sheet entrance, control visibility and programme progress. Reduced motion is respected. Closing Guide or Settings restores focus to its opening control, including browsers where a mouse click leaves focus on the document body.

## Keep the image intact

The station’s arrival is a typographic poster. Once tuned in, the picture is the programme. No permanent masthead, artificial grain, aged paper, fake scanlines or blanket colour effect is placed over source video. Individual strand artwork can use a much more expressive visual language when an actual cleared image and editorial brief exist.

## Next useful experiment

Develop a single original strand poster using a cleared still. Try a circular crop, a full-frame photograph and a two-colour typographic treatment. Test each beside three very different works. This will establish how expressive programme art can sit within the stable receiver and timetable.

## Archive-led composition, motion and editions

The latest pass gives the selected work priority over the station masthead. A compact coloured header leads a three-column composition: a large archive photograph, an offset programme title/synopsis and a narrow transmission-details panel. On phones the image and title stack; the timetable precedes the extended facts panel.

The two illustrative archive photographs are real online sources: NASA’s Moon-walking simulator and a 1931 radio hat from Nationaal Archief / Spaarnestad Photo. Their source bytes remain unchanged. The guide applies monochrome presentation and a small separate colour registration bar; visible captions, credits, source links and an unrelated-to-programme placeholder note prevent them being presented as programme stills. Provenance and source reuse statements are in `web/artwork/CREDITS.md` and `sources.json`.

Four deterministic editions provide stronger colour. Cobalt pairs a blue header with a pale citron facts panel; coral pairs orange with pale blue; citrus pairs acid yellow with pink; nocturne pairs deep blue with pink and lavender stock. Selection remains acid yellow across editions. The same programme retains its artwork and palette when resumed after adverts. These are prototype presentation mappings, rather than new scheduling or editorial rules.

Motion consists of a 420ms guide acquisition reveal, a 420ms first-tune picture opening, a 380ms archive-image wipe and a 260ms text settlement on a changed selection. Image decoding completes before selection motion; stale completions after rapid keyboard browsing are ignored. Animations settle, respect reduced motion and never add continuous visual effects to the broadcast. The TX readout uses the shared clock and actual live-programme progress, rather than invented receiver measurements.

## Strand colour, motion and translucent materials — 26 October 2026

This section supersedes the earlier clip-type palette mapping and motion timings. The four named scheduling profiles now own their editions throughout programmes, adverts, trailers and continuity. Artwork registration plates, artwork bars, guide headers, facts panels, timetable strips and player strand labels share that edition. Browsing another programme changes only the guide; the player keeps the identity of the transmission being viewed.

| Strand profile | Edition | Relationship |
| --- | --- | --- |
| `saturday-cartoons` | Citrus | Acid yellow with pink |
| `evening-service` | Coral | Orange with cream |
| `saturday-cinema` | Cobalt | Cobalt with pale cyan and an orange artwork mark |
| `after-hours` | Nocturne | Deep blue with pale cyan and a pink artwork mark |

Unknown authored profiles receive a deterministic edition from their stable ID, or title when unnamed. Unprofiled continuity uses the existing kind-based fallback. The acid selection fill, keyboard outlines, labelled live playhead and player live dot retain common meanings across all editions. Programme titles and scheduling metadata are unchanged.

The identity has three behaviours:

1. **Acquire:** a 420ms aperture opens on the first actual `playing` event after tune-in, so it reveals a ready picture. The guide uses the same 420ms acquisition pace. It settles completely.
2. **Wipe:** a 280ms left-to-right reveal changes selected artwork and programme details. The same gesture changes player continuity once per transmission, rather than on metadata refresh. Image decoding completes first; rapid choices cancel older gestures.
3. **Locate:** the live playhead, TX time and progress follow the shared broadcast clock. They update directly, with no decorative pulse, free-running loop or delayed progress transition. Browsing a past programme leaves the live signal tied to the current transmission.

`identity-motion.js` owns the aperture and wipe toolkit. Each gesture runs once and retains no animation fill. Reduced motion cancels active gestures immediately and presents the final state directly; factual time and position remain available. CSS suppresses acquisition and supporting UI transitions under the same preference.

Material is deliberately selective. The receiver controls use a smoked transparent strip; settings and programme information use pale frosted panels. The guide is a translucent sleeve around solid paper reading areas. Thin light edges suggest plastic, while flat type, square corners and ruled structure preserve the station’s graphic language. Blur is bounded to these surfaces and never applied to the programme video itself. Without backdrop-filter support, near-opaque surfaces keep labels readable. Reduced transparency requests solid equivalents. Palette checks give at least 5.45:1 header text contrast even when its translucent colour is composited over black or white; facts panels exceed 10:1.

## Changing colours restored; editorial data — 26 October 2026

The operator preferred the earlier changes between transmissions. This supersedes the fixed-strand default above: programmes use cobalt, adverts/trailers coral, idents citrus and public information/short oddities nocturne. The feature uses an explicit nocturne choice, stable on resumption. All these defaults and programme/strand overrides now come from `config/content.json`; the JavaScript kind mapping is a compatibility fallback. An explicit strand theme can still hold one palette when editorially useful. The glass materials, reduced-motion toolkit, acid selection and live signals are retained.

Programme and strand descriptions can reference local Markdown files. Editorial revisions refresh the guide and player without resetting playback or the shared clock. Existing copy is preserved. Full authoring rules and data precedence are in `PROGRAMMING.md`.

## Simplified interface — 26 October 2026

The latest layout supersedes the three-column transmission-details treatment. Keep one selected-programme spread, one navigation area and the timetable. The image and synopsis share two columns on desktop and stack on a phone. A compact header retains the station lettering, italic signature, one British broadcast clock and the close control. Colour and the frosted sleeve remain unchanged.

Remove the separate TX card, second clock/progress display, repeated transmission labels, large channel-name rail and visible interval/status copy. The actual live marker remains in the timetable. Programme state and transmission time sit together above the title. The small circular 01 index stays fixed beside the timeline. The archive credit and a concise unrelated-image note remain visible; full factual context remains in the image alternative text and accessible caption.

The main player strip has five controls: play/pause, sound, Guide, Settings and fullscreen. Volume and rejoin live sit in Settings alongside the existing subtitle, picture and secondary controls. Subtitle track selection handles Off/on; the C shortcut remains. Watch live is visible when idle or paused; an already running picture needs only the guide’s close action. Programme notes and mobile Short clips use native disclosures for less frequently needed information and larger short-clip targets. Retry is shown only after a failed guide request.

The original programming copy, captions, shared clock, JSON/Markdown publishing, palette choices and motion toolkit remain. No new visual assets or dependencies are introduced.

## Block exploration with two timeline layers — 26 October 2026

The latest guide leads with the selected programming block and its editorial premise, then shows two aligned lanes: Blocks above Programmes. There is no collection lane. A collection is optional context reached through its text link or Collections. Actual airings use broadcast time; unscheduled previews use relative programme time. The live marker spans both scheduled lanes and is hidden for previews.

Work details expand in the block’s complete vertical running order. The lower lane offers the same entry points, including across sibling preview blocks. Selecting a work selects its parent and expands that work without tuning playback. The existing colour relationships, archive references, typography, frosted sheet and finite motion remain. Keep small spans proportional and provide the full-size vertical rows as an alternative to tiny timeline cells.

## Collection identity and programme folio

Collection membership is an explicit layer of identity, with its title, shared colour and a numbered block marker above the block title. The collection colour is independent of each block's changing edition. It follows membership in the player, block cells and Studio hierarchy. It does not add a third timeline lane. The default viewer window is three hours; full-day inspection is an explicit choice.

The vertical running order is a numbered folio. Smaller transmissions form paired panels, while long films and archive works span the width in a coloured feature panel. Every entry shows its ordinal, start, type and duration. A bar at the foot measures its share of the block. Native expandable details, chronological DOM order and keyboard focus remain. Mobile panels stack in the same order. Original titles and programming copy stay intact.

Studio mirrors collection → block → programme. Its proportional planning board uses hatch for gaps, colour for block association and red hatching for overlaps. Gap selection, form editing and labelled controls provide keyboard equivalents to timed drag-and-drop. The schedule compiler remains responsible for publish validation.
