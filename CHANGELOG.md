# Changelog

## 1.2.0 — 2026-08-07

- Added durable watched and starred review state in item frontmatter.
- Added All / Unwatched / Watched / Starred filters with live counts.
- Added Previous/Next navigation through the filtered review set.
- Added playback for runner-provided local `video` files and HTTPS `embed_url` media, with screenshot fallback.
- Improved mobile review flow by bringing the selected detail above the grid.
- Added an automated release guard for private paths, hostnames, emails, credential-shaped strings, version drift, and missing release assets.

Release verification:

1. Run `npm run release:check`.
2. Confirm `git diff --exit-code -- main.js` after the release build is committed.
3. Scan every reachable Git object, not only the working tree, for private paths, private hostnames, emails, and credential shapes.
4. Attach `main.js`, `manifest.json`, and `styles.css` to the GitHub release whose tag exactly matches the manifest version.

## 1.1.0 — 2026-07-21

- Added URL-scheme capture parameters and iOS share-sheet setup documentation.

## 1.0.0 — 2026-07-21

- First public release.
