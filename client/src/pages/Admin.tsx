/**
 * Admin - 管理画面
 * スプレッドシートURLの月次管理（翌月分の事前登録・当月分の確認・削除）
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, ExternalLink, ChevronDown, ChevronUp, Settings } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// リンクの定義（linkKey・ラベル・色は固定）
const LINK_DEFINITIONS = [
  { key: "fee_seishin_koriyama", label: "利用者料金一覧（精神郡山）", color: "text-emerald-600" },
  { key: "fee_shintai",          label: "利用者料金一覧（身体）",     color: "text-blue-600"    },
  { key: "fee_tenri",            label: "利用者料金一覧（天理）",     color: "text-purple-600"  },
  { key: "daily_report",         label: "業務日報",                   color: "text-orange-600"  },
  { key: "attendance",           label: "ひなた勤怠",                 color: "text-rose-600"    },
  { key: "checkout_checklist",   label: "退勤時チェックリスト",       color: "text-amber-600"   },
] as const;

type LinkKey = typeof LINK_DEFINITIONS[number]["key"];

// YYYY-MM形式の年月文字列を生成するユーティリティ
function toYearMonth(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

// 年月文字列を日本語表示に変換
function formatYearMonth(ym: string) {
  const [y, m] = ym.split("-");
  return `${y}年${Number(m)}月`;
}

export default function Admin() {
  const utils = trpc.useUtils();

  // 全リンクを取得
  const { data: allLinks, isLoading } = trpc.spreadsheetLinks.getAll.useQuery();

  // upsert mutation
  const upsertLink = trpc.spreadsheetLinks.upsert.useMutation({
    onSuccess: () => {
      utils.spreadsheetLinks.getAll.invalidate();
      utils.spreadsheetLinks.getCurrent.invalidate();
      toast.success("リンクを保存しました");
      setEditingKey(null);
      setEditUrl("");
    },
    onError: (e) => toast.error(e.message),
  });

  // delete mutation
  const deleteLink = trpc.spreadsheetLinks.delete.useMutation({
    onSuccess: () => {
      utils.spreadsheetLinks.getAll.invalidate();
      utils.spreadsheetLinks.getCurrent.invalidate();
      toast.success("リンクを削除しました");
    },
    onError: (e) => toast.error(e.message),
  });

  // 編集中のリンクキーとURL
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState("");

  // 登録フォームの年月（デフォルト: 翌月）
  const now = new Date();
  const nextMonthYear = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
  const nextMonthMonth = now.getMonth() === 11 ? 1 : now.getMonth() + 2;
  const [selectedYear, setSelectedYear] = useState(nextMonthYear);
  const [selectedMonth, setSelectedMonth] = useState(nextMonthMonth);
  const selectedYearMonth = toYearMonth(selectedYear, selectedMonth);

  // 現在の年月
  const currentYearMonth = toYearMonth(now.getFullYear(), now.getMonth() + 1);

  // 選択中年月のリンクをlinkKeyでマップ化
  const selectedLinks = useMemo(() => {
    if (!allLinks) return {} as Record<string, { id: number; url: string }>;
    return Object.fromEntries(
      allLinks
        .filter((l) => l.yearMonth === selectedYearMonth)
        .map((l) => [l.linkKey, { id: l.id, url: l.url }])
    );
  }, [allLinks, selectedYearMonth]);

  // 登録済み年月の一覧（管理済み月一覧表示用）
  const registeredMonths = useMemo(() => {
    if (!allLinks) return [];
    const months = Array.from(new Set(allLinks.map((l) => l.yearMonth))).sort().reverse();
    return months;
  }, [allLinks]);

  const handleSave = (linkKey: string, label: string, color: string) => {
    if (!editUrl.trim()) {
      toast.error("URLを入力してください");
      return;
    }
    upsertLink.mutate({
      linkKey,
      label,
      yearMonth: selectedYearMonth,
      url: editUrl.trim(),
      color,
    });
  };

  // 年月選択用の選択肢（現在月〜12ヶ月先）
  const monthOptions = useMemo(() => {
    const opts = [];
    for (let i = 0; i <= 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      opts.push({
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        ym: toYearMonth(d.getFullYear(), d.getMonth() + 1),
        label: formatYearMonth(toYearMonth(d.getFullYear(), d.getMonth() + 1)),
        isCurrent: toYearMonth(d.getFullYear(), d.getMonth() + 1) === currentYearMonth,
      });
    }
    return opts;
  }, []);

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      {/* ページヘッダー */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Settings className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">管理画面</h1>
          <p className="text-sm text-muted-foreground">スプレッドシートURLの月次管理</p>
        </div>
      </div>

      {/* 月選択 */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-base font-semibold">対象月を選択</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {monthOptions.map((opt) => (
              <button
                key={opt.ym}
                onClick={() => {
                  setSelectedYear(opt.year);
                  setSelectedMonth(opt.month);
                  setEditingKey(null);
                  setEditUrl("");
                }}
                className={cn(
                  "px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
                  selectedYearMonth === opt.ym
                    ? "bg-primary text-white border-primary"
                    : "bg-white text-foreground border-border hover:border-primary hover:text-primary"
                )}
              >
                {opt.label}
                {opt.isCurrent && (
                  <span className="ml-1 text-[10px] opacity-70">（今月）</span>
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* リンク一覧・登録フォーム */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2 pt-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">
              {formatYearMonth(selectedYearMonth)} のスプレッドシートURL
            </CardTitle>
            {selectedYearMonth === currentYearMonth && (
              <Badge variant="secondary" className="text-xs bg-emerald-100 text-emerald-700">今月</Badge>
            )}
            {selectedYearMonth > currentYearMonth && (
              <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700">翌月以降</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            URLを登録すると、{formatYearMonth(selectedYearMonth)}になった時点でダッシュボードに自動反映されます。
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">読み込み中...</p>
          ) : (
            LINK_DEFINITIONS.map((def, idx) => {
              const registered = selectedLinks[def.key];
              const isEditing = editingKey === `${def.key}-${selectedYearMonth}`;
              return (
                <div key={def.key}>
                  {idx > 0 && <Separator className="my-2" />}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn("text-sm font-medium", def.color)}>{def.label}</p>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {registered ? (
                          <>
                            <a
                              href={registered.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-muted-foreground hover:text-primary flex items-center gap-0.5"
                              title="開く"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                            <button
                              onClick={() => {
                                if (isEditing) {
                                  setEditingKey(null);
                                  setEditUrl("");
                                } else {
                                  setEditingKey(`${def.key}-${selectedYearMonth}`);
                                  setEditUrl(registered.url);
                                }
                              }}
                              className="text-xs text-muted-foreground hover:text-primary px-1.5 py-0.5 rounded border border-border hover:border-primary transition-colors"
                            >
                              {isEditing ? "閉じる" : "編集"}
                            </button>
                            <button
                              onClick={() => deleteLink.mutate({ id: registered.id })}
                              className="text-muted-foreground hover:text-destructive p-1"
                              title="削除"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => {
                              if (isEditing) {
                                setEditingKey(null);
                                setEditUrl("");
                              } else {
                                setEditingKey(`${def.key}-${selectedYearMonth}`);
                                setEditUrl("");
                              }
                            }}
                            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 px-2 py-0.5 rounded border border-primary/30 hover:border-primary transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                            URL登録
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 登録済みURL表示 */}
                    {registered && !isEditing && (
                      <p className="text-xs text-muted-foreground truncate pl-1 font-mono">
                        {registered.url}
                      </p>
                    )}

                    {/* 編集・新規登録フォーム */}
                    {isEditing && (
                      <div className="flex gap-2 mt-1">
                        <input
                          type="url"
                          placeholder="https://docs.google.com/spreadsheets/d/..."
                          value={editUrl}
                          onChange={(e) => setEditUrl(e.target.value)}
                          className="flex-1 text-xs border border-border rounded px-2 py-1.5 bg-white focus:outline-none focus:border-primary"
                          autoFocus
                        />
                        <Button
                          size="sm"
                          className="h-7 text-xs px-3 flex-shrink-0"
                          onClick={() => handleSave(def.key, def.label, def.color)}
                          disabled={upsertLink.isPending}
                        >
                          保存
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* 登録済み月の概要 */}
      {registeredMonths.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-base font-semibold">登録済み月の一覧</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {registeredMonths.map((ym) => {
                const count = allLinks?.filter((l) => l.yearMonth === ym).length ?? 0;
                const isCurrent = ym === currentYearMonth;
                return (
                  <div
                    key={ym}
                    className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => {
                      const [y, m] = ym.split("-").map(Number);
                      setSelectedYear(y);
                      setSelectedMonth(m);
                      setEditingKey(null);
                      setEditUrl("");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{formatYearMonth(ym)}</span>
                      {isCurrent && (
                        <Badge variant="secondary" className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0">今月</Badge>
                      )}
                      {ym > currentYearMonth && (
                        <Badge variant="secondary" className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0">翌月以降</Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{count} / {LINK_DEFINITIONS.length} 件登録</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
