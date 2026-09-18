const API = {
  anyshortHome: "anyshort/home.php?lang=ar",
  anyshortBrowse: "anyshort/browse.php?lang=ar&limit=24",
  anyshortSearch: "anyshort/search.php?lang=ar&q=",
  anyshortTitle: "anyshort/title.php?lang=ar&id=",
  anyshortEpisodes: "anyshort/episodes.php?lang=ar&id=",
  anyshortPlay: "anyshort/play.php?lang=ar&eid="
};

const state = {
  catalog: [], items: [], shown: [], activeFilter: "all", query: "", selected: null, detail: null,
  page: 1, maxPages: 1, pageSize: 24, pageCursors: [null], loadedPages: new Map(),
  prefetchingPages: new Set(),
  reels: [], reelsItem: null, reelHls: new Map(), reelMuted: true,
  reelSources: new Map()
};
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));

async function getJson(url, timeout = 14000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store", headers: { Accept: "application/json", "Cache-Control": "no-cache" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function unwrapArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  if (payload.data && Array.isArray(payload.data.rails)) {
    return payload.data.rails.flatMap((rail) => unwrapArray(rail.items));
  }
  for (const key of ["series", "titles", "items", "results", "shows", "data"]) {
    if (Array.isArray(payload[key])) return payload[key];
    if (payload[key] && typeof payload[key] === "object") {
      const nested = unwrapArray(payload[key]);
      if (nested.length) return nested;
    }
  }
  return [];
}

function normalizeItem(raw, source) {
  const title = raw.title || raw.name || raw.original_title || raw.series_name || raw.label || "عمل بدون عنوان";
  const url = raw.url || raw.link || raw.slug || raw.canonical_url || "";
  const id = raw.id ?? raw.title_id ?? raw.series_id ?? raw.post_id ?? url;
  const tags = Array.isArray(raw.tags) ? raw.tags : (raw.genres || raw.categories || []);
  return {
    ...raw, source, id: String(id), title: String(title), url: String(url),
    poster: raw.poster || raw.cover_url || raw.image || raw.poster_url || raw.thumbnail || raw.cover || "",
    description: raw.description || raw.summary || raw.excerpt || "",
    platform: raw.platform || raw.source || raw.network || "AnyShort",
    language: raw.language || raw.primary_language || raw.lang || "",
    episodes: raw.episodes_count || raw.total_episodes || raw.episode_count || (typeof raw.episodes === "number" ? raw.episodes : null),
    tags: tags.map((tag) => typeof tag === "string" ? tag : tag.name).filter(Boolean)
  };
}

function posterMarkup(item, className = "") {
  if (item.poster) return `<img class="${className}" src="${escapeHtml(item.poster)}" alt="${escapeHtml(item.title)}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'poster-placeholder',textContent:'ش'}))">`;
  return `<div class="poster-placeholder ${className}">ش</div>`;
}

function renderOnshortPreview(sections) {
  const grid = $("#onshortPreviewGrid");
  if (!grid) return;
  const items = sections.flatMap((section) => section.items || [])
    .filter((item) => !/idrama/i.test(`${item?.title || ""} ${item?.platform || ""} ${item?.source || ""}`))
    .slice(0, 4)
    .map((raw) => {
      const normalized = normalizeItem(raw, "onshort");
      normalized._key = `onshort:${normalized.id}:${normalized.title}`;
      return normalized;
    });
  if (!items.length) {
    grid.innerHTML = '<div class="onshort-preview-empty">لا توجد أعمال متاحة من ONShort حالياً.</div>';
    return;
  }
  grid.innerHTML = items.map((item) => `
    <article class="series-card onshort-series-card" data-key="${escapeHtml(item._key)}" role="button" tabindex="0" aria-label="${escapeHtml(item.title)}">
      <div class="series-poster">
          ${posterMarkup(item)}
          <span class="card-badge">${escapeHtml(item.platform || "ONShort")}</span>
          <span class="card-play"><svg viewBox="0 0 24 24"><path d="m8 5 11 7-11 7V5Z"/></svg></span>
        </div>
        <h3 title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</h3>
        <div class="card-sub"><span>${escapeHtml(item.format || item.platform || "ONShort")}</span><i></i><span>${item.episodes ? `${item.episodes} حلقة` : "مسلسل"}</span></div>
    </article>`).join("");
  state.onshortPreview = items;
  grid.querySelectorAll(".onshort-series-card").forEach((card) => {
    const open = () => {
      const item = state.onshortPreview.find((entry) => entry._key === card.dataset.key);
      if (item) openReels(item);
    };
    card.addEventListener("click", open);
    card.addEventListener("keydown", (event) => { if (event.key === "Enter") open(); });
  });
}

async function loadOnshortPreview() {
  const grid = $("#onshortPreviewGrid");
  if (!grid) return;
  try {
    const result = await getJson("onshort/home.php");
    renderOnshortPreview(result.sections || []);
  } catch (error) {
    grid.innerHTML = `<div class="onshort-preview-empty">تعذر تحميل ONShort حالياً.</div>`;
  }
}

