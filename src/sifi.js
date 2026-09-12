// Media Log, Sifi's edition — the browse-tools layer.
//
// Everything here subclasses or wraps upstream's classes so upstream merges
// stay clean: main.js only registers sifi.LibraryView / sifi.SettingTab and
// calls browse.enrichItem. The rules and roadmap live in FORK.md.
//
// What this adds on top of upstream's library:
//   - Random <page>, On this day, and search that also covers caption text
//   - sort control, month filter, tag chips (AND) with an Untagged chip,
//     platform counts in the dropdown
//   - paging at <page> items with month headers, First/Last and a range badge
//   - the library re-reads itself when the runner writes, plus a Refresh button
//   - poster-frame thumbnails generated from local reels (no runner needed)
//   - phone image discipline: thumbnails only near the viewport, ~24 live
//   - an error card instead of a blank view when a render throws
//   - autoplaying detail player sized 9:16 for reels, remote-preview fallback
//   - TV mode: full-screen loop through the current filters, auto-advance
//   - phone pop-up player: a tap opens the item full-screen inside the tap itself
//   - a vertical flick steps the players like a reel feed; tap pauses the pop-up
//   - a tag sheet inside the players: tap-to-toggle chips with counts, new tags
//   - a bottom bar inside the view on phones, hidden while a player is open
//   - Guide button, duplicate scan with keep-one and a quarantine log
"use strict";

const { Modal, Notice, Setting, setIcon, requestUrl } = require("obsidian");
const browse = require("./browse");

const SIFI_DEFAULTS = {
  pageSize: 64,
  portraitCards: true,
  tvDwellSecs: 10, // owner ask 2026-09-05: about ten seconds for a plain meme
  quarantineLog: "Media Log/Deleted Media.md",
  guideNote: "Select/Guide/Media",
  posterFrames: true,
  bottomBar: true,
  autoAdvance: true, // owner ask 2026-09-05: a visible, remembered toggle
  playerPlayableOnly: true, // the pop-up and TV play only what plays on this device
  streamRemote: true, // owner 2026-09-05 ("if streaming fixes it then do that"): no local copy → stream from Instagram
  tagAfterCapture: true, // owner 2026-09-11: a share-sheet save opens the new item with the tag sheet up
  recentTags: [], // the tags used last, newest first — they lead the sheet
};
const RECENT_TAGS_MAX = 8;
const META_BUDGET_MS = 4000; // a share-sheet save waits this long for the page's title, then saves without it
const THUMB_LIVE_MAX = 24;
const WATCH_DWELL_MS = 3000;
const TICK_MS = 500;
const CONTROLS_FADE_MS = 2500;
const REFRESH_DEBOUNCE_MS = 900;
const TAG_CHIP_LIMIT = 24; // the busiest tags first; the rest behind a More toggle
const POSTER_MAX_WIDTH = 540;
const POSTER_TIMEOUT_MS = 12000;
const STREAM_MARGIN_MS = 10 * 60 * 1000; // a cached Instagram link is dropped this long before it expires
const STREAM_FAIL_TTL_MS = 15 * 60 * 1000; // a miss is remembered this long before Instagram is asked again
const STREAM_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const isVid = (media) => !!media && (media.kind === "video" || media.kind === "stream");

// The shared Select bottom bar's tabs (staging/lib/tabbar-snippet.js v6), so
// the plugin view on a phone offers the same doors as every note surface.
const BOTTOM_BAR_TABS = [
  { label: "Home", link: "Home", icon: "<path d='M3 10.5 12 3l9 7.5'/><path d='M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5'/>" },
  { label: "Train", link: "Dashboard", icon: "<path d='M8 12h8'/><rect x='4' y='7.5' width='3' height='9' rx='1'/><rect x='17' y='7.5' width='3' height='9' rx='1'/><path d='M2 10.5v3'/><path d='M22 10.5v3'/>" },
  { label: "Health", link: "Health Dashboard", icon: "<path d='M12 20.5 4.6 13a5 5 0 0 1 7-7.1l.4.4.4-.4a5 5 0 0 1 7 7.1z'/>" },
  { label: "Media", link: "Media Library", icon: "<rect x='3' y='5' width='18' height='14' rx='2'/><path d='m10 9.2 4.6 2.8-4.6 2.8z'/>" },
  { label: "Mauston", link: "Mauston/Mauston", icon: "<path d='M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z'/><path d='M9 4v14'/><path d='M15 6v14'/>" },
];
const svgIcon = (p) =>
  "<svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>" + p + "</svg>";

