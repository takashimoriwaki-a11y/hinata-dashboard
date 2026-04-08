/**
 * OfflineQueueContext - アプリ全体でオフラインキュー状態を共有するContext
 */
import { createContext, useContext, type ReactNode } from "react";
import { useOfflineQueue } from "@/hooks/useOfflineQueue";
import type { OfflineOperationType, OfflineQueueItem } from "@/lib/offlineQueue";

interface OfflineQueueContextValue {
  queueCount: number;
  isFlushing: boolean;
  enqueueOffline: (type: OfflineOperationType, payload: unknown) => OfflineQueueItem;
  flushQueue: () => Promise<void>;
  refreshCount: () => void;
}

const OfflineQueueContext = createContext<OfflineQueueContextValue | null>(null);

export function OfflineQueueProvider({ children }: { children: ReactNode }) {
  const value = useOfflineQueue();
  return (
    <OfflineQueueContext.Provider value={value}>
      {children}
    </OfflineQueueContext.Provider>
  );
}

export function useOfflineQueueContext(): OfflineQueueContextValue {
  const ctx = useContext(OfflineQueueContext);
  if (!ctx) throw new Error("useOfflineQueueContext must be used within OfflineQueueProvider");
  return ctx;
}
