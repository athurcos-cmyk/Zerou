import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { PublicOnlyRoute, RequireAuth, RequireOnboardingComplete } from './auth/routeGuards';
import { AppearanceSyncBridge } from './settings/AppearanceSyncBridge';
import { ThemeRuntime } from './theme/ThemeRuntime';
import { CookieConsentBanner } from './privacy/CookieConsentBanner';
import { AppShell } from './layout/AppShell';
import { AppearanceSettingsPage } from './settings/AppearanceSettingsPage';
import { AccountsPage } from './pages/AccountsPage';
import { BillingSettingsPage } from './pages/BillingSettingsPage';
import { BillsPage } from './pages/BillsPage';
import { CardDetailPage } from './pages/CardDetailPage';
import { CardsPage } from './pages/CardsPage';
import { DashboardPage } from './pages/DashboardPage';
import { EditTransactionPage } from './pages/EditTransactionPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { InvoicePage } from './pages/InvoicePage';
import { JoinInvitePage } from './pages/JoinInvitePage';
import { LoginMethodsPage } from './settings/LoginMethodsPage';
import { LoginPage } from './pages/LoginPage';
import { NewTransactionPage } from './pages/NewTransactionPage';
import { OnboardingPage } from './onboarding/OnboardingPage';
import { ContactPage, FeaturesPage, HelpPage, SecurityPage } from './pages/PublicPages';
import { PublicHomePage } from './pages/PublicHomePage';
import { CookiePolicyPage, PrivacyPolicyPage, SubprocessorsPage, TermsPage } from './pages/LegalPages';
import { PricingPage } from './pages/PricingPage';
import { PrivacyCenterPage } from './pages/PrivacyCenterPage';
import { RecurringPage } from './pages/RecurringPage';
import { RegisterPage } from './pages/RegisterPage';
import { SearchPage } from './pages/SearchPage';
import { SharedSpacePage } from './pages/SharedSpacePage';
import { TransactionsPage } from './pages/TransactionsPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';

export function App() {
  return (
    <AuthProvider>
      <ThemeRuntime />
      <AppearanceSyncBridge />
      <Routes>
        <Route path="/" element={<PublicHomePage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/security" element={<SecurityPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/privacy-center" element={<PrivacyCenterPage />} />
        <Route path="/legal/terms" element={<TermsPage />} />
        <Route path="/legal/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/legal/cookies" element={<CookiePolicyPage />} />
        <Route path="/legal/subprocessors" element={<SubprocessorsPage />} />
        <Route path="/join/:code" element={<JoinInvitePage />} />
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        </Route>
        <Route element={<RequireAuth />}>
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/app" element={<AppShell />}>
            <Route path="onboarding" element={<OnboardingPage />} />
            <Route element={<RequireOnboardingComplete />}>
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
              <Route path="recurring" element={<RecurringPage />} />
              <Route path="search" element={<SearchPage />} />
              <Route path="shared" element={<SharedSpacePage />} />
              <Route path="settings/appearance" element={<AppearanceSettingsPage />} />
              <Route path="settings/billing" element={<BillingSettingsPage />} />
              <Route path="settings/security/login-methods" element={<LoginMethodsPage />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <CookieConsentBanner />
    </AuthProvider>
  );
}
