/**
 * RecordInput - 訪問時チェック項目ページ
 * - 今日の訪問予定（8名分のチーム＋利用者選択）
 * - 8つの訪問チェック項目カード（①訪問タスク＋②次回訪問日時を統合）
 * - タスク管理との連携（利用者のタスクを取得・チェックで自動完了）
 */
import { useState, useRef, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ClipboardEdit, Search, Loader2, ChevronDown, X, Users
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getTeamButtonClass, getTeamButtonStyle } from "@shared/teamColors";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { VisitSlotCard } from "@/components/VisitSlotCard";

const TEAMS = ["身体", "天理", "郡山北部", "郡山南部"] as const;
type Team = typeof TEAMS[number];

const MAX_SLOTS = 8;

type VisitSlotData = {
  team: Team | "";
  patientId: number | null;
  patientName: string;
};

const DEFAULT_SLOT: VisitSlotData = { team: "", patientId: null, patientName: "" };

const SLOTS_STORAGE_KEY = "hinata_visit_slots";

export default function RecordInput() {
  const { user } = useAuth();

  // 8枠分の訪問予定データ
  const [slots, setSlots] = useState<VisitSlotData[]>(() => {
    try {
      const raw = localStorage.getItem(SLOTS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length === MAX_SLOTS) return parsed;
      }
    } catch {}
    return Array.from({ length: MAX_SLOTS }, () => ({ ...DEFAULT_SLOT }));
  });

  // ログインユーザーの所属チームを初期値に自動設定
  useEffect(() => {
    if (!user?.team) return;
    const validTeams: Team[] = ["身体", "天理", "郡山北部", "郡山南部"];
    if (validTeams.includes(user.team as Team)) {
      setSlots(prev => {
        // 全枠が未設定の場合のみ、ユーザーのチームをデフォルト設定
        const allEmpty = prev.every(s => s.team === "");
        if (!allEmpty) return prev;
        return prev.map(s => ({ ...s, team: user.team as Team }));
      });
    }
  }, [user?.team]);

  // スロットデータの変更をlocalStorageに保存
  useEffect(() => {
    try {
      localStorage.setItem(SLOTS_STORAGE_KEY, JSON.stringify(slots));
    } catch {}
  }, [slots]);

  // スロットデータの更新ハンドラ
  const handleSlotChange = (index: number, data: Partial<VisitSlotData>) => {
    setSlots(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...data };
      return next;
    });
  };

  // 全利用者リスト（利用者選択UI用）
  const { data: allPatients = [] } = trpc.patients.list.useQuery({});

  // 各枠の利用者選択UI用state（8枠分）
  const [slotSearchQueries, setSlotSearchQueries] = useState<string[]>(
    () => Array.from({ length: MAX_SLOTS }, (_, i) => slots[i]?.patientName || "")
  );
  const [slotShowLists, setSlotShowLists] = useState<boolean[]>(
    () => Array.from({ length: MAX_SLOTS }, () => false)
  );

  // 各枠の利用者検索クエリ
  const slotPatientQueries = useMemo(() => slotSearchQueries, [slotSearchQueries]);

  // 全枠リセット
  const handleResetAll = () => {
    if (!window.confirm("今日の訪問予定をリセットしますか？")) return;
    const empty = Array.from({ length: MAX_SLOTS }, () => ({ ...DEFAULT_SLOT }));
    setSlots(empty);
    setSlotSearchQueries(Array.from({ length: MAX_SLOTS }, () => ""));
    setSlotShowLists(Array.from({ length: MAX_SLOTS }, () => false));
    localStorage.removeItem(SLOTS_STORAGE_KEY);
    toast.success("訪問予定をリセットしました");
  };

  const setSlotSearch = (index: number, query: string) => {
    setSlotSearchQueries(prev => {
      const next = [...prev];
      next[index] = query;
      return next;
    });
  };

  const setSlotShowList = (index: number, show: boolean) => {
    setSlotShowLists(prev => {
      const next = [...prev];
      next[index] = show;
      return next;
    });
  };

  const filledSlots = slots.filter(s => s.patientName).length;

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4 pb-20">
      <div className="flex items-center gap-2 mb-2">
        <ClipboardEdit className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-bold">訪問時チェック項目</h1>
      </div>

      {/* ===== 今日の訪問予定セクション ===== */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              今日の訪問予定
              {filledSlots > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {filledSlots}名
                </Badge>
              )}
            </CardTitle>
            <button
              type="button"
              onClick={handleResetAll}
              className="flex items-center gap-1 px-2 py-1 rounded-lg border border-border text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
              全リセット
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">訪問する順番に利用者を選択してください（最大8名）</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {slots.map((slot, index) => (
            <SlotSelector
              key={index}
              index={index}
              slot={slot}
              allPatients={allPatients}
              searchQuery={slotPatientQueries[index]}
              showList={slotShowLists[index]}
              onSearchChange={(q) => setSlotSearch(index, q)}
              onShowListChange={(show) => setSlotShowList(index, show)}
              onSlotChange={(data) => handleSlotChange(index, data)}
            />
          ))}
        </CardContent>
      </Card>

      {/* ===== 8つの訪問チェック項目カード ===== */}
      {slots.map((slot, index) => (
        <VisitSlotCard
          key={index}
          slotIndex={index}
          slotData={slot}
          onSlotChange={handleSlotChange}
        />
      ))}
    </div>
  );
}

