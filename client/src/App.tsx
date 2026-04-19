import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { useState, useCallback, useEffect } from "react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Dashboard from "./pages/Dashboard";
import RecordInput from "./pages/RecordInput";
import PatientList from "./pages/PatientList";
import Schedule from "./pages/Schedule";
import Tasks from "./pages/Tasks";
import Admin from "./pages/Admin";
import ScheduleChange from "./pages/ScheduleChange";
import ScheduleChangeHistory from "./pages/ScheduleChangeHistory";
import PersonalTasks from "./pages/PersonalTasks";
// IrregularSchedules is now merged into ScheduleChange
import NewContract from "./pages/NewContract";
import ScheduleManagement from "./pages/ScheduleManagement";
import Minutes from "./pages/Minutes";
import HinatasWay from "./pages/HinatasWay";
import MyLinks from "./pages/MyLinks";
import TeamGoals from "./pages/TeamGoals";
import Login from "./pages/Login";
import Setup from "./pages/Setup";
import DashboardLayout from "./components/DashboardLayout";
import SplashScreen from "./components/SplashScreen";
import OfflineProvider from "./components/OfflineOverlay";
import PageLoadingBar from "./components/PageLoadingBar";
import RouteTransitionWrapper from "./components/RouteTransitionWrapper";
import { OfflineQueueProvider } from "./contexts/OfflineQueueContext";
import { useAuth } from "./_core/hooks/useAuth";
import { useLocation } from "wouter";

/** 管理者のみアクセスを許可するガードコンポーネント */
function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();

  // renderフェーズでnavigateを呼ぶとReactのルール違反になるためuseEffectで実行
  useEffect(() => {
    if (!loading && (!user || (user.role !== "admin" && user.role !== "super_admin"))) {
      navigate("/");
    }
  }, [loading, user, navigate]);

  if (loading || !user || (user.role !== "admin" && user.role !== "super_admin")) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      {/* 認証不要ページ */}
      <Route path="/login" component={Login} />
      <Route path="/setup" component={Setup} />

      {/* 認証が必要なページ（DashboardLayoutが未認証時にリダイレクト） */}
      <Route>
        <DashboardLayout>
          <RouteTransitionWrapper>
            <Switch>
              <Route path={"/"} component={Dashboard} />
              <Route path={"/record"} component={RecordInput} />
              <Route path={"/patients"} component={PatientList} />
              <Route path={"/schedule"} component={Schedule} />
              <Route path={"/tasks"} component={Tasks} />
              <Route path={"/admin"}>
                <AdminGuard>
                  <Admin />
                </AdminGuard>
              </Route>
              <Route path={"/schedule-change"} component={ScheduleChange} />
              <Route path={"/schedule-change-history"} component={ScheduleChangeHistory} />
              <Route path={"/personal-tasks"} component={PersonalTasks} />
              <Route path={"/irregular-schedules"} component={() => { window.location.replace("/schedule-change"); return null; }} />
              <Route path={"/new-contract"} component={NewContract} />
              <Route path={"/schedule-management"} component={ScheduleManagement} />
              <Route path={"/minutes"} component={Minutes} />
              <Route path={"/hinatas-way"} component={HinatasWay} />
              <Route path={"/my-links"} component={MyLinks} />
              <Route path={"/team-goals"} component={TeamGoals} />
              <Route path={"/404"} component={NotFound} />
              <Route component={NotFound} />
            </Switch>
          </RouteTransitionWrapper>
        </DashboardLayout>
      </Route>
    </Switch>
  );
}

/**
 * PWAとしてホーム画面から起動した場合のみスプラッシュスクリーンを表示する。
 * ブラウザの通常アクセスでは表示しない（display-mode: standalone の判定）。
 */
function useSplash() {
  const isStandalone =
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true);

  const [showSplash, setShowSplash] = useState(isStandalone);
  const handleFinish = useCallback(() => setShowSplash(false), []);
  return { showSplash, handleFinish };
}

function App() {
  const { showSplash, handleFinish } = useSplash();

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable={true}>
        <TooltipProvider>
          <Toaster />
          <PageLoadingBar />
          {showSplash && <SplashScreen onFinish={handleFinish} duration={2000} />}
          <OfflineProvider>
            <OfflineQueueProvider>
              <Router />
            </OfflineQueueProvider>
          </OfflineProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
