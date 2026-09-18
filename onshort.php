<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#0b0e17">
  <meta name="description" content="مكتبة ONShort في شاشة — تشغيل داخلي كامل للحلقات والترجمات.">
  <title>ONShort | شاشة</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&family=Manrope:wght@500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="styles.css">
  <script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js"></script>
</head>
<body class="onshort-page">
  <div class="ambient ambient-one"></div>
  <div class="ambient ambient-two"></div>
  <header class="site-header">
    <a class="brand" href="index.php" aria-label="شاشة - الرئيسية">
      <span class="brand-mark">ش</span><span class="brand-name">شاشة</span>
    </a>
    <nav class="main-nav" aria-label="التنقل الرئيسي">
      <a href="index.php">الرئيسية</a>
      <a class="active" href="onshort.php">ONShort</a>
    </nav>
    <button class="ghost-button compact-button hidden" id="osBackToSections">عودة للأقسام</button>
  </header>

  <main class="onshort-main">
    <section class="source-hero" id="osHero">
      <div>
        <p class="section-kicker">مصدر متكامل</p>
        <h1>مكتبة <em>ONShort</em></h1>
        <p>تصفح الأقسام ومكتبة كل المسلسلات، وشاهد أي حلقة داخل الموقع مباشرة — مع الترجمات — دون مغادرة شاشة.</p>
        <button class="primary-button" id="osLibraryOpen">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v3H4zm0 5h16v3H4zm0 5h16v3H4z"/></svg>
          مكتبة كل المسلسلات
        </button>
      </div>
      <div class="source-hero-mark" aria-hidden="true">ON</div>
    </section>

    <div id="onshortSections" class="onshort-sections" aria-live="polite">
      <div class="onshort-loading"><span class="spinner"></span><p>جاري تحميل أقسام ONShort...</p></div>
    </div>

    <section id="osLibrary" class="os-library hidden" aria-label="كل المسلسلات">
      <div class="section-heading">
        <div><p class="section-kicker">المكتبة الكاملة</p><h2>كل المسلسلات</h2></div>
        <span id="osPageStatus" class="os-page-status"></span>
      </div>
      <div id="osLibraryGrid" class="series-grid">
        <div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div>
      </div>
      <div class="pagination hidden" id="osPagination" aria-label="تنقل صفحات المكتبة">
        <button class="page-arrow" id="osPrevPage" aria-label="الصفحة السابقة">→</button>
        <div class="page-numbers" id="osPageNumbers"></div>
        <button class="page-arrow" id="osNextPage" aria-label="الصفحة التالية">←</button>
        <span class="page-status" id="osPageStatusSide"></span>
      </div>
    </section>
  </main>

  <footer class="site-footer">
    <div class="brand footer-brand"><span class="brand-mark">ش</span><span class="brand-name">شاشة</span></div>
    <span>المصدر: ONShort — تشغيل داخلي</span>
    <span class="footer-note">تُجلب الحلقات والترجمات تلقائياً وتُشغَّل داخل الموقع.</span>
  </footer>

  <div class="modal-backdrop hidden" id="osDetailModal" role="dialog" aria-modal="true" aria-labelledby="osDetailTitle">
    <article class="detail-modal">
      <button class="close-button" data-close="osDetailModal" aria-label="إغلاق">×</button>
      <div class="detail-cover" id="osDetailCover"><div class="poster-placeholder">ش</div></div>
      <div class="detail-content">
        <div class="eyebrow"><span class="live-dot"></span><span>ONShort</span></div>
        <h2 id="osDetailTitle">جاري التحميل...</h2>
        <p id="osDetailDescription"></p>
        <div class="detail-facts" id="osDetailFacts"></div>
        <div class="episode-heading"><h3>الحلقات</h3><span id="osEpisodeCount"></span></div>
        <div class="episodes" id="osEpisodes"><span class="muted">جاري تحميل الحلقات...</span></div>
      </div>
    </article>
  </div>

  <div class="modal-backdrop hidden" id="osPlayerModal" role="dialog" aria-modal="true" aria-labelledby="osPlayerTitle">
    <article class="player-modal">
      <button class="close-button" data-close="osPlayerModal" aria-label="إغلاق">×</button>
      <div class="player-wrap" id="osPlayerWrap"><div class="player-placeholder">اختر حلقة لبدء المشاهدة</div></div>
      <div class="player-info">
        <div><span class="eyebrow">تشغيل الآن — داخل شاشة</span><h2 id="osPlayerTitle">الحلقة</h2></div>
        <div class="os-player-controls" id="osPlayerControls"></div>
      </div>
    </article>
  </div>

  <script src="onshort.js"></script>
  <script src="speed.js"></script>
</body>
</html>
