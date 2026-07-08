import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { FinanceDataProvider } from './finance/FinanceDataContext';
import { SharedDataProvider } from './shared/SharedDataContext';
import { LandingCss } from './landing/LandingCss';
import { PublicOnlyRoute, RequireAdmin, RequireAuth, RequireOnboardingComplete } from './auth/routeGuards';
import { useAuth } from './auth/AuthContext';
import { AppearanceSyncBridge } from './settings/AppearanceSyncBridge';
import { ThemeRuntime } from './theme/ThemeRuntime';
import { AppShell } from './layout/AppShell';
import { ScrollToTop } from './layout/ScrollToTop';
import { AppearanceSettingsPage } from './settings/AppearanceSettingsPage';
import { AccountsPage } from './pages/AccountsPage';
import { BillsPage } from './pages/BillsPage';
import { CardDetailPage } from './pages/CardDetailPage';
import { CardsPage } from './pages/CardsPage';
import { DashboardPage } from './pages/DashboardPage';
import { EditTransactionPage } from './pages/EditTransactionPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { GoalsPage } from './pages/GoalsPage';
import { InvoicePage } from './pages/InvoicePage';
import { JoinInvitePage } from './pages/JoinInvitePage';
import { LoginMethodsPage } from './settings/LoginMethodsPage';
import { LoginPage } from './pages/LoginPage';
import { NewTransactionPage } from './pages/NewTransactionPage';
import { OnboardingPage } from './onboarding/OnboardingPage';
import { ContactPage, FeaturesPage, HelpPage, SecurityPage } from './pages/PublicPages';
import { PrivacyPolicyPage, TermsPage } from './pages/LegalPages';
import { PrivacyCenterPage } from './pages/PrivacyCenterPage';
import { RecurringPage } from './pages/RecurringPage';
import { RegisterPage } from './pages/RegisterPage';
import { SearchPage } from './pages/SearchPage';
import { AdminPage } from './pages/AdminPage';
import { SharedSpacePage } from './pages/SharedSpacePage';
import { TransactionsPage } from './pages/TransactionsPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';

function RootRoute() {
  const { user, profile, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to={profile?.defaultWorkspaceId ? '/app' : '/app/onboarding'} replace />;
  return <LandingCss />;
}

export function App() {
  return (
    <AuthProvider>
      <ThemeRuntime />
      <AppearanceSyncBridge />
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<RootRoute />} />
        <Route path="/pricing" element={<Navigate to="/" replace />} />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/security" element={<SecurityPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/privacy-center" element={<PrivacyCenterPage />} />
        <Route path="/legal/terms" element={<TermsPage />} />
        <Route path="/legal/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/legal/cookies" element={<Navigate to="/legal/privacy" replace />} />
        <Route path="/legal/subprocessors" element={<Navigate to="/legal/privacy" replace />} />
        <Route path="/join/:code" element={<JoinInvitePage />} />
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        </Route>
        <Route element={<RequireAuth />}>
          <Route element={<RequireAdmin />}>
            <Route path="/admin" element={<AdminPage />} />
          </Route>
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/app" element={<AppShell />}>
            <Route path="onboarding" element={<OnboardingPage />} />
            <Route element={<RequireOnboardingComplete />}>
              <Route element={<FinanceDataProvider><SharedDataProvider><Outlet /></SharedDataProvider></FinanceDataProvider>}>
                <Route index element={<DashboardPage />} />
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="transactions" element={<TransactionsPage />} />
                <Route path="transactions/new" element={<NewTransactionPage />} />
                <Route path="transactions/:transactionId/edit" element={<EditTransactionPage />} />
                <Route path="accounts" element={<AccountsPage />} />
                <Route path="cards" element={<CardsPage />} />
                <Route path="cards/:cardId" element={<CardDetailPage />} />
                <Route path="cards/:cardId/invoices/:invoiceId" element={<InvoicePage />} />
                <Route path="bills" element={<BillsPage />} />
                <Route path="goals" element={<GoalsPage />} />
                <Route path="recurring" element={<RecurringPage />} />
                <Route path="search" element={<SearchPage />} />
                <Route path="shared" element={<SharedSpacePage />} />
                <Route path="settings/appearance" element={<AppearanceSettingsPage />} />
                <Route path="settings/billing" element={<Navigate to="/app/settings/appearance" replace />} />
                <Route path="settings/security/login-methods" element={<LoginMethodsPage />} />
              </Route>
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
