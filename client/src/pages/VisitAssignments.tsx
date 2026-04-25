/**
 * 訪問予定一括割り当てページ（管理者+特級管理者専用）
 * 全職員分の今日の訪問予定をテキストで一括入力 → AI解析 → 各職員のアカウントに保存
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles, AlertCircle, CheckCircle2, X, Calendar } from "lucide-react";
import { toast } from "sonner";

type ParsedAssignment = {
  userId: number | null;
  userName: string;
  matched: boolean;
  visits: Array<{
    patientId: number | null;
    patientName: string;
    team: string | null;
    nextVisitDate: string;
    nextVisitTime: string;
    matched: boolean;
  }>;
};

export default function VisitAssignments() {
  const [text, setText] = useState("");
  const [previewData, setPreviewData] = useState<{
    assignments: ParsedAssignment[];
    stats: { totalUsers: number; totalVisits: number; unmatchedUsers: number; unmatchedPatients: number };
  } | null>(null);

  // 今日の日付
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const [date, setDate] = useState(todayStr);

  const utils = trpc.useUtils();

  const parseMutation = trpc.dailyVisitAssignments.bulkParse.useMutation({
    onSuccess: (data) => {
      setPreviewData(data);
      if (data.stats.unmatchedUsers > 0 || data.stats.unmatchedPatients > 0) {
        toast.warning(`プレビュー作成完了（職員未マッチ: ${data.stats.unmatchedUsers}名 / 利用者未マッチ: ${data.stats.unmatchedPatients}名）`);
      } else {
        toast.success(`プレビュー作成完了（${data.stats.totalUsers}名 / ${data.stats.totalVisits}件）`);
      }
    },
    onError: (err) => toast.error(`AI解析エラー: ${err.message}`),
  });

  const assignMutation = trpc.dailyVisitAssignments.bulkAssign.useMutation({
    onSuccess: (data) => {
      toast.success(`✅ ${data.userCount}名の職員に合計${data.insertedCount}件の訪問予定を割り当てました`);
      setText("");
      setPreviewData(null);
      utils.dailyVisitAssignments.getAllByDate.invalidate({ date });
    },
    onError: (err) => toast.error(`割り当てエラー: ${err.message}`),
  });

  const handleParse = () => {
    if (!text.trim()) {
      toast.warning("テキストを入力してください");
      return;
    }
    parseMutation.mutate({ text });
  };

  const handleAssign = () => {
    if (!previewData) return;
    // 未マッチの職員は除外
    const validAssignments = previewData.assignments
      .filter(a => a.userId !== null)
      .map(a => ({
        userId: a.userId!,
        userName: a.userName,
        visits: a.visits,
      }));
    if (validAssignments.length === 0) {
      toast.error("マッチした職員がいません");
      return;
    }
    if (!window.confirm(`${date}の${validAssignments.length}名分の訪問予定を割り当てます。\n（既存の割り当ては上書きされます）よろしいですか？`)) {
      return;
    }
    assignMutation.mutate({ date, assignments: validAssignments });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            訪問予定一括割り当て
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground space-y-1">
            <p>📋 全職員分の訪問予定を一括入力 → AI解析 → 各職員のアカウントに保存します</p>
            <p>💡 各職員はログイン時に訪問タブで自動的に予定が反映されます</p>
            <p className="text-amber-600 dark:text-amber-400">⚠️ 既存の割り当ては<strong>上書き</strong>されます</p>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">対象日付</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="text-sm border rounded-md px-3 py-2 bg-background"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">
              訪問予定テキスト
            </label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`例:
【森本智保】
1. 田中花子 次回5/8 14:00
2. 佐藤太郎 次回5/10 9:30

【西原ゆかり】
1. 鈴木一郎 次回5/8 10:00
2. 高橋誠一`}
              rows={10}
              className="text-sm font-mono"
              disabled={parseMutation.isPending}
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              onClick={handleParse}
              disabled={parseMutation.isPending || !text.trim()}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              {parseMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-1 animate-spin" />解析中...</>
              ) : (
                <><Sparkles className="w-4 h-4 mr-1" />AI解析してプレビュー</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* プレビュー */}
      {previewData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>プレビュー</span>
              <button
                onClick={() => setPreviewData(null)}
                className="p-1 hover:bg-muted rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* 統計 */}
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
                職員 {previewData.stats.totalUsers}名
              </span>
              <span className="px-2 py-1 rounded bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
                訪問予定 {previewData.stats.totalVisits}件
              </span>
              {previewData.stats.unmatchedUsers > 0 && (
                <span className="px-2 py-1 rounded bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300">
                  職員未マッチ {previewData.stats.unmatchedUsers}名
                </span>
              )}
              {previewData.stats.unmatchedPatients > 0 && (
                <span className="px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300">
                  利用者未マッチ {previewData.stats.unmatchedPatients}名
                </span>
              )}
            </div>

            {/* 職員ごとのプレビュー */}
            <div className="space-y-3">
              {previewData.assignments.map((a, i) => (
                <div
                  key={i}
                  className={`border rounded-lg p-3 ${
                    a.matched ? "border-border" : "border-red-300 dark:border-red-700 bg-red-50/50 dark:bg-red-900/10"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {a.matched ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-600" />
                    )}
                    <span className="font-semibold">{a.userName}</span>
                    {!a.matched && (
                      <span className="text-xs px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300">
                        職員不明（保存スキップ）
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {a.visits.length}件
                    </span>
                  </div>
                  <div className="space-y-1 pl-6">
                    {a.visits.map((v, j) => (
                      <div
                        key={j}
                        className={`flex items-center gap-2 text-sm ${
                          !v.matched ? "text-amber-700 dark:text-amber-400" : ""
                        }`}
                      >
                        <span className="text-xs text-muted-foreground w-5">{j + 1}.</span>
                        <span className="font-medium">{v.patientName}</span>
                        {v.team && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted">
                            {v.team}
                          </span>
                        )}
                        {!v.matched && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
                            未マッチ
                          </span>
                        )}
                        {v.nextVisitDate && (
                          <span className="text-xs text-muted-foreground ml-auto">
                            次回: {v.nextVisitDate}
                            {v.nextVisitTime === "unspecified" ? "（時間未定）" : v.nextVisitTime ? ` ${v.nextVisitTime}` : ""}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* 確定ボタン */}
            <div className="flex gap-2 justify-end pt-2 border-t">
              <Button
                variant="outline"
                onClick={() => setPreviewData(null)}
                disabled={assignMutation.isPending}
              >
                キャンセル
              </Button>
              <Button
                onClick={handleAssign}
                disabled={assignMutation.isPending}
                className="bg-primary"
              >
                {assignMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-1 animate-spin" />割り当て中...</>
                ) : (
                  <>{previewData.assignments.filter(a => a.userId !== null).length}名に割り当てる</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
