import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Clock, CheckCircle, XCircle, ChevronDown, ChevronUp, PenLine } from "lucide-react";

function toTimeStr(ts: number): string {
  return new Date(ts).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  });
}

function toHourMin(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min}分`;
  return `${Math.floor(min / 60)}時間${min % 60 > 0 ? `${min % 60}分` : ""}`;
}

function statusLabel(status: string) {
  if (status === "approved") return { label: "承認済み", color: "bg-green-500 text-white" };
  if (status === "rejected") return { label: "却下", color: "bg-red-500 text-white" };
  return { label: "申請中", color: "bg-yellow-500 text-white" };
}

// 今月の YYYY-MM を返す
function currentYearMonth(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 7);
}

// 時刻の選択肢を生成（00:00〜23:50、10分単位）
function generateTimeOptions(): string[] {
  const opts: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 10) {
      opts.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return opts;
}
const TIME_OPTIONS = generateTimeOptions();

// タイムスタンプ（ms）を "HH:MM" 文字列に変換（JST）
function tsToHHMM(ts: number): string {
  const d = new Date(ts);
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const h = String(jst.getUTCHours()).padStart(2, "0");
  const m = String(Math.floor(jst.getUTCMinutes() / 10) * 10).padStart(2, "0");
  return `${h}:${m}`;
}

// "HH:MM" 文字列と applicationDate "YYYY-MM-DD" からタイムスタンプ（ms）を生成（JST）
function hhmmToTs(hhMM: string, applicationDate: string): number {
  const [h, m] = hhMM.split(":").map(Number);
  const [year, month, day] = applicationDate.split("-").map(Number);
  // JSTでの日時をUTCタイムスタンプに変換
  return Date.UTC(year, month - 1, day, h - 9, m, 0, 0);
}

interface ApproveDialogProps {
  request: {
    id: number;
    applicantName: string;
    applicationDate: string;
    requestedStartAt: number;
    requestedEndAt: number;
    requestedReason?: string | null;
  };
  onClose: () => void;
  onDone: () => void;
}

function ApproveDialog({ request, onClose, onDone }: ApproveDialogProps) {
  const [comment, setComment] = useState("");
  // 承認残業時間（修正承認用）：申請通りの時刻で初期化
  const [adjStart, setAdjStart] = useState(() => tsToHHMM(request.requestedStartAt));
  const [adjEnd, setAdjEnd] = useState(() => tsToHHMM(request.requestedEndAt));

  const approveMutation = trpc.overtime.approve.useMutation({
    onSuccess: (_, vars) => {
      if (vars.status === "approved" && vars.adjustedStartAt) {
        toast.success("残業申請を修正承認しました（スプレッドシートに転記）");
      } else if (vars.status === "approved") {
        toast.success("残業申請を承認しました（スプレッドシートに転記）");
      } else {
        toast.success("残業申請を却下しました");
      }
      onDone();
    },
    onError: (e) => {
      toast.error(`操作に失敗しました: ${e.message}`);
    },
  });

  // 承認：申請通りの時間でスプレッドシートに転記
  function handleApprove() {
    approveMutation.mutate({
      id: request.id,
      status: "approved",
      approverComment: comment.trim() || undefined,
    });
  }

  // 修正承認：入力した時間でスプレッドシートに転記
  function handleAdjustedApprove() {
    const adjStartTs = hhmmToTs(adjStart, request.applicationDate);
    const adjEndTs = hhmmToTs(adjEnd, request.applicationDate);
    if (adjEndTs <= adjStartTs) {
      toast.error("終了時刻は開始時刻より後に設定してください");
      return;
    }
    approveMutation.mutate({
      id: request.id,
      status: "approved",
      adjustedStartAt: adjStartTs,
      adjustedEndAt: adjEndTs,
      approverComment: comment.trim() || undefined,
    });
  }

  // 却下：スプレッドシートに却下として転記
  function handleReject() {
    approveMutation.mutate({
      id: request.id,
      status: "rejected",
      approverComment: comment.trim() || undefined,
    });
  }

  const adjDuration = useMemo(() => {
    const startTs = hhmmToTs(adjStart, request.applicationDate);
    const endTs = hhmmToTs(adjEnd, request.applicationDate);
    if (endTs <= startTs) return null;
    return toHourMin(endTs - startTs);
  }, [adjStart, adjEnd, request.applicationDate]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-background rounded-xl shadow-xl w-full max-w-sm p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-base font-bold text-foreground">残業申請の承認</h2>

        {/* 申請内容 */}
        <div className="bg-muted/40 rounded-lg p-3 space-y-1 text-sm text-foreground">
          <p><span className="text-muted-foreground">申請者：</span><span className="font-semibold">{request.applicantName}</span></p>
          <p><span className="text-muted-foreground">申請日：</span>{request.applicationDate}</p>
          <p>
            <span className="text-muted-foreground">申請時間：</span>
            {toTimeStr(request.requestedStartAt)}〜{toTimeStr(request.requestedEndAt)}
            <span className="text-muted-foreground ml-1">（{toHourMin(request.requestedEndAt - request.requestedStartAt)}）</span>
          </p>
          {request.requestedReason && (
            <p><span className="text-muted-foreground">理由：</span>{request.requestedReason}</p>
          )}
        </div>

        {/* 承認残業時間（修正承認用） */}
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-foreground">
            承認残業時間
            <span className="text-xs font-normal text-muted-foreground ml-1">（「修正承認」時に使用）</span>
          </label>
          <div className="flex items-center gap-2">
            <select
              value={adjStart}
              onChange={(e) => setAdjStart(e.target.value)}
              className="flex-1 border border-border rounded-md px-2 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {TIME_OPTIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <span className="text-muted-foreground text-sm font-medium">〜</span>
            <select
              value={adjEnd}
              onChange={(e) => setAdjEnd(e.target.value)}
              className="flex-1 border border-border rounded-md px-2 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {TIME_OPTIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          {adjDuration ? (
            <p className="text-xs text-muted-foreground">承認時間：{adjDuration}</p>
          ) : (
            <p className="text-xs text-red-500">終了時刻は開始時刻より後に設定してください</p>
          )}
        </div>

        {/* コメント */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">コメント（任意）</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="承認・却下の理由など"
            rows={2}
            className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
        </div>

        {/* ボタン */}
        <div className="space-y-2">
          {/* 承認：申請通りの時間で転記 */}
          <Button
            className="w-full bg-green-500 hover:bg-green-600 text-white"
            onClick={handleApprove}
            disabled={approveMutation.isPending}
          >
            <CheckCircle className="w-4 h-4 mr-1.5" />
            承認（申請通り転記）
          </Button>

          {/* 修正承認：入力した時間で転記 */}
          <Button
            className="w-full bg-blue-500 hover:bg-blue-600 text-white"
            onClick={handleAdjustedApprove}
            disabled={approveMutation.isPending || !adjDuration}
          >
            <PenLine className="w-4 h-4 mr-1.5" />
            修正承認（上記時間で転記）
          </Button>

          {/* 却下：スプレッドシートに却下として転記 */}
          <Button
            className="w-full bg-red-500 hover:bg-red-600 text-white"
            onClick={handleReject}
            disabled={approveMutation.isPending}
          >
            <XCircle className="w-4 h-4 mr-1.5" />
            却下
          </Button>
        </div>

        <Button variant="outline" className="w-full" onClick={onClose} disabled={approveMutation.isPending}>
          キャンセル
        </Button>
      </div>
    </div>
  );
}

export default function OvertimeAdmin() {
  const [yearMonth, setYearMonth] = useState(currentYearMonth);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [selectedRequest, setSelectedRequest] = useState<null | {
    id: number;
    applicantName: string;
    applicationDate: string;
    requestedStartAt: number;
    requestedEndAt: number;
    requestedReason?: string | null;
  }>(null);

  const { data: requests, refetch } = trpc.overtime.getAll.useQuery({
    yearMonth,
    status: statusFilter,
  });

  // 月選択肢（過去6ヶ月）
  const monthOptions = useMemo(() => {
    const opts: string[] = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
      opts.push(jst.toISOString().slice(0, 7));
    }
    return opts;
  }, []);

  const pendingCount = requests?.filter((r) => r.status === "pending").length ?? 0;

  // 月次集計：承認済みの申請をスタッフ別に集計
  const { data: allApproved } = trpc.overtime.getAll.useQuery({
    yearMonth,
    status: "approved",
  });

  const monthlySummary = useMemo(() => {
    if (!allApproved) return [];
    const map = new Map<string, { name: string; totalMs: number; count: number }>();
    for (const req of allApproved) {
      const key = req.applicantName;
      // 修正承認があればadjustedを優先
      const start = (req as any).adjustedStartAt ?? req.requestedStartAt;
      const end = (req as any).adjustedEndAt ?? req.requestedEndAt;
      const duration = end - start;
      if (!map.has(key)) {
        map.set(key, { name: req.applicantName, totalMs: 0, count: 0 });
      }
      const entry = map.get(key)!;
      entry.totalMs += duration;
      entry.count += 1;
    }
    return Array.from(map.values()).sort((a, b) => b.totalMs - a.totalMs);
  }, [allApproved]);

  const [showSummary, setShowSummary] = useState(false);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      {/* ページタイトル */}
      <div className="flex items-center gap-2 mb-2">
        <Clock className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-bold text-foreground">残業承認</h1>
        {pendingCount > 0 && (
          <Badge className="bg-yellow-500 text-white text-xs">{pendingCount}件 申請中</Badge>
        )}
      </div>

      {/* フィルター */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-2 items-center">
            {/* 月選択 */}
            <select
              value={yearMonth}
              onChange={(e) => setYearMonth(e.target.value)}
              className="border border-border rounded-md px-2 py-1.5 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {monthOptions.map((m) => (
                <option key={m} value={m}>{m.replace("-", "年")}月</option>
              ))}
            </select>

            {/* ステータスフィルター */}
            {(["all", "pending", "approved", "rejected"] as const).map((s) => {
              const labels = { all: "すべて", pending: "申請中", approved: "承認済み", rejected: "却下" };
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    statusFilter === s
                      ? "bg-primary text-white border-primary"
                      : "bg-background text-foreground border-border"
                  }`}
                >
                  {labels[s]}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 月次残業集計 */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              {yearMonth.replace("-", "年")}月の残業集計
            </CardTitle>
            <button
              onClick={() => setShowSummary((v) => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showSummary ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {showSummary ? "折りたたむ" : "表示"}
            </button>
          </div>
        </CardHeader>
        {showSummary && (
          <CardContent>
            {monthlySummary.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">この月の承認済み残業申請はありません</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4 font-medium text-muted-foreground">スタッフ名</th>
                      <th className="text-right py-2 pr-4 font-medium text-muted-foreground">回数</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">合計残業時間</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlySummary.map((row) => (
                      <tr key={row.name} className="border-b border-border/50 last:border-0">
                        <td className="py-2 pr-4 font-medium text-foreground">{row.name}</td>
                        <td className="py-2 pr-4 text-right text-muted-foreground">{row.count}回</td>
                        <td className="py-2 text-right font-semibold text-foreground">{toHourMin(row.totalMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border">
                      <td className="py-2 pr-4 font-semibold text-foreground">合計</td>
                      <td className="py-2 pr-4 text-right font-semibold text-foreground">
                        {monthlySummary.reduce((s, r) => s + r.count, 0)}回
                      </td>
                      <td className="py-2 text-right font-semibold text-primary">
                        {toHourMin(monthlySummary.reduce((s, r) => s + r.totalMs, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* 申請一覧 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            申請一覧
            {requests && <span className="text-sm font-normal text-muted-foreground ml-2">（{requests.length}件）</span>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!requests || requests.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">該当する申請はありません</p>
          ) : (
            <div className="space-y-3">
              {requests.map((req) => {
                const { label, color } = statusLabel(req.status);
                const startStr = toTimeStr(req.requestedStartAt);
                const endStr = toTimeStr(req.requestedEndAt);
                const duration = toHourMin(req.requestedEndAt - req.requestedStartAt);
                const isPending = req.status === "pending";
                // 修正承認時の実際の承認時間
                const adjStart = (req as any).adjustedStartAt;
                const adjEnd = (req as any).adjustedEndAt;
                const hasAdj = adjStart && adjEnd;
                return (
                  <div
                    key={req.id}
                    className={`border rounded-lg p-3 space-y-1.5 ${isPending ? "border-yellow-400 bg-yellow-50 dark:bg-yellow-950/20" : "border-border"}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{req.applicantName}</span>
                        <Badge className={`text-xs ${color}`}>{label}</Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">{req.applicationDate}</span>
                    </div>
                    <p className="text-sm text-foreground">
                      申請：{startStr}〜{endStr}（{duration}）
                    </p>
                    {hasAdj && (
                      <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                        承認：{toTimeStr(adjStart)}〜{toTimeStr(adjEnd)}（{toHourMin(adjEnd - adjStart)}）
                      </p>
                    )}
                    {req.requestedReason && (
                      <p className="text-xs text-muted-foreground">理由：{req.requestedReason}</p>
                    )}
                    {req.approverName && (
                      <p className="text-xs text-muted-foreground">
                        {req.status === "approved" ? "承認者" : "却下者"}：{req.approverName}
                        {req.approverComment && `　コメント：${req.approverComment}`}
                      </p>
                    )}
                    {isPending && (
                      <Button
                        size="sm"
                        className="mt-1 w-full bg-primary hover:bg-primary/90 text-white"
                        onClick={() => setSelectedRequest({
                          id: req.id,
                          applicantName: req.applicantName,
                          applicationDate: req.applicationDate,
                          requestedStartAt: req.requestedStartAt,
                          requestedEndAt: req.requestedEndAt,
                          requestedReason: req.requestedReason,
                        })}
                      >
                        承認・修正承認・却下する
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 承認ダイアログ */}
      {selectedRequest && (
        <ApproveDialog
          request={selectedRequest}
          onClose={() => setSelectedRequest(null)}
          onDone={() => {
            setSelectedRequest(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}
