import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

// 時間帯判定：19:01〜4:59 = 夜モード、5:00〜19:00 = 昼モード（常にJST基準）
function isNightTime(): boolean {
  const now = new Date();
  // ブラウザのロケールに依存せず、常にAsia/Tokyoで時刻を取得
  const jstHour = parseInt(
    now.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour: "numeric", hour12: false }),
    10
  );
  const jstMinute = now.getUTCMinutes(); // 分はタイムゾーンに依存しない
  // 19:01〜4:59 が夜モード
  if (jstHour === 19 && jstMinute === 0) return false; // 19:00 は昼モード
  if (jstHour >= 19 || jstHour < 5) return true;
  return false;
}

// 手動上書きの状態（null = 手動上書きなし → 時刻に従う）
type ManualOverride = "light" | "dark" | null;

interface ThemeContextType {
  theme: Theme;
  isNight: boolean;
  toggleTheme?: () => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  switchable?: boolean;
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
  switchable = false,
}: ThemeProviderProps) {
  const [isNight, setIsNight] = useState<boolean>(() => isNightTime());

  // 手動上書き状態（null = 自動、"light"/"dark" = 手動固定）
  const [manualOverride, setManualOverride] = useState<ManualOverride>(() => {
    if (switchable) {
      const stored = localStorage.getItem("themeOverride");
      return (stored as ManualOverride) || null;
    }
    return null;
  });

  // 時間帯に基づいたテーマ
  const autoTheme: Theme = isNight ? "dark" : "light";

  // 実際のテーマを決定：
  // - switchable=false → 時刻に従う
  // - switchable=true かつ手動上書きあり → 手動上書きに従う
  // - switchable=true かつ手動上書きなし → 時刻に従う（自動）
  const theme: Theme = switchable
    ? (manualOverride !== null ? manualOverride : autoTheme)
    : autoTheme;

  // isNight は手動上書きも考慮した実効値
  const effectiveIsNight = switchable
    ? (manualOverride === "light" ? false : (manualOverride === "dark" ? true : isNight))
    : isNight;

  // 毎分チェックして時刻をまたいだ際に自動切替
  useEffect(() => {
    const tick = () => {
      setIsNight(isNightTime());
    };
    // 次の分の頭に合わせて起動
    const now = new Date();
    const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    const timeout = setTimeout(() => {
      tick();
      const interval = setInterval(tick, 60_000);
      return () => clearInterval(interval);
    }, msToNextMinute);

    return () => clearTimeout(timeout);
  }, []);

  // <html> に .night クラスを付け外し（CSS変数の切替）
  // また dark クラスも同期（shadcn/ui の dark: ユーティリティ用）
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("night", "dark");
      root.classList.remove("light");
    } else {
      root.classList.remove("night", "dark");
      root.classList.add("light");
    }

    if (switchable) {
      if (manualOverride !== null) {
        localStorage.setItem("themeOverride", manualOverride);
      } else {
        localStorage.removeItem("themeOverride");
      }
    }
  }, [theme, switchable, manualOverride]);

  const toggleTheme = switchable
    ? () => {
        setManualOverride(prev => {
          // 現在の実効テーマの逆を手動固定する
          const currentTheme = prev !== null ? prev : autoTheme;
          return currentTheme === "light" ? "dark" : "light";
        });
      }
    : undefined;

  return (
    <ThemeContext.Provider value={{ theme, isNight: effectiveIsNight, toggleTheme, switchable }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
