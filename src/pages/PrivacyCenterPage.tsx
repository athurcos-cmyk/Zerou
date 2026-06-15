import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Download, Eraser, LogOut, MailMinus, Pencil, Trash2, Users } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { logout } from '../auth/authService';
import { Seo } from '../components/Seo';
import { FormMessage } from '../components/FormMessage';
import { createPrivacyRequest } from '../privacy/privacyRequests';
import type { PrivacyRequestType } from '../types/contracts';
import { PublicLayout } from './PublicLayout';

const requestActions: Array<{
  type: PrivacyRequestType;
  title: string;
  text: string;
  icon: ReactNode;
}> = [
  {
    type: 'correction',
    title: 'Corrigir perfil',
    text: 'Registre um pedido para corrigir dados de perfil que ainda não estejam editáveis pelo app.',
    icon: <Pencil size={22} aria-hidden="true" />
  },
  {
    type: 'export',
    title: 'Solicitar exportação',
    text: 'Cria um protocolo para exportação dos dados associados à sua conta.',
    icon: <Download size={22} aria-hidden="true" />
  },
  {
    type: 'deletion',
    title: 'Solicitar exclusão',
    text: 'Cria um protocolo para exclusão de conta e dados, sujeito às retenções legais aplicáveis.',
    icon: <Trash2 size={22} aria-hidden="true" />
  },
  {
    type: 'marketing_revocation',
    title: 'Revogar marketing',
    text: 'Registra a retirada de consentimento para comunicações de marketing.',
    icon: <MailMinus size={22} aria-hidden="true" />
  }
];

export function PrivacyCenterPage() {
  const { user, loading } = useAuth();
  const [message, setMessage] = useState<{ type: 'success' | 'danger'; text: string } | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  async function submitRequest(type: PrivacyRequestType, notes: string) {
    if (!user) {
      setMessage({ type: 'danger', text: 'Entre na Zerou para registrar uma solicitação de privacidade vinculada à sua conta.' });
      return;
    }

    setLoadingAction(type);
    setMessage(null);

    try {
      const requestId = await createPrivacyRequest({
        userId: user.uid,
        email: user.email,
        type,
        notes
      });
      setMessage({ type: 'success', text: `Solicitação registrada: ${requestId}.` });
    } catch {
      setMessage({ type: 'danger', text: 'Não foi possível registrar a solicitação agora. Tente novamente em instantes.' });
    } finally {
      setLoadingAction(null);
    }
  }

  async function clearLocalCache() {
    setLoadingAction('cache_help');
    setMessage(null);

    try {
      if (user) {
        await createPrivacyRequest({
          userId: user.uid,
          email: user.email,
          type: 'cache_help',
          notes: 'Usuario solicitou limpeza do cache local pelo Centro de Privacidade.'
        });
        await logout({ clearLocalCache: true });
        return;
      }

      window.localStorage.clear();
      setMessage({ type: 'success', text: 'Preferências locais deste navegador foram removidas.' });
    } catch {
      setMessage({ type: 'danger', text: 'Não foi possível limpar o cache local automaticamente neste dispositivo.' });
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <PublicLayout>
      <Seo
        title="Centro de privacidade"
        description="Gerencie cache local e solicitações LGPD da sua conta Zerou."
        path="/privacy-center"
        robots="noindex,nofollow"
      />
      <section className="public-section privacy-center">
        <p className="eyebrow">Centro de privacidade</p>
        <h1 className="marketing-title">Controle seus dados e preferências.</h1>
        <p className="marketing-copy">
          A Zerou usa armazenamento local necessário para login, tema e funcionamento no celular. Solicitações LGPD criam um
          protocolo quando você está logado.
        </p>

        {message ? <FormMessage type={message.type}>{message.text}</FormMessage> : null}

        {!loading && !user ? (
          <div className="notice">
            <CheckCircle2 size={18} aria-hidden="true" />
            Para criar uma solicitação vinculada à sua conta, entre na Zerou. Preferências locais deste navegador podem ser
            removidas sem login.
          </div>
        ) : null}

        <div className="privacy-action-grid">
          {requestActions.map((action) => (
            <article className="surface surface-pad privacy-action-card" key={action.type}>
              <span className="empty-icon">{action.icon}</span>
              <h2>{action.title}</h2>
              <p>{action.text}</p>
              <button
                className="button button--secondary"
                type="button"
                disabled={loadingAction === action.type}
                onClick={() => void submitRequest(action.type, action.text)}
              >
                Registrar pedido
              </button>
            </article>
          ))}
          <article className="surface surface-pad privacy-action-card">
            <span className="empty-icon">
              <Eraser size={22} aria-hidden="true" />
            </span>
            <h2>Remover cache local</h2>
            <p>Limpa dados locais deste dispositivo. Se você estiver logado, a Zerou também registra um protocolo.</p>
            <button className="button button--secondary" type="button" disabled={loadingAction === 'cache_help'} onClick={() => void clearLocalCache()}>
              Limpar cache local
            </button>
          </article>
          <article className="surface surface-pad privacy-action-card">
            <span className="empty-icon">
              <Users size={22} aria-hidden="true" />
            </span>
            <h2>Sair do espaço compartilhado</h2>
            <p>Essa ação fica dentro do app para preservar o contexto da sua conta e o histórico de segurança.</p>
            <Link className="button button--secondary" to="/app/shared">
              Abrir Compartilhado
            </Link>
          </article>
          <article className="surface surface-pad privacy-action-card">
            <span className="empty-icon">
              <LogOut size={22} aria-hidden="true" />
            </span>
            <h2>Login e segurança</h2>
            <p>Revise seus métodos de acesso antes de solicitar exclusão ou trocar de dispositivo.</p>
            <Link className="button button--secondary" to="/app/settings/security/login-methods">
              Métodos de login
            </Link>
          </article>
        </div>
      </section>
    </PublicLayout>
  );
}
