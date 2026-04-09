import { useEffect, useRef } from "react";

/**
 * useScrollReveal
 * 指定したコンテナ内の [data-scroll-reveal] 属性を持つ要素を
 * IntersectionObserver で監視し、ビューポートに入ったときに
 * "scroll-revealed" クラスを付与してフェードインアニメーションを発火する。
 */
export function useScrollReveal(options?: IntersectionObserverInit) {
  const containerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const container = containerRef.current ?? document;
    const targets = (container instanceof Document ? document : container).querySelectorAll(
      "[data-scroll-reveal]"
    );

    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("scroll-revealed");
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.12,
        rootMargin: "0px 0px -40px 0px",
        ...options,
      }
    );

    targets.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return containerRef;
}
