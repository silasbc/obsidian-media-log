// Sifi's edition — unit tests for src/browse.js (pure logic, no Obsidian).
// Run: node --test scripts/browse-test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const b = require("../src/browse.js");

// ---- fallbacks ----
test("hostOf: hostname extraction is defensive", () => {
  assert.equal(b.hostOf("https://www.YouTube.com:443/watch?v=x"), "youtube.com");
  assert.equal(b.hostOf("http://sub.example.com/path?q=1#frag"), "sub.example.com");
  assert.equal(b.hostOf("example.com/foo/bar"), "example.com");
  assert.equal(b.hostOf(""), "");
  assert.equal(b.hostOf(null), "");
  assert.equal(b.hostOf(undefined), "");
});

test("itemUrl: sourceUrl wins, url is the fixture fallback, ghosts vanish", () => {
  assert.equal(b.itemUrl({ sourceUrl: "https://a.com/1", url: "https://b.com/2" }), "https://a.com/1");
  assert.equal(b.itemUrl({ url: "https://b.com/2" }), "https://b.com/2");
  assert.equal(b.itemUrl({ sourceUrl: "undefined" }), "");
  assert.equal(b.itemUrl(null), "");
});

// ---- dates ----
test("dateKeyOf: captured_at wins, media_id stamp is the fallback", () => {
  assert.equal(b.dateKeyOf("2026-08-07 14:28:00", "ml-20260101-000000-web-x"), "2026-08-07");
  assert.equal(b.dateKeyOf("", "ml-20260707-160000-instagram-reel"), "2026-07-07");
  assert.equal(b.dateKeyOf("garbage", "ml-nope"), "");
  assert.equal(b.dateKeyOf(null, null), "");
});

test("mmddOf / todayMMDD / onThisDayItems: same month-day across years", () => {
  assert.equal(b.mmddOf("2026-08-07"), "08-07");
  assert.equal(b.mmddOf("2024-08-07 10:00"), "08-07");
  assert.equal(b.mmddOf(""), "");
  assert.equal(b.mmddOf("garbage"), "");
  assert.equal(b.todayMMDD(new Date(2026, 8, 4)), "09-04");
  const items = [{ dkey: "2026-08-07" }, { dkey: "2024-08-07" }, { dkey: "2026-08-06" }, { dkey: "" }];
  assert.equal(b.onThisDayItems(items, "08-07").length, 2);
  assert.equal(b.onThisDayItems(items, "01-01").length, 0);
  assert.equal(b.onThisDayItems(items, "").length, 0);
});

test("monthLabelOf and shortDateOf", () => {
  assert.equal(b.monthLabelOf("2026-08-07 18:12"), "AUGUST 2026");
  assert.equal(b.monthLabelOf("2026-01-02"), "JANUARY 2026");
  assert.equal(b.monthLabelOf(""), "UNDATED");
  assert.equal(b.monthLabelOf("2026-13-01"), "UNDATED");
  assert.equal(b.shortDateOf("2026-08-07"), "Aug 7");
  assert.equal(b.shortDateOf("2026-12-25"), "Dec 25");
  assert.equal(b.shortDateOf(""), "");
});

test("groupByMonth: month groups in encounter order, undated group last", () => {
  const items = [{ dkey: "2026-08-07" }, { dkey: "2026-08-01" }, { dkey: "2026-07-28" }, { dkey: "" }];
  assert.deepEqual(
    b.groupByMonth(items).map((g) => [g.label, g.items.length]),
    [["AUGUST 2026", 2], ["JULY 2026", 1], ["UNDATED", 1]]
  );
  assert.deepEqual(b.groupByMonth([]), []);
});

// ---- browse tools ----
test("matchesQuery: tokenized AND over title, creator, platform, tags, caption, url", () => {
  const it = {
    title: "Heavy Triple",
    creator: "Lifter",
    platform: "Instagram",
    tags: ["Bench", "meet"],
    caption: "belt on, third attempt",
    sourceUrl: "https://www.instagram.com/reel/ABC/",
  };
  assert.equal(b.matchesQuery(it, ""), true);
  assert.equal(b.matchesQuery(it, "   "), true);
  assert.equal(b.matchesQuery(it, "heavy"), true);
  assert.equal(b.matchesQuery(it, "HEAVY triple"), true);
  assert.equal(b.matchesQuery(it, "bench insta"), true); // tag + platform substring
  assert.equal(b.matchesQuery(it, "belt attempt"), true); // caption tokens
  assert.equal(b.matchesQuery(it, "reel/abc"), true); // url
  assert.equal(b.matchesQuery(it, "heavy squat"), false); // AND semantics
  assert.equal(b.matchesQuery({ title: "", tags: [] }, "x"), false);
  assert.equal(b.matchesQuery(null, "x"), false);
});

test("shuffleBySeed: deterministic, a permutation, seed-sensitive", () => {
  const list = Array.from({ length: 20 }, (_, i) => i);
  const a = b.shuffleBySeed(list, 42);
  const a2 = b.shuffleBySeed(list, 42);
  const c = b.shuffleBySeed(list, 43);
  assert.deepEqual(a, a2, "same seed, same deal");
  assert.deepEqual([...a].sort((x, y) => x - y), list, "permutation, nothing lost");
  assert.notDeepEqual(a, c, "different seed, different deal");
  assert.deepEqual(b.shuffleBySeed([], 1), []);
  assert.deepEqual(list, Array.from({ length: 20 }, (_, i) => i), "input untouched");
});

