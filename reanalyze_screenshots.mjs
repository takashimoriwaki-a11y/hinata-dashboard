/**
 * DBに保存されている全スケジュールスクリーンショットを
 * 新しいAI解析プロンプト（durationMinutes対応）で再解析してDBを更新する
 */
import { createConnection } from "mysql2/promise";
import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

// .envを読み込む
dotenv.config({ path: "/home/ubuntu/hinata-dashboard/.env" });

const DB_URL = process.env.DATABASE_URL;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!DB_URL) {
  console.error("DATABASE_URL が設定されていません");
  process.exit(1);
}
if (!GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY が設定されていません");
  process.exit(1);
}

const PROMPT = `あなたは訪問看護ステーションのスケジュール管理システムです。
この画像は訪問看護ステーションの訪問スケジュール表（ZESTシステム、Excel、手書き等）です。

【ZESTシステムの重要な読み取り方法】
ZESTのタイムラインでは、各利用者名が入ったブロック（枠）の縦の高さが訪問滞在時間を表します。
タイムラインの時間軸（縦軸）を基準にして、各ブロックの上端＝開始時刻、下端＝終了時刻として正確に読み取ってください。
ブロックの高さ＝滞在時間であり、これをdurationMinutesとして分単位で返してください。
例：30分のブロック→durationMinutes:30、60分のブロック→durationMinutes:60、90分のブロック→durationMinutes:90

画像から全ての予定を読み取り、以下のJSON形式で返してください。

返すJSONの形式:
{
  "entries": [
    {
      "time": "HH:MM",
      "endTime": "HH:MM",
      "durationMinutes": 60,
      "patientName": "利用者名または予定名",
      "staffName": "担当スタッフ名（複数の場合はカンマ区切り）",
      "visitType": "訪問看護" または "その他",
      "notes": "備考・特記事項"
    }
  ],
  "teamName": "チーム名（読み取れた場合）",
  "date": "日付（読み取れた場合、YYYY-MM-DD形式）",
  "summary": "スケジュール全体の概要（件数・特記事項等）"
}

読み取り指示:
1. 時刻は24時間表記（HH:MM形式）で返す。8:30〜19:00の範囲を重点的に読み取る
2. 【最重要】各予定ブロックの開始時刻（time）と終了時刻（endTime）を必ず両方読み取る。ZESTでは縦軸の目盛りを基準にブロックの上端＝開始時刻、下端＝終了時刻として正確に読み取る
3. durationMinutesはendTimeとtimeの差分（分）を計算して設定する。例：9:00〜10:00なら60、9:00〜9:30なら30
4. 訪問看護以外の予定（会議・研修・事務作業・カンファレンス・外出・デイサービス同行等）も必ず含める
5. 担当スタッフ名は略称・イニシャルでも読み取れた通りに記載する
6. 利用者名は苗字のみでも記載する
7. 読み取れない項目は null を返す（ただしtimeとdurationMinutesは必須）
8. entriesは時刻順（早い順）に並べる
9. 同じ時刻に複数の予定がある場合は別々のentryとして記載する
10. JSONのみを返す（説明文・マークダウン記法は不要）`;

async function analyzeImage(imageUrl, imageData) {
  const genai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  let imagePart;

  if (imageData) {
    // DB保存のBase64データ
    const base64Match = imageData.match(/^data:([^;]+);base64,(.+)$/);
    if (base64Match) {
      imagePart = {
        inlineData: {
          mimeType: base64Match[1],
          data: base64Match[2],
        },
      };
    } else {
      // data:プレフィックスなしのBase64
      imagePart = {
        inlineData: {
          mimeType: "image/jpeg",
          data: imageData,
        },
      };
    }
  } else if (imageUrl) {
    // URLから画像を取得
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`画像取得失敗: ${response.status} ${imageUrl}`);
    }
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const contentType = response.headers.get("content-type") || "image/jpeg";
    imagePart = {
      inlineData: {
        mimeType: contentType,
        data: base64,
      },
    };
  } else {
    throw new Error("imageUrlもimageDataも存在しません");
  }

  const result = await genai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [imagePart, { text: PROMPT }],
      },
    ],
  });

  let text = result.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  // マークダウンコードブロックを除去
  text = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  return text;
}

async function main() {
  console.log("DB接続中...");
  const conn = await createConnection(DB_URL);

  try {
    // 全レコードを取得
    const [rows] = await conn.execute(
      "SELECT id, team, day, scheduleDate, imageUrl, imageData, analyzedData FROM schedule_screenshots ORDER BY id ASC"
    );

    console.log(`対象レコード数: ${rows.length}`);

    if (rows.length === 0) {
      console.log("再解析対象のレコードがありません。");
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const row of rows) {
      const { id, team, day, scheduleDate, imageUrl, imageData, analyzedData } = row;
      console.log(`\n[${id}] ${team} ${day} ${scheduleDate ?? ""} を再解析中...`);

      try {
        // 既存のanalyzedDataにdurationMinutesが含まれているか確認
        if (analyzedData) {
          try {
            const parsed = JSON.parse(analyzedData);
            const entries = parsed.entries ?? [];
            const hasDuration = entries.length > 0 && entries.some(e => typeof e.durationMinutes === 'number');
            if (hasDuration) {
              console.log(`  → 既にdurationMinutes含む。スキップ`);
              successCount++;
              continue;
            }
          } catch {}
        }

        const newAnalyzedData = await analyzeImage(imageUrl, imageData);

        // JSONとして有効か確認
        try {
          const parsed = JSON.parse(newAnalyzedData);
          const entries = parsed.entries ?? [];
          const hasDuration = entries.some(e => typeof e.durationMinutes === 'number');
          console.log(`  → entries: ${entries.length}件, durationMinutes含む: ${hasDuration}`);
        } catch (e) {
          console.warn(`  → JSONパース警告: ${e.message}`);
        }

        // DBを更新
        await conn.execute(
          "UPDATE schedule_screenshots SET analyzedData = ?, updatedAt = NOW() WHERE id = ?",
          [newAnalyzedData, id]
        );
        console.log(`  → DB更新完了`);
        successCount++;

        // API制限対策：少し待機
        await new Promise(r => setTimeout(r, 1500));
      } catch (err) {
        console.error(`  → エラー: ${err.message}`);
        errorCount++;
      }
    }

    console.log(`\n===== 再解析完了 =====`);
    console.log(`成功: ${successCount}件 / エラー: ${errorCount}件 / 合計: ${rows.length}件`);
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error("致命的エラー:", err);
  process.exit(1);
});
