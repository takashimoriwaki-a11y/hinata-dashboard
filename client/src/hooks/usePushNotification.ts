/**
 * usePushNotification
 * Web Push通知の許可・登録・解除を管理するカスタムフック
 */
import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer;
}

export type PushPermission = "default" | "granted" | "denied" | "unsupported";

export function usePushNotification() {
  const [permission, setPermission] = useState<PushPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { data: vapidData } = trpc.push.getVapidPublicKey.useQuery();
  const subscribeMutation = trpc.push.subscribe.useMutation();
  const unsubscribeMutation = trpc.push.unsubscribe.useMutation();

  // 現在の通知許可状態を確認
  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission as PushPermission);

    // 既存のサブスクリプションを確認
    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        setIsSubscribed(!!sub);
      });
    }).catch(() => {});
  }, []);

  // Service Workerを登録してプッシュ通知を購読する
  const subscribe = useCallback(async (teamFilter?: string | null) => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      toast.error("このブラウザはプッシュ通知に対応していません");
      return;
    }
    if (!vapidData?.publicKey) {
      toast.error("プッシュ通知の設定が完了していません");
      return;
    }

    setIsLoading(true);
    try {
      // 通知許可を要求
      const perm = await Notification.requestPermission();
      setPermission(perm as PushPermission);
      if (perm !== "granted") {
        toast.error("通知の許可が必要です。ブラウザの設定から許可してください。");
        return;
      }

      // Service Workerを登録
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      // 既存のサブスクリプションを解除
      const existing = await reg.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();

      // 新しいサブスクリプションを作成
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidData.publicKey),
      });

      const subJson = sub.toJSON();
      await subscribeMutation.mutateAsync({
        endpoint: sub.endpoint,
        p256dh: subJson.keys?.p256dh ?? "",
        auth: subJson.keys?.auth ?? "",
        teamFilter: teamFilter ?? null,
      });

      setIsSubscribed(true);
      toast.success("プッシュ通知を有効にしました");
    } catch (e) {
      console.error("[Push] subscribe error:", e);
      toast.error("プッシュ通知の設定に失敗しました");
    } finally {
      setIsLoading(false);
    }
  }, [vapidData, subscribeMutation]);

  // プッシュ通知を解除する
  const unsubscribe = useCallback(async () => {
    setIsLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await unsubscribeMutation.mutateAsync({ endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setIsSubscribed(false);
      toast.success("プッシュ通知を無効にしました");
    } catch (e) {
      console.error("[Push] unsubscribe error:", e);
      toast.error("プッシュ通知の解除に失敗しました");
    } finally {
      setIsLoading(false);
    }
  }, [unsubscribeMutation]);

  return { permission, isSubscribed, isLoading, subscribe, unsubscribe };
}
