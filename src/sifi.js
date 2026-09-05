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
//   - a bottom bar inside the view on phones, hidden while a player is open
//   - Guide button, duplicate scan with keep-one and a quarantine log
"use strict";

const { Modal, Notice, Setting, setIcon } = require("obsidian");
const browse = require("./browse");

const SIFI_DEFAULTS = {
  pageSize: 64,
  portraitCards: true,
  tvDwellSecs: 20,
  quarantineLog: "Media Log/Deleted Media.md",
  guideNote: "Select/Guide/Media",
  posterFrames: true,
  bottomBar: true,
};
const THUMB_LIVE_MAX = 24;
const WATCH_DWELL_MS = 3000;
const TICK_MS = 500;
const CONTROLS_FADE_MS = 2500;
const REFRESH_DEBOUNCE_MS = 900;
const POSTER_MAX_WIDTH = 540;
const POSTER_TIMEOUT_MS = 12000;

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

  // ---- the media element, shared by the detail pane and the players -----------
  // Local video → embed → image (vault screenshot or remote preview) → placeholder.
  function buildMedia(app, container, item, opts) {
    const o = opts || {};
    const cls = "mlog-detail__media " + (browse.isPortrait(item) ? "mlog-detail__media--portrait" : "mlog-detail__media--wide");
    const shot = item.screenshot && app.vault.getAbstractFileByPath(item.screenshot);
    const poster = shot ? app.vault.getResourcePath(shot) : item.previewRemote || "";
    const video = item.video && item.video !== "none" && app.vault.getAbstractFileByPath(item.video);
    if (video) {
      const attr = { controls: "", preload: "auto", playsinline: "", src: app.vault.getResourcePath(video) };
      if (o.autoplay) attr.autoplay = "";
      if (o.loop) attr.loop = "";
      const player = container.createEl("video", { cls, attr });
      if (poster) player.setAttribute("poster", poster);
      if (o.onEnded) player.addEventListener("ended", o.onEnded);
      if (o.autoplay && typeof player.play === "function") {
        const p = player.play();
        if (p && typeof p.catch === "function") {
          p.catch(() => {
            player.muted = true; // the webview refused sound without a gesture — play muted rather than not at all
            const q = player.play();
            if (q && typeof q.catch === "function") q.catch(() => {});
          });
        }
      }
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
      this.auto = !this.modal;
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
    }

    open() {
      this.overlay = document.body.createDiv({ cls: this.modal ? "mlog-tv mlog-tv--modal" : "mlog-tv" });
      this.overlay.addEventListener("click", (e) => {
        if (this.modal && e.target === this.overlay) {
          this.close(); // scrim tap closes the pop-up
          return;
        }
        this.showControls();
      });
      this.panel = this.overlay.createDiv({ cls: "mlog-tv__panel" });
      this.ctl = this.overlay.createDiv({ cls: "mlog-tv__ctl" });
      this.keydown = (e) => {
        if (e.key === "Escape") this.close();
        else if (e.key === "ArrowRight") this.step(1);
        else if (e.key === "ArrowLeft") this.step(-1);
      };
      document.addEventListener("keydown", this.keydown);
      if (this.view.bar) this.view.bar.hide(true);
      this.show(this.idx);
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

    show(idx) {
      this.clearTimers();
      this.stopMedia();
      const item = this.list[idx];
      if (!item) {
        this.close();
        return;
      }
      this.idx = idx;
      this.panel.empty();
      this.panel.classList.toggle("mlog-tv__panel--wide", !browse.isPortrait(item)); // the panel takes the item's shape
      // Built synchronously inside the tap that opened or stepped the player, so the
      // webview's user activation still covers play() with sound on iOS.
      const media = buildMedia(this.app, this.panel, item, {
        autoplay: true,
        loop: this.modal && !this.auto, // the pop-up loops a reel until auto-advance is switched on
        onEnded: () => {
          if (this.auto) this.step(1);
        },
      });
      this.paintControls(item, media);
      this.watchT = setTimeout(async () => {
        // 3s dwell marks watched — a mis-tap never counts; the check button unmarks
        if (item.watched) return;
        try {
          await this.plugin.updateReviewState(item, "watched", true);
        } catch {}
        if (this.paintWatched) this.paintWatched();
      }, WATCH_DWELL_MS);
      // Local video advances when it ends; embeds and images advance on the dwell timer.
      if (this.auto && media.kind !== "video") this.adv = browse.advInit(this.dwell, 0, Date.now());
      this.timer = setInterval(() => {
        if (!this.adv) return;
        const r = browse.advanceTick(this.adv, Date.now());
        this.adv = r.st;
        if (r.action === "advance") this.step(1);
      }, TICK_MS);
      this.showControls();
    }

    step(dir) {
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
      this.show(ni);
    }

    paintControls(item, media) {
      const ctl = this.ctl;
      ctl.empty();
      ctl.createDiv({ cls: "mlog-tv__title", text: `${this.idx + 1} / ${this.list.length} · ${item.title}` });
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
        this.auto ? "pause" : "play",
        () => {
          this.auto = !this.auto;
          this.adv = this.auto && media.kind !== "video" ? browse.advInit(this.dwell, 0, Date.now()) : null;
          if (media.kind === "video" && media.el) media.el.loop = this.modal && !this.auto;
          setIcon(pp, this.auto ? "pause" : "play");
          pp.classList.toggle("mlog-tv__btn--active", this.modal && this.auto);
        },
        this.modal && this.auto
      );
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
      row1.createDiv({ cls: "mlog-tv__spacer" });
      btn(row1, "Close", "x", () => this.close());

      const row2 = ctl.createDiv({ cls: "mlog-tv__row" });
      if (this.modal) {
        if (item.sourceUrl) btn(row2, "Open source", "external-link", () => window.open(item.sourceUrl, "_blank"));
        if (item.file) {
          btn(row2, "Open note", "file-text", () => {
            this.close();
            this.app.workspace.openLinkText(item.file.path, "", false);
          });
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

    showControls() {
      if (!this.ctl) return;
      this.ctl.classList.remove("mlog-tv__ctl--hidden");
      if (this.fadeT) clearTimeout(this.fadeT);
      this.fadeT = setTimeout(() => {
        if (this.ctl) this.ctl.classList.add("mlog-tv__ctl--hidden");
      }, CONTROLS_FADE_MS);
    }

    // Tear down without touching the library (used by the error card).
    teardown() {
      this.clearTimers();
      this.stopMedia();
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
      this.timer = setInterval(() => {
        if (!this.visible()) this.unmount(); // the library left the screen — a body-mounted bar must not outlive it
      }, 1000);
    }

    hide(h) {
      if (this.el) this.el.classList.toggle("mlog-bar--hidden", !!h);
    }

    unmount() {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      if (this.el) this.el.remove();
      this.el = null;
      if (this.view.root) this.view.root.classList.remove("mlog--barred");
    }
  }

  // ---- the library view --------------------------------------------------------
  class SifiLibraryView extends LibraryView {
    constructor(leaf, plugin) {
      super(leaf, plugin);
      Object.assign(this.filter, { onDay: false, seed: null, tags: [], untagged: false, month: "", sort: "newest" });
      this.page = 0;
      this.lastKey = "";
      this.toolsEl = null;
      this.tagsEl = null;
      this.thumbs = new ThumbBudget();
      this.tv = null;
      this.tvMode = "unwatched"; // TV binges the unwatched by default; falls back to all when everything's seen
      this.captionCache = new Map();
      this.captionsLoaded = false;
      this.captionsLoading = null;
      this.refreshT = null;
      this.bar = new BottomBar(this);
      this.todayMMDD = browse.todayMMDD(new Date());
      guard(this, ["render", "renderGrid", "renderDetail"]);
    }

    pageSize() {
      const n = Number(this.plugin.settings.pageSize);
      return n > 0 ? n : SIFI_DEFAULTS.pageSize;
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
      return f;
    }

    listOpts() {
      return { todayMMDD: this.todayMMDD, pageSize: this.pageSize() };
    }

    // The one visible-list pipeline; upstream's detail nav and the players read it too.
    filtered() {
      return browse.visibleList(this.items || [], this.normalizeFilter(), this.listOpts());
    }

    tvList(mode) {
      const base = this.filtered();
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
      let list = this.filtered();
      let idx = list.findIndex((c) => c.id === item.id);
      if (idx < 0) {
        list = [item];
        idx = 0;
      }
      if (this.tv) this.tv.teardown();
      this.tv = new TvPlayer(this, list, idx, { mode: "modal" });
      this.tv.open();
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
      for (const u of uni) {
        const on = f.tags.includes(u.key);
        chip(`${u.label} · ${u.n}`, on, () => {
          f.tags = on ? f.tags.filter((k) => k !== u.key) : f.tags.concat([u.key]);
          f.untagged = false;
          this.renderGrid();
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
      const thumb = card.createDiv({ cls: "mlog-card__thumb" });
      thumb.createDiv({ cls: "mlog-card__placeholder", text: item.kind && item.kind !== "link" ? item.kind : item.platform });
      const src = thumbSrc(this.app, item);
      if (src) this.thumbs.bind(thumb, src, isPhone());
      if (item.starred) thumb.createSpan({ cls: "mlog-card__star", text: "★", attr: { "aria-label": "Starred" } });
      if (!item.watched) thumb.createSpan({ cls: "mlog-card__unwatched", text: "New" });
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

    // Detail pane: autoplaying, looping, sized for the item's shape.
    renderMedia(container, item) {
      buildMedia(this.app, container, item, { autoplay: true, loop: true });
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
        .setName("TV dwell (seconds)")
        .setDesc("How long TV mode stays on an embedded item before advancing. Local videos advance when they end.")
        .addText((t) =>
          t.setValue(String(s.tvDwellSecs)).onChange(async (v) => {
            const n = parseInt(v, 10);
            s.tvDwellSecs = n > 0 ? n : SIFI_DEFAULTS.tvDwellSecs;
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
    buildMedia,
    loadCaptions,
    keepOne,
    thumbSrc,
    BOTTOM_BAR_TABS,
    SIFI_DEFAULTS,
  };
}

module.exports = { build, SIFI_DEFAULTS, BOTTOM_BAR_TABS };
