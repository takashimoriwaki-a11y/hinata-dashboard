/**
 * RecordInput - 訪問時チェック項目ページ
 * - 今日の訪問予定（8名分のチーム＋利用者選択）
 * - 8つの訪問チェック項目カード（①訪問タスク＋②次回訪問日時を統合）
 * - タスク管理との連携（利用者のタスクを取得・チェックで自動完了）
 */
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  ClipboardEdit, Search, Loader2, ChevronDown, ChevronUp, X, Users, Mic, MicOff, ExternalLink, GripVertical, Check, Sparkles
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getTeamButtonClass, getTeamButtonStyle } from "@shared/teamColors";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { VisitSlotCard } from "@/components/VisitSlotCard";
import { VoiceMicButton } from "@/components/VoiceMicButton";

// Web Speech API の型定義
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRecognitionType = any;
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SpeechRecognition: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webkitSpeechRecognition: any;
  }
}

const TEAMS = ["身体", "天理", "郡山北部", "郡山南部"] as const;
type Team = typeof TEAMS[number];

// ===== 音声入力ユーティリティ =====
const TEAM_VOICE_MAP: Record<string, Team> = {
  "しんたい": "身体", "身体": "身体",
  "てんり": "天理", "天理": "天理",
  "こおりやまほくぶ": "郡山北部", "こおりやまきたぶ": "郡山北部",
  "郡山北部": "郡山北部", "ほくぶ": "郡山北部", "北部": "郡山北部",
  "こおりやまなんぶ": "郡山南部", "こおりやまみなみぶ": "郡山南部",
  "郡山南部": "郡山南部", "なんぶ": "郡山南部", "南部": "郡山南部",
};
const toKatakana = (s: string) => s.replace(/[\u3041-\u3096]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));
const toHiragana = (s: string) => s.replace(/[\u30A1-\u30F6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
const removeHonorific = (s: string) => s.replace(/(さん|様|くん|ちゃん|の|を|が|は|に|へ|で|と|から|まで|より)$/g, "");
const normalizeVoice = (s: string): string => removeHonorific(s.normalize("NFKC").replace(/\s+/g, "").toLowerCase());

/**
 * 一括音声入力のトランスクリプトを複数人名に分割する
 * 「田中さんと佐藤さんと山田さん」→ ["田中", "佐藤", "山田"]
 * 「田中、佐藤、山田」→ ["田中", "佐藤", "山田"]
 */
const splitMultipleNames = (transcript: string): string[] => {
  // 区切り文字で分割: 「と」「、」「，」「あと」「それから」「次に」「次は」「それと」「および」「&」
  const separators = /(?:と|、|，|,|あと|それから|次に|次は|それと|および|&|\s+と\s+|\s+)/g;
  // 敬称（さん・様・くん・ちゃん）を先に区切り文字「、」に置き換えてから分割
  // ※ 先に除去すると「田中さん佐藤さん」→「田中佐藤」になり分割できなくなるため
  const cleaned = transcript
    .replace(/さん|様|くん|ちゃん/g, "、")
    .replace(/の訪問|への訪問|を訪問/g, "");
  const parts = cleaned.split(separators)
    .map(p => p.trim())
    .filter(p => p.length >= 1);
  // チーム名を除去
  return parts.filter(p => {
    const norm = normalizeVoice(p);
    return !Object.keys(TEAM_VOICE_MAP).some(k => normalizeVoice(k) === norm);
  });
};
const extractTeamFromVoice = (transcript: string): { team: Team | null; rest: string } => {
  const norm = normalizeVoice(transcript);
  for (const [key, team] of Object.entries(TEAM_VOICE_MAP)) {
    const normKey = normalizeVoice(key);
    if (norm.startsWith(normKey)) return { team, rest: norm.slice(normKey.length).replace(/^の/, "") };
    if (norm.includes(normKey)) {
      const idx = norm.indexOf(normKey);
      return { team, rest: (norm.slice(0, idx) + norm.slice(idx + normKey.length)).replace(/^の|の$/, "") };
    }
  }
  return { team: null, rest: norm };
};
type PatientEntry = { id: number; name: string; team: string | null; nameKana?: string | null };
const scorePatient = (p: PatientEntry, query: string): number => {
  if (!query) return 0;
  const normName = normalizeVoice(p.name);
  const normKana = p.nameKana ? normalizeVoice(p.nameKana) : "";
  const normKanaHira = normKana ? toHiragana(normKana) : "";
  const lastName = normName.split(/[\s\u3000]+/)[0];
  const lastNameKana = normKana ? normKana.split(/[\s\u3000]+/)[0] : "";
  const lastNameKanaHira = lastNameKana ? toHiragana(lastNameKana) : "";
  const q = normalizeVoice(query);
  const qHira = toHiragana(q);
  const qKata = toKatakana(q);

  // ===== よみがな優先スコアリング =====
  // 完全一致（よみがな最優先）
  if (normKana === q || normKanaHira === q || normKana === qHira || normKana === qKata) return 105;
  if (normName === q) return 100;
  // 苗字よみがな完全一致
  if (lastNameKana === q || lastNameKanaHira === q || lastNameKana === qHira || lastNameKana === qKata) return 95;
  // よみがな前方一致（苗字部分）
  if (normKanaHira.startsWith(qHira) || normKana.startsWith(qKata)) return 88;
  if (lastNameKanaHira.startsWith(qHira) || lastNameKana.startsWith(qKata)) return 85;
  // よみがな部分一致
  if (normKana.includes(q) || normKanaHira.includes(q) || normKanaHira.includes(qHira)) return 80;
  if (lastNameKana.includes(q) || lastNameKanaHira.includes(qHira)) return 75;
  // 漢字名前一致
  if (normName.includes(q)) return 72;
  if (q.includes(normName)) return 70;
  if (lastName === q) return 68;
  if (lastName.includes(q) || q.includes(lastName)) return 60;
  // よみがなの逆包含
  if (qHira.includes(normKanaHira) || qKata.includes(normKana)) return 45;
  return 0;
};

/** スコア0でも部分一致で近似候補を探す（サジェスト用） */
const findFuzzyMatches = (
  query: string,
  patients: PatientEntry[],
  maxResults = 3
): PatientEntry[] => {
  if (!query || query.length < 1) return [];
  const q = normalizeVoice(query);
  if (!q) return [];
  // 部分文字列マッチ（1文字以上共通）
  const scored = patients.map(p => {
    const normName = normalizeVoice(p.name);
    const normKana = p.nameKana ? normalizeVoice(p.nameKana) : "";
    const lastName = normName.split(/[\s　]+/)[0];
    let score = 0;
    // 1文字以上共通する文字数でスコアリング
    for (let len = Math.min(q.length, 3); len >= 1; len--) {
      for (let i = 0; i <= q.length - len; i++) {
        const sub = q.slice(i, i + len);
        if (normName.includes(sub) || normKana.includes(sub) || lastName.includes(sub)) {
          score = Math.max(score, len * 10);
        }
      }
    }
    return { p, score };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
  return scored.slice(0, maxResults).map(x => x.p);
};

const findBestMatches = (
  alternatives: Array<{ transcript: string; confidence: number }>,
  patients: PatientEntry[],
  teamFilter?: Team | null
): { matches: PatientEntry[]; usedTranscript: string; detectedTeam: Team | null; bestScore: number } => {
  let bestMatches: PatientEntry[] = [];
  let bestScore = 0;
  let bestTranscript = alternatives[0]?.transcript || "";
  let bestTeam: Team | null = null;
  for (const alt of alternatives) {
    const raw = alt.transcript.trim();
    const { team: detectedTeam, rest } = extractTeamFromVoice(raw);
    const effectiveTeam = teamFilter || detectedTeam;
    const searchBase = effectiveTeam ? patients.filter(p => p.team === effectiveTeam) : patients;
    const scored = searchBase.map(p => ({ p, score: scorePatient(p, rest) })).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
    if (scored.length > 0 && scored[0].score > bestScore) {
      bestScore = scored[0].score;
      bestTranscript = rest;
      bestTeam = detectedTeam;
      const topScore = scored[0].score;
      bestMatches = scored.filter(x => x.score >= topScore - 10).map(x => x.p);
    }
  }
  return { matches: bestMatches, usedTranscript: bestTranscript, detectedTeam: bestTeam, bestScore };
};

const MAX_SLOTS = 8;
const CONTINUOUS_SILENCE_TIMEOUT_MS = 10000; // 無音10秒で自動停止

type VisitSlotData = {
  team: Team | "";
  patientId: number | null;
  patientName: string;
  nextVisitDate?: string;
  nextVisitTime?: string;
  /** 「日時変更→連絡・予定から変更」チェック時はtrue。次回訪問日時の入力・スプレッドシート転記をスキップする */
  skipNextVisit?: boolean;
};

const DEFAULT_SLOT: VisitSlotData = { team: "", patientId: null, patientName: "", nextVisitDate: "", nextVisitTime: "", skipNextVisit: false };

const SLOTS_STORAGE_KEY = "hinata_visit_slots";

// モジュールレベル変数：コンポーネントのアンマウント・再マウント後も値が保持される
// タブ切り替え後に再度DBから古いデータが読み込まれる問題を防ぐ
let _dbSlotLoadedDate = ""; // 読み込み済みの日付キー（日付が変わったときのみ再読み込みを許可）

/** JSTの今日の日付を YYYY-MM-DD 形式で返す */
function getTodayJstKey(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

export default function RecordInput() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  // 今日のJST日付キー（YYYY-MM-DD）
  const [todayKey, setTodayKey] = useState(() => getTodayJstKey());

  // 8枠分の訪問予定データ（初期値はlocalStorageから）
  const [slots, setSlots] = useState<VisitSlotData[]>(() => {
    try {
      const raw = localStorage.getItem(SLOTS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length === MAX_SLOTS) return parsed;
      }
    } catch {}
    return Array.from({ length: MAX_SLOTS }, () => ({ ...DEFAULT_SLOT }));
  });

  // DBから今日のスロット順番を復元する
  // モジュールレベル変数_dbSlotLoadedDateで管理することで、タブ切り替え後の再マウント時にも状態が保持される
  const { data: dbSlotData } = trpc.visitSlots.load.useQuery(
    { dateKey: todayKey },
    { enabled: !!user, staleTime: 0 }
  );
  useEffect(() => {
    // 同じ日付のデータが既に読み込み済みなら上書きしない
    if (_dbSlotLoadedDate === todayKey) return;
    if (!dbSlotData) return;
    if (dbSlotData.slotsJson) {
      try {
        const parsed = JSON.parse(dbSlotData.slotsJson);
        if (Array.isArray(parsed) && parsed.length === MAX_SLOTS) {
          setSlots(parsed);
          setSlotSearchQueries(parsed.map((s: VisitSlotData) => s.patientName || ""));
          localStorage.setItem(SLOTS_STORAGE_KEY, dbSlotData.slotsJson);
        }
      } catch {}
    }
    _dbSlotLoadedDate = todayKey;
  }, [dbSlotData, todayKey]);

  // DBへの保存mutation
  const saveSlotsMutation = trpc.visitSlots.save.useMutation();

  // ログインユーザーの所属チームを初期値に自動設定
  useEffect(() => {
    if (!user?.team) return;
    const validTeams: Team[] = ["身体", "天理", "郡山北部", "郡山南部"];
    if (validTeams.includes(user.team as Team)) {
      setSlots(prev => {
        // 全枠が未設定の場合のみ、ユーザーのチームをデフォルト設定
        const allEmpty = prev.every(s => s.team === "");
        if (!allEmpty) return prev;
        return prev.map(s => ({ ...s, team: user.team as Team }));
      });
    }
  }, [user?.team]);

  // スロットデータの変更をlocalStorageとDBに即時保存
  // dbLoadedチェックを削除し、userがいれば常にDBに保存する（リセット時も確実に保存）
  useEffect(() => {
    const json = JSON.stringify(slots);
    try {
      localStorage.setItem(SLOTS_STORAGE_KEY, json);
    } catch {}
    if (!user) return;
    saveSlotsMutation.mutate({ dateKey: todayKey, slotsJson: json });
  }, [slots]);

  // スロットデータの更新ハンドラ
  const handleSlotChange = (index: number, data: Partial<VisitSlotData>) => {
    setSlots(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...data };
      return next;
    });
  };

  // スロットの順番入れ替え
  const swapSlots = (indexA: number, indexB: number) => {
    if (indexA < 0 || indexB < 0 || indexA >= MAX_SLOTS || indexB >= MAX_SLOTS) return;
    setSlots(prev => {
      const next = [...prev];
      [next[indexA], next[indexB]] = [next[indexB], next[indexA]];
      return next;
    });
    setSlotSearchQueries(prev => {
      const next = [...prev];
      [next[indexA], next[indexB]] = [next[indexB], next[indexA]];
      return next;
    });
    setSlotShowLists(prev => {
      const next = [...prev];
      [next[indexA], next[indexB]] = [next[indexB], next[indexA]];
      return next;
    });
  };

  // dnd-kit センサー設定（タッチ対応・iOS対応）
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  // ドラッグ終了時の処理
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeIndex = Number(active.id);
    const overIndex = Number(over.id);
    if (activeIndex < 0 || overIndex < 0 || activeIndex >= MAX_SLOTS || overIndex >= MAX_SLOTS) return;
    setSlots(prev => arrayMove(prev, activeIndex, overIndex));
    setSlotSearchQueries(prev => arrayMove(prev, activeIndex, overIndex));
    setSlotShowLists(prev => arrayMove(prev, activeIndex, overIndex));
  };

  // 全利用者リスト（利用者選択UI用）
  const { data: allPatients = [] } = trpc.patients.list.useQuery({});

  // 各枠の利用者選択UI用state（8枠分）
  const [slotSearchQueries, setSlotSearchQueries] = useState<string[]>(
    () => Array.from({ length: MAX_SLOTS }, (_, i) => slots[i]?.patientName || "")
  );
  const [slotShowLists, setSlotShowLists] = useState<boolean[]>(
    () => Array.from({ length: MAX_SLOTS }, () => false)
  );

  // 日付変更検知（JST基準、1分ごとにチェック）
  useEffect(() => {
    const checkDateChange = () => {
      const newKey = getTodayJstKey();
      setTodayKey(prev => {
        if (prev === newKey) return prev;
        // 日付が変わったらスロットをリセット
        const empty = Array.from({ length: MAX_SLOTS }, () => ({ ...DEFAULT_SLOT }));
        setSlots(empty);
        setSlotSearchQueries(Array.from({ length: MAX_SLOTS }, () => ""));
        setSlotShowLists(Array.from({ length: MAX_SLOTS }, () => false));
        localStorage.removeItem(SLOTS_STORAGE_KEY);
        _dbSlotLoadedDate = ""; // 新しい日付のDBデータを再取得
        toast.success(`日付が変わりました（${newKey}）。訪問予定をリセットしました。`);
        return newKey;
      });
    };
    const timer = setInterval(checkDateChange, 60_000); // 1分ごとに日付変更を検知
    return () => clearInterval(timer);
  }, []);

  // 各枠の利用者検索クエリリ
  const slotPatientQueries = useMemo(() => slotSearchQueries, [slotSearchQueries]);

  // 管理者が選択したプロンプトを取得
  const { data: selectedPromptIdData } = trpc.sharedPrompts.getSelectedId.useQuery();
  const { data: allPrompts = [] } = trpc.sharedPrompts.getAll.useQuery();
  const setSelectedPromptIdMutation = trpc.sharedPrompts.setSelectedId.useMutation({
    onSuccess: () => {
      utils.sharedPrompts.getSelectedId.invalidate();
      toast.success("プロンプトを設定しました");
    },
    onError: (err) => toast.error(`設定エラー: ${err.message}`),
  });

  const selectedPromptBody = useMemo(() => {
    if (!selectedPromptIdData?.promptId) return null;
    const found = allPrompts.find(p => p.id === selectedPromptIdData.promptId);
    return found?.body ?? null;
  }, [selectedPromptIdData, allPrompts]);

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  // 全枠リセット
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetConfirmChecked, setResetConfirmChecked] = useState(false);

  const handleResetAll = () => {
    setShowResetConfirm(true);
    return;
  };

  const executeResetAll = () => {
    // スロットデータをリセット
    const empty = Array.from({ length: MAX_SLOTS }, () => ({ ...DEFAULT_SLOT }));
    const emptyJson = JSON.stringify(empty);
    // localStorageを空データで上書き（削除ではなく上書き）
    // タブ切り替え後の再マウント時にuseState初期化でも空データが読み込まれるようにする
    try {
      localStorage.setItem(SLOTS_STORAGE_KEY, emptyJson);
    } catch {}
    for (let i = 0; i < MAX_SLOTS; i++) {
      localStorage.removeItem(`hinata_visit_card_${i}`);
    }
    // setSlots(empty)によりslots変更検知useEffectが発火してDBに自動保存される
    // dbLoadedをtrueに保ち、invalidate後のDB再取得でリセット済みデータが上書きされないようにする
    setSlots(empty);
    setSlotSearchQueries(Array.from({ length: MAX_SLOTS }, () => ""));
    setSlotShowLists(Array.from({ length: MAX_SLOTS }, () => false));
    // VisitSlotCardを再マウントして全stateを初期化
    setCardResetKey(k => k + 1);
    toast.success("訪問時チェック項目を全てリセットしました");
  };

  const setSlotSearch = useCallback((index: number, query: string) => {
    setSlotSearchQueries(prev => {
      const next = [...prev];
      next[index] = query;
      return next;
    });
  }, []);

  const setSlotShowList = (index: number, show: boolean) => {
    setSlotShowLists(prev => {
      const next = [...prev];
      next[index] = show;
      return next;
    });
  };

  const [cardResetKey, setCardResetKey] = useState(0);

  const filledSlots = slots.filter(s => s.patientName).length;

  // ===== ヘッダー手動検索フィールド =====
  const [headerSearchQuery, setHeaderSearchQuery] = useState("");
  const [headerSearchResults, setHeaderSearchResults] = useState<PatientEntry[]>([]);
  const [showHeaderSearchResults, setShowHeaderSearchResults] = useState(false);
  const headerSearchRef = useRef<HTMLDivElement>(null);

  // ヘッダー検索クエリが変わったら候補を更新
  useEffect(() => {
    if (!headerSearchQuery.trim()) {
      setHeaderSearchResults([]);
      setShowHeaderSearchResults(false);
      return;
    }
    const q = headerSearchQuery.toLowerCase();
    const results = allPatients.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.nameKana && p.nameKana.toLowerCase().includes(q))
    ).slice(0, 8);
    setHeaderSearchResults(results);
    setShowHeaderSearchResults(results.length > 0);
  }, [headerSearchQuery, allPatients]);

  // ヘッダー検索で利用者を選択 → 空き枠に入力
  const handleHeaderSearchSelect = useCallback((p: PatientEntry) => {
    const emptySlotIndex = slots.findIndex(s => !s.patientName);
    if (emptySlotIndex === -1) {
      toast.warning("全ての枠が埋まっています");
      return;
    }
    handleSlotChange(emptySlotIndex, {
      team: (p.team as Team) || "",
      patientId: p.id,
      patientName: p.name,
    });
    setSlotSearch(emptySlotIndex, p.name);
    setHeaderSearchQuery("");
    setHeaderSearchResults([]);
    setShowHeaderSearchResults(false);
    toast.success(`枠${emptySlotIndex + 1}に「${p.name}」を入力しました`);
  }, [slots]);

  // ===== 訪問予定テキスト AI解析 =====
  const [planText, setPlanText] = useState("");
  const visitPlanParserMutation = trpc.visitPlanParser.parse.useMutation({
    onSuccess: (data) => {
      if (!data.visits || data.visits.length === 0) {
        toast.warning("利用者情報を抽出できませんでした");
        return;
      }
      // 空きスロットに順次反映
      const emptySlots: number[] = [];
      slots.forEach((s, i) => {
        if (!s.patientName) emptySlots.push(i);
      });
      if (emptySlots.length === 0) {
        toast.warning("全ての枠が埋まっています");
        return;
      }
      let appliedCount = 0;
      let unmatchedCount = 0;
      const visitsToApply = data.visits.slice(0, emptySlots.length);
      visitsToApply.forEach((v, idx) => {
        const slotIdx = emptySlots[idx];
        if (slotIdx === undefined) return;
        handleSlotChange(slotIdx, {
          team: (v.team as Team) || "",
          patientId: v.patientId,
          patientName: v.patientName,
          nextVisitDate: v.nextVisitDate || "",
          nextVisitTime: v.nextVisitTime || "",
        });
        if (v.patientName) {
          setSlotSearch(slotIdx, v.patientName);
        }
        appliedCount++;
        if (!v.matched) unmatchedCount++;
      });
      const overflowCount = data.visits.length - visitsToApply.length;
      let msg = `${appliedCount}件を反映しました`;
      if (unmatchedCount > 0) msg += `（${unmatchedCount}件は未マッチ`;
      if (overflowCount > 0) msg += `${unmatchedCount > 0 ? "・" : "（"}${overflowCount}件は枠不足で未反映`;
      if (unmatchedCount > 0 || overflowCount > 0) msg += "）";
      toast.success(msg);
      setPlanText(""); // 反映後はクリア
    },
    onError: (err) => {
      toast.error(`AI解析エラー: ${err.message}`);
    },
  });

  const handleParsePlanText = useCallback(() => {
    if (!planText.trim()) {
      toast.warning("テキストを入力してください");
      return;
    }
    visitPlanParserMutation.mutate({ text: planText });
  }, [planText, visitPlanParserMutation]);

  // ヘッダー検索フィールド外クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (headerSearchRef.current && !headerSearchRef.current.contains(e.target as Node)) {
        setShowHeaderSearchResults(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ===== 一括音声入力 =====
  const [isBulkListening, setIsBulkListening] = useState(false);
  const bulkRecognitionRef = useRef<SpeechRecognitionType | null>(null);
  const bulkSilenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bulkManualStopRef = useRef(false); // 手動停止フラグ（trueのときonendで再起動しない）
  const [bulkRecognizedCount, setBulkRecognizedCount] = useState(0); // 連続モードで認識した名前数
  // スロットのrefリスト（次の空き枠へのスクロール用）
  const slotRefs = useRef<Array<HTMLDivElement | null>>(Array.from({ length: MAX_SLOTS }, () => null));
  // 一括音声入力で複数候補が出た場合のモーダル
  const [bulkCandidates, setBulkCandidates] = useState<PatientEntry[]>([]);
  const [bulkCandidateSlotIndex, setBulkCandidateSlotIndex] = useState<number>(-1);
  // 録音中に発生した複数候補をキューに保留（録音停止後にまとめて表示）
  const pendingCandidateQueueRef = useRef<Array<{ candidates: PatientEntry[]; slotIndex: number; query: string }>>([]);
  // 一括音声入力で候補なし時のサジェスト
  const [bulkSuggestCandidates, setBulkSuggestCandidates] = useState<PatientEntry[]>([]);
  const [bulkSuggestQuery, setBulkSuggestQuery] = useState("");
  const [bulkSuggestSlotIndex, setBulkSuggestSlotIndex] = useState<number>(-1);

  const startBulkVoiceInput = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("このブラウザは音声入力に対応していません");
      return;
    }
    if (isBulkListening) {
      bulkManualStopRef.current = true; // 手動停止フラグを立てる
      bulkRecognitionRef.current?.stop();
      setIsBulkListening(false);
      return;
    }
    bulkManualStopRef.current = false; // 新規開始時はフラグをリセット
    const recognition = new SpeechRecognition();
    recognition.lang = "ja-JP";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 5;
    bulkRecognitionRef.current = recognition;

    recognition.onstart = () => {
      setIsBulkListening(true);
      setBulkRecognizedCount(0);
      // 録音開始時に候補キューをリセット
      pendingCandidateQueueRef.current = [];
      // 最初の無音タイムアウトをセット（発話が始まらない場合の保険）
      bulkSilenceTimerRef.current = setTimeout(() => {
        recognition.stop();
      }, CONTINUOUS_SILENCE_TIMEOUT_MS * 2);
    };
    recognition.onend = () => {
      // 手動停止フラグが立っている場合は完全停止
      if (bulkManualStopRef.current) {
        bulkManualStopRef.current = false;
        setIsBulkListening(false);
        if (bulkSilenceTimerRef.current) {
          clearTimeout(bulkSilenceTimerRef.current);
          bulkSilenceTimerRef.current = null;
        }
        // 録音停止後にキューの先頭の候補モーダルを表示
        const queue = pendingCandidateQueueRef.current;
        if (queue.length > 0) {
          const first = queue[0];
          setBulkCandidates(first.candidates);
          setBulkCandidateSlotIndex(first.slotIndex);
          toast.info(`「${first.query}」の候補が${first.candidates.length}件あります。選択してください`);
        }
        return;
      }
      // 自動終了（無音タイムアウトまたはブラウザの自動停止）の場合は再起動する
      // 無音タイマーが発火した場合（タイマーがない）は完全停止
      if (!bulkSilenceTimerRef.current) {
        // 無音タイムアウトによる停止 → 完全停止
        setIsBulkListening(false);
        const queue = pendingCandidateQueueRef.current;
        if (queue.length > 0) {
          const first = queue[0];
          setBulkCandidates(first.candidates);
          setBulkCandidateSlotIndex(first.slotIndex);
          toast.info(`「${first.query}」の候補が${first.candidates.length}件あります。選択してください`);
        }
        return;
      }
      // ブラウザの自動停止（発話の間の無音など） → 再起動して連続認識を維持
      try {
        recognition.start();
      } catch {
        // 再起動失敗時は完全停止
        setIsBulkListening(false);
        if (bulkSilenceTimerRef.current) {
          clearTimeout(bulkSilenceTimerRef.current);
          bulkSilenceTimerRef.current = null;
        }
      }
    };
    recognition.onerror = (e: any) => {
      if (bulkManualStopRef.current) return; // 手動停止時はエラー無視
      // no-speechエラー（発話なし）は再起動で対応
      if (e.error === "no-speech") {
        if (bulkSilenceTimerRef.current) {
          // タイマーがまだ生きている場合は再起動
          try { recognition.start(); } catch { /* 無視 */ }
        }
        return;
      }
      // その他のエラーは完全停止
      setIsBulkListening(false);
      if (bulkSilenceTimerRef.current) {
        clearTimeout(bulkSilenceTimerRef.current);
        bulkSilenceTimerRef.current = null;
      }
      toast.error("音声認識に失敗しました");
    };
    recognition.onresult = (event: any) => {
      // 無音タイマーをリセット（発話が来たので延長）
      if (bulkSilenceTimerRef.current) clearTimeout(bulkSilenceTimerRef.current);
      bulkSilenceTimerRef.current = setTimeout(() => {
        recognition.stop();
      }, CONTINUOUS_SILENCE_TIMEOUT_MS);

      const resultSet = event.results[event.results.length - 1];
      // 全認識候補を収集
      const alternatives: Array<{ transcript: string; confidence: number }> = [];
      for (let i = 0; i < resultSet.length; i++) {
        alternatives.push({ transcript: resultSet[i].transcript, confidence: resultSet[i].confidence });
      }

      const rawTranscript = alternatives[0]?.transcript || "";

      // ===== 複数人名分割処理 =====
      // まずチーム名を除去してから複数人名に分割
      const { rest: transcriptWithoutTeam } = extractTeamFromVoice(rawTranscript);
      const nameTokens = splitMultipleNames(transcriptWithoutTeam || rawTranscript);

      // 複数名が検出された場合は順番に処理
      if (nameTokens.length > 1) {
        let successCount = 0;
        // 現在の空き枠インデックスを追跡
        const currentSlots = [...slots];
        for (const namePart of nameTokens) {
          const emptyIdx = currentSlots.findIndex(s => !s.patientName);
          if (emptyIdx === -1) break;
          const nameAlts = [{ transcript: namePart, confidence: 1.0 }];
          const { matches, usedTranscript: usedName } = findBestMatches(nameAlts, allPatients, null);
          if (matches.length === 1) {
            handleSlotChange(emptyIdx, {
              team: (matches[0].team as Team) || "",
              patientId: matches[0].id,
              patientName: matches[0].name,
            });
            setSlotSearch(emptyIdx, matches[0].name);
            // 仮想的にスロットを埋めたとしてマーク
            currentSlots[emptyIdx] = { ...currentSlots[emptyIdx], patientName: matches[0].name };
            successCount++;
            setBulkRecognizedCount(c => c + 1);
            // 次の空き枠にスクロール
            const nextEmptyIdx = currentSlots.findIndex((s, i) => i > emptyIdx && !s.patientName);
            if (nextEmptyIdx >= 0) {
              setTimeout(() => {
                slotRefs.current[nextEmptyIdx]?.scrollIntoView({ behavior: "smooth", block: "center" });
              }, 300);
            }
          } else if (matches.length > 1) {
            // 複数候補 → 録音中はキューに保留（録音停止後にまとめて表示）
            pendingCandidateQueueRef.current.push({ candidates: matches, slotIndex: emptyIdx, query: namePart });
            currentSlots[emptyIdx] = { ...currentSlots[emptyIdx], patientName: "__pending__" };
          }
        }
        if (successCount > 0) {
          toast.success(`${successCount}名を訪問予定に追加しました`);
        }
        return;
      }

      // ===== 1人分の処理（従来通り） =====
      const emptySlotIndex = slots.findIndex(s => !s.patientName);
      if (emptySlotIndex === -1) {
        toast.warning("全ての枠が埋まっています");
        return;
      }
      const { matches, usedTranscript, bestScore } = findBestMatches(alternatives, allPatients, null);
      if (matches.length === 1) {
        handleSlotChange(emptySlotIndex, {
          team: (matches[0].team as Team) || "",
          patientId: matches[0].id,
          patientName: matches[0].name,
        });
        setSlotSearch(emptySlotIndex, matches[0].name);
        setBulkRecognizedCount(c => c + 1);
        toast.success(`枠${emptySlotIndex + 1}に「${matches[0].name}」を入力しました`);
        // 次の空き枠にスクロール
        const nextEmptyIdxSingle = slots.findIndex((s, i) => i > emptySlotIndex && !s.patientName);
        if (nextEmptyIdxSingle >= 0) {
          setTimeout(() => {
            slotRefs.current[nextEmptyIdxSingle]?.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 300);
        }
      } else if (matches.length > 1) {
        // 複数候補 → 録音中はキューに保留（録音停止後にまとめて表示）
        pendingCandidateQueueRef.current.push({ candidates: matches, slotIndex: emptySlotIndex, query: usedTranscript });
        // 仮押さえ（__pending__）としてマーク
        setSlots(prev => {
          const next = [...prev];
          next[emptySlotIndex] = { ...next[emptySlotIndex], patientName: "__pending__" };
          return next;
        });
      } else {
        // 候補なし → 近似候補をサジェスト
        const { team: detectedTeam, rest } = extractTeamFromVoice(alternatives[0]?.transcript || "");
        const searchBase = detectedTeam ? allPatients.filter(p => p.team === detectedTeam) : allPatients;
        const fuzzy = findFuzzyMatches(rest || usedTranscript, searchBase, 5);
        if (fuzzy.length > 0) {
          setBulkSuggestCandidates(fuzzy);
          setBulkSuggestQuery(usedTranscript);
          setBulkSuggestSlotIndex(emptySlotIndex);
          toast.warning(`「${usedTranscript}」に完全一致する利用者が見つかりません。近い候補を表示します`);
        } else {
          toast.warning(`「${usedTranscript}」に一致する利用者が見つかりません`);
        }
      }
    };
    recognition.start();
  }, [isBulkListening, allPatients, slots, handleSlotChange, setSlotSearch]);

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4 pb-20">
      <div className="flex items-center gap-2 mb-2">
        <ClipboardEdit className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-bold">訪問時チェック項目</h1>
      </div>

      {/* ===== 今日の訪問予定セクション ===== */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-1.5">
            {/* 1行目：タイトル */}
            <div className="flex items-center justify-between gap-2 min-w-0">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 min-w-0">
                <Users className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="whitespace-nowrap">今日の訪問予定</span>
                {filledSlots > 0 && (
                  <Badge variant="secondary" className="text-xs flex-shrink-0">
                    {filledSlots}名
                  </Badge>
                )}
                {/* 保存状態インジケーター */}
                {saveSlotsMutation.isPending && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground ml-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span className="hidden sm:inline">保存中…</span>
                  </span>
                )}
                {!saveSlotsMutation.isPending && saveSlotsMutation.isSuccess && (
                  <span className="flex items-center gap-1 text-xs text-green-500 ml-1">
                    <Check className="w-3 h-3" />
                    <span className="hidden sm:inline">保存済</span>
                  </span>
                )}
              </CardTitle>
            </div>
            {/* 2行目：ボタン群 */}
            <div className="flex items-center gap-1.5 flex-wrap">
                {/* ZESTボタン */}
                <a
                  href="https://homecare.zest.jp/login"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 h-8 px-2.5 rounded-full border text-xs font-medium transition-colors flex-shrink-0 bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-400 dark:bg-emerald-900/30 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-800/50"
                  title="ZESTを開く"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="whitespace-nowrap">ZEST</span>
                </a>
                {/* 一括音声入力ボタン（ラベル付き） */}
                <button
                  type="button"
                  onClick={startBulkVoiceInput}
                  className={cn(
                    "flex items-center gap-1 h-8 px-2.5 rounded-full border text-xs font-medium transition-colors flex-shrink-0",
                    isBulkListening
                      ? "bg-orange-500 border-orange-500 text-white animate-pulse"
                      : "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20 hover:border-primary/50 active:scale-95"
                  )}
                  title="一括音声入力"
                >
                  {isBulkListening ? (
                    <MicOff className="w-3.5 h-3.5" />
                  ) : (
                    <Mic className="w-3.5 h-3.5" />
                  )}
                  <span className="whitespace-nowrap">一括入力</span>
                </button>
                {/* 全リセットボタン */}
                <button
                  type="button"
                  onClick={handleResetAll}
                  title="全リセット"
                  className="flex items-center gap-1 h-8 px-2.5 rounded-full border border-destructive/50 bg-destructive/10 text-destructive text-xs font-medium hover:bg-destructive hover:text-white hover:border-destructive active:scale-95 transition-all flex-shrink-0"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                  <span className="whitespace-nowrap">全リセット</span>
                </button>
            </div>
            {/* 訪問予定テキストAI解析 */}
            <div className="flex flex-col gap-1.5 p-2 rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-900/10">
              <div className="flex items-center gap-1.5 text-xs text-purple-900 dark:text-purple-300">
                <Sparkles className="w-3.5 h-3.5" />
                <span className="font-semibold">今日の訪問予定をAIで解析</span>
                <span className="text-[10px] text-muted-foreground">（利用者名と次回訪問日時を貼り付け）</span>
              </div>
              <Textarea
                value={planText}
                onChange={(e) => setPlanText(e.target.value)}
                placeholder="例:&#10;田中花子さん 14:00&#10;佐藤太郎さん 次回 5/8 10時&#10;鈴木一郎さん 5月10日午後2時"
                rows={3}
                className="text-xs resize-y min-h-[60px]"
                disabled={visitPlanParserMutation.isPending}
              />
              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={handleParsePlanText}
                  disabled={visitPlanParserMutation.isPending || !planText.trim()}
                  size="sm"
                  className="h-8 px-3 bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {visitPlanParserMutation.isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                      <span className="text-xs">解析中...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 mr-1" />
                      <span className="text-xs">AI解析して反映</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
            {/* 3行目：検索フィールド */}
            <div className="relative" ref={headerSearchRef}>
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-6 pr-2 text-xs h-7 w-full"
              placeholder="名前で検索して追加..."
              value={headerSearchQuery}
              onChange={(e) => setHeaderSearchQuery(e.target.value)}
              onFocus={() => {
                if (headerSearchResults.length > 0) setShowHeaderSearchResults(true);
              }}
            />
            {headerSearchQuery && (
              <button
                type="button"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setHeaderSearchQuery("");
                  setHeaderSearchResults([]);
                  setShowHeaderSearchResults(false);
                }}
              >
                <X className="w-3 h-3" />
              </button>
            )}
            {/* 検索結果ドロップダウン */}
            {showHeaderSearchResults && headerSearchResults.length > 0 && (
              <div className="absolute z-50 top-full mt-1 left-0 right-0 border rounded-md bg-background shadow-lg max-h-52 overflow-y-auto">
                {headerSearchResults.map((p) => (
                  <button
                    key={p.id}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-muted flex items-center justify-between border-b last:border-b-0 transition-colors"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleHeaderSearchSelect(p);
                    }}
                  >
                    <span className="font-medium">{p.name}</span>
                    {p.team && (
                      <span className="text-muted-foreground bg-muted px-1.5 py-0.5 rounded text-[10px]">{p.team}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            </div>
            <p className="text-xs text-muted-foreground">訪問する順番に利用者を選択してください（最大８名）</p>
            <p className="text-xs text-blue-600 dark:text-blue-400">ℹ️ 訪問利用者を選択したときに登録されている利用者タスクが反映されます</p>
          </div>{/* end flex-col gap-1.5 */}
        </CardHeader>
        <CardContent className="space-y-3">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={slots.map((_, i) => i)}
              strategy={verticalListSortingStrategy}
            >
              {slots.map((slot, index) => {
                const selectedSlots = slots.filter(s => !!s.patientName);
                const selectedCount = selectedSlots.length;
                const selectedIndex = selectedSlots.findIndex((_, si) => {
                  // 選択済みスロットの中でのインデックスを計算
                  let cnt = 0;
                  for (let i = 0; i < slots.length; i++) {
                    if (slots[i].patientName) {
                      if (i === index) return cnt === si;
                      cnt++;
                    }
                  }
                  return false;
                });
                return (
                  <SlotSelector
                    key={index}
                    index={index}
                    slot={slot}
                    allPatients={allPatients}
                    searchQuery={slotPatientQueries[index]}
                    showList={slotShowLists[index]}
                    onSearchChange={(q) => setSlotSearch(index, q)}
                    onShowListChange={(show) => setSlotShowList(index, show)}
                    onSlotChange={(data) => handleSlotChange(index, data)}
                    slotRef={(el) => { slotRefs.current[index] = el; }}
                    onCandidateSelected={() => {
                      const nextIdx = slots.findIndex((s, i) => i > index && !s.patientName);
                      if (nextIdx >= 0) {
                        setTimeout(() => {
                          slotRefs.current[nextIdx]?.scrollIntoView({ behavior: "smooth", block: "center" });
                        }, 300);
                      }
                    }}
                    onMoveUp={slot.patientName ? () => {
                      // 前の選択済みスロットと入れ替え
                      let prevSelected = -1;
                      for (let i = index - 1; i >= 0; i--) {
                        if (slots[i].patientName) { prevSelected = i; break; }
                      }
                      if (prevSelected >= 0) swapSlots(prevSelected, index);
                    } : undefined}
                    onMoveDown={slot.patientName ? () => {
                      // 次の選択済みスロットと入れ替え
                      let nextSelected = -1;
                      for (let i = index + 1; i < slots.length; i++) {
                        if (slots[i].patientName) { nextSelected = i; break; }
                      }
                      if (nextSelected >= 0) swapSlots(index, nextSelected);
                    } : undefined}
                    canMoveUp={slot.patientName ? slots.slice(0, index).some(s => !!s.patientName) : false}
                    canMoveDown={slot.patientName ? slots.slice(index + 1).some(s => !!s.patientName) : false}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
        </CardContent>
      </Card>

      {/* 一括音声入力の複数候補選択モーダル（画面上部固定） */}
      {bulkCandidates.length > 0 && bulkCandidateSlotIndex >= 0 && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-4 px-4 bg-black/40" onClick={() => {
          // 選択しない場合は__pending__をクリアしてキューを消化
          setSlots(prev => {
            const next = [...prev];
            if (next[bulkCandidateSlotIndex]?.patientName === "__pending__") {
              next[bulkCandidateSlotIndex] = { ...next[bulkCandidateSlotIndex], patientName: "", patientId: null };
            }
            return next;
          });
          setBulkCandidates([]);
          setBulkCandidateSlotIndex(-1);
          // 次のキューを表示
          const queue = pendingCandidateQueueRef.current;
          const remaining = queue.filter(q => q.slotIndex !== bulkCandidateSlotIndex);
          pendingCandidateQueueRef.current = remaining;
          if (remaining.length > 0) {
            const next = remaining[0];
            setTimeout(() => {
              setBulkCandidates(next.candidates);
              setBulkCandidateSlotIndex(next.slotIndex);
              toast.info(`「${next.query}」の候補が${next.candidates.length}件あります。選択してください`);
            }, 100);
          }
        }}>
          <div className="bg-background rounded-xl shadow-2xl border border-border p-4 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-bold">候補を選択してください</h3>
                {pendingCandidateQueueRef.current.length > 1 && (
                  <p className="text-xs text-muted-foreground mt-0.5">残り{pendingCandidateQueueRef.current.length}件の候補確認があります</p>
                )}
              </div>
              <button onClick={() => {
                setSlots(prev => {
                  const next = [...prev];
                  if (next[bulkCandidateSlotIndex]?.patientName === "__pending__") {
                    next[bulkCandidateSlotIndex] = { ...next[bulkCandidateSlotIndex], patientName: "", patientId: null };
                  }
                  return next;
                });
                setBulkCandidates([]);
                setBulkCandidateSlotIndex(-1);
                pendingCandidateQueueRef.current = [];
              }} className="text-muted-foreground hover:text-foreground p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">枠{bulkCandidateSlotIndex + 1}に入力する利用者を選んでください</p>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {bulkCandidates.map((p) => (
                <button
                  key={p.id}
                  className="w-full text-left px-3 py-2.5 rounded-lg border hover:bg-primary/10 hover:border-primary/40 transition-colors flex items-center justify-between"
                  onClick={() => {
                    const selectedSlotIndex = bulkCandidateSlotIndex;
                    handleSlotChange(selectedSlotIndex, {
                      team: (p.team as Team) || "",
                      patientId: p.id,
                      patientName: p.name,
                    });
                    setSlotSearch(selectedSlotIndex, p.name);
                    setBulkRecognizedCount(c => c + 1);
                    toast.success(`枠${selectedSlotIndex + 1}に「${p.name}」を入力しました`);
                    // 現在のキューから処理済みを削除
                    const queue = pendingCandidateQueueRef.current;
                    const remaining = queue.filter(q => q.slotIndex !== selectedSlotIndex);
                    pendingCandidateQueueRef.current = remaining;
                    setBulkCandidates([]);
                    setBulkCandidateSlotIndex(-1);
                    // 次のキューを表示
                    if (remaining.length > 0) {
                      const nextQ = remaining[0];
                      setTimeout(() => {
                        setBulkCandidates(nextQ.candidates);
                        setBulkCandidateSlotIndex(nextQ.slotIndex);
                        toast.info(`「${nextQ.query}」の候補が${nextQ.candidates.length}件あります。選択してください`);
                      }, 150);
                    } else {
                      // 全ての候補確認が完了
                      const nextEmptyIdxModal = slots.findIndex((s, i) => i > selectedSlotIndex && !s.patientName && s.patientName !== "__pending__");
                      if (nextEmptyIdxModal >= 0) {
                        setTimeout(() => {
                          slotRefs.current[nextEmptyIdxModal]?.scrollIntoView({ behavior: "smooth", block: "center" });
                        }, 300);
                      }
                    }
                  }}
                >
                  <span className="text-sm font-medium">{p.name}</span>
                  {p.team && (
                    <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{p.team}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 一括音声入力の近似候補サジェストモーダル（画面上部固定） */}
      {bulkSuggestCandidates.length > 0 && bulkSuggestSlotIndex >= 0 && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-4 px-4 bg-black/40" onClick={() => setBulkSuggestCandidates([])}>
          <div className="bg-background rounded-xl shadow-2xl border border-border p-4 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold flex items-center gap-1.5">
                <Search className="w-4 h-4 text-amber-500" />
                もしかして？
              </h3>
              <button onClick={() => setBulkSuggestCandidates([])} className="text-muted-foreground hover:text-foreground p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              「{bulkSuggestQuery}」に完全一致する利用者が見つかりませんでした。<br />
              近い候補を選択してください（枠{bulkSuggestSlotIndex + 1}）
            </p>
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {bulkSuggestCandidates.map((p) => (
                <button
                  key={p.id}
                  className="w-full text-left px-3 py-2.5 rounded-lg border border-amber-200 hover:bg-amber-50 hover:border-amber-400 dark:border-amber-800 dark:hover:bg-amber-950/30 transition-colors flex items-center justify-between"
                  onClick={() => {
                    handleSlotChange(bulkSuggestSlotIndex, {
                      team: (p.team as Team) || "",
                      patientId: p.id,
                      patientName: p.name,
                    });
                    setSlotSearch(bulkSuggestSlotIndex, p.name);
                    setBulkSuggestCandidates([]);
                    setBulkSuggestSlotIndex(-1);
                    setBulkSuggestQuery("");
                    setBulkRecognizedCount(c => c + 1);
              toast.success(`枠${bulkSuggestSlotIndex + 1}に「${p.name}」を入力しました`);
              // 次の空き枠にスクロール
              const nextEmptyIdxSuggest = slots.findIndex((s, i) => i > bulkSuggestSlotIndex && !s.patientName);
              if (nextEmptyIdxSuggest >= 0) {
                setTimeout(() => {
                  slotRefs.current[nextEmptyIdxSuggest]?.scrollIntoView({ behavior: "smooth", block: "center" });
                }, 300);
              }
                  }}
                >
                  <span className="text-sm font-medium">{p.name}</span>
                  {p.team && (
                    <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{p.team}</span>
                  )}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3 text-center">
              該当する方がいない場合は閉じて手動で検索してください
            </p>
          </div>
        </div>
      )}

      {/* プロンプト選択UIはAI共有モーダルに移動 */}

      {/* ===== 全リセット確認ダイアログ ===== */}
      <AlertDialog open={showResetConfirm} onOpenChange={(open) => { setShowResetConfirm(open); if (!open) setResetConfirmChecked(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              全てリセットしますか？
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">訪問時チェック項目の全ての入力内容をリセットします。</span>
              <span className="block font-semibold text-destructive">この操作は元に戻せません。</span>
              <span className="block text-xs mt-1 space-y-0.5">
                <span className="block">• 今日の訪問予定（8枠分）</span>
                <span className="block">• 各カードのチェック項目・メモ・次回訪問日時</span>
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          {/* 確認チェックボックス */}
          <div className="flex items-center gap-3 mt-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
            <input
              type="checkbox"
              id="reset-confirm-checkbox"
              checked={resetConfirmChecked}
              onChange={(e) => setResetConfirmChecked(e.target.checked)}
              className="w-5 h-5 rounded border-2 border-destructive accent-destructive cursor-pointer flex-shrink-0"
            />
            <label htmlFor="reset-confirm-checkbox" className="text-sm font-medium text-destructive cursor-pointer leading-snug">
              全ての入力内容を削除することを確認しました
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setShowResetConfirm(false); setResetConfirmChecked(false); }}>
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!resetConfirmChecked) return;
                executeResetAll();
                setShowResetConfirm(false);
                setResetConfirmChecked(false);
              }}
              disabled={!resetConfirmChecked}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              リセット実行
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ===== 8つの訪問チェック項目カード ===== */}
      {slots.map((slot, index) => (
        <div key={`${cardResetKey}-${index}`} id={`visit-check-card-${index}`}>
          <VisitSlotCard
            slotIndex={index}
            slotData={slot}
            onSlotChange={handleSlotChange}
            selectedPromptBody={selectedPromptBody}
            externalNextVisitDate={slot.nextVisitDate}
            externalNextVisitTime={slot.nextVisitTime}
            onNextVisitChange={(date, time) => handleSlotChange(index, { nextVisitDate: date, nextVisitTime: time })}
          />
        </div>
      ))}
    </div>
  );
}

// ===== スロット選択コンポーネント（今日の訪問予定の各行） =====
type SlotSelectorProps = {
  index: number;
  slot: VisitSlotData;
  allPatients: Array<{ id: number; name: string; team: string | null; nameKana?: string | null }>;
  searchQuery: string;
  showList: boolean;
  onSearchChange: (q: string) => void;
  onShowListChange: (show: boolean) => void;
  onSlotChange: (data: Partial<VisitSlotData>) => void;
  slotRef?: (el: HTMLDivElement | null) => void;
  onCandidateSelected?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  totalSlots?: number;
};

function SlotSelector({
  index, slot, allPatients, searchQuery, showList,
  onSearchChange, onShowListChange, onSlotChange,
  slotRef, onCandidateSelected,
  onMoveUp, onMoveDown, canMoveUp, canMoveDown
}: SlotSelectorProps) {
  const isSelected = !!slot.patientName;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: index, disabled: !isSelected });
  const slotNumber = index + 1;
  const [isListening, setIsListening] = useState(false);
  const [voiceCandidates, setVoiceCandidates] = useState<Array<{ id: number; name: string; team: string | null }>>([]);
  // 候補なし時のサジェスト
  const [suggestCandidates, setSuggestCandidates] = useState<PatientEntry[]>([]);
  const [suggestQuery, setSuggestQuery] = useState("");
  const recognitionRef = useRef<SpeechRecognitionType | null>(null);
  // カスタム時間ドロップダウン
  const [timeDropdownOpen, setTimeDropdownOpen] = useState(false);
  const timeListRef = useRef<HTMLUListElement | null>(null);
  const timeDropdownRef = useRef<HTMLDivElement | null>(null);
  const TIME_SLOTS = Array.from({ length: 24 * 12 }, (_, i) => {
    const h = Math.floor(i / 12);
    const m = (i % 12) * 5;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  });
  // 時間ドロップダウン外クリックで閉じる
  useEffect(() => {
    if (!timeDropdownOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (timeDropdownRef.current && !timeDropdownRef.current.contains(e.target as Node)) {
        setTimeDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [timeDropdownOpen]);
  // ドロップダウンが開いたとき現在時刻付近にスクロール（iOSでも動作）
  useEffect(() => {
    if (!timeDropdownOpen || !timeListRef.current) return;
    const now = new Date();
    const currentH = now.getHours();
    const currentM = Math.round(now.getMinutes() / 5) * 5;
    const adjH = currentM >= 60 ? (currentH + 1) % 24 : currentH;
    const adjM = currentM >= 60 ? 0 : currentM;
    const targetVal = slot.nextVisitTime || `${String(adjH).padStart(2, "0")}:${String(adjM).padStart(2, "0")}`;
    // DOMが確実にレンダリングされてからスクロール
    const timer = setTimeout(() => {
      const el = timeListRef.current?.querySelector(`[data-time="${targetVal}"]`) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ block: "center" });
      }
    }, 30);
    return () => clearTimeout(timer);
  }, [timeDropdownOpen, slot.nextVisitTime]);

  // チームでフィルタリングした利用者リスト（よみがな優先でソート）
  const filteredPatients = useMemo(() => {
    const teamFiltered = slot.team
      ? allPatients.filter(p => p.team === slot.team)
      : allPatients;
    if (!searchQuery.trim()) return teamFiltered;
    const q = searchQuery.toLowerCase();
    const qHira = toHiragana(q);
    const qKata = toKatakana(q);
    const matched = teamFiltered.filter(p => {
      const nameL = p.name.toLowerCase();
      const kanaL = p.nameKana ? p.nameKana.toLowerCase() : "";
      const kanaHira = toHiragana(kanaL);
      return nameL.includes(q) ||
        kanaL.includes(q) ||
        kanaHira.includes(qHira) ||
        kanaL.includes(qKata);
    });
    // よみがなマッチを上位に
    return matched.sort((a, b) => {
      const aKana = (a.nameKana || "").toLowerCase();
      const bKana = (b.nameKana || "").toLowerCase();
      const aKanaHira = toHiragana(aKana);
      const bKanaHira = toHiragana(bKana);
      const aKanaMatch = aKana.includes(q) || aKanaHira.includes(qHira) || aKana.includes(qKata);
      const bKanaMatch = bKana.includes(q) || bKanaHira.includes(qHira) || bKana.includes(qKata);
      if (aKanaMatch && !bKanaMatch) return -1;
      if (!aKanaMatch && bKanaMatch) return 1;
      return 0;
    });
  }, [allPatients, slot.team, searchQuery]);

  // 音声入力で苗字を認識 → 候補を検索（よみがな優先）
  const startVoiceInput = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("このブラウザは音声入力に対応していません");
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "ja-JP";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognitionRef.current = recognition;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => {
      setIsListening(false);
      toast.error("音声認識に失敗しました");
    };
    recognition.maxAlternatives = 5;
    recognition.onresult = (event: any) => {
      // 全認識候補を収集
      const resultSet = event.results[0];
      const alternatives: Array<{ transcript: string; confidence: number }> = [];
      for (let i = 0; i < resultSet.length; i++) {
        alternatives.push({ transcript: resultSet[i].transcript, confidence: resultSet[i].confidence });
      }
      // チームフィルタを適用してスコアリング
      const { matches, usedTranscript, bestScore } = findBestMatches(alternatives, allPatients, slot.team as Team | null);
      if (matches.length === 1) {
        // 1件のみ → 自動選択
        onSlotChange({
          team: (matches[0].team as Team) || slot.team,
          patientId: matches[0].id,
          patientName: matches[0].name,
        });
        onSearchChange(matches[0].name);
        onShowListChange(false);
        setVoiceCandidates([]);
        setSuggestCandidates([]);
        toast.success(`「${matches[0].name}」を選択しました`);
      } else if (matches.length > 1) {
        // 複数候補 → 候補リストを「利用者名で検索」欄の下に表示
        setVoiceCandidates(matches);
        setSuggestCandidates([]);
        onSearchChange(usedTranscript);
        onShowListChange(false);
        toast.info(`「${usedTranscript}」の候補が${matches.length}件あります。下から選択してください`);
      } else {
        // 候補なし → 近似候補をサジェスト
        const { team: detectedTeam, rest } = extractTeamFromVoice(alternatives[0]?.transcript || "");
        const effectiveTeam = (slot.team as Team | null) || detectedTeam;
        const searchBase = effectiveTeam ? allPatients.filter(p => p.team === effectiveTeam) : allPatients;
        const fuzzy = findFuzzyMatches(rest || usedTranscript, searchBase, 5);
        if (fuzzy.length > 0) {
          setSuggestCandidates(fuzzy);
          setSuggestQuery(usedTranscript);
          setVoiceCandidates([]);
          onSearchChange(usedTranscript);
          onShowListChange(false);
          toast.warning(`「${usedTranscript}」に完全一致する利用者が見つかりません。近い候補を確認してください`);
        } else {
          // 近似候補もなし → テキスト検索にフォールバック
          onSearchChange(usedTranscript);
          onShowListChange(true);
          setVoiceCandidates([]);
          setSuggestCandidates([]);
          toast.warning(`「${usedTranscript}」に一致する利用者が見つかりません`);
        }
      }
    };
    recognition.start();
  }, [isListening, allPatients, slot.team, onSlotChange, onSearchChange, onShowListChange]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        slotRef?.(el);
      }}
      style={style}
      className={cn(
        "rounded-lg border p-2.5 transition-colors",
        isSelected ? "border-primary/40 bg-primary/5" : "border-border bg-background",
        isDragging && "shadow-lg"
      )}
    >
      <div className="flex items-start gap-2">
        {/* 番号 */}
        <span className={cn(
          "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mt-0.5",
          isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        )}>
          {slotNumber}
        </span>

        {isSelected ? (
          // 選択済み表示
          <div className="flex flex-col gap-1 flex-1 min-w-0">
            {/* 1行目：チームバッジ＋利用者名（フル表示） */}
            <div className="flex items-center gap-1.5 min-w-0">
              {slot.team && (
                <span
                  className={cn("text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0", getTeamButtonClass(slot.team as Team, true))}
                  style={getTeamButtonStyle(slot.team as Team, true)}
                >
                  {slot.team}
                </span>
              )}
              <span className="text-sm font-semibold text-foreground break-all">
                {slot.patientName}
              </span>
            </div>
            {/* 2行目：ボタン群 */}
            <div className="flex items-center gap-1 min-w-0">
              {/* iPhone用上下入れ替えボタン（タッチデバイスのみ表示） */}
              {onMoveUp && (
                <button
                  type="button"
                  onClick={onMoveUp}
                  disabled={!canMoveUp}
                  className={cn(
                    "flex-shrink-0 flex items-center gap-0.5 px-1.5 py-1 rounded transition-colors text-xs sm:hidden",
                    canMoveUp
                      ? "text-muted-foreground hover:text-primary hover:bg-primary/10 active:scale-95"
                      : "text-muted-foreground/30 cursor-not-allowed"
                  )}
                  title="上に移動"
                >
                  <ChevronUp className="w-3 h-3" />
                  <span>上へ</span>
                </button>
              )}
              {onMoveDown && (
                <button
                  type="button"
                  onClick={onMoveDown}
                  disabled={!canMoveDown}
                  className={cn(
                    "flex-shrink-0 flex items-center gap-0.5 px-1.5 py-1 rounded transition-colors text-xs sm:hidden",
                    canMoveDown
                      ? "text-muted-foreground hover:text-primary hover:bg-primary/10 active:scale-95"
                      : "text-muted-foreground/30 cursor-not-allowed"
                  )}
                  title="下に移動"
                >
                  <ChevronDown className="w-3 h-3" />
                  <span>下へ</span>
                </button>
              )}
              {/* ドラッグハンドル（選択済みスロットのみ・PC/iOS共通） */}
              <button
                type="button"
                className="flex-shrink-0 flex items-center gap-0.5 px-1.5 py-1 text-xs text-muted-foreground hover:text-primary transition-colors rounded cursor-grab active:cursor-grabbing select-none"
                title="長押し・ドラッグして順番を変更"
                style={{ touchAction: 'none' }}
                {...attributes}
                {...listeners}
              >
                <GripVertical className="w-3 h-3" />
                <span className="hidden sm:inline">並替</span>
              </button>
              {/* 訪問チェック項目カードへスクロール */}
              <button
                type="button"
                onClick={() => {
                  const target = document.getElementById(`visit-check-card-${index}`);
                  if (target) {
                    target.scrollIntoView({ behavior: "smooth", block: "start" });
                  }
                }}
                className="flex-shrink-0 flex items-center gap-0.5 px-1.5 py-1 text-xs text-muted-foreground hover:text-primary transition-colors rounded"
                title={`${slot.patientName}の訪問チェック項目カードへ移動`}
              >
                <ExternalLink className="w-3 h-3" />
                <span>記録</span>
              </button>
              {/* リセットボタン（選択済み） */}
              <button
                type="button"
                onClick={() => {
                  onSlotChange({ team: "", patientId: null, patientName: "", nextVisitDate: "", nextVisitTime: "" });
                  onSearchChange("");
                  onShowListChange(false);
                }}
                className="flex-shrink-0 flex items-center gap-0.5 px-1.5 py-1 text-xs text-muted-foreground hover:text-destructive transition-colors rounded"
                title="クリア"
              >
                <X className="w-3 h-3" />
                <span>削除</span>
              </button>
            </div>
            {/* 2行目：次回訪問日時入力（コンパクト） */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground flex-shrink-0 whitespace-nowrap">次回訪問日時</span>
                {/* チェックボックス：日時変更→連絡・予定から変更 */}
                <label className="flex items-center gap-1 cursor-pointer select-none flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={!!slot.skipNextVisit}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      // チェック時は日付・時刻もクリア
                      if (checked) {
                        onSlotChange({ skipNextVisit: true, nextVisitDate: "", nextVisitTime: "" });
                      } else {
                        onSlotChange({ skipNextVisit: false });
                      }
                    }}
                    className="w-3.5 h-3.5 cursor-pointer accent-primary"
                  />
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    日時変更→連絡・予定から変更
                  </span>
                </label>
              </div>
              {!slot.skipNextVisit && (
                <div className="flex items-center gap-1.5">
              {/* 日付入力：iOSではカレンダーアイコンが表示されないため、カスタムラッパーで包む */}
              <div className="relative flex-1 min-w-0">
                <input
                  type="date"
                  className="w-full text-xs h-7 border rounded-md pl-2 pr-7 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary appearance-none"
                  value={slot.nextVisitDate || ""}
                  onChange={(e) => onSlotChange({ nextVisitDate: e.target.value })}
                  title="次回訪問日"
                  style={{ colorScheme: "light dark" }}
                />
                {/* 日付の日本語表示オーバーレイ（iOSでのロケール依存表示を回避） */}
                {slot.nextVisitDate && (
                  <span className="absolute inset-0 flex items-center pl-2 pr-7 text-xs text-foreground pointer-events-none bg-background rounded-md">
                    {(() => {
                      const [y, m, d] = slot.nextVisitDate.split("-");
                      return `${parseInt(m)}月${parseInt(d)}日`;
                    })()}
                  </span>
                )}
                {/* カレンダーアイコン（iOS対応）：type=dateのネイティブアイコンが表示される環境では重複するが視覚的に許容範囲 */}
                <span className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
                </span>
              </div>
              {/* カスタム時間ドロップダウン（iOSでも現在時刻へ自動スクロール） */}
              <div ref={timeDropdownRef} className="relative">
                <button
                  type="button"
                  onClick={() => setTimeDropdownOpen(prev => !prev)}
                  className={cn(
                    "w-[4.5rem] text-xs h-7 border rounded-md px-1.5 bg-background text-foreground",
                    "flex items-center justify-between gap-0.5",
                    "focus:outline-none focus:ring-1 focus:ring-primary",
                    timeDropdownOpen && "ring-1 ring-primary"
                  )}
                  title="次回訪問時刻"
                >
                  <span className={cn(slot.nextVisitTime ? "text-foreground" : "text-muted-foreground")}>
                    {slot.nextVisitTime || "時刻"}
                  </span>
                  <ChevronDown className="w-3 h-3 flex-shrink-0 text-muted-foreground" />
                </button>
                {timeDropdownOpen && (
                  <div className="absolute z-50 top-full mt-0.5 left-0 w-24 bg-popover border border-border rounded-md shadow-lg overflow-hidden">
                    <ul
                      ref={timeListRef}
                      className="overflow-y-auto max-h-48 py-1"
                    >
                      <li>
                        <button
                          type="button"
                          data-time=""
                          className={cn(
                            "w-full text-left px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground transition-colors",
                            !slot.nextVisitTime && "bg-primary/10 font-medium text-primary"
                          )}
                          onClick={() => { onSlotChange({ nextVisitTime: "" }); setTimeDropdownOpen(false); }}
                        >
                          時刻
                        </button>
                      </li>
                      {TIME_SLOTS.map((t) => (
                        <li key={t}>
                          <button
                            type="button"
                            data-time={t}
                            className={cn(
                              "w-full text-left px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground transition-colors",
                              slot.nextVisitTime === t && "bg-primary/10 font-medium text-primary"
                            )}
                            onClick={() => { onSlotChange({ nextVisitTime: t }); setTimeDropdownOpen(false); }}
                          >
                            {t}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              {(slot.nextVisitDate || slot.nextVisitTime) && (
                <button
                  type="button"
                  onClick={() => onSlotChange({ nextVisitDate: "", nextVisitTime: "" })}
                  className="flex-shrink-0 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  title="次回訪問日時をクリア"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
                </div>
              )}
              {slot.skipNextVisit && (
                <div className="text-xs px-2 py-1.5 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300">
                  ℹ️ 日時変更は「連絡・予定」から行います。次回訪問日時の入力・転記はスキップされます。
                </div>
              )}
            </div>
          </div>
        ) : (
          // 未選択：チーム選択 + 利用者検索
          <div className="flex-1 space-y-2">
            {/* チーム選択行 + 音声入力ボタン（右端）+ リセットボタン */}
            <div className="flex gap-1 items-center">
              {/* チームボタン群 */}
              <div className="flex gap-1 flex-1 min-w-0">
                {(["身体", "天理", "郡山北部", "郡山南部"] as Team[]).map((teamId) => (
                  <button
                    key={teamId}
                    type="button"
                    onClick={() => {
                      onSlotChange({ team: teamId, patientId: null, patientName: "" });
                      onSearchChange("");
                      onShowListChange(true);
                      setSuggestCandidates([]);
                    }}
                    className={cn(
                      "flex-1 text-xs py-1 rounded-md font-medium transition-all",
                      getTeamButtonClass(teamId, slot.team === teamId)
                    )}
                    style={getTeamButtonStyle(teamId, slot.team === teamId)}
                  >
                    {teamId}
                  </button>
                ))}
              </div>
              {/* 音声入力ボタン＋リセットボタン（右端） */}
              <div className="flex gap-1 flex-shrink-0 ml-1">
                <button
                  type="button"
                  className={cn(
                    "h-7 w-7 flex items-center justify-center border rounded-md transition-colors",
                    isListening
                      ? "bg-red-500 border-red-500 text-white animate-pulse"
                      : "hover:bg-muted text-muted-foreground"
                  )}
                  onClick={startVoiceInput}
                  title={isListening ? "録音停止" : "音声で苗字を入力"}
                >
                  {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                </button>
                {/* リセットボタン（チーム選択済みの場合のみ表示） */}
                {slot.team && (
                  <button
                    type="button"
                    onClick={() => {
                      onSlotChange({ team: "", patientId: null, patientName: "" });
                      onSearchChange("");
                      onShowListChange(false);
                      setSuggestCandidates([]);
                      setVoiceCandidates([]);
                    }}
                    className="h-7 w-7 flex items-center justify-center border rounded-md hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40 transition-colors text-muted-foreground"
                    title="リセット"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

              {/* 利用者検索 */}
            <div className="relative">
              <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    className="pl-7 text-xs h-8"
                    placeholder="利用者名で検索..."
                    value={searchQuery}
                    onChange={(e) => {
                      onSearchChange(e.target.value);
                      onShowListChange(true);
                      setVoiceCandidates([]);
                      setSuggestCandidates([]);
                    }}
                    onFocus={() => onShowListChange(true)}
                  />
                </div>
                <button
                  type="button"
                  className="flex-shrink-0 h-8 w-8 flex items-center justify-center border rounded-md hover:bg-muted transition-colors"
                  onClick={() => onShowListChange(!showList)}
                >
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>

              {/* 音声入力候補リスト（複数一致） - 1件以上で表示 */}
              {voiceCandidates.length >= 1 && (
                <div className="absolute z-50 top-full mt-1 left-0 right-0 border rounded-md bg-background shadow-md">
                  <div className="px-3 py-1.5 text-xs text-muted-foreground border-b bg-muted/50 flex items-center gap-1.5">
                    <Search className="w-3 h-3" />
                    {voiceCandidates.length === 1 ? "1件一致 - タップして選択" : `${voiceCandidates.length}件の候補 - 選択してください`}
                  </div>
                  {voiceCandidates.map((p) => (
                    <button
                      key={p.id}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-muted flex items-center justify-between border-b last:border-b-0"
                      onClick={() => {
                        onSlotChange({
                          team: (p.team as Team) || slot.team,
                          patientId: p.id,
                          patientName: p.name,
                        });
                        onSearchChange(p.name);
                        onShowListChange(false);
                        setVoiceCandidates([]);
                        setSuggestCandidates([]);
                        onCandidateSelected?.();
                      }}
                    >
                      <span className="font-medium">{p.name}</span>
                      {p.team && <span className="text-muted-foreground">{p.team}</span>}
                    </button>
                  ))}
                </div>
              )}

              {/* 音声入力の近似候補サジェスト（候補なし時） */}
              {suggestCandidates.length > 0 && voiceCandidates.length === 0 && (
                <div className="absolute z-50 top-full mt-1 left-0 right-0 border border-amber-300 rounded-md bg-background shadow-md dark:border-amber-700">
                  <div className="px-3 py-1.5 text-xs border-b bg-amber-50 dark:bg-amber-950/30 flex items-center gap-1.5">
                    <Search className="w-3 h-3 text-amber-500" />
                    <span className="text-amber-700 dark:text-amber-400 font-medium">もしかして？（「{suggestQuery}」の近似候補）</span>
                  </div>
                  {suggestCandidates.map((p) => (
                    <button
                      key={p.id}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-amber-50 dark:hover:bg-amber-950/20 flex items-center justify-between border-b last:border-b-0 transition-colors"
                      onClick={() => {
                        onSlotChange({
                          team: (p.team as Team) || slot.team,
                          patientId: p.id,
                          patientName: p.name,
                        });
                        onSearchChange(p.name);
                        onShowListChange(false);
                        setVoiceCandidates([]);
                        setSuggestCandidates([]);
                        toast.success(`「${p.name}」を選択しました`);
                      }}
                    >
                      <span className="font-medium">{p.name}</span>
                      {p.team && <span className="text-muted-foreground">{p.team}</span>}
                    </button>
                  ))}
                  <div className="px-3 py-1.5 text-[10px] text-muted-foreground bg-muted/30">
                    該当しない場合は上の検索フィールドで手動検索してください
                  </div>
                </div>
              )}

              {showList && voiceCandidates.length === 0 && suggestCandidates.length === 0 && (
                <div className="absolute z-50 top-full mt-1 left-0 right-0 border rounded-md bg-background shadow-md max-h-48 overflow-y-auto">
                  {filteredPatients.length === 0 ? (
                    <div className="p-2 text-xs text-muted-foreground text-center">
                      {searchQuery ? "該当する利用者が見つかりません" : slot.team ? "利用者が登録されていません" : "チームを選択してください"}
                    </div>
                  ) : (
                    filteredPatients.map((p) => (
                      <button
                        key={p.id}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-muted flex items-center justify-between border-b last:border-b-0"
                        onClick={() => {
                          onSlotChange({
                            team: (p.team as Team) || slot.team,
                            patientId: p.id,
                            patientName: p.name,
                          });
                          onSearchChange(p.name);
                          onShowListChange(false);
                        }}
                      >
                        <span>{p.name}</span>
                        {p.team && (
                          <span className="text-xs text-muted-foreground">{p.team}</span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
