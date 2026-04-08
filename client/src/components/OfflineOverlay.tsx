import { useEffect, useState, useCallback } from "react";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { WifiOff, RefreshCw, Wifi } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * オフライン時のUI コンポーネント群。
 *
 * - `OfflineBanner`: 画面上部に表示される薄いバナー（軽微な通知用）
 * - `OfflineOverlay`: 画面全体を覆うオーバーレイ（完全オフライン時）
 * - `OfflineProvider`: 両方を統合して自動表示するプロバイダー
 */

// ===== オフラインバナー（上部固定） =====
function OfflineBanner({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9998,
        background: "linear-gradient(90deg, #92400e, #b45309)",
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "8px 16px",
        fontSize: 13,
        fontFamily: "'Noto Sans JP', sans-serif",
        fontWeight: 500,
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
        animation: "slideDown 0.3s ease",
      }}
    >
      <WifiOff size={14} />
      <span>オフラインです</span>
      <button
        onClick={onRetry}
        disabled={retrying}
        style={{
          marginLeft: 8,
          padding: "3px 10px",
          background: "rgba(255,255,255,0.2)",
          border: "1px solid rgba(255,255,255,0.4)",
          borderRadius: 6,
          color: "white",
          fontSize: 12,
          cursor: retrying ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          gap: 4,
          fontFamily: "inherit",
          opacity: retrying ? 0.7 : 1,
        }}
      >
        <RefreshCw size={11} style={{ animation: retrying ? "spin 0.8s linear infinite" : "none" }} />
        {retrying ? "確認中..." : "再試行"}
      </button>
      <style>{`
        @keyframes slideDown { from { transform: translateY(-100%); } to { transform: translateY(0); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ===== オンライン復帰バナー（一時表示） =====
function OnlineRestoredBanner() {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9998,
        background: "linear-gradient(90deg, #15803d, #16a34a)",
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "8px 16px",
        fontSize: 13,
        fontFamily: "'Noto Sans JP', sans-serif",
        fontWeight: 500,
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
        animation: "slideDown 0.3s ease",
      }}
    >
      <Wifi size={14} />
      <span>接続が回復しました</span>
      <style>{`
        @keyframes slideDown { from { transform: translateY(-100%); } to { transform: translateY(0); } }
      `}</style>
    </div>
  );
}

// ===== オフラインオーバーレイ（フルスクリーン） =====
function OfflineOverlayFull({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9997,
        background: "linear-gradient(160deg, #fff7ed 0%, #fed7aa 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "'Noto Sans JP', sans-serif",
        animation: "fadeIn 0.3s ease",
      }}
    >
      <div
        style={{
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(12px)",
          borderRadius: 20,
          padding: "40px 32px",
          maxWidth: 360,
          width: "100%",
          textAlign: "center",
          boxShadow: "0 8px 32px rgba(249,115,22,0.15)",
        }}
      >
        {/* ロゴ */}
        <img
          src="https://d2xsxph8kpxj0f.cloudfront.net/310519663391327537/ZgP48RW5U5uSAWGdBswK3V/hinata_logo_mark_45315039.png"
          alt="ひなた"
          style={{
            width: 72,
            height: 72,
            objectFit: "contain",
            marginBottom: 16,
            filter: "drop-shadow(0 4px 12px rgba(249,115,22,0.25))",
            animation: "float 3s ease-in-out infinite",
          }}
        />

        {/* Wi-Fiオフアイコン */}
        <div
          style={{
            width: 52,
            height: 52,
            background: "#fff1e6",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
          }}
        >
          <WifiOff size={26} color="#f97316" />
        </div>

        <h2
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "#c2410c",
            marginBottom: 10,
            letterSpacing: "0.02em",
          }}
        >
          オフラインです
        </h2>

        <p
          style={{
            fontSize: 14,
            color: "#78350f",
            lineHeight: 1.7,
            marginBottom: 16,
          }}
        >
          ネットワークに接続されていないため、<br />
          ひなたダッシュボードを表示できません。
        </p>

        <div
          style={{
            fontSize: 13,
            color: "#a16207",
            background: "#fef9c3",
            borderRadius: 8,
            padding: "10px 14px",
            lineHeight: 1.6,
            marginBottom: 24,
          }}
        >
          Wi-Fi またはモバイルデータ通信の<br />
          接続状況をご確認ください
        </div>

        <button
          onClick={onRetry}
          disabled={retrying}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "12px 28px",
            background: retrying
              ? "linear-gradient(135deg, #fdba74, #fb923c)"
              : "linear-gradient(135deg, #f97316, #ea580c)",
            color: "white",
            fontFamily: "'Noto Sans JP', sans-serif",
            fontSize: 15,
            fontWeight: 700,
            border: "none",
            borderRadius: 12,
            cursor: retrying ? "not-allowed" : "pointer",
            boxShadow: "0 4px 16px rgba(249,115,22,0.35)",
            letterSpacing: "0.04em",
            transition: "transform 0.15s ease",
          }}
        >
          <RefreshCw
            size={17}
            style={{ animation: retrying ? "spin 0.8s linear infinite" : "none" }}
          />
          {retrying ? "接続を確認中..." : "再接続を試みる"}
        </button>
      </div>

      <p
        style={{
          marginTop: 24,
          fontSize: 12,
          color: "#92400e",
          opacity: 0.7,
        }}
      >
        こころの訪問看護ステーション ひなた
      </p>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ===== 統合プロバイダー =====
/**
 * アプリ全体に被せるオフライン検知コンポーネント。
 * - オフライン時: フルスクリーンオーバーレイを表示
 * - オンライン復帰時: 「接続が回復しました」バナーを2秒表示してから消える
 */
export default function OfflineProvider({ children }: { children: React.ReactNode }) {
  const { isOffline, isOnline } = useNetworkStatus();
  const queryClient = useQueryClient();
  const [retrying, setRetrying] = useState(false);
  const [showRestoredBanner, setShowRestoredBanner] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  // オフライン→オンライン復帰時に「回復しました」バナーを表示 + tRPCキャッシュを無効化して自動更新
  useEffect(() => {
    if (isOffline) {
      setWasOffline(true);
      setShowRestoredBanner(false);
    } else if (isOnline && wasOffline) {
      setShowRestoredBanner(true);
      // 全tRPCクエリキャッシュを stale にして再フェッチ（自動更新）
      queryClient.invalidateQueries();
      const timer = setTimeout(() => {
        setShowRestoredBanner(false);
        setWasOffline(false);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [isOffline, isOnline, wasOffline, queryClient]);

  const handleRetry = useCallback(() => {
    if (retrying) return;
    setRetrying(true);

    // manifest.json で実際の接続確認
    fetch("/manifest.json?_=" + Date.now(), { cache: "no-store" })
      .then(() => {
        // 接続OK → window.location.reload() でアプリを再起動
        window.location.reload();
      })
      .catch(() => {
        setRetrying(false);
      });
  }, [retrying]);

  return (
    <>
      {/* オフライン時: フルスクリーンオーバーレイ */}
      {isOffline && (
        <OfflineOverlayFull onRetry={handleRetry} retrying={retrying} />
      )}

      {/* オフライン時: 上部バナー（オーバーレイと併用） */}
      {isOffline && (
        <OfflineBanner onRetry={handleRetry} retrying={retrying} />
      )}

      {/* オンライン復帰時: 「回復しました」バナー */}
      {showRestoredBanner && <OnlineRestoredBanner />}

      {/* 通常コンテンツ */}
      {children}
    </>
  );
}
