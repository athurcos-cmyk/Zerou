import { memo, useEffect, useState, type ReactNode } from 'react';
import { CloudOff, AlertCircle } from 'lucide-react';
import type { SyncStatus } from '../types/contracts';

interface SyncStatusBadgeProps {
  status: SyncStatus;
}

/**
 * Quanto tempo uma escrita precisa ficar pendente antes de virar aviso na tela.
 *
 * O app é fire-and-forget: o lançamento entra no cache local e aparece na lista na hora, antes
 * de o servidor confirmar (`metadata.hasPendingWrites`). Online essa confirmação leva frações
 * de segundo, então o "Salvando…" só piscava no momento em que a pessoa acabou de salvar —
 * barulho puro, e logo onde a UI deveria transmitir confiança.
 *
 * Segurar o aviso por um tempo mata o flash sem apagar o sinal: offline ou em rede ruim ele
 * aparece e fica até sincronizar, que é quando o aviso é legítimo e útil. Não dá pra
 * simplesmente remover o badge — ele é o único indício visível de "isto ainda não está no
 * servidor", e este projeto já teve feature quebrada em silêncio por semanas justamente porque
 * o padrão offline-first engole o erro de propósito.
 */
const PENDING_DELAY_MS = 1200;

const label: Record<string, string> = {
  pending: 'Salvando…',
  failed: 'Falha ao salvar',
};

const icons: Record<string, ReactNode> = {
  pending: <CloudOff size={12} aria-hidden="true" />,
  failed: <AlertCircle size={12} aria-hidden="true" />,
};

export const SyncStatusBadge = memo(function SyncStatusBadge({ status }: SyncStatusBadgeProps) {
  const [pendingIsSlow, setPendingIsSlow] = useState(false);

  useEffect(() => {
    if (status !== 'pending') {
      setPendingIsSlow(false);
      return;
    }

    const timer = setTimeout(() => setPendingIsSlow(true), PENDING_DELAY_MS);
    return () => clearTimeout(timer);
  }, [status]);

  if (status === 'synced') return null;
  // `failed` nunca espera: é erro, e erro se mostra na hora.
  if (status === 'pending' && !pendingIsSlow) return null;

  return (
    <span className={`sync-badge sync-badge--${status}`} role="status">
      {icons[status]}
      {label[status]}
    </span>
  );
});
