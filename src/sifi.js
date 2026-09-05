// Media Log, Sifi's edition — the browse-tools layer.
//
// Everything here subclasses or wraps upstream's classes so upstream merges
// stay clean: main.js only registers sifi.LibraryView / sifi.SettingTab and
// calls browse.enrichItem. The rules and roadmap live in FORK.md.
//
// What this adds on top of upstream's library:
//   - Random <page>, On this day, and search that also covers caption text
//   - paging at <page> items with month headers (no more "showing 200 of N")
//   - phone image discipline: thumbnails only near the viewport, ~24 live
//   - an error card instead of a blank view when a render throws
//   - autoplaying detail player sized 9:16 for reels, remote-preview fallback
//   - TV mode: full-screen loop through the current filters, auto-advance
//   - duplicate scan with keep-one and a quarantine log
"use strict";

const { Modal, Notice, Setting, setIcon } = require("obsidian");
const browse = require("./browse");

const SIFI_DEFAULTS = {
  pageSize: 64,
  portraitCards: true,
  tvDwellSecs: 20,
  quarantineLog: "Media Log/Deleted Media.md",
};
const THUMB_LIVE_MAX = 24;
const WATCH_DWELL_MS = 3000;
const TICK_MS = 500;
const CONTROLS_FADE_MS = 2500;

