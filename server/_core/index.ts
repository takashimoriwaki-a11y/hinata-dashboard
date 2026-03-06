import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerLocalAuthRoutes } from "./localAuth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { deleteAllTodayScreenshots, moveTomorrowToToday, getTodayDueTasks } from "../db";
import { notifyOwner } from "./notification";
import multer from "multer";
import { ENV } from "./env";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // ローカル認証エンドポイント（/api/auth/login, /api/auth/logout, /api/auth/setup）
  registerLocalAuthRoutes(app);

  // 音声文字起こしエンドポイント /api/transcribe
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024 } });
  app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "音声ファイルがありません" });
        return;
      }
      const forgeApiUrl = ENV.forgeApiUrl;
      const forgeApiKey = ENV.forgeApiKey;
      if (!forgeApiUrl || !forgeApiKey) {
        res.status(500).json({ error: "音声認識サービスが設定されていません" });
        return;
      }
      const formData = new FormData();
      const blob = new Blob([new Uint8Array(req.file.buffer)], { type: req.file.mimetype || "audio/webm" });
      const ext = (req.file.mimetype || "audio/webm").split("/")[1] || "webm";
      formData.append("file", blob, `recording.${ext}`);
      formData.append("model", "whisper-1");
      formData.append("response_format", "verbose_json");
      formData.append("prompt", "診療所、診断名、薬剰名など医療・看護用語を正確に起こしてください");
      const baseUrl = forgeApiUrl.endsWith("/") ? forgeApiUrl : `${forgeApiUrl}/`;
      const whisperRes = await fetch(`${baseUrl}v1/audio/transcriptions`, {
        method: "POST",
        headers: { authorization: `Bearer ${forgeApiKey}`, "Accept-Encoding": "identity" },
        body: formData,
      });
      if (!whisperRes.ok) {
        const errText = await whisperRes.text().catch(() => "");
        res.status(500).json({ error: `文字起こし失敗: ${errText}` });
        return;
      }
      const result = await whisperRes.json() as { text: string };
      res.json({ text: result.text });
    } catch (e) {
      console.error("[transcribe] error:", e);
      res.status(500).json({ error: "内部エラー" });
    }
  });

  // スクリーンショット画像取得エンドポイント（Base64データをDBから取得して返す）
  app.get("/api/screenshot/:id", async (req, res) => {
    try {
      const { getScreenshotById } = await import("../db");
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid ID" });
        return;
      }
      const screenshot = await getScreenshotById(id);
      if (!screenshot) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      // imageDataがある場合はBase64から画像を返す
      if (screenshot.imageData) {
        const base64Data = screenshot.imageData.replace(/^data:image\/\w+;base64,/, "");
        const mimeMatch = screenshot.imageData.match(/^data:(image\/\w+);base64,/);
        const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
        const buffer = Buffer.from(base64Data, "base64");
        res.set("Content-Type", mimeType);
        res.set("Cache-Control", "public, max-age=3600");
        res.send(buffer);
      } else if (screenshot.imageUrl) {
        // S3 URLの場合はリダイレクト
        res.redirect(screenshot.imageUrl);
      } else {
        res.status(404).json({ error: "No image data" });
      }
    } catch (e) {
      console.error("[screenshot] error:", e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  // Excelインポートエンドポイント
  const excelUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

  // 利用者インポート /api/import/patients
  app.post("/api/import/patients", excelUpload.single("file"), async (req, res) => {
    try {
      if (!req.file) { res.status(400).json({ error: "ファイルがありません" }); return; }
      const XLSX = await import("xlsx");
      const wb = XLSX.read(req.file.buffer, { type: "buffer" });
      // 最初のシートを使用（「利用者一覧（インポート用）」シート）
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      // ヘッダー行は3行目（0-indexed: 2）、データは4行目から
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { range: 2, defval: "" });
      const VALID_TEAMS = ["身体", "天理", "郡山北部", "郡山南部"];
      const patients: Array<{ name: string; team: string; nameKana?: string; active?: number }> = [];
      const errors: string[] = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        // ヘッダー行キーを柔軟に取得（★付きも対応）
        const name = String(row["★ 氏名"] ?? row["氏名"] ?? "").trim();
        const team = String(row["★ チーム"] ?? row["チーム"] ?? "").trim();
        const nameKana = String(row["ふりがな"] ?? "").trim();
        const activeRaw = row["有効フラグ（1=有効 / 0=無効）"] ?? row["有効フラグ"] ?? 1;
        const active = Number(activeRaw) === 0 ? 0 : 1;
        if (!name) continue; // 空行スキップ
        if (!VALID_TEAMS.includes(team)) { errors.push(`${i + 4}行目: チーム「${team}」は無効です（身体/天理/郡山北部/郡山南部）`); continue; }
        patients.push({ name, team, nameKana: nameKana || undefined, active });
      }
      if (patients.length === 0 && errors.length > 0) {
        res.status(400).json({ error: "インポートできる行がありませんでした", errors }); return;
      }
      // DB登録
      const { batchCreatePatients } = await import("../db");
      const count = await batchCreatePatients(patients);
      res.json({ success: true, count, errors });
    } catch (e) {
      console.error("[import/patients] error:", e);
      res.status(500).json({ error: "インポート処理中にエラーが発生しました" });
    }
  });

  // 職員インポート /api/import/staff
  app.post("/api/import/staff", excelUpload.single("file"), async (req, res) => {
    try {
      if (!req.file) { res.status(400).json({ error: "ファイルがありません" }); return; }
      const XLSX = await import("xlsx");
      const wb = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { range: 2, defval: "" });
      const VALID_TEAMS = ["身体", "天理", "郡山北部", "郡山南部"];
      const staffList: Array<{ name: string; email: string; password: string; team: string; role: "admin" | "user" }> = [];
      const errors: string[] = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const name = String(row["★ 氏名"] ?? row["氏名"] ?? "").trim();
        const email = String(row["★ メールアドレス"] ?? row["メールアドレス"] ?? "").trim().toLowerCase();
        const password = String(row["★ 初期パスワード"] ?? row["初期パスワード"] ?? "").trim();
        const team = String(row["★ チーム"] ?? row["チーム"] ?? "").trim();
        const roleRaw = String(row["権限（admin / user）"] ?? row["権限"] ?? "user").trim().toLowerCase();
        const role: "admin" | "user" = roleRaw === "admin" ? "admin" : "user";
        if (!name) continue;
        if (!email || !email.includes("@")) { errors.push(`${i + 4}行目: メールアドレスが無効です`); continue; }
        if (!password || password.length < 4) { errors.push(`${i + 4}行目: パスワードが短すぎます（4文字以上）`); continue; }
        if (!VALID_TEAMS.includes(team)) { errors.push(`${i + 4}行目: チーム「${team}」は無効です`); continue; }
        staffList.push({ name, email, password, team, role });
      }
      if (staffList.length === 0 && errors.length > 0) {
        res.status(400).json({ error: "インポートできる行がありませんでした", errors }); return;
      }
      // DB登録
      const { batchCreateStaff } = await import("../db");
      const { count, skipped } = await batchCreateStaff(staffList);
      res.json({ success: true, count, skipped, errors });
    } catch (e) {
      console.error("[import/staff] error:", e);
      res.status(500).json({ error: "インポート処理中にエラーが発生しました" });
    }
  });

  // 利用者テンプレートダウンロード /api/template/patients
  app.get("/api/template/patients", async (_req, res) => {
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      // ヘッダー説明行
      const headerInfo = [
        ["【利用者一括登録テンプレート】"],
        ["★マークの列は必須です。3行目以降にデータを入力してください。"],
        ["★ 氏名", "ふりがな", "★ チーム", "有効フラグ（1=有効 / 0=無効）"],
        ["山田 太郎", "やまだ たろう", "身体", "1"],
        ["鈴木 花子", "すずき はなこ", "天理", "1"],
        ["田中 一郎", "", "郡山北部", "1"],
        ["佐藤 二郎", "", "郡山南部", "1"],
      ];
      const ws = XLSX.utils.aoa_to_sheet(headerInfo);
      // 列幅設定
      ws["!cols"] = [{ wch: 20 }, { wch: 20 }, { wch: 14 }, { wch: 30 }];
      XLSX.utils.book_append_sheet(wb, ws, "利用者一覧（インポート用）");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Disposition", 'attachment; filename*=UTF-8\'\'%E5%88%A9%E7%94%A8%E8%80%85%E3%83%86%E3%83%B3%E3%83%97%E3%83%AC%E3%83%BC%E3%83%88.xlsx');
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buf);
    } catch (e) {
      console.error("[template/patients] error:", e);
      res.status(500).json({ error: "テンプレート生成に失敗しました" });
    }
  });

  // 職員テンプレートダウンロード /api/template/staff
  app.get("/api/template/staff", async (_req, res) => {
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      const headerInfo = [
        ["【職員一括登録テンプレート】"],
        ["★マークの列は必須です。3行目以降にデータを入力してください。メール重複はスキップされます。"],
        ["★ 氏名", "★ メールアドレス", "★ 初期パスワード", "★ チーム", "権限（admin / user）"],
        ["山田 太郎", "yamada@example.com", "Pass1234", "身体", "user"],
        ["鈴木 花子", "suzuki@example.com", "Pass1234", "天理", "user"],
        ["田中 一郎", "tanaka@example.com", "Pass1234", "郡山北部", "user"],
        ["佐藤 二郎", "sato@example.com", "Pass1234", "郡山南部", "admin"],
      ];
      const ws = XLSX.utils.aoa_to_sheet(headerInfo);
      ws["!cols"] = [{ wch: 20 }, { wch: 30 }, { wch: 16 }, { wch: 14 }, { wch: 22 }];
      XLSX.utils.book_append_sheet(wb, ws, "職員一覧（インポート用）");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Disposition", 'attachment; filename*=UTF-8\'\'%E8%81%B7%E5%93%A1%E3%83%86%E3%83%B3%E3%83%97%E3%83%AC%E3%83%BC%E3%83%88.xlsx');
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buf);
    } catch (e) {
      console.error("[template/staff] error:", e);
      res.status(500).json({ error: "テンプレート生成に失敗しました" });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);

