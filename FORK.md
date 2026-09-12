# Media Log — Sifi's edition

This is Silas's fork of [cobbenterprises/obsidian-media-log](https://github.com/cobbenterprises/obsidian-media-log), the Media Log plugin by Jason Cobb. It runs inside the Ava vault (Select, Sifi's edition) and is fed by the `silasbc/select` runner.

## Why a fork

Before the plugin era (2026-08-09) the vault had its own hand-rolled Media Library: a dataviewjs surface over `Media/Log` plus a runner capture job. It shipped browse tools the upstream plugin does not have. Switching to the plugin traded those tools for durability and a clean file contract. This fork keeps the contract and brings the tools back.

## Rules

- **The item contract is upstream's, unchanged.** One Markdown note per item in `Media Log/Items/`, `media_id` marks an item, fields as in upstream `README.md` and `RUNNER.md`. Fields this fork reads on top (`kind`, `preview_remote`) are optional, already written by the runner, and ignored by upstream. The runner must never need to know which edition is installed.
- **Plugin id stays `media-log`.** This edition installs into the same folder and replaces upstream one-for-one. Never rename the id; two ids would mean two libraries.
- **Track upstream.** `upstream` remote is cobbenterprises, `origin` is silasbc. Merge `upstream/main` regularly. Fork code lives in `src/sifi.js` (subclasses of upstream's view and settings tab) and `src/browse.js` (pure logic); `src/main.js` carries eleven one-line hooks marked `[sifi]`, and `styles.css` has one appended section. Do not rewrite upstream files for style.
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
10. **Stream from Instagram** (owner, 2026-09-05: "if streaming fixes it then do that"). With no local copy on this device, the player fetches the reel's embed page with a plain request, pulls Instagram's own CDN link out of it (good for about a day), and streams it in a native `<video>` — which autoplays where the embed never does. Reels the runner had given up on (`video: none`) play this way too. Links are cached per item for the session, a miss is remembered for fifteen minutes and the embed takes over, and the next reel's link is fetched ahead in the players. Setting "Stream from Instagram", default on. Playable-here and the players' lists count a streamable reel as playable.
11. **Capture-time enrichment.** Add-item (including the `obsidian://media-log` share-sheet path) now derives `embed_url` and `kind` from the url the same way the runner's `lib/medialog.js` does — Instagram reel/post/tv → the captioned embed page at the same path word, YouTube → `/embed/<id>` — and falls back to "Instagram Reel/Post/Video `<code>`" when the fetched title is empty, a login wall ("Log in", "Login • Instagram", "Just a moment…"), or nothing better than the url itself. A plugin-captured note now carries the same shape a runner-captured note would for the same link. Pure functions in `src/browse.js` (`captureKindOf`, `captureEmbedUrl`, `captureFallbackTitle`, `captureEnrich`), unit-tested in `scripts/browse-test.cjs`.

12. **The phone pass** (owner, 2026-09-11: "make the ava tags and everything in media log work on mobile … swipe through them like TikTok or Insta"). The pop-up player is a reel feed: it fills the screen, a vertical flick steps to the next or previous item (the panel follows the finger and rubber-bands at the list's ends; a short, slow, or sideways drag steps nothing, so a tap or a native scrub is never mistaken for a step), a tap on the video pauses and resumes it, and a persistent × in the corner closes it. Tags now work in both players: a Tags button and the item's own tags under the title open a sheet with every tag the library knows as a tap-to-toggle chip with its count, plus a New tag field; each tap writes the note's `tags` exactly as the desktop pane does, and the reel holds still (no auto-advance, no swipes, no fade) until Done. On a phone the toolbar and the tag chips are one thumb-scrollable line each, search is full width, tap targets are 36px or better, and the grid is two real columns (the flex column's `align-items: flex-start` had let it shrink to one 170px column). Pure functions in `src/browse.js` (`swipeIntent`, `normalizeTag`, `hasTag`, `toggleTag`), unit-tested; the player wiring is covered by `scripts/sifi-smoke.cjs`.

13. **Tags at import** (owner, 2026-09-11: "we should have a option to add tags at the time of importing"). A link saved from the share sheet (the `obsidian://media-log?url=…` path) opens the tag sheet for the new item as an Obsidian modal once the layout has settled — on every device; a modal survives the workspace rebuild Obsidian mobile does after a share-sheet launch, which tore the first cut's pop-up down in a second. "Open it in the library" jumps to the item. The item is saved either way. The sheet is one builder now (`buildTagSheet`) shared by the players, the dialog, and the Add item dialog, which gains the same tap-to-toggle chips under its tags field. Recently used tags lead the sheet (`recentTags`, newest first, capped at eight, a setting — no note writes). Setting "Ask for tags after a share-sheet save", default on. Three more one-line hooks in `src/main.js`: the protocol handler's `onDone`, the created file passed to `onDone`, and the Add dialog's chips. Pure functions `orderTags`, `pushRecent` in `src/browse.js`, unit-tested.

Settings under "Sifi's edition": items per page, portrait cards, TV dwell seconds, and the duplicate-scan log path.

Still an idea, never built: Embed Lab, a test screen to find the best-playing embed per source.

## Build and deploy

- `npm install` then `npm run build`; `npm run check` runs upstream's smoke test, the fork's browse unit tests, the fork's bundle smoke test, and the release check. Node 22 works; upstream uses bun, so `package-lock.json` is kept out of the repo (see `.git/info/exclude`).
- This clone has `core.autocrlf=false` so `main.js` stays LF and the release check's `git diff --exit-code -- main.js` is meaningful on Windows.
- Deploy = copy `main.js`, `manifest.json`, `styles.css` into `<vault>/.obsidian/plugins/media-log/` and restart Obsidian (or toggle the plugin off and on).

## Changelog (Sifi's edition)

### 1.4.0-sifi.15 — 2026-09-11

- A share-sheet save waits at most 4 s for the page's title (`fetchMetaFast`, one hook in the Add dialog). Instagram's page from the phone could hang for a minute, and the tag sheet only comes after the save (owner: "it fills the link but doesn't go from there"). On a timeout the note is written with the fallback title and the real title is patched in when the page answers (`patchLateTitle`).

### 1.4.0-sifi.14 — 2026-09-11

- Tags at import, second cut: the sheet after a share-sheet save is an Obsidian modal on every device, opened once the layout settles. The first cut opened the library's pop-up and Obsidian mobile's post-launch workspace rebuild tore it down in a second (owner: "it popped down too fast for me to enter tags"). "Open it in the library" jumps to the item.

### 1.4.0-sifi.13 — 2026-09-11

- Tags at import: a share-sheet save opens the tag sheet for the new item as a modal, after the layout settles ("Open it in the library" jumps to it); recently used tags lead the sheet; the Add item dialog gets tap-to-toggle chips; setting "Ask for tags after a share-sheet save" (on). See feature 13.

### 1.4.0-sifi.12 — 2026-09-11

- The phone's tag sheet hangs from the top of the screen. The sifi.10 visual-viewport approach did nothing inside Obsidian's iOS webview (owner: "the keyboard perfectly covers the tag screen"); at the top no keyboard reaches it. Desktop TV mode keeps the bottom sheet.

### 1.4.0-sifi.11 — 2026-09-11

- The bar's drawer/modal check is by geometry (on screen or not), not class names: on the phone the is-collapsed test read "open" with the drawer closed. Same fix in the shared tab bar (v6.2).

### 1.4.0-sifi.10 — 2026-09-11

- (Superseded in sifi.12) The tag sheet tried to follow the visual viewport above the keyboard.
- Delete from the phone pop-up: a trash button in the second row; the first tap arms it ("Delete? Tap again", 4s), the second trashes the note through Obsidian's reversible trash and the player moves on.
- The phone bottom bar steps aside while an Obsidian drawer is open or a modal (Settings) is up — it had covered the Settings gear at the bottom of the left drawer. Drawer class changes and body children are observed; the 1s self-check re-applies the rule. The shared note-surface tab bar got the same fix (tab bar v6.2, select repo).

### 1.4.0-sifi.9 — 2026-09-11

- The phone pass: the pop-up fills the screen and a vertical flick steps through the reels (finger-follow, rubber band at the ends, slide-in), tap pauses, a corner × closes. Tags inside the players: tap-to-toggle chips with counts + a New tag field, writing `tags` the way the pane does; the reel holds still while the sheet is up. Phone toolbar and tag chips scroll in one line each; the grid is two columns (was one 170px column). Keyboard: Up/Down step like Left/Right; Escape closes the sheet before the player. Smoke fixture: the fake CDN link's `oe=` had expired on 2026-09-07, pinned to 2038.

### 1.4.0-sifi.8 — 2026-09-05

- Capture-time enrichment for plugin-only captures (`embed_url`, `kind`, login-wall-safe titles) — see feature 11.

### 1.4.0-sifi.7 — 2026-09-05

- Stream from Instagram when there is no local copy: embed page → CDN link → native `<video>` with autoplay; `video: none` reels play again; links cached, misses remembered, next link fetched ahead. Playable-here counts streamable reels. Unit tests for the link extraction, expiry, and freshness; smoke test for the resolver (cache, shared in-flight request, remembered miss, setting off).

### 1.4.0-sifi.6 — 2026-09-05

- Players draw only from what plays on this device (setting, default on); a "Playable here" chip filters the grid the same way.
- Reels Instagram refused (`video: none`) show as "No local copy" with an Open on Instagram button — no embed, no New badge, not counted as unwatched.
- Captions (the note body) under the media in the pane and the players. (A "Tag from captions" button shipped and was withdrawn the same hour: the owner wants his own categories, not hashtags. The 218 auto-written tag lists were reverted.)
- The tag row shows the 24 busiest tags (selected ones always) with a More/Fewer toggle.
- The next reel is fetched ahead so auto-advance is instant; an embed sitting through the dwell is not marked watched; a "Tap for sound" pill appears when the webview only allowed muted playback.

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
