import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import Settings from "./pages/Settings";
import Auth from "./pages/Auth";
import Admin from "./pages/Admin";
import TemplateEditorPage from "./pages/TemplateEditor";
import CreditReports from "./pages/CreditReports";
import CreditReportDashboard from "./components/CreditReportDashboard";
import NotFound from "./pages/NotFound";
import { useAuth } from "@/hooks/useAuth";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-dashboard flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/auth" replace />;
  }
  
  return <>{children}</>;
};

const App = () => {
  
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <div className="min-h-screen">
            <ImpersonationBanner />
            <div className="[body:has(.impersonation-banner)]:pt-10">
              <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/" element={
                <ProtectedRoute>
                  <Index />
                </ProtectedRoute>
              } />
              <Route path="/settings" element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              } />
              <Route path="/admin" element={
                <ProtectedRoute>
                  <Admin />
                </ProtectedRoute>
              } />
              <Route path="/admin/templates/editor/:templateId?" element={
                <ProtectedRoute>
                  <TemplateEditorPage />
                </ProtectedRoute>
              } />
              <Route path="/credit-report" element={
                <ProtectedRoute>
                  <div className="min-h-screen w-full">
                    <CreditReports />
                  </div>
                </ProtectedRoute>
              } />
              <Route path="/credit-report-dashboard" element={
                <ProtectedRoute>
                  <div className="min-h-screen w-full">
                    <CreditReportDashboard />
                  </div>
                </ProtectedRoute>
              } />
              <Route path="/credit-reports" element={<Navigate to="/credit-report" replace />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
              </Routes>
            </div>
          </div>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
