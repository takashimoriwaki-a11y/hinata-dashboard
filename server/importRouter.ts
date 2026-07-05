/**
 * server/importRouter.ts
 *
 * 5/18 運用開始に向けたデータ移行用のルーター
 *
 * - Apps Script から呼び出される
 * - 認証は IMPORT_API_SECRET の照合（input.secret 方式）
 * - 訪問予定カレンダー由来は scheduleChanges へ、それ以外は irregularSchedules へ振り分け
 * - 5/18 以降は不要になるので、しばらく稼働させたあと削除可能
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { google } from "googleapis";
import { router, publicProcedure } from "./_core/trpc";
import {
  getUnexportedVisitRecordsForSheetExport,
  markVisitRecordExported,
} from "./db";
import { exportVisitRecordToSheet } from "./visitRecordSheetExport";

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
// イベント振り分けロジック
// ============================================================================

type ScheduleType =
  | "受診"
  | "ショートステイ"
  | "特別指示書"
  | "入院"
  | "退院"
  | "新規契約・面談"
  | "訪問診療同席";

type ChangeType = "visit_add" | "visit_cancel" | "visit_change";

type EventDestination =
  | { kind: "irregular"; scheduleType: ScheduleType }
  | { kind: "schedule_change"; changeType: ChangeType }
  | { kind: "skip"; reason: string };

// 施設名キーワード（個別利用者ではない訪問先）
const FACILITY_KEYWORDS = /ふきのとう|ハナミズキ|サントアース|こもれび|ひかりの丘|日の出/;

/**
 * カレンダーイベントの行き先を判定する
 */
function routeEvent(calendarName: string, summary: string): EventDestination {
  const title = summary || "";

  // 施設訪問パターン①: 日の出検温N棟（明示）
  if (/日の出検温|検温\s*\d+棟/.test(title)) {
    return { kind: "skip", reason: "施設訪問のため対象外（個別利用者ではない）" };
  }

  // 施設訪問パターン②: 施設名キーワードを含むが、利用者名（様/さん）を含まない
  if (FACILITY_KEYWORDS.test(title) && !/様|さん/.test(title)) {
    return { kind: "skip", reason: "施設訪問のため対象外（個別利用者ではない）" };
  }

  // 特別指示期間カレンダー → irregularSchedules (特別指示書)
  if (calendarName.includes("特別指示期間")) {
    return { kind: "irregular", scheduleType: "特別指示書" };
  }

  // 訪問予定カレンダー → scheduleChanges
  if (calendarName.includes("訪問予定")) {
    // 振替を含む → visit_change
    if (/振替|振り替え|振り換え/.test(title)) {
      return { kind: "schedule_change", changeType: "visit_change" };
    }
    // 訪問なし／キャンセル → visit_cancel
    // 「訪問なし」「キャンセル」「中止」 or 「様なし」（「あり」を含まない）
    if (
      /訪問なし|キャンセル|中止/.test(title) ||
      (/様[\s　]?なし/.test(title) && !/あり/.test(title))
    ) {
      return { kind: "schedule_change", changeType: "visit_cancel" };
    }
    // 訪問あり系 → visit_add（強化版）
    if (
      /訪問あり|追加訪問|訪問追加/.test(title) ||
      /\d+時訪問|時訪問/.test(title) ||
      /様[\s　]?あり/.test(title) || // 「○○様あり16時」
      /あり[\s　]?\d+時/.test(title) || // 「あり16時」
      /面談|相談|来所/.test(title) // 「○○様面談」「相談」
    ) {
      return { kind: "schedule_change", changeType: "visit_add" };
    }
    // フォールバック：利用者名と訪問/時間どちらか含む
    if (/様.*訪問|訪問.*様|様.*\d+時|\d+時.*様/.test(title)) {
      return { kind: "schedule_change", changeType: "visit_add" };
    }
    return {
      kind: "skip",
      reason: "訪問予定カレンダーだが訪問あり/なし/振替のキーワードなし",
    };
  }

  // 利用者受診日・ショートステイその他カレンダー → irregularSchedules
  if (calendarName.includes("受診日") || calendarName.includes("ショートステイ")) {
    if (/訪問診療|往診/.test(title)) return { kind: "irregular", scheduleType: "訪問診療同席" };
    if (/契約|面談|初回/.test(title)) return { kind: "irregular", scheduleType: "新規契約・面談" };
    if (/退院/.test(title)) return { kind: "irregular", scheduleType: "退院" };
    if (/入院/.test(title)) return { kind: "irregular", scheduleType: "入院" };
    if (/ショート|SS|短期入所/.test(title)) return { kind: "irregular", scheduleType: "ショートステイ" };
    if (/受診|通院|クリニック|病院|Dr\.|医師|外来|診療/.test(title)) {
      return { kind: "irregular", scheduleType: "受診" };
    }
    // 受診日カレンダーは「受診」にフォールバック
    return { kind: "irregular", scheduleType: "受診" };
  }

  return { kind: "skip", reason: "対象外のカレンダー" };
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
      // 「様」「さん」「氏」やスペースを除去した名前でも引けるように
      const cleanName = p.name.replace(/\s+/g, "").replace(/様|さん|氏/g, "");
      if (cleanName !== p.name) {
        map.set(cleanName, { id: p.id, team: p.team });
      }
    }
  }
  return map;
}

