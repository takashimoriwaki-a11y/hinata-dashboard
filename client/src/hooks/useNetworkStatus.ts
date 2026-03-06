import { useEffect, useState, useCallback } from "react";

export type NetworkStatus = "online" | "offline" | "slow";

/**
 * ネットワーク接続状態を監視するカスタムフック。
 *
 * - `online`: 正常に接続されている
 * - `offline`: 接続なし（navigator.onLine === false）
 * - `slow`: 接続はあるが応答が遅い（将来拡張用、現在は未使用）
 *
 * オンライン/オフラインイベントと定期的なヘルスチェックを組み合わせて
 * 信頼性の高い状態検知を行う。
 */
export function useNetworkStatus() {
  const [status, setStatus] = useState<NetworkStatus>(
    navigator.onLine ? "online" : "offline"
  );
  const [lastOnlineAt, setLastOnlineAt] = useState<Date | null>(
    navigator.onLine ? new Date() : null
  );

  const goOnline = useCallback(() => {
    setStatus("online");
    setLastOnlineAt(new Date());
  }, []);

  const goOffline = useCallback(() => {
    setStatus("offline");
  }, []);

  useEffect(() => {
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [goOnline, goOffline]);

  return {
    status,
    isOnline: status === "online",
    isOffline: status === "offline",
    lastOnlineAt,
  };
}
