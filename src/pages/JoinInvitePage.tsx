import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { savePendingInvite } from '../auth/pendingInvite';

export function JoinInvitePage() {
  const { code } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (code) {
      savePendingInvite(code);
    }
  }, [code]);

  return (
    <AuthLayout
      eyebrow="Convite"
      title="Convite salvo para depois."
      description="O espaço compartilhado funcional entra em uma fase posterior, mas a Zerou já preserva o código durante a autenticação."
    >
      <div className="form-stack">
        <p className="notice">Código pendente: {code}</p>
        <button className="button button--primary" type="button" onClick={() => navigate('/login')}>
          Entrar e manter convite
        </button>
        <Link className="button button--secondary" to="/register">
          Criar conta
        </Link>
      </div>
    </AuthLayout>
  );
}
