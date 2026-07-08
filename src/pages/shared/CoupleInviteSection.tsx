import { useEffect, useState } from 'react';
import { QrCode, Share2 } from 'lucide-react';
import {
  cleanupExpiredInvites,
  createCoupleInvite,
  regenerateCoupleInvite,
  revokeCoupleInvite
} from '../../shared/sharedService';
import { getUserFacingErrorMessage } from '../../utils/userFacingError';
import type { CoupleInvite } from '../../types/contracts';

interface GeneratedInvite {
  code: string;
  joinUrl: string;
  qrDataUrl: string;
}

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
}

interface CoupleInviteSectionProps {
  workspaceId: string;
  workspaceName: string;
  userId: string;
  /** Active invite as it exists on the server right now — may be set even after a reload, when the raw code is gone. */
  activeInvite: CoupleInvite | undefined;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  onMessage: (message: string | null) => void;
}

/**
 * The invite card has exactly one primary action at any time — never a row of five buttons.
 * Which variant renders depends on what we actually have: nothing yet, a freshly generated
 * code (this session), or an invite that already exists on the server but whose raw code was
 * lost on reload (it's stored hashed, so it can't be shown again).
 */
export function CoupleInviteSection({ workspaceId, workspaceName, userId, activeInvite, confirm, onMessage }: CoupleInviteSectionProps) {
  const [generatedInvite, setGeneratedInvite] = useState<GeneratedInvite | null>(null);
  const [copied, setCopied] = useState(false);

  // Firestore already TTLs `coupleInvites` after 48h in the background — this just tidies up
  // "active" status invites that are past their expiresAt but not yet purged, so the UI never
  // shows a stale invite as usable. No button needed; it just runs.
  useEffect(() => {
    cleanupExpiredInvites(workspaceId, userId).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  async function handleShare(invite: GeneratedInvite) {
    const shareText = `${invite.joinUrl}\nCódigo: ${invite.code}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Convite Granativa', text: shareText, url: invite.joinUrl });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      onMessage('Não foi possível compartilhar. Copie o código manualmente.');
    }
  }

  function handleGenerate() {
    onMessage(null);
    createCoupleInvite(workspaceId, userId, workspaceName)
      .then(setGeneratedInvite)
      .catch((err) => onMessage(getUserFacingErrorMessage(err, 'Não foi possível gerar o convite agora.')));
  }

  async function handleRegenerate() {
    const ok = await confirm({
      title: 'Gerar um novo código?',
      message: activeInvite ? 'O código anterior deixa de funcionar assim que o novo for criado.' : undefined,
      confirmLabel: 'Gerar novo código',
      danger: Boolean(activeInvite)
    });
    if (!ok) return;
    onMessage(null);
    regenerateCoupleInvite(workspaceId, userId, workspaceName)
      .then(setGeneratedInvite)
      .catch((err) => onMessage(getUserFacingErrorMessage(err, 'Não foi possível gerar o convite agora.')));
  }

  async function handleRevoke() {
    if (!activeInvite) return;
    const ok = await confirm({
      title: 'Cancelar este convite?',
      message: 'Quem tiver o código ou o link deixa de conseguir entrar com ele.',
      confirmLabel: 'Cancelar convite',
      danger: true
    });
    if (!ok) return;
    onMessage(null);
    setGeneratedInvite(null);
    revokeCoupleInvite(workspaceId, activeInvite.id, userId)
      .catch((err) => onMessage(getUserFacingErrorMessage(err, 'Não foi possível cancelar o convite agora.')));
  }

  // 1) Freshly generated this session — we still have the raw code, show it in full.
  if (generatedInvite) {
    return (
      <article className="surface surface-pad form-stack invite-hero">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Convite</p>
            <h2>Envie pra outra pessoa</h2>
          </div>
          <QrCode size={22} aria-hidden="true" />
        </div>
        <div className="shared-invite-card">
          <strong>{generatedInvite.code}</strong>
          <span>{generatedInvite.joinUrl}</span>
          <img src={generatedInvite.qrDataUrl} alt="QR Code do convite Granativa" />
          <button className="button button--primary button--block" type="button" onClick={() => void handleShare(generatedInvite)}>
            <Share2 size={16} aria-hidden="true" /> {copied ? 'Copiado!' : 'Compartilhar convite'}
          </button>
        </div>
        <div className="button-row">
          <button className="button button--ghost button--compact" type="button" onClick={() => void handleRegenerate()}>
            Gerar novo código
          </button>
          <button className="button button--ghost button--compact button--danger-text" type="button" onClick={() => void handleRevoke()}>
            Cancelar convite
          </button>
        </div>
      </article>
    );
  }

  // 2) An invite already exists on the server but the raw code was lost (reload) — be honest
  // about it instead of silently minting (and invalidating) a new one on the next click.
  if (activeInvite) {
    return (
      <article className="surface surface-pad form-stack invite-hero">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Convite</p>
            <h2>Convite ativo</h2>
          </div>
          <QrCode size={22} aria-hidden="true" />
        </div>
        <div className="notice notice--success">
          <strong>Expira em {activeInvite.expiresAt.toDate().toLocaleString('pt-BR')}</strong>
          <br />
          <span>O código já foi enviado. Por segurança ele não pode ser reexibido — gere um novo se precisar reenviar.</span>
        </div>
        <button className="button button--primary button--block" type="button" onClick={() => void handleRegenerate()}>
          Gerar novo código para compartilhar
        </button>
        <button className="button button--ghost button--compact button--danger-text" type="button" onClick={() => void handleRevoke()}>
          Cancelar convite
        </button>
      </article>
    );
  }

  // 3) Nothing yet.
  return (
    <article className="surface surface-pad form-stack invite-hero">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Convite</p>
          <h2>Chame a outra pessoa</h2>
        </div>
        <QrCode size={22} aria-hidden="true" />
      </div>
      <p className="text-secondary">Gere um código, link e QR Code para a outra pessoa entrar.</p>
      <button className="button button--primary button--block" type="button" onClick={handleGenerate}>
        Gerar convite
      </button>
      <div className="shared-flow-hint" aria-hidden="true">
        <span>1. Gere o código</span>
        <span>2. Envie pro parceiro(a)</span>
        <span>3. Ele(a) aceita</span>
      </div>
    </article>
  );
}
