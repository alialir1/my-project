/* شاشة — Service Worker: تخزين الملفات الثابتة فقط، ولا يمس API أو مقاطع الفيديو */
var CACHE_VERSION = "shasha-static-v1";

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.addAll(["./", "index.php", "onshort.php", "styles.css", "app.js", "onshort.js", "speed.js"]).catch(function () {});
    }).then(function () { return self.skipWaiting(); }).catch(function () {})
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== CACHE_VERSION) return caches.delete(key);
        return null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;
  var url = new URL(request.url);
  var path = url.pathname;

  // نحمي طلبات الـ API وملفات الفيديو من التخزين — تبقى حية دائماً
  if (path.indexOf("api.php") !== -1 || path.indexOf("stream.php") !== -1 || path.indexOf("sw.js") !== -1) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).then(function (response) {
        var copy = response.clone();
        caches.open(CACHE_VERSION).then(function (cache) { cache.put(request, copy); }).catch(function () {});
        return response;
      }).catch(function () {
        return caches.match(request).then(function (hit) { return hit || caches.match("./"); });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(function (hit) {
      if (hit) return hit;
      return fetch(request).then(function (response) {
        var copy = response.clone();
        caches.open(CACHE_VERSION).then(function (cache) { cache.put(request, copy); }).catch(function () {});
        return response;
      });
    })
  );
});
