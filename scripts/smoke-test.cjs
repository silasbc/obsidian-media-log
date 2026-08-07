const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class Plugin {
  constructor(app) {
    this.app = app;
  }
}

class ItemView {}
class PluginSettingTab {}
class Setting {}
class Modal {}
class Notice {}

const source = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
const moduleRecord = { exports: {} };
vm.runInNewContext(source, {
  module: moduleRecord,
  exports: moduleRecord.exports,
  require(name) {
    if (name !== "obsidian") return require(name);
    return {
      Plugin,
      ItemView,
      PluginSettingTab,
      Setting,
      Modal,
      Notice,
      requestUrl: async () => ({}),
      normalizePath: (value) => value,
    };
  },
  console,
  URL,
  window: {},
});

const MediaLogPlugin = moduleRecord.exports;
assert.equal(typeof MediaLogPlugin, "function", "bundle exports the plugin class");

const files = [
  { path: "Media Log/Items/older.md", basename: "older" },
  { path: "Media Log/Items/newer.md", basename: "newer" },
  { path: "Elsewhere/ignored.md", basename: "ignored" },
];
const frontmatter = new Map([
  [files[0], {
    media_id: "ml-20260101-090000-web-older",
    captured_at: "2026-01-01 09:00:00",
    title: "Older",
    watched: true,
  }],
  [files[1], {
    media_id: "ml-20260201-090000-web-newer",
    title: "Newer",
    video: "Media Log/Assets/newer.mp4",
    embed_url: "https://example.com/embed/newer",
    starred: true,
  }],
  [files[2], { media_id: "ml-20260301-090000-web-ignored" }],
]);

const app = {
  vault: { getMarkdownFiles: () => files },
  metadataCache: { getFileCache: (file) => ({ frontmatter: frontmatter.get(file) }) },
  fileManager: {
    processFrontMatter: async (file, update) => update(frontmatter.get(file)),
  },
};

(async () => {
  const plugin = new MediaLogPlugin(app);
  plugin.settings = { itemsFolder: "Media Log/Items" };
  const items = await plugin.listItems();
  assert.equal(items.length, 2, "only configured-folder item notes are listed");
  assert.equal(items[0].title, "Newer", "media_id timestamp is the sort fallback");
  assert.equal(items[0].video, "Media Log/Assets/newer.mp4");
  assert.equal(items[0].embedUrl, "https://example.com/embed/newer");
  assert.equal(items[0].starred, true);
  assert.equal(items[1].watched, true);

  await plugin.updateReviewState(items[0], "watched", true);
  assert.equal(frontmatter.get(files[1]).watched, true, "review state writes to frontmatter");
  await plugin.updateReviewState(items[0], "starred", false);
  assert.equal("starred" in frontmatter.get(files[1]), false, "false review state removes the key");

  console.log("Smoke test passed: item discovery, sorting, playback fields, and review-state writes.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
