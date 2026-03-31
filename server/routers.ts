import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { GoogleAuth } from "google-auth-library";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  getAllScreenshots,
  getScreenshot,
  upsertScreenshot,
  updateScreenshotUrl,
  deleteScreenshot,
  deleteAllTodayScreenshots,
  moveTomorrowToToday,
  updateUserTeam,
  getDb,
  getMyLinks,
  createMyLink,
  updateMyLink,
  deleteMyLink,
  getSpreadsheetLinks,
  getAllSpreadsheetLinks,
  upsertSpreadsheetLink,
  deleteSpreadsheetLink,
  getMyTasks,
  getAllTasks,
  createTask,
  toggleTask,
  deleteTask as deleteTaskDb,
  getTaskById,
  updateTask,
  getActiveMessages,
  getPendingMessages,
  createMessage,
  softDeleteMessage,
  updateMessage,
  getMessageById,
  toggleReaction,
  getReactionsByMessageIds,
  expireMessages,
  getPatients,
  getAllPatientsIncludingInactive,
  searchPatients,
  createPatient,
  updatePatient,
  deactivatePatient,
  createVisitRecord,
  getVisitRecords,
  getVisitRecordById,
  markVisitRecordExported,
  unmarkVisitRecordExported,
  createNotification,
  getUnreadNotifications,
  getAllNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  notificationExists,
  cleanupOldNotifications,
  getAllStaff,
  createStaffAccount,
  resetStaffPassword,
  deleteStaffAccount,
  updateStaffRole,
  updateStaffEmail,
  completeTeamSetup,
  updateUserRole,
  updateStaffInfo,
  batchCreatePatients,
  batchCreateStaff,
  createScreenshotUploadLog,
  getRecentScreenshotUploadLogs,
  getSetting,
  setSetting,
  getScheduleComments,
  addScheduleComment,
  deleteScheduleComment,
  updateScheduleComment,
  getScheduleCommentCounts,
  getScheduleCommentReactions,
  toggleScheduleCommentReaction,
  getCommentsByDate,
  deleteCommentsByDate,
  createScheduleChange,
  getScheduleChanges,
  getScheduleChangeById,
  markScheduleChangeExported,
} from "./db";
import { storagePut } from "./storage";
import { eq } from "drizzle-orm";
import { users } from "../drizzle/schema";
import { broadcastEvent } from "./_core/sse";

// COOKIE_NAME is imported from shared/const via googleAuth.ts; use the shared constant here too
import { COOKIE_NAME } from "../shared/const";

// Google Sheets API設定
const SPREADSHEET_ID = "1rS_ZMccLCy-XcRxbxlhTfNwhaCesdX7DBSZggjQUH58";