// ========== 毎日23:59に訪問スケジュールスクショをローテーション ==========
// 「今日」のスクショを削除し、「明日」のスクショを「今日」に移動する
function scheduleDailyRotation() {
  const checkInterval = 60 * 1000; // 1分ごとにチェック
  let lastRotatedDate = "";

  setInterval(async () => {
    const now = new Date();
    const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000); // UTC+9（JST）
    const h = jstNow.getUTCHours();
    const m = jstNow.getUTCMinutes();
    const dateStr = jstNow.toISOString().slice(0, 10);

    // 23:59〜23:59（1分間）に実行（同じ日に1回だけ）
    if (h === 23 && m === 59 && lastRotatedDate !== dateStr) {
      lastRotatedDate = dateStr;
      try {
        console.log(`[ScheduleRotation] ${dateStr} 23:59 - 今日のスクショを削除し、明日を今日に移動します`);
        await deleteAllTodayScreenshots();
        await moveTomorrowToToday();
        console.log(`[ScheduleRotation] 完了`);
      } catch (e) {
        console.error(`[ScheduleRotation] エラー:`, e);
      }
    }
  }, checkInterval);

  console.log("[ScheduleRotation] 毎日23:59のスクショローテーションスケジューラーを開始しました");
}

scheduleDailyRotation();

