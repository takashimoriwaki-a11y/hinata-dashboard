import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Plus, Pencil, Trash2, Target } from "lucide-react";

const TEAM_OPTIONS = ["身体", "天理", "郡山北部", "郡山南部", "全チーム"] as const;
type TeamOption = typeof TEAM_OPTIONS[number];

const TEAM_COLORS: Record<TeamOption, string> = {
  "身体": "bg-blue-100 text-blue-800 border-blue-200",
  "天理": "bg-purple-100 text-purple-800 border-purple-200",
  "郡山北部": "bg-green-100 text-green-800 border-green-200",
  "郡山南部": "bg-orange-100 text-orange-800 border-orange-200",
  "全チーム": "bg-gray-100 text-gray-800 border-gray-200",
};

export default function TeamGoals() {
  const utils = trpc.useUtils();
  const { data: goals = [], isLoading } = trpc.teamGoals.getAll.useQuery();

  const createMutation = trpc.teamGoals.create.useMutation({
    onSuccess: () => {
      utils.teamGoals.getAll.invalidate();
      toast.success("チーム目標を登録しました");
      setShowForm(false);
      resetForm();
    },
    onError: () => toast.error("登録に失敗しました"),
  });
  const updateMutation = trpc.teamGoals.update.useMutation({
    onSuccess: () => {
      utils.teamGoals.getAll.invalidate();
      toast.success("チーム目標を更新しました");
      setEditingId(null);
      resetForm();
    },
    onError: () => toast.error("更新に失敗しました"),
  });
  const deleteMutation = trpc.teamGoals.delete.useMutation({
    onSuccess: () => {
      utils.teamGoals.getAll.invalidate();
      toast.success("チーム目標を削除しました");
    },
    onError: () => toast.error("削除に失敗しました"),
  });

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formTeam, setFormTeam] = useState<TeamOption>("全チーム");
  const [formTitle, setFormTitle] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formStartDate, setFormStartDate] = useState("");
  const [formEndDate, setFormEndDate] = useState("");

  function resetForm() {
    setFormTeam("全チーム");
    setFormTitle("");
    setFormBody("");
    setFormStartDate("");
    setFormEndDate("");
  }

  function startEdit(g: typeof goals[0]) {
    setEditingId(g.id);
    setFormTeam(g.team as TeamOption);
    setFormTitle(g.title);
    setFormBody(g.body ?? "");
    setFormStartDate(g.startDate ? String(g.startDate).slice(0, 10) : "");
    setFormEndDate(g.endDate ? String(g.endDate).slice(0, 10) : "");
    setShowForm(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formTitle.trim()) return;
    const data = {
      team: formTeam,
      title: formTitle.trim(),
      body: formBody.trim() || null,
      startDate: formStartDate || null,
      endDate: formEndDate || null,
    };
    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, ...data });
    } else {
      createMutation.mutate(data);
    }
  }

  // JST（日本時間）で今日の日付を取得
  const today = (() => {
    const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return jst.toISOString().slice(0, 10);
  })();

  function toDateStr(val: unknown): string | null {
    if (!val) return null;
    if (val instanceof Date) {
      const jst = new Date(val.getTime() + 9 * 60 * 60 * 1000);
      return jst.toISOString().slice(0, 10);
    }
    const s = String(val);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
      return jst.toISOString().slice(0, 10);
    }
    return null;
  }

  function isActive(g: typeof goals[0]) {
    const start = toDateStr(g.startDate);
    const end = toDateStr(g.endDate);
    if (start && today < start) return false;
    if (end && today > end) return false;
    return true;
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      {/* ページヘッダー */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Target className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">チーム目標</h1>
            <p className="text-sm text-muted-foreground">各チームの目標を登録・確認できます</p>
          </div>
        </div>
        <Button
          onClick={() => { setShowForm(!showForm); setEditingId(null); resetForm(); }}
          className="flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          新規登録
        </Button>
      </div>

      {/* 新規登録フォーム */}
      {showForm && (
        <Card className="shadow-sm border-primary/30">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-semibold text-primary">新規チーム目標を登録</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">対象チーム</label>
                  <select
                    value={formTeam}
                    onChange={e => setFormTeam(e.target.value as TeamOption)}
                    className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
                  >
                    {TEAM_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">
                    目標タイトル <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={e => setFormTitle(e.target.value)}
                    placeholder="例：今月の訪問件数目標を達成しよう"
                    className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">詳細・メッセージ（任意）</label>
                <textarea
                  value={formBody}
                  onChange={e => setFormBody(e.target.value)}
                  placeholder="目標の詳細や応援メッセージを入力..."
                  rows={3}
                  className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background resize-none"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">表示開始日（空欄=常時表示）</label>
                  <input
                    type="date"
                    value={formStartDate}
                    onChange={e => setFormStartDate(e.target.value)}
                    className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">表示終了日（空欄=常時表示）</label>
                  <input
                    type="date"
                    value={formEndDate}
                    onChange={e => setFormEndDate(e.target.value)}
                    className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => { setShowForm(false); resetForm(); }}
                >
                  キャンセル
                </Button>
                <Button type="submit" size="sm" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "登録中..." : "登録する"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* 目標一覧 */}
      <Card className="shadow-sm">
        <CardContent className="pt-4">
          {isLoading ? (
            <div className="space-y-3 py-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-20 bg-muted/60 animate-pulse rounded-lg" />
              ))}
            </div>
          ) : goals.length === 0 ? (
            <div className="text-center py-12">
              <Target className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">チーム目標が登録されていません</p>
              <p className="text-xs text-muted-foreground mt-1">「新規登録」ボタンから目標を追加してください</p>
            </div>
          ) : (
            <div className="space-y-3">
              {goals.map(g => (
                <div
                  key={g.id}
                  className={cn(
                    "border rounded-lg p-4 transition-all",
                    editingId === g.id ? "border-primary/50 bg-primary/5" : "border-border"
                  )}
                >
                  {editingId === g.id ? (
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium mb-1 block">対象チーム</label>
                          <select
                            value={formTeam}
                            onChange={e => setFormTeam(e.target.value as TeamOption)}
                            className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
                          >
                            {TEAM_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-sm font-medium mb-1 block">目標タイトル</label>
                          <input
                            type="text"
                            value={formTitle}
                            onChange={e => setFormTitle(e.target.value)}
                            className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
                            required
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">詳細・メッセージ</label>
                        <textarea
                          value={formBody}
                          onChange={e => setFormBody(e.target.value)}
                          rows={3}
                          className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background resize-none"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium mb-1 block">表示開始日</label>
                          <input
                            type="date"
                            value={formStartDate}
                            onChange={e => setFormStartDate(e.target.value)}
                            className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium mb-1 block">表示終了日</label>
                          <input
                            type="date"
                            value={formEndDate}
                            onChange={e => setFormEndDate(e.target.value)}
                            className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => { setEditingId(null); resetForm(); }}
                        >
                          キャンセル
                        </Button>
                        <Button type="submit" size="sm" disabled={updateMutation.isPending}>
                          {updateMutation.isPending ? "更新中..." : "更新する"}
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span
                            className={cn(
                              "text-xs font-medium px-2 py-0.5 rounded-full border",
                              TEAM_COLORS[g.team as TeamOption] ?? "bg-gray-100 text-gray-800"
                            )}
                          >
                            {g.team}
                          </span>
                          {isActive(g) ? (
                            <span className="text-xs text-green-600 font-medium">● 表示中</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">○ 非表示</span>
                          )}
                          {(g.startDate || g.endDate) && (
                            <span className="text-xs text-muted-foreground">
                              {toDateStr(g.startDate)?.replace(/-/g, "/") ?? "〜"}
                              {" 〜 "}
                              {toDateStr(g.endDate)?.replace(/-/g, "/") ?? ""}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-semibold">{g.title}</p>
                        {g.body && (
                          <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{g.body}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">登録者: {g.createdByName}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => startEdit(g)}
                          className="p-1.5 rounded hover:bg-muted transition-colors"
                          title="編集"
                        >
                          <Pencil className="w-4 h-4 text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm("このチーム目標を削除しますか？")) {
                              deleteMutation.mutate({ id: g.id });
                            }
                          }}
                          className="p-1.5 rounded hover:bg-red-50 transition-colors"
                          title="削除"
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
