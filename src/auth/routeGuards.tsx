import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="public-page">Carregando Zerou...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ returnTo: location.pathname }} />;
  }

  return <Outlet />;
}

export function RequireOnboardingComplete() {
  const { profile, profileLoading } = useAuth();
  const location = useLocation();

  if (profileLoading) {
    return <div className="public-page">Preparando seu espaço Zerou...</div>;
  }

  if (!profile?.defaultWorkspaceId && location.pathname !== '/app/onboarding') {
    return <Navigate to="/app/onboarding" replace />;
  }

  return <Outlet />;
}

export function PublicOnlyRoute() {
  const { user, loading, profile } = useAuth();

  if (loading) {
    return <div className="public-page">Carregando Zerou...</div>;
  }

  if (user) {
    return <Navigate to={profile?.defaultWorkspaceId ? '/app' : '/app/onboarding'} replace />;
  }

  return <Outlet />;
}
