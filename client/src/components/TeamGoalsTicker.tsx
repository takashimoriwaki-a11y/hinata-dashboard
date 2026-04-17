import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { useTheme } from "@/contexts/ThemeContext";
import { useState, useEffect } from "react";

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

const SWITCH_INTERVAL_MS = 10000; // 10秒ごとに切り替え

export default function TeamGoalsTicker() {
  const { isNight } = useTheme();
  const { data: goals = [], isLoading } = trpc.teamGoals.getActive.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const [currentIndex, setCurrentIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  const hasGoals = goals.length > 0;
  const items = hasGoals
    ? goals
    : PHILOSOPHY_FALLBACK.map((p) => ({
        id: p.label,
        team: p.label,
        title: p.text,
        description: p.sub,
        startDate: null as Date | null,
        endDate: null as Date | null,
      }));

  // 10秒ごとにフェードアウト→インデックス更新→フェードイン
  useEffect(() => {
    if (items.length <= 1) return;
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % items.length);
        setVisible(true);
      }, 400); // フェードアウト後に切り替え
    }, SWITCH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [items.length]);

  // ローディング中は何も表示しない
  if (isLoading) return null;

  // 背景・ボーダーの色をモードに応じて切り替え
  const bgStyle = isNight
    ? {
        background: "linear-gradient(135deg, rgba(20,20,40,0.95) 0%, rgba(30,20,50,0.95) 100%)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
      }
    : {
        background: "linear-gradient(135deg, #fff7ed 0%, #ffedd5 60%, #fde8c8 100%)",
        borderBottom: "1px solid rgba(249,115,22,0.15)",
      };

  const titleColor = isNight ? "text-white/90" : "text-orange-900";
  const dateColor = isNight ? "text-white/40" : "text-orange-500/70";
  const badgeColors = isNight ? TEAM_BADGE_COLORS_NIGHT : TEAM_BADGE_COLORS_DAY;

  const current = items[currentIndex % items.length];
  if (!current) return null;

  // JST日付ラベル変換
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

  const startStr = toJSTDateLabel((current as { startDate?: unknown }).startDate);
  const endStr = toJSTDateLabel((current as { endDate?: unknown }).endDate);

  // 件数インジケーター（複数件ある場合のみ表示）
  const showDots = items.length > 1;

  return (
    <div
      className="relative flex-shrink-0 transition-colors duration-500 overflow-hidden"
      style={bgStyle}
    >
      {/* コンテンツ */}
      <div
        className="flex items-center justify-center gap-2.5 py-1 px-4 min-h-[28px]"
        style={{
          opacity: visible ? 1 : 0,
          transition: "opacity 0.4s ease",
        }}
      >
        {/* チームバッジ */}
        <span
          className={cn(
            "text-xs font-bold px-1.5 py-0 rounded-full border flex-shrink-0 leading-5",
            badgeColors[current.team] ?? (isNight
              ? "bg-muted/60 text-foreground border-border"
              : "bg-gray-100 text-gray-700 border-gray-300")
          )}
        >
          {current.team}
        </span>

        {/* 目標タイトル */}
        <span className={cn("text-sm font-semibold truncate max-w-[60vw]", titleColor)}>
          {current.title}
        </span>

        {/* 期間（目標がある場合のみ） */}
        {hasGoals && (startStr || endStr) && (
          <span className={cn("text-xs whitespace-nowrap flex-shrink-0 hidden sm:inline", dateColor)}>
            {startStr ?? ""}
            {startStr && endStr ? " 〜 " : ""}
            {endStr ?? ""}
          </span>
        )}

        {/* ページインジケーター（複数件） */}
        {showDots && (
          <div className="flex items-center gap-1 flex-shrink-0 ml-1">
            {items.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "rounded-full transition-all duration-300",
                  i === currentIndex
                    ? (isNight ? "bg-orange-400 w-3 h-1.5" : "bg-orange-500 w-3 h-1.5")
                    : (isNight ? "bg-white/20 w-1.5 h-1.5" : "bg-orange-300/50 w-1.5 h-1.5")
                )}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
