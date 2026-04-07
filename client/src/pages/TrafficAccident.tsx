/**
 * 事故ページ
 * 交通事故・医療事故・ヒヤリハット関連の書類・フォームへのリンクを提供する
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldAlert, FileSpreadsheet, ExternalLink, AlertTriangle, Car, ClipboardList } from "lucide-react";

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

// 交通事故マニュアルコンポーネント（インライン表示）
function TrafficAccidentManual() {
  const [activeTab, setActiveTab] = useState<"time" | "after" | "flow" | "form" | "later">("time");

  const tabs = [
    { key: "time" as const, label: "営業時間内" },
    { key: "after" as const, label: "営業時間外" },
    { key: "flow" as const, label: "事故直後フロー" },
    { key: "form" as const, label: "現場記録用紙" },
    { key: "later" as const, label: "後日対応" },
  ];

  return (
    <div className="traffic-accident-manual">
      {/* タブバー */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
              activeTab === tab.key
                ? "bg-card text-foreground border-border shadow-sm"
                : "bg-muted text-muted-foreground border-border/50 hover:bg-accent"
            }`}
            style={{ minHeight: "32px" }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 営業時間内 */}
      {activeTab === "time" && (
        <div className="space-y-3">
          <StepCard step={1} title="警察へ連絡">
            <AlertBox type="danger" label="最優先">
              事故発生直後、まず110番または最寄りの警察署へ連絡してください。
            </AlertBox>
          </StepCard>

          <StepCard step={2} title="安全運転管理者へ連絡">
            <div className="grid grid-cols-2 gap-2 mt-2">
              <ContactCard badge="①優先" badgeType="info" name="森脇英樹" role="安全運転管理者" tel="070-1544-2910" />
              <ContactCard badge="②代替" badgeType="warning" name="森脇統括" role="安全運転管理者" tel="080-4779-8910" />
            </div>
          </StepCard>

          <StepCard step={3} title="保険屋・車屋の対応（公用車は会社側が対応）">
            <div className="grid grid-cols-2 gap-2 mt-2">
              <ContactCard badge="①保険" badgeType="info" name="船田 修嗣（ふなだしゅうじ）" role="東京海上（保険naracoco）" tel="080-1426-2457" />
              <ContactCard badge="②車屋" badgeType="success" name="坂根 和匡（さかねかずまさ）" role="車屋" tel="090-5909-0111" />
              <div className="col-span-2">
                <ContactCard badge="③緊急（車屋に連絡つかない場合）" badgeType="warning" name="オリックスセフティーサービス24" tel="0120-24-3650" />
              </div>
            </div>
          </StepCard>
        </div>
      )}

      {/* 営業時間外 */}
      {activeTab === "after" && (
        <div className="space-y-3">
          <AlertBox type="warning" label="営業時間外は連絡順序が変わります">
            保険屋・車屋への連絡を管理者連絡より先に行ってください。
          </AlertBox>

          <StepCard step={1} title="警察へ連絡">
            <AlertBox type="danger" label="最優先">
              まず110番または最寄りの警察署へ連絡してください。
            </AlertBox>
          </StepCard>

          <StepCard step={2} title="保険屋・車屋へ連絡（時間外のため先に連絡）">
            <div className="grid grid-cols-2 gap-2 mt-2">
              <ContactCard badge="①保険" badgeType="info" name="船田 修嗣" role="東京海上（保険naracoco）" tel="080-1426-2457" />
              <ContactCard badge="②車屋" badgeType="success" name="坂根 和匡" role="車屋" tel="090-5909-0111" />
              <div className="col-span-2">
                <ContactCard badge="③緊急（車屋に連絡つかない場合）" badgeType="warning" name="オリックスセフティーサービス24" tel="0120-24-3650">
                  <AlertBox type="warning" label="注意">
                    オリックスは車両搬送のみ。自身は公共交通機関またはタクシーで移動すること。
                  </AlertBox>
                </ContactCard>
              </div>
            </div>
          </StepCard>

          <StepCard step={3} title="安全運転管理者へ連絡">
            <div className="grid grid-cols-2 gap-2 mt-2">
              <ContactCard badge="①優先" badgeType="info" name="森脇英樹" tel="070-1544-2910" />
              <ContactCard badge="②代替" badgeType="warning" name="森脇統括" tel="080-4779-8910" />
            </div>
          </StepCard>
        </div>
      )}

      {/* 事故直後フロー */}
      {activeTab === "flow" && (
        <div>
          <svg width="100%" viewBox="0 0 680 580" className="overflow-visible">
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M2 1L8 5L2 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </marker>
            </defs>

            {/* 事故発生 */}
            <g className="c-gray">
              <rect x="240" y="20" width="200" height="42" rx="8" strokeWidth="0.5"/>
              <text className="th" x="340" y="41" textAnchor="middle" dominantBaseline="central">事故発生</text>
            </g>
            <line x1="340" y1="62" x2="340" y2="88" className="arr" markerEnd="url(#arrow)" stroke="var(--color-border-secondary)" strokeWidth="0.5"/>

            {/* 程度の判断 */}
            <polygon points="340,90 430,118 340,146 250,118" fill="none" stroke="var(--color-border-secondary)" strokeWidth="0.5"/>
            <text className="th" x="340" y="114" textAnchor="middle" dominantBaseline="central" style={{fontSize:"13px"}}>程度の判断</text>
            <text className="ts" x="340" y="130" textAnchor="middle" dominantBaseline="central">曖昧なら上司に連絡</text>

            {/* 左：人身事故 */}
            <line x1="250" y1="118" x2="120" y2="118" stroke="#E24B4A" strokeWidth="0.5" markerEnd="url(#arrow)"/>
            <text className="ts" x="185" y="110" textAnchor="middle" style={{fill:"#E24B4A"}}>①人身事故</text>
            <g className="c-red">
              <rect x="40" y="140" width="160" height="42" rx="8" strokeWidth="0.5"/>
              <text className="th" x="120" y="161" textAnchor="middle" dominantBaseline="central">人身事故対応</text>
            </g>

            {/* 中央：器物破損 */}
            <line x1="340" y1="146" x2="340" y2="178" stroke="#BA7517" strokeWidth="0.5" markerEnd="url(#arrow)"/>
            <text className="ts" x="356" y="165" style={{fill:"#BA7517"}}>②器物破損</text>
            <g className="c-amber">
              <rect x="240" y="180" width="200" height="42" rx="8" strokeWidth="0.5"/>
              <text className="th" x="340" y="201" textAnchor="middle" dominantBaseline="central">器物破損対応</text>
            </g>

            {/* 右：その他 */}
            <line x1="430" y1="118" x2="560" y2="118" stroke="#185FA5" strokeWidth="0.5" markerEnd="url(#arrow)"/>
            <text className="ts" x="495" y="110" textAnchor="middle" style={{fill:"#185FA5"}}>③その他</text>
            <g className="c-blue">
              <rect x="480" y="140" width="160" height="42" rx="8" strokeWidth="0.5"/>
              <text className="th" x="560" y="161" textAnchor="middle" dominantBaseline="central">状況確認・上司連絡</text>
            </g>

            {/* 全ルート集約 */}
            <line x1="120" y1="182" x2="120" y2="270" stroke="var(--color-border-secondary)" strokeWidth="0.5" markerEnd="url(#arrow)"/>
            <line x1="340" y1="222" x2="340" y2="270" stroke="var(--color-border-secondary)" strokeWidth="0.5" markerEnd="url(#arrow)"/>
            <line x1="560" y1="182" x2="560" y2="270" stroke="var(--color-border-secondary)" strokeWidth="0.5" markerEnd="url(#arrow)"/>
            <line x1="120" y1="280" x2="338" y2="280" stroke="var(--color-border-secondary)" strokeWidth="0.5"/>
            <line x1="342" y1="280" x2="560" y2="280" stroke="var(--color-border-secondary)" strokeWidth="0.5"/>

            {/* 直後の対応（共通） */}
            <g className="c-teal">
              <rect x="180" y="290" width="320" height="200" rx="10" strokeWidth="0.5"/>
              <text className="th" x="340" y="312" textAnchor="middle" dominantBaseline="central">直後の対応（共通）</text>
            </g>
            <text className="ts" x="204" y="335" dominantBaseline="central">● 事故証明の取得</text>
            <text className="ts" x="204" y="357" dominantBaseline="central">● 上司に連絡</text>
            <text className="ts" x="204" y="379" dominantBaseline="central">● その場での示談・約束の禁止</text>
            <text className="ts" x="204" y="401" dominantBaseline="central">● 保険会社担当者に連絡</text>
            <text className="ts" x="204" y="423" dominantBaseline="central">● 事故現場記録用紙に記載</text>
            <text className="ts" x="204" y="445" dominantBaseline="central">● ドライブレコーダーSDカード取外し</text>
            <text className="ts" x="204" y="467" dominantBaseline="central">● 医療機関で検査・治療</text>

            {/* 注意バッジ */}
            <g className="c-red">
              <rect x="390" y="368" width="96" height="24" rx="6" strokeWidth="0.5"/>
              <text className="ts" x="438" y="380" textAnchor="middle" dominantBaseline="central">示談は厳禁</text>
            </g>

            <line x1="340" y1="490" x2="340" y2="530" stroke="var(--color-border-secondary)" strokeWidth="0.5" markerEnd="url(#arrow)"/>

            {/* 後日対応へ */}
            <g className="c-gray">
              <rect x="220" y="532" width="240" height="40" rx="8" strokeWidth="0.5"/>
              <text className="th" x="340" y="552" textAnchor="middle" dominantBaseline="central">後日対応へ</text>
            </g>
          </svg>
        </div>
      )}

      {/* 現場記録用紙 */}
      {activeTab === "form" && (
        <div className="space-y-4">
          <AlertBox type="info" label="記録のポイント">
            事故直後に、以下の情報を漏れなく収集してください。写真撮影でも可。
          </AlertBox>

          <div>
            <h3 className="text-xs font-medium text-muted-foreground mb-2">基本情報</h3>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <FormField label="場所" value="奈良県　　市・郡" fullWidth />
              <FormField label="発生日時" value="　　年　月　日　午前・午後　時　分頃" fullWidth />
            </div>
          </div>

          <div>
            <h3 className="text-xs font-medium text-muted-foreground mb-2">相手方の情報</h3>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <FormField label="住所" fullWidth />
              <FormField label="氏名" />
              <FormField label="年齢" />
              <FormField label="連絡先" fullWidth />
              <FormField label="車種・色" />
              <FormField label="車両番号" />
              <FormField label="免許証番号" />
              <FormField label="ドライブレコーダー有無" />
              <FormField label="保険会社" fullWidth />
            </div>
          </div>

          <div>
            <h3 className="text-xs font-medium text-muted-foreground mb-2">警察情報</h3>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <FormField label="所轄警察署名" />
              <FormField label="担当氏名・課" />
              <FormField label="受理番号" fullWidth />
            </div>
          </div>

          <div>
            <h3 className="text-xs font-medium text-muted-foreground mb-2">事故状況・目撃者</h3>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <FormField label="事故状況および損傷・損害程度（写真添付可）" fullWidth tall />
              <FormField label="目撃者氏名" />
              <FormField label="目撃者連絡先" />
              <FormField label="メモ欄" fullWidth tall />
              <FormField label="記入者" fullWidth />
            </div>
          </div>

          <AlertBox type="warning" label="提出期限">
            人身事故の場合は当日、それ以外は翌日までに当事者と所属長で記録用紙を完成・提出すること。
          </AlertBox>
        </div>
      )}

      {/* 後日対応 */}
      {activeTab === "later" && (
        <div className="space-y-3">
          <StepCard step="後日対応 1" title="保険会社の指示に従う">
            <ul className="mt-2 space-y-1">
              {["医療保険の負担区分（自賠責 / 労災 / その他）の確認", "自動車の修理代の負担・修理場所の確定", "塀や備品の修理代の負担確認", "公用車の場合は会社の保険で対応"].map((item) => (
                <li key={item} className="text-sm text-foreground flex items-start gap-2">
                  <span className="text-muted-foreground mt-0.5 text-xs">●</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <AlertBox type="info" label="ポイント">
              お金の交渉はすべて保険会社同士で行う旨を相手方に伝えること。
            </AlertBox>
          </StepCard>

          <StepCard step="後日対応 2" title="相手方への挨拶・謝罪">
            <ul className="mt-2 space-y-1">
              {["事故当日か翌日に、当事者と所長が手土産持参で訪問（予算 2,000〜3,000円・会社負担）", "すべて終了したら再度挨拶（手土産は自費）"].map((item) => (
                <li key={item} className="text-sm text-foreground flex items-start gap-2">
                  <span className="text-muted-foreground mt-0.5 text-xs">●</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <AlertBox type="danger" label="注意">
              責任関係がはっきりしない段階での謝罪はしないこと。所長が必要に応じて対応すること。
            </AlertBox>
          </StepCard>

          <StepCard step="後日対応 3" title="職員のフォロー">
            <ul className="mt-2 space-y-1">
              {["落ち込まないよう、落ち着けるよう声かけを行う", "事故現場記録用紙を当事者と所属長で作成し提出（人身：当日、その他：翌日まで）"].map((item) => (
                <li key={item} className="text-sm text-foreground flex items-start gap-2">
                  <span className="text-muted-foreground mt-0.5 text-xs">●</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <AlertBox type="success" label="心がけ">
              事故後の職員の精神的ケアを忘れずに。担当者を責めず、組織として再発防止に取り組む姿勢を大切に。
            </AlertBox>
          </StepCard>
        </div>
      )}
    </div>
  );
}

// ステップカード
function StepCard({ step, title, children }: { step: number | string; title: string; children: React.ReactNode }) {
  return (
    <div className="border border-border rounded-xl p-4 bg-card">
      <div className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">
        {typeof step === "number" ? `ステップ ${step}` : step}
      </div>
      <div className="text-sm font-medium text-foreground mb-2">{title}</div>
      {children}
    </div>
  );
}

// アラートボックス
function AlertBox({ type, label, children }: { type: "danger" | "warning" | "info" | "success"; label: string; children: React.ReactNode }) {
  const styles = {
    danger: "bg-[var(--color-background-danger)] border-[var(--color-border-danger)] text-[var(--color-text-danger)]",
    warning: "bg-[var(--color-background-warning)] border-[var(--color-border-warning)] text-[var(--color-text-warning)]",
    info: "bg-[var(--color-background-info)] border-[var(--color-border-info)] text-[var(--color-text-info)]",
    success: "bg-[var(--color-background-success)] border-[var(--color-border-success)] text-[var(--color-text-success)]",
  };
  return (
    <div className={`rounded-lg p-3 mt-2 border-l-[3px] text-sm leading-relaxed ${styles[type]}`}>
      <div className="font-medium text-xs mb-1">{label}</div>
      {children}
    </div>
  );
}

// 連絡先カード
function ContactCard({ badge, badgeType, name, role, tel, children }: {
  badge: string;
  badgeType: "info" | "warning" | "success" | "danger";
  name: string;
  role?: string;
  tel: string;
  children?: React.ReactNode;
}) {
  const badgeStyles = {
    info: "bg-[var(--color-background-info)] text-[var(--color-text-info)]",
    warning: "bg-[var(--color-background-warning)] text-[var(--color-text-warning)]",
    success: "bg-[var(--color-background-success)] text-[var(--color-text-success)]",
    danger: "bg-[var(--color-background-danger)] text-[var(--color-text-danger)]",
  };
  return (
    <div className="border border-border rounded-lg p-2.5 bg-muted">
      <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium mb-1.5 ${badgeStyles[badgeType]}`}>{badge}</span>
      <div className="text-xs font-medium text-foreground mb-0.5">{name}</div>
      {role && <div className="text-xs text-muted-foreground mb-1">{role}</div>}
      <a href={`tel:${tel.replace(/-/g, "")}`} className="text-sm font-medium text-[var(--color-text-info)] hover:underline block">
        {tel}
      </a>
      {children}
    </div>
  );
}

// フォームフィールド
function FormField({ label, value, fullWidth, tall }: { label: string; value?: string; fullWidth?: boolean; tall?: boolean }) {
  return (
    <div className={`border border-border rounded-lg p-2.5 bg-muted ${fullWidth ? "col-span-2" : ""}`}>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={`text-sm text-foreground font-medium ${tall ? "min-h-[40px]" : "min-h-[18px]"}`}>{value || ""}</div>
    </div>
  );
}

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

      {/* 交通事故マニュアルカード */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Car className="w-4 h-4 text-red-500" />
            交通事故
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TrafficAccidentManual />
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
