import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { PublicOnlyRoute, RequireAuth, RequireOnboardingComplete } from './auth/routeGuards';
import { AppearanceSyncBridge } from './settings/AppearanceSyncBridge';
import { ThemeRuntime } from './theme/ThemeRuntime';
import { AppShell } from './layout/AppShell';
import { AppearanceSettingsPage } from './settings/AppearanceSettingsPage';
import { AccountsPage } from './pages/AccountsPage';
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
import { PublicHomePage } from './pages/PublicHomePage';
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
              <Route path="settings/security/login-methods" element={<LoginMethodsPage />} />
            </Route>
          </Route>
        </Route>
        <Route path="/pricing" element={<PublicPhasePlaceholder title="Pricing" />} />
        <Route path="/features" element={<PublicPhasePlaceholder title="Funcionalidades" />} />
        <Route path="/security" element={<PublicPhasePlaceholder title="Segurança" />} />
        <Route path="/help" element={<PublicPhasePlaceholder title="Ajuda" />} />
        <Route path="/contact" element={<PublicPhasePlaceholder title="Contato" />} />
        <Route path="/legal/terms" element={<PublicPhasePlaceholder title="Termos" />} />
        <Route path="/legal/privacy" element={<PublicPhasePlaceholder title="Privacidade" />} />
        <Route path="/legal/cookies" element={<PublicPhasePlaceholder title="Cookies" />} />
        <Route path="/legal/subprocessors" element={<PublicPhasePlaceholder title="Subprocessadores" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}

function PublicPhasePlaceholder({ title }: { title: string }) {
  return (
    <main className="public-page">
      <section className="surface surface-pad empty-panel">
        <div className="empty-panel-inner">
          <p className="eyebrow">Zerou</p>
          <h1 className="page-title">{title}</h1>
          <p className="page-description">
            Esta rota pública foi reservada na fundação. O conteúdo completo entra na fase de lançamento.
          </p>
        </div>
      </section>
    </main>
  );
}
