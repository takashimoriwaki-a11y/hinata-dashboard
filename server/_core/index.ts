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
import { deleteAllTodayScreenshots, moveTomorrowToToday, rotateScheduleDays, getTodayDueTasks, getPatients, getAllUsers, getCommentsByDate, deleteCommentsByDate, cleanupExpiredDeletedTasks, getAlcoholCheckSpreadsheet, upsertAlcoholCheckSpreadsheet } from "../db";
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

  // 固有名詞キャッシュ（5分間有効）
  let _namesCache: { staffNames: string[]; patientNames: string[]; expiresAt: number } | null = null;

  async function getDynamicNames(): Promise<{ staffNames: string[]; patientNames: string[] }> {
    const now = Date.now();
    if (_namesCache && now < _namesCache.expiresAt) {
      return { staffNames: _namesCache.staffNames, patientNames: _namesCache.patientNames };
    }
    try {
      const [allUsers, allPatients] = await Promise.all([
        getAllUsers(),
        getPatients(),
      ]);
      const staffNames = allUsers
        .map((u: { id: number; name: string | null; team: string | null }) => u.name)
        .filter((n): n is string => !!n && n.trim().length > 0);
      const patientNames = allPatients
        .map((p: { name: string }) => p.name)
        .filter((n): n is string => !!n && n.trim().length > 0);
      _namesCache = { staffNames, patientNames, expiresAt: now + 5 * 60 * 1000 };
      return { staffNames, patientNames };
    } catch (e) {
      console.warn("[transcribe] Failed to fetch dynamic names:", e);
      return { staffNames: [], patientNames: [] };
    }
  }

  /**
   * コンテキスト別の医療用語プロンプトを返す
   * context: 'clinical_notes' | 'task' | 'schedule_change' | 'message' | 'general'
   */
  function getMedicalPrompt(context: string, staffNames: string[] = [], patientNames: string[] = []): string {
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

    // 動的固有名詞セクションを追加
    const dynamicSection = (() => {
      const parts: string[] = [];
      if (staffNames.length > 0) {
        parts.push(`【登録スタッフ名（正確に認識すること）】\n${staffNames.join('、')}`);
      }
      if (patientNames.length > 0) {
        parts.push(`【登録利用者名（正確に認識すること）】\n${patientNames.join('、')}`);
      }
      return parts.length > 0 ? `\n\n${parts.join('\n\n')}` : '';
    })();

    const basePrompt = contextPrompts[context] || `${BASE_TERMS}\n訪問看護ステーションの業務音声を正確に文字起こしてください。`;
    return basePrompt + dynamicSection;
  }

  /**
   * Gemini Audio API を使って音声を文字起こしする
   * 医療専門用語に強い最高品質の音声認識
   */
  async function transcribeWithGemini(
    audioBuffer: Buffer,
    mimeType: string,
    context: string,
    staffNames: string[] = [],
    patientNames: string[] = [],
    feedbackCorrections: Array<{ wrongValue: string | null; correctValue: string | null }> = []
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

    const medicalPrompt = getMedicalPrompt(context, staffNames, patientNames);

    // 過去の誤変換フィードバックをプロンプトに反映
    const feedbackSection = feedbackCorrections.length > 0
      ? `\n\n【過去の誤認識・補正履歴（必ず正しい認識を優先すること）】\n${feedbackCorrections
        .filter(f => f.wrongValue && f.correctValue)
        .map(f => `「${f.wrongValue}」 → 正しくは「${f.correctValue}」`)
        .join('\n')}`
      : '';

    const systemInstruction = `あなたは訪問看護ステーション「こころの訪問看護ステーションひなた」専属の音声認識専門AIです。
精神科・認知症・在宅医療の専門用語、奈良県大和郡山市・天理市の地域固有の施設名・人名に精通しており、スタッフの発話を最高精度で文字起こします。

【絶対に守るべき指示】
1. 音声の内容をそのまま忠実に文字起こしすること（要約・解釈・補足・修正は一切不要）
2. 医療専門用語・薬剤名・施設名・固有名詞は正確に認識すること
3. 言い間違いや訂正表現（「じゃなくて」「ちゃう」「あかん」「違う」「訂正」など）もそのまま起こすこと
4. 数字・日付・時刻は正確に認識すること（「じゅうはちにち」→「18日」など漢数字・読み上げも正確に変換）
5. 人名（利用者名・スタッフ名）は聴こえた通りに起こすこと
6. チーム名（身体・天理・郡山北部・郡山南部）を正確に認識すること
7. 文字起こし結果のみを返すこと（説明文・注釈・補足は絶対に不要）
8. 無音・雑音のみの場合は空文字を返すこと

${medicalPrompt}${feedbackSection}`;

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
    context: string,
    staffNames: string[] = [],
    patientNames: string[] = []
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
    const baseWhisperPrompt = whisperPrompts[context] ||
      "訪問看護ステーション。精神科、認知症、統合失調症、双極性障害、BPSD、服薬管理、受給者証、ケアマネ、相談支援専門員、ADL、セルフケア、不穏、幻覚、妄想。";
    // Whisperは224トークン制限があるため、固有名詞は最大15名ずつに絞る
    const dynamicParts: string[] = [];
    if (staffNames.length > 0) dynamicParts.push(staffNames.slice(0, 15).join('、'));
    if (patientNames.length > 0) dynamicParts.push(patientNames.slice(0, 15).join('、'));
    const whisperPrompt = dynamicParts.length > 0
      ? `${baseWhisperPrompt} ${dynamicParts.join('、')}`
      : baseWhisperPrompt;

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

      // DBから登録済みスタッフ名・利用者名を取得（5分キャッシュ）
      const { staffNames, patientNames } = await getDynamicNames();
      console.log(`[transcribe] Dynamic names: ${staffNames.length} staff, ${patientNames.length} patients`);

      // 過去の誤変換フィードバックをDBから取得（プロンプト強化用）
      let feedbackCorrections: Array<{ wrongValue: string | null; correctValue: string | null }> = [];
      try {
        const { getRecentVoiceFeedbacks } = await import("../db");
        feedbackCorrections = await getRecentVoiceFeedbacks(context, 20);
        if (feedbackCorrections.length > 0) {
          console.log(`[transcribe] Loaded ${feedbackCorrections.length} feedback corrections for context=${context}`);
        }
      } catch (fbErr) {
        console.warn("[transcribe] Failed to load feedback corrections:", fbErr);
      }

      // まず Gemini Audio API を試みる（最高品質・医療用語対応）
      if (ENV.geminiApiKey) {
        try {
          const text = await transcribeWithGemini(Buffer.from(audioBuffer), mimeType, context, staffNames, patientNames, feedbackCorrections);
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
          const text = await transcribeWithWhisper(Buffer.from(audioBuffer), mimeType, context, staffNames, patientNames);
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
      // フィードバックをDBに保存（次回の認識精度向上に活用）
      console.log(`[voice-feedback] context=${context || "general"} | wrong: "${wrongText}" → corrected: "${correctedText}"`);
      try {
        const { saveVoiceFeedback } = await import("../db");
        await saveVoiceFeedback({
          wrongText,
          correctedText,
          context: context || "general",
        });
      } catch (dbErr) {
        console.warn("[voice-feedback] DB save failed:", dbErr);
      }
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
      // 最初のシートを使用
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      // テンプレート構造: 1行目タイトル・2行目説明・3行目ヘッダー・4〜7行目記入例・8行目以降データ
      // range:2 → 3行目をヘッダーとして読み込み（記入例行4〜7行目もデータとして読まれる）
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { range: 2, defval: "" });
      const VALID_TEAMS = ["身体", "天理", "郡山北部", "郡山南部"];
      const TEAM_EXAMPLE = "例：身体・天理・郡山北部・郡山南部";
      const patients: Array<{ name: string; team: string; nameKana?: string; active?: number; patientCode?: string }> = [];
      const errors: string[] = [];
      let skipped = 0;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        // ヘッダー行キーを柔軟に取得（★付きも対応）
        const name = String(row["★ 氏名"] ?? row["氏名"] ?? "").trim();
        const team = String(row["★ チーム"] ?? row["チーム"] ?? "").trim();
        const nameKana = String(row["ふりがな"] ?? "").trim();
        const patientCode = String(row["利用者ID"] ?? row["ID"] ?? "").trim();
        const activeRaw = row["有効フラグ（1=有効 / 0=無効）"] ?? row["有効フラグ"] ?? 1;
        const active = Number(activeRaw) === 0 ? 0 : 1;
        if (!name) { skipped++; continue; } // 空行スキップ
        // 記入例行をスキップ（i=0〜3 は 4〜7行目 = 記入例）
        if (i < 4) { skipped++; continue; }
        // 実際のExcel行番号（range:2で読むとi=0が4行目、i=4が8行目）
        const excelRowNum = i + 4;
        if (!VALID_TEAMS.includes(team)) {
          errors.push(`${excelRowNum}行目：チーム名が正しくありません（${TEAM_EXAMPLE}）`);
          continue;
        }
        patients.push({ name, team, nameKana: nameKana || undefined, active, patientCode: patientCode || undefined });
      }
      if (patients.length === 0 && errors.length > 0) {
        res.status(400).json({ error: "インポートできる行がありませんでした", errors, skipped }); return;
      }
      // DB登録（同名氏名は上書き更新）
      const { batchCreatePatients } = await import("../db");
      const result = await batchCreatePatients(patients);
      res.json({ success: true, created: result.created, updated: result.updated, count: result.created + result.updated, skipped, errors });
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
        ["「利用者一括登録テンプレート」"],
        ["★マークの列は必須です。8行目以降にデータを入力してください（4〜7行目は記入例です）。"],
        ["利用者ID", "★ 氏名", "ふりがな", "★ チーム", "有効フラグ（1=有効 / 0=無効）"],
        ["P001", "山田 太郎", "やまだ たろう", "身体", "1"],
        ["P002", "鈴木 花子", "すずき はなこ", "天理", "1"],
        ["", "田中 一郎", "", "郡山北部", "1"],
        ["", "佐藤 二郎", "", "郡山南部", "1"],
      ];
      const ws = XLSX.utils.aoa_to_sheet(headerInfo);
      // 列幅設定
      ws["!cols"] = [{ wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 14 }, { wch: 30 }];
      XLSX.utils.book_append_sheet(wb, ws, "利用者");
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

  // 利用者エクスポート /api/export/patients
  // 現在登録されている全利用者（有効・退所済含む）をExcelとしてダウンロード
  // ダウンロードしたファイルはそのままインポートテンプレートとして使用可能
  app.get("/api/export/patients", async (req, res) => {
    try {
      // 認証チェック（Manus OAuth と localAuth の両方に対応）
      const { parse: parseCookieHeader } = await import("cookie");
      const { COOKIE_NAME } = await import("../../shared/const");
      const cookieHeader = req.headers.cookie;
      const cookies = cookieHeader ? parseCookieHeader(cookieHeader) : {};
      const sessionToken = cookies[COOKIE_NAME];
      // sdk.verifySession（Manus OAuth）を試み、失敗したら localAuth.verifySessionToken を試みる
      const { sdk } = await import("./sdk");
      const { verifySessionToken } = await import("./localAuth");
      const sdkSession = await sdk.verifySession(sessionToken);
      const localSession = sdkSession ? null : await verifySessionToken(sessionToken);
      if (!sdkSession && !localSession) { res.status(401).json({ error: "認証が必要です" }); return; }

      const { db } = await import("../db");
      const { patients } = await import("../../drizzle/schema");
      const { asc } = await import("drizzle-orm");

      const allPatients = await db
        .select()
        .from(patients)
        .orderBy(asc(patients.team), asc(patients.name));

      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();

      // ヘッダー行（インポートテンプレートと同じ形式）
      const headerRows = [
        ["「利用者エクスポートデータ」 ※このファイルに行を追加してそのままインポートできます"],
        ["★マークの列は必須です。4行目以降がデータです。有効フラグ：1=有効 / 0=退所済"],
        ["利用者ID", "★ 氏名", "ふりがな", "★ チーム", "有効フラグ（1=有効 / 0=無効）"],
      ];

      // データ行
      const dataRows = allPatients.map((p) => [
        p.patientCode ?? "",
        p.name,
        p.nameKana ?? "",
        p.team,
        p.active,
      ]);

      const ws = XLSX.utils.aoa_to_sheet([...headerRows, ...dataRows]);

      // 列幅設定
      ws["!cols"] = [
        { wch: 12 },  // 利用者ID
        { wch: 20 },  // 氏名
        { wch: 20 },  // ふりがな
        { wch: 14 },  // チーム
        { wch: 30 },  // 有効フラグ
      ];

      // ヘッダー行のスタイル（太字・背景色）
      // 3行目（ヘッダー行）のセルに背景色を設定
      const headerCols = ["A", "B", "C", "D", "E"];
      for (const col of headerCols) {
        const cellRef = `${col}3`;
        if (ws[cellRef]) {
          ws[cellRef].s = {
            font: { bold: true },
            fill: { fgColor: { rgb: "D6E4F0" } },
          };
        }
      }

      XLSX.utils.book_append_sheet(wb, ws, "利用者");

      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      const now = new Date();
      const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
      const filename = encodeURIComponent(`ひなた_利用者一覧_${dateStr}.xlsx`);
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${filename}`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buf);
    } catch (e) {
      console.error("[export/patients] error:", e);
      res.status(500).json({ error: "エクスポート処理中にエラーが発生しました" });
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

// ========== 申し送りコメントをスプレッドシートに転記する ==========
// 指定日付の申し送りコメントを「申し送り・コメント履歴」タブに転記する
async function exportCommentsToSheet(dateStr: string): Promise<void> {
  const VISIT_RECORD_SHEET_ID = "1WOZQ5rI0Fu57nWaiGwComPS_DdEwPgNR6zeOmyrqKpo"; // ひなた_次回訪問日時（同じスプレッドシートに新タブを追加）
  const COMMENT_SHEET_NAME = "申し送り・コメント履歴";

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !privateKey) {
    console.warn("[CommentExport] サービスアカウント設定がありません。スキップします。");
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
    throw new Error("[CommentExport] 認証トークン取得失敗");
  }

  // 今日のコメントを取得
  const comments = await getCommentsByDate(dateStr);
  if (comments.length === 0) {
    console.log(`[CommentExport] ${dateStr} のコメントは0件。スキップします。`);
    await deleteCommentsByDate(dateStr);
    return;
  }

  // 「申し送り・コメント履歴」シートが存在するか確認
  const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${VISIT_RECORD_SHEET_ID}?fields=sheets.properties`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metaRes.ok) throw new Error(`[CommentExport] シートメタ取得失敗: ${await metaRes.text()}`);
  const meta = await metaRes.json() as { sheets: { properties: { sheetId: number; title: string } }[] };
  const existingSheet = meta.sheets.find(s => s.properties.title === COMMENT_SHEET_NAME);

  let commentSheetId: number;

  if (!existingSheet) {
    // 新タブを作成
    const addSheetRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${VISIT_RECORD_SHEET_ID}:batchUpdate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{
          addSheet: {
            properties: {
              title: COMMENT_SHEET_NAME,
              gridProperties: { rowCount: 1000, columnCount: 6 },
            },
          },
        }],
      }),
    });
    if (!addSheetRes.ok) throw new Error(`[CommentExport] シート作成失敗: ${await addSheetRes.text()}`);
    const addSheetData = await addSheetRes.json() as { replies: { addSheet: { properties: { sheetId: number } } }[] };
    commentSheetId = addSheetData.replies[0].addSheet.properties.sheetId;

    // ヘッダー行を追加
    const headerRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${VISIT_RECORD_SHEET_ID}/values/${encodeURIComponent(COMMENT_SHEET_NAME + "!A1")}?valueInputOption=USER_ENTERED`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        range: `${COMMENT_SHEET_NAME}!A1`,
        majorDimension: "ROWS",
        values: [["日付", "チーム", "投稿者", "コメント内容", "投稿日時", "リアクション"]],
      }),
    });
    if (!headerRes.ok) console.warn(`[CommentExport] ヘッダー追加失敗: ${await headerRes.text()}`);

    // ヘッダー行の書式設定（太字・背景色）
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${VISIT_RECORD_SHEET_ID}:batchUpdate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            repeatCell: {
              range: { sheetId: commentSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 6 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.18, green: 0.38, blue: 0.54 },
                  textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 10 },
                  horizontalAlignment: "CENTER",
                  verticalAlignment: "MIDDLE",
                },
              },
              fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)",
            },
          },
          { updateDimensionProperties: { range: { sheetId: commentSheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 36 }, fields: "pixelSize" } },
          { updateDimensionProperties: { range: { sheetId: commentSheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 120 }, fields: "pixelSize" } }, // 日付
          { updateDimensionProperties: { range: { sheetId: commentSheetId, dimension: "COLUMNS", startIndex: 1, endIndex: 2 }, properties: { pixelSize: 100 }, fields: "pixelSize" } }, // チーム
          { updateDimensionProperties: { range: { sheetId: commentSheetId, dimension: "COLUMNS", startIndex: 2, endIndex: 3 }, properties: { pixelSize: 100 }, fields: "pixelSize" } }, // 投稿者
          { updateDimensionProperties: { range: { sheetId: commentSheetId, dimension: "COLUMNS", startIndex: 3, endIndex: 4 }, properties: { pixelSize: 400 }, fields: "pixelSize" } }, // コメント
          { updateDimensionProperties: { range: { sheetId: commentSheetId, dimension: "COLUMNS", startIndex: 4, endIndex: 5 }, properties: { pixelSize: 150 }, fields: "pixelSize" } }, // 投稿日時
          { updateDimensionProperties: { range: { sheetId: commentSheetId, dimension: "COLUMNS", startIndex: 5, endIndex: 6 }, properties: { pixelSize: 200 }, fields: "pixelSize" } }, // リアクション
          { updateSheetProperties: { properties: { sheetId: commentSheetId, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
        ],
      }),
    });
  } else {
    commentSheetId = existingSheet.properties.sheetId;
  }

  // コメントデータを行に変換
  const rows = comments.map(c => {
    const jstDate = new Date(c.createdAt.getTime() + 9 * 60 * 60 * 1000);
    const timeStr = jstDate.toISOString().slice(0, 16).replace("T", " ");
    return [
      dateStr,         // 日付（YYYY-MM-DD）
      c.team,          // チーム名
      c.userName,      // 投稿者
      c.content,       // コメント内容
      timeStr,         // 投稿日時
      "",              // リアクション（後で追記可能）
    ];
  });

  // データをシートに追記
  const appendRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${VISIT_RECORD_SHEET_ID}/values/${encodeURIComponent(COMMENT_SHEET_NAME + "!A:F")}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ range: `${COMMENT_SHEET_NAME}!A:F`, majorDimension: "ROWS", values: rows }),
  });
  if (!appendRes.ok) throw new Error(`[CommentExport] データ追記失敗: ${await appendRes.text()}`);

  // 転記完了後にDBから削除
  await deleteCommentsByDate(dateStr);
  console.log(`[CommentExport] ${comments.length}件のコメントを転記しました: ${dateStr}`);
}

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
        // 1. 今日のコメントをスプレッドシートに転記してから削除
        try {
          await exportCommentsToSheet(dateStr);
          console.log(`[ScheduleRotation] 申し送りコメント転記完了: ${dateStr}`);
        } catch (commentErr) {
          console.error(`[ScheduleRotation] 申し送りコメント転記エラー:`, commentErr);
          // 転記失敗でもローテーションは続行
        }
        // 2. スクショのローテーション（今日→削除、明日→今日・2日後→明日・3日後→2日後・4日後→3日後）
        const rotateResult = await rotateScheduleDays();
        console.log(`[ScheduleRotation] 完了 - 削除:${rotateResult.deleted}件, シフト:${rotateResult.shifted}件`);
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

// ========== 毎朝5:05（JST）にゴミ箱の30日超過タスクを自動完全削除 ==========
function scheduleTrashCleanup() {
  const checkInterval = 60 * 1000; // 1分ごとにチェック
  let lastCleanupDate = "";
  setInterval(async () => {
    const now = new Date();
    const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000); // UTC+9（JST）
    const h = jstNow.getUTCHours();
    const m = jstNow.getUTCMinutes();
    const dateStr = jstNow.toISOString().slice(0, 10);
    // 毎朝5:05（JST）に1回だけ実行（タスクリマインダーの5分後）
    if (h === 5 && m === 5 && lastCleanupDate !== dateStr) {
      lastCleanupDate = dateStr;
      try {
        console.log(`[TrashCleanup] ${dateStr} 05:05 - ゴミ箱の30日超過タスクを削除します`);
        const deletedCount = await cleanupExpiredDeletedTasks();
        if (deletedCount > 0) {
          console.log(`[TrashCleanup] ${deletedCount}件の期限切れタスクを完全削除しました`);
          await notifyOwner({
            title: `🗑️ ゴミ箱自動クリーンアップ完了`,
            content: `${dateStr} に削除から30日以上経過したタスクを ${deletedCount}件 完全削除しました。`,
          });
        } else {
          console.log(`[TrashCleanup] 削除対象のタスクはありませんでした`);
        }
      } catch (e) {
        console.error(`[TrashCleanup] エラー:`, e);
      }
    }
  }, checkInterval);
  console.log("[TrashCleanup] 毎朝5:05のゴミ箱自動クリーンアップスケジューラーを開始しました");
}
scheduleTrashCleanup();

// ========== 毎月末25日（JST）に翌月分アルコールチェックスプレッドシートを自動作成・DB登録 ==========
function scheduleNextMonthAlcoholSheet() {
  const checkInterval = 60 * 1000; // 1分ごとにチェック
  let lastCreatedMonth = "";

  setInterval(async () => {
    const now = new Date();
    const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000); // UTC+9（JST）
    const h = jstNow.getUTCHours();
    const m = jstNow.getUTCMinutes();
    const d = jstNow.getUTCDate();
    const currentYear = jstNow.getUTCFullYear();
    const currentMonth = jstNow.getUTCMonth() + 1;
    const monthKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

    // 毎月25日 9:00（JST）に1回だけ実行
    if (d === 25 && h === 9 && m === 0 && lastCreatedMonth !== monthKey) {
      lastCreatedMonth = monthKey;
      try {
        // 翌月の年・月を計算
        const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
        const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;
        const nextMonthLabel = `${nextYear}年${nextMonth}月`;

        console.log(`[AlcoholSheetAuto] ${nextMonthLabel}のアルコールチェックスプレッドシートを自動作成します`);

        // 既に登録済みの場合はスキップ
        const existing = await getAlcoholCheckSpreadsheet(nextYear, nextMonth);
        if (existing) {
          console.log(`[AlcoholSheetAuto] ${nextMonthLabel}は既に登録済みです（ID: ${existing.spreadsheetId}）。スキップします。`);
          return;
        }

        // Google Sheets APIでスプレッドシートを新規作成
        const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
        const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
        if (!email || !privateKey) {
          console.warn("[AlcoholSheetAuto] サービスアカウント設定がありません。スキップします。");
          return;
        }
        const { GoogleAuth } = await import("google-auth-library");
        const auth = new GoogleAuth({
          credentials: { client_email: email, private_key: privateKey.replace(/\\n/g, "\n") },
          scopes: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"],
        });
        const client = await auth.getClient();
        const tokenObj = await client.getAccessToken();
        const token = tokenObj.token;
        if (!token) {
          console.warn("[AlcoholSheetAuto] 認証トークン取得失敗。スキップします。");
          return;
        }

        // スプレッドシートを新規作成
        const createRes = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            properties: { title: `アルコールチェック記録_${nextMonthLabel}` },
          }),
        });
        if (!createRes.ok) {
          const text = await createRes.text();
          console.error(`[AlcoholSheetAuto] スプレッドシート作成失敗: ${text}`);
          return;
        }
        const created = await createRes.json() as { spreadsheetId?: string };
        const newSpreadsheetId = created.spreadsheetId;
        if (!newSpreadsheetId) {
          console.error("[AlcoholSheetAuto] spreadsheetIdが取得できませんでした");
          return;
        }

        // ヘッダー行を挿入
        const ALCOHOL_HEADER = [
          "実施日時", "区分", "氏名", "ナンバープレート",
          "出勤打刻", "退勤打刻", "確認方法", "検知器使用",
          "酒気帯有無", "確認者", "残業時間", "残業理由",
          "連絡先", "人数", "備考", "登録日時"
        ];
        const headerUrl = `https://sheets.googleapis.com/v4/spreadsheets/${newSpreadsheetId}/values/${encodeURIComponent("Sheet1!A1")}?valueInputOption=USER_ENTERED`;
        const headerRes = await fetch(headerUrl, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ values: [ALCOHOL_HEADER] }),
        });
        if (!headerRes.ok) {
          const text = await headerRes.text();
          console.warn(`[AlcoholSheetAuto] ヘッダー行挿入失敗（続行）: ${text}`);
        } else {
          console.log(`[AlcoholSheetAuto] ヘッダー行を挿入しました`);
        }

        // ヘッダー行を太字・背景色で書式設定
        const formatRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${newSpreadsheetId}:batchUpdate`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            requests: [
              {
                repeatCell: {
                  range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: ALCOHOL_HEADER.length },
                  cell: {
                    userEnteredFormat: {
                      backgroundColor: { red: 0.267, green: 0.533, blue: 0.667 },
                      textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                      horizontalAlignment: "CENTER",
                    },
                  },
                  fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
                },
              },
              {
                updateSheetProperties: {
                  properties: { sheetId: 0, gridProperties: { frozenRowCount: 1 } },
                  fields: "gridProperties.frozenRowCount",
                },
              },
            ],
          }),
        });
        if (!formatRes.ok) {
          const text = await formatRes.text();
          console.warn(`[AlcoholSheetAuto] ヘッダー書式設定失敗（続行）: ${text}`);
        } else {
          console.log(`[AlcoholSheetAuto] ヘッダー行の書式設定完了`);
        }

        // DBに登録
        await upsertAlcoholCheckSpreadsheet({
          year: nextYear,
          month: nextMonth,
          spreadsheetId: newSpreadsheetId,
          label: nextMonthLabel,
        });

        console.log(`[AlcoholSheetAuto] ${nextMonthLabel}のスプレッドシートを作成・登録しました（ID: ${newSpreadsheetId}）`);

        // 管理者に通知
        await notifyOwner({
          title: `📋 ${nextMonthLabel}アルコールチェックシート自動作成完了`,
          content: `${nextMonthLabel}分のアルコールチェック記録スプレッドシートを自動作成しました。\nスプレッドシートID: ${newSpreadsheetId}\nhttps://docs.google.com/spreadsheets/d/${newSpreadsheetId}`,
        });
      } catch (e) {
        console.error(`[AlcoholSheetAuto] エラー:`, e);
      }
    }
  }, checkInterval);

  console.log("[AlcoholSheetAuto] 毎月25日9:00の翌月スプレッドシート自動作成スケジューラーを開始しました");
}
scheduleNextMonthAlcoholSheet();

