/**
 * DirectReturnRequest - 直帰申請フォームページ
 * スタッフが事業所に戻らず直接帰宅する旨を申請する
 * - 申請日は本日固定
 * - 理由は4択（遠方業務・急用・体調不良・その他）+ 自由記述
 * - 12時過ぎの場合は警告ダイアログ表示
 * - 申請後、管理者（admin/super_admin）に通知
 */
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Home, AlertTriangle, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const REASON_OPTIONS = [
  { value: "遠方業務", label: "遠方業務", desc: "片道40分以上の距離" },
  { value: "急用", label: "急用", desc: "緊急の用事" },
  { value: "体調不良", label: "体調不良", desc: "帰社が困難" },
  { value: "その他", label: "その他", desc: "やむを得ない理由" },
] as const;

type ReasonCategory = (typeof REASON_OPTIONS)[number]["value"];

export default function DirectReturnRequest() {
  const [, setLocation] = useLocation();
  const [reasonCategory, setReasonCategory] = useState<ReasonCategory | "">("");
  const [reasonDetail, setReasonDetail] = useState("");
  const [showTimeWarning, setShowTimeWarning] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // 現在時刻から申請日（本日）と、12時過ぎフラグを計算
  const { todayStr, isAfterNoon, currentTimeStr } = useMemo(() => {
    const now = new Date();
    const jstOffsetMs = 9 * 60 * 60 * 1000;
    const jstNow = new Date(now.getTime() + jstOffsetMs - now.getTimezoneOffset() * 60 * 1000);
    const y = jstNow.getUTCFullYear();
    const m = String(jstNow.getUTCMonth() + 1).padStart(2, "0");
    const d = String(jstNow.getUTCDate()).padStart(2, "0");
    const hh = String(jstNow.getUTCHours()).padStart(2, "0");
    const mm = String(jstNow.getUTCMinutes()).padStart(2, "0");
    return {
      todayStr: `${y}-${m}-${d}`,
      isAfterNoon: jstNow.getUTCHours() >= 12,
      currentTimeStr: `${hh}:${mm}`,
    };
  }, []);

  // 申請ミューテーション
  const createMutation = trpc.directReturn.create.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      toast.success("直帰申請を送信しました");
      // 3秒後にホームに戻る
      setTimeout(() => setLocation("/"), 3000);
    },
    onError: (err) => {
      toast.error(`申請エラー: ${err.message}`);
    },
  });

  const handleSubmit = () => {
    if (!reasonCategory) {
      toast.error("理由を選択してください");
      return;
    }
    // 12時過ぎなら警告
    if (isAfterNoon) {
      setShowTimeWarning(true);
      return;
    }
    submit();
  };

  const submit = () => {
    createMutation.mutate({
      reasonCategory: reasonCategory as ReasonCategory,
      reasonDetail: reasonDetail.trim() || undefined,
    });
  };

  const confirmAfterNoonSubmit = () => {
    setShowTimeWarning(false);
    submit();
  };

  // 送信後の表示
  if (submitted) {
    return (
      <div className="max-w-xl mx-auto px-4 py-6">
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3">
            <CheckCircle2 className="w-16 h-16 text-green-500" />
            <h2 className="text-lg font-bold text-foreground">申請を送信しました</h2>
            <p className="text-sm text-muted-foreground text-center">
              管理者に通知されました。<br />
              承認結果はアプリ内通知でお知らせします。
            </p>
            <Button variant="outline" onClick={() => setLocation("/")} className="mt-4">
              ホームに戻る
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-4">
      {/* ページタイトル */}
      <div className="flex items-center gap-2 mb-2">
        <Home className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-bold text-foreground">直帰申請</h1>
      </div>

      {/* 注意事項 */}
      <Card className="bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700">
        <CardContent className="py-3 space-y-1 text-xs text-amber-900 dark:text-amber-200">
          <p className="font-semibold">📋 申請のルール</p>
          <p>・申請期限：<strong>当日の午前中</strong>に必ず完了すること</p>
          <p>・12:00を過ぎる場合は、事前に電話等で<strong>主任へ連絡</strong>を入れてください</p>
          <p className="pt-1 font-semibold">✅ 判断基準（以下のいずれかに該当する場合）</p>
          <p>・遠方での業務（片道40分以上の距離）</p>
          <p>・急用、体調不良など、帰社が困難な「やむを得ない理由」</p>
        </CardContent>
      </Card>

      {/* 申請フォーム */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">申請内容</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 申請情報（表示のみ） */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">申請日</p>
              <p className="font-medium text-foreground">{todayStr}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">申請時刻</p>
              <p className={cn(
                "font-medium",
                isAfterNoon ? "text-red-600 dark:text-red-400" : "text-foreground"
              )}>
                {currentTimeStr}
                {isAfterNoon && <span className="ml-1 text-xs">（12時過ぎ）</span>}
              </p>
            </div>
          </div>

          {/* 理由カテゴリ */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              理由 <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-1 gap-2">
              {REASON_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                    reasonCategory === option.value
                      ? "bg-primary/5 border-primary"
                      : "bg-background border-border hover:bg-muted/50"
                  )}
                >
                  <input
                    type="radio"
                    name="reasonCategory"
                    value={option.value}
                    checked={reasonCategory === option.value}
                    onChange={() => setReasonCategory(option.value)}
                    className="mt-0.5 w-4 h-4 accent-primary flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{option.label}</p>
                    <p className="text-xs text-muted-foreground">{option.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* 理由詳細（自由記述） */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              詳細（任意）
            </label>
            <Textarea
              value={reasonDetail}
              onChange={(e) => setReasonDetail(e.target.value)}
              placeholder="具体的な状況や最終訪問先など"
              rows={3}
              className="text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* 送信ボタン */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => setLocation("/")}
          className="flex-1"
          disabled={createMutation.isPending}
        >
          キャンセル
        </Button>
        <Button
          onClick={handleSubmit}
          className="flex-1 bg-[#c0392b] hover:bg-[#a93226] text-white"
          disabled={!reasonCategory || createMutation.isPending}
        >
          {createMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-1" />
              送信中...
            </>
          ) : (
            "申請する"
          )}
        </Button>
      </div>

      {/* 12時過ぎ警告ダイアログ */}
      {showTimeWarning && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowTimeWarning(false)}>
          <Card className="max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <CardContent className="py-5 space-y-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0" />
                <h3 className="text-base font-bold text-foreground">12時を過ぎています</h3>
              </div>
              <div className="text-sm text-foreground space-y-2">
                <p>申請期限（当日の午前中）を過ぎています。</p>
                <p className="font-medium text-amber-700 dark:text-amber-400">
                  主任への電話連絡は完了していますか？
                </p>
                <p className="text-xs text-muted-foreground">
                  まだの場合は、先に電話連絡をしてからこのまま申請を進めてください。
                </p>
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setShowTimeWarning(false)}
                  className="flex-1"
                >
                  戻る
                </Button>
                <Button
                  onClick={confirmAfterNoonSubmit}
                  className="flex-1 bg-[#c0392b] hover:bg-[#a93226] text-white"
                >
                  電話済み・申請する
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
