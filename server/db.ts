import { and, eq, or, isNull, isNotNull, desc, lte, gte, gt, lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2";
import { InsertUser, users, scheduleScreenshots, InsertScheduleScreenshot, myLinks, InsertMyLink, spreadsheetLinks, InsertSpreadsheetLink, tasks, InsertTask, messages, InsertMessage, messageReactions, InsertMessageReaction, patients, InsertPatient, visitRecords, InsertVisitRecord, appNotifications, InsertAppNotification, teamGoals, InsertTeamGoal } from "../drizzle/schema";
import { screenshotUploadLogs, InsertScreenshotUploadLog, appSettings } from "../drizzle/schema";
import { scheduleComments, InsertScheduleComment, scheduleCommentReactions, InsertScheduleCommentReaction } from "../drizzle/schema";
import { scheduleChanges, InsertScheduleChange } from "../drizzle/schema";
import { quickAccessLinks, InsertQuickAccessLink } from "../drizzle/schema";
import { voiceFeedback } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      // trim() to handle accidental whitespace in environment variables
      const dbUrl = process.env.DATABASE_URL.trim();
      console.log("[Database] Connecting with URL prefix:", dbUrl.substring(0, 20) + "...");
      // connectTimeout: 接続タイムアウト(ms), waitForConnections: プール枯渇時に待機
      const pool = createPool({
        uri: dbUrl,
        connectTimeout: 8000,   // 8秒で接続タイムアウト
        waitForConnections: true,
        connectionLimit: 5,
        queueLimit: 10,
      });
      _db = drizzle(pool);
    } catch (error) {
      console.error("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    // passwordHashの処理
    if (user.passwordHash !== undefined) {
      values.passwordHash = user.passwordHash;
      updateSet.passwordHash = user.passwordHash;
    }

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function updateUserTeam(userId: number, team: "身体" | "天理" | "郡山北部" | "郡山南部" | "事務員" | "全チーム") {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ team }).where(eq(users.id, userId));
}

/** 初回チーム設定を完了済みにマークする */
export async function completeTeamSetup(userId: number, team: "身体" | "天理" | "郡山北部" | "郡山南部" | "事務員" | "全チーム") {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ team, teamSetupDone: 1 }).where(eq(users.id, userId));
}

/** ユーザーのロールを変更する（admin専用） */
export async function updateUserRole(userId: number, role: "user" | "admin") {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

/**
 * 既存ユーザーのopenIdをGoogleのIDに統合する。
 * ローカルアカウントとGoogleアカウントが重複している場合に使用。
 * 古いgoogle_...レコードを削除してから既存レコードのopenIdを更新する。
 */
export async function mergeGoogleAccount(
  existingUserId: number,
  newOpenId: string,
  loginMethod: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // 重複しているgoogle_...のレコードを先に削除（存在する場合）
  await db.delete(users).where(eq(users.openId, newOpenId));
  // 既存レコードのopenIdをGoogleのIDに更新
  await db.update(users)
    .set({ openId: newOpenId, loginMethod, lastSignedIn: new Date() })
    .where(eq(users.id, existingUserId));
}

/** 全スタッフ（ユーザー）を取得する（音声認識固有名詞用） */
export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: users.id, name: users.name, team: users.team }).from(users).orderBy(users.name);
}

/** Googleカレンダー用トークンを保存する */
export async function updateUserGoogleTokens(
  userId: number,
  accessToken: string,
  refreshToken: string | null,
  expiryMs: number
) {
  const db = await getDb();
  if (!db) return;
  const updateData: Record<string, unknown> = {
    googleAccessToken: accessToken,
    googleTokenExpiry: expiryMs,
  };
  if (refreshToken) updateData.googleRefreshToken = refreshToken;
  await db.update(users).set(updateData as any).where(eq(users.id, userId));
}

// ========== スケジュールスクリーンショット ==========

export async function getAllScreenshots() {
  const db = await getDb();
  if (!db) return [];
  // imageDataは除外（Base64データは大きすぎるためレスポンスに含めない）
  return db.select({
    id: scheduleScreenshots.id,
    team: scheduleScreenshots.team,
    day: scheduleScreenshots.day,
    imageUrl: scheduleScreenshots.imageUrl,
    imageKey: scheduleScreenshots.imageKey,
    uploadedBy: scheduleScreenshots.uploadedBy,
    uploadedByName: scheduleScreenshots.uploadedByName,
    createdAt: scheduleScreenshots.createdAt,
    updatedAt: scheduleScreenshots.updatedAt,
  }).from(scheduleScreenshots);
}

export async function getScreenshot(team: string, day: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(scheduleScreenshots)
    .where(
      and(
        eq(scheduleScreenshots.team, team as any),
        eq(scheduleScreenshots.day, day as any)
      )
    )
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function upsertScreenshot(data: InsertScheduleScreenshot) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 既存レコードを確認
  const existing = await getScreenshot(data.team, data.day);
  if (existing) {
    // 更新
    await db
      .update(scheduleScreenshots)
      .set({
        imageUrl: data.imageUrl,
        imageKey: data.imageKey,
        imageData: data.imageData ?? null,
        uploadedBy: data.uploadedBy,
        uploadedByName: data.uploadedByName,
        updatedAt: new Date(),
      })
      .where(eq(scheduleScreenshots.id, existing.id));
    return existing.id;
  } else {
    // 新規挿入
    const result = await db.insert(scheduleScreenshots).values(data);
    return (result as any)[0]?.insertId ?? 0;
  }
}