function build({ LibraryView, MediaLogSettingTab, DEFAULT_SETTINGS, hasTextSelectionWithin }) {
  // Fork settings ride along with upstream's defaults; loadSettings spreads them.
  Object.assign(DEFAULT_SETTINGS, SIFI_DEFAULTS);

  const textSelected = typeof hasTextSelectionWithin === "function" ? hasTextSelectionWithin : () => false;
  const isPhone = () =>
    typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 700px)").matches;

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

  // ---- the media element, shared by the detail pane and TV -------------------
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

  // ---- TV mode: full-screen, loops the current filters, auto-advances --------
  // Mounted on document.body: Obsidian 1.13 applies contain:strict to leaves,
  // which hijacks position:fixed inside a view.
  class TvPlayer {
    constructor(view, list, idx) {
      this.view = view;
      this.plugin = view.plugin;
      this.app = view.app;
      this.list = list;
      this.idx = idx;
      this.auto = true;
      this.mode = view.tvMode;
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
      this.overlay = document.body.createDiv({ cls: "mlog-tv" });
      this.overlay.addEventListener("click", () => this.showControls());
      this.panel = this.overlay.createDiv({ cls: "mlog-tv__panel" });
      this.ctl = this.overlay.createDiv({ cls: "mlog-tv__ctl" });
      this.keydown = (e) => {
        if (e.key === "Escape") this.close();
        else if (e.key === "ArrowRight") this.step(1);
        else if (e.key === "ArrowLeft") this.step(-1);
      };
      document.addEventListener("keydown", this.keydown);
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
      const media = buildMedia(this.app, this.panel, item, { autoplay: true, loop: false, onEnded: () => this.step(1) });
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
      const ni = dir > 0 ? browse.nextIndex(this.idx, len, true) : browse.prevIndex(this.idx, len, true);
      if (ni < 0) {
        this.close();
        return;
      }
      this.show(ni);
    }

    paintControls(item, media) {
      const ctl = this.ctl;
      ctl.empty();
      ctl.createDiv({ cls: "mlog-tv__title", text: `${item.title} · ${this.idx + 1} / ${this.list.length}` });
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
      const pp = btn(row1, "Auto-advance", this.auto ? "pause" : "play", () => {
        this.auto = !this.auto;
        this.adv = this.auto && media.kind !== "video" ? browse.advInit(this.dwell, 0, Date.now()) : null;
        setIcon(pp, this.auto ? "pause" : "play");
      });
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
      btn(
        row2,
        this.mode === "unwatched" ? "Unwatched" : "All",
        null,
        () => {
          // one-tap flip rebuilds the TV list live from the library's current filters
          this.mode = this.mode === "unwatched" ? "all" : "unwatched";
          this.view.tvMode = this.mode;
          const nl = this.view.tvList(this.mode);
          if (nl.length) {
            this.list = nl;
            this.show(0);
          }
        },
        this.mode === "unwatched"
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
    }

    close() {
      this.teardown();
      this.view.renderGrid(); // watched dots and stars earned in TV land on the grid
      this.view.renderDetail();
    }
  }

  // ---- the library view --------------------------------------------------------
  class SifiLibraryView extends LibraryView {
    constructor(leaf, plugin) {
      super(leaf, plugin);
      Object.assign(this.filter, { onDay: false, seed: null });
      this.page = 0;
      this.lastKey = "";
      this.toolsEl = null;
      this.thumbs = new ThumbBudget();
      this.tv = null;
      this.tvMode = "unwatched"; // TV binges the unwatched by default; falls back to all when everything's seen
      this.captionCache = new Map();
      this.captionsLoaded = false;
      this.captionsLoading = null;
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
    }

    async onClose() {
      if (this.tv) this.tv.teardown();
      this.thumbs.reset();
      if (typeof super.onClose === "function") await super.onClose();
    }

    async render() {
      this.captionsLoaded = false;
      this.captionsLoading = null;
      this.toolsEl = null;
      await super.render();
      this.root.classList.toggle("mlog--portrait", !!this.plugin.settings.portraitCards);
      const body = this.gridEl && this.gridEl.parentElement;
      this.toolsEl = this.root.createDiv({ cls: "mlog__tools" });
      if (body) this.root.insertBefore(this.toolsEl, body);
      this.paintTools();
    }

    // Upstream's "Clear filters" rebuilds the filter object without the fork keys.
    normalizeFilter() {
      const f = this.filter;
      if (f.seed === undefined) f.seed = null;
      if (f.onDay === undefined) f.onDay = false;
      return f;
    }

    // The one visible-list pipeline; upstream's detail nav and TV read it too.
    filtered() {
      return browse.visibleList(this.items || [], this.normalizeFilter(), { todayMMDD: this.todayMMDD, pageSize: this.pageSize() });
    }

    tvList(mode) {
      const base = this.filtered();
      const unw = base.filter((x) => !x.watched);
      return mode === "unwatched" && unw.length ? unw : base;
    }

    openTv() {
      const list = this.tvList(this.tvMode);
      if (!list.length) {
        new Notice("Media Log: nothing to play in the current filters");
        return;
      }
      if (this.tv) this.tv.teardown();
      this.tv = new TvPlayer(this, list, 0);
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
      const dayBase = browse.visibleList(this.items || [], { ...f, onDay: false, seed: null }, { todayMMDD: this.todayMMDD });
      const odN = browse.onThisDayItems(dayBase, this.todayMMDD).length;
      if (odN || f.onDay) {
        // hidden at zero, kept visible while active so it can be untoggled
        mk(`On this day · ${odN}`, !!f.onDay, () => {
          f.onDay = !f.onDay;
          this.renderGrid();
        });
      }
      if ((this.items || []).length) {
        mk("Scan", false, () => new ScanModal(this.app, this.plugin, this).open(), "Duplicate scan");
        mk("TV", false, () => this.openTv(), "TV mode");
      }
    }

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
        return;
      }
      const shuffled = this.filter.seed !== null;
      const pg = shuffled
        ? { items: list, pageIdx: 0, totalPages: 1, total: list.length } // a deal is already one page, dealt order
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
      } else {
        for (const g of browse.groupByMonth(pg.items)) {
          header(g.label, g.items.length);
          for (const item of g.items) this.renderCard(grid, item);
        }
      }
      this.renderPager(grid, pg);
      this.paintTools();
    }

    renderCard(grid, item) {
      const selected = this.selected && this.selected.id === item.id;
      const card = grid.createDiv({
        cls: selected ? "mlog-card mlog-card--selected" : "mlog-card",
        attr: { role: "button", tabindex: "0" },
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
      const prev = bar.createEl("button", { text: "Previous" });
      prev.disabled = pg.pageIdx <= 0;
      prev.addEventListener("click", () => go(pg.pageIdx - 1));
      bar.createSpan({ text: `Page ${pg.pageIdx + 1} of ${pg.totalPages} · ${pg.total} items` });
      const next = bar.createEl("button", { text: "Next" });
      next.disabled = pg.pageIdx >= pg.totalPages - 1;
      next.addEventListener("click", () => go(pg.pageIdx + 1));
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
    buildMedia,
    loadCaptions,
    keepOne,
    thumbSrc,
    SIFI_DEFAULTS,
  };
}

module.exports = { build, SIFI_DEFAULTS };