// ===== スロット選択コンポーネント（今日の訪問予定の各行） =====
type SlotSelectorProps = {
  index: number;
  slot: VisitSlotData;
  allPatients: Array<{ id: number; name: string; team: string | null; nameKana?: string | null }>;
  searchQuery: string;
  showList: boolean;
  onSearchChange: (q: string) => void;
  onShowListChange: (show: boolean) => void;
  onSlotChange: (data: Partial<VisitSlotData>) => void;
};

function SlotSelector({
  index, slot, allPatients, searchQuery, showList,
  onSearchChange, onShowListChange, onSlotChange
}: SlotSelectorProps) {
  const slotNumber = index + 1;

  // チームでフィルタリングした利用者リスト
  const filteredPatients = useMemo(() => {
    const teamFiltered = slot.team
      ? allPatients.filter(p => p.team === slot.team)
      : allPatients;
    if (!searchQuery.trim()) return teamFiltered;
    const q = searchQuery.toLowerCase();
    return teamFiltered.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.nameKana && p.nameKana.toLowerCase().includes(q))
    );
  }, [allPatients, slot.team, searchQuery]);

  const isSelected = !!slot.patientName;

  return (
    <div className={cn(
      "rounded-lg border p-2.5 transition-colors",
      isSelected ? "border-primary/40 bg-primary/5" : "border-border bg-background"
    )}>
      <div className="flex items-center gap-2">
        {/* 番号 */}
        <span className={cn(
          "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
          isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        )}>
          {slotNumber}
        </span>

        {isSelected ? (
          // 選択済み表示
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {slot.team && (
              <span
                className={cn("text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0", getTeamButtonClass(slot.team as Team, true))}
                style={getTeamButtonStyle(slot.team as Team, true)}
              >
                {slot.team}
              </span>
            )}
            <span className="text-sm font-medium text-foreground truncate flex-1">
              {slot.patientName}
            </span>
            <button
              type="button"
              onClick={() => {
                onSlotChange({ team: "", patientId: null, patientName: "" });
                onSearchChange("");
                onShowListChange(false);
              }}
              className="flex-shrink-0 text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
              title="クリア"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          // 未選択：チーム選択 + 利用者検索
          <div className="flex-1 space-y-2">
            {/* チーム選択 */}
            <div className="flex gap-1">
              {(["身体", "天理", "郡山北部", "郡山南部"] as Team[]).map((teamId) => (
                <button
                  key={teamId}
                  type="button"
                  onClick={() => {
                    onSlotChange({ team: teamId, patientId: null, patientName: "" });
                    onSearchChange("");
                    onShowListChange(true);
                  }}
                  className={cn(
                    "flex-1 text-xs py-1 rounded-md font-medium transition-all",
                    getTeamButtonClass(teamId, slot.team === teamId)
                  )}
                  style={getTeamButtonStyle(teamId, slot.team === teamId)}
                >
                  {teamId}
                </button>
              ))}
            </div>

            {/* 利用者検索 */}
            <div className="relative">
              <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    className="pl-7 text-xs h-8"
                    placeholder="利用者名で検索..."
                    value={searchQuery}
                    onChange={(e) => {
                      onSearchChange(e.target.value);
                      onShowListChange(true);
                    }}
                    onFocus={() => onShowListChange(true)}
                  />
                </div>
                <button
                  type="button"
                  className="flex-shrink-0 h-8 w-8 flex items-center justify-center border rounded-md hover:bg-muted transition-colors"
                  onClick={() => onShowListChange(!showList)}
                >
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>

              {showList && (
                <div className="absolute z-50 top-full mt-1 left-0 right-0 border rounded-md bg-background shadow-md max-h-48 overflow-y-auto">
                  {filteredPatients.length === 0 ? (
                    <div className="p-2 text-xs text-muted-foreground text-center">
                      {searchQuery ? "該当する利用者が見つかりません" : slot.team ? "利用者が登録されていません" : "チームを選択してください"}
                    </div>
                  ) : (
                    filteredPatients.map((p) => (
                      <button
                        key={p.id}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-muted flex items-center justify-between border-b last:border-b-0"
                        onClick={() => {
                          onSlotChange({
                            team: (p.team as Team) || slot.team,
                            patientId: p.id,
                            patientName: p.name,
                          });
                          onSearchChange(p.name);
                          onShowListChange(false);
                        }}
                      >
                        <span>{p.name}</span>
                        {p.team && (
                          <span className="text-xs text-muted-foreground">{p.team}</span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
