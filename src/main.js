// Media Log — a media library for Obsidian.
// Save links from anywhere as durable Markdown item notes; browse them as a
// gallery with tags, filters, and a detail pane. Plain files first: every item
// is a readable note that outlives the plugin.

const {
  Plugin,
  ItemView,
  PluginSettingTab,
  Setting,
  Modal,
  Notice,
  requestUrl,
  normalizePath,
} = require("obsidian");

const VIEW_TYPE = "media-log-library";

const DEFAULT_SETTINGS = {
  itemsFolder: "Media Log/Items",
  assetsFolder: "Media Log/Assets",
  downloadImages: true,
};

const PLATFORMS = [
  { key: "YouTube", hosts: ["youtube.com", "youtu.be"] },
  { key: "X", hosts: ["x.com", "twitter.com"] },
  { key: "TikTok", hosts: ["tiktok.com"] },
  { key: "Instagram", hosts: ["instagram.com"] },
  { key: "Reddit", hosts: ["reddit.com", "redd.it"] },
];

function detectPlatform(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    for (const p of PLATFORMS) {
      if (p.hosts.some((h) => host === h || host.endsWith("." + h))) return p.key;
    }
    return "Web";
  } catch {
    return "Web";
  }
}

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return {
    id: `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`,
    display: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
  };
}

function slugify(text, max = 40) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max) || "item";
}

function decodeEntities(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function extractMeta(html) {
  const meta = {};
  const grab = (patterns) => {
    for (const re of patterns) {
      const m = html.match(re);
      if (m) return decodeEntities(m[1].trim());
    }
    return "";
  };
  meta.title = grab([
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
    /<title[^>]*>([^<]+)<\/title>/i,
  ]);
  meta.image = grab([
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
  ]);
  meta.siteName = grab([
    /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i,
  ]);
  meta.description = grab([
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
  ]);
  return meta;
}

module.exports = class MediaLogPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.registerView(VIEW_TYPE, (leaf) => new LibraryView(leaf, this));
    this.addRibbonIcon("library", "Open Media Log", () => this.activateView());
    this.addCommand({ id: "open-library", name: "Open library", callback: () => this.activateView() });
    this.addCommand({ id: "add-item", name: "Add media item from URL", callback: () => new AddItemModal(this.app, this).open() });
    this.registerObsidianProtocolHandler("media-log", () => this.activateView());
    this.addSettingTab(new MediaLogSettingTab(this.app, this));
  }

  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    workspace.revealLeaf(leaf);
  }

  async loadSettings() {
    this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) || {}) };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  // ---- item store ----------------------------------------------------------

  async listItems() {
    const folder = normalizePath(this.settings.itemsFolder);
    const items = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!file.path.startsWith(folder + "/")) continue;
      const cache = this.app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter;
      if (!fm || !fm.media_id) continue;
      items.push({
        file,
        id: fm.media_id,
        platform: fm.platform || "Web",
        title: fm.title || file.basename,
        creator: fm.creator || "",
        sourceUrl: fm.source_url || "",
        capturedAt: fm.captured_at || "",
        screenshot: fm.screenshot || "",
        tags: Array.isArray(fm.tags) ? fm.tags.map(String) : [],
      });
    }
    items.sort((a, b) => String(b.capturedAt || b.id).localeCompare(String(a.capturedAt || a.id)));
    return items;
  }

  async createItem({ url, title, creator, tags, description, imageUrl }) {
    const stamp = nowStamp();
    const platform = detectPlatform(url);
    const mediaId = `ml-${stamp.id}-${slugify(platform)}-${slugify(title || url, 24)}`;

    let screenshot = "";
    if (imageUrl && this.settings.downloadImages) {
      try {
        const resp = await requestUrl({ url: imageUrl, method: "GET", throw: false });
        if (resp.status < 400 && resp.arrayBuffer) {
          const ext = (imageUrl.match(/\.(png|jpe?g|webp|gif)(?=$|\?)/i)?.[1] || "jpg").replace("jpeg", "jpg");
          const assetDir = normalizePath(this.settings.assetsFolder);
          await this.ensureFolder(assetDir);
          screenshot = `${assetDir}/${mediaId}.${ext}`;
          await this.app.vault.adapter.writeBinary(screenshot, resp.arrayBuffer);
        }
      } catch {
        screenshot = "";
      }
    }

    const itemDir = normalizePath(this.settings.itemsFolder);
    await this.ensureFolder(itemDir);
    const path = `${itemDir}/${mediaId}.md`;
    const yamlEscape = (s) => String(s || "").replace(/"/g, '\\"');
    const lines = [
      "---",
      `media_id: "${mediaId}"`,
      `platform: "${platform}"`,
      `source_url: "${yamlEscape(url)}"`,
      `captured_at: "${stamp.display}"`,
      `creator: "${yamlEscape(creator)}"`,
      `title: "${yamlEscape(title || url)}"`,
      `screenshot: "${yamlEscape(screenshot)}"`,
      "tags: [" + (tags || []).map((t) => `"${yamlEscape(t)}"`).join(", ") + "]",
      "status: captured",
      "---",
      "",
      `# ${title || url}`,
      "",
      `Source: ${url}`,
      "",
    ];
    if (description) lines.push(description, "");
    if (screenshot) lines.push(`![[${screenshot}]]`, "");
    const file = await this.app.vault.create(path, lines.join("\n"));
    return file;
  }

  async ensureFolder(path) {
    const parts = path.split("/");
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        try {
          await this.app.vault.createFolder(current);
        } catch {}
      }
    }
  }

  async updateTags(item, tags) {
    await this.app.fileManager.processFrontMatter(item.file, (fm) => {
      fm.tags = tags;
    });
  }

  async deleteItem(item) {
    await this.app.fileManager.trashFile(item.file);
  }
};

