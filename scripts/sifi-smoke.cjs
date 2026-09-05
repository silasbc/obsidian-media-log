// Sifi's edition — bundle-level smoke test. Loads the built main.js with the
// same Obsidian stubs upstream's smoke test uses and checks the fork's wiring:
// merged defaults, item enrichment, the view's list pipeline, and TV list logic.
// Run: node scripts/sifi-smoke.cjs (after npm run build)
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class Plugin {
  constructor(app) {
    this.app = app;
  }
  async loadData() {
    return {};
  }
  async saveData() {}
}
class ItemView {
  constructor(leaf) {
    this.leaf = leaf;
    this.app = leaf && leaf.app;
  }
}
class PluginSettingTab {}
class Setting {}
class Modal {}
class Notice {}
const setIcon = () => {};

const source = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
const moduleRecord = { exports: {} };
vm.runInNewContext(source, {
  module: moduleRecord,
  exports: moduleRecord.exports,
  require(name) {
    if (name !== "obsidian") return require(name);
    return { Plugin, ItemView, PluginSettingTab, Setting, Modal, Notice, setIcon, requestUrl: async () => ({}), normalizePath: (v) => v };
  },
  console,
  URL,
  Date,
  Map,
  Set,
  JSON,
  Promise,
  window: {},
});

const MediaLogPlugin = moduleRecord.exports;
assert.equal(typeof MediaLogPlugin, "function", "bundle exports the plugin class");
// Arrays built inside the vm belong to its realm; strict deep-equal compares
// prototypes, so results are copied into this realm before comparing.
const ids = (list) => Array.from(list, (i) => i.id);
assert.ok(MediaLogPlugin.sifi && MediaLogPlugin.sifi.LibraryView, "fork layer is attached for testing");

const files = [
  { path: "Media Log/Items/reel.md", basename: "reel", stat: { mtime: 1 } },
  { path: "Media Log/Items/web.md", basename: "web", stat: { mtime: 2 } },
  { path: "Media Log/Items/old-reel.md", basename: "old-reel", stat: { mtime: 3 } },
];
const frontmatter = new Map([
  [files[0], {
    media_id: "ml-20260904-090000-instagram-instagram-reel-abc",
    platform: "Instagram",
    source_url: "https://www.instagram.com/reel/ABC/",
    captured_at: "2026-09-04 09:00:00",
    title: "Instagram Reel ABC",
    kind: "reel",
    preview_remote: "https://cdn.example.com/abc.jpg",
    embed_url: "https://www.instagram.com/reel/ABC/embed/captioned/",
    tags: ["Bench"],
  }],
  [files[1], {
    media_id: "ml-20260807-142800-web-example-domain",
    platform: "Web",
    source_url: "https://example.com/",
    captured_at: "2026-08-07 14:28:00",
    title: "Example Domain",
    watched: true,
  }],
  [files[2], {
    media_id: "ml-20250904-090000-instagram-instagram-reel-xyz",
    platform: "Instagram",
    source_url: "https://www.instagram.com/reel/XYZ/",
    title: "Instagram Reel XYZ",
    kind: "reel",
  }],
]);
const bodies = new Map([
  [files[0], "---\nmedia_id: x\n---\nFrug #lakepowell #fyp\n"],
  [files[1], "---\nmedia_id: y\n---\ntest capture — proving the pipeline works\n"],
  [files[2], "---\nmedia_id: z\n---\n"],
]);

const app = {
  vault: {
    getMarkdownFiles: () => files,
    cachedRead: async (file) => bodies.get(file) || "",
    getAbstractFileByPath: () => null,
  },
  metadataCache: { getFileCache: (file) => ({ frontmatter: frontmatter.get(file) }) },
  fileManager: { processFrontMatter: async (file, update) => update(frontmatter.get(file)) },
};

