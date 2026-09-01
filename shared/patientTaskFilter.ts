/** 利用者名マッチング用に正規化（敬称除去・空白除去） */
export function normalizePatientNameForMatch(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/(さん|様|くん|ちゃん)$/g, "");
}

/** タスクの利用者名が今日の訪問予定に含まれるか */
export function isPatientScheduledForVisit(
  taskPatientName: string,
  scheduledPatientNames: readonly string[],
): boolean {
  const normalized = normalizePatientNameForMatch(taskPatientName);
  if (!normalized) return false;
  return scheduledPatientNames.some(
    (name) => normalizePatientNameForMatch(name) === normalized,
  );
}

/** JST基準の今日の日付キー（YYYY-MM-DD） */
export function getTodayJstKey(d = new Date()): string {
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}