// ========== 毎月末25日（JST）に翌月分出退勤スプレッドシートを自動作成・DB登録 ==========
function scheduleNextMonthTimesheetSheet() {
  const checkInterval = 60 * 1000; // 1分ごとにチェック
  let lastCreatedMonth = "";
  setInterval(async () => {
    const now = new Date();
    const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000); // UTC+9（JST）
    const h = jstNow.getUTCHours();
    const m = jstNow.getUTCMinutes();
    const d = jstNow.getUTCDate();
    const currentYear = jstNow.getUTCFullYear();
    const currentMonth = jstNow.getUTCMonth() + 1;
    const monthKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    // 毎月25日 9:05（JST）に1回だけ実行（アルコールチェックシートと5分ずらす）
    if (d === 25 && h === 9 && m === 5 && lastCreatedMonth !== monthKey) {
      lastCreatedMonth = monthKey;
      try {
        // 翌月の年・月を計算
        const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
        const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;
        const nextMonthLabel = `${nextYear}年${nextMonth}月`;

        // 既に登録済みかチェック
        const { getTimesheetSpreadsheets } = await import("../db");
        const existing = await getTimesheetSpreadsheets(nextYear, nextMonth);
        if (existing && existing.length > 0) {
          console.log(`[TimesheetSheetAuto] ${nextMonthLabel}分は既に登録済みのためスキップ`);
          return;
        }

        // 累月スプレッドシートを自動作成
        const { autoCreateTimesheetSpreadsheet } = await import("../routers");
        const newSpreadsheetId = await autoCreateTimesheetSpreadsheet(nextYear, nextMonth);
        if (!newSpreadsheetId) {
          console.error(`[TimesheetSheetAuto] ${nextMonthLabel}分のスプレッドシート作成に失敗しました`);
          return;
        }

        console.log(`[TimesheetSheetAuto] ${nextMonthLabel}分のスプレッドシートを作成しました: ${newSpreadsheetId}`);
        // 管理者に通知
        await notifyOwner({
          title: `📊 ${nextMonthLabel}出退勤シート自動作成完了`,
          content: `${nextMonthLabel}分の出退勤記録スプレッドシートを自動作成しました。\nスプレッドシートID: ${newSpreadsheetId}\nhttps://docs.google.com/spreadsheets/d/${newSpreadsheetId}`,
        });
      } catch (e) {
        console.error(`[TimesheetSheetAuto] エラー:`, e);
      }
    }
  }, checkInterval);

  console.log("[TimesheetSheetAuto] 毎月25日9:05の翌月出退勤スプレッドシート自動作成スケジューラーを開始しました");
}
scheduleNextMonthTimesheetSheet();

