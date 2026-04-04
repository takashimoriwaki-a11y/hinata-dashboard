import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";

const isAuthError = (error: unknown): boolean => {
  if (!(error instanceof TRPCClientError)) return false;
  if (error.message === UNAUTHED_ERR_MSG) return true;
  const httpStatus = (error.data as { httpStatus?: number } | undefined)?.httpStatus;
  return httpStatus === 401 || httpStatus === 403;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 認証エラー（401/403）はリトライしない
      retry: (failureCount, error) => {
        if (isAuthError(error)) return false;
        return failureCount < 2;
      },
      // タブ切り替え高速化：キャッシュを5分間保持し不要な再取得を防ぐ
      staleTime: 5 * 60 * 1000, // 5分間はキャッシュを「新鮮」とみなす
      gcTime: 10 * 60 * 1000, // 10分間はメモリに保持（旧cacheTime）
      // ウィンドウフォーカス時の自動再取得を無効化（手動リフレッシュのみ）
      refetchOnWindowFocus: false,
      // マウント時の再取得を無効化（キャッシュがあれば使う）
      refetchOnMount: false,
    },
  },
});

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    // 認証エラーはコンソールにも出力しない（ノイズ削減）
    if (!isAuthError(error)) {
      console.error("[API Query Error]", error);
    }
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    if (!isAuthError(error)) {
      console.error("[API Mutation Error]", error);
    }
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

// Service Worker が新しいバージョンにアクティベートされたらページをリロードして
// 古いキャッシュされたバンドルを確実に排除する
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "SW_ACTIVATED") {
      // 既にリロード中でなければリロード
      window.location.reload();
    }
  });
}

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
