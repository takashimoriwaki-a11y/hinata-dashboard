/**
 * PatientList - 利用者一覧ページ
 */
import { useState, useEffect } from "react";
import { useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Search } from "lucide-react";

const patients = [
  { id: "U001", name: "岡田 徳子", team: "身体チーム", status: "active", visits: 8 },
  { id: "U002", name: "湯浅 全人", team: "天理チーム", status: "active", visits: 6 },
  { id: "U003", name: "田中 花子", team: "郡山北部チーム", status: "active", visits: 4 },
  { id: "U004", name: "山田 太郎", team: "郡山南部チーム", status: "active", visits: 10 },
  { id: "U005", name: "鈴木 一郎", team: "身体チーム", status: "active", visits: 7 },
  { id: "U006", name: "佐藤 幸子", team: "天理チーム", status: "inactive", visits: 3 },
];

const teamColors: Record<string, string> = {
  "身体チーム": "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200",
  "天理チーム": "bg-purple-100 text-purple-900 dark:bg-purple-900/40 dark:text-purple-200",
  "郡山北部チーム": "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
  "郡山南部チーム": "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
};

export default function PatientList() {
  const searchString = useSearch();
  const [search, setSearch] = useState(() => {
    const params = new URLSearchParams(searchString);
    return params.get("search") ?? "";
  });

  // URLの?searchパラメータが変わったら検索欄を更新
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const q = params.get("search") ?? "";
    setSearch(q);
  }, [searchString]);
  const filtered = patients.filter((p) =>
    p.name.includes(search) || p.team.includes(search)
  );

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Users className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-bold">利用者一覧</h1>
        <Badge variant="secondary" className="ml-auto">{patients.length}名</Badge>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="名前・チームで検索..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((p) => (
          <Card key={p.id} className="shadow-sm hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-sm">{p.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{p.id}</p>
                </div>
                <Badge className={`text-xs ${teamColors[p.team] || "bg-muted text-muted-foreground"} border-0`}>
                  {p.team}
                </Badge>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">月{p.visits}回訪問</span>
                <Badge variant={p.status === "active" ? "default" : "secondary"} className="text-xs">
                  {p.status === "active" ? "利用中" : "休止中"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
