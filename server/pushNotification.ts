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
  teamFilter?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { eq } = await import("drizzle-orm");
  // 既存のendpointがあれば更新、なければ挿入
  const existing = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, data.endpoint))
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(pushSubscriptions)
      .set({
        p256dh: data.p256dh,
        auth: data.auth,
        userId: data.userId,
        userName: data.userName,
        teamFilter: data.teamFilter ?? null,
      })
      .where(eq(pushSubscriptions.endpoint, data.endpoint));
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

/**
 * スクリーンショット更新時のプッシュ通知を送信する
 * @param payload 通知内容
 * @param team 更新されたチーム名（チームフィルターの対象）
 */
export async function sendPushToAll(
  payload: { title: string; body: string; url?: string },
  team?: string
) {
  initWebPush();
  if (!initialized) return;
  const db = await getDb();
  if (!db) return;
  // 全サブスクリプションを取得し、チームフィルターを適用
  const allSubs = await db.select().from(pushSubscriptions);
  const subs = allSubs.filter((sub) => {
    // teamFilterが未設定（null）→全チームの更新で通知
    if (!sub.teamFilter) return true;
    // teamFilterが設定されている→更新チームと一致する場合のみ通知
    return sub.teamFilter === team;
  });
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
