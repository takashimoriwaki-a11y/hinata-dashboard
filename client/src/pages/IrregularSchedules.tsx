import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, RefreshCw, Calendar, Clock, Building2, FileText, AlertCircle } from "lucide-react";

// ─── 定数 ───────────────────────────────────────────────
const TEAMS = ["身体", "天理", "郡山北部", "郡山南部"] as const;
const SCHEDULE_TYPES = [
  "受診",
  "ショートステイ",
  "特別指示書",
  "入院",
  "退院",
  "新規契約・面談",
  "訪問診療同席",
] as const;

type ScheduleType = typeof SCHEDULE_TYPES[number];

// 予定種別ごとに表示するフィールド定義
// true = 表示、false = 非表示
type FieldVisibility = {
  endDate: boolean;       // 終了日
  startTime: boolean;     // 時刻（開始）
  endTime: boolean;       // 時刻（終了）
  facilityName: boolean;  // 病院・施設名
  postDischargeEndDate: boolean; // 退院後週5日終了日
};

const FIELD_CONFIG: Record<ScheduleType, FieldVisibility> = {
  受診:          { endDate: false, startTime: true,  endTime: true,  facilityName: true,  postDischargeEndDate: false },
  ショートステイ: { endDate: true,  startTime: false, endTime: false, facilityName: true,  postDischargeEndDate: false },
  特別指示書:    { endDate: true,  startTime: false, endTime: false, facilityName: true,  postDischargeEndDate: false },
  入院:          { endDate: false, startTime: false, endTime: false, facilityName: true,  postDischargeEndDate: false },
  退院:          { endDate: false, startTime: false, endTime: false, facilityName: true,  postDischargeEndDate: true  },
  "新規契約・面談": { endDate: false, startTime: true,  endTime: true,  facilityName: false, postDischargeEndDate: false },
  訪問診療同席:  { endDate: false, startTime: true,  endTime: true,  facilityName: false, postDischargeEndDate: false },
};

// 開始日のラベルを種別によって変える
const START_DATE_LABEL: Record<ScheduleType, string> = {
  受診: "受診日",
  ショートステイ: "開始日",
  特別指示書: "開始日",
  入院: "入院日",
  退院: "退院日",
  "新規契約・面談": "面談日",
  訪問診療同席: "同席日",
};

// ─── スタイル定数 ────────────────────────────────────────
const TYPE_COLORS: Record<string, string> = {
  受診: "bg-blue-100 text-blue-800 border-blue-200",
  ショートステイ: "bg-purple-100 text-purple-800 border-purple-200",
  特別指示書: "bg-orange-100 text-orange-800 border-orange-200",
  入院: "bg-red-100 text-red-800 border-red-200",
  退院: "bg-green-100 text-green-800 border-green-200",
  "新規契約・面談": "bg-teal-100 text-teal-800 border-teal-200",
  訪問診療同席: "bg-indigo-100 text-indigo-800 border-indigo-200",
};

