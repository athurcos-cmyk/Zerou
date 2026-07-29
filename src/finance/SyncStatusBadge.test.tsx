import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncStatusBadge } from './SyncStatusBadge';

// O atraso do aviso de "Salvando…" é o comportamento sob teste — sem timer falso não dá pra
// distinguir "não apareceu porque foi rápido" de "não apareceu porque quebrou".
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const avancar = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

describe('SyncStatusBadge', () => {
  it('não mostra nada quando já sincronizou', () => {
    render(<SyncStatusBadge status="synced" />);

    expect(screen.queryByRole('status')).toBeNull();
  });

  // O incômodo que originou a mudança (dono, 29/07/2026): online o Firestore confirma em
  // frações de segundo, e o aviso só piscava logo depois de salvar.
  it('segura o "Salvando…" enquanto a escrita ainda pode terminar rápido', () => {
    render(<SyncStatusBadge status="pending" />);

    expect(screen.queryByText('Salvando…')).toBeNull();

    avancar(1000);
    expect(screen.queryByText('Salvando…')).toBeNull();
  });

  it('mostra o "Salvando…" quando a escrita realmente demora', () => {
    render(<SyncStatusBadge status="pending" />);

    avancar(1200);

    expect(screen.getByText('Salvando…')).toBeTruthy();
  });

  it('não mostra nada se sincronizar antes do prazo', () => {
    const { rerender } = render(<SyncStatusBadge status="pending" />);

    avancar(400);
    rerender(<SyncStatusBadge status="synced" />);
    avancar(5000);

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('mostra falha na hora, sem esperar — erro não se esconde', () => {
    render(<SyncStatusBadge status="failed" />);

    expect(screen.getByText('Falha ao salvar')).toBeTruthy();
  });
});
