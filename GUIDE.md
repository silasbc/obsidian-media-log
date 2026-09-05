# Media Log — the guide

This walkthrough is for two readers at once: a person setting up Media Log in an Obsidian vault, and an AI agent that has been pointed at this repository and asked to install, configure, or extend it. Everything here describes version 1.4.0.

## How it works

Media Log is a visual library over ordinary Markdown files:

```text
Media Log/
  Items/   # one Markdown note per saved link
  Assets/  # optional downloaded preview images
```

Adding a URL fetches public page metadata, writes a note with stable frontmatter, and optionally downloads the page's preview image into the vault. The Library reads those files directly and renders them as searchable cards. Watched and starred state is written back to the same note; there is no database to export or migrate.

The file-first design is the important contract. A runner, import script, mobile shortcut, or agent can create compatible item notes without controlling the plugin. Media Log then picks them up on the next vault change.

## Install

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release into `<your vault>/.obsidian/plugins/media-log/`.
2. Enable **Media Log** in Settings → Community plugins.
3. Open the Library from its ribbon icon, the command palette command *Media Log: Open library*, or `obsidian://media-log`.

The plugin creates its configured folders as needed. It makes network requests only when adding an item or downloading its preview; browsing existing items is local.

## Configure it for your vault

Open Settings → Media Log:

| Setting | Default | What it controls |
| --- | --- | --- |
| Items folder | `Media Log/Items` | Where item Markdown notes are written and scanned. Point this at an existing collection if it already follows the item format. |
| Assets folder | `Media Log/Assets` | Where downloaded preview images are saved. |
| Download preview images | On | Turn off for URL-and-metadata-only capture with no local image copy. |

Folder paths are vault-relative. Keep Items and Assets separate if another tool watches or syncs only the text collection.

## The workflows it enables

### Save a link inside Obsidian

Run *Media Log: Add media item from URL*, paste a URL, review the fetched title and description, add comma-separated tags, and save. The item appears newest-first in the Library.

### Save from iPhone or iPad

Create an Apple Shortcut that accepts a shared URL, URL-encodes it, and opens:

```text
obsidian://media-log?url=<encoded URL>
```

Add `&autosave=false` to review the form before writing. Add `&vault=<encoded vault name>` when the device has multiple vaults.

### Review a collection

Use the platform, tag, watched, and starred filters to define the current set. Opening an item marks it watched; Star keeps it visible as a keeper. Previous and Next stay inside the filtered set, so a queue can be processed without returning to the grid after every item. Card titles and metadata can be drag-selected without opening the item. In detail, Source and optional Canonical URLs remain selectable and also have one-tap copy controls.

### Feed Media Log from an agent or runner

Write one Markdown file per item into the configured Items folder. The required interoperability fields are `media_id`, `platform`, `source_url`, `captured_at`, `creator`, `title`, and `status`. Optional `canonical_url`, `screenshot`, `video`, `embed_url`, `tags`, `watched`, and `starred` fields progressively enhance the Library. [RUNNER.md](RUNNER.md) gives a self-hosted companion-runner recipe while keeping private capture infrastructure out of this public repository.

### Leave cleanly

Disable or remove the plugin and keep the notes. They remain readable, linkable, searchable Markdown. Deleting an item from the Library uses Obsidian's vault trash rather than permanent deletion.

## Troubleshooting

- **A saved item has only a URL** — some sites limit public metadata. Edit the item note or use the add form's title field; the URL is still durable.
- **Preview images do not appear** — confirm Download preview images is on and the Assets folder is writable. Remote-only screenshot values are supported, but local paths must be vault-relative.
- **An agent-written item is missing** — verify the file is under the configured Items folder and contains parseable YAML frontmatter with a `source_url`.
- **Video does not play** — local `video` must be a vault-relative file path; `embed_url` must be HTTPS. The detail pane falls back to the screenshot when playback is unavailable.
