import { and, eq, or, isNull, desc, lte, gte, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, scheduleScreenshots, InsertScheduleScreenshot, myLinks, InsertMyLink, spreadsheetLinks, InsertSpreadsheetLink, tasks, InsertTask, messages, InsertMessage, messageReactions, InsertMessageReaction, patients, InsertPatient, visitRecords, InsertVisitRecord, appNotifications, InsertAppNotification } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      // trim() to handle accidental whitespace in environment variables
      const dbUrl = process.env.DATABASE_URL.trim();
      console.log("[Database] Connecting with URL prefix:", dbUrl.substring(0, 20) + "...");
      _db = drizzle(dbUrl);
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

export async function updateUserTeam(userId: number, team: "身体" | "天理" | "郡山北部" | "郡山南部") {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ team }).where(eq(users.id, userId));
}

// ========== スケジュールスクリーンショット ==========

export async function getAllScreenshots() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(scheduleScreenshots);
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
      .set({ url: data.url, label: data.label, color: data.color, updatedAt: new Date() })
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
 * 自分に関係するタスクを取得する
 * 条件: 以下のいずれかを満たすもの
 *   1. assignType = "all"（全員対象）
 *   2. assignType = "team" かつ assignTeam = ユーザーのチーム
 *   3. assignType = "personal" かつ assignUserId = ユーザーのID
 *   4. createdBy = ユーザーのID（自分が作成したタスク）
 */
export async function getMyTasks(userId: number, userTeam: string | null) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [
    eq(tasks.assignType, "all"),
    eq(tasks.createdBy, userId),
    and(eq(tasks.assignType, "personal"), eq(tasks.assignUserId, userId)),
  ];

  if (userTeam) {
    conditions.push(
      and(eq(tasks.assignType, "team"), eq(tasks.assignTeam, userTeam as any)) as any
    );
  }

  return db
    .select()
    .from(tasks)
    .where(or(...conditions))
    .orderBy(desc(tasks.createdAt));
}

/** 全タスクを取得（管理者用） */
export async function getAllTasks() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tasks).orderBy(desc(tasks.createdAt));
}

/** タスクを作成する */
export async function createTask(data: InsertTask) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(tasks).values(data);
  return (result as any)[0]?.insertId ?? 0;
}

/** タスクの完了状態を切り替える */
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
}

/** タスクを削除する（作成者のみ） */
export async function deleteTask(id: number, createdBy: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.createdBy, createdBy)));
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

// ========== アプリ内通知 ==========

/** 通知を作成する */
export async function createNotification(data: Omit<InsertAppNotification, "id" | "isRead" | "readAt" | "createdAt">) {
  const db = await getDb();
  if (!db) return;
  await db.insert(appNotifications).values({ ...data, isRead: 0 });
}

/** 未読通知一覧を取得する（新しい順） */
export async function getUnreadNotifications() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(appNotifications)
    .where(eq(appNotifications.isRead, 0))
    .orderBy(desc(appNotifications.createdAt))
    .limit(50);
}

/** 通知一覧を取得する（新しい順、最新100件） */
export async function getAllNotifications() {
  const db = await getDb();
  if (!db) return [];
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
