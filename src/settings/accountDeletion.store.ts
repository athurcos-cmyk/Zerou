import { create } from 'zustand';

// Estado transiente (só em memória, não precisa sobreviver a reload) que sinaliza pro
// `RequireOnboardingComplete` (routeGuards.tsx) não redirecionar pra onboarding quando o
// perfil sumir. `deleteAccountData()` apaga `users/{uid}` ANTES de `deleteAuthenticatedUser()`
// (ordem deliberada — precisa da sessão ainda válida pra escrever), e o `onSnapshot` ao vivo
// em `AuthContext.tsx` reage a isso na hora: sem essa flag, a pessoa via a tela de onboarding
// no meio da própria exclusão, como se a conta tivesse virado nova, antes do redirect final
// pra landing rodar.
interface AccountDeletionState {
  isDeleting: boolean;
  setDeleting: (value: boolean) => void;
}

export const useAccountDeletion = create<AccountDeletionState>((set) => ({
  isDeleting: false,
  setDeleting: (value) => set({ isDeleting: value })
}));
