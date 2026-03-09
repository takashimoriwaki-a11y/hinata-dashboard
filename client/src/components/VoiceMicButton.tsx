/**
 * VoiceMicButton
 *
 * 音声入力ボタン共通コンポーネント。
 * アプリ内の全ての音声入力ボタンはこのコンポーネントを使用する。
 *
 * - タップ1回でON/OFFトグル
 * - 録音中: 赤背景 + 波形バーアニメーション + ping + 外側リング波形
 * - 処理中: スピナー表示
 * - 通常時: マイクアイコン
 * - 録音中は interimText（暫定テキスト）をボタン横にリアルタイム表示
 * - 無音タイマー残り5秒以下でカウントダウン表示
 */

import React from "react";
import { Loader2, Mic } from "lucide-react";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { cn } from "@/lib/utils";

interface VoiceMicButtonProps {
  /** 認識結果テキストを受け取るコールバック */
  onResult: (text: string) => void;
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
}

const sizeConfig = {
  sm: {
    button: "h-8 w-8 rounded-lg",
    icon: "w-3.5 h-3.5",
    bars: "h-3",
    barWidth: "w-0.5",
    previewText: "text-xs",
    countdown: "text-[9px]",
    ringRadius: "rounded-lg",
  },
  md: {
    button: "h-10 w-10 rounded-xl",
    icon: "w-4 h-4",
    bars: "h-4",
    barWidth: "w-0.5",
    previewText: "text-sm",
    countdown: "text-[10px]",
    ringRadius: "rounded-xl",
  },
  lg: {
    button: "h-14 w-14 rounded-full",
    icon: "w-5 h-5",
    bars: "h-5",
    barWidth: "w-0.5",
    previewText: "text-sm",
    countdown: "text-sm",
    ringRadius: "rounded-full",
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
}: VoiceMicButtonProps) {
  const { isRecording, isProcessing, toggleVoice, interimText, silenceCountdown } = useVoiceInput({
    onResult,
    onRecordingChange,
    context,
  });

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

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    if (disabled || isProcessing) return;
    toggleVoice();
  };

  const innerButton = (
    <button
      type="button"
      onPointerDown={handlePointerDown}
      disabled={disabled || isProcessing}
      className={cn(
        "relative inline-flex items-center justify-center flex-shrink-0",
        "border transition-all duration-200 select-none",
        "touch-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
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
          {/* interimText プレビュー */}
          {interimText && (
            <span
              className={cn(
                "absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50",
                "max-w-[200px] w-max px-2.5 py-1.5 rounded-lg",
                "bg-gray-900/90 dark:bg-gray-100/90 backdrop-blur-sm",
                "text-white dark:text-gray-900 font-normal leading-snug",
                "pointer-events-none shadow-lg",
                "animate-in fade-in-0 zoom-in-95 duration-150",
                cfg.previewText
              )}
            >
              <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900/90 dark:border-t-gray-100/90" />
              <span className="opacity-60 italic">{interimText}</span>
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
    <span className="relative inline-flex items-center justify-center flex-shrink-0">
      {/* 外側リング（1枚目）: 録音中かつカウントダウンなし */}
      {isRecording && !showCountdown && (
        <span
          className={cn("absolute inset-0 pointer-events-none", cfg.ringRadius)}
          style={{
            animation: "voiceRing 1.4s ease-out infinite",
            backgroundColor: "rgba(239, 68, 68, 0.35)",
          }}
        />
      )}
      {/* 外側リング（2枚目）: 0.5秒遅延 */}
      {isRecording && !showCountdown && (
        <span
          className={cn("absolute inset-0 pointer-events-none", cfg.ringRadius)}
          style={{
            animation: "voiceRing2 1.4s ease-out 0.5s infinite",
            backgroundColor: "rgba(239, 68, 68, 0.25)",
          }}
        />
      )}
      {innerButton}
    </span>
  );

  // inline モード: ボタン + テキストを横並びで返す
  if (previewMode === "inline") {
    return (
      <span className="inline-flex items-center gap-2 min-w-0">
        {buttonWithRings}
        {isRecording && interimText && (
          <span
            className={cn(
              "text-muted-foreground italic truncate max-w-[180px]",
              "animate-in fade-in-0 duration-150",
              cfg.previewText
            )}
          >
            {interimText}
          </span>
        )}
        {isRecording && !interimText && !showCountdown && (
          <span className={cn("text-muted-foreground italic", cfg.previewText)}>
            話してください...
          </span>
        )}
        {isRecording && showCountdown && !interimText && (
          <span className={cn("text-orange-500 font-medium", cfg.previewText)}>
            あと{silenceCountdown}秒で自動停止
          </span>
        )}
      </span>
    );
  }

  return buttonWithRings;
}
