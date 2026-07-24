import { Component, type ErrorInfo, type ReactNode } from 'react';
import { getUserFacingErrorMessage } from '../utils/userFacingError';
import {
  hasAttemptedFirestoreRecovery,
  isFirestoreInternalCorruption,
  recoverFromCorruptedFirestorePersistence
} from '../firebase/firestoreRecovery';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  recovering: boolean;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null, recovering: false };

  static getDerivedStateFromError(error: Error): Pick<State, 'error'> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('AppErrorBoundary:', error, info.componentStack);

    // "INTERNAL ASSERTION FAILED" é o SDK do Firestore acusando persistência local corrompida
    // (ver src/firebase/firestoreRecovery.ts) — recuperável limpando o cache local e recarregando,
    // sem exigir clique manual. `hasAttemptedFirestoreRecovery` evita loop se o erro persistir
    // mesmo depois de limpo (nesse caso cai pro botão "Recarregar" normal abaixo).
    if (isFirestoreInternalCorruption(error) && !hasAttemptedFirestoreRecovery()) {
      this.setState({ recovering: true });
      recoverFromCorruptedFirestorePersistence().finally(() => window.location.reload());
    }
  }

  render() {
    if (this.state.error) {
      return (
        <main className="app-main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div style={{ textAlign: 'center', maxWidth: '20rem' }}>
            <h2 style={{ marginBottom: '0.75rem' }}>{this.state.recovering ? 'Corrigindo…' : 'Algo deu errado'}</h2>
            <p className="text-secondary" style={{ marginBottom: '1.5rem' }}>
              {this.state.recovering
                ? 'Encontramos um problema no cache local e já estamos corrigindo — a página recarrega em instantes.'
                : getUserFacingErrorMessage(this.state.error, 'Ocorreu um erro inesperado. Tente recarregar a página.')}
            </p>
            {!this.state.recovering && (
              <button
                type="button"
                className="button button--primary"
                onClick={() => {
                  this.setState({ error: null });
                  window.location.reload();
                }}
              >
                Recarregar
              </button>
            )}
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
