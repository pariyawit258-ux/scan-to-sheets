const CACHE_NAME = "inventory-pwa-v2";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.json",
  "https://unpkg.com/html5-qrcode"
];

// ติดตั้ง Service Worker และ Cache ไฟล์
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
});

// ดึงไฟล์จาก Cache เมื่อใช้งานออฟไลน์
self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      return cachedResponse || fetch(e.request);
    })
  );
});