export async function deleteScreenshot(team: string, day: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(scheduleScreenshots)
    .where(
      and(
        eq(scheduleScreenshots.team, team as any),
        eq(scheduleScreenshots.day, day as any)
      )
    );
}

export async function updateScreenshotUrl(id: number, imageUrl: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(scheduleScreenshots)
    .set({ imageUrl })
    .where(eq(scheduleScreenshots.id, id));
}

export async function deleteAllTodayScreenshots() {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(scheduleScreenshots)
    .where(eq(scheduleScreenshots.day, "今日"));
}

export async function moveTomorrowToToday() {
  const db = await getDb();
  if (!db) return;
  // 「明日」を「今日」に更新
  await db
    .update(scheduleScreenshots)
    .set({ day: "今日", updatedAt: new Date() })
    .where(eq(scheduleScreenshots.day, "明日"));
}

// ========== マイリンク ==========

export async function getMyLinks(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(myLinks)
    .where(eq(myLinks.userId, userId))
    .orderBy(myLinks.sortOrder, myLinks.createdAt);
}

export async function createMyLink(data: InsertMyLink) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(myLinks).values(data);
  return (result as any)[0]?.insertId ?? 0;
}

export async function updateMyLink(id: number, userId: number, data: Partial<Pick<InsertMyLink, "label" | "url" | "emoji" | "description" | "sortOrder">>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(myLinks)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(myLinks.id, id), eq(myLinks.userId, userId)));
}

export async function deleteMyLink(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(myLinks)
    .where(and(eq(myLinks.id, id), eq(myLinks.userId, userId)));
}

// ========== スプレッドシートURL月次管理 ==========

/** 指定年月（YYYY-MM）のリンク一覧を取得 */
export async function getSpreadsheetLinks(yearMonth: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(spreadsheetLinks)
    .where(eq(spreadsheetLinks.yearMonth, yearMonth))
    .orderBy(spreadsheetLinks.id);
}

/** 全年月のリンク一覧を取得（管理画面用） */
export async function getAllSpreadsheetLinks() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(spreadsheetLinks)
    .orderBy(spreadsheetLinks.yearMonth, spreadsheetLinks.id);
}

/** リンクを登録または更新（同じlinkKey+yearMonthがあれば上書き） */
export async function upsertSpreadsheetLink(data: InsertSpreadsheetLink) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // 同じlinkKey+yearMonthがあれば更新
  const existing = await db
    .select()
    .from(spreadsheetLinks)
    .where(
      and(
        eq(spreadsheetLinks.linkKey, data.linkKey),
        eq(spreadsheetLinks.yearMonth, data.yearMonth)
      )
    )
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(spreadsheetLinks)
      .set({ url: data.url, label: data.label, color: data.color, displayTarget: data.displayTarget ?? "common", updatedAt: new Date() })
      .where(eq(spreadsheetLinks.id, existing[0].id));
    return existing[0].id;
  } else {
    const result = await db.insert(spreadsheetLinks).values(data);
    return (result as any)[0]?.insertId ?? 0;
  }
}

/** リンクを削除 */
export async function deleteSpreadsheetLink(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(spreadsheetLinks).where(eq(spreadsheetLinks.id, id));
}

// ========== タスク ==========

/**
 * 全タスクを取得する（フロントエンドでフィルタリング）
 * 全職員が全チームのタスクを閲覧できるようにするため、
 * サーバー側では全件取得し、フロントエンドでチームフィルターを適用する
 */
export async function getMyTasks(userId: number, userTeam: string | null) {
  const db = await getDb();
  if (!db) return [];

  // 全タスクを取得（フロントエンドでチームフィルタリング）、ソフトデリート済みを除外
  const { isNull } = await import("drizzle-orm");
  return db.select().from(tasks).where(isNull(tasks.deletedAt)).orderBy(desc(tasks.createdAt));
}

/** 全タスクを取得（管理者用）、ソフトデリート済みを除外 */
export async function getAllTasks() {
  const db = await getDb();
  if (!db) return [];
  const { isNull } = await import("drizzle-orm");
  return db.select().from(tasks).where(isNull(tasks.deletedAt)).orderBy(desc(tasks.createdAt));
}

/** タスクを作成する */
export async function createTask(data: InsertTask) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(tasks).values(data);
  return (result as any)[0]?.insertId ?? 0;
}

