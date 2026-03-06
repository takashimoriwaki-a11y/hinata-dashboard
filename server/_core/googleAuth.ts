import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import { OAuth2Client } from "google-auth-library";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { createSessionToken } from "./localAuth";

function getOAuth2Client(): OAuth2Client {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  return new OAuth2Client(clientId, clientSecret);
}

function getCallbackUrl(req: Request): string {
  // フロントエンドからoriginを渡してもらう（stateパラメータ経由）
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

    const callbackUrl = getCallbackUrl(req);
    const oauth2Client = new OAuth2Client(clientId, process.env.GOOGLE_OAUTH_CLIENT_SECRET, callbackUrl);

    // stateにreturnPathを含める（CSRF対策も兼ねる）
    const state = Buffer.from(JSON.stringify({ returnPath: "/" })).toString("base64url");

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
      const callbackUrl = getCallbackUrl(req);
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
        // 新規ユーザーとして登録
        await db.upsertUser({
          openId,
          name,
          email,
          loginMethod: "google",
          lastSignedIn: new Date(),
        });
        user = await db.getUserByOpenId(openId);
      }

      if (!user) {
        res.redirect(302, "/login?error=user_creation_failed");
        return;
      }

      // セッションを作成
      const sessionToken = await createSessionToken(user.openId, user.name ?? name);
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      // stateからreturnPathを取得
      let returnPath = "/";
      if (state) {
        try {
          const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
          if (decoded.returnPath) returnPath = decoded.returnPath;
        } catch {
          // stateのパースに失敗した場合はデフォルトのパスを使用
        }
      }

      res.redirect(302, returnPath);
    } catch (error) {
      console.error("[GoogleAuth] Callback failed", error);
      res.redirect(302, "/login?error=google_auth_failed");
    }
  });
}
