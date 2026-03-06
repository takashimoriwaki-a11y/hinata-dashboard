/**
 * ひなた 一括インポートテンプレート生成スクリプト
 * 実行: node scripts/generate-import-template.mjs
 */
import * as XLSX from 'xlsx';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(__dirname, '../../ひなた_一括インポート.xlsx');

// ===== 利用者シート =====
const patientHeaders = ['氏名', 'ふりがな', 'チーム', '有効フラグ'];
const patientExamples = [
  ['山田 花子', 'やまだ はなこ', '天理', '1'],
  ['鈴木 一郎', 'すずき いちろう', '郡山北部', '1'],
  ['田中 美咏', 'たなか みえ', '身体', '0'],
];

// ===== スタッフシート =====
const staffHeaders = ['氏名', 'チーム', '権限'];
const staffExamples = [
  ['森脇 崇', '全チーム', 'admin'],
  ['佐藤 看護師', '天理', 'user'],
  ['中村 作業療法士', '事務員', 'user'],
];

// ===== 使い方ガイドシート =====
const guideData = [
  ['ひなた 一括インポートテンプレート 使い方ガイド'],
  [''],
  ['【利用者シート】'],
  ['列名', '説明', '必須', '備考'],
  ['氏名', '利用者の氏名（姓 名 形式）', '○', '重複チェック: 氏名+チームが一致する場合は更新'],
  ['ふりがな', '読み仮名', '×', '省略可'],
  ['チーム', '所属チーム', '○', '身体 / 天理 / 郡山北部 / 郡山南部 のいずれか'],
  ['有効フラグ', '1=有効, 0=無効（退所等）', '×', '省略時は1（有効）として登録'],
  [''],
  ['【スタッフシート】'],
  ['列名', '説明', '必須', '備考'],
  ['氏名', 'スタッフの氏名', '○', '既存アカウントの氏名と一致する場合のみ更新'],
  ['チーム', '所属チーム', '○', '身体 / 天理 / 郡山北部 / 郡山南部 / 事務員 / 全チーム のいずれか'],
  ['権限', 'user または admin', '×', '省略時は user として処理'],
  [''],
  ['【注意事項】'],
  ['・グレー色の行（記入例）はインポート時に自動スキップされます'],
  ['・スタッフは既存アカウントのみ更新可能です（新規作成は管理画面から行ってください）'],
  ['・利用者は氏名+チームが一致する場合は更新、一致しない場合は新規登録されます'],
];

function createWorkbook() {
  const wb = XLSX.utils.book_new();

  // ===== 利用者シート =====
  const patientSheetData = [
    ['ひなた 利用者一括インポートシート'],
    [''],
    ['【記入方法】'],
    ['・7行目がヘッダー行、8行目以降にデータを入力してください'],
    ['・グレー行は記入例です（インポート時に自動スキップ）'],
    ['・チーム列は: 身体 / 天理 / 郡山北部 / 郡山南部 のいずれかを入力'],
    patientHeaders,
    ...patientExamples,
  ];
  const patientSheet = XLSX.utils.aoa_to_sheet(patientSheetData);
  
  // 列幅設定
  patientSheet['!cols'] = [
    { wch: 20 }, // 氏名
    { wch: 20 }, // ふりがな
    { wch: 12 }, // チーム
    { wch: 12 }, // 有効フラグ
  ];
  
  XLSX.utils.book_append_sheet(wb, patientSheet, '利用者');

  // ===== スタッフシート =====
  const staffSheetData = [
    ['ひなた スタッフ一括インポートシート'],
    [''],
    ['【記入方法】'],
    ['・7行目がヘッダー行、8行目以降にデータを入力してください'],
    ['・グレー行は記入例です（インポート時に自動スキップ）'],
    ['・チーム列は: 身体 / 天理 / 郡山北部 / 郡山南部 / 事務員 / 全チーム のいずれかを入力'],
    staffHeaders,
    ...staffExamples,
  ];
  const staffSheet = XLSX.utils.aoa_to_sheet(staffSheetData);
  
  // 列幅設定
  staffSheet['!cols'] = [
    { wch: 20 }, // 氏名
    { wch: 12 }, // チーム
    { wch: 10 }, // 権限
  ];
  
  XLSX.utils.book_append_sheet(wb, staffSheet, 'スタッフ');

  // ===== 使い方ガイドシート =====
  const guideSheet = XLSX.utils.aoa_to_sheet(guideData);
  guideSheet['!cols'] = [
    { wch: 20 },
    { wch: 40 },
    { wch: 8 },
    { wch: 50 },
  ];
  XLSX.utils.book_append_sheet(wb, guideSheet, '使い方ガイド');

  return wb;
}

const wb = createWorkbook();
const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
writeFileSync(OUTPUT_PATH, buffer);
console.log(`✅ テンプレートを生成しました: ${OUTPUT_PATH}`);
console.log('利用者シート: 身体/天理/郡山北部/郡山南部');
console.log('スタッフシート: 身体/天理/郡山北部/郡山南部/事務員/全チーム');
