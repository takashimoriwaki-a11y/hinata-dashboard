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
  team: mysqlEnum("team", ["身体", "天理", "郡山北部", "郡山南部", "事務員", "全チーム"]).default("身体"),
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
  /** 今日 or 明日 */
  day: mysqlEnum("day", ["今日", "明日"]).notNull(),
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
  category: mysqlEnum("category", ["スプレッドシート", "ドキュメント", "フォーム", "その他"]).notNull(),
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
