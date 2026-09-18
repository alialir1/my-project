/* شاشة — واجهة ONShort: تشغيل داخلي كامل، أقسام مع "عرض المزيد"، ومكتبة كل المسلسلات بترقيم صفحات */

const ONSHORT_API = "onshort/api.php";

const osState = {
  allPage: 1, allMax: 1, allLoading: false, pagesCache: new Map(), allPrefetch: new Set(),
  detailPost: null, detailEpisodes: [], detailTitle: "",
  hls: null, currentPost: null, currentEp: 1, currentTime: 0,
  sectionsLoaded: false
};

const osEscape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
}[char]));

async function osJson(url, timeout = 45000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store", headers: { Accept: "application/json", "Cache-Control": "no-cache" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data.error) throw new Error(data.message || "خطأ من المصدر");
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function osPoster(item) {
  if (item.poster) {
    return `<img src="${osEscape(item.poster)}" alt="${osEscape(item.title)}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'poster-placeholder',textContent:'ش'}))">`;
  }
  return '<div class="poster-placeholder">ش</div>';
}

function osCard(item) {
  return `
    <article class="series-card onshort-series-card" data-post="${osEscape(item.id)}" role="button" tabindex="0" aria-label="${osEscape(item.title)}">
      <div class="series-poster">
        ${osPoster(item)}
        <span class="card-badge">${osEscape(item.platform || "ONShort")}</span>
        <span class="card-play"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z"/></svg></span>
      </div>
      <h3 title="${osEscape(item.title)}">${osEscape(item.title)}</h3>
      <div class="card-sub"><span>${osEscape(item.format || item.platform || "ONShort")}</span><i></i><span>${item.episodes ? `${item.episodes} حلقة` : "مسلسل"}</span></div>
    </article>`;
}

function osAllowed(item) {
  return !/idrama/i.test(`${item?.title || ""} ${item?.platform || ""} ${item?.source || ""}`);
}

function osSkeletons(count = 8) {
  return Array.from({ length: count }, () => '<div class="skeleton-card"></div>').join("");
}

/* ---------------- الأقسام (الصفحة الرئيسية للمصدر) ---------------- */

async function loadOsSections() {
  const container = document.querySelector("#onshortSections");
  try {
    const data = await osJson(`${ONSHORT_API}?action=home`);
    const sections = (data.sections || []).map((section) => ({
      ...section,
      items: (section.items || []).filter(osAllowed),
    })).filter((section) => section.items.length);
    if (!sections.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">⌕</div><h3>لا توجد أقسام متاحة</h3><p>تعذر قراءة محتوى المصدر حالياً.</p></div>';
      return;
    }
    container.innerHTML = sections.map((section) => `
      <section class="onshort-section">
        <div class="onshort-section-heading">
          <div><p class="section-kicker">${osEscape(section.kicker || "ONSHORT")}</p><h2>${osEscape(section.title)}</h2></div>
          <span>${section.count || section.items.length} عمل</span>
        </div>
        <div class="series-grid">${section.items.slice(0, 6).map(osCard).join("")}</div>
        <div class="os-section-more"><button class="ghost-button compact-button" data-open-library>عرض المزيد <span>←</span></button></div>
      </section>`).join("");
    container.querySelectorAll(".series-card").forEach((card) => {
      card.addEventListener("click", () => openOsSeries(card.dataset.post));
      card.addEventListener("keydown", (event) => { if (event.key === "Enter") openOsSeries(card.dataset.post); });
    });
    container.querySelectorAll("[data-open-library]").forEach((button) => button.addEventListener("click", () => showOsLibrary(1)));
    osState.sectionsLoaded = true;
  } catch (error) {
    container.innerHTML = `
      <div class="empty-state"><div class="empty-icon">!</div><h3>تعذر تحميل المصدر</h3>
      <p>${osEscape(error.message)}. حاول تحديث الصفحة بعد قليل.</p></div>`;
  }
}

/* ---------------- مكتبة كل المسلسلات (مع ترقيم الصفحات) ---------------- */

function showOsLibrary(page) {
  document.querySelector("#onshortSections").classList.add("hidden");
  document.querySelector("#osLibrary").classList.remove("hidden");
  document.querySelector("#osHero").classList.add("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
  loadOsLibraryPage(Number(page) || 1);
}

function showOsSections() {
  document.querySelector("#osLibrary").classList.add("hidden");
  document.querySelector("#onshortSections").classList.remove("hidden");
  document.querySelector("#osHero").classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function loadOsLibraryPage(page) {
  const grid = document.querySelector("#osLibraryGrid");
  const pagination = document.querySelector("#osPagination");
  osState.allPage = page;
  if (osState.allLoading) return;
  osState.allLoading = true;
  grid.innerHTML = osSkeletons();
  pagination.classList.add("hidden");
  const cachedItems = osState.pagesCache.get(page);
  const items = cachedItems ? [...cachedItems] : [];
  if (!cachedItems) {
    try {
      const data = await osJson(`${ONSHORT_API}?action=series_list&page=${page}`);
      osState.allMax = data.pagination?.max || page;
      items.push(...(data.items || []).filter(osAllowed));
      osState.pagesCache.set(page, items);
    } catch (error) {
      grid.innerHTML = `<div class="empty-state"><div class="empty-icon">!</div><h3>تعذر تحميل الصفحة ${page}</h3><p>${osEscape(error.message)}</p></div>`;
      return;
    }
  } else {
    osState.allMax = Math.max(osState.allMax, page);
  }
  if (!items.length) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-icon">⌕</div><h3>لا توجد أعمال في هذه الصفحة</h3></div>';
    return;
  }
  grid.innerHTML = items.map(osCard).join("");
  grid.querySelectorAll(".series-card").forEach((card) => {
    card.addEventListener("click", () => openOsSeries(card.dataset.post));
    card.addEventListener("keydown", (event) => { if (event.key === "Enter") openOsSeries(card.dataset.post); });
  });
  renderOsPagination();
  // تحميل مسبق للصفحة التالية لتنقل فوري
  if (page < osState.allMax && !osState.allPrefetch.has(page + 1)) {
    osState.allPrefetch.add(page + 1);
    osJson(`${ONSHORT_API}?action=series_list&page=${page + 1}`).then((next) => {
      if (next.items && next.items.length && !osState.pagesCache.has(page + 1)) {
        osState.pagesCache.set(page + 1, next.items);
      }
    }).catch(() => {});
  }
  osState.allLoading = false;
}

function renderOsPagination() {
  const pagination = document.querySelector("#osPagination");
  const pages = [];
  const add = (value) => { if (!pages.includes(value)) pages.push(value); };
  add(1);
  for (let number = Math.max(2, osState.allPage - 2); number <= Math.min(osState.allMax - 1, osState.allPage + 2); number += 1) add(number);
  if (osState.allMax > 1) add(osState.allMax);
  document.querySelector("#osPageStatus").textContent = `صفحة ${osState.allPage} من ${osState.allMax}`;
  document.querySelector("#osPrevPage").disabled = osState.allPage <= 1;
  document.querySelector("#osNextPage").disabled = osState.allPage >= osState.allMax;
  document.querySelector("#osPageNumbers").innerHTML = pages.map((number, index) => {
    const previous = pages[index - 1];
    const gap = previous && number - previous > 1 ? '<span class="page-gap">…</span>' : "";
    return `${gap}<button class="page-number ${number === osState.allPage ? "active" : ""}" data-page="${number}">${number}</button>`;
  }).join("");
  document.querySelector("#osPageNumbers").querySelectorAll(".page-number").forEach((button) => {
    button.addEventListener("click", () => loadOsLibraryPage(Number(button.dataset.page)));
  });
  pagination.classList.remove("hidden");
}

/* ---------------- تفاصيل المسلسل (داخلي) ---------------- */

async function openOsSeries(post) {
  if (!post) return;
  osState.detailPost = post;
  document.querySelector("#osDetailTitle").textContent = "جاري التحميل...";
  document.querySelector("#osDetailDescription").textContent = "";
  document.querySelector("#osDetailCover").innerHTML = '<div class="poster-placeholder">ش</div>';
  document.querySelector("#osDetailFacts").innerHTML = "";
  document.querySelector("#osEpisodes").innerHTML = '<span class="spinner"></span>';
  document.querySelector("#osEpisodeCount").textContent = "";
  openOsModal("osDetailModal");
  try {
    const data = await osJson(`${ONSHORT_API}?action=series&post=${encodeURIComponent(post)}`);
    if (osState.detailPost !== post) return;
    osState.detailEpisodes = data.episodes || [];
    osState.detailTitle = data.title || "";
    document.querySelector("#osDetailTitle").textContent = data.title || "مسلسل";
    document.querySelector("#osDetailDescription").textContent = data.description || "لا يوجد وصف متاح لهذا العمل.";
    document.querySelector("#osDetailCover").innerHTML = data.poster
      ? `<img src="${osEscape(data.poster)}" alt="${osEscape(data.title)}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'poster-placeholder',textContent:'ش'}))">`
      : '<div class="poster-placeholder">ش</div>';
    document.querySelector("#osDetailFacts").innerHTML = [
      data.transport === "runtime" ? "NetShort" : "ONShort",
      osState.detailEpisodes.length ? `${osState.detailEpisodes.length} حلقة` : ""
    ].filter(Boolean).map((fact) => `<span class="fact">${osEscape(fact)}</span>`).join("");
    renderOsEpisodes();
  } catch (error) {
    document.querySelector("#osEpisodes").innerHTML = `<span class="muted">تعذر تحميل الحلقات: ${osEscape(error.message)}</span>`;
  }
}

function renderOsEpisodes() {
  const container = document.querySelector("#osEpisodes");
  const episodes = osState.detailEpisodes;
  if (!episodes.length) {
    container.innerHTML = '<span class="muted">لا توجد حلقات متاحة لهذا العمل.</span>';
    return;
  }
  document.querySelector("#osEpisodeCount").textContent = `${episodes.length} حلقة`;
  container.innerHTML = episodes.map((number) => `<button class="episode-button" data-ep="${number}">الحلقة ${number}</button>`).join("");
  container.querySelectorAll(".episode-button").forEach((button) => {
    button.addEventListener("click", () => osPlay(osState.detailPost, Number(button.dataset.ep)));
  });
}

/* ---------------- المشغل الداخلي ---------------- */

function osDestroyHls() {
  if (osState.hls) {
    try { osState.hls.destroy(); } catch (_) { /* already destroyed */ }
    osState.hls = null;
  }
}

function closeOsModal(id) {
  document.querySelector(`#${id}`).classList.add("hidden");
  document.body.style.overflow = "";
  if (id === "osPlayerModal") {
    osDestroyHls();
    document.querySelector("#osPlayerWrap").innerHTML = "";
  }
  if (id === "osDetailModal") osState.detailPost = null;
}

function openOsModal(id) {
  document.querySelector(`#${id}`).classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function osSubtitleToggle() {
  const video = document.querySelector("#osVideo");
  if (!video) return;
  const track = video.textTracks[osState.subtitleIndex >= 0 ? osState.subtitleIndex : 0];
  if (!track) return;
  track.mode = track.mode === "showing" ? "hidden" : "showing";
  document.querySelector("#osSubtitleButton").classList.toggle("active", track.mode === "showing");
}

async function osPlay(post, episode, quality = "") {
  osState.currentPost = post;
  osState.currentEp = episode;
  osDestroyHls();
  document.querySelector("#osPlayerTitle").textContent = "جاري تحضير الحلقة...";
  document.querySelector("#osPlayerWrap").innerHTML = '<div class="player-placeholder">جاري جلب رابط التشغيل...</div>';
  openOsModal("osPlayerModal");
  try {
    const data = await osJson(`${ONSHORT_API}?action=play&post=${encodeURIComponent(post)}&ep=${episode}${quality ? `&quality=${quality}` : ""}`);
    if (osState.currentPost !== post || osState.currentEp !== episode) return;
    osRenderPlayer(data, quality);
  } catch (error) {
    document.querySelector("#osPlayerWrap").innerHTML = `<div class="player-placeholder">تعذر تشغيل الحلقة: ${osEscape(error.message || "خطأ غير معروف")}</div>`;
  }
}

function osRenderPlayer(data, quality) {
  osState.currentKind = data.kind || "";
  const qualities = data.qualities || [];
  const subtitles = data.subtitles || [];
  osState.subtitleIndex = subtitles.length ? 0 : -1;

  document.querySelector("#osPlayerTitle").textContent = `${osState.detailTitle || "ONShort"} — الحلقة ${data.episode}`;
  document.querySelector("#osPlayerWrap").innerHTML = '<video id="osVideo" controls autoplay playsinline crossorigin="anonymous"></video>';

  const video = document.querySelector("#osVideo");
  const restoreTime = osState.currentTime;
  video.addEventListener("loadedmetadata", () => {
    if (restoreTime) video.currentTime = restoreTime;
  }, { once: true });
  video.addEventListener("ended", () => {
    const list = osState.detailEpisodes;
    const position = list.indexOf(osState.currentEp);
    if (position >= 0 && position < list.length - 1) osPlay(osState.currentPost, list[position + 1]);
  });

  (subtitles || []).forEach((sub) => {
    const track = document.createElement("track");
    track.kind = "subtitles";
    track.label = sub.label || sub.lang;
    track.srclang = (sub.lang || "").split("_")[0];
    track.src = sub.url;
    video.appendChild(track);
  });
  if (video.textTracks[0]) video.textTracks[0].mode = "showing";

  const controls = document.querySelector("#osPlayerControls");
  controls.innerHTML = "";
  if (qualities.length) {
    controls.insertAdjacentHTML("beforeend", qualities.map((q) => `
      <button class="os-quality-chip ${String(q) === String(quality) ? "active" : ""}" data-quality="${q}">${q}p</button>`).join(""));
  }
  if (subtitles.length) {
    controls.insertAdjacentHTML("beforeend", '<button class="os-quality-chip active" id="osSubtitleButton">ترجمة CC</button>');
  }
  controls.querySelectorAll("[data-quality]").forEach((chip) => {
    chip.addEventListener("click", () => {
      osState.currentTime = video.currentTime;
      osPlay(osState.currentPost, osState.currentEp, chip.dataset.quality);
    });
  });
  const subtitleButton = document.querySelector("#osSubtitleButton");
  if (subtitleButton) subtitleButton.addEventListener("click", osSubtitleToggle);

  const sources = [data.direct_url, data.url].filter(Boolean);
  let sourceIndex = 0;
  const source = sources[sourceIndex] || "";
  const retryWithProxy = () => {
    if (sourceIndex >= sources.length - 1) return false;
    sourceIndex += 1;
    osDestroyHls();
    const next = sources[sourceIndex];
    if (data.kind === "hls" && window.Hls && Hls.isSupported()) {
      osState.hls = new Hls({ enableWorker: true, maxBufferLength: 30, backBufferLength: 30 });
      osState.hls.loadSource(next);
      osState.hls.attachMedia(video);
    } else {
      video.src = next;
      video.load();
    }
    return true;
  };
  video.addEventListener("error", () => {
    if (!retryWithProxy()) osShowPlayerError("تعذر تشغيل الحلقة من المصدر.");
  }, { once: true });
  const isHls = data.kind === "hls";
  if (isHls && video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = source;
  } else if (isHls && window.Hls && Hls.isSupported()) {
    osState.hls = new Hls({ enableWorker: true, maxBufferLength: 30, backBufferLength: 30 });
    osState.hls.loadSource(source);
    osState.hls.attachMedia(video);
    osState.hls.on(Hls.Events.ERROR, (_, payload) => {
      if (payload.fatal && !retryWithProxy()) osShowPlayerError("انقطع اتصال الفيديو. جرّب حلقة أو جودة أخرى.");
    });
  } else if (source) {
    video.src = source;
  }
  if (!source) osShowPlayerError("لا يوجد رابط تشغيل متاح لهذه الحلقة.");
}

function osShowPlayerError(message) {
  const wrap = document.querySelector("#osPlayerWrap");
  if (wrap && !wrap.querySelector("video")) wrap.innerHTML = `<div class="player-placeholder">${osEscape(message)}</div>`;
}

/* ---------------- التشغيل ---------------- */

document.addEventListener("DOMContentLoaded", () => {
  document.querySelector("#osBackToSections").addEventListener("click", showOsSections);
  document.querySelector("#osPrevPage").addEventListener("click", () => { if (osState.allPage > 1) loadOsLibraryPage(osState.allPage - 1); });
  document.querySelector("#osNextPage").addEventListener("click", () => { if (osState.allPage < osState.allMax) loadOsLibraryPage(osState.allPage + 1); });
  document.querySelector("#osLibraryOpen").addEventListener("click", () => showOsLibrary(1));
  document.querySelectorAll("[data-close='osDetailModal']").forEach((button) => button.addEventListener("click", () => closeOsModal("osDetailModal")));
  document.querySelectorAll("[data-close='osPlayerModal']").forEach((button) => button.addEventListener("click", () => closeOsModal("osPlayerModal")));
  document.querySelectorAll(".modal-backdrop").forEach((modal) => {
    modal.addEventListener("click", (event) => { if (event.target === modal) closeOsModal(modal.id); });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") document.querySelectorAll(".modal-backdrop:not(.hidden)").forEach((modal) => closeOsModal(modal.id));
  });

  loadOsSections().then(() => {
    const match = location.hash.match(/#series=(\d+)/);
    if (match) openOsSeries(match[1]);
  });
});
