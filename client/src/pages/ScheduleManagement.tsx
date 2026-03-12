/**
 * スケジュール管理ページ
 * スケジュール管理関連のリンクを表示する
 */
import { ExternalLink, CalendarDays, BarChart2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const scheduleLinks: { label: string; href: string; description: string }[] = [
  {
    label: "ひなた利用者情報",
    href: "https://docs.google.com/spreadsheets/d/1cJ8f3gFWu0Fqrl3TxthGVk0-9TF4Hg5YJZFO-mWIvjI/edit?gid=349418380#gid=349418380",
    description: "訪問スケジュールの管理・確認",
  },
  {
    label: "ひなた_スケジュール変更連絡",
    href: "https://docs.google.com/spreadsheets/d/1ki462aQRaNTj5FrI_1MJ1OyATFGqODz6HCtmuriIDEU/edit?gid=941601927#gid=941601927",
    description: "スケジュール変更連絡管理表",
  },
  {
    label: "ひなた_次回訪問日時",
    href: "https://docs.google.com/spreadsheets/d/1WOZQ5rI0Fu57nWaiGwComPS_DdEwPgNR6zeOmyrqKpo/edit?gid=0#gid=0",
    description: "次回訪問日時管理表",
  },
];

export default function ScheduleManagement() {
  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
          <CalendarDays className="w-5 h-5 text-orange-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">スケジュール管理</h1>
          <p className="text-sm text-muted-foreground">スケジュール管理関連の書類・ツールへのリンク</p>
        </div>
      </div>

      {/* 関連リンク */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">関連リンク</CardTitle>
        </CardHeader>
        <CardContent>
          {scheduleLinks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <CalendarDays className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">リンクはまだ登録されていません</p>
              <p className="text-xs text-muted-foreground">URLを教えていただければ追加します</p>
            </div>
          ) : (
            <div className="space-y-3">
              {scheduleLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent transition-colors group"
                >
                  <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                    <BarChart2 className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">
                      {link.label}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{link.description}</p>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                </a>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
