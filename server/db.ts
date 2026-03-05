import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, scheduleScreenshots, InsertScheduleScreenshot, myLinks, InsertMyLink, spreadsheetLinks, InsertSpreadsheetLink } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
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

import { tasks, InsertTask } from "../drizzle/schema";
import { or, isNull, desc } from "drizzle-orm";

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

/** タスクを取得する（ID指定） */
export async function getTaskById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}
