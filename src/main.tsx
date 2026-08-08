// PRIMEIRO import de propósito: instala os listeners globais de erro antes que qualquer outro
// módulo tenha chance de quebrar na avaliação. Sem isso, um throw aqui embaixo deixa `#root`
// vazio e a tela branca, sem mensagem nenhuma. Ver src/utils/globalErrorHandler.ts.
import { reportFatalError } from './utils/globalErrorHandler';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { connectFirebaseEmulators } from './firebase/config';
import { registerServiceWorkerUpdates } from './pwa/registerServiceWorker';
import { preventPullToRefresh } from './pwa/preventPullToRefresh';
import './pwa/installPrompt';
import './styles/themes.css';
import './styles/global.css';

try {
  connectFirebaseEmulators();
  registerServiceWorkerUpdates();
  preventPullToRefresh();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>
  );
} catch (error) {
  // O boot em si falhou: nada foi montado, então a tela de falha é a única coisa que a pessoa
  // vai ver — e ela precisa oferecer uma saída, não uma tela branca.
  reportFatalError(error);
}
