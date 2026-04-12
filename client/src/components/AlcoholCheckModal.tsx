/**
 * AlcoholCheckModal - アルコールチェック記録入力モーダル
 * 出勤・退勤時のアルコールチェック記録を入力してスプレッドシートに転記する
 */
import { useState, useEffect } from "react";
import { Car, Shield, X, Loader2, CheckCircle2, ChevronDown } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

interface AlcoholCheckModalProps {
  /** 出勤時か退勤時か */
  clockType: "clock_in" | "clock_out";
  onClose: () => void;
}

export function AlcoholCheckModal({ clockType, onClose }: AlcoholCheckModalProps) {
  const isClockIn = clockType === "clock_in";
  const { user } = useAuth();
  const utils = trpc.useUtils();

  // フォーム状態
  const [numberPlate, setNumberPlate] = useState("");
  const [confirmMethod, setConfirmMethod] = useState<"online" | "face">("online");
  const [detectorUsed, setDetectorUsed] = useState(true);
  const [alcoholDetected, setAlcoholDetected] = useState(false);
  const [confirmerName, setConfirmerName] = useState("森脇崇");
  const [notes, setNotes] = useState("");

  // ユーザーのナンバープレートを自動取得
  useEffect(() => {
    if ((user as any)?.numberPlate) {
      setNumberPlate((user as any).numberPlate);
    }
  }, [user]);

  const alcoholCheckMutation = trpc.attendance.saveAlcoholCheck.useMutation({
    onSuccess: () => {
      toast.success("アルコールチェックを記録しました");
      void utils.attendance.today.invalidate();
      onClose();
    },
    onError: (e) => {
      toast.error(`記録に失敗しました: ${e.message}`);
    },
  });

  const handleSubmit = () => {
    if (!numberPlate.trim()) {
      toast.error("ナンバープレートを入力してください");
      return;
    }
    alcoholCheckMutation.mutate({
      clockType,
      numberPlate: numberPlate.trim(),
      confirmMethod,
      detectorUsed,
      alcoholDetected,
      confirmerName,
      notes: notes.trim() || undefined,
    });
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
          <div className="flex items-center gap-2.5 text-white">
            <Shield className="w-5 h-5" />
            <div>
              <p className="text-base font-bold leading-tight">アルコールチェック</p>
              <p className="text-xs text-white/80">{isClockIn ? "出勤時" : "退勤時"}の記録</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/20"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* スクロール可能なフォーム */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4" style={{ WebkitOverflowScrolling: "touch" }}>

          {/* ナンバープレート */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              <Car className="w-3.5 h-3.5 inline mr-1 mb-0.5" />
              ナンバープレート
            </label>
            <input
              type="text"
              value={numberPlate}
              onChange={(e) => setNumberPlate(e.target.value)}
              placeholder="例: 大和 300 あ 1234"
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-blue-400"
              style={{ fontSize: "16px" }}
            />
            {(user as any)?.numberPlate && (
              <p className="text-xs text-gray-400 mt-1">
                ※ アカウントに登録されたナンバープレートを自動入力しました
              </p>
            )}
          </div>

          {/* 確認方法 */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              確認方法
            </label>
            <div className="flex gap-2">
              {(["online", "face"] as const).map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setConfirmMethod(method)}
                  className={`flex-1 py-2.5 text-sm font-medium rounded-xl border-2 transition-all ${
                    confirmMethod === method
                      ? isClockIn
                        ? "bg-red-500 border-red-500 text-white shadow-sm"
                        : "bg-blue-500 border-blue-500 text-white shadow-sm"
                      : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-300"
                  }`}
                >
                  {method === "online" ? "オンライン画面" : "対面"}
                </button>
              ))}
            </div>
          </div>

          {/* 検知器使用 */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              検知器使用
            </label>
            <div className="flex gap-2">
              {([true, false] as const).map((used) => (
                <button
                  key={String(used)}
                  type="button"
                  onClick={() => setDetectorUsed(used)}
                  className={`flex-1 py-2.5 text-sm font-medium rounded-xl border-2 transition-all ${
                    detectorUsed === used
                      ? isClockIn
                        ? "bg-red-500 border-red-500 text-white shadow-sm"
                        : "bg-blue-500 border-blue-500 text-white shadow-sm"
                      : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-300"
                  }`}
                >
                  {used ? "使用" : "未使用"}
                </button>
              ))}
            </div>
          </div>

          {/* 酒気帯び有無 */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              酒気帯び
            </label>
            <div className="flex gap-2">
              {([false, true] as const).map((detected) => (
                <button
                  key={String(detected)}
                  type="button"
                  onClick={() => setAlcoholDetected(detected)}
                  className={`flex-1 py-2.5 text-sm font-medium rounded-xl border-2 transition-all ${
                    alcoholDetected === detected
                      ? detected
                        ? "bg-amber-500 border-amber-500 text-white shadow-sm"
                        : isClockIn
                          ? "bg-red-500 border-red-500 text-white shadow-sm"
                          : "bg-blue-500 border-blue-500 text-white shadow-sm"
                      : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-300"
                  }`}
                >
                  {detected ? "有" : "無"}
                </button>
              ))}
            </div>
            {alcoholDetected && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5 font-medium">
                ⚠️ 酒気帯びが検知されました。安全管理者に報告してください。
              </p>
            )}
          </div>

          {/* 確認者 */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              確認者（安全運転管理者）
            </label>
            <div className="relative">
              <select
                value={confirmerName}
                onChange={(e) => setConfirmerName(e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-blue-400 appearance-none pr-8"
              >
                <option value="森脇崇">森脇崇（安全運転管理者）</option>
                <option value="森脇英樹">森脇英樹（代理）</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* 備考 */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              備考（任意）
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="特記事項があれば入力"
              rows={2}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-blue-400 resize-none"
            />
          </div>
        </div>

        {/* フッター */}
        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0 space-y-2">
          <button
            type="button"
            disabled={alcoholCheckMutation.isPending}
            onClick={handleSubmit}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
              isClockIn
                ? "bg-red-500 hover:bg-red-600 shadow-md active:scale-95"
                : "bg-blue-500 hover:bg-blue-600 shadow-md active:scale-95"
            }`}
          >
            {alcoholCheckMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                記録中...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                記録してスプレッドシートに転記
              </>
            )}
          </button>
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
