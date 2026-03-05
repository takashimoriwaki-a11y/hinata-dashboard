/**
 * RecordInput - 訪問記録入力ページ
 * - チーム選択 → 利用者絞り込み
 * - 名前検索・音声入力で利用者を探せる
 * - 次回訪問日時（カレンダー選択）
 * - 伝達先（本人/家族/その他）・伝達方法（口頭/カレンダー記入/付箋/電話/その他）
 * - ①カードの下にスプレッドシート転送ボタン
 * - ②病状の経過
 */
import { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  ClipboardEdit, Mic, MicOff, Send, Search, Calendar,
  User, ChevronDown, Loader2, FileSpreadsheet, CheckCircle2, ExternalLink
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

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

  // ② 病状の経過
  const [clinicalNotes, setClinicalNotes] = useState("");

  // 保存済み記録ID（スプレッドシート転送用）
  const [savedRecordId, setSavedRecordId] = useState<number | null>(null);
  const [exported, setExported] = useState(false);

  // 転送先スプレッドシートURL（編集ボタン用）
  const VISIT_RECORD_SHEET_URL = "https://docs.google.com/spreadsheets/d/1BGMdVGTQEkcVXioa5leetH_kPr859nNHMnhkwEMlWqA/edit";

  // 音声入力
  const [isRecordingPatient, setIsRecordingPatient] = useState(false);
  const [isRecordingNotes, setIsRecordingNotes] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

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

  // 音声入力
  const startVoiceInput = useCallback(async (target: "patient" | "notes") => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const formData = new FormData();
        formData.append("audio", blob, "recording.webm");
        formData.append("language", "ja");
        try {
          const res = await fetch("/api/transcribe", { method: "POST", body: formData, credentials: "include" });
          if (!res.ok) throw new Error("文字起こし失敗");
          const data = await res.json() as { text: string };
          if (target === "patient") {
            setSearchQuery(data.text.trim());
            setShowPatientList(true);
          } else {
            setClinicalNotes(prev => prev + (prev ? "\n" : "") + data.text.trim());
          }
        } catch {
          toast.error("音声の文字起こしに失敗しました");
        }
        if (target === "patient") setIsRecordingPatient(false);
        else setIsRecordingNotes(false);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      if (target === "patient") setIsRecordingPatient(true);
      else setIsRecordingNotes(true);
    } catch {
      toast.error("マイクへのアクセスが許可されていません");
    }
  }, []);

  const stopVoiceInput = useCallback(() => {
    mediaRecorderRef.current?.stop();
  }, []);

  const handleSelectPatient = (id: number, name: string) => {
    setPatientId(id);
    setPatientName(name);
    setSearchQuery(name);
    setShowPatientList(false);
  };

  const handleSave = () => {
    if (!patientId || !patientName) {
      toast.error("利用者を選択してください");
      return;
    }
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
      patientId,
      patientName,
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
    // Gem送信後に②の入力内容をリセット
    setClinicalNotes("");
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
  };

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4 pb-20">
      <div className="flex items-center gap-2 mb-2">
        <ClipboardEdit className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-bold">訪問記録入力</h1>
      </div>

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
                  <Button
                    variant="outline"
                    size="sm"
                    className={isRecordingPatient ? "bg-red-50 border-red-300 text-red-600" : ""}
                    onClick={() => isRecordingPatient ? stopVoiceInput() : startVoiceInput("patient")}
                  >
                    {isRecordingPatient ? <><MicOff className="w-4 h-4 mr-1" />停止</> : <><Mic className="w-4 h-4 mr-1" />音声</>}
                  </Button>
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
              <Input
                type="time"
                className="text-sm w-28"
                value={nextVisitTime}
                onChange={(e) => setNextVisitTime(e.target.value)}
              />
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
            <Button variant="ghost" size="sm" onClick={handleReset} className="text-xs">
              新規入力
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
          disabled={createRecord.isPending || !patientId}
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
              <Button
                variant="outline"
                size="sm"
                className={`h-7 text-xs ${isRecordingNotes ? "bg-red-50 border-red-300 text-red-600" : ""}`}
                onClick={() => isRecordingNotes ? stopVoiceInput() : startVoiceInput("notes")}
              >
                {isRecordingNotes ? (
                  <><MicOff className="w-3 h-3 mr-1" />停止</>
                ) : (
                  <><Mic className="w-3 h-3 mr-1" />音声入力</>
                )}
              </Button>
            </div>
            <Textarea
              placeholder="本日の訪問で観察した症状・状態・利用者の言葉・環境の変化などをメモしてください..."
              value={clinicalNotes}
              onChange={(e) => setClinicalNotes(e.target.value)}
              className="min-h-[120px] text-sm"
            />
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
