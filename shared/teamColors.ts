/**
 * 全ページ共通のチームカラー定義
 * 身体=青、天理=緑、郡山北部=オレンジ、郡山南部=紫
 */

export const TEAM_NAMES = ["身体", "天理", "郡山北部", "郡山南部"] as const;
export type TeamName = (typeof TEAM_NAMES)[number];

export const TEAM_COLORS: Record<TeamName, {
  /** アクティブ（選択中）時の背景色 */
  activeBg: string;
  /** 非アクティブ時の背景色 */
  inactiveBg: string;
  /** テキスト色（リンク文字等に使用） */
  textColor: string;
}> = {
  "身体":    { activeBg: "bg-blue-500",    inactiveBg: "bg-blue-300 dark:bg-blue-700",    textColor: "text-blue-600 dark:text-blue-400" },
  "天理":    { activeBg: "bg-emerald-500", inactiveBg: "bg-emerald-300 dark:bg-emerald-700", textColor: "text-emerald-600 dark:text-emerald-400" },
  "郡山北部": { activeBg: "bg-orange-500",  inactiveBg: "bg-orange-300 dark:bg-orange-700",  textColor: "text-orange-600 dark:text-orange-400" },
  "郡山南部": { activeBg: "bg-purple-500",  inactiveBg: "bg-purple-300 dark:bg-purple-700",  textColor: "text-purple-600 dark:text-purple-400" },
};

/**
 * チーム名からアクティブ/非アクティブのクラスを返すヘルパー
 */
export function getTeamButtonClass(teamName: string, isActive: boolean): string {
  const colors = TEAM_COLORS[teamName as TeamName];
  if (!colors) {
    // 身体・天理・郡山北部・郡山南部以外（全チーム・事務員等）
    return isActive
      ? "bg-primary text-white border-transparent shadow-md scale-105"
      : "bg-muted text-muted-foreground border-border hover:bg-muted/80";
  }
  return isActive
    ? `${colors.activeBg} text-white border-transparent shadow-md scale-105`
    : `${colors.inactiveBg} text-white border-transparent opacity-70 hover:opacity-90`;
}
