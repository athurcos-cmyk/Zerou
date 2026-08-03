import { useEffect, useState } from 'react';
import { useIsOnline } from '../finance/useIsOnline';

/**
 * Trava de conexão do espaço do casal — a ÚNICA parte do app onde escrever offline é proibido.
 *
 * O resto do Granativa é offline-first por regra (ver `CLAUDE.md`): a escrita vai pro cache
 * local, a UI responde na hora e a sincronização acontece depois. Isso funciona porque só existe
 * uma pessoa mexendo naqueles dados — a fila local nunca briga com ninguém.
 *
 * No espaço do casal são duas pessoas gravando na MESMA coleção. Duas filas locais que
 * sincronizam em momentos diferentes produzem divergência silenciosa: quem está com sinal ruim
 * registra R$ 200 no mercado, o outro registra o mesmo mercado enquanto isso, e quando as duas
 * filas sobem ninguém vê que duplicou — pior, um acerto calculado sobre um saldo que já mudou
 * no servidor quita uma dívida que não existe mais. Por isso, aqui, a pessoa é AVISADA e
 * bloqueada antes de registrar, em vez de descobrir depois.
 *
 * Leitura continua livre: dado que já veio pro cache aparece normalmente offline.
 */
export type CoupleWriteBlock = 'offline' | 'slow' | null;

/**
 * Quanto tempo uma escrita pode ficar sem confirmação do servidor antes de a conexão ser
 * considerada ruim demais pra continuar registrando. Escrita confirmada some da fila em
 * milissegundos numa rede saudável — passar disso significa que o transporte está oscilando
 * (o retry do Firestore nunca desiste sozinho, então esperar não resolve por conta própria).
 */
export const COUPLE_SLOW_SYNC_MS = 8000;

export function coupleWriteBlock(input: { isOnline: boolean; slowSync: boolean }): CoupleWriteBlock {
  if (!input.isOnline) {
    return 'offline';
  }

  if (input.slowSync) {
    return 'slow';
  }

  return null;
}

export function coupleWriteBlockTitle(block: CoupleWriteBlock) {
  return block === 'offline' ? 'Você está sem internet' : 'Conexão instável';
}

export function coupleWriteBlockMessage(block: CoupleWriteBlock) {
  if (block === 'offline') {
    return 'O espaço do casal precisa de internet: são duas pessoas gravando nos mesmos dados, e registrar offline faria os números de vocês divergirem. Você continua vendo o que já carregou.';
  }

  if (block === 'slow') {
    return 'Um registro seu ainda não chegou no servidor. Espere a sincronização terminar antes de registrar outra coisa — assim os números de vocês dois não divergem.';
  }

  return '';
}

/**
 * `pendingWrites` vem do `hasPendingWrites` dos snapshots (ver `useSharedWorkspaceData`): é a
 * evidência real de que algo saiu da UI e o servidor ainda não confirmou. Não usamos
 * `navigator.connection` (heurística de banda, mente em 4G ruim) nem medimos latência com
 * requisição extra — a fila do próprio Firestore já é a medida honesta.
 */
export function useCoupleWriteGate(pendingWrites: boolean) {
  const isOnline = useIsOnline();
  const [slowSync, setSlowSync] = useState(false);

  useEffect(() => {
    if (!pendingWrites) {
      setSlowSync(false);
      return undefined;
    }

    const timer = window.setTimeout(() => setSlowSync(true), COUPLE_SLOW_SYNC_MS);
    return () => window.clearTimeout(timer);
  }, [pendingWrites]);

  const block = coupleWriteBlock({ isOnline, slowSync });

  return {
    block,
    blocked: block !== null,
    title: coupleWriteBlockTitle(block),
    message: coupleWriteBlockMessage(block)
  };
}
