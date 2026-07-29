#!/usr/bin/env node
// DIAGNÓSTICO (somente leitura). Acha o workspace do dono por email e lista todas as
// transações não-excluídas, por conta, em ordem de data — pra casar contra o extrato do
// banco e achar a origem de uma divergência. Destaca candidatos: valores terminando em ,44,
// ajustes, pagamentos de fatura e tarifas.
import { initAdminApp } from './backfillShared.mjs';

// Email da conta REAL do dono em produção. Já foi `arthurzika3@gmail.com` (a conta do
// Claude Code, que não existe no banco) — o script respondia "Dono não encontrado" e parecia
// quebrado. Passe outro email como argumento pra inspecionar outra conta; com um email
// inexistente, ele lista todos os que existem.
const OWNER_EMAIL = process.argv[2] ?? 'a.thurcos@gmail.com';
const brl = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const isoDay = (ts) => {
  try { return ts?.toDate ? ts.toDate().toISOString().slice(0, 10) : String(ts).slice(0, 10); }
  catch { return '????-??-??'; }
};

async function main() {
  const db = initAdminApp();

  // 1) uid do dono pelo email
  const usersSnap = await db.collection('users').get();
  const owner = usersSnap.docs.find((d) => (d.data().email ?? '').toLowerCase() === OWNER_EMAIL.toLowerCase());
  if (!owner) {
    console.log(`Nenhum usuário com email ${OWNER_EMAIL}. Emails encontrados:`);
    usersSnap.docs.forEach((d) => console.log('  -', d.data().email, '→ defaultWorkspaceId:', d.data().defaultWorkspaceId));
    return;
  }
  const uid = owner.id;
  const wsId = owner.data().defaultWorkspaceId ?? `personal_${uid}`;
  console.log(`Dono: ${OWNER_EMAIL}  uid=${uid}\nWorkspace: ${wsId}\n`);

  // 2) contas
  const accountsSnap = await db.collection(`workspaces/${wsId}/accounts`).get();
  const accountName = new Map();
  accountsSnap.docs.forEach((d) => accountName.set(d.id, d.data().name));
  console.log('Contas:');
  accountsSnap.docs.forEach((d) => {
    const a = d.data();
    console.log(`  ${a.name}: abertura=${brl(a.openingBalanceCents ?? 0)} atual=${brl(a.currentBalanceCents ?? a.openingBalanceCents ?? 0)}`);
  });

  // 3) transações (não-excluídas), ordenadas por data
  const txnSnap = await db.collection(`workspaces/${wsId}/transactions`).get();
  const txns = txnSnap.docs
    .map((d) => d.data())
    .filter((t) => !t.deletedAt)
    .sort((a, b) => isoDay(a.date).localeCompare(isoDay(b.date)));

  console.log(`\n${txns.length} transação(ões) não-excluída(s):\n`);
  for (const t of txns) {
    const acc = accountName.get(t.accountId) ?? t.accountId ?? '—';
    const dest = t.destinationAccountId ? ` → ${accountName.get(t.destinationAccountId) ?? t.destinationAccountId}` : '';
    const endsIn44 = String(t.amountCents % 100).padStart(2, '0') === '44';
    const flag =
      t.type === 'adjustment' ? ' «AJUSTE»'
      : t.type === 'card_payment' ? ' «PAG. FATURA»'
      : endsIn44 ? ' «…,44»'
      : '';
    console.log(
      `  ${isoDay(t.date)}  ${String(t.type).padEnd(13)} ${brl(t.amountCents).padStart(13)}  ` +
      `[${acc}${dest}]  ${t.description ?? ''}${flag}`
    );
  }

  // 4) resumo de candidatos
  const adjustments = txns.filter((t) => t.type === 'adjustment');
  const ends44 = txns.filter((t) => String(t.amountCents % 100).padStart(2, '0') === '44');
  console.log(`\nCandidatos: ${adjustments.length} ajuste(s), ${ends44.length} valor(es) terminando em ,44.`);
  if (adjustments.length) {
    const sum = adjustments.reduce((s, t) => s + t.amountCents, 0);
    console.log(`Soma dos ajustes: ${brl(sum)}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
