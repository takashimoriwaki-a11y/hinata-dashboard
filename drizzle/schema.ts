import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

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
  /** S3に保存した画像のURL */
  imageUrl: text("imageUrl").notNull(),
  /** S3のキー（削除に使用） */
  imageKey: varchar("imageKey", { length: 512 }).notNull(),
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
