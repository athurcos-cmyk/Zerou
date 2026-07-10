import type { DocumentData, DocumentSnapshot, QueryDocumentSnapshot } from 'firebase/firestore';

type AnySnapshot = DocumentSnapshot<DocumentData> | QueryDocumentSnapshot<DocumentData>;

/**
 * Lê os campos de um snapshot do Firestore com a **estimativa local** de qualquer
 * `serverTimestamp()` ainda pendente.
 *
 * Por padrão (`serverTimestamps: 'none'`), o SDK devolve `null` para um campo cujo
 * `serverTimestamp()` ainda não foi confirmado pelo servidor. Num app offline-first isso
 * é um buraco silencioso: `softDeleteTransaction` grava `deletedAt: serverTimestamp()`, e
 * até o ack chegar o snapshot local diz `deletedAt: null`. Resultado — offline, excluir
 * uma transação não a tirava do Extrato, e a compra no cartão continuava somando na
 * fatura. A UI "desfazia" a ação do usuário até a rede voltar.
 *
 * `'estimate'` preenche o campo com o relógio local no momento da escrita. O valor pode
 * diferir em milissegundos do que o servidor vai gravar, e por isso nunca deve ser usado
 * para ordenar ou comparar timestamps entre usuários — mas para "este campo tem valor?"
 * (que é como `deletedAt` é usado em todo o app) é exatamente o que se quer.
 */
export function readSnapshotData(snapshot: AnySnapshot): DocumentData | undefined {
  return snapshot.data({ serverTimestamps: 'estimate' });
}

/** `readSnapshotData` + o `id` do documento, o formato que todos os serviços usam. */
export function readSnapshotDoc<T>(snapshot: AnySnapshot): T {
  return { id: snapshot.id, ...readSnapshotData(snapshot) } as T;
}
