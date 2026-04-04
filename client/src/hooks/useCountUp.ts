import { useEffect, useRef, useState } from "react";

/**
 * 数値が変化したときに0（または前の値）からターゲット値までカウントアップするフック
 * @param target - 最終的に表示する数値
 * @param duration - アニメーション時間（ms）
 * @param delay - 開始遅延（ms）
 * @param resetKey - この値が変わるたびに0から再カウントアップ（更新ボタン用）
 */
export function useCountUp(target: number, duration = 800, delay = 0, resetKey?: number | string): number {
  const [count, setCount] = useState(0);
  const prevTarget = useRef<number>(0);
  const prevKey = useRef<number | string | undefined>(undefined);
  const frameRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const keyChanged = resetKey !== undefined && resetKey !== prevKey.current;
    if (target === prevTarget.current && !keyChanged) return;

    const start = keyChanged ? 0 : prevTarget.current;
    const end = target;
    prevTarget.current = end;
    if (resetKey !== undefined) prevKey.current = resetKey;

    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);

    if (keyChanged) setCount(0);

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
  }, [target, duration, delay, resetKey]);

  return count;
}

/**
 * 数値が変化したときに0からターゲット値までアニメーションするフック（プログレスバー用）
 * @param resetKey - この値が変わるたびに0から再アニメーション（更新ボタン用）
 */
export function useAnimatedProgress(target: number, duration = 900, delay = 0, resetKey?: number | string): number {
  const [progress, setProgress] = useState(0);
  const prevTarget = useRef<number>(0);
  const prevKey = useRef<number | string | undefined>(undefined);
  const frameRef2 = useRef<number | null>(null);
  const timeoutRef2 = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const keyChanged = resetKey !== undefined && resetKey !== prevKey.current;
    if (target === prevTarget.current && !keyChanged) return;

    const end = target;
    prevTarget.current = end;
    if (resetKey !== undefined) prevKey.current = resetKey;

    if (frameRef2.current !== null) cancelAnimationFrame(frameRef2.current);
    if (timeoutRef2.current !== null) clearTimeout(timeoutRef2.current);

    // まず0にリセット
    setProgress(0);

    timeoutRef2.current = setTimeout(() => {
      const startTime = performance.now();
      const animate = (now: number) => {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        setProgress(end * eased);
        if (t < 1) {
          frameRef2.current = requestAnimationFrame(animate);
        }
      };
      frameRef2.current = requestAnimationFrame(animate);
    }, delay);

    return () => {
      if (frameRef2.current !== null) cancelAnimationFrame(frameRef2.current);
      if (timeoutRef2.current !== null) clearTimeout(timeoutRef2.current);
    };
  }, [target, duration, delay, resetKey]);

  return progress;
}
