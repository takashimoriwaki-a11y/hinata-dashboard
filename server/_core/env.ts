/**
 * アプリケーション環境変数
 *
 * Manus OAuth/Forge API への依存を完全に除去し、Google OAuth + Gemini + MySQL 構成に統一
 */
export const ENV = {
  /** セッション Cookie（JWT）の署名シークレット */
  cookieSecret: process.env.JWT_SECRET ?? "",
  /** MySQL 接続文字列（Railway MySQL から取得） */
  databaseUrl: process.env.DATABASE_URL ?? "",
  /** 本番環境フラグ */
  isProduction: process.env.NODE_ENV === "production",
  /** 初回セットアップ用シークレット（/setup ページで使用） */
  setupKey: process.env.SETUP_KEY ?? "hinata-setup-2024",
  /** オーナー（管理者）のメールアドレス - 初回ログイン時に admin 権限を自動付与 */
  ownerEmail: process.env.OWNER_EMAIL ?? "",
  /** Gemini API キー（音声認識・AI機能用） */
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  /** Web Push通知用 VAPIDキー */
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? "",
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? "",
  vapidEmail: process.env.VAPID_EMAIL ?? "mailto:admin@kokoronohinata.com",
  /** Google Drive API アクセストークン（議事録タイトル取得用） */
  googleDriveToken: process.env.GOOGLE_DRIVE_TOKEN ?? "",
  /** Google Sheets API キー */
  googleSheetsApiKey: process.env.GOOGLE_SHEETS_API_KEY ?? "",
};
