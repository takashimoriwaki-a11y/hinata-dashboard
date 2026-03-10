/**
 * Server-Sent Events (SSE) ブロードキャスト管理
 * 職員が何らかのデータを更新した際に全接続クライアントへ通知を送る
 */

import type { Response } from "express";

// 接続中のSSEクライアントを管理するSet
const clients = new Set<Response>();

/**
 * 新しいSSEクライアントを登録する
 */
export function addSseClient(res: Response): void {
  clients.add(res);
}

/**
 * SSEクライアントを削除する
 */
export function removeSseClient(res: Response): void {
  clients.delete(res);
}

/**
 * 全クライアントにイベントをブロードキャストする
 * @param event イベント名（例: "scheduleChange", "task", "visitRecord"）
 * @param data 付随データ（任意）
 */
export function broadcastEvent(event: string, data?: Record<string, unknown>): void {
  const payload = JSON.stringify({ event, data: data ?? {}, ts: Date.now() });
  const deadClients: Response[] = [];

  clients.forEach((client) => {
    try {
      client.write(`event: ${event}\ndata: ${payload}\n\n`);
    } catch {
      // 書き込み失敗 = クライアント切断済み
      deadClients.push(client);
    }
  });

  // 切断済みクライアントを削除
  for (const dead of deadClients) {
    clients.delete(dead);
  }
}

/**
 * 現在の接続クライアント数を返す（デバッグ用）
 */
export function getSseClientCount(): number {
  return clients.size;
}
