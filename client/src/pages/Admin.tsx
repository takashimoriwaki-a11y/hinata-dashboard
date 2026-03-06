/**
 * Admin - 管理画面
 * スプレッドシートURLの月次管理 + 利用者マスタ管理
 */

import { useState, useMemo, useRef, useCallback } from "react";
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
  FileSpreadsheet, Upload, Download,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ============================
// スプレッドシートURL管理
// ============================

const LINK_DEFINITIONS = [
  { key: "fee_seishin_koriyama", label: "利用者料金一覧（精神郡山）", color: "text-emerald-600" },
  { key: "fee_shintai",          label: "利用者料金一覧（身体）",     color: "text-blue-600"    },
  { key: "fee_tenri",            label: "利用者料金一覧（天理）",     color: "text-purple-600"  },
  { key: "daily_report",         label: "業務日報",                   color: "text-orange-600"  },
  { key: "attendance",           label: "ひなた勤怠",                 color: "text-rose-600"    },
  { key: "checkout_checklist",   label: "退勤時チェックリスト",       color: "text-amber-600"   },
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
      links: validLinks.map((l) => ({ linkKey: l.key, label: l.label, url: l.url, color: l.color })),
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
              <Badge className="text-[10px] bg-primary/10 text-primary border-0 px-1.5 py-0">月末の更新に便利</Badge>
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
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">スプレッドシートのURLを順番に貼り付けてください（上から順に自動割り当て）</p>
            <div className="bg-card/80 rounded-md p-2.5 text-[11px] text-muted-foreground space-y-0.5 border border-border">
              {LINK_DEFINITIONS.map((def, i) => (
                <p key={def.key}><span className="font-semibold text-foreground">{i + 1}.</span> {def.label}</p>
              ))}
            </div>
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
                        <p className="text-muted-foreground/50 italic">（未入力）</p>
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

  // 全利用者取得
  const { data: allPatients, isLoading } = trpc.patients.list.useQuery({});

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
      utils.patients.list.invalidate();
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

  // フィルター済みリスト
  const filteredPatients = useMemo(() => {
    if (!allPatients) return [];
    return allPatients.filter((p) => {
      const teamOk = filterTeam === "全て" || p.team === filterTeam;
      const nameOk = !searchQuery || p.name.includes(searchQuery) || (p.nameKana ?? "").includes(searchQuery);
      return teamOk && nameOk;
    });
  }, [allPatients, filterTeam, searchQuery]);

  // チーム別件数
  const teamCounts = useMemo(() => {
    if (!allPatients) return {} as Record<string, number>;
    const counts: Record<string, number> = { 全て: allPatients.length };
    for (const t of TEAMS) counts[t] = allPatients.filter((p) => p.team === t).length;
    return counts;
  }, [allPatients]);

  // Mutations
  const createPatient = trpc.patients.create.useMutation({
    onSuccess: () => {
      utils.patients.list.invalidate();
      toast.success("利用者を追加しました");
      setAddName(""); setAddKana(""); setShowAddForm(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const batchCreate = trpc.patients.batchCreate.useMutation({
    onSuccess: (data) => {
      utils.patients.list.invalidate();
      toast.success(`${data.count}名の利用者を一括登録しました`);
      setBulkText(""); setShowBulkPanel(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const updatePatient = trpc.patients.update.useMutation({
    onSuccess: () => {
      utils.patients.list.invalidate();
      toast.success("利用者情報を更新しました");
      setEditingId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deactivatePatient = trpc.patients.deactivate.useMutation({
    onSuccess: () => {
      utils.patients.list.invalidate();
      toast.success("利用者を削除しました");
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
            <Badge variant="outline" className="text-xs">{allPatients?.length ?? 0}名</Badge>
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
          {(["全て", ...TEAMS] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilterTeam(t)}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                filterTeam === t
                  ? "bg-primary text-white border-primary"
                  : "bg-background text-foreground border-border hover:border-primary hover:text-primary"
              )}
            >
              {t}
              <span className="ml-1 opacity-70">({teamCounts[t] ?? 0})</span>
            </button>
          ))}
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
          <p className="text-sm text-muted-foreground text-center py-4">読み込み中...</p>
        ) : filteredPatients.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <Users className="w-8 h-8 text-muted-foreground/40 mx-auto" />
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
                          "text-[10px] px-1.5 py-0",
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
                            if (confirm(`「${p.name}」を削除しますか？`)) {
                              deactivatePatient.mutate({ id: p.id });
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity p-1"
                          title="削除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
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
  const [activeSection, setActiveSection] = useState<"sheets" | "patients" | "staff" | "import">("sheets");
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
      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setActiveSection("sheets")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
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
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
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
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
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
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
              activeSection === "import"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            一括インポート
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
                    {opt.isCurrent && <span className="ml-1 text-[10px] opacity-70">（今月）</span>}
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
                    <Badge variant="secondary" className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400">琉月以降</Badge>
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
                <p className="text-sm text-muted-foreground py-4 text-center">読み込み中...</p>
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
                          {isCurrent && <Badge variant="secondary" className="text-[10px] bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 px-1.5 py-0">今月</Badge>}
                          {ym > currentYearMonth && <Badge variant="secondary" className="text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 px-1.5 py-0">琉月以降</Badge>}
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
    </div>
  );
}

// ============================
// スタッフ管理パネル
// ============================

const TEAMS_STAFF = ["身体", "天理", "郡山北部", "郡山南部"] as const;
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

  // パスワードリセット
  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const createStaff = trpc.staff.create.useMutation({
    onSuccess: () => {
      utils.staff.getAll.invalidate();
      toast.success("スタッフアカウントを作成しました");
      setNewName(""); setNewEmail(""); setNewPassword(""); setNewRole("user"); setNewTeam("身体"); setShowAddForm(false);
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

  const handleCreate = () => {
    if (!newName.trim()) { toast.error("名前を入力してください"); return; }
    if (!newEmail.trim()) { toast.error("メールアドレスを入力してください"); return; }
    if (newPassword.length < 6) { toast.error("パスワードは6文字以上で入力してください"); return; }
    createStaff.mutate({ name: newName.trim(), email: newEmail.trim(), password: newPassword, role: newRole, team: newTeam });
  };

  return (
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
          <p className="text-sm text-muted-foreground py-4 text-center">読み込み中...</p>
        ) : !staffList || staffList.length === 0 ? (
          <div className="py-8 text-center">
            <Users className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">スタッフがいません</p>
          </div>
        ) : (
          <div className="space-y-2">
            {staffList.map((staff, idx) => (
              <div key={staff.id}>
                {idx > 0 && <Separator className="my-2" />}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{staff.name ?? "名前未設定"}</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] px-1.5 py-0",
                          staff.role === "admin" ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-700" : "bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-700"
                        )}
                      >
                        {staff.role === "admin" ? "管理者" : "スタッフ"}
                      </Badge>
                      {staff.team && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-gray-50 dark:bg-gray-800 dark:text-gray-300">{staff.team}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{staff.email ?? "メール未設定"}</p>
                    <p className="text-xs text-muted-foreground">最終ログイン: {staff.lastSignedIn ? new Date(staff.lastSignedIn).toLocaleDateString("ja-JP") : "未ログイン"}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
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
    // テンプレートファイルのダウンロードリンク（別途CDNにアップロードが必要）
    toast.info("テンプレートファイルはチャットからダウンロードしてください");
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
            <div>
              <p className="text-sm font-semibold text-foreground mb-1">Excelファイルで利用者・スタッフを一括登録</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                「ひなた_一括インポート.xlsx」テンプレートに入力したデータを読み込みます。<br />
                <span className="font-medium text-foreground">利用者シート</span>：新規登録（最大200件）<br />
                <span className="font-medium text-foreground">スタッフシート</span>：既存ユーザーのチーム・権限を更新（未ログインユーザーはスキップ）
              </p>
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
              利用者は新規登録のみ（同名の利用者が既に存在する場合も追加登録されます）
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
