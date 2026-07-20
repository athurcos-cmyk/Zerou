import { Component, type ErrorInfo, type ReactNode } from 'react';
import { getUserFacingErrorMessage } from '../utils/userFacingError';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('AppErrorBoundary:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="app-main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div style={{ textAlign: 'center', maxWidth: '20rem' }}>
            <h2 style={{ marginBottom: '0.75rem' }}>Algo deu errado</h2>
            <p className="text-secondary" style={{ marginBottom: '1.5rem' }}>
              {getUserFacingErrorMessage(this.state.error, 'Ocorreu um erro inesperado. Tente recarregar a página.')}
            </p>
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
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
