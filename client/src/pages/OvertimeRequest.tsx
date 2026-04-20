import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Clock, Plus, ChevronDown, ChevronUp } from "lucide-react";

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

// 10分単位の時刻選択肢（00:00〜23:50）
const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 10) {
    TIME_OPTIONS.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
}

function timeStrToTs(dateStr: string, timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date(`${dateStr}T00:00:00+09:00`);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

// 今日の日付を "YYYY-MM-DD" で返す（JST）
function todayStr(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

// 現在時刻に近い10分単位の時刻を返す
function nearestTimeStr(): string {
  const now = new Date();
  const h = now.getHours();
  const m = Math.ceil(now.getMinutes() / 10) * 10;
  if (m >= 60) return `${String(h + 1).padStart(2, "0")}:00`;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default function OvertimeRequest() {
  const { user } = useAuth();

  // フォーム state
  const [applicationDate, setApplicationDate] = useState(todayStr);
  const [startTime, setStartTime] = useState(nearestTimeStr);
  const [endTime, setEndTime] = useState(() => {
    const near = nearestTimeStr();
    const [h, m] = near.split(":").map(Number);
    const nextM = m + 30;
    if (nextM >= 60) return `${String(h + 1).padStart(2, "0")}:${String(nextM - 60).padStart(2, "0")}`;
    return `${String(h).padStart(2, "0")}:${String(nextM).padStart(2, "0")}`;
  });
  const [reason, setReason] = useState("");
  const [showForm, setShowForm] = useState(false);

  // 自分の申請一覧
  const { data: myRequests, refetch } = trpc.overtime.getMine.useQuery();

  // 申請作成
  const createMutation = trpc.overtime.create.useMutation({
    onSuccess: () => {
      toast.success("残業申請を送信しました。特級管理者に通知されます。");
      setShowForm(false);
      setReason("");
      refetch();
    },
    onError: (e) => {
      toast.error(`申請に失敗しました: ${e.message}`);
    },
  });

  const requestedStartAt = useMemo(
    () => timeStrToTs(applicationDate, startTime),
    [applicationDate, startTime]
  );
  const requestedEndAt = useMemo(
    () => timeStrToTs(applicationDate, endTime),
    [applicationDate, endTime]
  );

  const durationMs = requestedEndAt - requestedStartAt;
  const isValidTime = durationMs > 0;

  function handleSubmit() {
    if (!isValidTime) {
      toast.error("時刻が不正です。終了時刻は開始時刻より後にしてください。");
      return;
    }
    createMutation.mutate({
      applicationDate,
      requestedStartAt,
      requestedEndAt,
      requestedReason: reason.trim() || undefined,
    });
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-4">
      {/* ページタイトル */}
      <div className="flex items-center gap-2 mb-2">
        <Clock className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-bold text-foreground">残業申請</h1>
      </div>

      {/* 申請フォーム */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">新規申請</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowForm((v) => !v)}
              className="text-primary"
            >
              {showForm ? (
                <><ChevronUp className="w-4 h-4 mr-1" />閉じる</>
              ) : (
                <><Plus className="w-4 h-4 mr-1" />申請する</>
              )}
            </Button>
          </div>
        </CardHeader>

        {showForm && (
          <CardContent className="space-y-4">
            {/* 申請日 */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">申請日</label>
              <input
                type="date"
                value={applicationDate}
                onChange={(e) => setApplicationDate(e.target.value)}
                className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* 残業時間 */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">残業時間</label>
              <div className="flex items-center gap-2">
                <select
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="flex-1 border border-border rounded-md px-2 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {TIME_OPTIONS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <span className="text-foreground text-sm">〜</span>
                <select
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="flex-1 border border-border rounded-md px-2 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {TIME_OPTIONS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              {isValidTime && (
                <p className="text-xs text-muted-foreground mt-1">合計：{toHourMin(durationMs)}</p>
              )}
              {!isValidTime && startTime && endTime && (
                <p className="text-xs text-red-500 mt-1">終了時刻は開始時刻より後にしてください</p>
              )}
            </div>

            {/* 理由 */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">理由</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="残業の理由を入力してください（任意）"
                rows={3}
                className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>

            {/* 送信ボタン */}
            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={createMutation.isPending || !isValidTime}
            >
              {createMutation.isPending ? "送信中..." : "申請を送信する"}
            </Button>
          </CardContent>
        )}
      </Card>

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
