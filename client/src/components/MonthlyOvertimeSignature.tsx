/**
 * MonthlyOvertimeSignature - 職員本人による月次残業内容の確認・電子署名コンポーネント
 *
 * 機能：
 * - 1ヶ月分の残業申請・承認結果を一覧表示
 * - 内容確認後に電子署名（確認チェックボックス + 署名ボタン）
 * - 署名済みは管理画面からも確認可能
 */
import { useState, useMemo } from "react";
import {
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  PenLine,
  AlertCircle,
  FileCheck,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

// 残業ステータスの表示ラベル
const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "承認待ち", color: "text-amber-600 bg-amber-50 dark:bg-amber-950 dark:text-amber-400" },
  approved: { label: "承認済み", color: "text-green-600 bg-green-50 dark:bg-green-950 dark:text-green-400" },
  rejected: { label: "却下", color: "text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400" },
};

function formatTime(ms: number | null | undefined): string {
  if (!ms) return "-";
  return new Date(ms).toLocaleTimeString("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function calcMinutes(startMs: number | null | undefined, endMs: number | null | undefined): string {
  if (!startMs || !endMs) return "-";
  const diff = endMs - startMs;
  if (diff <= 0) return "-";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return h > 0 ? `${h}時間${m > 0 ? m + "分" : ""}` : `${m}分`;
}

interface MonthlyOvertimeSignatureProps {
  /** 表示する年（省略時は現在の年） */
  defaultYear?: number;
  /** 表示する月（省略時は現在の月） */
  defaultMonth?: number;
}

export function MonthlyOvertimeSignature({ defaultYear, defaultMonth }: MonthlyOvertimeSignatureProps) {
  const { user } = useAuth();
  const now = new Date();

  // デフォルトは今月
  const [year, setYear] = useState(defaultYear ?? now.getFullYear());
  const [month, setMonth] = useState(defaultMonth ?? (now.getMonth() + 1));
  const [confirmed, setConfirmed] = useState(false);
  const [comment, setComment] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);

  // 翌月以降は署名不可
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const isCurrentOrFuture = year > currentYear || (year === currentYear && month > currentMonth);

  // 残業申請一覧（当月分）
  const { data: overtimeList = [], isLoading: overtimeLoading } = trpc.overtime.getMineByMonth.useQuery(
    { year, month },
    { enabled: !!user }
  );

  // 月次署名の取得
  const { data: signature, refetch: refetchSignature } = trpc.monthlySignature.get.useQuery(
    { targetYear: year, targetMonth: month },
    { enabled: !!user }
  );

  // 署名mutation
  const signMutation = trpc.monthlySignature.sign.useMutation({
    onSuccess: () => {
      toast.success(`${year}年${month}月分の残業内容に署名しました`);
      void refetchSignature();
      setConfirmed(false);
      setComment("");
    },
    onError: (e) => {
      toast.error(`署名に失敗しました: ${e.message}`);
    },
  });

  // 年月選択肢（当月以前のみ）
  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    return [current - 1, current];
  }, []);

  const monthOptions = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);

  // 承認済み残業の合計時間
  const totalApprovedMinutes = useMemo(() => {
    return overtimeList
      .filter((r) => r.status === "approved")
      .reduce((sum, r) => {
        const start = r.adjustedStartAt ?? r.requestedStartAt;
        const end = r.adjustedEndAt ?? r.requestedEndAt;
        return sum + Math.max(0, end - start);
      }, 0);
  }, [overtimeList]);

  const totalApprovedHours = Math.floor(totalApprovedMinutes / 3600000);
  const totalApprovedMins = Math.floor((totalApprovedMinutes % 3600000) / 60000);

  const handleSign = () => {
    if (!confirmed) {
      toast.error("内容を確認してチェックボックスにチェックを入れてください");
      return;
    }
    signMutation.mutate({ targetYear: year, targetMonth: month, comment: comment.trim() || undefined });
  };

  const isSigned = !!signature;
  const isAlreadySigned = isSigned;

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
      {/* ヘッダー */}
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <FileCheck className="w-5 h-5 text-blue-600" />
          <span className="font-semibold text-card-foreground text-sm">残業署名</span>
          {isAlreadySigned && (
            <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 dark:bg-green-950 dark:text-green-400 px-2 py-0.5 rounded-full">
              <CheckCircle2 className="w-3 h-3" />
              署名済み
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-border px-4 py-4 space-y-4">
          {/* 年月選択 */}
          <div className="flex items-center gap-2">
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="text-sm border border-border rounded-lg px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}年</option>
              ))}
            </select>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="text-sm border border-border rounded-lg px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {monthOptions.map((m) => (
                <option key={m} value={m}>{m}月</option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">の残業内容</span>
          </div>

          {/* 残業一覧 */}
          {overtimeLoading ? (
            <div className="text-center py-4 text-sm text-muted-foreground">読み込み中...</div>
          ) : overtimeList.length === 0 ? (
            <div className="text-center py-4 text-sm text-muted-foreground">
              {year}年{month}月の残業申請はありません
            </div>
          ) : (
            <div className="space-y-2">
              {overtimeList.map((record) => {
                const status = STATUS_LABELS[record.status] ?? { label: record.status, color: "text-muted-foreground bg-muted" };
                const effectiveStart = record.adjustedStartAt ?? record.requestedStartAt;
                const effectiveEnd = record.adjustedEndAt ?? record.requestedEndAt;
                const wasAdjusted = record.adjustedStartAt != null || record.adjustedEndAt != null;
                return (
                  <div key={record.id} className="border border-border rounded-lg p-3 bg-muted/30">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-foreground">{record.applicationDate}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.color}`}>
                        {status.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span>
                        {formatTime(effectiveStart)} 〜 {formatTime(effectiveEnd)}
                        （{calcMinutes(effectiveStart, effectiveEnd)}）
                      </span>
                      {wasAdjusted && (
                        <span className="text-amber-600 text-xs">※調整済み</span>
                      )}
                    </div>
                    {record.requestedReason && (
                      <div className="text-xs text-muted-foreground mt-1">理由：{record.requestedReason}</div>
                    )}
                    {record.approverComment && (
                      <div className="text-xs text-blue-600 mt-1">承認者コメント：{record.approverComment}</div>
                    )}
                    {record.approverName && (
                      <div className="text-xs text-muted-foreground mt-1">承認者：{record.approverName}</div>
                    )}
                  </div>
                );
              })}

              {/* 合計 */}
              <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-950 rounded-lg px-3 py-2">
                <span className="text-xs font-medium text-blue-700 dark:text-blue-300">承認済み残業合計</span>
                <span className="text-sm font-bold text-blue-700 dark:text-blue-300">
                  {totalApprovedHours > 0 ? `${totalApprovedHours}時間` : ""}
                  {totalApprovedMins > 0 ? `${totalApprovedMins}分` : ""}
                  {totalApprovedHours === 0 && totalApprovedMins === 0 ? "0分" : ""}
                </span>
              </div>
            </div>
          )}

          {/* 署名済み表示 */}
          {isAlreadySigned && signature && (
            <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-sm font-semibold text-green-700 dark:text-green-400">署名済み</span>
              </div>
              <div className="text-xs text-green-600 dark:text-green-400">
                署名日時：{new Date(signature.signedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
              </div>
              {signature.comment && (
                <div className="text-xs text-green-600 dark:text-green-400 mt-1">コメント：{signature.comment}</div>
              )}
              {signature.adminConfirmed ? (
                <div className="text-xs text-green-700 dark:text-green-300 mt-1 font-medium">
                  ✓ 管理者確認済み（{signature.adminConfirmerName}）
                </div>
              ) : (
                <div className="text-xs text-amber-600 mt-1">管理者確認待ち</div>
              )}
              <button
                type="button"
                onClick={() => {
                  setConfirmed(false);
                  setComment("");
                  signMutation.mutate({ targetYear: year, targetMonth: month, comment: comment.trim() || undefined });
                }}
                className="mt-2 text-xs text-blue-600 underline"
              >
                再署名する
              </button>
            </div>
          )}

          {/* 当月以降は署名不可メッセージ */}
          {isCurrentOrFuture && (
            <div className="flex items-start gap-2 bg-muted rounded-lg p-3 border border-border">
              <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <p className="text-xs text-muted-foreground">
                {year}年{month}月分の署名は、翌月以降に行うことができます。
              </p>
            </div>
          )}

          {/* 署名フォーム（未署名時のみ表示・当月以降は非表示） */}
          {!isAlreadySigned && !isCurrentOrFuture && overtimeList.length > 0 && (
            <div className="space-y-3 border-t border-border pt-3">
              {/* 注意事項 */}
              <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  上記の{year}年{month}月分の残業内容を確認の上、署名してください。
                  署名後は管理者が確認します。内容に相違がある場合は管理者にお知らせください。
                </p>
              </div>

              {/* コメント入力 */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  コメント（任意）
                </label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="内容に関するコメントがあれば入力してください"
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  rows={2}
                />
              </div>

              {/* 確認チェックボックス */}
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-border text-blue-600 focus:ring-primary"
                />
                <span className="text-xs text-foreground">
                  {year}年{month}月分の残業内容を確認しました。
                  上記の内容に同意し、電子署名します。
                </span>
              </label>

              {/* 署名ボタン */}
              <button
                type="button"
                onClick={handleSign}
                disabled={!confirmed || signMutation.isPending}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: confirmed ? '#2563eb' : undefined,
                  color: confirmed ? 'white' : undefined,
                }}
              >
                <PenLine className="w-4 h-4" />
                {signMutation.isPending ? "署名中..." : `${year}年${month}月分に署名する`}
              </button>
            </div>
          )}

          {/* 残業申請がない月の署名フォーム（当月以降は非表示） */}
          {!isAlreadySigned && !isCurrentOrFuture && overtimeList.length === 0 && !overtimeLoading && (
            <div className="space-y-3 border-t border-border pt-3">
              <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-950 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  {year}年{month}月は残業申請がありません。
                  残業なしとして署名することができます。
                </p>
              </div>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-border text-blue-600 focus:ring-primary"
                />
                <span className="text-xs text-foreground">
                  {year}年{month}月は残業なしであることを確認しました。
                </span>
              </label>
              <button
                type="button"
                onClick={handleSign}
                disabled={!confirmed || signMutation.isPending}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: confirmed ? '#2563eb' : undefined,
                  color: confirmed ? 'white' : undefined,
                }}
              >
                <PenLine className="w-4 h-4" />
                {signMutation.isPending ? "署名中..." : `${year}年${month}月分に署名する（残業なし）`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