(async () => {
  const plugin = new MediaLogPlugin(app);
  await plugin.loadSettings();
  assert.equal(plugin.settings.pageSize, 64, "fork defaults are merged into settings");
  assert.equal(plugin.settings.portraitCards, true);
  assert.equal(plugin.settings.itemsFolder, "Media Log/Items", "upstream defaults survive");
  assert.equal(plugin.settings.guideNote, "Select/Guide/Media");
  assert.equal(plugin.settings.posterFrames, true);
  assert.equal(plugin.settings.bottomBar, true);
  assert.equal(MediaLogPlugin.sifi.BOTTOM_BAR_TABS.map((t) => t.label).join(","), "Home,Train,Health,Media,Mauston", "bottom bar mirrors tab bar v6");

  const items = await plugin.listItems();
  assert.equal(items.length, 3);
  const reel = items[0];
  assert.equal(reel.title, "Instagram Reel ABC");
  assert.equal(reel.previewRemote, "https://cdn.example.com/abc.jpg", "runner's remote preview is read");
  assert.equal(reel.kind, "reel");
  assert.equal(reel.dkey, "2026-09-04");
  assert.deepEqual(reel.tagsLow, ["bench"]);
  assert.equal(items[2].dkey, "2025-09-04", "dkey falls back to the media_id stamp");
  assert.equal(items[2].kind, "reel");
  assert.equal(items[1].kind, "link");

  const view = new MediaLogPlugin.sifi.LibraryView({ app }, plugin);
  view.items = items;
  view.todayMMDD = "09-04";
  assert.equal(view.filtered().length, 3, "no filters → everything");
  view.filter.onDay = true;
  assert.deepEqual(ids(view.filtered()), [items[0].id, items[2].id], "on this day spans years");
  view.filter.onDay = false;
  view.filter = { search: "", platform: "", tag: "", review: "" }; // upstream's Clear filters shape
  assert.equal(view.filtered().length, 3, "cleared fork keys are tolerated");
  view.filter.seed = 5;
  const deal = view.filtered();
  assert.ok(deal.length <= 64 && deal.length === 3, "a deal over 3 items is 3 items");
  view.filter.seed = null;
  view.filter.review = "unwatched";
  assert.deepEqual(ids(view.tvList("unwatched")), [items[0].id, items[2].id]);
  view.filter.review = "watched";
  assert.deepEqual(ids(view.tvList("unwatched")), [items[1].id], "TV falls back to all when nothing is unwatched");

  await MediaLogPlugin.sifi.loadCaptions(app, items, view.captionCache);
  assert.equal(items[0].caption, "Frug #lakepowell #fyp", "captions come from the note body");
  view.filter = { search: "lakepowell", platform: "", tag: "", review: "" };
  assert.deepEqual(ids(view.filtered()), [items[0].id], "search reaches caption text");
  assert.equal(view.captionCache.size, 3, "captions are cached per file");

  const modal = new MediaLogPlugin.sifi.TvPlayer(view, items, 1, { mode: "modal" });
  assert.equal(modal.modal, true);
  assert.equal(modal.auto, true, "the pop-up auto-advances by default (owner ask 2026-09-05)");
  view.autoAdvance = false;
  assert.equal(new MediaLogPlugin.sifi.TvPlayer(view, items, 1, { mode: "modal" }).auto, false, "the pause choice is remembered for the session");
  view.autoAdvance = true;
  assert.equal(modal.loop, false, "the phone pop-up stops at the list's edges");
  assert.equal(modal.idx, 1, "the pop-up opens on the tapped item");
  const tv = new MediaLogPlugin.sifi.TvPlayer(view, items, 0);
  assert.equal(tv.auto, true, "TV auto-advances");
  assert.equal(tv.loop, true, "TV loops");
  assert.equal(tv.dwell, 10, "dwell comes from settings (10s default)");

  console.log("Sifi smoke passed: merged defaults, item enrichment, list pipeline, TV list, caption search.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
