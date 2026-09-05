# Media Log — Sifi's edition

This is Silas's fork of [cobbenterprises/obsidian-media-log](https://github.com/cobbenterprises/obsidian-media-log), the Media Log plugin by Jason Cobb. It runs inside the Ava vault (Select, Sifi's edition) and is fed by the `silasbc/select` runner.

## Why a fork

Before the plugin era (2026-08-09) the vault had its own hand-rolled Media Library: a dataviewjs surface over `Media/Log` plus a runner capture job. It shipped browse tools the upstream plugin does not have. Switching to the plugin traded those tools for durability and a clean file contract. This fork keeps the contract and brings the tools back.

## Rules

- **The item contract is upstream's, unchanged.** One Markdown note per item in `Media Log/Items/`, `media_id` marks an item, fields as in upstream `README.md` and `RUNNER.md`. Fields this fork reads on top (`kind`, `preview_remote`) are optional, already written by the runner, and ignored by upstream. The runner must never need to know which edition is installed.
- **Plugin id stays `media-log`.** This edition installs into the same folder and replaces upstream one-for-one. Never rename the id; two ids would mean two libraries.
- **Track upstream.** `upstream` remote is cobbenterprises, `origin` is silasbc. Merge `upstream/main` regularly. Fork code lives in `src/sifi.js` (subclasses of upstream's view and settings tab) and `src/browse.js` (pure logic); `src/main.js` carries four one-line hooks marked `[sifi]`, and `styles.css` has one appended section. Do not rewrite upstream files for style.
- **Versions.** Upstream version plus a prerelease suffix, e.g. `1.4.0-sifi.1`, so `manifest.json` stays valid semver and the base version is always visible. `versions.json` maps each fork version to the same `minAppVersion`.
- **Commits.** Upstream's privacy gate scans every reachable commit for personal email addresses, so this clone's git identity is the GitHub noreply address. The gate here also allows the AI co-author trailer's public noreply address (the literal address is never written into a tracked file, since blobs are scanned without that allowance); that is the only change to `scripts/privacy-gate.mjs`.
- **Vault law applies.** The plugin never deletes vault files outside Obsidian's reversible trash, never writes outside its configured folders and the duplicate-scan log, and never moves Dev Board cards.

## What Sifi's edition adds

Ported from the old Media Library surface (shipped there 2026-08-07/08), now on top of upstream 1.4.0:

1. **Random 64, On this day, caption search.** A toolbar row under the filters. Random deals a seeded shuffle of the current filters, one page at a time; press again for a fresh deal, "Exit shuffle" to return. On this day shows items captured on today's month-day in any year (hidden when there are none). Search now also matches the note body (captions and hashtags), loaded lazily the first time you search.
2. **Duplicate scan.** "Scan" opens a modal that groups items by normalized URL (definite) and near-identical title (maybe). "Keep this one" trashes the rest through Obsidian's reversible trash and appends a line per item to the quarantine log (`Media Log/Deleted Media.md` by default).
3. **Reel player polish.** The detail pane autoplays and loops local video, hints autoplay to embeds, sizes 9:16 for reels and posts, and falls back to the runner's `preview_remote` image when no vault screenshot exists. Left/Right arrows step through the visible set.
4. **Paging at 64 with month headers.** The grid pages instead of stopping at 200. Any filter change lands back on page 1. On phones, thumbnails exist only near the viewport with about 24 live at once and recycle on scroll. A render error shows a card with the message and a Reload button instead of a blank view.
5. **TV mode.** Full-screen playback of the current filters, unwatched first, looping. Local videos advance when they end; embeds advance on a dwell timer (15/30/60s pills, default from settings). Prev/Next/Star/Watched controls fade after a moment; Escape closes, arrows step. Three seconds on an item marks it watched.
6. **Sort, month, tags, counts, pager.** Sort picker and month filter in the toolbar; tag chips (AND) with an Untagged chip above the grid once anything is tagged; live counts in the platform dropdown; First/Last and a range badge under the grid.
7. **Live refresh + poster frames.** The view watches the items folder and repaints in place (scroll, page, and selection kept); a Refresh button re-reads on demand. On desktop the plugin grabs one frame from every local video that has no screenshot and writes it as the screenshot asset, so reels get real thumbnails without the runner.
8. **Guide button and phone bottom bar.** Guide opens the vault's Media guide (setting). On phones the Select bottom bar (Home, Train, Health, Media, Mauston) mounts inside the library and hides while a player is open.
9. **Phone pop-up player.** On a phone, tapping a card opens the item in the same full-screen player instead of scrolling to the detail pane above the grid. It opens synchronously inside the tap, so iOS allows playback with sound; the reel loops until auto-advance is switched on; Prev/Next stop at the list's edges; a scrim tap closes; and the grid keeps its scroll position. Open source and Open note sit in the second row.

Settings under "Sifi's edition": items per page, portrait cards, TV dwell seconds, and the duplicate-scan log path.

Still an idea, never built: Embed Lab, a test screen to find the best-playing embed per source.

## Build and deploy

- `npm install` then `npm run build`; `npm run check` runs upstream's smoke test, the fork's browse unit tests, the fork's bundle smoke test, and the release check. Node 22 works; upstream uses bun, so `package-lock.json` is kept out of the repo (see `.git/info/exclude`).
- This clone has `core.autocrlf=false` so `main.js` stays LF and the release check's `git diff --exit-code -- main.js` is meaningful on Windows.
- Deploy = copy `main.js`, `manifest.json`, `styles.css` into `<vault>/.obsidian/plugins/media-log/` and restart Obsidian (or toggle the plugin off and on).

## Changelog (Sifi's edition)

### 1.4.0-sifi.5 — 2026-09-05

- A labelled Auto-advance toggle in the detail pane and the player ("Auto: on/off"), remembered as a setting.
- One honest line under any item not playing a local video: not synced to this device yet / Instagram refused the download / a post.

### 1.4.0-sifi.4 — 2026-09-05

- The pop-up auto-advances by default: next when a video ends, after the dwell (now 10s) for embeds and images; the pause button turns it off for the session. The desktop detail pane selects the next item when a video ends.
- Items without a local video play Instagram's embed, which does not autoplay and eventually asks to open Instagram — the dwell moves past them.

### 1.4.0-sifi.3 — 2026-09-05

- Sort control (newest, oldest, title, creator, unwatched first), month filter, tag chips with AND and an Untagged chip, live platform counts in the dropdown.
- Pager: First/Last and a range badge.
- The library re-reads itself when the items folder changes (debounced, scroll and selection kept) plus a Refresh button.
- Poster frames: on desktop, one frame from each local video without a screenshot is written as the item's screenshot asset — real thumbnails without the runner.
- Guide button (setting: guide note) and a Select bottom bar inside the view on phones, hidden while a player is open.

### 1.4.0-sifi.2 — 2026-09-04

- Phone: tapping a card opens the pop-up player inside the tap (playback with sound), the detail pane is hidden, and the grid keeps its scroll position after closing.
- Player: modal mode stops at list edges and loops a reel until auto-advance is on; TV mode unchanged.

### 1.4.0-sifi.1 — 2026-09-04

- Forked from upstream 1.4.0.
- Added the five browse-tool features above, `src/browse.js` with 23 unit tests, and `scripts/sifi-smoke.cjs`.
- Read the runner's optional `kind` and `preview_remote` fields.
