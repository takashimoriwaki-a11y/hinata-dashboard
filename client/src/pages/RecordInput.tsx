/**
 * RecordInput - 訪問記録入力ページ
 * - チーム選択 → 利用者絞り込み
 * - 名前検索・音声入力で利用者を探せる
 * - 次回訪問日時（カレンダー選択）
 * - 伝達先（本人/家族/その他）・伝達方法（口頭/カレンダー記入/付箋/電話/その他）
 * - ①カードの下にスプレッドシート転送ボタン
 * - ②病状の経過
 */
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ClipboardEdit, Send, Search, Calendar,
  User, ChevronDown, Loader2, FileSpreadsheet, CheckCircle2, ExternalLink,
  AlertTriangle, RefreshCw, CheckSquare
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getTeamButtonClass, getTeamButtonStyle } from "@shared/teamColors";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { VoiceMicButton } from "@/components/VoiceMicButton";
import { useVoiceInput, formatElapsedTime } from "@/hooks/useVoiceInput";
import { VoiceHelpDialog } from "@/components/VoiceHelpDialog";

const TEAMS = ["身体", "天理", "郡山北部", "郡山南部"] as const;
type Team = typeof TEAMS[number];

const NOTIFY_TO_OPTIONS = ["本人", "家族", "その他"] as const;
const NOTIFY_METHOD_OPTIONS = ["口頭", "カレンダー記入", "付箋", "電話", "その他"] as const;

// 訪問タスク チェックリスト定義
const VISIT_TASKS_BEFORE_DEFAULT = [
  { id: "voice_memo", label: "ボイスメモ（録音）", checked: false, optional: false },
  { id: "task_check", label: "タスクの有無確認と実施", checked: false, optional: false },
  { id: "limit_mgmt", label: "上限管理票の確認、記載", checked: false, optional: false },
  { id: "fee_sheet", label: "料金表記入", checked: false, optional: false },
  { id: "docs_hand", label: "請求書、領収書、看護計画渡す", checked: false, optional: true },
  { id: "insurance", label: "月初めは保険証、マイナンバーカード確認と読み込み", checked: false, optional: true },
];

const VISIT_TASKS_AFTER_DEFAULT = [
  { id: "record_voice", label: "処置内容を録音", checked: false, optional: false },
  { id: "notebooklm", label: "ボイスメモをNotebookLMにソースとして追加し、指定のプロンプトで文章を作成", checked: false, optional: false },
];

