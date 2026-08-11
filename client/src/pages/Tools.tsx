/**
 * Tools - チームツール・全チーム共通ツール・委員会ツールページ
 */
import { TeamToolsCard, ToolsCard, CommitteeToolsCard } from "./Dashboard";

export default function Tools() {
  return (
    <div className="space-y-3 md:space-y-4 p-3 md:p-4">
      <TeamToolsCard />
      <ToolsCard />
      <CommitteeToolsCard />
    </div>
  );
}
