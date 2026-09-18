<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#0b0e17">
  <meta name="description" content="شاشة — منصة عربية لاكتشاف الدراما والمسلسلات.">
  <title>شاشة | دراما تستحق المشاهدة</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&family=Manrope:wght@500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="styles.css">
  <link rel="preconnect" href="https://anyshort.net" crossorigin>
  <link rel="preconnect" href="https://onshort.net" crossorigin>
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
  <link rel="dns-prefetch" href="https://anyshort.net">
  <script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js"></script>
</head>
<body>
  <div class="ambient ambient-one"></div>
  <div class="ambient ambient-two"></div>

  <header class="site-header">
    <a class="brand" href="#" aria-label="شاشة - الرئيسية">
      <span class="brand-mark">ش</span>
      <span class="brand-name">شاشة</span>
    </a>
    <nav class="main-nav" aria-label="التنقل الرئيسي">
      <a class="active" href="#home">الرئيسية</a>
      <a href="#discover">اكتشف</a>
      <a href="#categories">التصنيفات</a>
      <a href="#reels" id="reelsNav">ريلز <span class="nav-live">●</span></a>
    </nav>
    <div class="header-actions">
      <button class="icon-button" id="refreshButton" title="تحديث المحتوى" aria-label="تحديث المحتوى">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8.1 8.1 0 0 0-14.8-3.7L3 10m0 0V5m0 5h5M4 13a8.1 8.1 0 0 0 14.8 3.7L21 14m0 0v5m0-5h-5"/></svg>
      </button>
      <button class="avatar" aria-label="الحساب">م</button>
    </div>
  </header>

  <main id="home">
    <section class="hero" aria-labelledby="heroTitle">
      <div class="hero-copy">
        <div class="eyebrow"><span class="live-dot"></span> مكتبتك العربية للمشاهدة</div>
        <h1 id="heroTitle">قصص كثيرة.<br><em>اختيار واحد.</em></h1>
        <p id="heroDescription">اكتشف أحدث المسلسلات والأعمال الدرامية من مصادرنا المفضلة، في مكان واحد وبواجهة بسيطة.</p>
        <div class="hero-buttons">
          <button class="primary-button" id="heroAction">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z"/></svg>
            ابدأ المشاهدة
          </button>
          <a class="ghost-button" href="#discover">تصفح المكتبة <span>←</span></a>
        </div>
        <div class="hero-meta"><span id="heroSource">محتوى متجدد</span><i></i><span>ترجمة ودبلجة</span><i></i><span>جودة عالية</span></div>
      </div>
      <div class="hero-art" id="heroArt">
        <div class="hero-art-glow"></div>
        <div class="poster-placeholder hero-poster-placeholder">ش</div>
        <div class="hero-art-overlay"></div>
        <div class="hero-art-label"><span>مختارات شاشة</span><strong id="heroBadge">جديد هذا الأسبوع</strong></div>
      </div>
    </section>

    <section class="toolbar" id="discover">
      <div>
        <p class="section-kicker">مكتبة الدراما</p>
        <h2>اكتشف شيئاً جديداً</h2>
      </div>
      <form class="search-box" id="searchForm">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 5 5"/></svg>
        <input id="searchInput" type="search" placeholder="ابحث عن مسلسل أو قصة..." autocomplete="off">
        <button type="submit">بحث</button>
      </form>
    </section>

    <div class="filter-row" id="categories" aria-label="التصنيفات">
      <button class="filter-chip active" data-filter="all">الكل</button>
      <button class="filter-chip" data-filter="دراما">دراما</button>
      <button class="filter-chip" data-filter="رومانسي">رومانسي</button>
      <button class="filter-chip" data-filter="كوميدي">كوميدي</button>
      <button class="filter-chip" data-filter="تركي">تركي</button>
      <button class="filter-chip" data-filter="كوري">كوري</button>
    </div>

    <section class="catalog-section" aria-live="polite">
      <div class="section-heading">
        <h2 id="catalogTitle">الأكثر مشاهدة الآن</h2>
        <span id="resultCount"></span>
      </div>
      <div class="series-grid" id="seriesGrid">
        <div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div>
      </div>
      <div class="empty-state hidden" id="emptyState">
        <div class="empty-icon">⌕</div>
        <h3>لم نجد نتائج مطابقة</h3>
        <p>جرّب كلمة أخرى أو ألغِ الفلتر الحالي.</p>
      </div>
      <div class="pagination hidden" id="pagination" aria-label="تنقل الصفحات">
        <button class="page-arrow" id="prevPage" aria-label="الصفحة السابقة">→</button>
        <div class="page-numbers" id="pageNumbers"></div>
        <button class="page-arrow" id="nextPage" aria-label="الصفحة التالية">←</button>
        <span class="page-status" id="pageStatus"></span>
      </div>
    </section>

    <section class="source-strip">
      <div class="source-copy">
        <span class="source-icon">◈</span>
        <div><strong>محتوى من مصادر موثوقة</strong><small>يتم تحديث المكتبة تلقائياً من المصادر المتصلة</small></div>
      </div>
      <span class="connection-state" id="connectionState"><i></i> جاري الاتصال بالمصادر...</span>
    </section>

    <section class="onshort-source-section" aria-labelledby="onshortSourceTitle">
      <div class="section-heading onshort-source-heading">
        <div><p class="section-kicker">مصدر إضافي</p><h2 id="onshortSourceTitle">منصة ONShort</h2></div>
        <a class="source-more-link" href="onshort.php">عرض المزيد <span>←</span></a>
      </div>
      <p class="onshort-source-description">اكتشف أحدث المسلسلات المدبلجة والمترجمة من ONShort.</p>
      <div class="series-grid onshort-preview-grid" id="onshortPreviewGrid">
        <div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div>
      </div>
    </section>
  </main>

  <footer class="site-footer">
    <div class="brand footer-brand"><span class="brand-mark">ش</span><span class="brand-name">شاشة</span></div>
    <span>© <span id="year"></span> شاشة. منصة اكتشاف دراما عربية.</span>
    <span class="footer-note">هذا الموقع يستخدم مصادر المحتوى المتاحة عبر الـ API.</span>
  </footer>

  <div class="modal-backdrop hidden" id="detailModal" role="dialog" aria-modal="true" aria-labelledby="detailTitle">
    <article class="detail-modal">
      <button class="close-button" data-close="detailModal" aria-label="إغلاق">×</button>
      <div class="detail-cover" id="detailCover"><div class="poster-placeholder">ش</div></div>
      <div class="detail-content">
        <div class="eyebrow"><span class="live-dot"></span><span id="detailSource">تفاصيل العمل</span></div>
        <h2 id="detailTitle">جاري التحميل...</h2>
        <p id="detailDescription"></p>
        <div class="detail-facts" id="detailFacts"></div>
        <div class="episode-heading"><h3>الحلقات</h3><span id="episodeCount"></span></div>
        <div class="episodes" id="episodes"><span class="muted">جاري تحميل الحلقات...</span></div>
      </div>
    </article>
  </div>

  <div class="modal-backdrop hidden" id="playerModal" role="dialog" aria-modal="true" aria-labelledby="playerTitle">
    <article class="player-modal">
      <button class="close-button" data-close="playerModal" aria-label="إغلاق">×</button>
      <div class="player-wrap" id="playerWrap"><div class="player-placeholder">اختر حلقة لبدء المشاهدة</div></div>
      <div class="player-info"><div><span class="eyebrow">تشغيل الآن</span><h2 id="playerTitle">الحلقة</h2></div><a id="externalPlayerLink" class="external-link hidden" target="_blank" rel="noopener">فتح الرابط ↗</a></div>
    </article>
  </div>

  <section class="reels-view hidden" id="reelsView" aria-label="مشاهدة ريلز">
    <div class="reels-topbar">
      <button class="reels-close" id="closeReels" aria-label="إغلاق الريلز">×</button>
      <div class="reels-brand"><span class="brand-mark">ش</span><strong>ريلز</strong></div>
      <span class="reels-hint">اسحب للأعلى للمقطع التالي</span>
    </div>
    <div class="reels-feed" id="reelsFeed">
      <div class="reels-loading"><span class="spinner"></span><p>جاري تحضير المقاطع...</p></div>
    </div>
    <div class="reel-episode-picker hidden" id="reelEpisodePicker" role="dialog" aria-label="اختيار الحلقة">
      <button class="reel-picker-close" id="closeReelEpisodePicker" aria-label="إغلاق اختيار الحلقة">×</button>
      <div class="reel-picker-heading"><strong>اختيار الحلقة</strong><span id="reelEpisodePickerCount"></span></div>
      <div class="reel-episode-options" id="reelEpisodeOptions"></div>
    </div>
  </section>

  <script src="app.js"></script>
  <script src="speed.js"></script>
</body>
</html>