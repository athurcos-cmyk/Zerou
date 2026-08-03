import { describe, expect, it } from 'vitest';
import { coupleWriteBlock, coupleWriteBlockMessage, coupleWriteBlockTitle } from './coupleWriteGate';

describe('coupleWriteBlock', () => {
  it('libera quando está online e nada está pendurado na fila', () => {
    expect(coupleWriteBlock({ isOnline: true, slowSync: false })).toBeNull();
  });

  it('bloqueia offline', () => {
    expect(coupleWriteBlock({ isOnline: false, slowSync: false })).toBe('offline');
  });

  it('bloqueia quando a escrita passou do tempo sem o servidor confirmar', () => {
    expect(coupleWriteBlock({ isOnline: true, slowSync: true })).toBe('slow');
  });

  // Estar offline é a informação mais útil das duas: se a pessoa vê "conexão instável" quando o
  // que houve foi perder a rede, ela fica esperando uma sincronização que não vai acontecer.
  it('offline manda quando os dois sinais aparecem juntos', () => {
    expect(coupleWriteBlock({ isOnline: false, slowSync: true })).toBe('offline');
  });

  it('cada bloqueio tem título e mensagem próprios, e liberado não tem texto', () => {
    expect(coupleWriteBlockTitle('offline')).not.toBe(coupleWriteBlockTitle('slow'));
    expect(coupleWriteBlockMessage('offline')).toContain('internet');
    expect(coupleWriteBlockMessage('slow')).toContain('servidor');
    expect(coupleWriteBlockMessage(null)).toBe('');
  });
});
