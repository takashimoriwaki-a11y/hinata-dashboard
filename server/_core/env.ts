export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  /** 初回セットアップ用の秘密キー（Railway環境変数 SETUP_KEY） */
  setupKey: process.env.SETUP_KEY ?? "hinata-setup-2024",
  /** Gemini API キー（音声認識・AI機能用） */
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  /** Web Push通知用 VAPIDキー */
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? "",
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? "",
  vapidEmail: process.env.VAPID_EMAIL ?? "mailto:admin@kokoronohinata.com",
};
