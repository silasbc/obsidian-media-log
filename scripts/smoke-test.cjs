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
const setIcon = () => {};

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
      setIcon,
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
    canonical_url: "https://example.com/newer",
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
  assert.equal(items[0].canonicalUrl, "https://example.com/newer");
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

// createItem: capture-time enrichment (kind/embed_url/fallback title) is
// wired into the real Add-item write path, not just exercised in isolation
// against src/browse.js.
(async () => {
  let written = null;
  const captureApp = {
    vault: {
      getAbstractFileByPath: () => null,
      createFolder: async () => {},
      create: async (path, content) => {
        written = { path, content };
        return { path, basename: path.split("/").pop().replace(/\.md$/, "") };
      },
    },
  };
  const plugin = new MediaLogPlugin(captureApp);
  plugin.settings = { itemsFolder: "Media Log/Items", assetsFolder: "Media Log/Assets", downloadImages: false };

  await plugin.createItem({
    url: "https://www.instagram.com/reel/ABC123/?igsh=1",
    title: "Log in • Instagram", // the login wall an anonymous fetch actually sees
    creator: "",
    tags: [],
    description: "",
    imageUrl: "",
  });
  assert.ok(written, "vault.create was called for the reel capture");
  assert.match(written.content, /title: "Instagram Reel ABC123"/, "login-wall title is replaced by the runner's fallback shape");
  assert.match(written.content, /embed_url: "https:\/\/www\.instagram\.com\/reel\/ABC123\/embed\/captioned\/"/, "embed_url is derived at capture time");
  assert.match(written.content, /kind: "reel"/, "kind is derived at capture time");

  await plugin.createItem({
    url: "https://example.com/some/article",
    title: "A regular article",
    creator: "Example",
    tags: [],
    description: "",
    imageUrl: "",
  });
  assert.doesNotMatch(written.content, /embed_url:/, "a non-media url gets no embed_url line");
  assert.doesNotMatch(written.content, /^kind:/m, "a non-media url gets no kind line");
  assert.match(written.content, /title: "A regular article"/, "an ordinary fetched title passes through unchanged");

  console.log("Smoke test passed: createItem writes capture-time embed_url, kind, and a login-wall-safe title.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
