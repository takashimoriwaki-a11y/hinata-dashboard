/**
 * 全スクリーンショットを新しいAI解析プロンプト（staffColumns付き）で再解析してDBを更新する
 */
import { createConnection } from "mysql2/promise";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();

const DB_URL = process.env.DATABASE_URL;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const prompt = `あなたは訪問看護ステーションのスケジュール管理システムです。
この画像は訪問看護ステーションの訪問スケジュール表（ZESTシステム、Excel、手書き等）です。
【ZESTシステムの重要な読み取り方法】
ZESTのタイムラインでは、各利用者名が入ったブロック（枠）の縦の高さが訪問滞在時間を表します。
タイムラインの時間軸（縦軸）を基準にして、各ブロックの上端＝開始時刻、下端＝終了時刻として正確に読み取ってください。
ブロックの高さ＝滞在時間であり、これをdurationMinutesとして分単位で返してください。
例：30分のブロック→durationMinutes:30、60分のブロック→durationMinutes:60、90分のブロック→durationMinutes:90

画像から全ての予定を読み取り、以下のJSON形式で返してください。

返すJSONの形式:
{
  "staffColumns": ["スタッフ名1", "スタッフ名2", "スタッフ名3"],
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
0. 【最重要・列順】ZESTのタイムラインには複数のスタッフ列が左から右に並んでいる。staffColumnsフィールドに、画像の左端の列から右端の列の順番でスタッフ名を配列として返すこと。例：左から「袖山二美代」「岡田萌実」「徳地良太」「山本紗代」の順なら ["袖山二美代", "岡田萌実", "徳地良太", "山本紗代"] と返す。この列順は非常に重要なので、必ず画像の左→右の順序を正確に読み取ること。
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

async function reanalyze() {
  const conn = await createConnection(DB_URL);
  const genai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  // 全スクリーンショットを取得
  const [rows] = await conn.execute(
    "SELECT id, imageUrl FROM schedule_screenshots ORDER BY id"
  );

  console.log(`対象: ${rows.length}件`);

  for (const row of rows) {
    console.log(`\n処理中: ID=${row.id}`);
    try {
      let base64Image = "";
      let mimeType = "image/jpeg";

      if (row.imageUrl) {
        const response = await fetch(row.imageUrl);
        if (!response.ok) throw new Error(`画像取得失敗: ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        base64Image = Buffer.from(arrayBuffer).toString("base64");
        mimeType = response.headers.get("content-type") ?? "image/jpeg";
      } else {
        console.log(`  スキップ（画像データなし）`);
        continue;
      }

      const result = await genai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{
          role: "user",
          parts: [
            { inlineData: { mimeType, data: base64Image } },
            { text: prompt },
          ],
        }],
      });

      const text = result.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch?.[1] ?? jsonMatch?.[0] ?? text;

      // バリデーション
      const parsed = JSON.parse(jsonStr);
      const entryCount = parsed.entries?.length ?? 0;
      const staffColumns = parsed.staffColumns ?? [];

      console.log(`  エントリ数: ${entryCount}, staffColumns: [${staffColumns.join(", ")}]`);

      // DBを更新
      await conn.execute(
        "UPDATE schedule_screenshots SET analyzedData = ? WHERE id = ?",
        [jsonStr.trim(), row.id]
      );
      console.log(`  ✓ 更新完了`);

      // レート制限対策
      await new Promise(r => setTimeout(r, 3000));
    } catch (e) {
      console.error(`  ✗ エラー: ${e.message}`);
    }
  }

  await conn.end();
  console.log("\n全件処理完了");
}

reanalyze().catch(console.error);
