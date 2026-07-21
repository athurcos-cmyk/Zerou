import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Copy, Check, ExternalLink } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { collection, getDocs } from 'firebase/firestore';
import { useAuth } from '../auth/AuthContext';
import { getFirebaseFunctions, getFirebaseDb } from '../firebase/config';
import { getUserFacingErrorMessage } from '../utils/userFacingError';
import { useConfirm } from '../components/ConfirmDialog';

export function WhatsAppLinkPage() {
  const { user } = useAuth();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const workspaceId = user?.uid ? `personal_${user.uid}` : null;

  const [checkingLink, setCheckingLink] = useState(true);
  const [linkedPhone, setLinkedPhone] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState(false);

  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [waLink, setWaLink] = useState<string | null>(null);
  const [expiresIn, setExpiresIn] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) {
      setCheckingLink(false);
      return;
    }

    let cancelled = false;
    getDocs(collection(getFirebaseDb(), 'workspaces', workspaceId, 'whatsappLinks'))
      .then((snap) => {
        if (cancelled) return;
        setLinkedPhone(snap.docs[0]?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setLinkedPhone(null);
      })
      .finally(() => {
        if (!cancelled) setCheckingLink(false);
      });

    return () => { cancelled = true; };
  }, [workspaceId]);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setCode(null);
    setWaLink(null);

    try {
      if (!workspaceId) {
        setError('Você precisa estar logado para vincular o WhatsApp.');
        setLoading(false);
        return;
      }

      const fn = httpsCallable<{ workspaceId: string }, { code: string; expiresInMinutes: number; waLink: string | null }>(
        getFirebaseFunctions(),
        'generateWhatsappLinkCode',
      );

      const result = await fn({ workspaceId });

      setCode(result.data.code);
      setWaLink(result.data.waLink);
      setExpiresIn(result.data.expiresInMinutes);
    } catch (err) {
      setError(getUserFacingErrorMessage(err, 'Não foi possível gerar o código. Tente de novo.'));
    } finally {
      setLoading(false);
    }
  }

  async function handleUnlink() {
    if (!workspaceId) return;
    const ok = await confirm({
      title: 'Desvincular WhatsApp?',
      message: 'Você para de conseguir lançar gastos e receitas pelo WhatsApp até vincular de novo.',
      confirmLabel: 'Desvincular',
      danger: true,
    });
    if (!ok) return;

    setUnlinking(true);
    setError(null);
    try {
      const fn = httpsCallable<{ workspaceId: string }, { unlinkedPhone: string }>(
        getFirebaseFunctions(),
        'unlinkWhatsapp',
      );
      await fn({ workspaceId });
      setLinkedPhone(null);
      setCode(null);
      setWaLink(null);
    } catch (err) {
      setError(getUserFacingErrorMessage(err, 'Não foi possível desvincular. Tente de novo.'));
    } finally {
      setUnlinking(false);
    }
  }

  async function handleCopy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // clipboard may not be available
    }
  }

  return (
    <div className="page">
      <div className="page-heading-row page-heading-row--tight">
        <div>
          <p className="eyebrow">Configurações</p>
          <h1 className="page-title page-title--compact">WhatsApp</h1>
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <article className="surface surface-pad">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1rem' }}>
            <MessageCircle size={22} style={{ color: 'var(--action-primary)', marginTop: 2 }} aria-hidden="true" />
            <div>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Lançamento via WhatsApp</h2>
              <p className="text-secondary" style={{ margin: '0.25rem 0 0', fontSize: '0.86rem' }}>
                Mande uma mensagem como "gastei 15 reais no mercado" e a transação aparece automaticamente no app.
              </p>
            </div>
          </div>

          {error ? (
            <p className="form-message form-message--error" style={{ marginBottom: '1rem' }}>{error}</p>
          ) : null}

          {checkingLink ? (
            <p className="text-secondary" style={{ fontSize: '0.86rem' }}>Carregando...</p>
          ) : linkedPhone ? (
            <div style={{ textAlign: 'center' }}>
              <p className="text-secondary" style={{ marginBottom: '0.25rem', fontSize: '0.86rem' }}>
                Vinculado
              </p>
              <strong style={{ fontSize: '1.25rem', display: 'block', marginBottom: '1rem' }}>
                +{linkedPhone}
              </strong>
              <button
                className="button button--ghost"
                type="button"
                disabled={unlinking}
                onClick={() => void handleUnlink()}
              >
                {unlinking ? 'Desvinculando...' : 'Desvincular'}
              </button>
            </div>
          ) : !code ? (
            <button
              className="button button--primary button--block"
              type="button"
              disabled={loading}
              onClick={() => void handleGenerate()}
            >
              <MessageCircle size={18} aria-hidden="true" />
              {loading ? 'Gerando...' : 'Vincular WhatsApp'}
            </button>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <p className="text-secondary" style={{ marginBottom: '0.5rem', fontSize: '0.86rem' }}>
                1. Mande este código para o WhatsApp da Granativa:
              </p>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                marginBottom: '1rem',
              }}>
                <strong style={{ fontSize: '2rem', letterSpacing: '0.25rem', fontFamily: 'DM Sans, monospace' }}>
                  {code}
                </strong>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Copiar código"
                  onClick={() => void handleCopy()}
                >
                  {copied ? <Check size={18} /> : <Copy size={18} />}
                </button>
              </div>

              {copied ? (
                <p className="text-secondary" style={{ marginBottom: '1rem', fontSize: '0.82rem', color: 'var(--action-primary)' }}>
                  Código copiado!
                </p>
              ) : null}

              {waLink ? (
                <a
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="button button--subtle"
                  style={{ marginBottom: '1rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <ExternalLink size={16} aria-hidden="true" />
                  Abrir no WhatsApp
                </a>
              ) : (
                <p className="text-secondary" style={{ marginBottom: '1rem', fontSize: '0.86rem' }}>
                  2. Salve o número do bot e envie o código.
                </p>
              )}

              <p className="text-secondary" style={{ fontSize: '0.78rem' }}>
                O código expira em {expiresIn} minutos. Depois do vínculo, é só mandar seus gastos por aqui.
              </p>

              <button
                className="button button--ghost"
                type="button"
                style={{ marginTop: '1rem' }}
                onClick={() => { setCode(null); setWaLink(null); }}
              >
                Gerar novo código
              </button>
            </div>
          )}
        </article>

        <p style={{ textAlign: 'center', marginTop: '1rem' }}>
          <Link to="/app" className="inline-link">Voltar para o início</Link>
        </p>
      </div>

      {confirmDialog}
    </div>
  );
}
