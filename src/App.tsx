import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { AccountDeletedScreen } from './auth/AccountDeletedScreen';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { FinanceDataProvider } from './finance/FinanceDataContext';
import { SharedDataProvider } from './shared/SharedDataContext';
import { LandingCss } from './landing/LandingCss';
import { PublicOnlyRoute, RequireAdmin, RequireAuth, RequireOnboardingComplete } from './auth/routeGuards';
import { useAuth } from './auth/AuthContext';
import { AppearanceSyncBridge } from './settings/AppearanceSyncBridge';
import { ThemeRuntime } from './theme/ThemeRuntime';
import { AppShell } from './layout/AppShell';
import { ScrollToTop } from './layout/ScrollToTop';
import { DashboardPage } from './pages/DashboardPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { NewTransactionPage } from './pages/NewTransactionPage';
import { EditTransactionPage } from './pages/EditTransactionPage';
import { AccountsPage } from './pages/AccountsPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';

const SearchPage = lazy(() => import('./pages/SearchPage').then((m) => ({ default: m.SearchPage })));
const AssistantPage = lazy(() => import('./pages/AssistantPage').then((m) => ({ default: m.AssistantPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })));
const CardsPage = lazy(() => import('./pages/CardsPage').then((m) => ({ default: m.CardsPage })));
const CardDetailPage = lazy(() => import('./pages/CardDetailPage').then((m) => ({ default: m.CardDetailPage })));
const InvoicePage = lazy(() => import('./pages/InvoicePage').then((m) => ({ default: m.InvoicePage })));
const BillsPage = lazy(() => import('./pages/BillsPage').then((m) => ({ default: m.BillsPage })));
const ReceivablesPage = lazy(() => import('./pages/ReceivablesPage').then((m) => ({ default: m.ReceivablesPage })));
const GoalsPage = lazy(() => import('./pages/GoalsPage').then((m) => ({ default: m.GoalsPage })));
const GoalDetailPage = lazy(() => import('./pages/GoalDetailPage').then((m) => ({ default: m.GoalDetailPage })));
const SharedSpacePage = lazy(() => import('./pages/SharedSpacePage').then((m) => ({ default: m.SharedSpacePage })));
const OnboardingPage = lazy(() => import('./onboarding/OnboardingPage').then((m) => ({ default: m.OnboardingPage })));
const AppearanceSettingsPage = lazy(() => import('./settings/AppearanceSettingsPage').then((m) => ({ default: m.AppearanceSettingsPage })));
const LoginMethodsPage = lazy(() => import('./settings/LoginMethodsPage').then((m) => ({ default: m.LoginMethodsPage })));
const PaydaySettingsPage = lazy(() => import('./settings/PaydaySettingsPage').then((m) => ({ default: m.PaydaySettingsPage })));
const OnboardingAnswersSettingsPage = lazy(() => import('./settings/OnboardingAnswersSettingsPage').then((m) => ({ default: m.OnboardingAnswersSettingsPage })));
const WhatsAppLinkPage = lazy(() => import('./settings/WhatsAppLinkPage').then((m) => ({ default: m.WhatsAppLinkPage })));
const JoinInvitePage = lazy(() => import('./pages/JoinInvitePage').then((m) => ({ default: m.JoinInvitePage })));
const FeaturesPage = lazy(() => import('./pages/PublicPages').then((m) => ({ default: m.FeaturesPage })));
const SecurityPage = lazy(() => import('./pages/PublicPages').then((m) => ({ default: m.SecurityPage })));
const HelpPage = lazy(() => import('./pages/PublicPages').then((m) => ({ default: m.HelpPage })));
const ContactPage = lazy(() => import('./pages/PublicPages').then((m) => ({ default: m.ContactPage })));
const PrivacyCenterPage = lazy(() => import('./pages/PrivacyCenterPage').then((m) => ({ default: m.PrivacyCenterPage })));
const TermsPage = lazy(() => import('./pages/LegalPages').then((m) => ({ default: m.TermsPage })));
const PrivacyPolicyPage = lazy(() => import('./pages/LegalPages').then((m) => ({ default: m.PrivacyPolicyPage })));
const DataDeletionPage = lazy(() => import('./pages/LegalPages').then((m) => ({ default: m.DataDeletionPage })));

function RootRoute() {
  const { user, profile, loading } = useAuth();
  if (loading) return <div className="public-page">Carregando Granativa...</div>;
  if (user) return <Navigate to={profile?.defaultWorkspaceId ? '/app' : '/app/onboarding'} replace />;
  return <LandingCss />;
}

function LazyFallback() {
  return <div className="public-page">Carregando…</div>;
}

/**
 * Conta excluída não cai em rota nenhuma: substitui o app inteiro pela explicação. Precisa
 * ficar ACIMA das `Routes` porque, sem sessão, os guards mandariam pro /login — e o problema
 * não é falta de login, é que a conta não existe mais.
 */
function AppRoutesOrDeletedNotice({ children }: { children: ReactNode }) {
  const { accountDeleted } = useAuth();
  if (accountDeleted) return <AccountDeletedScreen />;
  return <>{children}</>;
}

