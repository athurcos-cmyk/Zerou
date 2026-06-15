import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { savePendingInvite } from '../auth/pendingInvite';
import { AuthLayout } from '../components/AuthLayout';

export function JoinInvitePage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const hasFoundation = Boolean(profile?.defaultWorkspaceId);

  useEffect(() => {
    if (code) {
      savePendingInvite(code);
    }
  }, [code]);

  return (
    <AuthLayout
      eyebrow="Convite"
      title="Convite salvo para depois."
      description="Para usar o espaço compartilhado, primeiro entre na Zerou e termine seu espaço pessoal."
    >
      <div className="form-stack">
        <p className="notice">Código pendente: {code}</p>
        {user ? (
          <button className="button button--primary" type="button" onClick={() => navigate(hasFoundation ? '/app/shared' : '/app/onboarding')}>
            {hasFoundation ? 'Abrir espaço compartilhado' : 'Concluir cadastro para usar convite'}
          </button>
        ) : (
          <>
            <button className="button button--primary" type="button" onClick={() => navigate('/login')}>
              Entrar e manter convite
            </button>
            <Link className="button button--secondary" to="/register">
              Criar conta
            </Link>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
