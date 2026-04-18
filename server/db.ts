import { and, eq, or, isNull, isNotNull, desc, lte, gte, gt, lt, sql, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2";
import {
  InsertUser, users,
  scheduleScreenshots, InsertScheduleScreenshot,
  myLinks, InsertMyLink,
  spreadsheetLinks, InsertSpreadsheetLink,
  tasks, InsertTask,
  messages, InsertMessage,
  messageReactions, InsertMessageReaction,
  patients, InsertPatient,
  visitRecords, InsertVisitRecord,
  appNotifications, InsertAppNotification,
  teamGoals, InsertTeamGoal,
  accidentLinks, InsertAccidentLink,
  timesheetSpreadsheets, InsertTimesheetSpreadsheet,
  overtimeApprovals, InsertOvertimeApproval,
  screenshotUploadLogs, InsertScreenshotUploadLog,
  appSettings,
  scheduleComments, InsertScheduleComment,
  scheduleCommentReactions, InsertScheduleCommentReaction,
  scheduleChanges, InsertScheduleChange,
  quickAccessLinks, InsertQuickAccessLink,
  voiceFeedback,
  improvementSuggestions, InsertImprovementSuggestion,
  improvementSpreadsheets, InsertImprovementSpreadsheet,
  personalTasks, PersonalTask,
  visitSlotOrders,
  irregularSchedules, IrregularSchedule, InsertIrregularSchedule,
} from "../drizzle/schema";
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
    scheduleDate: scheduleScreenshots.scheduleDate,
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
        scheduleDate: data.scheduleDate ?? null,
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

/** ゴミ箱内の30日以上経過したタスクを一括完全削除する */
export async function cleanupExpiredDeletedTasks(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  // 30日前のタイムスタンプ
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  // 削除対象のタスクIDを先に取得してカウント
  const targets = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(isNotNull(tasks.deletedAt), lte(tasks.deletedAt, thirtyDaysAgo)));
  if (targets.length === 0) return 0;
  await db
    .delete(tasks)
    .where(and(isNotNull(tasks.deletedAt), lte(tasks.deletedAt, thirtyDaysAgo)));
  return targets.length;
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

/** 利用者を一括登録（同名氏名があれば上書き更新） */
export async function batchCreatePatients(data: Array<{ name: string; team: string; nameKana?: string; active?: number; patientCode?: string }>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.length === 0) return { created: 0, updated: 0 };

  // 既存利用者を氏名で一括取得
  const names = data.map((d) => d.name);
  const existing = await db
    .select({ id: patients.id, name: patients.name })
    .from(patients)
    .where(sql`${patients.name} IN (${sql.join(names.map((n) => sql`${n}`), sql`, `)})`);
  const existingMap = new Map(existing.map((p) => [p.name, p.id]));

  const toInsert = data.filter((d) => !existingMap.has(d.name));
  const toUpdate = data.filter((d) => existingMap.has(d.name));

  // 新規登録
  if (toInsert.length > 0) {
    await db.insert(patients).values(
      toInsert.map((d) => ({
        name: d.name,
        team: d.team as any,
        nameKana: d.nameKana ?? null,
        active: d.active ?? 1,
        patientCode: d.patientCode ?? null,
      }))
    );
  }

  // 上書き更新（名前一致の場合）
  for (const d of toUpdate) {
    const id = existingMap.get(d.name)!;
    await db.update(patients).set({
      team: d.team as any,
      nameKana: d.nameKana ?? null,
      active: d.active ?? 1,
      patientCode: d.patientCode ?? null,
      updatedAt: new Date(),
    }).where(eq(patients.id, id));
  }

  return { created: toInsert.length, updated: toUpdate.length };
}

/** 利用者を更新する */
export async function updatePatient(id: number, data: Partial<Pick<InsertPatient, "name" | "nameKana" | "team" | "active" | "patientCode">>) {
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

/** 当日分の訪問記録を上書きする（同一日・同一利用者・同一記録者の場合は更新、それ以外は新規作成） */
export async function upsertTodayVisitRecord(data: InsertVisitRecord): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // 今日日本時間の開始・終了（UTCに変換）
  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000;
  const jstNow = new Date(now.getTime() + jstOffset);
  const jstDateStr = `${jstNow.getUTCFullYear()}-${String(jstNow.getUTCMonth()+1).padStart(2,'0')}-${String(jstNow.getUTCDate()).padStart(2,'0')}`;
  const todayStartUTC = new Date(new Date(jstDateStr + 'T00:00:00+09:00').getTime());
  const todayEndUTC = new Date(new Date(jstDateStr + 'T23:59:59+09:00').getTime());
  // 同一日・同一利用者・同一記録者のレコードを検索
  const existing = await db
    .select({ id: visitRecords.id })
    .from(visitRecords)
    .where(
      and(
        eq(visitRecords.createdBy, data.createdBy),
        eq(visitRecords.patientName, data.patientName),
        gte(visitRecords.createdAt, todayStartUTC),
        lte(visitRecords.createdAt, todayEndUTC)
      )
    )
    .limit(1);
  if (existing.length > 0) {
    // 当日分があれば更新
    await db.update(visitRecords)
      .set({
        nextVisitAt: data.nextVisitAt,
        notifiedTo: data.notifiedTo,
        notifiedToOther: data.notifiedToOther,
        notifyMethod: data.notifyMethod,
        notifyMethodOther: data.notifyMethodOther,
        exportedAt: null, // 再転送が必要なのでリセット
      })
      .where(eq(visitRecords.id, existing[0].id));
    return existing[0].id;
  } else {
    // 新規作成
    const result = await db.insert(visitRecords).values(data);
    return (result as any)[0]?.insertId ?? 0;
  }
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
      nameKana: users.nameKana,
      email: users.email,
      role: users.role,
      team: users.team,
      numberPlate: users.numberPlate,
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
  numberPlate?: string;
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
    numberPlate: data.numberPlate ?? null,
    teamSetupDone: 1,
    loginMethod: "local",
    lastSignedIn: new Date(),
  });
  return { success: true };
}

