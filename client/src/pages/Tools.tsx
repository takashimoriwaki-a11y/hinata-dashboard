/**
 * Tools - チームツール・全チーム共通ツールページ
 */
import { TeamToolsCard, ToolsCard } from "./Dashboard";

export default function Tools() {
  return (
    <div className="space-y-3 md:space-y-4 p-3 md:p-4">
      <TeamToolsCard />
      <ToolsCard />
    </div>
  );
}
