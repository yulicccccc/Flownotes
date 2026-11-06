const CACHE_NAME = "flownotes-cache-v3.8.6";
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/index.css?v=3.8.6",
  "/app.js?v=3.8.6",
  "/manifest.json",
  "/1.excalidraw",
  "/fonts/TsangerXuanSanM-W03.ttf",
  "/fonts/YeGenYouSanMo.ttf",
  "/fonts/AaJiandaoshitoubu.ttf",
  "https://d3js.org/d3.v7.min.js"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS).catch(() => {}))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve()))
      )
    ).then(() => self.clients.claim())
  );
});

// Network-First 策略：在线时永远获取最新代码，断网/弱网时瞬间从本地缓存秒开
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname === "api.github.com" || url.pathname.startsWith("/api/")) return; // GitHub Gist 与剪贴板快投 API 永远走实时网络

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match("/index.html")))
  );
});