function renderCards() {
  const grid = $("#seriesGrid");
  const items = state.shown;
  $("#resultCount").textContent = items.length ? `${items.length} عمل` : "";
  if (!items.length) {
    grid.innerHTML = "";
    $("#emptyState").classList.remove("hidden");
    return;
  }
  $("#emptyState").classList.add("hidden");
  grid.innerHTML = items.map((item, index) => `
    <article class="series-card" data-id="${escapeHtml(item._key)}" style="animation-delay:${Math.min(index * 45, 300)}ms">
      <div class="series-poster">
        ${posterMarkup(item)}
        <span class="card-badge">${escapeHtml(item.platform || "AnyShort")}</span>
        <span class="card-play"><svg viewBox="0 0 24 24"><path d="m8 5 11 7-11 7V5Z"/></svg></span>
      </div>
      <h3 title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</h3>
      <div class="card-sub"><span>${escapeHtml(item.language || "عربي")}</span><i></i><span>${item.episodes ? `${item.episodes} حلقة` : "مسلسل"}</span></div>
    </article>
  `).join("");
  grid.querySelectorAll(".series-card").forEach((card) => card.addEventListener("click", () => {
    const item = state.items.find((entry) => entry._key === card.dataset.id);
    if (item) openReels(item);
  }));
}

function applyFilters() {
  const q = state.query.trim().toLowerCase();
  state.shown = state.items.filter((item) => {
    const matchesQuery = !q || [item.title, item.description, item.platform, ...item.tags].join(" ").toLowerCase().includes(q);
    const matchesFilter = state.activeFilter === "all" || [item.title, item.platform, item.language, ...item.tags].join(" ").toLowerCase().includes(state.activeFilter.toLowerCase());
    return matchesQuery && matchesFilter;
  });
  renderCards();
}

function setHero(item) {
  if (!item) return;
  $("#heroTitle").innerHTML = `${escapeHtml(item.title)}<br><em>يستحق المشاهدة.</em>`;
  $("#heroDescription").textContent = item.description || "تعرّف على قصة جديدة واستمتع بتفاصيلها من خلال مكتبة شاشة.";
  $("#heroSource").textContent = item.platform || "AnyShort";
  $("#heroArt").querySelectorAll("img,.poster-placeholder").forEach((node) => node.remove());
  const node = item.poster ? Object.assign(document.createElement("img"), { src: item.poster, alt: item.title }) : Object.assign(document.createElement("div"), { className: "poster-placeholder hero-poster-placeholder", textContent: "ش" });
  if (item.poster) { node.className = "hero-poster"; node.onerror = () => { node.replaceWith(Object.assign(document.createElement("div"), { className: "poster-placeholder hero-poster-placeholder", textContent: "ش" })); }; }
  $("#heroArt").prepend(node);
  $("#heroAction").onclick = () => openReels(item);
}

async function loadCatalog() {
  state.catalog = [];
  state.pageCursors = [null, null];
  state.loadedPages = new Map();
  state.maxPages = 1;
  return loadPage(1, true);
}

function setCatalogLoading() {
  $("#seriesGrid").innerHTML = '<div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div>';
  $("#emptyState").classList.add("hidden");
  $("#pagination").classList.add("hidden");
}