const TEAM_COLORS: Record<string, string> = {
  身体: "bg-rose-50 text-rose-700 border-rose-200",
  天理: "bg-sky-50 text-sky-700 border-sky-200",
  郡山北部: "bg-amber-50 text-amber-700 border-amber-200",
  郡山南部: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

// ─── 型定義 ──────────────────────────────────────────────
type FormData = {
  patientName: string;
  team: string;
  scheduleType: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  facilityName: string;
  actionRequired: string;
  postDischargeEndDate: string;
  notes: string;
};

const emptyForm: FormData = {
  patientName: "",
  team: "",
  scheduleType: "",
  startDate: "",
  endDate: "",
  startTime: "",
  endTime: "",
  facilityName: "",
  actionRequired: "",
  postDischargeEndDate: "",
  notes: "",
};

// ─── コンポーネント ──────────────────────────────────────
export default function IrregularSchedules() {
  const [filterTeam, setFilterTeam] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [syncing, setSyncing] = useState(false);

  const utils = trpc.useUtils();

  const { data: schedules = [], isLoading } = trpc.irregularSchedules.list.useQuery(
    {
      team: filterTeam !== "all" ? filterTeam : undefined,
      scheduleType: filterType !== "all" ? filterType : undefined,
    },
    { refetchOnWindowFocus: false }
  );

  const createMutation = trpc.irregularSchedules.create.useMutation({
    onSuccess: () => {
      toast.success("予定を登録しました", { description: "スプレッドシートにも反映されます" });
      utils.irregularSchedules.list.invalidate();
      setDialogOpen(false);
      setForm(emptyForm);
    },
    onError: (e) => toast.error("登録に失敗しました", { description: e.message }),
  });

  const updateMutation = trpc.irregularSchedules.update.useMutation({
    onSuccess: () => {
      toast.success("予定を更新しました");
      utils.irregularSchedules.list.invalidate();
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
    },
    onError: (e) => toast.error("更新に失敗しました", { description: e.message }),
  });

  const deleteMutation = trpc.irregularSchedules.delete.useMutation({
    onSuccess: () => {
      toast.success("予定を削除しました");
      utils.irregularSchedules.list.invalidate();
      setDeleteConfirmId(null);
    },
    onError: (e) => toast.error("削除に失敗しました", { description: e.message }),
  });

  const syncMutation = trpc.irregularSchedules.syncFromSheet.useMutation({
    onSuccess: (res) => {
      toast.success(`スプレッドシートに同期しました（${res.synced}件）`);
      utils.irregularSchedules.list.invalidate();
      setSyncing(false);
    },
    onError: (e) => {
      toast.error("同期に失敗しました", { description: e.message });
      setSyncing(false);
    },
  });

  // 現在の予定種別に対応するフィールド設定
  const fieldConfig: FieldVisibility | null =
    form.scheduleType && FIELD_CONFIG[form.scheduleType as ScheduleType]
      ? FIELD_CONFIG[form.scheduleType as ScheduleType]
      : null;

  const startDateLabel =
    form.scheduleType && START_DATE_LABEL[form.scheduleType as ScheduleType]
      ? START_DATE_LABEL[form.scheduleType as ScheduleType]
      : "開始日";

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (s: typeof schedules[0]) => {
    setEditingId(s.id);
    setForm({
      patientName: s.patientName,
      team: s.team,
      scheduleType: s.scheduleType,
      startDate: s.startDate,
      endDate: s.endDate ?? "",
      startTime: s.startTime ?? "",
      endTime: s.endTime ?? "",
      facilityName: s.facilityName ?? "",
      actionRequired: s.actionRequired ?? "",
      postDischargeEndDate: s.postDischargeEndDate ?? "",
      notes: s.notes ?? "",
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSubmit = () => {
    if (!form.patientName.trim()) { toast.error("利用者名を入力してください"); return; }
    if (!form.team)               { toast.error("担当チームを選択してください"); return; }
    if (!form.scheduleType)       { toast.error("予定種別を選択してください"); return; }
    if (!form.startDate)          { toast.error(`${startDateLabel}を入力してください`); return; }

    // 非表示フィールドの値はクリアして送信
    const cfg = fieldConfig;
    const payload = {
      patientName: form.patientName.trim(),
      team: form.team as typeof TEAMS[number],
      scheduleType: form.scheduleType as ScheduleType,
      startDate: form.startDate,
      endDate:             (cfg?.endDate            ? form.endDate            : null) || null,
      startTime:           (cfg?.startTime          ? form.startTime          : null) || null,
      endTime:             (cfg?.endTime            ? form.endTime            : null) || null,
      facilityName:        (cfg?.facilityName       ? form.facilityName       : null) || null,
      actionRequired:      form.actionRequired || null,
      postDischargeEndDate:(cfg?.postDischargeEndDate ? form.postDischargeEndDate : null) || null,
      notes:               form.notes || null,
    };

    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleSync = () => {
    setSyncing(true);
    syncMutation.mutate();
  };

  const isMutating = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="px-4 py-3 space-y-4 pb-20">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-foreground">予定管理</h1>
          <p className="text-xs text-muted-foreground mt-0.5">イレギュラー予定の登録・管理</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing} className="text-xs">
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${syncing ? "animate-spin" : ""}`} />
            シート同期
          </Button>
          <Button size="sm" onClick={openCreate} className="text-xs">
            <Plus className="w-3.5 h-3.5 mr-1" />
            予定追加
          </Button>
        </div>
      </div>

      {/* フィルター */}
      <div className="flex gap-2 flex-wrap">
        <Select value={filterTeam} onValueChange={setFilterTeam}>
          <SelectTrigger className="h-8 text-xs w-32">
            <SelectValue placeholder="チーム" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全チーム</SelectItem>
            {TEAMS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="h-8 text-xs w-40">
            <SelectValue placeholder="種別" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全種別</SelectItem>
            {SCHEDULE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* 一覧 */}
      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground text-sm">読み込み中...</div>
      ) : schedules.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center">
            <Calendar className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">予定がありません</p>
            <Button size="sm" variant="outline" className="mt-3 text-xs" onClick={openCreate}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              最初の予定を追加
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {schedules.map((s) => {
            const cfg = FIELD_CONFIG[s.scheduleType as ScheduleType];
            return (
              <Card key={s.id} className="shadow-sm">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        <span className="font-semibold text-sm text-foreground truncate">{s.patientName}</span>
                        <Badge variant="outline" className={`text-xs px-1.5 py-0 ${TYPE_COLORS[s.scheduleType] ?? ""}`}>
                          {s.scheduleType}
                        </Badge>
                        <Badge variant="outline" className={`text-xs px-1.5 py-0 ${TEAM_COLORS[s.team] ?? ""}`}>
                          {s.team}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {s.startDate}{(cfg?.endDate && s.endDate) ? ` 〜 ${s.endDate}` : ""}
                        </span>
                        {(cfg?.startTime && (s.startTime || s.endTime)) && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {s.startTime ?? ""}{(cfg?.endTime && s.endTime) ? ` 〜 ${s.endTime}` : ""}
                          </span>
                        )}
                        {(cfg?.facilityName && s.facilityName) && (
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            {s.facilityName}
                          </span>
                        )}
                        {(cfg?.postDischargeEndDate && s.postDischargeEndDate) && (
                          <span className="flex items-center gap-1 text-green-700">
                            <Calendar className="w-3 h-3" />
                            週5日終了: {s.postDischargeEndDate}
                          </span>
                        )}
                      </div>
                      {s.actionRequired && (
                        <p className="text-xs text-amber-700 mt-1 flex items-start gap-1">
                          <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                          {s.actionRequired}
                        </p>
                      )}
                      {s.notes && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
                          <FileText className="w-3 h-3 mt-0.5 shrink-0" />
                          {s.notes}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleteConfirmId(s.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ─── 登録・編集ダイアログ ─── */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId !== null ? "予定を編集" : "予定を追加"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {/* ── 共通フィールド（常に表示） ── */}

            {/* 利用者名 */}
            <div>
              <Label className="text-xs font-medium">利用者名 <span className="text-destructive">*</span></Label>
              <Input
                className="mt-1 h-8 text-sm"
                placeholder="例：山田 太郎"
                value={form.patientName}
                onChange={e => setForm(f => ({ ...f, patientName: e.target.value }))}
              />
            </div>

            {/* 担当チーム */}
            <div>
              <Label className="text-xs font-medium">担当チーム <span className="text-destructive">*</span></Label>
              <Select value={form.team} onValueChange={v => setForm(f => ({ ...f, team: v }))}>
                <SelectTrigger className="mt-1 h-8 text-sm">
                  <SelectValue placeholder="チームを選択" />
                </SelectTrigger>
                <SelectContent>
                  {TEAMS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* 予定種別 */}
            <div>
              <Label className="text-xs font-medium">予定種別 <span className="text-destructive">*</span></Label>
              <Select
                value={form.scheduleType}
                onValueChange={v => setForm(f => ({
                  ...f,
                  scheduleType: v,
                  // 種別変更時に非表示になるフィールドをクリア
                  endDate: "",
                  startTime: "",
                  endTime: "",
                  facilityName: "",
                  postDischargeEndDate: "",
                }))}
              >
                <SelectTrigger className="mt-1 h-8 text-sm">
                  <SelectValue placeholder="種別を選択" />
                </SelectTrigger>
                <SelectContent>
                  {SCHEDULE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* ── 種別選択後に表示されるフィールド ── */}
            {fieldConfig && (
              <>
                {/* 開始日（ラベルが種別によって変わる） */}
                <div className={fieldConfig.endDate ? "grid grid-cols-2 gap-2" : ""}>
                  <div>
                    <Label className="text-xs font-medium">{startDateLabel} <span className="text-destructive">*</span></Label>
                    <Input
                      type="date"
                      className="mt-1 h-8 text-sm"
                      value={form.startDate}
                      onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                    />
                  </div>
                  {/* 終了日（ショートステイ・特別指示書のみ） */}
                  {fieldConfig.endDate && (
                    <div>
                      <Label className="text-xs font-medium">終了日</Label>
                      <Input
                        type="date"
                        className="mt-1 h-8 text-sm"
                        value={form.endDate}
                        onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                      />
                    </div>
                  )}
                </div>

                {/* 時刻（受診・新規契約・面談・訪問診療同席のみ） */}
                {fieldConfig.startTime && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs font-medium">開始時刻</Label>
                      <Input
                        type="time"
                        className="mt-1 h-8 text-sm"
                        value={form.startTime}
                        onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                      />
                    </div>
                    {fieldConfig.endTime && (
                      <div>
                        <Label className="text-xs font-medium">終了時刻</Label>
                        <Input
                          type="time"
                          className="mt-1 h-8 text-sm"
                          value={form.endTime}
                          onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* 病院・施設名（受診・ショートステイ・特別指示書・入院・退院のみ） */}
                {fieldConfig.facilityName && (
                  <div>
                    <Label className="text-xs font-medium">病院・施設名</Label>
                    <Input
                      className="mt-1 h-8 text-sm"
                      placeholder="例：大和郡山市立病院"
                      value={form.facilityName}
                      onChange={e => setForm(f => ({ ...f, facilityName: e.target.value }))}
                    />
                  </div>
                )}

                {/* 必要な対応アクション（全種別） */}
                <div>
                  <Label className="text-xs font-medium">必要な対応アクション</Label>
                  <Textarea
                    className="mt-1 text-sm resize-none"
                    rows={2}
                    placeholder="例：退院後の訪問調整、主治医への連絡"
                    value={form.actionRequired}
                    onChange={e => setForm(f => ({ ...f, actionRequired: e.target.value }))}
                  />
                </div>

                {/* 退院後週5日終了日（退院のみ） */}
                {fieldConfig.postDischargeEndDate && (
                  <div>
                    <Label className="text-xs font-medium">退院後週5日終了日</Label>
                    <Input
                      type="date"
                      className="mt-1 h-8 text-sm"
                      value={form.postDischargeEndDate}
                      onChange={e => setForm(f => ({ ...f, postDischargeEndDate: e.target.value }))}
                    />
                  </div>
                )}

                {/* 備考・申し送り（全種別） */}
                <div>
                  <Label className="text-xs font-medium">備考・申し送り</Label>
                  <Textarea
                    className="mt-1 text-sm resize-none"
                    rows={2}
                    placeholder="その他の申し送り事項"
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  />
                </div>
              </>
            )}

            {/* 種別未選択時のガイド */}
            {!fieldConfig && (
              <p className="text-xs text-muted-foreground text-center py-2">
                予定種別を選択すると入力項目が表示されます
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={closeDialog}>キャンセル</Button>
            <Button size="sm" onClick={handleSubmit} disabled={isMutating}>
              {isMutating ? "保存中..." : editingId !== null ? "更新" : "登録"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── 削除確認ダイアログ ─── */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>予定を削除しますか？</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">この操作は取り消せません。スプレッドシートのデータは残ります。</p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteConfirmId(null)}>キャンセル</Button>
            <Button
              variant="destructive" size="sm"
              disabled={deleteMutation.isPending}
              onClick={() => { if (deleteConfirmId !== null) deleteMutation.mutate({ id: deleteConfirmId }); }}
            >
              {deleteMutation.isPending ? "削除中..." : "削除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
