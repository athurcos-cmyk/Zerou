import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { clearPendingInvite, savePendingInvite } from '../auth/pendingInvite';
import { AuthLayout } from '../components/AuthLayout';
import { acceptCoupleInvite, previewCoupleInvite } from '../shared/sharedService';
import type { CoupleInvite } from '../types/contracts';
import { getUserFacingErrorMessage } from '../utils/userFacingError';

export function JoinInvitePage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const hasFoundation = Boolean(profile?.defaultWorkspaceId);

  const [preview, setPreview] = useState<CoupleInvite | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (code) savePendingInvite(code);
  }, [code]);

  useEffect(() => {
    if (!code || !user || !hasFoundation || preview || accepted) return;
    setLoading(true);
    setError(null);
    previewCoupleInvite(code)
      .then(setPreview)
      .catch((err) => setError(getUserFacingErrorMessage(err, 'Convite não encontrado ou expirado.')))
      .finally(() => setLoading(false));
  }, [code, user, hasFoundation, preview, accepted]);

  async function handleAccept() {
    if (!user || !code) return;
    setLoading(true);
    setError(null);
    try {
      await acceptCoupleInvite(code, user.uid, profile?.name ?? user.displayName ?? '', true);
      clearPendingInvite();
      setAccepted(true);
    } catch (err) {
      setError(getUserFacingErrorMessage(err, 'Não foi possível aceitar o convite.'));
    } finally {
      setLoading(false);
    }
  }

  if (accepted) {
    return (
      <AuthLayout
        eyebrow="Convite aceito"
        title="Vocês estão conectados!"
        description="Você entrou no espaço compartilhado. Agora podem organizar as finanças juntos."
      >
        <div className="form-stack">
          <button className="button button--primary" type="button" onClick={() => navigate('/app/shared')}>
            Abrir espaço compartilhado
          </button>
        </div>
      </AuthLayout>
    );
  }

  if (!user) {
    const returnTo = `/join/${code ?? ''}`;
    return (
      <AuthLayout
        eyebrow="Convite"
        title="Entre para aceitar o convite."
        description="Crie uma conta ou entre na Zerou para organizar as finanças juntos. O convite fica salvo."
      >
        <div className="form-stack">
          <button className="button button--primary" type="button" onClick={() => navigate('/login', { state: { returnTo } })}>
            Entrar e manter convite
          </button>
          <button className="button button--secondary" type="button" onClick={() => navigate('/register', { state: { returnTo } })}>
            Criar conta
          </button>
        </div>
      </AuthLayout>
    );
  }

  if (!hasFoundation) {
    return (
      <AuthLayout
        eyebrow="Convite"
        title="Quase lá!"
        description="Configure seu espaço pessoal antes de entrar no espaço compartilhado. O convite fica salvo."
      >
        <div className="form-stack">
          <button className="button button--primary" type="button" onClick={() => navigate('/app/onboarding')}>
            Concluir cadastro
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="Convite"
      title="Você foi convidado."
      description="Alguém quer organizar as finanças juntos com você na Zerou."
    >
      <div className="form-stack">
        {loading && <p className="text-secondary">Verificando convite...</p>}

        {error && (
          <>
            <p className="notice notice--error">{error}</p>
            <button className="button button--secondary" type="button" onClick={() => navigate('/app/shared')}>
              Ir para o espaço compartilhado
            </button>
          </>
        )}

        {preview && !error && (
          <>
            <div className="notice notice--success">
              <strong>{preview.workspaceName}</strong>
              <br />
              <span>Expira em {preview.expiresAt.toDate().toLocaleString('pt-BR')}</span>
            </div>
            <button className="button button--primary" type="button" disabled={loading} onClick={() => void handleAccept()}>
              Entrar no espaço compartilhado
            </button>
            <button className="button button--ghost" type="button" onClick={() => navigate('/app/shared')}>
              Agora não
            </button>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