async function prefetchPage(page) {
  if (page < 2 || page > state.maxPages + 1) return;
  if (state.loadedPages.has(page) || state.prefetchingPages.has(page)) return;
  if (page > 1 && !state.pageCursors[page]) return;
  state.prefetchingPages.add(page);
  try {
    const cursor = state.pageCursors[page];
    const browseUrl = `${API.anyshortBrowse}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const result = await getJson(browseUrl);
    const seen = new Set();
    const pageItems = unwrapArray(result).map((item) => normalizeItem(item, "anyshort")).filter((item) => {
      const key = `${item.source}:${item.id}:${item.title}`;
      if (seen.has(key)) return false;
      seen.add(key); item._key = key; return true;
    });
    state.loadedPages.set(page, pageItems);
    const nextCursor = result.page && result.page.next;
    state.pageCursors[page + 1] = nextCursor || null;
    if (nextCursor) state.maxPages = Math.max(state.maxPages, page + 1);
  } catch (_) { /* التحميل المسبق للصفحة اختياري */ }
  finally { state.prefetchingPages.delete(page); }
}

async function loadPage(page = 1, force = false) {
  if (page < 1) return;
  if (!force && state.loadedPages.has(page)) {
    renderCatalogPage(page);
    return;
  }
  if (page > 1 && !state.pageCursors[page]) return;

  setCatalogLoading();
  $("#connectionState").innerHTML = "<i></i> جاري الاتصال بالمصادر...";
  const cursor = state.pageCursors[page];
  const browseUrl = `${API.anyshortBrowse}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
  const requests = [getJson(browseUrl)];
  const responses = await Promise.allSettled(requests);
  const combined = [];
  responses.forEach((result, index) => {
    if (result.status === "fulfilled") {
      const source = "anyshort";
      unwrapArray(result.value).forEach((item) => combined.push(normalizeItem(item, source)));
      if (source === "anyshort") {
        const nextCursor = result.value.page && result.value.page.next;
        state.pageCursors[page + 1] = nextCursor || null;
        state.maxPages = nextCursor ? page + 1 : page;
      }
    }
  });
  const seen = new Set();
  const pageItems = combined.filter((item) => {
    const key = `${item.source}:${item.id}:${item.title}`;
    if (seen.has(key)) return false;
    seen.add(key); item._key = key; return true;
  });
  state.loadedPages.set(page, pageItems);
  state.catalog = [...state.catalog, ...pageItems.filter((item) => !state.catalog.some((existing) => existing._key === item._key))];
  renderCatalogPage(page);
  prefetchPage(page + 1);
  const connection = $("#connectionState");
  connection.classList.toggle("online", state.items.length > 0);
  connection.innerHTML = state.items.length ? `<i></i> متصل — ${state.items.length} عمل في الصفحة` : "<i></i> تعذر جلب المحتوى حالياً";
}

function renderCatalogPage(page = 1) {
  state.page = Math.max(1, page);
  state.items = state.loadedPages.get(state.page) || [];
  state.shown = state.items;
  if (state.items[0]) setHero(state.items[0]);
  $("#catalogTitle").textContent = state.page > 1 ? `أعمال الصفحة ${state.page}` : "الأكثر مشاهدة الآن";
  applyFilters();
  renderPagination();
}

function renderPagination() {
  const pagination = $("#pagination");
  if (state.maxPages <= 1) { pagination.classList.add("hidden"); return; }
  pagination.classList.remove("hidden");
  $("#prevPage").disabled = state.page <= 1;
  $("#nextPage").disabled = state.page >= state.maxPages;
  $("#pageStatus").textContent = `صفحة ${state.page}`;
  const pages = [];
  const add = (value) => { if (!pages.includes(value)) pages.push(value); };
  add(1);
  for (let number = Math.max(2, state.page - 2); number <= Math.min(state.maxPages - 1, state.page + 2); number += 1) add(number);
  if (state.maxPages > 1) add(state.maxPages);
  $("#pageNumbers").innerHTML = pages.map((number, index) => {
    const previous = pages[index - 1];
    const gap = previous && number - previous > 1 ? '<span class="page-gap">…</span>' : "";
    return `${gap}<button class="page-number ${number === state.page ? "active" : ""}" data-page="${number}">${number}</button>`;
  }).join("");
  $("#pageNumbers").querySelectorAll(".page-number").forEach((button) => button.addEventListener("click", () => loadPage(Number(button.dataset.page))));
}

async function searchCatalog(query) {
  state.query = query;
  if (!query) return applyFilters();
  const localMatches = state.items.filter((item) => item.title.toLowerCase().includes(query.toLowerCase()));
  if (localMatches.length >= 2 || state.activeFilter !== "all") return applyFilters();
  try {
    const result = await getJson(API.anyshortSearch + encodeURIComponent(query));
    unwrapArray(result).forEach((item) => {
      const normalized = normalizeItem(item, "anyshort");
      normalized._key = `anyshort:${normalized.id}:${normalized.title}`;
      if (!state.items.some((existing) => existing._key === normalized._key)) state.items.push(normalized);
    });
  } catch (_) { /* local filtering remains useful when a source is unavailable */ }
  applyFilters();
}

function openModal(id) {
  const modal = $(`#${id}`);
  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}
function closeModal(id) {
  $(`#${id}`).classList.add("hidden");
  if (!document.querySelector(".modal-backdrop:not(.hidden)")) document.body.style.overflow = "";
  if (id === "playerModal") {
    destroyOnshortHls();
    onshortPlayer.currentTime = 0;
    document.querySelector("#onshortPlayerControls")?.remove();
    $("#playerWrap").innerHTML = '<div class="player-placeholder">اختر حلقة لبدء المشاهدة</div>';
  }
}

async function openDetails(key) {
  const item = state.items.find((entry) => entry._key === key);
  if (!item) return;
  if (item.source === "onshort") return openOnshortDetails(item.id);
  state.selected = item;
  $("#detailTitle").textContent = item.title;
  $("#detailDescription").textContent = item.description || "لا يوجد وصف متاح لهذا العمل.";
  $("#detailSource").textContent = item.platform || "تفاصيل العمل";
  $("#detailCover").innerHTML = posterMarkup(item);
  $("#detailFacts").innerHTML = [item.language, item.episodes ? `${item.episodes} حلقة` : "", item.platform].filter(Boolean).map((fact) => `<span class="fact">${escapeHtml(fact)}</span>`).join("");
  $("#episodes").innerHTML = '<span class="muted">جاري تحميل الحلقات...</span>';
  $("#episodeCount").textContent = "";
  openModal("detailModal");
  try {
    const detail = await getJson(API.anyshortEpisodes + encodeURIComponent(item.id));
    state.detail = detail;
    const episodes = unwrapArray(detail);
    renderEpisodes(episodes);
  } catch (error) {
    $("#episodes").innerHTML = `<span class="muted">تعذر تحميل الحلقات حالياً. ${escapeHtml(error.message)}</span>`;
  }
}

function renderEpisodes(episodes) {
  if (!episodes.length) {
    $("#episodes").innerHTML = '<span class="muted">لا توجد حلقات متاحة لهذا العمل.</span>';
    return;
  }
  $("#episodeCount").textContent = `${episodes.length} حلقة`;
  $("#episodes").innerHTML = episodes.map((episode, index) => {
    const number = episode.ep ?? episode.episode ?? episode.number ?? (index + 1);
    const key = encodeURIComponent(JSON.stringify({ ...episode, number }));
    return `<button class="episode-button" data-episode="${key}">الحلقة ${escapeHtml(number)}</button>`;
  }).join("");
  $("#episodes").querySelectorAll(".episode-button").forEach((button) => button.addEventListener("click", () => playEpisode(JSON.parse(decodeURIComponent(button.dataset.episode)))));
}

function getEpisodeSource(episode) {
  return episode.hls_url || episode.url || episode.video || episode.src || episode.m3u8 || "";
}

function createHlsVideo(video, source, startAt = 0) {
  if (!source) return null;
  const isHls = /\.m3u8(?:$|[?#])/i.test(source) || /\.m3u8(?:$|[?#])/i.test(decodeURIComponent(source));
  const onReady = () => {
    if (startAt) video.currentTime = Number(startAt);
    video.play().catch(() => {});
  };
  if (isHls && video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = source;
    video.addEventListener("loadedmetadata", onReady, { once: true });
    return null;
  }
  if (isHls && window.Hls && Hls.isSupported()) {
    const hls = new Hls({ enableWorker: true, lowLatencyMode: true, maxBufferLength: 30, backBufferLength: 30 });
    hls.loadSource(source);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, onReady);
    return hls;
  }
  video.src = source;
  video.addEventListener("loadedmetadata", onReady, { once: true });
  return null;
}

function getPlayableSources(data) {
  const selected = data?.selected || {};
  const streams = Array.isArray(data?.streams) ? data.streams : [];
  const candidates = [selected, ...streams]
    .filter((stream) => stream && stream.url)
    .filter((stream) => !stream.codec || /h264|avc/i.test(stream.codec))
    .filter((stream) => /^(mp4|hls)$/i.test(stream.protocol || "") || /\.m3u8(?:$|\?)/i.test(stream.url));
  const fallback = candidates.length ? candidates : [selected, ...streams].filter((stream) => stream && stream.url);
  return [...new Map(fallback.map((stream) => [stream.url, stream.url])).values()];
}

function proxyVideoSource(source) {
  if (!source || !/^https?:\/\//i.test(source)) return source;
  return `anyshort/stream.php?url=${encodeURIComponent(source)}`;
}

function attachReelSource(video, source, startAt = 0) {
  return new Promise((resolve, reject) => {
    let hls = null;
    let settled = false;
    const isHls = /\.m3u8(?:$|[?#])/i.test(source) || /\.m3u8(?:$|[?#])/i.test(decodeURIComponent(source));
    // Some MP4 files keep their metadata at the end of the file and need
    // longer than a normal API request before the browser can start them.
    const timeout = setTimeout(() => fail(new Error("انتهت مهلة تحميل الفيديو")), 15000);
    const cleanup = () => {
      clearTimeout(timeout);
      video.removeEventListener("loadedmetadata", ready);
      video.removeEventListener("canplay", ready);
      video.removeEventListener("error", fail);
    };
    const ready = () => {
      if (settled) return;
      settled = true;
      cleanup();
      if (startAt) video.currentTime = Number(startAt);
      video.play().catch(() => {});
      resolve(hls);
    };
    const fail = (reason = new Error("تعذر تحميل مصدر الفيديو")) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (hls) hls.destroy();
      reject(reason);
    };
    video.addEventListener("loadedmetadata", ready, { once: true });
    video.addEventListener("canplay", ready, { once: true });
    video.addEventListener("error", fail, { once: true });
    video.muted = state.reelMuted;
    video.volume = 1;
    if (isHls && video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = source;
      video.load();
      return;
    }
    if (isHls && window.Hls && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, lowLatencyMode: true, maxBufferLength: 30, backBufferLength: 30 });
      hls.loadSource(source);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, ready);
      hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) fail(); });
      return;
    }
    video.src = source;
    video.load();
  });
}

