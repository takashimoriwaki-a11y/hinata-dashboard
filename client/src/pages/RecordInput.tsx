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
import { useAuth } from "@/_core/hooks/useAuth";
import { VoiceMicButton } from "@/components/VoiceMicButton";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { VoiceHelpDialog } from "@/components/VoiceHelpDialog";

const TEAMS = ["身体", "天理", "郡山北部", "郡山南部"] as const;
type Team = typeof TEAMS[number];

const NOTIFY_TO_OPTIONS = ["本人", "家族", "その他"] as const;
const NOTIFY_METHOD_OPTIONS = ["口頭", "カレンダー記入", "付箋", "電話", "その他"] as const;

export default function RecordInput() {
  const { user } = useAuth();

  // ① 利用者・次回訪問日時
  const RECORD_TEAM_KEY = "hinata_record_team";
  const [team, setTeamRaw] = useState<Team | "">(() => {
    try {
      const saved = localStorage.getItem("hinata_record_team");
      const validTeams: Team[] = ["身体", "天理", "郡山北部", "郡山南部"];
      if (saved && validTeams.includes(saved as Team)) return saved as Team;
    } catch {}
    return "";
  });

  const setTeam = (value: Team | "") => {
    setTeamRaw(value);
    try {
      if (value === "") localStorage.removeItem("hinata_record_team");
      else localStorage.setItem("hinata_record_team", value);
    } catch {}
  };
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

  // ログインユーザーの所属チームを初期値に自動設定（localStorageに保存済みの場合はそちらを優先）
  useEffect(() => {
    if (!user?.team) return;
    const validTeams: Team[] = ["身体", "天理", "郡山北部", "郡山南部"];
    if (validTeams.includes(user.team as Team)) {
      setTeamRaw(prev => {
        if (prev !== "") return prev; // localStorage保存済みまたはドラフト復元済みの場合は維持
        const newVal = user.team as Team;
        try { localStorage.setItem(RECORD_TEAM_KEY, newVal); } catch {}
        return newVal;
      });
    }
  }, [user?.team]);

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
  const VISIT_RECORD_SHEET_URL = "https://docs.google.com/spreadsheets/d/1WOZQ5rI0Fu57nWaiGwComPS_DdEwPgNR6zeOmyrqKpo/edit"; // ひなた_次回訪問日時

  // 音声入力（useVoiceInputフックで管理）
  // 利用者名検索用
  const voicePatient = { onResult: (text: string) => { setSearchQuery(text.trim()); setShowPatientList(true); } };
  // 病状の経過用（interimTextを直接取得するためuseVoiceInputを直接使用）
  const notesVoice = useVoiceInput({
    onResult: (text: string) => { setClinicalNotes(prev => prev + (prev ? "\n" : "") + text.trim()); },
  });

  // 次回訪問日時・伝達先・伝達方法の音声入力用state
  const [visitVoiceText, setVisitVoiceText] = useState("");
  const [isParsingVisitVoice, setIsParsingVisitVoice] = useState(false);
  const [visitVoiceError, setVisitVoiceError] = useState<string | null>(null);

  // 音声転記確認パネル用state
  type VoicePreview = {
    patientName?: string;
    patientId?: number | null;
    visitDate?: string;
    visitTime?: string;
    notifiedTo?: string;
    notifiedToOther?: string;
    notifyMethod?: string;
    notifyMethodOther?: string;
  };
  const [voicePreview, setVoicePreview] = useState<VoicePreview | null>(null);
  const [editingPreview, setEditingPreview] = useState<VoicePreview | null>(null);

  // 確認パネルの「確定」ボタン処理
  const applyVoicePreview = (preview: VoicePreview) => {
    if (preview.patientId) {
      setPatientId(preview.patientId);
      setPatientName(preview.patientName ?? "");
      setSearchQuery(preview.patientName ?? "");
      setShowPatientList(false);
    } else if (preview.patientName) {
      setPatientName(preview.patientName);
      setSearchQuery(preview.patientName);
      setShowPatientList(true);
    }
    if (preview.visitDate) setNextVisitDate(preview.visitDate);
    if (preview.visitTime) setNextVisitTime(preview.visitTime);
    if (preview.notifiedTo && NOTIFY_TO_OPTIONS.includes(preview.notifiedTo as typeof NOTIFY_TO_OPTIONS[number])) {
      setNotifiedTo(preview.notifiedTo as typeof NOTIFY_TO_OPTIONS[number]);
    }
    if (preview.notifiedToOther) setNotifiedToOther(preview.notifiedToOther);
    if (preview.notifyMethod && NOTIFY_METHOD_OPTIONS.includes(preview.notifyMethod as typeof NOTIFY_METHOD_OPTIONS[number])) {
      setNotifyMethod(preview.notifyMethod as typeof NOTIFY_METHOD_OPTIONS[number]);
    }
    if (preview.notifyMethodOther) setNotifyMethodOther(preview.notifyMethodOther);
    setVoicePreview(null);
    setEditingPreview(null);
    // 転記されたフィールドを黄色フラッシュでハイライト
    setTimeout(() => {
      const flashTargets = [
        preview.patientName ? "record-patient-search" : null,
        preview.visitDate ? "record-next-visit-date" : null,
        preview.notifiedTo ? "record-notified-to" : null,
        preview.notifyMethod ? "record-notify-method" : null,
      ].filter(Boolean) as string[];
      flashTargets.forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
          el.classList.remove("field-flash");
          void el.offsetWidth;
          el.classList.add("field-flash");
          el.addEventListener("animationend", () => el.classList.remove("field-flash"), { once: true });
        }
      });
    }, 100);
  };

  // 個別項目の音声再入力用state
  const [reInputField, setReInputField] = useState<string | null>(null); // 現在再入力中の項目名
  const [isParsingReInput, setIsParsingReInput] = useState(false);
  // targetFieldはzodスキーマ外のためvariablesから取得できない → refで保持する
  const reInputTargetFieldRef = useRef<string | null>(null);

  // 個別項目の音声再入力用tRPCミューテーション
  const parseReInputMutation = trpc.visitRecords.parseVisitVoice.useMutation({
    onSuccess: (result) => {
      const f = result.fields;
      const field = reInputTargetFieldRef.current;

      // 確認パネルが表示されている場合はeditingPreviewを更新
      setEditingPreview((p) => {
        if (!p) return p;
        if (field === "patientName" && f.patientName) {
          const aiName = f.patientName;
          const src = allPatientsRef.current.length > 0 ? allPatientsRef.current : (patientsRef.current ?? []);
          const exact = src.find((pt) => pt.name === aiName);
          const matched = exact ?? src.filter(
            (pt) => pt.name.includes(aiName) || aiName.includes(pt.name.split('\u3000')[0].split(' ')[0])
          ).find(Boolean);
          return { ...p, patientName: matched ? matched.name : aiName, patientId: matched ? matched.id : null };
        }
        if (field === "visitDate" && f.visitDate) return { ...p, visitDate: f.visitDate };
        if (field === "visitTime" && f.visitTime) return { ...p, visitTime: f.visitTime };
        if (field === "visitDateTime") {
          return { ...p, ...(f.visitDate ? { visitDate: f.visitDate } : {}), ...(f.visitTime ? { visitTime: f.visitTime } : {}) };
        }
        if (field === "notifiedTo" && f.notifiedTo) return { ...p, notifiedTo: f.notifiedTo, ...(f.notifiedToOther ? { notifiedToOther: f.notifiedToOther } : {}) };
        if (field === "notifyMethod" && f.notifyMethod) return { ...p, notifyMethod: f.notifyMethod, ...(f.notifyMethodOther ? { notifyMethodOther: f.notifyMethodOther } : {}) };
        return p;
      });

      // 確認パネルが表示されていない場合（voicePreviewがnull）はメインフォームのstateを直接更新
      setVoicePreview((currentPreview) => {
        if (currentPreview !== null) return currentPreview; // 確認パネルあり → 上のsetEditingPreviewで対応済み
        // 確認パネルなし → メインフォームに直接反映
        if (field === "patientName" && f.patientName) {
          const aiName = f.patientName;
          const src = allPatientsRef.current.length > 0 ? allPatientsRef.current : (patientsRef.current ?? []);
          const exact = src.find((pt) => pt.name === aiName);
          const matched = exact ?? src.filter(
            (pt) => pt.name.includes(aiName) || aiName.includes(pt.name.split('\u3000')[0].split(' ')[0])
          ).find(Boolean);
          const resolvedName = matched ? matched.name : aiName;
          const resolvedId = matched ? matched.id : null;
          setPatientName(resolvedName);
          setSearchQuery(resolvedName);
          setPatientId(resolvedId);
          toast.success(`利用者「${resolvedName}」を転記しました`);
        }
        if (field === "visitDateTime") {
          if (f.visitDate) { setNextVisitDate(f.visitDate); }
          if (f.visitTime) { setNextVisitTime(f.visitTime); }
          toast.success("次回訪問日時を転記しました");
        }
        if (field === "notifiedTo" && f.notifiedTo) {
          setNotifiedTo(f.notifiedTo as typeof notifiedTo);
          if (f.notifiedToOther) setNotifiedToOther(f.notifiedToOther);
          toast.success("伝達先を転記しました");
        }
        if (field === "notifyMethod" && f.notifyMethod) {
          setNotifyMethod(f.notifyMethod as typeof notifyMethod);
          if (f.notifyMethodOther) setNotifyMethodOther(f.notifyMethodOther);
          toast.success("伝達方法を転記しました");
        }
        return currentPreview; // nullのまま返す（確認パネルは表示しない）
      });

      setIsParsingReInput(false);
      setReInputField(null);
    },
    onError: (err) => {
      setIsParsingReInput(false);
      setReInputField(null);
      toast.error(`再入力エラー: ${err.message}`);
    },
  });

  // 個別音声再入力用フック（利用者名）
  const reInputPatientVoice = useVoiceInput({
    onResult: (text) => {
      setIsParsingReInput(true);
      // 全利用者リストを渡す（検索結果ではなく全件）
      const src = allPatientsRef.current.length > 0 ? allPatientsRef.current : patientsRef.current;
      const namesWithKana = src.map((p) => ({ name: p.name, kana: p.nameKana ?? '' }));
      reInputTargetFieldRef.current = "patientName"; // refに保持
      parseReInputMutation.mutate({ text, patientNamesWithKana: namesWithKana });
    },
  });
  // 個別音声再入力用フック（次回訪問日時）
  const reInputDateTimeVoice = useVoiceInput({
    onResult: (text) => {
      setIsParsingReInput(true);
      reInputTargetFieldRef.current = "visitDateTime"; // refに保持
      parseReInputMutation.mutate({ text, patientNames: [] });
    },
  });
  // 個別音声再入力用フック（伝達先）
  const reInputNotifiedToVoice = useVoiceInput({
    onResult: (text) => {
      setIsParsingReInput(true);
      reInputTargetFieldRef.current = "notifiedTo"; // refに保持
      parseReInputMutation.mutate({ text, patientNames: [] });
    },
  });
  // 個別音声再入力用フック（伝達方法）
  const reInputNotifyMethodVoice = useVoiceInput({
    onResult: (text) => {
      setIsParsingReInput(true);
      reInputTargetFieldRef.current = "notifyMethod"; // refに保持
      parseReInputMutation.mutate({ text, patientNames: [] });
    },
  });

  // 次回訪問日時音声入力用tRPCミューテーション
  const parseVisitVoiceMutation = trpc.visitRecords.parseVisitVoice.useMutation({
    onSuccess: (result) => {
      const f = result.fields;
      // 確認パネル用のプレビューデータを構築
      // 全利用者リストを使ってマッチング（検索結果ではなく全件）
      const sourceList = allPatientsRef.current.length > 0 ? allPatientsRef.current : patientsRef.current;
      const matched = f.patientName
        ? (() => {
            const aiName = f.patientName;
            // 完全一致を優先
            const exact = sourceList.find((p) => p.name === aiName);
            if (exact) return exact;
            // 部分一致
            const partial = sourceList.filter(
              (p) => p.name.includes(aiName) || aiName.includes(p.name.split('\u3000')[0].split(' ')[0])
            );
            return partial.length === 1 ? partial[0] : undefined;
          })()
        : undefined;
      const preview: VoicePreview = {
        patientName: matched ? matched.name : (f.patientName ?? undefined),
        patientId: matched ? matched.id : null,
        visitDate: f.visitDate ?? undefined,
        visitTime: f.visitTime ?? undefined,
        notifiedTo: f.notifiedTo ?? undefined,
        notifiedToOther: f.notifiedToOther ?? undefined,
        notifyMethod: f.notifyMethod ?? undefined,
        notifyMethodOther: f.notifyMethodOther ?? undefined,
      };
      setVoicePreview(preview);
      setEditingPreview({ ...preview });
      setIsParsingVisitVoice(false);
    },
    onError: (err) => {
      setVisitVoiceError(err.message);
      setIsParsingVisitVoice(false);
    },
  });

  // 利用者リストをrefで保持（音声入力時に最新値を参照するため）
  const patientsRef = useRef<typeof patients>([]);

  const handleVisitVoiceResult = (text: string) => {
    setVisitVoiceText(text);
    setVisitVoiceError(null);
    setIsParsingVisitVoice(true);
    // 全利用者リストを渡す（検索結果ではなく全件）
    const src = allPatientsRef.current.length > 0 ? allPatientsRef.current : patientsRef.current;
    const namesWithKana = src.map((p) => ({ name: p.name, kana: p.nameKana ?? '' }));
    parseVisitVoiceMutation.mutate({ text, patientNamesWithKana: namesWithKana });
  };

  const visitVoice = useVoiceInput({
    onResult: handleVisitVoiceResult,
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

  // 全利用者リスト（音声入力時のマッチング用）
  // チーム選択時はそのチームの利用者のみに自動絞り込み
  const { data: allPatients = [] } = trpc.patients.list.useQuery(
    { team: team as Team || undefined }
  );
  const allPatientsRef = useRef<typeof allPatients>([]);
  useEffect(() => { allPatientsRef.current = allPatients; }, [allPatients]);

  // patientsRefを最新のpatientsで同期
  useEffect(() => { patientsRef.current = patients; }, [patients]);

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

  const unmarkExported = trpc.visitRecords.unmarkExported.useMutation({
    onSuccess: () => {
      setExported(false);
      toast.success("未転送に戻しました");
      utils.visitRecords.getMine.invalidate();
    },
    onError: (err) => toast.error(`リセットエラー: ${err.message}`),
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

          {/* 一括音声入力エリア（最上部） */}
          <div className={cn(
            "rounded-xl border-2 p-3 space-y-2 transition-colors duration-300",
            visitVoice.isRecording
              ? (visitVoice.silenceCountdown !== null && visitVoice.silenceCountdown <= 5
                  ? "border-orange-400/60 bg-orange-50 dark:bg-orange-950/20"
                  : "border-red-400/60 bg-red-50 dark:bg-red-950/20")
              : isParsingVisitVoice
                ? "border-primary/40 bg-primary/10"
                : "border-primary/30 bg-primary/5"
          )}>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-semibold text-primary">音声入力でAI自動転記</p>
                  <VoiceHelpDialog mode="record" />
                </div>
                {visitVoice.isRecording ? (
                  <p className={cn(
                    "text-xs font-medium mt-0.5",
                    visitVoice.silenceCountdown !== null && visitVoice.silenceCountdown <= 5
                      ? "text-orange-600 dark:text-orange-400"
                      : "text-red-600 dark:text-red-400 animate-pulse"
                  )}>
                    {visitVoice.silenceCountdown !== null && visitVoice.silenceCountdown <= 5
                      ? `あと${visitVoice.silenceCountdown}秒で自動停止`
                      : "🎙️ 話してください..."}
                  </p>
                ) : isParsingVisitVoice ? (
                  <p className="text-xs text-primary font-medium animate-pulse mt-0.5">AIが解析中...</p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-0.5">マイクをタップして話すと各項目に転記</p>
                )}
              </div>
              <button
                type="button"
                onPointerDown={(e) => { e.preventDefault(); visitVoice.toggleVoice(); }}
                className={cn(
                  "relative inline-flex items-center justify-center flex-shrink-0 h-14 w-14 rounded-full",
                  "border-2 transition-all duration-200 select-none touch-manipulation",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  visitVoice.isRecording
                    ? (visitVoice.silenceCountdown !== null && visitVoice.silenceCountdown <= 5
                        ? "bg-orange-500 border-orange-400 text-white shadow-lg shadow-orange-500/40"
                        : "bg-red-500 border-red-400 text-white shadow-lg shadow-red-500/40")
                    : "bg-primary border-primary text-primary-foreground hover:bg-primary/90 active:scale-95 shadow-md"
                )}
                aria-label={visitVoice.isRecording ? "録音停止" : "音声入力開始"}
                disabled={isParsingVisitVoice}
              >
                {visitVoice.isRecording && (
                  <span className="absolute inset-0 rounded-full overflow-hidden pointer-events-none">
                    <span className={cn("absolute inset-0 animate-ping rounded-full opacity-30", visitVoice.silenceCountdown !== null && visitVoice.silenceCountdown <= 5 ? "bg-orange-400" : "bg-red-400")} />
                  </span>
                )}
                {isParsingVisitVoice ? (
                  <span className="inline-block w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                ) : visitVoice.isRecording && visitVoice.silenceCountdown !== null && visitVoice.silenceCountdown <= 5 ? (
                  <span className="text-sm font-bold leading-none">{visitVoice.silenceCountdown}</span>
                ) : visitVoice.isRecording ? (
                  <span className="flex items-end justify-center gap-0.5 h-4">
                    {[0,1,2,3].map((i) => (
                      <span key={i} className="w-1 bg-white rounded-full" style={{ height: "60%", animation: "voiceBar 0.5s ease-in-out infinite alternate", animationDelay: `${i * 0.12}s` }} />
                    ))}
                  </span>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                )}
              </button>
            </div>

            {/* 録音中の暫定テキストプレビュー（録音終了後も残す） */}
            {(visitVoice.isRecording || visitVoiceText) && (
              <div className={cn(
                "px-3 py-2 rounded-lg border min-h-[36px] transition-colors duration-300",
                visitVoice.isRecording
                  ? (visitVoice.silenceCountdown !== null && visitVoice.silenceCountdown <= 5
                      ? "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800"
                      : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800")
                  : "bg-muted/40 border-border"
              )}>
                {visitVoice.isRecording ? (
                  visitVoice.interimText ? (
                    <p className="text-xs text-red-600 dark:text-red-400 italic leading-relaxed">
                      🎤 {visitVoice.interimText}
                    </p>
                  ) : visitVoice.silenceCountdown !== null && visitVoice.silenceCountdown <= 5 ? (
                    <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                      あと{visitVoice.silenceCountdown}秒で自動停止します
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">話しかけてください...</p>
                  )
                ) : visitVoiceText ? (
                  <div className="flex items-start gap-1.5">
                    <p className="text-xs text-muted-foreground leading-relaxed flex-1">
                      🎤 {visitVoiceText}
                    </p>
                    <button
                      type="button"
                      onClick={() => setVisitVoiceText("")}
                      className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5"
                      title="クリア"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                ) : null}
              </div>
            )}

            {/* チーム未選択時のヒント */}
            {!team && !visitVoice.isRecording && !isParsingVisitVoice && (
              <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600 dark:text-amber-400 flex-shrink-0"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                <p className="text-[10px] text-amber-700 dark:text-amber-300">チームを先に選ぶと利用者名の認識精度が上がります</p>
              </div>
            )}

            {/* AI解析中 */}
            {isParsingVisitVoice && (
              <div className="flex items-center gap-2 text-xs text-primary">
                <span className="inline-block w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span>AIが音声内容を解析して各項目に転記中...</span>
              </div>
            )}

            {/* 例文（常時表示） */}
            <div className="space-y-1">
              <p className="text-[10px] font-medium text-muted-foreground">話しかけの例</p>
              <div className="rounded-lg bg-background/70 border border-border px-3 py-2">
                <span className="text-[11px] text-muted-foreground leading-snug">○○チームの○○さん、次回訪問は明後日の×時×分、本人に口頭で伝えた。</span>
              </div>
            </div>

            {/* AI解析失敗時 */}
            {visitVoiceError && !isParsingVisitVoice && (
              <div className="flex items-start gap-3 p-2 bg-destructive/10 border border-destructive/30 rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-destructive">⚠️ AI解析に失敗しました</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{visitVoiceError}</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setVisitVoiceError(null); if (visitVoiceText) handleVisitVoiceResult(visitVoiceText); }}
                  className="text-[10px] text-primary hover:underline whitespace-nowrap"
                >
                  再試行
                </button>
              </div>
            )}


          </div>

          {/* 音声転記確認・修正パネル */}
          {voicePreview && editingPreview && (() => {
            // 未検出項目の判定
            const missingPatient = !editingPreview.patientName;
            const missingDate = !editingPreview.visitDate;
            const missingTime = !editingPreview.visitTime;
            const missingNotifiedTo = !editingPreview.notifiedTo;
            const missingNotifyMethod = !editingPreview.notifyMethod;
            const missingCount = [missingPatient, missingDate, missingTime, missingNotifiedTo, missingNotifyMethod].filter(Boolean).length;
            const hasMissing = missingCount > 0;
            return (
              <div className={cn(
                "rounded-xl border-2 p-3 space-y-3",
                hasMissing
                  ? "border-amber-400/70 bg-amber-50 dark:bg-amber-950/20"
                  : "border-emerald-400/60 bg-emerald-50 dark:bg-emerald-950/30"
              )}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <p className={cn(
                      "text-xs font-semibold",
                      hasMissing ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"
                    )}>
                      {hasMissing ? `⚠️ AI転記結果（未検出 ${missingCount}項目）` : "✅ AI転記結果を確認・修正"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setVoicePreview(null); setEditingPreview(null); setVisitVoiceText(""); }}
                    className="text-[10px] text-muted-foreground hover:text-destructive"
                  >
                    ✕ 閉じる
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground -mt-1">
                  {hasMissing
                    ? <><span className="text-red-500 font-medium">赤字の項目</span>は未検出です。入力してから「確定」をタップしてください。</>
                    : "内容を確認して「確定」をタップしてください。修正したい場合は各項目を直接編集できます。"
                  }
                </p>

                {/* 利用者名 */}
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <label className={cn("text-[10px] font-medium", missingPatient ? "text-red-500" : "text-muted-foreground")}>利用者名</label>
                    {missingPatient && <span className="text-[9px] font-bold text-red-500 bg-red-100 dark:bg-red-950/40 border border-red-300 dark:border-red-700 rounded px-1 py-0.5 leading-none">未検出</span>}
                    <span className="ml-auto">
                      {isParsingReInput && reInputField === "patientName" ? (
                        <span className="text-[9px] text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />解析中...</span>
                      ) : (
                        <VoiceMicButton
                          size="sm"
                          onResult={(text) => { setReInputField("patientName"); setIsParsingReInput(true); reInputTargetFieldRef.current = "patientName"; const src2 = allPatientsRef.current.length > 0 ? allPatientsRef.current : patientsRef.current; parseReInputMutation.mutate({ text, patientNamesWithKana: src2.map((p) => ({ name: p.name, kana: p.nameKana ?? '' })) }); }}
                          previewMode="tooltip"
                          className="rounded-full"
                        />
                      )}
                    </span>
                  </div>
                  <Input
                    className={cn("text-sm h-8", missingPatient && "border-red-400 focus-visible:ring-red-400")}
                    value={editingPreview.patientName ?? ""}
                    onChange={(e) => setEditingPreview((p) => p ? { ...p, patientName: e.target.value, patientId: null } : p)}
                    placeholder={missingPatient ? "← 利用者名を入力してください" : ""}
                  />
                </div>

                {/* 次回訪問日時 */}
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <label className={cn("text-[10px] font-medium", (missingDate || missingTime) ? "text-red-500" : "text-muted-foreground")}>次回訪問日時</label>
                    {(missingDate || missingTime) && <span className="text-[9px] font-bold text-red-500 bg-red-100 dark:bg-red-950/40 border border-red-300 dark:border-red-700 rounded px-1 py-0.5 leading-none">未検出</span>}
                    <span className="ml-auto">
                      {isParsingReInput && reInputField === "visitDateTime" ? (
                        <span className="text-[9px] text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />解析中...</span>
                      ) : (
                        <VoiceMicButton
                          size="sm"
                          onResult={(text) => { setReInputField("visitDateTime"); setIsParsingReInput(true); reInputTargetFieldRef.current = "visitDateTime"; parseReInputMutation.mutate({ text, patientNames: [] }); }}
                          previewMode="tooltip"
                          className="rounded-full"
                        />
                      )}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1">
                        <label className={cn("text-[9px] text-muted-foreground", missingDate && "text-red-400")}>日付</label>
                        {missingDate && <span className="text-[9px] font-bold text-red-500 bg-red-100 dark:bg-red-950/40 border border-red-300 dark:border-red-700 rounded px-1 py-0.5 leading-none">未検出</span>}
                      </div>
                      <Input
                        type="date"
                        className={cn("text-sm h-8", missingDate && "border-red-400 focus-visible:ring-red-400")}
                        value={editingPreview.visitDate ?? ""}
                        onChange={(e) => setEditingPreview((p) => p ? { ...p, visitDate: e.target.value } : p)}
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1">
                        <label className={cn("text-[9px] text-muted-foreground", missingTime && "text-red-400")}>時刻</label>
                        {missingTime && <span className="text-[9px] font-bold text-red-500 bg-red-100 dark:bg-red-950/40 border border-red-300 dark:border-red-700 rounded px-1 py-0.5 leading-none">未検出</span>}
                      </div>
                      <Input
                        type="time"
                        className={cn("text-sm h-8", missingTime && "border-red-400 focus-visible:ring-red-400")}
                        value={editingPreview.visitTime ?? ""}
                        onChange={(e) => setEditingPreview((p) => p ? { ...p, visitTime: e.target.value } : p)}
                      />
                    </div>
                  </div>
                </div>

                {/* 伝達先 */}
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <label className={cn("text-[10px] font-medium", missingNotifiedTo ? "text-red-500" : "text-muted-foreground")}>伝達先</label>
                    {missingNotifiedTo && <span className="text-[9px] font-bold text-red-500 bg-red-100 dark:bg-red-950/40 border border-red-300 dark:border-red-700 rounded px-1 py-0.5 leading-none">未検出</span>}
                    <span className="ml-auto">
                      {isParsingReInput && reInputField === "notifiedTo" ? (
                        <span className="text-[9px] text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />解析中...</span>
                      ) : (
                        <VoiceMicButton
                          size="sm"
                          onResult={(text) => { setReInputField("notifiedTo"); setIsParsingReInput(true); reInputTargetFieldRef.current = "notifiedTo"; parseReInputMutation.mutate({ text, patientNames: [] }); }}
                          previewMode="tooltip"
                          className="rounded-full"
                        />
                      )}
                    </span>
                  </div>
                  <div className={cn("flex flex-wrap gap-1.5 p-1.5 rounded-lg border", missingNotifiedTo ? "border-red-400 bg-red-50/50 dark:bg-red-950/10" : "border-transparent")}>
                    {NOTIFY_TO_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setEditingPreview((p) => p ? { ...p, notifiedTo: opt } : p)}
                        className={cn(
                          "px-3 py-1 rounded-full text-xs border transition-all",
                          editingPreview.notifiedTo === opt
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : "bg-background border-border hover:border-emerald-400"
                        )}
                      >{opt}</button>
                    ))}
                  </div>
                  {editingPreview.notifiedTo === "その他" && (
                    <Input
                      className="text-sm h-8 mt-1"
                      value={editingPreview.notifiedToOther ?? ""}
                      onChange={(e) => setEditingPreview((p) => p ? { ...p, notifiedToOther: e.target.value } : p)}
                      placeholder="具体的に入力..."
                    />
                  )}
                </div>

                {/* 伝達方法 */}
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <label className={cn("text-[10px] font-medium", missingNotifyMethod ? "text-red-500" : "text-muted-foreground")}>伝達方法</label>
                    {missingNotifyMethod && <span className="text-[9px] font-bold text-red-500 bg-red-100 dark:bg-red-950/40 border border-red-300 dark:border-red-700 rounded px-1 py-0.5 leading-none">未検出</span>}
                    <span className="ml-auto">
                      {isParsingReInput && reInputField === "notifyMethod" ? (
                        <span className="text-[9px] text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />解析中...</span>
                      ) : (
                        <VoiceMicButton
                          size="sm"
                          onResult={(text) => { setReInputField("notifyMethod"); setIsParsingReInput(true); reInputTargetFieldRef.current = "notifyMethod"; parseReInputMutation.mutate({ text, patientNames: [] }); }}
                          previewMode="tooltip"
                          className="rounded-full"
                        />
                      )}
                    </span>
                  </div>
                  <div className={cn("flex flex-wrap gap-1.5 p-1.5 rounded-lg border", missingNotifyMethod ? "border-red-400 bg-red-50/50 dark:bg-red-950/10" : "border-transparent")}>
                    {NOTIFY_METHOD_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setEditingPreview((p) => p ? { ...p, notifyMethod: opt } : p)}
                        className={cn(
                          "px-3 py-1 rounded-full text-xs border transition-all",
                          editingPreview.notifyMethod === opt
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : "bg-background border-border hover:border-emerald-400"
                        )}
                      >{opt}</button>
                    ))}
                  </div>
                  {editingPreview.notifyMethod === "その他" && (
                    <Input
                      className="text-sm h-8 mt-1"
                      value={editingPreview.notifyMethodOther ?? ""}
                      onChange={(e) => setEditingPreview((p) => p ? { ...p, notifyMethodOther: e.target.value } : p)}
                      placeholder="具体的に入力..."
                    />
                  )}
                </div>

                {/* ボタン行 */}
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    className={cn(
                      "flex-1 text-white text-xs h-9",
                      hasMissing
                        ? "bg-amber-500 hover:bg-amber-600"
                        : "bg-emerald-600 hover:bg-emerald-700"
                    )}
                    onClick={() => editingPreview && applyVoicePreview(editingPreview)}
                  >
                    {hasMissing ? `未入力項目あり・そのまま確定` : "✓　この内容で確定"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-9 px-3"
                    onClick={() => {
                      setVoicePreview(null);
                      setEditingPreview(null);
                      setVisitVoiceText("");
                      setVisitVoiceError(null);
                    }}
                  >
                    やり直す
                  </Button>
                </div>
              </div>
            );
          })()}

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
                      id="record-patient-search"
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

            {/* 日付・時刻入力 */}
            <div className="flex gap-2">
              <Input
                id="record-next-visit-date"
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

          {/* 伝達先・伝達方法（常時表示） */}
          <div className="space-y-3 border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground">次回訪問日時の伝達</p>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">伝達先</label>
              <div id="record-notified-to" className="flex gap-2 flex-wrap">
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
              <div id="record-notify-method" className="flex gap-2 flex-wrap">
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
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs border-emerald-400 text-emerald-700 hover:bg-emerald-50"
                onClick={() => window.open(VISIT_RECORD_SHEET_URL, "_blank", "noopener,noreferrer")}
              >
                <ExternalLink className="w-3 h-3 mr-1" />
                スプレッドシートを確認
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
                onClick={() => {
                  if (savedRecordId && confirm("転送済みフラグをリセットしますか？\nスプレッドシートのデータは削除されません。")) {
                    unmarkExported.mutate({ id: savedRecordId });
                  }
                }}
                disabled={unmarkExported.isPending}
              >
                {unmarkExported.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "未転送に戻す"}
              </Button>
            </div>
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
