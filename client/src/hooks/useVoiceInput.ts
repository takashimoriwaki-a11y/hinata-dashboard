/**
 * useVoiceInput
 *
 * Web Speech API (SpeechRecognition) を第一選択で使用し、
 * 非対応環境では MediaRecorder + Whisper API にフォールバックする
 * 共通音声入力カスタムフック。
 *
 * 使い方:
 *   const { isRecording, startVoice, stopVoice, isProcessing } = useVoiceInput({
 *     onResult: (text) => setMyText(prev => prev + text),
 *   });
 */

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

interface UseVoiceInputOptions {
  /** 認識結果テキストを受け取るコールバック */
  onResult: (text: string) => void;
  /** 言語（デフォルト: ja-JP） */
  lang?: string;
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
}

// SpeechRecognition の型定義（ブラウザ互換）
type SpeechRecognitionType = typeof globalThis extends { SpeechRecognition: infer T }
  ? T
  : typeof globalThis extends { webkitSpeechRecognition: infer T }
  ? T
  : never;

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
  lang = "ja-JP",
}: UseVoiceInputOptions): UseVoiceInputReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Web Speech API 用
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  // MediaRecorder フォールバック用
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // ---- Web Speech API 実装 ----
  const startSpeechRecognition = useCallback((): boolean => {
    const SpeechRecognitionClass = getSpeechRecognitionClass();
    if (!SpeechRecognitionClass) return false;

    try {
      const recognition = new SpeechRecognitionClass();
      recognition.lang = lang;
      recognition.continuous = true;       // 長い発話に対応
      recognition.interimResults = false;  // 確定結果のみ取得（精度優先）
      recognition.maxAlternatives = 1;

      let accumulatedText = "";

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            accumulatedText += event.results[i][0].transcript;
          }
        }
      };

      recognition.onend = () => {
        setIsRecording(false);
        if (accumulatedText.trim()) {
          onResult(accumulatedText.trim());
          toast.success("音声入力完了");
        }
        recognitionRef.current = null;
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        setIsRecording(false);
        recognitionRef.current = null;
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
      setIsRecording(true);
      return true;
    } catch {
      return false;
    }
  }, [lang, onResult]);

  const stopSpeechRecognition = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
  }, []);

  // ---- MediaRecorder + Whisper フォールバック実装 ----
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

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        // ストリームを停止
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        const blob = new Blob(chunksRef.current, {
          type: mimeType || "audio/webm",
        });

        if (blob.size === 0) {
          toast.error("録音データが空です。もう一度お試しください。");
          setIsProcessing(false);
          return;
        }

        if (blob.size > 16 * 1024 * 1024) {
          toast.error("音声ファイルが大きすぎます（16MB以下）");
          setIsProcessing(false);
          return;
        }

        setIsProcessing(true);
        toast.info("文字起こし中...");

        try {
          const formData = new FormData();
          const ext = mimeType.includes("mp4") ? "m4a" : "webm";
          formData.append("audio", blob, `recording.${ext}`);
          formData.append("language", "ja");

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
            toast.success("音声入力完了");
          } else {
            toast.error("音声を認識できませんでした。もう一度お試しください。");
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "不明なエラー";
          toast.error(`音声入力エラー: ${msg}`);
        } finally {
          setIsProcessing(false);
        }
      };

      // 250ms ごとにデータを収集（データロス防止）
      recorder.start(250);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        toast.error("マイクのアクセスが許可されていません。ブラウザの設定を確認してください。");
      } else {
        toast.error("マイクの起動に失敗しました。");
      }
    }
  }, [onResult]);

  const stopMediaRecorder = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    setIsRecording(false);
  }, []);

  // ---- 公開 API ----
  const startVoice = useCallback(() => {
    // Web Speech API が使えれば優先使用
    const usedSpeechAPI = startSpeechRecognition();
    if (!usedSpeechAPI) {
      // フォールバック: MediaRecorder
      startMediaRecorder();
    }
  }, [startSpeechRecognition, startMediaRecorder]);

  const stopVoice = useCallback(() => {
    if (recognitionRef.current) {
      stopSpeechRecognition();
    } else if (mediaRecorderRef.current) {
      stopMediaRecorder();
    }
  }, [stopSpeechRecognition, stopMediaRecorder]);

  const toggleVoice = useCallback(() => {
    if (isRecording) {
      stopVoice();
    } else {
      startVoice();
    }
  }, [isRecording, startVoice, stopVoice]);

  return { isRecording, isProcessing, startVoice, stopVoice, toggleVoice };
}
