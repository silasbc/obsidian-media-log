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

## URL scheme

`obsidian://media-log` opens the library. Pass a `url` parameter to save an item instead:

```
obsidian://media-log?url=<url-encoded link>
```

Optional parameters: `title` and `tags` (comma separated) prefill those fields; `autosave=false` opens the Add dialog for review instead of saving immediately; `vault=<name>` targets a specific vault if you have several.

## Saving links from iOS (share sheet shortcut)

Feed links straight from Safari, YouTube, or any app's share sheet using a one-time Shortcuts setup:

1. Open the **Shortcuts** app → **+** to create a new shortcut.
2. Tap the shortcut's name → **rename** it *Save to Media Log* (this is the name you'll see in the share sheet).
3. Tap the info button (ⓘ) → enable **Show in Share Sheet**. Under "Receive", limit input types to **URLs** and **Safari web pages**.
4. Add these actions in order:
   - **URL Encode** — set its input to **Shortcut Input**.
   - **URL** — set it to `obsidian://media-log?url=` followed by the **URL Encoded Text** variable (tap the field and pick the variable from the bar above the keyboard).
   - **Open URLs** (sometimes shown as **Open URL**).
5. Done. Now share any link → scroll the share sheet → **Save to Media Log**. Obsidian opens, saves the item (fetching title and preview image), and shows a confirmation notice.

Tips:

- If you have more than one vault on the device, use `obsidian://media-log?vault=YourVaultName&url=` in the URL action so it always opens the right one.
- Prefer to review before saving? Append `&autosave=false` and the Add dialog opens prefilled instead.
- The same scheme works on macOS — e.g. a Raycast/Alfred script or `open "obsidian://media-log?url=..."` in Terminal.

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
