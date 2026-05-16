/**
 * server/importRouter.ts
 *
 * 5/18 運用開始に向けたデータ移行用のルーター
 *
 * - Apps Script から呼び出される
 * - 認証は IMPORT_API_SECRET の照合（Bearer 認証相当を input に含める方式）
 * - 5/18 以降は不要になるので、しばらく稼働させたあと削除可能
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { router, publicProcedure } from "./_core/trpc";

// ============================================================================
// 認証チェック（共通）
// ============================================================================

function requireImportSecret(input: { secret: string }) {
  const expected = process.env.IMPORT_API_SECRET || "";
  if (!expected) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "IMPORT_API_SECRET is not configured",
    });
  }
  if (input.secret !== expected) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid import secret",
    });
  }
}

// ============================================================================
// scheduleType 自動判定
// ============================================================================

type ScheduleType =
  | "受診"
  | "ショートステイ"
  | "特別指示書"
  | "入院"
  | "退院"
  | "新規契約・面談"
  | "訪問診療同席";

function determineScheduleType(
  calendarName: string,
  summary: string,
): ScheduleType | null {
  // 1. カレンダー名で確定するもの
  if (calendarName.includes("特別指示期間")) return "特別指示書";

  // 2. タイトルキーワードで判定（優先度順）
  if (/訪問診療|往診/.test(summary)) return "訪問診療同席";
  if (/契約|面談|初回/.test(summary)) return "新規契約・面談";
  if (/退院/.test(summary)) return "退院";
  if (/入院/.test(summary)) return "入院";
  if (/ショート|SS|短期入所/.test(summary)) return "ショートステイ";
  if (/受診|通院|クリニック|病院|Dr\.|医師|外来/.test(summary)) return "受診";

  // 3. デフォルト（受診その他カレンダー由来なら「受診」にフォールバック）
  if (calendarName.includes("受診日")) return "受診";

  return null;
}

// ============================================================================
// 利用者名・職員名抽出
// ============================================================================

function buildPatientNameMap(
  allPatients: Array<{ id: number; name: string; team: string; active: number }>,
): Map<string, { id: number; team: string }> {
  const map = new Map<string, { id: number; team: string }>();
  for (const p of allPatients) {
    if (p.active === 1) {
      map.set(p.name, { id: p.id, team: p.team });
      // 「様」「さん」を除去した名前でも引けるように
      const cleanName = p.name.replace(/\s+/g, "").replace(/様|さん|氏/g, "");
      if (cleanName !== p.name) {
        map.set(cleanName, { id: p.id, team: p.team });
      }
    }
  }
  return map;
}

function extractPatientName(
  text: string,
  patientMap: Map<string, { id: number; team: string }>,
): string | null {
  if (!text) return null;
  // 長い名前から試す（部分一致衝突を避ける）
  const names = Array.from(patientMap.keys()).sort((a, b) => b.length - a.length);
  for (const name of names) {
    if (text.includes(name)) return name;
  }
  return null;
}

function buildUserNameMap(
  allUsers: Array<{ id: number; name: string | null }>,
): Map<string, { id: number; name: string }> {
  const map = new Map<string, { id: number; name: string }>();
  for (const u of allUsers) {
    if (u.name) {
      const fullName = u.name.replace(/\s+/g, "");
      map.set(fullName, { id: u.id, name: u.name });
      // 苗字だけ（最初の2-3文字）でも引けるように
      const lastName2 = fullName.slice(0, 2);
      const lastName3 = fullName.slice(0, 3);
      if (!map.has(lastName2)) map.set(lastName2, { id: u.id, name: u.name });
      if (!map.has(lastName3)) map.set(lastName3, { id: u.id, name: u.name });
    }
  }
  return map;
}

function extractUserName(
  text: string,
  userMap: Map<string, { id: number; name: string }>,
): { id: number; name: string } | null {
  if (!text) return null;
  const names = Array.from(userMap.keys()).sort((a, b) => b.length - a.length);
  for (const name of names) {
    if (text.includes(name)) return userMap.get(name) || null;
  }
  return null;
}

// ============================================================================
// ルーター本体
// ============================================================================

export const importRouter = router({
  // 接続テスト
  ping: publicProcedure
    .input(z.object({ secret: z.string() }))
    .query(async ({ input }) => {
      requireImportSecret(input);
      return { ok: true, time: new Date().toISOString() };
    }),

  // カレンダー予定一括投入
  importCalendar: publicProcedure
    .input(
      z.object({
        secret: z.string(),
        dryRun: z.boolean().default(true),
        events: z.array(
          z.object({
            calendarName: z.string(),
            summary: z.string(),
            description: z.string().optional(),
            location: z.string().optional(),
            startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
            startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
            endTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
          }),
        ),
      }),
    )
    .mutation(async ({ input }) => {
      requireImportSecret(input);

      const { getDb } = await import("./db");
    const db = await getDb();
      const { irregularSchedules, patients } = await import("../drizzle/schema");

      // 利用者マスタをプリロード
      const allPatients = await db.select().from(patients);
      const patientMap = buildPatientNameMap(allPatients);

      const results: Array<{
        index: number;
        summary: string;
        status: "success" | "skipped" | "error";
        reason?: string;
        resolvedPatient?: string;
        resolvedTeam?: string;
        scheduleType?: string;
      }> = [];

      const toInsert: any[] = [];

      for (let i = 0; i < input.events.length; i++) {
        const ev = input.events[i];

        // 利用者名抽出（summary → description の順）
        const fromSummary = extractPatientName(ev.summary, patientMap);
        const fromDesc = ev.description
          ? extractPatientName(ev.description, patientMap)
          : null;
        const patientName = fromSummary || fromDesc;

        if (!patientName) {
          results.push({
            index: i,
            summary: ev.summary,
            status: "skipped",
            reason: "利用者名が抽出できませんでした",
          });
          continue;
        }

        const patientInfo = patientMap.get(patientName);
        if (!patientInfo) {
          results.push({
            index: i,
            summary: ev.summary,
            status: "skipped",
            reason: `「${patientName}」が利用者マスタに存在しません`,
          });
          continue;
        }

        const resolvedTeam = patientInfo.team;

        // カレンダー名とteamの整合性チェック
        if (ev.calendarName.includes("身体") && resolvedTeam !== "身体") {
          results.push({
            index: i,
            summary: ev.summary,
            status: "skipped",
            reason: `カレンダー「身体」と利用者team「${resolvedTeam}」が不一致`,
            resolvedPatient: patientName,
          });
          continue;
        }
        if (ev.calendarName.includes("天理") && resolvedTeam !== "天理") {
          results.push({
            index: i,
            summary: ev.summary,
            status: "skipped",
            reason: `カレンダー「天理」と利用者team「${resolvedTeam}」が不一致`,
            resolvedPatient: patientName,
          });
          continue;
        }
        // 「精神郡山」は patientsテーブルから team 解決（北部・南部）

        // scheduleType 判定
        const scheduleType = determineScheduleType(ev.calendarName, ev.summary);
        if (!scheduleType) {
          results.push({
            index: i,
            summary: ev.summary,
            status: "skipped",
            reason: "scheduleTypeを判定できませんでした（タイトルにキーワードなし）",
            resolvedPatient: patientName,
            resolvedTeam,
          });
          continue;
        }

        // 重複チェック
        const existing = await db
          .select()
          .from(irregularSchedules)
          .where(
            and(
              eq(irregularSchedules.patientName, patientName),
              eq(irregularSchedules.startDate, ev.startDate),
              eq(irregularSchedules.scheduleType, scheduleType),
            ),
          )
          .limit(1);

        if (existing.length > 0) {
          results.push({
            index: i,
            summary: ev.summary,
            status: "skipped",
            reason: "既に同じ予定が登録されています",
            resolvedPatient: patientName,
            resolvedTeam,
            scheduleType,
          });
          continue;
        }

        toInsert.push({
          patientName: patientName,
          team: resolvedTeam as any,
          scheduleType: scheduleType as any,
          startDate: ev.startDate,
          endDate: ev.endDate || null,
          startTime: ev.startTime || null,
          endTime: ev.endTime || null,
          facilityName: ev.location || null,
          notes: ev.description
            ? `[カレンダー移行] ${ev.description}`.slice(0, 1000)
            : "[カレンダー移行]",
          createdBy: 1,
          createdByName: "森脇崇（カレンダー移行）",
          syncedToSheet: 0,
        });

        results.push({
          index: i,
          summary: ev.summary,
          status: "success",
          resolvedPatient: patientName,
          resolvedTeam,
          scheduleType,
        });
      }

      // dryRun でなければ実際に投入
      if (!input.dryRun && toInsert.length > 0) {
        for (const row of toInsert) {
          await db.insert(irregularSchedules).values(row);
        }
      }

      return {
        dryRun: input.dryRun,
        totalReceived: input.events.length,
        toInsertCount: toInsert.length,
        successCount: results.filter((r) => r.status === "success").length,
        skippedCount: results.filter((r) => r.status === "skipped").length,
        errorCount: results.filter((r) => r.status === "error").length,
        results,
      };
    }),

  // Chat タスク一括投入
  importChatTasks: publicProcedure
    .input(
      z.object({
        secret: z.string(),
        dryRun: z.boolean().default(true),
        items: z.array(
          z.object({
            spaceName: z.string(),
            title: z.string(),
            description: z.string().optional(),
            dueDate: z.string().nullable().optional(),
          }),
        ),
      }),
    )
    .mutation(async ({ input }) => {
      requireImportSecret(input);

      const { getDb } = await import("./db");
    const db = await getDb();
      const { tasks, patients, users } = await import("../drizzle/schema");

      const allPatients = await db.select().from(patients);
      const patientMap = buildPatientNameMap(allPatients);

      const allUsers = await db.select().from(users);
      const userMap = buildUserNameMap(allUsers);

      const results: any[] = [];
      const toInsert: any[] = [];

      for (let i = 0; i < input.items.length; i++) {
        const item = input.items[i];

        // 利用者名抽出
        const combinedText = (item.title || "") + " " + (item.description || "");
        const patientName = extractPatientName(combinedText, patientMap);

        // 担当者抽出
        const userInfo = extractUserName(combinedText, userMap);

        // team 解決
        let resolvedTeam: string | null = null;
        if (item.spaceName.includes("身体")) resolvedTeam = "身体";
        else if (item.spaceName.includes("天理")) resolvedTeam = "天理";
        else if (item.spaceName.includes("郡山北部")) resolvedTeam = "郡山北部";
        else if (item.spaceName.includes("郡山南部")) resolvedTeam = "郡山南部";
        else if (item.spaceName.includes("郡山")) {
          if (patientName) {
            const p = patientMap.get(patientName);
            if (p) resolvedTeam = p.team;
          }
        }

        if (!resolvedTeam) {
          results.push({
            index: i,
            title: item.title,
            status: "skipped",
            reason: `team判別不能（spaceName: ${item.spaceName}）`,
          });
          continue;
        }

        const row = {
          text: item.title,
          done: 0,
          dueDate: item.dueDate ? new Date(item.dueDate) : null,
          taskKind: "by_deadline" as const,
          createdBy: 1,
          createdByName: "森脇崇（Chat移行）",
          assignType: userInfo ? ("personal" as const) : ("team" as const),
          assignTeam: userInfo ? null : (resolvedTeam as any),
          assignUserId: userInfo ? userInfo.id : null,
          assignUserName: userInfo ? userInfo.name : null,
          patientName: patientName || null,
        };

        toInsert.push(row);
        results.push({
          index: i,
          title: item.title,
          status: "success",
          resolvedPatient: patientName,
          resolvedUser: userInfo?.name,
          resolvedTeam,
        });
      }

      if (!input.dryRun && toInsert.length > 0) {
        for (const row of toInsert) {
          await db.insert(tasks).values(row);
        }
      }

      return {
        dryRun: input.dryRun,
        totalReceived: input.items.length,
        toInsertCount: toInsert.length,
        successCount: results.filter((r) => r.status === "success").length,
        skippedCount: results.filter((r) => r.status === "skipped").length,
        results,
      };
    }),
});