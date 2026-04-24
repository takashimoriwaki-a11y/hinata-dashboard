/**
 * DirectReturnApproval - 直帰申請承認画面（管理者用）
 * 管理者（admin/super_admin）が申請一覧を確認し、承認・却下する
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Home, CheckCircle, XCircle, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  });
}

function statusLabel(status: string) {
  if (status === "approved") return { label: "承認済み", color: "bg-green-500 text-white" };
  if (status === "rejected") return { label: "却下", color: "bg-red-500 text-white" };
  return { label: "申請中", color: "bg-yellow-500 text-white" };
}

function currentYearMonth(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 7);
}

export default function DirectReturnApproval() {
  const [selectedYearMonth, setSelectedYearMonth] = useState<string>(currentYearMonth());
  const [filterStatus, setFilterStatus] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [commentById, setCommentById] = useState<Record<number, string>>({});
  const [processingId, setProcessingId] = useState<number | null>(null);

  const { data: requests = [], refetch } = trpc.directReturn.getAll.useQuery({
    yearMonth: selectedYearMonth,
    status: filterStatus,
  });

  // スプレッドシートURL取得
  const { data: sheetInfo } = trpc.directReturn.getSpreadsheetUrl.useQuery();

  const approveMutation = trpc.directReturn.approve.useMutation({
    onSuccess: () => {
      toast.success("申請を処理しました");
      setProcessingId(null);
      refetch();
    },
    onError: (err) => {
      toast.error(`エラー: ${err.message}`);
      setProcessingId(null);
    },
  });

  const handleApprove = (id: number, status: "approved" | "rejected") => {
    setProcessingId(id);
    approveMutation.mutate({
      id,
      status,
      approverComment: commentById[id]?.trim() || undefined,
    });
  };

  // 年月選択肢（過去12ヶ月）
  const yearMonthOptions = useMemo(() => {
    const opts: string[] = [];
    const now = new Date();
    const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    for (let i = 0; i < 12; i++) {
      const d = new Date(jst.getUTCFullYear(), jst.getUTCMonth() - i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      opts.push(`${y}-${m}`);
    }
    return opts;
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      {/* ページタイトル */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Home className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold text-foreground">直帰申請の承認</h1>
        </div>
        {sheetInfo?.url && (
          <a
            href={sheetInfo.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-md transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">スプレッドシート</span>
            <span className="sm:hidden">シート</span>
          </a>
        )}
      </div>

      {/* フィルタ */}
      <Card>
        <CardContent className="py-3 space-y-2">
          <div className="flex gap-2">
            <select
              value={selectedYearMonth}
              onChange={(e) => setSelectedYearMonth(e.target.value)}
              className="flex-1 bg-muted text-foreground rounded-lg px-3 py-2 text-sm border border-border"
            >
              {yearMonthOptions.map((ym) => (
                <option key={ym} value={ym}>{ym}</option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as "pending" | "approved" | "rejected" | "all")}
              className="flex-1 bg-muted text-foreground rounded-lg px-3 py-2 text-sm border border-border"
            >
              <option value="pending">申請中</option>
              <option value="approved">承認済み</option>
              <option value="rejected">却下</option>
              <option value="all">すべて</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* 申請一覧 */}
      <div className="space-y-3">
        {requests.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              該当する申請はありません
            </CardContent>
          </Card>
        ) : (
          requests.map((req) => {
            const { label, color } = statusLabel(req.status);
            const isProcessing = processingId === req.id;
            const canActOn = req.status === "pending";
            return (
              <Card key={req.id} className={cn(
                canActOn ? "border-primary/30" : ""
              )}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{req.applicantName}</CardTitle>
                    <Badge className={`text-xs ${color}`}>{label}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {/* 申請情報 */}
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">申請日</p>
                      <p className="font-medium text-foreground">{req.applicationDate}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">申請時刻</p>
                      <p className="font-medium text-foreground">{formatDateTime(req.appliedAt)}</p>
                    </div>
                  </div>

                  {/* 理由 */}
                  <div>
                    <p className="text-xs text-muted-foreground">理由</p>
                    <p className="text-sm font-medium text-foreground">{req.reasonCategory}</p>
                  </div>

                  {/* 詳細 */}
                  {req.reasonDetail && (
                    <div>
                      <p className="text-xs text-muted-foreground">詳細</p>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{req.reasonDetail}</p>
                    </div>
                  )}

                  {/* 承認者コメント（処理済みの場合） */}
                  {req.approverComment && (
                    <div>
                      <p className="text-xs text-muted-foreground">承認者コメント</p>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{req.approverComment}</p>
                    </div>
                  )}
                  {req.approverName && (
                    <p className="text-xs text-muted-foreground">
                      {req.status === "approved" ? "承認者" : "却下者"}：{req.approverName}
                    </p>
                  )}

                  {/* 承認アクション（pending のみ） */}
                  {canActOn && (
                    <div className="pt-2 space-y-2 border-t border-border">
                      <Textarea
                        value={commentById[req.id] ?? ""}
                        onChange={(e) => setCommentById((prev) => ({ ...prev, [req.id]: e.target.value }))}
                        placeholder="コメント（任意）"
                        rows={2}
                        className="text-sm"
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => handleApprove(req.id, "rejected")}
                          disabled={isProcessing}
                          className="flex-1 text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <><XCircle className="w-4 h-4 mr-1" />却下</>}
                        </Button>
                        <Button
                          onClick={() => handleApprove(req.id, "approved")}
                          disabled={isProcessing}
                          className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                        >
                          {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle className="w-4 h-4 mr-1" />承認</>}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
