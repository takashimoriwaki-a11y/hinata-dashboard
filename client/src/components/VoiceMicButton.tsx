/**
 * VoiceMicButton
 *
 * 音声入力ボタン共通コンポーネント。
 * アプリ内の全ての音声入力ボタンはこのコンポーネントを使用する。
 *
 * - タップ1回でON/OFFトグル
 * - 録音中: 赤背景 + 波形バーアニメーション + ping + 外側リング波形 + 経過時間バッジ
 * - 処理中: スピナー表示
 * - 通常時: マイクアイコン
 * - 録音中は interimText（暫定テキスト）をボタン横にリアルタイム表示
 * - 無音タイマー残り5秒以下でカウントダウン表示
 *
 * externalState プロップを渡すと、外部の useVoiceInput フックの状態を使用する。
 * これにより、フックを共有しつつボタンデザインを統一できる。
 */

import React from "react";
import { Loader2, Mic, Pause, Play } from "lucide-react";
import { useVoiceInput, formatElapsedTime } from "@/hooks/useVoiceInput";
import { cn } from "@/lib/utils";

/** 外部フック状態の型（useVoiceInput の戻り値のサブセット） */
export interface VoiceExternalState {
  isRecording: boolean;
  /** 一時停止中かどうか */
  isPaused?: boolean;
  isProcessing: boolean;
  toggleVoice: () => void;
  /** 一時停止する */
  pauseVoice?: () => void;
  /** 一時停止から再開する */
  resumeVoice?: () => void;
  /** 確定済みテキストのリアルタイムプレビュー */
  liveConfirmedText?: string;
  interimText: string;
  silenceCountdown: number | null;
  /** 録音開始からの経過秒数（録音中のみ更新） */
  elapsedSeconds?: number;
}

interface VoiceMicButtonProps {
  /** 認識結果テキストを受け取るコールバック（externalState 使用時は不要） */
  onResult?: (text: string) => void;
  /** 録音状態変化時のコールバック */
  onRecordingChange?: (isRecording: boolean) => void;
  /** 暂定テキスト変化時のコールバック */
  onInterimTextChange?: (text: string) => void;
  /** ボタンサイズ（デフォルト: md） */
  size?: "sm" | "md" | "lg";
  /** 追加クラス */
  className?: string;
  /** 無効化 */
  disabled?: boolean;
  /**
   * プレビュー表示モード（デフォルト: "tooltip"）
   * - "tooltip": ボタン上部にポップアップ表示
   * - "inline": ボタン右横にインライン表示（横並びレイアウト用）
   * - "none": プレビューなし
   */
  previewMode?: "tooltip" | "inline" | "none";
  /**
   * 音声認識のコンテキスト（画面ごとの医療用語プロンプト最適化用）
   * 'clinical_notes' | 'task' | 'schedule_change' | 'message' | 'general'
   */
  context?: string;
  /**
   * 長文モード（trueの場合、無音タイムアウトを60秒に延長し最大3分まで録音可能）
   * デフォルト: false
   */
  longTextMode?: boolean;
  /**
   * 無音自動停止までのミリ秒（明示指定する場合）
   * 省略時は longTextMode に応じて自動設定
   */
  silenceTimeoutMs?: number;
  /**
   * 外部フック状態（useVoiceInput の戻り値）。
   * 指定すると内部で useVoiceInput を呼ばず、この状態を使用する。
   * notesVoice など既存フックのボタンをこのコンポーネントに統一する際に使用。
   */
  externalState?: VoiceExternalState;
  /**
   * 経過時間バッジの表示位置（デフォルト: "below"）
   * - "below": ボタン下部に表示
   * - "none": 非表示
   */
  elapsedPosition?: "below" | "none";
}