/** 職員を一括登録する（メール重複はスキップ） */
export async function batchCreateStaff(data: Array<{ name: string; nameKana?: string; email: string; password: string; team: string; role: "admin" | "user"; numberPlate?: string }>) {
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
      nameKana: d.nameKana ?? null,
      email: d.email,
      passwordHash,
      role: d.role,
      team: d.team as any,
      teamSetupDone: 1,
      loginMethod: "local",
      lastSignedIn: new Date(),
      numberPlate: d.numberPlate ?? "",
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
  nameKana?: string;
  team: "身体" | "天理" | "郡山北部" | "郡山南部" | "事務員" | "全チーム";
  role: "user" | "admin";
  numberPlate?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({
    name: data.name,
    nameKana: data.nameKana !== undefined ? (data.nameKana || null) : undefined,
    team: data.team,
    role: data.role,
    numberPlate: data.numberPlate !== undefined ? (data.numberPlate || null) : undefined,
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

// ============================================================
// 出退勤打刻
// ============================================================
import { attendanceLogs } from "../drizzle/schema";
import type { AttendanceLog } from "../drizzle/schema";

/** 出勤または退勤を打刻する */
export async function clockAttendance(data: {
  type: "clock_in" | "clock_out";
  userId: number;
  userName: string;
  clockedAt: number;
  emergencyNote?: string | null;
}): Promise<AttendanceLog> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(attendanceLogs).values(data);
  const insertId = (result as { insertId: number }).insertId;
  const [row] = await db.select().from(attendanceLogs).where((await import("drizzle-orm")).eq(attendanceLogs.id, insertId));
  return row;
}

/** 今日の自分の打刻履歴を取得する */
export async function getTodayAttendance(userId: number): Promise<AttendanceLog[]> {
  const db = await getDb();
  if (!db) return [];
  const { and, gte, lte, eq: eqOp } = await import("drizzle-orm");
  // 今日のJST 0:00〜23:59をUTCミリ秒で計算
  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000;
  const jstNow = new Date(now.getTime() + jstOffset);
  const jstMidnight = new Date(jstNow.getFullYear(), jstNow.getMonth(), jstNow.getDate());
  const startMs = jstMidnight.getTime() - jstOffset;
  const endMs = startMs + 24 * 60 * 60 * 1000 - 1;
  return db.select().from(attendanceLogs)
    .where(and(eqOp(attendanceLogs.userId, userId), gte(attendanceLogs.clockedAt, startMs), lte(attendanceLogs.clockedAt, endMs)))
    .orderBy(attendanceLogs.clockedAt);
}

/** 前日（JST）の出退勤ログを取得する（日付をまたいだ退勤検出用） */
export async function getYesterdayAttendance(userId: number): Promise<AttendanceLog[]> {
  const db = await getDb();
  if (!db) return [];
  const { and, gte, lte, eq: eqOp } = await import("drizzle-orm");
  // 前日のJST 0:00〜23:59をUTCミリ秒で計算
  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000;
  const jstNow = new Date(now.getTime() + jstOffset);
  const jstYesterday = new Date(jstNow.getFullYear(), jstNow.getMonth(), jstNow.getDate() - 1);
  const startMs = jstYesterday.getTime() - jstOffset;
  const endMs = startMs + 24 * 60 * 60 * 1000 - 1;
  return db.select().from(attendanceLogs)
    .where(and(eqOp(attendanceLogs.userId, userId), gte(attendanceLogs.clockedAt, startMs), lte(attendanceLogs.clockedAt, endMs)))
    .orderBy(attendanceLogs.clockedAt);
}

// ============================================================
// AI共有プロンプト
// ============================================================
import { sharedPrompts } from "../drizzle/schema";
import type { SharedPrompt } from "../drizzle/schema";

/** 全プロンプト一覧（削除済み除く）を取得する */
export async function getSharedPrompts(): Promise<SharedPrompt[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(sharedPrompts)
    .where(eq(sharedPrompts.isDeleted, 0))
    .orderBy(desc(sharedPrompts.createdAt));
}

/** プロンプトを新規作成する */
export async function createSharedPrompt(data: {
  title: string;
  body: string;
  aiTool: string;
  category?: string;
  usageNotes?: string;
  createdBy: number;
  createdByName: string;
}): Promise<SharedPrompt> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(sharedPrompts).values({
    title: data.title,
    body: data.body,
    aiTool: data.aiTool,
    category: data.category ?? null,
    usageNotes: data.usageNotes ?? null,
    createdBy: data.createdBy,
    createdByName: data.createdByName,
    isDeleted: 0,
  });
  const insertId = (result as any)[0]?.insertId;
  const [row] = await db
    .select()
    .from(sharedPrompts)
    .where(eq(sharedPrompts.id, insertId));
  return row;
}

/** プロンプトを更新する */
export async function updateSharedPrompt(
  id: number,
  data: {
    title: string;
    body: string;
    aiTool: string;
    category?: string;
    usageNotes?: string;
    updatedByName: string;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(sharedPrompts)
    .set({
      title: data.title,
      body: data.body,
      aiTool: data.aiTool,
      category: data.category ?? null,
      usageNotes: data.usageNotes ?? null,
      updatedByName: data.updatedByName,
    })
    .where(eq(sharedPrompts.id, id));
}

/** プロンプトを論理削除する */
export async function deleteSharedPrompt(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(sharedPrompts)
    .set({ isDeleted: 1 })
    .where(eq(sharedPrompts.id, id));
}

// ─── スケジュールローテーション ───────────────────────────────────────────────
/** 毎日深夜に実行: 今日→削除、明日→今日、2日後→明日、3日後→2日後、4日後→3日後 */
export async function rotateScheduleDays(): Promise<{ deleted: number; shifted: number }> {
  const db = await getDb();
  if (!db) return { deleted: 0, shifted: 0 };

  const dayOrder = ["今日", "明日", "2日後", "3日後", "4日後"] as const;

  // 1) 「今日」のスクショを削除
  const deleteResult = await db
    .delete(scheduleScreenshots)
    .where(eq(scheduleScreenshots.day, "今日" as any));
  const deleted = (deleteResult as any)[0]?.affectedRows ?? 0;

  // 2) 残りの日付を1つ前にシフト（後ろから順に更新して衝突を防ぐ）
  let shifted = 0;
  for (let i = dayOrder.length - 1; i >= 1; i--) {
    const from = dayOrder[i];
    const to = dayOrder[i - 1];
    const result = await db
      .update(scheduleScreenshots)
      .set({ day: to as any, updatedAt: new Date() })
      .where(eq(scheduleScreenshots.day, from as any));
    shifted += (result as any)[0]?.affectedRows ?? 0;
  }

  return { deleted, shifted };
}

// ─── アルコールチェック ───────────────────────────────────────────────────────
import { alcoholChecks, AlcoholCheck, InsertAlcoholCheck } from "../drizzle/schema";

/** アルコールチェック記録を保存する */
export async function saveAlcoholCheck(data: Omit<InsertAlcoholCheck, "id" | "createdAt" | "sheetSynced">): Promise<AlcoholCheck> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(alcoholChecks).values({ ...data, sheetSynced: 0 });
  const insertId = (result as any).insertId;
  const { eq: eqOp } = await import("drizzle-orm");
  const [row] = await db.select().from(alcoholChecks).where(eqOp(alcoholChecks.id, insertId));
  return row;
}

/** アルコールチェック記録をスプレッドシート転記済みにマークする */
export async function markAlcoholCheckSynced(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const { eq: eqOp } = await import("drizzle-orm");
  await db.update(alcoholChecks).set({ sheetSynced: 1 }).where(eqOp(alcoholChecks.id, id));
}

/** 未同期のアルコールチェック記録を取得する（再転記用） */
export async function getUnsyncedAlcoholChecks(): Promise<AlcoholCheck[]> {
  const db = await getDb();
  if (!db) return [];
  const { eq: eqOp } = await import("drizzle-orm");
  return db
    .select()
    .from(alcoholChecks)
    .where(eqOp(alcoholChecks.sheetSynced, 0))
    .orderBy(alcoholChecks.checkedAt);
}

/** 期間指定でアルコールチェック記録を取得する（管理者用） */
export async function getAlcoholChecksByRange(
  startMs: number,
  endMs: number
): Promise<AlcoholCheck[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(alcoholChecks)
    .where(and(gte(alcoholChecks.checkedAt, startMs), lte(alcoholChecks.checkedAt, endMs)))
    .orderBy(alcoholChecks.checkedAt);
}
/** ユーザーのナンバープレートを更新する */
export async function updateUserNumberPlate(userId: number, numberPlate: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const { eq: eqOp } = await import("drizzle-orm");
  await db.update(users).set({ numberPlate } as any).where(eqOp(users.id, userId));
}

// ─── 月別アルコールチェックスプレッドシート管理 ─────────────────────────────────
import { alcoholCheckSpreadsheets, type AlcoholCheckSpreadsheet } from "../drizzle/schema";

/** 指定年月のスプレッドシート登録を取得する */
export async function getAlcoholCheckSpreadsheet(year: number, month: number): Promise<AlcoholCheckSpreadsheet | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(alcoholCheckSpreadsheets)
    .where(and(eq(alcoholCheckSpreadsheets.year, year), eq(alcoholCheckSpreadsheets.month, month)));
  return row ?? null;
}

