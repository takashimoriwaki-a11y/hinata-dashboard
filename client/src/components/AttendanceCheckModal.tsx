import { useState } from "react";
import { CheckCircle2, Circle, ExternalLink, LogIn, LogOut, X, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

const DAILY_REPORT_SPREADSHEET_ID = "10Leb7UR6ARVlCGbf5pBa5yxsgm5WAV9m-ETyYrzfBCs";

// 出勤・退勤の手順ステップ定義
interface CheckStep {
  id: string;
  label: string;
  description?: string;
  link?: { url: string; label: string; isDailyReport?: boolean };
}

const CLOCK_IN_STEPS: CheckStep[] = [
  {
    id: "mimamodrive_in",
    label: "① みまもドライブ",
    description: "出発前にみまもドライブを起動する",
    link: {
      url: "https://mimamodrive.tokiomarine-smartmobility.co.jp/index.html",
      label: "みまもドライブを開く",
    },
  },
  {
    id: "ibow_in",
    label: "② ibow 打刻・24時間内容確認",
    description: "ibowで出勤打刻を行い、24時間以内の記録内容を確認する",
    link: {
      url: "https://login.ibowservice.jp/",
      label: "ibowを開く",
    },
  },
  {
    id: "daily_report_in",
    label: "③ 業務日報（内容確認・アルコールチェック記入）",
    description: "業務日報を確認し、アルコールチェックの結果を記入する",
    link: {
      url: `https://docs.google.com/spreadsheets/d/${DAILY_REPORT_SPREADSHEET_ID}/edit`,
      label: "業務日報を開く",
      isDailyReport: true,
    },
  },
];

const CLOCK_OUT_STEPS: CheckStep[] = [
  {
    id: "ibow_out",
    label: "① ibow 打刻（必要時は勤怠スプレッドシートへ正確な退勤時間を記入）",
    description: "ibowで退勤打刻を行う。正確な退勤時間が必要な場合はひなた勤怠スプレッドシートにも記入する",
    link: {
      url: "https://login.ibowservice.jp/",
      label: "ibowを開く",
    },
  },
  {
    id: "kintai_out",
    label: "　　ひなた勤怠スプレッドシートへ記入（必要時）",
    description: "正確な退勤時間をひなた勤怠スプレッドシートに記入する（必要な場合のみ）",
    link: {
      url: "https://docs.google.com/spreadsheets/d/1e5xvZHvqSneNZIsO1g8h68-Ue9QnoYXCdCPkt-pIwsQ/edit?usp=sharing",
      label: "ひなた勤怠を開く",
    },
  },
  {
    id: "daily_report_out",
    label: "② 業務日報のアルコールチェック記入",
    description: "業務日報に退勤時のアルコールチェック結果を記入する",
    link: {
      url: `https://docs.google.com/spreadsheets/d/${DAILY_REPORT_SPREADSHEET_ID}/edit`,
      label: "業務日報を開く",
      isDailyReport: true,
    },
  },
  {
    id: "mimamodrive_out",
    label: "③ 自宅到着時にみまもドライブ",
    description: "自宅に到着したらみまもドライブを停止する",
    link: {
      url: "https://mimamodrive.tokiomarine-smartmobility.co.jp/index.html",
      label: "みまもドライブを開く",
    },
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
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [openingStepId, setOpeningStepId] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const allChecked = steps.every((s) => checked[s.id]);

  const toggleCheck = (id: string) => {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleLinkClick = async (
    e: React.MouseEvent<HTMLAnchorElement>,
    step: CheckStep
  ) => {
    if (!step.link) return;

    // 業務日報の場合は日付対応のGIDを取得してから開く
    if (step.link.isDailyReport) {
      e.preventDefault();
      setOpeningStepId(step.id);
      try {
        const result = await utils.spreadsheetLinks.getDailyReportSheetGid.fetch();
        const url =
          result.gid !== null
            ? `https://docs.google.com/spreadsheets/d/${DAILY_REPORT_SPREADSHEET_ID}/edit#gid=${result.gid}`
            : step.link.url;
        window.open(url, "_blank", "noopener,noreferrer");
      } catch {
        window.open(step.link.url, "_blank", "noopener,noreferrer");
      } finally {
        setOpeningStepId(null);
      }
    }
    // チェックも自動でONにする
    toggleCheck(step.id);
  };

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    // 画面全体を覆うオーバーレイ（ポインターイベントはオーバーレイ背景のみ）
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* 背景オーバーレイ（クリックで閉じる・スクロールは通さない） */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* モーダル本体：最大高さを設定してモーダル内部でスクロール */}
      <div
        className="relative w-full sm:max-w-md mx-0 sm:mx-4 bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
        style={{
          maxHeight: "min(90dvh, 90vh)",
        }}
      >
        {/* ヘッダー（固定） */}
        <div
          className={`px-5 py-4 flex items-center justify-between flex-shrink-0 rounded-t-2xl ${
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

        {/* 手順リスト（スクロール可能エリア） */}
        <div
          className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-3"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            以下の手順を確認し、チェックを入れてから打刻してください。
          </p>
          {steps.map((step) => (
            <div
              key={step.id}
              className={`rounded-xl border transition-all duration-200 ${
                checked[step.id]
                  ? "border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950/30"
                  : "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50"
              }`}
            >
              {/* チェックボックス行 */}
              <button
                type="button"
                onClick={() => toggleCheck(step.id)}
                className="w-full flex items-start gap-3 px-4 py-3 text-left"
              >
                <span className="mt-0.5 flex-shrink-0">
                  {checked[step.id] ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  ) : (
                    <Circle className="w-5 h-5 text-gray-400" />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-semibold leading-snug ${
                      checked[step.id]
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
              </button>

              {/* リンクボタン */}
              {step.link && (
                <div className="px-4 pb-3 pt-0">
                  <a
                    href={step.link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => handleLinkClick(e, step)}
                    className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg transition-colors ${
                      openingStepId === step.id ? "opacity-60 cursor-wait" : ""
                    } ${
                      isClockIn
                        ? "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-900/60"
                        : "bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/60"
                    }`}
                  >
                    {openingStepId === step.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <ExternalLink className="w-3 h-3" />
                    )}
                    {step.link.label}
                  </a>
                </div>
              )}
            </div>
          ))}
          {/* 下部に余白を追加してフッターに隠れないようにする */}
          <div className="h-2" />
        </div>

        {/* フッター（固定） */}
        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex flex-col gap-2 flex-shrink-0">
          {/* 全チェック前の注意 */}
          {!allChecked && (
            <p className="text-center text-xs text-gray-400 dark:text-gray-500">
              全ての手順を確認してからボタンが押せます
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className={`flex-1 py-3 rounded-xl text-white text-sm font-bold transition-all duration-200 ${
                allChecked
                  ? isClockIn
                    ? "bg-red-500 hover:bg-red-600 shadow-md"
                    : "bg-blue-500 hover:bg-blue-600 shadow-md"
                  : "bg-gray-300 dark:bg-gray-700 cursor-not-allowed"
              }`}
              disabled={!allChecked}
            >
              {isClockIn ? "出勤打刻する" : "退勤打刻する"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