test("paginate: slices by page, clamps out-of-range indexes, reports totals", () => {
  const list = Array.from({ length: 150 }, (_, i) => i);
  const p0 = b.paginate(list, 0, 64);
  assert.deepEqual(p0.items, list.slice(0, 64));
  assert.equal(p0.pageIdx, 0);
  assert.equal(p0.totalPages, 3);
  assert.equal(p0.total, 150);
  const p2 = b.paginate(list, 2, 64);
  assert.deepEqual(p2.items, list.slice(128, 150));
  assert.equal(b.paginate(list, 99, 64).pageIdx, 2);
  assert.equal(b.paginate(list, -5, 64).pageIdx, 0);
  const empty = b.paginate([], 0, 64);
  assert.equal(empty.totalPages, 1);
  assert.deepEqual(empty.items, []);
  assert.equal(b.paginate(Array.from({ length: 64 }), 0, 64).totalPages, 1);
  assert.equal(b.paginate(list, 0, 0).items.length, 64, "a bad page size falls back to 64");
});

// ---- playlist stepping + auto-advance ----
test("nextIndex / prevIndex: edges, loop, empty", () => {
  assert.equal(b.nextIndex(0, 3, false), 1);
  assert.equal(b.nextIndex(2, 3, false), -1);
  assert.equal(b.nextIndex(2, 3, true), 0);
  assert.equal(b.prevIndex(1, 3, false), 0);
  assert.equal(b.prevIndex(0, 3, false), -1);
  assert.equal(b.prevIndex(0, 3, true), 2);
  assert.equal(b.nextIndex(0, 0, true), -1);
  assert.equal(b.prevIndex(0, 0, true), -1);
});

test("advanceTick: play → countdown → advance (modal shape)", () => {
  const t0 = 1000000;
  let st = b.advInit(20, 5, t0);
  assert.equal(b.advanceTick(st, t0 + 19000).action, "none");
  let r = b.advanceTick(st, t0 + 20000);
  assert.equal(r.action, "show-countdown");
  assert.equal(r.left, 5);
  st = r.st;
  assert.equal(st.phase, "countdown");
  r = b.advanceTick(st, t0 + 22000);
  assert.equal(r.action, "countdown");
  assert.equal(r.left, 3);
  r = b.advanceTick(st, t0 + 25000);
  assert.equal(r.action, "advance");
  assert.equal(r.st.phase, "playing");
});

test("advanceTick: TV shape (countSecs 0) advances straight; off/null are inert", () => {
  const t0 = 5000;
  const st = b.advInit(30, 0, t0);
  assert.equal(b.advanceTick(st, t0 + 29999).action, "none");
  assert.equal(b.advanceTick(st, t0 + 30000).action, "advance");
  assert.equal(b.advanceTick(null, t0).action, "none");
  assert.equal(b.advanceTick({ phase: "off" }, t0).action, "none");
});

// ---- duplicate scan ----
test("urlKeyOf: instagram identity preserves code case; general urls normalize", () => {
  assert.equal(b.urlKeyOf("https://www.instagram.com/reel/AbC123/?utm_source=share"), "instagram.com/reel/AbC123");
  assert.equal(b.urlKeyOf("http://instagram.com/reels/AbC123/"), "instagram.com/reel/AbC123");
  assert.notEqual(b.urlKeyOf("https://instagram.com/reel/ABC/"), b.urlKeyOf("https://instagram.com/reel/abc/"));
  assert.equal(b.urlKeyOf("https://www.instagram.com/p/Xy-9_/"), "instagram.com/p/Xy-9_");
  assert.equal(b.urlKeyOf("https://Example.com/Foo/?q=1#frag"), "example.com/foo");
  assert.equal(b.urlKeyOf("example.com/foo/"), "example.com/foo");
  assert.equal(b.urlKeyOf("https://www.example.com/foo"), "example.com/foo");
  assert.equal(b.urlKeyOf(""), "");
  assert.equal(b.urlKeyOf(null), "");
});

test("normTitleKey: collapse and floor rules", () => {
  assert.equal(b.normTitleKey("Bench Press — Tips! Today"), "bench press tips today");
  assert.equal(b.normTitleKey("bench   press,, tips  today"), "bench press tips today");
  assert.equal(b.normTitleKey("Untitled"), "");
  assert.equal(b.normTitleKey("short"), "");
  assert.equal(b.normTitleKey(""), "");
  assert.equal(b.normTitleKey(null), "");
});

test("dupeGroups: url groups definite, title groups maybe, exclusions hold, sourceUrl honored", () => {
  const a1 = { title: "Squat day", sourceUrl: "https://www.instagram.com/reel/CODE1/?x=1" };
  const a2 = { title: "Squat day repost", sourceUrl: "https://instagram.com/reel/CODE1/" };
  const b1 = { title: "Bench press tips today", url: "https://example.com/1" };
  const b2 = { title: "Bench Press — tips, today!", url: "https://example.com/2" };
  const h1 = { title: "instagram.com", sourceUrl: "https://instagram.com/some-page" };
  const h2 = { title: "instagram.com", sourceUrl: "https://instagram.com/other-page" };
  const d = { title: "Unique thing entirely", sourceUrl: "https://example.org/1" };
  const groups = b.dupeGroups([a1, a2, b1, b2, h1, h2, d]);
  assert.equal(groups.length, 2, "hostname-fallback titles never group");
  assert.equal(groups[0].kind, "url");
  assert.equal(groups[0].maybe, false);
  assert.deepEqual(groups[0].items, [a1, a2]);
  assert.equal(groups[1].kind, "title");
  assert.equal(groups[1].maybe, true);
  assert.deepEqual(groups[1].items, [b1, b2]);
  assert.deepEqual(b.dupeGroups([d]), []);
  assert.deepEqual(b.dupeGroups([]), []);
});