/** 全スプレッドシート登録を取得する（新しい順） */
export async function getAllAlcoholCheckSpreadsheets(): Promise<AlcoholCheckSpreadsheet[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(alcoholCheckSpreadsheets)
    .orderBy(desc(alcoholCheckSpreadsheets.year), desc(alcoholCheckSpreadsheets.month));
}

/** 月別スプレッドシートを登録または更新する */
export async function upsertAlcoholCheckSpreadsheet(data: { year: number; month: number; spreadsheetId: string; label?: string }): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await getAlcoholCheckSpreadsheet(data.year, data.month);
  if (existing) {
    await db
      .update(alcoholCheckSpreadsheets)
      .set({ spreadsheetId: data.spreadsheetId, label: data.label ?? existing.label })
      .where(and(eq(alcoholCheckSpreadsheets.year, data.year), eq(alcoholCheckSpreadsheets.month, data.month)));
  } else {
    await db.insert(alcoholCheckSpreadsheets).values({
      year: data.year,
      month: data.month,
      spreadsheetId: data.spreadsheetId,
      label: data.label,
    });
  }
}

/** 月別スプレッドシート登録を削除する */
export async function deleteAlcoholCheckSpreadsheet(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(alcoholCheckSpreadsheets).where(eq(alcoholCheckSpreadsheets.id, id));
}

// ============================================================
// 事故リンク（accidentLinks）
// ============================================================

/** 事故リンクを全件取得する */
export async function getAllAccidentLinks() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(accidentLinks).orderBy(accidentLinks.sortOrder, accidentLinks.createdAt);
}

/** 事故リンクを追加する */
export async function createAccidentLink(data: Omit<InsertAccidentLink, "id" | "createdAt">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(accidentLinks).values(data);
  return (result as any).insertId as number;
}

/** 事故リンクを削除する */
export async function deleteAccidentLink(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(accidentLinks).where(eq(accidentLinks.id, id));
}

// ============================================================
// アルコール検知器設定 CRUD
// ============================================================
import { alcoholDetectorSettings, type AlcoholDetectorSetting, type InsertAlcoholDetectorSetting } from "../drizzle/schema";

