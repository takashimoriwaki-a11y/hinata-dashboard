/**
 * useRealtimeSync
 * Server-Sent Events（SSE）を購読し、サーバーからの更新通知を受け取ったら
 * 対応する React Query キャッシュを自動的に無効化するカスタムフック。
 *
 * 使い方:
 *   useRealtimeSync(); // DashboardLayout.tsx など上位コンポーネントで一度だけ呼ぶ
 *
 * iPhone対応（重要）:
 *   - 画面復帰検知（visibilitychange / pageshow / focus）で再接続＆全データ再取得
 *   - 定期Heartbeat監視で切断を早期検知
 *   - オンライン復帰検知（online）で再接続
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
  // チーム目標
  teamGoals: [["teamGoals", "getActive"], ["teamGoals", "getAll"]],
  // 議事録
  minutes: [["minutes", "list"], ["minutes", "uncheckedCount"]],
  // 個人タスク
  personalTasks: [
    ["personalTasks", "getMyTasks"],
    ["personalTasks", "getTodayTasks"],
  ],
  // スケジュールメモ
  scheduleNotes: [["scheduleNotes", "get"], ["scheduleNotes", "getByIds"]],
  // 残業承認
  overtimeApprovals: [
    ["overtime", "getMineByMonth"],
    ["overtime", "getMyApprovedSummary"],
    ["overtime", "getMine"],
    ["overtime", "getAll"],
    ["overtime", "list"],
    ["overtime", "pendingCount"],
  ],
  // 直帰承認
  directReturnApprovals: [
    ["directReturn", "getAll"],
  ],
  // 訪問予定一括割り当て（管理者の入力を職員側でリアルタイム反映）
  dailyVisitAssignments: [
    ["dailyVisitAssignments", "getMine"],
    ["dailyVisitAssignments", "getAllByDate"],
  ],
  // 共有プロンプト（追加・編集・削除・並び替え・選択を全職員に即時反映）
  sharedPrompts: [
    ["sharedPrompts", "getAll"],
    ["sharedPrompts", "getSelectedId"],
    ["sharedPrompts", "getSelectedPsychiatricId"],
  ],
  // 出退勤打刻
  attendance: [
    ["attendance", "today"],
    ["attendance", "getSpreadsheets"],
  ],
  // アルコール検知器
  alcoholDetector: [
    ["alcoholDetector", "getAll"],
    ["alcoholDetector", "getActive"],
  ],
  // 事故対応リンク
  accidentLinks: [
    ["accidentLinks", "getAll"],
  ],
  // タイムシート
  timesheet: [
    ["timesheet", "getAll"],
  ],
  // 月次署名
  monthlySignatures: [
    ["monthlySignature", "get"],
    ["monthlySignature", "adminListWithUnsigned"],
  ],
  // 業務改善意見箱
  improvementSuggestions: [
    ["improvement", "list"],
    ["improvement", "getSpreadsheet"],
  ],
  // 連絡・予定（イレギュラー）
  irregularSchedules: [
    ["irregularSchedules", "list"],
  ],
  // 訪問スロット
  visitSlots: [
    ["visitSlots", "load"],
  ],
  // 訪問カード状態（チェック・バイタル・メモなど）
    visitCardStates: [
      ["visitCardStates", "loadAll"],
    ],
  // ケアプラン開示記録
  carePlanDisclosures: [
    ["carePlanDisclosures", "checkToday"],
  ],
};

// Heartbeat 監視: 最後にイベントを受信した時刻からこの時間が経過したら接続切断と判定
const HEARTBEAT_TIMEOUT_MS = 60 * 1000; // 60秒
// Heartbeat チェック頻度
const HEARTBEAT_CHECK_INTERVAL_MS = 15 * 1000; // 15秒
// 画面復帰時の再接続デバウンス
const RECONNECT_DEBOUNCE_MS = 500;

export function useRealtimeSync() {
  const utils = trpc.useUtils();
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastEventTimeRef = useRef<number>(Date.now());
  const isActiveRef = useRef<boolean>(true);

  // utils の最新参照を useRef で保持
  const utilsRef = useRef(utils);
  useEffect(() => {
    utilsRef.current = utils;
  });

  useEffect(() => {
    isActiveRef.current = true;

    /**
     * 全クエリキャッシュを無効化（再接続時のデータ取りこぼし対策）
     */
    function invalidateAll() {
      Object.keys(EVENT_QUERY_MAP).forEach((eventName) => {
        const keys = EVENT_QUERY_MAP[eventName];
        keys.forEach((key) => {
          try {
            const [router, procedure] = key;
            // @ts-expect-error dynamic key access
            utilsRef.current[router]?.[procedure]?.invalidate?.();
          } catch {
            // 無視
          }
        });
      });
    }

    /**
     * SSE接続を確立する
     */
    function connect() {
      if (!isActiveRef.current) return;

      // 既存接続があれば先にクローズ
      if (esRef.current) {
        try { esRef.current.close(); } catch {}
        esRef.current = null;
      }

      const es = new EventSource("/api/events");
      esRef.current = es;
      lastEventTimeRef.current = Date.now();

      es.addEventListener("connected", () => {
        console.log("[SSE] 接続確立");
        lastEventTimeRef.current = Date.now();
        // 接続確立時に全データを再取得（取りこぼし対策）
        invalidateAll();
      });

      // 各イベントを購読してキャッシュを無効化
      Object.keys(EVENT_QUERY_MAP).forEach((eventName) => {
        es.addEventListener(eventName, () => {
          lastEventTimeRef.current = Date.now();
          const keys = EVENT_QUERY_MAP[eventName];
          keys.forEach((key) => {
            try {
              const [router, procedure] = key;
              // @ts-expect-error dynamic key access
              utilsRef.current[router]?.[procedure]?.invalidate?.();
            } catch {
              // 無効化失敗は無視
            }
          });
        });
      });

      // Heartbeatイベント（サーバーからの定期ping）
      es.addEventListener("heartbeat", () => {
        lastEventTimeRef.current = Date.now();
      });

      es.onerror = () => {
        console.warn("[SSE] エラー検出、再接続予約");
        if (esRef.current) {
          try { esRef.current.close(); } catch {}
          esRef.current = null;
        }
        // 5秒後に再接続
        if (isActiveRef.current) {
          if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = setTimeout(connect, 5000);
        }
      };
    }

    /**
     * Heartbeatチェック: 一定時間イベントがなければ接続切断と判定して再接続
     */
    function startHeartbeatCheck() {
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = setInterval(() => {
        if (!isActiveRef.current) return;
        const elapsed = Date.now() - lastEventTimeRef.current;
        if (elapsed > HEARTBEAT_TIMEOUT_MS) {
          console.warn(`[SSE] ${Math.floor(elapsed / 1000)}秒イベントなし、再接続`);
          lastEventTimeRef.current = Date.now(); // 再接続検知のループ防止
          connect();
        }
      }, HEARTBEAT_CHECK_INTERVAL_MS);
    }

    /**
     * 画面復帰時の処理：SSE接続を確認し、必要なら再接続
     */
    function handleResume(reason: string) {
      if (!isActiveRef.current) return;
      console.log(`[SSE] 画面復帰検知: ${reason}`);
      // デバウンス（短時間で複数のイベントが発火するため）
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(() => {
        // 接続状態を確認
        const es = esRef.current;
        const isConnected = es && es.readyState === EventSource.OPEN;
        if (!isConnected) {
          console.log("[SSE] 切断状態、再接続");
          connect();
        } else {
          // 接続中でも、念のため全データを再取得（バックグラウンド中の取りこぼし対策）
          console.log("[SSE] 接続中、データのみ再取得");
          invalidateAll();
        }
      }, RECONNECT_DEBOUNCE_MS);
    }

    // 初回接続
    connect();
    startHeartbeatCheck();

    // 画面復帰系イベントの登録
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        handleResume("visibilitychange");
      }
    };
    const onPageShow = () => handleResume("pageshow");
    const onFocus = () => handleResume("focus");
    const onOnline = () => handleResume("online");

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);

    return () => {
      isActiveRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      esRef.current?.close();
      esRef.current = null;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 初回マウント時のみ
}
