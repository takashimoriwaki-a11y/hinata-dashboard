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
  isClockAction?: boolean; // 打刻アクション（最後のステップ）
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
    description: "前日までの日報確認と本日のアルコールチェック",
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
    description: "ボタンを押すと出勤打刻が完了します",
    isClockAction: true,
  },
];

const CLOCK_OUT_STEPS: ClockInStep[] = [
  {
    id: "ibow_out",
    label: "ibow 退勤打刻",
    description: "ibowで退勤打刻を行う",
    link: {
      url: "https://login.ibowservice.jp/",
      label: "ibowを開く",
    },
  },
  {
    id: "kintai_out",
    label: "ひなた勤怠スプレッドシートへ記入（必要時）",
    description: "正確な退勤時間をひなた勤怠スプレッドシートに記入する（必要な場合のみ）",
    link: {
      url: "https://docs.google.com/spreadsheets/d/1e5xvZHvqSneNZIsO1g8h68-Ue9QnoYXCdCPkt-pIwsQ/edit?usp=sharing",
      label: "ひなた勤怠を開く",
    },
  },
  {
    id: "daily_report_out",
    label: "業務日報のアルコールチェック記入",
    description: "業務日報に退勤時のアルコールチェック結果を記入する",
    link: {
      url: `https://docs.google.com/spreadsheets/d/${DAILY_REPORT_SPREADSHEET_ID}/edit`,
      label: "業務日報を開く",
      isDailyReport: true,
    },
  },
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
    description: "ボタンを押すと退勤打刻が完了します",
    isClockAction: true,
  },
];

interface AttendanceCheckModalProps {
  type: "clock_in" | "clock_out";
  onConfirm: () => void;
  onClose: () => void;
}

export function AttendanceCheckModal({ type, onConfirm, onClose }: AttendanceCheckModalProps) {
  const isClockIn = type === "clock_in";
  const steps = isClockIn ? CLOCK_IN_STEPS : CLOCK_OUT_STEPS;

  const [done, setDone] = useState<Record<string, boolean>>({});
  const [openingStepId, setOpeningStepId] = useState<string | null>(null);
  const [clockingNow, setClockingNow] = useState(false);

  const utils = trpc.useUtils();

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

  // ステップのボタンを押す
  const handleStepButton = async (step: ClockInStep) => {
    if (step.isClockAction) {
      setClockingNow(true);
      onConfirm();
      setTimeout(() => {
        setClockingNow(false);
        onClose();
      }, 800);
      return;
    }
    if (!step.link) return;
    if (step.link.isDailyReport) {
      await openDailyReport(step);
    } else {
      openLink(step);
    }
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
        style={{ maxHeight: "min(90dvh, 90vh)" }}
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
              {isClockIn ? "出勤前の確認手順" : "退勤前の確認手順"}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 手順リスト（スクロール可能） */}
        <div
          className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-3"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            各ボタンを押して手順を実行してください。
          </p>

          {steps.map((step, index) => {
            const isDone = done[step.id] || (step.isClockAction && clockingNow);
            const isLocked = step.isClockAction && !allNonClockDone;
            const isOpening = openingStepId === step.id;

            return (
              <div
                key={step.id}
                className={`rounded-xl border transition-all duration-300 ${
                  isDone
                    ? "border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950/30"
                    : isLocked
                    ? "border-gray-200 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-800/30 opacity-50"
                    : "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50"
                }`}
              >
                <div className="px-4 py-3 flex items-start gap-3">
                  {/* 完了アイコン or ステップ番号 */}
                  <div className="mt-0.5 flex-shrink-0 w-6 h-6 flex items-center justify-center">
                    {isDone ? (
                      <CheckCircle2 className="w-6 h-6 text-green-500" />
                    ) : (
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          isLocked
                            ? "bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500"
                            : isClockIn
                            ? "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"
                            : "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400"
                        }`}
                      >
                        {index + 1}
                      </span>
                    )}
                  </div>

                  {/* テキスト */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-semibold leading-snug ${
                        isDone
                          ? "text-green-700 dark:text-green-400 line-through"
                          : isLocked
                          ? "text-gray-400 dark:text-gray-600"
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
                {!isDone && (
                  <div className="px-4 pb-3 pt-0">
                    {step.isClockAction ? (
                      // 打刻ボタン
                      <button
                        type="button"
                        disabled={isLocked || clockingNow}
                        onClick={() => void handleStepButton(step)}
                        className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white text-sm font-bold transition-all duration-200 ${
                          isLocked || clockingNow
                            ? "bg-gray-300 dark:bg-gray-700 cursor-not-allowed"
                            : isClockIn
                            ? "bg-red-500 hover:bg-red-600 shadow-md active:scale-95"
                            : "bg-blue-500 hover:bg-blue-600 shadow-md active:scale-95"
                        }`}
                      >
                        {clockingNow ? (
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
                    ) : (
                      // 外部リンクボタン
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
                        {step.link?.label}
                      </button>
                    )}
                  </div>
                )}

                {/* 完了済みメッセージ（打刻以外） */}
                {isDone && !step.isClockAction && (
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
              上の手順を全て実行すると打刻ボタンが押せます
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
