/**
 * VoiceMicButton
 *
 * 音声入力ボタン共通コンポーネント。
 * アプリ内の全ての音声入力ボタンはこのコンポーネントを使用する。
 *
 * - タップ1回でON/OFFトグル
 * - 録音中: 赤背景 + 波形バーアニメーション + ping
 * - 処理中: スピナー表示
 * - 通常時: マイクアイコン
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
  /** 無効化 */
  disabled?: boolean;
}

const sizeConfig = {
  sm: {
    button: "h-8 w-8 rounded-lg",
    icon: "w-3.5 h-3.5",
    bars: "h-3",
    barWidth: "w-0.5",
  },
  md: {
    button: "h-10 w-10 rounded-xl",
    icon: "w-4 h-4",
    bars: "h-4",
    barWidth: "w-0.5",
  },
  lg: {
    button: "h-10 w-10 rounded-xl",
    icon: "w-4 h-4",
    bars: "h-4",
    barWidth: "w-0.5",
  },
};

export function VoiceMicButton({
  onResult,
  size = "md",
  className,
  disabled = false,
}: VoiceMicButtonProps) {
  const { isRecording, isProcessing, toggleVoice } = useVoiceInput({ onResult });
  const cfg = sizeConfig[size];

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
        "relative inline-flex items-center justify-center flex-shrink-0",
        "border transition-all duration-200 select-none",
        "touch-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        cfg.button,
        isRecording
          ? "bg-red-500 border-red-400 text-white shadow-md shadow-red-500/40"
          : isProcessing
          ? "bg-muted border-border text-muted-foreground cursor-wait"
          : "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20 hover:border-primary/50 active:scale-95",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
      aria-label={isRecording ? "録音停止" : isProcessing ? "処理中" : "音声入力開始"}
      title={isRecording ? "タップして停止" : isProcessing ? "文字起こし中..." : "タップして音声入力"}
    >
      {/* 録音中のpingアニメーション */}
      {isRecording && (
        <span className="absolute inset-0 rounded-[inherit] overflow-hidden pointer-events-none">
          <span className="absolute inset-0 animate-ping rounded-[inherit] bg-red-400 opacity-25" />
        </span>
      )}

      {/* アイコン / 波形 */}
      {isProcessing ? (
        <Loader2 className={cn(cfg.icon, "animate-spin")} />
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
    </button>
  );
}
