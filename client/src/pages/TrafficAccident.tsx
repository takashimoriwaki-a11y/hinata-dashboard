/**
 * 交通事故ページ
 * 交通事故報告書スプレッドシートと速報報告書フォームへのリンクを提供する
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Car, FileSpreadsheet, FileText, ExternalLink } from "lucide-react";

const trafficLinks = [
  {
    label: "交通事故の報告書スプレッドシート",
    href: "https://docs.google.com/spreadsheets/d/1GOlSgCgBo9XEClmHlSeY7qtFsarmapLRfXf30ND4T9c/edit",
    icon: FileSpreadsheet,
    color: "#0f9d58",
    description: "事故発生時の報告書を記録するスプレッドシート",
  },
  {
    label: "交通事故の速報報告書フォーム",
    href: "https://forms.gle/GMsLNJWsJYkL4yp76",
    icon: FileText,
    color: "#db4437",
    description: "事故発生直後に提出する速報フォーム",
  },
];

export default function TrafficAccident() {
  return (
    <div className="max-w-2xl mx-auto py-6 px-4 space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
          <Car className="w-5 h-5 text-red-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">交通事故</h1>
          <p className="text-sm text-muted-foreground">交通事故関連の書類・フォームへのリンク</p>
        </div>
      </div>

      {/* リンクカード */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">関連リンク</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {trafficLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent transition-colors group"
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: link.color + "20" }}
              >
                <link.icon className="w-4 h-4" style={{ color: link.color }} />
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
        </CardContent>
      </Card>
    </div>
  );
}