/** 有効な検知器一覧を取得する（フォーム用） */
export async function getActiveAlcoholDetectors(): Promise<AlcoholDetectorSetting[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(alcoholDetectorSettings)
    .where(eq(alcoholDetectorSettings.isActive, 1))
    .orderBy(alcoholDetectorSettings.sortOrder, alcoholDetectorSettings.id);
}

/** 全検知器一覧を取得する（管理画面用） */
export async function getAllAlcoholDetectors(): Promise<AlcoholDetectorSetting[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(alcoholDetectorSettings)
    .orderBy(alcoholDetectorSettings.sortOrder, alcoholDetectorSettings.id);
}

/** 検知器を追加する */
export async function createAlcoholDetector(
  data: Omit<InsertAlcoholDetectorSetting, "id" | "createdAt" | "updatedAt">
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(alcoholDetectorSettings).values(data);
  return (result as any).insertId as number;
}

/** 検知器を更新する */
export async function updateAlcoholDetector(
  id: number,
  data: Partial<Omit<InsertAlcoholDetectorSetting, "id" | "createdAt" | "updatedAt">>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(alcoholDetectorSettings).set(data).where(eq(alcoholDetectorSettings.id, id));
}

/** 検知器を削除する */
export async function deleteAlcoholDetector(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(alcoholDetectorSettings).where(eq(alcoholDetectorSettings.id, id));
}

// ============================================================
// タイムシートスプレッドシート ヘルパー
// ============================================================

/** 月別タイムシートスプレッドシート一覧を取得する */
export async function getTimesheetSpreadsheets(year: number, month: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(timesheetSpreadsheets)
    .where(and(eq(timesheetSpreadsheets.year, year), eq(timesheetSpreadsheets.month, month)))
    .orderBy(timesheetSpreadsheets.createdAt);
}

/** 全タイムシートスプレッドシートを取得する */
export async function getAllTimesheetSpreadsheets() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(timesheetSpreadsheets)
    .orderBy(desc(timesheetSpreadsheets.year), desc(timesheetSpreadsheets.month));
}