function setReelStatus(slide, message, visible = true) {
  const status = slide?.querySelector("[data-reel-status]");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("hidden", !visible);
}

function closeReels() {
  state.reelHls.forEach((hls) => hls && hls.destroy());
  state.reelHls.clear();
  closeEpisodePicker();
  $("#reelsFeed").innerHTML = "";
  $("#reelsView").classList.add("hidden");
  document.body.style.overflow = "";
}

async function openReels(item = state.items[0]) {
  if (!item) return;
  state.reelsItem = item;
  state.reelSources.clear();
  $("#reelsView").classList.remove("hidden");
  document.body.style.overflow = "hidden";
  $("#reelsFeed").innerHTML = '<div class="reels-loading"><span class="spinner"></span><p>جاري تحضير المقاطع...</p></div>';
  try {
    let episodes;
    let detail = {};
    if (item.source === "onshort") {
      // The card already told us the episode count — no separate "fetch the
      // episode list" step needed, so we go straight into the reels feed.
      const total = Math.max(1, Number(item.episodes) || 1);
      episodes = Array.from({ length: total }, (_, i) => ({ number: i + 1 }));
    } else {
      detail = await getJson(API.anyshortEpisodes + encodeURIComponent(item.id));
      episodes = unwrapArray(detail);
    }
    state.reels = episodes;
    renderReels(episodes, detail);
  } catch (error) {
    $("#reelsFeed").innerHTML = `<div class="reels-loading"><strong>تعذر تحميل المقاطع</strong><p>${escapeHtml(error.message)}</p></div>`;
  }
}

