/**
 * VoiceMicButton
 *
 * 音声入力ボタン共通コンポーネント。
 * - 録音中は赤い波形アニメーションを表示
 * - 処理中はスピナーを表示
 * - タップ1回でON/OFFトグル
 */

import { Loader2, Mic, MicOff } from "lucide-react";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { cn } from "@/lib/utils";

interface VoiceMicButtonProps {
  /** 認識結果テキストを受け取るコールバック */
  onResult: (text: string) => void;
  /** ボタンサイズ（デフォルト: md） */
  size?: "sm" | "md" | "lg";
  /** 追加クラス */
  className?: string;
  /** ラベルテキスト（省略時はアイコンのみ） */
  label?: string;
  /** 無効化 */
  disabled?: boolean;
}

const sizeClasses = {
  sm: "h-8 px-2 text-xs gap-1",
  md: "h-10 px-3 text-sm gap-1.5",
  lg: "h-12 px-4 text-base gap-2",
};

const iconSizes = {
  sm: "w-3.5 h-3.5",
  md: "w-4 h-4",
  lg: "w-5 h-5",
};

export function VoiceMicButton({
  onResult,
  size = "md",
  className,
  label,
  disabled = false,
}: VoiceMicButtonProps) {
  const { isRecording, isProcessing, toggleVoice } = useVoiceInput({ onResult });

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    if (disabled || isProcessing) return;
    toggleVoice();
  };

  return (
    <button
      type="button"
      onPointerDown={handlePointerDown}
      disabled={disabled || isProcessing}
      className={cn(
        "relative inline-flex items-center justify-center rounded-md font-medium",
        "border transition-all duration-200 select-none",
        "touch-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        sizeClasses[size],
        isRecording
          ? "bg-red-500 border-red-500 text-white shadow-lg shadow-red-500/30"
          : isProcessing
          ? "bg-muted border-border text-muted-foreground cursor-wait"
          : "bg-background border-border text-foreground hover:bg-muted active:scale-95",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
      aria-label={isRecording ? "録音停止" : isProcessing ? "処理中" : "音声入力開始"}
      title={isRecording ? "タップして停止" : isProcessing ? "文字起こし中..." : "タップして音声入力"}
    >
      {/* 録音中の波形アニメーション */}
      {isRecording && (
        <span className="absolute inset-0 rounded-md overflow-hidden pointer-events-none">
          <span className="absolute inset-0 animate-ping rounded-md bg-red-400 opacity-30" />
        </span>
      )}

      {/* アイコン */}
      {isProcessing ? (
        <Loader2 className={cn(iconSizes[size], "animate-spin")} />
      ) : isRecording ? (
        <>
          <MicOff className={cn(iconSizes[size])} />
          {/* 録音中の波形バー */}
          <span className="flex items-end gap-px h-4">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className="w-0.5 bg-white rounded-full"
                style={{
                  height: `${30 + Math.random() * 40}%`,
                  animation: `voiceBar 0.6s ease-in-out infinite alternate`,
                  animationDelay: `${i * 0.15}s`,
                }}
              />
            ))}
          </span>
        </>
      ) : (
        <Mic className={cn(iconSizes[size])} />
      )}

      {/* ラベル */}
      {label && !isRecording && !isProcessing && (
        <span>{label}</span>
      )}
      {label && isRecording && (
        <span>停止</span>
      )}
      {label && isProcessing && (
        <span>処理中...</span>
      )}
    </button>
  );
}
