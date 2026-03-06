/**
 * Web Push通知ヘルパー
 * VAPIDキーを使ってブラウザへプッシュ通知を送信する
 */
import webpush from "web-push";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { pushSubscriptions } from "../drizzle/schema";

let initialized = false;

function initWebPush() {
  if (initialized) return;
  if (!ENV.vapidPublicKey || !ENV.vapidPrivateKey) {
    console.warn("[WebPush] VAPID keys not configured, push notifications disabled");
    return;
  }
  webpush.setVapidDetails(ENV.vapidEmail, ENV.vapidPublicKey, ENV.vapidPrivateKey);
  initialized = true;
}

/** サブスクリプションを保存する */
export async function saveSubscription(data: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userId?: number;
  userName?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // 既存のendpointがあれば更新、なければ挿入
  const existing = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where((await import("drizzle-orm")).eq(pushSubscriptions.endpoint, data.endpoint))
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(pushSubscriptions)
      .set({ p256dh: data.p256dh, auth: data.auth, userId: data.userId, userName: data.userName })
      .where((await import("drizzle-orm")).eq(pushSubscriptions.endpoint, data.endpoint));
  } else {
    await db.insert(pushSubscriptions).values(data);
  }
}

/** サブスクリプションを削除する */
export async function deleteSubscription(endpoint: string) {
  const db = await getDb();
  if (!db) return;
  const { eq } = await import("drizzle-orm");
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

/** 全サブスクリプションに通知を送信する */
export async function sendPushToAll(payload: { title: string; body: string; url?: string }) {
  initWebPush();
  if (!initialized) return;
  const db = await getDb();
  if (!db) return;
  const subs = await db.select().from(pushSubscriptions);
  const payloadStr = JSON.stringify(payload);
  const failed: string[] = [];
  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payloadStr
        );
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // 無効なサブスクリプションを削除
          failed.push(sub.endpoint);
        } else {
          console.error("[WebPush] send error:", err);
        }
      }
    })
  );
  // 無効なサブスクリプションを一括削除
  if (failed.length > 0) {
    const { inArray } = await import("drizzle-orm");
    await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, failed));
  }
}
