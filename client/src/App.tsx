import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { useState, useCallback } from "react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Dashboard from "./pages/Dashboard";
import RecordInput from "./pages/RecordInput";
import PatientList from "./pages/PatientList";
import Schedule from "./pages/Schedule";
import Tasks from "./pages/Tasks";
import Admin from "./pages/Admin";
import Login from "./pages/Login";
import Setup from "./pages/Setup";
import DashboardLayout from "./components/DashboardLayout";
import SplashScreen from "./components/SplashScreen";

function Router() {
  return (
    <Switch>
      {/* 認証不要ページ */}
      <Route path="/login" component={Login} />
      <Route path="/setup" component={Setup} />

      {/* 認証が必要なページ（DashboardLayoutが未認証時にリダイレクト） */}
      <Route>
        <DashboardLayout>
          <Switch>
            <Route path={"/"} component={Dashboard} />
            <Route path={"/record"} component={RecordInput} />
            <Route path={"/patients"} component={PatientList} />
            <Route path={"/schedule"} component={Schedule} />
            <Route path={"/tasks"} component={Tasks} />
            <Route path={"/admin"} component={Admin} />
            <Route path={"/404"} component={NotFound} />
            <Route component={NotFound} />
          </Switch>
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
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          {showSplash && <SplashScreen onFinish={handleFinish} duration={2000} />}
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