const sizeConfig = {
  sm: {
    button: "h-8 w-8 rounded-lg",
    icon: "w-3.5 h-3.5",
    bars: "h-3",
    barWidth: "w-0.5",
    previewText: "text-xs",
    countdown: "text-xs",
    ringRadius: "rounded-lg",
    elapsed: "text-xs",
  },
  md: {
    button: "h-10 w-10 rounded-xl",
    icon: "w-4 h-4",
    bars: "h-4",
    barWidth: "w-0.5",
    previewText: "text-sm",
    countdown: "text-xs",
    ringRadius: "rounded-xl",
    elapsed: "text-xs",
  },
  lg: {
    button: "h-14 w-14 rounded-full",
    icon: "w-5 h-5",
    bars: "h-5",
    barWidth: "w-0.5",
    previewText: "text-sm",
    countdown: "text-sm",
    ringRadius: "rounded-full",
    elapsed: "text-xs",
  },
};

export function VoiceMicButton({
  onResult,
  onRecordingChange,
  onInterimTextChange,
  size = "md",
  className,
  disabled = false,
  previewMode = "tooltip",
  context = "general",
  externalState,
  elapsedPosition = "below",
  longTextMode = false,
  silenceTimeoutMs,
}: VoiceMicButtonProps) {
  // externalState が指定されていない場合のみ内部フックを使用
  const internalHook = useVoiceInput({
    onResult: onResult ?? (() => {}),
    onRecordingChange,
    context,
    longTextMode,
    silenceTimeoutMs,
  });

  // 使用する状態を決定（外部 > 内部）
  const { isRecording, isProcessing, toggleVoice, interimText, silenceCountdown } =
    externalState ?? internalHook;

  // isPaused / pauseVoice / resumeVoice: externalStateに含まれていれば使用、なければ内部フックから取得
  const isPaused = externalState?.isPaused ?? internalHook.isPaused;
  const pauseVoice = externalState?.pauseVoice ?? internalHook.pauseVoice;
  const resumeVoice = externalState?.resumeVoice ?? internalHook.resumeVoice;

  // elapsedSeconds: externalStateに含まれていれば使用、なければ内部フックから取得
  const elapsedSeconds = externalState?.elapsedSeconds ?? internalHook.elapsedSeconds;
  // liveConfirmedText: 確定済みテキストのリアルタイムプレビュー
  const liveConfirmedText = externalState?.liveConfirmedText ?? internalHook.liveConfirmedText;

  // interimText変化時にコールバックを呼び出す
  const prevInterimRef = React.useRef("");
  React.useEffect(() => {
    if (interimText !== prevInterimRef.current) {
      prevInterimRef.current = interimText;
      onInterimTextChange?.(interimText);
    }
  }, [interimText, onInterimTextChange]);
  const cfg = sizeConfig[size];

  // 残り5秒以下でカウントダウン警告を表示
  const showCountdown = isRecording && silenceCountdown !== null && silenceCountdown <= 5;

  const touchHandledRef = React.useRef(false);
  const pauseTouchHandledRef = React.useRef(false);

  const handleClick = () => {
    // onTouchEndで処理済みの場合はスキップ（二重呼び出し防止）
    if (touchHandledRef.current) {
      touchHandledRef.current = false;
      return;
    }
    if (disabled || isProcessing) return;
    toggleVoice();
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault(); // iOSでclickイベントの300ms遅延を防止
    touchHandledRef.current = true;
    if (disabled || isProcessing) return;
    toggleVoice();
  };

  const handlePauseClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pauseTouchHandledRef.current) {
      pauseTouchHandledRef.current = false;
      return;
    }
    if (disabled || isProcessing) return;
    if (isPaused) {
      resumeVoice?.();
    } else {
      pauseVoice?.();
    }
  };

  const handlePauseTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    pauseTouchHandledRef.current = true;
    if (disabled || isProcessing) return;
    if (isPaused) {
      resumeVoice?.();
    } else {
      pauseVoice?.();
    }
  };

  const innerButton = (
    <button
      type="button"
      onClick={handleClick}
      onTouchEnd={handleTouchEnd}
      disabled={disabled || isProcessing}
      className={cn(
        "relative inline-flex items-center justify-center flex-shrink-0",
        "border transition-all duration-200 select-none",
        "touch-pan-y focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        cfg.button,
        isRecording
          ? showCountdown
            ? "bg-orange-500 border-orange-400 text-white shadow-md shadow-orange-500/40"
            : "bg-red-500 border-red-400 text-white shadow-md shadow-red-500/40"
          : isProcessing
          ? "bg-muted border-border text-muted-foreground cursor-wait"
          : "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20 hover:border-primary/50 active:scale-95",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
      aria-label={isRecording ? "録音停止" : isProcessing ? "処理中" : "音声入力開始"}
      title={
        isRecording
          ? showCountdown
            ? `あと${silenceCountdown}秒で自動停止`
            : "タップして停止"
          : isProcessing
          ? "文字起こし中..."
          : "タップして音声入力"
      }
    >
      {/* 録音中のpingアニメーション */}
      {isRecording && (
        <span className="absolute inset-0 rounded-[inherit] overflow-hidden pointer-events-none">
          <span
            className={cn(
              "absolute inset-0 animate-ping rounded-[inherit] opacity-25",
              showCountdown ? "bg-orange-400" : "bg-red-400"
            )}
          />
        </span>
      )}

      {/* アイコン / 波形 / カウントダウン */}
      {isProcessing ? (
        <Loader2 className={cn(cfg.icon, "animate-spin")} />
      ) : isRecording && isPaused ? (
        // 一時停止中: 再生アイコンを表示
        <Play className={cn(cfg.icon, "fill-white")} />
      ) : isRecording && showCountdown ? (
        // 残り5秒以下: カウントダウン数字を表示
        <span className={cn("font-bold leading-none", cfg.countdown)}>
          {silenceCountdown}
        </span>
      ) : isRecording ? (
        <span className={cn("flex items-end justify-center gap-px", cfg.bars)}>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={cn(cfg.barWidth, "bg-white rounded-full")}
              style={{
                height: "60%",
                animation: "voiceBar 0.5s ease-in-out infinite alternate",
                animationDelay: `${i * 0.12}s`,
              }}
            />
          ))}
        </span>
      ) : (
        <Mic className={cfg.icon} />
      )}

      {/* tooltip モード: ボタン上部にポップアップ */}
      {previewMode === "tooltip" && isRecording && (
        <>
          {/* 確定テキスト + 暫定テキスト プレビュー（色分け） */}
          {(liveConfirmedText || interimText) && (
            <span
              className={cn(
                "absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50",
                "max-w-[240px] w-max px-2.5 py-1.5 rounded-lg",
                "bg-gray-900/90 dark:bg-gray-100/90 backdrop-blur-sm",
                "font-normal leading-snug",
                "pointer-events-none shadow-lg",
                "animate-in fade-in-0 zoom-in-95 duration-150",
                cfg.previewText
              )}
            >
              <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900/90 dark:border-t-gray-100/90" />
              {liveConfirmedText && (
                <span className="text-white dark:text-gray-900 font-medium">{liveConfirmedText}</span>
              )}
              {liveConfirmedText && interimText && (
                <span className="text-white/40 dark:text-gray-900/40"> </span>
              )}
              {interimText && (
                <span className="text-yellow-300 dark:text-yellow-600 italic opacity-80">{interimText}</span>
              )}
            </span>
          )}
          {/* 残り5秒以下のカウントダウン警告 */}
          {showCountdown && !interimText && (
            <span
              className={cn(
                "absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50",
                "w-max px-2.5 py-1.5 rounded-lg",
                "bg-orange-600/90 backdrop-blur-sm",
                "text-white font-medium leading-snug",
                "pointer-events-none shadow-lg",
                "animate-in fade-in-0 zoom-in-95 duration-150",
                cfg.previewText
              )}
            >
              <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-orange-600/90" />
              あと{silenceCountdown}秒で自動停止
            </span>
          )}
        </>
      )}
    </button>
  );

  // 外側リング波形アニメーション付きラッパー
  const buttonWithRings = (
    <span className="relative inline-flex flex-col items-center justify-center flex-shrink-0 gap-0.5">
      {/* 外側リング（1枚目）: 録音中かつカウントダウンなしかつ一時停止中でない */}
      {isRecording && !showCountdown && !isPaused && (
        <span
          className={cn("absolute pointer-events-none", cfg.ringRadius)}
          style={{
            inset: 0,
            animation: "voiceRing 1.4s ease-out infinite",
            backgroundColor: "rgba(239, 68, 68, 0.35)",
          }}
        />
      )}
      {/* 外側リング（2枚目）: 0.5秒遅延 */}
      {isRecording && !showCountdown && !isPaused && (
        <span
          className={cn("absolute pointer-events-none", cfg.ringRadius)}
          style={{
            inset: 0,
            animation: "voiceRing2 1.4s ease-out 0.5s infinite",
            backgroundColor: "rgba(239, 68, 68, 0.25)",
          }}
        />
      )}
      {innerButton}
      {/* 一時停止ボタン: 録音中のみ表示（メインボタンの左側に並び、絶対位置で表示） */}
      {isRecording && !isProcessing && (
        <button
          type="button"
          onClick={handlePauseClick}
          onTouchEnd={handlePauseTouchEnd}
          className={cn(
            "absolute -left-9 top-1/2 -translate-y-1/2",
            "h-7 w-7 rounded-full",
            "inline-flex items-center justify-center",
            "border transition-all duration-200 select-none",
            "touch-pan-y focus:outline-none",
            isPaused
              ? "bg-green-500 border-green-400 text-white shadow-md shadow-green-500/40"
              : "bg-amber-500 border-amber-400 text-white shadow-md shadow-amber-500/40",
            "animate-in fade-in-0 zoom-in-95 duration-200"
          )}
          aria-label={isPaused ? "再開" : "一時停止"}
          title={isPaused ? "タップして再開" : "タップして一時停止"}
        >
          {isPaused ? (
            <Play className="w-3.5 h-3.5 fill-white" />
          ) : (
            <Pause className="w-3.5 h-3.5 fill-white" />
          )}
        </button>
      )}
      {/* 経過時間バッジ: 録音中かつelapsedPosition="below"のとき表示 */}
      {isRecording && elapsedPosition === "below" && !showCountdown && (
        <span
          className={cn(
            "font-mono font-semibold tabular-nums leading-none pointer-events-none",
            "px-1.5 py-0.5 rounded-full",
            isPaused
              ? "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300"
              : "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300",
            "animate-in fade-in-0 duration-200",
            cfg.elapsed
          )}
        >
          {isPaused ? "⏸ " : ""}{formatElapsedTime(elapsedSeconds)}
        </span>
      )}
    </span>
  );

  // inline モード: ボタン + テキストを横並びで返す
  if (previewMode === "inline") {
    return (
      <span className={cn("inline-flex items-center gap-2 min-w-0", isRecording && "pl-10")}>
        {buttonWithRings}
        {isRecording && isPaused && (
          <span className={cn("text-amber-500 font-medium", cfg.previewText)}>
            ⏸ 一時停止中 — 再開は左のボタンをタップ
          </span>
        )}
        {isRecording && !isPaused && (liveConfirmedText || interimText) && (
          <span
            className={cn(
              "truncate max-w-[220px]",
              "animate-in fade-in-0 duration-150",
              cfg.previewText
            )}
          >
            {liveConfirmedText && (
              <span className="text-foreground font-medium">{liveConfirmedText}</span>
            )}
            {liveConfirmedText && interimText && (
              <span className="text-foreground/40"> </span>
            )}
            {interimText && (
              <span className="text-yellow-500 dark:text-yellow-400 italic">{interimText}</span>
            )}
          </span>
        )}
        {isRecording && !isPaused && !liveConfirmedText && !interimText && !showCountdown && (
          <span className={cn("text-muted-foreground italic", cfg.previewText)}>
            話してください...
          </span>
        )}
        {isRecording && !isPaused && showCountdown && !interimText && (
          <span className={cn("text-orange-500 font-medium", cfg.previewText)}>
            あと{silenceCountdown}秒で自動停止
          </span>
        )}
      </span>
    );
  }

  return buttonWithRings;
}
