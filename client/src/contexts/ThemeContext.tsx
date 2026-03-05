import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

// 5:00～19:00 は昼モード、19:01～4:59 は夜モード
// 一時的に昼モード固定（テスト用）
function isNightTime(): boolean {
  return false; // 一時的に昼モード固定
  // 元のロジック（後で元に戻す）:
  // const now = new Date();
  // const hour = now.getHours();
  // const minute = now.getMinutes();
  // const totalMinutes = hour * 60 + minute;
  // return totalMinutes < 300 || totalMinutes >= 1141;
}

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

  // 時間帯に基づいたテーマ（switchable=falseのとき自動）
  const autoTheme: Theme = isNight ? "dark" : "light";

  const [manualTheme, setManualTheme] = useState<Theme>(() => {
    if (switchable) {
      const stored = localStorage.getItem("theme");
      return (stored as Theme) || defaultTheme;
    }
    return defaultTheme;
  });

  const theme: Theme = switchable ? manualTheme : autoTheme;

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
    if (isNight && !switchable) {
      root.classList.add("night", "dark");
      root.classList.remove("light");
    } else if (switchable && manualTheme === "dark") {
      root.classList.add("night", "dark");
      root.classList.remove("light");
    } else {
      root.classList.remove("night", "dark");
      root.classList.add("light");
    }

    if (switchable) {
      localStorage.setItem("theme", manualTheme);
    }
  }, [isNight, switchable, manualTheme]);

  const toggleTheme = switchable
    ? () => {
        setManualTheme(prev => (prev === "light" ? "dark" : "light"));
      }
    : undefined;

  return (
    <ThemeContext.Provider value={{ theme, isNight, toggleTheme, switchable }}>
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
