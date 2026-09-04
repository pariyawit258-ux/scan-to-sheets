const CACHE_NAME = "smart-store-v1";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.json",
  "https://unpkg.com/html5-qrcode"
];

// 1. Install Event: โหลดไฟล์หลักเก็บไว้ในเครื่องเพื่อรองรับ Offline mode
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

// 2. Activate Event: เคลียร์ Cache เก่าเมื่อมีการอัปเดตเวอร์ชัน
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

// 3. Fetch Event: เรียกดึงไฟล์จาก Cache ก่อน หากแมตช์ไฟล์ให้อ่านจากเครื่องทันที
self.addEventListener("fetch", (e) => {
  // ข้ามการแคชคำสั่งที่ยิงไปยัง Google Apps Script (ให้ Fetch ผ่าน Network เสมอ)
  if (e.request.url.includes("script.google.com")) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      return cachedResponse || fetch(e.request);
    })
  );
});