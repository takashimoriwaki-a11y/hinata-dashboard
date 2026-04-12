/**
 * Admin - 管理画面
 * スプレッドシートURLの月次管理 + 利用者マスタ管理
 */

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Plus, Trash2, ExternalLink, Settings, ClipboardPaste,
  CheckCircle2, AlertCircle, ChevronDown, ChevronUp,
  Users, Pencil, X, ChevronRight, UserPlus, Key, Shield, ShieldCheck,
  FileSpreadsheet, Upload, Download, LogOut, RotateCcw, Mail, Link,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getTeamButtonClass, getTeamButtonStyle } from "@shared/teamColors";

// ============================
// スプレッドシートURL管理
// ============================

const LINK_DEFINITIONS = [
  { key: "fee_seishin_koriyama", label: "利用者料金一覧（精神郡山）", color: "text-emerald-600", displayTarget: "team" as const,   fileNameExample: "ひなた 利用者料金一覧 YYYY年M月分（精神郡山）",   hint: "精神郡山チームの利用者料金シート（チームツールに表示）" },
  { key: "fee_shintai",          label: "利用者料金一覧（身体）",     color: "text-blue-600",   displayTarget: "team" as const,   fileNameExample: "ひなた 利用者料金一覧 YYYY年M月分（身体）",         hint: "身体チームの利用者料金シート（チームツールに表示）" },
  { key: "fee_tenri",            label: "利用者料金一覧（天理）",     color: "text-purple-600", displayTarget: "team" as const,   fileNameExample: "ひなた 利用者料金一覧 YYYY年M月分（天理）",         hint: "天理チームの利用者料金シート（チームツールに表示）" },
  { key: "daily_report",         label: "業務日報",                   color: "text-orange-600", displayTarget: "common" as const, fileNameExample: "ひなた 業務日報 YYYY年M月分",                       hint: "全スタッフ共通の業務日報シート（全チーム共通ツールに表示）" },
  { key: "attendance",           label: "ひなた勤怠",                 color: "text-rose-600",   displayTarget: "common" as const, fileNameExample: "ひなた 勤怠管理 YYYY年M月分",                     hint: "スタッフ勤怠管理シート（全チーム共通ツールに表示）" },
  { key: "checkout_checklist",   label: "退勤時チェックリスト",       color: "text-amber-600",  displayTarget: "common" as const, fileNameExample: "ひなた 退勤時チェックリスト YYYY年M月分",          hint: "退勤チェックリストシート（全チーム共通ツールに表示）" },
] as const;

type LinkKey = typeof LINK_DEFINITIONS[number]["key"];

const TEAMS = ["身体", "天理", "郡山北部", "郡山南部"] as const;
type Team = typeof TEAMS[number];

function toYearMonth(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function formatYearMonth(ym: string) {
  const [y, m] = ym.split("-");
  return `${y}年${Number(m)}月`;
}

function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s\n\r]+/g;
  return (text.match(urlRegex) ?? []).map((u) => u.replace(/[,;]+$/, "").trim());
}