test("othersOf, quarantineLine, stampNow", () => {
  const g = { items: [1, 2, 3] };
  assert.deepEqual(b.othersOf(g, 2), [1, 3]);
  assert.deepEqual(b.othersOf(null, 1), []);
  assert.equal(
    b.quarantineLine({ title: "Squat day", sourceUrl: "https://example.com/x" }, "2026-08-07 22:50"),
    "- Squat day · https://example.com/x · trashed 2026-08-07 22:50 · duplicate-scan"
  );
  assert.equal(b.quarantineLine({}, "S"), "- Untitled · — · trashed S · duplicate-scan");
  assert.equal(b.stampNow(new Date(2026, 7, 7, 9, 5)), "2026-08-07 09:05");
});

// ---- captions ----
test("commentPreview: strips frontmatter, collapses whitespace, caps length", () => {
  assert.equal(b.commentPreview("---\nmedia_id: x\n---\nFrug #lakepowell #fyp\n"), "Frug #lakepowell #fyp");
  assert.equal(b.commentPreview("---\na: 1\n---\n"), "");
  assert.equal(b.commentPreview("no frontmatter\n\nsecond   paragraph"), "no frontmatter second paragraph");
  assert.equal(b.commentPreview(undefined), "");
  assert.equal(b.commentPreview(null), "");
  const long = b.commentPreview("x".repeat(300));
  assert.ok(long.length <= 240);
  assert.ok(long.endsWith("…"));
});

// ---- kind + media shape ----
test("kindOf: explicit kind wins, url-derived fallback, link floor", () => {
  assert.equal(b.kindOf({ kind: "Reel" }), "reel");
  assert.equal(b.kindOf({ kind: "video" }), "video");
  assert.equal(b.kindOf({ sourceUrl: "https://www.instagram.com/reel/ABC/" }), "reel");
  assert.equal(b.kindOf({ sourceUrl: "https://www.instagram.com/reels/ABC/" }), "reel");
  assert.equal(b.kindOf({ sourceUrl: "https://www.instagram.com/p/ABC/" }), "post");
  assert.equal(b.kindOf({ sourceUrl: "https://www.instagram.com/tv/ABC/" }), "tv");
  assert.equal(b.kindOf({ sourceUrl: "https://example.com/a" }), "link");
  assert.equal(b.kindOf(null), "link");
});

test("isPortrait: reels, posts, Instagram and TikTok are 9:16; the web is wide", () => {
  assert.equal(b.isPortrait({ kind: "reel" }), true);
  assert.equal(b.isPortrait({ platform: "Instagram" }), true);
  assert.equal(b.isPortrait({ platform: "TikTok" }), true);
  assert.equal(b.isPortrait({ platform: "Web", embedUrl: "https://www.tiktok.com/embed/1" }), true);
  assert.equal(b.isPortrait({ platform: "YouTube", sourceUrl: "https://youtu.be/x" }), false);
  assert.equal(b.isPortrait({ platform: "Web" }), false);
});

test("autoplayUrl: adds autoplay=1 once, keeps existing params", () => {
  assert.equal(b.autoplayUrl("https://www.instagram.com/reel/X/embed/captioned/"), "https://www.instagram.com/reel/X/embed/captioned/?autoplay=1");
  assert.equal(b.autoplayUrl("https://www.youtube.com/embed/x?rel=0"), "https://www.youtube.com/embed/x?rel=0&autoplay=1");
  assert.equal(b.autoplayUrl("https://example.com/e?autoplay=0"), "https://example.com/e?autoplay=0");
  assert.equal(b.autoplayUrl(""), "");
});

// ---- the visible-list pipeline ----
const ITEMS = [
  { id: "a", title: "Heavy triple", platform: "Instagram", tags: ["bench"], watched: true, starred: false, dkey: "2026-09-04", caption: "" },
  { id: "b", title: "Squat day", platform: "Instagram", tags: ["squat"], watched: false, starred: true, dkey: "2025-09-04", caption: "belt on" },
  { id: "c", title: "Chisel sharpening", platform: "YouTube", tags: [], watched: false, starred: false, dkey: "2026-07-08", caption: "" },
  { id: "d", title: "Example Domain", platform: "Web", tags: ["bench"], watched: false, starred: false, dkey: "", caption: "test capture" },
];

test("matchesReview and baseFilter keep upstream semantics", () => {
  assert.equal(b.matchesReview(ITEMS[0], "watched"), true);
  assert.equal(b.matchesReview(ITEMS[0], "unwatched"), false);
  assert.equal(b.matchesReview(ITEMS[1], "starred"), true);
  assert.equal(b.matchesReview(ITEMS[2], ""), true);
  assert.deepEqual(b.baseFilter(ITEMS, { platform: "Instagram" }).map((i) => i.id), ["a", "b"]);
  assert.deepEqual(b.baseFilter(ITEMS, { tag: "bench" }).map((i) => i.id), ["a", "d"]);
  assert.deepEqual(b.baseFilter(ITEMS, { review: "unwatched", tag: "bench" }).map((i) => i.id), ["d"]);
});

test("visibleList: filters → on-this-day → search → shuffled deal", () => {
  const opts = { todayMMDD: "09-04", pageSize: 2 };
  assert.equal(b.visibleList(ITEMS, {}, opts).length, 4);
  assert.deepEqual(b.visibleList(ITEMS, { onDay: true }, opts).map((i) => i.id), ["a", "b"]);
  assert.deepEqual(b.visibleList(ITEMS, { search: "belt" }, opts).map((i) => i.id), ["b"], "caption text is searchable");
  assert.deepEqual(b.visibleList(ITEMS, { search: "capture", platform: "Web" }, opts).map((i) => i.id), ["d"]);
  const deal = b.visibleList(ITEMS, { seed: 7 }, opts);
  assert.equal(deal.length, 2, "a deal is capped at one page");
  assert.deepEqual(deal, b.visibleList(ITEMS, { seed: 7 }, opts), "same seed, same deal");
  assert.equal(b.visibleList(ITEMS, { seed: null, onDay: undefined }, opts).length, 4, "cleared fork keys are inert");
  assert.deepEqual(b.visibleList(null, {}, opts), []);
});

