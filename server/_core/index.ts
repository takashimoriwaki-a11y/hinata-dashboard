import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerLocalAuthRoutes } from "./localAuth";
import { registerGoogleAuthRoutes } from "./googleAuth";
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
  // Google OAuth認証エンドポイント（/api/auth/google, /api/auth/google/callback）
  registerGoogleAuthRoutes(app);

  // 音声文字起こしエンドポイント /api/transcribe
  // Gemini Audio API をメインに使用し、失敗時は Whisper API にフォールバック
  // context パラメータで画面ごとの医療用語プロンプトを最適化
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024 } });

  /**
   * コンテキスト別の医療用語プロンプトを返す
   * context: 'clinical_notes' | 'task' | 'schedule_change' | 'message' | 'general'
   */
  function getMedicalPrompt(context: string): string {
    const BASE_TERMS = `
訪問看護・精神科・認知症ケアの専門用語を正確に認識してください。

【精神科・精神疾患関連】
統合失調症、双極性障害（躁うつ病）、うつ病、不安障害、パニック障害、強迫性障害（OCD）、
PTSD（心的外傷後ストレス障害）、解離性障害、パーソナリティ障害、発達障害（ASD・ADHD）、
知的障害、てんかん、アルコール依存症、薬物依存症、摂食障害、睡眠障害、
幻覚（幻聴・幻視）、妄想（被害妄想・誇大妄想）、陽性症状、陰性症状、
陽転、陰転、急性増悪、寛解、再燃、再発、自傷行為、希死念慮、希死念慮消退、
デポ剤、クロザピン、リスペリドン、オランザピン、アリピプラゾール、クエチアピン、
ハロペリドール、フルフェナジン、レボメプロマジン、ペロスピロン、
SSRI、SNRI、三環系抗うつ薬、MAO阻害薬、気分安定薬、抗不安薬、睡眠薬、
リチウム、バルプロ酸、カルバマゼピン、ラモトリギン、
ベンゾジアゼピン系、非ベンゾジアゼピン系、

【認知症関連】
アルツハイマー型認知症、レビー小体型認知症、血管性認知症、前頭側頭型認知症、
BPSD（行動・心理症状）、周辺症状、中核症状、見当識障害、記憶障害、
失語、失行、失認、実行機能障害、徘徊、興奮、攻撃性、不眠、昼夜逆転、
幻視、妄想（物盗られ妄想）、うつ状態、アパシー、食行動異常、
ドネペジル（アリセプト）、ガランタミン（レミニール）、リバスチグミン（イクセロン・リバスタッチ）、
メマンチン（メマリー）、
MMSE、HDS-R、CDR、NPI、DBD、

【訪問看護・在宅ケア関連】
訪問看護、訪問看護指示書、訪問看護計画書、訪問看護報告書、
精神科訪問看護、精神科認定看護師、
ケアマネジャー（ケアマネ）、相談支援専門員、精神保健福祉士（PSW）、作業療法士（OT）、
主治医、処方箋、服薬管理、服薬確認、服薬指導、
ADL（日常生活動作）、IADL（手段的日常生活動作）、
セルフケア、生活リズム、社会復帰、就労支援、
グループホーム、障害者支援施設、デイケア、デイサービス、
地域包括支援センター、自立支援協議会、
障害福祉サービス、障害支援区分、受給者証、
精神障害者保健福祉手帳、障害年金、
入院（任意入院・医療保護入院・措置入院）、退院支援、地域移行、
にも包括（精神障害にも対応した地域包括ケアシステム）、

【バイタルサイン・身体所見】
血圧、脈拍、体温、SpO2（酸素飽和度）、呼吸数、
高血圧、低血圧、頻脈、徐脈、不整脈、
浮腫（むくみ）、チアノーゼ、黄疸、

【看護記録・医療文書関連】
SOAP、アセスメント、看護計画、看護診断、看護介入、評価、
経過記録、申し送り、サマリー、退院サマリー、
次回訪問日時、伝達先、伝達方法、

【施設・組織名】
ひなた、こころの訪問看護ステーションひなた、光陽、株式会社光陽、
ハートランドしぎ、大和郡山市、天理市、奈良県、
ZEST、iBow、
`;

    const contextPrompts: Record<string, string> = {
      clinical_notes: `${BASE_TERMS}

【病状の経過記録に特化した追加指示】
以下の表現を正確に認識してください：
- 症状の変化：「改善」「悪化」「増悪」「軽快」「安定」「不安定」「波がある」
- 精神状態：「落ち着いている」「不穏」「興奮状態」「混乱」「錯乱」「意識清明」
- 服薬状況：「服薬できている」「服薬拒否」「飲み忘れ」「自己中断」「過量服薬」
- 生活状況：「自室にこもっている」「外出できている」「食事摂取できている」「睡眠がとれている」
- 家族状況：「家族の負担が大きい」「介護疲れ」「家族支援が必要」
- 訪問時の様子：「笑顔が見られた」「アイコンタクトあり」「会話のキャッチボールができた」
`,
      task: `${BASE_TERMS}

【業務タスク記録に特化した追加指示】
以下の表現を正確に認識してください：
- 書類関連：「受給者証」「指示書」「計画書」「報告書」「同意書」「契約書」「診断書」
- 連絡関連：「主治医への報告」「ケアマネへの連絡」「家族への説明」「相談支援専門員への連絡」
- 期日表現：「今日中に」「明日まで」「今週中に」「来週月曜日」「今月末」「月初め」
- 担当者：スタッフ名・チーム名を正確に認識すること
`,
      schedule_change: `${BASE_TERMS}

【スケジュール変更連絡に特化した追加指示】
以下の表現を正確に認識してください：
- 変更種別：「訪問日時変更」「訪問キャンセル」「訪問追加」「会議追加」「会議変更」
- 理由：「体調不良」「入院」「外出」「通院」「受診」「デイサービス」「施設入所」「訪問拒否」「急用」
- 日時表現：「明日の午前10時」「来週月曜の14時」「今日の午後3時半」を正確に認識
- チーム名：「身体チーム」「天理チーム」「郡山北部チーム」「郡山南部チーム」
`,
      message: `${BASE_TERMS}

【チーム申し送りメッセージに特化した追加指示】
以下の表現を正確に認識してください：
- 緊急度：「至急」「緊急」「要確認」「重要」「要注意」
- 申し送り表現：「本日の申し送り」「引き継ぎ事項」「確認事項」「共有事項」
- 対応状況：「対応済み」「対応中」「未対応」「要フォロー」
`,
    };

    return contextPrompts[context] || `${BASE_TERMS}\n訪問看護ステーションの業務音声を正確に文字起こしてください。`;
  }

  /**
   * Gemini Audio API を使って音声を文字起こしする
   * 医療専門用語に強い最高品質の音声認識
   */
  async function transcribeWithGemini(
    audioBuffer: Buffer,
    mimeType: string,
    context: string
  ): Promise<string> {
    const geminiApiKey = ENV.geminiApiKey;
    if (!geminiApiKey) throw new Error("Gemini API key not configured");

    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });

    // 音声データをBase64エンコード
    const audioBase64 = audioBuffer.toString("base64");

    // MIMEタイプの正規化（Geminiがサポートする形式に変換）
    const supportedMimeTypes: Record<string, string> = {
      "audio/webm": "audio/webm",
      "audio/webm;codecs=opus": "audio/webm",
      "audio/mp4": "audio/mp4",
      "audio/m4a": "audio/mp4",
      "audio/mpeg": "audio/mpeg",
      "audio/mp3": "audio/mpeg",
      "audio/wav": "audio/wav",
      "audio/ogg": "audio/ogg",
    };
    const normalizedMime = supportedMimeTypes[mimeType] || supportedMimeTypes[mimeType.split(";")[0]] || "audio/webm";

    const medicalPrompt = getMedicalPrompt(context);

    const systemInstruction = `あなたは訪問看護ステーション「こころの訪問看護ステーションひなた」専属の音声認識専門AIです。
精神科・認知症・在宅医療の専門用語、奈良県大和郡山市・天理市の地域固有の施設名・人名に精通しており、スタッフの発話を最高精度で文字起こしします。

【絶対に守るべき指示】
1. 音声の内容をそのまま忠実に文字起こしすること（要約・解釈・補足・修正は一切不要）
2. 医療専門用語・薬剤名・施設名・固有名詞は正確に認識すること
3. 言い間違いや訂正表現（「じゃなくて」「ちゃう」「あかん」「違う」「訂正」など）もそのまま起こすこと
4. 数字・日付・時刻は正確に認識すること（「じゅうはちにち」→「18日」など漢数字・読み上げも正確に変換）
5. 人名（利用者名・スタッフ名）は聞こえた通りに起こすこと
6. チーム名（身体・天理・郡山北部・郡山南部）を正確に認識すること
7. 文字起こし結果のみを返すこと（説明文・注釈・補足は絶対に不要）
8. 無音・雑音のみの場合は空文字を返すこと

${medicalPrompt}`;

    const result = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: normalizedMime,
                data: audioBase64,
              },
            },
            {
              text: "この音声を文字起こしてください。音声の内容をそのまま忠実に書き起こし、文字起こし結果のみを返してください。",
            },
          ],
        },
      ],
      config: {
        systemInstruction,
        temperature: 0,
        thinkingConfig: { thinkingBudget: 0 }, // 文字起こしは思考不要・高速化
      },
    });

    const text = result.text?.trim() ?? "";
    if (!text) throw new Error("Gemini returned empty transcription");
    return text;
  }

  /**
   * Whisper API を使って音声を文字起こしする（フォールバック）
   * 精神科・訪問看護専門用語に特化したプロンプト付き
   */
  async function transcribeWithWhisper(
    audioBuffer: Buffer,
    mimeType: string,
    context: string
  ): Promise<string> {
    const forgeApiUrl = ENV.forgeApiUrl;
    const forgeApiKey = ENV.forgeApiKey;
    if (!forgeApiUrl || !forgeApiKey) throw new Error("Whisper API not configured");

    // コンテキスト別の簡潔なWhisperプロンプト（最大224トークン制限内）
    const whisperPrompts: Record<string, string> = {
      clinical_notes: "訪問看護記録。精神科、認知症、統合失調症、双極性障害、BPSD、服薬管理、ADL、セルフケア、不穏、幻覚、妄想、アリセプト、リスペリドン、デポ剤、受給者証、ケアマネ、相談支援専門員。",
      task: "訪問看護業務タスク。受給者証、指示書、計画書、報告書、主治医、ケアマネ、相談支援専門員、身体チーム、天理チーム、郡山北部チーム、郡山南部チーム。",
      schedule_change: "訪問スケジュール変更連絡。訪問キャンセル、日時変更、体調不良、入院、通院、デイサービス、身体チーム、天理チーム、郡山北部チーム、郡山南部チーム。",
      message: "訪問看護チーム申し送りメッセージ。精神科、認知症、利用者、スタッフ、至急、要確認、対応済み、引き継ぎ。",
    };
    const whisperPrompt = whisperPrompts[context] ||
      "訪問看護ステーション。精神科、認知症、統合失調症、双極性障害、BPSD、服薬管理、受給者証、ケアマネ、相談支援専門員、ADL、セルフケア、不穏、幻覚、妄想。";

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType || "audio/webm" });
    const ext = (mimeType || "audio/webm").split("/")[1]?.split(";")[0] || "webm";
    formData.append("file", blob, `recording.${ext}`);
    formData.append("model", "whisper-1");
    formData.append("language", "ja");
    formData.append("response_format", "verbose_json");
    formData.append("prompt", whisperPrompt);

    const baseUrl = forgeApiUrl.endsWith("/") ? forgeApiUrl : `${forgeApiUrl}/`;
    const whisperRes = await fetch(`${baseUrl}v1/audio/transcriptions`, {
      method: "POST",
      headers: { authorization: `Bearer ${forgeApiKey}`, "Accept-Encoding": "identity" },
      body: formData,
    });
    if (!whisperRes.ok) {
      const errText = await whisperRes.text().catch(() => "");
      throw new Error(`Whisper transcription failed: ${errText}`);
    }
    const result = await whisperRes.json() as { text: string };
    return result.text?.trim() ?? "";
  }

  app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "音声ファイルがありません" });
        return;
      }
      const context = (req.body?.context as string) || "general";
      const mimeType = req.file.mimetype || "audio/webm";
      const audioBuffer = req.file.buffer;

      // まず Gemini Audio API を試みる（最高品質・医療用語対応）
      if (ENV.geminiApiKey) {
        try {
          const text = await transcribeWithGemini(Buffer.from(audioBuffer), mimeType, context);
          console.log(`[transcribe] Gemini success (context=${context}), length=${text.length}`);
          res.json({ text, engine: "gemini" });
          return;
        } catch (geminiErr) {
          console.warn("[transcribe] Gemini failed, falling back to Whisper:", geminiErr instanceof Error ? geminiErr.message : geminiErr);
        }
      }

      // Gemini 失敗時は Whisper API にフォールバック
      if (ENV.forgeApiUrl && ENV.forgeApiKey) {
        try {
          const text = await transcribeWithWhisper(Buffer.from(audioBuffer), mimeType, context);
          console.log(`[transcribe] Whisper success (context=${context}), length=${text.length}`);
          res.json({ text, engine: "whisper" });
          return;
        } catch (whisperErr) {
          console.error("[transcribe] Whisper also failed:", whisperErr instanceof Error ? whisperErr.message : whisperErr);
          res.status(500).json({ error: `文字起こし失敗: ${whisperErr instanceof Error ? whisperErr.message : "不明なエラー"}` });
          return;
        }
      }

      res.status(500).json({ error: "音声認識サービスが設定されていません" });
    } catch (e) {
      console.error("[transcribe] error:", e);
      res.status(500).json({ error: "内部エラー" });
    }
  });

  // 音声認識誤変換フィードバックエンドポイント /api/voice-feedback
  // 誤変換を記録し、次回の認識精度向上に活用する
  app.post("/api/voice-feedback", async (req, res) => {
    try {
      const { wrongText, correctedText, context } = req.body as {
        wrongText: string;
        correctedText: string;
        context?: string;
      };
      if (!wrongText || !correctedText) {
        res.status(400).json({ error: "wrongText と correctedText は必須です" });
        return;
      }
      // フィードバックをログに記録（将来的にDBや補正辞書に保存可能）
      console.log(`[voice-feedback] context=${context || "general"} | wrong: "${wrongText}" → corrected: "${correctedText}"`);
      res.json({ ok: true });
    } catch (e) {
      console.error("[voice-feedback] error:", e);
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
      const VALID_TEAMS = ["身体", "天理", "郡山北部", "郡山南部", "事務員", "全チーム"];
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
        if (!VALID_TEAMS.includes(team)) { errors.push(`${i + 4}行目: チーム「${team}」は無効です（身体/天理/郡山北部/郡山南部/事務員/全チーム）`); continue; }
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

  // ========== SSE（Server-Sent Events）リアルタイム同期 ==========
  // 認証済みユーザーが /api/events に接続すると、他職員の更新通知をリアルタイムで受け取れる
  const { addSseClient, removeSseClient } = await import("./sse");

  app.get("/api/events", (req, res) => {
    // SSEヘッダーを設定
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Nginx バッファリング無効化
    res.flushHeaders();

    // クライアントを登録
    addSseClient(res);

    // 接続確立を通知
    res.write(`event: connected\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);

    // 30秒ごとにハートビートを送信（接続維持）
    const heartbeat = setInterval(() => {
      try {
        res.write(`:heartbeat\n\n`);
      } catch {
        clearInterval(heartbeat);
      }
    }, 30_000);

    // クライアント切断時のクリーンアップ
    req.on("close", () => {
      clearInterval(heartbeat);
      removeSseClient(res);
    });
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
