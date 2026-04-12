/**
 * 全チーム共通ツール - スプレッドシートリンク定義
 *
 * このファイルを更新することで、全チーム共通ツールと出勤前確認の
 * 業務日報ボタンのURLが自動的に同期されます。
 * 月が変わって業務日報のURLが変わった場合はここを更新してください。
 */
export const SPREADSHEET_LINKS: { label: string; href: string; color: string }[] = [
  { label: "利用者料金一覧（精神郡山）", href: "https://docs.google.com/spreadsheets/d/1YBK1YOFOhJDnry1b0zQjI5jAU91RnBfLOE-bGve3b5M/edit?usp=sharing", color: "text-emerald-600" },
  { label: "利用者料金一覧（身体）", href: "https://docs.google.com/spreadsheets/d/1W4QLGnhg0wuZqcY96M8kIttrqAO00JxFFaJgUb7YOxA/edit?usp=sharing", color: "text-blue-600" },
  { label: "利用者料金一覧（天理）", href: "https://docs.google.com/spreadsheets/d/15BWxn2MHSLcpcKaMa5q9QcIQiccfjiHhAfMKcCnvsVE/edit?usp=sharing", color: "text-teal-600 dark:text-teal-400" },
  { label: "業務日報", href: "https://docs.google.com/spreadsheets/d/10Leb7UR6ARVlCGbf5pBa5yxsgm5WAV9m-ETyYrzfBCs/edit?usp=sharing", color: "text-orange-600" },
  { label: "ひなた勤怠", href: "https://docs.google.com/spreadsheets/d/1e5xvZHvqSneNZIsO1g8h68-Ue9QnoYXCdCPkt-pIwsQ/edit?usp=sharing", color: "text-rose-600" },
  { label: "退勤時チェックリスト", href: "https://docs.google.com/spreadsheets/d/1g_wTtoQCxiHQupPlEmZVMWWxgzG0ZGH23j-xj1AzdUE/edit?usp=sharing", color: "text-amber-600" },
];

/** 業務日報のURL（出勤前確認の業務日報ボタンで使用） */
export const DAILY_REPORT_URL =
  SPREADSHEET_LINKS.find((l) => l.label === "業務日報")?.href ?? "";

/** 業務日報のスプレッドシートID（gid取得などに使用） */
export const DAILY_REPORT_SPREADSHEET_ID = (() => {
  const match = DAILY_REPORT_URL.match(/\/spreadsheets\/d\/([^/]+)/);
  return match ? match[1] : "10Leb7UR6ARVlCGbf5pBa5yxsgm5WAV9m-ETyYrzfBCs";
})();