// ---- sort, months, tags, counts, pager, posters (1.4.0-sifi.3) ----
const SORTABLE = [
  { id: "a", title: "Zebra", creator: "Bea", sortKey: "20260904090000", watched: true },
  { id: "b", title: "apple", creator: "Al", sortKey: "20260807142800", watched: false },
  { id: "c", title: "Mango", creator: "Cy", sortKey: "20250904090000", watched: false },
];

test("sortItems: newest, oldest, title, creator, unwatched first; input untouched", () => {
  const ids = (l) => l.map((i) => i.id);
  assert.deepEqual(ids(b.sortItems(SORTABLE, "newest")), ["a", "b", "c"]);
  assert.deepEqual(ids(b.sortItems(SORTABLE, "oldest")), ["c", "b", "a"]);
  assert.deepEqual(ids(b.sortItems(SORTABLE, "title")), ["b", "c", "a"], "case-insensitive");
  assert.deepEqual(ids(b.sortItems(SORTABLE, "creator")), ["b", "a", "c"]);
  assert.deepEqual(ids(b.sortItems(SORTABLE, "unwatched")), ["b", "c", "a"], "unwatched first, then newest");
  assert.deepEqual(ids(b.sortItems(SORTABLE, "bogus")), ["a", "b", "c"], "unknown key behaves like newest");
  assert.deepEqual(ids(SORTABLE), ["a", "b", "c"], "input untouched");
  assert.deepEqual(b.sortItems([{ id: "x", dkey: "2026-01-01" }, { id: "y", dkey: "2026-02-01" }], "newest").map((i) => i.id), ["y", "x"], "dkey fallback");
});

test("monthKeyOf / monthTitleOf / monthOptions / filterByMonth", () => {
  assert.equal(b.monthKeyOf("2026-08-07"), "2026-08");
  assert.equal(b.monthKeyOf(""), "");
  assert.equal(b.monthTitleOf("2026-08"), "August 2026");
  assert.equal(b.monthTitleOf("nope"), "Undated");
  const items = [{ dkey: "2026-08-07" }, { dkey: "2026-08-01" }, { dkey: "2026-07-28" }, { dkey: "" }];
  assert.deepEqual(b.monthOptions(items), [
    { key: "2026-08", label: "August 2026", n: 2 },
    { key: "2026-07", label: "July 2026", n: 1 },
    { key: "undated", label: "Undated", n: 1 },
  ]);
  assert.equal(b.filterByMonth(items, "2026-08").length, 2);
  assert.equal(b.filterByMonth(items, "undated").length, 1);
  assert.equal(b.filterByMonth(items, "").length, 4);
});

test("tagUniverse / untaggedCount / filterByTags: case-insensitive AND, Untagged", () => {
  const items = [
    { id: "1", tags: ["Bench", "meet"], tagsLow: ["bench", "meet"] },
    { id: "2", tags: ["bench", "squat"], tagsLow: ["bench", "squat"] },
    { id: "3", tags: ["squat"] },
    { id: "4", tags: [] },
  ];
  assert.deepEqual(b.tagUniverse(items), [
    { key: "bench", label: "Bench", n: 2 },
    { key: "squat", label: "squat", n: 2 },
    { key: "meet", label: "meet", n: 1 },
  ]);
  assert.equal(b.untaggedCount(items), 1);
  assert.deepEqual(b.filterByTags(items, ["bench"]).map((i) => i.id), ["1", "2"]);
  assert.deepEqual(b.filterByTags(items, ["BENCH", "squat"]).map((i) => i.id), ["2"], "AND, any casing");
  assert.deepEqual(b.filterByTags(items, ["squat"]).map((i) => i.id), ["2", "3"], "tagsLow optional");
  assert.deepEqual(b.filterByTags(items, [], true).map((i) => i.id), ["4"], "Untagged");
  assert.equal(b.filterByTags(items, []).length, 4);
  assert.deepEqual(b.tagUniverse([]), []);
});

test("rangeLabel: first–last / total, empty list", () => {
  const list = Array.from({ length: 150 }, (_, i) => i);
  assert.equal(b.rangeLabel(b.paginate(list, 0, 64)), "1–64 / 150");
  assert.equal(b.rangeLabel(b.paginate(list, 2, 64)), "129–150 / 150");
  assert.equal(b.rangeLabel(b.paginate([], 0, 64)), "0 / 0");
});

test("platformCounts: counts inside the other active filters, platform itself ignored", () => {
  const counts = b.platformCounts(ITEMS, { platform: "Web", review: "unwatched" }, { todayMMDD: "09-04" });
  assert.deepEqual(counts, { Instagram: 1, YouTube: 1, Web: 1 });
  assert.deepEqual(b.platformCounts(ITEMS, { search: "belt" }, {}), { Instagram: 1 });
});

test("visibleList: tags, untagged, month, and sort join the pipeline", () => {
  const opts = { todayMMDD: "09-04", pageSize: 64 };
  assert.deepEqual(b.visibleList(ITEMS, { tags: ["bench"] }, opts).map((i) => i.id), ["a", "d"]);
  assert.deepEqual(b.visibleList(ITEMS, { untagged: true }, opts).map((i) => i.id), ["c"]);
  assert.deepEqual(b.visibleList(ITEMS, { month: "2026-09" }, opts).map((i) => i.id), ["a"]);
  assert.deepEqual(b.visibleList(ITEMS, { sort: "title" }, opts).map((i) => i.id), ["c", "d", "a", "b"]);
  assert.deepEqual(b.visibleList(ITEMS, { sort: "newest" }, opts).map((i) => i.id), ["a", "b", "c", "d"], "newest keeps upstream order");
});

