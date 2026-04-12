import { useState } from "react";
import { CheckCircle2, ExternalLink, LogIn, LogOut, X, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

const DAILY_REPORT_SPREADSHEET_ID = "10Leb7UR6ARVlCGbf5pBa5yxsgm5WAV9m-ETyYrzfBCs";

// 出勤・退勤の手順ステップ定義
interface ClockInStep {
  id: string;
  label: string;
  description?: string;
  link?: { url: string; label: string; isDailyReport?: boolean };
  isClockAction?: boolean;
}

const CLOCK_IN_STEPS: ClockInStep[] = [
  {
    id: "mimamodrive_in",
    label: "みまもドライブ",
    description: "出発前にみまもドライブを起動する",
    link: {
      url: "https://mimamodrive.tokiomarine-smartmobility.co.jp/index.html",
      label: "みまもドライブを開く",
    },
  },
  {
    id: "daily_report_in",
    label: "業務日報",
    description: "前日までの記録確認",
    link: {
      url: `https://docs.google.com/spreadsheets/d/${DAILY_REPORT_SPREADSHEET_ID}/edit`,
      label: "業務日報を開く",
      isDailyReport: true,
    },
  },
  {
    id: "ibow_in",
    label: "ibow 24時間体制の記録確認",
    description: "ibowで24時間体制の記録内容を確認する",
    link: {
      url: "https://login.ibowservice.jp/",
      label: "ibowを開く",
    },
  },
  {
    id: "clock_action",
    label: "出勤打刻",
    description: "上の手順を全て完了したら出勤打刻する",
    isClockAction: true,
  },
];

const CLOCK_OUT_STEPS: ClockInStep[] = [
  {
    id: "mimamodrive_out",
    label: "自宅到着時にみまもドライブを停止",
    description: "自宅に到着したらみまもドライブを停止する",
    link: {
      url: "https://mimamodrive.tokiomarine-smartmobility.co.jp/index.html",
      label: "みまもドライブを開く",
    },
  },
  {
    id: "clock_action",
    label: "退勤打刻",
    description: "上の手順を全て完了したら退勤打刻する",
    isClockAction: true,
  },
];

interface AttendanceCheckModalProps {
  type: "clock_in" | "clock_out";
  onClose: () => void;
  onConfirm?: () => void;
}

export function AttendanceCheckModal({ type, onClose }: AttendanceCheckModalProps) {
  const isClockIn = type === "clock_in";
  const steps = isClockIn ? CLOCK_IN_STEPS : CLOCK_OUT_STEPS;
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [openingStepId, setOpeningStepId] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const clockMutation = trpc.attendance.clock.useMutation({
    onSuccess: () => {
      void utils.attendance.today.invalidate();
      onClose();
    },
    onError: (e) => {
      alert(`打刻に失敗しました: ${e.message}`);
    },
  });

  // 非打刻ステップが全て完了しているか
  const nonClockSteps = steps.filter((s) => !s.isClockAction);
  const allNonClockDone = nonClockSteps.every((s) => done[s.id]);

  // 業務日報リンクを開く（日付対応GID取得）
  const openDailyReport = async (step: ClockInStep) => {
    if (!step.link) return;
    setOpeningStepId(step.id);
    const newWindow = window.open("about:blank", "_blank");
    try {
      const result = await utils.spreadsheetLinks.getDailyReportSheetGid.fetch();
      const url =
        result.gid !== null
          ? `https://docs.google.com/spreadsheets/d/${DAILY_REPORT_SPREADSHEET_ID}/edit#gid=${result.gid}`
          : step.link.url;
      if (newWindow) {
        newWindow.location.href = url;
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch {
      if (newWindow) {
        newWindow.location.href = step.link.url;
      } else {
        window.open(step.link.url, "_blank", "noopener,noreferrer");
      }
    } finally {
      setOpeningStepId(null);
    }
    setDone((prev) => ({ ...prev, [step.id]: true }));
  };

  // 通常リンクを開く
  const openLink = (step: ClockInStep) => {
    if (!step.link) return;
    window.open(step.link.url, "_blank", "noopener,noreferrer");
    setDone((prev) => ({ ...prev, [step.id]: true }));
  };

  // ステップのボタンを押す（打刻以外）
  const handleStepButton = async (step: ClockInStep) => {
    if (!step.link) return;
    if (step.link.isDailyReport) {
      await openDailyReport(step);
    } else {
      openLink(step);
    }
  };

  // 打刻実行（シンプル打刻のみ）
  const handleClock = () => {
    if (clockMutation.isPending) return;
    clockMutation.mutate({ type });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* 背景オーバーレイ */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* モーダル本体 */}
      <div
        className="relative w-full sm:max-w-md mx-0 sm:mx-4 bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
        style={{ maxHeight: "min(92dvh, 92vh)" }}
      >
        {/* ヘッダー */}
        <div
          className={`px-5 py-4 flex items-center justify-between flex-shrink-0 rounded-t-2xl sm:rounded-t-2xl ${
            isClockIn
              ? "bg-gradient-to-r from-red-500 to-rose-600"
              : "bg-gradient-to-r from-blue-500 to-indigo-600"
          }`}
        >
          <div className="flex items-center gap-2 text-white">
            {isClockIn ? (
              <LogIn className="w-5 h-5" />
            ) : (
              <LogOut className="w-5 h-5" />
            )}
            <span className="text-lg font-bold">
              {isClockIn ? "出勤前の確認" : "退勤前の確認"}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/20"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* スクロール可能なコンテンツ */}
        <div
          className="overflow-y-auto flex-1 py-2"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {steps.map((step) => {
            const isDone = done[step.id];
            const isOpening = openingStepId === step.id;

            if (step.isClockAction) {
              // 打刻ステップ（シンプル）
              return (
                <div
                  key={step.id}
                  className={`mx-3 my-2 rounded-xl border-2 transition-all duration-200 ${
                    allNonClockDone
                      ? isClockIn
                        ? "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30"
                        : "border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30"
                      : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 opacity-60"
                  }`}
                >
                  <div className="flex items-start gap-3 px-4 pt-3 pb-2">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        isClockIn
                          ? "bg-red-100 dark:bg-red-900/40"
                          : "bg-blue-100 dark:bg-blue-900/40"
                      }`}
                    >
                      {isClockIn ? (
                        <LogIn className="w-4 h-4 text-red-600 dark:text-red-400" />
                      ) : (
                        <LogOut className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold leading-snug ${isClockIn ? "text-red-700 dark:text-red-300" : "text-blue-700 dark:text-blue-300"}`}>
                        {step.label}
                      </p>
                      {step.description && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {step.description}
                        </p>
                      )}
                    </div>
                  </div>
                  {/* 打刻ボタン */}
                  <div className="px-4 pb-4 pt-1">
                    <button
                      type="button"
                      disabled={!allNonClockDone || clockMutation.isPending}
                      onClick={handleClock}
                      className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                        isClockIn
                          ? "bg-red-500 hover:bg-red-600 shadow-md active:scale-95"
                          : "bg-blue-500 hover:bg-blue-600 shadow-md active:scale-95"
                      }`}
                    >
                      {clockMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          打刻中...
                        </>
                      ) : (
                        <>
                          {isClockIn ? (
                            <LogIn className="w-4 h-4" />
                          ) : (
                            <LogOut className="w-4 h-4" />
                          )}
                          {isClockIn ? "出勤打刻する" : "退勤打刻する"}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            }

            // 通常ステップ
            return (
              <div
                key={step.id}
                className={`mx-3 my-2 rounded-xl border transition-all duration-200 ${
                  isDone
                    ? "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30"
                    : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                }`}
              >
                <div className="flex items-start gap-3 px-4 py-3">
                  {/* アイコン */}
                  <div className="flex-shrink-0 mt-0.5">
                    {isDone ? (
                      <CheckCircle2 className="w-6 h-6 text-green-500" />
                    ) : (
                      <div
                        className={`w-6 h-6 rounded-full ${
                          isClockIn
                            ? "bg-red-100 dark:bg-red-900/40"
                            : "bg-blue-100 dark:bg-blue-900/40"
                        }`}
                      />
                    )}
                  </div>
                  {/* テキスト */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-semibold leading-snug ${
                        isDone
                          ? "text-green-700 dark:text-green-400 line-through"
                          : "text-gray-800 dark:text-gray-200"
                      }`}
                    >
                      {step.label}
                    </p>
                    {step.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
                        {step.description}
                      </p>
                    )}
                  </div>
                </div>
                {/* アクションボタン */}
                {!isDone && step.link && (
                  <div className="px-4 pb-3 pt-0">
                    <button
                      type="button"
                      disabled={isOpening}
                      onClick={() => void handleStepButton(step)}
                      className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg transition-colors ${
                        isOpening ? "opacity-60 cursor-wait" : ""
                      } ${
                        isClockIn
                          ? "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-900/60"
                          : "bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/60"
                      }`}
                    >
                      {isOpening ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <ExternalLink className="w-3 h-3" />
                      )}
                      {step.link.label}
                    </button>
                  </div>
                )}
                {/* 完了済みメッセージ */}
                {isDone && (
                  <div className="px-4 pb-3 pt-0">
                    <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                      ✓ 完了
                    </span>
                  </div>
                )}
              </div>
            );
          })}
          <div className="h-2" />
        </div>

        {/* フッター */}
        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
          {!allNonClockDone && (
            <p className="text-center text-xs text-gray-400 dark:text-gray-500 mb-2">
              上の手順を全て実行すると打刻ボタンが有効になります
            </p>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
