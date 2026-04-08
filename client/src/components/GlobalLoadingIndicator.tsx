/**
 * GlobalLoadingIndicator - tRPCのクエリ・ミューテーション実行中にヘッダー右上に表示するスピナー
 * useIsFetching / useIsMutating を使ってグローバルなAPI通信状態を監視する
 */
import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

export default function GlobalLoadingIndicator() {
  const isFetching = useIsFetching();
  const isMutating = useIsMutating();
  const isActive = isFetching > 0 || isMutating > 0;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 transition-opacity duration-300",
        isActive ? "opacity-100" : "opacity-0 pointer-events-none"
      )}
      aria-live="polite"
      aria-label={isActive ? "通信中" : undefined}
    >
      {/* 小さなスピナー */}
      <svg
        className="w-3.5 h-3.5 animate-spin text-orange-500"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      <span className="text-xs font-medium text-orange-500 whitespace-nowrap hidden sm:inline">
        {isMutating > 0 ? "更新中..." : "読込中..."}
      </span>
    </div>
  );
}