// ---- Library view ----------------------------------------------------------

class LibraryView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.filter = { search: "", platform: "", tag: "" };
    this.selected = null;
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return "Media Log"; }
  getIcon() { return "library"; }

  async onOpen() {
    this.root = this.contentEl.createDiv({ cls: "mlog" });
    await this.render();
  }

  async render() {
    const items = await this.plugin.listItems();
    this.items = items;
    const root = this.root;
    root.empty();

    // Header
    const header = root.createDiv({ cls: "mlog__header" });
    header.createEl("h2", { cls: "mlog__title", text: "Media Log" });
    header.createSpan({ cls: "mlog__count", text: `${items.length} items` });
    const addBtn = header.createEl("button", { cls: "mod-cta", text: "Add item" });
    addBtn.addEventListener("click", () => new AddItemModal(this.app, this.plugin, () => this.render()).open());

    // Filters
    const filters = root.createDiv({ cls: "mlog__filters" });
    const search = filters.createEl("input", { type: "search", placeholder: "Search title, creator, URL…" });
    search.value = this.filter.search;
    search.addEventListener("input", () => {
      this.filter.search = search.value.toLowerCase();
      this.renderGrid();
    });
    const platformSel = filters.createEl("select");
    platformSel.createEl("option", { value: "", text: "All platforms" });
    for (const pf of [...new Set(items.map((i) => i.platform))].sort()) {
      const opt = platformSel.createEl("option", { value: pf, text: pf });
      if (pf === this.filter.platform) opt.selected = true;
    }
    platformSel.addEventListener("change", () => {
      this.filter.platform = platformSel.value;
      this.renderGrid();
    });
    const tagSel = filters.createEl("select");
    tagSel.createEl("option", { value: "", text: "All tags" });
    for (const tag of [...new Set(items.flatMap((i) => i.tags))].sort()) {
      const opt = tagSel.createEl("option", { value: tag, text: "#" + tag });
      if (tag === this.filter.tag) opt.selected = true;
    }
    tagSel.addEventListener("change", () => {
      this.filter.tag = tagSel.value;
      this.renderGrid();
    });

    // Body: grid + detail
    const body = root.createDiv({ cls: "mlog__body" });
    this.gridEl = body.createDiv({ cls: "mlog__grid" });
    this.detailEl = body.createDiv({ cls: "mlog__detail" });
    this.renderGrid();
    this.renderDetail();
  }

  filtered() {
    return (this.items || []).filter((it) => {
      if (this.filter.platform && it.platform !== this.filter.platform) return false;
      if (this.filter.tag && !it.tags.includes(this.filter.tag)) return false;
      if (this.filter.search) {
        const hay = `${it.title} ${it.creator} ${it.sourceUrl}`.toLowerCase();
        if (!hay.includes(this.filter.search)) return false;
      }
      return true;
    });
  }

  renderGrid() {
    const grid = this.gridEl;
    grid.empty();
    const list = this.filtered();
    if (list.length === 0) {
      const empty = grid.createDiv({ cls: "mlog__empty" });
      empty.createDiv({ text: (this.items || []).length === 0 ? "No media items yet." : "Nothing matches the filters." });
      if ((this.items || []).length === 0) {
        empty.createDiv({ cls: "mlog__empty-sub", text: 'Use "Add item" to save your first link.' });
      }
      return;
    }
    for (const item of list.slice(0, 200)) {
      const card = grid.createDiv({ cls: ["mlog-card", this.selected?.id === item.id ? "mlog-card--selected" : ""] });
      const thumb = card.createDiv({ cls: "mlog-card__thumb" });
      const shot = item.screenshot && this.app.vault.getAbstractFileByPath(item.screenshot);
      if (shot) {
        thumb.createEl("img", { attr: { src: this.app.vault.getResourcePath(shot), loading: "lazy" } });
      } else {
        thumb.createDiv({ cls: "mlog-card__placeholder", text: item.platform });
      }
      const body = card.createDiv({ cls: "mlog-card__body" });
      body.createDiv({ cls: "mlog-card__title", text: item.title });
      const metaRow = body.createDiv({ cls: "mlog-card__meta" });
      metaRow.createSpan({ cls: "mlog-chip", text: item.platform });
      if (item.creator) metaRow.createSpan({ text: item.creator });
      metaRow.createSpan({ cls: "mlog-card__date", text: String(item.capturedAt).slice(0, 10) });
      card.addEventListener("click", () => {
        this.selected = item;
        this.renderGrid();
        this.renderDetail();
      });
    }
    if (list.length > 200) {
      grid.createDiv({ cls: "mlog__empty-sub", text: `Showing 200 of ${list.length} — narrow the filters.` });
    }
  }

  renderDetail() {
    const d = this.detailEl;
    d.empty();
    const item = this.selected;
    if (!item) {
      d.createDiv({ cls: "mlog__empty-sub", text: "Select an item to see details." });
      return;
    }
    const shot = item.screenshot && this.app.vault.getAbstractFileByPath(item.screenshot);
    if (shot) {
      const img = d.createEl("img", { cls: "mlog-detail__img", attr: { src: this.app.vault.getResourcePath(shot) } });
      img.addEventListener("click", () => this.app.workspace.openLinkText(item.screenshot, "", false));
    }
    d.createEl("h3", { text: item.title });
    const meta = d.createDiv({ cls: "mlog-detail__meta" });
    meta.createSpan({ cls: "mlog-chip", text: item.platform });
    if (item.creator) meta.createSpan({ text: item.creator });
    if (item.capturedAt) meta.createSpan({ text: item.capturedAt });

    // Tags (editable)
    const tagWrap = d.createDiv({ cls: "mlog-detail__tags" });
    const renderTags = () => {
      tagWrap.empty();
      for (const tag of item.tags) {
        const chip = tagWrap.createSpan({ cls: "mlog-chip mlog-chip--tag", text: "#" + tag });
        const x = chip.createSpan({ cls: "mlog-chip__x", text: "×" });
        x.addEventListener("click", async () => {
          item.tags = item.tags.filter((t) => t !== tag);
          await this.plugin.updateTags(item, item.tags);
          renderTags();
        });
      }
      const input = tagWrap.createEl("input", { cls: "mlog-detail__taginput", type: "text", placeholder: "+ tag" });
      input.addEventListener("keydown", async (e) => {
        if (e.key === "Enter" && input.value.trim()) {
          const tag = input.value.trim().replace(/^#/, "");
          if (!item.tags.includes(tag)) {
            item.tags.push(tag);
            await this.plugin.updateTags(item, item.tags);
          }
          renderTags();
        }
      });
    };
    renderTags();

    // Actions
    const actions = d.createDiv({ cls: "mlog-detail__actions" });
    if (item.sourceUrl) {
      const open = actions.createEl("button", { cls: "mod-cta", text: "Open source" });
      open.addEventListener("click", () => window.open(item.sourceUrl, "_blank"));
    }
    const note = actions.createEl("button", { text: "Open note" });
    note.addEventListener("click", () => this.app.workspace.openLinkText(item.file.path, "", false));
    const del = actions.createEl("button", { cls: "mlog-detail__delete", text: "Delete" });
    del.addEventListener("click", async () => {
      await this.plugin.deleteItem(item);
      new Notice("Media Log: item moved to trash");
      this.selected = null;
      this.render();
    });
  }
}

