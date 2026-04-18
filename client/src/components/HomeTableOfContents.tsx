/**
 * HomeTableOfContents - ホーム画面右サイドの目次ナビ
 * 各セクションへのスクロールジャンプ機能を提供する
 */

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

type Section = {
  id: string;
  label: string;
  icon: string;
};

const SECTIONS: Section[] = [
  { id: "section-philosophy", label: "理念", icon: "✨" },
  { id: "section-schedule", label: "訪問", icon: "📅" },
  { id: "section-message", label: "連絡", icon: "💬" },
  { id: "today-tasks", label: "タスク", icon: "✅" },
  { id: "today-patient-tasks", label: "利用者", icon: "👤" },
  { id: "section-team-tools", label: "チーム", icon: "👥" },
  { id: "section-tools", label: "ツール", icon: "🔗" },
  { id: "section-visit-count", label: "件数", icon: "📊" },
  { id: "section-daily-by-team", label: "曜日別", icon: "📆" },
  { id: "improvement-box", label: "改善", icon: "💡" },
];

export function HomeTableOfContents() {
  const [activeId, setActiveId] = useState<string>("");
  const [visible, setVisible] = useState(false);

  // スクロール位置に応じてアクティブセクションを更新
  const updateActiveSection = useCallback(() => {
    const scrollContainer = document.getElementById("main-scroll-container");
    if (!scrollContainer) return;

    const containerHeight = scrollContainer.clientHeight;
    const threshold = containerHeight * 0.35;

    let current = "";
    for (const section of SECTIONS) {
      const el = document.getElementById(section.id);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const mainRect = scrollContainer.getBoundingClientRect();
      const relativeTop = rect.top - mainRect.top;
      if (relativeTop <= threshold) {
        current = section.id;
      }
    }
    setActiveId(current);
  }, []);

  useEffect(() => {
    const scrollContainer = document.getElementById("main-scroll-container");
    if (!scrollContainer) return;

    // 少し遅延させてDOMが安定してから表示
    const timer = setTimeout(() => setVisible(true), 800);

    scrollContainer.addEventListener("scroll", updateActiveSection, { passive: true });
    updateActiveSection();

    return () => {
      clearTimeout(timer);
      scrollContainer.removeEventListener("scroll", updateActiveSection);
    };
  }, [updateActiveSection]);

  const scrollToSection = (id: string) => {
    const scrollContainer = document.getElementById("main-scroll-container");
    const el = document.getElementById(id);
    if (!scrollContainer || !el) return;

    const mainRect = scrollContainer.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const relativeTop = elRect.top - mainRect.top + scrollContainer.scrollTop;
    const offset = 12; // 上部の余白

    scrollContainer.scrollTo({
      top: relativeTop - offset,
      behavior: "smooth",
    });
    setActiveId(id);
  };

  // 存在するセクションのみ表示
  const visibleSections = SECTIONS.filter((s) => {
    if (typeof document === "undefined") return true;
    return !!document.getElementById(s.id);
  });

  return (
    <div
      className={cn(
        "fixed right-1.5 z-30 flex flex-col transition-all duration-500",
        visible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4"
      )}
      style={{
        // ヘッダー高さ(約56px) + 余白8px
        top: "64px",
        // ボトムナビ(60px) + safe-area + 余白8px を避けて配置
        bottom: "calc(60px + env(safe-area-inset-bottom, 0px) + 8px)",
        // コンテンツが多い場合はスクロール可能に
        overflowY: "auto",
        overflowX: "hidden",
        // スクロールバーを非表示
        scrollbarWidth: "none",
      }}
    >
      <div
        className="flex flex-col gap-0.5 bg-background/80 backdrop-blur-sm border border-border/50 rounded-xl p-1 shadow-lg"
        style={{ margin: "auto 0" }}
      >
        {visibleSections.map((section) => {
          const isActive = activeId === section.id;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => scrollToSection(section.id)}
              className={cn(
                "flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-lg transition-all duration-200 min-w-[40px]",
                "touch-pan-y select-none",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm scale-105"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground active:scale-95"
              )}
              title={section.label}
            >
              <span className="text-sm leading-none">{section.icon}</span>
              <span className={cn(
                "text-[9px] leading-tight font-medium whitespace-nowrap",
                isActive ? "text-primary-foreground" : "text-muted-foreground"
              )}>
                {section.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
