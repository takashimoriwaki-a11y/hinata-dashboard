import { int, mediumtext, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

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
  team: mysqlEnum("team", ["身体", "天理", "郡山北部", "郡山南部"]).default("身体"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  /** メール/パスワード認証用のハッシュ化されたパスワード */
  passwordHash: text("passwordHash"),
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
  /** 今日 or 明日 */
  day: mysqlEnum("day", ["今日", "明日"]).notNull(),
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
  type: mysqlEnum("type", ["schedule_updated", "task_today", "new_message"]).notNull(),
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
  /** 今日 or 明日 */
  day: mysqlEnum("day", ["今日", "明日"]).notNull(),
  /** アップロードしたユーザーID */
  uploadedBy: int("uploadedBy"),
  /** アップロードしたユーザー名 */
  uploadedByName: varchar("uploadedByName", { length: 200 }),
  /** アップロード日時 */
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ScreenshotUploadLog = typeof screenshotUploadLogs.$inferSelect;
export type InsertScreenshotUploadLog = typeof screenshotUploadLogs.$inferInsert;
