import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useAccountDeletion } from '../settings/accountDeletion.store';

const ADMIN_EMAIL = 'a.thurcos@gmail.com';

export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="public-page">Carregando Granativa...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ returnTo: location.pathname }} />;
  }

  return <Outlet />;
}

export function RequireOnboardingComplete() {
  const { profile, profileLoading } = useAuth();
  const isDeletingAccount = useAccountDeletion((state) => state.isDeleting);
  const location = useLocation();

  if (profileLoading) {
    return <div className="public-page">Preparando seu espaço Granativa...</div>;
  }

  // Exclusão de conta apaga `users/{uid}` antes de deslogar (ordem deliberada, ver
  // accountDeletionService.ts) — o `onSnapshot` ao vivo em AuthContext.tsx zera `profile`
  // na hora, e sem essa guarda a pessoa cairia aqui no meio da própria exclusão, achando
  // que virou conta nova.
  if (!profile?.defaultWorkspaceId && location.pathname !== '/app/onboarding' && !isDeletingAccount) {
    return <Navigate to="/app/onboarding" replace />;
  }

  return <Outlet />;
}

export function RequireAdmin() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user || user.email !== ADMIN_EMAIL) return <Navigate to="/app" replace />;
  return <Outlet />;
}

export function PublicOnlyRoute() {
  const { user, loading, profile } = useAuth();

  if (loading) {
    return <div className="public-page">Carregando Granativa...</div>;
  }

  if (user) {
    return <Navigate to={profile?.defaultWorkspaceId ? '/app' : '/app/onboarding'} replace />;
  }

  return <Outlet />;
}
