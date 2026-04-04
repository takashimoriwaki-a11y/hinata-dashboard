import { describe, it, expect } from "vitest";

// チーム目標のフィルタリングロジックのテスト
describe("teamGoals filtering logic", () => {
  const mockGoals = [
    { id: 1, team: "身体", title: "身体チーム目標", startDate: null, endDate: null },
    { id: 2, team: "天理", title: "天理チーム目標", startDate: null, endDate: null },
    { id: 3, team: "全チーム", title: "全チーム目標", startDate: null, endDate: null },
    { id: 4, team: "郡山北部", title: "郡山北部目標", startDate: "2026-04-01", endDate: "2026-04-30" },
    { id: 5, team: "郡山南部", title: "郡山南部目標", startDate: "2026-04-01", endDate: "2026-04-30" },
  ];

  // 所属チームでのフィルタリング
  function filterGoalsByTeam(goals: typeof mockGoals, userTeam: string) {
    if (userTeam === "全チーム") return goals;
    return goals.filter(g => g.team === userTeam || g.team === "全チーム");
  }

  // 日付範囲でのフィルタリング
  function filterGoalsByDate(goals: typeof mockGoals, todayStr: string) {
    return goals.filter(g => {
      if (!g.startDate && !g.endDate) return true;
      if (g.startDate && todayStr < g.startDate) return false;
      if (g.endDate && todayStr > g.endDate) return false;
      return true;
    });
  }

  it("身体チームのユーザーには身体チームと全チームの目標が表示される", () => {
    const result = filterGoalsByTeam(mockGoals, "身体");
    expect(result.map(g => g.team)).toEqual(["身体", "全チーム"]);
  });

  it("天理チームのユーザーには天理チームと全チームの目標が表示される", () => {
    const result = filterGoalsByTeam(mockGoals, "天理");
    expect(result.map(g => g.team)).toEqual(["天理", "全チーム"]);
  });

  it("全チームのユーザーにはすべての目標が表示される", () => {
    const result = filterGoalsByTeam(mockGoals, "全チーム");
    expect(result).toHaveLength(5);
  });

  it("郡山北部チームのユーザーには郡山北部と全チームの目標が表示される", () => {
    const result = filterGoalsByTeam(mockGoals, "郡山北部");
    expect(result.map(g => g.team)).toEqual(["全チーム", "郡山北部"]);
  });

  it("期間内の目標は表示される", () => {
    const result = filterGoalsByDate(mockGoals, "2026-04-15");
    expect(result).toHaveLength(5); // 全て表示
  });

  it("期間外（開始前）の目標は表示されない", () => {
    const result = filterGoalsByDate(mockGoals, "2026-03-31");
    // startDate=2026-04-01 の目標は非表示
    const periodGoals = result.filter(g => g.startDate !== null);
    expect(periodGoals).toHaveLength(0);
  });

  it("期間外（終了後）の目標は表示されない", () => {
    const result = filterGoalsByDate(mockGoals, "2026-05-01");
    // endDate=2026-04-30 の目標は非表示
    const periodGoals = result.filter(g => g.endDate !== null);
    expect(periodGoals).toHaveLength(0);
  });

  it("期間なしの目標は常に表示される", () => {
    const result = filterGoalsByDate(mockGoals, "2099-12-31");
    const noDateGoals = result.filter(g => !g.startDate && !g.endDate);
    expect(noDateGoals).toHaveLength(3);
  });
});