// ========== 毎朝5:00（JST）にタスク期日リマインダーを通知 ==========
function scheduleTaskReminder() {
  const checkInterval = 60 * 1000; // 1分ごとにチェック
  let lastReminderDate = "";

  setInterval(async () => {
    const now = new Date();
    const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000); // UTC+9（JST）
    const h = jstNow.getUTCHours();
    const m = jstNow.getUTCMinutes();
    const dateStr = jstNow.toISOString().slice(0, 10);

    // 毎朝5:00（JST）に1回だけ実行
    if (h === 5 && m === 0 && lastReminderDate !== dateStr) {
      lastReminderDate = dateStr;
      try {
        console.log(`[TaskReminder] ${dateStr} 05:00 - 今日が期日のタスクを確認します`);
        const todayTasks = await getTodayDueTasks();

        if (todayTasks.length === 0) {
          console.log(`[TaskReminder] 今日が期日のタスクはありません`);
          return;
        }

        // 通知内容を組み立てる
        const taskLines = todayTasks.map((t, i) => {
          const timeStr = t.dueDate
            ? ` (${new Date(t.dueDate).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" })})`
            : "";
          const assignStr = t.assignType === "all"
            ? "全員"
            : t.assignType === "team"
            ? `${t.assignTeam}チーム`
            : t.assignUserName ?? "個人";
          return `${i + 1}. ${t.text}${timeStr} [${assignStr}] (作成: ${t.createdByName})`;
        }).join("\n");

        const title = `📋 本日期日のタスク ${todayTasks.length}件`;
        const content = `${dateStr} に期日を迎えるタスクがあります。\n\n${taskLines}\n\nダッシュボードで確認してください。`;

        const success = await notifyOwner({ title, content });
        if (success) {
          console.log(`[TaskReminder] ${todayTasks.length}件のタスクリマインダーを送信しました`);
        } else {
          console.warn(`[TaskReminder] 通知の送信に失敗しました`);
        }
      } catch (e) {
        console.error(`[TaskReminder] エラー:`, e);
      }
    }
  }, checkInterval);

  console.log("[TaskReminder] 毎朝5:00のタスクリマインダースケジューラーを開始しました");
}

scheduleTaskReminder();

