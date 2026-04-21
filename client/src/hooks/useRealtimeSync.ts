/**
 * useRealtimeSync
 * Server-Sent Events（SSE）を購読し、サーバーからの更新通知を受け取ったら
 * 対応する React Query キャッシュを自動的に無効化するカスタムフック。
 *
 * 使い方:
 *   useRealtimeSync(); // DashboardLayout.tsx など上位コンポーネントで一度だけ呼ぶ
 */

import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";

// SSEイベント名 → 無効化するtRPCクエリキーのマッピング
// キーはサーバー側の broadcastEvent(eventName) と一致させること
const EVENT_QUERY_MAP: Record<string, string[][]> = {
  // タスク
  tasks: [["tasks", "getMine"], ["tasks", "getAll"], ["tasks", "getByPatientName"]],
  // 申し送りメッセージ
  messages: [["messages", "getActive"], ["messages", "getPending"]],
  // スケジュールコメント
  scheduleComments: [
    ["schedules", "getComments"],
    ["schedules", "getCommentCounts"],
  ],
  // 訪問記録（次回訪問日時）
  visitRecords: [["visitRecords", "getMine"], ["visitRecords", "getAll"]],
  // 変更連絡
  scheduleChanges: [["scheduleChanges", "list"]],
  // スケジュールスクリーンショット
  schedules: [["schedule", "getAll"], ["schedule", "getUploadLogs"]],
  // 利用者
  patients: [["patients", "list"], ["patients", "listAll"]],
  // スタッフ
  staff: [["staff", "list"]],
  // マイリンク
  myLinks: [["myLinks", "list"]],
  // スプレッドシートリンク
  spreadsheetLinks: [["spreadsheetLinks", "list"]],
  // クイックアクセスリンク
  quickAccessLinks: [["quickAccessLinks", "list"]],
  // 設定
  settings: [["settings", "getSheetCleanupDays"]],
  // 通知
  notifications: [["notifications", "list"]],
  // ユーザー情報
  users: [["user", "getMyTeam"]],
  // チームツール
  teamTools: [["teamTools", "list"]],
  // 議事録
  minutes: [["minutes", "list"], ["minutes", "uncheckedCount"]],
  // 個人タスク
  personalTasks: [
    ["personalTasks", "getMyTasks"],
    ["personalTasks", "getTodayTasks"],
  ],
  // スケジュールメモ
  scheduleNotes: [["scheduleNotes", "get"], ["scheduleNotes", "getByIds"]],
  // 残業承認（承認・修正承認・却下後に月次残業確認モーダルをリアルタイム更新）
  overtimeApprovals: [
    ["overtime", "getMineByMonth"],
    ["overtime", "getMyApprovedSummary"],
    ["overtime", "list"],
    ["overtime", "pendingCount"],
  ],
};

export function useRealtimeSync() {
  const utils = trpc.useUtils();
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // utils の最新参照を useRef で保持することで、
  // useEffect の依存配列から utils を除外し、無限ループを防ぐ
  const utilsRef = useRef(utils);
  useEffect(() => {
    utilsRef.current = utils;
  });

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
            try {
              const [router, procedure] = key;
              // @ts-expect-error dynamic key access
              utilsRef.current[router]?.[procedure]?.invalidate?.();
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 初回マウント時のみ接続（utils は utilsRef 経由で常に最新を参照）
}