/** 繰り返しタスクの次回期日を計算する */
function calcNextDueDate(repeatType: "weekly" | "monthly", repeatDayOfWeek: number | null, repeatDayOfMonth: number | null): Date {
  const now = new Date();
  if (repeatType === "weekly" && repeatDayOfWeek !== null) {
    const today = now.getDay();
    let daysUntil = repeatDayOfWeek - today;
    if (daysUntil <= 0) daysUntil += 7;
    const next = new Date(now);
    next.setDate(now.getDate() + daysUntil);
    next.setHours(0, 0, 0, 0);
    return next;
  }
  if (repeatType === "monthly" && repeatDayOfMonth !== null) {
    const next = new Date(now.getFullYear(), now.getMonth() + 1, repeatDayOfMonth, 0, 0, 0, 0);
    return next;
  }
  return now;
}

/** タスクの完了状態を切り替える（繰り返し設定があれば次回タスクを自動生成） */
export async function toggleTask(id: number, done: boolean, completedBy?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(tasks)
    .set({
      done: done ? 1 : 0,
      completedBy: done ? completedBy : null,
      completedAt: done ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, id));

  // 完了時に繰り返し設定があれば次回タスクを自動生成
  if (done) {
    const task = await getTaskById(id);
    if (task && task.repeatType && task.repeatType !== "none") {
      // 同じ繰り返し設定で未完了の次回タスクがすでに存在する場合は生成しない
      const existing = await db.select().from(tasks)
        .where(and(eq(tasks.repeatParentId, id), eq(tasks.done, 0)))
        .limit(1);
      if (existing.length === 0) {
        const nextDue = calcNextDueDate(
          task.repeatType as "weekly" | "monthly",
          task.repeatDayOfWeek ?? null,
          task.repeatDayOfMonth ?? null
        );
        await db.insert(tasks).values({
          text: task.text,
          done: 0,
          dueDate: nextDue,
          createdBy: task.createdBy,
          createdByName: task.createdByName,
          assignType: task.assignType,
          assignTeam: task.assignTeam ?? undefined,
          assignUserId: task.assignUserId ?? undefined,
          assignUserName: task.assignUserName ?? undefined,
          repeatType: task.repeatType,
          repeatDayOfWeek: task.repeatDayOfWeek ?? undefined,
          repeatDayOfMonth: task.repeatDayOfMonth ?? undefined,
          repeatParentId: id,
        });
      }
    }
  }
}

/** タスクをソフトデリートする（作成者のみ） */
export async function softDeleteTask(id: number, deletedBy: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(tasks)
    .set({ deletedAt: new Date(), deletedBy, updatedAt: new Date() })
    .where(and(eq(tasks.id, id), eq(tasks.createdBy, deletedBy)));
}

/** タスクを完全削除する（作成者のみ） */
export async function deleteTask(id: number, createdBy: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.createdBy, createdBy)));
}

/** 削除済みタスクを復元する（作成者のみ） */
export async function restoreTask(id: number, restoredBy: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(tasks)
    .set({ deletedAt: null, deletedBy: null, updatedAt: new Date() })
    .where(and(eq(tasks.id, id), eq(tasks.createdBy, restoredBy)));
}

/** 削除済みタスク一覧を取得する（自分が作成したもの） */
export async function getDeletedTasks(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const { isNotNull } = await import("drizzle-orm");
  return db
    .select()
    .from(tasks)
    .where(and(isNotNull(tasks.deletedAt), eq(tasks.createdBy, userId)))
    .orderBy(desc(tasks.deletedAt));
}

/** タスクを更新する（作成者のみ） */
export async function updateTask(
  id: number,
  createdBy: number,
  data: {
    text?: string;
    dueDate?: Date | null;
    assignType?: "all" | "team" | "personal";
    assignTeam?: "身体" | "天理" | "郡山北部" | "郡山南部" | null;
    assignUserId?: number | null;
    assignUserName?: string | null;
    patientName?: string | null;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(tasks)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(tasks.id, id), eq(tasks.createdBy, createdBy)));
}

/** タスクを取得する（ID指定） */
export async function getTaskById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ========== メッセージ ==========



/**
 * 現在表示すべきメッセージ一覧を取得する
 * 条件:
 *   - deletedAt IS NULL（手動削除されていない）
 *   - scheduledAt IS NULL OR scheduledAt <= now（予約送信済み or 即時）
 *   - displayFrom IS NULL OR displayFrom <= now（表示開始済み）
 *   - displayUntil IS NULL OR displayUntil > now（表示期限内）
 */
export async function getActiveMessages() {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  return db
    .select()
    .from(messages)
    .where(
      and(
        isNull(messages.deletedAt),
        or(isNull(messages.scheduledAt), lte(messages.scheduledAt, now)),
        or(isNull(messages.displayFrom), lte(messages.displayFrom, now)),
        or(isNull(messages.displayUntil), gte(messages.displayUntil, now))
      )
    )
    .orderBy(desc(messages.createdAt));
}

/**
 * 予約送信待ちのメッセージ一覧を取得する
 * 条件:
 *   - deletedAt IS NULL
 *   - scheduledAt IS NOT NULL AND scheduledAt > now（まだ送信されていない）
 */
