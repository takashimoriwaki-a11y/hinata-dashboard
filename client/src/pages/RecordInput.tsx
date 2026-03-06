/**
 * RecordInput - 訪問記録入力ページ
 * - チーム選択 → 利用者絞り込み
 * - 名前検索・音声入力で利用者を探せる
 * - 次回訪問日時（カレンダー選択）
 * - 伝達先（本人/家族/その他）・伝達方法（口頭/カレンダー記入/付箋/電話/その他）
 * - ①カードの下にスプレッドシート転送ボタン
 * - ②病状の経過
 */
import { useState, useRef, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  ClipboardEdit, Send, Search, Calendar,
  User, ChevronDown, Loader2, FileSpreadsheet, CheckCircle2, ExternalLink
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { VoiceMicButton } from "@/components/VoiceMicButton";
import { useVoiceInput } from "@/hooks/useVoiceInput";

const TEAMS = ["身体", "天理", "郡山北部", "郡山南部"] as const;
type Team = typeof TEAMS[number];

const NOTIFY_TO_OPTIONS = ["本人", "家族", "その他"] as const;
const NOTIFY_METHOD_OPTIONS = ["口頭", "カレンダー記入", "付箋", "電話", "その他"] as const;

export default function RecordInput() {
  // ① 利用者・次回訪問日時
  const [team, setTeam] = useState<Team | "">("");
  const [patientId, setPatientId] = useState<number | null>(null);
  const [patientName, setPatientName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showPatientList, setShowPatientList] = useState(false);
  const [nextVisitDate, setNextVisitDate] = useState("");
  const [nextVisitTime, setNextVisitTime] = useState("");
  const [notifiedTo, setNotifiedTo] = useState<typeof NOTIFY_TO_OPTIONS[number] | "">("");
  const [notifiedToOther, setNotifiedToOther] = useState("");
  const [notifyMethod, setNotifyMethod] = useState<typeof NOTIFY_METHOD_OPTIONS[number] | "">("");
  const [notifyMethodOther, setNotifyMethodOther] = useState("");

  // 時間セレクト用
  const [timeDropdownOpen, setTimeDropdownOpen] = useState(false);
  const timeListRef = useRef<HTMLDivElement>(null);
  const timeSlots = useMemo(() => Array.from({ length: 24 * 6 }, (_, i) => {
    const h = Math.floor(i / 6);
    const m = (i % 6) * 10;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }), []);

  // ドロップダウンを開いたとき現在時刻に近い選択肢へスクロール
  useEffect(() => {
    if (!timeDropdownOpen || !timeListRef.current) return;
    const now = new Date();
    const roundedMin = Math.round(now.getMinutes() / 10) * 10;
    const h = roundedMin === 60 ? (now.getHours() + 1) % 24 : now.getHours();
    const m = roundedMin === 60 ? 0 : roundedMin;
    const target = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    const el = timeListRef.current.querySelector(`[data-val="${target}"]`) as HTMLElement | null;
    if (el) el.scrollIntoView({ block: "center" });
  }, [timeDropdownOpen]);

  // ② 病状の経過
  const [clinicalNotes, setClinicalNotes] = useState("");

  // 保存済み記録ID（スプレッドシート転送用）
  const [savedRecordId, setSavedRecordId] = useState<number | null>(null);
  const [exported, setExported] = useState(false);

  // 転送先スプレッドシートURL（編集ボタン用）
  const VISIT_RECORD_SHEET_URL = "https://docs.google.com/spreadsheets/d/1BGMdVGTQEkcVXioa5leetH_kPr859nNHMnhkwEMlWqA/edit";

  // 音声入力（useVoiceInputフックで管理）
  // 利用者名検索用
  const voicePatient = { onResult: (text: string) => { setSearchQuery(text.trim()); setShowPatientList(true); } };
  // 病状の経過用（interimTextを直接取得するためuseVoiceInputを直接使用）
  const notesVoice = useVoiceInput({
    onResult: (text: string) => { setClinicalNotes(prev => prev + (prev ? "\n" : "") + text.trim()); },
  });

  // ===== 下書き自動保存 =====
  const DRAFT_KEY = "hinata_record_draft";

  // ページ読み込み時に下書きを復元
  const [hasDraft, setHasDraft] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        team?: string; patientId?: number | null; patientName?: string;
        searchQuery?: string; nextVisitDate?: string; nextVisitTime?: string;
        notifiedTo?: string; notifiedToOther?: string;
        notifyMethod?: string; notifyMethodOther?: string; clinicalNotes?: string;
      };
      if (draft.team) setTeam(draft.team as Team);
      if (draft.patientId !== undefined) setPatientId(draft.patientId);
      if (draft.patientName) setPatientName(draft.patientName);
      if (draft.searchQuery) setSearchQuery(draft.searchQuery);
      if (draft.nextVisitDate) setNextVisitDate(draft.nextVisitDate);
      if (draft.nextVisitTime) setNextVisitTime(draft.nextVisitTime);
      if (draft.notifiedTo) setNotifiedTo(draft.notifiedTo as typeof notifiedTo);
      if (draft.notifiedToOther) setNotifiedToOther(draft.notifiedToOther);
      if (draft.notifyMethod) setNotifyMethod(draft.notifyMethod as typeof notifyMethod);
      if (draft.notifyMethodOther) setNotifyMethodOther(draft.notifyMethodOther);
      if (draft.clinicalNotes) setClinicalNotes(draft.clinicalNotes);
      setHasDraft(true);
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 入力内容が変わるたびにdebounce 1秒でlocalStorageに保存
  useEffect(() => {
    const timer = setTimeout(() => {
      const hasContent = team || patientName || nextVisitDate || nextVisitTime ||
        notifiedTo || notifyMethod || clinicalNotes;
      if (!hasContent) return;
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        team, patientId, patientName, searchQuery,
        nextVisitDate, nextVisitTime,
        notifiedTo, notifiedToOther, notifyMethod, notifyMethodOther,
        clinicalNotes,
      }));
    }, 1000);
    return () => clearTimeout(timer);
  }, [team, patientId, patientName, searchQuery, nextVisitDate, nextVisitTime,
      notifiedTo, notifiedToOther, notifyMethod, notifyMethodOther, clinicalNotes]);

  // tRPC
  const utils = trpc.useUtils();
  const { data: patients = [], isLoading: patientsLoading } = trpc.patients.search.useQuery(
    { query: searchQuery, team: team as Team || undefined },
    { enabled: showPatientList || searchQuery.length > 0 }
  );

  const createRecord = trpc.visitRecords.create.useMutation({
    onSuccess: (data) => {
      setSavedRecordId(data.id);
      setExported(false);
      toast.success("記録を保存しました。スプレッドシートへ転送できます。");
    },
    onError: (err) => toast.error(`保存エラー: ${err.message}`),
  });

  const exportToSheet = trpc.visitRecords.exportToSheet.useMutation({
    onSuccess: () => {
      setExported(true);
      toast.success("スプレッドシートへ転送しました！");
      utils.visitRecords.getMine.invalidate();
      // 転送後に①の入力内容をリセット
      setPatientId(null);
      setPatientName("");
      setSearchQuery("");
      setNextVisitDate("");
      setNextVisitTime("");
      setNotifiedTo("");
      setNotifiedToOther("");
      setNotifyMethod("");
      setNotifyMethodOther("");
    },
    onError: (err) => toast.error(`転送エラー: ${err.message}`),
  });



  const handleSelectPatient = (id: number, name: string) => {
    setPatientId(id);
    setPatientName(name);
    setSearchQuery(name);
    setShowPatientList(false);
  };

  const handleSave = () => {
    if (!team) {
      toast.error("チームを選択してください");
      return;
    }

    let nextVisitAt: Date | undefined;
    if (nextVisitDate) {
      const dt = nextVisitTime ? `${nextVisitDate}T${nextVisitTime}` : `${nextVisitDate}T00:00`;
      nextVisitAt = new Date(dt);
    }

    createRecord.mutate({
      patientId: patientId ?? undefined,
      patientName: patientName || "未選択",
      team: team as Team,
      clinicalNotes: clinicalNotes || undefined,
      nextVisitAt,
      notifiedTo: notifiedTo as "本人" | "家族" | "その他" | undefined || undefined,
      notifiedToOther: notifiedToOther || undefined,
      notifyMethod: notifyMethod as "口頭" | "カレンダー記入" | "付箋" | "電話" | "その他" | undefined || undefined,
      notifyMethodOther: notifyMethodOther || undefined,
    });
  };

  const handleExport = () => {
    if (!savedRecordId) return;
    exportToSheet.mutate({ id: savedRecordId });
  };

  const GEMS_URL = "https://gemini.google.com/gem/1qqbO6BLZLj9IXwsOjYuePdyQn0QGkifV?usp=sharing";

  const handleCopyAndOpenGem = async () => {
    // 病状の経過テキストを構築してコピー
    const lines: string[] = [];
    if (patientName) lines.push(`利用者：${patientName}`);
    if (team) lines.push(`チーム：${team}`);
    if (clinicalNotes) lines.push(`
【病状の経過】
${clinicalNotes}`);
    const textToCopy = lines.join("\n");

    if (!textToCopy.trim()) {
      toast.error("コピーする内容がありません。病状の経過を入力してください");
      return;
    }

    try {
      await navigator.clipboard.writeText(textToCopy);
      toast.success("記録をコピーしました。Gemで貼り付けてください");
    } catch {
      toast.error("クリップボードへのコピーに失敗しました");
    }
    window.open(GEMS_URL, "_blank", "noopener,noreferrer");
    // Gem送信後に①②の全入力内容をリセット
    handleReset();
  };

  const handleReset = () => {
    setPatientId(null);
    setPatientName("");
    setSearchQuery("");
    setNextVisitDate("");
    setNextVisitTime("");
    setNotifiedTo("");
    setNotifiedToOther("");
    setNotifyMethod("");
    setNotifyMethodOther("");
    setClinicalNotes("");
    setSavedRecordId(null);
    setExported(false);
    // 下書きを削除
    localStorage.removeItem(DRAFT_KEY);
    setHasDraft(false);
  };

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4 pb-20">
      <div className="flex items-center gap-2 mb-2">
        <ClipboardEdit className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-bold">訪問記録入力</h1>
      </div>

      {/* 下書き復元バナー */}
      {hasDraft && (
        <div className="flex items-center justify-between bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-700 rounded-lg px-3 py-2">
          <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">
            ✏️ 前回の入力内容を復元しました
          </p>
          <button
            onClick={() => {
              localStorage.removeItem(DRAFT_KEY);
              setHasDraft(false);
              handleReset();
            }}
            className="text-xs text-amber-600 dark:text-amber-400 hover:underline ml-2"
          >
            消去
          </button>
        </div>
      )}

      {/* ① 利用者・次回訪問日時 */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">① 利用者・次回訪問日時</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* チーム選択 */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">チーム</label>
            <Select value={team} onValueChange={(v) => { setTeam(v as Team); setPatientId(null); setPatientName(""); setSearchQuery(""); }}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="チームを選択（全員表示）" />
              </SelectTrigger>
              <SelectContent>
                {TEAMS.map((t) => (
                  <SelectItem key={t} value={t}>{t}チーム</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 利用者選択・検索 */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">利用者を選択または検索 *</label>
            {patientId ? (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-sm px-3 py-1">
                  <User className="w-3 h-3 mr-1" />
                  {patientName}
                </Badge>
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => { setPatientId(null); setPatientName(""); setSearchQuery(""); setShowPatientList(false); }}>
                  変更
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                    <Input
                      className="pl-8 text-sm"
                      placeholder="名前で検索..."
                      value={searchQuery}
                      onChange={(e) => { setSearchQuery(e.target.value); setShowPatientList(true); }}
                      onFocus={() => setShowPatientList(true)}
                    />
                  </div>
                  <VoiceMicButton
                    onResult={voicePatient.onResult}
                    size="sm"
                    previewMode="tooltip"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowPatientList(!showPatientList)}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </div>
                {showPatientList && (
                  <div className="border rounded-md bg-background shadow-sm max-h-48 overflow-y-auto">
                    {patientsLoading ? (
                      <div className="flex items-center justify-center p-4">
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        <span className="text-sm text-muted-foreground">検索中...</span>
                      </div>
                    ) : patients.length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground text-center">
                        {searchQuery ? "該当する利用者が見つかりません" : "利用者が登録されていません"}
                        <p className="text-xs mt-1">管理画面から利用者を登録してください</p>
                      </div>
                    ) : (
                      patients.map((p) => (
                        <button
                          key={p.id}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between border-b last:border-b-0"
                          onClick={() => handleSelectPatient(p.id, p.name)}
                        >
                          <span>{p.name}</span>
                          <span className="text-xs text-muted-foreground">{p.team}チーム</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 次回訪問日時 */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              <Calendar className="w-3 h-3 inline mr-1" />
              次回訪問日時
            </label>
            <div className="flex gap-2">
              <Input
                type="date"
                className="text-sm flex-1"
                value={nextVisitDate}
                onChange={(e) => setNextVisitDate(e.target.value)}
              />
              <div className="relative w-28">
                <button
                  type="button"
                  className="w-full flex items-center justify-between border rounded-md px-3 py-2 text-sm bg-background hover:bg-muted transition-colors"
                  onClick={() => setTimeDropdownOpen((o) => !o)}
                >
                  <span className={nextVisitTime ? "" : "text-muted-foreground"}>{nextVisitTime || "時刻"}</span>
                  <ChevronDown className="w-3 h-3 ml-1 text-muted-foreground" />
                </button>
                {timeDropdownOpen && (
                  <div
                    ref={timeListRef}
                    className="absolute z-50 top-full mt-1 w-full border rounded-md bg-background shadow-md max-h-60 overflow-y-auto"
                  >
                    {timeSlots.map((val) => (
                      <button
                        key={val}
                        data-val={val}
                        type="button"
                        className={`w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors ${
                          nextVisitTime === val ? "bg-primary text-primary-foreground hover:bg-primary" : ""
                        }`}
                        onClick={() => { setNextVisitTime(val); setTimeDropdownOpen(false); }}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 伝達先・伝達方法（次回訪問日時が入力されたときのみ表示） */}
          {nextVisitDate && (
            <div className="space-y-3 border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground">次回訪問日時の伝達</p>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">伝達先</label>
                <div className="flex gap-2 flex-wrap">
                  {NOTIFY_TO_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${notifiedTo === opt ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
                      onClick={() => setNotifiedTo(opt)}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                {notifiedTo === "その他" && (
                  <Input
                    className="mt-2 text-sm"
                    placeholder="伝達先を記入..."
                    value={notifiedToOther}
                    onChange={(e) => setNotifiedToOther(e.target.value)}
                  />
                )}
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">伝達方法</label>
                <div className="flex gap-2 flex-wrap">
                  {NOTIFY_METHOD_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${notifyMethod === opt ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
                      onClick={() => setNotifyMethod(opt)}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                {notifyMethod === "その他" && (
                  <Input
                    className="mt-2 text-sm"
                    placeholder="伝達方法を記入..."
                    value={notifyMethodOther}
                    onChange={(e) => setNotifyMethodOther(e.target.value)}
                  />
                )}
              </div>
            </div>
          )}
          {/* リセットボタン（①カード内の末尾） */}
          <div className="flex justify-end pt-1">
            <Button variant="ghost" size="sm" onClick={handleReset} className="text-xs text-muted-foreground hover:text-foreground">
              リセット
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* スプレッドシート転送ボタン（①カードの下） */}
      {savedRecordId ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Button
              className="flex-1"
              variant={exported ? "outline" : "default"}
              onClick={handleExport}
              disabled={exportToSheet.isPending || exported}
            >
              {exportToSheet.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />転送中...</>
              ) : exported ? (
                <><CheckCircle2 className="w-4 h-4 mr-2 text-green-500" />転送済み</>
              ) : (
                <><FileSpreadsheet className="w-4 h-4 mr-2" />スプレッドシートへ転送</>
              )}
            </Button>
          </div>
          {exported && (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs border-emerald-400 text-emerald-700 hover:bg-emerald-50"
              onClick={() => window.open(VISIT_RECORD_SHEET_URL, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink className="w-3 h-3 mr-1" />
              スプレッドシートを開いて確認・修正する
            </Button>
          )}
        </div>
      ) : (
        <Button
          className="w-full bg-orange-500 hover:bg-orange-600 text-white border-orange-500"
          onClick={handleSave}
          disabled={createRecord.isPending || !team}
        >
          {createRecord.isPending ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />保存中...</>
          ) : (
            <><FileSpreadsheet className="w-4 h-4 mr-2" />次回訪問日時をスプレッドシートへ転送</>
          )}
        </Button>
      )}

      {/* ② 病状の経過 */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">② 病状の経過</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-muted-foreground">本日観察・収集した情報</label>
              <button
                type="button"
                onPointerDown={(e) => { e.preventDefault(); notesVoice.toggleVoice(); }}
                className={cn(
                  "relative inline-flex items-center justify-center flex-shrink-0 h-8 w-8 rounded-lg",
                  "border transition-all duration-200 select-none touch-manipulation",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  notesVoice.isRecording
                    ? (notesVoice.silenceCountdown !== null && notesVoice.silenceCountdown <= 5
                        ? "bg-orange-500 border-orange-400 text-white shadow-md shadow-orange-500/40"
                        : "bg-red-500 border-red-400 text-white shadow-md shadow-red-500/40")
                    : "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20 active:scale-95"
                )}
                aria-label={notesVoice.isRecording ? "録音停止" : "音声入力開始"}
                title={notesVoice.isRecording && notesVoice.silenceCountdown !== null && notesVoice.silenceCountdown <= 5 ? `あと${notesVoice.silenceCountdown}秒で自動停止` : undefined}
              >
                {notesVoice.isRecording && (
                  <span className="absolute inset-0 rounded-[inherit] overflow-hidden pointer-events-none">
                    <span className={cn("absolute inset-0 animate-ping rounded-[inherit] opacity-25", notesVoice.silenceCountdown !== null && notesVoice.silenceCountdown <= 5 ? "bg-orange-400" : "bg-red-400")} />
                  </span>
                )}
                {notesVoice.isRecording && notesVoice.silenceCountdown !== null && notesVoice.silenceCountdown <= 5 ? (
                  <span className="text-[9px] font-bold leading-none">{notesVoice.silenceCountdown}</span>
                ) : notesVoice.isRecording ? (
                  <span className="flex items-end justify-center gap-px h-3">
                    {[0,1,2,3].map((i) => (
                      <span key={i} className="w-0.5 bg-white rounded-full" style={{ height: "60%", animation: "voiceBar 0.5s ease-in-out infinite alternate", animationDelay: `${i * 0.12}s` }} />
                    ))}
                  </span>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                )}
              </button>
            </div>
            <div className="relative">
              <Textarea
                placeholder="本日訪問で観察した症状・状態・利用者の言葉・環境の変化などをメモしてください..."
                value={clinicalNotes}
                onChange={(e) => setClinicalNotes(e.target.value)}
                className="min-h-[120px] text-sm"
              />
              {/* 音声認識中の暫定テキストプレビュー */}
              {notesVoice.isRecording && (
                <div className={cn(
                  "mt-1.5 px-2 py-1.5 rounded-md border min-h-[32px]",
                  notesVoice.silenceCountdown !== null && notesVoice.silenceCountdown <= 5
                    ? "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800"
                    : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800"
                )}>
                  {notesVoice.interimText ? (
                    <p className="text-xs text-red-600 dark:text-red-400 italic leading-relaxed">
                      🎤 {notesVoice.interimText}
                    </p>
                  ) : notesVoice.silenceCountdown !== null && notesVoice.silenceCountdown <= 5 ? (
                    <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                      あと{notesVoice.silenceCountdown}秒で自動停止します
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">話してください...</p>
                  )}
                </div>
              )}
            </div>
          </div>
          <Button
            className="w-full"
            onClick={handleCopyAndOpenGem}
            disabled={!clinicalNotes.trim() && !patientName}
          >
            <><Send className="w-4 h-4 mr-2" />記録をコピーしてGemへ</>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
