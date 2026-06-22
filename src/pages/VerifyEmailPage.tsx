import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { FormMessage } from '../components/FormMessage';
import { useAuth } from '../auth/AuthContext';
import { getAuthErrorMessage } from '../auth/authErrors';
import { sendVerification } from '../auth/authService';

export function VerifyEmailPage() {
  const { user, authFromCache } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      setSuccess('Email de verificação enviado.');
    } catch (error) {
      setMessage(getAuthErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="Verificação"
      title="Confirme seu email."
      description="A verificação ajuda a manter seu acesso Granativa recuperável e confiável."
    >
      <div className="form-stack">
        <FormMessage>{message}</FormMessage>
        <FormMessage type="success">{success}</FormMessage>
        <button className="button button--primary" type="button" onClick={onSend} disabled={busy || !user || authFromCache}>
          Reenviar verificação
        </button>
        <Link className="button button--secondary" to="/app">
          Continuar
        </Link>
      </div>
    </AuthLayout>
  );
}