// 一括インポートパネル
function BulkImportPanel({
  selectedYearMonth,
  onSuccess,
}: {
  selectedYearMonth: string;
  onSuccess: () => void;
}) {
  const utils = trpc.useUtils();
  const [pasteText, setPasteText] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const parsedLinks = useMemo(() => {
    const urls = extractUrls(pasteText);
    return LINK_DEFINITIONS.map((def, idx) => ({
      ...def,
      url: urls[idx] ?? "",
      valid: urls[idx] ? /^https?:\/\/.+/.test(urls[idx]) : false,
    }));
  }, [pasteText]);

  const validCount = parsedLinks.filter((l) => l.valid).length;
  const hasAnyUrl = parsedLinks.some((l) => l.url);

  const batchUpsert = trpc.spreadsheetLinks.batchUpsert.useMutation({
    onSuccess: (data) => {
      utils.spreadsheetLinks.getAll.invalidate();
      utils.spreadsheetLinks.getCurrent.invalidate();
      toast.success(`${data.count}件のURLを一括登録しました`);
      setPasteText("");
      setIsOpen(false);
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleImport = () => {
    const validLinks = parsedLinks.filter((l) => l.valid);
    if (validLinks.length === 0) { toast.error("有効なURLが見つかりませんでした"); return; }
    batchUpsert.mutate({
      yearMonth: selectedYearMonth,
      links: validLinks.map((l) => ({ linkKey: l.key, label: l.label, url: l.url, color: l.color, displayTarget: l.displayTarget })),
    });
  };

  return (
    <Card className="shadow-sm border-primary/20 bg-primary/5">
      <button className="w-full text-left" onClick={() => setIsOpen((v) => !v)}>
        <CardHeader className="pb-2 pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardPaste className="w-4 h-4 text-primary" />
              <CardTitle className="text-base font-semibold text-primary">一括インポート</CardTitle>
              <Badge className="text-xs bg-primary/10 text-primary border-0 px-1.5 py-0">月末の更新に便利</Badge>
            </div>
            {isOpen ? <ChevronUp className="w-4 h-4 text-primary" /> : <ChevronDown className="w-4 h-4 text-primary" />}
          </div>
          {!isOpen && (
            <p className="text-xs text-muted-foreground mt-1">6つのURLをまとめて貼り付けて一括登録できます</p>
          )}
        </CardHeader>
      </button>

      {isOpen && (
        <CardContent className="space-y-4 pt-0">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-semibold text-foreground">登録順番とファイル名の目安</p>
              <Badge className="text-xs bg-amber-100 text-amber-700 border-0 px-1.5 py-0">上から順に貼り付け</Badge>
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              {LINK_DEFINITIONS.map((def, i) => (
                <div key={def.key} className={cn(
                  "flex items-start gap-2.5 px-3 py-2 text-xs",
                  i % 2 === 0 ? "bg-card" : "bg-muted/30",
                  i < LINK_DEFINITIONS.length - 1 && "border-b border-border/50"
                )}>
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs mt-0.5">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className={cn("font-semibold leading-tight", def.color)}>{def.label}</p>
                      {def.displayTarget === "team" ? (
                        <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0 rounded-full font-medium border border-emerald-200">チームツール</span>
                      ) : (
                        <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0 rounded-full font-medium border border-blue-200">全チーム共通</span>
                      )}
                    </div>
                    <p className="text-muted-foreground mt-0.5 leading-tight">
                      <span className="font-mono bg-muted/60 px-1 py-0.5 rounded text-xs">{def.fileNameExample}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground/70 flex items-center gap-1">
              <span>ℹ️</span>
              <span>YYYY年M月分の部分は実際の年月（例: 2026年4月分）に小文字で書かれています</span>
            </p>
          </div>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={"https://docs.google.com/spreadsheets/d/AAAA...\nhttps://docs.google.com/spreadsheets/d/BBBB...\nhttps://docs.google.com/spreadsheets/d/CCCC...\nhttps://docs.google.com/spreadsheets/d/DDDD...\nhttps://docs.google.com/spreadsheets/d/EEEE...\nhttps://docs.google.com/spreadsheets/d/FFFF..."}
            rows={6}
            className="w-full text-xs border border-border rounded-md px-3 py-2 bg-background text-foreground focus:outline-none focus:border-primary font-mono resize-none"
            autoFocus
          />
          {hasAnyUrl && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-foreground">プレビュー</p>
              <div className="space-y-1">
                {parsedLinks.map((link) => (
                  <div key={link.key} className="flex items-start gap-2 text-xs">
                    {link.valid ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                    ) : link.url ? (
                      <AlertCircle className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full border border-muted-foreground/30 mt-0.5 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <span className={cn("font-medium", link.color)}>{link.label}</span>
                      {link.url ? (
                        <p className="text-muted-foreground truncate font-mono">{link.url}</p>
                      ) : (
                        <p className="text-muted-foreground italic">（未入力）</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-xs text-muted-foreground">
              {validCount > 0 ? <span className="text-emerald-600 font-medium">{validCount}件</span> : <span>0件</span>}
              {" "}のURLが登録されます
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { setPasteText(""); setIsOpen(false); }}>キャンセル</Button>
              <Button size="sm" className="h-8 text-xs" onClick={handleImport} disabled={validCount === 0 || batchUpsert.isPending}>
                {batchUpsert.isPending ? "登録中..." : `${validCount}件を一括登録`}
              </Button>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ============================
// 利用者マスタ管理パネル
// ============================

function PatientMasterPanel() {
  const utils = trpc.useUtils();

  // 全利用者取得（退所済も含む）
  const { data: allPatients, isLoading } = trpc.patients.listAll.useQuery({});

  // 退所済を表示するか
  const [showInactive, setShowInactive] = useState(false);

  // フィルター
  const [filterTeam, setFilterTeam] = useState<Team | "全て">("全て");
  const [searchQuery, setSearchQuery] = useState("");

  // Excelインポート
  const patientExcelRef = useRef<HTMLInputElement>(null);
  const [importingPatients, setImportingPatients] = useState(false);
  const handlePatientExcelImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingPatients(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/import/patients", { method: "POST", body: formData, credentials: "include" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "インポートに失敗しました"); return; }
      utils.patients.listAll.invalidate();
      toast.success(`${data.count}名の利用者をインポートしました${data.errors?.length ? `（${data.errors.length}件エラー）` : ""}`);
      if (data.errors?.length) {
        data.errors.slice(0, 3).forEach((err: string) => toast.error(err, { duration: 5000 }));
      }
    } catch {
      toast.error("インポート処理中にエラーが発生しました");
    } finally {
      setImportingPatients(false);
      if (patientExcelRef.current) patientExcelRef.current.value = "";
    }
  }, [utils]);

  // 個別追加フォーム
  const [showAddForm, setShowAddForm] = useState(false);
  const [addName, setAddName] = useState("");
  const [addKana, setAddKana] = useState("");
  const [addTeam, setAddTeam] = useState<Team>("身体");

  // 一括登録パネル
  const [showBulkPanel, setShowBulkPanel] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkTeam, setBulkTeam] = useState<Team>("身体");

  // 編集中
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editKana, setEditKana] = useState("");
  const [editTeam, setEditTeam] = useState<Team>("身体");

  // 一括登録のパース（1行1名前）
  const bulkParsed = useMemo(() => {
    return bulkText
      .split(/[\n,、，]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length <= 100);
  }, [bulkText]);

  // フィルター済みリスト（有効のみ）
  const filteredPatients = useMemo(() => {
    if (!allPatients) return [];
    return allPatients.filter((p) => {
      if (p.active !== 1) return false;
      const teamOk = filterTeam === "全て" || p.team === filterTeam;
      const nameOk = !searchQuery || p.name.includes(searchQuery) || (p.nameKana ?? "").includes(searchQuery);
      return teamOk && nameOk;
    });
  }, [allPatients, filterTeam, searchQuery]);

  // 退所済リスト
  const inactivePatients = useMemo(() => {
    if (!allPatients) return [];
    return allPatients.filter((p) => {
      if (p.active === 1) return false;
      const teamOk = filterTeam === "全て" || p.team === filterTeam;
      const nameOk = !searchQuery || p.name.includes(searchQuery) || (p.nameKana ?? "").includes(searchQuery);
      return teamOk && nameOk;
    });
  }, [allPatients, filterTeam, searchQuery]);

  // チーム別件数（有効のみ）
  const activePatients = useMemo(() => allPatients?.filter((p) => p.active === 1) ?? [], [allPatients]);
  const teamCounts = useMemo(() => {
    const counts: Record<string, number> = { 全て: activePatients.length };
    for (const t of TEAMS) counts[t] = activePatients.filter((p) => p.team === t).length;
    return counts;
  }, [activePatients]);

  // Mutations
  const createPatient = trpc.patients.create.useMutation({
    onSuccess: () => {
      utils.patients.listAll.invalidate();
      toast.success("利用者を追加しました");
      setAddName(""); setAddKana(""); setShowAddForm(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const batchCreate = trpc.patients.batchCreate.useMutation({
    onSuccess: (data) => {
      utils.patients.listAll.invalidate();
      toast.success(`${data.count}名の利用者を一括登録しました`);
      setBulkText(""); setShowBulkPanel(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const updatePatient = trpc.patients.update.useMutation({
    onSuccess: () => {
      utils.patients.listAll.invalidate();
      toast.success("利用者情報を更新しました");
      setEditingId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deactivatePatient = trpc.patients.deactivate.useMutation({
    onSuccess: () => {
      utils.patients.listAll.invalidate();
      toast.success("退所扱いに変更しました");
    },
    onError: (e) => toast.error(e.message),
  });

  const activatePatient = trpc.patients.activate.useMutation({
    onSuccess: () => {
      utils.patients.listAll.invalidate();
      toast.success("利用者を復帰させました");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleAdd = () => {
    if (!addName.trim()) { toast.error("名前を入力してください"); return; }
    createPatient.mutate({ name: addName.trim(), nameKana: addKana.trim() || undefined, team: addTeam });
  };

  const handleBatchCreate = () => {
    if (bulkParsed.length === 0) { toast.error("名前を入力してください"); return; }
    batchCreate.mutate({ patients: bulkParsed.map((name) => ({ name, team: bulkTeam })) });
  };

  const handleEditStart = (p: { id: number; name: string; nameKana?: string | null; team: string }) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditKana(p.nameKana ?? "");
    setEditTeam(p.team as Team);
  };

  const handleEditSave = () => {
    if (!editName.trim() || editingId === null) return;
    updatePatient.mutate({ id: editingId, name: editName.trim(), nameKana: editKana.trim() || undefined, team: editTeam });
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <CardTitle className="text-base font-semibold">利用者マスタ管理</CardTitle>
            <Badge variant="outline" className="text-xs">{activePatients.length}名</Badge>
          </div>
          <div className="flex gap-2 flex-wrap">
            {/* テンプレートダウンロードボタン */}
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1 text-blue-600 border-blue-300 hover:bg-blue-50"
              onClick={() => {
                const a = document.createElement("a");
                a.href = "/api/template/patients";
                a.click();
              }}
            >
              <Download className="w-3.5 h-3.5" />
              テンプレートDL
            </Button>
            {/* Excelインポートボタン */}
            <input
              ref={patientExcelRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handlePatientExcelImport}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1 text-emerald-600 border-emerald-300 hover:bg-emerald-50"
              onClick={() => patientExcelRef.current?.click()}
              disabled={importingPatients}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              {importingPatients ? "処理中..." : "Excelインポート"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1"
              onClick={() => { setShowBulkPanel((v) => !v); setShowAddForm(false); }}
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
              一括登録
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs gap-1"
              onClick={() => { setShowAddForm((v) => !v); setShowBulkPanel(false); }}
            >
              <Plus className="w-3.5 h-3.5" />
              追加
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          記録入力時に選択できる利用者の一覧を管理します。
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* 一括登録パネル */}
        {showBulkPanel && (
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-primary">一括登録</p>
              <button onClick={() => setShowBulkPanel(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">チーム</label>
              <div className="flex flex-wrap gap-1.5">
                {TEAMS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setBulkTeam(t)}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                      bulkTeam === t ? "bg-primary text-white border-primary" : "bg-background text-foreground border-border hover:border-primary"
                    )}
                  >{t}</button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                利用者名（1行1名、またはカンマ区切り）
              </label>
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={"田中 花子\n鈴木 一郎\n佐藤 美咲\n山田 太郎"}
                rows={6}
                className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background text-foreground focus:outline-none focus:border-primary resize-none"
                autoFocus
              />
              {bulkParsed.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  <span className="text-emerald-600 font-medium">{bulkParsed.length}名</span>を登録します
                </p>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { setBulkText(""); setShowBulkPanel(false); }}>キャンセル</Button>
              <Button size="sm" className="h-8 text-xs" onClick={handleBatchCreate} disabled={bulkParsed.length === 0 || batchCreate.isPending}>
                {batchCreate.isPending ? "登録中..." : `${bulkParsed.length}名を一括登録`}
              </Button>
            </div>
          </div>
        )}

        {/* 個別追加フォーム */}
        {showAddForm && (
          <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">利用者を追加</p>
              <button onClick={() => setShowAddForm(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">名前 <span className="text-destructive">*</span></label>
                <input
                  type="text"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="田中 花子"
                  className="w-full text-sm border border-border rounded-md px-3 py-1.5 bg-background text-foreground focus:outline-none focus:border-primary"
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">ふりがな（任意）</label>
                <input
                  type="text"
                  value={addKana}
                  onChange={(e) => setAddKana(e.target.value)}
                  placeholder="たなか はなこ"
                  className="w-full text-sm border border-border rounded-md px-3 py-1.5 bg-background text-foreground focus:outline-none focus:border-primary"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">チーム <span className="text-destructive">*</span></label>
                <div className="flex flex-wrap gap-1.5">
                  {TEAMS.map((t) => (
                    <button
                      key={t}
                      onClick={() => setAddTeam(t)}
                      className={cn(
                        "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                        addTeam === t ? "bg-primary text-white border-primary" : "bg-background text-foreground border-border hover:border-primary"
                      )}
                    >{t}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { setAddName(""); setAddKana(""); setShowAddForm(false); }}>キャンセル</Button>
              <Button size="sm" className="h-8 text-xs" onClick={handleAdd} disabled={!addName.trim() || createPatient.isPending}>
                {createPatient.isPending ? "追加中..." : "追加"}
              </Button>
            </div>
          </div>
        )}

        {/* チームフィルター */}
        <div className="flex flex-wrap gap-1.5">
          {(["全て", ...TEAMS] as const).map((t) => {
            const isTeam = ["身体","天理","郡山北部","郡山南部"].includes(t);
            return (
              <button
                key={t}
                onClick={() => setFilterTeam(t)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
                  isTeam
                    ? getTeamButtonClass(t, filterTeam === t)
                    : filterTeam === t
                      ? "bg-primary text-white border-transparent shadow-md scale-105"
                      : "bg-background text-foreground border-border hover:border-primary hover:text-primary"
                )}
                style={isTeam ? getTeamButtonStyle(t, filterTeam === t) : undefined}
              >
                {t}
                <span className="ml-1 opacity-70">({teamCounts[t] ?? 0})</span>
              </button>
            );
          })}
        </div>

        {/* 名前検索 */}
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="名前で検索..."
          className="w-full text-sm border border-border rounded-md px-3 py-1.5 bg-background text-foreground focus:outline-none focus:border-primary"
        />

        {/* 利用者リスト */}
        {isLoading ? (
          <div className="space-y-2 py-2">
            {[1,2,3,4].map(i => (
              <div key={i} className="h-10 bg-muted/60 animate-pulse rounded-lg" />
            ))}
          </div>
        ) : filteredPatients.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <Users className="w-8 h-8 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">
              {allPatients?.length === 0 ? "利用者が登録されていません" : "該当する利用者がいません"}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {filteredPatients.map((p, idx) => {
              const isEditing = editingId === p.id;
              return (
                <div key={p.id}>
                  {idx > 0 && <Separator className="my-1" />}
                  {isEditing ? (
                    // 編集フォーム
                    <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                      <div className="grid grid-cols-1 gap-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="text-sm border border-border rounded-md px-3 py-1.5 bg-background text-foreground focus:outline-none focus:border-primary"
                          autoFocus
                        />
                        <input
                          type="text"
                          value={editKana}
                          onChange={(e) => setEditKana(e.target.value)}
                          placeholder="ふりがな（任意）"
                          className="text-sm border border-border rounded-md px-3 py-1.5 bg-background text-foreground focus:outline-none focus:border-primary"
                        />
                        <div className="flex flex-wrap gap-1.5">
                          {TEAMS.map((t) => (
                            <button
                              key={t}
                              onClick={() => setEditTeam(t)}
                              className={cn(
                                "px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors",
                                editTeam === t ? "bg-primary text-white border-primary" : "bg-background text-foreground border-border hover:border-primary"
                              )}
                            >{t}</button>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditingId(null)}>キャンセル</Button>
                        <Button size="sm" className="h-7 text-xs" onClick={handleEditSave} disabled={!editName.trim() || updatePatient.isPending}>
                          {updatePatient.isPending ? "保存中..." : "保存"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // 通常表示
                    <div className="flex items-center justify-between py-1.5 px-1 rounded-lg hover:bg-muted/30 group transition-colors">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                        {p.nameKana && (
                          <p className="text-xs text-muted-foreground">{p.nameKana}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge variant="outline" className={cn(
                          "text-xs px-1.5 py-0",
                          p.team === "身体" && "border-blue-300 text-blue-600",
                          p.team === "天理" && "border-purple-300 text-purple-600",
                          p.team === "郡山北部" && "border-emerald-300 text-emerald-600",
                          p.team === "郡山南部" && "border-orange-300 text-orange-600",
                        )}>{p.team}</Badge>
                        <button
                          onClick={() => handleEditStart(p)}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-opacity p-1"
                          title="編集"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`「${p.name}」を退所扱いに変更しますか？\n退所後は記録入力画面に表示されなくなります。`)) {
                              deactivatePatient.mutate({ id: p.id });
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-amber-600 transition-opacity p-1"
                          title="退所"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 退所済セクション */}
        {inactivePatients.length > 0 && (
          <div className="mt-4">
            <button
              onClick={() => setShowInactive((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showInactive && "rotate-180")} />
              退所済利用者（{inactivePatients.length}名）
            </button>
            {showInactive && (
              <div className="mt-2 space-y-1 border border-border/50 rounded-lg p-2 bg-muted/20">
                {inactivePatients.map((p, idx) => (
                  <div key={p.id}>
                    {idx > 0 && <Separator className="my-1" />}
                    <div className="flex items-center justify-between py-1 px-1 rounded-lg hover:bg-muted/30 group transition-colors opacity-60 hover:opacity-100">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-muted-foreground truncate line-through">{p.name}</p>
                        {p.nameKana && (
                          <p className="text-xs text-muted-foreground/70">{p.nameKana}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge variant="outline" className="text-xs px-1.5 py-0 opacity-50">{p.team}</Badge>
                        <Badge variant="outline" className="text-xs px-1.5 py-0 border-amber-300 text-amber-600">退所</Badge>
                        <button
                          onClick={() => {
                            if (confirm(`「${p.name}」を復帰させますか？`)) {
                              activatePatient.mutate({ id: p.id });
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-emerald-600 transition-opacity p-1"
                          title="復帰"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================
// メイン管理画面
// ============================

export default function Admin() {
  const utils = trpc.useUtils();

  const { data: allLinks, isLoading } = trpc.spreadsheetLinks.getAll.useQuery();

  const upsertLink = trpc.spreadsheetLinks.upsert.useMutation({
    onSuccess: () => {
      utils.spreadsheetLinks.getAll.invalidate();
      utils.spreadsheetLinks.getCurrent.invalidate();
      toast.success("リンクを保存しました");
      setEditingKey(null);
      setEditUrl("");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteLink = trpc.spreadsheetLinks.delete.useMutation({
    onSuccess: () => {
      utils.spreadsheetLinks.getAll.invalidate();
      utils.spreadsheetLinks.getCurrent.invalidate();
      toast.success("リンクを削除しました");
    },
    onError: (e) => toast.error(e.message),
  });

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState("");

  const now = new Date();
  const nextMonthYear = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
  const nextMonthMonth = now.getMonth() === 11 ? 1 : now.getMonth() + 2;
  const [selectedYear, setSelectedYear] = useState(nextMonthYear);
  const [selectedMonth, setSelectedMonth] = useState(nextMonthMonth);
  const selectedYearMonth = toYearMonth(selectedYear, selectedMonth);
  const currentYearMonth = toYearMonth(now.getFullYear(), now.getMonth() + 1);

  const selectedLinks = useMemo(() => {
    if (!allLinks) return {} as Record<string, { id: number; url: string }>;
    return Object.fromEntries(
      allLinks.filter((l) => l.yearMonth === selectedYearMonth).map((l) => [l.linkKey, { id: l.id, url: l.url }])
    );
  }, [allLinks, selectedYearMonth]);

  const registeredMonths = useMemo(() => {
    if (!allLinks) return [];
    return Array.from(new Set(allLinks.map((l) => l.yearMonth))).sort().reverse();
  }, [allLinks]);

  const handleSave = (linkKey: string, label: string, color: string) => {
    if (!editUrl.trim()) { toast.error("URLを入力してください"); return; }
    upsertLink.mutate({ linkKey, label, yearMonth: selectedYearMonth, url: editUrl.trim(), color });
  };

  const monthOptions = useMemo(() => {
    const opts = [];
    for (let i = 0; i <= 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      opts.push({
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        ym: toYearMonth(d.getFullYear(), d.getMonth() + 1),
        label: formatYearMonth(toYearMonth(d.getFullYear(), d.getMonth() + 1)),
        isCurrent: toYearMonth(d.getFullYear(), d.getMonth() + 1) === currentYearMonth,
      });
    }
    return opts;
  }, []);

  // セクション切り替え
  const [activeSection, setActiveSection] = useState<"sheets" | "patients" | "staff" | "import" | "settings" | "quickaccess" | "teamGoals" | "toolLogs" | "alcoholSheets">("sheets");
  const { user: currentUser } = useAuth();

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      {/* ページヘッダー */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Settings className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">管理画面</h1>
          <p className="text-sm text-muted-foreground">スプレッドシートURL管理・利用者マスタ管理・スタッフ管理</p>
        </div>
      </div>

      {/* セクションタブ */}
      <div className="flex gap-2 border-b border-border overflow-x-auto scrollbar-none" style={{ WebkitOverflowScrolling: 'touch' }}>
        <button
          onClick={() => setActiveSection("sheets")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap flex-shrink-0",
            activeSection === "sheets"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          スプレッドシートURL
        </button>
        <button
          onClick={() => setActiveSection("patients")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap flex-shrink-0",
            activeSection === "patients"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          利用者マスタ
        </button>
        {currentUser?.role === "admin" && (
          <button
            onClick={() => setActiveSection("staff")}
            className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap flex-shrink-0",
            activeSection === "staff"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            スタッフ管理
          </button>
        )}
        {currentUser?.role === "admin" && (
          <button
            onClick={() => setActiveSection("import")}
            className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap flex-shrink-0",
            activeSection === "import"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            一括インポート
          </button>
        )}
        {/* クイックアクセスはホーム画面から削除済みのため非表示 */}
        {currentUser?.role === "admin" && (
          <button
            onClick={() => setActiveSection("teamGoals")}
            className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap flex-shrink-0",
            activeSection === "teamGoals"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            チーム目標
          </button>
        )}
        {currentUser?.role === "admin" && (
          <button
            onClick={() => setActiveSection("settings")}
            className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap flex-shrink-0",
            activeSection === "settings"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            システム設定
          </button>
        )}
        {(currentUser?.role === "admin" || (currentUser as any)?.team === "事務員") && (
          <button
            onClick={() => setActiveSection("toolLogs")}
            className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap flex-shrink-0",
            activeSection === "toolLogs"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            ツール操作ログ
          </button>
        )}
        {currentUser?.role === "admin" && (
          <button
            onClick={() => setActiveSection("alcoholSheets")}
            className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap flex-shrink-0",
            activeSection === "alcoholSheets"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            アルコールチェック管理
          </button>
        )}
      </div>

      {/* スプレッドシートURLセクション */}
      {activeSection === "sheets" && (
        <>
          {/* 月選択 */}
          <Card className="shadow-sm">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-base font-semibold">対象月を選択</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {monthOptions.map((opt) => (
                  <button
                    key={opt.ym}
                    onClick={() => { setSelectedYear(opt.year); setSelectedMonth(opt.month); setEditingKey(null); setEditUrl(""); }}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
                      selectedYearMonth === opt.ym
                        ? "bg-primary text-white border-primary"
                        : "bg-background text-foreground border-border hover:border-primary hover:text-primary"
                    )}
                  >
                    {opt.label}
                    {opt.isCurrent && <span className="ml-1 text-xs opacity-70">（今月）</span>}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 一括インポートパネル */}
          <BulkImportPanel
            selectedYearMonth={selectedYearMonth}
            onSuccess={() => { setEditingKey(null); setEditUrl(""); }}
          />

          {/* リンク一覧・個別登録フォーム */}
          <Card className="shadow-sm">
            <CardHeader className="pb-2 pt-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">
                  {formatYearMonth(selectedYearMonth)} のスプレッドシートURL
                </CardTitle>
                <div className="flex items-center gap-2">
                  {selectedYearMonth === currentYearMonth && (
                    <Badge variant="secondary" className="text-xs bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400">今月</Badge>
                  )}
                  {selectedYearMonth > currentYearMonth && (
                    <Badge variant="secondary" className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400">来月以降</Badge>
                  )}
                  <Badge variant="outline" className="text-xs">
                    {Object.keys(selectedLinks).length} / {LINK_DEFINITIONS.length} 件登録済み
                  </Badge>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                URLを登録すると、{formatYearMonth(selectedYearMonth)}になった時点でダッシュボードに自動反映されます。
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {isLoading ? (
                <div className="space-y-3 py-2">
                  {[1,2,3].map(i => (
                    <div key={i} className="h-12 bg-muted/60 animate-pulse rounded-lg" />
                  ))}
                </div>
              ) : (
                LINK_DEFINITIONS.map((def, idx) => {
                  const registered = selectedLinks[def.key];
                  const isEditing = editingKey === `${def.key}-${selectedYearMonth}`;
                  return (
                    <div key={def.key}>
                      {idx > 0 && <Separator className="my-2" />}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {registered ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                            ) : (
                              <div className="w-3.5 h-3.5 rounded-full border border-muted-foreground/30 flex-shrink-0" />
                            )}
                            <p className={cn("text-sm font-medium truncate", def.color)}>{def.label}</p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {registered ? (
                              <>
                                <a href={registered.url} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-primary flex items-center gap-0.5" title="開く">
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                                <button
                                  onClick={() => {
                                    if (isEditing) { setEditingKey(null); setEditUrl(""); }
                                    else { setEditingKey(`${def.key}-${selectedYearMonth}`); setEditUrl(registered.url); }
                                  }}
                                  className="text-xs text-muted-foreground hover:text-primary px-1.5 py-0.5 rounded border border-border hover:border-primary transition-colors"
                                >
                                  {isEditing ? "閉じる" : "編集"}
                                </button>
                                <button onClick={() => deleteLink.mutate({ id: registered.id })} className="text-muted-foreground hover:text-destructive p-1" title="削除">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => {
                                  if (isEditing) { setEditingKey(null); setEditUrl(""); }
                                  else { setEditingKey(`${def.key}-${selectedYearMonth}`); setEditUrl(""); }
                                }}
                                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 px-2 py-0.5 rounded border border-primary/30 hover:border-primary transition-colors"
                              >
                                <Plus className="w-3 h-3" />
                                URL登録
                              </button>
                            )}
                          </div>
                        </div>
                        {registered && !isEditing && (
                          <p className="text-xs text-muted-foreground truncate pl-5 font-mono">{registered.url}</p>
                        )}
                        {isEditing && (
                          <div className="flex gap-2 mt-1 pl-5">
                            <input
                              type="url"
                              placeholder="https://docs.google.com/spreadsheets/d/..."
                              value={editUrl}
                              onChange={(e) => setEditUrl(e.target.value)}
                              className="flex-1 text-xs border border-border rounded px-2 py-1.5 bg-background text-foreground focus:outline-none focus:border-primary"
                              autoFocus
                            />
                            <Button size="sm" className="h-7 text-xs px-3 flex-shrink-0" onClick={() => handleSave(def.key, def.label, def.color)} disabled={upsertLink.isPending}>
                              保存
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* 登録済み月の概要 */}
          {registeredMonths.length > 0 && (
            <Card className="shadow-sm">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-base font-semibold">登録済み月の一覧</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {registeredMonths.map((ym) => {
                    const count = allLinks?.filter((l) => l.yearMonth === ym).length ?? 0;
                    const isCurrent = ym === currentYearMonth;
                    const isComplete = count === LINK_DEFINITIONS.length;
                    return (
                      <div
                        key={ym}
                        className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => {
                          const [y, m] = ym.split("-").map(Number);
                          setSelectedYear(y); setSelectedMonth(m); setEditingKey(null); setEditUrl("");
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        <div className="flex items-center gap-2">
                          {isComplete
                            ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            : <div className="w-3.5 h-3.5 rounded-full border border-amber-400" />
                          }
                          <span className="text-sm font-medium">{formatYearMonth(ym)}</span>
                          {isCurrent && <Badge variant="secondary" className="text-xs bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 px-1.5 py-0">今月</Badge>}
                          {ym > currentYearMonth && <Badge variant="secondary" className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 px-1.5 py-0">来月以降</Badge>}
                        </div>
                        <span className={cn("text-xs font-medium", isComplete ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
                          {count} / {LINK_DEFINITIONS.length} 件
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* 利用者マスタセクション */}
      {activeSection === "patients" && <PatientMasterPanel />}

      {/* スタッフ管理セクション */}
      {activeSection === "staff" && <StaffManagementPanel />}

      {/* 一括インポートセクション */}
      {activeSection === "import" && <BulkExcelImportPanel />}

      {/* システム設定セクション */}
      {activeSection === "teamGoals" && <TeamGoalsPanel />}
      {activeSection === "settings" && <SystemSettingsPanel />}

      {/* クイックアクセスリンク管理セクション（ホーム画面から削除済みのため非表示） */}
      {/* ツール操作ログセクション */}
      {activeSection === "toolLogs" && <ToolAuditLogsPanel />}
      {/* アルコールチェック月別スプレッドシート管理 */}
      {activeSection === "alcoholSheets" && <AlcoholCheckSpreadsheetsPanel />}
    </div>
  );
}

// ============================
// スタッフ管理パネル
// ============================

const TEAMS_STAFF = ["身体", "天理", "郡山北部", "郡山南部", "事務員", "全チーム"] as const;
type TeamStaff = typeof TEAMS_STAFF[number];

function StaffManagementPanel() {
  const utils = trpc.useUtils();
  const { data: staffList, isLoading } = trpc.staff.getAll.useQuery();

  // Excelインポート
  const staffExcelRef = useRef<HTMLInputElement>(null);
  const [importingStaff, setImportingStaff] = useState(false);
  const handleStaffExcelImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingStaff(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/import/staff", { method: "POST", body: formData, credentials: "include" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "インポートに失敗しました"); return; }
      utils.staff.getAll.invalidate();
      const msg = `${data.count}名のスタッフを登録しました${data.skipped ? `（${data.skipped}名はメール重複のためスキップ）` : ""}${data.errors?.length ? `（${data.errors.length}件エラー）` : ""}`;
      toast.success(msg);
      if (data.errors?.length) {
        data.errors.slice(0, 3).forEach((err: string) => toast.error(err, { duration: 5000 }));
      }
    } catch {
      toast.error("インポート処理中にエラーが発生しました");
    } finally {
      setImportingStaff(false);
      if (staffExcelRef.current) staffExcelRef.current.value = "";
    }
  }, [utils]);

  // 新規作成フォーム
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"user" | "admin">("user");
  const [newTeam, setNewTeam] = useState<TeamStaff>("身体");
  const [newNumberPlate, setNewNumberPlate] = useState("");

  // パスワードリセット
  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const createStaff = trpc.staff.create.useMutation({
    onSuccess: () => {
      utils.staff.getAll.invalidate();
      toast.success("スタッフアカウントを作成しました");
      setNewName(""); setNewEmail(""); setNewPassword(""); setNewRole("user"); setNewTeam("身体"); setNewNumberPlate(""); setShowAddForm(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteStaff = trpc.staff.delete.useMutation({
    onSuccess: () => {
      utils.staff.getAll.invalidate();
      toast.success("スタッフアカウントを削除しました");
    },
    onError: (e) => toast.error(e.message),
  });

  const resetPasswordMutation = trpc.staff.resetPassword.useMutation({
    onSuccess: () => {
      toast.success("パスワードをリセットしました");
      setResetUserId(null); setResetPassword("");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateRole = trpc.staff.updateRole.useMutation({
    onSuccess: () => {
      utils.staff.getAll.invalidate();
      toast.success("権限を変更しました");
    },
    onError: (e) => toast.error(e.message),
  });

  // チーム未設定フィルター
  const [showUnsetOnly, setShowUnsetOnly] = useState(false);

  // スタッフ情報編集ダイアログ
  const [editStaff, setEditStaff] = useState<{ id: number; name: string; team: TeamStaff; role: "user" | "admin"; numberPlate: string } | null>(null);
  const [editName, setEditName] = useState("");
  const [editTeam, setEditTeam] = useState<TeamStaff>("身体");
  const [editRole, setEditRole] = useState<"user" | "admin">("user");
  const [editNumberPlate, setEditNumberPlate] = useState("");

  const updateInfo = trpc.staff.updateInfo.useMutation({
    onSuccess: () => {
      utils.staff.getAll.invalidate();
      toast.success("スタッフ情報を更新しました");
      setEditStaff(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const openEditDialog = (staff: { id: number; name: string | null; team: string | null; role: "user" | "admin"; numberPlate?: string | null }) => {
    setEditStaff({ id: staff.id, name: staff.name ?? "", team: (staff.team as TeamStaff) ?? "身体", role: staff.role, numberPlate: staff.numberPlate ?? "" });
    setEditName(staff.name ?? "");
    setEditTeam((staff.team as TeamStaff) ?? "身体");
    setEditRole(staff.role);
    setEditNumberPlate(staff.numberPlate ?? "");
  };

  // メールアドレス編集
  const [editEmailUserId, setEditEmailUserId] = useState<number | null>(null);
  const [editEmailValue, setEditEmailValue] = useState("");

  const updateEmail = trpc.staff.updateEmail.useMutation({
    onSuccess: () => {
      utils.staff.getAll.invalidate();
      toast.success("メールアドレスを更新しました");
      setEditEmailUserId(null);
      setEditEmailValue("");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleCreate = () => {
    if (!newName.trim()) { toast.error("名前を入力してください"); return; }
    if (!newEmail.trim()) { toast.error("メールアドレスを入力してください"); return; }
    if (newPassword.length < 6) { toast.error("パスワードは6文字以上で入力してください"); return; }
    createStaff.mutate({ name: newName.trim(), email: newEmail.trim(), password: newPassword, role: newRole, team: newTeam, numberPlate: newNumberPlate.trim() || undefined });
  };

  return (
    <>
    <Card className="shadow-sm">
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <CardTitle className="text-base font-semibold">スタッフアカウント管理</CardTitle>
            <Badge variant="outline" className="text-xs">{staffList?.length ?? 0}名</Badge>
          </div>
          <div className="flex gap-2 flex-wrap">
            {/* テンプレートダウンロードボタン */}
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1 text-blue-600 border-blue-300 hover:bg-blue-50"
              onClick={() => {
                const a = document.createElement("a");
                a.href = "/api/template/staff";
                a.click();
              }}
            >
              <Download className="w-3.5 h-3.5" />
              テンプレートDL
            </Button>
            {/* Excelインポートボタン */}
            <input
              ref={staffExcelRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleStaffExcelImport}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1 text-emerald-600 border-emerald-300 hover:bg-emerald-50"
              onClick={() => staffExcelRef.current?.click()}
              disabled={importingStaff}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              {importingStaff ? "処理中..." : "Excelインポート"}
            </Button>
            <Button size="sm" className="h-8 text-xs gap-1" onClick={() => setShowAddForm((v) => !v)}>
              <UserPlus className="w-3.5 h-3.5" />
              新規追加
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">スタッフのログインアカウントを管理します。</p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* 新規作成フォーム */}
        {showAddForm && (
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-primary">新規スタッフ追加</p>
              <button onClick={() => setShowAddForm(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">氏名 *</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="例：山田 花子"
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">メールアドレス *</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="例：hanako@kokoronohinata.com"
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">初期パスワード * （6文字以上）</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="パスワードを入力"
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">ナンバープレート（任意）</label>
                <input
                  type="text"
                  value={newNumberPlate}
                  onChange={(e) => setNewNumberPlate(e.target.value)}
                  placeholder="例：大和 12-34 あ 5678"
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">チーム</label>
                <div className="flex flex-wrap gap-1.5">
                  {TEAMS_STAFF.map((t) => (
                    <button
                      key={t}
                      onClick={() => setNewTeam(t)}
                      className={cn(
                        "text-xs px-2.5 py-1 rounded-full border transition-colors",
                        newTeam === t ? "bg-blue-600 text-white border-blue-600" : "border-border text-muted-foreground hover:border-blue-600 hover:text-blue-600"
                      )}
                    >
                      {t}チーム
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">権限</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setNewRole("user")}
                    className={cn(
                      "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors",
                      newRole === "user" ? "bg-primary text-white border-primary" : "border-border text-muted-foreground hover:border-primary"
                    )}
                  >
                    <Shield className="w-3.5 h-3.5" />
                    一般スタッフ
                  </button>
                  <button
                    onClick={() => setNewRole("admin")}
                    className={cn(
                      "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors",
                      newRole === "admin" ? "bg-amber-500 text-white border-amber-500" : "border-border text-muted-foreground hover:border-amber-500"
                    )}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    管理者
                  </button>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setShowAddForm(false)}>キャンセル</Button>
              <Button size="sm" className="h-8 text-xs" onClick={handleCreate} disabled={createStaff.isPending}>
                {createStaff.isPending ? "作成中..." : "アカウント作成"}
              </Button>
            </div>
          </div>
        )}

        {/* スタッフ一覧 */}
        {isLoading ? (
          <div className="space-y-2 py-2">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="h-14 bg-muted/60 animate-pulse rounded-xl" />
            ))}
          </div>
        ) : !staffList || staffList.length === 0 ? (
          <div className="py-8 text-center">
            <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">スタッフがいません</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* チーム未設定フィルター */}
            {(() => {
              const unsetCount = staffList.filter((s) => !s.teamSetupDone).length;
              return unsetCount > 0 ? (
                <div className="flex items-center justify-between bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-xl px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-orange-700 dark:text-orange-400">チーム未設定のスタッフが {unsetCount}名 います</span>
                  </div>
                  <button
                    onClick={() => setShowUnsetOnly((v) => !v)}
                    className={cn(
                      "text-xs px-2.5 py-1 rounded-lg font-medium transition-colors",
                      showUnsetOnly
                        ? "bg-orange-500 text-white hover:bg-orange-600"
                        : "bg-white dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 border border-orange-300 dark:border-orange-600 hover:bg-orange-100"
                    )}
                  >
                    {showUnsetOnly ? "全員表示" : "未設定のみ表示"}
                  </button>
                </div>
              ) : null;
            })()}
            {(showUnsetOnly ? staffList.filter((s) => !s.teamSetupDone) : staffList).map((staff, idx) => (
              <div key={staff.id}>
                {idx > 0 && <Separator className="my-2" />}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{staff.name ?? "名前未設定"}</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs px-1.5 py-0",
                          staff.role === "admin" ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-700" : "bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-700"
                        )}
                      >
                        {staff.role === "admin" ? "管理者" : "スタッフ"}
                      </Badge>
                      {staff.team && (
                        <Badge variant="outline" className="text-xs px-1.5 py-0 bg-muted text-muted-foreground">{staff.team}</Badge>
                      )}
                      {!staff.teamSetupDone && (
                        <Badge variant="outline" className="text-xs px-1.5 py-0 bg-orange-50 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-700">
                          チーム未設定
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{staff.email ?? "メール未設定"}</p>
                    <p className="text-xs text-muted-foreground">最終ログイン: {staff.lastSignedIn ? new Date(staff.lastSignedIn).toLocaleDateString("ja-JP") : "未ログイン"}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* スタッフ情報編集 */}
                    <button
                      onClick={() => openEditDialog(staff)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-green-600 hover:bg-green-50 transition-colors"
                      title="スタッフ情報を編集"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {/* メールアドレス編集 */}
                    <button
                      onClick={() => { setEditEmailUserId(staff.id); setEditEmailValue(staff.email ?? ""); }}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      title="メールアドレス変更（Googleログイン用）"
                    >
                      <Mail className="w-3.5 h-3.5" />
                    </button>
                    {/* パスワードリセット */}
                    <button
                      onClick={() => { setResetUserId(staff.id); setResetPassword(""); }}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                      title="パスワードリセット"
                    >
                      <Key className="w-3.5 h-3.5" />
                    </button>
                    {/* 権限切り替え */}
                    <button
                      onClick={() => updateRole.mutate({ userId: staff.id, role: staff.role === "admin" ? "user" : "admin" })}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-amber-600 hover:bg-amber-50 transition-colors"
                      title={staff.role === "admin" ? "一般スタッフに変更" : "管理者に変更"}
                    >
                      {staff.role === "admin" ? <Shield className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                    </button>
                    {/* 削除 */}
                    <button
                      onClick={() => {
                        if (confirm(`${staff.name ?? "このスタッフ"}のアカウントを削除しますか？`)) {
                          deleteStaff.mutate({ userId: staff.id });
                        }
                      }}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="アカウントを削除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* メールアドレス編集フォーム */}
                {editEmailUserId === staff.id && (
                  <div className="mt-2 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-medium text-blue-700 dark:text-blue-400">{staff.name}のメールアドレス変更（Googleログイン用）</p>
                    <input
                      type="email"
                      value={editEmailValue}
                      onChange={(e) => setEditEmailValue(e.target.value)}
                      placeholder="例：hanako@kokoronohinata.com"
                      className="w-full text-sm border border-border rounded-lg px-3 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                    <p className="text-xs text-blue-600 dark:text-blue-400">GoogleアカウントのメールアドレスをここにGoogleログインできるようになります</p>
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setEditEmailUserId(null); setEditEmailValue(""); }}>キャンセル</Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-blue-600 hover:bg-blue-700"
                        onClick={() => {
                          if (!editEmailValue.trim()) { toast.error("メールアドレスを入力してください"); return; }
                          updateEmail.mutate({ userId: staff.id, email: editEmailValue.trim() });
                        }}
                        disabled={updateEmail.isPending}
                      >
                        {updateEmail.isPending ? "更新中..." : "メールアドレスを変更"}
                      </Button>
                    </div>
                  </div>
                )}

                {/* パスワードリセットフォーム */}
                {resetUserId === staff.id && (
                  <div className="mt-2 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-400">{staff.name}のパスワードリセット</p>
                    <input
                      type="password"
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      placeholder="新しいパスワード（6文字以上）"
                      className="w-full text-sm border border-border rounded-lg px-3 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-amber-400"
                    />
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setResetUserId(null); setResetPassword(""); }}>キャンセル</Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-amber-500 hover:bg-amber-600"
                        onClick={() => {
                          if (resetPassword.length < 6) { toast.error("パスワードは6文字以上で入力してください"); return; }
                          resetPasswordMutation.mutate({ userId: staff.id, newPassword: resetPassword });
                        }}
                        disabled={resetPasswordMutation.isPending}
                      >
                        {resetPasswordMutation.isPending ? "更新中..." : "パスワードを変更"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>

    {/* スタッフ情報編集ダイアログ */}
    {editStaff && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in-overlay">
        <div className="bg-background rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4 animate-slide-up-modal">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-foreground">スタッフ情報の編集</h3>
            <button
              onClick={() => setEditStaff(null)}
              className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 名前 */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">名前</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="例：山田花子"
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {/* チーム */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">所属チーム</label>
            <div className="flex flex-wrap gap-1.5">
              {TEAMS_STAFF.map((t) => (
                <button
                  key={t}
                  onClick={() => setEditTeam(t)}
                  className={cn(
                    "px-3 py-1 text-xs rounded-full border transition-colors",
                    editTeam === t
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-primary"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* 権限 */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">権限</label>
            <div className="flex gap-2">
              <button
                onClick={() => setEditRole("user")}
                className={cn(
                  "flex-1 py-1.5 text-xs rounded-lg border transition-colors",
                  editRole === "user"
                    ? "bg-blue-600 text-white border-blue-600"
                    : "border-border text-muted-foreground hover:border-blue-400"
                )}
              >
                一般スタッフ
              </button>
              <button
                onClick={() => setEditRole("admin")}
                className={cn(
                  "flex-1 py-1.5 text-xs rounded-lg border transition-colors",
                  editRole === "admin"
                    ? "bg-amber-500 text-white border-amber-500"
                    : "border-border text-muted-foreground hover:border-amber-400"
                )}
              >
                管理者
              </button>
            </div>
          </div>

          {/* ナンバープレート */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">ナンバープレート</label>
            <input
              type="text"
              value={editNumberPlate}
              onChange={(e) => setEditNumberPlate(e.target.value)}
              placeholder="例：大和 12-34 あ 5678"
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          {/* ボタン */}
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="flex-1 h-9 text-sm"
              onClick={() => setEditStaff(null)}
            >
              キャンセル
            </Button>
            <Button
              className="flex-1 h-9 text-sm"
              onClick={() => {
                if (!editName.trim()) { toast.error("名前を入力してください"); return; }
                updateInfo.mutate({ userId: editStaff.id, name: editName.trim(), team: editTeam, role: editRole, numberPlate: editNumberPlate.trim() || undefined });
              }}
              disabled={updateInfo.isPending}
            >
              {updateInfo.isPending ? "更新中..." : "保存"}
            </Button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// ============================
// 一括Excelインポートパネル
// ============================

function BulkExcelImportPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const importMutation = trpc.import.excel.useMutation({
    onSuccess: (result) => {
      const pMsg = `利用者: ${result.patients.success}件登録${result.patients.skipped > 0 ? `・${result.patients.skipped}件スキップ` : ""}`;
      const sMsg = `スタッフ: ${result.staff.success}件更新${result.staff.skipped > 0 ? `・${result.staff.skipped}件スキップ` : ""}`;
      const hasErrors = result.patients.errors.length > 0 || result.staff.errors.length > 0;

      if (hasErrors) {
        const allErrors = [...result.patients.errors, ...result.staff.errors];
        toast.warning(`インポート完了（一部エラー）\n${pMsg} / ${sMsg}`, {
          description: allErrors.slice(0, 3).join("\n") + (allErrors.length > 3 ? `\n他${allErrors.length - 3}件` : ""),
          duration: 8000,
        });
      } else {
        toast.success(`インポート完了！ ${pMsg} / ${sMsg}`);
      }

      // キャッシュを更新
      utils.patients.list.invalidate();
      utils.staff.getAll.invalidate();
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    onError: (e) => toast.error(e.message),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f && (f.name.endsWith(".xlsx") || f.name.endsWith(".xls"))) {
      setFile(f);
    } else {
      toast.error(".xlsx または .xls ファイルをドロップしてください");
    }
  };

  const handleImport = async () => {
    if (!file) return;
    // FileをBase64に変換
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      importMutation.mutate({ fileBase64: base64, fileName: file.name });
    };
    reader.readAsDataURL(file);
  };

  const handleDownloadTemplate = () => {
    const a = document.createElement("a");
    a.href = "https://d2xsxph8kpxj0f.cloudfront.net/310519663391327537/ZgP48RW5U5uSAWGdBswK3V/\u3072\u306a\u305f_\u4e00\u62ec\u30a4\u30f3\u30dd\u30fc\u30c8_30e004e2.xlsx";
    a.download = "\u3072\u306a\u305f_\u4e00\u62ec\u30a4\u30f3\u30dd\u30fc\u30c8.xlsx";
    a.click();
  };

  return (
    <div className="space-y-4">
      {/* 説明カード */}
      <Card className="shadow-sm border-primary/20 bg-primary/5">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Upload className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground mb-1">エクセルファイルで利用者・スタッフを一括登録</p>
              <p className="text-xs text-muted-foreground leading-relaxed mb-2">
                「ひなた_一括インポート.xlsx」テンプレートに入力したデータを読み込みます。<br />
                <span className="font-medium text-foreground">利用者シート</span>：新規登録（最大200件）<br />
                <span className="font-medium text-foreground">スタッフシート</span>：既存ユーザーのチーム・権限を更新（未ログインユーザーはスキップ）
              </p>
              <button
                onClick={handleDownloadTemplate}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <Download className="w-3 h-3" />
                テンプレートをダウンロード
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ファイルアップロードエリア */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            Excelファイルを選択
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* ドラッグ&ドロップエリア */}
          <div
            className={cn(
              "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all",
              dragOver
                ? "border-primary bg-primary/5 scale-[1.01]"
                : "border-border hover:border-primary/50 hover:bg-muted/30",
              file && "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20"
            )}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFileChange}
            />
            {file ? (
              <div className="space-y-2">
                <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto">
                  <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
                </div>
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400">クリックで別のファイルを選択</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto">
                  <Upload className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">クリックまたはドラッグ&ドロップ</p>
                <p className="text-xs text-muted-foreground">.xlsx / .xls ファイル対応</p>
              </div>
            )}
          </div>

          {/* アクションボタン */}
          <div className="flex gap-3">
            <Button
              onClick={handleImport}
              disabled={!file || importMutation.isPending}
              className="flex-1"
            >
              {importMutation.isPending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                  インポート中...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  インポート実行
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
              disabled={!file || importMutation.isPending}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* インポート結果 */}
      {importMutation.isSuccess && (
        <Card className="shadow-sm border-emerald-200 dark:border-emerald-800">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-base font-semibold flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              インポート結果
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* 利用者 */}
            <div className="rounded-lg bg-muted/50 p-3 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">利用者シート</p>
              <div className="flex gap-4 text-sm">
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  ✓ {importMutation.data.patients.success}件 登録
                </span>
                {importMutation.data.patients.skipped > 0 && (
                  <span className="text-muted-foreground">{importMutation.data.patients.skipped}件 スキップ</span>
                )}
              </div>
              {importMutation.data.patients.errors.length > 0 && (
                <div className="mt-2 space-y-1">
                  {importMutation.data.patients.errors.map((err, i) => (
                    <p key={i} className="text-xs text-destructive flex items-start gap-1">
                      <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      {err}
                    </p>
                  ))}
                </div>
              )}
            </div>
            {/* スタッフ */}
            <div className="rounded-lg bg-muted/50 p-3 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">スタッフシート</p>
              <div className="flex gap-4 text-sm">
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  ✓ {importMutation.data.staff.success}件 更新
                </span>
                {importMutation.data.staff.skipped > 0 && (
                  <span className="text-muted-foreground">{importMutation.data.staff.skipped}件 スキップ（未ログイン）</span>
                )}
              </div>
              {importMutation.data.staff.errors.length > 0 && (
                <div className="mt-2 space-y-1">
                  {importMutation.data.staff.errors.map((err, i) => (
                    <p key={i} className="text-xs text-destructive flex items-start gap-1">
                      <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      {err}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 注意事項 */}
      <Card className="shadow-sm">
        <CardContent className="pt-4 pb-3">
          <p className="text-xs font-semibold text-muted-foreground mb-2">注意事項</p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li className="flex items-start gap-1.5">
              <span className="text-primary mt-0.5">•</span>
              利用者は「氏名＋チーム」が一致する場合は更新、一致しない場合は新規登録されます
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-primary mt-0.5">•</span>
              スタッフはアプリに一度ログインしたユーザーのみ更新可能です（未ログインユーザーはスキップ）
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-primary mt-0.5">•</span>
              テンプレートのグレー記入例行は自動的に無視されます
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-primary mt-0.5">•</span>
              インポート後は利用者マスタ・スタッフ管理タブで内容を確認してください
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================
// チーム目標管理パネル
// ============================
const TEAM_OPTIONS = ["身体", "天理", "郡山北部", "郡山南部", "全チーム"] as const;
type TeamOption = typeof TEAM_OPTIONS[number];

const TEAM_COLORS: Record<TeamOption, string> = {
  "身体": "bg-blue-100 text-blue-800 border-blue-200",
  "天理": "bg-purple-100 text-purple-800 border-purple-200",
  "郡山北部": "bg-green-100 text-green-800 border-green-200",
  "郡山南部": "bg-orange-100 text-orange-800 border-orange-200",
  "全チーム": "bg-gray-100 text-gray-800 border-gray-200",
};

function TeamGoalsPanel() {
  const utils = trpc.useUtils();
  const { data: goals = [], isLoading } = trpc.teamGoals.getAll.useQuery();
  const createMutation = trpc.teamGoals.create.useMutation({
    onSuccess: () => { utils.teamGoals.getAll.invalidate(); toast.success("チーム目標を登録しました"); setShowForm(false); resetForm(); },
    onError: () => toast.error("登録に失敗しました"),
  });
  const updateMutation = trpc.teamGoals.update.useMutation({
    onSuccess: () => { utils.teamGoals.getAll.invalidate(); toast.success("チーム目標を更新しました"); setEditingId(null); resetForm(); },
    onError: () => toast.error("更新に失敗しました"),
  });
  const deleteMutation = trpc.teamGoals.delete.useMutation({
    onSuccess: () => { utils.teamGoals.getAll.invalidate(); toast.success("チーム目標を削除しました"); },
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

  // DateオブジェクトまたはISO文字列をYYYY-MM-DD形式に変換するヘルパー
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
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardHeader className="pb-2 pt-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold">チーム目標管理</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">各チームの目標を登録・編集できます。期間を指定すると自動的に表示・非表示が切り替わります。</p>
            </div>
            <Button size="sm" onClick={() => { setShowForm(!showForm); setEditingId(null); resetForm(); }} className="flex items-center gap-1">
              <Plus className="w-4 h-4" />
              新規登録
            </Button>
          </div>
        </CardHeader>
      </Card>

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
                  <select value={formTeam} onChange={e => setFormTeam(e.target.value as TeamOption)} className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background">
                    {TEAM_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">目標タイトル <span className="text-red-500">*</span></label>
                  <input type="text" value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="例：今月の訪問件数目標を達成しよう" className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background" required />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">詳細・メッセージ（任意）</label>
                <textarea value={formBody} onChange={e => setFormBody(e.target.value)} placeholder="目標の詳細や応援メッセージを入力..." rows={3} className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background resize-none" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">表示開始日（空欄=常時表示）</label>
                  <input type="date" value={formStartDate} onChange={e => setFormStartDate(e.target.value)} className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">表示終了日（空欄=常時表示）</label>
                  <input type="date" value={formEndDate} onChange={e => setFormEndDate(e.target.value)} className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background" />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" size="sm" onClick={() => { setShowForm(false); resetForm(); }}>キャンセル</Button>
                <Button type="submit" size="sm" disabled={createMutation.isPending}>{createMutation.isPending ? "登録中..." : "登録する"}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-sm">
        <CardContent className="pt-4">
          {isLoading ? (
            <div className="space-y-3 py-2">
              {[1,2,3].map(i => (
                <div key={i} className="h-20 bg-muted/60 animate-pulse rounded-lg" />
              ))}
            </div>
          ) : goals.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">チーム目標が登録されていません</p>
          ) : (
            <div className="space-y-3">
              {goals.map(g => (
                <div key={g.id} className={cn("border rounded-lg p-4 transition-all", editingId === g.id ? "border-primary/50 bg-primary/5" : "border-border")}>
                  {editingId === g.id ? (
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium mb-1 block">対象チーム</label>
                          <select value={formTeam} onChange={e => setFormTeam(e.target.value as TeamOption)} className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background">
                            {TEAM_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-sm font-medium mb-1 block">目標タイトル</label>
                          <input type="text" value={formTitle} onChange={e => setFormTitle(e.target.value)} className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background" required />
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">詳細・メッセージ</label>
                        <textarea value={formBody} onChange={e => setFormBody(e.target.value)} rows={3} className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background resize-none" />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium mb-1 block">表示開始日</label>
                          <input type="date" value={formStartDate} onChange={e => setFormStartDate(e.target.value)} className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background" />
                        </div>
                        <div>
                          <label className="text-sm font-medium mb-1 block">表示終了日</label>
                          <input type="date" value={formEndDate} onChange={e => setFormEndDate(e.target.value)} className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background" />
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button type="button" variant="outline" size="sm" onClick={() => { setEditingId(null); resetForm(); }}>キャンセル</Button>
                        <Button type="submit" size="sm" disabled={updateMutation.isPending}>{updateMutation.isPending ? "更新中..." : "更新する"}</Button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full border", TEAM_COLORS[g.team as TeamOption] ?? "bg-gray-100 text-gray-800")}>{g.team}</span>
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
                        {g.body && <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{g.body}</p>}
                        <p className="text-xs text-muted-foreground mt-2">登録者: {g.createdByName}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => startEdit(g)} className="p-1.5 rounded hover:bg-muted transition-colors" title="編集">
                          <Pencil className="w-4 h-4 text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => { if (confirm("このチーム目標を削除しますか？")) deleteMutation.mutate({ id: g.id }); }}
                          className="p-1.5 rounded hover:bg-red-50 transition-colors" title="削除"
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

// ============================
// システム設定パネル
// ============================

function SystemSettingsPanel() {
  const { data: cleanupDaysData, isLoading } = trpc.settings.getSheetCleanupDays.useQuery();
  const utils = trpc.useUtils();
  const setCleanupDaysMutation = trpc.settings.setSheetCleanupDays.useMutation({
    onSuccess: () => {
      utils.settings.getSheetCleanupDays.invalidate();
      toast.success("保持期間を更新しました");
    },
    onError: (e) => toast.error(e.message),
  });

  const [selectedDays, setSelectedDays] = useState<number>(7);

  // データ取得後にセレクトの初期値を設定
  useEffect(() => {
    if (cleanupDaysData?.days) {
      setSelectedDays(cleanupDaysData.days);
    }
  }, [cleanupDaysData?.days]);

  const RETENTION_OPTIONS = [
    { value: 3, label: "3日" },
    { value: 7, label: "7日（デフォルト）" },
    { value: 14, label: "14日" },
    { value: 30, label: "30日" },
    { value: 60, label: "60日" },
    { value: 90, label: "90日" },
  ];

  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Settings className="w-4 h-4 text-primary" />
            スプレッドシート自動削除設定
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            「次回訪問日時」スプレッドシートの行を自動削除するまでの保持期間を設定します。
            毎日0:00（日本時間）に、次回訪問日時から設定した日数を過ぎた行が自動的に削除されます。
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-sm font-medium text-foreground block mb-1.5">
                保持期間
              </label>
              {isLoading ? (
                <div className="h-9 bg-muted animate-pulse rounded-md" />
              ) : (
                <select
                  value={selectedDays}
                  onChange={(e) => setSelectedDays(Number(e.target.value))}
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {RETENTION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="pt-6">
              <Button
                size="sm"
                onClick={() => setCleanupDaysMutation.mutate({ days: selectedDays })}
                disabled={setCleanupDaysMutation.isPending || isLoading}
              >
                {setCleanupDaysMutation.isPending ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>

          <div className="rounded-lg bg-muted/50 border border-border p-3 text-sm text-muted-foreground space-y-1">
            <p className="font-medium text-foreground text-xs">動作の仕組み</p>
            <p>・毎日0:00（日本時間）に自動実行されます</p>
            <p>・「次回訪問日時」列の日時から設定した日数が経過した行を削除します</p>
            <p>・例：保持期間7日の場合、3月1日13:00の行は3月8日0:00に削除されます</p>
            <p>・次回訪問日時が空欄の行は削除されません</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================
// クイックアクセスリンク管理パネル
// ============================

const QUICK_ACCESS_CATEGORIES = ["スプレッドシート", "ドキュメント", "フォーム", "その他"] as const;
type QuickAccessCategory = typeof QUICK_ACCESS_CATEGORIES[number];

const COLOR_OPTIONS = [
  { value: "text-blue-600", label: "青" },
  { value: "text-emerald-600", label: "緑" },
  { value: "text-purple-600", label: "紫" },
  { value: "text-orange-500", label: "オレンジ" },
  { value: "text-rose-500", label: "赤" },
  { value: "text-amber-500", label: "黄" },
  { value: "text-cyan-600", label: "シアン" },
  { value: "text-slate-600", label: "グレー" },
];

function QuickAccessLinksPanel() {
  const utils = trpc.useUtils();
  const { data: links, isLoading } = trpc.quickAccessLinks.list.useQuery();
  const createMutation = trpc.quickAccessLinks.create.useMutation({
    onSuccess: () => { utils.quickAccessLinks.list.invalidate(); toast.success("リンクを追加しました"); setShowAddForm(false); resetForm(); },
    onError: (e) => toast.error(`追加失敗: ${e.message}`),
  });
  const updateMutation = trpc.quickAccessLinks.update.useMutation({
    onSuccess: () => { utils.quickAccessLinks.list.invalidate(); toast.success("リンクを更新しました"); setEditingId(null); },
    onError: (e) => toast.error(`更新失敗: ${e.message}`),
  });
  const deleteMutation = trpc.quickAccessLinks.delete.useMutation({
    onSuccess: () => { utils.quickAccessLinks.list.invalidate(); toast.success("リンクを削除しました"); },
    onError: (e) => toast.error(`削除失敗: ${e.message}`),
  });

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // 追加フォーム
  const [newCategory, setNewCategory] = useState<QuickAccessCategory>("スプレッドシート");
  const [newLabel, setNewLabel] = useState("");
  const [newHref, setNewHref] = useState("");
  const [newEmoji, setNewEmoji] = useState("");
  const [newColor, setNewColor] = useState("text-blue-600");
  const [newSortOrder, setNewSortOrder] = useState(0);

  // 編集フォーム
  const [editCategory, setEditCategory] = useState<QuickAccessCategory>("スプレッドシート");
  const [editLabel, setEditLabel] = useState("");
  const [editHref, setEditHref] = useState("");
  const [editEmoji, setEditEmoji] = useState("");
  const [editColor, setEditColor] = useState("text-blue-600");
  const [editSortOrder, setEditSortOrder] = useState(0);

  function resetForm() {
    setNewCategory("スプレッドシート");
    setNewLabel("");
    setNewHref("");
    setNewEmoji("");
    setNewColor("text-blue-600");
    setNewSortOrder(0);
  }

  function startEdit(link: { id: number; category: string; label: string; href: string; emoji: string; color: string; sortOrder: number }) {
    setEditingId(link.id);
    setEditCategory(link.category as QuickAccessCategory);
    setEditLabel(link.label);
    setEditHref(link.href);
    setEditEmoji(link.emoji ?? "");
    setEditColor(link.color);
    setEditSortOrder(link.sortOrder);
  }

  const grouped = QUICK_ACCESS_CATEGORIES.map((cat) => ({
    category: cat,
    items: (links ?? []).filter((l) => l.category === cat),
  }));

  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardHeader className="pb-2 pt-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Link className="w-4 h-4 text-primary" />
              クイックアクセスリンク管理
            </CardTitle>
            <Button size="sm" onClick={() => { setShowAddForm(!showAddForm); setEditingId(null); }}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              追加
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            ホーム画面のクイックアクセスに表示するリンクを管理します。追加・編集・削除が即座に反映されます。
          </p>
        </CardHeader>

        {/* 追加フォーム */}
        {showAddForm && (
          <CardContent className="border-t border-border pt-4">
            <p className="text-sm font-semibold mb-3">新しいリンクを追加</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">カテゴリ</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as QuickAccessCategory)}
                    className="w-full h-8 px-2 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {QUICK_ACCESS_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">色</label>
                  <select
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    className="w-full h-8 px-2 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {COLOR_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">絵文字アイコン（任意）</label>
                <input
                  type="text"
                  value={newEmoji}
                  onChange={(e) => setNewEmoji(e.target.value)}
                  placeholder="例：📄 📊 📝"
                  className="w-full h-8 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">表示名</label>
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="例：業務日報"
                  className="w-full h-8 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">URL</label>
                <input
                  type="url"
                  value={newHref}
                  onChange={(e) => setNewHref(e.target.value)}
                  placeholder="https://docs.google.com/..."
                  className="w-full h-8 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">表示順（数字が小さいほど上に表示）</label>
                <input
                  type="number"
                  value={newSortOrder}
                  onChange={(e) => setNewSortOrder(Number(e.target.value))}
                  className="w-24 h-8 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={() => createMutation.mutate({ category: newCategory, label: newLabel, href: newHref, emoji: newEmoji, color: newColor, sortOrder: newSortOrder })}
                  disabled={createMutation.isPending || !newLabel.trim() || !newHref.trim()}
                >
                  {createMutation.isPending ? "追加中..." : "追加する"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setShowAddForm(false); resetForm(); }}>
                  キャンセル
                </Button>
              </div>
            </div>
          </CardContent>
        )}

        {/* リスト */}
        <CardContent className={showAddForm ? "border-t border-border pt-4" : "pt-0"}>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted animate-pulse rounded-md" />)}
            </div>
          ) : (
            <div className="space-y-5">
              {grouped.map(({ category, items }) => (
                <div key={category}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{category}</p>
                  {items.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic pl-2">登録なし</p>
                  ) : (
                    <div className="space-y-2">
                      {items.map((link) => (
                        <div key={link.id} className="rounded-lg border border-border bg-card p-3">
                          {editingId === link.id ? (
                            // 編集フォーム
                            <div className="space-y-2">
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-xs text-muted-foreground block mb-1">カテゴリ</label>
                                  <select
                                    value={editCategory}
                                    onChange={(e) => setEditCategory(e.target.value as QuickAccessCategory)}
                                    className="w-full h-7 px-2 rounded border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                                  >
                                    {QUICK_ACCESS_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className="text-xs text-muted-foreground block mb-1">色</label>
                                  <select
                                    value={editColor}
                                    onChange={(e) => setEditColor(e.target.value)}
                                    className="w-full h-7 px-2 rounded border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                                  >
                                    {COLOR_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                                  </select>
                                </div>
                              </div>
                              <input
                                type="text"
                                value={editEmoji}
                                onChange={(e) => setEditEmoji(e.target.value)}
                                placeholder="絵文字（任意）"
                                className="w-full h-7 px-2 rounded border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                              />
                              <input
                                type="text"
                                value={editLabel}
                                onChange={(e) => setEditLabel(e.target.value)}
                                placeholder="表示名"
                                className="w-full h-7 px-2 rounded border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                              />
                              <input
                                type="url"
                                value={editHref}
                                onChange={(e) => setEditHref(e.target.value)}
                                placeholder="URL"
                                className="w-full h-7 px-2 rounded border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                              />
                              <div className="flex items-center gap-2">
                                <label className="text-xs text-muted-foreground">表示順</label>
                                <input
                                  type="number"
                                  value={editSortOrder}
                                  onChange={(e) => setEditSortOrder(Number(e.target.value))}
                                  className="w-16 h-7 px-2 rounded border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                                />
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => updateMutation.mutate({ id: link.id, category: editCategory, label: editLabel, href: editHref, emoji: editEmoji, color: editColor, sortOrder: editSortOrder })}
                                  disabled={updateMutation.isPending || !editLabel.trim() || !editHref.trim()}
                                >
                                  {updateMutation.isPending ? "保存中..." : "保存"}
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingId(null)}>
                                  キャンセル
                                </Button>
                              </div>
                            </div>
                          ) : (
                            // 表示行
                            <div className="flex items-center gap-3">
                              {link.emoji && <span className="text-lg flex-shrink-0">{link.emoji}</span>}
                              <div className="flex-1 min-w-0">
                                <p className={cn("text-sm font-medium truncate", link.color)}>{link.label}</p>
                                <p className="text-xs text-muted-foreground truncate">{link.href}</p>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <span className="text-xs text-muted-foreground mr-1">順{link.sortOrder}</span>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(link)}>
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => { if (confirm(`「${link.label}」を削除しますか？`)) deleteMutation.mutate({ id: link.id }); }}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
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

// ============================
// ツール操作ログパネル
// ============================
function ToolAuditLogsPanel() {
  const [toolTypeFilter, setToolTypeFilter] = useState<"all" | "team" | "common">("all");
  const { data: logs, isLoading, refetch } = trpc.toolAuditLogs.list.useQuery(
    { limit: 200, toolType: toolTypeFilter },
    { refetchOnWindowFocus: false }
  );

  const actionLabel = (action: string) => {
    if (action === "create") return { label: "追加", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" };
    if (action === "update") return { label: "更新", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" };
    if (action === "delete") return { label: "削除", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" };
    return { label: action, color: "bg-gray-100 text-gray-800" };
  };

  const toolTypeLabel = (type: string) => {
    if (type === "team") return "チームツール";
    if (type === "common") return "全チーム共通";
    return type;
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">ツール操作ログ</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => refetch()} className="text-xs">
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            更新
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">ツールの追加・更新・削除の操作履歴（最新200件）</p>
      </CardHeader>
      <CardContent>
        {/* フィルター */}
        <div className="flex gap-2 mb-4">
          {(["all", "team", "common"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setToolTypeFilter(t)}
              className={cn(
                "px-3 py-1 text-xs rounded-full border transition-colors",
                toolTypeFilter === t
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {t === "all" ? "すべて" : t === "team" ? "チームツール" : "全チーム共通"}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">読み込み中...</div>
        ) : !logs || logs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">操作ログがありません</div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => {
              const { label, color } = actionLabel(log.action);
              return (
                <div
                  key={log.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card hover:bg-accent/30 transition-colors"
                >
                  <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5", color)}>
                    {label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground truncate">{log.toolLabel}</span>
                      <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {toolTypeLabel(log.toolType)}
                      </span>
                      {log.team && (
                        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {log.team}
                        </span>
                      )}
                      {log.category && (
                        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {log.category}
                        </span>
                      )}
                    </div>
                    {log.action === "update" && log.previousLabel && log.previousLabel !== log.toolLabel && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        変更前: {log.previousLabel}
                      </p>
                    )}
                    {log.toolHref && (
                      <a
                        href={log.toolHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-500 hover:underline truncate block mt-0.5 max-w-xs"
                      >
                        {log.toolHref}
                      </a>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">
                        {log.operatedByName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString("ja-JP", {
                          year: "numeric", month: "2-digit", day: "2-digit",
                          hour: "2-digit", minute: "2-digit"
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================
// アルコールチェック月別スプレッドシート管理パネル
// ============================

function AlcoholCheckSpreadsheetsPanel() {
  const utils = trpc.useUtils();
  const { data: spreadsheets, isLoading } = trpc.attendance.getSpreadsheets.useQuery();

  // 新規登録フォーム
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [newYear, setNewYear] = useState(currentYear);
  const [newMonth, setNewMonth] = useState(currentMonth);
  const [newSpreadsheetId, setNewSpreadsheetId] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  const upsertMutation = trpc.attendance.upsertSpreadsheet.useMutation({
    onSuccess: () => {
      utils.attendance.getSpreadsheets.invalidate();
      toast.success("スプレッドシートを登録しました");
      setNewSpreadsheetId("");
      setNewLabel("");
      setShowAddForm(false);
    },
    onError: (e) => toast.error(`登録に失敗しました: ${e.message}`),
  });

  const deleteMutation = trpc.attendance.deleteSpreadsheet.useMutation({
    onSuccess: () => {
      utils.attendance.getSpreadsheets.invalidate();
      toast.success("削除しました");
    },
    onError: (e) => toast.error(`削除に失敗しました: ${e.message}`),
  });

  /** スプレッドシートURLまたはIDからIDを抽出する */
  const extractSheetId = (input: string): string => {
    const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : input.trim();
  };

  const handleAdd = () => {
    const sheetId = extractSheetId(newSpreadsheetId);
    if (!sheetId) { toast.error("スプレッドシートIDまたはURLを入力してください"); return; }
    upsertMutation.mutate({
      year: newYear,
      month: newMonth,
      spreadsheetId: sheetId,
      label: newLabel.trim() || undefined,
    });
  };

  const yearOptions = [currentYear - 1, currentYear, currentYear + 1];
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground">アルコールチェック月別スプレッドシート</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            月ごとにスプレッドシートを登録します。打刻時に日付に応じたシートへ自動転記されます。
          </p>
        </div>
        <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => setShowAddForm((v) => !v)}>
          <Plus className="w-3.5 h-3.5" />
          新規登録
        </Button>
      </div>

      {/* 新規登録フォーム */}
      {showAddForm && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-4 pb-4 space-y-3">
            <p className="text-sm font-semibold text-foreground">新規スプレッドシート登録</p>

            {/* 年月選択 */}
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs font-medium text-muted-foreground mb-1">年</label>
                <div className="relative">
                  <select
                    value={newYear}
                    onChange={(e) => setNewYear(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary appearance-none pr-7"
                  >
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>{y}年</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                </div>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-muted-foreground mb-1">月</label>
                <div className="relative">
                  <select
                    value={newMonth}
                    onChange={(e) => setNewMonth(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary appearance-none pr-7"
                  >
                    {monthOptions.map((m) => (
                      <option key={m} value={m}>{m}月</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                </div>
              </div>
            </div>

            {/* スプレッドシートURL/ID */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                スプレッドシートURL または ID
              </label>
              <input
                type="text"
                value={newSpreadsheetId}
                onChange={(e) => setNewSpreadsheetId(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/... または シートID"
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="text-xs text-muted-foreground mt-1">
                URLを貼り付けると自動的にIDを抽出します
              </p>
            </div>

            {/* メモ（任意） */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                メモ（任意）
              </label>
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="例: アルコールチェック記録 2026年5月"
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={handleAdd}
                disabled={upsertMutation.isPending || !newSpreadsheetId.trim()}
              >
                {upsertMutation.isPending ? "登録中..." : "登録する"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => { setShowAddForm(false); setNewSpreadsheetId(""); setNewLabel(""); }}
              >
                キャンセル
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 登録済みスプレッドシート一覧 */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">読み込み中...</div>
      ) : !spreadsheets || spreadsheets.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <FileSpreadsheet className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">まだスプレッドシートが登録されていません</p>
            <p className="text-xs text-muted-foreground mt-1">「新規登録」から月別のスプレッドシートを登録してください</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {[...spreadsheets]
            .sort((a, b) => {
              if (a.year !== b.year) return b.year - a.year;
              return b.month - a.month;
            })
            .map((sheet) => {
              const isCurrentMonth = sheet.year === currentYear && sheet.month === currentMonth;
              const isNextMonth = (sheet.year === currentYear && sheet.month === currentMonth + 1) ||
                (sheet.year === currentYear + 1 && sheet.month === 1 && currentMonth === 12);
              return (
                <Card key={`${sheet.year}-${sheet.month}`} className={cn(
                  "transition-colors",
                  isCurrentMonth && "border-primary/40 bg-primary/5",
                  isNextMonth && "border-emerald-400/40 bg-emerald-50/50 dark:bg-emerald-950/20"
                )}>
                  <CardContent className="py-3 px-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileSpreadsheet className={cn(
                        "w-5 h-5 flex-shrink-0",
                        isCurrentMonth ? "text-primary" : isNextMonth ? "text-emerald-500" : "text-muted-foreground"
                      )} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-foreground">
                            {sheet.year}年{sheet.month}月
                          </span>
                          {isCurrentMonth && (
                            <Badge className="text-xs bg-primary/10 text-primary border-0 px-1.5 py-0">今月</Badge>
                          )}
                          {isNextMonth && (
                            <Badge className="text-xs bg-emerald-100 text-emerald-700 border-0 px-1.5 py-0">来月</Badge>
                          )}
                        </div>
                        {sheet.label && (
                          <p className="text-xs text-muted-foreground truncate">{sheet.label}</p>
                        )}
                        <p className="text-xs text-muted-foreground/60 font-mono truncate">
                          ID: {sheet.spreadsheetId}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <a
                        href={`https://docs.google.com/spreadsheets/d/${sheet.spreadsheetId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        title="スプレッドシートを開く"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`${sheet.year}年${sheet.month}月のスプレッドシート登録を削除しますか？`)) {
                            deleteMutation.mutate({ id: sheet.id });
                          }
                        }}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="削除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
        </div>
      )}

      {/* 注意書き */}
      <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
        <CardContent className="py-3 px-4">
          <div className="flex gap-2 text-xs text-amber-700 dark:text-amber-400">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">月末前に翌月のスプレッドシートを登録してください</p>
              <p className="text-amber-600/80 dark:text-amber-400/70">
                登録されていない月のアルコールチェックは記録（DB）には保存されますが、スプレッドシートへの自動転記はされません。
                月が変わる前に翌月分のスプレッドシートを作成して登録しておくことをお勧めします。
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
