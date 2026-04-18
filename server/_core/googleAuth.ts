import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import { OAuth2Client } from "google-auth-library";
import { parse as parseCookieHeader } from "cookie";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { createSessionToken, verifySessionToken } from "./localAuth";
import { notifyOwner } from "./notification";

function getCalendarCallbackUrl(req: Request, origin?: string): string {
  if (origin) {
    return `${origin}/api/auth/google/calendar/callback`;
  }
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}/api/auth/google/calendar/callback`;
}

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
        const existingUser = await db.getUserByEmail(email);
        if (existingUser) {
          // 既存ユーザーのopenIdをGoogleのIDに統合（重複レコードを削除してから更新）
          console.log(`[GoogleAuth] Merging existing account for ${email}: ${existingUser.openId} -> ${openId}`);
          await db.mergeGoogleAccount(existingUser.id, openId, "google");
          // openIdが変わったので再取得
          user = await db.getUserByOpenId(openId);
        }
      }

      if (!user) {
        // @kokoronohinata.com ドメインのアカウントは自動登録を許可
        const ALLOWED_DOMAIN = "kokoronohinata.com";
        const emailDomain = email ? email.split("@")[1]?.toLowerCase() : null;
        if (emailDomain === ALLOWED_DOMAIN) {
          // 自動でユーザーを作成
          console.log(`[GoogleAuth] Auto-registering new staff from allowed domain: ${email}`);
          await db.upsertUser({
            openId,
            name,
            email,
            loginMethod: "google",
            role: "user",
            lastSignedIn: new Date(),
          });
          user = await db.getUserByOpenId(openId);
          // 新規自動登録を管理者に通知
          notifyOwner({
            title: `新しい職員が初回ログインしました`,
            content: `名前: ${name ?? "不明"}
