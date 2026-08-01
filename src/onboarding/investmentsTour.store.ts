import { create } from 'zustand';

const SEEN_KEY = 'zerou.investmentsTourSeen';

function readSeen(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

interface InvestmentsTourState {
  open: boolean;
  seen: boolean;
  openTour: () => void;
  closeTour: () => void;
}

export const useInvestmentsTour = create<InvestmentsTourState>((set) => ({
  open: false,
  seen: readSeen(),
  openTour: () => set({ open: true }),
  closeTour: () => {
    try {
      window.localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Sem localStorage.
    }
    set({ open: false, seen: true });
  }
}));
