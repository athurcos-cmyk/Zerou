import { describe, expect, it, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { BottomSheet } from './BottomSheet';

// A trava de rolagem do BottomSheet é global (`document.body`), mas as sheets EMPILHAM:
// SelectField, CategoryField e ConfirmDialog abrem por cima de outra sheet. Estes testes
// fixam a invariante que importa: quando a última sheet fecha, o body volta a rolar —
// não importa em que ordem elas abriram e fecharam.
function Stack({ a, b }: { a: boolean; b: boolean }) {
  return (
    <>
      {/* onClose inline de propósito: é o que ConfirmDialog e AppShell fazem de verdade,
          e faz o efeito re-rodar a cada render. */}
      <BottomSheet open={a} onClose={() => {}} title="A">
        <p>A</p>
      </BottomSheet>
      <BottomSheet open={b} onClose={() => {}} title="B">
        <p>B</p>
      </BottomSheet>
    </>
  );
}

describe('BottomSheet — trava de rolagem do body', () => {
  beforeEach(() => {
    document.body.style.overflow = '';
  });

  it('destrava ao fechar uma sheet sozinha', () => {
    const view = render(<Stack a={true} b={false} />);
    expect(document.body.style.overflow).toBe('hidden');
    view.rerender(<Stack a={false} b={false} />);
    expect(document.body.style.overflow).toBe('');
  });

  it('mantém a trava enquanto a sheet de baixo continua aberta', () => {
    const view = render(<Stack a={true} b={false} />);
    view.rerender(<Stack a={true} b={true} />);
    view.rerender(<Stack a={true} b={false} />); // a de cima fecha, a de baixo fica
    expect(document.body.style.overflow).toBe('hidden');
    view.rerender(<Stack a={false} b={false} />);
    expect(document.body.style.overflow).toBe('');
  });

  it('destrava quando a sheet de BAIXO fecha primeiro (empilhadas)', () => {
    const view = render(<Stack a={true} b={false} />);
    view.rerender(<Stack a={true} b={true} />);
    view.rerender(<Stack a={false} b={true} />); // a de baixo sai primeiro
    view.rerender(<Stack a={false} b={false} />);
    expect(document.body.style.overflow).toBe('');
  });

  it('destrava quando as duas fecham no mesmo commit', () => {
    const view = render(<Stack a={true} b={false} />);
    view.rerender(<Stack a={true} b={true} />);
    view.rerender(<Stack a={false} b={false} />);
    expect(document.body.style.overflow).toBe('');
  });

  it('destrava ao desmontar com a sheet ainda aberta (navegação)', () => {
    const view = render(<Stack a={true} b={true} />);
    view.unmount();
    expect(document.body.style.overflow).toBe('');
  });
});