/** タイムシートスプレッドシートを新規登録する */
export async function createTimesheetSpreadsheet(input: {
  year: number;
  month: number;
  label: string;
  spreadsheetUrl: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const m = input.spreadsheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
  const spreadsheetId = m ? m[1] : input.spreadsheetUrl;
  await db.insert(timesheetSpreadsheets).values({
    year: input.year,
    month: input.month,
    label: input.label,
    spreadsheetId,
    spreadsheetUrl: input.spreadsheetUrl,
  });
}

/** タイムシートスプレッドシートを新規登録または更新する（年月が同じ場合は上書き） */
export async function upsertTimesheetSpreadsheet(input: {
  year: number;
  month: number;
  label: string;
  spreadsheetId: string;
  spreadsheetUrl: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(timesheetSpreadsheets)
    .where(and(eq(timesheetSpreadsheets.year, input.year), eq(timesheetSpreadsheets.month, input.month)))
    .limit(1);
  if (existing.length > 0) {
    await db.update(timesheetSpreadsheets)
      .set({ spreadsheetId: input.spreadsheetId, spreadsheetUrl: input.spreadsheetUrl, label: input.label, updatedAt: new Date() })
      .where(eq(timesheetSpreadsheets.id, existing[0].id));
  } else {
    await db.insert(timesheetSpreadsheets).values({
      year: input.year,
      month: input.month,
      label: input.label,
      spreadsheetId: input.spreadsheetId,
      spreadsheetUrl: input.spreadsheetUrl,
    });
  }
}
/** タイムシートスプレッドシートを削除する */
export async function deleteTimesheetSpreadsheet(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(timesheetSpreadsheets).where(eq(timesheetSpreadsheets.id, id));
}

// ============================================================
// 残業申請・承認 ヘルパー
// ============================================================

/** 残業申請一覧を取得する（管理者用・日付範囲フィルタ付き） */
export async function getOvertimeApprovals(opts?: { date?: string; status?: string; team?: string; yearMonth?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (opts?.date) conditions.push(eq(overtimeApprovals.applicationDate, opts.date));
  if (opts?.status) conditions.push(eq(overtimeApprovals.status, opts.status as any));
  if (opts?.yearMonth) {
    // YYYY-MM形式で月フィルター（applicationDateはYYYY-MM-DD形式）
    conditions.push(like(overtimeApprovals.applicationDate, `${opts.yearMonth}%`));
  }
  // usersテーブルとJOINしてteamを取得
  const query = db
    .select({
      id: overtimeApprovals.id,
      applicantUserId: overtimeApprovals.applicantUserId,
      applicantName: overtimeApprovals.applicantName,
      applicationDate: overtimeApprovals.applicationDate,
      requestedStartAt: overtimeApprovals.requestedStartAt,
      requestedEndAt: overtimeApprovals.requestedEndAt,
      requestedReason: overtimeApprovals.requestedReason,
      status: overtimeApprovals.status,
      approverUserId: overtimeApprovals.approverUserId,
      approverName: overtimeApprovals.approverName,
      approvedAt: overtimeApprovals.approvedAt,
      adjustedStartAt: overtimeApprovals.adjustedStartAt,
      adjustedEndAt: overtimeApprovals.adjustedEndAt,
      approverComment: overtimeApprovals.approverComment,
      sheetSynced: overtimeApprovals.sheetSynced,
      createdAt: overtimeApprovals.createdAt,
      updatedAt: overtimeApprovals.updatedAt,
      applicantTeam: users.team,
    })
    .from(overtimeApprovals)
    .leftJoin(users, eq(overtimeApprovals.applicantUserId, users.id));
  if (opts?.team && opts.team !== "全て") {
    conditions.push(eq(users.team, opts.team as any));
  }
  if (conditions.length > 0) {
    return query.where(and(...conditions)).orderBy(desc(overtimeApprovals.createdAt));
  }
  return query.orderBy(desc(overtimeApprovals.createdAt));
}

/** 特定ユーザーの残業申請一覧を取得する */
export async function getOvertimeApprovalsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(overtimeApprovals)
    .where(eq(overtimeApprovals.applicantUserId, userId))
    .orderBy(desc(overtimeApprovals.createdAt));
}

/** 残業申請を作成する */
export async function createOvertimeApproval(input: {
  applicantUserId: number;
  applicantName: string;
  applicationDate: string;
  requestedStartAt: number;
  requestedEndAt: number;
  requestedReason?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(overtimeApprovals).values({
    applicantUserId: input.applicantUserId,
    applicantName: input.applicantName,
    applicationDate: input.applicationDate,
    requestedStartAt: input.requestedStartAt,
    requestedEndAt: input.requestedEndAt,
    requestedReason: input.requestedReason ?? null,
  });
  return result;
}

/** 残業申請を承認・却下する（管理者用） */
export async function approveOvertimeApproval(input: {
  id: number;
  approverUserId: number;
  approverName: string;
  status: 'approved' | 'rejected';
  adjustedStartAt?: number;
  adjustedEndAt?: number;
  approverComment?: string;
}) {
  const db = await getDb();
  if (!db) return;
  await db.update(overtimeApprovals).set({
    status: input.status,
    approverUserId: input.approverUserId,
    approverName: input.approverName,
    approvedAt: Date.now(),
    adjustedStartAt: input.adjustedStartAt ?? null,
    adjustedEndAt: input.adjustedEndAt ?? null,
    approverComment: input.approverComment ?? null,
    updatedAt: new Date(),
  }).where(eq(overtimeApprovals.id, input.id));
}

/** 残業申請のスプレッドシート転記済みをマークする */
export async function markOvertimeSynced(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(overtimeApprovals).set({ sheetSynced: 1 }).where(eq(overtimeApprovals.id, id));
}

/** 残業申請を削除する（申請者本人のみ・pending状態のみ） */
export async function deleteOvertimeApproval(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(overtimeApprovals).where(
    and(
      eq(overtimeApprovals.id, id),
      eq(overtimeApprovals.applicantUserId, userId),
      eq(overtimeApprovals.status, 'pending')
    )
  );
}

/** 残業申請を1件取得する（ID指定） */
export async function getOvertimeApprovalById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(overtimeApprovals).where(eq(overtimeApprovals.id, id)).limit(1);
  return rows[0] ?? null;
}

// ============================================================
// 月次勤怠確認署名 CRUD
// ============================================================
import { monthlySignatures } from "../drizzle/schema";

/** 月次署名を作成または更新する（同一ユーザー・年月は1件のみ） */
export async function upsertMonthlySignature(data: {
  userId: number;
  userName: string;
  targetYear: number;
  targetMonth: number;
  signedAt: number;
  comment?: string;
}) {
  const db = await getDb();
  if (!db) return null;
  // 既存レコードを確認
  const existing = await db.select().from(monthlySignatures).where(
    and(
      eq(monthlySignatures.userId, data.userId),
      eq(monthlySignatures.targetYear, data.targetYear),
      eq(monthlySignatures.targetMonth, data.targetMonth)
    )
  ).limit(1);
  if (existing.length > 0) {
    // 更新
    await db.update(monthlySignatures).set({
      signedAt: data.signedAt,
      comment: data.comment ?? null,
      adminConfirmed: 0,
      adminConfirmerName: null,
      adminConfirmedAt: null,
    }).where(eq(monthlySignatures.id, existing[0].id));
    const updated = await db.select().from(monthlySignatures).where(eq(monthlySignatures.id, existing[0].id)).limit(1);
    return updated[0] ?? null;
  } else {
    // 新規作成
    await db.insert(monthlySignatures).values({
      userId: data.userId,
      userName: data.userName,
      targetYear: data.targetYear,
      targetMonth: data.targetMonth,
      signedAt: data.signedAt,
      comment: data.comment ?? null,
    });
    const created = await db.select().from(monthlySignatures).where(
      and(
        eq(monthlySignatures.userId, data.userId),
        eq(monthlySignatures.targetYear, data.targetYear),
        eq(monthlySignatures.targetMonth, data.targetMonth)
      )
    ).limit(1);
    return created[0] ?? null;
  }
}

/** 特定ユーザーの月次署名一覧を取得する */
export async function getMonthlySignaturesByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(monthlySignatures).where(
    eq(monthlySignatures.userId, userId)
  ).orderBy(desc(monthlySignatures.targetYear), desc(monthlySignatures.targetMonth));
}

/** 特定ユーザー・年月の月次署名を1件取得する */
export async function getMonthlySignature(userId: number, targetYear: number, targetMonth: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(monthlySignatures).where(
    and(
      eq(monthlySignatures.userId, userId),
      eq(monthlySignatures.targetYear, targetYear),
      eq(monthlySignatures.targetMonth, targetMonth)
    )
  ).limit(1);
  return rows[0] ?? null;
}

/** 全職員の月次署名一覧を取得する（管理者用） */
export async function getAllMonthlySignatures(targetYear?: number, targetMonth?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (targetYear !== undefined) conditions.push(eq(monthlySignatures.targetYear, targetYear));
  if (targetMonth !== undefined) conditions.push(eq(monthlySignatures.targetMonth, targetMonth));
  const query = db.select().from(monthlySignatures);
  if (conditions.length > 0) {
    return await query.where(and(...conditions)).orderBy(desc(monthlySignatures.signedAt));
  }
  return await query.orderBy(desc(monthlySignatures.targetYear), desc(monthlySignatures.targetMonth), desc(monthlySignatures.signedAt));
}

/** 管理者が月次署名を確認済みにする */
export async function adminConfirmMonthlySignature(id: number, confirmerName: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(monthlySignatures).set({
    adminConfirmed: 1,
    adminConfirmerName: confirmerName,
    adminConfirmedAt: Date.now(),
  }).where(eq(monthlySignatures.id, id));
}

// ============================================================
// 業務改善意見箱 ヘルパー
// ============================================================

/** 業務改善提案を作成する */
export async function createImprovementSuggestion(data: InsertImprovementSuggestion) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(improvementSuggestions).values(data);
  return result;
}