function renderReels(episodes, detail) {
  if (!episodes.length) {
    $("#reelsFeed").innerHTML = '<div class="reels-loading"><strong>لا توجد حلقات لهذا العمل</strong><p>جرّب عملاً آخر من المكتبة.</p></div>';
    return;
  }
  const fullVideo = detail?.servers?.full_video?.m3u8 || "";
  $("#reelsFeed").innerHTML = episodes.map((episode, index) => {
    const number = episode.ep ?? episode.episode ?? episode.number ?? index + 1;
    const source = fullVideo;
    const poster = state.reelsItem.poster || "";
    return `
      <article class="reel-slide" data-index="${index}" data-source="${escapeHtml(source)}" data-start="${escapeHtml(episode.start_seconds || 0)}">
        <div class="reel-media">
          <div class="reel-poster">${poster ? `<img src="${escapeHtml(poster)}" alt="">` : "ش"}</div>
          <video class="reel-video" playsinline muted loop preload="${index === 0 ? "auto" : "metadata"}" ${poster ? `poster="${escapeHtml(poster)}"` : ""}></video>
          <div class="reel-status" data-reel-status>جاري تحميل الفيديو...</div>
          <div class="reel-shade"></div>
        </div>
        <button class="reel-sound" data-sound="${index}" aria-label="تشغيل الصوت">🔇</button>
        <div class="reel-top-title"><span>EP${String(number).padStart(2, "0")}</span><small>${escapeHtml(state.reelsItem.platform || "شاشة")}</small></div>
        <div class="reel-side-actions">
          <button class="reel-action" data-like="${index}" aria-label="إعجاب"><span>♥</span><small>إعجاب</small></button>
          <button class="reel-action" data-share="${index}" aria-label="مشاركة"><span>↗</span><small>مشاركة</small></button>
          <button class="reel-action" data-open-detail="${index}" aria-label="التفاصيل"><span>▱</span><small>التفاصيل</small></button>
        </div>
        <div class="reel-caption">
          <strong>${escapeHtml(state.reelsItem.title)}</strong>
          <p>${escapeHtml(state.reelsItem.description || `الحلقة ${number} من ${state.reelsItem.title}`)}</p>
          <div class="reel-progress"><i></i></div>
        </div>
        <div class="reel-episode-bar">
          <button class="reel-episode-trigger" data-episode-picker="${index}" aria-expanded="false">
            <strong>EP${String(number).padStart(2, "0")}</strong>
            <span>/ EP${String(episodes.length).padStart(2, "0")}</span>
            <b>⌃</b>
          </button>
        </div>
      </article>`;
  }).join("");
  const slides = [...document.querySelectorAll(".reel-slide")];
  slides.forEach((slide, index) => {
    const video = slide.querySelector(".reel-video");
    const toggleSound = () => {
      video.muted = !video.muted;
      state.reelMuted = video.muted;
      const soundButton = slide.querySelector("[data-sound]");
      soundButton.textContent = video.muted ? "🔇" : "🔊";
      soundButton.setAttribute("aria-label", video.muted ? "تشغيل الصوت" : "كتم الصوت");
    };
    slide.querySelector("[data-sound]").addEventListener("click", (event) => {
      event.stopPropagation();
      toggleSound();
    });
    video.addEventListener("click", toggleSound);
    slide.querySelector("[data-like]").addEventListener("click", (event) => event.currentTarget.classList.toggle("liked"));
    slide.querySelector("[data-share]").addEventListener("click", () => navigator.share ? navigator.share({ title: state.reelsItem.title, text: "شاهد هذا المقطع على شاشة" }).catch(() => {}) : navigator.clipboard?.writeText(location.href));
    slide.querySelector("[data-open-detail]").addEventListener("click", () => { closeReels(); openDetails(state.reelsItem._key); });
    slide.querySelector("[data-episode-picker]").addEventListener("click", (event) => {
      event.stopPropagation();
      openEpisodePicker(index);
    });
  });
  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
    const video = entry.target.querySelector(".reel-video");
    if (entry.isIntersecting) loadReelVideo(Number(entry.target.dataset.index)).then(() => video.play().catch(() => {}));
    else { video.pause(); video.currentTime = 0; }
  }), { root: $("#reelsFeed"), threshold: .7 });
  slides.forEach((slide) => observer.observe(slide));
  loadReelVideo(0);
}

