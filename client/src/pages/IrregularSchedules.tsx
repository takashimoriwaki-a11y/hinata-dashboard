/**
 * 予定管理ページ
 * - 入力フォームのみ（一覧表示なし）
 * - 登録するとスプレッドシートに自動転記
 * - 利用者名は登録済み利用者から選択
 * - 時間は10分単位
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { CalendarPlus, CheckCircle2 } from "lucide-react";

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

// 予定種別ごとのフィールド表示設定
type FieldVisibility = {
  endDate: boolean;
  startTime: boolean;
  endTime: boolean;
  facilityName: boolean;
  postDischargeEndDate: boolean;
};

const FIELD_CONFIG: Record<ScheduleType, FieldVisibility> = {
  受診:             { endDate: false, startTime: true,  endTime: true,  facilityName: true,  postDischargeEndDate: false },
  ショートステイ:   { endDate: true,  startTime: false, endTime: false, facilityName: true,  postDischargeEndDate: false },
  特別指示書:       { endDate: true,  startTime: false, endTime: false, facilityName: true,  postDischargeEndDate: false },
  入院:             { endDate: false, startTime: false, endTime: false, facilityName: true,  postDischargeEndDate: false },
  退院:             { endDate: false, startTime: false, endTime: false, facilityName: true,  postDischargeEndDate: true  },
  "新規契約・面談": { endDate: false, startTime: true,  endTime: true,  facilityName: false, postDischargeEndDate: false },
  訪問診療同席:     { endDate: false, startTime: true,  endTime: true,  facilityName: false, postDischargeEndDate: false },
};

const START_DATE_LABEL: Record<ScheduleType, string> = {
  受診: "受診日",
  ショートステイ: "開始日",
  特別指示書: "開始日",
  入院: "入院日",
  退院: "退院日",
  "新規契約・面談": "面談日",
  訪問診療同席: "同席日",
};

// 10分単位の時刻選択肢（00:00〜23:50）
const TIME_OPTIONS: string[] = (() => {
  const opts: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 10) {
      opts.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return opts;
})();

// ─── 型定義 ──────────────────────────────────────────────
type FormData = {
  patientId: string;   // 選択した利用者のID（文字列）
  patientName: string; // 表示用（自動セット）
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
  patientId: "",
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
  const [form, setForm] = useState<FormData>(emptyForm);
  const [submitted, setSubmitted] = useState(false);

  const utils = trpc.useUtils();

  // 全利用者一覧（active=1のみ）
  const { data: allPatients = [] } = trpc.patients.list.useQuery(
    { team: form.team as typeof TEAMS[number] | undefined },
    { enabled: !!form.team, refetchOnWindowFocus: false }
  );

  // チームが変わったら利用者選択をリセット
  const handleTeamChange = (v: string) => {
    setForm(f => ({ ...f, team: v, patientId: "", patientName: "" }));
  };

  // 利用者選択時に名前を自動セット
  const handlePatientChange = (id: string) => {
    const patient = allPatients.find(p => String(p.id) === id);
    setForm(f => ({
      ...f,
      patientId: id,
      patientName: patient?.name ?? "",
    }));
  };

  // 予定種別変更時に関連フィールドをリセット
  const handleTypeChange = (v: string) => {
    setForm(f => ({
      ...f,
      scheduleType: v,
      endDate: "",
      startTime: "",
      endTime: "",
      facilityName: "",
      postDischargeEndDate: "",
    }));
  };

  const fieldConfig: FieldVisibility | null =
    form.scheduleType && FIELD_CONFIG[form.scheduleType as ScheduleType]
      ? FIELD_CONFIG[form.scheduleType as ScheduleType]
      : null;

  const startDateLabel =
    form.scheduleType && START_DATE_LABEL[form.scheduleType as ScheduleType]
      ? START_DATE_LABEL[form.scheduleType as ScheduleType]
      : "開始日";

  const createMutation = trpc.irregularSchedules.create.useMutation({
    onSuccess: () => {
      toast.success("予定を登録しました", { description: "スプレッドシートに自動転記されました" });
      setSubmitted(true);
      utils.irregularSchedules.list.invalidate();
    },
    onError: (e) => toast.error("登録に失敗しました", { description: e.message }),
  });

  const handleSubmit = () => {
    if (!form.team)               { toast.error("担当チームを選択してください"); return; }
    if (!form.patientId)          { toast.error("利用者名を選択してください"); return; }
    if (!form.scheduleType)       { toast.error("予定種別を選択してください"); return; }
    if (!form.startDate)          { toast.error(`${startDateLabel}を入力してください`); return; }

    const cfg = fieldConfig;
    createMutation.mutate({
      patientName: form.patientName,
      team: form.team as typeof TEAMS[number],
      scheduleType: form.scheduleType as ScheduleType,
      startDate: form.startDate,
      endDate:              (cfg?.endDate             ? form.endDate             : null) || null,
      startTime:            (cfg?.startTime           ? form.startTime           : null) || null,
      endTime:              (cfg?.endTime             ? form.endTime             : null) || null,
      facilityName:         (cfg?.facilityName        ? form.facilityName        : null) || null,
      actionRequired:       form.actionRequired || null,
      postDischargeEndDate: (cfg?.postDischargeEndDate ? form.postDischargeEndDate : null) || null,
      notes:                form.notes || null,
    });
  };

  const handleReset = () => {
    setForm(emptyForm);
    setSubmitted(false);
  };

  // ─── 登録完了画面 ───────────────────────────────────────
  if (submitted) {
    return (
      <div className="px-4 py-8 flex flex-col items-center gap-4">
        <CheckCircle2 className="w-14 h-14 text-green-500" />
        <p className="text-base font-semibold text-foreground">登録が完了しました</p>
        <p className="text-sm text-muted-foreground text-center">
          スプレッドシートに自動転記されました
        </p>
        <Button onClick={handleReset} className="mt-2">続けて登録する</Button>
      </div>
    );
  }

  // ─── 入力フォーム ────────────────────────────────────────
  return (
    <div className="px-4 py-3 pb-24 space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center gap-2">
        <CalendarPlus className="w-5 h-5 text-primary" />
        <div>
          <h1 className="text-base font-bold text-foreground">予定管理</h1>
          <p className="text-xs text-muted-foreground">登録するとスプレッドシートに自動転記されます</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold">イレギュラー予定の登録</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">

          {/* ── 担当チーム（先に選ぶと利用者一覧が絞られる） ── */}
          <div>
            <Label className="text-xs font-medium">担当チーム <span className="text-destructive">*</span></Label>
            <Select value={form.team} onValueChange={handleTeamChange}>
              <SelectTrigger className="mt-1 h-9 text-sm">
                <SelectValue placeholder="チームを選択" />
              </SelectTrigger>
              <SelectContent>
                {TEAMS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* ── 利用者名（登録済み利用者から選択） ── */}
          <div>
            <Label className="text-xs font-medium">利用者名 <span className="text-destructive">*</span></Label>
            <Select
              value={form.patientId}
              onValueChange={handlePatientChange}
              disabled={!form.team}
            >
              <SelectTrigger className="mt-1 h-9 text-sm">
                <SelectValue placeholder={form.team ? "利用者を選択" : "先にチームを選択してください"} />
              </SelectTrigger>
              <SelectContent>
                {allPatients.map(p => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}{p.nameKana ? `（${p.nameKana}）` : ""}
                  </SelectItem>
                ))}
                {allPatients.length === 0 && form.team && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">利用者が登録されていません</div>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* ── 予定種別 ── */}
          <div>
            <Label className="text-xs font-medium">予定種別 <span className="text-destructive">*</span></Label>
            <Select value={form.scheduleType} onValueChange={handleTypeChange}>
              <SelectTrigger className="mt-1 h-9 text-sm">
                <SelectValue placeholder="種別を選択" />
              </SelectTrigger>
              <SelectContent>
                {SCHEDULE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* ── 種別選択後のフィールド ── */}
          {fieldConfig && (
            <>
              {/* 開始日 ＋ 終了日（横並び） */}
              <div className={fieldConfig.endDate ? "grid grid-cols-2 gap-2" : ""}>
                <div>
                  <Label className="text-xs font-medium">{startDateLabel} <span className="text-destructive">*</span></Label>
                  <Input
                    type="date"
                    className="mt-1 h-9 text-sm"
                    value={form.startDate}
                    onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                  />
                </div>
                {fieldConfig.endDate && (
                  <div>
                    <Label className="text-xs font-medium">終了日</Label>
                    <Input
                      type="date"
                      className="mt-1 h-9 text-sm"
                      value={form.endDate}
                      onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                    />
                  </div>
                )}
              </div>

              {/* 時刻（10分単位 Select） */}
              {fieldConfig.startTime && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs font-medium">開始時刻</Label>
                    <Select value={form.startTime} onValueChange={v => setForm(f => ({ ...f, startTime: v }))}>
                      <SelectTrigger className="mt-1 h-9 text-sm">
                        <SelectValue placeholder="--:--" />
                      </SelectTrigger>
                      <SelectContent className="max-h-52">
                        {TIME_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {fieldConfig.endTime && (
                    <div>
                      <Label className="text-xs font-medium">終了時刻</Label>
                      <Select value={form.endTime} onValueChange={v => setForm(f => ({ ...f, endTime: v }))}>
                        <SelectTrigger className="mt-1 h-9 text-sm">
                          <SelectValue placeholder="--:--" />
                        </SelectTrigger>
                        <SelectContent className="max-h-52">
                          {TIME_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}

              {/* 病院・施設名 */}
              {fieldConfig.facilityName && (
                <div>
                  <Label className="text-xs font-medium">病院・施設名</Label>
                  <Input
                    className="mt-1 h-9 text-sm"
                    placeholder="例：大和郡山市立病院"
                    value={form.facilityName}
                    onChange={e => setForm(f => ({ ...f, facilityName: e.target.value }))}
                  />
                </div>
              )}

              {/* 必要な対応アクション */}
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
                    className="mt-1 h-9 text-sm"
                    value={form.postDischargeEndDate}
                    onChange={e => setForm(f => ({ ...f, postDischargeEndDate: e.target.value }))}
                  />
                </div>
              )}

              {/* 備考・申し送り（全種別共通） */}
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

          {/* 種別未選択ガイド */}
          {!fieldConfig && form.scheduleType === "" && (
            <p className="text-xs text-muted-foreground text-center py-1">
              予定種別を選択すると入力項目が表示されます
            </p>
          )}

          {/* 登録ボタン */}
          <Button
            className="w-full mt-2"
            onClick={handleSubmit}
            disabled={createMutation.isPending || !fieldConfig}
          >
            {createMutation.isPending ? "登録中..." : "スプレッドシートに登録する"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
