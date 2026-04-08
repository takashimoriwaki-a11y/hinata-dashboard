/**
 * offlineQueue.ts - オフライン中の操作をlocalStorageに保存するキューストア
 *
 * 対応操作:
 * - tasks.create    : タスク追加
 * - messages.create : メッセージ投稿
 * - scheduleChanges.createAndExport : 変更連絡送信
 */

export type OfflineOperationType =
  | "tasks.create"
  | "messages.create"
  | "scheduleChanges.createAndExport";

export interface OfflineQueueItem {
  id: string;           // ユニークID (crypto.randomUUID)
  type: OfflineOperationType;
  payload: unknown;     // ミューテーションの引数をそのまま保存
  label: string;        // ユーザー向け表示ラベル（例: "タスク: 〇〇を追加"）
  queuedAt: number;     // キューに入れた時刻 (Date.now())
}

const STORAGE_KEY = "hinata_offline_queue";

/** キュー全件取得 */
export function getQueue(): OfflineQueueItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as OfflineQueueItem[];
  } catch {
    return [];
  }
}

/** キューに1件追加 */
export function enqueue(item: Omit<OfflineQueueItem, "id" | "queuedAt">): OfflineQueueItem {
  const newItem: OfflineQueueItem = {
    ...item,
    id: crypto.randomUUID(),
    queuedAt: Date.now(),
  };
  const queue = getQueue();
  queue.push(newItem);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  return newItem;
}

/** 指定IDの1件を削除 */
export function dequeue(id: string): void {
  const queue = getQueue().filter((item) => item.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

/** キュー全件クリア */
export function clearQueue(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** キュー件数 */
export function getQueueCount(): number {
  return getQueue().length;
}
