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

// 企業理念フォールバック用テキスト（目標がない場合に表示）
const PHILOSOPHY_FALLBACK = [
  { label: "HINATA'S WAY", text: "「存在で支え合う」", sub: "私たちは出会うすべての人々と、お互いの存在がこころの支えになる関係を築きます。" },
  { label: "光陽の想い", text: "地域に根ざした看護を", sub: "精神障害や認知症を持つ方が、地域で安心して暮らせる仕組みをつくります。" },
  { label: "チームの力", text: "仲間と支えあいながら", sub: "スタッフ一人ひとりが輝き、利用者の生活を豊かにするケアを届けます。" },
];

// 目標数に応じたアニメーション速度（秒）を計算する
// 1件=20秒、2件=25秒、3〜4件=30秒、5件以上=35秒（読みやすさを優先）
function calcDuration(count: number): number {
  if (count <= 1) return 20;
  if (count <= 2) return 25;
  if (count <= 4) return 30;
  return Math.min(20 + count * 3, 60); // 最大60秒
}

export default function TeamGoalsTicker() {
  const { isNight } = useTheme();
  const { data: goals = [], isLoading } = trpc.teamGoals.getActive.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // ローディング中は何も表示しない
  if (isLoading) return null;

  const hasGoals = goals.length > 0;

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
  const badgeColors = isNight ? TEAM_BADGE_COLORS_NIGHT : TEAM_BADGE_COLORS_DAY;

  // --- 目標がある場合 ---
  if (hasGoals) {
    const duration = calcDuration(goals.length);
    // テロップアイテムを2セット繰り返してシームレスなループを実現
    const items = [...goals, ...goals];

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
        <div
          className="flex items-center gap-0 py-2 px-2 team-goals-ticker-track"
          style={{ animationDuration: `${duration}s` }}
        >
          {items.map((g, idx) => {
            // DateオブジェクトまたはISO文字列をJST基準で「YYYY年M月D日」に変換
            const toJSTDateLabel = (val: unknown): string | null => {
              if (!val) return null;
              let d: Date;
              if (val instanceof Date) {
                d = new Date(val.getTime() + 9 * 60 * 60 * 1000);
              } else {
                const parsed = new Date(String(val));
                if (isNaN(parsed.getTime())) return null;
                d = new Date(parsed.getTime() + 9 * 60 * 60 * 1000);
              }
              return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
            };
            const startStr = toJSTDateLabel(g.startDate);
            const endStr = toJSTDateLabel(g.endDate);
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

  // --- 目標がない場合：企業理念フォールバック ---
  const fallbackItems = [...PHILOSOPHY_FALLBACK, ...PHILOSOPHY_FALLBACK];
  const fallbackDuration = 40; // 企業理念は少しゆっくり

  const labelColorClass = isNight
    ? "bg-orange-500/20 text-orange-300 border-orange-500/40"
    : "bg-orange-100 text-orange-700 border-orange-300";
  const subColor = isNight ? "text-white/40" : "text-orange-500/70";

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
      {/* テロップ本体（企業理念） */}
      <div
        className="flex items-center gap-0 py-2 px-2 team-goals-ticker-track"
        style={{ animationDuration: `${fallbackDuration}s` }}
      >
        {fallbackItems.map((item, idx) => (
          <div key={`fb-${idx}`} className="flex items-center gap-2.5 flex-shrink-0 px-5">
            {/* ラベルバッジ */}
            <span
              className={cn(
                "text-[11px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0",
                labelColorClass
              )}
            >
              {item.label}
            </span>
            {/* 理念テキスト */}
            <span className={cn("text-sm font-semibold whitespace-nowrap", titleColor)}>
              {item.text}
            </span>
            {/* 説明 */}
            <span className={cn("text-[10px] whitespace-nowrap flex-shrink-0", subColor)}>
              {item.sub}
            </span>
            {/* 区切り */}
            <span className={cn("text-base flex-shrink-0 ml-1", dividerColor)}>｜</span>
          </div>
        ))}
      </div>
    </div>
  );
}