test("posterPath / posterCandidates: local video without a usable screenshot", () => {
  assert.equal(b.posterPath({ id: "ml-1" }, "Media Log/Assets/"), "Media Log/Assets/ml-1.jpg");
  assert.equal(b.posterPath({ id: "ml-1" }, ""), "Media Log/Assets/ml-1.jpg");
  const items = [
    { id: "v", video: "Media Log/Assets/Video/v.mp4", screenshot: "" },
    { id: "s", video: "Media Log/Assets/Video/s.mp4", screenshot: "Media Log/Assets/s.jpg" },
    { id: "g", video: "Media Log/Assets/Video/g.mp4", screenshot: "Media Log/Assets/gone.jpg" },
    { id: "n", video: "none" },
    { id: "e", video: "" },
    { id: "m", video: "Media Log/Assets/Video/missing.mp4" },
  ];
  const hasVideo = (it) => it.id !== "m";
  const hasShot = (it) => it.screenshot === "Media Log/Assets/s.jpg";
  assert.deepEqual(b.posterCandidates(items, hasVideo, hasShot).map((i) => i.id), ["v", "g"]);
});

test("isGone / isPlayable: the none sentinel, and a file that exists here", () => {
  const hasFile = (it) => it.video === "Media Log/Assets/Video/here.mp4";
  assert.equal(b.isGone({ video: "none" }), true);
  assert.equal(b.isGone({ video: "NONE" }), true);
  assert.equal(b.isGone({ video: "Media Log/Assets/Video/here.mp4" }), false);
  assert.equal(b.isGone({}), false);
  assert.equal(b.isPlayable({ video: "Media Log/Assets/Video/here.mp4" }, hasFile), true, "file present here");
  assert.equal(b.isPlayable({ video: "Media Log/Assets/Video/mac-only.mp4" }, hasFile), false, "file only on another device");
  assert.equal(b.isPlayable({ video: "none" }, hasFile), false);
  assert.equal(b.isPlayable({ embedUrl: "https://x/embed" }, hasFile), false, "an embed is not playable here");
});

test("hashtagsOf / tagsFromCaption: clean, lower-case, deduped, capped, only for untagged items", () => {
  assert.deepEqual(b.hashtagsOf("Frug #lakepowell #fyp #frog"), ["lakepowell", "fyp", "frog"]);
  assert.deepEqual(b.hashtagsOf("#Bench #bench day #squat"), ["bench", "squat"], "case-insensitive dedupe");
  assert.deepEqual(b.hashtagsOf("email me at a#b.com and #real_tag"), ["real_tag"], "a # inside a word is not a tag");
  assert.deepEqual(b.hashtagsOf("#x #1 #ok"), ["ok"], "single characters skipped");
  assert.equal(b.hashtagsOf("#a1 #a2 #a3 #a4 #a5 #a6 #a7 #a8 #a9 #a10").length, 8, "capped at eight");
  assert.deepEqual(b.hashtagsOf(""), []);
  assert.deepEqual(b.tagsFromCaption({ tags: [], caption: "run #legday #gym" }), ["legday", "gym"]);
  assert.deepEqual(b.tagsFromCaption({ tags: ["mine"], caption: "#legday" }), [], "never touches an item that already has tags");
  assert.deepEqual(b.tagsFromCaption(null), []);
});

test("visibleList: playable-here filter and unwatched excluding gone reels", () => {
  const items = [
    { id: "p", platform: "Instagram", tags: [], watched: false, dkey: "2026-09-01", video: "Media Log/Assets/Video/p.mp4" },
    { id: "m", platform: "Instagram", tags: [], watched: false, dkey: "2026-09-01", video: "Media Log/Assets/Video/mac.mp4" },
    { id: "g", platform: "Instagram", tags: [], watched: false, dkey: "2026-09-01", video: "none" },
    { id: "e", platform: "Instagram", tags: [], watched: false, dkey: "2026-09-01", embedUrl: "https://x/embed" },
  ];
  const hasFile = (it) => it.video === "Media Log/Assets/Video/p.mp4";
  assert.deepEqual(b.visibleList(items, { playable: true }, { hasFile }).map((i) => i.id), ["p"]);
  assert.equal(b.visibleList(items, { playable: true }, {}).length, 4, "without a hasFile answer the filter is inert");
  assert.deepEqual(b.visibleList(items, { review: "unwatched" }, {}).map((i) => i.id), ["p", "m", "e"], "gone reels are not 'unwatched'");
  const igGone = { ...items[2], sourceUrl: "https://www.instagram.com/reel/G/", kind: "reel" };
  assert.deepEqual(b.visibleList([items[0], igGone], { review: "unwatched" }, { canStream: true }).map((i) => i.id), ["p", "g"], "a gone reel is unwatched again when it can stream");
  assert.deepEqual(b.visibleList([items[0], igGone], { review: "unwatched" }, { canStream: false }).map((i) => i.id), ["p"]);
});