export async function getPendingMessages() {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  return db
    .select()
    .from(messages)
    .where(
      and(
        isNull(messages.deletedAt),
        isNotNull(messages.scheduledAt),
        gt(messages.scheduledAt, now)
      )
    )
    .orderBy(messages.scheduledAt);
}

/** メッセージを作成する */
export async function createMessage(data: InsertMessage) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(messages).values(data);
  return (result as any)[0]?.insertId ?? 0;
}

/** メッセージを手動削除する（作成者のみ） */
export async function softDeleteMessage(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(messages)
    .set({ deletedAt: new Date() })
    .where(and(eq(messages.id, id), eq(messages.createdBy, userId)));
}

/** 期限切れメッセージを自動削除（論理削除）する */
export async function expireMessages() {
  const db = await getDb();
  if (!db) return 0;
  const now = new Date();
  const result = await db
    .update(messages)
    .set({ deletedAt: now })
    .where(
      and(
        isNull(messages.deletedAt),
        lt(messages.displayUntil, now)
      )
    );
  return (result as any)[0]?.affectedRows ?? 0;
}

/** メッセージIDで取得する */
export async function getMessageById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ========== メッセージリアクション ==========

/** 指定メッセージのリアクション一覧を取得する */
export async function getReactionsByMessageId(messageId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(messageReactions)
    .where(eq(messageReactions.messageId, messageId));
}

/** 複数メッセージのリアクションを一括取得する */
export async function getReactionsByMessageIds(messageIds: number[]) {
  if (messageIds.length === 0) return [];
  const db = await getDb();
  if (!db) return [];
  const { inArray } = await import("drizzle-orm");
  return db
    .select()
    .from(messageReactions)
    .where(inArray(messageReactions.messageId, messageIds));
}

/** リアクションをトグルする（同じユーザー・同じ絵文字なら削除、なければ追加） */
export async function toggleReaction(messageId: number, userId: number, userName: string, emoji: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db
    .select()
    .from(messageReactions)
    .where(
      and(
        eq(messageReactions.messageId, messageId),
        eq(messageReactions.userId, userId),
        eq(messageReactions.emoji, emoji)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    // 削除（トグルオフ）
    await db.delete(messageReactions).where(eq(messageReactions.id, existing[0].id));
    return { action: "removed" as const };
  } else {
    // 追加（トグルオン）
    await db.insert(messageReactions).values({ messageId, userId, userName, emoji });
    return { action: "added" as const };
  }
}

// ========== タスクリマインダー ==========

/**
 * 今日が期日の未完了タスクをすべて取得する（リマインダー通知用）
 * - dueDate が今日の00:00:00 〜 23:59:59（JST）の範囲
 * - done = 0（未完了）
 */
export async function getTodayDueTasks() {
  const db = await getDb();
  if (!db) return [];

  // JSTの今日の開始・終了をUTCに変換（JST = UTC+9）
  const nowUtc = new Date();
  const jstOffsetMs = 9 * 60 * 60 * 1000;
  const jstNow = new Date(nowUtc.getTime() + jstOffsetMs);

  // JSTの今日の0:00と23:59:59をUTCに変換
  const jstTodayStart = new Date(
    Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate(), 0, 0, 0)
  );
  const jstTodayEnd = new Date(
    Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate(), 23, 59, 59)
  );
  // UTCに戻す（JSTオフセット分を引く）
  const utcStart = new Date(jstTodayStart.getTime() - jstOffsetMs);
  const utcEnd = new Date(jstTodayEnd.getTime() - jstOffsetMs);

  return db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.done, 0),
        gte(tasks.dueDate, utcStart),
        lte(tasks.dueDate, utcEnd)
      )
    )
    .orderBy(tasks.dueDate);
}

// ========== 利用者（患者）管理 ==========

/** 全利用者を取得する（退所済も含む） */
export async function getAllPatientsIncludingInactive(team?: string) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (team) {
    conditions.push(eq(patients.team, team as any));
  }
  return db
    .select()
    .from(patients)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(patients.team, patients.name);
}

/** 全利用者を取得する（有効なもののみ） */
export async function getPatients(team?: string) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(patients.active, 1)];
  if (team) {
    conditions.push(eq(patients.team, team as any));
  }
  return db
    .select()
    .from(patients)
    .where(and(...conditions))
    .orderBy(patients.team, patients.name);
}

/** 利用者を名前で検索する */
export async function searchPatients(query: string, team?: string) {
  const db = await getDb();
  if (!db) return [];
  const { like } = await import("drizzle-orm");
  const conditions: any[] = [eq(patients.active, 1)];
  if (team) conditions.push(eq(patients.team, team as any));
  if (query) {
    conditions.push(
      or(
        like(patients.name, `%${query}%`),
        like(patients.nameKana, `%${query}%`)
      )
    );
  }
  return db
    .select()
    .from(patients)
    .where(and(...conditions))
    .orderBy(patients.team, patients.name)
    .limit(20);
}

/** 利用者を追加する */
export async function createPatient(data: InsertPatient) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(patients).values(data);
  return (result as any)[0]?.insertId ?? 0;
}

