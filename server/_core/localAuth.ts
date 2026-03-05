/**
 * localAuth.ts
 * Manus OAuthに依存しないメール/パスワード認証の実装
 * Railway等の独立ホスティング環境で使用する
 */
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import bcrypt from "bcryptjs";
import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";

const SALT_ROUNDS = 12;

function getSessionSecret() {
  return new TextEncoder().encode(ENV.cookieSecret);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(userId: string, name: string): Promise<string> {
  const issuedAt = Date.now();
  const expirationSeconds = Math.floor((issuedAt + ONE_YEAR_MS) / 1000);
  const secretKey = getSessionSecret();

  return new SignJWT({ openId: userId, appId: "local", name })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expirationSeconds)
    .sign(secretKey);
}

export async function verifySessionToken(
  token: string | undefined | null
): Promise<{ openId: string; name: string } | null> {
  if (!token) return null;
  try {
    const secretKey = getSessionSecret();
    const { payload } = await jwtVerify(token, secretKey, { algorithms: ["HS256"] });
    const { openId, name } = payload as Record<string, unknown>;
    if (typeof openId !== "string" || typeof name !== "string") return null;
    return { openId, name };
  } catch {
    return null;
  }
}

export async function authenticateRequest(req: Request) {
  const cookieHeader = req.headers.cookie;
  const cookies = cookieHeader ? parseCookieHeader(cookieHeader) : {};
  const sessionToken = cookies[COOKIE_NAME];
  const session = await verifySessionToken(sessionToken);

  if (!session) throw ForbiddenError("Invalid session");

  const user = await db.getUserByOpenId(session.openId);
  if (!user) throw ForbiddenError("User not found");

  return user;
}

export function registerLocalAuthRoutes(app: Express) {
  // ログイン
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(400).json({ error: "メールアドレスとパスワードを入力してください" });
      return;
    }

    try {
      const user = await db.getUserByEmail(email);
      if (!user || !user.passwordHash) {
        res.status(401).json({ error: "メールアドレスまたはパスワードが正しくありません" });
        return;
      }

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        res.status(401).json({ error: "メールアドレスまたはパスワードが正しくありません" });
        return;
      }

      const token = await createSessionToken(user.openId, user.name ?? email);
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.json({ ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    } catch (error) {
      console.error("[LocalAuth] Login failed", error);
      res.status(500).json({ error: "ログインに失敗しました" });
    }
  });

  // ログアウト
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    res.clearCookie(COOKIE_NAME);
    res.json({ ok: true });
  });

  // 初回セットアップ（管理者アカウント作成）
  app.post("/api/auth/setup", async (req: Request, res: Response) => {
    const { name, email, password, setupKey } = req.body as {
      name?: string;
      email?: string;
      password?: string;
      setupKey?: string;
    };

    // セットアップキーで保護
    if (setupKey !== ENV.setupKey) {
      res.status(403).json({ error: "セットアップキーが正しくありません" });
      return;
    }

    if (!name || !email || !password) {
      res.status(400).json({ error: "名前・メールアドレス・パスワードを入力してください" });
      return;
    }

    try {
      const existing = await db.getUserByEmail(email);
      if (existing) {
        res.status(409).json({ error: "このメールアドレスはすでに登録されています" });
        return;
      }

      const passwordHash = await hashPassword(password);
      const openId = `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      await db.upsertUser({
        openId,
        name,
        email,
        loginMethod: "email",
        lastSignedIn: new Date(),
        passwordHash,
        role: "admin",
      });

      const user = await db.getUserByEmail(email);
      if (!user) throw new Error("User creation failed");

      const token = await createSessionToken(user.openId, name);
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.json({ ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    } catch (error) {
      console.error("[LocalAuth] Setup failed", error);
      res.status(500).json({ error: "セットアップに失敗しました" });
    }
  });
}
