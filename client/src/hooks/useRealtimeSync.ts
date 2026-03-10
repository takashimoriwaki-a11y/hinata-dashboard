/**
 * useRealtimeSync
 * Server-Sent Events（SSE）を購読し、サーバーからの更新通知を受け取ったら
 * 対応する React Query キャッシュを自動的に無効化するカスタムフック。
 *
 * 使い方:
 *   useRealtimeSync(); // App.tsx や DashboardLayout.tsx など上位コンポーネントで一度だけ呼ぶ
 */

import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";

// SSEイベント名 → 無効化するtRPCクエリキーのマッピング
const EVENT_QUERY_MAP: Record<string, string[][]> = {
  tasks: [["tasks", "getMine"], ["tasks", "getAll"]],
  messages: [["messages", "getActive"], ["messages", "getPending"]],
  scheduleComments: [["schedules", "getComments"], ["schedules", "getCommentCounts"]],
  visitRecords: [["visitRecords", "getMine"], ["visitRecords", "getAll"]],
  scheduleChanges: [["scheduleChanges", "list"]],
};

export function useRealtimeSync() {
  const utils = trpc.useUtils();
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;

    function connect() {
      if (!active) return;

      const es = new EventSource("/api/events");
      esRef.current = es;

      es.addEventListener("connected", () => {
        console.log("[SSE] 接続確立");
      });

      // 各イベントを購読してキャッシュを無効化
      Object.keys(EVENT_QUERY_MAP).forEach((eventName) => {
        es.addEventListener(eventName, () => {
          const keys = EVENT_QUERY_MAP[eventName];
          keys.forEach((key) => {
            // tRPC utils の invalidate は queryKey 配列で指定
            // 例: utils.tasks.getMine.invalidate()
            try {
              const [router, procedure] = key;
              // @ts-expect-error dynamic key access
              utils[router]?.[procedure]?.invalidate?.();
            } catch {
              // 無効化失敗は無視（ページが未マウントの場合など）
            }
          });
        });
      });

      es.onerror = () => {
        es.close();
        esRef.current = null;
        // 5秒後に再接続
        if (active) {
          reconnectTimerRef.current = setTimeout(connect, 5000);
        }
      };
    }

    connect();

    return () => {
      active = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      esRef.current?.close();
      esRef.current = null;
    };
  }, [utils]);
}
