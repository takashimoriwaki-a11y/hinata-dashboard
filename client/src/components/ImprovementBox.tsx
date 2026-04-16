import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { ChevronDown, ChevronUp, Lightbulb, Send, MessageSquare, User } from "lucide-react";

const CATEGORIES = ["業務効率化", "コミュニケーション", "環境・設備", "ケアの質向上", "その他"] as const;
type Category = typeof CATEGORIES[number];

const CATEGORY_COLORS: Record<Category, string> = {
  "業務効率化": "bg-blue-100 text-blue-700 border-blue-200",
  "コミュニケーション": "bg-green-100 text-green-700 border-green-200",
  "環境・設備": "bg-orange-100 text-orange-700 border-orange-200",
  "ケアの質向上": "bg-purple-100 text-purple-700 border-purple-200",
  "その他": "bg-gray-100 text-gray-600 border-gray-200",
};

const NIGHT_CATEGORY_COLORS: Record<Category, string> = {
  "業務効率化": "bg-blue-900/40 text-blue-300 border-blue-700",
  "コミュニケーション": "bg-green-900/40 text-green-300 border-green-700",
  "環境・設備": "bg-orange-900/40 text-orange-300 border-orange-700",
  "ケアの質向上": "bg-purple-900/40 text-purple-300 border-purple-700",
  "その他": "bg-gray-700/40 text-gray-300 border-gray-600",
};

interface ImprovementBoxProps {
  isNightMode: boolean;
}