メール: ${email ?? "不明"}
初回ログイン時刻: ${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
チーム設定はまだ完了していません。管理画面からロールを設定してください。`,
          }).catch((err) => console.error("[GoogleAuth] notifyOwner failed:", err));
        } else {
          // 許可ドメイン外のGoogleアカウントはログイン拒否
          console.warn(`[GoogleAuth] Unregistered Google account attempted login: ${email}`);
          res.redirect(302, `/login?error=google_not_registered&email=${encodeURIComponent(email ?? "")}`);
          return;
        }
      }

      // セッションを作成（userがundefinedの場合は認証失敗）
      if (!user) {
        console.error("[GoogleAuth] User not found after upsert");
        res.redirect(302, "/login?error=google_auth_failed");
        return;
      }
      const sessionToken = await createSessionToken(user.openId, user.name ?? name);
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.redirect(302, returnPath);
    } catch (error) {
      console.error("[GoogleAuth] Callback failed", error);
      res.redirect(302, "/login?error=google_auth_failed");
    }
  });

  // ============================================================
  // Google Calendar 連携用 OAuth（ログイン済みユーザー向け）
  // ============================================================

  // カレンダー権限の認証 URL へリダイレクト
  app.get("/api/auth/google/calendar", async (req: Request, res: Response) => {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    if (!clientId) {
      res.status(503).json({ error: "Google OAuth is not configured" });
      return;
    }
    // セッションCookieからユーザーを確認（cookieParserなしでも動作するよう直接パース）
    const cookieHeader = req.headers.cookie;
    const cookies = cookieHeader ? parseCookieHeader(cookieHeader) : {};
    const sessionToken = cookies[COOKIE_NAME];
    if (!sessionToken) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const origin = req.query.origin as string | undefined;
    const callbackUrl = getCalendarCallbackUrl(req, origin);
    const oauth2Client = new OAuth2Client(clientId, process.env.GOOGLE_OAUTH_CLIENT_SECRET, callbackUrl);
    const state = Buffer.from(JSON.stringify({ origin: origin ?? null, sessionToken })).toString("base64url");
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/calendar.readonly",
      ],
      state,
      prompt: "consent", // リフレッシュトークンを確実に取得するため
    });
    res.redirect(302, authUrl);
  });

  // カレンダー権限のコールバック処理
  app.get("/api/auth/google/calendar/callback", async (req: Request, res: Response) => {
    const code = req.query.code as string | undefined;
    const state = req.query.state as string | undefined;
    if (!code) {
      res.redirect(302, "/?calendar_error=auth_failed");
      return;
    }
    try {
      let originFromState: string | null = null;
      let sessionToken: string | null = null;
      if (state) {
        try {
          const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
          if (decoded.origin) originFromState = decoded.origin;
          if (decoded.sessionToken) sessionToken = decoded.sessionToken;
        } catch {
          // ignore
        }
      }
      if (!sessionToken) {
        res.redirect(302, "/?calendar_error=no_session");
        return;
      }
      const sessionPayload = await verifySessionToken(sessionToken).catch(() => null);
      if (!sessionPayload) {
        res.redirect(302, "/?calendar_error=invalid_session");
        return;
      }
      const user = await db.getUserByOpenId(sessionPayload.openId);
      if (!user) {
        res.redirect(302, "/?calendar_error=user_not_found");
        return;
      }
      const callbackUrl = getCalendarCallbackUrl(req, originFromState ?? undefined);
      const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
      const oauth2Client = new OAuth2Client(clientId, clientSecret, callbackUrl);
      const { tokens } = await oauth2Client.getToken(code);
      if (!tokens.access_token) {
        res.redirect(302, "/?calendar_error=no_token");
        return;
      }
      const expiryMs = tokens.expiry_date ?? Date.now() + 3600 * 1000;
      await db.updateUserGoogleTokens(
        user.id,
        tokens.access_token,
        tokens.refresh_token ?? null,
        expiryMs
      );
      console.log(`[GoogleCalendar] Token saved for user ${user.id}`);
      const redirectBase = originFromState ?? "";
      res.redirect(302, `${redirectBase}/schedule-management?calendar_connected=1`);
    } catch (error) {
      console.error("[GoogleCalendar] Callback failed", error);
      res.redirect(302, "/?calendar_error=callback_failed");
    }
  });

  // ============================================================
  // Google Picker 用 OAuth（Drive読み取りスコープ）
  // ============================================================

  // Picker用の認証URLへリダイレクト
  app.get("/api/auth/google/picker", async (req: Request, res: Response) => {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    if (!clientId) {
      res.status(503).json({ error: "Google OAuth is not configured" });
      return;
    }
    const cookieHeader = req.headers.cookie;
    const cookies = cookieHeader ? parseCookieHeader(cookieHeader) : {};
    const sessionToken = cookies[COOKIE_NAME];
    if (!sessionToken) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const origin = req.query.origin as string | undefined;
    const returnPath = (req.query.returnPath as string | undefined) ?? "/my-links";
    const callbackUrl = origin
      ? `${origin}/api/auth/google/picker/callback`
      : (() => {
          const proto = req.headers["x-forwarded-proto"] || req.protocol;
          const host = req.headers["x-forwarded-host"] || req.headers.host;
          return `${proto}://${host}/api/auth/google/picker/callback`;
        })();
    const oauth2Client = new OAuth2Client(clientId, process.env.GOOGLE_OAUTH_CLIENT_SECRET, callbackUrl);
    const state = Buffer.from(JSON.stringify({ origin: origin ?? null, sessionToken, returnPath })).toString("base64url");
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "online",
      scope: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/drive.readonly",
      ],
      state,
      prompt: "consent",
    });
    res.redirect(302, authUrl);
  });

  // Picker用コールバック: access_tokenを取得してフロントエンドに渡す
  app.get("/api/auth/google/picker/callback", async (req: Request, res: Response) => {
    const code = req.query.code as string | undefined;
    const state = req.query.state as string | undefined;
    if (!code) {
      res.redirect(302, "/my-links?picker_error=auth_failed");
      return;
    }
    try {
      let originFromState: string | null = null;
      let returnPathFromState = "/my-links";
      if (state) {
        try {
          const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
          if (decoded.origin) originFromState = decoded.origin;
          if (decoded.returnPath) returnPathFromState = decoded.returnPath;
        } catch { /* ignore */ }
      }
      const callbackUrl = originFromState
        ? `${originFromState}/api/auth/google/picker/callback`
        : (() => {
            const proto = req.headers["x-forwarded-proto"] || req.protocol;
            const host = req.headers["x-forwarded-host"] || req.headers.host;
            return `${proto}://${host}/api/auth/google/picker/callback`;
          })();
      const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
      const oauth2Client = new OAuth2Client(clientId, clientSecret, callbackUrl);
      const { tokens } = await oauth2Client.getToken(code);
      if (!tokens.access_token) {
        res.redirect(302, `${returnPathFromState}?picker_error=no_token`);
        return;
      }
      // access_tokenをURLフラグメントでフロントに渡す
      const redirectBase = originFromState ?? "";
      res.redirect(302, `${redirectBase}${returnPathFromState}#picker_token=${encodeURIComponent(tokens.access_token)}`);
    } catch (error) {
      console.error("[GooglePicker] Callback failed", error);
      res.redirect(302, `${(state ? (() => { try { const d = JSON.parse(Buffer.from(state, "base64url").toString()); return d.returnPath ?? "/my-links"; } catch { return "/my-links"; } })() : "/my-links")}?picker_error=callback_failed`);
    }
  });
}