/** 利用者を一括登録する */
export async function batchCreatePatients(data: Array<{ name: string; team: string; nameKana?: string; active?: number }>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.length === 0) return 0;
  await db.insert(patients).values(
    data.map((d) => ({
      name: d.name,
      team: d.team as any,
      nameKana: d.nameKana ?? null,
      active: d.active ?? 1,
    }))
  );
  return data.length;
}

/** 利用者を更新する */
export async function updatePatient(id: number, data: Partial<Pick<InsertPatient, "name" | "nameKana" | "team" | "active">>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(patients).set({ ...data, updatedAt: new Date() }).where(eq(patients.id, id));
}

/** 利用者を削除する（論理削除） */
export async function deactivatePatient(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(patients).set({ active: 0, updatedAt: new Date() }).where(eq(patients.id, id));
}

// ========== 訪問記録 ==========

/** 訪問記録を作成する */
export async function createVisitRecord(data: InsertVisitRecord) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(visitRecords).values(data);
  return (result as any)[0]?.insertId ?? 0;
}

/** 訪問記録一覧を取得する */
export async function getVisitRecords(userId?: number, patientId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (userId) conditions.push(eq(visitRecords.createdBy, userId));
  if (patientId) conditions.push(eq(visitRecords.patientId, patientId));
  return db
    .select()
    .from(visitRecords)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(visitRecords.createdAt))
    .limit(50);
}

/** 訪問記録をIDで取得する */
export async function getVisitRecordById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(visitRecords).where(eq(visitRecords.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/** スプレッドシート転送済みフラグを更新する */
export async function markVisitRecordExported(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(visitRecords).set({ exportedAt: new Date() }).where(eq(visitRecords.id, id));
}

/** スプレッドシート転送済みフラグをリセットする（未転送に戻す） */
export async function unmarkVisitRecordExported(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(visitRecords).set({ exportedAt: null }).where(eq(visitRecords.id, id));
}

// ========== アプリ内通知 ==========

/** 通知を作成する */
export async function createNotification(data: Omit<InsertAppNotification, "id" | "isRead" | "readAt" | "createdAt">) {
  const db = await getDb();
  if (!db) return;
  await db.insert(appNotifications).values({ ...data, isRead: 0 });
}

/** 未読通知一覧を取得する（新しい順・対象ユーザーまたは全員対象） */
export async function getUnreadNotifications(userId?: number) {
  const db = await getDb();
  if (!db) return [];
  const whereClause = userId
    ? and(
        eq(appNotifications.isRead, 0),
        or(
          isNull(appNotifications.targetUserId),
          eq(appNotifications.targetUserId, userId)
        )
      )
    : eq(appNotifications.isRead, 0);
  return db
    .select()
    .from(appNotifications)
    .where(whereClause)
    .orderBy(desc(appNotifications.createdAt))
    .limit(50);
}
/** 通知一覧を取得する（新しい順、最新100件・対象ユーザーまたは全員対象） */
export async function getAllNotifications(userId?: number) {
  const db = await getDb();
  if (!db) return [];
  const whereClause = userId
    ? or(
        isNull(appNotifications.targetUserId),
        eq(appNotifications.targetUserId, userId)
      )
    : undefined;
  if (whereClause) {
    return db
      .select()
      .from(appNotifications)
      .where(whereClause)
      .orderBy(desc(appNotifications.createdAt))
      .limit(100);
  }
  return db
    .select()
    .from(appNotifications)
    .orderBy(desc(appNotifications.createdAt))
    .limit(100);
}

/** 指定通知を既読にする */
export async function markNotificationRead(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(appNotifications).set({ isRead: 1, readAt: new Date() }).where(eq(appNotifications.id, id));
}

/** 全通知を既読にする */
export async function markAllNotificationsRead() {
  const db = await getDb();
  if (!db) return;
  await db.update(appNotifications).set({ isRead: 1, readAt: new Date() }).where(eq(appNotifications.isRead, 0));
}

/** 同じリソースの通知がすでに存在するか確認（重複防止） */
export async function notificationExists(type: InsertAppNotification["type"], resourceId: number) {
  const db = await getDb();
  if (!db) return false;
  const { and } = await import("drizzle-orm");
  const result = await db
    .select({ id: appNotifications.id })
    .from(appNotifications)
    .where(and(eq(appNotifications.type, type), eq(appNotifications.resourceId, resourceId)))
    .limit(1);
  return result.length > 0;
}

/** 不要な古い通知を削除（30日以上削除） */
export async function cleanupOldNotifications() {
  const db = await getDb();
  if (!db) return;
  const { lt } = await import("drizzle-orm");
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  await db.delete(appNotifications).where(lt(appNotifications.createdAt, thirtyDaysAgo));
}

// ========== スタッフアカウント管理 ==========

/** 全スタッフ一覧を取得する（管理者用） */
export async function getAllStaff() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      team: users.team,
      createdAt: users.createdAt,
      lastSignedIn: users.lastSignedIn,
      teamSetupDone: users.teamSetupDone,
    })
    .from(users)
    .orderBy(users.createdAt);
}

