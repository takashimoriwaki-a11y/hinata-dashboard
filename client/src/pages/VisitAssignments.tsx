/**
 * 訪問予定一括割り当てページ（管理者+特級管理者専用）
 * 全職員分の訪問予定をテキストで一括入力 → 解析 → 各職員のアカウントに保存
 * 【職員名】形式はブラウザ側でルール解析（サーバーAI待ちで固まらない）
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

type RawVisit = { patientName: string; nextVisitDate: string; nextVisitTime: string };
type RawAssignment = { userName: string; visits: RawVisit[] };

function normalizeName(s: string): string {
  return s.replace(/[\s　]/g, "");
}

function parseNextVisitFields(line: string, year: number): RawVisit {
  let rest = line
    .replace(/^\s*(?:\d+[\.\)、．]|[・\-＊*])\s*/, "")
    .replace(/様\s*$/, "")
    .trim();
  let nextVisitDate = "";
  let nextVisitTime = "";

  const nextMatch = rest.match(/次回\s*(\d{1,2})[\/／月](\d{1,2})日?(?:\s*[　 ]*(\d{1,2})[:：時](\d{0,2})分?)?/);
  if (nextMatch) {
    const m = Number(nextMatch[1]);
    const d = Number(nextMatch[2]);
    nextVisitDate = `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (nextMatch[3] != null) {
      const hh = String(Number(nextMatch[3])).padStart(2, "0");
      const mm = nextMatch[4] ? String(Number(nextMatch[4])).padStart(2, "0") : "00";
      nextVisitTime = `${hh}:${mm}`;
    }
    rest = rest.slice(0, nextMatch.index).trim();
  } else {
    const unspec = rest.match(/次回\s*(未定|不明)/);
    if (unspec) {
      nextVisitTime = "unspecified";
      rest = rest.slice(0, unspec.index).trim();
    }
  }

  return {
    patientName: rest.replace(/\s+/g, " ").trim(),
    nextVisitDate,
    nextVisitTime,
  };
}

/** 【職員名】形式をルール解析 */
function parseRuleBased(text: string, year: number): RawAssignment[] {
  const blocks = text.split(/(?=【[^】]+】)/).map((b) => b.trim()).filter(Boolean);
  const assignments: RawAssignment[] = [];
  for (const block of blocks) {
    const header = block.match(/^【([^】]+)】/);
    if (!header) continue;
    const userName = header[1].trim();
    const body = block.slice(header[0].length);
    const visits: RawVisit[] = [];
    for (const rawLine of body.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      if (!/^(?:\d+[\.\)、．]|[・\-＊*])/.test(line) && !/次回/.test(line)) continue;
      const v = parseNextVisitFields(line, year);
      if (!v.patientName) continue;
      visits.push(v);
    }
    assignments.push({ userName, visits });
  }
  return assignments;
}

function matchAssignments(
  raw: RawAssignment[],
  staffList: Array<{ id: number; name: string }>,
  patientList: Array<{ id: number; name: string; team: string | null; active?: number | null }>,
): {
  assignments: ParsedAssignment[];
  stats: { totalUsers: number; totalVisits: number; unmatchedUsers: number; unmatchedPatients: number };
} {
  const activePatients = patientList.filter((p) => p.active == null || p.active === 1);
  let unmatchedUsers = 0;
  let unmatchedPatients = 0;
  let totalVisits = 0;

  const assignments = raw.map((a) => {
    const aNorm = normalizeName(a.userName);
    let matchedUser = staffList.find((u) => u.name === a.userName);
    if (!matchedUser) {
      matchedUser = staffList.find((u) => normalizeName(u.name) === aNorm);
    }
    if (!matchedUser) {
      matchedUser = staffList.find((u) => {
        const uNorm = normalizeName(u.name);
        return uNorm.includes(aNorm) || aNorm.includes(uNorm);
      });
    }
    if (!matchedUser) unmatchedUsers++;

    const visits = a.visits.map((v) => {
      const vNorm = normalizeName(v.patientName);
      let matchedPatient = activePatients.find((p) => p.name === v.patientName);
      if (!matchedPatient) {
        matchedPatient = activePatients.find((p) => normalizeName(p.name) === vNorm);
      }
      if (!matchedPatient) {
        matchedPatient = activePatients.find((p) => {
          const pNorm = normalizeName(p.name);
          return pNorm.includes(vNorm) || vNorm.includes(pNorm);
        });
      }
      if (!matchedPatient) unmatchedPatients++;
      totalVisits++;
      return {
        patientId: matchedPatient?.id ?? null,
        patientName: matchedPatient?.name ?? v.patientName,
        team: matchedPatient?.team ?? null,
        nextVisitDate: v.nextVisitDate || "",
        nextVisitTime: v.nextVisitTime || "",
        matched: !!matchedPatient,
      };
    });

    return {
      userId: matchedUser?.id ?? null,
      userName: matchedUser?.name ?? a.userName,
      matched: !!matchedUser,
      visits,
    };
  });

  return {
    assignments,
    stats: {
      totalUsers: raw.length,
      totalVisits,
      unmatchedUsers,
      unmatchedPatients,
    },
  };
}

export default function VisitAssignments() {
  const [text, setText] = useState("");
  const [previewData, setPreviewData] = useState<{
    assignments: ParsedAssignment[];
    stats: { totalUsers: number; totalVisits: number; unmatchedUsers: number; unmatchedPatients: number };
  } | null>(null);
  const [localParsing, setLocalParsing] = useState(false);

  // 今日の日付
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const [date, setDate] = useState(todayStr);

  const utils = trpc.useUtils();
  const { data: staffList = [] } = trpc.staff.listForForm.useQuery();
  const { data: patientList = [] } = trpc.patients.listAll.useQuery({});

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

  const isParsing = localParsing || parseMutation.isPending;

  const handleParse = () => {
    if (!text.trim()) {
      toast.warning("テキストを入力してください");
      return;
    }

    const year = new Date().getFullYear();
    const raw = parseRuleBased(text, year);

    // 【職員名】形式ならサーバーAIを呼ばず即プレビュー
    if (raw.length > 0) {
      setLocalParsing(true);
      try {
        if (staffList.length === 0 || patientList.length === 0) {
          toast.error("職員・利用者一覧の読み込み中です。数秒後にもう一度押してください");
          return;
        }
        const matched = matchAssignments(raw, staffList, patientList);
        setPreviewData(matched);
        if (matched.stats.unmatchedUsers > 0 || matched.stats.unmatchedPatients > 0) {
          toast.warning(`プレビュー作成完了（職員未マッチ: ${matched.stats.unmatchedUsers}名 / 利用者未マッチ: ${matched.stats.unmatchedPatients}名）`);
        } else {
          toast.success(`プレビュー作成完了（${matched.stats.totalUsers}名 / ${matched.stats.totalVisits}件）`);
        }
      } finally {
        setLocalParsing(false);
      }
      return;
    }

    // 【職員名】形式でない場合のみサーバーAIへ
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
            <p>📋 全職員分の訪問予定を一括入力 → 解析 → 各職員のアカウントに保存します</p>
            <p>💡 【職員名】形式はすぐプレビューできます（AI待ちしません）</p>
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
              disabled={isParsing}
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              onClick={handleParse}
              disabled={isParsing || !text.trim()}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              {isParsing ? (
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
