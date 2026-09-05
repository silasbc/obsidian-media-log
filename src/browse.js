// Media Log, Sifi's edition — browse tools (pure logic).
//
// Ported from the retired dataviewjs Media Library surface. Nothing in here
// touches Obsidian or the DOM, so every function is exercised by
// scripts/browse-test.cjs. Inputs are the plugin's own item objects (see
// main.js listItems), enriched once by enrichItem below: the old surface's
// `url` is the plugin's `sourceUrl`, and `dkey` ("YYYY-MM-DD") is derived from
// captured_at, falling back to the timestamp inside media_id.
"use strict";

const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

// null/undefined and their string ghosts become "" — never rendered.
function safeStr(v) {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  return s === "undefined" || s === "null" ? "" : s;
}

// "https://www.YouTube.com:443/watch?v=x" → "youtube.com"
function hostOf(url) {
  const s = safeStr(url);
  if (!s) return "";
  const m = s.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/([^/?#]+)/);
  const h = m ? m[1] : s.split(/[/?#]/)[0];
  return h.replace(/^www\./i, "").replace(/:\d+$/, "").toLowerCase();
}

// The plugin's items carry sourceUrl; the old surface's fixtures carry url.
function itemUrl(it) {
  return safeStr(it && (it.sourceUrl || it.url));
}

// ---- dates -------------------------------------------------------------------

// captured_at wins; else the YYYYMMDD inside the media_id; else "".
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

// "2026-08-07" → "AUGUST 2026"
function monthLabelOf(dkey) {
  const m = String(dkey || "").match(/^(\d{4})-(\d{2})/);
  const mi = m ? parseInt(m[2], 10) : 0;
  return mi >= 1 && mi <= 12 ? MONTHS[mi - 1] + " " + m[1] : "UNDATED";
}

// "2026-08-07" → "Aug 7"
function shortDateOf(dkey) {
  const m = String(dkey || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  const mi = m ? parseInt(m[2], 10) : 0;
  if (mi < 1 || mi > 12) return "";
  return MONTHS[mi - 1].charAt(0) + MONTHS[mi - 1].slice(1, 3).toLowerCase() + " " + parseInt(m[3], 10);
}

// Same month-day, any year.
function onThisDayItems(items, mmdd) {
  return mmdd ? (items || []).filter((it) => mmddOf(it && it.dkey) === mmdd) : [];
}

// Sorted items → [{label, items}] in encounter order (newest month first).
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

// ---- search, shuffle, paging -------------------------------------------------

// Tokenized AND over title + creator + platform + tags + caption + url.
function matchesQuery(it, q) {
  const s = safeStr(q).toLowerCase();
  if (!s) return true;
  if (!it) return false;
  const hay = [it.title, it.creator, it.platform, (it.tags || []).join(" "), it.caption, itemUrl(it)]
    .map((v) => safeStr(v))
    .join(" ")
    .toLowerCase();
  return s.split(/\s+/).every((t) => !t || hay.indexOf(t) >= 0);
}

// Deterministic LCG shuffle — same seed, same deal; input untouched.
function shuffleBySeed(list, seed) {
  const out = (list || []).slice();
  let s = (seed >>> 0) || 1;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
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

// Clamps pageIdx into range and slices out that page.
function paginate(list, pageIdx, pageSize) {
  const n = (list || []).length;
  const size = pageSize > 0 ? pageSize : 64;
  const totalPages = Math.max(1, Math.ceil(n / size));
  const idx = Math.min(Math.max(pageIdx || 0, 0), totalPages - 1);
  return { items: (list || []).slice(idx * size, idx * size + size), pageIdx: idx, totalPages, total: n };
}

// ---- playlist stepping + auto-advance ---------------------------------------

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

// Auto-advance machine: play → (countdown →) advance.
function advInit(playSecs, countSecs, nowMs) {
  return { phase: "playing", startedMs: nowMs, playSecs, countSecs };
}

// → {action:"none"|"show-countdown"|"countdown"|"advance", left?, st}
function advanceTick(st, nowMs) {
  if (!st || st.phase === "off") return { action: "none", st };
  const reset = { phase: "playing", startedMs: nowMs, playSecs: st.playSecs, countSecs: st.countSecs };
  if (st.phase === "playing") {
    if (nowMs - st.startedMs >= st.playSecs * 1000) {
      if (st.countSecs <= 0) return { action: "advance", st: reset };
      return {
        action: "show-countdown",
        left: st.countSecs,
        st: { phase: "countdown", startedMs: nowMs, playSecs: st.playSecs, countSecs: st.countSecs },
      };
    }
    return { action: "none", st };
  }
  if (st.phase === "countdown") {
    const left = st.countSecs - Math.floor((nowMs - st.startedMs) / 1000);
    if (left <= 0) return { action: "advance", st: reset };
    return { action: "countdown", left, st };
  }
  return { action: "none", st };
}

// ---- duplicate scan ----------------------------------------------------------

// Duplicate identity: Instagram → kind/code (code case preserved);
// general → host+path with query, fragment, and trailing slash stripped.
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

// Near-identical title identity; "" = not groupable.
function normTitleKey(title) {
  const s = safeStr(title).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  return !s || s === "untitled" || s.length < 8 ? "" : s;
}

// URL groups first (definite), then title-only groups (maybe); url-grouped
// items sit out the title pass; hostname-fallback titles never group.
function dupeGroups(items) {
  const byUrl = {};
  for (const it of items || []) {
    const k = urlKeyOf(itemUrl(it));
    if (k) (byUrl[k] = byUrl[k] || []).push(it);
  }
  const groups = [];
  const taken = new Set();
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
  return ((group && group.items) || []).filter((x) => x !== keep);
}

// "YYYY-MM-DD HH:MM" for quarantine lines.
function stampNow(d) {
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}

function quarantineLine(it, stamp) {
  return "- " + ((it && it.title) || "Untitled") + " · " + (itemUrl(it) || "—") + " · trashed " + stamp + " · duplicate-scan";
}

// ---- captions ----------------------------------------------------------------

// Note body minus frontmatter, whitespace collapsed, capped at 240 chars.
function commentPreview(raw) {
  let s = String(raw == null ? "" : raw);
  s = s.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  s = s.replace(/\s+/g, " ").trim();
  if (s === "undefined" || s === "null") s = "";
  if (s.length > 240) s = s.slice(0, 239).replace(/\s+$/, "") + "…";
  return s;
}

// ---- kind + media shape ------------------------------------------------------

// Explicit `kind` frontmatter wins (the runner writes reel/post/video); else
// derived from an Instagram url; "link" as the floor.
function kindOf(it) {
  const k = safeStr(it && it.kind).toLowerCase();
  if (k) return k;
  const u = itemUrl(it).toLowerCase();
  const m = u.match(/instagram\.com\/(reels?|p|tv)\//);
  if (m) return m[1] === "p" ? "post" : m[1] === "tv" ? "tv" : "reel";
  return "link";
}

// Reels, TikToks, and Instagram posts want a 9:16 box; everything else 16:10.
function isPortrait(it) {
  const k = kindOf(it);
  if (k === "reel" || k === "tv" || k === "video" || k === "post") return true;
  const p = safeStr(it && it.platform).toLowerCase();
  if (p === "instagram" || p === "tiktok") return true;
  return /instagram\.com|tiktok\.com/i.test(safeStr(it && it.embedUrl));
}

// Best-effort autoplay hint for embed players; existing params preserved.
function autoplayUrl(url) {
  const s = safeStr(url);
  if (!s) return "";
  if (/[?&]autoplay=/i.test(s)) return s;
  return s + (s.indexOf("?") >= 0 ? "&" : "?") + "autoplay=1";
}

// ---- the visible-list pipeline ----------------------------------------------

function matchesReview(item, filter) {
  if (filter === "unwatched") return !item.watched;
  if (filter === "watched") return !!item.watched;
  if (filter === "starred") return !!item.starred;
  return true;
}

// Upstream's filters, unchanged in meaning: platform exact, tag exact, review state.
function baseFilter(items, f) {
  return (items || []).filter((it) => {
    if (f.platform && it.platform !== f.platform) return false;
    if (f.tag && !(it.tags || []).includes(f.tag)) return false;
    if (f.review && !matchesReview(it, f.review)) return false;
    return true;
  });
}

// filters → on-this-day → search (captions included) → shuffled deal.
// A shuffled deal is capped at one page: that IS the "Random 64".
function visibleList(items, filter, opts) {
  const f = filter || {};
  const o = opts || {};
  let L = baseFilter(items, f);
  if (f.onDay) L = onThisDayItems(L, o.todayMMDD || "");
  const q = safeStr(f.search);
  if (q) L = L.filter((it) => matchesQuery(it, q));
  if (f.seed !== null && f.seed !== undefined) L = shuffleBySeed(L, f.seed).slice(0, o.pageSize > 0 ? o.pageSize : 64);
  return L;
}

// Adds the fork's derived fields to an upstream item. Every field is optional
// and unknown to upstream, so the item contract stays identical.
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

module.exports = {
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
  enrichItem,
};
