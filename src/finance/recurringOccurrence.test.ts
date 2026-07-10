import { describe, expect, it } from 'vitest';
import { isRecurrenceDue, recurringOccurrenceTransactionId } from './financeService';

// A Cloud Function `generateRecurrences` (6h) e o botão "Registrar" da tela registram a
// MESMA ocorrência. Antes, cada um criava uma transação com id aleatório e a despesa saía
// em dobro. O id determinístico faz as duas escritas caírem no mesmo documento.
describe('recurringOccurrenceTransactionId', () => {
  const ruleId = 'rec_abc123';

  it('derives the same id for the same rule and occurrence', () => {
    const occurrence = new Date('2026-07-09T15:00:00Z');

    expect(recurringOccurrenceTransactionId(ruleId, occurrence)).toBe(
      recurringOccurrenceTransactionId(ruleId, new Date('2026-07-09T15:00:00Z'))
    );
  });

  it('derives different ids for different occurrences of the same rule', () => {
    const july = recurringOccurrenceTransactionId(ruleId, new Date('2026-07-09T15:00:00Z'));
    const august = recurringOccurrenceTransactionId(ruleId, new Date('2026-08-09T15:00:00Z'));

    expect(july).not.toBe(august);
  });

  it('derives different ids for the same occurrence of different rules', () => {
    const occurrence = new Date('2026-07-09T15:00:00Z');

    expect(recurringOccurrenceTransactionId('rec_a', occurrence)).not.toBe(
      recurringOccurrenceTransactionId('rec_b', occurrence)
    );
  });

  // O app roda em BRT e a Cloud Function em UTC. Se a data fosse lida no fuso local, o
  // mesmo instante viraria dias diferentes nos dois lados — e a chave de idempotência
  // deixaria de casar exatamente no caso que ela existe pra cobrir.
  it('reads the occurrence date in UTC, so client and server agree on the key', () => {
    const occurrence = new Date('2026-07-09T15:00:00Z');

    expect(recurringOccurrenceTransactionId(ruleId, occurrence)).toBe('rec_abc123_2026-07-09');
  });

  it('keeps the key stable across a day boundary in the local timezone', () => {
    // 23:30 UTC do dia 9 — em BRT (UTC-3) isso é 20:30 do dia 9; em UTC+13, dia 10.
    const lateUtc = new Date('2026-07-09T23:30:00Z');

    expect(recurringOccurrenceTransactionId(ruleId, lateUtc)).toBe('rec_abc123_2026-07-09');
  });
});

describe('isRecurrenceDue', () => {
  const now = new Date('2026-07-10T09:00:00');

  it('is due when the occurrence is in the past', () => {
    expect(isRecurrenceDue(new Date('2026-07-09T12:00:00'), now)).toBe(true);
  });

  // O dia inteiro conta: uma ocorrência às 12h de hoje já pode ser registrada às 9h.
  it('is due anywhere within today, whatever the hour', () => {
    expect(isRecurrenceDue(new Date('2026-07-10T00:00:00'), now)).toBe(true);
    expect(isRecurrenceDue(new Date('2026-07-10T12:00:00'), now)).toBe(true);
    expect(isRecurrenceDue(new Date('2026-07-10T23:59:59'), now)).toBe(true);
  });

  it('is not due when the occurrence is tomorrow or later', () => {
    expect(isRecurrenceDue(new Date('2026-07-11T00:00:00'), now)).toBe(false);
    expect(isRecurrenceDue(new Date('2026-08-09T12:00:00'), now)).toBe(false);
  });
});
