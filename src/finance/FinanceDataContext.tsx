import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useCardsData } from '../cards/useCardsData';
import { useFinanceData } from './useFinanceData';
import { useGoalsData } from './useGoalsData';

const FinanceContext = createContext<ReturnType<typeof useFinanceData> | null>(null);
const CardsContext = createContext<ReturnType<typeof useCardsData> | null>(null);
const GoalsContext = createContext<ReturnType<typeof useGoalsData> | null>(null);

export function FinanceDataProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const workspaceId = profile?.defaultWorkspaceId;
  const finance = useFinanceData(workspaceId, user?.uid);
  // Transações excluídas no Extrato (soft delete) precisam propagar pro cálculo da
  // fatura: uma compra no cartão excluída deve parar de contar no saldo/lista da fatura.
  const deletedTransactionIds = useMemo(
    () => new Set(finance.transactions.filter((t) => t.deletedAt).map((t) => t.id)),
    [finance.transactions]
  );
  const cards = useCardsData(workspaceId, deletedTransactionIds);
  const goals = useGoalsData(workspaceId);

  return (
    <FinanceContext.Provider value={finance}>
      <CardsContext.Provider value={cards}>
        <GoalsContext.Provider value={goals}>
          {children}
        </GoalsContext.Provider>
      </CardsContext.Provider>
    </FinanceContext.Provider>
  );
}

export function useFinanceContext() {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error('useFinanceContext deve estar dentro de FinanceDataProvider.');
  return ctx;
}

export function useCardsContext() {
  const ctx = useContext(CardsContext);
  if (!ctx) throw new Error('useCardsContext deve estar dentro de FinanceDataProvider.');
  return ctx;
}

export function useGoalsContext() {
  const ctx = useContext(GoalsContext);
  if (!ctx) throw new Error('useGoalsContext deve estar dentro de FinanceDataProvider.');
  return ctx;
}
