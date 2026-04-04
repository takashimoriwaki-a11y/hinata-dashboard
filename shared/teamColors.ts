/**
 * 全ページ共通のチームカラー定義
 * 身体=青、天理=緑、郡山北部=オレンジ、郡山南部=紫
 * ※ Tailwindのパージ対策のため、インラインスタイルで色を指定する
 */
import type React from "react";

export const TEAM_NAMES = ["身体", "天理", "郡山北部", "郡山南部"] as const;
export type TeamName = (typeof TEAM_NAMES)[number];

/** チームごとのカラー定義（インラインスタイル用HEX値） */
export const TEAM_COLOR_VALUES: Record<TeamName, {
  active: string;
  inactive: string;
  text: string;
}> = {
  "身体":    { active: "#3b82f6", inactive: "#93c5fd", text: "#2563eb" },   // blue-500 / blue-300 / blue-600
  "天理":    { active: "#10b981", inactive: "#6ee7b7", text: "#059669" },   // emerald-500 / emerald-300 / emerald-600
  "郡山北部": { active: "#f97316", inactive: "#fdba74", text: "#ea580c" },  // orange-500 / orange-300 / orange-600
  "郡山南部": { active: "#a855f7", inactive: "#d8b4fe", text: "#9333ea" },  // purple-500 / purple-300 / purple-600
};

/** 全チームボタン用カラー */
export const ALL_TEAM_COLOR = {
  active: "#06b6d4",   // cyan-500
  inactive: "#67e8f9", // cyan-300
};

/**
 * チーム名からアクティブ/非アクティブのインラインスタイルを返すヘルパー
 * （Tailwindクラスではなくインラインスタイルを使用してパージ問題を回避）
 */
export function getTeamButtonStyle(teamName: string, isActive: boolean): React.CSSProperties {
  const colors = TEAM_COLOR_VALUES[teamName as TeamName];
  if (!colors) {
    return {
      backgroundColor: isActive ? ALL_TEAM_COLOR.active : ALL_TEAM_COLOR.inactive,
      color: "white",
    };
  }
  return {
    backgroundColor: isActive ? colors.active : colors.inactive,
    color: "white",
  };
}

/**
 * チーム名からテキスト色のインラインスタイルを返すヘルパー
 */
export function getTeamTextStyle(teamName: string): React.CSSProperties {
  const colors = TEAM_COLOR_VALUES[teamName as TeamName];
  if (!colors) return { color: ALL_TEAM_COLOR.active };
  return { color: colors.text };
}

// 後方互換性のため旧関数も残す
export function getTeamButtonClass(_teamName: string, isActive: boolean): string {
  return isActive
    ? "text-white border-transparent shadow-md -translate-y-0.5 transition-all duration-200 select-none"
    : "text-white border-transparent opacity-80 hover:opacity-100 hover:-translate-y-0.5 hover:shadow-sm active:scale-95 transition-all duration-200 select-none touch-manipulation";
}

export function getAllTeamButtonStyle(isActive: boolean): { backgroundColor: string; color: string } {
  return {
    backgroundColor: isActive ? ALL_TEAM_COLOR.active : ALL_TEAM_COLOR.inactive,
    color: "white",
  };
}

// 後方互換性のため旧TEAM_COLORSも残す
export const TEAM_COLORS: Record<TeamName, {
  activeBg: string;
  inactiveBg: string;
  textColor: string;
}> = {
  "身体":    { activeBg: "bg-blue-500",    inactiveBg: "bg-blue-300",    textColor: "text-blue-600" },
  "天理":    { activeBg: "bg-emerald-500", inactiveBg: "bg-emerald-300", textColor: "text-emerald-600" },
  "郡山北部": { activeBg: "bg-orange-500",  inactiveBg: "bg-orange-300",  textColor: "text-orange-600" },
  "郡山南部": { activeBg: "bg-purple-500",  inactiveBg: "bg-purple-300",  textColor: "text-purple-600" },
};
