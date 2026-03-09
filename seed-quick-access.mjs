import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const seedData = [
  // スプレッドシート
  { category: "スプレッドシート", label: "利用者料金一覧（精神郡山）", href: "https://docs.google.com/spreadsheets/d/1YBK1YOFOhJDnry1b0zQjI5jAU91RnBfLOE-bGve3b5M/edit?usp=sharing", color: "text-emerald-600", sortOrder: 1 },
  { category: "スプレッドシート", label: "利用者料金一覧（身体）", href: "https://docs.google.com/spreadsheets/d/1W4QLGnhg0wuZqcY96M8kIttrqAO00JxFFaJgUb7YOxA/edit?usp=sharing", color: "text-blue-600", sortOrder: 2 },
  { category: "スプレッドシート", label: "利用者料金一覧（天理）", href: "https://docs.google.com/spreadsheets/d/15BWxn2MHSLcpcKaMa5q9QcIQiccfjiHhAfMKcCnvsVE/edit?usp=sharing", color: "text-teal-600", sortOrder: 3 },
  { category: "スプレッドシート", label: "業務日報", href: "https://docs.google.com/spreadsheets/d/10Leb7UR6ARVlCGbf5pBa5yxsgm5WAV9m-ETyYrzfBCs/edit?usp=sharing", color: "text-orange-600", sortOrder: 4 },
  { category: "スプレッドシート", label: "ひなた勤怠", href: "https://docs.google.com/spreadsheets/d/1e5xvZHvqSneNZIsO1g8h68-Ue9QnoYXCdCPkt-pIwsQ/edit?usp=sharing", color: "text-rose-600", sortOrder: 5 },
  { category: "スプレッドシート", label: "退勤時チェックリスト", href: "https://docs.google.com/spreadsheets/d/1g_wTtoQCxiHQupPlEmZVMWWxgzG0ZGH23j-xj1AzdUE/edit?usp=sharing", color: "text-amber-600", sortOrder: 6 },
  // その他
  { category: "その他", label: "NotebookLM — 就業規則・社内マニュアル", href: "https://notebooklm.google.com/notebook/4781c6de-6e18-456d-b557-a202c3b03747", color: "text-blue-600", sortOrder: 1 },
  { category: "その他", label: "Gemini — Google AIチャット", href: "https://gemini.google.com/app", color: "text-violet-600", sortOrder: 2 },
  { category: "その他", label: "Gemini Gems — MSE看護記録作成サポーター", href: "https://gemini.google.com/gem/1qqbO6BLZLj9IXwsOjYuePdyQn0QGkifV?usp=sharing", color: "text-purple-600", sortOrder: 3 },
  { category: "その他", label: "ひなた 公式 Instagram", href: "https://www.instagram.com/kokoronohinata/", color: "text-pink-600", sortOrder: 4 },
];

async function main() {
  const conn = await createConnection(DATABASE_URL);
  try {
    // 既存データを確認
    const [existing] = await conn.execute("SELECT COUNT(*) as cnt FROM quick_access_links");
    const count = existing[0].cnt;
    if (count > 0) {
      console.log(`Already has ${count} rows. Skipping seed.`);
      return;
    }
    // シードデータを投入
    for (const row of seedData) {
      await conn.execute(
        "INSERT INTO quick_access_links (category, label, href, color, sortOrder) VALUES (?, ?, ?, ?, ?)",
        [row.category, row.label, row.href, row.color, row.sortOrder]
      );
    }
    console.log(`Seeded ${seedData.length} quick_access_links rows.`);
  } finally {
    await conn.end();
  }
}

main().catch(console.error);
