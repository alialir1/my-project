/* شاشة — طبقة السرعة: تشغيل خدمة العامل + فك ترميز غير متزامن للصور */
(function () {
  "use strict";

  // تفعيل التخزين المؤقت للملفات الثابتة عبر Service Worker (https فقط)
  if ("serviceWorker" in navigator && window.location.protocol.indexOf("https") === 0) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    });
  }

  // فك ترميز الصور بشكل غير متزامن لعدم حجب الرسم
  function markAsync(img) {
    if (img && !img.decoding) img.decoding = "async";
  }
  document.querySelectorAll("img").forEach(markAsync);

  // تغطية الصور التي تُضاف لاحقاً
  if ("MutationObserver" in window) {
    new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (!node || node.nodeType !== 1) return;
          if (node.tagName === "IMG") markAsync(node);
          node.querySelectorAll && node.querySelectorAll("img").forEach(markAsync);
        });
      });
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
})();
