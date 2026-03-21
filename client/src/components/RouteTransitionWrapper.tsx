/**
 * RouteTransitionWrapper - ページ遷移時にフェードインアニメーションを適用するラッパー
 * ルートが変わるたびに子コンポーネントをフェードイン表示する
 */

import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";

interface RouteTransitionWrapperProps {
  children: React.ReactNode;
}

export default function RouteTransitionWrapper({ children }: RouteTransitionWrapperProps) {
  const [location] = useLocation();
  const [opacity, setOpacity] = useState(1);
  const prevLocation = useRef(location);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // 初回マウント時はスキップ
    if (prevLocation.current === location) return;
    prevLocation.current = location;

    // 一瞬透明にしてからフェードイン
    setOpacity(0);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setOpacity(1);
    }, 50);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [location]);

  return (
    <div
      style={{
        opacity,
        transition: opacity === 1 ? "opacity 0.18s ease-out" : "none",
        willChange: "opacity",
      }}
    >
      {children}
    </div>
  );
}
