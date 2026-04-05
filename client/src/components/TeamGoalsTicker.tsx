import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

const TEAM_BADGE_COLORS: Record<string, string> = {
  "身体": "bg-teal-500/20 text-teal-300 border-teal-500/40",
  "天理": "bg-blue-500/20 text-blue-300 border-blue-500/40",
  "郡山北部": "bg-amber-500/20 text-amber-300 border-amber-500/40",
  "郡山南部": "bg-purple-500/20 text-purple-300 border-purple-500/40",
  "全チーム": "bg-orange-500/20 text-orange-300 border-orange-500/40",
};

export default function TeamGoalsTicker() {
  const { data: goals = [] } = trpc.teamGoals.getActive.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // 目標がない場合は何も表示しない
  if (goals.length === 0) return null;

  // テロップアイテムを2セット繰り返してシームレスなループを実現
  const items = [...goals, ...goals];

  return (
    <div
      className="relative overflow-hidden flex-shrink-0"
      style={{
        background: "linear-gradient(135deg, rgba(20,20,40,0.95) 0%, rgba(30,20,50,0.95) 100%)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {/* 左右のフェードマスク */}
      <div
        className="absolute left-0 top-0 bottom-0 w-10 z-10 pointer-events-none"
        style={{ background: "linear-gradient(to right, rgba(20,20,40,0.95), transparent)" }}
      />
      <div
        className="absolute right-0 top-0 bottom-0 w-10 z-10 pointer-events-none"
        style={{ background: "linear-gradient(to left, rgba(20,20,40,0.95), transparent)" }}
      />
      {/* テロップ本体 */}
      <div className="flex items-center gap-0 py-2 px-2 team-goals-ticker-track">
        {items.map((g, idx) => {
          const startStr = g.startDate
            ? (() => {
                const d = new Date(g.startDate);
                return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
              })()
            : null;
          const endStr = g.endDate
            ? (() => {
                const d = new Date(g.endDate);
                return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
              })()
            : null;
          return (
            <div key={`${g.id}-${idx}`} className="flex items-center gap-2.5 flex-shrink-0 px-5">
              {/* チームバッジ */}
              <span
                className={cn(
                  "text-[11px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0",
                  TEAM_BADGE_COLORS[g.team] ?? "bg-muted/60 text-foreground border-border"
                )}
              >
                {g.team}
              </span>
              {/* 目標タイトル */}
              <span className="text-sm font-semibold text-white/90 whitespace-nowrap">
                {g.title}
              </span>
              {/* 期間 */}
              {(startStr || endStr) && (
                <span className="text-[10px] text-white/40 whitespace-nowrap flex-shrink-0">
                  {startStr ?? ""}
                  {startStr && endStr ? " 〜 " : ""}
                  {endStr ?? ""}
                </span>
              )}
              {/* 区切り */}
              <span className="text-white/15 text-base flex-shrink-0 ml-1">｜</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