function build({ LibraryView, MediaLogSettingTab, DEFAULT_SETTINGS, hasTextSelectionWithin }) {
  // Fork settings ride along with upstream's defaults; loadSettings spreads them.
  Object.assign(DEFAULT_SETTINGS, SIFI_DEFAULTS);

  const textSelected = typeof hasTextSelectionWithin === "function" ? hasTextSelectionWithin : () => false;
  const isPhone = () =>
    typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 700px)").matches;
  const isMobileApp = (app) => !!(app && app.isMobile);

  // A render that throws renders words, never a blank view.
  function guard(view, names) {
    for (const name of names) {
      const orig = view[name];
      if (typeof orig !== "function") continue;
      view[name] = function guarded(...args) {
        try {
          const r = orig.apply(this, args);
          return r && typeof r.then === "function" ? r.catch((e) => this.renderError(e)) : r;
        } catch (e) {
          this.renderError(e);
          return undefined;
        }
      };
    }
  }

  // Vault screenshot first, the runner's remote preview second, nothing third.
  function thumbSrc(app, item) {
    const shot = item.screenshot && app.vault.getAbstractFileByPath(item.screenshot);
    if (shot) return app.vault.getResourcePath(shot);
    return item.previewRemote || "";
  }

  // Re-render inside the nearest scrolling ancestor without losing its scroll position.
  function withScrollKept(el, fn) {
    let scroller = el;
    while (scroller && scroller !== document.body) {
      const cs = getComputedStyle(scroller);
      if (/(auto|scroll)/.test(cs.overflowY) && scroller.scrollHeight > scroller.clientHeight) break;
      scroller = scroller.parentElement;
    }
    const top = scroller ? scroller.scrollTop : 0;
    fn();
    if (scroller) scroller.scrollTop = top;
  }

  // ---- thumbnails: a live-image budget on phones ----------------------------
  // Desktop keeps upstream's eager <img loading="lazy">. On a phone, a real
  // <img> exists only near the viewport, at most THUMB_LIVE_MAX at once; cards
  // scrolled far away recycle back to their placeholder.
  class ThumbBudget {
    constructor() {
      this.io = null;
      this.live = [];
    }

    bind(holder, src, phone) {
      if (!phone) {
        this.attach(holder, src, false);
        return;
      }
      holder._mlogSrc = src;
      if (!this.io) {
        try {
          this.io = new IntersectionObserver(
            (entries) => {
              for (const en of entries) {
                const h = en.target;
                if (en.isIntersecting) {
                  if (!h._mlogImg && h._mlogSrc) this.attach(h, h._mlogSrc, true);
                } else if (h._mlogImg) {
                  this.detach(h);
                }
              }
            },
            { rootMargin: "600px 0px" }
          );
        } catch {
          this.attach(holder, src, false); // webview without IntersectionObserver → eager
          return;
        }
      }
      this.io.observe(holder);
    }

    attach(holder, src, budgeted) {
      if (holder._mlogImg) return;
      const img = holder.createEl("img", {
        cls: "mlog-thumb--live",
        attr: { src, alt: "", loading: "lazy", decoding: "async" },
      });
      img.addEventListener("error", () => {
        holder._mlogImg = null;
        img.remove(); // dead thumb → the placeholder underneath shows through
      });
      holder._mlogImg = img;
      if (!budgeted) return;
      this.live.push(holder);
      if (this.live.length > THUMB_LIVE_MAX) {
        const old = this.live.shift();
        if (old && old !== holder) this.detach(old);
      }
    }

    detach(holder) {
      const img = holder._mlogImg;
      holder._mlogImg = null;
      this.live = this.live.filter((h) => h !== holder);
      if (img) img.remove();
    }

    reset() {
      if (this.io) {
        try {
          this.io.disconnect();
        } catch {}
      }
      this.live = [];
    }
  }

  // ---- captions: one lazy bulk read, kicked the first time search is used ----
  async function loadCaptions(app, items, cache) {
    await Promise.all(
      (items || []).map(async (it) => {
        if (!it.file) return;
        const key = it.file.path + ":" + (it.file.stat ? it.file.stat.mtime : 0);
        if (cache.has(key)) {
          it.caption = cache.get(key);
          return;
        }
        try {
          it.caption = browse.commentPreview(await app.vault.cachedRead(it.file));
        } catch {
          it.caption = "";
        }
        cache.set(key, it.caption);
      })
    );
  }

  // One honest line for an item that is not playing a local video (owner: "like
  // that charlie munger didnt auto play").
  function whyNoVideo(app, item, streams) {
    const v = String(item.video || "");
    if (v && v !== "none" && app.vault.getAbstractFileByPath(v)) return "";
    if (streams && streams.can(item)) {
      if (!streams.failed(item)) return "Streaming from Instagram — no local copy on this device.";
      return v === "none"
        ? "Instagram would not hand over this video just now, and there is no copy anywhere — open it on Instagram."
        : "Instagram would not hand over this video just now — playing its embed instead, which will not autoplay.";
    }
    if (v === "none") return "Instagram refused this download five times — no copy to play; open it on Instagram.";
    if (v) return "The video file has not synced to this device yet — playing Instagram's embed, which will not autoplay.";
    if (item.kind === "post") return "An Instagram post (image); no video was captured for it.";
    if (/^https:/.test(item.embedUrl || "")) return "No local video — playing Instagram's embed, which will not autoplay.";
    return "";
  }

  // ---- streaming from Instagram -----------------------------------------------
  // No local copy on this device? The reel's embed page, fetched with a plain
  // request, carries Instagram's own CDN link for the video (good for about a
  // day). The players stream it in a native <video>, which autoplays where the
  // embed never does. Links are cached per item for the session; a miss is
  // remembered briefly so a wall is never hammered. One resolver per plugin.
  class StreamResolver {
    constructor(plugin) {
      this.plugin = plugin;
      this.cache = new Map(); // item id → { url, expires, fetched }
      this.inflight = new Map(); // item id → promise
      this.fails = new Map(); // item id → when it last missed
    }

    enabled() {
      return this.plugin.settings.streamRemote !== false;
    }

    can(item) {
      return this.enabled() && browse.isStreamable(item);
    }

    failed(item) {
      const at = item && this.fails.get(item.id);
      return !!at && Date.now() - at < STREAM_FAIL_TTL_MS;
    }

    // A fresh cached link, or "".
    peek(item) {
      const e = item && this.cache.get(item.id);
      return e && browse.streamFresh(e, Date.now(), STREAM_MARGIN_MS) ? e.url : "";
    }

    async resolve(item) {
      if (!this.can(item)) return "";
      const hit = this.peek(item);
      if (hit) return hit;
      if (this.failed(item)) return "";
      if (this.inflight.has(item.id)) return this.inflight.get(item.id);
      const p = this.fetch(item).finally(() => this.inflight.delete(item.id));
      this.inflight.set(item.id, p);
      return p;
    }

    async fetch(item) {
      const page = browse.embedPageFor(item);
      try {
        const r = await requestUrl({ url: page, method: "GET", headers: { "User-Agent": STREAM_UA, Accept: "text/html" }, throw: false });
        const url = r && r.status === 200 ? browse.extractVideoUrl(r.text) : "";
        if (!url) {
          this.fails.set(item.id, Date.now());
          return "";
        }
        this.cache.set(item.id, { url, expires: browse.cdnExpiry(url), fetched: Date.now() });
        this.fails.delete(item.id);
        return url;
      } catch (e) {
        this.fails.set(item.id, Date.now());
        return "";
      }
    }
  }

  // play() with the fallback the phones need: refused sound → play muted, say so.
  // `prime` is the call made inside a tap before a stream has a source: it only
  // unlocks the element for later playback and must never trigger the fallback.
  function tryPlay(player, onMuted, prime) {
    if (typeof player.play !== "function") return;
    const p = player.play();
    if (!p || typeof p.catch !== "function") return;
    p.catch(() => {
      if (prime || !player.isConnected || !player.getAttribute("src")) return;
      player.muted = true; // the webview refused sound without a gesture — play muted rather than not at all
      const q = player.play();
      if (q && typeof q.catch === "function") q.catch(() => {});
      if (onMuted) onMuted(player);
    });
  }

  // ---- the media element, shared by the detail pane and the players -----------
  // Local video → stream from Instagram → embed → image (vault screenshot or
  // remote preview) → placeholder.
  function buildMedia(app, container, item, opts) {
    const o = opts || {};
    const cls = "mlog-detail__media " + (browse.isPortrait(item) ? "mlog-detail__media--portrait" : "mlog-detail__media--wide");
    const shot = item.screenshot && app.vault.getAbstractFileByPath(item.screenshot);
    const poster = shot ? app.vault.getResourcePath(shot) : item.previewRemote || "";
    const video = item.video && item.video !== "none" && app.vault.getAbstractFileByPath(item.video);
    const streams = o.streams;
    if (!video && streams && streams.can(item)) {
      // The element is made now, inside the tap that opened the player (iOS keeps
      // the gesture for sound); the source lands when the link does. If Instagram
      // will not hand it over, the embed or the gone card takes the element's place.
      const attr = { preload: "auto", playsinline: "" };
      if (o.controls !== false) attr.controls = ""; // the phone pop-up is tap-to-pause instead
      if (o.autoplay) attr.autoplay = "";
      if (o.loop) attr.loop = "";
      const known = streams.peek(item);
      if (known) attr.src = known;
      const player = container.createEl("video", { cls, attr });
      if (poster) player.setAttribute("poster", poster);
      if (o.onEnded) player.addEventListener("ended", o.onEnded);
      if (known) {
        if (o.autoplay) tryPlay(player, o.onMuted);
      } else {
        if (o.autoplay) tryPlay(player, null, true);
        streams.resolve(item).then((url) => {
          if (!player.isConnected) return;
          if (url) {
            player.src = url;
            if (o.autoplay) tryPlay(player, o.onMuted);
            return;
          }
          const tmp = document.createElement("div");
          const fb = buildMedia(app, tmp, item, Object.assign({}, o, { streams: null }));
          player.replaceWith(fb.el);
          if (o.onFallback) o.onFallback(fb);
        });
      }
      return { kind: "stream", el: player };
    }
    if (browse.isGone(item)) {
      // Instagram refused the download five times: the reel is private or removed.
      // No embed (it only ends in "watch on Instagram"); a plain card instead.
      const gone = container.createDiv({ cls: cls + " mlog-detail__media--gone" });
      gone.createDiv({ cls: "mlog-detail__gone-title", text: "No local copy" });
      gone.createDiv({ cls: "mlog-detail__gone-sub", text: "Instagram refused the download five times — private, removed, or walled." });
      if (item.sourceUrl) {
        const open = gone.createEl("button", { cls: "mod-cta", text: "Open on Instagram" });
        open.addEventListener("click", (e) => {
          e.stopPropagation();
          window.open(item.sourceUrl, "_blank");
        });
      }
      return { kind: "none", el: gone };
    }
    if (video) {
      const attr = { preload: "auto", playsinline: "", src: app.vault.getResourcePath(video) };
      if (o.controls !== false) attr.controls = "";
      if (o.autoplay) attr.autoplay = "";
      if (o.loop) attr.loop = "";
      const player = container.createEl("video", { cls, attr });
      if (poster) player.setAttribute("poster", poster);
      if (o.onEnded) player.addEventListener("ended", o.onEnded);
      if (o.autoplay) tryPlay(player, o.onMuted);
      return { kind: "video", el: player };
    }
    if (/^https:\/\//i.test(item.embedUrl)) {
      const iframe = container.createEl("iframe", {
        cls,
        attr: {
          src: o.autoplay ? browse.autoplayUrl(item.embedUrl) : item.embedUrl,
          title: `Embedded media: ${item.title}`,
          loading: "lazy",
          allow: "autoplay; encrypted-media; picture-in-picture",
          allowfullscreen: "",
          referrerpolicy: "strict-origin-when-cross-origin",
          sandbox: "allow-scripts allow-same-origin allow-presentation",
        },
      });
      return { kind: "embed", el: iframe };
    }
    if (poster) {
      const img = container.createEl("img", { cls, attr: { src: poster, alt: "" } });
      img.addEventListener("error", () => img.remove());
      if (shot) img.addEventListener("click", () => app.workspace.openLinkText(item.screenshot, "", false));
      return { kind: "image", el: img };
    }
    const ph = container.createDiv({ cls: cls + " mlog-detail__media--empty", text: item.platform || "No media" });
    return { kind: "none", el: ph };
  }

  // ---- poster frames: real thumbnails from the local reels --------------------
  // The runner's remote preview for a login-walled reel is Instagram's generic
  // logo. When a local video exists and no screenshot does, grab one frame,
  // write it as the plugin's own screenshot asset, and set the field. Runs on
  // desktop only, one video at a time, and never touches items that already
  // have a screenshot.
  class PosterFactory {
    constructor(plugin) {
      this.plugin = plugin;
      this.app = plugin.app;
      this.running = false;
      this.done = 0;
      this.failed = 0;
    }

    candidates(items) {
      const vault = this.app.vault;
      return browse.posterCandidates(
        items,
        (it) => !!vault.getAbstractFileByPath(it.video),
        (it) => !!vault.getAbstractFileByPath(it.screenshot)
      );
    }

    async run(items, hooks) {
      if (this.running) return;
      const list = this.candidates(items);
      if (!list.length) return;
      const h = hooks || {};
      this.running = true;
      this.done = 0;
      this.failed = 0;
      try {
        for (const item of list) {
          if (!this.running) break;
          try {
            if (await this.makePoster(item)) {
              this.done++;
              if (h.onEach) h.onEach(item);
            } else {
              this.failed++;
            }
          } catch {
            this.failed++;
          }
          await new Promise((r) => setTimeout(r, 60));
        }
        if (this.done) new Notice(`Media Log: ${this.done} poster frame${this.done === 1 ? "" : "s"} written${this.failed ? `, ${this.failed} skipped` : ""}`);
      } finally {
        this.running = false;
        if (h.onDone) h.onDone(this.done, this.failed);
      }
    }

    stop() {
      this.running = false;
    }

    async makePoster(item) {
      const vault = this.app.vault;
      const file = vault.getAbstractFileByPath(item.video);
      if (!file) return false;
      const dest = browse.posterPath(item, this.plugin.settings.assetsFolder);
      if (!vault.getAbstractFileByPath(dest)) {
        // A blob URL is same-origin, so the canvas is never tainted.
        const bytes = await vault.readBinary(file);
        const url = URL.createObjectURL(new Blob([bytes], { type: "video/mp4" }));
        let blob = null;
        try {
          blob = await this.frameOf(url);
        } finally {
          URL.revokeObjectURL(url);
        }
        if (!blob) return false;
        await this.plugin.ensureFolder(String(this.plugin.settings.assetsFolder));
        await vault.createBinary(dest, await blob.arrayBuffer());
      }
      await this.app.fileManager.processFrontMatter(item.file, (fm) => {
        fm.screenshot = dest;
      });
      item.screenshot = dest;
      return true;
    }

    frameOf(src) {
      return new Promise((resolve) => {
        const video = document.createElement("video");
        let settled = false;
        const cleanup = () => {
          clearTimeout(timer);
          try {
            video.pause();
            video.removeAttribute("src");
            video.load();
          } catch {}
          video.remove();
        };
        const finish = (v) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(v);
        };
        const timer = setTimeout(() => finish(null), POSTER_TIMEOUT_MS);
        video.muted = true;
        video.playsInline = true;
        video.preload = "auto";
        video.addEventListener("error", () => finish(null));
        video.addEventListener("loadedmetadata", () => {
          const d = Number.isFinite(video.duration) ? video.duration : 2;
          try {
            video.currentTime = Math.min(1, Math.max(0.1, d * 0.1));
          } catch {
            finish(null);
          }
        });
        video.addEventListener("seeked", () => {
          try {
            const w = video.videoWidth;
            const hgt = video.videoHeight;
            if (!w || !hgt) {
              finish(null);
              return;
            }
            const scale = Math.min(1, POSTER_MAX_WIDTH / w);
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(w * scale);
            canvas.height = Math.round(hgt * scale);
            canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => finish(blob || null), "image/jpeg", 0.82);
          } catch {
            finish(null);
          }
        });
        video.style.cssText = "position:fixed;left:-9999px;top:0;width:10px;height:10px;opacity:0;pointer-events:none;";
        document.body.appendChild(video);
        video.src = src;
      });
    }
  }

  // ---- duplicate scan: keep one, trash the rest, log it ----------------------
  async function appendQuarantine(plugin, lines) {
    const app = plugin.app;
    const path = String(plugin.settings.quarantineLog || SIFI_DEFAULTS.quarantineLog);
    const existing = app.vault.getAbstractFileByPath(path);
    if (existing) {
      await app.vault.process(existing, (txt) => String(txt).replace(/\s+$/, "") + "\n" + lines.join("\n") + "\n");
      return;
    }
    const dir = path.split("/").slice(0, -1).join("/");
    if (dir) await plugin.ensureFolder(dir);
    await app.vault.create(
      path,
      "---\ntype: media-quarantine\n---\n\n# Deleted Media\n\nItems trashed by Media Log's duplicate scan. Every one is recoverable from Obsidian's trash.\n\n" +
        lines.join("\n") +
        "\n"
    );
  }

  // Obsidian trash (reversible) via upstream's deleteItem; stops at the first failure.
  async function keepOne(plugin, view, group, keep) {
    const others = browse.othersOf(group, keep);
    const stamp = browse.stampNow(new Date());
    const lines = [];
    let trashed = 0;
    let error = "";
    for (const o of others) {
      try {
        await plugin.deleteItem(o);
      } catch (e) {
        error = "Couldn't trash a note — stopped; nothing else was touched.";
        break;
      }
      lines.push(browse.quarantineLine(o, stamp));
      const i = view.items.indexOf(o);
      if (i >= 0) view.items.splice(i, 1);
      if (view.selected && view.selected.id === o.id) view.selected = null;
      trashed++;
    }
    if (lines.length) {
      try {
        await appendQuarantine(plugin, lines);
      } catch (e) {
        error = error || `Trashed, but couldn't write the quarantine log: ${e.message || e}`;
      }
    }
    return { trashed, error };
  }

  class ScanModal extends Modal {
    constructor(app, plugin, view) {
      super(app);
      this.plugin = plugin;
      this.view = view;
    }

    onOpen() {
      if (this.titleEl) this.titleEl.setText("Duplicate scan");
      if (this.modalEl) this.modalEl.addClass("mlog-scan");
      const c = this.contentEl;
      c.empty();
      this.statusEl = c.createDiv({ cls: "mlog-scan__status" });
      this.bodyEl = c.createDiv();
      this.paint();
    }

    paint() {
      const body = this.bodyEl;
      body.empty();
      const items = this.view.items || [];
      const groups = browse.dupeGroups(items); // library-wide — active filters never hide a dupe
      if (!groups.length) {
        body.createDiv({ cls: "mlog-scan__clean", text: "Library clean — no duplicates" });
        body.createDiv({ cls: "mlog__empty-sub", text: `${items.length} items scanned` });
        return;
      }
      const nUrl = groups.filter((g) => !g.maybe).length;
      body.createDiv({ cls: "mlog__empty-sub", text: `${nUrl} definite · ${groups.length - nUrl} maybe` });
      for (const g of groups) {
        const gc = body.createDiv({ cls: "mlog-scan__group" });
        gc.createDiv({
          cls: "mlog-scan__label" + (g.maybe ? "" : " mlog-scan__label--definite"),
          text: g.maybe ? "Maybe — same title" : "Duplicate — same link",
        });
        const row = gc.createDiv({ cls: "mlog-scan__row" });
        for (const m of g.items) {
          const mc = row.createDiv({ cls: "mlog-scan__member" });
          const th = mc.createDiv({ cls: "mlog-scan__thumb" });
          th.createDiv({ cls: "mlog-card__placeholder", text: m.platform });
          const src = thumbSrc(this.app, m);
          if (src) {
            const im = th.createEl("img", { attr: { src, alt: "", loading: "lazy" } });
            im.addEventListener("error", () => im.remove());
          }
          mc.createDiv({ cls: "mlog-scan__title", text: m.title });
          mc.createDiv({ cls: "mlog-scan__meta", text: [m.platform, browse.shortDateOf(m.dkey)].filter(Boolean).join(" · ") });
          const keep = mc.createEl("button", { cls: "mod-cta", text: "Keep this one" });
          keep.addEventListener("click", async () => {
            keep.disabled = true;
            const r = await keepOne(this.plugin, this.view, g, m);
            this.statusEl.setText(
              r.error ||
                (r.trashed
                  ? `Trashed ${r.trashed} — recoverable in Obsidian's trash, logged in ${this.plugin.settings.quarantineLog}.`
                  : "Nothing to trash.")
            );
            this.paint();
            this.view.renderGrid();
            this.view.renderDetail();
          });
        }
      }
    }

    onClose() {
      this.contentEl.empty();
    }
  }

  // A "tap for sound" pill when the webview only allowed muted playback.
  function unmuteBadge(parent, player) {
    const b = parent.createEl("button", { cls: "mlog-tv__btn mlog-tv__unmute", text: "Tap for sound" });
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      player.muted = false;
      const p = player.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
      b.remove();
    });
    return b;
  }

  // ---- the tag sheet -----------------------------------------------------------
  // One builder for every place tags are edited: the players (phone pop-up, TV),
  // the desktop dialog after a share-sheet save, and the Add item dialog's chips.
  // Every tag the library knows as a tap-to-toggle chip with its count, recently
  // used tags first, plus a field for a new one. Each tap writes the note's
  // frontmatter the way upstream's pane does.
  //   o = { app, plugin, view, item, mode: "bottom" | "top" | "modal", onChange, onDone }
  function buildTagSheet(host, o) {
    const plugin = o.plugin;
    const item = o.item;
    const sheet = host.createDiv({ cls: "mlog-tv__sheet" + (o.mode === "top" ? " mlog-tv__sheet--top" : o.mode === "modal" ? " mlog-tv__sheet--modal" : "") });
    sheet.addEventListener("click", (e) => e.stopPropagation());
    const head = sheet.createDiv({ cls: "mlog-tv__sheet-head" });
    head.createDiv({ cls: "mlog-tv__sheet-title", text: o.title || "Tags" });
    const done = head.createEl("button", { cls: "mlog-tv__btn mlog-tv__sheet-done", text: "Done" });
    done.addEventListener("click", (e) => {
      e.stopPropagation();
      if (o.onDone) o.onDone();
    });
    const form = sheet.createDiv({ cls: "mlog-tv__sheet-form" });
    const input = form.createEl("input", {
      cls: "mlog-tv__sheet-input",
      type: "text",
      placeholder: "New tag",
      attr: { autocapitalize: "none", autocorrect: "off", enterkeyhint: "done", "aria-label": "New tag" },
    });
    const add = form.createEl("button", { cls: "mlog-tv__btn mlog-tv__sheet-add", text: "Add" });
    const hint = sheet.createDiv({ cls: "mlog-tv__sheet-hint" });
    const chips = sheet.createDiv({ cls: "mlog-tv__sheet-chips" });
    const status = sheet.createDiv({ cls: "mlog-tv__sheet-status" });
    input.addEventListener("focus", () => {
      // iOS may scroll the page to "reveal" the field; keep a fixed overlay put
      setTimeout(() => {
        if (window.scrollY) window.scrollTo(0, 0);
      }, 60);
    });
    const paint = () => {
      chips.empty();
      // Counts across the library, with this item's live tags in place of its listed copy.
      const items = ((o.view && o.view.items && o.view.items.length ? o.view.items : o.items) || []).map((x) => (x && x.id === item.id ? item : x));
      const uni = browse.orderTags(browse.tagUniverse(items), plugin.settings.recentTags);
      hint.setText(uni.length ? "Tap a tag to add or remove it. Counts are across the library; the ones you used last come first." : "No tags yet — type one above. Your own categories, not hashtags.");
      for (const u of uni) {
        const on = browse.hasTag(item.tags, u.label);
        const c = chips.createEl("button", {
          cls: "mlog-tag mlog-tv__sheet-chip" + (on ? " mlog-tag--on" : ""),
          text: `${u.label} · ${u.n}`,
          attr: { "aria-pressed": String(on) },
        });
        c.addEventListener("click", (e) => {
          e.stopPropagation();
          apply(u.label);
        });
      }
    };
    const remember = (raw) => {
      plugin.settings.recentTags = browse.pushRecent(plugin.settings.recentTags, raw, RECENT_TAGS_MAX);
      plugin.saveSettings();
    };
    const apply = async (raw) => {
      const adding = !browse.hasTag(item.tags, raw);
      const next = browse.toggleTag(item.tags, raw);
      item.tags = next;
      item.tagsLow = next.map((t) => t.toLowerCase());
      // The live refresh re-lists items as new objects; keep the library's copy of
      // this item (and the pane's selection) in step so nothing shows stale tags.
      const sync = (x) => {
        if (x && x !== item && x.id === item.id) {
          x.tags = next.slice();
          x.tagsLow = item.tagsLow.slice();
        }
      };
      if (o.view) {
        sync(o.view.selected);
        (o.view.items || []).forEach(sync);
      }
      if (adding) remember(raw);
      paint();
      if (o.onChange) o.onChange(item);
      try {
        await plugin.updateTags(item, item.tags);
        status.setText("");
      } catch (e) {
        status.setText(`Couldn't save that tag: ${(e && e.message) || e}`);
      }
    };
    const submit = () => {
      const raw = input.value;
      input.value = "";
      if (browse.normalizeTag(raw) && !browse.hasTag(item.tags, raw)) apply(raw);
      input.focus();
    };
    add.addEventListener("click", (e) => {
      e.stopPropagation();
      submit();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      submit();
    });
    paint();
    return { el: sheet, input, repaint: paint };
  }

  // The sheet after a share-sheet save, on every device: the same builder inside
  // an Obsidian modal. A modal lives outside the workspace, so the layout
  // rebuild Obsidian mobile does right after a share-sheet launch cannot tear it
  // down (the first cut opened the library's pop-up and the sheet was gone in a
  // second — owner: "it popped down too fast for me to enter tags").
  class TagSheetModal extends Modal {
    constructor(app, plugin, view, item, items) {
      super(app);
      this.plugin = plugin;
      this.view = view || null;
      this.item = item;
      this.items = items || null;
    }

    onOpen() {
      if (this.modalEl) this.modalEl.addClass("mlog-tagsheet");
      if (this.titleEl) this.titleEl.setText("Saved — tag it?");
      const c = this.contentEl;
      c.empty();
      c.createDiv({ cls: "mlog-tagsheet__title", text: this.item.title });
      const meta = [this.item.platform, this.item.creator && this.item.creator !== this.item.platform ? this.item.creator : ""].filter(Boolean).join(" · ");
      if (meta) c.createDiv({ cls: "mlog__empty-sub", text: meta });
      const built = buildTagSheet(c, {
        app: this.app,
        plugin: this.plugin,
        view: this.view,
        items: this.items,
        item: this.item,
        mode: "modal",
        onDone: () => this.close(),
      });
      const row = c.createDiv({ cls: "mlog-modal__row mlog-tagsheet__row" });
      const open = row.createEl("button", { text: "Open it in the library" });
      open.addEventListener("click", async () => {
        this.close();
        try {
          await this.plugin.activateView();
          const leaf = this.app.workspace.getLeavesOfType("media-log-library")[0];
          const view = leaf && leaf.view;
          if (!view) return;
          await view.refreshItems();
          const it = (view.items || []).find((i) => i.id === this.item.id) || this.item;
          if (isPhone()) view.openModal(it);
          else await view.selectItem(it);
        } catch (e) {
          console.error("Media Log: open after tagging failed", e);
        }
      });
      setTimeout(() => {
        try {
          built.input.focus();
        } catch {}
      }, 80);
    }

    onClose() {
      this.contentEl.empty();
      const leaf = this.app.workspace.getLeavesOfType("media-log-library")[0];
      const view = (leaf && leaf.view) || this.view;
      if (view && view.gridEl && view.gridEl.isConnected) {
        withScrollKept(view.gridEl, () => {
          view.renderGrid();
          if (typeof view.renderDetail === "function") view.renderDetail();
        });
      }
    }
  }

  // The Add item dialog: tap-to-toggle chips under upstream's comma-separated
  // tags field, kept in step with the field both ways.
  function decorateAddModal(modal, contentEl, tagsInput) {
    const plugin = modal.plugin;
    if (!plugin || !contentEl || !tagsInput) return;
    const row = contentEl.createDiv({ cls: "mlog-add__chips" });
    if (tagsInput.nextSibling) contentEl.insertBefore(row, tagsInput.nextSibling);
    const fieldTags = () => tagsInput.value.split(",").map((t) => browse.normalizeTag(t)).filter(Boolean);
    let uni = [];
    const paint = () => {
      row.empty();
      const cur = fieldTags();
      for (const u of uni) {
        const on = browse.hasTag(cur, u.label);
        const c = row.createEl("button", { cls: "mlog-tag" + (on ? " mlog-tag--on" : ""), text: `${u.label} · ${u.n}`, attr: { type: "button", "aria-pressed": String(on) } });
        c.addEventListener("click", () => {
          tagsInput.value = browse.toggleTag(fieldTags(), u.label).join(", ");
          paint();
        });
      }
    };
    tagsInput.addEventListener("input", paint);
    Promise.resolve()
      .then(() => plugin.listItems())
      .then((items) => {
        uni = browse.orderTags(browse.tagUniverse(items), plugin.settings.recentTags);
        paint();
      })
      .catch(() => {});
  }

  // The new note's frontmatter may not be parsed the instant it is created.
  function waitForCache(app, file, maxMs) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const tick = () => {
        const c = app.metadataCache.getFileCache(file);
        if (c && c.frontmatter && c.frontmatter.media_id) return resolve(true);
        if (Date.now() - t0 > (maxMs || 4000)) return resolve(false);
        setTimeout(tick, 100);
      };
      tick();
    });
  }

  // Upstream's Add dialog fetches the page for its title before saving. From the
  // phone, Instagram's page can take a very long time (owner 2026-09-11: "it
  // fills the link but doesn't go from there … took a hot min"), and the tag
  // sheet only comes after the save. Wait a few seconds at most; on a timeout
  // the save goes ahead with the fallback title, and when the page does answer
  // the real title is patched into the note in the background.
  function fetchMetaFast(plugin, url, extractMeta) {
    const request = Promise.resolve()
      .then(() => requestUrl({ url, method: "GET", throw: false }))
      .catch(() => null);
    let timer = null;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve("timeout"), META_BUDGET_MS);
    });
    return Promise.race([request, timeout]).then((r) => {
      if (r !== "timeout") {
        clearTimeout(timer);
        return r;
      }
      request.then((resp) => patchLateTitle(plugin, url, resp, extractMeta)).catch(() => {});
      return null;
    });
  }

  // The page answered after the note was written: give the note its real title
  // (and creator) if it still carries the fallback one.
  async function patchLateTitle(plugin, url, resp, extractMeta) {
    try {
      if (!resp || resp.status >= 400 || typeof resp.text !== "string" || typeof extractMeta !== "function") return;
      const meta = extractMeta(resp.text) || {};
      const title = browse.captureFallbackTitle(url, String(meta.title || "").trim());
      if (!title || title === url) return;
      const items = await plugin.listItems();
      const item = items.find((i) => i.sourceUrl === url);
      if (!item || !item.file) return;
      const fallback = browse.captureFallbackTitle(url, "");
      if (item.title !== fallback && item.title !== url) return; // already has a real title
      await plugin.app.fileManager.processFrontMatter(item.file, (fm) => {
        fm.title = title;
        if (meta.siteName && (!fm.creator || fm.creator === "")) fm.creator = meta.siteName;
      });
    } catch (e) {
      console.error("Media Log: late title patch failed", e);
    }
  }

  // A share-sheet save just landed (owner 2026-09-11: tag at the time of
  // importing): once the workspace has settled, open the tag sheet for the new
  // item as a modal — no dependence on the library view, which Obsidian mobile
  // may rebuild right after a share-sheet launch. The item is saved either way;
  // the sheet is optional. Setting "Ask for tags after a share-sheet save".
  // The metadata index can lag a fresh note by seconds on the phone; read the
  // note itself when it does, so the sheet never depends on the index.
  async function itemFromFile(app, file) {
    try {
      const raw = await app.vault.read(file);
      const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
      const fm = {};
      if (m) {
        for (const line of m[1].split(/\r?\n/)) {
          const k = /^([a-z_]+):\s*(.*)$/.exec(line);
          if (!k) continue;
          let v = k[2].trim();
          if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(",").map((x) => x.trim().replace(/^"|"$/g, "")).filter(Boolean);
          else v = v.replace(/^"|"$/g, "").replace(/\\"/g, '"');
          fm[k[1]] = v;
        }
      }
      if (!fm.media_id) return null;
      const item = {
        file,
        id: String(fm.media_id),
        platform: fm.platform || "Web",
        title: fm.title || file.basename,
        creator: fm.creator || "",
        sourceUrl: fm.source_url || "",
        canonicalUrl: fm.canonical_url || "",
        capturedAt: String(fm.captured_at || ""),
        screenshot: fm.screenshot || "",
        video: fm.video || "",
        embedUrl: fm.embed_url || "",
        watched: false,
        starred: false,
        tags: Array.isArray(fm.tags) ? fm.tags.map(String) : [],
      };
      browse.enrichItem(item, fm);
      return item;
    } catch {
      return null;
    }
  }

  // A share-sheet save just landed (owner 2026-09-11: tag at the time of
  // importing): once the workspace has settled, open the tag sheet for the new
  // item as a modal — no dependence on the library view, which Obsidian mobile
  // may rebuild right after a share-sheet launch. The item is saved either way;
  // the sheet is optional. Setting "Ask for tags after a share-sheet save".
  async function afterCapture(plugin, file) {
    if (!file || plugin.settings.tagAfterCapture === false) return;
    try {
      const indexed = await waitForCache(plugin.app, file, 3000);
      let items = [];
      let item = null;
      if (indexed) {
        items = await plugin.listItems();
        item = items.find((i) => i.file && i.file.path === file.path) || null;
      }
      if (!item) {
        item = await itemFromFile(plugin.app, file);
        if (!items.length) {
          try {
            items = await plugin.listItems();
          } catch {}
        }
      }
      if (!item) {
        new Notice("Media Log: saved, but the tag sheet couldn't find the new note");
        return;
      }
      const leaf = plugin.app.workspace.getLeavesOfType("media-log-library")[0];
      const view = (leaf && leaf.view) || null;
      const open = () =>
        setTimeout(() => {
          try {
            new TagSheetModal(plugin.app, plugin, view, item, items).open();
          } catch (e) {
            console.error("Media Log: tag sheet failed to open", e);
            new Notice(`Media Log: saved; tag sheet failed — ${(e && e.message) || e}`);
          }
        }, 350);
      if (typeof plugin.app.workspace.onLayoutReady === "function") plugin.app.workspace.onLayoutReady(open);
      else open();
    } catch (e) {
      console.error("Media Log: after-capture tagging failed", e);
      new Notice(`Media Log: saved; couldn't open the tag sheet — ${(e && e.message) || e}`);
    }
  }

  // ---- the player: TV mode and the phone pop-up --------------------------------
  // Mounted on document.body: Obsidian 1.13 applies contain:strict to leaves,
  // which hijacks position:fixed inside a view. "tv" loops the current
  // filters and auto-advances; "modal" is the phone's pop-up for one tapped item.
  class TvPlayer {
    constructor(view, list, idx, opts) {
      this.view = view;
      this.plugin = view.plugin;
      this.app = view.app;
      this.list = list;
      this.idx = idx;
      this.mode = (opts && opts.mode) || "tv";
      this.modal = this.mode === "modal";
      // Owner ask 2026-09-05: the pop-up moves on by itself too — next when a video
      // ends, after the dwell for anything without a video. The pause button turns
      // it off and the view remembers that for the session.
      this.auto = this.modal ? view.autoAdvance !== false : true;
      this.loop = !this.modal;
      this.listMode = view.tvMode;
      const dwell = Number(this.plugin.settings.tvDwellSecs);
      this.dwell = dwell > 0 ? dwell : SIFI_DEFAULTS.tvDwellSecs;
      this.overlay = null;
      this.panel = null;
      this.ctl = null;
      this.timer = null;
      this.watchT = null;
      this.fadeT = null;
      this.adv = null;
      this.keydown = null;
      this.paintWatched = null;
      this.pre = null; // the next reel, fetched ahead so auto-advance is instant
      this.media = null; // what show() built for the current item
      this.sheet = null; // the tag sheet while it is open
      this.hold = false; // tag sheet open: no auto-advance, no fade, no swipes
      this.paintTagLine = null;
      this.swipedAt = 0; // a click right after a flick is the flick's echo, not a tap
    }

    // Preload the next playable item into the browser cache: its local file, or —
    // with no local copy — ask Instagram for its link now so stepping is instant.
    preloadNext() {
      const len = this.list.length;
      const ni = browse.nextIndex(this.idx, len, this.loop);
      const next = ni >= 0 ? this.list[ni] : null;
      const file = next && next.video && next.video !== "none" && this.app.vault.getAbstractFileByPath(next.video);
      if (!file) {
        const streams = this.view.streams();
        if (next && streams.can(next)) {
          streams.resolve(next).then((url) => {
            if (url && this.overlay && this.list[browse.nextIndex(this.idx, this.list.length, this.loop)] === next) this.warm(url);
          });
        }
        return;
      }
      this.warm(this.app.vault.getResourcePath(file));
    }

    warm(src) {
      if (!this.overlay) return;
      if (!this.pre) {
        this.pre = document.createElement("video");
        this.pre.preload = "auto";
        this.pre.muted = true;
        this.pre.style.cssText = "position:fixed;left:-9999px;top:0;width:10px;height:10px;opacity:0;pointer-events:none;";
        document.body.appendChild(this.pre);
      }
      if (this.pre.getAttribute("src") !== src) {
        this.pre.src = src;
        try {
          this.pre.load();
        } catch {}
      }
    }

    open() {
      this.overlay = document.body.createDiv({ cls: this.modal ? "mlog-tv mlog-tv--modal" : "mlog-tv" });
      this.overlay.addEventListener("click", (e) => {
        if (Date.now() - this.swipedAt < 350) return; // the flick's own click echo
        if (this.modal && e.target === this.overlay) {
          this.close(); // scrim tap closes the pop-up
          return;
        }
        // Reel-feed manners on the phone: a tap on the video pauses or resumes it.
        if (this.modal && !this.hold && this.media && isVid(this.media) && e.target === this.media.el && this.media.el.getAttribute("controls") === null) {
          this.togglePause();
        }
        this.showControls();
      });
      this.panel = this.overlay.createDiv({ cls: "mlog-tv__panel" });
      this.ctl = this.overlay.createDiv({ cls: "mlog-tv__ctl" });
      if (this.modal) {
        // Full-bleed on a phone leaves no scrim to tap, so the pop-up carries its own close.
        const x = this.overlay.createEl("button", { cls: "mlog-tv__close", attr: { "aria-label": "Close" } });
        setIcon(x, "x");
        x.addEventListener("click", (e) => {
          e.stopPropagation();
          this.close();
        });
      }
      this.bindSwipe();
      this.keydown = (e) => {
        if (this.hold) {
          if (e.key === "Escape") this.closeTags(); // the sheet first; typing in it never steps the player
          return;
        }
        if (e.key === "Escape") this.close();
        else if (e.key === "ArrowRight" || e.key === "ArrowDown") this.step(1);
        else if (e.key === "ArrowLeft" || e.key === "ArrowUp") this.step(-1);
      };
      document.addEventListener("keydown", this.keydown);
      if (this.view.bar) this.view.bar.hide(true);
      this.show(this.idx);
    }

    // Vertical flicks step the reel like a feed (owner 2026-09-11: "swipe through
    // them like TikTok or Insta"). The panel follows the finger, rubber-bands at
    // the list's ends, and snaps back on a short or sideways drag, so a tap or a
    // native scrub is never mistaken for a step. The step runs inside touchend,
    // which iOS counts as the gesture that allows sound.
    bindSwipe() {
      const ov = this.overlay;
      let st = null;
      const reset = () => {
        if (!this.panel) return;
        this.panel.classList.remove("mlog-tv__panel--drag");
        this.panel.style.transform = "";
      };
      ov.addEventListener(
        "touchstart",
        (e) => {
          st = null;
          if (e.touches.length !== 1 || this.hold || !this.panel) return;
          const t = e.target;
          if (t && t.closest && t.closest(".mlog-tv__sheet, .mlog-tv__btn, .mlog-tv__close, .mlog-tv__tag, button, input, select")) return;
          const p = e.touches[0];
          st = { x: p.clientX, y: p.clientY, t: Date.now(), vertical: null };
        },
        { passive: true }
      );
      ov.addEventListener(
        "touchmove",
        (e) => {
          if (!st || e.touches.length !== 1 || !this.panel) return;
          const p = e.touches[0];
          const dx = p.clientX - st.x;
          const dy = p.clientY - st.y;
          if (st.vertical === null) {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
            st.vertical = Math.abs(dy) > Math.abs(dx);
            if (st.vertical) this.panel.classList.add("mlog-tv__panel--drag");
          }
          if (!st.vertical) return;
          if (e.cancelable) e.preventDefault(); // ours now, not a page scroll
          const len = this.list.length;
          const edge = dy < 0 ? browse.nextIndex(this.idx, len, this.loop) < 0 : browse.prevIndex(this.idx, len, this.loop) < 0;
          this.panel.style.transform = `translateY(${dy * (edge ? 0.25 : 0.9)}px)`;
        },
        { passive: false }
      );
      ov.addEventListener("touchend", (e) => {
        if (!st) return;
        const s = st;
        st = null;
        const p = e.changedTouches && e.changedTouches[0];
        const dx = p ? p.clientX - s.x : 0;
        const dy = p ? p.clientY - s.y : 0;
        // A flick so quick that no touchmove arrived (seen through iPhone Mirroring)
        // is judged from its end point; a sideways drag is still not ours.
        if (s.vertical === null) s.vertical = Math.abs(dy) > Math.abs(dx);
        if (!s.vertical) {
          reset();
          return;
        }
        const intent = browse.swipeIntent(dx, dy, Date.now() - s.t);
        reset();
        this.swipedAt = Date.now();
        if (intent === "next") this.step(1, "up");
        else if (intent === "prev") this.step(-1, "down");
      });
      ov.addEventListener("touchcancel", () => {
        st = null;
        reset();
      });
    }

    togglePause() {
      const v = this.media && this.media.el;
      if (!v || typeof v.play !== "function") return;
      if (v.paused) {
        const p = v.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      } else {
        v.pause();
      }
      if (this.panel) this.panel.classList.toggle("mlog-tv__panel--paused", v.paused);
    }

    clearTimers() {
      if (this.timer) clearInterval(this.timer);
      if (this.watchT) clearTimeout(this.watchT);
      if (this.fadeT) clearTimeout(this.fadeT);
      this.timer = this.watchT = this.fadeT = null;
      this.adv = null;
    }

    stopMedia() {
      if (!this.overlay) return;
      const v = this.overlay.querySelector("video");
      if (v) {
        try {
          v.pause();
          v.removeAttribute("src");
          v.load();
        } catch {}
      }
      const f = this.overlay.querySelector("iframe");
      if (f) f.src = "about:blank"; // audio dies before the DOM goes
    }

    show(idx, anim) {
      this.clearTimers();
      this.stopMedia();
      const item = this.list[idx];
      if (!item) {
        this.close();
        return;
      }
      this.idx = idx;
      this.panel.empty();
      this.panel.classList.remove("mlog-tv__panel--in-up", "mlog-tv__panel--in-down", "mlog-tv__panel--paused");
      this.panel.classList.toggle("mlog-tv__panel--wide", !browse.isPortrait(item)); // the panel takes the item's shape
      if (anim) {
        // a stepped-to item slides in from the side the finger sent it
        this.panel.classList.add("mlog-tv__panel--in-" + anim);
        this.panel.addEventListener("animationend", () => this.panel && this.panel.classList.remove("mlog-tv__panel--in-" + anim), { once: true });
      }
      const phonePopup = this.modal && isPhone();
      // Built synchronously inside the tap that opened or stepped the player, so the
      // webview's user activation still covers play() with sound on iOS.
      const media = buildMedia(this.app, this.panel, item, {
        autoplay: true,
        loop: this.modal && !this.auto, // the pop-up loops a reel until auto-advance is switched on
        controls: !phonePopup, // the phone pop-up is a feed: tap pauses, the flick steps
        streams: this.view.streams(),
        onEnded: () => {
          if (this.hold) {
            // tagging: the reel starts over instead of moving on underneath the sheet
            try {
              media.el.currentTime = 0;
              tryPlay(media.el, null, true);
            } catch {}
            return;
          }
          if (this.auto) this.step(1);
        },
        onMuted: (player) => {
          if (this.ctl) unmuteBadge(this.ctl, player);
        },
        onFallback: (fb) => {
          // Instagram would not stream this one: behave as the embed/gone card from here on
          if (!this.overlay || this.idx !== idx) return;
          media.kind = fb.kind;
          media.el = fb.el;
          if (this.auto && !isVid(media) && !this.hold) this.adv = browse.advInit(this.dwell, 0, Date.now());
          this.paintControls(item, media);
        },
      });
      this.media = media;
      if (phonePopup) {
        const paused = this.panel.createDiv({ cls: "mlog-tv__paused", attr: { "aria-hidden": "true" } });
        setIcon(paused, "play");
      }
      this.paintControls(item, media);
      this.preloadNext();
      this.watchT = setTimeout(async () => {
        // 3s dwell marks watched — a mis-tap never counts; the check button unmarks.
        // An embed that only sat there for the dwell was never watched.
        if (item.watched || media.kind === "embed") return;
        try {
          await this.plugin.updateReviewState(item, "watched", true);
        } catch {}
        if (this.paintWatched) this.paintWatched();
      }, WATCH_DWELL_MS);
      // Local video advances when it ends; embeds and images advance on the dwell timer.
      if (this.auto && !isVid(media)) this.adv = browse.advInit(this.dwell, 0, Date.now());
      this.timer = setInterval(() => {
        if (!this.adv) return;
        const r = browse.advanceTick(this.adv, Date.now());
        this.adv = r.st;
        if (r.action === "advance") this.step(1);
      }, TICK_MS);
      this.showControls();
    }

    step(dir, anim) {
      if (this.hold) return; // the tag sheet holds the item still
      const len = this.list.length;
      const ni = dir > 0 ? browse.nextIndex(this.idx, len, this.loop) : browse.prevIndex(this.idx, len, this.loop);
      if (ni < 0) {
        if (this.modal) {
          this.adv = null; // the pop-up stops at the list's edge
          return;
        }
        this.close();
        return;
      }
      this.show(ni, anim);
    }

    paintControls(item, media) {
      const ctl = this.ctl;
      ctl.empty();
      ctl.createDiv({ cls: "mlog-tv__title", text: `${this.idx + 1} / ${this.list.length} · ${item.title}` });
      // The item's tags, and the door to the tag sheet (owner 2026-09-11: tags must work on the phone).
      const tagLine = ctl.createDiv({ cls: "mlog-tv__tags" });
      this.paintTagLine = () => {
        tagLine.empty();
        for (const t of item.tags || []) {
          const c = tagLine.createEl("button", { cls: "mlog-tv__tag", text: "#" + t, attr: { "aria-label": `Edit tags (${t})` } });
          c.addEventListener("click", (e) => {
            e.stopPropagation();
            this.openTags(item);
          });
        }
        const add = tagLine.createEl("button", { cls: "mlog-tv__tag mlog-tv__tag--add", text: item.tags && item.tags.length ? "+ tag" : "+ add a tag" });
        add.addEventListener("click", (e) => {
          e.stopPropagation();
          this.openTags(item);
        });
      };
      this.paintTagLine();
      const why = whyNoVideo(this.app, item, this.view.streams());
      if (why) ctl.createDiv({ cls: "mlog-tv__why", text: why });
      const cap = ctl.createDiv({ cls: "mlog-tv__caption" });
      this.view.captionFor(item).then((text) => {
        if (this.ctl === ctl && text) cap.setText(text);
        else if (this.ctl === ctl) cap.remove();
      });
      const btn = (parent, label, icon, onClick, active) => {
        const b = parent.createEl("button", {
          cls: "mlog-tv__btn" + (active ? " mlog-tv__btn--active" : ""),
          attr: { "aria-label": label },
        });
        if (icon) setIcon(b, icon);
        else b.setText(label);
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          this.showControls();
          onClick(b);
        });
        return b;
      };
      const row1 = ctl.createDiv({ cls: "mlog-tv__row" });
      btn(row1, "Previous", "chevron-left", () => this.step(-1));
      const pp = btn(
        row1,
        "Auto-advance",
        null,
        () => {
          this.auto = !this.auto;
          if (this.modal) this.view.setAutoAdvance(this.auto);
          this.adv = this.auto && !isVid(media) ? browse.advInit(this.dwell, 0, Date.now()) : null;
          if (isVid(media) && media.el) media.el.loop = this.modal && !this.auto;
          pp.setText(this.auto ? "Auto: on" : "Auto: off");
          pp.classList.toggle("mlog-tv__btn--active", this.auto);
        },
        this.auto
      );
      pp.setText(this.auto ? "Auto: on" : "Auto: off");
      btn(row1, "Next", "chevron-right", () => this.step(1));
      const star = btn(
        row1,
        "Star",
        "star",
        async () => {
          await this.plugin.updateReviewState(item, "starred", !item.starred);
          star.classList.toggle("mlog-tv__btn--active", !!item.starred);
        },
        item.starred
      );
      const watched = btn(
        row1,
        "Watched",
        "check",
        async () => {
          await this.plugin.updateReviewState(item, "watched", !item.watched);
          this.paintWatched();
        },
        item.watched
      );
      this.paintWatched = () => watched.classList.toggle("mlog-tv__btn--active", !!item.watched);
      btn(row1, "Tags", "tag", () => this.openTags(item), !!(item.tags && item.tags.length));
      row1.createDiv({ cls: "mlog-tv__spacer" });
      if (!this.modal) btn(row1, "Close", "x", () => this.close()); // the pop-up has its corner ×; the row stays one line on a phone

      const row2 = ctl.createDiv({ cls: "mlog-tv__row" });
      if (this.modal) {
        if (item.sourceUrl) btn(row2, "Open source", "external-link", () => window.open(item.sourceUrl, "_blank"));
        if (item.file) {
          btn(row2, "Open note", "file-text", () => {
            this.close();
            this.app.workspace.openLinkText(item.file.path, "", false);
          });
          // Delete from the phone (owner 2026-09-11). Two taps: the first arms the button for a
          // few seconds, the second trashes the note through Obsidian's reversible trash, the
          // same as the desktop pane's Delete. The player moves on to the next item.
          const del = btn(row2, "Delete", "trash-2", () => {
            if (!del._armed) {
              del._armed = true;
              del.setText("Delete? Tap again");
              del.classList.add("mlog-tv__btn--danger");
              del._disarm = setTimeout(() => {
                if (!del.isConnected) return;
                del._armed = false;
                del.empty();
                setIcon(del, "trash-2");
                del.classList.remove("mlog-tv__btn--danger");
              }, 4000);
              return;
            }
            clearTimeout(del._disarm);
            this.deleteCurrent(item);
          });
          del.classList.add("mlog-tv__btn--del");
        }
        return;
      }
      btn(
        row2,
        this.listMode === "unwatched" ? "Unwatched" : "All",
        null,
        () => {
          // one-tap flip rebuilds the TV list live from the library's current filters
          this.listMode = this.listMode === "unwatched" ? "all" : "unwatched";
          this.view.tvMode = this.listMode;
          const nl = this.view.tvList(this.listMode);
          if (nl.length) {
            this.list = nl;
            this.show(0);
          }
        },
        this.listMode === "unwatched"
      );
      const pills = row2.createDiv({ cls: "mlog-tv__pills" });
      for (const sec of [15, 30, 60]) {
        btn(
          pills,
          `${sec}s`,
          null,
          () => {
            this.dwell = sec;
            if (this.adv) this.adv = browse.advInit(sec, 0, Date.now());
            this.paintControls(item, media);
          },
          this.dwell === sec
        );
      }
    }

    async deleteCurrent(item) {
      try {
        await this.plugin.deleteItem(item);
      } catch (e) {
        new Notice(`Media Log: couldn't delete — ${(e && e.message) || e}`);
        return;
      }
      new Notice("Media Log: item moved to trash");
      const items = this.view.items || [];
      const vi = items.findIndex((x) => x && x.id === item.id);
      if (vi >= 0) items.splice(vi, 1);
      if (this.view.selected && this.view.selected.id === item.id) this.view.selected = null;
      const i = this.list.findIndex((x) => x.id === item.id);
      if (i >= 0) this.list.splice(i, 1);
      if (!this.overlay) return;
      if (!this.list.length) {
        this.close();
        return;
      }
      this.show(Math.min(i >= 0 ? i : this.idx, this.list.length - 1), "up");
    }

    showControls() {
      if (!this.ctl) return;
      this.ctl.classList.remove("mlog-tv__ctl--hidden");
      if (this.fadeT) clearTimeout(this.fadeT);
      if (this.hold) return; // the controls stay while the tag sheet is up
      this.fadeT = setTimeout(() => {
        if (this.ctl) this.ctl.classList.add("mlog-tv__ctl--hidden");
      }, CONTROLS_FADE_MS);
    }

    // ---- the tag sheet -------------------------------------------------------
    // Desktop tags an item in the pane beside the grid; the phone had no way at
    // all. Inside the players a sheet slides up over the reel: every tag the
    // library knows as a tap-to-toggle chip with its count, and a field for a new
    // one. Each tap writes the note's frontmatter the same way the pane does. The
    // reel holds still (no auto-advance, no swipes, no fade) until Done.
    openTags(item) {
      if (!this.overlay) return;
      if (this.sheet) {
        this.closeTags();
        return;
      }
      this.hold = true;
      this.adv = null;
      this.showControls();
      // On a phone the sheet hangs from the top (owner 2026-09-11: "the keyboard
      // perfectly covers the tag screen" — Obsidian's iOS webview gives no usable
      // viewport signal when the keyboard rises, and no keyboard reaches the top).
      const built = buildTagSheet(this.overlay, {
        app: this.app,
        plugin: this.plugin,
        view: this.view,
        item,
        mode: isPhone() ? "top" : "bottom",
        onChange: () => {
          if (this.paintTagLine) this.paintTagLine();
        },
        onDone: () => this.closeTags(),
      });
      this.sheet = built.el;
    }

    closeTags() {
      if (this.sheet) this.sheet.remove();
      this.sheet = null;
      if (!this.hold) return;
      this.hold = false;
      if (this.overlay && this.auto && !isVid(this.media)) this.adv = browse.advInit(this.dwell, 0, Date.now());
      this.showControls();
    }

    // Tear down without touching the library (used by the error card).
    teardown() {
      this.clearTimers();
      this.stopMedia();
      this.sheet = null;
      this.hold = false;
      this.media = null;
      if (this.pre) {
        try {
          this.pre.removeAttribute("src");
          this.pre.load();
        } catch {}
        this.pre.remove();
        this.pre = null;
      }
      if (this.keydown) document.removeEventListener("keydown", this.keydown);
      this.keydown = null;
      if (this.overlay) this.overlay.remove();
      this.overlay = this.panel = this.ctl = null;
      if (this.view.tv === this) this.view.tv = null;
      if (this.view.bar) this.view.bar.hide(false);
    }

    close() {
      this.teardown();
      // Watched dots and stars earned in the player land on the grid; the grid's
      // scroll position survives so a phone never loses its place in a 64-card page.
      withScrollKept(this.view.gridEl, () => {
        this.view.renderGrid();
        if (!this.modal) this.view.renderDetail();
      });
    }
  }

  // ---- the phone bottom bar --------------------------------------------------
  // The note surfaces carry the shared Select tab bar; the plugin view had no
  // bar at all. On a phone this mounts the same five doors on document.body
  // (outside any transformed ancestor, the v4 lesson) while the library is the
  // active leaf, and hides itself while a player is open.
  class BottomBar {
    constructor(view) {
      this.view = view;
      this.el = null;
      this.timer = null;
      this.mo = null;
    }

    wanted() {
      return !!this.view.plugin.settings.bottomBar && (isMobileApp(this.view.app) || isPhone());
    }

    visible() {
      const c = this.view.containerEl;
      return !!(c && c.isConnected && c.getClientRects().length);
    }

    mount() {
      if (this.el || !this.wanted() || !this.visible()) return;
      const el = document.body.createDiv({ cls: "mlog-bar" });
      for (const t of BOTTOM_BAR_TABS) {
        const on = t.label === "Media";
        const b = el.createEl("button", { cls: "mlog-bar__slot" + (on ? " mlog-bar__slot--on" : ""), attr: { "aria-label": t.label } });
        b.createDiv({ cls: "mlog-bar__icon" }).innerHTML = svgIcon(t.icon);
        b.createDiv({ cls: "mlog-bar__label", text: t.label });
        b.addEventListener("click", () => {
          if (!on) this.view.app.workspace.openLinkText(t.link, "", false);
        });
      }
      this.el = el;
      if (this.view.root) this.view.root.classList.add("mlog--barred");
      // Obsidian mobile keeps its Settings gear at the bottom of the left drawer, and
      // Settings itself is a modal (owner 2026-09-11: the bar covered the gear). Step
      // aside while a drawer is open or a modal is up; watch them directly, and let
      // the 1s self-check re-apply the rule in case an observer misses.
      try {
        this.mo = new MutationObserver(() => this.cover());
        this.mo.observe(document.body, { childList: true });
        document.querySelectorAll(".workspace-drawer").forEach((d) => this.mo.observe(d, { attributes: true, attributeFilter: ["class", "style"] }));
      } catch {
        this.mo = null;
      }
      this.cover();
      this.timer = setInterval(() => {
        if (!this.visible()) {
          this.unmount(); // the library left the screen — a body-mounted bar must not outlive it
          return;
        }
        this.cover();
      }, 1000);
    }

    // Judged by geometry, never by class names alone (the first cut keyed on
    // is-collapsed and read "open" with the drawer closed): a closed drawer sits
    // off-screen, and only a modal with a box counts.
    covered() {
      const onScreen = (el) => {
        if (!el || !el.getBoundingClientRect) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < window.innerWidth && r.top < window.innerHeight;
      };
      if (Array.from(document.body.querySelectorAll(":scope > .modal-container .modal")).some(onScreen)) return true;
      return Array.from(document.querySelectorAll(".workspace-drawer")).some((d) => !d.classList.contains("is-collapsed") && onScreen(d));
    }

    cover() {
      if (this.el) this.el.classList.toggle("mlog-bar--covered", this.covered());
    }

    hide(h) {
      if (this.el) this.el.classList.toggle("mlog-bar--hidden", !!h);
    }

    unmount() {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      if (this.mo) this.mo.disconnect();
      this.mo = null;
      if (this.el) this.el.remove();
      this.el = null;
      if (this.view.root) this.view.root.classList.remove("mlog--barred");
    }
  }

  // ---- the library view --------------------------------------------------------
  class SifiLibraryView extends LibraryView {
    constructor(leaf, plugin) {
      super(leaf, plugin);
      Object.assign(this.filter, { onDay: false, seed: null, tags: [], untagged: false, month: "", sort: "newest", playable: false });
      this.page = 0;
      this.lastKey = "";
      this.toolsEl = null;
      this.tagsEl = null;
      this.thumbs = new ThumbBudget();
      this.tv = null;
      this.tvMode = "unwatched"; // TV binges the unwatched by default; falls back to all when everything's seen
      this.autoAdvance = plugin.settings.autoAdvance !== false; // the pop-up and the detail pane move on when a video ends; the toggle is remembered
      this.captionCache = new Map();
      this.captionsLoaded = false;
      this.captionsLoading = null;
      this.tagsExpanded = false;
      this.refreshT = null;
      this.bar = new BottomBar(this);
      this.todayMMDD = browse.todayMMDD(new Date());
      guard(this, ["render", "renderGrid", "renderDetail"]);
    }

    pageSize() {
      const n = Number(this.plugin.settings.pageSize);
      return n > 0 ? n : SIFI_DEFAULTS.pageSize;
    }

    setAutoAdvance(on) {
      this.autoAdvance = !!on;
      this.plugin.settings.autoAdvance = !!on;
      this.plugin.saveSettings();
    }

    // Upstream's actions row gets a labelled Auto-advance toggle (owner: "i dont see the autoplay toggle").
    renderDetail() {
      super.renderDetail();
      const d = this.detailEl;
      if (!d || !this.selected) return;
      const actions = d.querySelector(".mlog-detail__actions");
      if (!actions) return;
      const b = actions.createEl("button", {
        cls: this.autoAdvance ? "mlog-action--active" : "",
        text: `Auto-advance: ${this.autoAdvance ? "on" : "off"}`,
        attr: { "aria-pressed": String(this.autoAdvance), title: "When a video ends, play the next one" },
      });
      b.addEventListener("click", () => {
        this.setAutoAdvance(!this.autoAdvance);
        this.renderDetail();
      });
    }

    async onOpen() {
      await super.onOpen();
      // Left/Right step through the visible set while an item is selected.
      this.registerDomEvent(this.containerEl, "keydown", (e) => {
        if (this.tv || !this.selected) return;
        const t = e.target;
        if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        const visible = this.filtered();
        const i = visible.findIndex((c) => c.id === this.selected.id);
        const n = e.key === "ArrowRight" ? i + 1 : i - 1;
        if (i < 0 || n < 0 || n >= visible.length) return;
        e.preventDefault();
        this.selectItem(visible[n]);
      });
      this.watchVault();
      this.registerEvent(
        this.app.workspace.on("active-leaf-change", (leaf) => {
          if (leaf === this.leaf) this.bar.mount();
          else this.bar.unmount();
        })
      );
      this.bar.mount();
    }

    async onClose() {
      if (this.tv) this.tv.teardown();
      this.bar.unmount();
      this.thumbs.reset();
      if (this.refreshT) clearTimeout(this.refreshT);
      if (this.plugin.posters) this.plugin.posters.stop();
      if (typeof super.onClose === "function") await super.onClose();
    }

    // ---- live refresh: the runner writes, the library follows ----------------
    itemsFolder() {
      return String(this.plugin.settings.itemsFolder || "Media Log/Items").replace(/\/+$/, "") + "/";
    }

    watchVault() {
      const inItems = (f) => !!(f && typeof f.path === "string" && f.path.startsWith(this.itemsFolder()));
      const kick = (f) => {
        if (inItems(f)) this.scheduleRefresh();
      };
      this.registerEvent(this.app.vault.on("create", kick));
      this.registerEvent(this.app.vault.on("delete", kick));
      this.registerEvent(
        this.app.vault.on("rename", (f, oldPath) => {
          if (inItems(f) || String(oldPath || "").startsWith(this.itemsFolder())) this.scheduleRefresh();
        })
      );
      this.registerEvent(this.app.metadataCache.on("changed", kick));
    }

    scheduleRefresh() {
      if (this.refreshT) clearTimeout(this.refreshT);
      this.refreshT = setTimeout(() => {
        this.refreshT = null;
        if (this.plugin.posters && this.plugin.posters.running) return; // one refresh when the poster run ends
        this.refreshItems();
      }, REFRESH_DEBOUNCE_MS);
    }

    // Re-list items and repaint the grid in place: filters, page, selection, and
    // scroll position survive. The detail pane is left alone so a playing video
    // is not restarted by a frontmatter write.
    async refreshItems() {
      if (!this.gridEl || !this.gridEl.isConnected) return;
      const items = await this.plugin.listItems();
      const selectedId = this.selected && this.selected.id;
      this.items = items;
      this.captionsLoaded = false;
      this.captionsLoading = null;
      this.selected = selectedId ? items.find((i) => i.id === selectedId) || null : null;
      const count = this.root && this.root.querySelector(".mlog__count");
      if (count) count.textContent = `${items.length} items`; // upstream's header count, kept honest
      withScrollKept(this.gridEl, () => this.renderGrid());
    }

    async render() {
      this.captionsLoaded = false;
      this.captionsLoading = null;
      this.toolsEl = null;
      this.tagsEl = null;
      await super.render();
      this.root.classList.add("mlog--sifi");
      this.root.classList.toggle("mlog--portrait", !!this.plugin.settings.portraitCards);
      this.root.classList.toggle("mlog--phone", isPhone());
      const body = this.gridEl && this.gridEl.parentElement;
      this.toolsEl = this.root.createDiv({ cls: "mlog__tools" });
      this.tagsEl = this.root.createDiv({ cls: "mlog__tags" });
      if (body) {
        this.root.insertBefore(this.toolsEl, body);
        this.root.insertBefore(this.tagsEl, body);
      }
      this.paintTools();
      this.paintTags();
      this.paintFilterCounts();
      this.startPosters();
    }

    startPosters() {
      if (!this.plugin.settings.posterFrames || isMobileApp(this.app)) return;
      if (!this.plugin.posters) this.plugin.posters = new PosterFactory(this.plugin);
      const posters = this.plugin.posters;
      if (posters.running) return;
      posters.run(this.items || [], {
        onEach: (item) => this.refreshCardThumb(item),
        onDone: (done) => {
          if (done) this.scheduleRefresh();
        },
      });
    }

    refreshCardThumb(item) {
      if (!this.gridEl || typeof CSS === "undefined" || !CSS.escape) return;
      const thumb = this.gridEl.querySelector(`.mlog-card[data-id="${CSS.escape(item.id)}"] .mlog-card__thumb`);
      if (!thumb || thumb._mlogImg) return;
      const src = thumbSrc(this.app, item);
      if (src) this.thumbs.bind(thumb, src, isPhone());
    }

    // Upstream's "Clear filters" rebuilds the filter object without the fork keys.
    normalizeFilter() {
      const f = this.filter;
      if (f.seed === undefined) f.seed = null;
      if (f.onDay === undefined) f.onDay = false;
      if (!Array.isArray(f.tags)) f.tags = [];
      if (f.untagged === undefined) f.untagged = false;
      if (f.month === undefined) f.month = "";
      if (!f.sort) f.sort = "newest";
      if (f.playable === undefined) f.playable = false;
      return f;
    }

    hasFile(it) {
      return !!(it && it.video && this.app.vault.getAbstractFileByPath(it.video));
    }

    // One resolver per plugin, made on first use (settings may still be loading in the constructor).
    streams() {
      const p = this.plugin;
      if (!p.streams) p.streams = new StreamResolver(p);
      return p.streams;
    }

    listOpts() {
      return { todayMMDD: this.todayMMDD, pageSize: this.pageSize(), hasFile: (it) => this.hasFile(it), canStream: this.streams().enabled() };
    }

    // The note body (caption, hashtags) for one item — cached per file.
    async captionFor(item) {
      if (!item || !item.file) return "";
      const key = item.file.path + ":" + (item.file.stat ? item.file.stat.mtime : 0);
      if (this.captionCache.has(key)) return this.captionCache.get(key);
      let text = "";
      try {
        text = browse.commentPreview(await this.app.vault.cachedRead(item.file));
      } catch {}
      this.captionCache.set(key, text);
      item.caption = text;
      return text;
    }

    // The one visible-list pipeline; upstream's detail nav and the players read it too.
    filtered() {
      return browse.visibleList(this.items || [], this.normalizeFilter(), this.listOpts());
    }

    // What the players draw from: the visible list, and by default only what can
    // actually play on this device (owner: embeds never interrupt a session).
    playlist() {
      const base = this.filtered();
      if (this.plugin.settings.playerPlayableOnly === false) return base;
      const playable = base.filter((it) => browse.isPlayable(it, (x) => this.hasFile(x), this.streams().enabled()));
      return playable.length ? playable : base;
    }

    tvList(mode) {
      const base = this.playlist();
      const unw = base.filter((x) => !x.watched);
      return mode === "unwatched" && unw.length ? unw : base;
    }

    // On a phone the detail pane sits above the grid, so tapping a card far down a
    // 64-card page used to scroll all the way back up, and playback started only
    // after a frontmatter write, outside the tap. The phone gets the pop-up player
    // instead, opened synchronously inside the tap so play() is allowed with sound.
    async selectItem(item) {
      if (isPhone()) {
        try {
          this.openModal(item);
        } catch (e) {
          this.renderError(e);
        }
        return;
      }
      return super.selectItem(item);
    }

    openModal(item) {
      let list = this.playlist();
      let idx = list.findIndex((c) => c.id === item.id);
      if (idx < 0) {
        list = [item];
        idx = 0;
      }
      if (this.tv) this.tv.teardown();
      this.tv = new TvPlayer(this, list, idx, { mode: "modal" });
      this.tv.open();
    }

    // The new item, ready to tag: the phone's pop-up with the sheet up, or the
    // desktop pane plus the sheet as a dialog.
    async openForTags(item) {
      if (isPhone()) {
        this.openModal(item);
        if (this.tv) this.tv.openTags(item);
        return;
      }
      await this.selectItem(item);
      new TagSheetModal(this.app, this.plugin, this, item).open();
    }

    openTv() {
      const list = this.tvList(this.tvMode);
      if (!list.length) {
        new Notice("Media Log: nothing to play in the current filters");
        return;
      }
      if (this.tv) this.tv.teardown();
      this.tv = new TvPlayer(this, list, 0, { mode: "tv" });
      this.tv.open();
    }

    ensureCaptions() {
      if (this.captionsLoaded || this.captionsLoading) return;
      const items = this.items;
      this.captionsLoading = loadCaptions(this.app, items, this.captionCache)
        .then(() => {
          if (this.items !== items) return; // a re-render replaced the list meanwhile
          this.captionsLoaded = true;
          this.captionsLoading = null;
          if (this.filter.search) this.renderGrid(); // captions join the match once loaded
        })
        .catch(() => {
          this.captionsLoading = null;
        });
    }

    // ---- toolbar, tag chips, dropdown counts ---------------------------------
    paintTools() {
      const el = this.toolsEl;
      if (!el) return;
      el.empty();
      const f = this.normalizeFilter();
      const mk = (label, active, onClick, aria) => {
        const b = el.createEl("button", {
          cls: "mlog-tool" + (active ? " mlog-tool--active" : ""),
          text: label,
          attr: aria ? { "aria-label": aria } : {},
        });
        b.addEventListener("click", onClick);
        return b;
      };
      const shuffled = f.seed !== null;
      mk(`Random ${this.pageSize()}`, shuffled, () => {
        f.seed = Date.now(); // re-press = a fresh deal
        this.renderGrid();
      }, "Random deal");
      if (shuffled) {
        mk("Exit shuffle", false, () => {
          f.seed = null;
          this.renderGrid();
        });
      }
      const dayBase = browse.visibleList(this.items || [], { ...f, onDay: false, seed: null }, this.listOpts());
      const odN = browse.onThisDayItems(dayBase, this.todayMMDD).length;
      if (odN || f.onDay) {
        // hidden at zero, kept visible while active so it can be untoggled
        mk(`On this day · ${odN}`, !!f.onDay, () => {
          f.onDay = !f.onDay;
          this.renderGrid();
        });
      }
      // Sort
      const sortSel = el.createEl("select", { cls: "mlog-tool mlog-tool--select", attr: { "aria-label": "Sort" } });
      for (const s of browse.SORTS) {
        const o = sortSel.createEl("option", { value: s.key, text: s.label });
        if (s.key === f.sort) o.selected = true;
      }
      sortSel.addEventListener("change", () => {
        f.sort = sortSel.value;
        this.renderGrid();
      });
      // Month
      const months = browse.monthOptions(this.items || []);
      if (months.length > 1 || f.month) {
        const monthSel = el.createEl("select", { cls: "mlog-tool mlog-tool--select", attr: { "aria-label": "Month" } });
        monthSel.createEl("option", { value: "", text: "All months" });
        for (const m of months) {
          const o = monthSel.createEl("option", { value: m.key, text: `${m.label} (${m.n})` });
          if (m.key === f.month) o.selected = true;
        }
        monthSel.addEventListener("change", () => {
          f.month = monthSel.value;
          this.renderGrid();
        });
      }
      const canStream = this.streams().enabled();
      const playableN = browse.visibleList(this.items || [], { ...f, playable: false, seed: null }, this.listOpts()).filter((it) => browse.isPlayable(it, (x) => this.hasFile(x), canStream)).length;
      mk(`Playable here · ${playableN}`, !!f.playable, () => {
        f.playable = !f.playable;
        this.renderGrid();
      }, canStream ? "Only items that play on this device: a local video, or a reel Instagram will stream" : "Only items with a local video on this device");
      if ((this.items || []).length) {
        mk("Scan", false, () => new ScanModal(this.app, this.plugin, this).open(), "Duplicate scan");
        mk("TV", false, () => this.openTv(), "TV mode");
      }
      mk("Refresh", false, () => this.refreshItems(), "Re-read the items folder");
      mk("Guide", false, () => this.app.workspace.openLinkText(String(this.plugin.settings.guideNote || SIFI_DEFAULTS.guideNote), "", false), "Open the Media guide");
    }

    paintTags() {
      const el = this.tagsEl;
      if (!el) return;
      el.empty();
      const f = this.normalizeFilter();
      const items = this.items || [];
      const uni = browse.tagUniverse(items);
      if (!uni.length) {
        el.classList.add("mlog__tags--empty");
        return; // nothing is tagged yet: no chips, no Untagged
      }
      el.classList.remove("mlog__tags--empty");
      const chip = (label, on, onClick) => {
        const b = el.createEl("button", { cls: "mlog-tag" + (on ? " mlog-tag--on" : ""), text: label });
        b.addEventListener("click", onClick);
        return b;
      };
      // Selected tags always show; otherwise the busiest TAG_CHIP_LIMIT, with More/Fewer.
      const shown = this.tagsExpanded ? uni : uni.filter((u, i) => i < TAG_CHIP_LIMIT || f.tags.includes(u.key));
      for (const u of shown) {
        const on = f.tags.includes(u.key);
        chip(`${u.label} · ${u.n}`, on, () => {
          f.tags = on ? f.tags.filter((k) => k !== u.key) : f.tags.concat([u.key]);
          f.untagged = false;
          this.renderGrid();
        });
      }
      if (uni.length > TAG_CHIP_LIMIT) {
        chip(this.tagsExpanded ? "Fewer tags" : `+${uni.length - shown.length} more`, false, () => {
          this.tagsExpanded = !this.tagsExpanded;
          this.paintTags();
        });
      }
      const un = browse.untaggedCount(items);
      if (un || f.untagged) {
        chip(`Untagged · ${un}`, !!f.untagged, () => {
          f.untagged = !f.untagged;
          if (f.untagged) f.tags = [];
          this.renderGrid();
        });
      }
      if (f.tags.length || f.untagged) {
        chip("Clear tags", false, () => {
          f.tags = [];
          f.untagged = false;
          this.renderGrid();
        });
      }
    }

    // Live counts inside upstream's platform dropdown, computed within the other active filters.
    paintFilterCounts() {
      if (!this.root) return;
      const sel = Array.from(this.root.querySelectorAll(".mlog__filters select")).find(
        (s) => s.options && s.options[0] && /^All platforms/.test(s.options[0].text)
      );
      if (!sel) return;
      const counts = browse.platformCounts(this.items || [], this.normalizeFilter(), this.listOpts());
      let total = 0;
      for (const k of Object.keys(counts)) total += counts[k];
      for (const o of Array.from(sel.options)) {
        if (!o.value) o.text = `All platforms (${total})`;
        else o.text = `${o.value} (${counts[o.value] || 0})`;
      }
    }

    // ---- the grid ---------------------------------------------------------------
    renderGrid() {
      const grid = this.gridEl;
      if (!grid) return;
      grid.empty();
      this.thumbs.reset(); // the outgoing page's cards stop being observed; the budget starts fresh
      const key = JSON.stringify(this.normalizeFilter());
      if (key !== this.lastKey) {
        this.page = 0; // any filter/search/tag change lands back on page 1
        this.lastKey = key;
      }
      if (this.filter.search && !this.captionsLoaded) this.ensureCaptions();
      const list = this.filtered();
      if (list.length === 0) {
        const empty = grid.createDiv({ cls: "mlog__empty" });
        empty.createDiv({ text: (this.items || []).length === 0 ? "No media items yet." : "Nothing matches the filters." });
        if ((this.items || []).length === 0) {
          empty.createDiv({ cls: "mlog__empty-sub", text: 'Use "Add item" to save your first link.' });
        }
        this.paintTools();
        this.paintTags();
        this.paintFilterCounts();
        return;
      }
      const shuffled = this.filter.seed !== null;
      const pg = shuffled
        ? { items: list, pageIdx: 0, totalPages: 1, total: list.length, pageSize: list.length } // a deal is already one page, dealt order
        : browse.paginate(list, this.page, this.pageSize());
      this.page = pg.pageIdx;
      const header = (label, n) => {
        const h = grid.createDiv({ cls: "mlog__month" });
        h.createSpan({ text: label });
        h.createSpan({ text: String(n) });
      };
      if (shuffled) {
        header("Shuffled", list.length);
        for (const item of pg.items) this.renderCard(grid, item);
      } else if (this.filter.sort && this.filter.sort !== "newest" && this.filter.sort !== "oldest") {
        header(browse.SORTS.find((s) => s.key === this.filter.sort).label, pg.items.length);
        for (const item of pg.items) this.renderCard(grid, item);
      } else {
        for (const g of browse.groupByMonth(pg.items)) {
          header(g.label, g.items.length);
          for (const item of g.items) this.renderCard(grid, item);
        }
      }
      this.renderPager(grid, pg);
      this.paintTools();
      this.paintTags();
      this.paintFilterCounts();
    }

    renderCard(grid, item) {
      const selected = this.selected && this.selected.id === item.id;
      const card = grid.createDiv({
        cls: selected ? "mlog-card mlog-card--selected" : "mlog-card",
        attr: { role: "button", tabindex: "0", "data-id": item.id },
      });
      const gone = browse.isGone(item) && !this.streams().can(item); // a refused download still streams
      if (gone) card.classList.add("mlog-card--gone");
      const thumb = card.createDiv({ cls: "mlog-card__thumb" });
      thumb.createDiv({ cls: "mlog-card__placeholder", text: gone ? "No copy" : item.kind && item.kind !== "link" ? item.kind : item.platform });
      const src = gone ? "" : thumbSrc(this.app, item);
      if (src) this.thumbs.bind(thumb, src, isPhone());
      if (item.starred) thumb.createSpan({ cls: "mlog-card__star", text: "★", attr: { "aria-label": "Starred" } });
      if (!item.watched && !gone) thumb.createSpan({ cls: "mlog-card__unwatched", text: "New" });
      const body = card.createDiv({ cls: "mlog-card__body" });
      body.createDiv({ cls: "mlog-card__title", text: item.title });
      const metaRow = body.createDiv({ cls: "mlog-card__meta" });
      metaRow.createSpan({ cls: "mlog-chip", text: item.platform });
      if (item.creator && item.creator !== item.platform) metaRow.createSpan({ text: item.creator });
      metaRow.createSpan({ cls: "mlog-card__date", text: browse.shortDateOf(item.dkey) || String(item.capturedAt).slice(0, 10) });
      if (item.tags && item.tags.length) body.createDiv({ cls: "mlog-card__tags", text: item.tags.join(" · ") });
      const activate = () => this.selectItem(item);
      card.addEventListener("click", () => {
        if (textSelected(card)) return;
        activate();
      });
      card.addEventListener("keydown", (event) => {
        if (event.target !== card || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        activate();
      });
    }

    renderPager(grid, pg) {
      if (pg.totalPages <= 1) return;
      const bar = grid.createDiv({ cls: "mlog__pager" });
      const go = (idx) => {
        this.page = idx;
        this.renderGrid();
        if (this.gridEl && this.gridEl.scrollIntoView) this.gridEl.scrollIntoView({ block: "start", behavior: "smooth" });
      };
      const btn = (label, disabled, idx, aria) => {
        const b = bar.createEl("button", { text: label, attr: aria ? { "aria-label": aria } : {} });
        b.disabled = disabled;
        b.addEventListener("click", () => go(idx));
        return b;
      };
      btn("«", pg.pageIdx <= 0, 0, "First page");
      btn("Previous", pg.pageIdx <= 0, pg.pageIdx - 1);
      bar.createSpan({ text: `Page ${pg.pageIdx + 1} of ${pg.totalPages} · ${browse.rangeLabel(pg)}` });
      btn("Next", pg.pageIdx >= pg.totalPages - 1, pg.pageIdx + 1);
      btn("»", pg.pageIdx >= pg.totalPages - 1, pg.totalPages - 1, "Last page");
    }

    // Detail pane: autoplaying, sized for the item's shape; when a video ends the
    // next visible item is selected (owner ask 2026-09-05), or it loops if auto-advance is off.
    renderMedia(container, item) {
      const streams = this.streams();
      let whyEl = null;
      buildMedia(this.app, container, item, {
        autoplay: true,
        loop: !this.autoAdvance,
        streams,
        onFallback: () => {
          if (whyEl) whyEl.setText(whyNoVideo(this.app, item, streams));
        },
        onMuted: (player) => unmuteBadge(container, player),
        onEnded: () => {
          if (!this.autoAdvance || this.tv) return;
          const visible = this.filtered();
          const i = visible.findIndex((c) => c.id === item.id);
          if (i >= 0 && i < visible.length - 1) this.selectItem(visible[i + 1]);
        },
      });
      const why = whyNoVideo(this.app, item, streams);
      if (why) whyEl = container.createDiv({ cls: "mlog-detail__why", text: why });
      const cap = container.createDiv({ cls: "mlog-detail__caption" });
      this.captionFor(item).then((text) => {
        if (this.selected && this.selected.id === item.id && text) cap.setText(text);
        else cap.remove();
      });
    }

    renderError(err) {
      try {
        if (this.tv) this.tv.teardown();
        const root = this.root || this.contentEl;
        root.empty();
        const card = root.createDiv({ cls: "mlog__error" });
        card.createDiv({ cls: "mlog__error-title", text: "Media Log hit a snag on this device" });
        card.createDiv({ cls: "mlog__empty-sub", text: String((err && err.message) || err || "unknown error") });
        card.createDiv({ cls: "mlog__empty-sub", text: "Tell me what this says and what you tapped just before." });
        const btn = card.createEl("button", { cls: "mod-cta", text: "Reload" });
        btn.addEventListener("click", () => this.render());
        console.error("Media Log:", err);
      } catch (e2) {
        console.error("Media Log: error while rendering the error card", e2, err);
      }
    }
  }

  // ---- settings ----------------------------------------------------------------
  class SifiSettingTab extends MediaLogSettingTab {
    display() {
      super.display();
      const c = this.containerEl;
      const s = this.plugin.settings;
      c.createEl("h3", { text: "Sifi's edition" });
      new Setting(c)
        .setName("Items per page")
        .setDesc("Grid page size; also the size of a Random deal.")
        .addText((t) =>
          t.setValue(String(s.pageSize)).onChange(async (v) => {
            const n = parseInt(v, 10);
            s.pageSize = n > 0 ? n : SIFI_DEFAULTS.pageSize;
            await this.plugin.saveSettings();
          })
        );
      new Setting(c)
        .setName("Portrait cards")
        .setDesc("9:16 thumbnails for a reel-heavy library.")
        .addToggle((t) =>
          t.setValue(!!s.portraitCards).onChange(async (v) => {
            s.portraitCards = v;
            await this.plugin.saveSettings();
          })
        );
      new Setting(c)
        .setName("Dwell (seconds) for items without a video")
        .setDesc("How long the player stays on an embed or image before moving on. Local videos move on when they end.")
        .addText((t) =>
          t.setValue(String(s.tvDwellSecs)).onChange(async (v) => {
            const n = parseInt(v, 10);
            s.tvDwellSecs = n > 0 ? n : SIFI_DEFAULTS.tvDwellSecs;
            await this.plugin.saveSettings();
          })
        );
      new Setting(c)
        .setName("Auto-advance")
        .setDesc("When a video ends, play the next one; items without a video move on after the dwell. Also toggled from the player.")
        .addToggle((t) =>
          t.setValue(s.autoAdvance !== false).onChange(async (v) => {
            s.autoAdvance = v;
            await this.plugin.saveSettings();
          })
        );
      new Setting(c)
        .setName("Players use only what plays here")
        .setDesc("TV mode and the pop-up draw only from items that play on this device: a local video, or a reel Instagram will stream. Embeds and posts are skipped.")
        .addToggle((t) =>
          t.setValue(s.playerPlayableOnly !== false).onChange(async (v) => {
            s.playerPlayableOnly = v;
            await this.plugin.saveSettings();
          })
        );
      new Setting(c)
        .setName("Stream from Instagram")
        .setDesc("No local copy on this device? Fetch the reel's video link from Instagram and stream it — it autoplays; needs internet. Off: play Instagram's embed instead.")
        .addToggle((t) =>
          t.setValue(s.streamRemote !== false).onChange(async (v) => {
            s.streamRemote = v;
            await this.plugin.saveSettings();
          })
        );
      new Setting(c)
        .setName("Ask for tags after a share-sheet save")
        .setDesc("When a link arrives from the Save to Media Log shortcut, open the new item with the tag sheet up. Off: save silently, as before.")
        .addToggle((t) =>
          t.setValue(s.tagAfterCapture !== false).onChange(async (v) => {
            s.tagAfterCapture = v;
            await this.plugin.saveSettings();
          })
        );
      new Setting(c)
        .setName("Poster frames")
        .setDesc("On desktop, grab a frame from each local video that has no screenshot and use it as the thumbnail.")
        .addToggle((t) =>
          t.setValue(!!s.posterFrames).onChange(async (v) => {
            s.posterFrames = v;
            await this.plugin.saveSettings();
          })
        );
      new Setting(c)
        .setName("Bottom bar on phones")
        .setDesc("Show the Select bottom bar inside the library on a phone (hidden while a player is open).")
        .addToggle((t) =>
          t.setValue(!!s.bottomBar).onChange(async (v) => {
            s.bottomBar = v;
            await this.plugin.saveSettings();
          })
        );
      new Setting(c)
        .setName("Guide note")
        .setDesc("Vault note the Guide button opens.")
        .addText((t) =>
          t.setValue(String(s.guideNote)).onChange(async (v) => {
            s.guideNote = v.trim() || SIFI_DEFAULTS.guideNote;
            await this.plugin.saveSettings();
          })
        );
      new Setting(c)
        .setName("Duplicate-scan log")
        .setDesc("Note that records every item the duplicate scan trashes.")
        .addText((t) =>
          t.setValue(String(s.quarantineLog)).onChange(async (v) => {
            s.quarantineLog = v.trim() || SIFI_DEFAULTS.quarantineLog;
            await this.plugin.saveSettings();
          })
        );
    }
  }

  return {
    LibraryView: SifiLibraryView,
    SettingTab: SifiSettingTab,
    ScanModal,
    TvPlayer,
    ThumbBudget,
    BottomBar,
    PosterFactory,
    StreamResolver,
    buildMedia,
    buildTagSheet,
    TagSheetModal,
    decorateAddModal,
    afterCapture,
    itemFromFile,
    fetchMetaFast,
    patchLateTitle,
    loadCaptions,
    keepOne,
    thumbSrc,
    BOTTOM_BAR_TABS,
    SIFI_DEFAULTS,
  };
}

module.exports = { build, SIFI_DEFAULTS, BOTTOM_BAR_TABS };
