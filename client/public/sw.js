// ひなたダッシュボード Service Worker
// Web Push通知の受信と表示 + PWAキャッシュ管理 + オフライン専用ページ対応

const CACHE_NAME = "hinata-pwa-v4";
const OFFLINE_URL = "/offline.html";

// 起動時に必ずキャッシュするアセット（HTMLは含めない）
const PRECACHE_ASSETS = [
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
  // 新しいSWを即座にアクティブにする
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
    ).then(() => {
      // 全クライアントを即座に制御下に置く
      return self.clients.claim();
    }).then(() => {
      // 全クライアントにリロードを促す（古いバンドルを確実に排除）
      return self.clients.matchAll({ type: "window" }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: "SW_ACTIVATED" });
        });
      });
    })
  );
});

// ===== フェッチ戦略 =====
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // APIリクエスト・非GETはキャッシュしない（ネットワークのみ）
  if (url.pathname.startsWith("/api/") || event.request.method !== "GET") {
    return;
  }

  // ナビゲーションリクエスト（ページ遷移）
  // SPAのHTMLは常にネットワークから取得し、キャッシュしない
  // オフライン時のみオフライン専用ページを返す
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .catch(async () => {
          // オフライン時のみオフライン専用ページを返す（古いHTMLはキャッシュしない）
          const offlinePage = await caches.match(OFFLINE_URL);
          return offlinePage ?? new Response("オフラインです", { status: 503 });
        })
    );
    return;
  }

  // 静的アセット（JS/CSS/画像等）: Network First → Cache Fallback
  // ※ /assets/ 配下のハッシュ付きファイルのみキャッシュする
  if (url.pathname.startsWith("/assets/")) {
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
    return;
  }

  // その他の静的ファイル（アイコン、manifest等）: Cache First → Network Fallback
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
        }
        return response;
      });
    })
  );
});

// ===== Web Push通知 =====

self.addEventListener("push", (event) => {
  let data = { title: "ひなた通知", body: "", url: "/", unreadCount: undefined };
  try {
    if (event.data) {
      data = { ...data, ...JSON.parse(event.data.text()) };
    }
  } catch (e) {
    console.error("[SW] push data parse error:", e);
  }

  // 通知表示 + アプリアイコンバッジ更新
  const tasks = [
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192x192.png",
      badge: "/icon-192x192.png",
      data: { url: data.url ?? "/" },
      requireInteraction: false,
      tag: "hinata-schedule",
    }),
  ];

  // アプリアイコンに未読数バッジを表示（iOS Safari/PWA + Chrome等で対応）
  if ("setAppBadge" in self.navigator) {
    const count = typeof data.unreadCount === "number" && data.unreadCount > 0
      ? data.unreadCount
      : 1; // unreadCount未指定なら最低でも1を表示
    tasks.push(
      self.navigator.setAppBadge(count).catch((e) => {
        console.warn("[SW] setAppBadge failed:", e);
      })
    );
  }

  event.waitUntil(Promise.all(tasks));
});

// 通知クリック時：バッジクリア + 該当URLを開く
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";

  // バッジをクリア（クリックしたらアプリを開くので未読扱い解除）
  if ("clearAppBadge" in self.navigator) {
    self.navigator.clearAppBadge().catch((e) => {
      console.warn("[SW] clearAppBadge failed:", e);
    });
  }

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

// アプリ起動時/通知既読時にバッジクリアするためのメッセージハンドラ
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "CLEAR_BADGE") {
    if ("clearAppBadge" in self.navigator) {
      self.navigator.clearAppBadge().catch((e) => {
        console.warn("[SW] clearAppBadge failed:", e);
      });
    }
  } else if (event.data && event.data.type === "SET_BADGE" && typeof event.data.count === "number") {
    if ("setAppBadge" in self.navigator) {
      self.navigator.setAppBadge(event.data.count).catch((e) => {
        console.warn("[SW] setAppBadge failed:", e);
      });
    }
  }
});
