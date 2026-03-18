/**
 * RailwayのMySQLマイグレーション履歴を修正するスクリプト
 * 
 * 問題: imageDataカラムは既にDBに存在するが、マイグレーション履歴(0011以降)が記録されていない
 * 解決: 0011〜0031のマイグレーションをDBに適用しつつ、既存カラムのエラーをスキップする
 */

import mysql from 'mysql2/promise';
import { createHash } from 'crypto';
import { readFileSync, existsSync } from 'fs';

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

// drizzle-kitのハッシュ計算方法を再現
// drizzle-kitはSQLファイルの内容をsha256でハッシュ化する
function computeHash(sqlContent) {
  return createHash('sha256').update(sqlContent).digest('hex');
}

// drizzle/meta/_journal.jsonからマイグレーション情報を読み込む
const journal = JSON.parse(readFileSync('./drizzle/meta/_journal.json', 'utf-8'));

async function main() {
  const conn = await mysql.createConnection(DB_URL);
  
  try {
    // 現在のマイグレーション履歴を取得
    const [existing] = await conn.query('SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY id');
    console.log(`既存のマイグレーション数: ${existing.length}`);
    existing.forEach(r => console.log(`  id=${r.id} hash=${r.hash.substring(0, 16)}...`));
    
    // 既存のハッシュセット
    const existingHashes = new Set(existing.map(r => r.hash));
    
    console.log('\n--- マイグレーション適用開始 ---\n');
    
    for (const entry of journal.entries) {
      const sqlFile = `./drizzle/${entry.tag}.sql`;
      
      if (!existsSync(sqlFile)) {
        console.log(`⚠ ${entry.tag}: SQLファイルが見つかりません`);
        continue;
      }
      
      const sqlContent = readFileSync(sqlFile, 'utf-8');
      const hash = computeHash(sqlContent);
      
      if (existingHashes.has(hash)) {
        console.log(`✓ ${entry.tag} (適用済み)`);
        continue;
      }
      
      console.log(`→ ${entry.tag} (適用が必要)`);
      
      // 複数のSQL文を分割して実行
      const statements = sqlContent
        .split('\n--> statement-breakpoint\n')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));
      
      let hasError = false;
      for (const stmt of statements) {
        // セミコロンで終わる場合は除去
        const cleanStmt = stmt.replace(/;$/, '').trim();
        if (!cleanStmt) continue;
        
        try {
          await conn.query(cleanStmt);
          console.log(`  ✓ ${cleanStmt.substring(0, 80)}`);
        } catch (e) {
          const skipCodes = ['ER_DUP_FIELDNAME', 'ER_TABLE_EXISTS_ERROR', 'ER_DUP_KEYNAME'];
          if (skipCodes.includes(e.code) || e.message.includes('already exists') || 
              e.message.includes('Duplicate column') || e.message.includes('Duplicate key')) {
            console.log(`  ⚠ スキップ (既存): ${cleanStmt.substring(0, 80)}`);
          } else {
            console.error(`  ✗ エラー [${e.code}]: ${e.message}`);
            console.error(`    SQL: ${cleanStmt}`);
            hasError = true;
          }
        }
      }
      
      if (!hasError) {
        // マイグレーション履歴に追加
        await conn.query(
          'INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)',
          [hash, entry.when]
        );
        console.log(`  ✅ 履歴に追加: hash=${hash.substring(0, 16)}...`);
      } else {
        console.log(`  ⚠ エラーがあったため履歴に追加しませんでした`);
      }
    }
    
    console.log('\n--- 完了 ---');
    
    // 最終確認
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