// ========== 毎日0:05（JST）にスケジュール変更連絡をtoDatetimeから3日後に自動削除 ==========
function scheduleScheduleChangeCleanup() {
  const checkInterval = 60 * 1000; // 1分ごとにチェック
  let lastCleanedDate = "";

  setInterval(async () => {
    const now = new Date();
    const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const h = jstNow.getUTCHours();
    const m = jstNow.getUTCMinutes();
    const dateStr = jstNow.toISOString().slice(0, 10);

    // 毎日0:05（JST）に1回だけ実行
    if (h === 0 && m === 5 && lastCleanedDate !== dateStr) {
      lastCleanedDate = dateStr;
      try {
        console.log(`[ScheduleChangeCleanup] ${dateStr} 00:05 - toDatetimeから3日経過したスケジュール変更連絡を削除します`);
        const db = await import("../db");
        const { scheduleChanges } = await import("../../drizzle/schema");
        const { drizzle } = await import("drizzle-orm/mysql2");
        const mysql = await import("mysql2/promise");
        const { lt, isNotNull } = await import("drizzle-orm");

        const connection = await mysql.default.createConnection(process.env.DATABASE_URL!);
        const drizzleDb = drizzle(connection);

        // 3日前の日時（JST）
        const threeDaysAgo = new Date(jstNow.getTime() - 3 * 24 * 60 * 60 * 1000);
        const threeDaysAgoStr = threeDaysAgo.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:mm"

        // toDatetime が設定されていて、3日以上前のレコードを削除
        // toDatetime は "YYYY-MM-DDTHH:mm" 形式の文字列
        const result = await drizzleDb
          .delete(scheduleChanges)
          .where(
            lt(scheduleChanges.toDatetime, threeDaysAgoStr)
          );

        const deletedCount = (result as any)[0]?.affectedRows ?? 0;
        console.log(`[ScheduleChangeCleanup] ${deletedCount}件のスケジュール変更連絡を削除しました`);

        await connection.end();
      } catch (e) {
        console.error(`[ScheduleChangeCleanup] エラー:`, e);
      }
    }
  }, checkInterval);

  console.log("[ScheduleChangeCleanup] 毎日0:05のスケジュール変更連絡自動削除スケジューラーを開始しました");
}
scheduleScheduleChangeCleanup();
