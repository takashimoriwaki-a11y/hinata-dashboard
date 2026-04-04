/**
 * RouteTransitionWrapper - ページ遷移時にフェードイン＋スライドアップアニメーションを適用するラッパー
 * ルートが変わるたびに子コンポーネントをフェードイン＋下から上へスライドして表示する
 */

import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";

interface RouteTransitionWrapperProps {
  children: React.ReactNode;
}

export default function RouteTransitionWrapper({ children }: RouteTransitionWrapperProps) {
  const [location] = useLocation();
  const [visible, setVisible] = useState(true);
  const prevLocation = useRef(location);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // 初回マウント時はスキップ
    if (prevLocation.current === location) return;
    prevLocation.current = location;

    // 一瞬非表示にしてからアニメーション付きで表示
    setVisible(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setVisible(true);
    }, 40);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [location]);

  return (
    <div
      style={
        visible
          ? {
              animation: "pageTransitionIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) both",
              willChange: "opacity, transform",
            }
          : {
              opacity: 0,
              transform: "translateY(8px)",
            }
      }
    >
      {children}
    </div>
  );
}
