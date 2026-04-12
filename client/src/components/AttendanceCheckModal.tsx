/**
 * AttendanceCheckModal - 出勤前・退勤前の確認モーダル
 * 手順チェック + アルコールチェック記録 + 打刻を一画面で完結させる
 * 打刻ボタンはいつでも押せる（手順完了を待たない）
 */
import { useState, useEffect, useMemo } from "react";
import {
  CheckCircle2,
  ExternalLink,
  LogIn,
  LogOut,
  X,
  Loader2,
  Car,
  Shield,
  ChevronDown,
  Clock,
  Users,
  FileText,
  BarChart2,
  MapPin,
  RefreshCw,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

const DAILY_REPORT_SPREADSHEET_ID = "10Leb7UR6ARVlCGbf5pBa5yxsgm5WAV9m-ETyYrzfBCs";

// 出勤・退勤の手順ステップ定義
interface ClockInStep {
  id: string;
  label: string;
  description?: string;
  link?: { url: string; label: string; isDailyReport?: boolean };
}

const CLOCK_IN_STEPS: ClockInStep[] = [
  {
    id: "mimamodrive_in",
    label: "みまもドライブ",
    description: "出発前にみまもドライブを起動する",
    link: {
      url: "https://mimamodrive.tokiomarine-smartmobility.co.jp/index.html",
      label: "みまもドライブを開く",
    },
  },
  {
    id: "daily_report_in",
    label: "業務日報",
    description: "前日までの記録確認",
    link: {
      url: `https://docs.google.com/spreadsheets/d/${DAILY_REPORT_SPREADSHEET_ID}/edit`,
      label: "業務日報を開く",
      isDailyReport: true,
    },
  },
  {
    id: "ibow_in",
    label: "ibow 24時間体制の記録確認",
    description: "ibowで24時間体制の記録内容を確認する",
    link: {
      url: "https://login.ibowservice.jp/",
      label: "ibowを開く",
    },
  },
];

const CLOCK_OUT_STEPS: ClockInStep[] = [
  {
    id: "mimamodrive_out",
    label: "自宅到着時にみまもドライブを停止",
    description: "自宅に到着したらみまもドライブを停止する",
    link: {
      url: "https://mimamodrive.tokiomarine-smartmobility.co.jp/index.html",
      label: "みまもドライブを開く",
    },
  },
];

// 時間の選択肢
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);
const MINUTE_OPTIONS = [0, 10, 20, 30, 40, 50];

function floorToTenMinutes(date: Date): number {
  return Math.floor(date.getMinutes() / 10) * 10;
}

interface AttendanceCheckModalProps {
  type: "clock_in" | "clock_out";
  onClose: () => void;
  onConfirm?: () => void;
}

