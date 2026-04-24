　/**
 * TaskImport - タスク一括取り込み画面（特級管理者専用）
 * TSVデータを貼り付けて tasks テーブルへ一括取り込みする
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Upload, Loader2, CheckCircle2, AlertTriangle, XCircle, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type PreviewRow = {
  lineNo: number;
  no: string;
  kind: string;
  patientRaw: string;
  text: string;
  dueDateRaw: string;
  assigneeRaw: string;
  teamRaw: string;
  parsedDueDate: string | null; // ISO文字列（JSONで来るため）
  matchedPatient: { id: number; name: string; team: string } | null;
  matchedUser: { id: number; name: string } | null;
  matchedTeam: "身体" | "天理" | "郡山北部" | "郡山南部" | null;
  isIndividualTask: boolean;
  warnings: string[];
};

type EditableRow = PreviewRow & {
  // 編集後の値
  editText: string;
  editDueDate: string; // YYYY-MM-DD
  editAssignType: "all" | "team" | "personal";
  editAssignTeam: "身体" | "天理" | "郡山北部" | "郡山南部" | null;
  editAssignUserId: number | null;
  editAssignUserName: string | null;
  editPatientName: string | null;
  include: boolean; // 取り込むか
};

function dateToIsoString(d: Date | null): string {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function TaskImport() {
  const [tsv, setTsv] = useState("");
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [summary, setSummary] = useState<{
    patientMatched: number;
    patientUnmatched: number;
    individualTasks: number;
    assigneeMatched: number;
    dateParsed: number;
  } | null>(null);

  const previewMutation = trpc.taskImport.preview.useMutation({
    onSuccess: (data) => {
      const editableRows: EditableRow[] = data.rows.map((r: PreviewRow) => {
        const dueDate = r.parsedDueDate ? new Date(r.parsedDueDate) : null;
        // assignTypeの初期値を推定
        let initAssignType: "all" | "team" | "personal" = "all";
        if (r.matchedUser) initAssignType = "personal";
        else if (r.isIndividualTask && r.matchedTeam) initAssignType = "team";

        return {
          ...r,
          editText: r.text,
          editDueDate: dateToIsoString(dueDate),
          editAssignType: initAssignType,
          editAssignTeam: r.matchedTeam,
          editAssignUserId: r.matchedUser?.id ?? null,
          editAssignUserName: r.matchedUser?.name ?? null,
          editPatientName: r.matchedPatient?.name ?? (r.isIndividualTask ? null : r.patientRaw),
          include: true,
        };
      });
      setRows(editableRows);
      setSummary(data.summary);
      toast.success(`${data.totalRows}件を解析しました`);
    },
    onError: (err) => {
      toast.error(`解析エラー: ${err.message}`);
    },
  });

  const executeMutation = trpc.taskImport.execute.useMutation({
    onSuccess: (data) => {
      toast.success(`✅ ${data.insertedCount}件のタスクを取り込みました`);
      // リセット
      setTsv("");
      setRows([]);
      setSummary(null);
    },
    onError: (err) => {
      toast.error(`取り込みエラー: ${err.message}`);
    },
  });

  const includedCount = useMemo(() => rows.filter((r) => r.include).length, [rows]);

  const handlePreview = () => {
    if (!tsv.trim()) {
      toast.error("TSVデータを貼り付けてください");
      return;
    }
    previewMutation.mutate({ tsv });
  };

  const handleExecute = () => {
    const included = rows.filter((r) => r.include);
    if (included.length === 0) {
      toast.error("取り込むタスクがありません");
      return;
    }
    if (!confirm(`${included.length}件のタスクを tasks テーブルへ取り込みます。よろしいですか？`)) {
      return;
    }
    executeMutation.mutate({
      rows: included.map((r) => ({
        text: r.editText,
        patientName: r.editPatientName,
        dueDate: r.editDueDate ? new Date(r.editDueDate + "T23:59:00").toISOString() : null,
        assignType: r.editAssignType,
        assignTeam: r.editAssignTeam,
        assignUserId: r.editAssignUserId,
        assignUserName: r.editAssignUserName,
      })),
    });
  };

  const updateRow = (lineNo: number, updates: Partial<EditableRow>) => {
    setRows((prev) =>
      prev.map((r) => (r.lineNo === lineNo ? { ...r, ...updates } : r))
    );
  };

  return (
    <div className="container mx-auto max-w-7xl p-4 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        <Upload className="w-7 h-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">タスク一括取り込み</h1>
          <p className="text-sm text-muted-foreground">
            Google Chat等から整理したTSVデータを貼り付けて、利用者タスクを一括で取り込みます（特級管理者専用）
          </p>
        </div>
      </div>

      {/* TSV入力 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">1. TSVデータを貼り付け</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground space-y-1">
            <p>📋 各行をタブ区切りで貼り付けてください（1行目はヘッダーでもOK）</p>
            <p>📝 列の順序: <code className="bg-muted px-1 rounded">No / 種別 / 利用者名 / 内容 / 期日 / 担当者 / チーム</code></p>
          </div>
          <Textarea
            value={tsv}
            onChange={(e) => setTsv(e.target.value)}
            placeholder={"1\t利用者\t宮西千賀子\t訪問診療時間について…\t2026-05-06\t\t天理\n2\t利用者\t同免木香\t佐久間様4/23よろづ受診内容を確認\t2026-04-28\t\t天理\n..."}
            rows={12}
            className="font-mono text-xs"
          />
          <div className="flex gap-2">
            <Button
              onClick={handlePreview}
              disabled={previewMutation.isPending || !tsv.trim()}
            >
              {previewMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  解析中...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  解析してプレビュー
                </>
              )}
            </Button>
            {rows.length > 0 && (
              <Button
                variant="outline"
                onClick={() => {
                  setTsv("");
                  setRows([]);
                  setSummary(null);
                }}
              >
                <XCircle className="w-4 h-4 mr-2" />
                クリア
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* プレビュー */}
      {summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">2. 解析結果</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
              <div className="p-3 rounded bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                <div className="font-semibold text-green-900 dark:text-green-200">
                  ✅ 利用者マッチ
                </div>
                <div className="text-2xl font-bold">{summary.patientMatched}</div>
              </div>
              <div className="p-3 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <div className="font-semibold text-amber-900 dark:text-amber-200">
                  ⚠️ 利用者未マッチ
                </div>
                <div className="text-2xl font-bold">{summary.patientUnmatched}</div>
              </div>
              <div className="p-3 rounded bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <div className="font-semibold text-blue-900 dark:text-blue-200">
                  👥 個人タスク
                </div>
                <div className="text-2xl font-bold">{summary.individualTasks}</div>
              </div>
              <div className="p-3 rounded bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                <div className="font-semibold text-purple-900 dark:text-purple-200">
                  👤 担当者マッチ
                </div>
                <div className="text-2xl font-bold">{summary.assigneeMatched}</div>
              </div>
              <div className="p-3 rounded bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
                <div className="font-semibold text-indigo-900 dark:text-indigo-200">
                  📅 期日解析
                </div>
                <div className="text-2xl font-bold">{summary.dateParsed}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 編集可能テーブル */}
      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              3. 詳細確認・編集（{includedCount} / {rows.length} 件取り込む）
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">取込</TableHead>
                    <TableHead className="w-14">No</TableHead>
                    <TableHead>種別</TableHead>
                    <TableHead>利用者</TableHead>
                    <TableHead className="min-w-[300px]">内容</TableHead>
                    <TableHead>期日</TableHead>
                    <TableHead>割当</TableHead>
                    <TableHead>警告</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const hasWarning = row.warnings.length > 0;
                    const isUnmatched = !row.isIndividualTask && !row.matchedPatient;
                    return (
                      <TableRow
                        key={row.lineNo}
                        className={cn(
                          !row.include && "opacity-40",
                          isUnmatched && "bg-amber-50 dark:bg-amber-900/10"
                        )}
                      >
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={row.include}
                            onChange={(e) =>
                              updateRow(row.lineNo, { include: e.target.checked })
                            }
                            className="w-4 h-4"
                          />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.no}
                        </TableCell>
                        <TableCell>
                          {row.isIndividualTask ? (
                            <Badge variant="secondary" className="text-xs">
                              個人
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              利用者
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.isIndividualTask ? (
                            <span className="text-muted-foreground italic">
                              {row.patientRaw || "（施設）"}
                            </span>
                          ) : row.matchedPatient ? (
                            <Badge variant="outline" className="bg-green-50 dark:bg-green-900/20">
                              ✅ {row.matchedPatient.name}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-amber-50 dark:bg-amber-900/20">
                              ⚠️ {row.patientRaw}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Textarea
                            value={row.editText}
                            onChange={(e) =>
                              updateRow(row.lineNo, { editText: e.target.value })
                            }
                            rows={2}
                            className="text-xs min-w-[300px]"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="date"
                            value={row.editDueDate}
                            onChange={(e) =>
                              updateRow(row.lineNo, { editDueDate: e.target.value })
                            }
                            className="text-xs w-36"
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Select
                              value={row.editAssignType}
                              onValueChange={(v: "all" | "team" | "personal") =>
                                updateRow(row.lineNo, { editAssignType: v })
                              }
                            >
                              <SelectTrigger className="text-xs h-8 w-28">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">全員</SelectItem>
                                <SelectItem value="team">チーム</SelectItem>
                                <SelectItem value="personal">個人</SelectItem>
                              </SelectContent>
                            </Select>
                            {row.editAssignType === "team" && (
                              <div className="text-xs text-muted-foreground">
                                {row.editAssignTeam ?? "-"}
                              </div>
                            )}
                            {row.editAssignType === "personal" && (
                              <div className="text-xs text-muted-foreground flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                {row.editAssignUserName ?? "-"}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {hasWarning && (
                            <div className="flex flex-col gap-0.5 text-xs">
                              {row.warnings.map((w, i) => (
                                <div
                                  key={i}
                                  className="flex items-start gap-1 text-amber-700 dark:text-amber-400"
                                >
                                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                                  <span>{w}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 取り込みボタン */}
      {rows.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="text-sm">
                <div className="font-semibold">
                  📥 {includedCount}件のタスクを取り込みます
                </div>
                <div className="text-muted-foreground">
                  ※ チェックを外したタスクは取り込まれません
                </div>
              </div>
              <Button
                size="lg"
                onClick={handleExecute}
                disabled={executeMutation.isPending || includedCount === 0}
                className="bg-green-600 hover:bg-green-700"
              >
                {executeMutation.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    取り込み中...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5 mr-2" />
                    {includedCount}件を取り込む
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
