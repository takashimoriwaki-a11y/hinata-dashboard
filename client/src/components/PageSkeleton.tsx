/**
 * PageSkeleton - ページ遷移直後のコンテンツ読み込み中に表示するスケルトンUI
 * DashboardLayout の children が切り替わる際に一瞬表示する
 */

import { cn } from "@/lib/utils";

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-lg bg-muted/60 animate-pulse",
        className
      )}
    />
  );
}

export default function PageSkeleton() {
  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      {/* ウェルカムバナー相当 */}
      <SkeletonBlock className="h-28 w-full rounded-xl" />

      {/* カード2枚 */}
      <div className="grid grid-cols-2 gap-3">
        <SkeletonBlock className="h-20" />
        <SkeletonBlock className="h-20" />
      </div>

      {/* リストカード */}
      <SkeletonBlock className="h-10 w-full" />
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <SkeletonBlock key={i} className="h-14 w-full" />
        ))}
      </div>

      {/* 下部カード */}
      <SkeletonBlock className="h-24 w-full" />
    </div>
  );
}