/** 業務改善提案一覧を取得する（新しい順） */
export async function getImprovementSuggestions(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(improvementSuggestions)
    .orderBy(desc(improvementSuggestions.createdAt))
    .limit(limit);
}

/** 管理者：業務改善提案に返信する */
export async function replyToImprovementSuggestion(id: number, reply: string, replierName: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(improvementSuggestions).set({
    adminReply: reply,
    adminReplierName: replierName,
    adminRepliedAt: Date.now(),
    updatedAt: new Date(),
  }).where(eq(improvementSuggestions.id, id));
}

/** スプレッドシート転記済みフラグを立てる */
export async function markImprovementSuggestionSynced(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(improvementSuggestions).set({ sheetSynced: 1, updatedAt: new Date() })
    .where(eq(improvementSuggestions.id, id));
}

/** 業務改善スプレッドシート設定を取得する */
export async function getImprovementSpreadsheet() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(improvementSpreadsheets).limit(1);
  return rows[0] ?? null;
}

/** 業務改善スプレッドシート設定を保存（upsert） */
export async function upsertImprovementSpreadsheet(data: { spreadsheetId: string; spreadsheetUrl: string; label: string }) {
  const db = await getDb();
  if (!db) return;
  const existing = await getImprovementSpreadsheet();
  if (existing) {
    await db.update(improvementSpreadsheets).set({ ...data, updatedAt: new Date() })
      .where(eq(improvementSpreadsheets.id, existing.id));
  } else {
    await db.insert(improvementSpreadsheets).values({ ...data });
  }
}

// ========== 個人タスク ==========

/**
 * 繰り返しタスクが今日に該当するかチェックする
 * @param task personalTasksのレコード
 * @param today 今日の日付（JST）
 */
function isRepeatTaskDueToday(task: PersonalTask, today: Date): boolean {
  if (task.repeatType === "none") return false;

  const jstNow = new Date(today.getTime() + 9 * 60 * 60 * 1000);
  const dayOfWeek = jstNow.getUTCDay(); // 0=日, 1=月, ..., 6=土
  const dayOfMonth = jstNow.getUTCDate();
  const month = jstNow.getUTCMonth() + 1;

  // 繰り返し終了日チェック
  if (task.repeatEndDate && today > task.repeatEndDate) return false;

  // 繰り返し開始日チェック（dueDateが設定されている場合、それ以降のみ）
  if (task.dueDate && today < task.dueDate) return false;

  switch (task.repeatType) {
    case "daily":
      return true;

    case "weekly":
      return task.repeatDayOfWeek === dayOfWeek;

    case "biweekly": {
      if (task.repeatDayOfWeek !== dayOfWeek) return false;
      if (!task.dueDate) return false;
      // 基準日からの週数が偶数かどうかで判定
      const baseDate = new Date(task.dueDate);
      const diffMs = today.getTime() - baseDate.getTime();
      const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
      return diffWeeks % 2 === 0;
    }

    case "monthly": {
      const interval = task.repeatMonthInterval ?? 1;
      if (task.repeatDayOfMonth !== dayOfMonth) return false;
      if (!task.dueDate) return true;
      const baseMonth = task.dueDate.getMonth() + 1;
      const baseYear = task.dueDate.getFullYear();
      const totalMonths = (jstNow.getUTCFullYear() - baseYear) * 12 + (month - baseMonth);
      return totalMonths >= 0 && totalMonths % interval === 0;
    }

    case "nth_weekday": {
      if (task.repeatNthDayOfWeek !== dayOfWeek) return false;
      const nthWeek = task.repeatNthWeek ?? 1;
      if (nthWeek === -1) {
        // 最終週: 翌月の同曜日が来月になるかチェック
        const nextWeek = new Date(jstNow);
        nextWeek.setUTCDate(dayOfMonth + 7);
        return nextWeek.getUTCMonth() !== jstNow.getUTCMonth();
      } else {
        // 第N週: dayOfMonth が (N-1)*7 < dayOfMonth <= N*7 の範囲
        return dayOfMonth > (nthWeek - 1) * 7 && dayOfMonth <= nthWeek * 7;
      }
    }

    default:
      return false;
  }
}

/**
 * 自分の個人タスク一覧を取得する（期日順）
 * - 自分宛て（assignType=self, createdBy=userId）
 * - 個人指定（assignType=personal, assignUserId=userId）
 * - チーム指定（assignType=team, assignTeam=userTeam）
 * - 全職員（assignType=all）
 */
export async function getMyPersonalTasks(
  userId: number,
  userTeam: string | null,
  showDone: boolean = false
): Promise<PersonalTask[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [
    isNull(personalTasks.deletedAt),
    or(
      and(eq(personalTasks.assignType, "self"), eq(personalTasks.createdBy, userId)),
      and(eq(personalTasks.assignType, "personal"), eq(personalTasks.assignUserId, userId)),
      eq(personalTasks.assignType, "all"),
      ...(userTeam && ["身体", "天理", "郡山北部", "郡山南部"].includes(userTeam)
        ? [and(eq(personalTasks.assignType, "team"), eq(personalTasks.assignTeam, userTeam as any))]
        : []),
    ),
  ];

  if (!showDone) {
    conditions.push(eq(personalTasks.done, 0));
  }

  const rows = await db
    .select()
    .from(personalTasks)
    .where(and(...conditions))
    .orderBy(personalTasks.dueDate, personalTasks.createdAt);

  return rows;
}

