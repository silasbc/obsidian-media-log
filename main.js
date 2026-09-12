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
    function monthKeyOf(dkey) {
      const m = String(dkey || "").match(/^(\d{4}-\d{2})/);
      return m ? m[1] : "";
    }
    function monthTitleOf(key) {
      const m = String(key || "").match(/^(\d{4})-(\d{2})$/);
      const mi = m ? parseInt(m[2], 10) : 0;
      if (mi < 1 || mi > 12) return "Undated";
      return MONTHS[mi - 1].charAt(0) + MONTHS[mi - 1].slice(1).toLowerCase() + " " + m[1];
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
    function monthOptions(items) {
      const m = {};
      for (const it of items || []) {
        const k = monthKeyOf(it && it.dkey) || "undated";
        m[k] = (m[k] || 0) + 1;
      }
      return Object.keys(m).sort((a, b) => a === "undated" ? 1 : b === "undated" ? -1 : a < b ? 1 : a > b ? -1 : 0).map((k) => ({ key: k, label: k === "undated" ? "Undated" : monthTitleOf(k), n: m[k] }));
    }
    function filterByMonth(list, key) {
      const k = safeStr(key);
      if (!k) return list || [];
      return (list || []).filter((it) => (monthKeyOf(it && it.dkey) || "undated") === k);
    }
    function matchesQuery(it, q) {
      const s = safeStr(q).toLowerCase();
      if (!s) return true;
      if (!it) return false;
      const hay = [it.title, it.creator, it.platform, (it.tags || []).join(" "), it.caption, itemUrl(it)].map((v) => safeStr(v)).join(" ").toLowerCase();
      return s.split(/\s+/).every((t) => !t || hay.indexOf(t) >= 0);
    }
    var SORTS = [
      { key: "newest", label: "Newest" },
      { key: "oldest", label: "Oldest" },
      { key: "title", label: "Title A\u2013Z" },
      { key: "creator", label: "Creator A\u2013Z" },
      { key: "unwatched", label: "Unwatched first" }
    ];
    function stampOf(it) {
      return safeStr(it && it.sortKey) || safeStr(it && it.dkey).replace(/-/g, "");
    }
    function sortItems(list, key) {
      const out = (list || []).slice();
      const newest = (a, b) => stampOf(a) < stampOf(b) ? 1 : stampOf(a) > stampOf(b) ? -1 : 0;
      const text = (f) => (a, b) => safeStr(f(a)).localeCompare(safeStr(f(b)), void 0, { sensitivity: "base" }) || newest(a, b);
      switch (key) {
        case "oldest":
          return out.sort((a, b) => -newest(a, b));
        case "title":
          return out.sort(text((it) => it.title));
        case "creator":
          return out.sort(text((it) => it.creator));
        case "unwatched":
          return out.sort((a, b) => (a.watched ? 1 : 0) - (b.watched ? 1 : 0) || newest(a, b));
        default:
          return out.sort(newest);
      }
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
      return { items: (list || []).slice(idx * size, idx * size + size), pageIdx: idx, totalPages, total: n, pageSize: size };
    }
    function rangeLabel(pg) {
      if (!pg || !pg.total) return "0 / 0";
      const size = pg.pageSize > 0 ? pg.pageSize : pg.items.length || 1;
      const first = pg.pageIdx * size + 1;
      const last = Math.min(pg.total, first + pg.items.length - 1);
      return `${first}\u2013${last} / ${pg.total}`;
    }
    function tagUniverse(items) {
      const m = {};
      for (const it of items || []) {
        for (const t of it && it.tags || []) {
          const label = safeStr(t);
          if (!label) continue;
          const k = label.toLowerCase();
          if (!m[k]) m[k] = { key: k, label, n: 0 };
          m[k].n += 1;
        }
      }
      return Object.values(m).sort((a, b) => b.n - a.n || (a.key < b.key ? -1 : 1));
    }
    function untaggedCount(items) {
      return (items || []).filter((it) => !(it && it.tags || []).length).length;
    }
    function filterByTags(list, keys, untagged) {
      if (untagged) return (list || []).filter((it) => !(it && it.tags || []).length);
      const ks = (keys || []).map((k) => String(k).toLowerCase()).filter(Boolean);
      if (!ks.length) return list || [];
      return (list || []).filter((it) => {
        const low = it && it.tagsLow || (it && it.tags || []).map((t) => String(t).toLowerCase());
        return ks.every((k) => low.includes(k));
      });
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
    function posterPath(item, assetsFolder) {
      const dir = safeStr(assetsFolder).replace(/\/+$/, "") || "Media Log/Assets";
      return `${dir}/${safeStr(item && item.id)}.jpg`;
    }
    function posterCandidates(items, hasVideo, hasShot) {
      return (items || []).filter((it) => {
        if (!it || !it.id) return false;
        const v = safeStr(it.video);
        if (!v || v.toLowerCase() === "none" || !hasVideo(it)) return false;
        const s = safeStr(it.screenshot);
        return !(s && hasShot(it));
      });
    }
    function isGone(it) {
      return safeStr(it && it.video).toLowerCase() === "none";
    }
    function isPlayable(it, hasFile, canStream) {
      const v = safeStr(it && it.video);
      if (v && v.toLowerCase() !== "none" && hasFile && hasFile(it)) return true;
      return !!(canStream && isStreamable(it));
    }
    var IG_CODE_RE = /instagram\.com\/(?:[^/?#]+\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i;
    function igCodeOf(url) {
      const m = IG_CODE_RE.exec(safeStr(url));
      return m ? m[1] : "";
    }
    function embedPageFor(it) {
      if (!it) return "";
      const e = safeStr(it.embedUrl);
      if (/^https:\/\/www\.instagram\.com\/[^?#]*\/embed/i.test(e)) return e;
      const code = igCodeOf(it.sourceUrl || it.url);
      return code ? `https://www.instagram.com/reel/${code}/embed/captioned/` : "";
    }
    function isStreamable(it) {
      if (!it || safeStr(it.kind) === "post") return false;
      return !!embedPageFor(it);
    }
    function extractVideoUrl(html) {
      const h = safeStr(html);
      let m = /\\"video_url\\":\\"((?:[^"\\]|\\.)*?)\\"/.exec(h);
      let raw = m ? m[1] : "";
      if (!raw) {
        m = /"video_url"\s*:\s*"((?:[^"\\]|\\.)+)"/.exec(h);
        raw = m ? m[1] : "";
      }
      if (!raw) {
        m = /https?:(?:\\*\/){2}[a-z0-9.-]*cdninstagram\.com[^"'\s]*?\.mp4[^"'\s]*/i.exec(h);
        raw = m ? m[0] : "";
      }
      if (!raw) return "";
      let url = raw;
      for (let i = 0; i < 3 && url.indexOf("\\") >= 0; i++) {
        try {
          url = JSON.parse('"' + url + '"');
        } catch {
          break;
        }
      }
      url = url.replace(/\\+\//g, "/").replace(/\\u0026/g, "&").replace(/&amp;/g, "&");
      return /^https:\/\/[^\s"'<>]+$/i.test(url) ? url : "";
    }
    function cdnExpiry(url) {
      const m = /[?&]oe=([0-9A-Fa-f]{6,10})(?:&|$)/.exec(safeStr(url));
      if (!m) return 0;
      const t = parseInt(m[1], 16) * 1e3;
      return Number.isFinite(t) && t > 0 ? t : 0;
    }
    function streamFresh(entry, nowMs, marginMs, defaultMs) {
      if (!entry || !entry.url) return false;
      const margin = marginMs == null ? 10 * 60 * 1e3 : marginMs;
      const exp = entry.expires || (entry.fetched || 0) + (defaultMs == null ? 6 * 60 * 60 * 1e3 : defaultMs);
      return exp - margin > nowMs;
    }
    var IG_CAPTURE_RE = /instagram\.com\/(?:[^/?#]+\/)?(reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i;
    function igCaptureMatch(url) {
      const m = IG_CAPTURE_RE.exec(safeStr(url));
      if (!m) return null;
      const raw = m[1].toLowerCase();
      const seg = raw === "reels" ? "reel" : raw;
      const kind = seg === "p" ? "post" : seg === "tv" ? "video" : "reel";
      return { seg, code: m[2], kind };
    }
    function youtubeIdOf(url) {
      let u;
      try {
        u = new URL(safeStr(url));
      } catch {
        return "";
      }
      const host = u.hostname.replace(/^www\./i, "");
      if (host === "youtu.be") return u.pathname.slice(1).split("/")[0] || "";
      if (host === "youtube.com" || host.endsWith(".youtube.com")) {
        const v = u.searchParams.get("v");
        if (v) return v;
        const m = /^\/embed\/([^/?]+)/.exec(u.pathname);
        if (m) return m[1];
      }
      return "";
    }
    function captureKindOf(url) {
      const ig = igCaptureMatch(url);
      return ig ? ig.kind : "";
    }
    function captureEmbedUrl(url) {
      const ig = igCaptureMatch(url);
      if (ig) return `https://www.instagram.com/${ig.seg}/${ig.code}/embed/captioned/`;
      const yid = youtubeIdOf(url);
      return yid ? `https://www.youtube.com/embed/${yid}` : "";
    }
    function isInstagramLoginWall(title) {
      const t = safeStr(title);
      if (!t) return true;
      if (/^instagram$/i.test(t)) return true;
      if (/\blog ?in\b/i.test(t) && /instagram/i.test(t)) return true;
      if (/^just a moment/i.test(t)) return true;
      return false;
    }
    function captureFallbackTitle(url, title) {
      const ig = igCaptureMatch(url);
      if (!ig) return safeStr(title);
      const t = safeStr(title);
      if (t && t !== safeStr(url) && !isInstagramLoginWall(t)) return t;
      const label = { reel: "Reel", post: "Post", video: "Video" }[ig.kind];
      return `Instagram ${label} ${ig.code}`;
    }
    function captureEnrich(url, title) {
      return {
        kind: captureKindOf(url),
        embedUrl: captureEmbedUrl(url),
        title: captureFallbackTitle(url, title) || safeStr(title)
      };
    }
    function hashtagsOf(text) {
      const out = [];
      const seen = /* @__PURE__ */ new Set();
      for (const m of String(text || "").matchAll(/(?:^|[^\p{L}\p{N}_#])#([\p{L}\p{N}_]{2,40})/gu)) {
        const t = m[1].toLowerCase();
        if (seen.has(t)) continue;
        seen.add(t);
        out.push(t);
        if (out.length >= 8) break;
      }
      return out;
    }
    function tagsFromCaption(it) {
      if (!it || (it.tags || []).length > 0) return [];
      return hashtagsOf(it.caption);
    }
    function matchesReview(item, filter, canStream) {
      if (filter === "unwatched") return !item.watched && (!isGone(item) || !!canStream && isStreamable(item));
      if (filter === "watched") return !!item.watched;
      if (filter === "starred") return !!item.starred;
      return true;
    }
    function baseFilter(items, f, opts) {
      const canStream = !!(opts && opts.canStream);
      return (items || []).filter((it) => {
        if (f.platform && it.platform !== f.platform) return false;
        if (f.tag && !(it.tags || []).includes(f.tag)) return false;
        if (f.review && !matchesReview(it, f.review, canStream)) return false;
        return true;
      });
    }
    function visibleList(items, filter, opts) {
      const f = filter || {};
      const o = opts || {};
      let L = baseFilter(items, f, o);
      if (f.playable && (o.hasFile || o.canStream)) L = L.filter((it) => isPlayable(it, o.hasFile, o.canStream));
      L = filterByTags(L, f.tags, f.untagged);
      if (f.month) L = filterByMonth(L, f.month);
      if (f.onDay) L = onThisDayItems(L, o.todayMMDD || "");
      const q = safeStr(f.search);
      if (q) L = L.filter((it) => matchesQuery(it, q));
      if (f.sort && f.sort !== "newest") L = sortItems(L, f.sort);
      if (f.seed !== null && f.seed !== void 0) L = shuffleBySeed(L, f.seed).slice(0, o.pageSize > 0 ? o.pageSize : 64);
      return L;
    }
    function platformCounts(items, filter, opts) {
      const f = { ...filter || {}, platform: "", seed: null };
      const counts = {};
      for (const it of visibleList(items, f, opts)) counts[it.platform] = (counts[it.platform] || 0) + 1;
      return counts;
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
    function swipeIntent(dx, dy, dtMs, opts) {
      const o = opts || {};
      const minPx = o.minPx > 0 ? o.minPx : 60;
      const minVel = o.minVelocity > 0 ? o.minVelocity : 0.45;
      const ax = Math.abs(Number(dx) || 0);
      const ay = Math.abs(Number(dy) || 0);
      if (ay < 12 || ay < ax * 1.2) return "";
      const fast = dtMs > 0 && ay >= 24 && ay / dtMs >= minVel;
      if (ay < minPx && !fast) return "";
      return dy < 0 ? "next" : "prev";
    }
    function normalizeTag(raw) {
      return safeStr(raw).replace(/^#+/, "").replace(/\s+/g, " ").trim();
    }
    function hasTag(tags, raw) {
      const t = normalizeTag(raw).toLowerCase();
      return !!t && (tags || []).some((x) => safeStr(x).toLowerCase() === t);
    }
    function toggleTag(tags, raw) {
      const list = (tags || []).map((x) => safeStr(x)).filter(Boolean);
      const t = normalizeTag(raw);
      if (!t) return list;
      const low = t.toLowerCase();
      const i = list.findIndex((x) => x.toLowerCase() === low);
      return i >= 0 ? list.filter((_, j) => j !== i) : list.concat([t]);
    }
    function orderTags(uni, recent) {
      const list = (uni || []).slice();
      const rank = /* @__PURE__ */ new Map();
      (recent || []).forEach((t, i) => {
        const k = safeStr(t).toLowerCase();
        if (k && !rank.has(k)) rank.set(k, i);
      });
      return list.sort((a, b) => {
        const ra = rank.has(a.key) ? rank.get(a.key) : Infinity;
        const rb = rank.has(b.key) ? rank.get(b.key) : Infinity;
        if (ra !== rb) return ra - rb;
        return b.n - a.n || (a.key < b.key ? -1 : 1);
      });
    }
    function pushRecent(recent, tag, max) {
      const t = normalizeTag(tag);
      const cap = max > 0 ? max : 8;
      if (!t) return (recent || []).slice(0, cap);
      const low = t.toLowerCase();
      return [t].concat((recent || []).filter((x) => safeStr(x).toLowerCase() !== low)).slice(0, cap);
    }
    module2.exports = {
      MONTHS,
      SORTS,
      safeStr,
      hostOf,
      itemUrl,
      dateKeyOf,
      mmddOf,
      todayMMDD,
      monthLabelOf,
      monthKeyOf,
      monthTitleOf,
      shortDateOf,
      onThisDayItems,
      groupByMonth,
      monthOptions,
      filterByMonth,
      matchesQuery,
      sortItems,
      shuffleBySeed,
      paginate,
      rangeLabel,
      tagUniverse,
      untaggedCount,
      filterByTags,
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
      posterPath,
      posterCandidates,
      isGone,
      isPlayable,
      igCodeOf,
      embedPageFor,
      isStreamable,
      extractVideoUrl,
      cdnExpiry,
      streamFresh,
      hashtagsOf,
      tagsFromCaption,
      matchesReview,
      baseFilter,
      visibleList,
      platformCounts,
      enrichItem,
      igCaptureMatch,
      youtubeIdOf,
      captureKindOf,
      captureEmbedUrl,
      isInstagramLoginWall,
      captureFallbackTitle,
      captureEnrich,
      swipeIntent,
      normalizeTag,
      hasTag,
      toggleTag,
      orderTags,
      pushRecent
    };
  }
});

// src/sifi.js
var require_sifi = __commonJS({
  "src/sifi.js"(exports2, module2) {
    "use strict";
    var { Modal: Modal2, Notice: Notice2, Setting: Setting2, setIcon: setIcon2, requestUrl: requestUrl2 } = require("obsidian");
    var browse2 = require_browse();
    var SIFI_DEFAULTS = {
      pageSize: 64,
      portraitCards: true,
      tvDwellSecs: 10,
      // owner ask 2026-09-05: about ten seconds for a plain meme
      quarantineLog: "Media Log/Deleted Media.md",
      guideNote: "Select/Guide/Media",
      posterFrames: true,
      bottomBar: true,
      autoAdvance: true,
      // owner ask 2026-09-05: a visible, remembered toggle
      playerPlayableOnly: true,
      // the pop-up and TV play only what plays on this device
      streamRemote: true,
      // owner 2026-09-05 ("if streaming fixes it then do that"): no local copy → stream from Instagram
      tagAfterCapture: true,
      // owner 2026-09-11: a share-sheet save opens the new item with the tag sheet up
      recentTags: []
      // the tags used last, newest first — they lead the sheet
    };
    var RECENT_TAGS_MAX = 8;
    var THUMB_LIVE_MAX = 24;
    var WATCH_DWELL_MS = 3e3;
    var TICK_MS = 500;
    var CONTROLS_FADE_MS = 2500;
    var REFRESH_DEBOUNCE_MS = 900;
    var TAG_CHIP_LIMIT = 24;
    var POSTER_MAX_WIDTH = 540;
    var POSTER_TIMEOUT_MS = 12e3;
    var STREAM_MARGIN_MS = 10 * 60 * 1e3;
    var STREAM_FAIL_TTL_MS = 15 * 60 * 1e3;
    var STREAM_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
    var isVid = (media) => !!media && (media.kind === "video" || media.kind === "stream");
    var BOTTOM_BAR_TABS = [
      { label: "Home", link: "Home", icon: "<path d='M3 10.5 12 3l9 7.5'/><path d='M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5'/>" },
      { label: "Train", link: "Dashboard", icon: "<path d='M8 12h8'/><rect x='4' y='7.5' width='3' height='9' rx='1'/><rect x='17' y='7.5' width='3' height='9' rx='1'/><path d='M2 10.5v3'/><path d='M22 10.5v3'/>" },
      { label: "Health", link: "Health Dashboard", icon: "<path d='M12 20.5 4.6 13a5 5 0 0 1 7-7.1l.4.4.4-.4a5 5 0 0 1 7 7.1z'/>" },
      { label: "Media", link: "Media Library", icon: "<rect x='3' y='5' width='18' height='14' rx='2'/><path d='m10 9.2 4.6 2.8-4.6 2.8z'/>" },
      { label: "Mauston", link: "Mauston/Mauston", icon: "<path d='M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z'/><path d='M9 4v14'/><path d='M15 6v14'/>" }
    ];
    var svgIcon = (p) => "<svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>" + p + "</svg>";
    function build({ LibraryView: LibraryView2, MediaLogSettingTab: MediaLogSettingTab2, DEFAULT_SETTINGS: DEFAULT_SETTINGS2, hasTextSelectionWithin: hasTextSelectionWithin2 }) {
      Object.assign(DEFAULT_SETTINGS2, SIFI_DEFAULTS);
      const textSelected = typeof hasTextSelectionWithin2 === "function" ? hasTextSelectionWithin2 : () => false;
      const isPhone = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 700px)").matches;
      const isMobileApp = (app) => !!(app && app.isMobile);
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
      function whyNoVideo(app, item, streams) {
        const v = String(item.video || "");
        if (v && v !== "none" && app.vault.getAbstractFileByPath(v)) return "";
        if (streams && streams.can(item)) {
          if (!streams.failed(item)) return "Streaming from Instagram \u2014 no local copy on this device.";
          return v === "none" ? "Instagram would not hand over this video just now, and there is no copy anywhere \u2014 open it on Instagram." : "Instagram would not hand over this video just now \u2014 playing its embed instead, which will not autoplay.";
        }
        if (v === "none") return "Instagram refused this download five times \u2014 no copy to play; open it on Instagram.";
        if (v) return "The video file has not synced to this device yet \u2014 playing Instagram's embed, which will not autoplay.";
        if (item.kind === "post") return "An Instagram post (image); no video was captured for it.";
        if (/^https:/.test(item.embedUrl || "")) return "No local video \u2014 playing Instagram's embed, which will not autoplay.";
        return "";
      }
      class StreamResolver {
        constructor(plugin) {
          this.plugin = plugin;
          this.cache = /* @__PURE__ */ new Map();
          this.inflight = /* @__PURE__ */ new Map();
          this.fails = /* @__PURE__ */ new Map();
        }
        enabled() {
          return this.plugin.settings.streamRemote !== false;
        }
        can(item) {
          return this.enabled() && browse2.isStreamable(item);
        }
        failed(item) {
          const at = item && this.fails.get(item.id);
          return !!at && Date.now() - at < STREAM_FAIL_TTL_MS;
        }
        // A fresh cached link, or "".
        peek(item) {
          const e = item && this.cache.get(item.id);
          return e && browse2.streamFresh(e, Date.now(), STREAM_MARGIN_MS) ? e.url : "";
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
          const page = browse2.embedPageFor(item);
          try {
            const r = await requestUrl2({ url: page, method: "GET", headers: { "User-Agent": STREAM_UA, Accept: "text/html" }, throw: false });
            const url = r && r.status === 200 ? browse2.extractVideoUrl(r.text) : "";
            if (!url) {
              this.fails.set(item.id, Date.now());
              return "";
            }
            this.cache.set(item.id, { url, expires: browse2.cdnExpiry(url), fetched: Date.now() });
            this.fails.delete(item.id);
            return url;
          } catch (e) {
            this.fails.set(item.id, Date.now());
            return "";
          }
        }
      }
      function tryPlay(player, onMuted, prime) {
        if (typeof player.play !== "function") return;
        const p = player.play();
        if (!p || typeof p.catch !== "function") return;
        p.catch(() => {
          if (prime || !player.isConnected || !player.getAttribute("src")) return;
          player.muted = true;
          const q = player.play();
          if (q && typeof q.catch === "function") q.catch(() => {
          });
          if (onMuted) onMuted(player);
        });
      }
      function buildMedia(app, container, item, opts) {
        const o = opts || {};
        const cls = "mlog-detail__media " + (browse2.isPortrait(item) ? "mlog-detail__media--portrait" : "mlog-detail__media--wide");
        const shot = item.screenshot && app.vault.getAbstractFileByPath(item.screenshot);
        const poster = shot ? app.vault.getResourcePath(shot) : item.previewRemote || "";
        const video = item.video && item.video !== "none" && app.vault.getAbstractFileByPath(item.video);
        const streams = o.streams;
        if (!video && streams && streams.can(item)) {
          const attr = { preload: "auto", playsinline: "" };
          if (o.controls !== false) attr.controls = "";
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
        if (browse2.isGone(item)) {
          const gone = container.createDiv({ cls: cls + " mlog-detail__media--gone" });
          gone.createDiv({ cls: "mlog-detail__gone-title", text: "No local copy" });
          gone.createDiv({ cls: "mlog-detail__gone-sub", text: "Instagram refused the download five times \u2014 private, removed, or walled." });
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
          return browse2.posterCandidates(
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
            if (this.done) new Notice2(`Media Log: ${this.done} poster frame${this.done === 1 ? "" : "s"} written${this.failed ? `, ${this.failed} skipped` : ""}`);
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
          const dest = browse2.posterPath(item, this.plugin.settings.assetsFolder);
          if (!vault.getAbstractFileByPath(dest)) {
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
              } catch {
              }
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
      function unmuteBadge(parent, player) {
        const b = parent.createEl("button", { cls: "mlog-tv__btn mlog-tv__unmute", text: "Tap for sound" });
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          player.muted = false;
          const p = player.play();
          if (p && typeof p.catch === "function") p.catch(() => {
          });
          b.remove();
        });
        return b;
      }
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
          attr: { autocapitalize: "none", autocorrect: "off", enterkeyhint: "done", "aria-label": "New tag" }
        });
        const add = form.createEl("button", { cls: "mlog-tv__btn mlog-tv__sheet-add", text: "Add" });
        const hint = sheet.createDiv({ cls: "mlog-tv__sheet-hint" });
        const chips = sheet.createDiv({ cls: "mlog-tv__sheet-chips" });
        const status = sheet.createDiv({ cls: "mlog-tv__sheet-status" });
        input.addEventListener("focus", () => {
          setTimeout(() => {
            if (window.scrollY) window.scrollTo(0, 0);
          }, 60);
        });
        const paint = () => {
          chips.empty();
          const items = (o.view && o.view.items || o.items || []).map((x) => x && x.id === item.id ? item : x);
          const uni = browse2.orderTags(browse2.tagUniverse(items), plugin.settings.recentTags);
          hint.setText(uni.length ? "Tap a tag to add or remove it. Counts are across the library; the ones you used last come first." : "No tags yet \u2014 type one above. Your own categories, not hashtags.");
          for (const u of uni) {
            const on = browse2.hasTag(item.tags, u.label);
            const c = chips.createEl("button", {
              cls: "mlog-tag mlog-tv__sheet-chip" + (on ? " mlog-tag--on" : ""),
              text: `${u.label} \xB7 ${u.n}`,
              attr: { "aria-pressed": String(on) }
            });
            c.addEventListener("click", (e) => {
              e.stopPropagation();
              apply(u.label);
            });
          }
        };
        const remember = (raw) => {
          plugin.settings.recentTags = browse2.pushRecent(plugin.settings.recentTags, raw, RECENT_TAGS_MAX);
          plugin.saveSettings();
        };
        const apply = async (raw) => {
          const adding = !browse2.hasTag(item.tags, raw);
          const next = browse2.toggleTag(item.tags, raw);
          item.tags = next;
          item.tagsLow = next.map((t) => t.toLowerCase());
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
            status.setText(`Couldn't save that tag: ${e && e.message || e}`);
          }
        };
        const submit = () => {
          const raw = input.value;
          input.value = "";
          if (browse2.normalizeTag(raw) && !browse2.hasTag(item.tags, raw)) apply(raw);
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
      class TagSheetModal extends Modal2 {
        constructor(app, plugin, view, item) {
          super(app);
          this.plugin = plugin;
          this.view = view;
          this.item = item;
        }
        onOpen() {
          if (this.modalEl) this.modalEl.addClass("mlog-tagsheet");
          if (this.titleEl) this.titleEl.setText("Tags for the new item");
          this.contentEl.empty();
          this.contentEl.createDiv({ cls: "mlog__empty-sub", text: this.item.title });
          const built = buildTagSheet(this.contentEl, {
            app: this.app,
            plugin: this.plugin,
            view: this.view,
            item: this.item,
            mode: "modal",
            onDone: () => this.close()
          });
          setTimeout(() => built.input.focus(), 50);
        }
        onClose() {
          this.contentEl.empty();
          if (this.view && this.view.gridEl) {
            withScrollKept(this.view.gridEl, () => {
              this.view.renderGrid();
              this.view.renderDetail();
            });
          }
        }
      }
      function decorateAddModal(modal, contentEl, tagsInput) {
        const plugin = modal.plugin;
        if (!plugin || !contentEl || !tagsInput) return;
        const row = contentEl.createDiv({ cls: "mlog-add__chips" });
        if (tagsInput.nextSibling) contentEl.insertBefore(row, tagsInput.nextSibling);
        const fieldTags = () => tagsInput.value.split(",").map((t) => browse2.normalizeTag(t)).filter(Boolean);
        let uni = [];
        const paint = () => {
          row.empty();
          const cur = fieldTags();
          for (const u of uni) {
            const on = browse2.hasTag(cur, u.label);
            const c = row.createEl("button", { cls: "mlog-tag" + (on ? " mlog-tag--on" : ""), text: `${u.label} \xB7 ${u.n}`, attr: { type: "button", "aria-pressed": String(on) } });
            c.addEventListener("click", () => {
              tagsInput.value = browse2.toggleTag(fieldTags(), u.label).join(", ");
              paint();
            });
          }
        };
        tagsInput.addEventListener("input", paint);
        Promise.resolve().then(() => plugin.listItems()).then((items) => {
          uni = browse2.orderTags(browse2.tagUniverse(items), plugin.settings.recentTags);
          paint();
        }).catch(() => {
        });
      }
      function waitForCache(app, file, maxMs) {
        return new Promise((resolve) => {
          const t0 = Date.now();
          const tick = () => {
            const c = app.metadataCache.getFileCache(file);
            if (c && c.frontmatter && c.frontmatter.media_id) return resolve(true);
            if (Date.now() - t0 > (maxMs || 4e3)) return resolve(false);
            setTimeout(tick, 100);
          };
          tick();
        });
      }
      async function afterCapture(plugin, file) {
        if (!file || plugin.settings.tagAfterCapture === false) return;
        try {
          await plugin.activateView();
          const leaf = plugin.app.workspace.getLeavesOfType("media-log-library")[0];
          const view = leaf && leaf.view;
          if (!view || typeof view.openForTags !== "function") return;
          await waitForCache(plugin.app, file, 4e3);
          const find = () => (view.items || []).find((i) => i.file && i.file.path === file.path);
          let item = find();
          if (!item) {
            await view.refreshItems();
            item = find();
          }
          if (!item) return;
          await view.openForTags(item);
        } catch (e) {
          console.error("Media Log: after-capture tagging failed", e);
        }
      }
      class TvPlayer {
        constructor(view, list, idx, opts) {
          this.view = view;
          this.plugin = view.plugin;
          this.app = view.app;
          this.list = list;
          this.idx = idx;
          this.mode = opts && opts.mode || "tv";
          this.modal = this.mode === "modal";
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
          this.pre = null;
          this.media = null;
          this.sheet = null;
          this.hold = false;
          this.paintTagLine = null;
          this.swipedAt = 0;
        }
        // Preload the next playable item into the browser cache: its local file, or —
        // with no local copy — ask Instagram for its link now so stepping is instant.
        preloadNext() {
          const len = this.list.length;
          const ni = browse2.nextIndex(this.idx, len, this.loop);
          const next = ni >= 0 ? this.list[ni] : null;
          const file = next && next.video && next.video !== "none" && this.app.vault.getAbstractFileByPath(next.video);
          if (!file) {
            const streams = this.view.streams();
            if (next && streams.can(next)) {
              streams.resolve(next).then((url) => {
                if (url && this.overlay && this.list[browse2.nextIndex(this.idx, this.list.length, this.loop)] === next) this.warm(url);
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
            } catch {
            }
          }
        }
        open() {
          this.overlay = document.body.createDiv({ cls: this.modal ? "mlog-tv mlog-tv--modal" : "mlog-tv" });
          this.overlay.addEventListener("click", (e) => {
            if (Date.now() - this.swipedAt < 350) return;
            if (this.modal && e.target === this.overlay) {
              this.close();
              return;
            }
            if (this.modal && !this.hold && this.media && isVid(this.media) && e.target === this.media.el && this.media.el.getAttribute("controls") === null) {
              this.togglePause();
            }
            this.showControls();
          });
          this.panel = this.overlay.createDiv({ cls: "mlog-tv__panel" });
          this.ctl = this.overlay.createDiv({ cls: "mlog-tv__ctl" });
          if (this.modal) {
            const x = this.overlay.createEl("button", { cls: "mlog-tv__close", attr: { "aria-label": "Close" } });
            setIcon2(x, "x");
            x.addEventListener("click", (e) => {
              e.stopPropagation();
              this.close();
            });
          }
          this.bindSwipe();
          this.keydown = (e) => {
            if (this.hold) {
              if (e.key === "Escape") this.closeTags();
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
              if (e.cancelable) e.preventDefault();
              const len = this.list.length;
              const edge = dy < 0 ? browse2.nextIndex(this.idx, len, this.loop) < 0 : browse2.prevIndex(this.idx, len, this.loop) < 0;
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
            if (s.vertical === null) s.vertical = Math.abs(dy) > Math.abs(dx);
            if (!s.vertical) {
              reset();
              return;
            }
            const intent = browse2.swipeIntent(dx, dy, Date.now() - s.t);
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
            if (p && typeof p.catch === "function") p.catch(() => {
            });
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
            } catch {
            }
          }
          const f = this.overlay.querySelector("iframe");
          if (f) f.src = "about:blank";
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
          this.panel.classList.toggle("mlog-tv__panel--wide", !browse2.isPortrait(item));
          if (anim) {
            this.panel.classList.add("mlog-tv__panel--in-" + anim);
            this.panel.addEventListener("animationend", () => this.panel && this.panel.classList.remove("mlog-tv__panel--in-" + anim), { once: true });
          }
          const phonePopup = this.modal && isPhone();
          const media = buildMedia(this.app, this.panel, item, {
            autoplay: true,
            loop: this.modal && !this.auto,
            // the pop-up loops a reel until auto-advance is switched on
            controls: !phonePopup,
            // the phone pop-up is a feed: tap pauses, the flick steps
            streams: this.view.streams(),
            onEnded: () => {
              if (this.hold) {
                try {
                  media.el.currentTime = 0;
                  tryPlay(media.el, null, true);
                } catch {
                }
                return;
              }
              if (this.auto) this.step(1);
            },
            onMuted: (player) => {
              if (this.ctl) unmuteBadge(this.ctl, player);
            },
            onFallback: (fb) => {
              if (!this.overlay || this.idx !== idx) return;
              media.kind = fb.kind;
              media.el = fb.el;
              if (this.auto && !isVid(media) && !this.hold) this.adv = browse2.advInit(this.dwell, 0, Date.now());
              this.paintControls(item, media);
            }
          });
          this.media = media;
          if (phonePopup) {
            const paused = this.panel.createDiv({ cls: "mlog-tv__paused", attr: { "aria-hidden": "true" } });
            setIcon2(paused, "play");
          }
          this.paintControls(item, media);
          this.preloadNext();
          this.watchT = setTimeout(async () => {
            if (item.watched || media.kind === "embed") return;
            try {
              await this.plugin.updateReviewState(item, "watched", true);
            } catch {
            }
            if (this.paintWatched) this.paintWatched();
          }, WATCH_DWELL_MS);
          if (this.auto && !isVid(media)) this.adv = browse2.advInit(this.dwell, 0, Date.now());
          this.timer = setInterval(() => {
            if (!this.adv) return;
            const r = browse2.advanceTick(this.adv, Date.now());
            this.adv = r.st;
            if (r.action === "advance") this.step(1);
          }, TICK_MS);
          this.showControls();
        }
        step(dir, anim) {
          if (this.hold) return;
          const len = this.list.length;
          const ni = dir > 0 ? browse2.nextIndex(this.idx, len, this.loop) : browse2.prevIndex(this.idx, len, this.loop);
          if (ni < 0) {
            if (this.modal) {
              this.adv = null;
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
          ctl.createDiv({ cls: "mlog-tv__title", text: `${this.idx + 1} / ${this.list.length} \xB7 ${item.title}` });
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
          const pp = btn(
            row1,
            "Auto-advance",
            null,
            () => {
              this.auto = !this.auto;
              if (this.modal) this.view.setAutoAdvance(this.auto);
              this.adv = this.auto && !isVid(media) ? browse2.advInit(this.dwell, 0, Date.now()) : null;
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
          if (!this.modal) btn(row1, "Close", "x", () => this.close());
          const row2 = ctl.createDiv({ cls: "mlog-tv__row" });
          if (this.modal) {
            if (item.sourceUrl) btn(row2, "Open source", "external-link", () => window.open(item.sourceUrl, "_blank"));
            if (item.file) {
              btn(row2, "Open note", "file-text", () => {
                this.close();
                this.app.workspace.openLinkText(item.file.path, "", false);
              });
              const del = btn(row2, "Delete", "trash-2", () => {
                if (!del._armed) {
                  del._armed = true;
                  del.setText("Delete? Tap again");
                  del.classList.add("mlog-tv__btn--danger");
                  del._disarm = setTimeout(() => {
                    if (!del.isConnected) return;
                    del._armed = false;
                    del.empty();
                    setIcon2(del, "trash-2");
                    del.classList.remove("mlog-tv__btn--danger");
                  }, 4e3);
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
                if (this.adv) this.adv = browse2.advInit(sec, 0, Date.now());
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
            new Notice2(`Media Log: couldn't delete \u2014 ${e && e.message || e}`);
            return;
          }
          new Notice2("Media Log: item moved to trash");
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
          if (this.hold) return;
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
          const built = buildTagSheet(this.overlay, {
            app: this.app,
            plugin: this.plugin,
            view: this.view,
            item,
            mode: isPhone() ? "top" : "bottom",
            onChange: () => {
              if (this.paintTagLine) this.paintTagLine();
            },
            onDone: () => this.closeTags()
          });
          this.sheet = built.el;
        }
        closeTags() {
          if (this.sheet) this.sheet.remove();
          this.sheet = null;
          if (!this.hold) return;
          this.hold = false;
          if (this.overlay && this.auto && !isVid(this.media)) this.adv = browse2.advInit(this.dwell, 0, Date.now());
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
            } catch {
            }
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
          withScrollKept(this.view.gridEl, () => {
            this.view.renderGrid();
            if (!this.modal) this.view.renderDetail();
          });
        }
      }
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
              this.unmount();
              return;
            }
            this.cover();
          }, 1e3);
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
      class SifiLibraryView extends LibraryView2 {
        constructor(leaf, plugin) {
          super(leaf, plugin);
          Object.assign(this.filter, { onDay: false, seed: null, tags: [], untagged: false, month: "", sort: "newest", playable: false });
          this.page = 0;
          this.lastKey = "";
          this.toolsEl = null;
          this.tagsEl = null;
          this.thumbs = new ThumbBudget();
          this.tv = null;
          this.tvMode = "unwatched";
          this.autoAdvance = plugin.settings.autoAdvance !== false;
          this.captionCache = /* @__PURE__ */ new Map();
          this.captionsLoaded = false;
          this.captionsLoading = null;
          this.tagsExpanded = false;
          this.refreshT = null;
          this.bar = new BottomBar(this);
          this.todayMMDD = browse2.todayMMDD(/* @__PURE__ */ new Date());
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
            attr: { "aria-pressed": String(this.autoAdvance), title: "When a video ends, play the next one" }
          });
          b.addEventListener("click", () => {
            this.setAutoAdvance(!this.autoAdvance);
            this.renderDetail();
          });
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
            if (this.plugin.posters && this.plugin.posters.running) return;
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
          if (count) count.textContent = `${items.length} items`;
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
            }
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
          if (f.seed === void 0) f.seed = null;
          if (f.onDay === void 0) f.onDay = false;
          if (!Array.isArray(f.tags)) f.tags = [];
          if (f.untagged === void 0) f.untagged = false;
          if (f.month === void 0) f.month = "";
          if (!f.sort) f.sort = "newest";
          if (f.playable === void 0) f.playable = false;
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
            text = browse2.commentPreview(await this.app.vault.cachedRead(item.file));
          } catch {
          }
          this.captionCache.set(key, text);
          item.caption = text;
          return text;
        }
        // The one visible-list pipeline; upstream's detail nav and the players read it too.
        filtered() {
          return browse2.visibleList(this.items || [], this.normalizeFilter(), this.listOpts());
        }
        // What the players draw from: the visible list, and by default only what can
        // actually play on this device (owner: embeds never interrupt a session).
        playlist() {
          const base = this.filtered();
          if (this.plugin.settings.playerPlayableOnly === false) return base;
          const playable = base.filter((it) => browse2.isPlayable(it, (x) => this.hasFile(x), this.streams().enabled()));
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
            new Notice2("Media Log: nothing to play in the current filters");
            return;
          }
          if (this.tv) this.tv.teardown();
          this.tv = new TvPlayer(this, list, 0, { mode: "tv" });
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
          const dayBase = browse2.visibleList(this.items || [], { ...f, onDay: false, seed: null }, this.listOpts());
          const odN = browse2.onThisDayItems(dayBase, this.todayMMDD).length;
          if (odN || f.onDay) {
            mk(`On this day \xB7 ${odN}`, !!f.onDay, () => {
              f.onDay = !f.onDay;
              this.renderGrid();
            });
          }
          const sortSel = el.createEl("select", { cls: "mlog-tool mlog-tool--select", attr: { "aria-label": "Sort" } });
          for (const s of browse2.SORTS) {
            const o = sortSel.createEl("option", { value: s.key, text: s.label });
            if (s.key === f.sort) o.selected = true;
          }
          sortSel.addEventListener("change", () => {
            f.sort = sortSel.value;
            this.renderGrid();
          });
          const months = browse2.monthOptions(this.items || []);
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
          const playableN = browse2.visibleList(this.items || [], { ...f, playable: false, seed: null }, this.listOpts()).filter((it) => browse2.isPlayable(it, (x) => this.hasFile(x), canStream)).length;
          mk(`Playable here \xB7 ${playableN}`, !!f.playable, () => {
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
          const uni = browse2.tagUniverse(items);
          if (!uni.length) {
            el.classList.add("mlog__tags--empty");
            return;
          }
          el.classList.remove("mlog__tags--empty");
          const chip = (label, on, onClick) => {
            const b = el.createEl("button", { cls: "mlog-tag" + (on ? " mlog-tag--on" : ""), text: label });
            b.addEventListener("click", onClick);
            return b;
          };
          const shown = this.tagsExpanded ? uni : uni.filter((u, i) => i < TAG_CHIP_LIMIT || f.tags.includes(u.key));
          for (const u of shown) {
            const on = f.tags.includes(u.key);
            chip(`${u.label} \xB7 ${u.n}`, on, () => {
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
          const un = browse2.untaggedCount(items);
          if (un || f.untagged) {
            chip(`Untagged \xB7 ${un}`, !!f.untagged, () => {
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
          const counts = browse2.platformCounts(this.items || [], this.normalizeFilter(), this.listOpts());
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
            this.paintTags();
            this.paintFilterCounts();
            return;
          }
          const shuffled = this.filter.seed !== null;
          const pg = shuffled ? { items: list, pageIdx: 0, totalPages: 1, total: list.length, pageSize: list.length } : browse2.paginate(list, this.page, this.pageSize());
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
            header(browse2.SORTS.find((s) => s.key === this.filter.sort).label, pg.items.length);
            for (const item of pg.items) this.renderCard(grid, item);
          } else {
            for (const g of browse2.groupByMonth(pg.items)) {
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
            attr: { role: "button", tabindex: "0", "data-id": item.id }
          });
          const gone = browse2.isGone(item) && !this.streams().can(item);
          if (gone) card.classList.add("mlog-card--gone");
          const thumb = card.createDiv({ cls: "mlog-card__thumb" });
          thumb.createDiv({ cls: "mlog-card__placeholder", text: gone ? "No copy" : item.kind && item.kind !== "link" ? item.kind : item.platform });
          const src = gone ? "" : thumbSrc(this.app, item);
          if (src) this.thumbs.bind(thumb, src, isPhone());
          if (item.starred) thumb.createSpan({ cls: "mlog-card__star", text: "\u2605", attr: { "aria-label": "Starred" } });
          if (!item.watched && !gone) thumb.createSpan({ cls: "mlog-card__unwatched", text: "New" });
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
          const btn = (label, disabled, idx, aria) => {
            const b = bar.createEl("button", { text: label, attr: aria ? { "aria-label": aria } : {} });
            b.disabled = disabled;
            b.addEventListener("click", () => go(idx));
            return b;
          };
          btn("\xAB", pg.pageIdx <= 0, 0, "First page");
          btn("Previous", pg.pageIdx <= 0, pg.pageIdx - 1);
          bar.createSpan({ text: `Page ${pg.pageIdx + 1} of ${pg.totalPages} \xB7 ${browse2.rangeLabel(pg)}` });
          btn("Next", pg.pageIdx >= pg.totalPages - 1, pg.pageIdx + 1);
          btn("\xBB", pg.pageIdx >= pg.totalPages - 1, pg.totalPages - 1, "Last page");
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
            }
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
          new Setting2(c).setName("Dwell (seconds) for items without a video").setDesc("How long the player stays on an embed or image before moving on. Local videos move on when they end.").addText(
            (t) => t.setValue(String(s.tvDwellSecs)).onChange(async (v) => {
              const n = parseInt(v, 10);
              s.tvDwellSecs = n > 0 ? n : SIFI_DEFAULTS.tvDwellSecs;
              await this.plugin.saveSettings();
            })
          );
          new Setting2(c).setName("Auto-advance").setDesc("When a video ends, play the next one; items without a video move on after the dwell. Also toggled from the player.").addToggle(
            (t) => t.setValue(s.autoAdvance !== false).onChange(async (v) => {
              s.autoAdvance = v;
              await this.plugin.saveSettings();
            })
          );
          new Setting2(c).setName("Players use only what plays here").setDesc("TV mode and the pop-up draw only from items that play on this device: a local video, or a reel Instagram will stream. Embeds and posts are skipped.").addToggle(
            (t) => t.setValue(s.playerPlayableOnly !== false).onChange(async (v) => {
              s.playerPlayableOnly = v;
              await this.plugin.saveSettings();
            })
          );
          new Setting2(c).setName("Stream from Instagram").setDesc("No local copy on this device? Fetch the reel's video link from Instagram and stream it \u2014 it autoplays; needs internet. Off: play Instagram's embed instead.").addToggle(
            (t) => t.setValue(s.streamRemote !== false).onChange(async (v) => {
              s.streamRemote = v;
              await this.plugin.saveSettings();
            })
          );
          new Setting2(c).setName("Ask for tags after a share-sheet save").setDesc("When a link arrives from the Save to Media Log shortcut, open the new item with the tag sheet up. Off: save silently, as before.").addToggle(
            (t) => t.setValue(s.tagAfterCapture !== false).onChange(async (v) => {
              s.tagAfterCapture = v;
              await this.plugin.saveSettings();
            })
          );
          new Setting2(c).setName("Poster frames").setDesc("On desktop, grab a frame from each local video that has no screenshot and use it as the thumbnail.").addToggle(
            (t) => t.setValue(!!s.posterFrames).onChange(async (v) => {
              s.posterFrames = v;
              await this.plugin.saveSettings();
            })
          );
          new Setting2(c).setName("Bottom bar on phones").setDesc("Show the Select bottom bar inside the library on a phone (hidden while a player is open).").addToggle(
            (t) => t.setValue(!!s.bottomBar).onChange(async (v) => {
              s.bottomBar = v;
              await this.plugin.saveSettings();
            })
          );
          new Setting2(c).setName("Guide note").setDesc("Vault note the Guide button opens.").addText(
            (t) => t.setValue(String(s.guideNote)).onChange(async (v) => {
              s.guideNote = v.trim() || SIFI_DEFAULTS.guideNote;
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
        BottomBar,
        PosterFactory,
        StreamResolver,
        buildMedia,
        buildTagSheet,
        TagSheetModal,
        decorateAddModal,
        afterCapture,
        loadCaptions,
        keepOne,
        thumbSrc,
        BOTTOM_BAR_TABS,
        SIFI_DEFAULTS
      };
    }
    module2.exports = { build, SIFI_DEFAULTS, BOTTOM_BAR_TABS };
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
        new AddItemModal(this.app, this, (file) => sifi.afterCapture(this, file), {
          // [sifi] tag the new item right away
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
    const enrich = browse.captureEnrich(url, title);
    title = enrich.title;
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
      ...enrich.embedUrl ? [`embed_url: "${yamlEscape(enrich.embedUrl)}"`] : [],
      // [sifi]
      "tags: [" + (tags || []).map((t) => `"${yamlEscape(t)}"`).join(", ") + "]",
      "status: captured",
      ...enrich.kind ? [`kind: "${yamlEscape(enrich.kind)}"`] : [],
      // [sifi]
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
    sifi.decorateAddModal(this, contentEl, tagsInput);
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
        if (this.onDone) this.onDone(file);
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
