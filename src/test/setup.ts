import '@testing-library/jest-dom/vitest';

// jsdom não implementa ResizeObserver, e o BottomSheet usa um pra decidir o degradê de
// "tem mais coisa abaixo". Sem este stub, qualquer teste que abra uma sheet quebra.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
