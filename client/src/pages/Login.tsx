import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Heart } from "lucide-react";

// Google OAuthログインURL（サーバー側の/api/auth/googleへリダイレクト）
// originパラメータを渡してサーバー側でリダイレクトURIを正しく生成できるようにする
function getGoogleLoginUrl(): string {
  const origin = window.location.origin;
  return `/api/auth/google?origin=${encodeURIComponent(origin)}`;
}

export default function Login() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const utils = trpc.useUtils();

  // URLパラメータからエラーコードを取得してメッセージを表示
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorCode = params.get("error");
    const emailParam = params.get("email");
    if (errorCode === "google_not_registered") {
      const emailMsg = emailParam ? `（${emailParam}）` : "";
      setError(`このGoogleアカウント${emailMsg}はシステムに登録されていません。管理者にメールアドレスの登録を依頼してください。`);
    } else if (errorCode === "google_auth_failed") {
      setError("Googleログインに失敗しました。しばらくしてからお試しください。");
    } else if (errorCode === "user_creation_failed") {
      setError("アカウントの作成に失敗しました。管理者にお問い合わせください。");
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json() as { ok?: boolean; error?: string };

      if (!res.ok || !data.ok) {
        setError(data.error ?? "ログインに失敗しました");
        return;
      }

      // セッションキャッシュをリセットしてホームへ
      await utils.auth.me.invalidate();
      navigate("/");
    } catch {
      setError("通信エラーが発生しました。しばらくしてからお試しください。");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    setGoogleLoading(true);
    // サーバー側のGoogle OAuthエンドポイントへリダイレクト
    window.location.href = getGoogleLoginUrl();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 to-blue-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* ロゴ・タイトル */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-sky-500 rounded-2xl shadow-lg mb-4">
            <Heart className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">ひなた</h1>
          <p className="text-sm text-slate-500 mt-1">こころの訪問看護ステーション</p>
        </div>

        <Card className="shadow-xl border-0">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg text-center">ログイン</CardTitle>
            <CardDescription className="text-center text-sm">
              アカウントにサインインしてください
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Googleログインボタン */}
            <Button
              type="button"
              variant="outline"
              className="w-full h-11 bg-white dark:bg-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-700 border border-gray-300 dark:border-zinc-600 text-gray-800 dark:text-white font-medium flex items-center justify-center gap-3"
              onClick={handleGoogleLogin}
              disabled={googleLoading || loading}
            >
              {googleLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Googleでログイン中...
                </>
              ) : (
                <>
                  {/* Googleアイコン（SVG） */}
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Googleでログイン
                </>
              )}
            </Button>

            {/* 区切り線 */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-200 dark:border-zinc-600" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">または</span>
              </div>
            </div>

            {/* メール/パスワードログイン */}
            <form onSubmit={handleLogin} className="space-y-4">
              {error && (
                <Alert variant="destructive" className="py-2">
                  <AlertDescription className="text-sm">{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-medium">
                  メールアドレス
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="example@hinata.jp"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="h-11"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-sm font-medium">
                  パスワード
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="パスワードを入力"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="h-11"
                />
              </div>

              <Button
                type="submit"
                className="w-full h-11 bg-sky-500 hover:bg-sky-600 text-white font-semibold"
                disabled={loading || googleLoading}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ログイン中...
                  </>
                ) : (
                  "メールアドレスでログイン"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-400 mt-6">
          © {new Date().getFullYear()} こころの訪問看護ステーションひなた
        </p>
      </div>
    </div>
  );
}
