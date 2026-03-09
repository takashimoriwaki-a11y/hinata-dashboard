import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const conn = await createConnection(process.env.DATABASE_URL);

const spreadsheetLinks = [
  { label: "利用者料金一覧（精神郡山）", href: "https://docs.google.com/spreadsheets/d/1YBK1YOFOhJDnry1b0zQjI5jAU91RnBfLOE-bGve3b5M/edit?usp=sharing", color: "text-emerald-600", emoji: "📊", sortOrder: 1 },
  { label: "利用者料金一覧（身体）", href: "https://docs.google.com/spreadsheets/d/1W4QLGnhg0wuZqcY96M8kIttrqAO00JxFFaJgUb7YOxA/edit?usp=sharing", color: "text-blue-600", emoji: "📊", sortOrder: 2 },
  { label: "利用者料金一覧（天理）", href: "https://docs.google.com/spreadsheets/d/15BWxn2MHSLcpcKaMa5q9QcIQiccfjiHhAfMKcCnvsVE/edit?usp=sharing", color: "text-teal-600", emoji: "📊", sortOrder: 3 },
  { label: "業務日報", href: "https://docs.google.com/spreadsheets/d/10Leb7UR6ARVlCGbf5pBa5yxsgm5WAV9m-ETyYrzfBCs/edit?usp=sharing", color: "text-orange-600", emoji: "📋", sortOrder: 4 },
  { label: "ひなた勤怠", href: "https://docs.google.com/spreadsheets/d/1e5xvZHvqSneNZIsO1g8h68-Ue9QnoYXCdCPkt-pIwsQ/edit?usp=sharing", color: "text-rose-600", emoji: "⏰", sortOrder: 5 },
  { label: "退勤時チェックリスト", href: "https://docs.google.com/spreadsheets/d/1g_wTtoQCxiHQupPlEmZVMWWxgzG0ZGH23j-xj1AzdUE/edit?usp=sharing", color: "text-amber-600", emoji: "✅", sortOrder: 6 },
];

// 既存のスプレッドシートカテゴリのレコードを確認
const [existing] = await conn.execute(
  "SELECT COUNT(*) as cnt FROM quick_access_links WHERE category = 'スプレッドシート'"
);
const count = existing[0].cnt;

if (count > 0) {
  console.log(`スプレッドシートカテゴリに既に ${count} 件あります。スキップします。`);
} else {
  for (const link of spreadsheetLinks) {
    await conn.execute(
      "INSERT INTO quick_access_links (category, label, href, emoji, color, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())",
      ["スプレッドシート", link.label, link.href, link.emoji, link.color, link.sortOrder]
    );
    console.log(`✓ 追加: ${link.label}`);
  }
  console.log("スプレッドシートリンクのシード完了");
}

await conn.end();
