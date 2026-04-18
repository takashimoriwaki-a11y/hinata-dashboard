/**
 * AlcoholCheckModal - アルコールチェック記録入力モーダル
 * 出勤・退勤時のアルコールチェック記録を入力してスプレッドシートに転記する
 * 退勤時は残業入力フォームも表示する
 */
import { useState, useEffect, useMemo } from "react";
import { Car, Shield, X, Loader2, CheckCircle2, ChevronDown, Clock, Users, FileText, BarChart2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

interface AlcoholCheckModalProps {
  /** 出勤時か退勤時か */
  clockType: "clock_in" | "clock_out";
  onClose: () => void;
  /** 打刻時刻（ms）を外部から渡す場合 */
  clockInAt?: number;
  clockOutAt?: number;
  /** 退勤時の残業理由事前入力（ウェルカムバナーから渡す） */
  initialOvertimeReason?: string;
}

// 時間の選択肢（0〜23時）
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);
// 分の選択肢（10分単位）
const MINUTE_OPTIONS = [0, 10, 20, 30, 40, 50];

/** 現在時刻から10分単位（一の位切り捨て）の分を返す */
function floorToTenMinutes(date: Date): number {
  return Math.floor(date.getMinutes() / 10) * 10;
}

export function AlcoholCheckModal({ clockType, onClose, clockInAt, clockOutAt, initialOvertimeReason }: AlcoholCheckModalProps) {
  const isClockIn = clockType === "clock_in";
  const { user } = useAuth();
  const utils = trpc.useUtils();
  // アクティブな検知器一覧（プルダウン用）
  const { data: activeDetectors = [] } = trpc.alcoholDetector.getActive.useQuery();

  // フォーム状態
  const [numberPlate, setNumberPlate] = useState("");
  const [confirmMethod, setConfirmMethod] = useState<"online" | "face">("online");
  const [detectorUsed, setDetectorUsed] = useState(true);
  const [alcoholDetected, setAlcoholDetected] = useState(false);
  const [confirmerName, setConfirmerName] = useState("森脇崇");
  const [notes, setNotes] = useState("");

  // 残業入力（退勤時のみ）
  // モーダルを開いた時刻を一度だけ取得
  const openedAt = useMemo(() => new Date(), []);
  const [hasOvertime, setHasOvertime] = useState(!!initialOvertimeReason);
  // 開始：デフォルト17時00分
  const [overtimeStartHour, setOvertimeStartHour] = useState(17);
  const [overtimeStartMinute, setOvertimeStartMinute] = useState(0);
  // 終了：デフォルトはモーダルを開いた時刻（10分切り捨て）
  const [overtimeEndHour, setOvertimeEndHour] = useState(() => openedAt.getHours());
  const [overtimeEndMinute, setOvertimeEndMinute] = useState(() => floorToTenMinutes(openedAt));
  // 残業理由プリセット（ウェルカムバナーから事前入力された場合はそれを初期値に）
  const [overtimeReasonType, setOvertimeReasonType] = useState<string>(initialOvertimeReason ?? "");
  // 連動入力欄の値
  const [overtimeContactTarget, setOvertimeContactTarget] = useState(""); // 支援者連絡・家族連絡の連絡先
  const [overtimeRecordCount, setOvertimeRecordCount] = useState<number>(1); // 記録書Ⅱ・月次・状態報告書の人数
  const [overtimeFreeText, setOvertimeFreeText] = useState(""); // その他の自由記述

  // 追加項目
  const [alcoholMeasuredValue, setAlcoholMeasuredValue] = useState(""); // 測定値（mg/L）
  const [detectorType, setDetectorType] = useState<string>("__auto__"); // 検知器種類・型番（__auto__=一覧から自動選択）
  const [detectorFreeText, setDetectorFreeText] = useState<string>(""); // 「その他」選択時の自由入力
  const [drivingPurpose, setDrivingPurpose] = useState<"commute" | "visit" | "transport" | "errand" | "other">("visit"); // 運転目的
  const [hasPassenger, setHasPassenger] = useState<boolean>(false); // 同乗者の有無
  const [passengerCount, setPassengerCount] = useState<number>(1); // 同乗者人数
  const [physicalCondition, setPhysicalCondition] = useState<"good" | "poor">("good"); // 体調確認
  const [physicalConditionNote, setPhysicalConditionNote] = useState(""); // 体調不調の詳細

  /** 残業理由を文字列に変換（スプレッドシート転記用） */
  const buildOvertimeReason = (): string => {
    switch (overtimeReasonType) {
      case "訪問看護実施": return "訪問看護実施";
      case "支援者連絡": return overtimeContactTarget ? `支援者連絡（${overtimeContactTarget}）` : "支援者連絡";
      case "家族連絡": return overtimeContactTarget ? `家族連絡（${overtimeContactTarget}）` : "家族連絡";
      case "記録書Ⅱ作成": return `記録書Ⅱ作成（${overtimeRecordCount}人分）`;
      case "月次報告書作成": return `月次報告書作成（${overtimeRecordCount}人分）`;
      case "状態報告書作成": return `状態報告書作成（${overtimeRecordCount}人分）`;
      case "その他": return overtimeFreeText || "その他";
      default: return "";
    }
  };

  // ユーザーのナンバープレートを自動取得
  useEffect(() => {
    if ((user as any)?.numberPlate) {
      setNumberPlate((user as any).numberPlate);
    }
  }, [user]);

  /** 時刻（時・分）をUTC msに変換（今日の日付で計算） */
  const toTodayMs = (hour: number, minute: number): number => {
    const d = new Date();
    d.setHours(hour, minute, 0, 0);
    return d.getTime();
  };

  // 位置情報の状態管理
  const [locationStatus, setLocationStatus] = useState<"idle" | "loading" | "success" | "denied" | "error">("idle");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locationAddress, setLocationAddress] = useState<string | null>(null);

  /** Geolocation APIで位置情報を取得し、逆ジオコーディングで住所を取得する */
  const fetchLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus("error");
      return;
    }
    setLocationStatus("loading");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setLatitude(lat);
        setLongitude(lng);
        // 逆ジオコーディング（Nominatim）
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ja`,
            { headers: { "User-Agent": "hinata-dashboard/1.0" } }
          );
          const data = await res.json();
          const addr = data?.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          setLocationAddress(addr);
        } catch {
          setLocationAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        }
        setLocationStatus("success");
      },
      (err) => {
        if (err.code === 1) {
          setLocationStatus("denied");
        } else {
          setLocationStatus("error");
        }
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  };

  // アクティブな検知器が読み込まれたら最初の検知器を自動選択する
  useEffect(() => {
    if (activeDetectors.length > 0 && detectorType === "__auto__") {
      setDetectorType(activeDetectors[0].name);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDetectors]);

  // モーダルを開いたら自動で位置情報を取得
  useEffect(() => {
    fetchLocation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const alcoholCheckMutation = trpc.attendance.saveAlcoholCheck.useMutation({
    onSuccess: () => {
      toast.success("アルコールチェックを記録しました");
      void utils.attendance.today.invalidate();
      onClose();
    },
    onError: (e) => {
      toast.error(`記録に失敗しました: ${e.message}`);
    },
  });

  const handleSubmit = () => {
    if (!numberPlate.trim()) {
      toast.error("ナンバープレートを入力してください");
      return;
    }
    if (!isClockIn && hasOvertime && !overtimeReasonType) {
      toast.error("残業理由を選択してください");
      return;
    }
    if (!isClockIn && hasOvertime && overtimeReasonType === "支援者連絡" && !overtimeContactTarget.trim()) {
      toast.error("連絡先を入力してください");
      return;
    }
    if (!isClockIn && hasOvertime && overtimeReasonType === "家族連絡" && !overtimeContactTarget.trim()) {
      toast.error("連絡先を入力してください");
      return;
    }
    if (!isClockIn && hasOvertime && overtimeReasonType === "その他" && !overtimeFreeText.trim()) {
      toast.error("残業理由の詳細を入力してください");
      return;
    }
    alcoholCheckMutation.mutate({
      clockType,
      numberPlate: numberPlate.trim(),
      confirmMethod,
      detectorUsed,
      alcoholDetected,
      confirmerName,
      notes: notes.trim() || undefined,
      clockInAt: isClockIn ? clockInAt : undefined,
      clockOutAt: !isClockIn ? clockOutAt : undefined,
      overtimeStartAt: (!isClockIn && hasOvertime) ? toTodayMs(overtimeStartHour, overtimeStartMinute) : undefined,
      overtimeEndAt: (!isClockIn && hasOvertime) ? toTodayMs(overtimeEndHour, overtimeEndMinute) : undefined,
      overtimeReason: (!isClockIn && hasOvertime) ? buildOvertimeReason() : undefined,
      overtimeContact: (!isClockIn && hasOvertime && overtimeContactTarget.trim()) ? overtimeContactTarget.trim() : undefined,
      overtimeCount: (!isClockIn && hasOvertime && ["\u8a18\u9332\u66f8\u2161\u4f5c\u6210", "\u6708\u6b21\u5831\u544a\u66f8\u4f5c\u6210", "\u72b6\u614b\u5831\u544a\u66f8\u4f5c\u6210"].includes(overtimeReasonType)) ? overtimeRecordCount : undefined,
      // 位置情報
      latitude: latitude ?? undefined,
      longitude: longitude ?? undefined,
      locationAddress: locationAddress ?? undefined,
      // 追加項目
      alcoholMeasuredValue: alcoholMeasuredValue.trim() || undefined,
      detectorType: (detectorType === "__auto__" ? activeDetectors[0]?.name : detectorType === "" ? detectorFreeText.trim() : detectorType) || undefined,
      drivingPurpose: drivingPurpose || undefined,
      hasPassenger,
      passengerCount: hasPassenger ? passengerCount : undefined,
      physicalCondition,
      physicalConditionNote: physicalCondition === "poor" && physicalConditionNote.trim() ? physicalConditionNote.trim() : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* 背景オーバーレイ */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* モーダル本体 */}
      <div
        className="relative w-full sm:max-w-md mx-0 sm:mx-4 bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
        style={{ maxHeight: "min(92dvh, 92vh)" }}
      >
        {/* ヘッダー */}
        <div
          className={`px-5 py-4 flex items-center justify-between flex-shrink-0 rounded-t-2xl sm:rounded-t-2xl ${
            isClockIn
              ? "bg-gradient-to-r from-orange-500 to-amber-600"
              : "bg-gradient-to-r from-cyan-500 to-blue-600"
          }`}
        >
          <div className="flex items-center gap-2.5 text-white">
            <Shield className="w-5 h-5" />
            <div>
              <p className="text-base font-bold leading-tight">アルコールチェック</p>
              <p className="text-xs text-white/80">{isClockIn ? "出勤時" : "退勤時"}の記録</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/20"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* スクロール可能なフォーム */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4" style={{ WebkitOverflowScrolling: "touch" }}>

          {/* ナンバープレート */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              <Car className="w-3.5 h-3.5 inline mr-1 mb-0.5" />
              ナンバープレート
            </label>
            <input
              type="text"
              value={numberPlate}
              onChange={(e) => setNumberPlate(e.target.value)}
              placeholder="例: 大和 300 あ 1234"
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-blue-400"
              style={{ fontSize: "16px" }}
            />
            {(user as any)?.numberPlate && (
              <p className="text-xs text-gray-400 mt-1">
                ※ アカウントに登録されたナンバープレートを自動入力しました
              </p>
            )}
          </div>

          {/* 位置情報 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {locationStatus === "loading" && (
                <span className="inline-flex items-center gap-1 text-xs text-blue-500">
                  <Loader2 className="w-3 h-3 animate-spin" />位置情報取得中...
                </span>
              )}
              {locationStatus === "success" && locationAddress && (
                <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                  <CheckCircle2 className="w-3 h-3" />
                  <span className="truncate max-w-[220px]" title={locationAddress}>{locationAddress.slice(0, 30)}{locationAddress.length > 30 ? "..." : ""}</span>
                </span>
              )}
              {locationStatus === "denied" && (
                <span className="inline-flex items-center gap-1 text-xs text-amber-500">
                  ⚠️ 位置情報の取得が許可されていません
                </span>
              )}
              {locationStatus === "error" && (
                <span className="inline-flex items-center gap-1 text-xs text-red-500">
                  ⚠️ 位置情報の取得に失敗しました
                </span>
              )}
            </div>
            {(locationStatus === "denied" || locationStatus === "error") && (
              <button
                type="button"
                onClick={fetchLocation}
                className="text-xs text-blue-500 hover:text-blue-600 underline"
              >
                再取得
              </button>
            )}
          </div>

          {/* 確認方法 */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              確認方法
            </label>
            <div className="flex gap-2">
              {(["online", "face"] as const).map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setConfirmMethod(method)}
                  className={`flex-1 py-2.5 text-sm font-medium rounded-xl border-2 transition-all ${
                    confirmMethod === method
                      ? isClockIn
                        ? "bg-orange-500 border-orange-500 text-white shadow-sm"
                        : "bg-cyan-500 border-cyan-500 text-white shadow-sm"
                      : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-300"
                  }`}
                >
                  {method === "online" ? "オンライン画面" : "対面"}
                </button>
              ))}
            </div>
          </div>

          {/* 検知器使用 */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              検知器使用
            </label>
            <div className="flex gap-2">
              {([true, false] as const).map((used) => (
                <button
                  key={String(used)}
                  type="button"
                  onClick={() => setDetectorUsed(used)}
                  className={`flex-1 py-2.5 text-sm font-medium rounded-xl border-2 transition-all ${
                    detectorUsed === used
                      ? isClockIn
                        ? "bg-orange-500 border-orange-500 text-white shadow-sm"
                        : "bg-cyan-500 border-cyan-500 text-white shadow-sm"
                      : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-300"
                  }`}
                >
                  {used ? "使用" : "未使用"}
                </button>
              ))}
            </div>
          </div>

          {/* 酒気帯び有無 */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              酒気帯び
            </label>
            <div className="flex gap-2">
              {([false, true] as const).map((detected) => (
                <button
                  key={String(detected)}
                  type="button"
                  onClick={() => setAlcoholDetected(detected)}
                  className={`flex-1 py-2.5 text-sm font-medium rounded-xl border-2 transition-all ${
                    alcoholDetected === detected
                      ? detected
                        ? "bg-amber-500 border-amber-500 text-white shadow-sm"
                        : isClockIn
                          ? "bg-orange-500 border-orange-500 text-white shadow-sm"
                          : "bg-cyan-500 border-cyan-500 text-white shadow-sm"
                      : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-300"
                  }`}
                >
                  {detected ? "有" : "無"}
                </button>
              ))}
            </div>
            {alcoholDetected && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5 font-medium">
                ⚠️ 酒気帯びが検知されました。安全管理者に報告してください。
              </p>
            )}
          </div>

          {/* 確認者 */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              確認者（安全運転管理者）
            </label>
            <div className="relative">
              <select
                value={confirmerName}
                onChange={(e) => setConfirmerName(e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-blue-400 appearance-none pr-8"
              >
                <option value="森脇崇">森脇崇（安全運転管理者）</option>
                <option value="森脇英樹">森脇英樹（代理）</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* 残業入力（退勤時のみ） */}
          {!isClockIn && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              {/* トグルヘッダー */}
              <button
                type="button"
                onClick={() => setHasOvertime((v) => !v)}
                className={`w-full flex items-center justify-between px-4 py-3 text-sm font-semibold transition-colors ${
                  hasOvertime
                    ? "bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300"
                    : "bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-750"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  残業あり
                </div>
                {/* トグルスイッチ */}
                <div className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 ${hasOvertime ? "bg-purple-500" : "bg-gray-300 dark:bg-gray-600"}`}>
                  <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${hasOvertime ? "translate-x-5" : "translate-x-0"}`} />
                </div>
              </button>

              {/* 残業フォーム（展開時のみ） */}
              {hasOvertime && (
                <div className="px-4 pb-4 pt-3 space-y-3 bg-white dark:bg-gray-900">
                  {/* 残業開始時刻 */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                      残業開始時刻
                      <span className="text-gray-400 font-normal ml-1">（デフォルト: 17:00）</span>
                    </label>
                    <div className="flex gap-2 items-center">
                      <div className="relative flex-1">
                        <select
                          value={overtimeStartHour}
                          onChange={(e) => setOvertimeStartHour(Number(e.target.value))}
                          className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-400 appearance-none pr-7"
                        >
                          {HOUR_OPTIONS.map((h) => (
                            <option key={h} value={h}>{String(h).padStart(2, "0")}時</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                      </div>
                      <div className="relative flex-1">
                        <select
                          value={overtimeStartMinute}
                          onChange={(e) => setOvertimeStartMinute(Number(e.target.value))}
                          className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-400 appearance-none pr-7"
                        >
                          {MINUTE_OPTIONS.map((m) => (
                            <option key={m} value={m}>{String(m).padStart(2, "0")}分</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  {/* 残業終了時刻 */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                      残業終了時刻
                      <span className="text-gray-400 font-normal ml-1">（画面を開いた時刻から自動取得）</span>
                    </label>
                    <div className="flex gap-2 items-center">
                      <div className="relative flex-1">
                        <select
                          value={overtimeEndHour}
                          onChange={(e) => setOvertimeEndHour(Number(e.target.value))}
                          className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-400 appearance-none pr-7"
                        >
                          {HOUR_OPTIONS.map((h) => (
                            <option key={h} value={h}>{String(h).padStart(2, "0")}時</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                      </div>
                      <div className="relative flex-1">
                        <select
                          value={overtimeEndMinute}
                          onChange={(e) => setOvertimeEndMinute(Number(e.target.value))}
                          className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-400 appearance-none pr-7"
                        >
                          {MINUTE_OPTIONS.map((m) => (
                            <option key={m} value={m}>{String(m).padStart(2, "0")}分</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  {/* 残業理由プリセット */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                      残業理由 <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {["訪問看護実施", "支援者連絡", "家族連絡", "記録書Ⅱ作成", "月次報告書作成", "状態報告書作成", "その他"].map((reason) => (
                        <button
                          key={reason}
                          type="button"
                          onClick={() => {
                            setOvertimeReasonType(reason);
                            // 切り替え時に連動入力をリセット
                            setOvertimeContactTarget("");
                            setOvertimeRecordCount(1);
                            setOvertimeFreeText("");
                          }}
                          className={`py-2 px-2 text-xs font-medium rounded-xl border-2 transition-all text-center ${
                            overtimeReasonType === reason
                              ? "bg-purple-500 border-purple-500 text-white shadow-sm"
                              : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-300"
                          }`}
                        >
                          {reason}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 支援者連絡：連絡先入力 */}
                  {overtimeReasonType === "支援者連絡" && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                        <Users className="w-3.5 h-3.5 inline mr-1 mb-0.5" />
                        誰に連絡したか <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={overtimeContactTarget}
                        onChange={(e) => setOvertimeContactTarget(e.target.value)}
                        placeholder="例: 相談支援専門員 山田さん"
                        className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-purple-400"
                        style={{ fontSize: "16px" }}
                      />
                    </div>
                  )}

                  {/* 家族連絡：連絡先入力 */}
                  {overtimeReasonType === "家族連絡" && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                        <Users className="w-3.5 h-3.5 inline mr-1 mb-0.5" />
                        誰に連絡したか <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={overtimeContactTarget}
                        onChange={(e) => setOvertimeContactTarget(e.target.value)}
                        placeholder="例: ○○様の長女 鈴木さん"
                        className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-purple-400"
                        style={{ fontSize: "16px" }}
                      />
                    </div>
                  )}

                  {/* 記録書Ⅱ作成・月次報告書作成・状態報告書作成：人数プルダウン */}
                  {["記録書Ⅱ作成", "月次報告書作成", "状態報告書作成"].includes(overtimeReasonType) && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                        <FileText className="w-3.5 h-3.5 inline mr-1 mb-0.5" />
                        何人分 <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <select
                          value={overtimeRecordCount}
                          onChange={(e) => setOvertimeRecordCount(Number(e.target.value))}
                          className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-purple-400 appearance-none pr-8"
                        >
                          {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => (
                            <option key={n} value={n}>{n}人分</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      </div>
                    </div>
                  )}

                  {/* その他：自由記述 */}
                  {overtimeReasonType === "その他" && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                        <BarChart2 className="w-3.5 h-3.5 inline mr-1 mb-0.5" />
                        詳細を入力 <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        value={overtimeFreeText}
                        onChange={(e) => setOvertimeFreeText(e.target.value)}
                        placeholder="残業の詳細を入力してください"
                        rows={2}
                        className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-purple-400 resize-none"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 測定値・検知器種類 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                測定値（mg/L）
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={alcoholMeasuredValue}
                onChange={(e) => setAlcoholMeasuredValue(e.target.value)}
                placeholder="例: 0.00"
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                検知器種類・型番
              </label>
              {activeDetectors.length > 0 ? (
                <div className="relative">
                  <select
                    value={detectorType}
                    onChange={(e) => setDetectorType(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-blue-400 appearance-none pr-8"
                  >
                    {activeDetectors.map((d) => (
                      <option key={d.id} value={d.name}>{d.name}</option>
                    ))}
                    <option value="">その他（入力）</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              ) : (
                <input
                  type="text"
                  value={detectorType === "__auto__" ? "" : detectorType}
                  onChange={(e) => setDetectorType(e.target.value)}
                  placeholder="例: アルコール検知器"
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-blue-400"
                />
              )}
              {detectorType === "" && (
                <input
                  type="text"
                  value={detectorFreeText}
                  placeholder="検知器名を入力"
                  className="mt-1.5 w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-blue-400"
                  onChange={(e) => setDetectorFreeText(e.target.value)}
                />
              )}
            </div>
          </div>

          {/* 運転目的 */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              運転目的
            </label>
            <div className="relative">
              <select
                value={drivingPurpose}
                onChange={(e) => setDrivingPurpose(e.target.value as any)}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-blue-400 appearance-none pr-8"
              >
                <option value="visit">業務訪問</option>
                <option value="commute">通勤</option>
                <option value="transport">送迎</option>
                <option value="errand">物品購入・用務</option>
                <option value="other">その他</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* 同乗者の有無 */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              同乗者の有無
            </label>
            <div className="flex gap-2">
              {([false, true] as const).map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => setHasPassenger(v)}
                  className={`flex-1 py-2.5 text-sm font-medium rounded-xl border-2 transition-all ${
                    hasPassenger === v
                      ? isClockIn
                        ? "bg-orange-500 border-orange-500 text-white shadow-sm"
                        : "bg-cyan-500 border-cyan-500 text-white shadow-sm"
                      : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-300"
                  }`}
                >
                  {v ? "有" : "無"}
                </button>
              ))}
            </div>
            {hasPassenger && (
              <div className="mt-2">
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">同乗者人数</label>
                <div className="relative">
                  <select
                    value={passengerCount}
                    onChange={(e) => setPassengerCount(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400 appearance-none pr-8"
                  >
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>{n}人</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>
            )}
          </div>

          {/* 体調確認 */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              体調確認
            </label>
            <div className="flex gap-2">
              {(["good", "poor"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setPhysicalCondition(v)}
                  className={`flex-1 py-2.5 text-sm font-medium rounded-xl border-2 transition-all ${
                    physicalCondition === v
                      ? v === "good"
                        ? isClockIn
                          ? "bg-orange-500 border-orange-500 text-white shadow-sm"
                          : "bg-cyan-500 border-cyan-500 text-white shadow-sm"
                        : "bg-red-500 border-red-500 text-white shadow-sm"
                      : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-300"
                  }`}
                >
                  {v === "good" ? "良好" : "不調"}
                </button>
              ))}
            </div>
            {physicalCondition === "poor" && (
              <div className="mt-2">
                <textarea
                  value={physicalConditionNote}
                  onChange={(e) => setPhysicalConditionNote(e.target.value)}
                  placeholder="体調不調の詳細を入力してください"
                  rows={2}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-red-300 dark:border-red-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-red-400 resize-none"
                />
              </div>
            )}
          </div>

          {/* 備考 */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              備考（任意）
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="特記事項があれば入力"
              rows={2}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-blue-400 resize-none"
            />
          </div>
        </div>

        {/* フッター */}
        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0 space-y-2">
          <button
            type="button"
            disabled={alcoholCheckMutation.isPending}
            onClick={handleSubmit}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
              isClockIn
                ? "bg-orange-500 hover:bg-orange-600 shadow-md active:scale-95"
                : "bg-cyan-600 hover:bg-cyan-700 shadow-md active:scale-95"
            }`}
          >
            {alcoholCheckMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                記録中...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                記録してスプレッドシートに転記
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
