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

// "2026-08-07" → "2026-08"; "" when undated.
function monthKeyOf(dkey) {
  const m = String(dkey || "").match(/^(\d{4}-\d{2})/);
  return m ? m[1] : "";
}

// "2026-08" → "August 2026"
function monthTitleOf(key) {
  const m = String(key || "").match(/^(\d{4})-(\d{2})$/);
  const mi = m ? parseInt(m[2], 10) : 0;
  if (mi < 1 || mi > 12) return "Undated";
  return MONTHS[mi - 1].charAt(0) + MONTHS[mi - 1].slice(1).toLowerCase() + " " + m[1];
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

// Every month present → [{key, label, n}], newest first, undated last.
function monthOptions(items) {
  const m = {};
  for (const it of items || []) {
    const k = monthKeyOf(it && it.dkey) || "undated";
    m[k] = (m[k] || 0) + 1;
  }
  return Object.keys(m)
    .sort((a, b) => (a === "undated" ? 1 : b === "undated" ? -1 : a < b ? 1 : a > b ? -1 : 0))
    .map((k) => ({ key: k, label: k === "undated" ? "Undated" : monthTitleOf(k), n: m[k] }));
}

function filterByMonth(list, key) {
  const k = safeStr(key);
  if (!k) return list || [];
  return (list || []).filter((it) => (monthKeyOf(it && it.dkey) || "undated") === k);
}

// ---- search, sort, shuffle, paging ----------------------------------------------

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

const SORTS = [
  { key: "newest", label: "Newest" },
  { key: "oldest", label: "Oldest" },
  { key: "title", label: "Title A–Z" },
  { key: "creator", label: "Creator A–Z" },
  { key: "unwatched", label: "Unwatched first" },
];

// The plugin's sortKey (digits) wins; fixtures without one fall back to dkey.
function stampOf(it) {
  return safeStr(it && it.sortKey) || safeStr(it && it.dkey).replace(/-/g, "");
}

// A new array; ties keep newest-first. Unknown keys behave like "newest".
function sortItems(list, key) {
  const out = (list || []).slice();
  const newest = (a, b) => (stampOf(a) < stampOf(b) ? 1 : stampOf(a) > stampOf(b) ? -1 : 0);
  const text = (f) => (a, b) => safeStr(f(a)).localeCompare(safeStr(f(b)), undefined, { sensitivity: "base" }) || newest(a, b);
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
  return { items: (list || []).slice(idx * size, idx * size + size), pageIdx: idx, totalPages, total: n, pageSize: size };
}

// "1–64 / 430"; "0 / 0" for an empty list.
function rangeLabel(pg) {
  if (!pg || !pg.total) return "0 / 0";
  const size = pg.pageSize > 0 ? pg.pageSize : pg.items.length || 1;
  const first = pg.pageIdx * size + 1;
  const last = Math.min(pg.total, first + pg.items.length - 1);
  return `${first}–${last} / ${pg.total}`;
}

// ---- tags --------------------------------------------------------------------

// Case-insensitive merge across items → [{key, label, n}], count desc, alpha ties, first casing wins.
function tagUniverse(items) {
  const m = {};
  for (const it of items || []) {
    for (const t of (it && it.tags) || []) {
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
  return (items || []).filter((it) => !((it && it.tags) || []).length).length;
}

// AND over every selected tag key; `untagged` shows only items with no tags.
function filterByTags(list, keys, untagged) {
  if (untagged) return (list || []).filter((it) => !((it && it.tags) || []).length);
  const ks = (keys || []).map((k) => String(k).toLowerCase()).filter(Boolean);
  if (!ks.length) return list || [];
  return (list || []).filter((it) => {
    const low = (it && it.tagsLow) || ((it && it.tags) || []).map((t) => String(t).toLowerCase());
    return ks.every((k) => low.includes(k));
  });
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

// ---- poster frames -----------------------------------------------------------

// Where a generated poster frame lives: the plugin's own screenshot convention.
function posterPath(item, assetsFolder) {
  const dir = safeStr(assetsFolder).replace(/\/+$/, "") || "Media Log/Assets";
  return `${dir}/${safeStr(item && item.id)}.jpg`;
}

// Items with a real local video and no usable screenshot. `hasVideo` and
// `hasShot` answer whether the referenced vault files exist.
function posterCandidates(items, hasVideo, hasShot) {
  return (items || []).filter((it) => {
    if (!it || !it.id) return false;
    const v = safeStr(it.video);
    if (!v || v.toLowerCase() === "none" || !hasVideo(it)) return false;
    const s = safeStr(it.screenshot);
    return !(s && hasShot(it));
  });
}

// ---- playable, gone, hashtags ------------------------------------------------

// `video: none` is the runner's sentinel: Instagram refused the download five
// times — the reel is private or removed. Nothing will ever play it here.
function isGone(it) {
  return safeStr(it && it.video).toLowerCase() === "none";
}

// Playable on THIS device: a real local video file, or — when streaming is on —
// a reel Instagram will stream. `hasFile` answers whether the referenced vault
// file exists here (the Mac may have it, the phone may not).
function isPlayable(it, hasFile, canStream) {
  const v = safeStr(it && it.video);
  if (v && v.toLowerCase() !== "none" && hasFile && hasFile(it)) return true;
  return !!(canStream && isStreamable(it));
}

// ---- streaming from Instagram (owner, 2026-09-05: "if streaming fixes it then do that") ----
// A reel's embed page, fetched with a plain request (no login, no browser), carries
// the direct CDN video link inside a JSON string named contextJSON, escaped twice.
// A native <video> streams that link and autoplays where the embed never does.
const IG_CODE_RE = /instagram\.com\/(?:[^/?#]+\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i;

function igCodeOf(url) {
  const m = IG_CODE_RE.exec(safeStr(url));
  return m ? m[1] : "";
}

// The page to ask for the link: the item's own embed URL when it is Instagram's,
// else one derived from the reel code in the source URL.
function embedPageFor(it) {
  if (!it) return "";
  const e = safeStr(it.embedUrl);
  if (/^https:\/\/www\.instagram\.com\/[^?#]*\/embed/i.test(e)) return e;
  const code = igCodeOf(it.sourceUrl || it.url);
  return code ? `https://www.instagram.com/reel/${code}/embed/captioned/` : "";
}

// Reels and videos only; an Instagram post is an image.
function isStreamable(it) {
  if (!it || safeStr(it.kind) === "post") return false;
  return !!embedPageFor(it);
}

// The direct mp4 link out of a saved embed page, or "".
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

// The link's expiry: `oe=` is hex seconds since the epoch. 0 when absent.
function cdnExpiry(url) {
  const m = /[?&]oe=([0-9A-Fa-f]{6,10})(?:&|$)/.exec(safeStr(url));
  if (!m) return 0;
  const t = parseInt(m[1], 16) * 1000;
  return Number.isFinite(t) && t > 0 ? t : 0;
}

// A cached link is worth using while it has `marginMs` left; one without an
// expiry is trusted for `defaultMs` from when it was fetched.
function streamFresh(entry, nowMs, marginMs, defaultMs) {
  if (!entry || !entry.url) return false;
  const margin = marginMs == null ? 10 * 60 * 1000 : marginMs;
  const exp = entry.expires || (entry.fetched || 0) + (defaultMs == null ? 6 * 60 * 60 * 1000 : defaultMs);
  return exp - margin > nowMs;
}

// Hashtags in a caption → clean, lower-case, deduped tag list (max 8).
function hashtagsOf(text) {
  const out = [];
  const seen = new Set();
  for (const m of String(text || "").matchAll(/(?:^|[^\p{L}\p{N}_#])#([\p{L}\p{N}_]{2,40})/gu)) {
    const t = m[1].toLowerCase();
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 8) break;
  }
  return out;
}

// Tags to write for an item that has none yet: its caption's hashtags.
function tagsFromCaption(it) {
  if (!it || ((it.tags || []).length > 0)) return [];
  return hashtagsOf(it.caption);
}

// ---- the visible-list pipeline ----------------------------------------------

function matchesReview(item, filter, canStream) {
  // a gone reel can never be watched — unless streaming brings it back
  if (filter === "unwatched") return !item.watched && (!isGone(item) || (!!canStream && isStreamable(item)));
  if (filter === "watched") return !!item.watched;
  if (filter === "starred") return !!item.starred;
  return true;
}

// Upstream's filters, unchanged in meaning: platform exact, tag exact, review state.
function baseFilter(items, f, opts) {
  const canStream = !!(opts && opts.canStream);
  return (items || []).filter((it) => {
    if (f.platform && it.platform !== f.platform) return false;
    if (f.tag && !(it.tags || []).includes(f.tag)) return false;
    if (f.review && !matchesReview(it, f.review, canStream)) return false;
    return true;
  });
}

// filters → tag chips → month → on-this-day → search (captions included) →
// sort → shuffled deal. A shuffled deal is capped at one page: that IS the
// "Random 64". Sorting other than newest is explicit; upstream's order stands otherwise.
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
  if (f.seed !== null && f.seed !== undefined) L = shuffleBySeed(L, f.seed).slice(0, o.pageSize > 0 ? o.pageSize : 64);
  return L;
}

// Counts per platform inside every OTHER active filter (the original's live counts).
function platformCounts(items, filter, opts) {
  const f = { ...(filter || {}), platform: "", seed: null };
  const counts = {};
  for (const it of visibleList(items, f, opts)) counts[it.platform] = (counts[it.platform] || 0) + 1;
  return counts;
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
};