/** スタッフアカウントを新規作成する */
export async function createStaffAccount(data: {
  name: string;
  email: string;
  passwordHash: string;
  role: "user" | "admin";
  team: "身体" | "天理" | "郡山北部" | "郡山南部" | "事務員" | "全チーム";
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // メールアドレスの重複チェック
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, data.email)).limit(1);
  if (existing.length > 0) {
    throw new Error("このメールアドレスはすでに使用されています");
  }
  const openId = `local-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
  await db.insert(users).values({
    openId,
    name: data.name,
    email: data.email,
    passwordHash: data.passwordHash,
    role: data.role,
    team: data.team,
    teamSetupDone: 1,
    loginMethod: "local",
    lastSignedIn: new Date(),
  });
  return { success: true };
}

/** 職員を一括登録する（メール重複はスキップ） */
export async function batchCreateStaff(data: Array<{ name: string; email: string; password: string; team: string; role: "admin" | "user" }>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const bcrypt = await import("bcryptjs");
  let count = 0;
  let skipped = 0;
  for (const d of data) {
    // メール重複チェック
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, d.email)).limit(1);
    if (existing.length > 0) { skipped++; continue; }
    const passwordHash = await bcrypt.hash(d.password, 10);
    const openId = `local-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    await db.insert(users).values({
      openId,
      name: d.name,
      email: d.email,
      passwordHash,
      role: d.role,
      team: d.team as any,
      teamSetupDone: 1,
      loginMethod: "local",
      lastSignedIn: new Date(),
    });
    count++;
  }
  return { count, skipped };
}

/** スタッフのパスワードをリセットする（管理者用） */
export async function resetStaffPassword(userId: number, newPasswordHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ passwordHash: newPasswordHash }).where(eq(users.id, userId));
}

/** スタッフアカウントを削除する（管理者用） */
export async function deleteStaffAccount(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(users).where(eq(users.id, userId));
}

/** スタッフのロールを変更する（管理者用） */
export async function updateStaffRole(userId: number, role: "user" | "admin") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

/** スタッフの基本情報を一括更新する（管理者用） */
export async function updateStaffInfo(userId: number, data: {
  name: string;
  team: "\u8eab\u4f53" | "\u5929\u7406" | "\u90e1\u5c71\u5317\u90e8" | "\u90e1\u5c71\u5357\u90e8" | "\u4e8b\u52d9\u54e1" | "\u5168\u30c1\u30fc\u30e0";
  role: "user" | "admin";
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({
    name: data.name,
    team: data.team,
    role: data.role,
    teamSetupDone: 1,
  }).where(eq(users.id, userId));
}

export async function getScreenshotById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(scheduleScreenshots)
    .where(eq(scheduleScreenshots.id, id))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ========== スクリーンショットアップロード履歴 ==========

/** アップロード履歴を記録する */
export async function createScreenshotUploadLog(data: InsertScreenshotUploadLog): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(screenshotUploadLogs).values(data);
}

/** 最新N件のアップロード履歴を取得する */
export async function getRecentScreenshotUploadLogs(limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(screenshotUploadLogs)
    .orderBy(desc(screenshotUploadLogs.createdAt))
    .limit(limit);
}

/** メッセージを編集する（作成者のみ） */
export async function updateMessage(
  id: number,
  userId: number,
  data: {
    text: string;
    displayFrom?: Date | null;
    displayUntil?: Date | null;
    scheduledAt?: Date | null;
  }
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(messages)
    .set({
      text: data.text,
      displayFrom: data.displayFrom ?? null,
      displayUntil: data.displayUntil ?? null,
      scheduledAt: data.scheduledAt ?? null,
    })
    .where(and(eq(messages.id, id), eq(messages.createdBy, userId)));
}

// ========== アプリ設定 ==========

/** 設定値を取得（存在しない場合はdefaultValueを返す） */
export async function getSetting(key: string, defaultValue: string): Promise<string> {
  const db = await getDb();
  if (!db) return defaultValue;
  const result = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return result.length > 0 ? result[0].value : defaultValue;
}

/** 設定値を保存（存在すれば更新、なければ挿入） */
export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(appSettings).values({ key, value }).onDuplicateKeyUpdate({ set: { value } });
}

/** スタッフのメールアドレスを更新する（管理者用） */
export async function updateStaffEmail(userId: number, email: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // メールアドレスの重複チェック（自分以外）
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, email), sql`${users.id} != ${userId}`))
    .limit(1);
  if (existing.length > 0) {
    throw new Error("このメールアドレスはすでに使用されています");
  }
  await db.update(users).set({ email }).where(eq(users.id, userId));
}

// ========== スケジュールコメント ==========

/** 指定チーム・日のコメント一覧を取得（新しい順） */
export async function getScheduleComments(team: string, day: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(scheduleComments)
    .where(
      and(
        eq(scheduleComments.team, team as any),
        eq(scheduleComments.day, day as any)
      )
    )
    .orderBy(desc(scheduleComments.createdAt));
}

