import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { connectFirebaseEmulators, initializeOptionalAnalytics } from './firebase/config';
import './styles/themes.css';
import './styles/global.css';

connectFirebaseEmulators();
void initializeOptionalAnalytics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
