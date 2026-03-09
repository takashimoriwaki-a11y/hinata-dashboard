import { createConnection } from 'mysql2/promise';
import { config } from 'dotenv';
config();

const emojiMap = [
  { id: 1, emoji: '📊' }, // 利用者料金一覧（精神郡山）
  { id: 2, emoji: '📊' }, // 利用者料金一覧（身体）
  { id: 3, emoji: '📊' }, // 利用者料金一覧（天理）
  { id: 4, emoji: '📝' }, // 業務日報
  { id: 5, emoji: '⏰' }, // ひなた勤怠
  { id: 6, emoji: '✅' }, // 退勤時チェックリスト
  { id: 7, emoji: '📚' }, // NotebookLM
  { id: 8, emoji: '✨' }, // Gemini
  { id: 9, emoji: '🤖' }, // Gemini Gems
  { id: 10, emoji: '📸' }, // Instagram
];

const conn = await createConnection(process.env.DATABASE_URL);

for (const { id, emoji } of emojiMap) {
  await conn.query('UPDATE quick_access_links SET emoji = ? WHERE id = ?', [emoji, id]);
  console.log(`Updated id=${id} → emoji=${emoji}`);
}

console.log('✅ 絵文字の設定が完了しました');
await conn.end();
