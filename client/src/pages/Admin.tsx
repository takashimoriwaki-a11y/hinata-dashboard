/**
 * Admin - 管理画面
 * スプレッドシートURLの月次管理 + 利用者マスタ管理
 */

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Plus, Trash2, ExternalLink, Settings, ClipboardPaste,
  CheckCircle2, AlertCircle, ChevronDown, ChevronUp,
  Users, Pencil, X, ChevronRight, UserPlus, Key, Shield, ShieldCheck,
  FileSpreadsheet, Upload, Download, LogOut, RotateCcw, Mail, Link, Copy, Share2, ThumbsUp, Filter,
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
  const [importResult, setImportResult] = useState<{ count: number; created: number; updated: number; skipped: number; errors: string[] } | null>(null);
  const handlePatientExcelImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingPatients(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/import/patients", { method: "POST", body: formData, credentials: "include" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "インポートに失敗しました");
        if (data.errors?.length) {
          setImportResult({ count: 0, created: 0, updated: 0, skipped: data.skipped ?? 0, errors: data.errors });
        }
        return;
      }
      utils.patients.listAll.invalidate();
      setImportResult({ count: data.count ?? 0, created: data.created ?? 0, updated: data.updated ?? 0, skipped: data.skipped ?? 0, errors: data.errors ?? [] });
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
  const [addCode, setAddCode] = useState("");

  // 一括登録パネル
  const [showBulkPanel, setShowBulkPanel] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkTeam, setBulkTeam] = useState<Team>("身体");

  // 編集中
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editKana, setEditKana] = useState("");
  const [editTeam, setEditTeam] = useState<Team>("身体");
  const [editCode, setEditCode] = useState("");

  // 並び替え（複数選択可）
  type SortKey = "id" | "kana" | "team";
  const [sortKeys, setSortKeys] = useState<SortKey[]>(["id"]);
  const toggleSort = (key: SortKey) => {
    setSortKeys((prev) => {
      if (prev.includes(key)) {
        const next = prev.filter((k) => k !== key);
        return next.length === 0 ? ["id"] : next;
      }
      return [...prev, key];
    });
  };

  // 一括登録のパース（1行1名前）
  const bulkParsed = useMemo(() => {
    return bulkText
      .split(/[\n,、，]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length <= 100);
  }, [bulkText]);

  // フィルター済みリスト（有効のみ） + 並び替え
  const TEAM_ORDER: Record<string, number> = { "身体": 0, "天理": 1, "郡山北部": 2, "郡山南部": 3 };
  const filteredPatients = useMemo(() => {
    if (!allPatients) return [];
    const filtered = allPatients.filter((p) => {
      if (p.active !== 1) return false;
      const teamOk = filterTeam === "全て" || p.team === filterTeam;
      const nameOk = !searchQuery || p.name.includes(searchQuery) || (p.nameKana ?? "").includes(searchQuery);
      return teamOk && nameOk;
    });
    return [...filtered].sort((a, b) => {
      for (const key of sortKeys) {
        let cmp = 0;
        if (key === "id") {
          const aCode = a.patientCode ?? "";
          const bCode = b.patientCode ?? "";
          if (aCode === "" && bCode !== "") cmp = 1;
          else if (aCode !== "" && bCode === "") cmp = -1;
          else cmp = aCode.localeCompare(bCode, "ja", { numeric: true });
        } else if (key === "kana") {
          cmp = (a.nameKana ?? a.name).localeCompare(b.nameKana ?? b.name, "ja");
        } else if (key === "team") {
          cmp = (TEAM_ORDER[a.team] ?? 99) - (TEAM_ORDER[b.team] ?? 99);
        }
        if (cmp !== 0) return cmp;
      }
      return 0;
    });
  }, [allPatients, filterTeam, searchQuery, sortKeys]);

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
    createPatient.mutate({ name: addName.trim(), nameKana: addKana.trim() || undefined, team: addTeam, patientCode: addCode.trim() || undefined });
  };

  const handleBatchCreate = () => {
    if (bulkParsed.length === 0) { toast.error("名前を入力してください"); return; }
    batchCreate.mutate({ patients: bulkParsed.map((name) => ({ name, team: bulkTeam })) });
  };

  const handleEditStart = (p: { id: number; name: string; nameKana?: string | null; team: string; patientCode?: string | null }) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditKana(p.nameKana ?? "");
    setEditTeam(p.team as Team);
    setEditCode(p.patientCode ?? "");
  };

  const handleEditSave = () => {
    if (!editName.trim() || editingId === null) return;
    updatePatient.mutate({ id: editingId, name: editName.trim(), nameKana: editKana.trim() || undefined, team: editTeam, patientCode: editCode.trim() || null });
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
            {/* 利用者データエクスポートボタン */}
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1 text-orange-600 border-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950/20"
              onClick={async () => {
                try {
                  const res = await fetch("/api/export/patients", { credentials: "include" });
                  if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    toast.error((err as { error?: string }).error || "エクスポートに失敗しました");
                    return;
                  }
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  const cd = res.headers.get("content-disposition") ?? "";
                  const match = cd.match(/filename[^;=\n]*=(['"])?(.*?)\1/);
                  a.download = match?.[2] ?? "利用者一覧.xlsx";
                  a.click();
                  URL.revokeObjectURL(url);
                } catch {
                  toast.error("ダウンロードに失敗しました");
                }
              }}
            >
              <Download className="w-3.5 h-3.5" />
              データDL
            </Button>
            {/* テンプレートダウンロードボタン */}
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1 text-blue-600 border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/20"
              onClick={() => {
                const a = document.createElement("a");
                a.href = "/api/template/patients";
                a.click();
              }}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
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
              className="h-8 text-xs gap-1 text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
              onClick={() => patientExcelRef.current?.click()}
              disabled={importingPatients}
            >
              <Upload className="w-3.5 h-3.5" />
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
          「データDL」で現在登録済みの利用者一覧をExcelでダウンロードできます。ダウンロードしたファイルに行を追加して「Excelインポート」で新規利用者を一括登録できます。
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* インポート結果サマリー */}
        {importResult && (
          <div className={cn(
            "rounded-xl border p-4 space-y-2",
            importResult.errors.length > 0
              ? "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800"
              : "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800"
          )}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {importResult.errors.length > 0
                  ? <AlertCircle className="w-4 h-4 text-amber-600" />
                  : <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                <p className="text-sm font-semibold">
                  {importResult.errors.length > 0 ? "インポート完了（一部エラーあり）" : "インポート完了"}
                </p>
              </div>
              <button onClick={() => setImportResult(null)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              {importResult.created > 0 && (
                <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                  新規登録：{importResult.created}名
                </span>
              )}
              {importResult.updated > 0 && (
                <span className="text-blue-700 dark:text-blue-400 font-medium">
                  上書き更新：{importResult.updated}名
                </span>
              )}
              {importResult.skipped > 0 && (
                <span className="text-muted-foreground">
                  スキップ：{importResult.skipped}行（空行・記入例）
                </span>
              )}
              {importResult.errors.length > 0 && (
                <span className="text-amber-700 dark:text-amber-400 font-medium">
                  エラー：{importResult.errors.length}件
                </span>
              )}
            </div>
            {importResult.errors.length > 0 && (
              <div className="space-y-1 mt-1">
                {importResult.errors.map((err, i) => (
                  <p key={i} className="text-xs text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 rounded px-2 py-1">
                    {err}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
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
                <label className="text-xs font-medium text-foreground">利用者ID（任意）</label>
                <input
                  type="text"
                  value={addCode}
                  onChange={(e) => setAddCode(e.target.value)}
                  placeholder="P001"
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
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { setAddName(""); setAddKana(""); setAddCode(""); setShowAddForm(false); }}>キャンセル</Button>
              <Button size="sm" className="h-8 text-xs" onClick={handleAdd} disabled={!addName.trim() || createPatient.isPending}>
                {createPatient.isPending ? "追加中..." : "追加"}
              </Button>
            </div>
          </div>
        )}

        {/* 並び替えボタン */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground font-medium">並び替え:</span>
          {([{ key: "id" as const, label: "ID順" }, { key: "kana" as const, label: "あいうえお順" }]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => toggleSort(key)}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
                sortKeys.includes(key)
                  ? "bg-primary text-white border-primary shadow-sm"
                  : "bg-background text-foreground border-border hover:border-primary hover:text-primary"
              )}
            >
              {sortKeys.includes(key) && <span className="mr-1">{sortKeys.indexOf(key) + 1}</span>}
              {label}
            </button>
          ))}
          {sortKeys.length > 1 && (
            <span className="text-xs text-muted-foreground">→ 順に適用</span>
          )}
        </div>

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
                        <input
                          type="text"
                          value={editCode}
                          onChange={(e) => setEditCode(e.target.value)}
                          placeholder="利用者ID（任意・P001など）"
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
                        <div className="flex items-center gap-1.5">
                          {p.patientCode && (
                            <span className="text-xs font-mono text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded flex-shrink-0">{p.patientCode}</span>
                          )}
                          <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                        </div>
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
    // 前月までは表示、先月以降も表示、、2ヶ月前以前は自動非表示
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevYearMonth = toYearMonth(prevMonth.getFullYear(), prevMonth.getMonth() + 1);
    return Array.from(new Set(allLinks.map((l) => l.yearMonth)))
      .filter((ym) => ym >= prevYearMonth)
      .sort()
      .reverse();
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
  const [activeSection, setActiveSection] = useState<"sheets" | "patients" | "staff" | "import" | "settings" | "quickaccess" | "toolLogs" | "alcoholSheets" | "detectorSettings" | "timesheetSheets" | "overtimeApprovals" | "monthlySignatures" | "improvementSheet">("sheets");
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
      <div className="flex gap-2 border-b border-border overflow-x-auto overflow-y-hidden scrollbar-none" style={{ WebkitOverflowScrolling: 'touch' }}>
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
        {/* 一括インポートタブは削除（利用者マスタ・スタッフ管理から個別にインポート可能） */}
        {/* クイックアクセスはホーム画面から削除済みのため非表示 */}
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
            操作ログ
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

        {currentUser?.role === "admin" && (
          <button
            onClick={() => setActiveSection("detectorSettings")}
            className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap flex-shrink-0",
            activeSection === "detectorSettings"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            検知器設定
          </button>
        )}
        {currentUser?.role === "admin" && (
          <button
            onClick={() => setActiveSection("timesheetSheets")}
            className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap flex-shrink-0",
            activeSection === "timesheetSheets"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            出退勤管理
          </button>
        )}
        {currentUser?.role === "super_admin" && (
          <button
            onClick={() => setActiveSection("overtimeApprovals")}
            className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap flex-shrink-0",
            activeSection === "overtimeApprovals"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            残業承認
          </button>
        )}
        {currentUser?.role === "admin" && (
          <button
            onClick={() => setActiveSection("monthlySignatures")}
            className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap flex-shrink-0",
            activeSection === "monthlySignatures"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            月次署名確認
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
      {activeSection === "settings" && <SystemSettingsPanel />}

      {/* クイックアクセスリンク管理セクション（ホーム画面から削除済みのため非表示） */}
      {/* ツール操作ログセクション */}
      {activeSection === "toolLogs" && <ToolAuditLogsPanel />}
      {/* アルコールチェック月別スプレッドシート管理 */}
      {activeSection === "alcoholSheets" && <AlcoholCheckSpreadsheetsPanel />}
      {/* アルコールチェック記録CSVエクスポート */}

      {/* 検知器設定 */}
      {activeSection === "detectorSettings" && <AlcoholDetectorSettingsPanel />}
      {/* 出退勤管理 */}
      {activeSection === "timesheetSheets" && <TimesheetSpreadsheetsPanel />}
      {/* 残業承認 */}
      {activeSection === "overtimeApprovals" && <OvertimeApprovalsPanel />}
      {/* 月次署名確認 */}
      {activeSection === "monthlySignatures" && <MonthlySignaturesPanel />}
      {/* 業務改善意見箱スプレッドシート設定 */}

    </div>
  );
}

// ============================
// 業務改善意見箱スプレッドシート設定パネル
// ============================
function ImprovementSheetPanel() {
  const utils = trpc.useUtils();
  const { data: sheet, isLoading } = trpc.improvement.getSpreadsheet.useQuery();
  const setSheetMutation = trpc.improvement.setSpreadsheet.useMutation({
    onSuccess: () => {
      toast.success("スプレッドシートを設定しました");
      utils.improvement.getSpreadsheet.invalidate();
    },
    onError: (e) => toast.error(`設定エラー: ${e.message}`),
  });
  const [urlInput, setUrlInput] = useState("");
  const [labelInput, setLabelInput] = useState("業務改善意見箱");

  const handleSave = () => {
    const match = urlInput.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (!match) { toast.error("GoogleスプレッドシートのURLを入力してください"); return; }
    const spreadsheetId = match[1];
    setSheetMutation.mutate({ spreadsheetId, spreadsheetUrl: urlInput, label: labelInput });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-amber-500" />
            業務改善意見箱 スプレッドシート設定
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            提案が投稿されると、指定したGoogleスプレッドシートの「意見箱」シートに自動転記されます。
          </p>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">読み込み中...</p>
          ) : sheet ? (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-800">{sheet.label}</p>
                <a href={sheet.spreadsheetUrl} target="_blank" rel="noreferrer" className="text-xs text-green-600 hover:underline flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" /> スプレッドシートを開く
                </a>
              </div>
              <Badge variant="outline" className="text-green-700 border-green-300">設定済み</Badge>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">スプレッドシートが未設定です。</p>
          )}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">スプレッドシートURL</p>
            <Input
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              className="text-sm"
            />
            <p className="text-xs font-semibold text-muted-foreground">ラベル（任意）</p>
            <Input
              value={labelInput}
              onChange={e => setLabelInput(e.target.value)}
              placeholder="業務改善意見箱"
              className="text-sm"
            />
            <Button
              onClick={handleSave}
              disabled={setSheetMutation.isPending || !urlInput.trim()}
              className="w-full"
            >
              {setSheetMutation.isPending ? "保存中..." : "スプレッドシートを設定する"}
            </Button>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-1">
            <p className="font-semibold">転記される内容</p>
            <p>投稿日時 / 投稿者名（匿名の場合は「匿名」） / カテゴリ / 提案内容 / 管理者コメント欄</p>
            <p className="mt-1">※ サービスアカウントに対してスプレッドシートの編集権限を付与してください。</p>
          </div>
        </CardContent>
      </Card>
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

  // よみがなCSVエクスポート
  const exportKana = trpc.staff.exportKana.useMutation({
    onSuccess: (data) => {
      const blob = new Blob([data.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "staff_kana.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("よみがなCSVをダウンロードしました");
    },
    onError: (e) => toast.error(e.message),
  });

  // よみがなCSVインポート
  const kanaCSVRef = useRef<HTMLInputElement>(null);
  const [importingKana, setImportingKana] = useState(false);
  const bulkUpdateKana = trpc.staff.bulkUpdateKana.useMutation({
    onSuccess: (data) => {
      utils.staff.getAll.invalidate();
      toast.success(`${data.updated}名のよみがなを更新しました`);
    },
    onError: (e) => toast.error(e.message),
  });
  const handleKanaCSVImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingKana(true);
    try {
      const text = await file.text();
      const lines = text.split("\n").filter(l => l.trim());
      const items = lines.slice(1).map(line => {
        const [idStr, , nameKana] = line.split(",");
        return { id: parseInt(idStr, 10), nameKana: (nameKana ?? "").trim().replace(/\r/g, "") };
      }).filter(item => !isNaN(item.id) && item.nameKana);
      if (items.length === 0) { toast.error("有効なデータが見つかりませんでした"); return; }
      bulkUpdateKana.mutate({ items });
    } catch {
      toast.error("CSVの読み込みに失敗しました");
    } finally {
      setImportingKana(false);
      if (kanaCSVRef.current) kanaCSVRef.current.value = "";
    }
  }, [bulkUpdateKana]);
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
  // ナンバープレート未登録フィルター
  const [showNoPlateOnly, setShowNoPlateOnly] = useState(false);

  // スタッフ情報編集ダイアログ
  const [editStaff, setEditStaff] = useState<{ id: number; name: string; team: TeamStaff; role: "user" | "admin"; numberPlate: string } | null>(null);
  const [editName, setEditName] = useState("");
  const [editKanaStaff, setEditKanaStaff] = useState("");
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

  const openEditDialog = (staff: { id: number; name: string | null; team: string | null; role: string; numberPlate?: string | null; nameKana?: string | null }) => {
    // roleが "user" または "admin" 以外の場合は "admin" にフォールバック
    const safeRole: "user" | "admin" = (staff.role === "user" || staff.role === "admin") ? staff.role : "admin";
    setEditStaff({ id: staff.id, name: staff.name ?? "", team: (staff.team as TeamStaff) ?? "身体", role: safeRole, numberPlate: staff.numberPlate ?? "" });
    setEditName(staff.name ?? "");
    setEditKanaStaff((staff as any).nameKana ?? "");
    setEditTeam((staff.team as TeamStaff) ?? "身体");
    setEditRole(safeRole);
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
            {/* ナンバープレート未登録フィルター */}
            {(() => {
              const noPlateCount = staffList.filter((s) => !(s as any).numberPlate).length;
              return noPlateCount > 0 ? (
                <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-blue-700 dark:text-blue-400">ナンバープレート未登録のスタッフが {noPlateCount}名 います</span>
                  </div>
                  <button
                    onClick={() => { setShowNoPlateOnly((v) => !v); if (showUnsetOnly) setShowUnsetOnly(false); }}
                    className={cn(
                      "text-xs px-2.5 py-1 rounded-lg font-medium transition-colors",
                      showNoPlateOnly
                        ? "bg-blue-500 text-white hover:bg-blue-600"
                        : "bg-white dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-600 hover:bg-blue-100"
                    )}
                  >
                    {showNoPlateOnly ? "全員表示" : "未登録のみ表示"}
                  </button>
                </div>
              ) : null;
            })()}
            {(() => {
              let filtered = staffList;
              if (showUnsetOnly) filtered = filtered.filter((s) => !s.teamSetupDone);
              if (showNoPlateOnly) filtered = filtered.filter((s) => !(s as any).numberPlate);
              return filtered.map((staff, idx) => (
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
                      {!(staff as any).numberPlate && (
                        <Badge variant="outline" className="text-xs px-1.5 py-0 bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-700">
                          ナンバープレート未登録
                        </Badge>
                      )}
                    </div>
                    {(staff as any).nameKana && (
                      <p className="text-xs text-muted-foreground mt-0.5">よみがな: {(staff as any).nameKana}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">{staff.email ?? "メール未設定"}</p>
                    <p className="text-xs text-muted-foreground">最終ログイン: {staff.lastSignedIn ? new Date(staff.lastSignedIn).toLocaleDateString("ja-JP") : "未ログイン"}</p>
                    {(staff as any).numberPlate && (
                      <p className="text-xs text-muted-foreground">
                        🚗 ナンバープレート: <span className="font-medium text-foreground">{(staff as any).numberPlate}</span>
                      </p>
                    )}
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
            ));
            })()}
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

          {/* よみがな */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">よみがな</label>
            <input
              type="text"
              value={editKanaStaff}
              onChange={(e) => setEditKanaStaff(e.target.value)}
              placeholder="例：やまだ はなこ"
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
                updateInfo.mutate({ userId: editStaff.id, name: editName.trim(), nameKana: editKanaStaff.trim() || undefined, team: editTeam, role: editRole, numberPlate: editNumberPlate.trim() || undefined });
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

  const [formStartDate, setFormStartDate] = useState("");
  const [formEndDate, setFormEndDate] = useState("");

  function resetForm() {
    setFormTeam("全チーム");
    setFormTitle("");

    setFormStartDate("");
    setFormEndDate("");
  }

  function startEdit(g: typeof goals[0]) {
    setEditingId(g.id);
    setFormTeam(g.team as TeamOption);
    setFormTitle(g.title);

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
      body: null,
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
          <div>
            <div className="flex items-center gap-3">
              <CardTitle className="text-base font-semibold">チーム目標管理</CardTitle>
              <Button size="sm" onClick={() => { setShowForm(!showForm); setEditingId(null); resetForm(); }} className="flex items-center gap-1">
                <Plus className="w-4 h-4" />
                新規登録
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-1">各チームの目標を登録・編集できます。期間を指定すると自動的に表示・非表示が切り替わります。</p>
          </div>
        </CardHeader>
      </Card>

      {showForm && (
        <Card className="shadow-sm border-primary/30">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-semibold text-primary">新規チーム目標を登録</CardTitle>
          </CardHeader>
          <CardContent className="overflow-hidden">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">チーム</label>
                <select value={formTeam} onChange={e => setFormTeam(e.target.value as TeamOption)} className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background">
                  {TEAM_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium">目標内容 <span className="text-red-500">*</span></label>
                  <span className={`text-xs ${formTitle.length > 40 ? 'text-red-500 font-semibold' : 'text-muted-foreground'}`}>{formTitle.length}/40文字以内</span>
                </div>
                <textarea value={formTitle} onChange={e => setFormTitle(e.target.value.slice(0, 40))} placeholder="例：今月の訪問件数目標を達成しよう！" rows={2} maxLength={40} className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background resize-none" required />
                <p className="text-xs text-muted-foreground mt-0.5">ホーム画面に2行で表示されます（最大40文字）</p>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">期間（空欄=常時表示）</label>
                <div className="flex items-center gap-2">
                  <input type="date" value={formStartDate} onChange={e => setFormStartDate(e.target.value)} className="flex-1 border border-border rounded-md px-3 py-2 text-sm bg-background" />
                  <span className="text-sm text-muted-foreground">〜</span>
                  <input type="date" value={formEndDate} onChange={e => setFormEndDate(e.target.value)} className="flex-1 border border-border rounded-md px-3 py-2 text-sm bg-background" />
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
                      <div>
                        <label className="text-sm font-medium mb-1 block">チーム</label>
                        <select value={formTeam} onChange={e => setFormTeam(e.target.value as TeamOption)} className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background">
                          {TEAM_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-sm font-medium">目標内容 <span className="text-red-500">*</span></label>
                          <span className={`text-xs ${formTitle.length > 40 ? 'text-red-500 font-semibold' : 'text-muted-foreground'}`}>{formTitle.length}/40文字以内</span>
                        </div>
                        <textarea value={formTitle} onChange={e => setFormTitle(e.target.value.slice(0, 40))} rows={2} maxLength={40} className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background resize-none" required />
                        <p className="text-xs text-muted-foreground mt-0.5">ホーム画面に2行で表示されます（最大40文字）</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">期間（空欄=常時表示）</label>
                        <div className="flex items-center gap-2">
                          <input type="date" value={formStartDate} onChange={e => setFormStartDate(e.target.value)} className="flex-1 border border-border rounded-md px-3 py-2 text-sm bg-background" />
                          <span className="text-sm text-muted-foreground">〜</span>
                          <input type="date" value={formEndDate} onChange={e => setFormEndDate(e.target.value)} className="flex-1 border border-border rounded-md px-3 py-2 text-sm bg-background" />
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
  const { data: shareEmailsData, isLoading: isLoadingEmails } = trpc.settings.getShareEmails.useQuery();
  const { data: scheduleChangeDeleteDaysData, isLoading: isLoadingScheduleDeleteDays } = trpc.settings.getScheduleChangeDeleteDays.useQuery();
  const utils = trpc.useUtils();

  // 次回訪問日時シートにフィルターを適用
  const applyVisitFilterMutation = trpc.visitRecords.applySheetFilter.useMutation({
    onSuccess: (data) => {
      const succeeded = data.results.filter(r => r.success).map(r => r.sheetName);
      const failed = data.results.filter(r => !r.success).map(r => `${r.sheetName}(${r.message})`);
      if (succeeded.length > 0) toast.success(`フィルターを適用しました: ${succeeded.join("、")}`);
      if (failed.length > 0) toast.error(`失敗: ${failed.join("、")}`);
    },
    onError: (e) => toast.error(`フィルター適用失敗: ${e.message}`),
  });

  // スケジュール変更連絡シートにフィルターを適用
  const applyFilterMutation = trpc.scheduleChanges.applySheetFilter.useMutation({
    onSuccess: (data) => {
      const succeeded = data.results.filter(r => r.success).map(r => r.sheetName);
      const failed = data.results.filter(r => !r.success).map(r => `${r.sheetName}(${r.message})`);
      if (succeeded.length > 0) toast.success(`フィルターを適用しました: ${succeeded.join("、")}`);
      if (failed.length > 0) toast.error(`失敗: ${failed.join("、")}`);
    },
    onError: (e) => toast.error(`フィルター適用失敗: ${e.message}`),
  });
  const setCleanupDaysMutation = trpc.settings.setSheetCleanupDays.useMutation({
    onSuccess: () => {
      utils.settings.getSheetCleanupDays.invalidate();
      toast.success("保持期間を更新しました");
    },
    onError: (e) => toast.error(e.message),
  });
  const setShareEmailsMutation = trpc.settings.setShareEmails.useMutation({
    onSuccess: () => {
      utils.settings.getShareEmails.invalidate();
      toast.success("共有先メールアドレスを保存しました");
    },
    onError: (e) => toast.error(e.message),
  });

  const setScheduleChangeDeleteDaysMutation = trpc.settings.setScheduleChangeDeleteDays.useMutation({
    onSuccess: () => {
      utils.settings.getScheduleChangeDeleteDays.invalidate();
      toast.success("スケジュール変更連絡の保持期間を更新しました");
    },
    onError: (e) => toast.error(e.message),
  });

  const [selectedDays, setSelectedDays] = useState<number>(7);
  const [selectedScheduleChangeDays, setSelectedScheduleChangeDays] = useState<number>(3);
  const [emailInput, setEmailInput] = useState("");
  const [emailList, setEmailList] = useState<string[]>([]);

  // データ取得後にセレクトの初期値を設定
  useEffect(() => {
    if (cleanupDaysData?.days) {
      setSelectedDays(cleanupDaysData.days);
    }
  }, [cleanupDaysData?.days]);

  useEffect(() => {
    if (scheduleChangeDeleteDaysData?.days) {
      setSelectedScheduleChangeDays(scheduleChangeDeleteDaysData.days);
    }
  }, [scheduleChangeDeleteDaysData?.days]);

  useEffect(() => {
    if (shareEmailsData?.emails) {
      setEmailList(shareEmailsData.emails);
    }
  }, [shareEmailsData?.emails]);

  const handleAddEmail = () => {
    const trimmed = emailInput.trim();
    if (!trimmed) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error("正しいメールアドレスを入力してください");
      return;
    }
    if (emailList.includes(trimmed)) {
      toast.error("すでに登録済みのメールアドレスです");
      return;
    }
    setEmailList((prev) => [...prev, trimmed]);
    setEmailInput("");
  };

  const handleRemoveEmail = (email: string) => {
    setEmailList((prev) => prev.filter((e) => e !== email));
  };

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
      {/* 次回訪問日時シートフィルター適用 */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Filter className="w-4 h-4 text-primary" />
            次回訪問日時シートのフィルター設定
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            「次回訪問日時」スプレッドシートの全シート（身体・天理・郡山北部・郡山南部）にフィルター・ヘッダー書式・列幅を一括適用します。
            新規シート作成時は自動適用されますが、既存シートに後から適用する場合はこのボタンを使用してください。
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              onClick={() => applyVisitFilterMutation.mutate({})}
              disabled={applyVisitFilterMutation.isPending}
              className="flex items-center gap-2"
            >
              <Filter className="w-4 h-4" />
              {applyVisitFilterMutation.isPending ? "適用中..." : "全シートにフィルターを適用"}
            </Button>
          </div>
          {applyVisitFilterMutation.data && (
            <div className="rounded-lg bg-muted/50 border border-border p-3 text-xs space-y-1">
              {applyVisitFilterMutation.data.results.map(r => (
                <div key={r.sheetName} className={`flex items-center gap-2 ${r.success ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                  <span>{r.success ? "✓" : "✕"}</span>
                  <span>{r.sheetName}: {r.message}</span>
                </div>
              ))}
            </div>
          )}
          <div className="rounded-lg bg-muted/50 border border-border p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">適用内容</p>
            <p>・ヘッダー行（1行目）にオートフィルターを設定（A～I列）</p>
            <p>・ヘッダー行の背景色（青系）・太字・白文字に書式設定</p>
            <p>・各列幅を内容に合わせて最適化</p>
            <p>・1行目を固定（スクロール時もヘッダーが常に表示）</p>
          </div>
        </CardContent>
      </Card>

      {/* スケジュール変更連絡シートフィルター適用 */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Filter className="w-4 h-4 text-primary" />
            スケジュール変更連絡シートのフィルター設定
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            「スケジュール変更連絡」スプレッドシートの全シート（身体・天理・郡山北部・郡山南部）にフィルター・ヘッダー書式・列幅を一括適用します。
            新規シート作成時は自動適用されますが、既存シートに後から適用する場合はこのボタンを使用してください。
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              onClick={() => applyFilterMutation.mutate({})}
              disabled={applyFilterMutation.isPending}
              className="flex items-center gap-2"
            >
              <Filter className="w-4 h-4" />
              {applyFilterMutation.isPending ? "適用中..." : "全シートにフィルターを適用"}
            </Button>
          </div>
          {applyFilterMutation.data && (
            <div className="rounded-lg bg-muted/50 border border-border p-3 text-xs space-y-1">
              {applyFilterMutation.data.results.map(r => (
                <div key={r.sheetName} className={`flex items-center gap-2 ${r.success ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                  <span>{r.success ? "✓" : "✕"}</span>
                  <span>{r.sheetName}: {r.message}</span>
                </div>
              ))}
            </div>
          )}
          <div className="rounded-lg bg-muted/50 border border-border p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">適用内容</p>
            <p>・ヘッダー行（1行目）にオートフィルターを設定（A〜L列）</p>
            <p>・ヘッダー行の背景色（青系）・太字・白文字に書式設定</p>
            <p>・各列幅を内容に合わせて最適化</p>
            <p>・1行目を固定（スクロール時もヘッダーが常に表示）</p>
          </div>
        </CardContent>
      </Card>

      {/* スプレッドシート共有先メール設定 */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Mail className="w-4 h-4 text-primary" />
            スプレッドシート共有先メール設定
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            アルコールチェック・出退勤タイムシートのスプレッドシートを自動作成した際に、登録したメールアドレスに自動共有（編集権限）します。
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoadingEmails ? (
            <div className="h-9 bg-muted animate-pulse rounded-md" />
          ) : (
            <>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="example@gmail.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddEmail(); } }}
                  className="flex-1 h-9 text-sm"
                />
                <Button size="sm" variant="outline" onClick={handleAddEmail} className="h-9 px-3">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {emailList.length > 0 && (
                <div className="space-y-1.5">
                  {emailList.map((email) => (
                    <div key={email} className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-md bg-muted/50 border border-border">
                      <div className="flex items-center gap-2 min-w-0">
                        <Mail className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm text-foreground truncate">{email}</span>
                      </div>
                      <button onClick={() => handleRemoveEmail(email)} className="text-muted-foreground hover:text-destructive flex-shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {emailList.length === 0 && (
                <p className="text-xs text-muted-foreground italic">共有先メールアドレスが登録されていません。スプレッドシートはサービスアカウントのみアクセス可能な状態で作成されます。</p>
              )}
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={() => setShareEmailsMutation.mutate({ emails: emailList })}
                  disabled={setShareEmailsMutation.isPending}
                >
                  {setShareEmailsMutation.isPending ? "保存中..." : "共有先を保存"}
                </Button>
              </div>
              <div className="rounded-lg bg-muted/50 border border-border p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">共有の仕組み</p>
                <p>・毎月スプレッドシートを自動作成する際に、登録された全メールアドレスに自動で編集権限を付与します</p>
                <p>・既存のスプレッドシートには遅及して共有されません（新規作成分のみ適用）</p>
                <p>・アルコールチェック・出退勤タイムシートの両方に適用されます</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
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
            <p>・例：保持期陱4日の場合、3月1日13:00の行は3月8日0:00に削除されます</p>
            <p>・次回訪問日時が空欄の行は削除されません</p>
          </div>
        </CardContent>
      </Card>

      {/* スケジュール変更連絡自動削除日数設定 */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Settings className="w-4 h-4 text-primary" />
            スケジュール変更連絡自動削除設定
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            スケジュール変更連絡の「変更後の日時」から設定日数を過ぎたレコードを毎日0:05（日本時間）に自動削除します。
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-sm font-medium text-foreground block mb-1.5">
                保持期間
              </label>
              {isLoadingScheduleDeleteDays ? (
                <div className="h-9 bg-muted animate-pulse rounded-md" />
              ) : (
                <select
                  value={selectedScheduleChangeDays}
                  onChange={(e) => setSelectedScheduleChangeDays(Number(e.target.value))}
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {[1, 2, 3, 5, 7, 14, 30].map((d) => (
                    <option key={d} value={d}>{d}日{d === 3 ? "（デフォルト）" : ""}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="pt-6">
              <Button
                size="sm"
                onClick={() => setScheduleChangeDeleteDaysMutation.mutate({ days: selectedScheduleChangeDays })}
                disabled={setScheduleChangeDeleteDaysMutation.isPending || isLoadingScheduleDeleteDays}
              >
                {setScheduleChangeDeleteDaysMutation.isPending ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
          <div className="rounded-lg bg-muted/50 border border-border p-3 text-sm text-muted-foreground space-y-1">
            <p className="font-medium text-foreground text-xs">動作の仕組み</p>
            <p>・毎日0:05（日本時間）に自動実行されます</p>
            <p>・「変更後の日時」から設定日数以上前のスケジュール変更連絡を削除します</p>
            <p>・例：3日の場合、4月1日の変更連絡は4月4日0:05に削除されます</p>
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
// 操作ログパネル
// ============================
function ToolAuditLogsPanel() {
  const today = new Date();
  const jst = new Date(today.getTime() + 9 * 60 * 60 * 1000);
  const defaultEnd = jst.toISOString().slice(0, 10);
  const defaultStart = new Date(jst.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [activeTab, setActiveTab] = useState<"toolLogs" | "allLogs">("allLogs");
  const [toolTypeFilter, setToolTypeFilter] = useState<"all" | "team" | "common">("all");
  const [csvStartDate, setCsvStartDate] = useState(defaultStart);
  const [csvEndDate, setCsvEndDate] = useState(defaultEnd);
  const [csvUserId, setCsvUserId] = useState<number | undefined>(undefined);
  const [csvEnabled, setCsvEnabled] = useState(false);

  const { data: logs, isLoading, refetch } = trpc.toolAuditLogs.list.useQuery(
    { limit: 200, toolType: toolTypeFilter },
    { refetchOnWindowFocus: false }
  );

  const { data: staffList } = trpc.toolAuditLogs.getStaffList.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const { data: allLogs, isLoading: allLogsLoading, refetch: refetchAll } = trpc.toolAuditLogs.exportAll.useQuery(
    { startDate: csvStartDate, endDate: csvEndDate, userId: csvUserId },
    { enabled: csvEnabled, refetchOnWindowFocus: false }
  );

  const handleLoadLogs = () => {
    setCsvEnabled(true);
    refetchAll();
  };

  const handleExportCsv = () => {
    if (!allLogs || allLogs.length === 0) return;
    const header = "日時,職員名,カテゴリ,操作,詳細";
    const rows = allLogs.map((r) =>
      [
        `"${r.datetime}"`,
        `"${r.userName}"`,
        `"${r.category}"`,
        `"${r.action}"`,
        `"${r.detail.replace(/"/g, '""')}"`,
      ].join(",")
    );
    const csv = "\uFEFF" + [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `操作ログ_${csvStartDate}_${csvEndDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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

  const categoryColor = (cat: string) => {
    if (cat === "出退勤") return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    if (cat === "残業申請") return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300";
    if (cat === "アルコールチェック") return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300";
    if (cat === "タスク") return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    if (cat === "メッセージ") return "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300";
    if (cat === "スケジュール変更連絡") return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
    if (cat === "ツール操作") return "bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-300";
    if (cat === "月次署名") return "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300";
    return "bg-gray-100 text-gray-800";
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">操作ログ</CardTitle>
        </div>
        {/* タブ切り替え */}
        <div className="flex gap-1 mt-3 border-b border-border">
          <button
            onClick={() => setActiveTab("allLogs")}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
              activeTab === "allLogs" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            全操作ログ（CSV出力）
          </button>
          <button
            onClick={() => setActiveTab("toolLogs")}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
              activeTab === "toolLogs" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            ツール操作履歴
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {activeTab === "allLogs" && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">全職員の全操作（出退勤・残業申請・アルコールチェック・タスク・メッセージ・スケジュール変更・ツール操作・月次署名）をCSV形式で出力できます。</p>

            {/* フィルター */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-lg bg-muted/40 border border-border">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">開始日</label>
                <input
                  type="date"
                  value={csvStartDate}
                  onChange={(e) => { setCsvStartDate(e.target.value); setCsvEnabled(false); }}
                  className="w-full text-sm border border-border rounded-md px-2 py-1.5 bg-background text-foreground"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">終了日</label>
                <input
                  type="date"
                  value={csvEndDate}
                  onChange={(e) => { setCsvEndDate(e.target.value); setCsvEnabled(false); }}
                  className="w-full text-sm border border-border rounded-md px-2 py-1.5 bg-background text-foreground"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">職員フィルター</label>
                <select
                  value={csvUserId ?? ""}
                  onChange={(e) => { setCsvUserId(e.target.value ? Number(e.target.value) : undefined); setCsvEnabled(false); }}
                  className="w-full text-sm border border-border rounded-md px-2 py-1.5 bg-background text-foreground"
                >
                  <option value="">全員</option>
                  {staffList?.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-2">
              <Button size="sm" onClick={handleLoadLogs} disabled={allLogsLoading} className="text-xs">
                {allLogsLoading ? "読み込み中..." : "ログを読み込む"}
              </Button>
              {allLogs && allLogs.length > 0 && (
                <Button size="sm" variant="outline" onClick={handleExportCsv} className="text-xs">
                  CSVダウンロード（{allLogs.length}件）
                </Button>
              )}
            </div>

            {csvEnabled && (
              allLogsLoading ? (
                <div className="text-center py-8 text-muted-foreground text-sm">読み込み中...</div>
              ) : !allLogs || allLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">該当する操作ログがありません</div>
              ) : (
                <div className="space-y-1.5 max-h-96 overflow-y-auto">
                  {allLogs.map((row, i) => (
                    <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg border border-border bg-card hover:bg-accent/20 transition-colors">
                      <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5 whitespace-nowrap", categoryColor(row.category))}>
                        {row.category}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground">{row.userName}</span>
                          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{row.action}</span>
                        </div>
                        {row.detail && <p className="text-xs text-muted-foreground mt-0.5 truncate">{row.detail}</p>}
                        <p className="text-xs text-muted-foreground mt-0.5">{row.datetime}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        )}

        {activeTab === "toolLogs" && (
          <div>
            <p className="text-xs text-muted-foreground mb-3">ツールの追加・更新・削除の操作履歴（最新200件）</p>
            {/* フィルター */}
            <div className="flex gap-2 mb-4 items-center">
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
              <Button variant="ghost" size="sm" onClick={() => refetch()} className="text-xs ml-auto">
                <RotateCcw className="w-3.5 h-3.5 mr-1" />
                更新
              </Button>
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
                          <span className="text-xs text-muted-foreground">{log.operatedByName}</span>
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
  const [previewSheetId, setPreviewSheetId] = useState<string | null>(null);

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
  const createSpreadsheetMutation = trpc.attendance.createSpreadsheet.useMutation({
    onSuccess: () => {
      utils.attendance.getSpreadsheets.invalidate();
      toast.success("スプレッドシートを自動作成しました");
      setShowAddForm(false);
    },
    onError: (e) => toast.error(`自動作成に失敗しました: ${e.message}`),
  });
  const shareSpreadsheetMutation = trpc.attendance.shareSpreadsheet.useMutation({
    onSuccess: (data) => {
      navigator.clipboard.writeText(data.url).then(() => {
        toast.success("URLをクリップボードにコピーしました");
      }).catch(() => {
        toast.info(`URL: ${data.url}`);
      });
    },
    onError: (e) => toast.error(`共有設定に失敗しました: ${e.message}`),
  });
  const retrySyncMutation = trpc.attendance.retrySync.useMutation({
    onSuccess: (data) => {
      if (data.total === 0) {
        toast.success("未同期の記録はありませんでした");
      } else {
        toast.success(`再転記完了: 成功 ${data.successCount}件 / 失敗 ${data.failCount}件 (合計 ${data.total}件)`);
      }
    },
    onError: (e) => toast.error(`再転記に失敗しました: ${e.message}`),
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
        <h2 className="text-lg font-bold">アルコールチェックスプレッドシート管理</h2>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5 border-amber-400 text-amber-700 hover:bg-amber-50"
            disabled={retrySyncMutation.isPending}
            onClick={() => retrySyncMutation.mutate()}
          >
            {retrySyncMutation.isPending ? "転記中..." : "⚠️ 未同期を再転記"}
          </Button>
          <a
            href="https://drive.google.com/drive/folders/1M1po6_l4AAqqygD9xoQU8jQPF9XXX7_4"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5">
              <ExternalLink className="w-3.5 h-3.5" />
              Driveで開く
            </Button>
          </a>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        アルコールチェックの記録が職員別タブに自動転記されるスプレッドシートを月ごとに管理します。毎月25日に翌月分が自動作成されます。
      </p>

      {/* 年月選択・自動作成 */}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={newYear}
          onChange={(e) => setNewYear(Number(e.target.value))}
          className="border rounded px-2 py-1 text-sm"
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>{y}年</option>
          ))}
        </select>
        <select
          value={newMonth}
          onChange={(e) => setNewMonth(Number(e.target.value))}
          className="border rounded px-2 py-1 text-sm"
        >
          {monthOptions.map((m) => (
            <option key={m} value={m}>{m}月</option>
          ))}
        </select>
        <Button
          size="sm"
          variant="outline"
          disabled={createSpreadsheetMutation.isPending}
          onClick={() => createSpreadsheetMutation.mutate({ year: newYear, month: newMonth })}
          className="flex items-center gap-1"
        >
          {createSpreadsheetMutation.isPending ? "作成中..." : "✨ 自動作成"}
        </Button>
        {createSpreadsheetMutation.isSuccess && (
          <span className="text-xs text-green-600">スプレッドシートを作成しました</span>
        )}
        {createSpreadsheetMutation.isError && (
          <span className="text-xs text-red-500">作成失敗: {createSpreadsheetMutation.error?.message}</span>
        )}
      </div>

      {/* 登録フォーム */}
      <Card>
        <CardHeader><CardTitle className="text-sm">手動でスプレッドシートを登録</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="ラベル（例: 2026年4月 アルコールチェック記録）"
            className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <input
            type="text"
            value={newSpreadsheetId}
            onChange={(e) => setNewSpreadsheetId(e.target.value)}
            placeholder="Google スプレッドシートのURL"
            className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <Button
            size="sm"
            onClick={handleAdd}
            disabled={upsertMutation.isPending || !newSpreadsheetId.trim()}
          >
            {upsertMutation.isPending ? "登録中..." : "登録"}
          </Button>
        </CardContent>
      </Card>

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
                      <button
                        type="button"
                        onClick={() => shareSpreadsheetMutation.mutate({ spreadsheetId: sheet.spreadsheetId })}
                        disabled={shareSpreadsheetMutation.isPending}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        title="URLをコピー（共有設定も行います）"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewSheetId(previewSheetId === sheet.spreadsheetId ? null : sheet.spreadsheetId)}
                        className={cn(
                          "p-1.5 rounded-lg transition-colors text-xs font-medium px-2 py-1 h-7",
                          previewSheetId === sheet.spreadsheetId
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-primary hover:bg-primary/10"
                        )}
                        title="アプリ内でプレビュー"
                      >
                        {previewSheetId === sheet.spreadsheetId ? "閉じる" : "プレビュー"}
                      </button>
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
                  {/* iframeプレビュー */}
                  {previewSheetId === sheet.spreadsheetId && (
                    <div className="border-t border-border">
                      <div className="p-2 bg-muted/30 flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">スプレッドシートプレビュー（編集はGoogleスプレッドシートで行ってください）</p>
                        <a
                          href={`https://docs.google.com/spreadsheets/d/${sheet.spreadsheetId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          別タブで開く
                        </a>
                      </div>
                      <iframe
                        src={`https://docs.google.com/spreadsheets/d/${sheet.spreadsheetId}/htmlview?rm=minimal`}
                        className="w-full h-96 border-0"
                        title={`${sheet.year}年${sheet.month}月 アルコールチェック記録`}
                        sandbox="allow-scripts allow-same-origin allow-popups"
                      />
                    </div>
                  )}
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
              <p className="font-semibold">スプレッドシートの自動作成について</p>
              <p className="text-amber-600/80 dark:text-amber-400/70">
                アルコールチェック記録時に当月分のスプレッドシートが未登録の場合、自動で新規作成します。また、毎月25日に翌月分のスプレッドシートを自動作成します。「新規登録」から「✨ Googleが自動作成」ボタンで手動作成も可能です。
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


// ============================
// アルコールチェック記録 CSV エクスポートパネル
// ============================

function AlcoholCheckCsvExportPanel() {
  // デフォルト: 今月1日〜今日
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const [startDate, setStartDate] = useState(fmt(firstOfMonth));
  const [endDate, setEndDate] = useState(fmt(today));
  const [enabled, setEnabled] = useState(false);

  const { data, isFetching, error } = trpc.attendance.exportCsv.useQuery(
    { startDate, endDate },
    { enabled, staleTime: 0 }
  );

  // データが取得できたら自動ダウンロード
  useEffect(() => {
    if (!data || !enabled) return;
    const blob = new Blob([data.csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `アルコールチェック記録_${startDate}_${endDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setEnabled(false);
    toast.success(`${data.count}件の記録をCSVでダウンロードしました`);
  }, [data, enabled]);

  const handleExport = () => {
    if (!startDate || !endDate) { toast.error("開始日・終了日を入力してください"); return; }
    if (endDate < startDate) { toast.error("開始日は終了日以前にしてください"); return; }
    setEnabled(true);
  };

  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardHeader className="pb-2 pt-4">
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-primary" />
            <CardTitle className="text-base font-semibold">アルコールチェック記録 CSV出力</CardTitle>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            指定した期間のアルコールチェック記録をCSV形式でダウンロードします。Excelで開けるBOM付きUTF-8形式です。
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 期間選択 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">開始日</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setEnabled(false); }}
                className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:border-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">終了日</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setEnabled(false); }}
                className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* クイック選択 */}
          <div className="flex flex-wrap gap-2">
            {[
              { label: "今月", start: fmt(firstOfMonth), end: fmt(today) },
              {
                label: "先月",
                start: fmt(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
                end: fmt(new Date(today.getFullYear(), today.getMonth(), 0)),
              },
              {
                label: "過去3ヶ月",
                start: fmt(new Date(today.getFullYear(), today.getMonth() - 2, 1)),
                end: fmt(today),
              },
            ].map(({ label, start, end }) => (
              <Button
                key={label}
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => { setStartDate(start); setEndDate(end); setEnabled(false); }}
              >
                {label}
              </Button>
            ))}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{error.message}</span>
            </div>
          )}

          <Button
            className="w-full"
            onClick={handleExport}
            disabled={isFetching}
          >
            {isFetching ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                取得中...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Download className="w-4 h-4" />
                CSVをダウンロード
              </span>
            )}
          </Button>

          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
            <p className="text-xs font-semibold text-foreground">出力される列（16列）</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              実施日時・区分・氏名・ナンバープレート・出勤打刻・退勤打刻・確認方法・検知器使用・酒気帯有無・確認者・残業時間・残業理由・連絡先・人数・備考・登録日時
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================
// アルコール検知器設定パネル
// ============================
function AlcoholDetectorSettingsPanel() {
  const utils = trpc.useUtils();
  const { data: detectors, isLoading } = trpc.alcoholDetector.getAll.useQuery();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newModelNumber, setNewModelNumber] = useState("");
  const [newManufacturer, setNewManufacturer] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editModelNumber, setEditModelNumber] = useState("");
  const [editManufacturer, setEditManufacturer] = useState("");

  const createMutation = trpc.alcoholDetector.create.useMutation({
    onSuccess: () => {
      utils.alcoholDetector.getAll.invalidate();
      utils.alcoholDetector.getActive.invalidate();
      toast.success("検知器を登録しました");
      setNewName("");
      setNewModelNumber("");
      setNewManufacturer("");
      setShowAddForm(false);
    },
    onError: (e) => toast.error(`登録に失敗しました: ${e.message}`),
  });

  const updateMutation = trpc.alcoholDetector.update.useMutation({
    onSuccess: () => {
      utils.alcoholDetector.getAll.invalidate();
      utils.alcoholDetector.getActive.invalidate();
      toast.success("更新しました");
      setEditingId(null);
    },
    onError: (e) => toast.error(`更新に失敗しました: ${e.message}`),
  });

  const deleteMutation = trpc.alcoholDetector.delete.useMutation({
    onSuccess: () => {
      utils.alcoholDetector.getAll.invalidate();
      utils.alcoholDetector.getActive.invalidate();
      toast.success("削除しました");
    },
    onError: (e) => toast.error(`削除に失敗しました: ${e.message}`),
  });

  const handleAdd = () => {
    if (!newName.trim()) { toast.error("検知器名を入力してください"); return; }
    createMutation.mutate({
      name: newName.trim(),
      modelNumber: newModelNumber.trim() || undefined,
      manufacturer: newManufacturer.trim() || undefined,
      isActive: 1,
      sortOrder: 0,
    });
  };

  const startEdit = (d: { id: number; name: string; modelNumber: string | null; manufacturer: string | null }) => {
    setEditingId(d.id);
    setEditName(d.name);
    setEditModelNumber(d.modelNumber ?? "");
    setEditManufacturer(d.manufacturer ?? "");
  };

  const handleUpdate = (id: number) => {
    if (!editName.trim()) { toast.error("検知器名を入力してください"); return; }
    updateMutation.mutate({
      id,
      name: editName.trim(),
      modelNumber: editModelNumber.trim() || null,
      manufacturer: editManufacturer.trim() || null,
    });
  };

  const handleToggleActive = (d: { id: number; isActive: number }) => {
    updateMutation.mutate({ id: d.id, isActive: d.isActive === 1 ? 0 : 1 });
  };

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground">アルコール検知器設定</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            登録した検知器はアルコールチェック記録フォームのプルダウンに表示されます。
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
            <p className="text-sm font-semibold text-foreground">新規検知器登録</p>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">検知器名 <span className="text-destructive">*</span></label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="例: ライオン社製 SD-400"
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">型番（任意）</label>
                <input
                  type="text"
                  value={newModelNumber}
                  onChange={(e) => setNewModelNumber(e.target.value)}
                  placeholder="例: SD-400"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">メーカー（任意）</label>
                <input
                  type="text"
                  value={newManufacturer}
                  onChange={(e) => setNewManufacturer(e.target.value)}
                  placeholder="例: ライオン株式会社"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={handleAdd}
                disabled={createMutation.isPending || !newName.trim()}
              >
                {createMutation.isPending ? "登録中..." : "登録する"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => { setShowAddForm(false); setNewName(""); setNewModelNumber(""); setNewManufacturer(""); }}
              >
                キャンセル
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 登録済み検知器一覧 */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">読み込み中...</div>
      ) : !detectors || detectors.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Settings className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">まだ検知器が登録されていません</p>
            <p className="text-xs text-muted-foreground mt-1">「新規登録」から検知器を追加してください</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {detectors.map((d) => (
            <Card key={d.id} className={cn("transition-colors", !d.isActive && "opacity-60")}>
              <CardContent className="py-3 px-4">
                {editingId === d.id ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="検知器名"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={editModelNumber}
                        onChange={(e) => setEditModelNumber(e.target.value)}
                        placeholder="型番（任意）"
                        className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <input
                        type="text"
                        value={editManufacturer}
                        onChange={(e) => setEditManufacturer(e.target.value)}
                        placeholder="メーカー（任意）"
                        className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="h-7 text-xs" onClick={() => handleUpdate(d.id)} disabled={updateMutation.isPending}>
                        {updateMutation.isPending ? "保存中..." : "保存"}
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditingId(null)}>
                        キャンセル
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground">{d.name}</span>
                        {d.isActive ? (
                          <Badge className="text-xs bg-emerald-100 text-emerald-700 border-0 px-1.5 py-0">有効</Badge>
                        ) : (
                          <Badge className="text-xs bg-gray-100 text-gray-500 border-0 px-1.5 py-0">無効</Badge>
                        )}
                      </div>
                      {(d.modelNumber || d.manufacturer) && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {[d.manufacturer, d.modelNumber].filter(Boolean).join(" / ")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(d)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        title={d.isActive ? "無効にする" : "有効にする"}
                      >
                        {d.isActive ? <ShieldCheck className="w-4 h-4 text-emerald-500" /> : <Shield className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(d)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        title="編集"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`「${d.name}」を削除しますか？`)) {
                            deleteMutation.mutate({ id: d.id });
                          }
                        }}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="削除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 注意書き */}
      <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20">
        <CardContent className="py-3 px-4">
          <div className="flex gap-2 text-xs text-blue-700 dark:text-blue-400">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">検知器の型番について</p>
              <p className="text-blue-600/80 dark:text-blue-400/70">
                登録した検知器はアルコールチェック記録フォームのプルダウンに表示されます。
                「無効」にした検知器はプルダウンに表示されなくなりますが、記録は保持されます。
                検知器が1台も登録されていない場合は、フォームに自由入力欄が表示されます。
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


// ============================
// 出退勤スプレッドシート管理パネル
// ============================
function TimesheetSpreadsheetsPanel() {
  const utils = trpc.useUtils();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [labelInput, setLabelInput] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const { data: sheets = [], isLoading } = trpc.timesheet.getAll.useQuery();

  const createMut = trpc.timesheet.create.useMutation({
    onSuccess: () => {
      utils.timesheet.getAll.invalidate();
      setLabelInput("");
      setUrlInput("");
    },
  });
  const deleteMut = trpc.timesheet.delete.useMutation({
    onSuccess: () => utils.timesheet.getAll.invalidate(),
  });
  const autoCreateMut = trpc.timesheet.autoCreate.useMutation({
    onSuccess: () => utils.timesheet.getAll.invalidate(),
  });
  const shareMut = trpc.timesheet.shareSpreadsheet.useMutation({
    onSuccess: (data, variables) => {
      if (data.url) {
        navigator.clipboard.writeText(data.url).then(() => {
          setCopiedId(variables.id);
          setTimeout(() => setCopiedId(null), 2000);
        });
      }
    },
  });

  const filtered = sheets.filter((s) => s.year === year && s.month === month);

  const toEmbedUrl = (url: string) => {
    const m = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!m) return url;
    return `https://docs.google.com/spreadsheets/d/${m[1]}/edit?usp=sharing&embedded=true`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">出退勤スプレッドシート管理</h2>
        <a
          href="https://drive.google.com/drive/folders/11GxLu7YB23OzV8kxMpkwSWTLOei9j7hk"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5">
            <ExternalLink className="w-3.5 h-3.5" />
            Driveで開く
          </Button>
        </a>
      </div>
      <p className="text-sm text-muted-foreground">
        出勤・退勤打刻・残業申請の記録が職員別タブに自動転記されるスプレッドシートを月ごとに管理します。毎月25日に翌月分が自動作成されます。
      </p>

      {/* 月選択・自動作成 */}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="border rounded px-2 py-1 text-sm"
        >
          {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
            <option key={y} value={y}>{y}年</option>
          ))}
        </select>
        <select
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          className="border rounded px-2 py-1 text-sm"
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>{m}月</option>
          ))}
        </select>
        <Button
          size="sm"
          variant="outline"
          disabled={autoCreateMut.isPending}
          onClick={() => autoCreateMut.mutate({ year, month })}
          className="flex items-center gap-1"
        >
          {autoCreateMut.isPending ? "作成中..." : "✨ 自動作成"}
        </Button>
        {autoCreateMut.isSuccess && (
          <span className="text-xs text-green-600">スプレッドシートを作成しました</span>
        )}
        {autoCreateMut.isError && (
          <span className="text-xs text-red-500">作成失敗: {autoCreateMut.error?.message}</span>
        )}
      </div>

      {/* 登録フォーム */}
      <Card>
        <CardHeader><CardTitle className="text-sm">手動でスプレッドシートを登録</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Input
            placeholder="ラベル（例: 2026年4月 出退勤記録）"
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
          />
          <Input
            placeholder="Google スプレッドシートのURL"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
          />
          <Button
            size="sm"
            disabled={!labelInput || !urlInput || createMut.isPending}
            onClick={() => createMut.mutate({ year, month, label: labelInput, spreadsheetUrl: urlInput })}
          >
            {createMut.isPending ? "登録中..." : "登録"}
          </Button>
        </CardContent>
      </Card>

      {/* スプレッドシート一覧 */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">読み込み中...</p>
      ) : filtered.length === 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{year}年{month}月のスプレッドシートは未登録です。「✨ 自動作成」ボタンで作成できます。</p>
          {sheets.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">登録済みの全月分:</p>
              <div className="flex flex-wrap gap-1">
                {sheets.map((s) => (
                  <span key={s.id} className="text-xs bg-muted px-2 py-0.5 rounded">{s.year}年{s.month}月</span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => (
            <Card key={s.id}>
              <CardContent className="pt-4 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <p className="font-medium text-sm">{s.label}</p>
                    <p className="text-xs text-muted-foreground">{s.year}年{s.month}月</p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => shareMut.mutate({ id: s.id })}
                      disabled={shareMut.isPending}
                    >
                      {copiedId === s.id ? "✓ コピー完了" : "📋 URLをコピー"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => window.open(s.spreadsheetUrl, "_blank")}>
                      外部で開く
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPreviewId(previewId === s.id ? null : s.id)}
                    >
                      {previewId === s.id ? "プレビューを閉じる" : "プレビュー"}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => { if (confirm("削除しますか？")) deleteMut.mutate({ id: s.id }); }}
                    >
                      削除
                    </Button>
                  </div>
                </div>
                {previewId === s.id && (
                  <div className="w-full border rounded overflow-hidden">
                    <iframe
                      src={toEmbedUrl(s.spreadsheetUrl)}
                      className="w-full"
                      style={{ height: "480px" }}
                      title={s.label}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================
// 残業承認パネル
// ============================
const OVERTIME_TEAMS = ["全て", "身体", "天理", "郡山北部", "郡山南部", "事務員"] as const;

function OvertimeApprovalsPanel() {
  const utils = trpc.useUtils();
  const [commentInputs, setCommentInputs] = useState<Record<number, string>>({});
  const [adjustStart, setAdjustStart] = useState<Record<number, string>>({});
  const [adjustEnd, setAdjustEnd] = useState<Record<number, string>>({});
  const [isBulkApproving, setIsBulkApproving] = useState(false);

  // フィルター状態
  const now = new Date();
  const defaultYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [filterStatus, setFilterStatus] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [filterTeamOT, setFilterTeamOT] = useState<string>("全て");
  const [filterYearMonth, setFilterYearMonth] = useState<string>(defaultYearMonth);

  const queryInput = {
    status: filterStatus,
    team: filterTeamOT !== "全て" ? filterTeamOT : undefined,
    yearMonth: filterYearMonth || undefined,
  };
  const { data: approvals = [], isLoading } = trpc.overtime.getAll.useQuery(queryInput);

  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());

  const approveMut = trpc.overtime.approve.useMutation({
    onSuccess: (_data, variables) => {
      const label = variables.status === "approved" ? "承認" : "却下";
      toast.success(`残業申請を${label}しました`);
      utils.overtime.getAll.invalidate();
      setPendingIds((prev) => { const next = new Set(prev); next.delete(variables.id); return next; });
    },
    onError: (err, variables) => {
      toast.error(`処理に失敗しました: ${err.message}`);
      setPendingIds((prev) => { const next = new Set(prev); next.delete(variables.id); return next; });
    },
  });

  const statusBadge = (status: string) => {
    if (status === "pending") return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">承認待ち</Badge>;
    if (status === "approved") return <Badge className="bg-green-100 text-green-800 border-green-300">承認済み</Badge>;
    if (status === "rejected") return <Badge className="bg-red-100 text-red-800 border-red-300">却下</Badge>;
    return <Badge variant="outline">{status}</Badge>;
  };
  const toJST = (ms: number) =>
    new Date(ms).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

  // 一括承認処理
  const handleBulkApprove = async () => {
    if (approvals.length === 0) return;
    setIsBulkApproving(true);
    try {
      for (const a of approvals) {
        await approveMut.mutateAsync({
          id: a.id,
          status: "approved",
        });
      }
      toast.success(`${approvals.length}件の残業申請を一括承認しました`);
    } catch (e) {
      toast.error("一括承認中にエラーが発生しました");
    } finally {
      setIsBulkApproving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg font-bold">残業申請 承認管理</h2>
          <p className="text-sm text-muted-foreground">
            職員からの残業申請を確認・承認します。承認者名は自動的に記録されます。
          </p>
        </div>
        {filterStatus === "pending" && approvals.length > 0 && (
          <Button
            onClick={handleBulkApprove}
            disabled={isBulkApproving}
            className="bg-green-600 hover:bg-green-700 text-white gap-1.5"
          >
            <ThumbsUp className="w-4 h-4" />
            {isBulkApproving ? "処理中..." : `一括承認（${approvals.length}件）`}
          </Button>
        )}
      </div>

      {/* フィルターバー */}
      <div className="flex flex-wrap gap-2 items-end p-3 bg-muted/40 rounded-lg">
        {/* 月フィルター */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">対象月</label>
          <input
            type="month"
            value={filterYearMonth}
            onChange={(e) => setFilterYearMonth(e.target.value)}
            className="border rounded px-2 py-1.5 text-sm bg-background"
          />
        </div>
        {/* チームフィルター */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">チーム</label>
          <select
            value={filterTeamOT}
            onChange={(e) => setFilterTeamOT(e.target.value)}
            className="border rounded px-2 py-1.5 text-sm bg-background"
          >
            {OVERTIME_TEAMS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        {/* ステータスフィルター */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">ステータス</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="border rounded px-2 py-1.5 text-sm bg-background"
          >
            <option value="pending">承認待ち</option>
            <option value="approved">承認済み</option>
            <option value="rejected">却下</option>
            <option value="all">全て</option>
          </select>
        </div>
        <div className="text-xs text-muted-foreground self-end pb-1.5">
          {isLoading ? "読み込み中..." : `${approvals.length}件`}
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">読み込み中...</p>
      ) : approvals.length === 0 ? (
        <p className="text-sm text-muted-foreground">該当する残業申請はありません。</p>
      ) : (
        <div className="space-y-3">
          {approvals.map((a) => (
            <Card key={a.id} className={a.status === "pending" ? "border-yellow-300" : ""}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{a.applicantName}</span>
                      {statusBadge(a.status)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">申請日: {a.applicationDate}</p>
                    <p className="text-sm mt-1">
                      申請時間: {toJST(a.requestedStartAt)} ～ {toJST(a.requestedEndAt)}
                    </p>
                    {a.requestedReason && (
                      <p className="text-sm text-muted-foreground">理由: {a.requestedReason}</p>
                    )}
                    {a.status !== "pending" && (
                      <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
                        <p>承認者: <span className="font-medium text-foreground">{a.approverName}</span></p>
                        {a.approvedAt && <p>承認日時: {toJST(a.approvedAt)}</p>}
                        {a.adjustedStartAt && a.adjustedEndAt && (
                          <p>調整後時間: {toJST(a.adjustedStartAt)} ～ {toJST(a.adjustedEndAt)}</p>
                        )}
                        {a.approverComment && <p>コメント: {a.approverComment}</p>}
                      </div>
                    )}
                  </div>
                </div>

                {/* 承認待ちの場合のみ承認フォームを表示 */}
                {a.status === "pending" && (
                  <div className="border-t pt-3 space-y-3">
                    {/* 申請内容の確認 */}
                    <div className="bg-blue-50 rounded-lg px-3 py-2 text-xs text-blue-700 space-y-1">
                      <p className="font-medium">申請内容：{toJST(a.requestedStartAt)} 〜 {toJST(a.requestedEndAt)}</p>
                      <p className="text-blue-600">→ 承認する場合は「承認」ボタンを押してください。時間を修正する場合は下の入力欄に正しい時間を入力してから承認してください。</p>
                    </div>
                    {/* 承認時間の修正（任意） */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">承認残業時間の修正（申請通り承認する場合は空白のままでOK）</p>
                      <div className="flex gap-2 flex-wrap items-center">
                        <div className="flex flex-col gap-0.5">
                          <label className="text-xs text-muted-foreground">開始時刻</label>
                          <input
                            type="time"
                            value={adjustStart[a.id] ?? ""}
                            onChange={(e) => setAdjustStart((prev) => ({ ...prev, [a.id]: e.target.value }))}
                            className="border rounded px-2 py-1 text-sm w-28"
                          />
                        </div>
                        <span className="mt-4">〜</span>
                        <div className="flex flex-col gap-0.5">
                          <label className="text-xs text-muted-foreground">終了時刻</label>
                          <input
                            type="time"
                            value={adjustEnd[a.id] ?? ""}
                            onChange={(e) => setAdjustEnd((prev) => ({ ...prev, [a.id]: e.target.value }))}
                            className="border rounded px-2 py-1 text-sm w-28"
                          />
                        </div>
                      </div>
                    </div>
                    <Input
                      placeholder="コメント（任意）"
                      value={commentInputs[a.id] ?? ""}
                      onChange={(e) => setCommentInputs((prev) => ({ ...prev, [a.id]: e.target.value }))}
                      className="text-sm"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={pendingIds.has(a.id)}
                        onClick={() => {
                          // 時刻入力がある場合は申請日をベースにUTCタイムスタンプに変換
                          const toMs = (timeStr: string | undefined, dateStr: string) => {
                            if (!timeStr) return undefined;
                            const [h, m] = timeStr.split(":").map(Number);
                            const d = new Date(`${dateStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+09:00`);
                            return d.getTime();
                          };
                          setPendingIds((prev) => new Set(prev).add(a.id));
                          approveMut.mutate({
                            id: a.id,
                            status: "approved",
                            adjustedStartAt: toMs(adjustStart[a.id], a.applicationDate),
                            adjustedEndAt: toMs(adjustEnd[a.id], a.applicationDate),
                            approverComment: commentInputs[a.id] || undefined,
                          });
                        }}
                      >
                        {pendingIds.has(a.id) ? "処理中..." : "承認"}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={pendingIds.has(a.id)}
                        onClick={() => {
                          setPendingIds((prev) => new Set(prev).add(a.id));
                          approveMut.mutate({
                            id: a.id,
                            status: "rejected",
                            approverComment: commentInputs[a.id] || undefined,
                          });
                        }}
                      >
                        {pendingIds.has(a.id) ? "処理中..." : "却下"}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================
// 月次署名確認パネル（管理者用）
// ============================
function MonthlySignaturesPanel() {
  const utils = trpc.useUtils();
  const now = new Date();
  const [filterYear, setFilterYear] = useState(now.getFullYear());
  const [filterMonth, setFilterMonth] = useState(now.getMonth() + 1);

  const { data, isLoading } = trpc.monthlySignature.adminListWithUnsigned.useQuery(
    { targetYear: filterYear, targetMonth: filterMonth },
    { enabled: true }
  );
  const signatures = data?.signatures ?? [];
  const unsignedStaff = data?.unsignedStaff ?? [];

  const confirmMut = trpc.monthlySignature.adminConfirm.useMutation({
    onSuccess: () => utils.monthlySignature.adminListWithUnsigned.invalidate(),
  });

  const yearOptions = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">月次残業確認 署名管理</h2>
      <p className="text-sm text-muted-foreground">
        職員が月次残業内容を確認・署名した記録を確認します。管理者確認を行うと職員側に通知されます。
      </p>

      {/* 年月フィルター */}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={filterYear}
          onChange={(e) => setFilterYear(Number(e.target.value))}
          className="border rounded px-2 py-1 text-sm"
        >
          {yearOptions.map((y) => <option key={y} value={y}>{y}年</option>)}
        </select>
        <select
          value={filterMonth}
          onChange={(e) => setFilterMonth(Number(e.target.value))}
          className="border rounded px-2 py-1 text-sm"
        >
          {monthOptions.map((m) => <option key={m} value={m}>{m}月</option>)}
        </select>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">読み込み中...</p>
      ) : (
        <div className="space-y-6">
          {/* 未署名スタッフ一覧 */}
          <div>
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-600 text-xs font-bold">{unsignedStaff.length}</span>
              未署名スタッフ
            </h3>
            {unsignedStaff.length === 0 ? (
              <p className="text-sm text-green-600 font-medium">✓ {filterYear}年{filterMonth}月は全員署名済みです</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {unsignedStaff.map((s: { id: number; name: string; team: string }) => (
                  <span key={s.id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                    {s.name}
                    <span className="text-red-400">({s.team})</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 署名済みスタッフ一覧 */}
          <div>
            <h3 className="text-sm font-semibold mb-2">署名済みスタッフ</h3>
            {signatures.length === 0 ? (
              <p className="text-sm text-muted-foreground">{filterYear}年{filterMonth}月の署名はまだありません。</p>
            ) : (
              <div className="space-y-3">
                {signatures.map((sig: any) => (
                  <Card key={sig.id} className="shadow-sm">
                    <CardContent className="pt-4 pb-3 px-4">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="space-y-1">
                          <div className="font-semibold text-sm">{sig.userName}</div>
                          <div className="text-xs text-muted-foreground">
                            署名日時：{new Date(sig.signedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
                          </div>
                          {sig.comment && (
                            <div className="text-xs text-blue-600">コメント：{sig.comment}</div>
                          )}
                          {sig.adminConfirmed ? (
                            <div className="text-xs text-green-600 font-medium">
                              ✓ 管理者確認済み（{sig.adminConfirmerName}）
                              {sig.adminConfirmedAt && (
                                <span className="ml-1 text-gray-400">
                                  {new Date(sig.adminConfirmedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="text-xs text-amber-600">管理者確認待ち</div>
                          )}
                        </div>
                        {!sig.adminConfirmed && (
                          <Button
                            size="sm"
                            disabled={confirmMut.isPending}
                            onClick={() => confirmMut.mutate({ id: sig.id })}
                          >
                            確認済みにする
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