test("enrichItem: remote preview, kind, dkey, tagsLow, caption slot", () => {
  const item = { id: "ml-20260707-160000-instagram-instagram-reel-x", sourceUrl: "https://www.instagram.com/reel/X/", capturedAt: "", tags: ["Bench"] };
  b.enrichItem(item, { preview_remote: "https://cdn.example.com/t.jpg", kind: "reel" });
  assert.equal(item.previewRemote, "https://cdn.example.com/t.jpg");
  assert.equal(item.kind, "reel");
  assert.equal(item.dkey, "2026-07-07");
  assert.deepEqual(item.tagsLow, ["bench"]);
  assert.equal(item.caption, "");
  const plain = b.enrichItem({ id: "x", sourceUrl: "https://example.com/", capturedAt: "2026-08-07 14:28:00", tags: [] }, {});
  assert.equal(plain.previewRemote, "");
  assert.equal(plain.kind, "link");
  assert.equal(plain.dkey, "2026-08-07");
  const insecure = b.enrichItem({ id: "y", sourceUrl: "", capturedAt: "", tags: [] }, { preview_remote: "http://cdn.example.com/t.jpg" });
  assert.equal(insecure.previewRemote, "", "only https previews are used");
});

// ---- streaming from Instagram ----
const CTX = '{\\"edge_followed_by\\":{\\"count\\":55318}},\\"video_url\\":\\"https:\\\\\\/\\\\\\/scontent-x.cdninstagram.com\\\\\\/o1\\\\\\/v\\\\\\/a.mp4?_nc_cat=109&efg=eyJ2ZW5j%3D%3D&oe=6A9E171E\\",\\"video_view_count\\":1}';
test("extractVideoUrl: the contextJSON form (escaped twice), plain JSON, a bare scan, and nothing", () => {
  assert.equal(b.extractVideoUrl("<html>" + CTX + "</html>"), "https://scontent-x.cdninstagram.com/o1/v/a.mp4?_nc_cat=109&efg=eyJ2ZW5j%3D%3D&oe=6A9E171E");
  assert.equal(b.extractVideoUrl('{"video_url":"https:\\/\\/scontent-y.cdninstagram.com\\/v\\/b.mp4?oe=6A9E171E"}'), "https://scontent-y.cdninstagram.com/v/b.mp4?oe=6A9E171E");
  assert.equal(b.extractVideoUrl('src="https://scontent-z.cdninstagram.com/v/c.mp4?x=1&amp;oe=6A9E171E"'), "https://scontent-z.cdninstagram.com/v/c.mp4?x=1&oe=6A9E171E");
  assert.equal(b.extractVideoUrl("<html>login wall</html>"), "");
  assert.equal(b.extractVideoUrl('"video_url":"http://insecure.example/x.mp4"'), "", "only https");
  assert.equal(b.extractVideoUrl(null), "");
});

test("cdnExpiry: oe= is hex seconds; streamFresh honours the margin and the no-expiry default", () => {
  assert.equal(b.cdnExpiry("https://cdn/x.mp4?a=1&oe=6A9E171E"), 0x6a9e171e * 1000);
  assert.equal(b.cdnExpiry("https://cdn/x.mp4?oe=6A9E171E&z=2"), 0x6a9e171e * 1000);
  assert.equal(b.cdnExpiry("https://cdn/x.mp4?noexpiry=1"), 0);
  assert.equal(b.cdnExpiry(""), 0);
  const exp = 1_000_000_000;
  assert.equal(b.streamFresh({ url: "u", expires: exp }, exp - 11 * 60 * 1000), true);
  assert.equal(b.streamFresh({ url: "u", expires: exp }, exp - 9 * 60 * 1000), false, "inside the ten-minute margin");
  assert.equal(b.streamFresh({ url: "u", expires: exp }, exp - 30_000, 20_000), true, "custom margin");
  assert.equal(b.streamFresh({ url: "u", fetched: 0 }, 5 * 60 * 60 * 1000), true, "no expiry: trusted six hours");
  assert.equal(b.streamFresh({ url: "u", fetched: 0 }, 6 * 60 * 60 * 1000), false);
  assert.equal(b.streamFresh({ expires: exp }, 0), false, "no url");
  assert.equal(b.streamFresh(null, 0), false);
});

test("embedPageFor / isStreamable: the item's embed page, or one derived from the reel code; posts are not streams", () => {
  const withEmbed = { kind: "reel", sourceUrl: "https://www.instagram.com/reel/ABC/", embedUrl: "https://www.instagram.com/reel/ABC/embed/captioned/" };
  assert.equal(b.embedPageFor(withEmbed), "https://www.instagram.com/reel/ABC/embed/captioned/");
  assert.equal(b.embedPageFor({ kind: "reel", sourceUrl: "https://www.instagram.com/reels/D_e-f/?igsh=1" }), "https://www.instagram.com/reel/D_e-f/embed/captioned/");
  assert.equal(b.embedPageFor({ kind: "video", sourceUrl: "https://www.instagram.com/someone/p/XYZ/" }), "https://www.instagram.com/reel/XYZ/embed/captioned/");
  assert.equal(b.embedPageFor({ kind: "reel", sourceUrl: "https://www.youtube.com/watch?v=1", embedUrl: "https://www.youtube.com/embed/1" }), "", "not Instagram");
  assert.equal(b.embedPageFor(null), "");
  assert.equal(b.igCodeOf("https://www.instagram.com/tv/Q1w-e_r/"), "Q1w-e_r");
  assert.equal(b.igCodeOf("https://example.com/reel/ABC/"), "");
  assert.equal(b.isStreamable(withEmbed), true);
  assert.equal(b.isStreamable({ kind: "post", sourceUrl: "https://www.instagram.com/p/ABC/" }), false, "a post is an image");
  assert.equal(b.isStreamable({ kind: "reel", video: "none", sourceUrl: "https://www.instagram.com/reel/ABC/" }), true, "a refused download still streams");
  assert.equal(b.isStreamable({ kind: "link", sourceUrl: "https://example.com/" }), false);
});

