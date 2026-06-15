import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { savePendingInvite } from '../auth/pendingInvite';
import { AuthLayout } from '../components/AuthLayout';

export function JoinInvitePage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (code) {
      savePendingInvite(code);
    }
  }, [code]);

  return (
    <AuthLayout
      eyebrow="Convite"
      title="Convite salvo para depois."
      description="A Zerou preservou este codigo para voce entrar no espaco compartilhado depois do login."
    >
      <div className="form-stack">
        <p className="notice">Codigo pendente: {code}</p>
        {user ? (
          <button className="button button--primary" type="button" onClick={() => navigate('/app/shared')}>
            Abrir espaco compartilhado
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
