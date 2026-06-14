import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { PublicOnlyRoute, RequireAuth, RequireOnboardingComplete } from './auth/routeGuards';
import { AppearanceSyncBridge } from './settings/AppearanceSyncBridge';
import { ThemeRuntime } from './theme/ThemeRuntime';
import { AppShell } from './layout/AppShell';
import { AppearanceSettingsPage } from './settings/AppearanceSettingsPage';
import { DashboardPage } from './pages/DashboardPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { JoinInvitePage } from './pages/JoinInvitePage';
import { LoginMethodsPage } from './settings/LoginMethodsPage';
import { LoginPage } from './pages/LoginPage';
import { OnboardingPage } from './onboarding/OnboardingPage';
import { PublicHomePage } from './pages/PublicHomePage';
import { RegisterPage } from './pages/RegisterPage';
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
