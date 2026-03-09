/**
 * useVoiceInput
 *
 * Web Speech API (SpeechRecognition) を第一選択で使用し、
 * 非対応環境では MediaRecorder + Gemini Audio API (Whisper フォールバック) にフォールバックする
 * 共通音声入力カスタムフック。
 *
 * 機能:
 * - Web Speech API によるリアルタイム音声認識
 * - 非対応環境では MediaRecorder + /api/transcribe (Gemini Audio API) にフォールバック
 * - 30秒間無音が続いた場合に自動停止（タイマーは発話のたびにリセット）
 * - interimText: 認識中の暫定テキストをリアルタイムで返す
 * - transcriptionStatus: 認識フェーズをリアルタイムで返す
 * - lastTranscribedText: 最後に認識されたテキストを返す（フィードバック用）
 *
 * 使い方:
 *   const { isRecording, startVoice, stopVoice, isProcessing, interimText, transcriptionStatus } = useVoiceInput({
 *     onResult: (text) => setMyText(prev => prev + text),
 *   });
 */

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

/** 無音自動停止までの秒数 */
const SILENCE_TIMEOUT_MS = 30_000;

/**
 * 音声認識のフェーズ
 * - idle: 待機中
 * - recording: 録音中（Web Speech API または MediaRecorder）
 * - uploading: サーバーへ音声データ送信中
 * - analyzing: Gemini/Whisperが医療用語を解析中
 * - done: 転記完了
 * - error: エラー
 */
export type TranscriptionStatus = "idle" | "recording" | "uploading" | "analyzing" | "done" | "error";

interface UseVoiceInputOptions {
  /** 認識結果テキストを受け取るコールバック */
  onResult: (text: string) => void;
  /** 録音状態変化時のコールバック */
  onRecordingChange?: (isRecording: boolean) => void;
  /** 言語（デフォルト: ja-JP） */
  lang?: string;
  /**
   * 無音自動停止までのミリ秒（デフォルト: 30000ms = 30秒）
   * 0 を指定すると自動停止を無効化
   */
  silenceTimeoutMs?: number;
  /**
   * 音声認識のコンテキスト（画面ごとの医療用語プロンプト最適化用）
   * 'clinical_notes' | 'task' | 'schedule_change' | 'message' | 'general'
   * デフォルト: 'general'
   */
  context?: string;
}

interface UseVoiceInputReturn {
  /** 録音中かどうか */
  isRecording: boolean;
  /** Whisperへのアップロード・文字起こし処理中かどうか */
  isProcessing: boolean;
  /** 音声入力を開始する */
  startVoice: () => void;
  /** 音声入力を停止する */
  stopVoice: () => void;
  /** トグル（開始/停止を切り替え） */
  toggleVoice: () => void;
  /** 認識中の暫定テキスト（確定前のリアルタイムプレビュー用） */
  interimText: string;
  /** 無音タイマーの残り秒数（録音中のみ更新、0=タイムアウト直前） */
  silenceCountdown: number | null;
  /** 認識フェーズ（UIステータス表示用） */
  transcriptionStatus: TranscriptionStatus;
  /** 最後に認識されたテキスト（誤変換フィードバック用） */
  lastTranscribedText: string;
  /** 誤変換フィードバックを送信する */
  reportMistranscription: (wrongText: string, correctedText: string) => Promise<void>;
}

// SpeechRecognition の型定義（ブラウザ互換）
interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
}

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message: string;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

/**
 * Web Speech API が利用可能かチェック
 */