// ========== 毎日0:00（JST）に次回訪問日時から1週間経過した行をスプレッドシートから削除 ==========
function scheduleSheetCleanup() {
  const checkInterval = 60 * 1000; // 1分ごとにチェック
  let lastCleanedDate = "";

  setInterval(async () => {
    const now = new Date();
    const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000); // UTC+9（JST）
    const h = jstNow.getUTCHours();
    const m = jstNow.getUTCMinutes();
    const dateStr = jstNow.toISOString().slice(0, 10);

    // 毎日0:00（JST）に1回だけ実行
    if (h === 0 && m === 0 && lastCleanedDate !== dateStr) {
      lastCleanedDate = dateStr;
      try {
        console.log(`[SheetCleanup] ${dateStr} 00:00 - 次回訪問日時から1週間経過した行を削除します`);
        await deleteExpiredSheetRows();
        console.log(`[SheetCleanup] 完了`);
      } catch (e) {
        console.error(`[SheetCleanup] エラー:`, e);
      }
    }
  }, checkInterval);

  console.log("[SheetCleanup] 毎日0:00のスプレッドシート自動削除スケジューラーを開始しました");
}

async function deleteExpiredSheetRows() {
  const VISIT_RECORD_SHEET_ID = "1WOZQ5rI0Fu57nWaiGwComPS_DdEwPgNR6zeOmyrqKpo"; // ひなた_次回訪問日時
  const SHEET_NAME = "シート1";

  // DBから保持期間（日数）を取得（デフォルト7日）
  const { getSetting } = await import("../db");
  const retentionDaysStr = await getSetting("sheet_cleanup_days", "7");
  const retentionDays = parseInt(retentionDaysStr, 10) || 7;
  console.log(`[SheetCleanup] 保持期間: ${retentionDays}日`);

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !privateKey) {
    console.warn("[SheetCleanup] サービスアカウント設定がありません。スキップします。");
    return;
  }

  const { GoogleAuth } = await import("google-auth-library");
  const auth = new GoogleAuth({
    credentials: { client_email: email, private_key: privateKey.replace(/\\n/g, "\n") },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const client = await auth.getClient();
  const tokenObj = await client.getAccessToken();
  const token = tokenObj.token;
  if (!token) {
    console.warn("[SheetCleanup] 認証トークン取得失敗。スキップします。");
    return;
  }

  // シートの全データを取得（E列＝次回訪問日時）
  const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${VISIT_RECORD_SHEET_ID}/values/${encodeURIComponent(SHEET_NAME + "!A:J")}`;
  const getRes = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!getRes.ok) {
    const text = await getRes.text();
    console.error(`[SheetCleanup] データ取得失敗: ${text}`);
    return;
  }

  const data = await getRes.json() as { values?: string[][] };
  const rows: string[][] = data.values ?? [];

  if (rows.length <= 1) {
    console.log("[SheetCleanup] データ行なし。スキップします。");
    return;
  }

  // シートIDを取得
  const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${VISIT_RECORD_SHEET_ID}?fields=sheets.properties`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metaRes.ok) {
    console.error("[SheetCleanup] シートID取得失敗");
    return;
  }
  const meta = await metaRes.json() as { sheets?: Array<{ properties?: { sheetId?: number } }> };
  const sheetId = meta.sheets?.[0]?.properties?.sheetId ?? 0;

  // 現在時刻から保持期間日前のタイムスタンプ
  const now = new Date();
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);

  // 削除対象の行インデックスを収集（1行目はヘッダーなのでスキップ）
  // E列（インデックス4）が次回訪問日時。形式: "YYYY/MM/DD HH:MM"
  const deleteRowIndexes: number[] = [];
  for (let i = 1; i < rows.length; i++) {
    const nextVisitStr = rows[i][4]; // E列
    if (!nextVisitStr) continue; // 空欄はスキップ

    // "YYYY/MM/DD HH:MM" 形式をパース
    const parsed = nextVisitStr.replace(/\//g, "-").replace(" ", "T");
    const nextVisitDate = new Date(parsed);
    if (isNaN(nextVisitDate.getTime())) continue;

    // 次回訪問日時から7日以上経過していれば削除対象
    if (nextVisitDate < cutoff) {
      deleteRowIndexes.push(i);
    }
  }

  if (deleteRowIndexes.length === 0) {
    console.log("[SheetCleanup] 削除対象の行はありません。");
    return;
  }

  console.log(`[SheetCleanup] ${deleteRowIndexes.length}行を削除します: 行インデックス ${deleteRowIndexes.join(", ")}`);

  // 下から順に削除（インデックスのずれを防ぐ）
  const sortedDesc = [...deleteRowIndexes].sort((a, b) => b - a);
  const deleteRequests = sortedDesc.map((rowIndex) => ({
    deleteDimension: {
      range: {
        sheetId,
        dimension: "ROWS",
        startIndex: rowIndex,
        endIndex: rowIndex + 1,
      },
    },
  }));

  const batchRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${VISIT_RECORD_SHEET_ID}:batchUpdate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ requests: deleteRequests }),
  });

  if (!batchRes.ok) {
    const text = await batchRes.text();
    console.error(`[SheetCleanup] 削除失敗: ${text}`);
    return;
  }

  console.log(`[SheetCleanup] ${deleteRowIndexes.length}行の削除が完了しました`);
}

scheduleSheetCleanup();