/**
 * 今日の個人タスクを取得する（ホーム画面用）
 * - 今日が期日のタスク（taskKind=at_time or by_deadline, dueDate=今日）
 * - 繰り返しタスクで今日が該当するもの
 */
export async function getTodayPersonalTasks(
  userId: number,
  userTeam: string | null
): Promise<PersonalTask[]> {
  const db = await getDb();
  if (!db) return [];

  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const todayStart = new Date(Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate(), -9, 0, 0)); // JST 00:00
  const todayEnd = new Date(Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate(), 14, 59, 59)); // JST 23:59:59

  const conditions = [
    isNull(personalTasks.deletedAt),
    eq(personalTasks.done, 0),
    or(
      and(eq(personalTasks.assignType, "self"), eq(personalTasks.createdBy, userId)),
      and(eq(personalTasks.assignType, "personal"), eq(personalTasks.assignUserId, userId)),
      eq(personalTasks.assignType, "all"),
      ...(userTeam && ["身体", "天理", "郡山北部", "郡山南部"].includes(userTeam)
        ? [and(eq(personalTasks.assignType, "team"), eq(personalTasks.assignTeam, userTeam as any))]
        : []),
    ),
    or(
      // 今日が期日のタスク
      and(gte(personalTasks.dueDate, todayStart), lte(personalTasks.dueDate, todayEnd)),
      // 期日が過ぎているタスク（未完了）
      lt(personalTasks.dueDate, todayStart),
    ),
  ];

  const rows = await db
    .select()
    .from(personalTasks)
    .where(and(...conditions))
    .orderBy(personalTasks.dueDate, personalTasks.createdAt);

  // 繰り返しタスクのフィルタリング
  const today = new Date(todayStart.getTime() + 9 * 60 * 60 * 1000);
  const allTasks = await getMyPersonalTasks(userId, userTeam, false);
  const repeatTasks = allTasks.filter(t =>
    t.repeatType !== "none" && isRepeatTaskDueToday(t, today)
  );

  // 重複除去してマージ
  const seen = new Set(rows.map(r => r.id));
  const merged = [...rows, ...repeatTasks.filter(t => !seen.has(t.id))];
  merged.sort((a, b) => {
    const aTime = a.dueDate?.getTime() ?? 0;
    const bTime = b.dueDate?.getTime() ?? 0;
    return aTime - bTime;
  });

  return merged;
}

/** 個人タスクを作成する */
export async function createPersonalTask(data: {
  text: string;
  taskKind: "at_time" | "by_deadline";
  dueDate?: Date;
  createdBy: number;
  createdByName: string;
  assignType: "self" | "personal" | "team" | "all";
  assignTeam?: "身体" | "天理" | "郡山北部" | "郡山南部";
  assignUserId?: number;
  assignUserName?: string;
  assignTeams?: string;
  assignUserIds?: string;
  assignUserNames?: string;
  repeatType: "none" | "daily" | "weekly" | "biweekly" | "monthly" | "nth_weekday";
  repeatDayOfWeek?: number;
  repeatDayOfMonth?: number;
  repeatMonthInterval?: number;
  repeatNthWeek?: number;
  repeatNthDayOfWeek?: number;
  repeatEndDate?: Date;
}): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(personalTasks).values({
    text: data.text,
    taskKind: data.taskKind,
    dueDate: data.dueDate ?? null,
    createdBy: data.createdBy,
    createdByName: data.createdByName,
    assignType: data.assignType,
    assignTeam: data.assignTeam ?? null,
    assignUserId: data.assignUserId ?? null,
    assignUserName: data.assignUserName ?? null,
    assignTeams: data.assignTeams ?? null,
    assignUserIds: data.assignUserIds ?? null,
    assignUserNames: data.assignUserNames ?? null,
    repeatType: data.repeatType,
    repeatDayOfWeek: data.repeatDayOfWeek ?? null,
    repeatDayOfMonth: data.repeatDayOfMonth ?? null,
    repeatMonthInterval: data.repeatMonthInterval ?? 1,
    repeatNthWeek: data.repeatNthWeek ?? null,
    repeatNthDayOfWeek: data.repeatNthDayOfWeek ?? null,
    repeatEndDate: data.repeatEndDate ?? null,
    done: 0,
  });

  return { id: (result as any)[0]?.insertId ?? 0 };
}

/** 個人タスクの完了/未完了を切り替える */
export async function togglePersonalTaskDone(
  id: number,
  done: boolean,
  userId: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(personalTasks).set({
    done: done ? 1 : 0,
    completedBy: done ? userId : null,
    completedAt: done ? new Date() : null,
  }).where(eq(personalTasks.id, id));
}

/** 個人タスクを更新する */
export async function updatePersonalTask(
  id: number,
  data: Partial<{
    text: string;
    taskKind: "at_time" | "by_deadline";
    dueDate: Date | null;
    assignType: "self" | "personal" | "team" | "all";
    assignTeam: "身体" | "天理" | "郡山北部" | "郡山南部" | null;
    assignUserId: number | null;
    assignUserName: string | null;
    repeatType: "none" | "daily" | "weekly" | "biweekly" | "monthly" | "nth_weekday";
    repeatDayOfWeek: number | null;
    repeatDayOfMonth: number | null;
    repeatMonthInterval: number | null;
    repeatNthWeek: number | null;
    repeatNthDayOfWeek: number | null;
    repeatEndDate: Date | null;
  }>,
  _userId: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const updateData: Record<string, unknown> = {};
  if (data.text !== undefined) updateData.text = data.text;
  if (data.taskKind !== undefined) updateData.taskKind = data.taskKind;
  if ("dueDate" in data) updateData.dueDate = data.dueDate;
  if (data.assignType !== undefined) updateData.assignType = data.assignType;
  if ("assignTeam" in data) updateData.assignTeam = data.assignTeam;
  if ("assignUserId" in data) updateData.assignUserId = data.assignUserId;
  if ("assignUserName" in data) updateData.assignUserName = data.assignUserName;
  if (data.repeatType !== undefined) updateData.repeatType = data.repeatType;
  if ("repeatDayOfWeek" in data) updateData.repeatDayOfWeek = data.repeatDayOfWeek;
  if ("repeatDayOfMonth" in data) updateData.repeatDayOfMonth = data.repeatDayOfMonth;
  if ("repeatMonthInterval" in data) updateData.repeatMonthInterval = data.repeatMonthInterval;
  if ("repeatNthWeek" in data) updateData.repeatNthWeek = data.repeatNthWeek;
  if ("repeatNthDayOfWeek" in data) updateData.repeatNthDayOfWeek = data.repeatNthDayOfWeek;
  if ("repeatEndDate" in data) updateData.repeatEndDate = data.repeatEndDate;

  if (Object.keys(updateData).length === 0) return;

  await db.update(personalTasks).set(updateData as any).where(eq(personalTasks.id, id));
}