test("isPlayable with streaming: the local file wins, a streamable reel counts, a post does not", () => {
  const local = { video: "Media Log/Assets/Video/p.mp4", kind: "reel", sourceUrl: "https://www.instagram.com/reel/P/" };
  const unsynced = { video: "Media Log/Assets/Video/u.mp4", kind: "reel", sourceUrl: "https://www.instagram.com/reel/U/" };
  const refused = { video: "none", kind: "reel", sourceUrl: "https://www.instagram.com/reel/R/" };
  const post = { kind: "post", sourceUrl: "https://www.instagram.com/p/Q/" };
  const hasFile = (it) => it === local;
  assert.equal(b.isPlayable(local, hasFile, false), true);
  assert.equal(b.isPlayable(unsynced, hasFile, false), false);
  assert.equal(b.isPlayable(unsynced, hasFile, true), true);
  assert.equal(b.isPlayable(refused, hasFile, true), true);
  assert.equal(b.isPlayable(refused, hasFile, false), false);
  assert.equal(b.isPlayable(post, hasFile, true), false);
  assert.deepEqual(b.visibleList([local, unsynced, refused, post].map((it, i) => ({ ...it, id: String(i), tags: [] })), { playable: true }, { hasFile: (it) => it.video === local.video, canStream: true }).map((i) => i.id), ["0", "1", "2"]);
  assert.equal(b.visibleList([local, unsynced].map((it, i) => ({ ...it, id: String(i), tags: [] })), { playable: true }, { canStream: true }).length, 2, "streaming alone answers the filter");
});

// ---- capture-time enrichment (mirrors runner/lib/medialog.js) --------------
test("igCaptureMatch: reel/p/tv, reels normalized, a leading username segment, and a miss", () => {
  assert.deepEqual(b.igCaptureMatch("https://www.instagram.com/reel/ABC123/"), { seg: "reel", code: "ABC123", kind: "reel" });
  assert.deepEqual(b.igCaptureMatch("https://www.instagram.com/p/XyZ_9-8/?igsh=1"), { seg: "p", code: "XyZ_9-8", kind: "post" });
  assert.deepEqual(b.igCaptureMatch("https://www.instagram.com/tv/Q1w-e_r/"), { seg: "tv", code: "Q1w-e_r", kind: "video" });
  assert.deepEqual(b.igCaptureMatch("https://www.instagram.com/reels/D_e-f/"), { seg: "reel", code: "D_e-f", kind: "reel" });
  assert.deepEqual(b.igCaptureMatch("https://www.instagram.com/someone/reel/ABC/"), { seg: "reel", code: "ABC", kind: "reel" });
  assert.equal(b.igCaptureMatch("https://www.youtube.com/watch?v=1"), null);
  assert.equal(b.igCaptureMatch(""), null);
});