export function App() {
  return (
    <AuthProvider>
      <ThemeRuntime />
      <AppearanceSyncBridge />
      <ScrollToTop />

      <AppErrorBoundary>
      <AppRoutesOrDeletedNotice>
      <Routes>
        <Route path="/" element={<RootRoute />} />
        <Route path="/pricing" element={<Navigate to="/" replace />} />
        <Route path="/features" element={<Suspense fallback={<LazyFallback />}><FeaturesPage /></Suspense>} />
        <Route path="/security" element={<Suspense fallback={<LazyFallback />}><SecurityPage /></Suspense>} />
        <Route path="/help" element={<Suspense fallback={<LazyFallback />}><HelpPage /></Suspense>} />
        <Route path="/contact" element={<Suspense fallback={<LazyFallback />}><ContactPage /></Suspense>} />
        <Route path="/privacy-center" element={<Suspense fallback={<LazyFallback />}><PrivacyCenterPage /></Suspense>} />
        <Route path="/legal/terms" element={<Suspense fallback={<LazyFallback />}><TermsPage /></Suspense>} />
        <Route path="/legal/privacy" element={<Suspense fallback={<LazyFallback />}><PrivacyPolicyPage /></Suspense>} />
        <Route path="/legal/data-deletion" element={<Suspense fallback={<LazyFallback />}><DataDeletionPage /></Suspense>} />
        <Route path="/legal/cookies" element={<Navigate to="/legal/privacy" replace />} />
        <Route path="/legal/subprocessors" element={<Navigate to="/legal/privacy" replace />} />
        <Route path="/join/:code" element={<Suspense fallback={<LazyFallback />}><JoinInvitePage /></Suspense>} />
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        </Route>
        <Route element={<RequireAuth />}>
          <Route element={<RequireAdmin />}>
            <Route path="/admin" element={<Suspense fallback={<LazyFallback />}><AdminPage /></Suspense>} />
          </Route>
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/app" element={<AppShell />}>
            <Route path="onboarding" element={<Suspense fallback={<LazyFallback />}><OnboardingPage /></Suspense>} />
            <Route element={<RequireOnboardingComplete />}>
              <Route element={<FinanceDataProvider><SharedDataProvider><Outlet /></SharedDataProvider></FinanceDataProvider>}>
                <Route index element={<DashboardPage />} />
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="transactions" element={<TransactionsPage />} />
                <Route path="transactions/new" element={<NewTransactionPage />} />
                <Route path="transactions/:transactionId/edit" element={<EditTransactionPage />} />
                <Route path="accounts" element={<AccountsPage />} />
                <Route path="cards" element={<Suspense fallback={<LazyFallback />}><CardsPage /></Suspense>} />
                <Route path="cards/:cardId" element={<Suspense fallback={<LazyFallback />}><CardDetailPage /></Suspense>} />
                <Route path="cards/:cardId/invoices/:invoiceId" element={<Suspense fallback={<LazyFallback />}><InvoicePage /></Suspense>} />
                <Route path="bills" element={<Suspense fallback={<LazyFallback />}><BillsPage /></Suspense>} />
                <Route path="receivables" element={<Suspense fallback={<LazyFallback />}><ReceivablesPage /></Suspense>} />
                <Route path="goals" element={<Suspense fallback={<LazyFallback />}><GoalsPage /></Suspense>} />
                <Route path="goals/:goalId" element={<Suspense fallback={<LazyFallback />}><GoalDetailPage /></Suspense>} />
                {/* Patrimônio Líquido desativado (2026-07-16) — redireciona em vez de remover, pra não deixar link morto se alguém tiver a URL salva/favoritada. */}
                <Route path="net-worth" element={<Navigate to="/app/dashboard" replace />} />
                <Route path="search" element={<Suspense fallback={<LazyFallback />}><SearchPage /></Suspense>} />
                <Route path="shared" element={<Suspense fallback={<LazyFallback />}><SharedSpacePage /></Suspense>} />
                <Route path="assistant" element={<Suspense fallback={<LazyFallback />}><AssistantPage /></Suspense>} />
                <Route path="settings/appearance" element={<Suspense fallback={<LazyFallback />}><AppearanceSettingsPage /></Suspense>} />
                <Route path="settings/billing" element={<Navigate to="/app/settings/appearance" replace />} />
                <Route path="settings/payday" element={<Suspense fallback={<LazyFallback />}><PaydaySettingsPage /></Suspense>} />
                <Route path="settings/onboarding" element={<Suspense fallback={<LazyFallback />}><OnboardingAnswersSettingsPage /></Suspense>} />
                <Route path="settings/security/login-methods" element={<Suspense fallback={<LazyFallback />}><LoginMethodsPage /></Suspense>} />
                <Route path="settings/whatsapp" element={<Suspense fallback={<LazyFallback />}><WhatsAppLinkPage /></Suspense>} />
              </Route>
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </AppRoutesOrDeletedNotice>
      </AppErrorBoundary>
    </AuthProvider>
  );
}
