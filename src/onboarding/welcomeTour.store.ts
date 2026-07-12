import { create } from 'zustand';

// "Já viu o tour" mora no localStorage (não no Firestore): é estado de UI por aparelho, e
// gravar no perfil custaria um write + regra nova sem ganho real. Mesmo padrão de
// `zerou.pwaInstallDismissed`. Ver mais um aparelho o tour de novo é aceitável.
const SEEN_KEY = 'zerou.welcomeTourSeen';

function readSeen(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

interface WelcomeTourState {
  open: boolean;
  /** Já viu (ou pulou) o tour de boas-vindas neste aparelho. */
  seen: boolean;
  openTour: () => void;
  /** Fecha e marca como visto — some pra sempre neste aparelho (até limpar o localStorage). */
  closeTour: () => void;
}

export const useWelcomeTour = create<WelcomeTourState>((set) => ({
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
