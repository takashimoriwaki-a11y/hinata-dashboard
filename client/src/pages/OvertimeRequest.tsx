import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";

// 時刻を "HH:MM" に変換
function toTimeStr(ts: number): string {
  return new Date(ts).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  });
}

// 分数を "X時間Y分" に変換
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

export default function OvertimeRequest() {
  // 自分の申請一覧
  const { data: myRequests } = trpc.overtime.getMine.useQuery();

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-4">
      {/* ページタイトル */}
      <div className="flex items-center gap-2 mb-2">
        <Clock className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-bold text-foreground">残業申請</h1>
      </div>

      {/* 自分の申請履歴 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">申請履歴</CardTitle>
        </CardHeader>
        <CardContent>
          {!myRequests || myRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">申請履歴はありません</p>
          ) : (
            <div className="space-y-3">
              {myRequests.map((req) => {
                const { label, color } = statusLabel(req.status);
                const startStr = toTimeStr(req.requestedStartAt);
                const endStr = toTimeStr(req.requestedEndAt);
                const duration = toHourMin(req.requestedEndAt - req.requestedStartAt);
                return (
                  <div key={req.id} className="border border-border rounded-lg p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">{req.applicationDate}</span>
                      <Badge className={`text-xs ${color}`}>{label}</Badge>
                    </div>
                    <p className="text-sm text-foreground">
                      {startStr}〜{endStr}（{duration}）
                    </p>
                    {req.requestedReason && (
                      <p className="text-xs text-muted-foreground">理由：{req.requestedReason}</p>
                    )}
                    {req.approverComment && (
                      <p className="text-xs text-muted-foreground">コメント：{req.approverComment}</p>
                    )}
                    {req.approverName && (
                      <p className="text-xs text-muted-foreground">
                        {req.status === "approved" ? "承認者" : "却下者"}：{req.approverName}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
