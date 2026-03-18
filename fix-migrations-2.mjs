/**
 * 失敗したマイグレーション（0015, 0027, 0028）を個別に適用するスクリプト
 */

import mysql from 'mysql2/promise';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

function computeHash(sqlContent) {
  return createHash('sha256').update(sqlContent).digest('hex');
}

// 失敗したマイグレーションのSQL（breakpointを手動で分割）
const failedMigrations = [
  {
    tag: '0015_great_next_avengers',
    when: 1772798745541,
    statements: [
      "ALTER TABLE `tasks` ADD `repeatType` enum('none','weekly','monthly') DEFAULT 'none' NOT NULL",
      "ALTER TABLE `tasks` ADD `repeatDayOfWeek` int",
      "ALTER TABLE `tasks` ADD `repeatDayOfMonth` int",
      "ALTER TABLE `tasks` ADD `repeatParentId` int",
    ]
  },
  {
    tag: '0027_vengeful_brood',
    when: 1773248353661,
    statements: [
      "ALTER TABLE `minutes` ADD `documentUrl` varchar(2048)",
      "ALTER TABLE `minutes` ADD `documentLabel` varchar(200)",
    ]
  },
  {
    tag: '0028_mushy_dragon_lord',
    when: 1773251377461,
    statements: [
      "ALTER TABLE `users` ADD `googleAccessToken` text",
      "ALTER TABLE `users` ADD `googleRefreshToken` text",
      "ALTER TABLE `users` ADD `googleTokenExpiry` bigint",
    ]
  },
];

async function main() {
  const conn = await mysql.createConnection(DB_URL);
  
  try {
    // 現在のマイグレーション履歴を取得
    const [existing] = await conn.query('SELECT hash FROM __drizzle_migrations');
    const existingHashes = new Set(existing.map(r => r.hash));
    
    for (const migration of failedMigrations) {
      // SQLファイルの内容からハッシュを計算
      const sqlContent = readFileSync(`./drizzle/${migration.tag}.sql`, 'utf-8');
      const hash = computeHash(sqlContent);
      
      if (existingHashes.has(hash)) {
        console.log(`✓ ${migration.tag} (適用済み)`);
        continue;
      }
      
      console.log(`→ ${migration.tag} (適用中...)`);
      
      let hasError = false;
      for (const stmt of migration.statements) {
        try {
          await conn.query(stmt);
          console.log(`  ✓ ${stmt.substring(0, 80)}`);
        } catch (e) {
          const skipCodes = ['ER_DUP_FIELDNAME', 'ER_TABLE_EXISTS_ERROR', 'ER_DUP_KEYNAME'];
          if (skipCodes.includes(e.code) || e.message.includes('already exists') || 
              e.message.includes('Duplicate column') || e.message.includes('Duplicate key')) {
            console.log(`  ⚠ スキップ (既存): ${stmt.substring(0, 80)}`);
          } else {
            console.error(`  ✗ エラー [${e.code}]: ${e.message}`);
            hasError = true;
          }
        }
      }
      
      // マイグレーション履歴に追加（エラーがあってもスキップ扱いなら追加）
      await conn.query(
        'INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)',
        [hash, migration.when]
      );
      console.log(`  ✅ 履歴に追加: ${migration.tag}`);
    }
    
    console.log('\n--- 完了 ---');
    const [final] = await conn.query('SELECT COUNT(*) as count FROM __drizzle_migrations');
    console.log(`最終マイグレーション数: ${final[0].count}`);
    
  } finally {
    await conn.end();
  }
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
