# Media Log

Save links as durable Markdown media items and browse them as a visual library inside Obsidian.

Every saved item is a plain, readable Markdown note with YAML frontmatter — no database, no lock-in. The plugin gives those notes a gallery: cards with preview images, platform and tag filters, search, and a detail pane with editable tags. Delete is reversible (items go to your vault trash).

## How it works

- **Add item** (button or command palette → *Media Log: Add media item from URL*): paste a URL. The plugin fetches the page title, site name, description, and preview image, detects the platform (YouTube, X, TikTok, Instagram, Reddit, or generic web), and writes one item note into your items folder.
- **Library** (ribbon icon, command palette, or `obsidian://media-log`): browse items newest-first. Filter by platform or tag, search titles/creators/URLs, click a card for the detail pane.
- **Detail pane**: preview image, metadata, tag editing (writes back to the note's frontmatter), open source, open note, reversible delete.

## Item format

```markdown
---
media_id: "ml-20260708-213000-youtube-how-to-sharpen-a-chisel"
platform: "YouTube"
source_url: "https://www.youtube.com/watch?v=…"
captured_at: "2026-07-08 21:30:00"
creator: "YouTube"
title: "How to sharpen a chisel"
screenshot: "Media Log/Assets/ml-….jpg"
tags: ["woodworking"]
status: captured
---
```

Notes are yours: rename them, link them, query them with Dataview, or stop using the plugin entirely — the library is just Markdown.

## Settings

- **Items folder** (default `Media Log/Items`) — where item notes are created and read from.
- **Assets folder** (default `Media Log/Assets`) — where preview images are saved.
- **Download preview images** — toggle off to save links only.

## Notes & limitations

- Metadata fetching uses Obsidian's built-in request API. Some sites (notably X/Twitter and Instagram) return limited metadata without a logged-in session; items still save with the URL and any title you type.
- Works on desktop and mobile.
- The plugin never writes outside the two configured folders, and never deletes permanently — removals go to the vault trash.

## Installing (manual, until community release)

Copy `manifest.json`, `main.js`, and `styles.css` into `<your vault>/.obsidian/plugins/media-log/`, then enable **Media Log** in Settings → Community plugins.

## Building from source

```bash
npm install   # or: bun install
npm run build # bundles src/main.js → main.js
```

## License

MIT