/**
 * タイトルから「○○様」「○○さん」候補名を抽出する
 */
function extractNameCandidate(text: string): string | null {
  if (!text) return null;
  // 「○○様」全角/半角スペース、コロン、句読点、括弧、数字の手前まで
  let m = text.match(/([^\s　：:、。・（）()]+?)様/);
  if (m && m[1].length >= 2) return m[1];
  // 「○○さん」
  m = text.match(/([^\s　：:、。・（）()]+?)さん/);
  if (m && m[1].length >= 2) return m[1];
  return null;
}

// ============================================================================
// 利用者名エイリアス（Googleカレンダー側の誤字 → patientsマスタの正しい表記）
// ============================================================================
const NAME_ALIASES: Record<string, string> = {
  "竹林虎太郎": "竹林虎太朗",
  "竹林琥太郎": "竹林虎太朗",
  "松吉友子": "松末友子",
  // Chatタスク移行で判明した異体字（誤表記 → patientsマスタの正表記）
  "浅野昭三": "淺野昭三",
  "渡邊真佐志": "渡邉真佐志",
  "中森ヒロエ": "中森ヒロヱ",
  "宮崎昌子": "宮﨑昌子",
  "濵元美津代": "濱元美津代",
};

function applyAlias(name: string): string {
  return NAME_ALIASES[name] || name;
}

/**
 * テキストから利用者を解決する（多段戦略）
 */
function resolvePatient(
  text: string,
  patientMap: Map<string, { id: number; team: string }>,
): { name: string; team: string; id: number; candidate?: string } | null {
  if (!text) return null;

  // 戦略0: エイリアス Map のキーがテキストに含まれていれば、正しい名前に置換した上で探索
  let workingText = text;
  for (const wrongName of Object.keys(NAME_ALIASES)) {
    if (workingText.includes(wrongName)) {
      workingText = workingText.split(wrongName).join(NAME_ALIASES[wrongName]);
    }
  }

  // 戦略1: patientMap の登録名で部分一致探索（長い名前優先）
  const names = Array.from(patientMap.keys()).sort((a, b) => b.length - a.length);
  for (const name of names) {
    if (workingText.includes(name)) {
      const info = patientMap.get(name)!;
      return { name, team: info.team, id: info.id };
    }
  }

  // 戦略2: 「○○様/さん」候補名抽出 → エイリアス変換 → patients に対して fuzzy 突合
  const rawCandidate = extractNameCandidate(text);
  if (rawCandidate) {
    const candidate = applyAlias(rawCandidate);
    const candNorm = candidate.replace(/\s+/g, "");
    for (const name of names) {
      const nameNorm = name.replace(/\s+/g, "");
      if (nameNorm === candNorm) {
        const info = patientMap.get(name)!;
        return { name, team: info.team, id: info.id, candidate };
      }
      if (
        candNorm.length >= 2 &&
        nameNorm.length >= 2 &&
        (nameNorm.startsWith(candNorm) || candNorm.startsWith(nameNorm))
      ) {
        const info = patientMap.get(name)!;
        return { name, team: info.team, id: info.id, candidate };
      }
    }
    return null;
  }

  return null;
}

