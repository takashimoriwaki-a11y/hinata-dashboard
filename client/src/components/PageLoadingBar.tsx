/**
 * PageLoadingBar - ページ遷移時に画面上部に表示されるプログレスバー
 * wouter の useLocation を監視し、ルートが変わるたびにアニメーションを再生する
 */

import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

export default function PageLoadingBar() {
  const [location] = useLocation();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevLocation = useRef(location);

  const clear = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  useEffect(() => {
    // 初回マウント時はスキップ
    if (prevLocation.current === location) return;
    prevLocation.current = location;

    clear();
    setProgress(0);
    setVisible(true);

    // 素早く70%まで進める（体感的に速い）
    let p = 0;
    intervalRef.current = setInterval(() => {
      p += Math.random() * 18 + 8;
      if (p >= 70) {
        p = 70;
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
      setProgress(p);
    }, 80);

    // 300ms後に100%にして消す
    timerRef.current = setTimeout(() => {
      clear();
      setProgress(100);
      setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 300);
    }, 400);

    return clear;
  }, [location]);

  if (!visible) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999] h-[3px] pointer-events-none"
      aria-hidden="true"
    >
      <div
        className={cn(
          "h-full bg-gradient-to-r from-orange-400 via-orange-500 to-amber-400",
          "transition-all duration-200 ease-out",
          "shadow-[0_0_8px_rgba(251,146,60,0.8)]"
        )}
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
