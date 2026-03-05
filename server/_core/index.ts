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
