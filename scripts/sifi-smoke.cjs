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
let stubRequest = async () => ({}); // test G swaps this for a fake embed page

const source = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
const moduleRecord = { exports: {} };
vm.runInNewContext(source, {
  module: moduleRecord,
  exports: moduleRecord.exports,
  require(name) {
    if (name !== "obsidian") return require(name);
    return { Plugin, ItemView, PluginSettingTab, Setting, Modal, Notice, setIcon, requestUrl: (...a) => stubRequest(...a), normalizePath: (v) => v };
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
  assert.equal(plugin.settings.autoAdvance, true, "auto-advance is a remembered setting, on by default");
  assert.equal(plugin.settings.playerPlayableOnly, true, "players skip embeds by default");
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
  view.filter = { search: "", platform: "", tag: "", review: "" };
  assert.equal(view.playlist().length, 2, "no local files, streaming on → the playlist is the two Instagram reels (a web link cannot stream)");
  view.plugin.settings.streamRemote = false;
  assert.equal(view.playlist().length, 3, "streaming off, no local files → the playlist falls back to everything visible");
  assert.equal(view.listOpts().canStream, false);
  view.plugin.settings.streamRemote = true;
  assert.equal(view.listOpts().canStream, true, "default on");

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

  // 1.4.0-sifi.9: the phone pass — the players carry the swipe binding and the tag sheet
  const P = MediaLogPlugin.sifi.TvPlayer.prototype;
  for (const m of ["bindSwipe", "togglePause", "openTags", "closeTags", "deleteCurrent"]) assert.equal(typeof P[m], "function", `TvPlayer.${m} exists`);
  assert.equal(modal.hold, false, "a fresh player is not holding (no tag sheet open)");
  assert.equal(modal.sheet, null);
  assert.equal(modal.media, null, "nothing built until open()");
  modal.hold = true;
  modal.idx = 0;
  modal.step(1);
  assert.equal(modal.idx, 0, "step() is a no-op while the tag sheet holds the item");
  modal.hold = false;
  modal.closeTags(); // safe with no sheet and no overlay
  assert.equal(modal.hold, false);

  // 1.4.0-sifi.13: tags at import
  assert.equal(plugin.settings.tagAfterCapture, true, "share-sheet saves ask for tags by default");
  assert.deepEqual(Array.from(plugin.settings.recentTags), [], "no recent tags to start");
  for (const m of ["buildTagSheet", "decorateAddModal", "afterCapture"]) assert.equal(typeof MediaLogPlugin.sifi[m], "function", `sifi.${m} exists`);
  assert.equal(typeof MediaLogPlugin.sifi.TagSheetModal, "function");
  assert.equal(typeof view.openForTags, "function", "the view can open an item for tagging");
  plugin.settings.tagAfterCapture = false;
  await MediaLogPlugin.sifi.afterCapture(plugin, { path: "Media Log/Items/x.md" }); // setting off → a no-op, no view needed
  plugin.settings.tagAfterCapture = true;
  await MediaLogPlugin.sifi.afterCapture(plugin, null); // nothing created → a no-op

  console.log("Sifi smoke passed: merged defaults, item enrichment, list pipeline, TV list, caption search, phone-pass wiring, tags at import.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

// ---- G. StreamResolver: the embed page's link is cached, one request is shared, a miss is remembered ----
(async () => {
  const { StreamResolver } = MediaLogPlugin.sifi;
  const CTX = '\\"video_url\\":\\"https:\\\\\\/\\\\\\/scontent-x.cdninstagram.com\\\\\\/v\\\\\\/a.mp4?x=1&oe=7FFFFFFF\\"';
  let calls = 0;
  stubRequest = async (req) => {
    calls++;
    assert.match(req.url, /^https:\/\/www\.instagram\.com\/reel\/ABC\/embed/, "asks the reel's embed page");
    assert.ok(req.headers && /Safari/.test(req.headers["User-Agent"]), "browser user agent");
    return { status: 200, text: "<html>" + CTX + "</html>" };
  };
  const plugin = { settings: { streamRemote: true } };
  const r = new StreamResolver(plugin);
  const reel = { id: "ml-abc", kind: "reel", sourceUrl: "https://www.instagram.com/reel/ABC/", embedUrl: "https://www.instagram.com/reel/ABC/embed/captioned/" };
  const [u1, u2] = await Promise.all([r.resolve(reel), r.resolve(reel)]);
  assert.equal(u1, "https://scontent-x.cdninstagram.com/v/a.mp4?x=1&oe=7FFFFFFF");
  assert.equal(u2, u1);
  assert.equal(calls, 1, "two callers at once share one request");
  assert.equal(r.peek(reel), u1, "cached and fresh");
  assert.equal(await r.resolve(reel), u1);
  assert.equal(calls, 1, "a cached link is not fetched again");
  assert.equal(r.failed(reel), false);
  // a miss: remembered, not retried at once, reported
  stubRequest = async () => { calls++; return { status: 200, text: "<html>Log in</html>" }; };
  const walled = { id: "ml-wall", kind: "reel", video: "none", sourceUrl: "https://www.instagram.com/reel/ABC/" };
  assert.equal(r.can(walled), true, "a refused download is still streamable");
  assert.equal(await r.resolve(walled), "");
  assert.equal(r.failed(walled), true);
  assert.equal(await r.resolve(walled), "");
  assert.equal(calls, 2, "a fresh miss is not asked again");
  // a thrown request is a miss too
  stubRequest = async () => { calls++; throw new Error("offline"); };
  const offline = { id: "ml-off", kind: "reel", sourceUrl: "https://www.instagram.com/reel/OFF/" };
  assert.equal(await r.resolve(offline), "");
  assert.equal(r.failed(offline), true);
  // not streamable: posts, non-Instagram, and the setting off
  assert.equal(r.can({ id: "p", kind: "post", sourceUrl: "https://www.instagram.com/p/X/" }), false);
  assert.equal(r.can({ id: "w", kind: "link", sourceUrl: "https://example.com/" }), false);
  plugin.settings.streamRemote = false;
  assert.equal(r.can(reel), false);
  assert.equal(await r.resolve(reel), "", "off: nothing is fetched");
  assert.equal(calls, 3);
  assert.equal(MediaLogPlugin.sifi.SIFI_DEFAULTS.streamRemote, true, "default on");
  console.log("sifi smoke G: StreamResolver ok");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
