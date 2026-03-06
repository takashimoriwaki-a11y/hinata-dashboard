import { useEffect, useState } from "react";

/**
 * アプリ起動時に表示するスプラッシュスクリーン
 * ひなたのロゴマークをアニメーション付きで表示し、
 * 指定時間後にフェードアウトして非表示になる
 */

const LOGO_CDN_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663391327537/ZgP48RW5U5uSAWGdBswK3V/hinata_logo_mark_45315039.png";

interface SplashScreenProps {
  onFinish: () => void;
  duration?: number; // 表示時間（ms）、デフォルト2000ms
}

export default function SplashScreen({
  onFinish,
  duration = 2000,
}: SplashScreenProps) {
  const [phase, setPhase] = useState<"enter" | "visible" | "exit">("enter");

  useEffect(() => {
    // フェードイン完了後にvisibleへ
    const enterTimer = setTimeout(() => {
      setPhase("visible");
    }, 400);

    // 表示時間後にフェードアウト開始
    const exitTimer = setTimeout(() => {
      setPhase("exit");
    }, duration);

    // フェードアウト完了後にコールバック
    const finishTimer = setTimeout(() => {
      onFinish();
    }, duration + 600);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
      clearTimeout(finishTimer);
    };
  }, [duration, onFinish]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(160deg, #fff7ed 0%, #fed7aa 100%)",
        transition: "opacity 0.5s ease",
        opacity: phase === "exit" ? 0 : 1,
        pointerEvents: phase === "exit" ? "none" : "auto",
      }}
    >
      {/* ロゴアニメーション */}
      <div
        style={{
          transform:
            phase === "enter" ? "scale(0.7) translateY(20px)" : "scale(1) translateY(0)",
          opacity: phase === "enter" ? 0 : 1,
          transition: "transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease",
        }}
      >
        <img
          src={LOGO_CDN_URL}
          alt="ひなた"
          style={{
            width: 120,
            height: 120,
            objectFit: "contain",
            filter: "drop-shadow(0 8px 24px rgba(249, 115, 22, 0.3))",
          }}
        />
      </div>

      {/* アプリ名 */}
      <div
        style={{
          marginTop: 24,
          opacity: phase === "enter" ? 0 : 1,
          transform: phase === "enter" ? "translateY(10px)" : "translateY(0)",
          transition: "opacity 0.5s ease 0.2s, transform 0.5s ease 0.2s",
          textAlign: "center",
        }}
      >
        <p
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "#c2410c",
            fontFamily: "'Noto Sans JP', sans-serif",
            letterSpacing: "0.05em",
            margin: 0,
          }}
        >
          ひなた
        </p>
        <p
          style={{
            fontSize: 13,
            color: "#ea580c",
            fontFamily: "'Noto Sans JP', sans-serif",
            marginTop: 4,
            letterSpacing: "0.08em",
          }}
        >
          こころの訪問看護ステーション
        </p>
      </div>

      {/* ローディングドット */}
      <div
        style={{
          marginTop: 40,
          display: "flex",
          gap: 8,
          opacity: phase === "enter" ? 0 : 1,
          transition: "opacity 0.5s ease 0.4s",
        }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: "#f97316",
              display: "inline-block",
              animation: `splashDot 1.2s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes splashDot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