async function resolveReelSource(episode, index = null) {
  if (index !== null && state.reelSources.has(index)) return state.reelSources.get(index);
  let result = { sources: [], subtitles: [] };
  if (state.reelsItem?.source === "onshort") {
    try {
      const number = episode.number ?? episode.ep ?? episode.episode ?? 1;
      const data = await getJson(`onshort/play.php?post=${encodeURIComponent(state.reelsItem.id)}&ep=${encodeURIComponent(number)}`);
      if (data?.url) result = { sources: [data.url], subtitles: data.subtitles || [] };
    } catch (_) {
      // fall through with empty sources — loadReelVideo shows the "couldn't play" status
    }
  } else {
    const episodeId = episode.id || episode.eid || episode.episode_id;
    if (episodeId) {
      try {
        const apiResult = await getJson(`${API.anyshortPlay}${encodeURIComponent(episodeId)}&with_sub=1`);
        const data = apiResult.data || apiResult;
        const sources = getPlayableSources(data);
        if (sources.length) result = { sources, subtitles: data.subtitles || [] };
      } catch (_) {
        // Fall back to a direct URL when the play endpoint is temporarily unavailable.
      }
    }
    if (!result.sources.length) {
      const direct = getEpisodeSource(episode);
      if (direct) result = { sources: [direct], subtitles: [] };
    }
  }
  if (index !== null && result.sources.length) state.reelSources.set(index, result);
  return result;
}

function preloadNextReel(index) {
  const next = index + 1;
  const episode = state.reels[next];
  if (!episode || state.reelSources.has(next)) return;
  const slide = document.querySelector(`.reel-slide[data-index="${next}"]`);
  if (!slide || slide.dataset.loaded === "true") return;
  resolveReelSource(episode, next).catch(() => {});
}

async function loadReelVideo(index) {
  const slide = document.querySelector(`.reel-slide[data-index="${index}"]`);
  const episode = state.reels[index];
  if (!slide || !episode || slide.dataset.loaded === "true") return;
  if (slide.dataset.loaded === "loading") {
    while (slide.dataset.loaded === "loading") await new Promise((resolve) => setTimeout(resolve, 40));
    return;
  }
  slide.dataset.loaded = "loading";
  const video = slide.querySelector(".reel-video");
  setReelStatus(slide, "جاري تحميل الفيديو...");
  const { sources, subtitles } = await resolveReelSource(episode);
  let loaded = false;
  for (const source of sources) {
    try {
      video.removeAttribute("src");
      video.querySelectorAll("track").forEach((track) => track.remove());
      video.load();
      const hls = await attachReelSource(video, proxyVideoSource(source), slide.dataset.start);
      if (hls) state.reelHls.set(index, hls);
      slide.dataset.source = proxyVideoSource(source);
      (subtitles || []).forEach((sub) => {
        if (!sub?.url) return;
        const track = document.createElement("track");
        track.kind = "subtitles";
        track.label = sub.label || sub.lang || "الترجمة";
        track.srclang = String(sub.lang || "ar").split("_")[0];
        track.src = sub.url;
        track.default = /^ar/i.test(track.srclang);
        video.appendChild(track);
      });
      loaded = true;
      break;
    } catch (_) {
      video.removeAttribute("src");
      video.load();
    }
  }
  if (!loaded) {
    video.setAttribute("aria-label", "لا يوجد رابط تشغيل صالح لهذه الحلقة");
    setReelStatus(slide, sources.length ? "تعذر تشغيل هذه الحلقة. جرّب الحلقة التالية." : "لا يوجد رابط تشغيل متاح لهذه الحلقة.");
  } else {
    setReelStatus(slide, "", false);
  }
  slide.dataset.loaded = "true";
  preloadNextReel(index);
}

function closeEpisodePicker() {
  $("#reelEpisodePicker").classList.add("hidden");
  document.querySelectorAll("[data-episode-picker]").forEach((button) => button.setAttribute("aria-expanded", "false"));
}

function openEpisodePicker(activeIndex) {
  const picker = $("#reelEpisodePicker");
  const options = $("#reelEpisodeOptions");
  $("#reelEpisodePickerCount").textContent = `${state.reels.length} حلقة`;
  options.innerHTML = state.reels.map((episode, index) => {
    const number = episode.ep ?? episode.episode ?? episode.number ?? index + 1;
    return `<button class="${index === activeIndex ? "active" : ""}" data-picker-index="${index}">EP${String(number).padStart(2, "0")}</button>`;
  }).join("");
  options.querySelectorAll("[data-picker-index]").forEach((button) => button.addEventListener("click", () => {
    document.querySelector(`.reel-slide[data-index="${button.dataset.pickerIndex}"]`)?.scrollIntoView({ behavior: "smooth" });
    closeEpisodePicker();
  }));
  picker.classList.remove("hidden");
  document.querySelector(`[data-episode-picker="${activeIndex}"]`)?.setAttribute("aria-expanded", "true");
}

