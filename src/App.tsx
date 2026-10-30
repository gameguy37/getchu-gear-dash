import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { OfflineProvider } from "@/contexts/OfflineContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import NotificationListener from "@/components/NotificationListener";
import { AppLayout } from "@/components/AppLayout";
import Login from "./pages/Login";
import PendingApproval from "./pages/PendingApproval";
import Index from "./pages/Index";
import JobManagement from "./pages/JobManagement";
import AssetManagement from "./pages/AssetManagement";
import MeemawKits from "./pages/MeemawKits";
import MeemawKitDetail from "./pages/MeemawKitDetail";
import SeaOfLostItems from "./pages/SeaOfLostItems";
import BoulevardOfBrokenItems from "./pages/BoulevardOfBrokenItems";
import OpsManagement from "./pages/OpsManagement";
import Leaderboard from "./pages/Leaderboard";
import ClientDirectory from "./pages/ClientDirectory";
import ClientPortalPublic from "./pages/ClientPortalPublic";

import MacBookUpdates from "./pages/MacBookUpdates";
import Reporting from "./pages/Reporting";
import DataExport from "./pages/DataExport";
import ResetPassword from "./pages/ResetPassword";
import StubPage from "./pages/StubPage";
import QRScanner from "./pages/QRScanner";
import LiveDispatch from "./pages/LiveDispatch";
import GearCheckout from "./pages/GearCheckout";
import AdminSettings from "./pages/AdminSettings";
import AdminCalendar from "./pages/AdminCalendar";
import OperatorCalendar from "./pages/OperatorCalendar";
import ClientRequests from "./pages/ClientRequests";
import Messages from "./pages/Messages";
import Install from "./pages/Install";
import NotFound from "./pages/NotFound";
import OAuthConsent from "./pages/OAuthConsent";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "react-router-dom";

const queryClient = new QueryClient();

const MANAGER_ROUTES = ["/jobs", "/assets", "/meemaw-kits", "/missing", "/broken", "/mac-updates", "/qr-hub", "/ops", "/clients", "/reporting", "/data-export", "/live-dispatch", "/settings", "/calendar", "/client-requests"];
// /messages is available to everyone

function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, loading, role, accessDenied, employee } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground animate-pulse">Loading…</p>
      </div>
    );
  }

  if (!session) return <Login accessDenied={accessDenied} />;
  if (!employee) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 p-6 text-center">
        <p className="text-base font-semibold text-foreground">We couldn't load your account just now.</p>
        <p className="text-sm text-muted-foreground max-w-sm">The connection is slow or waking up. Give it a second and try again.</p>
        <Button className="h-12 rounded-full px-8" onClick={() => window.location.reload()}>Try Again</Button>
      </div>
    );
  }
  if (role === "pending") return <PendingApproval />;
  return <>{children}</>;
}

function RoleGuard({ children }: { children: React.ReactNode }) {
  const { role, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;

  if (role === "operator" && MANAGER_ROUTES.some((r) => location.pathname.startsWith(r))) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner position="top-right" />
      <AuthProvider>
        <OfflineProvider>
        <BrowserRouter>
        <NotificationProvider>
          <NotificationListener />
          <Routes>
            {/* Password reset - standalone, no auth required */}
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* OAuth consent screen for MCP / other OAuth clients */}
            <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />

            {/* Public client portal - no auth required */}
            <Route path="/portal/:token" element={<ClientPortalPublic />} />


            {/* Main app with layout + auth */}
            <Route
              path="*"
              element={
                <AuthGate>
                  <AppLayout>
                    <RoleGuard>
                      <Routes>
                        <Route path="/" element={<Index />} />
                        <Route path="/jobs" element={<JobManagement />} />
                        <Route path="/calendar" element={<AdminCalendar />} />
                        <Route path="/assets" element={<AssetManagement />} />
                        <Route path="/meemaw-kits" element={<MeemawKits />} />
                        <Route path="/meemaw-kits/:id" element={<MeemawKitDetail />} />
                        <Route path="/missing" element={<SeaOfLostItems />} />
                        <Route path="/broken" element={<BoulevardOfBrokenItems />} />
                        <Route path="/scanner" element={<QRScanner />} />
                        <Route path="/mac-updates" element={<MacBookUpdates />} />
                        <Route path="/reporting" element={<Reporting />} />
                        <Route path="/data-export" element={<DataExport />} />
                        <Route path="/live-dispatch" element={<LiveDispatch />} />
                        <Route path="/live-dispatch/:jobId" element={<LiveDispatch />} />
                        <Route path="/settings" element={<AdminSettings />} />
                        <Route path="/ops" element={<OpsManagement />} />
                        <Route path="/qr-hub" element={<StubPage title="QR Hub" />} />
                        <Route path="/clients" element={<ClientDirectory />} />
                        <Route path="/leaderboard" element={<Leaderboard />} />
                        
                        <Route path="/client-requests" element={<ClientRequests />} />
                        <Route path="/messages" element={<Messages />} />
                        <Route path="/install" element={<Install />} />
                        {/* scanner route moved above */}
                        <Route path="/active-timers" element={<StubPage title="Active Timers" />} />
                        <Route path="/my-calendar" element={<OperatorCalendar />} />
                        <Route path="/gear-checkout/:id" element={<GearCheckout />} />
                        {/* gear checkout is now inline in OperatorHome dialog */}
                        <Route path="/points" element={<Leaderboard />} />
                        {/* Legacy redirects */}
                        <Route path="/users" element={<Navigate to="/ops" replace />} />
                        <Route path="/crew" element={<Navigate to="/ops" replace />} />
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </RoleGuard>
                  </AppLayout>
                </AuthGate>
              }
            />
          </Routes>
        </NotificationProvider>
        </BrowserRouter>
        </OfflineProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
