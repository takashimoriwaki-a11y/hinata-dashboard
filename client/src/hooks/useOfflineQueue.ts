/**
 * useOfflineQueue - オフラインキューの状態管理と再接続時自動実行フック
 *
 * - オフライン中: enqueueOffline() で操作をキューに保存
 * - 再接続時: flushQueue() でキューを順次実行し toast 通知
 * - グローバルな件数バッジ表示用に queueCount を公開
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getQueue,
  enqueue,
  dequeue,
  getQueueCount,
  type OfflineQueueItem,
  type OfflineOperationType,
} from "@/lib/offlineQueue";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

// tRPC クライアントを直接呼び出すためのフェッチヘルパー
async function callTrpc(type: OfflineOperationType, payload: unknown): Promise<void> {
  const procedureMap: Record<OfflineOperationType, string> = {
    "tasks.create": "tasks.create",
    "messages.create": "messages.create",
    "scheduleChanges.createAndExport": "scheduleChanges.createAndExport",
  };

  const procedure = procedureMap[type];
  const url = `/api/trpc/${procedure}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ json: payload }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${procedure} failed: ${res.status} ${text}`);
  }
}

/** ラベルをオペレーションタイプから生成するヘルパー */
export function makeQueueLabel(type: OfflineOperationType, payload: unknown): string {
  const p = payload as Record<string, unknown>;
  switch (type) {
    case "tasks.create":
      return `タスク追加: ${String(p.text ?? "").slice(0, 30)}`;
    case "messages.create":
      return `メッセージ投稿: ${String(p.text ?? "").slice(0, 30)}`;
    case "scheduleChanges.createAndExport":
      return `変更連絡: ${String(p.patientName ?? p.changeType ?? "").slice(0, 30)}`;
    default:
      return "操作";
  }
}

export function useOfflineQueue() {
  const { isOnline, isOffline } = useNetworkStatus();
  const queryClient = useQueryClient();
  const [queueCount, setQueueCount] = useState(() => getQueueCount());
  const [isFlushing, setIsFlushing] = useState(false);
  const wasOfflineRef = useRef(false);

  // キュー件数を最新化するヘルパー
  const refreshCount = useCallback(() => {
    setQueueCount(getQueueCount());
  }, []);

  // オフライン中に操作をキューに追加
  const enqueueOffline = useCallback(
    (type: OfflineOperationType, payload: unknown): OfflineQueueItem => {
      const label = makeQueueLabel(type, payload);
      const item = enqueue({ type, payload, label });
      refreshCount();
      toast.warning(`オフライン中のため保存しました`, {
        description: `${label} — 再接続時に自動送信されます`,
        duration: 4000,
      });
      return item;
    },
    [refreshCount]
  );

  // キューを順次実行する
  const flushQueue = useCallback(async () => {
    const queue = getQueue();
    if (queue.length === 0) return;

    setIsFlushing(true);
    let successCount = 0;
    let failCount = 0;
    const failedLabels: string[] = [];

    for (const item of queue) {
      try {
        await callTrpc(item.type, item.payload);
        dequeue(item.id);
        successCount++;
      } catch (err) {
        console.error(`[OfflineQueue] Failed to flush ${item.type}:`, err);
        failCount++;
        failedLabels.push(item.label);
      }
    }

    refreshCount();
    setIsFlushing(false);

    // 全クエリを再フェッチして最新状態に
    queryClient.invalidateQueries();

    // 結果を通知
    if (successCount > 0 && failCount === 0) {
      toast.success(`オフライン中の操作を送信しました`, {
        description: `${successCount}件の操作が正常に完了しました`,
        duration: 4000,
      });
    } else if (successCount > 0 && failCount > 0) {
      toast.warning(`一部の操作が失敗しました`, {
        description: `成功: ${successCount}件 / 失敗: ${failCount}件\n失敗: ${failedLabels.join(", ")}`,
        duration: 6000,
      });
    } else if (failCount > 0) {
      toast.error(`オフライン中の操作の送信に失敗しました`, {
        description: failedLabels.join(", "),
        duration: 6000,
      });
    }
  }, [queryClient, refreshCount]);

  // オフライン→オンライン復帰時に自動フラッシュ
  useEffect(() => {
    if (isOffline) {
      wasOfflineRef.current = true;
    } else if (isOnline && wasOfflineRef.current) {
      wasOfflineRef.current = false;
      // 少し待ってから実行（接続安定化のため）
      const timer = setTimeout(() => {
        flushQueue();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isOnline, isOffline, flushQueue]);

  return {
    queueCount,
    isFlushing,
    enqueueOffline,
    flushQueue,
    refreshCount,
  };
}
