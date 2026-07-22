import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountDeletedScreen } from './AccountDeletedScreen';

describe('AccountDeletedScreen', () => {
  it('explica que a conta foi excluída em vez de deixar a pessoa num app inerte', () => {
    render(<AccountDeletedScreen />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Esta conta foi excluída/i)).toBeInTheDocument();
  });

  it('leva pro landing com um recarregamento completo (não sobra estado da sessão morta)', async () => {
    const assign = vi.fn();
    // `window.location` é read-only no jsdom; troca só o método usado pelo componente.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign }
    });

    render(<AccountDeletedScreen />);
    await userEvent.click(screen.getByRole('button', { name: /voltar ao início/i }));

    expect(assign).toHaveBeenCalledWith('/');
  });
});