// サービスアカウント認証クライアントを作成（シングルトン）
let _auth: GoogleAuth | null = null;
function getAuth(): GoogleAuth {
  if (!_auth) {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

    if (!email || !privateKey) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL または GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY が設定されていません");
    }

    _auth = new GoogleAuth({
      credentials: {
        client_email: email,
        private_key: privateKey.replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
  }
  return _auth;
}

// シート名を取得（例: 2026.3）
function getSheetName(year: number, month: number): string {
  return `${year}.${month}`;
}

// 今月・前月のシート名を取得
function getMonthSheetNames(): { current: string; prev: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  return {
    current: getSheetName(year, month),
    prev: getSheetName(prevYear, prevMonth),
  };
}

// サービスアカウント認証でGoogle Sheets APIからデータを取得
async function fetchSheetData(sheetName: string, range: string): Promise<string[][]> {
  const auth = getAuth();
  const client = await auth.getClient();
  const token = await client.getAccessToken();

  if (!token.token) {
    throw new Error("アクセストークンの取得に失敗しました");
  }

  const encodedRange = encodeURIComponent(`${sheetName}!${range}`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodedRange}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token.token}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Sheets API error: ${response.status} ${text}`);
  }

  const data = await response.json() as { values?: string[][] };
  return data.values ?? [];
}

// 数値パース（空・NaN対策）
function parseNum(val: string | undefined): number {
  if (!val) return 0;
  const n = parseFloat(val.replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

interface DailyPoint {
  day: number;          // 日（1〜31）
  label: string;        // 表示ラベル（例: "3/1"）
  target: number;       // 目標累計（P列）
  actual: number | null; // 実績累計（Q列）、未入力はnull
}

interface VisitData {
  currentMonth: string;           // 今月表示（例: "3月"）
  lastUpdatedDate: string;        // 直近の実績更新日（例: "3/3"）
  mainActual: number;             // メイン実績累計
  subActual: number;              // サブ実績累計
  totalActualEquiv: number;       // 合計実績（メイン換算: メイン + サブ/2）
  mainTarget: number;             // メイン月間目標
  subTarget: number;              // サブ月間目標
  mainDailyTargetCumul: number;   // その日のメイン目標累計（C列）
  subDailyTargetCumul: number;    // その日のサブ目標累計（J列）
  totalTargetEquiv: number;       // 合計目標（メイン換算）
  diff: number;                   // 目標差
  dailyTarget: number;            // 1日目標
  dailyPoints: DailyPoint[];      // 日別データ（グラフ用）
  // 前月実績
  prevMonth: string;              // 前月表示（例: "2月"）
  prevTotalTarget: number;        // 前月 P列最終値（目標累計メイン換算）
  prevTotalActual: number;        // 前月 Q列最終値（実績累計メイン換算）
  prevDiff: number;               // 前月 R列最終値（目標差）
}

async function getVisitData(): Promise<VisitData> {
  const { current: currentSheet, prev: prevSheet } = getMonthSheetNames();
  const now = new Date();
  const currentMonth = `${now.getMonth() + 1}月`;
  const prevMonthNum = now.getMonth() === 0 ? 12 : now.getMonth();
  const prevMonth = `${prevMonthNum}月`;

  // === 今月データ取得 ===
  const currentValues = await fetchSheetData(currentSheet, "A1:R40");

  // スプレッドシートの列構造（0始まりインデックス）:
  // 行1(index=0): ヘッダー行（空, 空, "1日目標"）
  // 行2(index=1): 目標メイン → B列(1)=月間目標, C列(2)=1日目標
  // 行3(index=2): 目標サブ  → B列(1)=月間目標
  // 行8〜(index=7〜): 日別データ
  //   A(0)=日付, B(1)=曜日, C(2)=メイン目標累計, D(3)=メイン訪問実績, E(4)=メイン実績累計, F(5)=メイン目標差
  //   H(7)=日付(サブ), I(8)=曜日(サブ), J(9)=サブ目標累計, K(10)=サブ訪問実績(当日), L(11)=サブ実績累計
  //   P(15)=目標累計(メイン換算), Q(16)=実績累計(メイン換算), R(17)=目標差

  const mainTargetRow = currentValues[1] ?? [];  // 行2(index=1)
  const subTargetRow = currentValues[2] ?? [];   // 行3(index=2)
  const mainTarget = parseNum(mainTargetRow[1]);   // B2: メイン月間目標
  const subTarget = parseNum(subTargetRow[1]);     // B3: サブ月間目標
  const dailyTarget = parseNum(mainTargetRow[2]);  // C2: 1日目標

  let lastUpdatedDate = "";
  let mainActual = 0;
  let subActual = 0;
  let totalActualEquiv = 0;
  let totalTargetEquiv = 0;
  let diff = 0;
  let mainDailyTargetCumul = 0;
  let subDailyTargetCumul = 0;
  const dailyPoints: DailyPoint[] = [];

  // 日別データは行8～（index=7～）
  for (let i = 7; i <= 37; i++) {
    const row = currentValues[i];
    if (!row || row.length < 2) continue;

    const dateLabel = row[0] ?? "";
    if (!dateLabel || dateLabel === "") continue;  // 日付がない行はスキップ

    const mainActualCumul = parseNum(row[4]);   // E列(4): メイン実績累計
    const subActualCumul = parseNum(row[11]);   // L列(11): サブ実績累計

    // Q列の実績累計が0でなければ実績あり
    const qVal = parseNum(row[16]);  // Q列(16): 実績累計（メイン換算）
    const pVal = parseNum(row[15]);  // P列(15): 目標累計（メイン換算）

    // 日別データを追加（P列に目標がある日のみ）
    if (pVal > 0) {
      // 日付ラベルから日番号を抽出（例: "3/1" → 1）
      const dayNum = parseInt(dateLabel.split("/")[1] ?? dateLabel, 10);
      dailyPoints.push({
        day: isNaN(dayNum) ? i - 6 : dayNum,
        label: dateLabel,
        target: Math.round(pVal * 10) / 10,
        actual: qVal > 0 ? Math.round(qVal * 10) / 10 : null,
      });
    }

    // 実績が入力されている行を記録（最後に値がある行が直近更新日）
    if (qVal > 0) {
      lastUpdatedDate = dateLabel;
      mainActual = mainActualCumul;
      subActual = subActualCumul;
      totalActualEquiv = qVal;

      // C列(2): メイン目標累計（その日までの累計目標）
      mainDailyTargetCumul = parseNum(row[2]);
      // J列(9): サブ目標累計（その日までの累計目標）
      subDailyTargetCumul = parseNum(row[9]);

      // P列: 目標累計（メイン換算）
      totalTargetEquiv = pVal;

      // R列: 目標差
      const rVal = parseNum(row[17]);  // R列(17)
      diff = rVal;
    }
  }

  // === 前月データ取得（P列・Q列・R列の一番下の値）===
  let prevTotalTarget = 0;
  let prevTotalActual = 0;
  let prevDiff = 0;

  try {
    const prevValues = await fetchSheetData(prevSheet, "A1:R40");

    // 行9〜39（index 8〜38）のP列・Q列・R列で最後に値がある行を探す
    for (let i = 8; i <= 38; i++) {
      const row = prevValues[i];
      if (!row) break;

      const pVal = parseNum(row[15]);  // P列: 目標累計
      const qVal = parseNum(row[16]);  // Q列: 実績累計
      const rVal = parseNum(row[17]);  // R列: 目標差

      if (pVal > 0 || qVal > 0) {
        prevTotalTarget = pVal;
        prevTotalActual = qVal;
        prevDiff = rVal;
      }
    }
  } catch (e) {
    console.warn("[Visits] Failed to fetch prev month data:", e);
  }

  return {
    currentMonth,
    lastUpdatedDate,
    mainActual,
    subActual,
    totalActualEquiv: Math.round(totalActualEquiv * 10) / 10,
    mainTarget,
    subTarget,
    mainDailyTargetCumul: Math.round(mainDailyTargetCumul * 10) / 10,
    subDailyTargetCumul: Math.round(subDailyTargetCumul * 10) / 10,
    totalTargetEquiv: Math.round(totalTargetEquiv * 10) / 10,
    diff: Math.round(diff * 10) / 10,
    dailyTarget,
    dailyPoints,
    prevMonth,
    prevTotalTarget: Math.round(prevTotalTarget * 10) / 10,
    prevTotalActual: Math.round(prevTotalActual * 10) / 10,
    prevDiff: Math.round(prevDiff * 10) / 10,
  };
}

// ランダムサフィックス生成
function randomSuffix(): string {
  return Math.random().toString(36).substring(2, 10);
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // 訪問件数データ取得
  visits: router({
    getCurrent: publicProcedure.query(async () => {
      try {
        return await getVisitData();
      } catch (error) {
        console.error("[Visits] Failed to fetch sheet data:", error);
        return null;
      }
    }),
  }),

  // ユーザー設定
  userSettings: router({
    // 現在のユーザー情報（チーム含む）を取得
    getMyTeam: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { team: "身体" as const };
      const result = await db.select({ team: users.team }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
      return { team: result[0]?.team ?? "身体" };
    }),
    // チームを更新
    setMyTeam: protectedProcedure
      .input(z.object({ team: z.enum(["身体", "天理", "郡山北部", "郡山南部"]) }))
      .mutation(async ({ ctx, input }) => {
        await updateUserTeam(ctx.user.id, input.team);
        broadcastEvent("users");
        return { success: true };
      }),
    // プロフィール取得（teamSetupDone含む）
    getMyProfile: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { team: null, teamSetupDone: false };
      const result = await db.select({ team: users.team, teamSetupDone: users.teamSetupDone }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
      return { team: result[0]?.team ?? null, teamSetupDone: (result[0]?.teamSetupDone ?? 0) === 1 };
    }),
    // 初回チーム設定を完了する
    completeTeamSetup: protectedProcedure
      .input(z.object({ team: z.enum(["身体", "天理", "郡山北部", "郡山南部", "事務員", "全チーム"]) }))
      .mutation(async ({ ctx, input }) => {
        await completeTeamSetup(ctx.user.id, input.team);
        broadcastEvent("users");
        // 管理者へチーム参加通知を送信
        try {
          const { notifyOwner } = await import("./_core/notification");
          const staffName = ctx.user.name ?? ctx.user.email ?? "不明なスタッフ";
          await notifyOwner({
            title: "チーム参加のお知らせ",
            content: `${staffName} さんが「${input.team}」チームに参加しました。`,
          });
        } catch (e) {
          console.error("[TeamSetup] notifyOwner failed:", e);
        }
        return { success: true };
      }),
  }),

  // マイリンク
  myLinks: router({
    // 自分のリンク一覧を取得
    list: protectedProcedure.query(async ({ ctx }) => {
      return getMyLinks(ctx.user.id);
    }),
    // リンクを追加
    create: protectedProcedure
      .input(
        z.object({
          label: z.string().min(1).max(100),
          url: z.string().url({ message: "有効なURLを入力してください" }),
          emoji: z.string().max(10).default("🔗"),
          description: z.string().max(200).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const links = await getMyLinks(ctx.user.id);
        const sortOrder = links.length;
        const id = await createMyLink({
          userId: ctx.user.id,
          label: input.label,
          url: input.url,
          emoji: input.emoji,
          description: input.description,
          sortOrder,
        });
        broadcastEvent("myLinks");
        return { success: true, id };
      }),
    // リンクを更新
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          label: z.string().min(1).max(100).optional(),
          url: z.string().url({ message: "有効なURLを入力してください" }).optional(),
          emoji: z.string().max(10).optional(),
          description: z.string().max(200).optional(),
          sortOrder: z.number().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        await updateMyLink(id, ctx.user.id, data);
        broadcastEvent("myLinks");
        return { success: true };
      }),
    // \u30ea\u30f3\u30af\u3092\u524a\u9664
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await deleteMyLink(input.id, ctx.user.id);
        broadcastEvent("myLinks");
        return { success: true };
      }),
    // Google Driveファイル検索
    searchDrive: protectedProcedure
      .input(z.object({ query: z.string().min(1).max(200) }))
      .query(async ({ input }) => {
        try {
          const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
          const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
          if (!email || !privateKey) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Google認証情報が設定されていません" });
          }
          const auth = new GoogleAuth({
            credentials: {
              client_email: email,
              private_key: privateKey.replace(/\\n/g, "\n"),
            },
            scopes: ["https://www.googleapis.com/auth/drive.readonly"],
          });
          const client = await auth.getClient();
          const token = await client.getAccessToken();
          if (!token.token) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "トークン取得失敗" });
          const q = encodeURIComponent(`name contains '${input.query.replace(/'/g, "\\'")}'`);
          const fields = encodeURIComponent("files(id,name,mimeType,webViewLink,iconLink,modifiedTime)");
          const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=20&orderBy=modifiedTime+desc`;
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token.token}` },
          });
          if (!res.ok) {
            const text = await res.text();
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Drive APIエラー: ${res.status} ${text}` });
          }
          const data = await res.json() as { files: { id: string; name: string; mimeType: string; webViewLink: string; iconLink?: string; modifiedTime: string }[] };
          return data.files ?? [];
        } catch (e) {
          if (e instanceof TRPCError) throw e;
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: String(e) });
        }
      }),
  }),

  // スプレッドシートURL月次管理
  spreadsheetLinks: router({
    // 当月分のリンク一覧を取得（公開）
    // 当月分がなければ直近登録分を使用（月切替自動対応）
    getCurrent: publicProcedure.query(async () => {
      const now = new Date();
      const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const current = await getSpreadsheetLinks(yearMonth);
      if (current.length > 0) return current;
      // 当月分が未登録の場合、全登録から各linkKeyの最新分を返す
      const all = await getAllSpreadsheetLinks();
      if (all.length === 0) return [];
      // linkKeyごとに最新の登録を抽出
      const latestByKey = new Map<string, typeof all[0]>();
      for (const link of all) {
        const existing = latestByKey.get(link.linkKey);
        if (!existing || link.yearMonth > existing.yearMonth) {
          latestByKey.set(link.linkKey, link);
        }
      }
      return Array.from(latestByKey.values());
    }),
    // 全年月のリンク一覧を取得（管理者用）
    getAll: protectedProcedure.query(async () => {
      return getAllSpreadsheetLinks();
    }),
    // リンクを登録または更新（管理者のみ）
    upsert: protectedProcedure
      .input(
        z.object({
          linkKey: z.string().min(1).max(100),
          label: z.string().min(1).max(100),
          yearMonth: z.string().regex(/^\d{4}-\d{2}$/, "年月はYYYY-MM形式で入力してください"),
          url: z.string().url({ message: "有効なURLを入力してください" }),
          color: z.string().max(50).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const id = await upsertSpreadsheetLink({
          linkKey: input.linkKey,
          label: input.label,
          yearMonth: input.yearMonth,
          url: input.url,
          color: input.color ?? "text-emerald-600",
          createdBy: ctx.user.id,
        });
        broadcastEvent("spreadsheetLinks");
        return { success: true, id };
      }),
    // \u30ea\u30f3\u30af\u3092\u524a\u9664\uff08\u7ba1\u7406\u8005\u306e\u307f\uff09
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteSpreadsheetLink(input.id);
        broadcastEvent("spreadsheetLinks");
        return { success: true };
      }),
    // 業務日報の本日の日付タブのgidを取得
    getDailyReportSheetGid: publicProcedure.query(async () => {
      const DAILY_REPORT_SPREADSHEET_ID = "10Leb7UR6ARVlCGbf5pBa5yxsgm5WAV9m-ETyYrzfBCs";
      const auth = getAuth();
      const client = await auth.getClient();
      const token = await client.getAccessToken();
      if (!token.token) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "アクセストークンの取得に失敗しました" });

      const metaRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${DAILY_REPORT_SPREADSHEET_ID}?fields=sheets.properties`,
        { headers: { Authorization: `Bearer ${token.token}` } }
      );
      if (!metaRes.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "シート情報の取得に失敗しました" });
      const meta = await metaRes.json() as { sheets: { properties: { sheetId: number; title: string } }[] };

      // 本日の日付に一致するシートを検索（複数パターン対応）
      const now = new Date();
      const month = now.getMonth() + 1;
      const day = now.getDate();
      const candidates = [
        `${month}/${day}`,
        `${month}月${day}日`,
        `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`,
        `${String(month).padStart(2, "0")}月${String(day).padStart(2, "0")}日`,
      ];
      const sheet = meta.sheets.find((s) => candidates.includes(s.properties.title));
      return { gid: sheet?.properties.sheetId ?? null, title: sheet?.properties.title ?? null };
    }),

    // 一括登録（管理者のみ）
    batchUpsert: protectedProcedure
      .input(
        z.object({
          yearMonth: z.string().regex(/^\d{4}-\d{2}$/, "年月はYYYY-MM形式で入力してください"),
          links: z.array(
            z.object({
              linkKey: z.string().min(1).max(100),
              label: z.string().min(1).max(100),
              url: z.string().url({ message: "有効なURLを入力してください" }),
              color: z.string().max(50).optional(),
            })
          ).min(1).max(20),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const results = await Promise.all(
          input.links.map((link) =>
            upsertSpreadsheetLink({
              linkKey: link.linkKey,
              label: link.label,
              yearMonth: input.yearMonth,
              url: link.url,
              color: link.color ?? "text-emerald-600",
              createdBy: ctx.user.id,
            })
          )
        );
        broadcastEvent("spreadsheetLinks");
        return { success: true, count: results.length };
      }),
  }),

  // スケジュールスクリーンショット
  schedule: router({
    // 全チーム・全日程のスクショ一覧を取得
    getAll: publicProcedure.query(async () => {
      const screenshots = await getAllScreenshots();
      return screenshots.map((s) => ({
        id: s.id,
        team: s.team,
        day: s.day,
        // imageUrlがdata:URLの場合は専用エンドポイントのURLに変換（Base64データをレスポンスに含めない）
        imageUrl: s.imageUrl?.startsWith("data:") ? `/api/screenshot/${s.id}` : s.imageUrl,
        uploadedByName: s.uploadedByName,
        updatedAt: s.updatedAt,
      }));
    }),

    // スクショをアップロード（S3に保存してDBに記録）
    upload: protectedProcedure
      .input(
        z.object({
          team: z.enum(["身体", "天理", "郡山北部", "郡山南部"]),
          day: z.enum(["今日", "明日"]),
          // base64エンコードされた画像データ（data:image/xxx;base64,... 形式）
          imageDataUrl: z.string().max(20 * 1024 * 1024), // 最大20MB（base64）
          mimeType: z.string().default("image/png"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // base64デコード
        const base64Data = input.imageDataUrl.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");

        if (buffer.length > 10 * 1024 * 1024) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "ファイルサイズは10MB以下にしてください" });
        }

        // S3ストレージが利用可能な場合はアップロード、そうでなければDBに直接保存
        const hasStorage = !!(process.env.BUILT_IN_FORGE_API_URL && process.env.BUILT_IN_FORGE_API_KEY);

        let imageUrl: string;
        let imageKey: string;
        let imageData: string | undefined;

        if (hasStorage) {
          // S3にアップロード
          const ext = input.mimeType.split("/")[1] ?? "png";
          const key = `schedule-screenshots/${input.team}-${input.day}-${randomSuffix()}.${ext}`;
          const result = await storagePut(key, buffer, input.mimeType);
          imageUrl = result.url;
          imageKey = key;
        } else {
          // S3がない場合：Base64データをDBに直接保存
          imageData = input.imageDataUrl; // data:image/xxx;base64,...形式で保存
          imageKey = `db-${input.team}-${input.day}`;
          // imageUrlは後でDBのIDが確定してから /api/screenshot/:id に設定するため一時的にプレースホルダー
          imageUrl = `__db__`; // upsert後にIDで上書き
        }

        // DBにアップサート
        const recordId = await upsertScreenshot({
          team: input.team,
          day: input.day,
          imageUrl,
          imageKey,
          imageData,
          uploadedBy: ctx.user.id,
          uploadedByName: ctx.user.name ?? "不明",
        });

        // S3なし環境の場合、DBのIDが確定したので imageUrl を /api/screenshot/:id に更新
        if (!hasStorage && recordId) {
          await updateScreenshotUrl(recordId, `/api/screenshot/${recordId}`);
          imageUrl = `/api/screenshot/${recordId}`;
        }

        // アップロード履歴を記録
        await createScreenshotUploadLog({
          team: input.team,
          day: input.day,
          uploadedBy: ctx.user.id,
          uploadedByName: ctx.user.name ?? "不明",
        });

        // スケジュール更新通知を生成
        const notifBody = `${ctx.user.name ?? "不明"}さんが${input.team}チームの${input.day}のスケジュールを更新しました`;
        await createNotification({
          type: "schedule_updated",
          title: `スケジュールが更新されました`,
          body: notifBody,
        });

        // Web Push通知を送信（非同期でエラーを無視）
        try {
          const { sendPushToAll } = await import("./pushNotification");
          await sendPushToAll(
            {
              title: "📷 スケジュールが更新されました",
              body: notifBody,
              url: "/",
            },
            input.team // チームフィルター用に更新チームを渡す
          );
        } catch (e) {
          console.error("[WebPush] failed to send push:", e);
        }

        broadcastEvent("schedules");
        return { success: true, url: imageUrl };
      }),

    // スクショを削除
    delete: protectedProcedure
      .input(
        z.object({
          team: z.enum(["\u8eab\u4f53", "\u5929\u7406", "\u90e1\u5c71\u5317\u90e8", "\u90e1\u5c71\u5357\u90e8"]),
          day: z.enum(["\u4eca\u65e5", "\u660e\u65e5"]),
        })
      )
      .mutation(async ({ input }) => {
        await deleteScreenshot(input.team, input.day);
        broadcastEvent("schedules");
        return { success: true };
      }),

    // 23:59に実行: 今日を削除し、明日を今日に移動（管理者のみ、またはcronから呼び出し）
    rotateDailyScreenshots: protectedProcedure.mutation(async () => {
      await deleteAllTodayScreenshots();
      await moveTomorrowToToday();
      broadcastEvent("schedules");
      return { success: true };
    }),

    // アップロード履歴を取得（最新N件）
    getUploadLogs: publicProcedure
      .input(z.object({ limit: z.number().min(1).max(50).default(20) }).optional())
      .query(async ({ input }) => {
        const logs = await getRecentScreenshotUploadLogs(input?.limit ?? 20);
        return logs.map((l) => ({
          id: l.id,
           team: l.team,
          day: l.day,
          uploadedByName: l.uploadedByName,
          createdAt: l.createdAt,
        }));
      }),

    // ========== コメント・申し送り ==========
    getComments: publicProcedure
      .input(z.object({
        team: z.enum(["身体", "天理", "郡山北部", "郡山南部"]),
        day: z.enum(["今日", "明日"]),
      }))
      .query(async ({ input }) => {
        const comments = await getScheduleComments(input.team, input.day);
        if (comments.length === 0) return [];
        const ids = comments.map((c) => c.id);
        const reactions = await getScheduleCommentReactions(ids);
        return comments.map((c) => ({
          ...c,
          reactions: reactions.filter((r) => r.commentId === c.id),
        }));
      }),

    addComment: protectedProcedure
      .input(z.object({
        team: z.enum(["身体", "天理", "郡山北部", "郡山南部"]),
        day: z.enum(["今日", "明日"]),
        content: z.string().min(1).max(500),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await addScheduleComment({
          team: input.team,
          day: input.day,
          content: input.content,
          userId: ctx.user.id,
          userName: ctx.user.name ?? "名前未設定",
        });
        // プッシュ通知を送信（非同期・エラーは無視）
        try {
          const { sendPushToAll } = await import("./pushNotification");
          const preview = input.content.length > 40 ? input.content.slice(0, 40) + "…" : input.content;
          await sendPushToAll(
            {
              title: `📋 ${input.team}チーム（${input.day}）に申し送りが届きました`,
              body: `${ctx.user.name ?? "スタッフ"}: ${preview}`,
              url: "/",
            },
            input.team
          );
        } catch (e) {
          console.warn("[Comment Push] 通知送信失敗:", e);
        }
        broadcastEvent("scheduleComments");
        return { id };
      }),

    deleteComment: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await deleteScheduleComment(input.id, ctx.user.id);
        broadcastEvent("scheduleComments");
        return { success: true };
      }),
    updateComment: protectedProcedure
      .input(z.object({
        id: z.number(),
        content: z.string().min(1).max(500),
      }))
      .mutation(async ({ ctx, input }) => {
        await updateScheduleComment(input.id, ctx.user.id, input.content);
        broadcastEvent("scheduleComments");
        return { success: true };
      }),
    toggleReaction: protectedProcedure
      .input(z.object({
        commentId: z.number(),
        emoji: z.string().min(1).max(10),
      }))
      .mutation(async ({ ctx, input }) => {
        const result = await toggleScheduleCommentReaction(
          input.commentId,
          ctx.user.id,
          ctx.user.name ?? "名前未設定",
          input.emoji
        );
        broadcastEvent("scheduleComments");
        return result;
      }),

    getCommentCounts: publicProcedure
      .input(z.object({
        day: z.enum(["今日", "明日"]),
      }))
      .query(async ({ input }) => {
        return getScheduleCommentCounts(input.day);
      }),
  }),
  // ========== タスク ==========
  tasks: router({
    // 自分に関係するタスクを取得
    getMine: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const { eq } = await import("drizzle-orm");
      const { users } = await import("../drizzle/schema");
      const userRows = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
      const userTeam = userRows[0]?.team ?? null;
      return getMyTasks(ctx.user.id, userTeam);
    }),

    // タスクを作成する
    create: protectedProcedure
      .input(
        z.object({
          text: z.string().min(1).max(500),
          dueDate: z.date().optional(),
          assignType: z.enum(["all", "team", "personal"]).default("all"),
          assignTeam: z.enum(["身体", "天理", "郡山北部", "郡山南部"]).optional(),
          assignUserId: z.number().optional(),
          assignUserName: z.string().optional(),
          patientName: z.string().optional(),
          repeatType: z.enum(["none", "weekly", "monthly"]).default("none"),
          repeatDayOfWeek: z.number().min(0).max(6).optional(),
          repeatDayOfMonth: z.number().min(1).max(31).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const id = await createTask({
          text: input.text,
          dueDate: input.dueDate,
          assignType: input.assignType,
          assignTeam: input.assignTeam,
          assignUserId: input.assignUserId,
          assignUserName: input.assignUserName,
          patientName: input.patientName,
          repeatType: input.repeatType,
          repeatDayOfWeek: input.repeatDayOfWeek,
          repeatDayOfMonth: input.repeatDayOfMonth,
          createdBy: ctx.user.id,
          createdByName: ctx.user.name ?? "不明",
          done: 0,
        });
        // タスク追加通知を生成
        const assignLabel =
          input.assignType === "all" ? "全スタッフ" :
          input.assignType === "team" ? `${input.assignTeam ?? ""}チーム` :
          input.assignUserName ?? "個人指定";
        await createNotification({
          type: "task_today",
          title: `新しいタスクが追加されました`,
          body: `${ctx.user.name ?? "不明"}さんが「${input.text}」を${assignLabel}に追加しました`,
          resourceId: id,
        });
        broadcastEvent("tasks");
        return { success: true, id };
      }),

    // タスクの完了状態を切り替える
    toggle: protectedProcedure
      .input(z.object({ id: z.number(), done: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        await toggleTask(input.id, input.done, ctx.user.id);
        broadcastEvent("tasks");
        return { success: true };
      }),

    // タスクを削除する（作成者のみ）
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const task = await getTaskById(input.id);
        if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "タスクが見つかりません" });
        if (task.createdBy !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "作成者のみ削除できます" });
        }
        await deleteTaskDb(input.id, ctx.user.id);
        broadcastEvent("tasks");
        return { success: true };
      }),

    // タスクを更新（作成者のみ）
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          text: z.string().min(1).optional(),
          dueDate: z.date().nullable().optional(),
          assignType: z.enum(["all", "team", "personal"]).optional(),
          assignTeam: z.enum(["身体", "天理", "郡山北部", "郡山南部"]).nullable().optional(),
          assignUserId: z.number().nullable().optional(),
          assignUserName: z.string().nullable().optional(),
          patientName: z.string().nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const task = await getTaskById(input.id);
        if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "タスクが見つかりません" });
        if (task.createdBy !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "作成者のみ編集できます" });
        }
        const { id, ...data } = input;
        await updateTask(id, ctx.user.id, data);
        broadcastEvent("tasks");
        return { success: true };
      }),

    // スタッフ一覧を取得（個人指定用）
    getStaff: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const { eq } = await import("drizzle-orm");
      const { users } = await import("../drizzle/schema");
      const allUsers = await db.select({
        id: users.id,
        name: users.name,
        team: users.team,
      }).from(users);
      return allUsers;
    }),
    // 音声入力テキストからタスク内容・期日・指定先をAI解析
    parseVoice: protectedProcedure
      .input(z.object({
        text: z.string().min(1),
        patientNames: z.array(z.string()).optional(),
        patientNamesWithKana: z.array(z.object({ name: z.string(), kana: z.string() })).optional(),
        staffNames: z.array(z.string()).optional(),
      }))
      .mutation(async ({ input }) => {
        const { invokeLLM } = await import("./_core/llm");
        const today = new Date();
        const todayStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
        let patientListStr = '';
        if (input.patientNamesWithKana && input.patientNamesWithKana.length > 0) {
          const entries = input.patientNamesWithKana
            .map(p => p.kana ? `${p.name}（${p.kana}）` : p.name)
            .join('、');
          patientListStr = `\n\n登録済利用者リスト（この中から最も近い名前を選んでpatientNameに正式名を返すこと。姓のみ・読み仮名・略称で言及されても正式名を返すこと）:\n${entries}`;
        } else if (input.patientNames && input.patientNames.length > 0) {
          patientListStr = `\n\n登録済利用者リスト（この中から最も近い名前を選んでpatientNameに返すこと）:\n${input.patientNames.join('、')}`;
        }
        const staffListStr = input.staffNames && input.staffNames.length > 0
          ? `\n\n登録済みスタッフリスト（assignPersonNameはこの中から選ぶこと）:\n${input.staffNames.join('、')}`
          : '';
        const systemPrompt = `あなたは訪問看護ステーションの業務アシスタントです。スタッフが音声で伝えた内容から、タスクの各項目を抽出してJSONで返してください。
今日は${todayStr}です。日時は「明日」「来週月曜」「今月末」などの相対表現も解釈してYYYY-MM-DD形式で返してください。
重要：音声入力では言い間違いを訂正する場合があります。以下のような訂正・言い直しを示す表現がある場合は、その後に続く内容（最後に言及された内容）を正しい値として採用してください。
訂正表現の例：「じゃなくて」「ではなく」「違います」「違う」「あ、違う」「間違えました」「間違い」「取り消して」「やっぱり」「やっぱ」「えーと」「あ、えーと」「そうじゃなくて」「ちがう」「いや」「いや、違う」「ごめん」「ごめんなさい」「訂正します」「訂正して」「修正して」「変えて」「なくて」「じゃなく」「ではなくて」「でなく」「でなくて」「ちょっと待って」「待って」「ちょっと待ってください」「もう一度」「もう一回」「やり直し」「やり直して」「最初から」「リセット」「キャンセル」「なしで」「なしにして」「消して」「削除して」「戻して」「前に戻って」「そうではなくて」「そうじゃない」「そうじゃないです」「そうではない」「そうではありません」「別の」「別にして」「他の」「他にして」「違う人」「違う名前」「違う日」「違う時間」「違う日時」「ではなかった」「じゃなかった」「ではありません」「じゃありません」「ではないです」「じゃないです」「ちゃう」「ちゃうちゃう」「あかん」「あかんあかん」「ちゃうんちゃう」「ちゃうわ」「ちゃいます」「ちゃいますよ」「ちゃうで」「ちゃうやん」「ちゃうやろ」「ちゃうんや」「ちゃうんです」「ちゃうかな」「ちゃうかも」「あれちゃう」「それちゃう」「ちゃうかった」「ちゃうかったわ」「ちゃうかったです」「違うわ」「違うやん」「違うやろ」「違うんや」「違うんちゃう」「違うかな」「違うかも」「違うかった」「あ、ちゃう」「あ、ちゃうちゃう」「ちゃうちゃう、」「あかんわ」「あかんやん」「あかんやろ」「それあかん」「それはあかん」「それちゃうわ」「それちゃうやん」「それちゃうやろ」「それちゃうんや」「それちゃうんちゃう」「それちゃうかな」「それちゃうかも」「それちゃうかった」
抽出項目:
- text: タスク内容・やることの説明（必須）。利用者名は含めず、行為・作業内容のみを記載すること（例：「中尾さんの自立支援の受給者証の写真を撮る」→「自立支援の受給者証の写真を撮る」）
- dueDateStr: 期日日付（YYYY-MM-DD形式）。不明な場合はnull
- assignType: 指定先の種別。「全員」「全スタッフ」「全体」など→all、「身体チーム」「身体」「天理チーム」「天理」「郡山北部チーム」「北部」「郡山南部チーム」「南部」などチームを指す表現→team、登録済みスタッフリストに含まれるスタッフ名が明示された場合→personal。重要：利用者（患者）の名前は利用者リストに登録されており、assignTypeには影響しない。利用者名だけでチーム名がない場合はall。不明な場合はall
- assignTeam: assignTypeがteamの場合のチーム名。「身体」「身体チーム」→身体、「天理」「天理チーム」→天理、「郡山北部」「北部」「北部チーム」→郡山北部、「郡山南部」「南部」「南部チーム」→郡山南部。不明な場合はnull
- assignPersonName: assignTypeがpersonalの場合の担当者名（姓のみで可）。必ず登録済みスタッフリストに含まれる名前のみ設定すること。利用者名は設定しないこと。不明な場合はnull
- patientName: 利用者（患者）の名前。「○○さん」「○○の」など利用者を指す表現から抽出。利用者リストがある場合はリストから最も近い名前を完全な形で返す（姓のみ・読み仮名・略称で言及されても正式名を返す）。ただし、同じ姓の利用者が複数登録されている場合や、姓のみで言及された場合は姓のみを返すこと（例：登録利用者に「森本孝枝」「森本太郎」がいる場合に「森本さん」→「森本」と返す）。担当スタッフ名と混同しないこと。不明な場合はnull
不明な項目はnullを返してください。必ず有効なJSONのみを返してください。${patientListStr}${staffListStr}`;
        const res = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: input.text },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "task_fields",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  dueDateStr: { type: ["string", "null"] },
                  assignType: { type: "string", enum: ["all", "team", "personal"] },
                  assignTeam: { type: ["string", "null"] },
                  assignPersonName: { type: ["string", "null"] },
                  patientName: { type: ["string", "null"] },
                },
                required: ["text", "dueDateStr", "assignType", "assignTeam", "assignPersonName", "patientName"],
                additionalProperties: false,
              },
            },
          },
        });
        const rawContent = res.choices?.[0]?.message?.content;
        const content = typeof rawContent === "string" ? rawContent : null;
        if (!content) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI解析に失敗しました" });
        try {
          const parsed = JSON.parse(content);
          return { success: true, fields: parsed };
        } catch {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AIの応答を解析できませんでした" });
        }
      }),
  }),
  // ========== メッセージ ===========
  messages: router({
    // 現在表示すべきメッセージ一覧（リアクション付き）
    getActive: protectedProcedure.query(async () => {
      // 期限切れを先に自動削除
      await expireMessages();
      const msgs = await getActiveMessages();
      if (msgs.length === 0) return [];
      const ids = msgs.map((m) => m.id);
      const reactions = await getReactionsByMessageIds(ids);
      return msgs.map((m) => ({
        ...m,
        reactions: reactions.filter((r) => r.messageId === m.id),
      }));
    }),

    // 予約送信待ちメッセージ一覧（まだ送信されていないもの）
    getPending: protectedProcedure.query(async () => {
      const msgs = await getPendingMessages();
      return msgs;
    }),

    // メッセージを作成する
    create: protectedProcedure
      .input(
        z.object({
          text: z.string().min(1).max(1000),
          displayFrom: z.date().optional(),
          displayUntil: z.date().optional(),
          scheduledAt: z.date().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const id = await createMessage({
          text: input.text,
          createdBy: ctx.user.id,
          createdByName: ctx.user.name ?? "不明",
          displayFrom: input.displayFrom,
          displayUntil: input.displayUntil,
          scheduledAt: input.scheduledAt,
        });
        // 新着メッセージ通知を生成
        const preview = input.text.length > 40 ? input.text.slice(0, 40) + "…" : input.text;
        await createNotification({
          type: "new_message",
          title: `新しいメッセージが追加されました`,
          body: `${ctx.user.name ?? "不明"}さん：「${preview}」`,
          resourceId: id,
        });
        broadcastEvent("messages");
        return { success: true, id };
      }),

    // メッセージを手動削除する（作成者または管理者）
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const msg = await getMessageById(input.id);
        if (!msg) throw new TRPCError({ code: "NOT_FOUND", message: "メッセージが見つかりません" });
        // 管理者は全員分削除可能、それ以外は作成者のみ
        if (ctx.user.role !== "admin" && msg.createdBy !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "作成者または管理者のみ削除できます" });
        }
        await softDeleteMessage(input.id, ctx.user.id);
        broadcastEvent("messages");
        return { success: true };
      }),

    // メッセージを編集する（作成者または管理者）
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          text: z.string().min(1).max(1000),
          displayFrom: z.date().optional().nullable(),
          displayUntil: z.date().optional().nullable(),
          scheduledAt: z.date().optional().nullable(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const msg = await getMessageById(input.id);
        if (!msg) throw new TRPCError({ code: "NOT_FOUND", message: "メッセージが見つかりません" });
        // 管理者は全員分編集可能、それ以外は作成者のみ
        if (ctx.user.role !== "admin" && msg.createdBy !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "作成者または管理者のみ編集できます" });
        }
        await updateMessage(input.id, ctx.user.id, {
          text: input.text,
          displayFrom: input.displayFrom ?? null,
          displayUntil: input.displayUntil ?? null,
          scheduledAt: input.scheduledAt ?? null,
        });
        broadcastEvent("messages");
        return { success: true };
      }),

    // リアクションをトグルする
    toggleReaction: protectedProcedure
      .input(z.object({ messageId: z.number(), emoji: z.string().max(10) }))
      .mutation(async ({ ctx, input }) => {
        broadcastEvent("messages");
        const result = await toggleReaction(
          input.messageId,
          ctx.user.id,
          ctx.user.name ?? "不明",
          input.emoji
        );
        return result;
      }),
    // 音声テキストからメッセージ各項目を抽出する
    parseVoice: protectedProcedure
      .input(z.object({ text: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const { invokeLLM } = await import("./_core/llm");
        const today = new Date();
        const todayStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
        const systemPrompt = `あなたは訪問看護ステーションの業務アシスタントです。スタッフが音声で伝えた内容から、申し送りメッセージの各項目を抽出してJSONで返してください。
今日は${todayStr}です。日時は「明日」「来週月曜」「今月末」などの相対表現も解釈してYYYY-MM-DD形式、時刻はHH:mm形式で返してください。
抽出項目:
- text: メッセージ本文（必須）。音声から読み取れる内容を自然な文章にまとめてください
- displayFromDate: 表示開始日（YYYY-MM-DD形式）。「〜から表示」「〜以降」などが含まれる場合に抽出。不明な場合はnull
- displayFromTime: 表示開始時刻（HH:mm形式）。不明な場合はnull
- displayUntilDate: 表示終了日（YYYY-MM-DD形式）。「〜まで」「〜以降は削除」などが含まれる場合に抽出。不明な場合はnull
- displayUntilTime: 表示終了時刻（HH:mm形式）。不明な場合はnull
- scheduledAtDate: 予約送信日（YYYY-MM-DD形式）。「〜に送信」「〜に投稿」などが含まれる場合に抽出。不明な場合はnull
- scheduledAtTime: 予約送信時刻（HH:mm形式）。不明な場合はnull
不明な項目はnullを返してください。必ず有効なJSONのみを返してください。`;
        const res = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: input.text },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "message_fields",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  displayFromDate: { type: ["string", "null"] },
                  displayFromTime: { type: ["string", "null"] },
                  displayUntilDate: { type: ["string", "null"] },
                  displayUntilTime: { type: ["string", "null"] },
                  scheduledAtDate: { type: ["string", "null"] },
                  scheduledAtTime: { type: ["string", "null"] },
                },
                required: ["text", "displayFromDate", "displayFromTime", "displayUntilDate", "displayUntilTime", "scheduledAtDate", "scheduledAtTime"],
                additionalProperties: false,
              },
            },
          },
        });
        const rawContent = res.choices?.[0]?.message?.content;
        const content = typeof rawContent === "string" ? rawContent : null;
        if (!content) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI解析に失敗しました" });
        try {
          const parsed = JSON.parse(content);
          return { success: true, fields: parsed };
        } catch {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AIの応答を解析できませんでした" });
        }
      }),
  }),  // ========== Web Push通知 ==========
  push: router({
    // VAPID公開鍵を返す
    getVapidPublicKey: publicProcedure.query(async () => {
      const { ENV } = await import("./_core/env");
      return { publicKey: ENV.vapidPublicKey ?? "" };
    }),
    // サブスクリプションを登録
    subscribe: protectedProcedure
      .input(z.object({
        endpoint: z.string().url(),
        p256dh: z.string(),
        auth: z.string(),
        /** null = 全チーム、文字列 = 指定チームのみ */
        teamFilter: z.string().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { saveSubscription } = await import("./pushNotification");
        await saveSubscription({
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          auth: input.auth,
          userId: ctx.user.id,
          userName: ctx.user.name ?? undefined,
          teamFilter: input.teamFilter ?? null,
        });
        return { success: true };
      }),
    // サブスクリプションを解除
    unsubscribe: protectedProcedure
      .input(z.object({ endpoint: z.string() }))
      .mutation(async ({ input }) => {
        const { deleteSubscription } = await import("./pushNotification");
        await deleteSubscription(input.endpoint);
        return { success: true };
      }),
  }),

  // ========== スタッフ管理 ==========
  patients: router({
    // 利用者一覧を取得（チーム絞り込み可）
    list: protectedProcedure
      .input(z.object({ team: z.enum(["身体", "天理", "郡山北部", "郡山南部"]).optional() }))
      .query(async ({ input }) => {
        return getPatients(input.team);
      }),

    // 利用者を名前で検索
    search: protectedProcedure
      .input(z.object({ query: z.string(), team: z.enum(["身体", "天理", "郡山北部", "郡山南部"]).optional() }))
      .query(async ({ input }) => {
        return searchPatients(input.query, input.team);
      }),

    // 利用者を追加（管理者のみ）
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(100),
        nameKana: z.string().max(100).optional(),
        team: z.enum(["身体", "天理", "郡山北部", "郡山南部"]),
      }))
      .mutation(async ({ input }) => {
        const id = await createPatient({ name: input.name, nameKana: input.nameKana, team: input.team, active: 1 });
        broadcastEvent("patients");
        return { success: true, id };
      }),

    // 利用者を更新
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(100).optional(),
        nameKana: z.string().max(100).optional(),
        team: z.enum(["\u8eab\u4f53", "\u5929\u7406", "\u90e1\u5c71\u5317\u90e8", "\u90e1\u5c71\u5357\u90e8"]).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updatePatient(id, data);
        broadcastEvent("patients");
        return { success: true };
      }),

    // 全利用者を取得（退所済も含む）
    listAll: protectedProcedure
      .input(z.object({ team: z.enum(["\u8eab\u4f53", "\u5929\u7406", "\u90e1\u5c71\u5317\u90e8", "\u90e1\u5c71\u5357\u90e8"]).optional() }))
      .query(async ({ input }) => {
        return getAllPatientsIncludingInactive(input.team);
      }),

    // 利用者を退所扱いにする（active=0）
    deactivate: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deactivatePatient(input.id);
        broadcastEvent("patients");
        return { success: true };
      }),

    // 利用者を復帰させる（active=1）
    activate: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await updatePatient(input.id, { active: 1 });
        broadcastEvent("patients");
        return { success: true };
      }),

    // 利用者を一括登録
    batchCreate: protectedProcedure
      .input(z.object({
        patients: z.array(z.object({
          name: z.string().min(1).max(100),
          nameKana: z.string().max(100).optional(),
          team: z.enum(["\u8eab\u4f53", "\u5929\u7406", "\u90e1\u5c71\u5317\u90e8", "\u90e1\u5c71\u5357\u90e8"]),
        })).min(1).max(100),
      }))
      .mutation(async ({ input }) => {
        const results = await Promise.all(
          input.patients.map(p => createPatient({ name: p.name, nameKana: p.nameKana, team: p.team, active: 1 }))
        );
        broadcastEvent("patients");
        return { success: true, count: results.length };
      }),
  }),

  // ========== 訪問記録 ==========
  visitRecords: router({
    // 訪問記録を作成する
    create: protectedProcedure
      .input(z.object({
        patientId: z.number().optional(),
        patientName: z.string(),
        team: z.enum(["身体", "天理", "郡山北部", "郡山南部"]),
        clinicalNotes: z.string().optional(),
        nextVisitAt: z.date().optional(),
        notifiedTo: z.enum(["本人", "家族", "その他"]).optional(),
        notifiedToOther: z.string().optional(),
        notifyMethod: z.enum(["口頭", "カレンダー記入", "付箋", "電話", "その他"]).optional(),
        notifyMethodOther: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await createVisitRecord({
          ...input,
          createdBy: ctx.user.id,
          createdByName: ctx.user.name ?? "不明",
        });
        broadcastEvent("visitRecords");
        return { success: true, id };
      }),

    // 自分の訪問記録一覧を取得
    getMine: protectedProcedure.query(async ({ ctx }) => {
      return getVisitRecords(ctx.user.id);
    }),

    // スプレッドシート転送済みフラグを更新
    markExported: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await markVisitRecordExported(input.id);
        broadcastEvent("visitRecords");
        return { success: true };
      }),

    // スプレッドシートに転送する
    exportToSheet: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const record = await getVisitRecordById(input.id);
        if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "記録が見つかりません" });

        const VISIT_RECORD_SHEET_ID = "1WOZQ5rI0Fu57nWaiGwComPS_DdEwPgNR6zeOmyrqKpo"; // ひなた_次回訪問日時
        const SHEET_NAME = "シート1";

        // サービスアカウント認証
        const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
        const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
        if (!email || !privateKey) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "サービスアカウント設定がありません" });

        const { GoogleAuth } = await import("google-auth-library");
        const auth = new GoogleAuth({
          credentials: { client_email: email, private_key: privateKey.replace(/\\n/g, "\n") },
          scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });
        const client = await auth.getClient();
        const token = await client.getAccessToken();
        if (!token.token) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "認証トークン取得失敗" });

        // 日時フォーマット（JST: UTC+9 に変換して書き込む）
        const formatDate = (val: Date | number | null | undefined) => {
          if (!val) return "";
          const d = val instanceof Date ? val : new Date(val);
          // UTC+9（JST）に変換
          const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
          return `${jst.getUTCFullYear()}/${String(jst.getUTCMonth()+1).padStart(2,"0")}/${String(jst.getUTCDate()).padStart(2,"0")} ${String(jst.getUTCHours()).padStart(2,"0")}:${String(jst.getUTCMinutes()).padStart(2,"0")}`;
        };

        // ヘッダー行の定義（ダッシュボード入力項目と整合）
        const HEADER_ROW = [
          "転送日時",
          "担当者",
          "チーム",
          "利用者名",
          "次回訪問日時",
          "伝達先",
          "伝達先（その他）",
          "伝達方法",
          "伝達方法（その他）",
        ];
        const row = [
          formatDate(record.createdAt),
          record.createdByName ?? "",
          record.team ?? "",
          record.patientName ?? "",
          formatDate(record.nextVisitAt),
          record.notifiedTo ?? "",
          record.notifiedToOther ?? "",
          record.notifyMethod ?? "",
          record.notifyMethodOther ?? "",
        ];

        // 現在のシートの内容を確認してヘッダー行がなければ先に書き込む
        const checkUrl = `https://sheets.googleapis.com/v4/spreadsheets/${VISIT_RECORD_SHEET_ID}/values/${encodeURIComponent(SHEET_NAME + "!A1")}?valueRenderOption=UNFORMATTED_VALUE`;
        const checkRes = await fetch(checkUrl, {
          headers: { Authorization: `Bearer ${token.token}` },
        });
        const checkData = checkRes.ok ? await checkRes.json() as { values?: string[][] } : { values: [] };
        const firstCell = checkData.values?.[0]?.[0] ?? "";
        if (firstCell !== "転送日時") {
          // ヘッダー行を1行目に書き込む
          const headerUrl = `https://sheets.googleapis.com/v4/spreadsheets/${VISIT_RECORD_SHEET_ID}/values/${encodeURIComponent(SHEET_NAME + "!A1")}?valueInputOption=USER_ENTERED`;
          await fetch(headerUrl, {
            method: "PUT",
            headers: { Authorization: `Bearer ${token.token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ values: [HEADER_ROW] }),
          });
        }

        const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${VISIT_RECORD_SHEET_ID}/values/${encodeURIComponent(SHEET_NAME + "!A:J")}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
        const res = await fetch(appendUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${token.token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ values: [row] }),
        });
        if (!res.ok) {
          const text = await res.text();
          let userMessage = "スプレッドシートへの転送に失敗しました";
          let errorCode: "INTERNAL_SERVER_ERROR" | "FORBIDDEN" | "UNAUTHORIZED" = "INTERNAL_SERVER_ERROR";
          try {
            const errJson = JSON.parse(text);
            const status = res.status;
            const errMsg = errJson?.error?.message ?? "";
            if (status === 401 || status === 403) {
              errorCode = "FORBIDDEN";
              userMessage = "スプレッドシートへのアクセス権限がありません。管理者にお問い合わせください。";
            } else if (status === 404) {
              userMessage = "スプレッドシートが見つかりません。URLや共有設定を確認してください。";
            } else if (status === 429) {
              userMessage = "APIの利用制限に達しました。しばらく待ってから再試行してください。";
            } else if (errMsg.includes("RESOURCE_EXHAUSTED")) {
              userMessage = "APIの利用制限に達しました。しばらく待ってから再試行してください。";
            } else if (errMsg.includes("SERVICE_UNAVAILABLE") || status >= 500) {
              userMessage = "Googleのサービスが一時的に利用できません。しばらく待ってから再試行してください。";
            } else if (errMsg) {
              userMessage = `転送エラー: ${errMsg}`;
            }
          } catch {
            // JSONパース失敗時はデフォルトメッセージを使用
          }
          throw new TRPCError({ code: errorCode, message: userMessage });
        }

        // シートIDを取得してヘッダー書式・列幅・オートフィルターを設定（初回転送時のみ実行）
        try {
          const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${VISIT_RECORD_SHEET_ID}?fields=sheets.properties`, {
            headers: { Authorization: `Bearer ${token.token}` },
          });
          if (metaRes.ok) {
            const meta = await metaRes.json();
            const sheetId = meta.sheets?.[0]?.properties?.sheetId ?? 0;

            // 転送済み行数を取得して書式を適用
            const valuesRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${VISIT_RECORD_SHEET_ID}/values/${encodeURIComponent(SHEET_NAME + "!A:A")}`, {
              headers: { Authorization: `Bearer ${token.token}` },
            });
            const valuesData = valuesRes.ok ? await valuesRes.json() as { values?: string[][] } : { values: [] };
            const totalRows = (valuesData.values?.length ?? 1);
            const dataEndRow = Math.max(totalRows, 2); // データ行の終わり（最低2行）

            // batchUpdateで全書式を一括設定
            const batchBody = {
              requests: [
                // 1. ヘッダー行（1行目）：深青背景・白太字・中央揃え・フォントサイズ11
                {
                  repeatCell: {
                    range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 9 },
                    cell: {
                      userEnteredFormat: {
                        backgroundColor: { red: 0.165, green: 0.329, blue: 0.573 }, // #2A5492 深青
                        textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 11, fontFamily: "Noto Sans JP" },
                        horizontalAlignment: "CENTER",
                        verticalAlignment: "MIDDLE",
                        wrapStrategy: "WRAP",
                        padding: { top: 6, bottom: 6, left: 6, right: 6 },
                      },
                    },
                    fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy,padding)",
                  },
                },
                // 2. データ行全体：フォント・垂直中央・パディング
                {
                  repeatCell: {
                    range: { sheetId, startRowIndex: 1, endRowIndex: dataEndRow, startColumnIndex: 0, endColumnIndex: 9 },
                    cell: {
                      userEnteredFormat: {
                        textFormat: { fontSize: 10, fontFamily: "Noto Sans JP" },
                        verticalAlignment: "MIDDLE",
                        padding: { top: 4, bottom: 4, left: 6, right: 6 },
                      },
                    },
                    fields: "userEnteredFormat(textFormat,verticalAlignment,padding)",
                  },
                },
                // 3. 伝達方法（その他）列（I列）のみテキスト折り返し
                {
                  repeatCell: {
                    range: { sheetId, startRowIndex: 1, endRowIndex: dataEndRow, startColumnIndex: 8, endColumnIndex: 9 },
                    cell: {
                      userEnteredFormat: {
                        wrapStrategy: "WRAP",
                      },
                    },
                    fields: "userEnteredFormat.wrapStrategy",
                  },
                },
                // 4. 奇数行（データ行）：白背景
                ...Array.from({ length: Math.ceil((dataEndRow - 1) / 2) }, (_, i) => ({
                  repeatCell: {
                    range: { sheetId, startRowIndex: 1 + i * 2, endRowIndex: Math.min(2 + i * 2, dataEndRow), startColumnIndex: 0, endColumnIndex: 9 },
                    cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 1, blue: 1 } } },
                    fields: "userEnteredFormat.backgroundColor",
                  },
                })),
                // 5. 偶数行（データ行）：極淡青背景 #EBF3FB
                ...Array.from({ length: Math.floor((dataEndRow - 1) / 2) }, (_, i) => ({
                  repeatCell: {
                    range: { sheetId, startRowIndex: 2 + i * 2, endRowIndex: Math.min(3 + i * 2, dataEndRow), startColumnIndex: 0, endColumnIndex: 9 },
                    cell: { userEnteredFormat: { backgroundColor: { red: 0.922, green: 0.953, blue: 0.984 } } },
                    fields: "userEnteredFormat.backgroundColor",
                  },
                })),
                // 6. 全セルに枠線を追加
                {
                  updateBorders: {
                    range: { sheetId, startRowIndex: 0, endRowIndex: dataEndRow, startColumnIndex: 0, endColumnIndex: 9 },
                    top:    { style: "SOLID", width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
                    bottom: { style: "SOLID", width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
                    left:   { style: "SOLID", width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
                    right:  { style: "SOLID", width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
                    innerHorizontal: { style: "SOLID", width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
                    innerVertical:   { style: "SOLID", width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
                  },
                },
                // 7. 列幅を内容に合わせて設定
                { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 150 }, fields: "pixelSize" } }, // 転送日時
                { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 1, endIndex: 2 }, properties: { pixelSize: 100 }, fields: "pixelSize" } }, // 担当者
                { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 2, endIndex: 3 }, properties: { pixelSize: 100 }, fields: "pixelSize" } }, // チーム
                { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 3, endIndex: 4 }, properties: { pixelSize: 130 }, fields: "pixelSize" } }, // 利用者名
                { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 4, endIndex: 5 }, properties: { pixelSize: 150 }, fields: "pixelSize" } }, // 次回訪問日時
                { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 5, endIndex: 6 }, properties: { pixelSize: 100 }, fields: "pixelSize" } }, // 伝達先
                { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 6, endIndex: 7 }, properties: { pixelSize: 130 }, fields: "pixelSize" } }, // 伝達先(その他)
                { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 7, endIndex: 8 }, properties: { pixelSize: 110 }, fields: "pixelSize" } }, // 伝達方法
                { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 8, endIndex: 9 }, properties: { pixelSize: 130 }, fields: "pixelSize" } }, // 伝達方法(その他)

                // 8. 行の高さ：ヘッダー行を少し高めに
                { updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 36 }, fields: "pixelSize" } },
                // 9. オートフィルターを設定（全列）
                {
                  setBasicFilter: {
                    filter: {
                      range: { sheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: 9 },
                    },
                  },
                },
                // 10. ヘッダー行を固定（フリーズ）
                {
                  updateSheetProperties: {
                    properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
                    fields: "gridProperties.frozenRowCount",
                  },
                },
                // 11. 転送日時（A列）に日時書式を設定
                {
                  repeatCell: {
                    range: { sheetId, startRowIndex: 1, endRowIndex: dataEndRow, startColumnIndex: 0, endColumnIndex: 1 },
                    cell: {
                      userEnteredFormat: {
                        numberFormat: { type: "DATE_TIME", pattern: "yyyy/mm/dd hh:mm" },
                      },
                    },
                    fields: "userEnteredFormat.numberFormat",
                  },
                },
                // 12. 次回訪問日時（E列）に日時書式を設定
                {
                  repeatCell: {
                    range: { sheetId, startRowIndex: 1, endRowIndex: dataEndRow, startColumnIndex: 4, endColumnIndex: 5 },
                    cell: {
                      userEnteredFormat: {
                        numberFormat: { type: "DATE_TIME", pattern: "yyyy/mm/dd hh:mm" },
                      },
                    },
                    fields: "userEnteredFormat.numberFormat",
                  },
                },
              ],
            };
            await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${VISIT_RECORD_SHEET_ID}:batchUpdate`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token.token}`, "Content-Type": "application/json" },
              body: JSON.stringify(batchBody),
            });
          }
        } catch {
          // 書式設定の失敗は転送自体に影響しない
        }

        // 転送済みフラグを立てる
        await markVisitRecordExported(input.id);
        return { success: true };
      }),

    // 転送済みフラグをリセット（未転送に戻す）
    unmarkExported: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await unmarkVisitRecordExported(input.id);
        broadcastEvent("visitRecords");
        return { success: true };
      }),

    // 音声テキストをLLMで解析し利用者名・次回訪問日時・伝達先・伝達方法を抽出する
    parseVisitVoice: protectedProcedure
      .input(z.object({
        text: z.string().min(1),
        patientNames: z.array(z.string()).optional(),
        patientNamesWithKana: z.array(z.object({ name: z.string(), kana: z.string() })).optional(),
        staffNames: z.array(z.string()).optional(),
      }))
      .mutation(async ({ input }) => {
        const { invokeLLM } = await import("./_core/llm");
        const today = new Date();
        const todayStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
        // 読み仮名付き利用者リストを構築（読み仮名があれば「正式名（読み）」形式で表示）
        let patientListStr = '';
        if (input.patientNamesWithKana && input.patientNamesWithKana.length > 0) {
          const entries = input.patientNamesWithKana
            .map(p => p.kana ? `${p.name}（${p.kana}）` : p.name)
            .join('、');
          patientListStr = `\n\n登録済利用者リスト（この中から最も近い名前を選んでpatientNameに正式名を返すこと。姓のみ・読み仮名・略称で言及されても正式名を返すこと）:\n${entries}`;
        } else if (input.patientNames && input.patientNames.length > 0) {
          patientListStr = `\n\n登録済利用者リスト（この中から最も近い名前を選んでpatientNameに返すこと。姓のみで言及されても正式名を返すこと）:\n${input.patientNames.join('、')}`;
        }
        const systemPrompt = `あなたは訪問看護ステーションの業務アシスタントです。スタッフが音声で伝えた内容から、利用者名・次回訪問日時・伝達先・伝達方法を抽出してJSONで返してください。
今日は${todayStr}です。日付は「明日」「明後日」「今日」などの相対表現も解釈してYYYY-MM-DD形式で返してください。時刻はHH:mm形式で返してください。
重要：音声入力では言い間違いを訂正する場合があります。以下のような訂正・言い直しを示す表現がある場合は、その後に続く内容（最後に言及された内容）を正しい値として採用してください。
訂正表現の例：「じゃなくて」「ではなく」「違います」「違う」「あ、違う」「間違えました」「間違い」「取り消して」「やっぱり」「やっぱ」「えーと」「あ、えーと」「そうじゃなくて」「ちがう」「いや」「いや、違う」「ごめん」「ごめんなさい」「訂正します」「訂正して」「修正して」「変えて」「なくて」「じゃなく」「ではなくて」「でなく」「でなくて」「ちょっと待って」「待って」「ちょっと待ってください」「もう一度」「もう一回」「やり直し」「やり直して」「最初から」「リセット」「キャンセル」「なしで」「なしにして」「消して」「削除して」「戻して」「前に戻って」「そうではなくて」「そうじゃない」「そうじゃないです」「そうではない」「そうではありません」「別の」「別にして」「他の」「他にして」「違う人」「違う名前」「違う日」「違う時間」「違う日時」「ではなかった」「じゃなかった」「ではありません」「じゃありません」「ではないです」「じゃないです」「ちゃう」「ちゃうちゃう」「あかん」「あかんあかん」「ちゃうんちゃう」「ちゃうわ」「ちゃいます」「ちゃいますよ」「ちゃうで」「ちゃうやん」「ちゃうやろ」「ちゃうんや」「ちゃうんです」「ちゃうかな」「ちゃうかも」「あれちゃう」「それちゃう」「ちゃうかった」「ちゃうかったわ」「ちゃうかったです」「違うわ」「違うやん」「違うやろ」「違うんや」「違うんちゃう」「違うかな」「違うかも」「違うかった」「あ、ちゃう」「あ、ちゃうちゃう」「ちゃうちゃう、」「あかんわ」「あかんやん」「あかんやろ」「それあかん」「それはあかん」「それちゃうわ」「それちゃうやん」「それちゃうやろ」「それちゃうんや」「それちゃうんちゃう」「それちゃうかな」「それちゃうかも」「それちゃうかった」
抽出項目:
- patientName: 利用者名。「○○さん」「○○の」など利用者を指す表現から抽出。利用者リストがある場合はリストから最も近い名前を完全な形で返す（姓のみ・読み仮名・略称で言及されても正式名を返す）。訂正表現がある場合は最後に言及された利用者名を使用すること。不明ならnull
- visitDate: 次回訪問日（YYYY-MM-DD形式）
- visitTime: 次回訪問時刻（HH:mm形式）
- notifiedTo: 伝達先。「本人」「家族」「その他」のいずれか。不明ならnull
- notifiedToOther: notifiedToが「その他」の場合の自由記述
- notifyMethod: 伝達方法。「口頭」「カレンダー記入」「付箋」「電話」「その他」のいずれか。不明ならnull
- notifyMethodOther: notifyMethodが「その他」の場合の自由記述
- team: 利用者が所属するチーム。「身体」「天理」「郡山北部」「郡山南部」のいずれか。「しんたい」「からだ」と言われたら「身体」、「てんり」と言われたら「天理」、「きたべ」「きたぶ」「北部」と言われたら「郡山北部」、「みなみ」「南部」と言われたら「郡山南部」を返す。不明ならnull
不明な項目はnullを返してください。必ず有効なJSONのみを返してください。${patientListStr}`;

        const res = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: input.text },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "visit_record_fields",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  patientName: { type: ["string", "null"] },
                  visitDate: { type: ["string", "null"] },
                  visitTime: { type: ["string", "null"] },
                  notifiedTo: { type: ["string", "null"] },
                  notifiedToOther: { type: ["string", "null"] },
                  notifyMethod: { type: ["string", "null"] },
                  notifyMethodOther: { type: ["string", "null"] },
                  team: { type: ["string", "null"] },
                },
                required: ["patientName", "visitDate", "visitTime", "notifiedTo", "notifiedToOther", "notifyMethod", "notifyMethodOther", "team"],
                additionalProperties: false,
              },
            },
          },
        });
        const rawContent = res.choices?.[0]?.message?.content;
        const content = typeof rawContent === "string" ? rawContent : null;
        if (!content) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI解析に失敗しました" });
        try {
          const parsed = JSON.parse(content) as {
            patientName: string | null;
            visitDate: string | null;
            visitTime: string | null;
            notifiedTo: string | null;
            notifiedToOther: string | null;
            notifyMethod: string | null;
            notifyMethodOther: string | null;
            team: string | null;
          };
          return { success: true, fields: parsed };
        } catch {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AIの応答を解析できませんでした" });
        }
      }),
  }),

  // ========== アプリ内通知 ==========
  notifications: router({
     // 未読通知一覧を取得（自分対象または全員対象のみ）
    getUnread: protectedProcedure.query(async ({ ctx }) => {
      return getUnreadNotifications(ctx.user.id);
    }),
    // 全通知一覧を取得（最新100件・自分対象または全員対象のみ）
    getAll: protectedProcedure.query(async ({ ctx }) => {
      return getAllNotifications(ctx.user.id);
    }),

    // 指定通知を既読にする
    markRead: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await markNotificationRead(input.id);
        broadcastEvent("notifications");
        return { success: true };
      }),

    // 全通知を既読にする
    markAllRead: protectedProcedure.mutation(async () => {
      await markAllNotificationsRead();
      broadcastEvent("notifications");
      return { success: true };
    }),
  }),

  // ========== スタッフ管理（管理者専用） ==========
  staff: router({
    // スタッフ一覧を取得（変更連絡フォーム用：全ユーザー可）
    listForForm: protectedProcedure.query(async () => {
      const all = await getAllStaff();
      return all.map(s => ({ id: s.id, name: s.name ?? "不明", team: s.team }));
    }),
    // スタッフ一覧を取得（管理者のみ）
    getAll: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "管理者権限が必要です" });
      }
      return getAllStaff();
    }),

    // スタッフアカウントを新規作成（管理者のみ）
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(50),
        email: z.string().email(),
        password: z.string().min(6).max(100),
        role: z.enum(["user", "admin"]).default("user"),
        team: z.enum(["身体", "天理", "郡山北部", "郡山南部", "事務員", "全チーム"]).default("身体"),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者権限が必要です" });
        }
        const bcrypt = await import("bcryptjs");
        const passwordHash = await bcrypt.hash(input.password, 12);
        try {
          await createStaffAccount({
            name: input.name,
            email: input.email,
            passwordHash,
            role: input.role,
            team: input.team,
          });
          return { success: true };
        } catch (err: any) {
          throw new TRPCError({ code: "BAD_REQUEST", message: err.message ?? "アカウント作成に失敗しました" });
        }
      }),

    // スタッフのパスワードをリセット（管理者のみ）
    resetPassword: protectedProcedure
      .input(z.object({
        userId: z.number(),
        newPassword: z.string().min(6).max(100),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者権限が必要です" });
        }
        const bcrypt = await import("bcryptjs");
        const newPasswordHash = await bcrypt.hash(input.newPassword, 12);
        await resetStaffPassword(input.userId, newPasswordHash);
        broadcastEvent("staff");
        return { success: true };
      }),

    // スタッフアカウントを削除（管理者のみ）
    delete: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者権限が必要です" });
        }
        if (input.userId === ctx.user.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "自分自身のアカウントは削除できません" });
        }
        await deleteStaffAccount(input.userId);
        broadcastEvent("staff");
        return { success: true };
      }),

    // スタッフのロールを変更（管理者のみ）
    updateRole: protectedProcedure
      .input(z.object({
        userId: z.number(),
        role: z.enum(["user", "admin"]),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者権限が必要です" });
        }
        await updateStaffRole(input.userId, input.role);
        broadcastEvent("staff");
        return { success: true };
      }),
    // スタッフのメールアドレスを変更（管理者のみ）
    updateEmail: protectedProcedure
      .input(z.object({
        userId: z.number(),
        email: z.string().email(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者権限が必要です" });
        }
        try {
          await updateStaffEmail(input.userId, input.email);
          broadcastEvent("staff");
          return { success: true };
        } catch (err: any) {
          throw new TRPCError({ code: "BAD_REQUEST", message: err.message ?? "メールアドレスの更新に失敗しました" });
        }
      }),

    // スタッフの基本情報を一括更新（管理者のみ）
    updateInfo: protectedProcedure
      .input(z.object({
        userId: z.number(),
        name: z.string().min(1).max(50),
        team: z.enum(["身体", "天理", "郡山北部", "郡山南部", "事務員", "全チーム"]),
        role: z.enum(["user", "admin"]),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者権限が必要です" });
        }
        await updateStaffInfo(input.userId, {
          name: input.name,
          team: input.team,
          role: input.role,
        });
        broadcastEvent("staff");
        return { success: true };
      }),
  }),

  // ========== Excelインポート ==========
  import: router({
    /**
     * Excelファイル（Base64）を受け取り、利用者・スタッフを一括登録する
     * 管理者のみ実行可能
     */
    excel: protectedProcedure
      .input(z.object({
        /** Base64エンコードされたExcelファイルデータ */
        fileBase64: z.string(),
        /** ファイル名（拡張子チェック用） */
        fileName: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        // 管理者チェック
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ実行できます" });
        }

        // ファイル拡張子チェック
        const ext = input.fileName.split(".").pop()?.toLowerCase();
        if (ext !== "xlsx" && ext !== "xls") {
          throw new TRPCError({ code: "BAD_REQUEST", message: ".xlsx または .xls ファイルのみ対応しています" });
        }

        // xlsxパッケージでパース
        const XLSX = await import("xlsx");
        const buffer = Buffer.from(input.fileBase64, "base64");
        const workbook = XLSX.read(buffer, { type: "buffer" });

        const VALID_TEAMS = ["身体", "天理", "郡山北部", "郡山南部"] as const;
        type ValidTeam = typeof VALID_TEAMS[number];
        const VALID_STAFF_TEAMS = ["身体", "天理", "郡山北部", "郡山南部", "事務員", "全チーム"] as const;
        type ValidStaffTeam = typeof VALID_STAFF_TEAMS[number];

        const result = {
          patients: { success: 0, skipped: 0, errors: [] as string[] },
          staff: { success: 0, skipped: 0, errors: [] as string[] },
        };

        // ===== 利用者シートのパース =====
        const patientSheet = workbook.Sheets["利用者"];
        if (patientSheet) {
          const rows = (XLSX.utils.sheet_to_json(patientSheet, {
            header: 1,
            defval: "",
            range: 6, // 7行目（0-indexed: 6）からヘッダー行
          }) as unknown) as unknown[][];

          // 8行目（index 1）以降がデータ（index 0がヘッダー）
          const dataRows = rows.slice(1);

          const patientsToCreate: Array<{ name: string; nameKana?: string; team: ValidTeam; active: number }> = [];
          const patientsToUpdate: Array<{ id: number; nameKana?: string; team: ValidTeam; active: number }> = [];

          // 既存利用者を全件取得（重複チェック用）
          const { getPatients } = await import("./db");
          const existingPatients = await getPatients(); // active=1のみ取得
          const existingMap = new Map(
            existingPatients.map((p) => [`${p.name}__${p.team}`, p.id])
          );

          for (let i = 0; i < dataRows.length; i++) {
            const row = dataRows[i];
            const name = String(row[0] ?? "").trim();
            const nameKana = String(row[1] ?? "").trim();
            const teamRaw = String(row[2] ?? "").trim();
            const activeRaw = String(row[3] ?? "").trim();

            // 空行・記入例（グレー行）はスキップ
            if (!name || name === "山田 花子" || name === "鈴木 一郎" || name === "田中 美咏") {
              if (!name) continue;
              result.patients.skipped++;
              continue;
            }

            // チームバリデーション
            if (!VALID_TEAMS.includes(teamRaw as ValidTeam)) {
              result.patients.errors.push(`利用者 ${i + 2}行目: チーム「${teamRaw}」が無効です（身体/天理/郡山北部/郡山南部）`);
              continue;
            }

            const active = activeRaw.startsWith("0") ? 0 : 1;
            const dupKey = `${name}__${teamRaw}`;

            if (existingMap.has(dupKey)) {
              // 既存利用者：ふりがな・有効フラグを更新
              patientsToUpdate.push({
                id: existingMap.get(dupKey)!,
                nameKana: nameKana || undefined,
                team: teamRaw as ValidTeam,
                active,
              });
            } else {
              // 新規登録
              patientsToCreate.push({
                name,
                nameKana: nameKana || undefined,
                team: teamRaw as ValidTeam,
                active,
              });
            }
          }

          // 新規登録
          if (patientsToCreate.length > 0) {
            try {
              await batchCreatePatients(patientsToCreate);
              result.patients.success += patientsToCreate.length;
            } catch (e: any) {
              result.patients.errors.push(`利用者一括登録エラー: ${e.message}`);
            }
          }

          // 既存更新
          if (patientsToUpdate.length > 0) {
            const { updatePatient } = await import("./db");
            for (const p of patientsToUpdate) {
              try {
                await updatePatient(p.id, { nameKana: p.nameKana, team: p.team, active: p.active });
                result.patients.success++;
              } catch (e: any) {
                result.patients.errors.push(`利用者更新エラー (id=${p.id}): ${e.message}`);
              }
            }
          }
        }

        // ===== スタッフシートのパース =====
        const staffSheet = workbook.Sheets["スタッフ"];
        if (staffSheet) {
          const rows = (XLSX.utils.sheet_to_json(staffSheet, {
            header: 1,
            defval: "",
            range: 6, // 7行目（0-indexed: 6）からヘッダー行
          }) as unknown) as unknown[][];

          const dataRows = rows.slice(1);
          const staffToCreate: Array<{ name: string; team: ValidStaffTeam; role: "user" | "admin" }> = [];

          for (let i = 0; i < dataRows.length; i++) {
            const row = dataRows[i];
            const name = String(row[0] ?? "").trim();
            const teamRaw = String(row[1] ?? "").trim();
            const roleRaw = String(row[2] ?? "").trim().toLowerCase();

            // 空行・記入例はスキップ
            if (!name || name === "森脇 崇" || name === "佐藤 看護師" || name === "中村 作業療法士") {
              if (!name) continue;
              result.staff.skipped++;
              continue;
            }

            // チームバリデーション
            if (!VALID_STAFF_TEAMS.includes(teamRaw as ValidStaffTeam)) {
              result.staff.errors.push(`スタッフ ${i + 2}行目: チーム「${teamRaw}」が無効です（身体/天理/郡山北部/郡山南部/事務員/全チーム）`);
              continue;
            }

            const role: "user" | "admin" = roleRaw === "admin" ? "admin" : "user";

            staffToCreate.push({ name, team: teamRaw as ValidStaffTeam, role });
          }

          // スタッフはメールなしで登録（名前+チームで既存検索して更新）
          // 既存ユーザーは名前で検索して team/role を更新、存在しなければスキップ
          const db = await import("./db").then(m => m.getDb());
          if (db) {
            const { users: usersTable } = await import("../drizzle/schema");
            const { eq: drizzleEq, or, like } = await import("drizzle-orm");
            for (const s of staffToCreate) {
              // 名前で既存ユーザーを検索
              const existing = await db.select({ id: usersTable.id })
                .from(usersTable)
                .where(like(usersTable.name, s.name))
                .limit(1);
              if (existing.length > 0) {
                // 既存ユーザーのチーム・権限を更新
                await db.update(usersTable)
                  .set({ team: s.team, role: s.role, updatedAt: new Date() })
                  .where(drizzleEq(usersTable.id, existing[0].id));
                result.staff.success++;
              } else {
                // 未登録スタッフはスキップ（Manus OAuthログイン後に自動登録されるため）
                result.staff.skipped++;
              }
            }
          }
        }

        return result;
      }),
  }),

  // ========== スケジュール変更連絡 ==========
  scheduleChanges: router({
    /** スケジュール変更連絡を作成する */
    create: protectedProcedure
      .input(z.object({
        changeType: z.enum(["visit_change", "visit_cancel", "visit_add", "meeting_add", "meeting_change"]),
        team: z.enum(["身体", "天理", "郡山北部", "郡山南部", "事務員", "全チーム"]).optional(),
        patientName: z.string().optional(),
        patientId: z.number().optional(),
        fromDatetime: z.string().optional(),
        toDatetime: z.string().optional(),
        staffBefore: z.string().optional(),
        staffAfter: z.string().optional(),
        meetingName: z.string().optional(),
        meetingStaff: z.string().optional(),
        reason: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await createScheduleChange({
          ...input,
          createdBy: ctx.user.id,
          createdByName: ctx.user.name ?? "不明",
        });
        broadcastEvent("scheduleChanges");
        return { success: true, id };
      }),

    /** スケジュール変更連絡一覧を取得する */
    list: protectedProcedure
      .input(z.object({ limit: z.number().int().min(1).max(500).default(100) }).optional())
      .query(async ({ input }) => {
        return getScheduleChanges(input?.limit ?? 100);
      }),

    /** スプレッドシートに転記する */
    exportToSheet: protectedProcedure
      .input(z.object({
        id: z.number(),
        spreadsheetId: z.string().optional(),
        sheetName: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const record = await getScheduleChangeById(input.id);
        if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "記録が見つかりません" });

        const CHANGE_SHEET_ID = input.spreadsheetId ?? "1ki462aQRaNTj5FrI_1MJ1OyATFGqODz6HCtmuriIDEU";
        const SHEET_NAME = input.sheetName ?? "スケジュール変更連絡";

        const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
        const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
        if (!email || !privateKey) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "サービスアカウント設定がありません" });

        const { GoogleAuth: GA } = await import("google-auth-library");
        const auth = new GA({
          credentials: { client_email: email, private_key: privateKey.replace(/\\n/g, "\n") },
          scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });
        const client = await auth.getClient();
        const token = await client.getAccessToken();
        if (!token.token) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "認証トークン取得失敗" });

        // 変更種別の日本語ラベル
        const typeLabel: Record<string, string> = {
          visit_change: "訪問日時変更",
          visit_cancel: "訪問キャンセル",
          visit_add: "訪問追加",
          meeting_add: "会議追加",
          meeting_change: "会議変更",
        };

        // 日時フォーマット
        const fmtDt = (dt: string | null | undefined) => {
          if (!dt) return "";
          try {
            const d = new Date(dt);
            const pad = (n: number) => String(n).padStart(2, "0");
            return `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
          } catch { return dt; }
        };

        // 入力日時
        const createdAt = record.createdAt ? fmtDt(record.createdAt.toISOString()) : "";

        // スプレッドシートに追記する行データ
        const row = [
          createdAt,                                    // A: 入力日時
          record.createdByName,                         // B: 入力者
          typeLabel[record.changeType] ?? record.changeType, // C: 変更種別
          record.team ?? "",                            // D: チーム
          record.patientName ?? "",                     // E: 利用者名
          fmtDt(record.fromDatetime),                   // F: 変更前日時
          fmtDt(record.toDatetime),                     // G: 変更後日時
          record.staffBefore ?? "",                     // H: 変更前担当スタッフ
          record.staffAfter ?? "",                      // I: 変更後担当スタッフ
          record.meetingName ?? "",                     // J: 会議名
          record.meetingStaff ? JSON.parse(record.meetingStaff).join("、") : "", // K: 会議参加スタッフ
          record.reason ?? "",                          // L: 変更理由・備考
        ];

        // スプレッドシートにシートが存在するか確認し、なければ作成
        const metaRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${CHANGE_SHEET_ID}?fields=sheets.properties`,
          { headers: { Authorization: `Bearer ${token.token}` } }
        );
        if (!metaRes.ok) {
          const text = await metaRes.text();
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `スプレッドシートへのアクセスに失敗: ${text}` });
        }
        const meta = await metaRes.json() as { sheets?: { properties: { title: string; sheetId: number } }[] };
        const sheetExists = meta.sheets?.some(s => s.properties.title === SHEET_NAME);

        if (!sheetExists) {
          // シートを作成
          await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${CHANGE_SHEET_ID}:batchUpdate`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${token.token}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                requests: [{ addSheet: { properties: { title: SHEET_NAME } } }]
              }),
            }
          );
          // ヘッダー行を追加
          const headerRow = ["入力日時", "入力者", "変更種別", "チーム", "利用者名", "変更前日時", "変更後日時", "変更前担当スタッフ", "変更後担当スタッフ", "会議名", "会議参加スタッフ", "変更理由・備考"];
          await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${CHANGE_SHEET_ID}/values/${encodeURIComponent(SHEET_NAME + "!A1")}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${token.token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ values: [headerRow] }),
            }
          );
        }

        // データ行を追記
        const appendRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${CHANGE_SHEET_ID}/values/${encodeURIComponent(SHEET_NAME + "!A:L")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token.token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ values: [row] }),
          }
        );
        if (!appendRes.ok) {
          const text = await appendRes.text();
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `スプレッドシートへの書き込みに失敗: ${text}` });
        }

        await markScheduleChangeExported(input.id);
        return { success: true };
      }),

    /** 音声テキストをLLMで解析しフォーム項目を抽出する */
    parseVoice: protectedProcedure
      .input(z.object({
        text: z.string().min(1),
        patientNamesWithKana: z.array(z.object({ name: z.string(), kana: z.string() })).optional(),
        patientNames: z.array(z.string()).optional(),
      }))
      .mutation(async ({ input }) => {
        const { invokeLLM } = await import("./_core/llm");
        const today = new Date();
        const todayStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
        let patientListStr = '';
        if (input.patientNamesWithKana && input.patientNamesWithKana.length > 0) {
          const entries = input.patientNamesWithKana
            .map(p => p.kana ? `${p.name}（${p.kana}）` : p.name)
            .join('、');
          patientListStr = `\n\n登録済利用者リスト（この中から最も近い名前を選んでpatientName/patientLastNameに正式名を返すこと。姓のみ・読み仮名・略称で言及されても正式名を返すこと）:\n${entries}`;
        } else if (input.patientNames && input.patientNames.length > 0) {
          patientListStr = `\n\n登録済利用者リスト（この中から最も近い名前を選んでpatientName/patientLastNameに返すこと）:\n${input.patientNames.join('、')}`;
        }
        const systemPrompt = `あなたは訪問看護ステーションの業務アシスタントです。スタッフが音声で伝えた内容から、スケジュール変更連絡の各項目を抽出してJSONで返してください。

今日は${todayStr}です。日時は「明日」「明後日」「今日」などの相対表現も解釈してISO 8601形式（YYYY-MM-DDTHH:mm）で返してください。
重要：音声入力では言い間違いを訂正する場合があります。以下のような訂正・言い直しを示す表現がある場合は、その後に続く内容（最後に言及された内容）を正しい値として採用してください。
訂正表現の例：「じゃなくて」「ではなく」「違います」「違う」「あ、違う」「間違えました」「間違い」「取り消して」「やっぱり」「やっぱ」「えーと」「あ、えーと」「そうじゃなくて」「ちがう」「いや」「いや、違う」「ごめん」「ごめんなさい」「訂正します」「訂正して」「修正して」「変えて」「なくて」「じゃなく」「ではなくて」「でなく」「でなくて」「ちょっと待って」「待って」「ちょっと待ってください」「もう一度」「もう一回」「やり直し」「やり直して」「最初から」「リセット」「キャンセル」「なしで」「なしにして」「消して」「削除して」「戻して」「前に戻って」「そうではなくて」「そうじゃない」「そうじゃないです」「そうではない」「そうではありません」「別の」「別にして」「他の」「他にして」「違う人」「違う名前」「違う日」「違う時間」「違う日時」「ではなかった」「じゃなかった」「ではありません」「じゃありません」「ではないです」「じゃないです」「ちゃう」「ちゃうちゃう」「あかん」「あかんあかん」「ちゃうんちゃう」「ちゃうわ」「ちゃいます」「ちゃいますよ」「ちゃうで」「ちゃうやん」「ちゃうやろ」「ちゃうんや」「ちゃうんです」「ちゃうかな」「ちゃうかも」「あれちゃう」「それちゃう」「ちゃうかった」「ちゃうかったわ」「ちゃうかったです」「違うわ」「違うやん」「違うやろ」「違うんや」「違うんちゃう」「違うかな」「違うかも」「違うかった」「あ、ちゃう」「あ、ちゃうちゃう」「ちゃうちゃう、」「あかんわ」「あかんやん」「あかんやろ」「それあかん」「それはあかん」「それちゃうわ」「それちゃうやん」「それちゃうやろ」「それちゃうんや」「それちゃうんちゃう」「それちゃうかな」「それちゃうかも」「それちゃうかった」

抽出項目:
- changeType: 次のいずれか。訪問日時変更=visit_change、訪問キャンセル=visit_cancel、訪問追加=visit_add、会議追加=meeting_add、会議変更=meeting_change
- team: 身体 / 天理 / 郡山北部 / 郡山南部 / 事務員 / 全チーム のいずれか
- patientName: 利用者名（姓名）。訂正表現がある場合は最後に言及された利用者名を使用すること。利用者リストがある場合は正式名を返すこと。姓だけの場合は姓のみ返す
- patientLastName: 利用者の姓（苗字）のみ。姓名両方わかる場合は同じ値、姓だけの場合はその姓、利用者が不明な場合はnull
- fromDatetime: 変更前日時（ISO 8601）
- toDatetime: 変更後日時または追加日時（ISO 8601）
- staffBefore: 変更前担当スタッフ名
- staffAfter: 変更後担当スタッフ名
- meetingName: 会議名
- meetingStaff: 参加スタッフ名の配列（例: ["森脇", "田中"]）
- reason: 変更理由・備考。「～のため」「～なので」「～だから」「～の都合」「体調不良」「急用」「病院受診」「家族の都合」「仕事の都合」「訪問拒否」「入院」「外出中」「デイサービス」「通院」「受診」「施設入所」など、理由・事情を示す語句や文を抽出してください。理由が明示されていない場合はnullを返してください。

不明な項目はnullを返してください。必ず有効なJSONのみを返してください。${patientListStr}`;

        const res = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: input.text },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "schedule_change_fields",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  changeType: { type: ["string", "null"] },
                  team: { type: ["string", "null"] },
                  patientName: { type: ["string", "null"] },
                  patientLastName: { type: ["string", "null"] },
                  fromDatetime: { type: ["string", "null"] },
                  toDatetime: { type: ["string", "null"] },
                  staffBefore: { type: ["string", "null"] },
                  staffAfter: { type: ["string", "null"] },
                  meetingName: { type: ["string", "null"] },
                  meetingStaff: { type: ["array", "null"], items: { type: "string" } },
                  reason: { type: ["string", "null"] },
                },
                required: ["changeType", "team", "patientName", "patientLastName", "fromDatetime", "toDatetime", "staffBefore", "staffAfter", "meetingName", "meetingStaff", "reason"],
                additionalProperties: false,
              },
            },
          },
        });

        const rawContent = res.choices?.[0]?.message?.content;
        const content = typeof rawContent === "string" ? rawContent : null;
        if (!content) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI解析に失敗しました" });

        try {
          const parsed = JSON.parse(content);
          return { success: true, fields: parsed };
        } catch {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AIの応答を解析できませんでした" });
        }
      }),

    /** 作成と同時にスプレッドシートへ転記する（ワンステップ） */
    createAndExport: protectedProcedure
      .input(z.object({
        changeType: z.enum(["visit_change", "visit_cancel", "visit_add", "meeting_add", "meeting_change"]),
        team: z.enum(["身体", "天理", "郡山北部", "郡山南部", "事務員", "全チーム"]).optional(),
        patientName: z.string().optional(),
        patientId: z.number().optional(),
        fromDatetime: z.string().optional(),
        toDatetime: z.string().optional(),
        staffBefore: z.string().optional(),
        staffAfter: z.string().optional(),
        meetingName: z.string().optional(),
        meetingStaff: z.string().optional(),
        reason: z.string().optional(),
        spreadsheetId: z.string().optional(),
        sheetName: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // まずDBに保存
        const id = await createScheduleChange({
          changeType: input.changeType,
          team: input.team,
          patientName: input.patientName,
          patientId: input.patientId,
          fromDatetime: input.fromDatetime,
          toDatetime: input.toDatetime,
          staffBefore: input.staffBefore,
          staffAfter: input.staffAfter,
          meetingName: input.meetingName,
          meetingStaff: input.meetingStaff,
          reason: input.reason,
          createdBy: ctx.user.id,
          createdByName: ctx.user.name ?? "不明",
        });

        const record = await getScheduleChangeById(id);
        if (!record) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "作成した記録が見つかりません" });

        const CHANGE_SHEET_ID = input.spreadsheetId ?? "1ki462aQRaNTj5FrI_1MJ1OyATFGqODz6HCtmuriIDEU";
        const SHEET_NAME = input.sheetName ?? "スケジュール変更連絡";

        const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
        const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
        if (!email || !privateKey) {
          // スプレッドシート転記はスキップしてDBのみ保存
          return { success: true, id, exported: false };
        }

        try {
          const { GoogleAuth: GA } = await import("google-auth-library");
          const auth = new GA({
            credentials: { client_email: email, private_key: privateKey.replace(/\\n/g, "\n") },
            scopes: ["https://www.googleapis.com/auth/spreadsheets"],
          });
          const client = await auth.getClient();
          const token = await client.getAccessToken();
          if (!token.token) return { success: true, id, exported: false };

          const typeLabel: Record<string, string> = {
            visit_change: "訪問日時変更",
            visit_cancel: "訪問キャンセル",
            visit_add: "訪問追加",
            meeting_add: "会議追加",
            meeting_change: "会議変更",
          };

          // 日時フォーマット（JST: UTC+9 に変換して書き込む）
          const fmtDt = (dt: string | Date | null | undefined) => {
            if (!dt) return "";
            try {
              const d = dt instanceof Date ? dt : new Date(dt);
              // UTC+9（JST）に変換
              const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
              return `${jst.getUTCFullYear()}/${String(jst.getUTCMonth()+1).padStart(2,"0")}/${String(jst.getUTCDate()).padStart(2,"0")} ${String(jst.getUTCHours()).padStart(2,"0")}:${String(jst.getUTCMinutes()).padStart(2,"0")}`;
            } catch { return String(dt ?? ""); }
          };

          const createdAt = record.createdAt ? fmtDt(record.createdAt) : "";

          const row = [
            createdAt,
            record.createdByName,
            typeLabel[record.changeType] ?? record.changeType,
            record.team ?? "",
            record.patientName ?? "",
            fmtDt(record.fromDatetime),
            fmtDt(record.toDatetime),
            record.staffBefore ?? "",
            record.staffAfter ?? "",
            record.meetingName ?? "",
            record.meetingStaff ? JSON.parse(record.meetingStaff).join("、") : "",
            record.reason ?? "",
          ];

          // シート存在確認
          const metaRes = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${CHANGE_SHEET_ID}?fields=sheets.properties`,
            { headers: { Authorization: `Bearer ${token.token}` } }
          );
          if (metaRes.ok) {
            const meta = await metaRes.json() as { sheets?: { properties: { title: string; sheetId: number } }[] };
            const sheetExists = meta.sheets?.some(s => s.properties.title === SHEET_NAME);
            if (!sheetExists) {
              await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${CHANGE_SHEET_ID}:batchUpdate`,
                {
                  method: "POST",
                  headers: { Authorization: `Bearer ${token.token}`, "Content-Type": "application/json" },
                  body: JSON.stringify({ requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] }),
                }
              );
              const headerRow = ["入力日時", "入力者", "変更種別", "チーム", "利用者名", "変更前日時", "変更後日時", "変更前担当スタッフ", "変更後担当スタッフ", "会議名", "会議参加スタッフ", "変更理由・備考"];
              await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${CHANGE_SHEET_ID}/values/${encodeURIComponent(SHEET_NAME + "!A1")}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
                {
                  method: "POST",
                  headers: { Authorization: `Bearer ${token.token}`, "Content-Type": "application/json" },
                  body: JSON.stringify({ values: [headerRow] }),
                }
              );
            }
          }

          const appendRes = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${CHANGE_SHEET_ID}/values/${encodeURIComponent(SHEET_NAME + "!A:L")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${token.token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ values: [row] }),
            }
          );

          if (appendRes.ok) {
            await markScheduleChangeExported(id);

            // シートのIDを取得してヘッダー書式・列幅・ゼブラストライプ・枠線・フィルター・行固定を設定
            try {
              const metaRes2 = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${CHANGE_SHEET_ID}?fields=sheets.properties`,
                { headers: { Authorization: `Bearer ${token.token}` } }
              );
              if (metaRes2.ok) {
                const meta2 = await metaRes2.json() as { sheets?: { properties: { title: string; sheetId: number } }[] };
                const sheetInfo = meta2.sheets?.find(s => s.properties.title === SHEET_NAME);
                const sheetId = sheetInfo?.properties?.sheetId ?? 0;
                const COL_COUNT = 12; // A〜Lの12列

                // 転送済み行数を取得
                const valuesRes = await fetch(
                  `https://sheets.googleapis.com/v4/spreadsheets/${CHANGE_SHEET_ID}/values/${encodeURIComponent(SHEET_NAME + "!A:A")}`,
                  { headers: { Authorization: `Bearer ${token.token}` } }
                );
                const valuesData = valuesRes.ok ? await valuesRes.json() as { values?: string[][] } : { values: [] };
                const totalRows = valuesData.values?.length ?? 1;
                const dataEndRow = Math.max(totalRows, 2);

                const batchBody = {
                  requests: [
                    // 1. ヘッダー行（1行目）：深青背景・白太字・中央揃え・フォントサイズ11
                    {
                      repeatCell: {
                        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: COL_COUNT },
                        cell: {
                          userEnteredFormat: {
                            backgroundColor: { red: 0.165, green: 0.329, blue: 0.573 }, // #2A5492 深青
                            textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 11, fontFamily: "Noto Sans JP" },
                            horizontalAlignment: "CENTER",
                            verticalAlignment: "MIDDLE",
                            wrapStrategy: "WRAP",
                            padding: { top: 6, bottom: 6, left: 6, right: 6 },
                          },
                        },
                        fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy,padding)",
                      },
                    },
                    // 2. データ行全体：フォント・垂直中央・パディング
                    {
                      repeatCell: {
                        range: { sheetId, startRowIndex: 1, endRowIndex: dataEndRow, startColumnIndex: 0, endColumnIndex: COL_COUNT },
                        cell: {
                          userEnteredFormat: {
                            textFormat: { fontSize: 10, fontFamily: "Noto Sans JP" },
                            verticalAlignment: "MIDDLE",
                            padding: { top: 4, bottom: 4, left: 6, right: 6 },
                          },
                        },
                        fields: "userEnteredFormat(textFormat,verticalAlignment,padding)",
                      },
                    },
                    // 3. 変更理由・備考列（L列）のみテキスト折り返し
                    {
                      repeatCell: {
                        range: { sheetId, startRowIndex: 1, endRowIndex: dataEndRow, startColumnIndex: 11, endColumnIndex: 12 },
                        cell: { userEnteredFormat: { wrapStrategy: "WRAP" } },
                        fields: "userEnteredFormat.wrapStrategy",
                      },
                    },
                    // 4. 奇数行（データ行）：白背景
                    ...Array.from({ length: Math.ceil((dataEndRow - 1) / 2) }, (_, i) => ({
                      repeatCell: {
                        range: { sheetId, startRowIndex: 1 + i * 2, endRowIndex: Math.min(2 + i * 2, dataEndRow), startColumnIndex: 0, endColumnIndex: COL_COUNT },
                        cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 1, blue: 1 } } },
                        fields: "userEnteredFormat.backgroundColor",
                      },
                    })),
                    // 5. 偶数行（データ行）：極淡青背景 #EBF3FB
                    ...Array.from({ length: Math.floor((dataEndRow - 1) / 2) }, (_, i) => ({
                      repeatCell: {
                        range: { sheetId, startRowIndex: 2 + i * 2, endRowIndex: Math.min(3 + i * 2, dataEndRow), startColumnIndex: 0, endColumnIndex: COL_COUNT },
                        cell: { userEnteredFormat: { backgroundColor: { red: 0.922, green: 0.953, blue: 0.984 } } },
                        fields: "userEnteredFormat.backgroundColor",
                      },
                    })),
                    // 6. 全セルに枠線を追加
                    {
                      updateBorders: {
                        range: { sheetId, startRowIndex: 0, endRowIndex: dataEndRow, startColumnIndex: 0, endColumnIndex: COL_COUNT },
                        top:    { style: "SOLID", width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
                        bottom: { style: "SOLID", width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
                        left:   { style: "SOLID", width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
                        right:  { style: "SOLID", width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
                        innerHorizontal: { style: "SOLID", width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
                        innerVertical:   { style: "SOLID", width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
                      },
                    },
                    // 7. 列幅を内容に合わせて設定
                    { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 0,  endIndex: 1  }, properties: { pixelSize: 150 }, fields: "pixelSize" } }, // 入力日時
                    { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 1,  endIndex: 2  }, properties: { pixelSize: 100 }, fields: "pixelSize" } }, // 入力者
                    { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 2,  endIndex: 3  }, properties: { pixelSize: 120 }, fields: "pixelSize" } }, // 変更種別
                    { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 3,  endIndex: 4  }, properties: { pixelSize: 100 }, fields: "pixelSize" } }, // チーム
                    { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 4,  endIndex: 5  }, properties: { pixelSize: 130 }, fields: "pixelSize" } }, // 利用者名
                    { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 5,  endIndex: 6  }, properties: { pixelSize: 150 }, fields: "pixelSize" } }, // 変更前日時
                    { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 6,  endIndex: 7  }, properties: { pixelSize: 150 }, fields: "pixelSize" } }, // 変更後日時
                    { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 7,  endIndex: 8  }, properties: { pixelSize: 130 }, fields: "pixelSize" } }, // 変更前担当
                    { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 8,  endIndex: 9  }, properties: { pixelSize: 130 }, fields: "pixelSize" } }, // 変更後担当
                    { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 9,  endIndex: 10 }, properties: { pixelSize: 130 }, fields: "pixelSize" } }, // 会議名
                    { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 10, endIndex: 11 }, properties: { pixelSize: 180 }, fields: "pixelSize" } }, // 会議参加スタッフ
                    { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 11, endIndex: 12 }, properties: { pixelSize: 280 }, fields: "pixelSize" } }, // 変更理由・備考
                    // 8. 行の高さ：ヘッダー行を少し高めに
                    { updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 36 }, fields: "pixelSize" } },
                    // 9. オートフィルターを設定（全列）
                    {
                      setBasicFilter: {
                        filter: {
                          range: { sheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: COL_COUNT },
                        },
                      },
                    },
                    // 10. ヘッダー行を固定（フリーズ）
                    {
                      updateSheetProperties: {
                        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
                        fields: "gridProperties.frozenRowCount",
                      },
                    },
                  ],
                };
                await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${CHANGE_SHEET_ID}:batchUpdate`, {
                  method: "POST",
                  headers: { Authorization: `Bearer ${token.token}`, "Content-Type": "application/json" },
                  body: JSON.stringify(batchBody),
                });
              }
            } catch {
              // 書式設定の失敗は転送自体に影響しない
            }

            broadcastEvent("scheduleChanges");
            return { success: true, id, exported: true };
          }
          return { success: true, id, exported: false };
        } catch (e) {
          console.error("[ScheduleChange] スプレッドシート転記エラー:", e);
          return { success: true, id, exported: false };
        }
      }),
  }),

  // ========== アプリ設定 ==========
  settings: router({
    /** スプレッドシート自動削除の保持期間（日数）を取得 */
    getSheetCleanupDays: protectedProcedure.query(async () => {
      const value = await getSetting("sheet_cleanup_days", "7");
      return { days: parseInt(value, 10) };
    }),
    /** スプレッドシート自動削除の保持期間（日数）を更新（adminのみ） */
    setSheetCleanupDays: protectedProcedure
      .input(z.object({ days: z.number().int().min(1).max(90) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ変更できます" });
        }
        await setSetting("sheet_cleanup_days", String(input.days));
        broadcastEvent("settings");
        return { success: true, days: input.days };
      }),
  }),

  // ========== クイックアクセスリンク ==========
  quickAccessLinks: router({
    /** 全クイックアクセスリンクを取得 */
    list: protectedProcedure.query(async () => {
      const { getAllQuickAccessLinks } = await import("./db");
      return getAllQuickAccessLinks();
    }),
    /** クイックアクセスリンクを作成（adminのみ） */
    create: protectedProcedure
      .input(z.object({
        category: z.enum(["スプレッドシート", "ドキュメント", "フォーム", "その他"]),
        label: z.string().min(1).max(200),
        href: z.string().url(),
        emoji: z.string().max(10).default(""),
        color: z.string().max(100).default("text-blue-600"),
        sortOrder: z.number().int().default(0),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ変更できます" });
        }
        const { createQuickAccessLink } = await import("./db");
        const id = await createQuickAccessLink(input);
        return { success: true, id };
      }),
    /** クイックアクセスリンクを更新（adminのみ） */
    update: protectedProcedure
      .input(z.object({
        id: z.number().int(),
        category: z.enum(["スプレッドシート", "ドキュメント", "フォーム", "その他"]).optional(),
        label: z.string().min(1).max(200).optional(),
        href: z.string().url().optional(),
        emoji: z.string().max(10).optional(),
        color: z.string().max(100).optional(),
        sortOrder: z.number().int().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ変更できます" });
        }
        const { updateQuickAccessLink } = await import("./db");
        const { id, ...data } = input;
        await updateQuickAccessLink(id, data);
        broadcastEvent("quickAccessLinks");
        return { success: true };
      }),
    /** \u30af\u30a4\u30c3\u30af\u30a2\u30af\u30bb\u30b9\u30ea\u30f3\u30af\u3092\u524a\u9664\uff08admin\u306e\u307f\uff09 */
    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "\u7ba1\u7406\u8005\u306e\u307f\u5909\u66f4\u3067\u304d\u307e\u3059" });
        }
        const { deleteQuickAccessLink } = await import("./db");
        await deleteQuickAccessLink(input.id);
        broadcastEvent("quickAccessLinks");
        return { success: true };
      }),
  }),

  /** チームツールリンク管理 */
  teamTools: router({
    /** 指定チームのツールリンクを取得 */
    list: protectedProcedure
      .input(z.object({
        team: z.enum(["身体", "天理", "郡山北部", "郡山南部"]),
      }))
      .query(async ({ input }) => {
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) return [];
        const { teamTools } = await import("../drizzle/schema");
        const { eq, asc } = await import("drizzle-orm");
        return db.select().from(teamTools)
          .where(eq(teamTools.team, input.team))
          .orderBy(asc(teamTools.sortOrder), asc(teamTools.createdAt));
      }),
    /** チームツールリンクを作成（adminのみ） */
    create: protectedProcedure
      .input(z.object({
        team: z.enum(["身体", "天理", "郡山北部", "郡山南部"]),
        label: z.string().min(1).max(200),
        href: z.string().url(),
        emoji: z.string().max(10).default("🔗"),
        color: z.string().max(100).default("text-blue-600"),
        sortOrder: z.number().int().default(0),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ変更できます" });
        }
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB接続エラー" });
        const { teamTools } = await import("../drizzle/schema");
        const result = await db.insert(teamTools).values({
          team: input.team,
          label: input.label,
          href: input.href,
          emoji: input.emoji,
          color: input.color,
          sortOrder: input.sortOrder,
          createdBy: ctx.user.id,
        });
        broadcastEvent("teamTools");
        return { success: true, id: Number(result[0].insertId) };
      }),
    /** チームツールリンクを更新（adminのみ） */
    update: protectedProcedure
      .input(z.object({
        id: z.number().int(),
        label: z.string().min(1).max(200).optional(),
        href: z.string().url().optional(),
        emoji: z.string().max(10).optional(),
        color: z.string().max(100).optional(),
        sortOrder: z.number().int().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ変更できます" });
        }
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB接続エラー" });
        const { teamTools } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const { id, ...data } = input;
        await db.update(teamTools).set({ ...data, updatedAt: new Date() }).where(eq(teamTools.id, id));
        broadcastEvent("teamTools");
        return { success: true };
      }),
    /** チームツールリンクを削除（adminのみ） */
    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ変更できます" });
        }
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB接続エラー" });
        const { teamTools } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await db.delete(teamTools).where(eq(teamTools.id, input.id));
        broadcastEvent("teamTools");
        return { success: true };
      }),
  }),

  /** 議事録管理 */
  minutes: router({
    /** 議事録一覧を取得（未確認数も含む） */
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB接続エラー" });
      const { minutes, minutesChecks } = await import("../drizzle/schema");
      const allMinutes = await db.select().from(minutes).orderBy(minutes.createdAt);
      // 自分がチェック済みの議事録IDを取得
      const myChecks = await db.select().from(minutesChecks).where(eq(minutesChecks.userId, ctx.user.id));
      const checkedIds = new Set(myChecks.map((c) => c.minutesId));
      return allMinutes.map((m) => ({ ...m, checkedByMe: checkedIds.has(m.id) }));
    }),
    /** 未確認件数を取得 */
    uncheckedCount: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) return { count: 0 };
      const { minutes, minutesChecks } = await import("../drizzle/schema");
      const allMinutes = await db.select({ id: minutes.id }).from(minutes);
      const myChecks = await db.select({ minutesId: minutesChecks.minutesId }).from(minutesChecks).where(eq(minutesChecks.userId, ctx.user.id));
      const checkedIds = new Set(myChecks.map((c) => c.minutesId));
      const count = allMinutes.filter((m) => !checkedIds.has(m.id)).length;
      return { count };
    }),
    /** URLからドキュメントタイトルを取得（Google Drive API サービスアカウント認証） */
    fetchDocTitle: protectedProcedure
      .input(z.object({ url: z.string().url() }))
      .query(async ({ input }) => {
        try {
          // Google Docs/Sheets/Slides/Forms URLからファイルIDを抽出
          const googleDocsPattern = /\/(?:document|spreadsheets|presentation|forms\/d)(?:\/d)?\/([a-zA-Z0-9_-]{25,})/;
          const fileIdMatch = input.url.match(googleDocsPattern);

          if (fileIdMatch && fileIdMatch[1]) {
            const fileId = fileIdMatch[1];
            // サービスアカウント認証でGoogle Drive APIを呼び出す
            try {
              const auth = getAuth();
              // Drive読み取りスコープでトークンを取得
              const driveAuth = new GoogleAuth({
                credentials: {
                  client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
                  private_key: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
                },
                scopes: ["https://www.googleapis.com/auth/drive.readonly"],
              });
              const client = await driveAuth.getClient();
              const tokenRes = await client.getAccessToken();
              if (tokenRes.token) {
                const driveRes = await fetch(
                  `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name`,
                  {
                    headers: { Authorization: `Bearer ${tokenRes.token}` },
                    signal: AbortSignal.timeout(5000),
                  }
                );
                if (driveRes.ok) {
                  const data = await driveRes.json() as { name?: string };
                  if (data.name) return { title: data.name };
                }
              }
            } catch (driveErr) {
              console.warn("[fetchDocTitle] Drive API error:", driveErr);
            }
          }

          // フォールバック: HTMLの<title>タグから取得
          const response = await fetch(input.url, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
            signal: AbortSignal.timeout(5000),
          });
          if (!response.ok) return { title: null };
          const html = await response.text();
          // <title>タグからタイトルを抽出
          const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          if (!match) return { title: null };
          // Google Docs/Sheets等の「- Google ...」を除去
          let title = match[1].trim();
          title = title.replace(/\s*[-–—]\s*(Googleスプレッドシート|Google Sheets|Google Docs|Googleドキュメント|Google Forms|Googleフォーム)\s*$/i, "").trim();
          return { title: title || null };
        } catch {
          return { title: null };
        }
      }),
    /** 議事録を投稿（adminのみ） */
    create: protectedProcedure
      .input(z.object({
        title: z.string().min(1).max(300),
        content: z.string().min(1),
        documentUrl: z.string().url().optional().or(z.literal("")),
        documentLabel: z.string().max(200).optional(),
        deadline: z.date().optional().nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ投稿できます" });
        }
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB接続エラー" });
        const { minutes } = await import("../drizzle/schema");
        await db.insert(minutes).values({
          title: input.title,
          content: input.content,
          documentUrl: input.documentUrl || null,
          documentLabel: input.documentLabel || null,
          deadline: input.deadline ?? null,
          createdBy: ctx.user.id,
          createdByName: ctx.user.name ?? "",
        });
        broadcastEvent("minutes");
        return { success: true };
      }),
    /** 議事録を更新（adminのみ・deadline含む） */
    update: protectedProcedure
      .input(z.object({
        id: z.number().int(),
        title: z.string().min(1).max(300).optional(),
        content: z.string().min(1).optional(),
        documentUrl: z.string().url().optional().or(z.literal("")).nullable(),
        documentLabel: z.string().max(200).optional().nullable(),
        deadline: z.date().optional().nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ編集できます" });
        }
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB接続エラー" });
        const { minutes } = await import("../drizzle/schema");
        const { eq: eqOp } = await import("drizzle-orm");
        const updateData: Record<string, unknown> = {};
        if (input.title !== undefined) updateData.title = input.title;
        if (input.content !== undefined) updateData.content = input.content;
        if (input.documentUrl !== undefined) updateData.documentUrl = input.documentUrl || null;
        if (input.documentLabel !== undefined) updateData.documentLabel = input.documentLabel || null;
        if ("deadline" in input) updateData.deadline = input.deadline ?? null;
        await db.update(minutes).set(updateData).where(eqOp(minutes.id, input.id));
        broadcastEvent("minutes");
        return { success: true };
      }),
    /** 未確認スタッフ全員にリマインド通知を送る（adminのみ） */
    sendReminder: protectedProcedure
      .input(z.object({ minutesId: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ送信できます" });
        }
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB接続エラー" });
        const { minutes, minutesChecks, appNotifications } = await import("../drizzle/schema");
        const { eq: eqOp } = await import("drizzle-orm");
        // 議事録タイトルを取得
        const minutesRows = await db.select({ title: minutes.title }).from(minutes).where(eqOp(minutes.id, input.minutesId)).limit(1);
        if (!minutesRows.length) throw new TRPCError({ code: "NOT_FOUND", message: "議事録が見つかりません" });
        const minutesTitle = minutesRows[0].title;
        // 全スタッフ（role=user）を取得
        const allStaff = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.role, "user"));
        // 確認済みユーザーIDを取得
        const checks = await db.select({ userId: minutesChecks.userId }).from(minutesChecks).where(eqOp(minutesChecks.minutesId, input.minutesId));
        const checkedIds = new Set(checks.map((c) => c.userId));
        // 未確認スタッフにアプリ内通知を作成
        const unreadStaff = allStaff.filter((s) => !checkedIds.has(s.id));
        if (unreadStaff.length === 0) return { success: true, sent: 0 };
        await db.insert(appNotifications).values(
          unreadStaff.map((s) => ({
            type: "minutes_reminder" as const,
            title: "議事録の確認をお願いします",
            body: `「${minutesTitle}」をまだ確認していません。議事録タブから確認してください。`,
            resourceId: input.minutesId,
            isRead: 0,
            targetUserId: s.id,
          }))
        );
        broadcastEvent("notifications");
        return { success: true, sent: unreadStaff.length };
      }),
    /** 議事録を確認チェックする（個人単位で自分のリストから削除） */
    check: protectedProcedure
      .input(z.object({ minutesId: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB接続エラー" });
        const { minutesChecks } = await import("../drizzle/schema");
        // 既にチェック済か確認
        const existing = await db.select().from(minutesChecks)
          .where(eq(minutesChecks.minutesId, input.minutesId));
        const alreadyChecked = existing.some((c) => c.userId === ctx.user.id);
        if (alreadyChecked) return { success: true };
        // チェックを追加（個人の確認記録）
        await db.insert(minutesChecks).values({
          minutesId: input.minutesId,
          userId: ctx.user.id,
          userName: ctx.user.name ?? "",
        });
        broadcastEvent("minutes");
        return { success: true };
      }),
    /** 議事録の確認チェックを解除する（個人単位） */
    uncheck: protectedProcedure
      .input(z.object({ minutesId: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB接続エラー" });
        const { minutesChecks } = await import("../drizzle/schema");
        const { and, eq: eqOp } = await import("drizzle-orm");
        await db.delete(minutesChecks).where(
          and(
            eqOp(minutesChecks.minutesId, input.minutesId),
            eqOp(minutesChecks.userId, ctx.user.id)
          )
        );
        broadcastEvent("minutes");
        return { success: true };
      }),
    /** 議事録の既読者一覧を取得（adminのみ） */
    getReaders: protectedProcedure
      .input(z.object({ minutesId: z.number().int() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ閲覧できます" });
        }
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB接続エラー" });
        const { minutesChecks } = await import("../drizzle/schema");
        // 全スタッフ（role=user）を取得
        const allStaff = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.role, "user"));
        // この議事録をチェック済みのユーザーIDを取得
        const checks = await db.select().from(minutesChecks).where(eq(minutesChecks.minutesId, input.minutesId));
        const checkedUserIds = new Set(checks.map((c) => c.userId));
        const readers = checks.map((c) => ({ userId: c.userId, userName: c.userName, checkedAt: c.checkedAt }));
        const unread = allStaff.filter((s) => !checkedUserIds.has(s.id)).map((s) => ({ userId: s.id, userName: s.name ?? "" }));
        return { readers, unread };
      }),
    /** 議事録を削除（adminのみ） */
    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみ削除できます" });
        }
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB接続エラー" });
        const { minutes, minutesChecks } = await import("../drizzle/schema");
        await db.delete(minutesChecks).where(eq(minutesChecks.minutesId, input.id));
        await db.delete(minutes).where(eq(minutes.id, input.id));
        broadcastEvent("minutes");
        return { success: true };
      }),
  }),

  /** 音声入力誤変換フィードバック */
  voiceFeedback: router({
    /** 誤変換を報告する */
    report: protectedProcedure
      .input(z.object({
        originalText: z.string(),
        transcribedResult: z.string().optional(),
        wrongField: z.string().optional(),
        wrongValue: z.string().optional(),
        correctValue: z.string().optional(),
        comment: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const { voiceFeedback } = await import("../drizzle/schema");
        const insertData: typeof voiceFeedback.$inferInsert = {
          originalText: input.originalText,
          transcribedResult: input.transcribedResult ?? undefined,
          wrongField: input.wrongField ?? undefined,
          wrongValue: input.wrongValue ?? undefined,
          correctValue: input.correctValue ?? undefined,
          comment: input.comment ?? undefined,
          reportedBy: ctx.user.id,
          reportedByName: ctx.user.name ?? "",
        };
        await db.insert(voiceFeedback).values(insertData);
        // オーナーに通知
        const { notifyOwner } = await import("./_core/notification");
        await notifyOwner({
          title: `音声入力誤変換報告: ${ctx.user.name}`,
          content: [
            `報告者: ${ctx.user.name}`,
            `元の音声: ${input.originalText}`,
            input.wrongField ? `誤変換項目: ${input.wrongField}` : null,
            input.wrongValue ? `誤変換内容: ${input.wrongValue}` : null,
            input.correctValue ? `正しい値: ${input.correctValue}` : null,
            input.comment ? `コメント: ${input.comment}` : null,
          ].filter(Boolean).join("\n"),
        });
        return { success: true };
      }),
  }),

  // ============================================================
  // Google Calendar
  // ============================================================
  calendar: router({
    /** カレンダー連携状態を取得（トークンが保存されているかどうか） */
    status: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { connected: false };
      const { eq: eqOp } = await import("drizzle-orm");
      const { users: usersTable } = await import("../drizzle/schema");
      const rows = await db.select({
        googleAccessToken: usersTable.googleAccessToken,
        googleTokenExpiry: usersTable.googleTokenExpiry,
      }).from(usersTable).where(eqOp(usersTable.id, ctx.user.id)).limit(1);
      const row = rows[0];
      if (!row?.googleAccessToken) return { connected: false };
      return { connected: true, tokenExpiry: row.googleTokenExpiry };
    }),

    /** Google Calendarのイベントを取得 */
    getEvents: protectedProcedure
      .input(z.object({
        timeMin: z.string().optional(),
        timeMax: z.string().optional(),
        maxResults: z.number().default(50),
      }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const { eq: eqOp } = await import("drizzle-orm");
        const { users: usersTable } = await import("../drizzle/schema");
        const rows = await db.select({
          googleAccessToken: usersTable.googleAccessToken,
          googleRefreshToken: usersTable.googleRefreshToken,
          googleTokenExpiry: usersTable.googleTokenExpiry,
        }).from(usersTable).where(eqOp(usersTable.id, ctx.user.id)).limit(1);
        const row = rows[0];
        if (!row?.googleAccessToken) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Google Calendar not connected" });
        }
        // トークンが期限切れしそうならリフレッシュ
        let accessToken = row.googleAccessToken;
        const expiry = row.googleTokenExpiry ?? 0;
        if (expiry < Date.now() + 60_000 && row.googleRefreshToken) {
          try {
            const { OAuth2Client } = await import("google-auth-library");
            const oauth2Client = new OAuth2Client(
              process.env.GOOGLE_OAUTH_CLIENT_ID,
              process.env.GOOGLE_OAUTH_CLIENT_SECRET
            );
            oauth2Client.setCredentials({ refresh_token: row.googleRefreshToken });
            const { credentials } = await oauth2Client.refreshAccessToken();
            if (credentials.access_token) {
              accessToken = credentials.access_token;
              const newExpiry = credentials.expiry_date ?? Date.now() + 3600_000;
              const { updateUserGoogleTokens } = await import("./db");
              await updateUserGoogleTokens(ctx.user.id, accessToken, row.googleRefreshToken, newExpiry);
            }
          } catch (e) {
            console.error("[Calendar] Token refresh failed", e);
          }
        }
        // Google Calendar APIを呼び出す
        const now = new Date();
        const timeMin = input.timeMin ?? new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const timeMax = input.timeMax ?? new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString();
        const params = new URLSearchParams({
          timeMin,
          timeMax,
          maxResults: String(input.maxResults),
          singleEvents: "true",
          orderBy: "startTime",
        });
        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!response.ok) {
          const errText = await response.text();
          console.error("[Calendar] API error", response.status, errText);
          if (response.status === 401) {
            throw new TRPCError({ code: "UNAUTHORIZED", message: "Google Calendar token expired. Please reconnect." });
          }
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Google Calendar API error" });
        }
        const data = await response.json() as any;
        const events = (data.items ?? []).map((item: any) => ({
          id: item.id as string,
          summary: (item.summary ?? "タイトルなし") as string,
          description: (item.description ?? null) as string | null,
          location: (item.location ?? null) as string | null,
          start: (item.start?.dateTime ?? item.start?.date ?? "") as string,
          end: (item.end?.dateTime ?? item.end?.date ?? "") as string,
          isAllDay: !item.start?.dateTime as boolean,
          htmlLink: (item.htmlLink ?? null) as string | null,
          colorId: (item.colorId ?? null) as string | null,
        }));
        return { events };
      }),
  }),
});
export type AppRouter = typeof appRouter;;

