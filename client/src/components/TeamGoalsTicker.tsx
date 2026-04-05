import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { useTheme } from "@/contexts/ThemeContext";

// 夜モード：チームバッジ色（ダーク背景向け）
const TEAM_BADGE_COLORS_NIGHT: Record<string, string> = {
  "身体": "bg-teal-500/20 text-teal-300 border-teal-500/40",
  "天理": "bg-blue-500/20 text-blue-300 border-blue-500/40",
  "郡山北部": "bg-amber-500/20 text-amber-300 border-amber-500/40",
  "郡山南部": "bg-purple-500/20 text-purple-300 border-purple-500/40",
  "全チーム": "bg-orange-500/20 text-orange-300 border-orange-500/40",
};

// 昼モード：チームバッジ色（明るい背景向け）
const TEAM_BADGE_COLORS_DAY: Record<string, string> = {
  "身体": "bg-teal-100 text-teal-700 border-teal-300",
  "天理": "bg-blue-100 text-blue-700 border-blue-300",
  "郡山北部": "bg-amber-100 text-amber-700 border-amber-300",
  "郡山南部": "bg-purple-100 text-purple-700 border-purple-300",
  "全チーム": "bg-orange-100 text-orange-700 border-orange-300",
};

export default function TeamGoalsTicker() {
  const { isNight } = useTheme();
  const { data: goals = [] } = trpc.teamGoals.getActive.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // 目標がない場合は何も表示しない
  if (goals.length === 0) return null;

  // テロップアイテムを2セット繰り返してシームレスなループを実現
  const items = [...goals, ...goals];

  const badgeColors = isNight ? TEAM_BADGE_COLORS_NIGHT : TEAM_BADGE_COLORS_DAY;

  // 背景・ボーダー・フェードマスクの色をモードに応じて切り替え
  const bgStyle = isNight
    ? {
        background: "linear-gradient(135deg, rgba(20,20,40,0.95) 0%, rgba(30,20,50,0.95) 100%)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
      }
    : {
        background: "linear-gradient(135deg, #fff7ed 0%, #ffedd5 60%, #fde8c8 100%)",
        borderBottom: "1px solid rgba(249,115,22,0.15)",
      };

  const fadeLeft = isNight
    ? "linear-gradient(to right, rgba(20,20,40,0.95), transparent)"
    : "linear-gradient(to right, #fff7ed, transparent)";

  const fadeRight = isNight
    ? "linear-gradient(to left, rgba(20,20,40,0.95), transparent)"
    : "linear-gradient(to left, #fff7ed, transparent)";

  const titleColor = isNight ? "text-white/90" : "text-orange-900";
  const dateColor = isNight ? "text-white/40" : "text-orange-500/70";
  const dividerColor = isNight ? "text-white/15" : "text-orange-300/50";

  return (
    <div
      className="relative overflow-hidden flex-shrink-0 transition-colors duration-500"
      style={bgStyle}
    >
      {/* 左右のフェードマスク */}
      <div
        className="absolute left-0 top-0 bottom-0 w-10 z-10 pointer-events-none"
        style={{ background: fadeLeft }}
      />
      <div
        className="absolute right-0 top-0 bottom-0 w-10 z-10 pointer-events-none"
        style={{ background: fadeRight }}
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
                  badgeColors[g.team] ?? (isNight
                    ? "bg-muted/60 text-foreground border-border"
                    : "bg-gray-100 text-gray-700 border-gray-300")
                )}
              >
                {g.team}
              </span>
              {/* 目標タイトル */}
              <span className={cn("text-sm font-semibold whitespace-nowrap", titleColor)}>
                {g.title}
              </span>
              {/* 期間 */}
              {(startStr || endStr) && (
                <span className={cn("text-[10px] whitespace-nowrap flex-shrink-0", dateColor)}>
                  {startStr ?? ""}
                  {startStr && endStr ? " 〜 " : ""}
                  {endStr ?? ""}
                </span>
              )}
              {/* 区切り */}
              <span className={cn("text-base flex-shrink-0 ml-1", dividerColor)}>｜</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