/** コメントを投稿する */
export async function addScheduleComment(data: InsertScheduleComment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // dateが未設定の場合はJSTの今日の日付を自動セット
  if (!data.date) {
    const now = new Date();
    const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    data.date = jst.toISOString().slice(0, 10);
  }
  const result = await db.insert(scheduleComments).values(data);
  return (result as any)[0]?.insertId ?? 0;
}

/** 指定日付の「今日」コメントを全チーム取得する（スプレッドシート転記用） */
export async function getCommentsByDate(date: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(scheduleComments)
    .where(eq(scheduleComments.date, date))
    .orderBy(scheduleComments.team, scheduleComments.createdAt);
}

/** 指定日付のコメントを全て削除する（ローテーション後の転記済みコメント削除用） */
export async function deleteCommentsByDate(date: string) {
  const db = await getDb();
  if (!db) return;
  // まずリアクションを削除
  const comments = await getCommentsByDate(date);
  for (const c of comments) {
    await db.delete(scheduleCommentReactions).where(eq(scheduleCommentReactions.commentId, c.id));
  }
  await db.delete(scheduleComments).where(eq(scheduleComments.date, date));
}

/** コメントを削除する（全スタッフ可） */
export async function deleteScheduleComment(id: number, _userId: number) {
  const db = await getDb();
  if (!db) return;
  // リアクションも先に削除
  await db.delete(scheduleCommentReactions).where(eq(scheduleCommentReactions.commentId, id));
  await db.delete(scheduleComments).where(eq(scheduleComments.id, id));
}

/** コメントを編集する（全スタッフ可） */
export async function updateScheduleComment(id: number, _userId: number, content: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(scheduleComments)
    .set({ content })
    .where(eq(scheduleComments.id, id));
}

/** コメントへのリアクションをトグルする（同じ絵文字を再度押すと削除） */
export async function toggleScheduleCommentReaction(commentId: number, userId: number, userName: string, emoji: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // 既存のリアクションを確認
  const existing = await db
    .select()
    .from(scheduleCommentReactions)
    .where(
      and(
        eq(scheduleCommentReactions.commentId, commentId),
        eq(scheduleCommentReactions.userId, userId),
        eq(scheduleCommentReactions.emoji, emoji)
      )
    )
    .limit(1);
  if (existing.length > 0) {
    // 既にリアクション済み → 削除（トグルオフ）
    await db.delete(scheduleCommentReactions).where(eq(scheduleCommentReactions.id, existing[0].id));
    return { action: "removed" as const };
  } else {
    // 未リアクション → 追加
    await db.insert(scheduleCommentReactions).values({ commentId, userId, userName, emoji });
    return { action: "added" as const };
  }
}

/** コメントのリアクション一覧を取得する */
export async function getScheduleCommentReactions(commentIds: number[]) {
  const db = await getDb();
  if (!db || commentIds.length === 0) return [];
  const { inArray } = await import("drizzle-orm");
  return db
    .select()
    .from(scheduleCommentReactions)
    .where(inArray(scheduleCommentReactions.commentId, commentIds));
}

/** 今日・明日のコメント件数を全チームまとめて取得する */
export async function getScheduleCommentCounts(day: string) {
  const db = await getDb();
  if (!db) return [] as { team: string; count: number }[];
  const { count } = await import("drizzle-orm");
  const rows = await db
    .select({ team: scheduleComments.team, count: count() })
    .from(scheduleComments)
    .where(eq(scheduleComments.day, day as any))
    .groupBy(scheduleComments.team);
  return rows.map((r) => ({ team: r.team, count: Number(r.count) }));
}

// ========== スケジュール変更連絡 ==========

/** スケジュール変更連絡を作成する */
export async function createScheduleChange(data: InsertScheduleChange) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(scheduleChanges).values(data);
  return (result as any)[0]?.insertId ?? 0;
}

/** スケジュール変更連絡一覧を取得する（新しい順） */
export async function getScheduleChanges(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(scheduleChanges)
    .orderBy(desc(scheduleChanges.createdAt))
    .limit(limit);
}

/** スケジュール変更連絡をIDで取得する */
export async function getScheduleChangeById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(scheduleChanges)
    .where(eq(scheduleChanges.id, id))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/** スプレッドシート転記済みフラグを立てる */
export async function markScheduleChangeExported(id: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(scheduleChanges)
    .set({ exported: 1 })
    .where(eq(scheduleChanges.id, id));
}

// ========== クイックアクセスリンク ==========

/** 全クイックアクセスリンクをカテゴリ・順序で取得 */
export async function getAllQuickAccessLinks() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(quickAccessLinks)
    .orderBy(quickAccessLinks.category, quickAccessLinks.sortOrder, quickAccessLinks.id);
}

/** クイックアクセスリンクを作成 */
export async function createQuickAccessLink(data: InsertQuickAccessLink) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(quickAccessLinks).values(data);
  return (result as any)[0]?.insertId ?? 0;
}

