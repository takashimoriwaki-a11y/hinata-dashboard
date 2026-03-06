// ひなたダッシュボード Service Worker
// Web Push通知の受信と表示 + PWAキャッシュ管理を担当する

const CACHE_NAME = "hinata-pwa-v1";

// キャッシュするアセット（オフライン時に表示するファイル）
const PRECACHE_ASSETS = [
  "/",
  "/manifest.json",
  "/icon-192x192.png",
  "/icon-512x512.png",
  "/apple-touch-icon.png",
];

// インストール時にアセットをキャッシュ
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn("[SW] precache failed:", err);
      });
    })
  );
  self.skipWaiting();
});

// 古いキャッシュを削除
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

// フェッチ: Network First（APIはネットワーク優先、失敗時はキャッシュ）
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // APIリクエストはキャッシュしない
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // GETリクエストのみキャッシュ対象
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 成功したレスポンスをキャッシュに保存
        if (response.ok) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, cloned);
          });
        }
        return response;
      })
      .catch(() => {
        // ネットワーク失敗時はキャッシュから返す
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // ナビゲーションリクエストはルートを返す（SPA対応）
          if (event.request.mode === "navigate") {
            return caches.match("/");
          }
        });
      })
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