test("youtubeIdOf: watch, short link, existing embed, and misses", () => {
  assert.equal(b.youtubeIdOf("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(b.youtubeIdOf("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(b.youtubeIdOf("https://youtu.be/dQw4w9WgXcQ?t=5"), "dQw4w9WgXcQ");
  assert.equal(b.youtubeIdOf("https://www.youtube.com/embed/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(b.youtubeIdOf("https://m.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(b.youtubeIdOf("https://www.youtube.com/"), "");
  assert.equal(b.youtubeIdOf("https://example.com/watch?v=1"), "");
  assert.equal(b.youtubeIdOf("not a url"), "");
});

test("captureKindOf / captureEmbedUrl: instagram reel/post/tv and YouTube; everything else is unset", () => {
  assert.equal(b.captureKindOf("https://www.instagram.com/reel/ABC/"), "reel");
  assert.equal(b.captureKindOf("https://www.instagram.com/p/ABC/"), "post");
  assert.equal(b.captureKindOf("https://www.instagram.com/tv/ABC/"), "video");
  assert.equal(b.captureKindOf("https://www.youtube.com/watch?v=1"), "");
  assert.equal(b.captureKindOf("https://example.com/"), "");

  assert.equal(b.captureEmbedUrl("https://www.instagram.com/reel/ABC123/?igsh=1"), "https://www.instagram.com/reel/ABC123/embed/captioned/");
  assert.equal(b.captureEmbedUrl("https://www.instagram.com/p/XyZ9/"), "https://www.instagram.com/p/XyZ9/embed/captioned/");
  assert.equal(b.captureEmbedUrl("https://www.instagram.com/tv/Q1w2/"), "https://www.instagram.com/tv/Q1w2/embed/captioned/");
  assert.equal(b.captureEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "https://www.youtube.com/embed/dQw4w9WgXcQ");
  assert.equal(b.captureEmbedUrl("https://youtu.be/dQw4w9WgXcQ"), "https://www.youtube.com/embed/dQw4w9WgXcQ");
  assert.equal(b.captureEmbedUrl("https://example.com/watch?v=1"), "");
  assert.equal(b.captureEmbedUrl("https://www.tiktok.com/@x/video/1"), "");
});

test("isInstagramLoginWall / captureFallbackTitle: empty, login-wall, and url-echo titles fall back; a real title and non-Instagram urls pass through", () => {
  assert.equal(b.isInstagramLoginWall(""), true);
  assert.equal(b.isInstagramLoginWall("Instagram"), true);
  assert.equal(b.isInstagramLoginWall("Login • Instagram"), true);
  assert.equal(b.isInstagramLoginWall("Log in • Instagram"), true);
  assert.equal(b.isInstagramLoginWall("Just a moment..."), true);
  assert.equal(b.isInstagramLoginWall("A real reel title"), false);

  const reelUrl = "https://www.instagram.com/reel/ABC123/";
  assert.equal(b.captureFallbackTitle(reelUrl, ""), "Instagram Reel ABC123");
  assert.equal(b.captureFallbackTitle(reelUrl, "Log in • Instagram"), "Instagram Reel ABC123");
  assert.equal(b.captureFallbackTitle(reelUrl, "Just a moment..."), "Instagram Reel ABC123");
  assert.equal(b.captureFallbackTitle(reelUrl, reelUrl), "Instagram Reel ABC123", "the modal's own url-as-title fallback also counts as unusable");
  assert.equal(b.captureFallbackTitle(reelUrl, "A great workout tip"), "A great workout tip");
  assert.equal(b.captureFallbackTitle("https://www.instagram.com/p/XyZ9/", ""), "Instagram Post XyZ9");
  assert.equal(b.captureFallbackTitle("https://www.instagram.com/tv/Q1w2/", ""), "Instagram Video Q1w2");
  assert.equal(b.captureFallbackTitle("https://www.youtube.com/watch?v=1", ""), "", "non-Instagram urls pass the title through unchanged");
  assert.equal(b.captureFallbackTitle("https://www.youtube.com/watch?v=1", "How to sharpen a chisel"), "How to sharpen a chisel");
});

test("captureEnrich: one call bundles kind, embed_url, and the resolved title", () => {
  const reel = b.captureEnrich("https://www.instagram.com/reel/ABC123/", "Login • Instagram");
  assert.deepEqual(reel, { kind: "reel", embedUrl: "https://www.instagram.com/reel/ABC123/embed/captioned/", title: "Instagram Reel ABC123" });

  const yt = b.captureEnrich("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "Never Gonna Give You Up");
  assert.deepEqual(yt, { kind: "", embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ", title: "Never Gonna Give You Up" });

  const web = b.captureEnrich("https://example.com/article", "An article");
  assert.deepEqual(web, { kind: "", embedUrl: "", title: "An article" });
});

// ---- phone gestures + tag edits (1.4.0-sifi.9) ----
test("swipeIntent: a vertical flick steps, sideways/short/slow drags do not", () => {
  assert.equal(b.swipeIntent(4, -120, 300), "next", "a long upward drag → next");
  assert.equal(b.swipeIntent(-6, 90, 400), "prev", "a long downward drag → previous");
  assert.equal(b.swipeIntent(0, -30, 40), "next", "a short but quick flick counts (0.75 px/ms)");
  assert.equal(b.swipeIntent(0, -30, 400), "", "a short slow drag is a tap or a wobble");
  assert.equal(b.swipeIntent(0, -10, 5), "", "under 12px is never a swipe, however fast");
  assert.equal(b.swipeIntent(140, -100, 200), "", "sideways beats vertical → a native scrub, not a step");
  assert.equal(b.swipeIntent(80, -100, 200), "next", "mostly vertical still steps");
  assert.equal(b.swipeIntent(0, -50, 300, { minPx: 40 }), "next", "threshold is tunable");
  assert.equal(b.swipeIntent(NaN, undefined, 0), "", "garbage in → no step");
});

test("normalizeTag / hasTag / toggleTag: hashes and whitespace stripped, case-insensitive toggle, typed casing kept", () => {
  assert.equal(b.normalizeTag("  #Bench  press "), "Bench press");
  assert.equal(b.normalizeTag("##x"), "x");
  assert.equal(b.normalizeTag("#"), "");
  assert.equal(b.normalizeTag(null), "");
  assert.equal(b.hasTag(["Bench", "Meme"], "#bench"), true);
  assert.equal(b.hasTag(["Bench"], "press"), false);
  assert.equal(b.hasTag([], ""), false);
  const one = b.toggleTag([], "#Bench");
  assert.deepEqual(one, ["Bench"], "absent → appended without the hash");
  const two = b.toggleTag(one, "meme");
  assert.deepEqual(two, ["Bench", "meme"], "order kept, typed casing kept");
  assert.deepEqual(b.toggleTag(two, "BENCH"), ["meme"], "present (any casing) → removed");
  assert.deepEqual(b.toggleTag(two, "   "), ["Bench", "meme"], "blank changes nothing");
  assert.deepEqual(b.toggleTag(["Bench", null, "undefined"], "x"), ["Bench", "x"], "ghost entries are dropped on the way through");
  assert.deepEqual(two, ["Bench", "meme"], "the input list is never mutated");
});

test("orderTags / pushRecent: recently used tags lead, the rest keep count order; recent list is capped and deduped", () => {
  const uni = b.tagUniverse([{ tags: ["Bench"] }, { tags: ["Bench", "Meme"] }, { tags: ["Church"] }, { tags: ["gym"] }]);
  assert.deepEqual(uni.map((u) => u.label), ["Bench", "Church", "gym", "Meme"], "count desc, alpha ties on the lowercase key");
  assert.deepEqual(b.orderTags(uni, ["gym", "meme"]).map((u) => u.label), ["gym", "Meme", "Bench", "Church"], "recent first, in recent order, case-insensitive");
  assert.deepEqual(b.orderTags(uni, []).map((u) => u.label), ["Bench", "Church", "gym", "Meme"], "no recents → unchanged");
  assert.deepEqual(b.orderTags(uni, ["nope"]).map((u) => u.label), ["Bench", "Church", "gym", "Meme"], "a recent tag no longer in the library changes nothing");
  let r = b.pushRecent([], "#Bench");
  assert.deepEqual(r, ["Bench"]);
  r = b.pushRecent(r, "Meme");
  assert.deepEqual(r, ["Meme", "Bench"], "newest first");
  r = b.pushRecent(r, "bench");
  assert.deepEqual(r, ["bench", "Meme"], "re-use moves it to the front, one copy");
  assert.deepEqual(b.pushRecent(["a", "b", "c"], "d", 3), ["d", "a", "b"], "capped");
  assert.deepEqual(b.pushRecent(["a"], "  "), ["a"], "blank changes nothing");
});
