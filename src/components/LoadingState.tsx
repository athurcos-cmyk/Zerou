import { memo } from 'react';
import { Loader2, WifiOff } from 'lucide-react';
import { useIsOnline } from '../finance/useIsOnline';

interface LoadingStateProps {
  compact?: boolean;
  label?: string;
}

/**
 * Placeholder mostrado enquanto os dados ainda não resolveram — usa a mesma casca visual do
 * EmptyState (mesmo peso/tamanho na tela) pra não pular layout ao trocar de um pro outro. Existe
 * pra nunca confundir "carregando" com "vazio de verdade": mostrar um EmptyState de "sem dados"
 * enquanto uma leitura ainda está em voo (boot, rede lenta, retry) é o mesmo bug encontrado e
 * corrigido em várias telas em 2026-07-24 — ver CHANGELOG.md.
 *
 * Os hooks de dados não desistem mais sozinhos depois de alguns segundos sem resposta (ver
 * mesmo changelog) — só resolvem `loading` com uma resposta de verdade (sucesso ou erro), já
 * que o SDK do Firestore também nunca desiste de tentar em segundo plano. Pra quem está
 * genuinamente offline sem nenhum dado cacheado (1ª abertura em modo avião, por exemplo — não
 * tem como isso alguma vez virar dado real sem reconectar), um spinner infinito seria
 * desonesto: `useIsOnline` troca a mensagem pra deixar claro que falta conexão, não que "está
 * quase chegando". Dado já cacheado antes segue aparecendo na hora, com ou sem rede.
 */
export const LoadingState = memo(function LoadingState({ compact = false, label = 'Carregando seus dados…' }: LoadingStateProps) {
  const isOnline = useIsOnline();

  if (!isOnline) {
    return (
      <div className={`empty-state${compact ? ' empty-state--compact' : ''}`}>
        <WifiOff size={28} style={{ color: 'var(--text-secondary)' }} aria-hidden="true" />
        <strong className="empty-state-title">Você está offline</strong>
        <p className="empty-state-desc">Conecte-se à internet pra ver esses dados. O que já tinha carregado antes continua disponível.</p>
      </div>
    );
  }

  return (
    <div className={`empty-state${compact ? ' empty-state--compact' : ''}`}>
      <Loader2 size={28} style={{ animation: 'spin 0.9s linear infinite', color: 'var(--text-secondary)' }} aria-hidden="true" />
      <strong className="empty-state-title">{label}</strong>
    </div>
  );
});
