import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * PWA（ホーム画面追加）モードでは target="_blank" が外部ブラウザ（Chrome等）で
 * 開かれてしまう iOS の挙動を回避するためのリンク開きユーティリティ。
 * PWAモードの場合は window.location.href で同一ウィンドウ内遷移（Safari内で開く）。
 * 通常ブラウザの場合は新しいタブで開く。
 */
export function openLink(url: string): void {
  const isPwa =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

  if (isPwa) {
    // PWAモード: Safari内で開く（同一ウィンドウ遷移）
    window.location.href = url;
  } else {
    // 通常ブラウザ: 新しいタブで開く
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
