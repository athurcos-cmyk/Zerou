import { create } from 'zustand';

// Mesmo padrão de `analysisTour.store.ts`: "já viu" mora no localStorage (não no Firestore),
// é estado de UI por aparelho.
const SEEN_KEY = 'zerou.categoriesTourSeen';

function readSeen(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

interface CategoriesTourState {
  open: boolean;
  /** Já viu (ou pulou) o tutorial da tela de Categorias neste aparelho. */
  seen: boolean;
  openTour: () => void;
  /** Fecha e marca como visto — só volta pelo botão "Como funciona" da própria tela. */
  closeTour: () => void;
}

export const useCategoriesTour = create<CategoriesTourState>((set) => ({
  open: false,
  seen: readSeen(),
  openTour: () => set({ open: true }),
  closeTour: () => {
    try {
      window.localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Sem localStorage (aba privada bloqueada): só perde a memória de "já viu".
    }
    set({ open: false, seen: true });
  }
}));
