var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// src/browse.js
var require_browse = __commonJS({
  "src/browse.js"(exports2, module2) {
    "use strict";
    var MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
    function safeStr(v) {
      if (v === null || v === void 0) return "";
      const s = String(v).trim();
      return s === "undefined" || s === "null" ? "" : s;
    }
    function hostOf(url) {
      const s = safeStr(url);
      if (!s) return "";
      const m = s.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/([^/?#]+)/);
      const h = m ? m[1] : s.split(/[/?#]/)[0];
      return h.replace(/^www\./i, "").replace(/:\d+$/, "").toLowerCase();
    }
    function itemUrl(it) {
      return safeStr(it && (it.sourceUrl || it.url));
    }
    function dateKeyOf(capturedAt, mediaId) {
      const m = safeStr(capturedAt).match(/^(\d{4}-\d{2}-\d{2})/);
      if (m) return m[1];
      const id = safeStr(mediaId).match(/(\d{4})(\d{2})(\d{2})-\d{6}/);
      return id ? `${id[1]}-${id[2]}-${id[3]}` : "";
    }
    function mmddOf(dkey) {
      const m = String(dkey || "").match(/^\d{4}-(\d{2}-\d{2})/);
      return m ? m[1] : "";
    }
    function todayMMDD(d) {
      const p = (n) => String(n).padStart(2, "0");
      return p(d.getMonth() + 1) + "-" + p(d.getDate());
    }
    function monthLabelOf(dkey) {
      const m = String(dkey || "").match(/^(\d{4})-(\d{2})/);
      const mi = m ? parseInt(m[2], 10) : 0;
      return mi >= 1 && mi <= 12 ? MONTHS[mi - 1] + " " + m[1] : "UNDATED";
    }
    function shortDateOf(dkey) {
      const m = String(dkey || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
      const mi = m ? parseInt(m[2], 10) : 0;
      if (mi < 1 || mi > 12) return "";
      return MONTHS[mi - 1].charAt(0) + MONTHS[mi - 1].slice(1, 3).toLowerCase() + " " + parseInt(m[3], 10);
    }
    function onThisDayItems(items, mmdd) {
      return mmdd ? (items || []).filter((it) => mmddOf(it && it.dkey) === mmdd) : [];
    }
    function groupByMonth(items) {
      const groups = [];
      let cur = null;
      for (const it of items || []) {
        const label = monthLabelOf(it && it.dkey);
        if (!cur || cur.label !== label) {
          cur = { label, items: [] };
          groups.push(cur);
        }
        cur.items.push(it);
      }
      return groups;
    }
    function matchesQuery(it, q) {
      const s = safeStr(q).toLowerCase();
      if (!s) return true;
      if (!it) return false;
      const hay = [it.title, it.creator, it.platform, (it.tags || []).join(" "), it.caption, itemUrl(it)].map((v) => safeStr(v)).join(" ").toLowerCase();
      return s.split(/\s+/).every((t) => !t || hay.indexOf(t) >= 0);
    }
    function shuffleBySeed(list, seed) {
      const out = (list || []).slice();
      let s = seed >>> 0 || 1;
      const rnd = () => {
        s = s * 1664525 + 1013904223 >>> 0;
        return s / 4294967296;
      };
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const t = out[i];
        out[i] = out[j];
        out[j] = t;
      }
      return out;
    }
    function paginate(list, pageIdx, pageSize) {
      const n = (list || []).length;
      const size = pageSize > 0 ? pageSize : 64;
      const totalPages = Math.max(1, Math.ceil(n / size));
      const idx = Math.min(Math.max(pageIdx || 0, 0), totalPages - 1);
      return { items: (list || []).slice(idx * size, idx * size + size), pageIdx: idx, totalPages, total: n };
    }
    function nextIndex(i, len, loop) {
      if (len <= 0) return -1;
      const n = i + 1;
      return n < len ? n : loop ? 0 : -1;
    }
    function prevIndex(i, len, loop) {
      if (len <= 0) return -1;
      const n = i - 1;
      return n >= 0 ? n : loop ? len - 1 : -1;
    }
    function advInit(playSecs, countSecs, nowMs) {
      return { phase: "playing", startedMs: nowMs, playSecs, countSecs };
    }
    function advanceTick(st, nowMs) {
      if (!st || st.phase === "off") return { action: "none", st };
      const reset = { phase: "playing", startedMs: nowMs, playSecs: st.playSecs, countSecs: st.countSecs };
      if (st.phase === "playing") {
        if (nowMs - st.startedMs >= st.playSecs * 1e3) {
          if (st.countSecs <= 0) return { action: "advance", st: reset };
          return {
            action: "show-countdown",
            left: st.countSecs,
            st: { phase: "countdown", startedMs: nowMs, playSecs: st.playSecs, countSecs: st.countSecs }
          };
        }
        return { action: "none", st };
      }
      if (st.phase === "countdown") {
        const left = st.countSecs - Math.floor((nowMs - st.startedMs) / 1e3);
        if (left <= 0) return { action: "advance", st: reset };
        return { action: "countdown", left, st };
      }
      return { action: "none", st };
    }
    function urlKeyOf(url) {
      const s = safeStr(url);
      if (!s) return "";
      const ig = s.match(/instagram\.com\/(reels?|p|tv)\/([A-Za-z0-9_-]+)/i);
      if (ig) {
        const seg = ig[1].toLowerCase();
        const kind = seg === "p" ? "p" : seg === "tv" ? "tv" : "reel";
        return "instagram.com/" + kind + "/" + ig[2];
      }
      const low = s.toLowerCase();
      const host = hostOf(low);
      if (!host) return "";
      const m = low.match(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]+([^?#]*)/);
      const path = ((m ? m[1] : low.replace(/^[^/?#]+/, "").split(/[?#]/)[0]) || "").replace(/\/+$/, "");
      return host + path;
    }
    function normTitleKey(title) {
      const s = safeStr(title).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
      return !s || s === "untitled" || s.length < 8 ? "" : s;
    }
    function dupeGroups(items) {
      const byUrl = {};
      for (const it of items || []) {
        const k = urlKeyOf(itemUrl(it));
        if (k) (byUrl[k] = byUrl[k] || []).push(it);
      }
      const groups = [];
      const taken = /* @__PURE__ */ new Set();
      for (const k of Object.keys(byUrl)) {
        if (byUrl[k].length > 1) {
          groups.push({ kind: "url", key: k, maybe: false, items: byUrl[k] });
          for (const it of byUrl[k]) taken.add(it);
        }
      }
      const byTitle = {};
      for (const it of items || []) {
        if (taken.has(it)) continue;
        const k = normTitleKey(it && it.title);
        if (!k || k === normTitleKey(hostOf(itemUrl(it)))) continue;
        (byTitle[k] = byTitle[k] || []).push(it);
      }
      for (const k of Object.keys(byTitle)) {
        if (byTitle[k].length > 1) groups.push({ kind: "title", key: k, maybe: true, items: byTitle[k] });
      }
      return groups;
    }
    function othersOf(group, keep) {
      return (group && group.items || []).filter((x) => x !== keep);
    }
    function stampNow(d) {
      const p = (n) => String(n).padStart(2, "0");
      return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
    }
    function quarantineLine(it, stamp) {
      return "- " + (it && it.title || "Untitled") + " \xB7 " + (itemUrl(it) || "\u2014") + " \xB7 trashed " + stamp + " \xB7 duplicate-scan";
    }
    function commentPreview(raw) {
      let s = String(raw == null ? "" : raw);
      s = s.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
      s = s.replace(/\s+/g, " ").trim();
      if (s === "undefined" || s === "null") s = "";
      if (s.length > 240) s = s.slice(0, 239).replace(/\s+$/, "") + "\u2026";
      return s;
    }
    function kindOf(it) {
      const k = safeStr(it && it.kind).toLowerCase();
      if (k) return k;
      const u = itemUrl(it).toLowerCase();
      const m = u.match(/instagram\.com\/(reels?|p|tv)\//);
      if (m) return m[1] === "p" ? "post" : m[1] === "tv" ? "tv" : "reel";
      return "link";
    }
    function isPortrait(it) {
      const k = kindOf(it);
      if (k === "reel" || k === "tv" || k === "video" || k === "post") return true;
      const p = safeStr(it && it.platform).toLowerCase();
      if (p === "instagram" || p === "tiktok") return true;
      return /instagram\.com|tiktok\.com/i.test(safeStr(it && it.embedUrl));
    }
    function autoplayUrl(url) {
      const s = safeStr(url);
      if (!s) return "";
      if (/[?&]autoplay=/i.test(s)) return s;
      return s + (s.indexOf("?") >= 0 ? "&" : "?") + "autoplay=1";
    }
    function matchesReview(item, filter) {
      if (filter === "unwatched") return !item.watched;
      if (filter === "watched") return !!item.watched;
      if (filter === "starred") return !!item.starred;
      return true;
    }
    function baseFilter(items, f) {
      return (items || []).filter((it) => {
        if (f.platform && it.platform !== f.platform) return false;
        if (f.tag && !(it.tags || []).includes(f.tag)) return false;
        if (f.review && !matchesReview(it, f.review)) return false;
        return true;
      });
    }
    function visibleList(items, filter, opts) {
      const f = filter || {};
      const o = opts || {};
      let L = baseFilter(items, f);
      if (f.onDay) L = onThisDayItems(L, o.todayMMDD || "");
      const q = safeStr(f.search);
      if (q) L = L.filter((it) => matchesQuery(it, q));
      if (f.seed !== null && f.seed !== void 0) L = shuffleBySeed(L, f.seed).slice(0, o.pageSize > 0 ? o.pageSize : 64);
      return L;
    }
    function enrichItem(item, fm) {
      const f = fm || {};
      const remote = safeStr(f.preview_remote);
      item.previewRemote = /^https:\/\//i.test(remote) ? remote : "";
      item.kind = kindOf({ kind: f.kind, url: item.sourceUrl });
      item.dkey = dateKeyOf(item.capturedAt, item.id);
      item.tagsLow = (item.tags || []).map((t) => String(t).toLowerCase());
      item.caption = "";
      return item;
    }
    module2.exports = {
      MONTHS,
      safeStr,
      hostOf,
      itemUrl,
      dateKeyOf,
      mmddOf,
      todayMMDD,
      monthLabelOf,
      shortDateOf,
      onThisDayItems,
      groupByMonth,
      matchesQuery,
      shuffleBySeed,
      paginate,
      nextIndex,
      prevIndex,
      advInit,
      advanceTick,
      urlKeyOf,
      normTitleKey,
      dupeGroups,
      othersOf,
      stampNow,
      quarantineLine,
      commentPreview,
      kindOf,
      isPortrait,
      autoplayUrl,
      matchesReview,
      baseFilter,
      visibleList,
      enrichItem
    };
  }
});

// src/sifi.js
var require_sifi = __commonJS({
  "src/sifi.js"(exports2, module2) {
    "use strict";
    var { Modal: Modal2, Notice: Notice2, Setting: Setting2, setIcon: setIcon2 } = require("obsidian");
    var browse2 = require_browse();
    var SIFI_DEFAULTS = {
      pageSize: 64,
      portraitCards: true,
      tvDwellSecs: 20,
      quarantineLog: "Media Log/Deleted Media.md"
    };
    var THUMB_LIVE_MAX = 24;
    var WATCH_DWELL_MS = 3e3;
    var TICK_MS = 500;
    var CONTROLS_FADE_MS = 2500;
    function build({ LibraryView: LibraryView2, MediaLogSettingTab: MediaLogSettingTab2, DEFAULT_SETTINGS: DEFAULT_SETTINGS2, hasTextSelectionWithin: hasTextSelectionWithin2 }) {
      Object.assign(DEFAULT_SETTINGS2, SIFI_DEFAULTS);
      const textSelected = typeof hasTextSelectionWithin2 === "function" ? hasTextSelectionWithin2 : () => false;
      const isPhone = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 700px)").matches;
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
              return void 0;
            }
          };
        }
      }
      function thumbSrc(app, item) {
        const shot = item.screenshot && app.vault.getAbstractFileByPath(item.screenshot);
        if (shot) return app.vault.getResourcePath(shot);
        return item.previewRemote || "";
      }
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
              this.attach(holder, src, false);
              return;
            }
          }
          this.io.observe(holder);
        }
        attach(holder, src, budgeted) {
          if (holder._mlogImg) return;
          const img = holder.createEl("img", {
            cls: "mlog-thumb--live",
            attr: { src, alt: "", loading: "lazy", decoding: "async" }
          });
          img.addEventListener("error", () => {
            holder._mlogImg = null;
            img.remove();
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
            } catch {
            }
          }
          this.live = [];
        }
      }
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
              it.caption = browse2.commentPreview(await app.vault.cachedRead(it.file));
            } catch {
              it.caption = "";
            }
            cache.set(key, it.caption);
          })
        );
      }
      function buildMedia(app, container, item, opts) {
        const o = opts || {};
        const cls = "mlog-detail__media " + (browse2.isPortrait(item) ? "mlog-detail__media--portrait" : "mlog-detail__media--wide");
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
                player.muted = true;
                const q = player.play();
                if (q && typeof q.catch === "function") q.catch(() => {
                });
              });
            }
          }
          return { kind: "video", el: player };
        }
        if (/^https:\/\//i.test(item.embedUrl)) {
          const iframe = container.createEl("iframe", {
            cls,
            attr: {
              src: o.autoplay ? browse2.autoplayUrl(item.embedUrl) : item.embedUrl,
              title: `Embedded media: ${item.title}`,
              loading: "lazy",
              allow: "autoplay; encrypted-media; picture-in-picture",
              allowfullscreen: "",
              referrerpolicy: "strict-origin-when-cross-origin",
              sandbox: "allow-scripts allow-same-origin allow-presentation"
            }
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
          "---\ntype: media-quarantine\n---\n\n# Deleted Media\n\nItems trashed by Media Log's duplicate scan. Every one is recoverable from Obsidian's trash.\n\n" + lines.join("\n") + "\n"
        );
      }
      async function keepOne(plugin, view, group, keep) {
        const others = browse2.othersOf(group, keep);
        const stamp = browse2.stampNow(/* @__PURE__ */ new Date());
        const lines = [];
        let trashed = 0;
        let error = "";
        for (const o of others) {
          try {
            await plugin.deleteItem(o);
          } catch (e) {
            error = "Couldn't trash a note \u2014 stopped; nothing else was touched.";
            break;
          }
          lines.push(browse2.quarantineLine(o, stamp));
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
      class ScanModal extends Modal2 {
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
          const groups = browse2.dupeGroups(items);
          if (!groups.length) {
            body.createDiv({ cls: "mlog-scan__clean", text: "Library clean \u2014 no duplicates" });
            body.createDiv({ cls: "mlog__empty-sub", text: `${items.length} items scanned` });
            return;
          }
          const nUrl = groups.filter((g) => !g.maybe).length;
          body.createDiv({ cls: "mlog__empty-sub", text: `${nUrl} definite \xB7 ${groups.length - nUrl} maybe` });
          for (const g of groups) {
            const gc = body.createDiv({ cls: "mlog-scan__group" });
            gc.createDiv({
              cls: "mlog-scan__label" + (g.maybe ? "" : " mlog-scan__label--definite"),
              text: g.maybe ? "Maybe \u2014 same title" : "Duplicate \u2014 same link"
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
              mc.createDiv({ cls: "mlog-scan__meta", text: [m.platform, browse2.shortDateOf(m.dkey)].filter(Boolean).join(" \xB7 ") });
              const keep = mc.createEl("button", { cls: "mod-cta", text: "Keep this one" });
              keep.addEventListener("click", async () => {
                keep.disabled = true;
                const r = await keepOne(this.plugin, this.view, g, m);
                this.statusEl.setText(
                  r.error || (r.trashed ? `Trashed ${r.trashed} \u2014 recoverable in Obsidian's trash, logged in ${this.plugin.settings.quarantineLog}.` : "Nothing to trash.")
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
            } catch {
            }
          }
          const f = this.overlay.querySelector("iframe");
          if (f) f.src = "about:blank";
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
            if (item.watched) return;
            try {
              await this.plugin.updateReviewState(item, "watched", true);
            } catch {
            }
            if (this.paintWatched) this.paintWatched();
          }, WATCH_DWELL_MS);
          if (this.auto && media.kind !== "video") this.adv = browse2.advInit(this.dwell, 0, Date.now());
          this.timer = setInterval(() => {
            if (!this.adv) return;
            const r = browse2.advanceTick(this.adv, Date.now());
            this.adv = r.st;
            if (r.action === "advance") this.step(1);
          }, TICK_MS);
          this.showControls();
        }
        step(dir) {
          const len = this.list.length;
          const ni = dir > 0 ? browse2.nextIndex(this.idx, len, true) : browse2.prevIndex(this.idx, len, true);
          if (ni < 0) {
            this.close();
            return;
          }
          this.show(ni);
        }
        paintControls(item, media) {
          const ctl = this.ctl;
          ctl.empty();
          ctl.createDiv({ cls: "mlog-tv__title", text: `${item.title} \xB7 ${this.idx + 1} / ${this.list.length}` });
          const btn = (parent, label, icon, onClick, active) => {
            const b = parent.createEl("button", {
              cls: "mlog-tv__btn" + (active ? " mlog-tv__btn--active" : ""),
              attr: { "aria-label": label }
            });
            if (icon) setIcon2(b, icon);
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
            this.adv = this.auto && media.kind !== "video" ? browse2.advInit(this.dwell, 0, Date.now()) : null;
            setIcon2(pp, this.auto ? "pause" : "play");
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
                if (this.adv) this.adv = browse2.advInit(sec, 0, Date.now());
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
          this.view.renderGrid();
          this.view.renderDetail();
        }
      }
      class SifiLibraryView extends LibraryView2 {
        constructor(leaf, plugin) {
          super(leaf, plugin);
          Object.assign(this.filter, { onDay: false, seed: null });
          this.page = 0;
          this.lastKey = "";
          this.toolsEl = null;
          this.thumbs = new ThumbBudget();
          this.tv = null;
          this.tvMode = "unwatched";
          this.captionCache = /* @__PURE__ */ new Map();
          this.captionsLoaded = false;
          this.captionsLoading = null;
          this.todayMMDD = browse2.todayMMDD(/* @__PURE__ */ new Date());
          guard(this, ["render", "renderGrid", "renderDetail"]);
        }
        pageSize() {
          const n = Number(this.plugin.settings.pageSize);
          return n > 0 ? n : SIFI_DEFAULTS.pageSize;
        }
        async onOpen() {
          await super.onOpen();
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
          if (f.seed === void 0) f.seed = null;
          if (f.onDay === void 0) f.onDay = false;
          return f;
        }
        // The one visible-list pipeline; upstream's detail nav and TV read it too.
        filtered() {
          return browse2.visibleList(this.items || [], this.normalizeFilter(), { todayMMDD: this.todayMMDD, pageSize: this.pageSize() });
        }
        tvList(mode) {
          const base = this.filtered();
          const unw = base.filter((x) => !x.watched);
          return mode === "unwatched" && unw.length ? unw : base;
        }
        openTv() {
          const list = this.tvList(this.tvMode);
          if (!list.length) {
            new Notice2("Media Log: nothing to play in the current filters");
            return;
          }
          if (this.tv) this.tv.teardown();
          this.tv = new TvPlayer(this, list, 0);
          this.tv.open();
        }
        ensureCaptions() {
          if (this.captionsLoaded || this.captionsLoading) return;
          const items = this.items;
          this.captionsLoading = loadCaptions(this.app, items, this.captionCache).then(() => {
            if (this.items !== items) return;
            this.captionsLoaded = true;
            this.captionsLoading = null;
            if (this.filter.search) this.renderGrid();
          }).catch(() => {
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
              attr: aria ? { "aria-label": aria } : {}
            });
            b.addEventListener("click", onClick);
            return b;
          };
          const shuffled = f.seed !== null;
          mk(`Random ${this.pageSize()}`, shuffled, () => {
            f.seed = Date.now();
            this.renderGrid();
          }, "Random deal");
          if (shuffled) {
            mk("Exit shuffle", false, () => {
              f.seed = null;
              this.renderGrid();
            });
          }
          const dayBase = browse2.visibleList(this.items || [], { ...f, onDay: false, seed: null }, { todayMMDD: this.todayMMDD });
          const odN = browse2.onThisDayItems(dayBase, this.todayMMDD).length;
          if (odN || f.onDay) {
            mk(`On this day \xB7 ${odN}`, !!f.onDay, () => {
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
          this.thumbs.reset();
          const key = JSON.stringify(this.normalizeFilter());
          if (key !== this.lastKey) {
            this.page = 0;
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
          const pg = shuffled ? { items: list, pageIdx: 0, totalPages: 1, total: list.length } : browse2.paginate(list, this.page, this.pageSize());
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
            for (const g of browse2.groupByMonth(pg.items)) {
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
            attr: { role: "button", tabindex: "0" }
          });
          const thumb = card.createDiv({ cls: "mlog-card__thumb" });
          thumb.createDiv({ cls: "mlog-card__placeholder", text: item.kind && item.kind !== "link" ? item.kind : item.platform });
          const src = thumbSrc(this.app, item);
          if (src) this.thumbs.bind(thumb, src, isPhone());
          if (item.starred) thumb.createSpan({ cls: "mlog-card__star", text: "\u2605", attr: { "aria-label": "Starred" } });
          if (!item.watched) thumb.createSpan({ cls: "mlog-card__unwatched", text: "New" });
          const body = card.createDiv({ cls: "mlog-card__body" });
          body.createDiv({ cls: "mlog-card__title", text: item.title });
          const metaRow = body.createDiv({ cls: "mlog-card__meta" });
          metaRow.createSpan({ cls: "mlog-chip", text: item.platform });
          if (item.creator && item.creator !== item.platform) metaRow.createSpan({ text: item.creator });
          metaRow.createSpan({ cls: "mlog-card__date", text: browse2.shortDateOf(item.dkey) || String(item.capturedAt).slice(0, 10) });
          if (item.tags && item.tags.length) body.createDiv({ cls: "mlog-card__tags", text: item.tags.join(" \xB7 ") });
          const activate = () => this.selectItem(item);
          card.addEventListener("click", () => {
            if (textSelected(card)) return;
            activate();
          });
          card.addEventListener("keydown", (event) => {
            if (event.target !== card || event.key !== "Enter" && event.key !== " ") return;
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
          bar.createSpan({ text: `Page ${pg.pageIdx + 1} of ${pg.totalPages} \xB7 ${pg.total} items` });
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
            card.createDiv({ cls: "mlog__empty-sub", text: String(err && err.message || err || "unknown error") });
            card.createDiv({ cls: "mlog__empty-sub", text: "Tell me what this says and what you tapped just before." });
            const btn = card.createEl("button", { cls: "mod-cta", text: "Reload" });
            btn.addEventListener("click", () => this.render());
            console.error("Media Log:", err);
          } catch (e2) {
            console.error("Media Log: error while rendering the error card", e2, err);
          }
        }
      }
      class SifiSettingTab extends MediaLogSettingTab2 {
        display() {
          super.display();
          const c = this.containerEl;
          const s = this.plugin.settings;
          c.createEl("h3", { text: "Sifi's edition" });
          new Setting2(c).setName("Items per page").setDesc("Grid page size; also the size of a Random deal.").addText(
            (t) => t.setValue(String(s.pageSize)).onChange(async (v) => {
              const n = parseInt(v, 10);
              s.pageSize = n > 0 ? n : SIFI_DEFAULTS.pageSize;
              await this.plugin.saveSettings();
            })
          );
          new Setting2(c).setName("Portrait cards").setDesc("9:16 thumbnails for a reel-heavy library.").addToggle(
            (t) => t.setValue(!!s.portraitCards).onChange(async (v) => {
              s.portraitCards = v;
              await this.plugin.saveSettings();
            })
          );
          new Setting2(c).setName("TV dwell (seconds)").setDesc("How long TV mode stays on an embedded item before advancing. Local videos advance when they end.").addText(
            (t) => t.setValue(String(s.tvDwellSecs)).onChange(async (v) => {
              const n = parseInt(v, 10);
              s.tvDwellSecs = n > 0 ? n : SIFI_DEFAULTS.tvDwellSecs;
              await this.plugin.saveSettings();
            })
          );
          new Setting2(c).setName("Duplicate-scan log").setDesc("Note that records every item the duplicate scan trashes.").addText(
            (t) => t.setValue(String(s.quarantineLog)).onChange(async (v) => {
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
        SIFI_DEFAULTS
      };
    }
    module2.exports = { build, SIFI_DEFAULTS };
  }
});

// src/main.js
var {
  Plugin,
  ItemView,
  PluginSettingTab,
  Setting,
  Modal,
  Notice,
  setIcon,
  requestUrl,
  normalizePath
} = require("obsidian");
var browse = require_browse();
var VIEW_TYPE = "media-log-library";
var DEFAULT_SETTINGS = {
  itemsFolder: "Media Log/Items",
  assetsFolder: "Media Log/Assets",
  downloadImages: true
};
var REVIEW_FILTERS = [
  { value: "", label: "All items" },
  { value: "unwatched", label: "Unwatched" },
  { value: "watched", label: "Watched" },
  { value: "starred", label: "Starred" }
];
var PLATFORMS = [
  { key: "YouTube", hosts: ["youtube.com", "youtu.be"] },
  { key: "X", hosts: ["x.com", "twitter.com"] },
  { key: "TikTok", hosts: ["tiktok.com"] },
  { key: "Instagram", hosts: ["instagram.com"] },
  { key: "Reddit", hosts: ["reddit.com", "redd.it"] }
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
  const d = /* @__PURE__ */ new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return {
    id: `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`,
    display: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  };
}
function slugify(text, max = 40) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max) || "item";
}
function decodeEntities(text) {
  return String(text || "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
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
    /<title[^>]*>([^<]+)<\/title>/i
  ]);
  meta.image = grab([
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i
  ]);
  meta.siteName = grab([
    /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i
  ]);
  meta.description = grab([
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i
  ]);
  return meta;
}
function hasTextSelectionWithin(element) {
  const selection = typeof window !== "undefined" && window.getSelection ? window.getSelection() : null;
  if (!selection || selection.isCollapsed || !selection.toString().trim()) return false;
  const node = selection.anchorNode || selection.focusNode;
  return Boolean(node && element.contains(node));
}
module.exports = class MediaLogPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.registerView(VIEW_TYPE, (leaf) => new sifi.LibraryView(leaf, this));
    this.addRibbonIcon("library", "Open Media Log", () => this.activateView());
    this.addCommand({ id: "open-library", name: "Open library", callback: () => this.activateView() });
    this.addCommand({ id: "add-item", name: "Add media item from URL", callback: () => new AddItemModal(this.app, this).open() });
    this.registerObsidianProtocolHandler("media-log", (params) => {
      if (params && params.url) {
        new AddItemModal(this.app, this, null, {
          url: params.url,
          title: params.title || "",
          tags: params.tags || "",
          autosave: params.autosave !== "false"
        }).open();
      } else {
        this.activateView();
      }
    });
    this.addSettingTab(new sifi.SettingTab(this.app, this));
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
    this.settings = { ...DEFAULT_SETTINGS, ...await this.loadData() || {} };
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
      const capturedAt = String(fm.captured_at || "");
      const idStamp = String(fm.media_id).match(/(\d{8}-\d{6})/)?.[1] || "";
      const sortKey = /^\d{4}-\d{2}-\d{2}/.test(capturedAt) ? capturedAt.replace(/[^0-9]/g, "") : idStamp.replace(/[^0-9]/g, "");
      items.push({
        file,
        id: fm.media_id,
        platform: fm.platform || "Web",
        title: fm.title || file.basename,
        creator: fm.creator || "",
        sourceUrl: fm.source_url || "",
        canonicalUrl: fm.canonical_url || "",
        capturedAt,
        sortKey,
        screenshot: fm.screenshot || "",
        video: fm.video || "",
        embedUrl: fm.embed_url || "",
        watched: fm.watched === true,
        starred: fm.starred === true,
        tags: Array.isArray(fm.tags) ? fm.tags.map(String) : []
      });
      browse.enrichItem(items[items.length - 1], fm);
    }
    items.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
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
      ""
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
        } catch {
        }
      }
    }
  }
  async updateTags(item, tags) {
    await this.app.fileManager.processFrontMatter(item.file, (fm) => {
      fm.tags = tags;
    });
  }
  async updateReviewState(item, field, value) {
    if (!(/* @__PURE__ */ new Set(["watched", "starred"])).has(field)) return;
    await this.app.fileManager.processFrontMatter(item.file, (fm) => {
      if (value) fm[field] = true;
      else delete fm[field];
    });
    item[field] = Boolean(value);
  }
  async deleteItem(item) {
    await this.app.fileManager.trashFile(item.file);
  }
};
var LibraryView = class extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.filter = { search: "", platform: "", tag: "", review: "" };
    this.selected = null;
  }
  getViewType() {
    return VIEW_TYPE;
  }
  getDisplayText() {
    return "Media Log";
  }
  getIcon() {
    return "library";
  }
  async onOpen() {
    this.root = this.contentEl.createDiv({ cls: "mlog" });
    await this.render();
  }
  async render() {
    const items = await this.plugin.listItems();
    this.items = items;
    const root = this.root;
    root.empty();
    const header = root.createDiv({ cls: "mlog__header" });
    header.createEl("h2", { cls: "mlog__title", text: "Media Log" });
    header.createSpan({ cls: "mlog__count", text: `${items.length} items` });
    const addBtn = header.createEl("button", { cls: "mod-cta", text: "Add item" });
    addBtn.addEventListener("click", () => new AddItemModal(this.app, this.plugin, () => this.render()).open());
    const filters = root.createDiv({ cls: "mlog__filters" });
    const search = filters.createEl("input", { type: "search", placeholder: "Search title, creator, URL\u2026" });
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
    const reviewSel = filters.createEl("select");
    for (const reviewFilter of REVIEW_FILTERS) {
      const count = reviewFilter.value ? items.filter((item) => this.matchesReview(item, reviewFilter.value)).length : items.length;
      const opt = reviewSel.createEl("option", {
        value: reviewFilter.value,
        text: `${reviewFilter.label} (${count})`
      });
      if (reviewFilter.value === this.filter.review) opt.selected = true;
    }
    reviewSel.addEventListener("change", () => {
      this.filter.review = reviewSel.value;
      this.renderGrid();
    });
    const clear = filters.createEl("button", { text: "Clear filters" });
    clear.addEventListener("click", () => {
      this.filter = { search: "", platform: "", tag: "", review: "" };
      this.render();
    });
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
      if (this.filter.review && !this.matchesReview(it, this.filter.review)) return false;
      if (this.filter.search) {
        const hay = `${it.title} ${it.creator} ${it.sourceUrl}`.toLowerCase();
        if (!hay.includes(this.filter.search)) return false;
      }
      return true;
    });
  }
  matchesReview(item, filter) {
    if (filter === "unwatched") return !item.watched;
    if (filter === "watched") return item.watched;
    if (filter === "starred") return item.starred;
    return true;
  }
  async selectItem(item) {
    this.selected = item;
    if (!item.watched) await this.plugin.updateReviewState(item, "watched", true);
    this.renderGrid();
    this.renderDetail();
    if (window.matchMedia("(max-width: 700px)").matches) {
      this.detailEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
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
      const card = grid.createDiv({
        cls: ["mlog-card", this.selected?.id === item.id ? "mlog-card--selected" : ""],
        attr: { role: "button", tabindex: "0" }
      });
      const thumb = card.createDiv({ cls: "mlog-card__thumb" });
      const shot = item.screenshot && this.app.vault.getAbstractFileByPath(item.screenshot);
      if (shot) {
        thumb.createEl("img", { attr: { src: this.app.vault.getResourcePath(shot), loading: "lazy" } });
      } else {
        thumb.createDiv({ cls: "mlog-card__placeholder", text: item.platform });
      }
      if (item.starred) thumb.createSpan({ cls: "mlog-card__star", text: "\u2605", attr: { "aria-label": "Starred" } });
      if (!item.watched) thumb.createSpan({ cls: "mlog-card__unwatched", text: "New" });
      const body = card.createDiv({ cls: "mlog-card__body" });
      body.createDiv({ cls: "mlog-card__title", text: item.title });
      const metaRow = body.createDiv({ cls: "mlog-card__meta" });
      metaRow.createSpan({ cls: "mlog-chip", text: item.platform });
      if (item.creator) metaRow.createSpan({ text: item.creator });
      metaRow.createSpan({ cls: "mlog-card__date", text: String(item.capturedAt).slice(0, 10) });
      const activate = () => this.selectItem(item);
      card.addEventListener("click", () => {
        if (hasTextSelectionWithin(card)) return;
        activate();
      });
      card.addEventListener("keydown", (event) => {
        if (event.target !== card || event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        activate();
      });
    }
    if (list.length > 200) {
      grid.createDiv({ cls: "mlog__empty-sub", text: `Showing 200 of ${list.length} \u2014 narrow the filters.` });
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
    this.renderMedia(d, item);
    d.createEl("h3", { text: item.title });
    const meta = d.createDiv({ cls: "mlog-detail__meta" });
    meta.createSpan({ cls: "mlog-chip", text: item.platform });
    if (item.creator) meta.createSpan({ text: item.creator });
    if (item.capturedAt) meta.createSpan({ text: item.capturedAt });
    const links = d.createDiv({ cls: "mlog-detail__links" });
    this.renderCopyableLink(links, "Source", item.sourceUrl);
    if (item.canonicalUrl) this.renderCopyableLink(links, "Canonical", item.canonicalUrl);
    const tagWrap = d.createDiv({ cls: "mlog-detail__tags" });
    const renderTags = () => {
      tagWrap.empty();
      for (const tag of item.tags) {
        const chip = tagWrap.createSpan({ cls: "mlog-chip mlog-chip--tag", text: "#" + tag });
        const x = chip.createSpan({ cls: "mlog-chip__x", text: "\xD7" });
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
    const actions = d.createDiv({ cls: "mlog-detail__actions" });
    const star = actions.createEl("button", {
      cls: item.starred ? "mlog-action--active" : "",
      text: "\u2605 Star",
      attr: { "aria-pressed": String(item.starred) }
    });
    star.addEventListener("click", async () => {
      await this.plugin.updateReviewState(item, "starred", !item.starred);
      this.renderGrid();
      this.renderDetail();
    });
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
    const visible = this.filtered();
    const index = visible.findIndex((candidate) => candidate.id === item.id);
    const completedUnwatchedItem = this.filter.review === "unwatched" && item.watched && index < 0;
    const nav = d.createDiv({ cls: "mlog-detail__nav" });
    const previous = nav.createEl("button", { text: "Previous" });
    previous.disabled = completedUnwatchedItem || index <= 0;
    previous.addEventListener("click", () => this.selectItem(visible[index - 1]));
    nav.createSpan({
      text: completedUnwatchedItem ? `${visible.length} unwatched left` : index >= 0 ? `${index + 1} of ${visible.length}` : ""
    });
    const next = nav.createEl("button", { text: "Next" });
    next.disabled = completedUnwatchedItem ? visible.length === 0 : index < 0 || index >= visible.length - 1;
    next.addEventListener("click", () => this.selectItem(completedUnwatchedItem ? visible[0] : visible[index + 1]));
  }
  renderCopyableLink(container, label, value) {
    if (!value) return;
    const row = container.createDiv({ cls: "mlog-detail__link" });
    row.createSpan({ cls: "mlog-detail__link-label", text: label });
    row.createEl("strong", { text: value });
    const copy = row.createSpan({
      cls: "mlog-detail__copy",
      attr: { role: "button", tabindex: "0", "aria-label": `Copy ${label.toLowerCase()} link` }
    });
    setIcon(copy, "copy");
    const doCopy = async () => {
      try {
        await navigator.clipboard.writeText(value);
        new Notice(`${label} link copied`);
      } catch (error) {
        new Notice(`Copy failed: ${error.message || error}`);
      }
    };
    copy.addEventListener("click", doCopy);
    copy.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      doCopy();
    });
  }
  renderMedia(container, item) {
    const shot = item.screenshot && this.app.vault.getAbstractFileByPath(item.screenshot);
    const poster = shot ? this.app.vault.getResourcePath(shot) : "";
    const video = item.video && this.app.vault.getAbstractFileByPath(item.video);
    if (video) {
      const player = container.createEl("video", {
        cls: "mlog-detail__media",
        attr: { controls: "", preload: "metadata", src: this.app.vault.getResourcePath(video) }
      });
      if (poster) player.setAttribute("poster", poster);
      return;
    }
    if (/^https:\/\//i.test(item.embedUrl)) {
      container.createEl("iframe", {
        cls: "mlog-detail__media",
        attr: {
          src: item.embedUrl,
          title: `Embedded media: ${item.title}`,
          loading: "lazy",
          allow: "autoplay; encrypted-media; picture-in-picture",
          allowfullscreen: "",
          referrerpolicy: "strict-origin-when-cross-origin",
          sandbox: "allow-scripts allow-same-origin allow-presentation"
        }
      });
      return;
    }
    if (shot) {
      const img = container.createEl("img", { cls: "mlog-detail__media", attr: { src: poster } });
      img.addEventListener("click", () => this.app.workspace.openLinkText(item.screenshot, "", false));
    }
  }
};
var AddItemModal = class extends Modal {
  constructor(app, plugin, onDone, prefill) {
    super(app);
    this.plugin = plugin;
    this.onDone = onDone;
    this.prefill = prefill || null;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Add media item" });
    const urlInput = contentEl.createEl("input", { cls: "mlog-modal__input", type: "text", placeholder: "Paste a URL\u2026" });
    const titleInput = contentEl.createEl("input", { cls: "mlog-modal__input", type: "text", placeholder: "Title (fetched automatically if empty)" });
    const tagsInput = contentEl.createEl("input", { cls: "mlog-modal__input", type: "text", placeholder: "Tags, comma separated (optional)" });
    const status = contentEl.createDiv({ cls: "mlog-modal__status" });
    const row = contentEl.createDiv({ cls: "mlog-modal__row" });
    const save = row.createEl("button", { cls: "mod-cta", text: "Save" });
    const cancel = row.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
    if (this.prefill) {
      urlInput.value = this.prefill.url || "";
      titleInput.value = this.prefill.title || "";
      tagsInput.value = this.prefill.tags || "";
    }
    urlInput.focus();
    const doSave = async () => {
      const url = urlInput.value.trim();
      if (!url || !/^https?:\/\//i.test(url)) {
        status.setText("Enter a valid http(s) URL.");
        return;
      }
      save.disabled = true;
      status.setText("Fetching page metadata\u2026");
      let meta = { title: "", image: "", siteName: "", description: "" };
      try {
        const resp = await requestUrl({ url, method: "GET", throw: false });
        if (resp.status < 400 && typeof resp.text === "string") meta = extractMeta(resp.text);
      } catch {
      }
      status.setText("Creating item\u2026");
      try {
        const file = await this.plugin.createItem({
          url,
          title: titleInput.value.trim() || meta.title || url,
          creator: meta.siteName || "",
          description: meta.description || "",
          imageUrl: meta.image || "",
          tags: tagsInput.value.split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean)
        });
        new Notice(`Media Log: saved ${file.basename}`);
        this.close();
        if (this.onDone) this.onDone();
      } catch (e) {
        save.disabled = false;
        status.setText(`Failed: ${e.message || e}`);
      }
    };
    save.addEventListener("click", doSave);
    if (this.prefill && this.prefill.url && this.prefill.autosave) doSave();
  }
  onClose() {
    this.contentEl.empty();
  }
};
var MediaLogSettingTab = class extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h3", { text: "Media Log" });
    new Setting(containerEl).setName("Items folder").setDesc("Vault folder where media item notes are stored.").addText(
      (t) => t.setValue(this.plugin.settings.itemsFolder).onChange(async (v) => {
        this.plugin.settings.itemsFolder = v.trim() || DEFAULT_SETTINGS.itemsFolder;
        await this.plugin.saveSettings();
      })
    );
    new Setting(containerEl).setName("Assets folder").setDesc("Vault folder for downloaded preview images.").addText(
      (t) => t.setValue(this.plugin.settings.assetsFolder).onChange(async (v) => {
        this.plugin.settings.assetsFolder = v.trim() || DEFAULT_SETTINGS.assetsFolder;
        await this.plugin.saveSettings();
      })
    );
    new Setting(containerEl).setName("Download preview images").setDesc("Save each page's preview image into the assets folder when adding items.").addToggle(
      (t) => t.setValue(this.plugin.settings.downloadImages).onChange(async (v) => {
        this.plugin.settings.downloadImages = v;
        await this.plugin.saveSettings();
      })
    );
  }
};
var sifi = require_sifi().build({ LibraryView, MediaLogSettingTab, DEFAULT_SETTINGS, hasTextSelectionWithin });
module.exports.sifi = sifi;
