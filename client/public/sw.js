// ひなたダッシュボード Service Worker
// Web Push通知の受信と表示 + PWAキャッシュ管理 + オフライン専用ページ対応

const CACHE_NAME = "hinata-pwa-v2";
const OFFLINE_URL = "/offline.html";

// 起動時に必ずキャッシュするアセット
const PRECACHE_ASSETS = [
  "/",
  "/offline.html",
  "/manifest.json",
  "/icon-192x192.png",
  "/icon-512x512.png",
  "/apple-touch-icon.png",
];

// ===== インストール =====
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // offline.html は必ずキャッシュする（他は失敗しても続行）
      return cache.add(OFFLINE_URL).then(() =>
        cache.addAll(PRECACHE_ASSETS.filter((u) => u !== OFFLINE_URL)).catch((err) => {
          console.warn("[SW] precache partial failure:", err);
        })
      );
    })
  );
  self.skipWaiting();
});

// ===== アクティベート（古いキャッシュ削除） =====
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ===== フェッチ戦略 =====
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // APIリクエスト・非GETはキャッシュしない（ネットワークのみ）
  if (url.pathname.startsWith("/api/") || event.request.method !== "GET") {
    return;
  }

  // ナビゲーションリクエスト（ページ遷移）
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // 成功したらキャッシュに保存して返す
          if (response.ok) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          }
          return response;
        })
        .catch(async () => {
          // オフライン時: キャッシュ済みページがあればそれを返す
          const cached = await caches.match(event.request);
          if (cached) return cached;
          // なければオフライン専用ページを返す
          const offlinePage = await caches.match(OFFLINE_URL);
          return offlinePage ?? new Response("オフラインです", { status: 503 });
        })
    );
    return;
  }

  // 静的アセット（JS/CSS/画像等）: Network First → Cache Fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// ===== Web Push通知 =====

self.addEventListener("push", (event) => {
  let data = { title: "ひなた通知", body: "", url: "/" };
  try {
    if (event.data) {
      data = { ...data, ...JSON.parse(event.data.text()) };
    }
  } catch (e) {
    console.error("[SW] push data parse error:", e);
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192x192.png",
      badge: "/icon-192x192.png",
      data: { url: data.url ?? "/" },
      requireInteraction: false,
      tag: "hinata-schedule",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