function getSpeechRecognitionClass(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function useVoiceInput({
  onResult,
  onRecordingChange,
  lang = "ja-JP",
  silenceTimeoutMs = SILENCE_TIMEOUT_MS,
  context = "general",
}: UseVoiceInputOptions): UseVoiceInputReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [silenceCountdown, setSilenceCountdown] = useState<number | null>(null);
  const [transcriptionStatus, setTranscriptionStatus] = useState<TranscriptionStatus>("idle");
  const [lastTranscribedText, setLastTranscribedText] = useState("");

  // onRecordingChangeコールバックをrefで保持（クロージャ問題回避）
  const onRecordingChangeRef = useRef(onRecordingChange);
  onRecordingChangeRef.current = onRecordingChange;

  // 録音状態を変更しつつコールバックも呼ぶ
  const setRecording = useCallback((val: boolean) => {
    setIsRecording(val);
    onRecordingChangeRef.current?.(val);
  }, []);

  // Web Speech API 用
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  // MediaRecorder フォールバック用
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // 無音タイマー用
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 自動停止フラグ（onend内でトースト内容を切り替えるため）
  const autoStoppedRef = useRef(false);

  // ---- 無音タイマー管理 ----
  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setSilenceCountdown(null);
  }, []);

  /**
   * 無音タイマーをリセット（発話検出のたびに呼ぶ）
   * silenceTimeoutMs が 0 の場合は何もしない
   */
  const resetSilenceTimer = useCallback((stopFn: () => void) => {
    if (!silenceTimeoutMs) return;

    // 既存タイマーをクリア
    clearSilenceTimer();

    // カウントダウン表示を初期化
    const totalSec = Math.ceil(silenceTimeoutMs / 1000);
    setSilenceCountdown(totalSec);

    // 1秒ごとにカウントダウンを更新
    countdownIntervalRef.current = setInterval(() => {
      setSilenceCountdown((prev) => {
        if (prev === null || prev <= 1) return null;
        return prev - 1;
      });
    }, 1000);

    // 30秒後に自動停止
    silenceTimerRef.current = setTimeout(() => {
      autoStoppedRef.current = true;
      clearInterval(countdownIntervalRef.current!);
      countdownIntervalRef.current = null;
      setSilenceCountdown(null);
      stopFn();
    }, silenceTimeoutMs);
  }, [silenceTimeoutMs, clearSilenceTimer]);

  // ---- Web Speech API 実装 ----
  const startSpeechRecognition = useCallback((): boolean => {
    const SpeechRecognitionClass = getSpeechRecognitionClass();
    if (!SpeechRecognitionClass) return false;

    try {
      const recognition = new SpeechRecognitionClass();
      recognition.lang = lang;
      recognition.continuous = true;      // 長い発話に対応
      recognition.interimResults = true;  // 暫定結果も取得（リアルタイムプレビュー）
      recognition.maxAlternatives = 1;

      // 確定済テキストの累積（訂正サポート）
      let confirmedText = "";   // 最後のブロック以前の確定済テキスト
      let lastBlockText = "";   // 最後の確定ブロック（訂正で上書きされる可能性あり）
      let lastFinalResultIndex = -1; // 最後の確定結果のresultIndex
      autoStoppedRef.current = false;

      // 停止関数（タイマーから呼ぶ用）
      const stopFromTimer = () => {
        if (recognitionRef.current) {
          recognitionRef.current.stop();
        }
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let currentInterim = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            if (i === lastFinalResultIndex) {
              lastBlockText = transcript;
            } else if (i > lastFinalResultIndex) {
              if (lastFinalResultIndex >= 0) {
                confirmedText += lastBlockText;
              }
              lastBlockText = transcript;
              lastFinalResultIndex = i;
            }
            currentInterim = "";
          } else {
            currentInterim += transcript;
          }
        }

        setInterimText(currentInterim);
        resetSilenceTimer(stopFromTimer);
      };

      recognition.onend = () => {
        clearSilenceTimer();
        setRecording(false);
        setInterimText("");
        const finalText = (confirmedText + lastBlockText).trim();
        if (finalText) {
          onResult(finalText);
          setLastTranscribedText(finalText);
          setTranscriptionStatus("done");
          if (autoStoppedRef.current) {
            toast.info("30秒間無音のため自動停止しました", { duration: 4000 });
          } else {
            toast.success("✅ 転記完了");
          }
          // 5秒後にステータスをidleに戻す
          setTimeout(() => setTranscriptionStatus("idle"), 5000);
        } else if (autoStoppedRef.current) {
          setTranscriptionStatus("idle");
          toast.info("30秒間無音のため自動停止しました", { duration: 4000 });
        } else {
          setTranscriptionStatus("idle");
        }
        autoStoppedRef.current = false;
        recognitionRef.current = null;
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        clearSilenceTimer();
        setRecording(false);
        setInterimText("");
        setTranscriptionStatus("error");
        autoStoppedRef.current = false;
        recognitionRef.current = null;
        setTimeout(() => setTranscriptionStatus("idle"), 3000);
        if (event.error === "not-allowed") {
          toast.error("マイクのアクセスが許可されていません。ブラウザの設定を確認してください。");
        } else if (event.error === "no-speech") {
          toast.info("音声が検出されませんでした。もう一度お試しください。");
        } else if (event.error === "network") {
          toast.error("ネットワークエラーが発生しました。接続を確認してください。");
        } else if (event.error !== "aborted") {
          toast.error(`音声認識エラー: ${event.error}`);
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
      setRecording(true);
      setTranscriptionStatus("recording");

      // 録音開始直後からタイマーをスタート
      resetSilenceTimer(stopFromTimer);

      return true;
    } catch {
      return false;
    }
  }, [lang, onResult, resetSilenceTimer, clearSilenceTimer]);

  const stopSpeechRecognition = useCallback(() => {
    clearSilenceTimer();
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setRecording(false);
    setInterimText("");
    setTranscriptionStatus("idle");
  }, [clearSilenceTimer]);

  // ---- MediaRecorder + Gemini Audio API フォールバック実装 ----
  const startMediaRecorder = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // iOS Safari 対応: audio/mp4 を優先、次に audio/webm
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";

      const options = mimeType ? { mimeType } : {};
      const recorder = new MediaRecorder(stream, options);
      chunksRef.current = [];
      autoStoppedRef.current = false;

      // MediaRecorder の停止関数（タイマーから呼ぶ用）
      const stopFromTimer = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
          autoStoppedRef.current = true;
          mediaRecorderRef.current.stop();
          mediaRecorderRef.current = null;
          setRecording(false);
        }
      };

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
          // データ受信 = 音声あり → タイマーリセット
          resetSilenceTimer(stopFromTimer);
        }
      };

      recorder.onstop = async () => {
        clearSilenceTimer();
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        const blob = new Blob(chunksRef.current, {
          type: mimeType || "audio/webm",
        });

        if (blob.size === 0) {
          if (autoStoppedRef.current) {
            toast.info("30秒間無音のため自動停止しました", { duration: 4000 });
          } else {
            toast.error("録音データが空です。もう一度お試しください。");
          }
          autoStoppedRef.current = false;
          setIsProcessing(false);
          setTranscriptionStatus("idle");
          return;
        }

        if (blob.size > 16 * 1024 * 1024) {
          toast.error("音声ファイルが大きすぎます（16MB以下）");
          setIsProcessing(false);
          setTranscriptionStatus("error");
          setTimeout(() => setTranscriptionStatus("idle"), 3000);
          return;
        }

        setIsProcessing(true);
        setTranscriptionStatus("uploading");

        if (autoStoppedRef.current) {
          toast.info("30秒間無音のため自動停止しました。解析中...", { duration: 4000 });
        } else {
          toast.info("⬆️ 音声を受信中...");
        }
        autoStoppedRef.current = false;

        try {
          const formData = new FormData();
          const ext = mimeType.includes("mp4") ? "m4a" : "webm";
          formData.append("audio", blob, `recording.${ext}`);
          formData.append("language", "ja");
          formData.append("context", context);

          // アップロード完了 → 解析フェーズへ
          setTranscriptionStatus("analyzing");
          toast.info("🔬 医療用語を解析中...", { id: "analyzing-toast" });

          const res = await fetch("/api/transcribe", {
            method: "POST",
            body: formData,
            credentials: "include",
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({})) as { error?: string };
            throw new Error(errData.error || "文字起こし失敗");
          }

          const data = await res.json() as { text: string };
          if (data.text?.trim()) {
            onResult(data.text.trim());
            setLastTranscribedText(data.text.trim());
            setTranscriptionStatus("done");
            toast.success("✅ 転記完了", { id: "analyzing-toast" });
            // 5秒後にステータスをidleに戻す
            setTimeout(() => setTranscriptionStatus("idle"), 5000);
          } else {
            setTranscriptionStatus("error");
            toast.error("音声を認識できませんでした。もう一度お試しください。", { id: "analyzing-toast" });
            setTimeout(() => setTranscriptionStatus("idle"), 3000);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "不明なエラー";
          setTranscriptionStatus("error");
          toast.error(`音声入力エラー: ${msg}`, { id: "analyzing-toast" });
          setTimeout(() => setTranscriptionStatus("idle"), 3000);
        } finally {
          setIsProcessing(false);
        }
      };

      // 250ms ごとにデータを収集（データロス防止）
      recorder.start(250);
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setTranscriptionStatus("recording");

      // 録音開始直後からタイマーをスタート
      resetSilenceTimer(stopFromTimer);
    } catch (err) {
      setTranscriptionStatus("error");
      setTimeout(() => setTranscriptionStatus("idle"), 3000);
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        toast.error("マイクのアクセスが許可されていません。ブラウザの設定を確認してください。");
      } else {
        toast.error("マイクの起動に失敗しました。");
      }
    }
  }, [onResult, resetSilenceTimer, clearSilenceTimer, context]);

  const stopMediaRecorder = useCallback(() => {
    clearSilenceTimer();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    setRecording(false);
  }, [clearSilenceTimer]);

  // ---- 公開 API ----
  const startVoice = useCallback(async () => {
    setTranscriptionStatus("recording");
    const usedSpeechAPI = startSpeechRecognition();
    if (!usedSpeechAPI) {
      await startMediaRecorder();
    }
  }, [startSpeechRecognition, startMediaRecorder]);

  const stopVoice = useCallback(() => {
    if (recognitionRef.current) {
      stopSpeechRecognition();
    } else {
      stopMediaRecorder();
    }
  }, [clearSilenceTimer, stopSpeechRecognition, stopMediaRecorder]);

  const toggleVoice = useCallback(() => {
    if (isRecording) {
      stopVoice();
    } else {
      startVoice();
    }
  }, [isRecording, startVoice, stopVoice]);

  /**
   * 誤変換フィードバックをサーバーに送信する
   * サーバー側でコンテキスト別の補正辞書に追加し、次回の認識精度を向上させる
   */
  const reportMistranscription = useCallback(async (wrongText: string, correctedText: string) => {
    try {
      await fetch("/api/voice-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ wrongText, correctedText, context }),
      });
      toast.success("フィードバックを送信しました。次回から改善されます。");
    } catch {
      toast.error("フィードバックの送信に失敗しました。");
    }
  }, [context]);

  return {
    isRecording,
    isProcessing,
    startVoice,
    stopVoice,
    toggleVoice,
    interimText,
    silenceCountdown,
    transcriptionStatus,
    lastTranscribedText,
    reportMistranscription,
  };
}
