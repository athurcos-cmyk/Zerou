import { afterEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { LoadingState } from './LoadingState';

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

describe('LoadingState', () => {
  afterEach(() => {
    setOnline(true);
  });

  it('mostra "carregando" enquanto online — nunca sugere que os dados são zero', () => {
    setOnline(true);
    render(<LoadingState />);

    expect(screen.getByText('Carregando seus dados…')).toBeInTheDocument();
    expect(screen.queryByText(/offline/i)).not.toBeInTheDocument();
  });

  // Regressão (2026-07-24): sem essa distinção, alguém genuinamente offline (1ª abertura,
  // nada em cache ainda) via um spinner "carregando" pra sempre — o que sugere falsamente
  // que os dados estão quase chegando, quando na verdade é impossível sem reconectar.
  it('mostra mensagem de offline honesta quando não há conexão', () => {
    setOnline(false);
    render(<LoadingState />);

    expect(screen.getByText('Você está offline')).toBeInTheDocument();
    expect(screen.queryByText('Carregando seus dados…')).not.toBeInTheDocument();
  });

  it('reage a mudanças de conectividade em tempo real (evento offline/online)', () => {
    setOnline(true);
    render(<LoadingState />);
    expect(screen.getByText('Carregando seus dados…')).toBeInTheDocument();

    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByText('Você está offline')).toBeInTheDocument();

    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.getByText('Carregando seus dados…')).toBeInTheDocument();
  });

  it('aceita um label customizado quando online', () => {
    setOnline(true);
    render(<LoadingState label="Carregando o histórico…" />);

    expect(screen.getByText('Carregando o histórico…')).toBeInTheDocument();
  });
});
