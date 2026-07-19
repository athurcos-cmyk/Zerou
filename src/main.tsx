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