export function ImprovementBox({ isNightMode }: ImprovementBoxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState<Category>("その他");
  const [content, setContent] = useState("");
  const [showList, setShowList] = useState(false);

  const { user } = useAuth();

  const submitMutation = trpc.improvement.submit.useMutation({
    onSuccess: () => {
      toast.success("提案を送信しました", { description: "ご意見ありがとうございます。" });
      setContent("");
      setCategory("その他");
      setShowForm(false);
      refetch();
    },
    onError: (err) => {
      toast.error(`送信エラー: ${err.message}`);
    },
  });

  const { data: suggestions, refetch } = trpc.improvement.list.useQuery(undefined, {
    enabled: showList,
  });

  const handleSubmit = () => {
    if (!content.trim()) {
      toast.error("内容を入力してください");
      return;
    }
    submitMutation.mutate({ category, content: content.trim() });
  };

  const bg = isNightMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200";
  const headerBg = isNightMode ? "bg-amber-900/30" : "bg-amber-50";
  const headerText = isNightMode ? "text-amber-300" : "text-amber-700";
  const subText = isNightMode ? "text-gray-300" : "text-gray-600";
  const inputBg = isNightMode ? "bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400" : "bg-white border-gray-300 text-gray-900 placeholder-gray-400";
  const catColors = isNightMode ? NIGHT_CATEGORY_COLORS : CATEGORY_COLORS;

  return (
    <div className={`rounded-2xl border shadow-sm overflow-hidden ${bg}`}>
      {/* ヘッダー */}
      <button
        className={`w-full flex items-center justify-between px-4 py-3 ${headerBg} active:opacity-80 transition-opacity`}
        onClick={() => setIsOpen(v => !v)}
      >
        <div className="flex items-center gap-2">
          <Lightbulb className={`w-5 h-5 ${headerText}`} />
          <span className={`font-bold text-base ${headerText}`}>業務改善意見箱</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs ${subText}`}>全職員が投稿できます</span>
          {isOpen
            ? <ChevronUp className={`w-4 h-4 ${headerText}`} />
            : <ChevronDown className={`w-4 h-4 ${headerText}`} />}
        </div>
      </button>

      {/* 展開コンテンツ */}
      {isOpen && (
        <div className="p-4 space-y-4">
          {/* 新規投稿フォーム */}
          {!showForm ? (
            <button
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed transition-all active:scale-95 ${
                isNightMode
                  ? "border-amber-600 text-amber-400 hover:bg-amber-900/20"
                  : "border-amber-400 text-amber-600 hover:bg-amber-50"
              }`}
              onClick={() => setShowForm(true)}
            >
              <Send className="w-4 h-4" />
              <span className="font-medium text-sm">新しい提案を投稿する</span>
            </button>
          ) : (
            <div className={`rounded-xl border p-4 space-y-3 ${isNightMode ? "border-gray-600 bg-gray-750" : "border-gray-200 bg-gray-50"}`}>
              {/* 投稿者表示 */}
              <div className={`flex items-center gap-2 text-sm ${subText}`}>
                <User className="w-4 h-4" />
                <span>投稿者：<span className={`font-semibold ${isNightMode ? "text-amber-300" : "text-amber-700"}`}>{user?.name ?? "不明"}</span></span>
              </div>

              {/* カテゴリ選択 */}
              <div>
                <p className={`text-xs font-semibold mb-2 ${subText}`}>カテゴリ</p>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setCategory(cat)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-all active:scale-95 ${
                        category === cat
                          ? catColors[cat] + " ring-2 ring-offset-1 ring-current"
                          : isNightMode
                            ? "bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600"
                            : "bg-white text-gray-500 border-gray-300 hover:bg-gray-100"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* 内容入力 */}
              <div>
                <p className={`text-xs font-semibold mb-1 ${subText}`}>提案内容</p>
                <textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="業務改善のアイデアや気になっていることを自由に書いてください..."
                  rows={4}
                  maxLength={2000}
                  className={`w-full rounded-lg border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400 ${inputBg}`}
                />
                <p className={`text-right text-xs mt-1 ${subText}`}>{content.length}/2000</p>
              </div>

              {/* ボタン */}
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowForm(false); setContent(""); }}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all active:scale-95 ${
                    isNightMode
                      ? "border-gray-600 text-gray-300 hover:bg-gray-700"
                      : "border-gray-300 text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  キャンセル
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitMutation.isPending || !content.trim()}
                  className="flex-1 py-2 rounded-lg text-sm font-bold bg-amber-500 text-white hover:bg-amber-600 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                >
                  {submitMutation.isPending ? (
                    <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      送信
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* 過去の提案一覧 */}
          <button
            className={`w-full flex items-center justify-between text-sm py-2 px-3 rounded-lg transition-all active:scale-95 ${
              isNightMode
                ? "text-gray-300 hover:bg-gray-700"
                : "text-gray-600 hover:bg-gray-100"
            }`}
            onClick={() => { setShowList(v => !v); if (!showList) refetch(); }}
          >
            <div className="flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4" />
              <span>過去の提案を見る</span>
            </div>
            {showList ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showList && (
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {!suggestions ? (
                <p className={`text-center text-sm py-4 ${subText}`}>読み込み中...</p>
              ) : suggestions.length === 0 ? (
                <p className={`text-center text-sm py-4 ${subText}`}>まだ提案はありません</p>
              ) : (
                suggestions.map(s => (
                  <div
                    key={s.id}
                    className={`rounded-xl p-3 border ${isNightMode ? "bg-gray-700/50 border-gray-600" : "bg-gray-50 border-gray-200"}`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${catColors[s.category as Category] ?? catColors["その他"]}`}>
                        {s.category}
                      </span>
                      <span className={`text-xs ${subText}`}>
                        {s.createdByName}・{new Date(s.createdAt).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}
                      </span>
                    </div>
                    <p className={`text-sm leading-relaxed ${isNightMode ? "text-gray-200" : "text-gray-800"}`}>{s.content}</p>
                    {s.adminReply && (
                      <div className={`mt-2 pt-2 border-t text-xs ${isNightMode ? "border-gray-600 text-gray-300" : "border-gray-200 text-gray-600"}`}>
                        <span className="font-semibold">管理者より：</span> {s.adminReply}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