export function AttendanceCheckModal({ type, onClose, onConfirm }: AttendanceCheckModalProps) {
  const isClockIn = type === "clock_in";
  const steps = isClockIn ? CLOCK_IN_STEPS : CLOCK_OUT_STEPS;
  const { user } = useAuth();
  const utils = trpc.useUtils();

  // 手順チェック状態
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [openingStepId, setOpeningStepId] = useState<string | null>(null);

  // ── アルコールチェック フォーム状態 ──
  const [numberPlate, setNumberPlate] = useState("");
  const [confirmMethod, setConfirmMethod] = useState<"online" | "face">("online");
  const [detectorUsed, setDetectorUsed] = useState(true);
  const [alcoholDetected, setAlcoholDetected] = useState(false);
  const [confirmerName, setConfirmerName] = useState("森脇崇");
  const [notes, setNotes] = useState("");

  // 残業入力（退勤時のみ）
  const openedAt = useMemo(() => new Date(), []);
  const [hasOvertime, setHasOvertime] = useState(false);
  const [overtimeStartHour, setOvertimeStartHour] = useState(17);
  const [overtimeStartMinute, setOvertimeStartMinute] = useState(0);
  const [overtimeEndHour, setOvertimeEndHour] = useState(() => openedAt.getHours());
  const [overtimeEndMinute, setOvertimeEndMinute] = useState(() => floorToTenMinutes(openedAt));
  const [overtimeReasonType, setOvertimeReasonType] = useState("");
  const [overtimeContactTarget, setOvertimeContactTarget] = useState("");
  const [overtimeRecordCount, setOvertimeRecordCount] = useState(1);
  const [overtimeFreeText, setOvertimeFreeText] = useState("");

  // 位置情報
  const [locationStatus, setLocationStatus] = useState<"idle" | "loading" | "success" | "denied" | "error">("idle");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locationAddress, setLocationAddress] = useState<string | null>(null);

  // ユーザーのナンバープレートを自動取得
  useEffect(() => {
    if ((user as any)?.numberPlate) {
      setNumberPlate((user as any).numberPlate);
    }
  }, [user]);

  // モーダルを開いたら自動で位置情報を取得
  useEffect(() => {
    fetchLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        setLocationStatus(err.code === 1 ? "denied" : "error");
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  };

  const toTodayMs = (hour: number, minute: number): number => {
    const d = new Date();
    d.setHours(hour, minute, 0, 0);
    return d.getTime();
  };

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

  // ── ミューテーション ──
  // saveAlcoholCheck が打刻も兼ねる（clockInAt/clockOutAt を渡すことで記録）
  const saveAlcoholCheckMutation = trpc.attendance.saveAlcoholCheck.useMutation({
    onSuccess: () => {
      toast.success(isClockIn ? "出勤打刻・アルコールチェックを記録しました" : "退勤打刻・アルコールチェックを記録しました");
      void utils.attendance.today.invalidate();
      onConfirm?.();
      onClose();
    },
    onError: (e) => {
      toast.error(`記録に失敗しました: ${e.message}`);
    },
  });

  // 業務日報リンクを開く
  const openDailyReport = async (step: ClockInStep) => {
    if (!step.link) return;
    setOpeningStepId(step.id);
    const newWindow = window.open("about:blank", "_blank");
    try {
      const result = await utils.spreadsheetLinks.getDailyReportSheetGid.fetch();
      const url =
        result.gid !== null
          ? `https://docs.google.com/spreadsheets/d/${DAILY_REPORT_SPREADSHEET_ID}/edit#gid=${result.gid}`
          : step.link.url;
      if (newWindow) {
        newWindow.location.href = url;
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch {
      if (newWindow) {
        newWindow.location.href = step.link.url;
      } else {
        window.open(step.link.url, "_blank", "noopener,noreferrer");
      }
    } finally {
      setOpeningStepId(null);
    }
    setDone((prev) => ({ ...prev, [step.id]: true }));
  };

  const openLink = (step: ClockInStep) => {
    if (!step.link) return;
    window.open(step.link.url, "_blank", "noopener,noreferrer");
    setDone((prev) => ({ ...prev, [step.id]: true }));
  };

  const handleStepButton = async (step: ClockInStep) => {
    if (!step.link) return;
    if (step.link.isDailyReport) {
      await openDailyReport(step);
    } else {
      openLink(step);
    }
  };

  // 打刻 + アルコールチェック記録を同時実行
  const handleClock = () => {
    if (saveAlcoholCheckMutation.isPending) return;
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
    const now = Date.now();
    saveAlcoholCheckMutation.mutate({
      clockType: type,
      numberPlate: numberPlate.trim(),
      confirmMethod,
      detectorUsed,
      alcoholDetected,
      confirmerName,
      notes: notes.trim() || undefined,
      clockInAt: isClockIn ? now : undefined,
      clockOutAt: !isClockIn ? now : undefined,
      overtimeStartAt: (!isClockIn && hasOvertime) ? toTodayMs(overtimeStartHour, overtimeStartMinute) : undefined,
      overtimeEndAt: (!isClockIn && hasOvertime) ? toTodayMs(overtimeEndHour, overtimeEndMinute) : undefined,
      overtimeReason: (!isClockIn && hasOvertime) ? buildOvertimeReason() : undefined,
      overtimeContact: (!isClockIn && hasOvertime && overtimeContactTarget.trim()) ? overtimeContactTarget.trim() : undefined,
      overtimeCount: (!isClockIn && hasOvertime && ["記録書Ⅱ作成", "月次報告書作成", "状態報告書作成"].includes(overtimeReasonType)) ? overtimeRecordCount : undefined,
      latitude: latitude ?? undefined,
      longitude: longitude ?? undefined,
      locationAddress: locationAddress ?? undefined,
    });
  };

  const isPending = saveAlcoholCheckMutation.isPending;

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
              ? "bg-gradient-to-r from-red-500 to-rose-600"
              : "bg-gradient-to-r from-blue-500 to-indigo-600"
          }`}
        >
          <div className="flex items-center gap-2 text-white">
            {isClockIn ? (
              <LogIn className="w-5 h-5" />
            ) : (
              <LogOut className="w-5 h-5" />
            )}
            <span className="text-lg font-bold">
              {isClockIn ? "出勤前の確認" : "退勤前の確認"}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/20"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* スクロール可能なコンテンツ */}
        <div
          className="overflow-y-auto flex-1 py-2"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {/* ── 手順チェックリスト ── */}
          {steps.map((step) => {
            const isDone = done[step.id];
            const isOpening = openingStepId === step.id;
            return (
              <div
                key={step.id}
                className={`mx-3 my-2 rounded-xl border transition-all duration-200 ${
                  isDone
                    ? "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30"
                    : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                }`}
              >
                <div className="flex items-start gap-3 px-4 py-3">
                  <div className="flex-shrink-0 mt-0.5">
                    {isDone ? (
                      <CheckCircle2 className="w-6 h-6 text-green-500" />
                    ) : (
                      <div
                        className={`w-6 h-6 rounded-full ${
                          isClockIn
                            ? "bg-red-100 dark:bg-red-900/40"
                            : "bg-blue-100 dark:bg-blue-900/40"
                        }`}
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-semibold leading-snug ${
                        isDone
                          ? "text-green-700 dark:text-green-400 line-through"
                          : "text-gray-800 dark:text-gray-200"
                      }`}
                    >
                      {step.label}
                    </p>
                    {step.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
                        {step.description}
                      </p>
                    )}
                  </div>
                </div>
                {!isDone && step.link && (
                  <div className="px-4 pb-3 pt-0">
                    <button
                      type="button"
                      disabled={isOpening}
                      onClick={() => void handleStepButton(step)}
                      className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg transition-colors ${
                        isOpening ? "opacity-60 cursor-wait" : ""
                      } ${
                        isClockIn
                          ? "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-900/60"
                          : "bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/60"
                      }`}
                    >
                      {isOpening ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <ExternalLink className="w-3 h-3" />
                      )}
                      {step.link.label}
                    </button>
                  </div>
                )}
                {isDone && (
                  <div className="px-4 pb-3 pt-0">
                    <span className="text-xs text-green-600 dark:text-green-400 font-medium">✓ 完了</span>
                  </div>
                )}
              </div>
            );
          })}

          {/* ── アルコールチェックセクション ── */}
          <div className={`mx-3 my-2 rounded-xl border-2 overflow-hidden ${
            isClockIn
              ? "border-orange-200 dark:border-orange-800"
              : "border-cyan-200 dark:border-cyan-800"
          }`}>
            {/* セクションヘッダー */}
            <div className={`px-4 py-3 flex items-center gap-2 ${
              isClockIn
                ? "bg-orange-100 dark:bg-orange-900/30"
                : "bg-cyan-100 dark:bg-cyan-900/30"
            }`}>
              <Shield className={`w-4 h-4 ${isClockIn ? "text-orange-600 dark:text-orange-400" : "text-cyan-600 dark:text-cyan-400"}`} />
              <span className={`text-sm font-bold ${isClockIn ? "text-orange-700 dark:text-orange-300" : "text-cyan-700 dark:text-cyan-300"}`}>
                アルコールチェック
              </span>
            </div>

            <div className="px-4 py-4 space-y-4 bg-white dark:bg-gray-900">
              {/* ナンバープレート */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  <Car className="w-3.5 h-3.5 inline mr-1 mb-0.5" />
                  ナンバープレート <span className="text-red-500">*</span>
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
                      <Loader2 className="w-3 h-3 animate-spin" />
                      位置情報取得中...
                    </span>
                  )}
                  {locationStatus === "success" && locationAddress && (
                    <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                      <MapPin className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate max-w-[220px]" title={locationAddress}>
                        {locationAddress.slice(0, 30)}{locationAddress.length > 30 ? "..." : ""}
                      </span>
                    </span>
                  )}
                  {locationStatus === "denied" && (
                    <span className="text-xs text-amber-500">位置情報が許可されていません</span>
                  )}
                  {locationStatus === "error" && (
                    <span className="text-xs text-red-500">位置情報の取得に失敗しました</span>
                  )}
                  {locationStatus === "idle" && (
                    <span className="text-xs text-gray-400">位置情報未取得</span>
                  )}
                </div>
                {(locationStatus === "denied" || locationStatus === "error" || locationStatus === "idle") && (
                  <button
                    type="button"
                    onClick={fetchLocation}
                    className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 px-2 py-1 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
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
                    <div className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 ${hasOvertime ? "bg-purple-500" : "bg-gray-300 dark:bg-gray-600"}`}>
                      <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${hasOvertime ? "translate-x-5" : "translate-x-0"}`} />
                    </div>
                  </button>

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

                      {/* 記録書Ⅱ・月次・状態報告書：人数プルダウン */}
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
          </div>

          <div className="h-2" />
        </div>

        {/* フッター：打刻ボタン（常時有効） */}
        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0 space-y-2">
          <button
            type="button"
            disabled={isPending}
            onClick={handleClock}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md active:scale-95 ${
              isClockIn
                ? "bg-red-500 hover:bg-red-600"
                : "bg-blue-500 hover:bg-blue-600"
            }`}
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                記録中...
              </>
            ) : (
              <>
                {isClockIn ? <LogIn className="w-4 h-4" /> : <LogOut className="w-4 h-4" />}
                {isClockIn ? "出勤打刻・アルコールチェック記録" : "退勤打刻・アルコールチェック記録"}
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
