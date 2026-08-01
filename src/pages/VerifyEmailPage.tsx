import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { FormMessage } from '../components/FormMessage';
import { useAuth } from '../auth/AuthContext';
import { getAuthErrorMessage } from '../auth/authErrors';
import { sendVerification } from '../auth/authService';

export function VerifyEmailPage() {
  const { user, authFromCache } = useAuth();
  const navigate = useNavigate();
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(() => user?.emailVerified ?? false);

  const checkVerified = useCallback(() => {
    if (!user || authFromCache) return;
    user.reload().then(() => setVerified(user.emailVerified)).catch(() => {});
  }, [user, authFromCache]);

  // Poll: se o usuário abre o link de verificação em outro app, detecta sem reload manual
  useEffect(() => {
    if (verified || authFromCache) return;
    const interval = window.setInterval(checkVerified, 4000);
    return () => window.clearInterval(interval);
  }, [verified, authFromCache, checkVerified]);

  // Se verificou, redireciona automaticamente
  useEffect(() => {
    if (verified) {
      navigate('/app', { replace: true });
    }
  }, [verified, navigate]);

  async function onSend() {
    if (!user || authFromCache) {
      setMessage('Entre na Granativa para enviar a verificação.');
      return;
    }

    setBusy(true);
    setMessage(null);
    setSuccess(null);

    try {
      await sendVerification(user);
      setSuccess('Email de verificação reenviado. Confira sua caixa de entrada.');
    } catch (error) {
      setMessage(getAuthErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (!user || authFromCache) {
    return (
      <AuthLayout eyebrow="Verificação" title="Carregando..." description="Aguardando sua sessão Granativa.">
        <div className="form-stack" />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="Verificação"
      title={verified ? 'Email verificado!' : 'Confirme seu email.'}
      description={
        verified
          ? 'Sua conta está confirmada. Pronto para usar a Granativa.'
          : `Enviamos um link para ${user.email ?? 'seu email'}. Clique nele para confirmar sua conta.`
      }
    >
      <div className="form-stack">
        <FormMessage>{message}</FormMessage>
        <FormMessage type="success">{success}</FormMessage>
        {!verified && (
          <>
            <button className="button button--primary" type="button" onClick={onSend} disabled={busy}>
              Reenviar email
            </button>
            <button className="button button--secondary" type="button" onClick={checkVerified} disabled={busy}>
              Já verifiquei
            </button>
          </>
        )}
        {verified && (
          <Link className="button button--primary" to="/app">
            Ir para o app
          </Link>
        )}
      </div>
    </AuthLayout>
  );
}