/** クイックアクセスリンクを更新 */
export async function updateQuickAccessLink(
  id: number,
  data: Partial<Pick<InsertQuickAccessLink, "category" | "label" | "href" | "color" | "sortOrder">>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(quickAccessLinks)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(quickAccessLinks.id, id));
}

/** クイックアクセスリンクを削除 */
export async function deleteQuickAccessLink(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(quickAccessLinks).where(eq(quickAccessLinks.id, id));
}

// ============================================================
// 音声認識フィードバック
// ============================================================
/** 音声認識誤変換フィードバックをDBに保存 */
export async function saveVoiceFeedback(data: {
  wrongText: string;
  correctedText: string;
  context: string;
  reportedBy?: number;
  reportedByName?: string;
}) {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(voiceFeedback).values({
      originalText: data.wrongText,
      wrongValue: data.wrongText,
      correctValue: data.correctedText,
      wrongField: data.context,
      reportedBy: data.reportedBy ?? 0,
      reportedByName: data.reportedByName ?? "不明",
    });
  } catch (e) {
    console.warn("[saveVoiceFeedback] failed:", e);
  }
}

/** 最近の音声認識フィードバックを取得（Geminiプロンプト強化用） */
export async function getRecentVoiceFeedbacks(context?: string, limit = 30): Promise<Array<{ wrongValue: string | null; correctValue: string | null; wrongField: string | null }>> {
  const db = await getDb();
  if (!db) return [];
  try {
    const rows = await db
      .select({
        wrongValue: voiceFeedback.wrongValue,
        correctValue: voiceFeedback.correctValue,
        wrongField: voiceFeedback.wrongField,
      })
      .from(voiceFeedback)
      .orderBy(desc(voiceFeedback.createdAt))
      .limit(limit);
    if (context) {
      return rows.filter(r => r.wrongField === context);
    }
    return rows;
  } catch (e) {
    console.warn("[getRecentVoiceFeedbacks] failed:", e);
    return [];
  }
}

// ========== チーム目標 ==========

/** 今日有効なチーム目標を取得（期間指定なし＋今日が期間内のもの） */
export async function getActiveTeamGoals(todayStr: string): Promise<typeof teamGoals.$inferSelect[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    const rows = await db
      .select()
      .from(teamGoals)
      .orderBy(teamGoals.team, teamGoals.createdAt);
    // 期間フィルタ（JS側で処理）
    // DBのdate型はDateオブジェクトまたはISO文字列で返る可能性があるため両方対応
    const toYMD = (val: unknown): string | null => {
      if (!val) return null;
      if (val instanceof Date) {
        // JSTオフセットを加算してUTCのYYYY-MM-DDとして取得
        const jst = new Date(val.getTime() + 9 * 60 * 60 * 1000);
        return jst.toISOString().slice(0, 10);
      }
      const s = String(val);
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
      const d = new Date(s);
      if (!isNaN(d.getTime())) {
        const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
        return jst.toISOString().slice(0, 10);
      }
      return null;
    };
    return rows.filter(g => {
      const start = toYMD(g.startDate);
      const end = toYMD(g.endDate);
      if (start && todayStr < start) return false;
      if (end && todayStr > end) return false;
      return true;
    });
  } catch (e) {
    console.warn("[getActiveTeamGoals] failed:", e);
    return [];
  }
}

/** 全チーム目標を取得（管理画面用） */
export async function getAllTeamGoals(): Promise<typeof teamGoals.$inferSelect[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(teamGoals).orderBy(teamGoals.team, teamGoals.createdAt);
  } catch (e) {
    console.warn("[getAllTeamGoals] failed:", e);
    return [];
  }
}

/** チーム目標を作成する */
export async function createTeamGoal(data: {
  team: "身体" | "天理" | "郡山北部" | "郡山南部" | "全チーム";
  title: string;
  body?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  createdBy: number;
  createdByName: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const insertData: InsertTeamGoal = {
    team: data.team,
    title: data.title,
    body: data.body ?? null,
    startDate: data.startDate ? new Date(data.startDate) : null,
    endDate: data.endDate ? new Date(data.endDate) : null,
    createdBy: data.createdBy,
    createdByName: data.createdByName,
  };
  await db.insert(teamGoals).values(insertData);
}

/** チーム目標を更新する */
export async function updateTeamGoal(id: number, data: {
  team?: "身体" | "天理" | "郡山北部" | "郡山南部" | "全チーム";
  title?: string;
  body?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const { eq: eqOp } = await import("drizzle-orm");
  const updateData: Record<string, unknown> = {};
  if (data.team !== undefined) updateData.team = data.team;
  if (data.title !== undefined) updateData.title = data.title;
  if (data.body !== undefined) updateData.body = data.body;
  if (data.startDate !== undefined) updateData.startDate = data.startDate;
  if (data.endDate !== undefined) updateData.endDate = data.endDate;
  await db.update(teamGoals).set(updateData).where(eqOp(teamGoals.id, id));
}

/** チーム目標を削除する */
export async function deleteTeamGoal(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const { eq: eqOp } = await import("drizzle-orm");
  await db.delete(teamGoals).where(eqOp(teamGoals.id, id));
}