function extractCandidateOnly(text: string): string | null {
  return extractNameCandidate(text);
}

function buildUserNameMap(
  allUsers: Array<{ id: number; name: string | null }>,
): Map<string, { id: number; name: string }> {
  const map = new Map<string, { id: number; name: string }>();
  for (const u of allUsers) {
    if (u.name) {
      const fullName = u.name.replace(/\s+/g, "");
      map.set(fullName, { id: u.id, name: u.name });
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

/**
 * description 内の「担当:○○」マーカー直後の名前だけから担当者を解決する。
 * マーカーが無ければ null（→ team 扱い）。患者名や本文中の姓の偶然一致で
 * 個人割当されてしまう誤検出（例：患者「中西ヒサ子」が職員「中西真帆」にヒット）を防ぐ。
 */
function extractAssigneeFromMarker(
  description: string | undefined,
  userMap: Map<string, { id: number; name: string }>,
): { id: number; name: string } | null {
  if (!description) return null;
  // 「担当:」「担当：」「担当 :」等に続く名前トークンを取り出す
  const m = description.match(/担当[\s　]*[:：][\s　]*([^\s　、。\n]{2,8})/);
  if (!m) return null;
  // 取り出した名前だけを既存ロジックで照合（フルネーム優先は extractUserName が担保）
  return extractUserName(m[1], userMap);
}

// ============================================================================
// 日時組み立て（fromDatetime/toDatetime 用）
// ============================================================================

function buildDateTime(date: string, time: string | null | undefined): string {
  if (time) {
    return `${date}T${time}:00`;
  }
  return `${date}T00:00:00`;
}

// ============================================================================
// 直帰申請スプレッドシートバックフィル（importData.backfillDirectReturnSheet 用）
// ============================================================================

const DIRECT_RETURN_BACKFILL_HEADERS = [
  "申請日", "申請時刻", "申請者", "理由", "詳細",
  "ステータス", "承認者", "承認日時", "承認者コメント",
];

function directReturnStatusLabel(status: string) {
  if (status === "approved") return "承認済み";
  if (status === "rejected") return "却下";
  return "申請中";
}

function formatDirectReturnAppliedTime(appliedAt: number | null | undefined) {
  if (!appliedAt) return "";
  return new Date(appliedAt).toLocaleTimeString("ja-JP", {
    timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit",
  });
}

function formatDirectReturnApprovedAt(approvedAt: number | null | undefined) {
  if (!approvedAt) return "";
  return new Date(approvedAt).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

function parseDirectReturnAppendRowNumber(updatedRange: string): number | null {
  const rowMatch = updatedRange.match(/!A(\d+):/);
  return rowMatch ? parseInt(rowMatch[1]!, 10) : null;
}

async function ensureDirectReturnBackfillMonthTab(
  spreadsheetId: string,
  yearMonth: string,
  sheets: ReturnType<typeof google.sheets>,
) {
  const ssInfo = await sheets.spreadsheets.get({ spreadsheetId });
  const existingTabs = (ssInfo.data.sheets ?? [])
    .map(s => s.properties?.title ?? "")
    .filter(Boolean);
  if (existingTabs.includes(yearMonth)) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: yearMonth } } }],
    },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${yearMonth}!A1:I1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [DIRECT_RETURN_BACKFILL_HEADERS] },
  });
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
      const { irregularSchedules, scheduleChanges, patients } = await import(
        "../drizzle/schema"
      );

      const allPatients = await db.select().from(patients);
      const patientMap = buildPatientNameMap(allPatients);

      const results: Array<{
        index: number;
        summary: string;
        status: "success" | "skipped" | "error";
        destination?: "irregular" | "schedule_change";
        reason?: string;
        resolvedPatient?: string;
        resolvedTeam?: string;
        scheduleType?: string;
        changeType?: string;
      }> = [];

      const irregularToInsert: any[] = [];
      const changeToInsert: any[] = [];

      for (let i = 0; i < input.events.length; i++) {
        const ev = input.events[i];

        // ステップ1: イベントの行き先を決定
        const dest = routeEvent(ev.calendarName, ev.summary);

        if (dest.kind === "skip") {
          results.push({
            index: i,
            summary: ev.summary,
            status: "skipped",
            reason: dest.reason,
          });
          continue;
        }

        // ステップ2: 利用者解決
        const combinedText = (ev.summary || "") + " " + (ev.description || "");
        const resolved = resolvePatient(combinedText, patientMap);

        if (!resolved) {
          const candidate = extractCandidateOnly(combinedText);
          results.push({
            index: i,
            summary: ev.summary,
            status: "skipped",
            reason: candidate
              ? `利用者「${candidate}」がpatientsマスタに未登録（要：手動登録 or 漢字確認）`
              : "利用者名が抽出できませんでした",
          });
          continue;
        }

        const { name: patientName, team: resolvedTeam, id: patientId } = resolved;

        // ステップ3: カレンダー名とteamの整合性チェック
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

        // ステップ4: 行き先別の処理
        if (dest.kind === "irregular") {
          const existing = await db
            .select()
            .from(irregularSchedules)
            .where(
              and(
                eq(irregularSchedules.patientName, patientName),
                eq(irregularSchedules.startDate, ev.startDate),
                eq(irregularSchedules.scheduleType, dest.scheduleType),
              ),
            )
            .limit(1);

          if (existing.length > 0) {
            results.push({
              index: i,
              summary: ev.summary,
              status: "skipped",
              destination: "irregular",
              reason: "既に同じ予定が登録されています",
              resolvedPatient: patientName,
              resolvedTeam,
              scheduleType: dest.scheduleType,
            });
            continue;
          }

          irregularToInsert.push({
            patientName,
            team: resolvedTeam as any,
            scheduleType: dest.scheduleType as any,
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
            destination: "irregular",
            resolvedPatient: patientName,
            resolvedTeam,
            scheduleType: dest.scheduleType,
          });
        } else if (dest.kind === "schedule_change") {
          const eventDateTime = buildDateTime(ev.startDate, ev.startTime);

          let fromDatetime: string | null = null;
          let toDatetime: string | null = null;

          if (dest.changeType === "visit_add") {
            fromDatetime = null;
            toDatetime = eventDateTime;
          } else if (dest.changeType === "visit_cancel") {
            fromDatetime = eventDateTime;
            toDatetime = null;
          } else if (dest.changeType === "visit_change") {
            fromDatetime = eventDateTime;
            toDatetime = null;
          }

          const existing = await db
            .select()
            .from(scheduleChanges)
            .where(
              and(
                eq(scheduleChanges.patientName, patientName),
                eq(scheduleChanges.changeType, dest.changeType),
              ),
            )
            .limit(50);

          const isDup = existing.some(
            (e: any) =>
              e.fromDatetime === fromDatetime &&
              e.toDatetime === toDatetime &&
              e.reason === `[カレンダー移行] ${ev.summary}`,
          );

          if (isDup) {
            results.push({
              index: i,
              summary: ev.summary,
              status: "skipped",
              destination: "schedule_change",
              reason: "既に同じ変更が登録されています",
              resolvedPatient: patientName,
              resolvedTeam,
              changeType: dest.changeType,
            });
            continue;
          }

          changeToInsert.push({
            changeType: dest.changeType as any,
            team: resolvedTeam as any,
            patientName,
            patientId,
            fromDatetime,
            toDatetime,
            staffBefore: null,
            staffAfter: null,
            meetingName: null,
            meetingStaff: null,
            reason: `[カレンダー移行] ${ev.summary}${ev.description ? " / " + ev.description : ""}`.slice(0, 1000),
            scheduleFacility: ev.location || null,
            scheduleStartDate: null,
            scheduleEndDate: null,
            schedulePostDischargeEndDate: null,
            scheduleTargetName: null,
            scheduleStaff: null,
            createdBy: 1,
            createdByName: "森脇崇（カレンダー移行）",
            exported: 0,
          });

          results.push({
            index: i,
            summary: ev.summary,
            status: "success",
            destination: "schedule_change",
            resolvedPatient: patientName,
            resolvedTeam,
            changeType: dest.changeType,
          });
        }
      }

      if (!input.dryRun) {
        for (const row of irregularToInsert) {
          await db.insert(irregularSchedules).values(row);
        }
        for (const row of changeToInsert) {
          await db.insert(scheduleChanges).values(row);
        }
      }

      return {
        dryRun: input.dryRun,
        totalReceived: input.events.length,
        toInsertCount: irregularToInsert.length + changeToInsert.length,
        irregularCount: irregularToInsert.length,
        scheduleChangeCount: changeToInsert.length,
        successCount: results.filter((r) => r.status === "success").length,
        skippedCount: results.filter((r) => r.status === "skipped").length,
        errorCount: results.filter((r) => r.status === "error").length,
        results,
      };
    }),

  // Chat タスク一括投入
  // ============================================================================
  // 移行データを取得（スプレッドシート同期用）
  // ============================================================================
  getMigrationData: publicProcedure
    .input(z.object({ secret: z.string() }))
    .mutation(async ({ input }) => {
      requireImportSecret(input);

      const { getDb } = await import("./db");
      const db = await getDb();
      const { irregularSchedules, scheduleChanges } = await import(
        "../drizzle/schema"
      );

      // changeType -> 日本語表記マップ
      const changeTypeMap: Record<string, string> = {
        visit_change: "訪問日時変更",
        visit_cancel: "訪問キャンセル",
        visit_add: "訪問追加",
        meeting_add: "会議追加",
        meeting_change: "会議変更",
        schedule_visit: "受診",
        schedule_short_stay: "ショートステイ",
        schedule_special_instruction: "特別指示書",
        schedule_hospitalization: "入院",
        schedule_discharge: "退院",
        schedule_new_contract: "新規契約・面談",
        schedule_visit_doctor: "訪問診療同席",
      };

      // ヘルパー関数
      const formatDateTime = (dt: Date | null | undefined): string => {
        if (!dt) return "";
        const d = new Date(dt);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        const hh = String(d.getHours()).padStart(2, "0");
        const mi = String(d.getMinutes()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
      };
      const formatIsoDt = (s: string | null | undefined): string => {
        if (!s) return "";
        return s.replace("T", " ").slice(0, 16);
      };
      const cleanText = (s: string | null | undefined): string => {
        if (!s) return "";
        return s.replace(/[\n\r\t]+/g, " ").trim();
      };
      const joinDateTime = (
        date: string | null | undefined,
        time: string | null | undefined,
      ): string => {
        if (!date) return "";
        return time ? `${date} ${time}` : date;
      };

      // scheduleChanges 取得
      const changes = await db
        .select()
        .from(scheduleChanges)
        .where(eq(scheduleChanges.createdByName, "森脇崇（カレンダー移行）"));

      // irregularSchedules 取得
      const irregulars = await db
        .select()
        .from(irregularSchedules)
        .where(
          eq(irregularSchedules.createdByName, "森脇崇（カレンダー移行）"),
        );

      // team別グルーピング用
      const grouped: Record<string, any[][]> = {
        身体: [],
        天理: [],
        郡山北部: [],
        郡山南部: [],
      };

      // scheduleChanges を変換
      for (const c of changes) {
        const row = [
          formatDateTime(c.createdAt),
          c.createdByName || "",
          changeTypeMap[c.changeType] || c.changeType,
          c.team,
          c.patientName || "",
          formatIsoDt(c.fromDatetime),
          formatIsoDt(c.toDatetime),
          c.staffBefore || "",
          c.staffAfter || "",
          c.meetingName || "",
          c.meetingStaff || "",
          cleanText(c.reason),
          c.scheduleFacility || "",
          c.schedulePostDischargeEndDate || "",
          c.scheduleTargetName || "",
          c.scheduleStaff || "",
        ];
        if (grouped[c.team]) {
          grouped[c.team].push(row);
        }
      }

      // irregularSchedules を変換
      for (const ir of irregulars) {
        const row = [
          formatDateTime(ir.createdAt),
          ir.createdByName || "",
          ir.scheduleType,
          ir.team,
          ir.patientName,
          joinDateTime(ir.startDate, ir.startTime),
          ir.endDate ? joinDateTime(ir.endDate, ir.endTime) : "",
          "",
          "",
          "",
          "",
          cleanText(ir.notes),
          ir.facilityName || "",
          ir.postDischargeEndDate || "",
          "",
          "",
        ];
        if (grouped[ir.team]) {
          grouped[ir.team].push(row);
        }
      }

      // 入力日時昇順にソート（各team内）
      for (const team of Object.keys(grouped)) {
        grouped[team].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
      }

      return {
        totalCount: changes.length + irregulars.length,
        scheduleChangeCount: changes.length,
        irregularCount: irregulars.length,
        teams: grouped,
        counts: {
          身体: grouped["身体"].length,
          天理: grouped["天理"].length,
          郡山北部: grouped["郡山北部"].length,
          郡山南部: grouped["郡山南部"].length,
        },
      };
    }),
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

        const combinedText = (item.title || "") + " " + (item.description || "");
        const resolved = resolvePatient(combinedText, patientMap);
        const patientName = resolved?.name || null;
        // 担当者は description の「担当:」マーカー直後の名前からのみ解決する
        // （combinedText 全体を走査すると患者名等の姓と偶然一致して誤って個人割当される）
        const userInfo = extractAssigneeFromMarker(item.description, userMap);

        let resolvedTeam: string | null = null;
        if (item.spaceName.includes("身体")) resolvedTeam = "身体";
        else if (item.spaceName.includes("天理")) resolvedTeam = "天理";
        else if (item.spaceName.includes("郡山北部")) resolvedTeam = "郡山北部";
        else if (item.spaceName.includes("郡山南部")) resolvedTeam = "郡山南部";
        else if (item.spaceName.includes("郡山")) {
          if (resolved) resolvedTeam = resolved.team;
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

        // タスク内容(text)のマッピング:
        // 元データは title=利用者名 / description=作業内容 という構造のため、
        // 利用者が解決できたタスクは作業内容(description)を内容にする。
        // 利用者の無い一般タスク(誕生日プレゼント等)は title が作業内容なので title を使う。
        // description が空のときも空textを作らないよう title にフォールバック。
        const taskText =
          patientName && item.description && item.description.trim()
            ? item.description
            : item.title;

        const row = {
          text: taskText,
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

  /** 直帰申請：スプレッドシート未転記分のバックフィル（一度きり運用） */
  backfillDirectReturnSheet: publicProcedure
    .input(z.object({
      secret: z.string(),
      dryRun: z.boolean().default(true),
      yearMonth: z.string().regex(/^\d{4}-\d{2}$/),
    }))
    .mutation(async ({ input }) => {
      requireImportSecret(input);
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB接続エラー" });
      }

      const { directReturnApprovals, directReturnSpreadsheets } = await import("../drizzle/schema");
      const { eq, and, like, isNull, asc } = await import("drizzle-orm");

      const rows = await db.select().from(directReturnApprovals)
        .where(and(
          like(directReturnApprovals.applicationDate, `${input.yearMonth}%`),
          isNull(directReturnApprovals.sheetRowNumber),
        ))
        .orderBy(asc(directReturnApprovals.appliedAt));

      const year = parseInt(input.yearMonth.split("-")[0]!, 10);
      const ssRows = await db.select().from(directReturnSpreadsheets)
        .where(eq(directReturnSpreadsheets.year, year))
        .limit(1);
      if (ssRows.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `${year}年度の直帰申請スプレッドシートが未登録です`,
        });
      }
      const spreadsheetId = ssRows[0].spreadsheetId;

      const targets = rows.map((r) => ({
        id: r.id,
        applicationDate: r.applicationDate,
        applicantName: r.applicantName,
        status: r.status,
        reasonCategory: r.reasonCategory,
      }));

      if (input.dryRun || rows.length === 0) {
        return {
          dryRun: input.dryRun,
          yearMonth: input.yearMonth,
          spreadsheetId,
          targetCount: rows.length,
          targets,
          successCount: 0,
          failCount: 0,
          results: [] as Array<{ id: number; status: string; sheetRowNumber?: number; error?: string }>,
        };
      }

      const auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
          private_key: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
        },
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });
      const sheets = google.sheets({ version: "v4", auth });
      await ensureDirectReturnBackfillMonthTab(spreadsheetId, input.yearMonth, sheets);

      const results: Array<{ id: number; status: string; sheetRowNumber?: number; error?: string }> = [];
      let successCount = 0;
      let failCount = 0;

      for (const record of rows) {
        try {
          const newRow = [
            record.applicationDate,
            formatDirectReturnAppliedTime(record.appliedAt),
            record.applicantName ?? "不明",
            record.reasonCategory ?? "",
            record.reasonDetail ?? "",
            directReturnStatusLabel(record.status),
            record.approverName ?? "",
            formatDirectReturnApprovedAt(record.approvedAt ?? undefined),
            record.approverComment ?? "",
          ];
          const appendRes = await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: `${input.yearMonth}!A:I`,
            valueInputOption: "USER_ENTERED",
            includeValuesInResponse: false,
            requestBody: { values: [newRow] },
          });
          const sheetRowNumber = parseDirectReturnAppendRowNumber(appendRes.data.updates?.updatedRange ?? "");
          if (!sheetRowNumber) {
            throw new Error("行番号を取得できませんでした");
          }

          await db.update(directReturnApprovals)
            .set({ sheetRowNumber, sheetTabName: input.yearMonth })
            .where(eq(directReturnApprovals.id, record.id));

          results.push({ id: record.id, status: "success", sheetRowNumber });
          successCount++;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          results.push({ id: record.id, status: "failed", error: message });
          failCount++;
        }
      }

      return {
        dryRun: false,
        yearMonth: input.yearMonth,
        spreadsheetId,
        targetCount: rows.length,
        targets,
        successCount,
        failCount,
        results,
      };
    }),

  /** 未転送の次回訪問日時をスプレッドシートへ一括再転記（IMPORT_API_SECRET 認証） */
  reExportVisitRecords: publicProcedure
    .input(z.object({
      secret: z.string(),
      since: z.string().optional(),
      dryRun: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      requireImportSecret(input);

      const since = input.since
        ? new Date(`${input.since}T00:00:00+09:00`)
        : new Date("2026-07-03T15:00:00.000Z");
      const dryRun = input.dryRun ?? false;
      const records = await getUnexportedVisitRecordsForSheetExport(since);

      if (dryRun) {
        return {
          dryRun: true,
          since: since.toISOString(),
          total: records.length,
          records: records.map(r => ({
            id: r.id,
            team: r.team,
            patientName: r.patientName,
            createdAt: r.createdAt,
            nextVisitAt: r.nextVisitAt,
            createdByName: r.createdByName,
          })),
          successCount: 0,
          failCount: 0,
          results: [],
        };
      }

      const results: Array<{
        id: number;
        status: "success" | "failed";
        team: string;
        patientName: string;
        error?: string;
      }> = [];

      for (const record of records) {
        try {
          await exportVisitRecordToSheet(record);
          await markVisitRecordExported(record.id);
          results.push({
            id: record.id,
            status: "success",
            team: record.team,
            patientName: record.patientName,
          });
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (e) {
          results.push({
            id: record.id,
            status: "failed",
            team: record.team,
            patientName: record.patientName,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      return {
        dryRun: false,
        since: since.toISOString(),
        total: records.length,
        successCount: results.filter(r => r.status === "success").length,
        failCount: results.filter(r => r.status === "failed").length,
        results,
      };
    }),
});