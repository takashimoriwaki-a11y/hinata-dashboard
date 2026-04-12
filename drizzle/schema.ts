import { bigint, date, int, mediumtext, mysqlEnum, mysqlTable, text, timestamp, tinyint, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  /** ユーザーが所属するチーム（デフォルト選択に使用） */
  team: mysqlEnum("team", ["身体", "天理", "郡山北部", "郡山南部", "事務員", "全チーム"]).default("身体"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  /** メール/パスワード認証用のハッシュ化されたパスワード */
  passwordHash: text("passwordHash"),
  /** 初回ログイン時のチーム設定完了フラグ (0=未設定, 1=設定済) */
  teamSetupDone: tinyint("teamSetupDone").default(0).notNull(),
  /** Google Calendar用アクセストークン */
  googleAccessToken: text("googleAccessToken"),
  /** Google Calendar用リフレッシュトークン */
  googleRefreshToken: text("googleRefreshToken"),
  /** Googleアクセストークンの有効期限（Unixミリ秒） */
  googleTokenExpiry: bigint("googleTokenExpiry", { mode: "number" }),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * 訪問スケジュールスクリーンショットテーブル
 * 各チーム・今日/明日のスクショをS3に保存し、そのURLをDBで管理する
 */
export const scheduleScreenshots = mysqlTable("schedule_screenshots", {
  id: int("id").autoincrement().primaryKey(),
  /** チーム名 */
  team: mysqlEnum("team", ["身体", "天理", "郡山北部", "郡山南部"]).notNull(),
  /** 今日 or 明日 or 3日後 or 4日後 */
  day: mysqlEnum("day", ["今日", "明日", "2日後", "3日後", "4日後"]).notNull(),
  /** 画像のURL（S3またはdata:URL） */
  imageUrl: text("imageUrl").notNull(),
  /** S3のキー（削除に使用）またはDB保存の場合は空 */
  imageKey: varchar("imageKey", { length: 512 }).notNull(),
  /** Base64エンコードされた画像データ（S3が使えない環境用） */
  imageData: mediumtext("imageData"),
  /** アップロードしたユーザーID */
  uploadedBy: int("uploadedBy"),
  /** アップロードしたユーザー名 */
  uploadedByName: text("uploadedByName"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ScheduleScreenshot = typeof scheduleScreenshots.$inferSelect;
export type InsertScheduleScreenshot = typeof scheduleScreenshots.$inferInsert;

/**
 * マイリンクテーブル
 * 各ユーザーが業務でよく使うツールのリンクを登録・編集・削除できる
 */
export const myLinks = mysqlTable("my_links", {
  id: int("id").autoincrement().primaryKey(),
  /** リンクを登録したユーザーID */
  userId: int("userId").notNull(),
  /** 表示ラベル */
  label: varchar("label", { length: 100 }).notNull(),
  /** URL */
  url: text("url").notNull(),
  /** 絵文字アイコン（任意） */
  emoji: varchar("emoji", { length: 10 }).default("🔗"),
  /** 説明（任意） */
  description: varchar("description", { length: 200 }),
  /** 表示順序 */
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MyLink = typeof myLinks.$inferSelect;
export type InsertMyLink = typeof myLinks.$inferInsert;

/**
 * 業務ツールリンク（スプレッドシートURL月次管理）
 * 管理者が月ごとに登録し、当月分が自動表示される
 */
export const spreadsheetLinks = mysqlTable("spreadsheet_links", {
  id: int("id").autoincrement().primaryKey(),
  /** リンクの識別キー（固定値：利用者料金一覧_精神郡山 など） */
  linkKey: varchar("linkKey", { length: 100 }).notNull(),
  /** 表示ラベル */
  label: varchar("label", { length: 100 }).notNull(),
  /** 対象年月（YYYY-MM形式） */
  yearMonth: varchar("yearMonth", { length: 7 }).notNull(),
  /** GoogleスプレッドシートURL */
  url: text("url").notNull(),
  /** 登録したユーザーID */
  createdBy: int("createdBy"),
  /** 色クラス（表示用） */
  color: varchar("color", { length: 50 }).default("text-emerald-600"),
  /**
   * 表示先：'team'=チームツール, 'common'=全チーム共通ツール
   * fee_* は常に 'team' 固定
   */
  displayTarget: varchar("displayTarget", { length: 10 }).default("common").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SpreadsheetLink = typeof spreadsheetLinks.$inferSelect;
export type InsertSpreadsheetLink = typeof spreadsheetLinks.$inferInsert;

/**
 * タスクテーブル
 * チームまたは個人に割り当てられるタスクを管理する
 * - assignType: "team" の場合は assignTeam で対象チームを指定
 * - assignType: "personal" の場合は assignUserId で対象ユーザーを指定
 * - assignType: "all" の場合は全スタッフ対象
 */
export const tasks = mysqlTable("tasks", {
  id: int("id").autoincrement().primaryKey(),
  /** タスクの内容 */
  text: text("text").notNull(),
  /** 完了フラグ */
  done: int("done").default(0).notNull(), // 0: 未完了, 1: 完了
  /** 期日（任意） */
  dueDate: timestamp("dueDate"),
  /** 作成者のユーザーID */
  createdBy: int("createdBy").notNull(),
  /** 作成者の名前（表示用キャッシュ） */
  createdByName: text("createdByName").notNull(),
  /** 指定先タイプ: all=全員, team=チーム指定, personal=個人指定 */
  assignType: mysqlEnum("assignType", ["all", "team", "personal"]).default("all").notNull(),
  /** チーム指定の場合のチーム名 */
  assignTeam: mysqlEnum("assignTeam", ["身体", "天理", "郡山北部", "郡山南部"]),
  /** 個人指定の場合の対象ユーザーID */
  assignUserId: int("assignUserId"),
  /** 個人指定の場合の対象ユーザー名（表示用キャッシュ） */
  assignUserName: text("assignUserName"),
  /** 完了したユーザーID */
  completedBy: int("completedBy"),
  /** 完了日時 */
  completedAt: timestamp("completedAt"),
  /** 繰り返しタイプ: none=なし, weekly=毎週, monthly=毎月 */
  repeatType: mysqlEnum("repeatType", ["none", "weekly", "monthly"]).default("none").notNull(),
  /** 毎週の場合の曜日（0=日, 1=月, ..., 6=土） */
  repeatDayOfWeek: int("repeatDayOfWeek"),
  /** 毎月の場合の日（1〜31） */
  repeatDayOfMonth: int("repeatDayOfMonth"),
  /** 繰り返し元のタスクID（自動生成タスクの場合に設定） */
  repeatParentId: int("repeatParentId"),
  /** 関連する利用者名（任意） */
  patientName: varchar("patientName", { length: 100 }),
  /** ソフトデリート日時（nullの場合は削除されていない） */
  deletedAt: timestamp("deletedAt"),
  /** ソフトデリートしたユーザーID */
  deletedBy: int("deletedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;

/**
 * メッセージテーブル
 * チーム向けメッセージを管理する
 * - 作成者名自動付与
 * - 表示期間（displayFrom〜displayUntil）設定可能
 * - displayUntilを過ぎたら自動非表示（論理削除）
 * - 予約送信（scheduledAt）設定可能
 * - 手動削除（deletedAt）
 */
export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  /** メッセージ本文 */
  text: text("text").notNull(),
  /** 作成者のユーザーID */
  createdBy: int("createdBy").notNull(),
  /** 作成者の名前（表示用キャッシュ） */
  createdByName: text("createdByName").notNull(),
  /** 表示開始日時（nullの場合は即時表示） */
  displayFrom: timestamp("displayFrom"),
  /** 表示終了日時（nullの場合は無期限） */
  displayUntil: timestamp("displayUntil"),
  /** 予約送信日時（nullの場合は即時送信） */
  scheduledAt: timestamp("scheduledAt"),
  /** 手動削除日時（nullの場合は削除されていない） */
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

/**
 * メッセージリアクションテーブル
 * 各ユーザーが各メッセージに付けた絵文字リアクションを管理する
 * 同じユーザーが同じ絵文字を再度押すとトグル（削除）される
 */
export const messageReactions = mysqlTable("message_reactions", {
  id: int("id").autoincrement().primaryKey(),
  /** 対象メッセージID */
  messageId: int("messageId").notNull(),
  /** リアクションしたユーザーID */
  userId: int("userId").notNull(),
  /** ユーザー名（表示用キャッシュ） */
  userName: text("userName").notNull(),
  /** 絵文字 */
  emoji: varchar("emoji", { length: 10 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MessageReaction = typeof messageReactions.$inferSelect;
export type InsertMessageReaction = typeof messageReactions.$inferInsert;

/**
 * 利用者テーブル
 * チームごとの利用者情報を管理する
 */
export const patients = mysqlTable("patients", {
  id: int("id").autoincrement().primaryKey(),
  /** 利用者の氏名 */
  name: varchar("name", { length: 100 }).notNull(),
  /** 所属チーム */
  team: mysqlEnum("team", ["身体", "天理", "郡山北部", "郡山南部"]).notNull(),
  /** ふりがな（検索用） */
  nameKana: varchar("nameKana", { length: 100 }),
  /** 有効フラグ（退所等で非表示にする場合） */
  active: int("active").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Patient = typeof patients.$inferSelect;
export type InsertPatient = typeof patients.$inferInsert;

/**
 * 訪問記録テーブル
 * 訪問時の記録・次回訪問日時・伝達方法を管理する
 */
export const visitRecords = mysqlTable("visit_records", {
  id: int("id").autoincrement().primaryKey(),
  /** 記録した利用者ID */
  patientId: int("patientId"),
  /** 利用者名（表示用キャッシュ） */
  patientName: text("patientName").notNull(),
  /** チーム名 */
  team: mysqlEnum("team", ["身体", "天理", "郡山北部", "郡山南部"]).notNull(),
  /** 記録者のユーザーID */
  createdBy: int("createdBy").notNull(),
  /** 記録者の名前（表示用キャッシュ） */
  createdByName: text("createdByName").notNull(),
  /** ②病状の経過（本日観察・収集した情報） */
  clinicalNotes: text("clinicalNotes"),
  /** 次回訪問日時 */
  nextVisitAt: timestamp("nextVisitAt"),
  /** 次回訪問日時の伝達先: 本人/家族/その他 */
  notifiedTo: mysqlEnum("notifiedTo", ["本人", "家族", "その他"]),
  /** 伝達先その他の自由記述 */
  notifiedToOther: text("notifiedToOther"),
  /** 伝達方法: 口頭/カレンダー記入/付箋/電話/その他 */
  notifyMethod: mysqlEnum("notifyMethod", ["口頭", "カレンダー記入", "付箋", "電話", "その他"]),
  /** 伝達方法その他の自由記述 */
  notifyMethodOther: text("notifyMethodOther"),
  /** スプレッドシート転送済みフラグ */
  exportedAt: timestamp("exportedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type VisitRecord = typeof visitRecords.$inferSelect;
export type InsertVisitRecord = typeof visitRecords.$inferInsert;

/**
 * アプリ内通知テーブル
 * スケジュール更新・今日のタスク・新着メッセージの3種類の通知を管理する
 */
export const appNotifications = mysqlTable("app_notifications", {
  id: int("id").autoincrement().primaryKey(),
  /** 通知の種類 */
  type: mysqlEnum("type", ["schedule_updated", "task_today", "new_message", "minutes_reminder", "minutes_posted"]).notNull(),
  /** 通知のタイトル */
  title: varchar("title", { length: 200 }).notNull(),
  /** 通知の本文 */
  body: text("body"),
  /** 関連リソースのID（タスクID・メッセージID等） */
  resourceId: int("resourceId"),
  /** 既読フラグ（0=未読, 1=既読） */
  isRead: int("isRead").default(0).notNull(),
   /** 既読にした日時 */
  readAt: timestamp("readAt"),
  /** 対象ユーザーID（nullの場合は全員対象） */
  targetUserId: int("targetUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AppNotification = typeof appNotifications.$inferSelect;
export type InsertAppNotification = typeof appNotifications.$inferInsert;

/**
 * ブラウザプッシュ通知サブスクリプションテーブル
 * Web Push APIのサブスクリプション情報を保存する
 */
export const pushSubscriptions = mysqlTable("push_subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  /** サブスクリプションのエンドポイントURL（ユニーク） */
  endpoint: text("endpoint").notNull(),
  /** P256DH鍵 */
  p256dh: text("p256dh").notNull(),
  /** Auth鍵 */
  auth: text("auth").notNull(),
  /** 登録したユーザーID（nullの場合は匿名） */
  userId: int("userId"),
  /** 登録したユーザー名 */
  userName: varchar("userName", { length: 200 }),
  /**
   * 通知フィルター設定
   * null = 全チームのスクリーンショット更新で通知
   * "身体" | "天理" | "郡山北部" | "郡山南部" = 指定チームのみ通知
   */
  teamFilter: varchar("teamFilter", { length: 50 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type InsertPushSubscription = typeof pushSubscriptions.$inferInsert;

/**
 * スクリーンショットアップロード履歴テーブル
 * アップロードのたびに記録を残す（upsertとは別に蓄積）
 */
export const screenshotUploadLogs = mysqlTable("screenshot_upload_logs", {
  id: int("id").autoincrement().primaryKey(),
  /** チーム名 */
  team: mysqlEnum("team", ["身体", "天理", "郡山北部", "郡山南部"]).notNull(),
  /** 今日 or 明日 or 3日後 or 4日後 */
  day: mysqlEnum("day", ["今日", "明日", "2日後", "3日後", "4日後"]).notNull(),
  /** アップロードしたユーザーID */
  uploadedBy: int("uploadedBy"),
  /** アップロードしたユーザー名 */
  uploadedByName: varchar("uploadedByName", { length: 200 }),
  /** アップロード日時 */
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ScreenshotUploadLog = typeof screenshotUploadLogs.$inferSelect;
export type InsertScreenshotUploadLog = typeof screenshotUploadLogs.$inferInsert;

/**
 * アプリ設定テーブル（key/value形式）
 * スプレッドシート自動削除の保持期間などのシステム設定を保存
 */
export const appSettings = mysqlTable("app_settings", {
  id: int("id").autoincrement().primaryKey(),
  /** 設定キー（例: "sheet_cleanup_days"） */
  key: varchar("key", { length: 100 }).notNull().unique(),
  /** 設定値（文字列として保存） */
  value: text("value").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AppSetting = typeof appSettings.$inferSelect;
export type InsertAppSetting = typeof appSettings.$inferInsert;

/**
 * 訪問スケジュールコメントテーブル
 * 各チーム・今日/明日のスクリーンショットに対するコメント・申し送り事項を管理する
 */
export const scheduleComments = mysqlTable("schedule_comments", {
  id: int("id").autoincrement().primaryKey(),
  /** チーム名 */
  team: mysqlEnum("team", ["身体", "天理", "郡山北部", "郡山南部"]).notNull(),
  /** 今日 or 明日 or 3日後 or 4日後 */
  day: mysqlEnum("day", ["今日", "明日", "2日後", "3日後", "4日後"]).notNull(),
  /** 実際の日付（YYYY-MM-DD形式、JST）コメントが属する日の日付 */
  date: varchar("date", { length: 10 }).notNull().default(""),
  /** コメント本文 */
  content: text("content").notNull(),
  /** 投稿したユーザーID */
  userId: int("userId").notNull(),
  /** 投稿したユーザー名（表示用キャッシュ） */
  userName: text("userName").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ScheduleComment = typeof scheduleComments.$inferSelect;
export type InsertScheduleComment = typeof scheduleComments.$inferInsert;

/**
 * 申し送りコメントリアクションテーブル
 * スタッフが申し送りコメントに絵文字でリアクションを付けることができる
 */
export const scheduleCommentReactions = mysqlTable("schedule_comment_reactions", {
  id: int("id").autoincrement().primaryKey(),
  /** リアクション対象のコメントID */
  commentId: int("commentId").notNull(),
  /** リアクションしたユーザーID */
  userId: int("userId").notNull(),
  /** リアクションしたユーザー名（表示用キャッシュ） */
  userName: text("userName").notNull(),
  /** 絵文字 */
  emoji: varchar("emoji", { length: 10 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ScheduleCommentReaction = typeof scheduleCommentReactions.$inferSelect;
export type InsertScheduleCommentReaction = typeof scheduleCommentReactions.$inferInsert;

/**
 * スケジュール変更連絡テーブル
 * 利用者の訪問スケジュール変更・追加・キャンセル、会議予定の変更・追加を管理する
 */
export const scheduleChanges = mysqlTable("schedule_changes", {
  id: int("id").autoincrement().primaryKey(),
  /**
   * 変更種別
   * visit_change: 訪問日時変更
   * visit_cancel: 訪問キャンセル
   * visit_add: 訪問追加（新規）
   * meeting_add: 会議追加
   * meeting_change: 会議変更
   */
  changeType: mysqlEnum("changeType", [
    "visit_change",
    "visit_cancel",
    "visit_add",
    "meeting_add",
    "meeting_change",
  ]).notNull(),
  /** 対象チーム（会議の場合はnull可） */
  team: mysqlEnum("team", ["身体", "天理", "郡山北部", "郡山南部", "事務員", "全チーム"]),
  /** 利用者名（訪問系の場合） */
  patientName: varchar("patientName", { length: 100 }),
  /** 利用者ID（利用者マスタと紐付け、任意） */
  patientId: int("patientId"),
  /** 変更前の日時（ISO文字列） */
  fromDatetime: varchar("fromDatetime", { length: 30 }),
  /** 変更後の日時（ISO文字列）。キャンセルの場合はnull */
  toDatetime: varchar("toDatetime", { length: 30 }),
  /** 訪問担当スタッフ（変更前） */
  staffBefore: text("staffBefore"),
  /** 訪問担当スタッフ（変更後） */
  staffAfter: text("staffAfter"),
  /** 会議名（会議系の場合） */
  meetingName: varchar("meetingName", { length: 200 }),
  /** 会議参加スタッフ（JSON配列文字列） */
  meetingStaff: text("meetingStaff"),
  /** 変更理由・備考 */
  reason: text("reason"),
  /** 入力したユーザーID */
  createdBy: int("createdBy").notNull(),
  /** 入力したユーザー名（表示用キャッシュ） */
  createdByName: text("createdByName").notNull(),
  /** スプレッドシート転記済みフラグ */
  exported: int("exported").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ScheduleChange = typeof scheduleChanges.$inferSelect;
export type InsertScheduleChange = typeof scheduleChanges.$inferInsert;

/**
 * クイックアクセスリンクテーブル
 * ホーム画面の業務ツールクイックアクセスに表示するリンクを管理する
 * - category: スプレッドシート / ドキュメント / フォーム / その他
 * - sortOrder: 表示順（小さいほど上に表示）
 */
export const quickAccessLinks = mysqlTable("quick_access_links", {
  id: int("id").autoincrement().primaryKey(),
  /** カテゴリ */
  category: mysqlEnum("category", ["スプレッドシート", "スプレッドシート（日々使用）", "スプレッドシート（その他）", "ドキュメント", "フォーム", "その他"]).notNull(),
  /** 表示名 */
  label: varchar("label", { length: 200 }).notNull(),
  /** リンクURL */
  href: varchar("href", { length: 2000 }).notNull(),
  /** 絵文字アイコン（例: 📄） */
  emoji: varchar("emoji", { length: 10 }).default("").notNull(),
  /** テキスト色クラス（例: text-emerald-600） */
  color: varchar("color", { length: 100 }).default("text-blue-600").notNull(),
  /** 表示順（小さいほど上） */
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type QuickAccessLink = typeof quickAccessLinks.$inferSelect;
export type InsertQuickAccessLink = typeof quickAccessLinks.$inferInsert;

/**
 * 音声入力誤変換フィードバックテーブル
 * 変更連絡の音声入力後に誤変換を報告するためのテーブル
 */
export const voiceFeedback = mysqlTable("voice_feedback", {
  id: int("id").autoincrement().primaryKey(),
  /** 元の音声テキスト */
  originalText: text("originalText").notNull(),
  /** AI転記結果（JSON文字列） */
  transcribedResult: text("transcribedResult"),
  /** 誤変換された項目名 */
  wrongField: varchar("wrongField", { length: 200 }),
  /** 誤変換内容（AIが出した値） */
  wrongValue: text("wrongValue"),
  /** 正しい値 */
  correctValue: text("correctValue"),
  /** 自由コメント */
  comment: text("comment"),
  /** 報告したユーザーID */
  reportedBy: int("reportedBy").notNull(),
  /** 報告したユーザー名 */
  reportedByName: text("reportedByName").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type VoiceFeedback = typeof voiceFeedback.$inferSelect;
export type InsertVoiceFeedback = typeof voiceFeedback.$inferInsert;

/**
 * チームツールリンクテーブル
 * 各チーム専用のツールリンクを管理する
 * - team: 身体 / 天理 / 郡山北部 / 郡山南部
 * - sortOrder: 表示順（小さいほど上に表示）
 */
export const teamTools = mysqlTable("team_tools", {
  id: int("id").autoincrement().primaryKey(),
  /** 対象チーム */
  team: mysqlEnum("team", ["身体", "天理", "郡山北部", "郡山南部"]).notNull(),
  /** 表示名 */
  label: varchar("label", { length: 200 }).notNull(),
  /** リンクURL */
  href: varchar("href", { length: 2000 }).notNull(),
  /** 絵文字アイコン（例: 📄） */
  emoji: varchar("emoji", { length: 10 }).default("🔗").notNull(),
  /** テキスト色クラス（例: text-blue-600） */
  color: varchar("color", { length: 100 }).default("text-blue-600").notNull(),
  /** 表示順（小さいほど上） */
  sortOrder: int("sortOrder").default(0).notNull(),
  /** 登録したユーザーID */
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TeamTool = typeof teamTools.$inferSelect;
export type InsertTeamTool = typeof teamTools.$inferInsert;

/**
 * 議事録テーブル
 * 管理者が議事録ドキュメントを投稿し、スタッフが確認チェックを入れると自動削除される
 */
export const minutes = mysqlTable("minutes", {
  id: int("id").autoincrement().primaryKey(),
  /** タイトル */
  title: varchar("title", { length: 300 }).notNull(),
  /** 本文・内容 */
  content: mediumtext("content").notNull(),
  /** 添付ドキュメントURL（Google Docs等） */
  documentUrl: varchar("documentUrl", { length: 2048 }),
  /** 添付ドキュメントのラベル */
  documentLabel: varchar("documentLabel", { length: 200 }),
  /** 投稿者ユーザーID */
  createdBy: int("createdBy").notNull(),
  /** 投稿者名 */
  createdByName: varchar("createdByName", { length: 100 }).notNull(),
  /** 確認期限（任意） */
  deadline: timestamp("deadline"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Minutes = typeof minutes.$inferSelect;;
export type InsertMinutes = typeof minutes.$inferInsert;

/**
 * 議事録確認テーブル
 * ユーザーが議事録を確認したことを記録する
 */
export const minutesChecks = mysqlTable("minutes_checks", {
  id: int("id").autoincrement().primaryKey(),
  /** 議事録ID */
  minutesId: int("minutesId").notNull(),
  /** 確認したユーザーID */
  userId: int("userId").notNull(),
  /** 確認者名 */
  userName: varchar("userName", { length: 100 }).notNull(),
  checkedAt: timestamp("checkedAt").defaultNow().notNull(),
});

export type MinutesCheck = typeof minutesChecks.$inferSelect;
export type InsertMinutesCheck = typeof minutesChecks.$inferInsert;

/**
 * チーム目標テーブル
 * 管理者が各チームに対して期間付きの目標を登録する
 */
export const teamGoals = mysqlTable("team_goals", {
  id: int("id").autoincrement().primaryKey(),
  /** 対象チーム（"全チーム"は全員に表示） */
  team: mysqlEnum("team", ["身体", "天理", "郡山北部", "郡山南部", "全チーム"]).notNull(),
  /** 目標タイトル */
  title: varchar("title", { length: 200 }).notNull(),
  /** 目標の詳細（任意） */
  body: text("body"),
  /** 表示開始日（YYYY-MM-DD形式、nullの場合は常時表示） */
  startDate: date("startDate"),
  /** 表示終了日（YYYY-MM-DD形式、nullの場合は常時表示） */
  endDate: date("endDate"),
  /** 登録者ユーザーID */
  createdBy: int("createdBy").notNull(),
  /** 登録者名 */
  createdByName: varchar("createdByName", { length: 100 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type TeamGoal = typeof teamGoals.$inferSelect;
export type InsertTeamGoal = typeof teamGoals.$inferInsert;

/**
 * ツール操作ログテーブル
 * チームツール・全チーム共通ツールの追加・更新・削除操作を記録する
 */
export const toolAuditLogs = mysqlTable("tool_audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  /** 操作種別: create=追加, update=更新, delete=削除 */
  action: mysqlEnum("action", ["create", "update", "delete"]).notNull(),
  /** ツール種別: team=チームツール, common=全チーム共通ツール */
  toolType: mysqlEnum("toolType", ["team", "common"]).notNull(),
  /** 対象チーム（チームツールの場合のみ） */
  team: varchar("team", { length: 50 }),
  /** カテゴリ（全チーム共通ツールの場合のみ） */
  category: varchar("category", { length: 100 }),
  /** ツール名 */
  toolLabel: varchar("toolLabel", { length: 200 }).notNull(),
  /** ツールURL */
  toolHref: varchar("toolHref", { length: 2000 }),
  /** 操作前のラベル（更新時） */
  previousLabel: varchar("previousLabel", { length: 200 }),
  /** 操作したユーザーID */
  operatedBy: int("operatedBy").notNull(),
  /** 操作したユーザー名 */
  operatedByName: varchar("operatedByName", { length: 100 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ToolAuditLog = typeof toolAuditLogs.$inferSelect;
export type InsertToolAuditLog = typeof toolAuditLogs.$inferInsert;

/**
 * 出退勤打刻テーブル
 * 職員の出勤・退勤時刻を記録する
 */
export const attendanceLogs = mysqlTable("attendance_logs", {
  id: int("id").autoincrement().primaryKey(),
  /** 打刻種別: clock_in=出勤, clock_out=退勤 */
  type: mysqlEnum("type", ["clock_in", "clock_out"]).notNull(),
  /** 打刻したユーザーID */
  userId: int("userId").notNull(),
  /** 打刻したユーザー名 */
  userName: varchar("userName", { length: 100 }).notNull(),
  /** 打刻日時（UTC ms） */
  clockedAt: bigint("clockedAt", { mode: "number" }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AttendanceLog = typeof attendanceLogs.$inferSelect;
export type InsertAttendanceLog = typeof attendanceLogs.$inferInsert;

/**
 * AI共有プロンプトテーブル
 * 全職員が共有・コピー・追加・修正できるプロンプト集
 */
export const sharedPrompts = mysqlTable("shared_prompts", {
  id: int("id").autoincrement().primaryKey(),
  /** プロンプトのタイトル */
  title: varchar("title", { length: 200 }).notNull(),
  /** プロンプト本文 */
  body: text("body").notNull(),
  /** 対象AIツール（例: Gemini, Gem, NotebookLM, その他） */
  aiTool: varchar("aiTool", { length: 100 }).notNull().default("Gemini"),
  /** カテゴリ（任意） */
  category: varchar("category", { length: 100 }),
  /** 作成者ユーザーID */
  createdBy: int("createdBy").notNull(),
  /** 作成者名 */
  createdByName: varchar("createdByName", { length: 100 }).notNull(),
  /** 最終更新者名 */
  updatedByName: varchar("updatedByName", { length: 100 }),
  /** 使い方・説明（任意） */
  usageNotes: text("usageNotes"),
  /** 削除フラグ */
  isDeleted: tinyint("isDeleted").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SharedPrompt = typeof sharedPrompts.$inferSelect;
export type InsertSharedPrompt = typeof sharedPrompts.$inferInsert;