export default function RecordInput() {
  const { user } = useAuth();

  // ① 訪問タスク チェックリスト
  const [visitTasksBefore, setVisitTasksBefore] = useState(
    () => VISIT_TASKS_BEFORE_DEFAULT.map(t => ({ ...t }))
  );
  const [visitTasksAfter, setVisitTasksAfter] = useState(
    () => VISIT_TASKS_AFTER_DEFAULT.map(t => ({ ...t }))
  );
  const toggleVisitTaskBefore = (id: string) => {
    setVisitTasksBefore(prev => prev.map(t => t.id === id ? { ...t, checked: !t.checked } : t));
  };
  const toggleVisitTaskAfter = (id: string) => {
    setVisitTasksAfter(prev => prev.map(t => t.id === id ? { ...t, checked: !t.checked } : t));
  };

  // ② 利用者・次回訪問日時
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
  // 確認パネル内の利用者名検索用state
  const [previewPatientSearch, setPreviewPatientSearch] = useState("");
  const [showPreviewPatientList, setShowPreviewPatientList] = useState(false);
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
    } else {
      // 「全チーム」「事務員」の場合は最後に使ったチームをlocalStorageから自動入力（未保存の場合は未選択のまま）
      setTeamRaw(prev => {
        if (prev !== "") return prev; // 既に設定済みの場合は維持
        // localStorageから最後に使ったチームを読み込む
        try {
          const saved = localStorage.getItem(RECORD_TEAM_KEY);
          if (saved && validTeams.includes(saved as Team)) return saved as Team;
        } catch {}
        return ""; // localStorageに保存済みのチームがなければ未選択のまま
      });
    }
  }, [user?.team]);

  // 時間セレクト用
  const [timeDropdownOpen, setTimeDropdownOpen] = useState(false);
  const timeListRef = useRef<HTMLDivElement>(null);
  const timeSlots = useMemo(() => Array.from({ length: 24 * 12 }, (_, i) => {
    const h = Math.floor(i / 12);
    const m = (i % 12) * 5;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }), []);

  // ドロップダウンを開いたとき現在時刻に近い選択肢へスクロール
  useEffect(() => {
    if (!timeDropdownOpen || !timeListRef.current) return;
    const now = new Date();
    const roundedMin = Math.round(now.getMinutes() / 5) * 5;
    const h = roundedMin === 60 ? (now.getHours() + 1) % 24 : now.getHours();
    const m = roundedMin === 60 ? 0 : roundedMin;
    const target = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    const el = timeListRef.current.querySelector(`[data-val="${target}"]`) as HTMLElement | null;
    if (el) el.scrollIntoView({ block: "center" });
  }, [timeDropdownOpen]);

  // ② 確認項目（睡眠・食事・排泄・服薬）
  const DRAFT_CHECK_ITEMS_KEY = "hinata_record_check_items";
  const [checkItems, setCheckItems] = useState<{ 睡眠: string; 食事: string; 排泄: string; 服薬: string }>(() => {
    try {
      const raw = localStorage.getItem("hinata_record_check_items");
      if (raw) return JSON.parse(raw);
    } catch {}
    return { 睡眠: "", 食事: "", 排泄: "", 服薬: "" };
  });

  // ② バイタルサイン（体温・脈拍・SpO2・血圧）
  const DRAFT_VITALS_KEY = "hinata_record_vitals";
  const [vitals, setVitals] = useState<{ 体温: string; 脈拍: string; SpO2: string; 収縮期: string; 拡張期: string }>(() => {
    try {
      const raw = localStorage.getItem("hinata_record_vitals");
      if (raw) {
        const parsed = JSON.parse(raw);
        // 旧形式（血圧として保存されていた場合）の互換性対応
        if (parsed.血圧 !== undefined && parsed.収縮期 === undefined) {
          const parts = parsed.血圧.split("/");
          parsed.収縮期 = parts[0] || "";
          parsed.拡張期 = parts[1] || "";
          delete parsed.血圧;
        }
        // プルダウン選択肢の有効値検証：範囲外の値はクリア
        const validTemp = Array.from({ length: Math.round((42.0 - 35.0) / 0.1) + 1 }, (_, i) => (35.0 + i * 0.1).toFixed(1));
        const validPulse = Array.from({ length: 81 }, (_, i) => String(50 + i));
        const validSpO2 = Array.from({ length: 10 }, (_, i) => String(99 - i));
        const validSystolic = Array.from({ length: 48 }, (_, i) => String(96 + i * 2));
        const validDiastolic = Array.from({ length: 51 }, (_, i) => String(50 + i));
        return {
          体温: validTemp.includes(parsed.体温) ? parsed.体温 : "",
          脈拍: validPulse.includes(parsed.脈拍) ? parsed.脈拍 : "",
          SpO2: validSpO2.includes(parsed.SpO2) ? parsed.SpO2 : "",
          収縮期: validSystolic.includes(parsed.収縮期) ? parsed.収縮期 : "",
          拡張期: validDiastolic.includes(parsed.拡張期) ? parsed.拡張期 : "",
        };
      }
    } catch {}
    return { 体温: "", 脈拍: "", SpO2: "", 収縮期: "", 拡張期: "" };
  });

  // ② 病状の経過
  const [clinicalNotes, setClinicalNotes] = useState("");
  // テキストエリアの自動高さ調整用ref
  const clinicalNotesTextareaRef = useRef<HTMLTextAreaElement>(null);
  // テキストエリアの高さを内容に合わせて自動調整する関数
  const adjustTextareaHeight = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = Math.max(200, el.scrollHeight) + "px";
  }, []);
  // 最終保存タイムスタンプ
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  // 最終保存から経過時間の表示用（1分ごとに更新）
  const [savedAgoText, setSavedAgoText] = useState<string>("");

  // 保存済み記録ID（スプレッドシート転送用）
  const [savedRecordId, setSavedRecordId] = useState<number | null>(null);
  const [exported, setExported] = useState(false);

  // 転送先スプレッドシートURL（編集ボタン用）
  const VISIT_RECORD_SHEET_URL = "https://docs.google.com/spreadsheets/d/1WOZQ5rI0Fu57nWaiGwComPS_DdEwPgNR6zeOmyrqKpo/edit"; // ひなた_次回訪問日時

  // 音声入力（useVoiceInputフックで管理）
  // 利用者名検索用
  const voicePatient = { onResult: (text: string) => { setSearchQuery(text.trim()); setShowPatientList(true); } };
  // 病状の経過用（interimTextを直接取得するためuseVoiceInputを直接使用）
  const [notesLongTextMode, setNotesLongTextMode] = useState(false);
  const notesVoice = useVoiceInput({
    onResult: (text: string) => { setClinicalNotes(prev => prev + (prev ? "\n" : "") + text.trim()); },
    context: "clinical_notes",
    longTextMode: notesLongTextMode,
  });

  // 次回訪問日時・伝達先・伝達方法の音声入力用state
  const [visitVoiceText, setVisitVoiceText] = useState("");
  const [isParsingVisitVoice, setIsParsingVisitVoice] = useState(false);
  const [visitVoiceError, setVisitVoiceError] = useState<string | null>(null);

  // 誤変換フィードバックダイアログ用state
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [feedbackWrongText, setFeedbackWrongText] = useState("");
  const [feedbackCorrectedText, setFeedbackCorrectedText] = useState("");
  const [feedbackVoiceHook, setFeedbackVoiceHook] = useState<"visitVoice" | "notesVoice">("visitVoice");
  const [isSendingFeedback, setIsSendingFeedback] = useState(false);

  const openFeedbackDialog = (wrongText: string, hook: "visitVoice" | "notesVoice") => {
    setFeedbackWrongText(wrongText);
    setFeedbackCorrectedText(wrongText);
    setFeedbackVoiceHook(hook);
    setFeedbackDialogOpen(true);
  };

  const handleSendFeedback = async () => {
    if (!feedbackCorrectedText.trim() || feedbackCorrectedText === feedbackWrongText) {
      setFeedbackDialogOpen(false);
      return;
    }
    setIsSendingFeedback(true);
    try {
      const hook = feedbackVoiceHook === "visitVoice" ? visitVoice : notesVoice;
      await hook.reportMistranscription(feedbackWrongText, feedbackCorrectedText.trim());
      toast.success("フィードバックありがとうございます！次回から改善されます。");
    } catch {
      toast.error("フィードバックの送信に失敗しました。");
    } finally {
      setIsSendingFeedback(false);
      setFeedbackDialogOpen(false);
    }
  };

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
    team?: string;
    visitDateConfidence?: 'high' | 'medium' | 'low' | null;
    visitTimeConfidence?: 'high' | 'medium' | 'low' | null;
    rawVoiceText?: string;
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
      // patientIdがない場合、利用者リストから再マッチングを試みる
      const src = allPatientsRef.current.length > 0 ? allPatientsRef.current : patientsRef.current;
      const aiName = preview.patientName;
      const exact = src.find((p) => p.name === aiName);
      const partial = !exact ? src.filter((p) =>
        p.name.includes(aiName) || aiName.includes(p.name.split('\u3000')[0].split(' ')[0])
      ) : null;
      const matched = exact ?? (partial && partial.length === 1 ? partial[0] : undefined);
      if (matched) {
        setPatientId(matched.id);
        setPatientName(matched.name);
        setSearchQuery(matched.name);
        setShowPatientList(false);
      } else {
        setPatientName(aiName);
        setSearchQuery(aiName);
        setShowPatientList(true);
      }
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
    // チームが含まれていれば反映
    if (preview.team && TEAMS.includes(preview.team as Team)) {
      setTeam(preview.team as Team);
    }
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
    context: "clinical_notes",
  });
  // 個別音声再入力用フック（次回訪問日時）
  const reInputDateTimeVoice = useVoiceInput({
    onResult: (text) => {
      setIsParsingReInput(true);
      reInputTargetFieldRef.current = "visitDateTime"; // refに保持
      parseReInputMutation.mutate({ text, patientNames: [] });
    },
    context: "clinical_notes",
  });
  // 個別音声再入力用フック（伝達先）
  const reInputNotifiedToVoice = useVoiceInput({
    onResult: (text) => {
      setIsParsingReInput(true);
      reInputTargetFieldRef.current = "notifiedTo"; // refに保持
      parseReInputMutation.mutate({ text, patientNames: [] });
    },
    context: "clinical_notes",
  });
  // 個別音声再入力用フック（伝達方法）
  const reInputNotifyMethodVoice = useVoiceInput({
    onResult: (text) => {
      setIsParsingReInput(true);
      reInputTargetFieldRef.current = "notifyMethod"; // refに保持
      parseReInputMutation.mutate({ text, patientNames: [] });
    },
    context: "clinical_notes",
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
            const aiName = f.patientName.trim();
            // 名前の正規化（全角スペース・半角スペースを除去）
            const normalize = (s: string) => s.replace(/[\s\u3000]+/g, '');
            const normAi = normalize(aiName);
            // 1. 完全一致（スペース正規化後）
            const exact = sourceList.find((p) => normalize(p.name) === normAi);
            if (exact) return exact;
            // 2. 姓のみ一致（スペース区切り・全角スペース区切りの最初の部分）
            const aiSurname = aiName.split(/[\s\u3000]/)[0];
            const bySurname = sourceList.filter((p) => {
              const pSurname = p.name.split(/[\s\u3000]/)[0];
              return pSurname === aiSurname;
            });
            if (bySurname.length === 1) return bySurname[0];
            // 3. 読み仮名での一致（kanaフィールドがある場合）
            // ひらがな正規化（カタカナ→ひらがな変換）
            const toHiragana = (s: string) => s.replace(/[\u30A1-\u30F6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
            const normAiKana = toHiragana(normAi.toLowerCase());
            const bySurnameKana = sourceList.filter((p) => {
              if (!p.nameKana) return false;
              const kana = toHiragana(p.nameKana.trim().replace(/[\s\u3000]+/g, ''));
              const kanaFull = toHiragana(p.nameKana.trim());
              const kanaSurname = kanaFull.split(/[\s\u3000]/)[0];
              // 完全一致・姓読み仮名一致・前方一致（「ゆあさ」→「ゆあさまさと」）
              return kana === normAiKana
                || toHiragana(kanaSurname) === normAiKana
                || kana.startsWith(normAiKana)
                || normAiKana.startsWith(toHiragana(kanaSurname));
            });
            if (bySurnameKana.length === 1) return bySurnameKana[0];
            // 3.5. 読み仮名の部分一致（「かせい」→「かせいとおる」など特殊漢字対応）
            const byKanaPartial = sourceList.filter((p) => {
              if (!p.nameKana) return false;
              const kana = toHiragana(p.nameKana.trim().replace(/[\s\u3000]+/g, ''));
              return kana.includes(normAiKana) || normAiKana.includes(kana.substring(0, Math.min(3, kana.length)));
            });
            if (byKanaPartial.length === 1) return byKanaPartial[0];
            // 4. 部分一致（AIの名前が利用者名に含まれる、または利用者の姓がAIの名前に含まれる）
            const partial = sourceList.filter(
              (p) => normalize(p.name).includes(normAi) || normAi.includes(normalize(p.name.split(/[\s\u3000]/)[0]))
            );
            if (partial.length === 1) return partial[0];
            // 5. 姓が複数マッチする場合は候補として返さない（確認パネルで選択させる）
            return undefined;
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
        team: f.team ?? undefined,
        visitDateConfidence: (f as any).visitDateConfidence ?? null,
        visitTimeConfidence: (f as any).visitTimeConfidence ?? null,
        rawVoiceText: (parseVisitVoiceMutation as any)._lastInput?.text ?? undefined,
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
    context: "clinical_notes",
  });

  // ===== 下書き自動保存 =====
  const DRAFT_KEY = "hinata_record_draft";

  // ページ読み込み時に下書きを復元
  const [hasDraft, setHasDraft] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
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
      // 実際に意味のある入力内容がある場合のみ復元バナーを表示する
      const hasMeaningfulContent = !!(draft.patientName || draft.patientId || draft.nextVisitDate || draft.nextVisitTime || draft.clinicalNotes || draft.notifiedTo || draft.notifyMethod);
      setHasDraft(hasMeaningfulContent);
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // clinicalNotes変更時（音声入力・下書き復元など）にテキストエリアの高さを自動調整
  useEffect(() => {
    if (clinicalNotesTextareaRef.current) {
      adjustTextareaHeight(clinicalNotesTextareaRef.current);
    }
  }, [clinicalNotes, adjustTextareaHeight]);

  // 確認項目の自動保存（1秒デバウンス）
  useEffect(() => {
    const timer = setTimeout(() => {
      const hasContent = Object.values(checkItems).some(v => v.trim());
      if (hasContent) {
        localStorage.setItem(DRAFT_CHECK_ITEMS_KEY, JSON.stringify(checkItems));
      } else {
        localStorage.removeItem(DRAFT_CHECK_ITEMS_KEY);
      }
    }, 1000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkItems]);

  // バイタルサインの自動保存（1秒デバウンス）
  useEffect(() => {
    const timer = setTimeout(() => {
      const hasContent = Object.values(vitals).some(v => v.trim());
      if (hasContent) {
        localStorage.setItem(DRAFT_VITALS_KEY, JSON.stringify(vitals));
      } else {
        localStorage.removeItem(DRAFT_VITALS_KEY);
      }
    }, 1000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vitals]);

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
      // 病状の経過に内容がある場合のみ保存時刻を更新
      if (clinicalNotes.trim()) {
        setLastSavedAt(new Date());
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [team, patientId, patientName, searchQuery, nextVisitDate, nextVisitTime,
      notifiedTo, notifiedToOther, notifyMethod, notifyMethodOther, clinicalNotes]);

  // lastSavedAtが変わったら経過時間テキストを更新（1分ごとに再計算）
  useEffect(() => {
    if (!lastSavedAt) return;
    const calcAgo = () => {
      const diffMs = Date.now() - lastSavedAt.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) setSavedAgoText("たった今");
      else if (diffMin < 60) setSavedAgoText(`${diffMin}分前`);
      else {
        const diffH = Math.floor(diffMin / 60);
        setSavedAgoText(`${diffH}時間前`);
      }
    };
    calcAgo();
    const interval = setInterval(calcAgo, 60000);
    return () => clearInterval(interval);
  }, [lastSavedAt]);

  // tRPC
  const utils = trpc.useUtils();
  const { data: patients = [], isLoading: patientsLoading } = trpc.patients.search.useQuery(
    { query: searchQuery, team: team as Team || undefined },
    { enabled: showPatientList || searchQuery.length > 0 }
  );
  // 確認パネル内の利用者名検索用クエリ
  const { data: previewPatients = [], isLoading: previewPatientsLoading } = trpc.patients.search.useQuery(
    { query: previewPatientSearch },
    { enabled: showPreviewPatientList || previewPatientSearch.length > 0 }
  );

  // 全利用者リスト（音声入力時のマッチング用）
  // チームに関わらず全件取得（音声入力でチームを言及した場合に正しくマッチングできるように）
  const { data: allPatients = [] } = trpc.patients.list.useQuery(
    {}
  );
  const allPatientsRef = useRef<typeof allPatients>([]);
  useEffect(() => { allPatientsRef.current = allPatients; }, [allPatients]);

  // 音声解析完了後に音声入力エリアへ自動スクロール
  useEffect(() => {
    if (voicePreview) {
      setTimeout(() => {
        const el = document.getElementById("record-voice-area");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
    }
  }, [voicePreview]);

  // URLハッシュ（#record-condition）でページロード後に②病状の経過へスクロール
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#record-condition") {
      const scrollToCondition = () => {
        const el = document.getElementById("record-condition");
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        } else {
          // 要素がまだレンダリングされていない場合は少し待ってリトライ
          setTimeout(scrollToCondition, 300);
        }
      };
      setTimeout(scrollToCondition, 400);
    }
  }, []);

  // 音声確定からの自動転送フラグ（createRecord.onSuccessで参照）
  const autoExportRef = useRef(false);

  const createRecord = trpc.visitRecords.create.useMutation({
    onSuccess: (data) => {
      setSavedRecordId(data.id);
      setExported(false);
      if (autoExportRef.current) {
        // 音声確定からの自動転送
        autoExportRef.current = false;
        exportToSheet.mutate({ id: data.id });
      } else {
        toast.success("記録を保存しました。スプレッドシートへ転送できます。");
      }
    },
    onError: (err) => toast.error(`保存エラー: ${err.message}`),
  });

  const exportToSheet = trpc.visitRecords.exportToSheet.useMutation({
    onSuccess: () => {
      setExportError(null);
      toast.success("スプレッドシートへ転送しました！");
      utils.visitRecords.getMine.invalidate();
      // 転送後は全項目リセット（利用者名・次回訪問日時・伝達先・伝達方法）
      setPatientId(null);
      setPatientName("");
      setSearchQuery("");
      setNextVisitDate("");
      setNextVisitTime("");
      setNotifiedTo("");
      setNotifiedToOther("");
      setNotifyMethod("");
      setNotifyMethodOther("");
      setSavedRecordId(null);
      setExported(false);
      // 下書きも削除
      localStorage.removeItem(DRAFT_KEY);
      setHasDraft(false);
    },
    onError: (err) => {
      const msg = err.message || "スプレッドシートへの転送に失敗しました";
      setExportError(msg);
      toast.error(msg, { duration: 6000 });
    },
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

    // 1回タップで保存→転送を自動実行
    autoExportRef.current = true;

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

  const GEMS_URL = "https://gemini.google.com/gem/ece0f11827bf";

  const handleCopyAndOpenGem = async () => {
    // 確認項目・バイタル・病状の経過を結合してコピー
    const parts: string[] = [];

    // 確認項目（入力ありのみ）
    const checkParts: string[] = [];
    if (checkItems.睡眠.trim()) checkParts.push(`睡眠：${checkItems.睡眠.trim()}`);
    if (checkItems.食事.trim()) checkParts.push(`食事：${checkItems.食事.trim()}`);
    if (checkItems.排泄.trim()) checkParts.push(`排泄：${checkItems.排泄.trim()}`);
    if (checkItems.服薬.trim()) checkParts.push(`服薬：${checkItems.服薬.trim()}`);
    if (checkParts.length > 0) parts.push(checkParts.join("、"));

    // バイタルサイン（入力ありのみ）
    const vitalParts: string[] = [];
    if (vitals.体温.trim()) vitalParts.push(`体温：${vitals.体温.trim()}℃`);
    if (vitals.脈拍.trim()) vitalParts.push(`脈拍：${vitals.脈拍.trim()}回/分`);
    if (vitals.SpO2.trim()) vitalParts.push(`SpO2：${vitals.SpO2.trim()}%`);
    if (vitals.収縮期.trim() || vitals.拡張期.trim()) {
      const bp = [vitals.収縮期.trim(), vitals.拡張期.trim()].filter(Boolean).join("/");
      vitalParts.push(`血圧：${bp}mmHg`);
    }
    if (vitalParts.length > 0) parts.push(vitalParts.join("、"));

    // 病状の経過
    if (clinicalNotes.trim()) parts.push(clinicalNotes.trim());

    const textToCopy = parts.join("\n");

    if (!textToCopy.trim()) {
      toast.error("コピーする内容がありません。入力してください");
      return;
    }

    try {
      await navigator.clipboard.writeText(textToCopy);
      toast.success("記録をコピーしました。Gemで貼り付けてください");
    } catch {
      toast.error("クリップボードへのコピーに失敗しました");
    }
    window.open(GEMS_URL, "_blank", "noopener,noreferrer");
    // Gem送信後は病状の経過・確認項目・バイタルをリセット
    setClinicalNotes("");
    setCheckItems({ 睡眠: "", 食事: "", 排泄: "", 服薬: "" });
    setVitals({ 体温: "", 脈拍: "", SpO2: "", 収縮期: "", 拡張期: "" });
    // タイムスタンプ表示もリセット
    setLastSavedAt(null);
    setSavedAgoText("");
    // 誤変換報告表示もリセット
    notesVoice.clearLastTranscribedText();
    // localStorageのclinicalNotes・確認項目・バイタルも削除
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        draft.clinicalNotes = "";
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      }
    } catch { /* ignore */ }
    localStorage.removeItem(DRAFT_CHECK_ITEMS_KEY);
    localStorage.removeItem(DRAFT_VITALS_KEY);
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
    setCheckItems({ 睡眠: "", 食事: "", 排泄: "", 服薬: "" });
    setVitals({ 体温: "", 脈拍: "", SpO2: "", 収縮期: "", 拡張期: "" });
    setLastSavedAt(null);
    setSavedAgoText("");
    setSavedRecordId(null);
    setExported(false);
    // 音声入力関連状態をクリア
    setVoicePreview(null);
    setEditingPreview(null);
    setVisitVoiceText("");
    setVisitVoiceError(null);
    // 下書きを削除
    localStorage.removeItem(DRAFT_KEY);
    localStorage.removeItem(DRAFT_CHECK_ITEMS_KEY);
    localStorage.removeItem(DRAFT_VITALS_KEY);
    setHasDraft(false);
  };

  return (
    <>
    <div className="p-4 max-w-2xl mx-auto space-y-4 pb-20">
      <div className="flex items-center gap-2 mb-2">
        <ClipboardEdit className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-bold">訪問時チェック項目</h1>
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

      {/* ① 訪問タスク（チェックリストカード） */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-primary" />
            ① 訪問タスク
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 訪問前と訪問中 */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">訪問前・訪問中</p>
            <div className="space-y-2">
              {visitTasksBefore.map((task) => (
                <label
                  key={task.id}
                  className={cn(
                    "flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors select-none",
                    task.checked
                      ? "bg-primary/5 border-primary/30"
                      : "bg-background border-border hover:bg-muted/50"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={task.checked}
                    onChange={() => toggleVisitTaskBefore(task.id)}
                    className="mt-0.5 w-4 h-4 accent-primary flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <span className={cn(
                      "text-sm leading-snug",
                      task.checked ? "line-through text-muted-foreground" : "text-foreground"
                    )}>
                      {task.label}
                    </span>
                    {task.optional && (
                      <span className="ml-2 text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-full">
                        必要時
                      </span>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* 訪問後 */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">訪問後</p>
            <div className="space-y-2">
              {visitTasksAfter.map((task) => (
                <label
                  key={task.id}
                  className={cn(
                    "flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors select-none",
                    task.checked
                      ? "bg-primary/5 border-primary/30"
                      : "bg-background border-border hover:bg-muted/50"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={task.checked}
                    onChange={() => toggleVisitTaskAfter(task.id)}
                    className="mt-0.5 w-4 h-4 accent-primary flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <span className={cn(
                      "text-sm leading-snug",
                      task.checked ? "line-through text-muted-foreground" : "text-foreground"
                    )}>
                      {task.label}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* リセットボタン */}
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={() => {
                setVisitTasksBefore(VISIT_TASKS_BEFORE_DEFAULT.map(t => ({ ...t })));
                setVisitTasksAfter(VISIT_TASKS_AFTER_DEFAULT.map(t => ({ ...t })));
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
              リセット
            </button>
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
          {/* 転送エラーバナー */}
          {exportError && (
            <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800 p-3 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-red-700 dark:text-red-400">転送に失敗しました</p>
                  <p className="text-xs text-red-600 dark:text-red-500 mt-0.5 break-words">{exportError}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 text-xs border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/50"
                  onClick={() => {
                    setExportError(null);
                    if (savedRecordId) exportToSheet.mutate({ id: savedRecordId });
                  }}
                  disabled={exportToSheet.isPending}
                >
                  {exportToSheet.isPending ? (
                    <><Loader2 className="w-3 h-3 mr-1 animate-spin" />再試行中...</>
                  ) : (
                    <><RefreshCw className="w-3 h-3 mr-1" />再試行する</>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs text-muted-foreground"
                  onClick={() => setExportError(null)}
                >
                  閉じる
                </Button>
              </div>
            </div>
          )}
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
          disabled={createRecord.isPending || exportToSheet.isPending || !team}
        >
          {createRecord.isPending ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />保存中...</>
          ) : exportToSheet.isPending ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />転送中...</>
          ) : (
            <><FileSpreadsheet className="w-4 h-4 mr-2" />次回訪問日時をスプレッドシートへ転送</>
          )}
        </Button>
      )}
    </div>

    {/* 誤変換フィードバックダイアログ */}
    <Dialog open={feedbackDialogOpen} onOpenChange={setFeedbackDialogOpen}>
      <DialogContent className="max-w-sm mx-4">
        <DialogHeader>
          <DialogTitle className="text-sm">📝 誤変換を報告</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground">認識されたテキスト</label>
            <p className="mt-1 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2 leading-relaxed">{feedbackWrongText}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-foreground">正しいテキストに修正</label>
            <Textarea
              value={feedbackCorrectedText}
              onChange={(e) => setFeedbackCorrectedText(e.target.value)}
              className="mt-1 min-h-[80px] text-sm"
              placeholder="正しい認識結果を入力してください..."
              autoFocus
            />
          </div>
          <p className="text-xs text-muted-foreground">専門用語の誤認識を報告することで、次回からの音声認識精度が向上します。</p>
        </div>
        <DialogFooter className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFeedbackDialogOpen(false)}
            disabled={isSendingFeedback}
            className="flex-1"
          >
            キャンセル
          </Button>
          <Button
            size="sm"
            onClick={handleSendFeedback}
            disabled={isSendingFeedback || !feedbackCorrectedText.trim() || feedbackCorrectedText === feedbackWrongText}
            className="flex-1"
          >
            {isSendingFeedback ? (
              <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />送信中...</>
            ) : (
              "報告する"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
