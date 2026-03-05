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
  createMessage,
  softDeleteMessage,
  getMessageById,
  toggleReaction,
  getReactionsByMessageIds,
  expireMessages,
  getPatients,
  searchPatients,
  createPatient,
  updatePatient,
  deactivatePatient,
  createVisitRecord,
  getVisitRecords,
  getVisitRecordById,
  markVisitRecordExported,
} from "./db";
import { storagePut } from "./storage";
import { eq } from "drizzle-orm";
import { users } from "../drizzle/schema";

const COOKIE_NAME = "session";

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
        return { success: true };
      }),
    // リンクを削除
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await deleteMyLink(input.id, ctx.user.id);
        return { success: true };
      }),
  }),

  // スプレッドシートURL月次管理
  spreadsheetLinks: router({
    // 当月分のリンク一覧を取得（公開）
    getCurrent: publicProcedure.query(async () => {
      const now = new Date();
      const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      return getSpreadsheetLinks(yearMonth);
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
        return { success: true, id };
      }),
    // リンクを削除（管理者のみ）
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteSpreadsheetLink(input.id);
        return { success: true };
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
        imageUrl: s.imageUrl,
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

        // S3にアップロード
        const ext = input.mimeType.split("/")[1] ?? "png";
        const key = `schedule-screenshots/${input.team}-${input.day}-${randomSuffix()}.${ext}`;
        const { url } = await storagePut(key, buffer, input.mimeType);

        // 既存スクショのS3キーを取得（削除のため）
        const existing = await getScreenshot(input.team, input.day);

        // DBにアップサート
        await upsertScreenshot({
          team: input.team,
          day: input.day,
          imageUrl: url,
          imageKey: key,
          uploadedBy: ctx.user.id,
          uploadedByName: ctx.user.name ?? "不明",
        });

        // 古いS3ファイルは削除しない（URLが変わるため古いURLは無効になる）

        return { success: true, url };
      }),

    // スクショを削除
    delete: protectedProcedure
      .input(
        z.object({
          team: z.enum(["身体", "天理", "郡山北部", "郡山南部"]),
          day: z.enum(["今日", "明日"]),
        })
      )
      .mutation(async ({ input }) => {
        await deleteScreenshot(input.team, input.day);
        return { success: true };
      }),

    // 23:59に実行: 今日を削除し、明日を今日に移動（管理者のみ、またはcronから呼び出し）
    rotateDailyScreenshots: protectedProcedure.mutation(async () => {
      await deleteAllTodayScreenshots();
      await moveTomorrowToToday();
      return { success: true };
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
          createdBy: ctx.user.id,
          createdByName: ctx.user.name ?? "不明",
          done: 0,
        });
        return { success: true, id };
      }),

    // タスクの完了状態を切り替える
    toggle: protectedProcedure
      .input(z.object({ id: z.number(), done: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        await toggleTask(input.id, input.done, ctx.user.id);
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
  }),

  // ========== メッセージ ==========
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
        return { success: true, id };
      }),

    // メッセージを手動削除する（作成者のみ）
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const msg = await getMessageById(input.id);
        if (!msg) throw new TRPCError({ code: "NOT_FOUND", message: "メッセージが見つかりません" });
        if (msg.createdBy !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "作成者のみ削除できます" });
        }
        await softDeleteMessage(input.id, ctx.user.id);
        return { success: true };
      }),

    // リアクションをトグルする
    toggleReaction: protectedProcedure
      .input(z.object({ messageId: z.number(), emoji: z.string().max(10) }))
      .mutation(async ({ ctx, input }) => {
        const result = await toggleReaction(
          input.messageId,
          ctx.user.id,
          ctx.user.name ?? "不明",
          input.emoji
        );
        return result;
      }),
  }),
  // ========== 利用者管理 ==========
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
        return { success: true, id };
      }),

    // 利用者を更新
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(100).optional(),
        nameKana: z.string().max(100).optional(),
        team: z.enum(["身体", "天理", "郡山北部", "郡山南部"]).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updatePatient(id, data);
        return { success: true };
      }),

    // 利用者を無効化（退所等）
    deactivate: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deactivatePatient(input.id);
        return { success: true };
      }),
  }),

  // ========== 訪問記録 ==========
  visitRecords: router({
    // 訪問記録を作成する
    create: protectedProcedure
      .input(z.object({
        patientId: z.number(),
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
        return { success: true };
      }),

    // スプレッドシートに転送する
    exportToSheet: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const record = await getVisitRecordById(input.id);
        if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "記録が見つかりません" });

        const VISIT_RECORD_SHEET_ID = "1BGMdVGTQEkcVXioa5leetH_kPr859nNHMnhkwEMlWqA";
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

        // 日時フォーマット
        const formatDate = (val: Date | number | null | undefined) => {
          if (!val) return "";
          const d = val instanceof Date ? val : new Date(val);
          return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
        };

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
          record.clinicalNotes ?? "",
        ];

        const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${VISIT_RECORD_SHEET_ID}/values/${encodeURIComponent(SHEET_NAME + "!A:J")}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
        const res = await fetch(appendUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${token.token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ values: [row] }),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Sheets API error: ${text}` });
        }

        // 転送済みフラグを立てる
        await markVisitRecordExported(input.id);
        return { success: true };
      }),
  }),
});
export type AppRouter = typeof appRouter;
