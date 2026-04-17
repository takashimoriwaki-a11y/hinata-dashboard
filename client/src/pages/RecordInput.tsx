/**
 * RecordInput - 訪問時チェック項目ページ
 * - 今日の訪問予定（8名分のチーム＋利用者選択）
 * - 8つの訪問チェック項目カード（①訪問タスク＋②次回訪問日時を統合）
 * - タスク管理との連携（利用者のタスクを取得・チェックで自動完了）
 */
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ClipboardEdit, Search, Loader2, ChevronDown, X, Users, ExternalLink, Mic, MicOff
} from "lucide-react";
import { VoiceMicButton } from "@/components/VoiceMicButton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getTeamButtonClass, getTeamButtonStyle } from "@shared/teamColors";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { VisitSlotCard } from "@/components/VisitSlotCard";

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
};

const DEFAULT_SLOT: VisitSlotData = { team: "", patientId: null, patientName: "" };

const SLOTS_STORAGE_KEY = "hinata_visit_slots";

export default function RecordInput() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  // 8枠分の訪問予定データ
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

  // スロットデータの変更をlocalStorageに保存
  useEffect(() => {
    try {
      localStorage.setItem(SLOTS_STORAGE_KEY, JSON.stringify(slots));
    } catch {}
  }, [slots]);

  // スロットデータの更新ハンドラ
  const handleSlotChange = (index: number, data: Partial<VisitSlotData>) => {
    setSlots(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...data };
      return next;
    });
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

  // 各枠の利用者検索クエリ
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

  const isAdmin = user?.role === "admin";

  // 全枠リセット
  const handleResetAll = () => {
    if (!window.confirm("今日の訪問予定をリセットしますか？")) return;
    const empty = Array.from({ length: MAX_SLOTS }, () => ({ ...DEFAULT_SLOT }));
    setSlots(empty);
    setSlotSearchQueries(Array.from({ length: MAX_SLOTS }, () => ""));
    setSlotShowLists(Array.from({ length: MAX_SLOTS }, () => false));
    localStorage.removeItem(SLOTS_STORAGE_KEY);
    toast.success("訪問予定をリセットしました");
  };

  const setSlotSearch = (index: number, query: string) => {
    setSlotSearchQueries(prev => {
      const next = [...prev];
      next[index] = query;
      return next;
    });
  };

  const setSlotShowList = (index: number, show: boolean) => {
    setSlotShowLists(prev => {
      const next = [...prev];
      next[index] = show;
      return next;
    });
  };

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
          {/* 1行目：タイトル + 音声入力 + 全リセット */}
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 min-w-0">
              <Users className="w-4 h-4 text-primary flex-shrink-0" />
              <span className="truncate">今日の訪問予定</span>
              {filledSlots > 0 && (
                <Badge variant="secondary" className="text-xs flex-shrink-0">
                  {filledSlots}名
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* 一括音声入力ボタン */}
              <button
                type="button"
                onClick={startBulkVoiceInput}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-medium transition-colors",
                  isBulkListening
                    ? "bg-red-500 border-red-500 text-white animate-pulse"
                    : "border-primary/40 text-primary hover:bg-primary/10"
                )}
                title={isBulkListening ? "録音停止（連続音声入力中）" : "音声で利用者を連続入力"}
              >
                {isBulkListening ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                {isBulkListening ? `停止${bulkRecognizedCount > 0 ? ` (${bulkRecognizedCount}名)` : ""}` : "音声入力"}
              </button>
              <button
                type="button"
                onClick={handleResetAll}
                className="flex items-center gap-1 px-2 py-1 rounded-lg border border-border text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                全リセット
              </button>
            </div>
          </div>
          {/* 2行目：検索フィールド */}
          <div className="relative mt-1.5" ref={headerSearchRef}>
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
          <p className="text-xs text-muted-foreground mt-1">訪問する順番に利用者を選択してください（最大8名）</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {slots.map((slot, index) => (
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
                // 次の空き枠にスクロール
                const nextIdx = slots.findIndex((s, i) => i > index && !s.patientName);
                if (nextIdx >= 0) {
                  setTimeout(() => {
                    slotRefs.current[nextIdx]?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }, 300);
                }
              }}
            />
          ))}
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

      {/* ===== 8つの訪問チェック項目カード ===== */}
      {slots.map((slot, index) => (
        <div key={index} id={`visit-check-card-${index}`}>
          <VisitSlotCard
            slotIndex={index}
            slotData={slot}
            onSlotChange={handleSlotChange}
            selectedPromptBody={selectedPromptBody}
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
};

function SlotSelector({
  index, slot, allPatients, searchQuery, showList,
  onSearchChange, onShowListChange, onSlotChange,
  slotRef, onCandidateSelected
}: SlotSelectorProps) {
  const slotNumber = index + 1;
  const [isListening, setIsListening] = useState(false);
  const [voiceCandidates, setVoiceCandidates] = useState<Array<{ id: number; name: string; team: string | null }>>([]);
  // 候補なし時のサジェスト
  const [suggestCandidates, setSuggestCandidates] = useState<PatientEntry[]>([]);
  const [suggestQuery, setSuggestQuery] = useState("");
  const recognitionRef = useRef<SpeechRecognitionType | null>(null);

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

  const isSelected = !!slot.patientName;

  return (
    <div
      ref={slotRef}
      className={cn(
        "rounded-lg border p-2.5 transition-colors",
        isSelected ? "border-primary/40 bg-primary/5" : "border-border bg-background"
      )}
    >
      <div className="flex items-center gap-2">
        {/* 番号 */}
        <span className={cn(
          "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
          isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        )}>
          {slotNumber}
        </span>

        {isSelected ? (
          // 選択済み表示
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {slot.team && (
              <span
                className={cn("text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0", getTeamButtonClass(slot.team as Team, true))}
                style={getTeamButtonStyle(slot.team as Team, true)}
              >
                {slot.team}
              </span>
            )}
            <span className="text-sm font-medium text-foreground truncate flex-1">
              {slot.patientName}
            </span>
            {/* 訪問チェック項目カードへスクロール */}
            <button
              type="button"
              onClick={() => {
                const target = document.getElementById(`visit-check-card-${index}`);
                if (target) {
                  target.scrollIntoView({ behavior: "smooth", block: "start" });
                }
              }}
              className="flex-shrink-0 text-muted-foreground hover:text-primary transition-colors p-1 rounded"
              title={`${slot.patientName}の訪問チェック項目カードへ移動`}
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                onSlotChange({ team: "", patientId: null, patientName: "" });
                onSearchChange("");
                onShowListChange(false);
              }}
              className="flex-shrink-0 text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
              title="クリア"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          // 未選択：チーム選択 + 利用者検索
          <div className="flex-1 space-y-2">
            {/* チーム選択 */}
            <div className="flex gap-1">
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
                {/* 音声入力ボタン */}
                <VoiceMicButton
                  externalState={{
                    isRecording: isListening,
                    isProcessing: false,
                    toggleVoice: startVoiceInput,
                    interimText: "",
                    silenceCountdown: null,
                  }}
                  size="sm"
                  previewMode="none"
                  className="flex-shrink-0"
                />
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