/** 個人タスクをソフトデリートする */
export async function deletePersonalTask(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(personalTasks).set({
    deletedAt: new Date(),
    deletedBy: userId,
  }).where(eq(personalTasks.id, id));
}

// ========== 訪問予定スロット順番保存 ==========

/**
 * 訪問予定スロットの順番をupsertする（ユーザーID+日付キーで一意）
 * @param userId ユーザーID
 * @param dateKey 日付（YYYY-MM-DD形式、JSTベース）
 * @param slotsJson スロットデータのJSON文字列
 */
export async function upsertVisitSlotOrder(userId: number, dateKey: string, slotsJson: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(visitSlotOrders).values({
    userId,
    dateKey,
    slotsJson,
  }).onDuplicateKeyUpdate({
    set: { slotsJson, updatedAt: new Date() },
  });
}

/**
 * 訪問予定スロットの順番を取得する
 * @param userId ユーザーID
 * @param dateKey 日付（YYYY-MM-DD形式、JSTベース）
 * @returns slotsJson文字列、または null
 */
export async function getVisitSlotOrder(userId: number, dateKey: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select({ slotsJson: visitSlotOrders.slotsJson })
    .from(visitSlotOrders)
    .where(and(eq(visitSlotOrders.userId, userId), eq(visitSlotOrders.dateKey, dateKey)))
    .limit(1);
  return result.length > 0 ? result[0].slotsJson : null;
}

// ========== イレギュラー予定管理 ==========

/**
 * イレギュラー予定一覧を取得する（削除済み除く）
 */
export async function listIrregularSchedules(filter: {
  team?: string;
  scheduleType?: string;
  fromDate?: string;
  toDate?: string;
}): Promise<IrregularSchedule[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions = [isNull(irregularSchedules.deletedAt)];
  if (filter.team) conditions.push(eq(irregularSchedules.team, filter.team as any));
  if (filter.scheduleType) conditions.push(eq(irregularSchedules.scheduleType, filter.scheduleType as any));
  if (filter.fromDate) conditions.push(gte(irregularSchedules.startDate, filter.fromDate));
  if (filter.toDate) conditions.push(lte(irregularSchedules.startDate, filter.toDate));
  return db
    .select()
    .from(irregularSchedules)
    .where(and(...conditions))
    .orderBy(irregularSchedules.startDate, irregularSchedules.createdAt);
}

/**
 * イレギュラー予定を1件取得する
 */
export async function getIrregularSchedule(id: number): Promise<IrregularSchedule | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(irregularSchedules)
    .where(eq(irregularSchedules.id, id))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/**
 * イレギュラー予定を新規作成する
 */
export async function createIrregularSchedule(
  data: Omit<InsertIrregularSchedule, "id" | "createdAt" | "updatedAt">
): Promise<IrregularSchedule> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(irregularSchedules).values({
    ...data,
    syncedToSheet: 0,
  });
  const insertId = (result as any)[0]?.insertId ?? 0;
  const created = await getIrregularSchedule(insertId);
  if (!created) throw new Error("Failed to retrieve created record");
  return created;
}

/**
 * イレギュラー予定を更新する
 */
export async function updateIrregularSchedule(
  id: number,
  data: Partial<Omit<InsertIrregularSchedule, "id" | "createdAt" | "updatedAt">>,
  _userId: number
): Promise<IrregularSchedule> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(irregularSchedules)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(irregularSchedules.id, id));
  const updated = await getIrregularSchedule(id);
  if (!updated) throw new Error("Record not found");
  return updated;
}

/**
 * イレギュラー予定をソフトデリートする
 */
export async function deleteIrregularSchedule(id: number, _userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(irregularSchedules)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(irregularSchedules.id, id));
}

/**
 * スプレッドシート同期済みフラグと行番号を更新する
 */
export async function markIrregularScheduleSynced(id: number, sheetRowIndex: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(irregularSchedules)
    .set({ syncedToSheet: 1, sheetRowIndex, updatedAt: new Date() })
    .where(eq(irregularSchedules.id, id));
}

/**
 * super_adminロールを持つユーザー一覧を取得する（残業申請通知用）
 */
export async function getSuperAdminUsers(): Promise<Array<{ id: number; name: string | null; email: string | null }>> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.role, "super_admin" as any));
}

/**
 * 特定ユーザーへのアプリ内通知を作成する（残業申請通知用）
 */
export async function createOvertimeNotification(params: {
  targetUserId: number;
  type: "overtime_request" | "overtime_approved" | "overtime_rejected";
  title: string;
  body: string;
  resourceId?: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(appNotifications).values({
    type: params.type as any,
    title: params.title,
    body: params.body,
    resourceId: params.resourceId ?? null,
    targetUserId: params.targetUserId,
    isRead: 0,
  });
}