// ---- Add item modal ---------------------------------------------------------

class AddItemModal extends Modal {
  constructor(app, plugin, onDone) {
    super(app);
    this.plugin = plugin;
    this.onDone = onDone;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Add media item" });
    const urlInput = contentEl.createEl("input", { cls: "mlog-modal__input", type: "text", placeholder: "Paste a URL…" });
    const titleInput = contentEl.createEl("input", { cls: "mlog-modal__input", type: "text", placeholder: "Title (fetched automatically if empty)" });
    const tagsInput = contentEl.createEl("input", { cls: "mlog-modal__input", type: "text", placeholder: "Tags, comma separated (optional)" });
    const status = contentEl.createDiv({ cls: "mlog-modal__status" });
    const row = contentEl.createDiv({ cls: "mlog-modal__row" });
    const save = row.createEl("button", { cls: "mod-cta", text: "Save" });
    const cancel = row.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
    urlInput.focus();

    save.addEventListener("click", async () => {
      const url = urlInput.value.trim();
      if (!url || !/^https?:\/\//i.test(url)) {
        status.setText("Enter a valid http(s) URL.");
        return;
      }
      save.disabled = true;
      status.setText("Fetching page metadata…");
      let meta = { title: "", image: "", siteName: "", description: "" };
      try {
        const resp = await requestUrl({ url, method: "GET", throw: false });
        if (resp.status < 400 && typeof resp.text === "string") meta = extractMeta(resp.text);
      } catch {}
      status.setText("Creating item…");
      try {
        const file = await this.plugin.createItem({
          url,
          title: titleInput.value.trim() || meta.title || url,
          creator: meta.siteName || "",
          description: meta.description || "",
          imageUrl: meta.image || "",
          tags: tagsInput.value.split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean),
        });
        new Notice(`Media Log: saved ${file.basename}`);
        this.close();
        if (this.onDone) this.onDone();
      } catch (e) {
        save.disabled = false;
        status.setText(`Failed: ${e.message || e}`);
      }
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ---- Settings ----------------------------------------------------------------

class MediaLogSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h3", { text: "Media Log" });

    new Setting(containerEl)
      .setName("Items folder")
      .setDesc("Vault folder where media item notes are stored.")
      .addText((t) =>
        t.setValue(this.plugin.settings.itemsFolder).onChange(async (v) => {
          this.plugin.settings.itemsFolder = v.trim() || DEFAULT_SETTINGS.itemsFolder;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Assets folder")
      .setDesc("Vault folder for downloaded preview images.")
      .addText((t) =>
        t.setValue(this.plugin.settings.assetsFolder).onChange(async (v) => {
          this.plugin.settings.assetsFolder = v.trim() || DEFAULT_SETTINGS.assetsFolder;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Download preview images")
      .setDesc("Save each page's preview image into the assets folder when adding items.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.downloadImages).onChange(async (v) => {
          this.plugin.settings.downloadImages = v;
          await this.plugin.saveSettings();
        })
      );
  }
}
