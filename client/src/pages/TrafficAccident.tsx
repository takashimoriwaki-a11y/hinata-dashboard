/**
 * 事故ページ
 * 交通事故・医療事故・ヒヤリハット関連の書類・フォームへのリンクを提供する
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldAlert, FileSpreadsheet, FileText, ExternalLink, AlertTriangle, Car, ClipboardList } from "lucide-react";

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

const medicalLinks = [
  {
    label: "医療事故・虐待発生時の連絡経路",
    href: "https://docs.google.com/spreadsheets/d/129xP-qECwx8RcsPrChItEqMWQjJd6pjFZFdt3qTKZ_E/edit?gid=1210966890#gid=1210966890",
    icon: FileSpreadsheet,
    color: "#f59e0b",
    description: "医療事故・虐待発生時の連絡先・手順を確認するスプレッドシート",
  },
];

const hiyariLinks = [
  {
    label: "ヒヤリハットアクシデントレポートフォーム",
    href: "https://forms.gle/Y2Q2YEYbMYcabwz48",
    icon: ClipboardList,
    color: "#8b5cf6",
    description: "ヒヤリハット・アクシデント発生時の報告フォーム",
  },
];

export default function TrafficAccident() {
  return (
    <div className="max-w-2xl mx-auto py-6 px-4 space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
          <ShieldAlert className="w-5 h-5 text-red-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">事故</h1>
          <p className="text-sm text-muted-foreground">事故・緊急時関連の書類・フォームへのリンク</p>
        </div>
      </div>

      {/* 交通事故リンクカード */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Car className="w-4 h-4 text-red-500" />
            交通事故
          </CardTitle>
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

      {/* 医療事故・虐待リンクカード */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            医療事故・虐待
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {medicalLinks.map((link) => (
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

      {/* ヒヤリハット・アクシデントカード */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-purple-500" />
            ヒヤリハット・アクシデント
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {hiyariLinks.map((link) => (
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