async function playEpisode(episode) {
  const item = state.selected;
  if (!item) return;
  let source = getEpisodeSource(episode);
  if (item.source === "anyshort" && (episode.id || episode.eid || episode.episode_id)) {
    try {
      const result = await getJson(API.anyshortPlay + encodeURIComponent(episode.id || episode.eid || episode.episode_id));
      const data = result.data || result;
      source = data.url || data.video_url || data.hls_url || data.m3u8 || data.embed || source;
    } catch (_) { /* show an external fallback if the source returned a direct URL */ }
  }
  const embed = episode.embed || (state.detail && state.detail.servers && state.detail.servers.full_video && state.detail.servers.full_video.embed);
  $("#playerTitle").textContent = `${item.title} — الحلقة ${episode.number || episode.ep || ""}`;
  $("#playerWrap").innerHTML = source ? '<video id="mainVideo" controls autoplay playsinline></video>' : (embed ? `<iframe src="${escapeHtml(embed)}" allow="autoplay; fullscreen" allowfullscreen></iframe>` : '<div class="player-placeholder">لا يوجد رابط تشغيل متاح لهذه الحلقة.</div>');
   if (source) createHlsVideo($("#mainVideo"), proxyVideoSource(source));
  const link = $("#externalPlayerLink");
  if (source || embed) { link.href = source || embed; link.classList.remove("hidden"); } else link.classList.add("hidden");
  openModal("playerModal");
}

document.addEventListener("DOMContentLoaded", () => {
  $("#year").textContent = new Date().getFullYear();
  $("#searchForm").addEventListener("submit", (event) => { event.preventDefault(); searchCatalog($("#searchInput").value); });
  $("#searchInput").addEventListener("input", (event) => { if (!event.target.value) searchCatalog(""); });
  document.querySelectorAll(".filter-chip").forEach((chip) => chip.addEventListener("click", () => {
    document.querySelectorAll(".filter-chip").forEach((button) => button.classList.remove("active"));
    chip.classList.add("active"); state.activeFilter = chip.dataset.filter; applyFilters();
  }));
  $("[data-close='detailModal']").addEventListener("click", () => closeModal("detailModal"));
  $("[data-close='playerModal']").addEventListener("click", () => closeModal("playerModal"));
  document.querySelectorAll(".modal-backdrop").forEach((modal) => modal.addEventListener("click", (event) => { if (event.target === modal) closeModal(modal.id); }));
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") document.querySelectorAll(".modal-backdrop:not(.hidden)").forEach((modal) => closeModal(modal.id)); });
  $("#prevPage").addEventListener("click", () => { if (state.page > 1) loadPage(state.page - 1); });
  $("#nextPage").addEventListener("click", () => { if (state.page < state.maxPages) loadPage(state.page + 1); });
  $("#refreshButton").addEventListener("click", loadCatalog);
  $("#reelsNav").addEventListener("click", (event) => { event.preventDefault(); openReels(); });
  $("#closeReels").addEventListener("click", closeReels);
  $("#closeReelEpisodePicker").addEventListener("click", closeEpisodePicker);
  $("#reelEpisodePicker").addEventListener("click", (event) => { if (event.target.id === "reelEpisodePicker") closeEpisodePicker(); });
  window.addEventListener("hashchange", () => { if (location.hash === "#reels") openReels(); });
  loadCatalog().then(() => {
    if (location.hash === "#reels") openReels();
  });
  loadOnshortPreview();
});
/* ---- ONShort: تفاصيل + مشغّل داخلي داخل الصفحة الرئيسية ---- */

const ONSHORT_API = "onshort/api.php";
const onshortPlayer = { post: null, ep: null, title: "", episodes: [], hls: null, currentTime: 0, subtitleIndex: -1 };

function destroyOnshortHls() {
  if (onshortPlayer.hls) {
    try { onshortPlayer.hls.destroy(); } catch (_) { /* already destroyed */ }
    onshortPlayer.hls = null;
  }
}

async function openOnshortDetails(post) {
  if (!post) return;
  onshortPlayer.post = post;
  onshortPlayer.episodes = [];
  $("#detailTitle").textContent = "جاري التحميل...";
  $("#detailDescription").textContent = "";
  $("#detailSource").textContent = "ONShort";
  $("#detailCover").innerHTML = '<div class="poster-placeholder">ش</div>';
  $("#detailFacts").innerHTML = "";
  $("#episodes").innerHTML = '<span class="muted">جاري تحميل الحلقات...</span>';
  $("#episodeCount").textContent = "";
  openModal("detailModal");
  try {
    const data = await getJson(`${ONSHORT_API}?action=series&post=${encodeURIComponent(post)}`, 60000);
    if (onshortPlayer.post !== post) return;
    onshortPlayer.episodes = data.episodes || [];
    onshortPlayer.title = data.title || "";
    $("#detailTitle").textContent = data.title || "مسلسل";
    $("#detailDescription").textContent = data.description || "لا يوجد وصف متاح لهذا العمل.";
    $("#detailCover").innerHTML = data.poster
      ? `<img src="${escapeHtml(data.poster)}" alt="${escapeHtml(data.title)}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'poster-placeholder',textContent:'ش'}))">`
      : '<div class="poster-placeholder">ش</div>';
    $("#detailFacts").innerHTML = [
      data.transport === "runtime" ? "NetShort" : "ONShort",
      onshortPlayer.episodes.length ? `${onshortPlayer.episodes.length} حلقة` : ""
    ].filter(Boolean).map((fact) => `<span class="fact">${escapeHtml(fact)}</span>`).join("");
    const episodes = onshortPlayer.episodes;
    if (!episodes.length) {
      $("#episodes").innerHTML = '<span class="muted">لا توجد حلقات متاحة لهذا العمل.</span>';
      return;
    }
    $("#episodeCount").textContent = `${episodes.length} حلقة`;
    $("#episodes").innerHTML = episodes.map((number) => `<button class="episode-button" data-os-ep="${number}">الحلقة ${escapeHtml(number)}</button>`).join("");
    $("#episodes").querySelectorAll("[data-os-ep]").forEach((button) => button.addEventListener("click", () => onshortPlay(post, Number(button.dataset.osEp))));
  } catch (error) {
    $("#episodes").innerHTML = `<span class="muted">تعذر تحميل الحلقات: ${escapeHtml(error.message)}</span>`;
  }
}

