import { useEffect, useRef, useState } from "react";

/**
 * 数値が変化したときに0（または前の値）からターゲット値までカウントアップするフック
 * @param target - 最終的に表示する数値
 * @param duration - アニメーション時間（ms）
 * @param delay - 開始遅延（ms）
 */
export function useCountUp(target: number, duration = 800, delay = 0): number {
  const [count, setCount] = useState(0);
  const prevTarget = useRef<number>(0);
  const frameRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (target === prevTarget.current) return;

    const start = prevTarget.current;
    const end = target;
    prevTarget.current = end;

    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(() => {
      const startTime = performance.now();

      const animate = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // easeOutCubic
        const eased = 1 - Math.pow(1 - progress, 3);
        setCount(Math.round(start + (end - start) * eased));

        if (progress < 1) {
          frameRef.current = requestAnimationFrame(animate);
        }
      };

      frameRef.current = requestAnimationFrame(animate);
    }, delay);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    };
  }, [target, duration, delay]);

  return count;
}
