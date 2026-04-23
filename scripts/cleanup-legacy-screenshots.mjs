/**
 * Manus S3 経由で保存された古いスクリーンショットの imageUrl をクリーンアップする
 *
 * 背景:
 *   Week 1 の変更で schedule_screenshots の画像保存方式を S3 → DB 直接 (base64) に切り替えた。
 *   Railway稼働後、既存レコードに残っている `https://...manus-s3.../` のような S3 URL は
 *   Manus停止と共に失効し、フロントでアイコンが割れて表示される。
 *
 * このスクリプトは:
 *   1. imageUrl が http(s) で始まり、imageData が空のレコードを検出
 *   2. それらの imageUrl を空文字列 `''` に書き換え（フロント側で「画像なし」UIが自動表示される）
 *
 * スクリーンショットは毎日の業務で上書きされるため、数日以内に新しいbase64画像に置き換わる。
 *
 * 使用方法:
 *   DATABASE_URL="mysql://..." node scripts/cleanup-legacy-screenshots.mjs
 *   DATABASE_URL="mysql://..." node scripts/cleanup-legacy-screenshots.mjs --dry-run   # 変更せず確認のみ
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;
const isDryRun = process.argv.includes('--dry-run');

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL が設定されていません');
  process.exit(1);
}

async function cleanup() {
  console.log(`🔌 データベースに接続中...`);
  const connection = await mysql.createConnection(DATABASE_URL);
  console.log(`✓ 接続成功\n`);

  // 対象レコードを検出
  const [affected] = await connection.query(
    `SELECT id, team, day, scheduleDate, imageUrl,
            CASE WHEN imageData IS NULL OR imageData = '' THEN 0 ELSE 1 END as hasData
     FROM schedule_screenshots
     WHERE imageUrl LIKE 'http%'`
  );

  if (affected.length === 0) {
    console.log(`✓ 対象レコードなし。クリーンアップ不要です。`);
    await connection.end();
    return;
  }

  console.log(`📋 S3 URL の残るレコード: ${affected.length} 件\n`);
  console.table(
    affected.slice(0, 20).map(r => ({
      id: r.id,
      team: r.team,
      day: r.day,
      scheduleDate: r.scheduleDate,
      hasImageData: r.hasData ? 'あり' : '（空）',
      imageUrl: r.imageUrl.slice(0, 50) + '...',
    }))
  );
  if (affected.length > 20) console.log(`...ほか ${affected.length - 20} 件`);

  // imageData を持つもの: URL だけクリア（画像は /api/screenshot/:id 経由で見える）
  // imageData を持たないもの: imageUrl を __legacy__ にして「画像なし」表示に
  const withData = affected.filter(r => r.hasData);
  const withoutData = affected.filter(r => !r.hasData);

  console.log(`実行プラン:`);
  console.log(`  - imageData あり ${withData.length} 件 → imageUrl を /api/screenshot/:id に置換`);
  console.log(`  - imageData なし ${withoutData.length} 件 → imageUrl を空文字列に置換（フロントが自動で「画像なし」UI表示）`);

  if (isDryRun) {
    console.log(`\n--dry-run 指定のため、実際の更新は行いません。`);
    await connection.end();
    return;
  }

  let totalUpdated = 0;
  for (const r of withData) {
    await connection.query(
      `UPDATE schedule_screenshots SET imageUrl = ? WHERE id = ?`,
      [`/api/screenshot/${r.id}`, r.id]
    );
    totalUpdated++;
  }

  if (withoutData.length > 0) {
    const ids = withoutData.map(r => r.id);
    await connection.query(
      `UPDATE schedule_screenshots SET imageUrl = '' WHERE id IN (${ids.map(() => '?').join(',')})`,
      ids
    );
    totalUpdated += withoutData.length;
  }

  console.log(`\n✓ ${totalUpdated} 件を更新しました`);
  console.log(`\n💡 スタッフが新しいスクリーンショットをアップロードすれば、自動的に base64 データが入り、正常に表示されます。`);

  await connection.end();
}

cleanup().catch(err => {
  console.error('❌ クリーンアップ失敗:', err);
  process.exit(1);
});