async function onshortPlay(post, episode, quality = "") {
  onshortPlayer.post = post;
  onshortPlayer.ep = episode;
  destroyOnshortHls();
  $("#playerTitle").textContent = "جاري تحضير الحلقة...";
  $("#playerWrap").innerHTML = '<div class="player-placeholder">جاري جلب رابط التشغيل...</div>';
  document.querySelector("#externalPlayerLink").classList.add("hidden");
  document.querySelector("#onshortPlayerControls")?.remove();
  openModal("playerModal");
  try {
    const data = await getJson(`${ONSHORT_API}?action=play&post=${encodeURIComponent(post)}&ep=${episode}${quality ? `&quality=${quality}` : ""}`, 60000);
    if (onshortPlayer.post !== post || onshortPlayer.ep !== episode) return;
    renderOnshortPlayer(data, quality);
  } catch (error) {
    $("#playerWrap").innerHTML = `<div class="player-placeholder">تعذر تشغيل الحلقة: ${escapeHtml(error.message)}</div>`;
  }
}

function renderOnshortPlayer(data, quality) {
  const qualities = data.qualities || [];
  const subtitles = data.subtitles || [];
  onshortPlayer.subtitleIndex = subtitles.length ? 0 : -1;
  $("#playerTitle").textContent = `${onshortPlayer.title || "ONShort"} — الحلقة ${data.episode}`;
  $("#playerWrap").innerHTML = '<video id="onshortVideo" controls autoplay playsinline crossorigin="anonymous"></video>';

  const video = $("#onshortVideo");
  const restoreTime = onshortPlayer.currentTime;
  video.addEventListener("loadedmetadata", () => { if (restoreTime) video.currentTime = restoreTime; }, { once: true });
  video.addEventListener("ended", () => {
    const list = onshortPlayer.episodes;
    const position = list.indexOf(onshortPlayer.ep);
    if (position >= 0 && position < list.length - 1) onshortPlay(onshortPlayer.post, list[position + 1]);
  });
  subtitles.forEach((sub) => {
    const track = document.createElement("track");
    track.kind = "subtitles";
    track.label = sub.label || sub.lang;
    track.srclang = String(sub.lang || "").split("_")[0];
    track.src = sub.url;
    video.appendChild(track);
  });
  if (video.textTracks[0]) video.textTracks[0].mode = "showing";

  const controls = document.createElement("div");
  controls.className = "os-player-controls";
  controls.id = "onshortPlayerControls";
  document.querySelector(".player-info").appendChild(controls);
  qualities.forEach((q) => {
    const chip = document.createElement("button");
    chip.className = `os-quality-chip ${String(q) === String(quality) ? "active" : ""}`;
    chip.textContent = `${q}p`;
    chip.addEventListener("click", () => {
      onshortPlayer.currentTime = video.currentTime;
      onshortPlay(onshortPlayer.post, onshortPlayer.ep, String(q));
    });
    controls.appendChild(chip);
  });
  if (subtitles.length) {
    const chip = document.createElement("button");
    chip.className = "os-quality-chip active";
    chip.textContent = "ترجمة CC";
    chip.addEventListener("click", () => {
      const track = video.textTracks[onshortPlayer.subtitleIndex >= 0 ? onshortPlayer.subtitleIndex : 0];
      if (!track) return;
      track.mode = track.mode === "showing" ? "hidden" : "showing";
      chip.classList.toggle("active", track.mode === "showing");
    });
    controls.appendChild(chip);
  }

  const source = data.url;
  const isHls = data.kind === "hls";
  if (!source) {
    $("#playerWrap").innerHTML = '<div class="player-placeholder">لا يوجد رابط تشغيل متاح لهذه الحلقة.</div>';
    return;
  }
  if (isHls && video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = source;
  } else if (isHls && window.Hls && Hls.isSupported()) {
    onshortPlayer.hls = new Hls({ enableWorker: true, maxBufferLength: 30, backBufferLength: 30 });
    onshortPlayer.hls.loadSource(source);
    onshortPlayer.hls.attachMedia(video);
    onshortPlayer.hls.on(Hls.Events.ERROR, (_, payload) => {
      if (payload.fatal) {
        destroyOnshortHls();
        $("#playerWrap").innerHTML = '<div class="player-placeholder">انقطع اتصال الفيديو. جرّب حلقة أو جودة أخرى.</div>';
      }
    });
  } else {
    video.src = source;
  }
}
