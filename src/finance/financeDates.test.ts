import { describe, expect, it } from 'vitest';
import {
  compareByDateDesc,
  fromDateInputValue,
  fromDateInputValueForWrite,
  resolveEditedDate,
  toDateInputValue,
  todayInputValue
} from './financeDates';

/** Lançamento vindo do formulário do app: `date` ancorado no meio-dia, sem hora real. */
const doApp = (dia: string, registradoEm: Date) => ({ date: fromDateInputValue(dia), createdAt: registradoEm });
/** Lançamento vindo do WhatsApp ao vivo: `date` é o instante real da mensagem. */
const doWhatsapp = (momento: Date) => ({ date: momento, createdAt: momento });

describe('compareByDateDesc', () => {
  it('coloca o dia mais recente primeiro', () => {
    const ontem = doApp('2026-07-24', new Date(2026, 6, 24, 9, 0));
    const hoje = doApp('2026-07-25', new Date(2026, 6, 25, 9, 0));

    expect([ontem, hoje].sort(compareByDateDesc)).toEqual([hoje, ontem]);
  });

  it('desempata pelo horário do registro quando as duas vieram do formulário (mesmo dia)', () => {
    const primeira = doApp('2026-07-25', new Date(2026, 6, 25, 10, 0));
    const segunda = doApp('2026-07-25', new Date(2026, 6, 25, 18, 0));

    expect([primeira, segunda].sort(compareByDateDesc)).toEqual([segunda, primeira]);
  });

  // O caso real que o dono viu em 25/07/2026: "Fotos no shopping" foi lançada pelo app às
  // 20:41 e caía ATRÁS de três despesas do WhatsApp das 12:16/13:45/14:08 — porque o app
  // gravou 12:00 nela e o WhatsApp gravou a hora de verdade nas outras.
  it('não deixa o meio-dia de enfeite do formulário mandar na frente da hora real do WhatsApp', () => {
    const penteGarfo = doWhatsapp(new Date(2026, 6, 25, 12, 16, 29));
    const trem = doWhatsapp(new Date(2026, 6, 25, 13, 45, 24));
    const pipoca = doWhatsapp(new Date(2026, 6, 25, 14, 8, 46));
    const fotos = doApp('2026-07-25', new Date(2026, 6, 25, 20, 41, 20));

    expect([penteGarfo, trem, pipoca, fotos].sort(compareByDateDesc)).toEqual([fotos, pipoca, trem, penteGarfo]);
  });

  // Se o instante de ordenação pudesse atravessar a fronteira do dia, o agrupamento por dia
  // da tela de Transações (que percorre a lista já ordenada) repetiria o mesmo cabeçalho.
  it('mantém o lançamento retroativo dentro do próprio dia, mesmo registrado dias depois', () => {
    const retroativo = doApp('2026-07-24', new Date(2026, 6, 25, 10, 43));
    const doDia25 = doWhatsapp(new Date(2026, 6, 25, 12, 16));

    const ordenado = [retroativo, doDia25].sort(compareByDateDesc);

    expect(ordenado).toEqual([doDia25, retroativo]);
    expect(ordenado.map((item) => toDateInputValue(item.date))).toEqual(['2026-07-25', '2026-07-24']);
  });

  it('põe o retroativo no topo do próprio dia, na ordem em que foi digitado', () => {
    const comHoraReal = doWhatsapp(new Date(2026, 6, 24, 8, 9));
    const digitadoDepois = doApp('2026-07-24', new Date(2026, 6, 25, 10, 41));
    const digitadoPorUltimo = doApp('2026-07-24', new Date(2026, 6, 25, 10, 43));

    expect([comHoraReal, digitadoDepois, digitadoPorUltimo].sort(compareByDateDesc)).toEqual([
      digitadoPorUltimo,
      digitadoDepois,
      comHoraReal
    ]);
  });

  it('não quebra com lançamento antigo sem createdAt', () => {
    const semCreatedAt = { date: fromDateInputValue('2026-07-25') };
    const comCreatedAt = doApp('2026-07-25', new Date(2026, 6, 25, 18, 0));

    expect(() => [semCreatedAt, comCreatedAt].sort(compareByDateDesc)).not.toThrow();
    expect([semCreatedAt, comCreatedAt].sort(compareByDateDesc)[0]).toBe(comCreatedAt);
  });
});

describe('fromDateInputValueForWrite', () => {
  it('grava a hora real quando a data escolhida é hoje', () => {
    const gravado = fromDateInputValueForWrite(todayInputValue());
    const agora = new Date();

    expect(Math.abs(gravado.getTime() - agora.getTime())).toBeLessThan(5_000);
  });

  it('mantém o meio-dia para data passada (ninguém informou a hora)', () => {
    const gravado = fromDateInputValueForWrite('2026-07-20');

    expect(gravado.getHours()).toBe(12);
    expect(gravado.getMinutes()).toBe(0);
  });
});

describe('resolveEditedDate', () => {
  it('preserva o horário original quando o dia não mudou (não apaga a hora vinda do WhatsApp)', () => {
    const original = new Date(2026, 6, 25, 14, 8, 46);

    expect(resolveEditedDate('2026-07-25', original)).toBe(original);
  });

  it('reancora quando a pessoa realmente troca o dia', () => {
    const original = new Date(2026, 6, 25, 14, 8, 46);
    const editado = resolveEditedDate('2026-07-20', original);

    expect(toDateInputValue(editado)).toBe('2026-07-20');
    expect(editado.getHours()).toBe(12);
  });
});
