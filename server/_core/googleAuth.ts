import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import { OAuth2Client } from "google-auth-library";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { createSessionToken } from "./localAuth";

function getCallbackUrl(req: Request, origin?: string): string {
  // originパラメータが渡された場合はそれを使用（フロントエンドのURLが正確）
  if (origin) {
    return `${origin}/api/auth/google/callback`;
  }
  // フォールバック: ヘッダーから取得
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}/api/auth/google/callback`;
}

export function registerGoogleAuthRoutes(app: Express) {
  // Google OAuthの認証URLへリダイレクト
  app.get("/api/auth/google", (req: Request, res: Response) => {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    if (!clientId) {
      res.status(503).json({ error: "Google OAuth is not configured" });
      return;
    }

    // フロントエンドからoriginを受け取る
    const origin = req.query.origin as string | undefined;
    const callbackUrl = getCallbackUrl(req, origin);
    const oauth2Client = new OAuth2Client(clientId, process.env.GOOGLE_OAUTH_CLIENT_SECRET, callbackUrl);

    // stateにreturnPathとoriginを含める（コールバック時にリダイレクトURIを再構築するため）
    const state = Buffer.from(JSON.stringify({ returnPath: "/", origin: origin ?? null })).toString("base64url");

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "online",
      scope: ["openid", "email", "profile"],
      state,
      prompt: "select_account", // アカウント選択画面を常に表示
    });

    res.redirect(302, authUrl);
  });

  // Google OAuthのコールバック処理
  app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
    const code = req.query.code as string | undefined;
    const state = req.query.state as string | undefined;

    if (!code) {
      res.redirect(302, "/login?error=google_auth_failed");
      return;
    }

    try {
      // stateからoriginとreturnPathを取得
      let returnPath = "/";
      let originFromState: string | null = null;
      if (state) {
        try {
          const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
          if (decoded.returnPath) returnPath = decoded.returnPath;
          if (decoded.origin) originFromState = decoded.origin;
        } catch {
          // stateのパースに失敗した場合はデフォルトのパスを使用
        }
      }

      // コールバックURLはstateのoriginから再構築（認証URLと一致させる必要がある）
      const callbackUrl = getCallbackUrl(req, originFromState ?? undefined);
      const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
      const oauth2Client = new OAuth2Client(clientId, clientSecret, callbackUrl);

      // 認証コードをトークンに交換
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);

      // IDトークンからユーザー情報を取得
      const ticket = await oauth2Client.verifyIdToken({
        idToken: tokens.id_token!,
        audience: clientId,
      });

      const payload = ticket.getPayload();
      if (!payload || !payload.sub) {
        res.redirect(302, "/login?error=google_auth_failed");
        return;
      }

      const googleId = payload.sub;
      const email = payload.email ?? null;
      const name = payload.name ?? email ?? "Google User";

      // openIdとしてgoogle_${googleId}を使用
      const openId = `google_${googleId}`;

      // DBにユーザーをupsert（既存ユーザーはメールアドレスで検索して紐付け）
      let user = await db.getUserByOpenId(openId);

      if (!user && email) {
        // メールアドレスで既存ユーザーを検索（既存スタッフとGoogleアカウントを紐付け）
        user = await db.getUserByEmail(email);
        if (user) {
          // 既存ユーザーのopenIdをGoogleのIDに更新
          await db.upsertUser({
            openId,
            name: user.name ?? name,
            email,
            loginMethod: "google",
            lastSignedIn: new Date(),
          });
          // openIdが変わったので再取得
          user = await db.getUserByOpenId(openId);
        }
      }

      if (!user) {
        // 未登録のGoogleアカウントはログイン拒否（管理者がメールアドレスを事前登録する必要がある）
        console.warn(`[GoogleAuth] Unregistered Google account attempted login: ${email}`);
        res.redirect(302, `/login?error=google_not_registered&email=${encodeURIComponent(email ?? "")}`);
        return;
      }

      // セッションを作成
      const sessionToken = await createSessionToken(user.openId, user.name ?? name);
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.redirect(302, returnPath);
    } catch (error) {
      console.error("[GoogleAuth] Callback failed", error);
      res.redirect(302, "/login?error=google_auth_failed");
    }
  });
}
