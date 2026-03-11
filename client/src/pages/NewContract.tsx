/**
 * 新規契約ページ
 * 新規契約関連のリンクを管理する
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, ExternalLink, Link2, BarChart2 } from "lucide-react";

const contractLinks: { label: string; href: string; description: string; icon: "sheet" | "doc" }[] = [
  {
    label: "新規契約管理スプレッドシート",
    href: "https://docs.google.com/spreadsheets/d/19EwxEK1ojaeQhQwIQVDQHfQVIYnSbNv6qt1V4qS_HnQ/edit?pli=1&gid=1447811344#gid=1447811344",
    description: "新規契約の進捗・管理表",
    icon: "sheet",
  },
];

export default function NewContract() {
  return (
    <div className="max-w-2xl mx-auto py-6 px-4 space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
          <FileText className="w-5 h-5 text-blue-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">新規契約</h1>
          <p className="text-sm text-muted-foreground">新規契約関連の書類・フォームへのリンク</p>
        </div>
      </div>

      {/* リンクカード */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">関連リンク</CardTitle>
        </CardHeader>
        <CardContent>
          {contractLinks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Link2 className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">リンクはまだ登録されていません</p>
              <p className="text-xs text-muted-foreground">URLを教えていただければ追加します</p>
            </div>
          ) : (
            <div className="space-y-3">
              {contractLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent transition-colors group"
                >
                  <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                    {link.icon === "sheet" ? (
                      <BarChart2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <FileText className="w-4 h-4 text-blue-500" />
                    )}
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
