/**
 * 全スクリーンショットを強制再解析するスクリプト
 * endTime優先の新プロンプトで全件を更新する
 */
import { createConnection } from 'mysql2/promise';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import dotenv from 'dotenv';

dotenv.config();

const DB_URL = process.env.DATABASE_URL;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!DB_URL || !GEMINI_API_KEY) {
  console.error('DATABASE_URL or GEMINI_API_KEY not set');
  process.exit(1);
}

function parseDbUrl(url) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: parseInt(u.port || '3306'),
    user: u.username,
    password: u.password,
    database: u.pathname.slice(1),
    ssl: { rejectUnauthorized: false },
  };
}

async function fetchImageAsBase64(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve(buf.toString('base64'));
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

const PROMPT = `このZESTのスクリーンショットから訪問スケジュールを読み取り、以下のJSON形式で返してください。

重要な読み取りルール：
1. スタッフ列は左から右の順番通りに staffColumns 配列に格納する（列順が重要）
2. 各ブロックの上端 = 開始時刻、下端 = 終了時刻として正確に読み取る
3. ブロック内に「HH:MM〜HH:MM」形式で時刻が記載されている場合は必ずそれを使用する
4. 終了時刻（endTime）は必ず読み取ること。ブロック内に記載がある場合は正確に転記する
5. durationMinutes は endTime - startTime で計算した分数を入れる（endTimeが読み取れた場合のみ）
6. 勤務外・休憩ブロックも含めて全て読み取る

返すJSONの形式：
{
  "staffColumns": ["スタッフ名1", "スタッフ名2", ...],  // 左から右の列順
  "entries": [
    {
      "staffName": "スタッフ名",
      "time": "HH:MM",        // 開始時刻（必須）
      "endTime": "HH:MM",     // 終了時刻（必須・ブロック下端から読み取る）
      "durationMinutes": 60,  // 滞在分数（endTime - time）
      "patientName": "利用者名 or null",
      "visitType": "訪問看護 or 精神科訪問看護 or 精神科特指 or 医療看護 or 勤務外 or 休憩 or その他",
      "notes": "備考 or null"
    }
  ]
}

注意：
- staffColumnsは必ず画面左から右の順番で記載する
- endTimeは推測せず、ブロック内に記載されている時刻を使用する
- 記載がない場合はnullにする（推測しない）
- JSONのみ返す（説明文不要）`;

async function analyzeImage(base64Image, mimeType = 'image/png') {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const body = JSON.stringify({
    contents: [{
      parts: [
        { text: PROMPT },
        { inline_data: { mime_type: mimeType, data: base64Image } }
      ]
    }],
    generationConfig: { temperature: 0.1 }
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in response: ' + text.slice(0, 200));
  return JSON.parse(jsonMatch[0]);
}

async function main() {
  const conn = await createConnection(parseDbUrl(DB_URL));
  console.log('Connected to DB');

  const [rows] = await conn.execute(
    'SELECT id, team, day, scheduleDate, imageUrl, imageKey, analyzedData FROM schedule_screenshots ORDER BY id'
  );

  console.log(`Found ${rows.length} records to re-analyze`);

  for (const row of rows) {
    const { id, team, day, scheduleDate, imageUrl, imageKey, analyzedData } = row;
    console.log(`\n[${id}] ${team} ${scheduleDate || day} - Analyzing...`);

    try {
      const base64 = await fetchImageAsBase64(imageUrl);
      const mimeType = 'image/jpeg';
      const parsed = await analyzeImage(base64, mimeType);

      // staffColumnsとentriesを保存
      const staffColumns = parsed.staffColumns || [];
      const entries = parsed.entries || [];

      // endTimeの統計を表示
      const withEndTime = entries.filter(e => e.endTime).length;
      console.log(`  staffColumns: [${staffColumns.join(', ')}]`);
      console.log(`  entries: ${entries.length}件, endTime有: ${withEndTime}件`);

      // DBを更新
      await conn.execute(
        'UPDATE schedule_screenshots SET analyzedData = ?, updatedAt = NOW() WHERE id = ?',
        [JSON.stringify({ staffColumns, entries }), id]
      );
      console.log(`  ✓ Updated ID=${id}`);

      // API制限対策で1秒待機
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      console.error(`  ✗ Error for ID=${id}:`, err.message);
    }
  }

  await conn.end();
  console.log('\n=== Re-analysis complete ===');
}

main().catch(console.error);
