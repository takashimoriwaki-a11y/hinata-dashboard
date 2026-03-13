import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

const SECTIONS = [
  {
    tag: "経営理念",
    title: "「存在で支え合う」",
    body: "私たちは出会うすべての人々と、お互いの存在がこころの支えになる関係を築きます。",
    accent: "from-orange-400 to-amber-500",
    bg: "bg-orange-50",
    border: "border-orange-200",
    tagColor: "bg-orange-100 text-orange-700",
  },
  {
    tag: "基本方針",
    title: "「自分らしさを大切にする」「笑顔を大切にする」",
    body: "私たちは職場内外に関わらず信頼関係を築き、仲間と支えあいながら理念に向かって取り組みます。また、相手の意見や価値観を受け止め、互いに尊重すること、これらに溢れる組織であるために「自分らしさを大切にする」「笑顔を大切にする」を実践します。そして、質の高い医療・介護等を提供するために、自己研鑽と倫理観を養います。",
    accent: "from-sky-400 to-blue-500",
    bg: "bg-sky-50",
    border: "border-sky-200",
    tagColor: "bg-sky-100 text-sky-700",
  },
];

const PILLARS = [
  {
    label: "コア・パーパス",
    sub: "存在",
    title: "私たちは、地域の方々の安心感と幸福感を促進するために存在します。",
    body: "その実現のために当事者やご家族様、地域の方々と丁寧な信頼関係を築き、それぞれの希望を叶える支援を行います。",
    icon: "🌟",
    accent: "from-amber-400 to-orange-500",
    bg: "bg-amber-50",
    border: "border-amber-200",
  },
  {
    label: "ミッション",
    sub: "使命",
    title: "私たちは、地域でその人らしく生きるための支援を使命として行います。",
    body: "そのために専門的な知識や技術を発揮し、その人らしい生活の実現をサポートします。丁寧であたたかい、心と身体のケアを届けるために。",
    icon: "🤝",
    accent: "from-emerald-400 to-teal-500",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
  },
  {
    label: "ビジョン",
    sub: "未来",
    title: "私たちは、心身の健康と暮らしを重視し、個人が望む生き方が実現できる社会創りをビジョンとします。",
    body: "そのために当事者が安心できる居場所を、ご本人を含めた皆で協働します。それぞれの人の生活や人生に明かりを灯すことのできる社会の実現を目指して。",
    icon: "🌅",
    accent: "from-violet-400 to-purple-500",
    bg: "bg-violet-50",
    border: "border-violet-200",
  },
];

export default function HinatasWay() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 via-white to-orange-50">
      {/* ヘッダー */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-orange-100 px-4 py-3 flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/")}
          className="h-8 w-8 p-0 rounded-full"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-base font-bold text-gray-800 leading-tight">📖 Hinata's Way</h1>
          <p className="text-[10px] text-gray-500 leading-tight">こころの訪問看護ステーションひなた</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">
        {/* タイトルセクション */}
        <div className="text-center py-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 shadow-lg mb-4">
            <span className="text-2xl">🌸</span>
          </div>
          <h2 className="text-2xl font-extrabold text-gray-800 tracking-tight leading-snug">
            3つの行動指針
          </h2>
          <p className="text-sm text-gray-500 mt-1">Hinata's Way</p>
        </div>

        {/* 経営理念・基本方針 */}
        {SECTIONS.map((s) => (
          <div key={s.tag} className={`rounded-2xl border ${s.border} ${s.bg} p-5 shadow-sm`}>
            <span className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full mb-3 ${s.tagColor}`}>
              {s.tag}
            </span>
            <h3 className="text-base font-bold text-gray-800 leading-snug mb-2">{s.title}</h3>
            <p className="text-sm text-gray-600 leading-relaxed">{s.body}</p>
          </div>
        ))}

        {/* 区切り */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-orange-200 to-transparent" />
          <span className="text-xs text-orange-400 font-medium tracking-widest">3つの行動指針</span>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-orange-200 to-transparent" />
        </div>

        {/* 3つの柱 */}
        {PILLARS.map((p, i) => (
          <div key={p.label} className={`rounded-2xl border ${p.border} ${p.bg} overflow-hidden shadow-sm`}>
            {/* カラーバー */}
            <div className={`h-1.5 w-full bg-gradient-to-r ${p.accent}`} />
            <div className="p-5">
              <div className="flex items-start gap-3 mb-3">
                <div className={`flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br ${p.accent} flex items-center justify-center shadow-sm`}>
                  <span className="text-lg">{p.icon}</span>
                </div>
                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{p.label}</span>
                    <span className="text-xs text-gray-500">（{p.sub}）</span>
                  </div>
                  <p className="text-sm font-bold text-gray-800 leading-snug mt-0.5">{p.title}</p>
                </div>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed pl-13">{p.body}</p>
            </div>
          </div>
        ))}

        {/* フッター */}
        <div className="text-center py-6">
          <p className="text-xs text-gray-400 italic leading-relaxed">
            「それぞれの人の生活や人生に明かりを灯すことのできる社会の実現を目指して」
          </p>
          <p className="text-[10px] text-gray-300 mt-2">こころの訪問看護ステーション ひなた</p>
        </div>
      </div>
    </div>
  );
}
