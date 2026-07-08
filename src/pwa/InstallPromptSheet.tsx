import { useEffect, useState } from 'react';
import { Download, Share, SquarePlus } from 'lucide-react';
import { BottomSheet } from '../components/BottomSheet';
import {
  consumeDeferredInstallPrompt,
  dismissInstallPromptPermanently,
  getDeferredInstallPrompt,
  isInstallPromptDismissed,
  isIOSDevice,
  isRunningStandalone,
  onInstallPromptChange
} from './installPrompt';

export function InstallPromptSheet() {
  const [dismissed, setDismissed] = useState(isInstallPromptDismissed);
  const [deferredPrompt, setDeferredPrompt] = useState(getDeferredInstallPrompt);
  const [installing, setInstalling] = useState(false);
  const standalone = isRunningStandalone();
  const iOS = isIOSDevice();

  useEffect(() => onInstallPromptChange(() => setDeferredPrompt(getDeferredInstallPrompt())), []);

  const open = !standalone && !dismissed && (iOS || Boolean(deferredPrompt));

  function close() {
    dismissInstallPromptPermanently();
    setDismissed(true);
  }

  async function handleInstallClick() {
    if (!deferredPrompt) {
      return;
    }

    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } finally {
      consumeDeferredInstallPrompt();
      setDeferredPrompt(null);
      setInstalling(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={close} bare title="Instalar a Granativa">
      <div className="install-prompt">
        <img className="install-prompt-icon" src="/brand/granativa-app-icon-192.png" alt="" aria-hidden="true" />
        <h2>Instale a Granativa</h2>
        <p className="text-secondary">
          Acesso rápido direto da tela inicial, funciona offline e sem ocupar espaço de app store.
        </p>

        {iOS ? (
          <ol className="install-steps">
            <li>
              <Share size={20} aria-hidden="true" />
              <span>
                Toque no botão <strong>Compartilhar</strong> na barra do Safari.
              </span>
            </li>
            <li>
              <SquarePlus size={20} aria-hidden="true" />
              <span>
                Escolha <strong>Adicionar à Tela de Início</strong>.
              </span>
            </li>
            <li>
              <Download size={20} aria-hidden="true" />
              <span>
                Toque em <strong>Adicionar</strong> no canto superior.
              </span>
            </li>
          </ol>
        ) : (
          <button className="button button--primary button--block" type="button" disabled={installing} onClick={() => void handleInstallClick()}>
            <Download size={18} aria-hidden="true" /> {installing ? 'Instalando...' : 'Instalar agora'}
          </button>
        )}

        <button className="button button--ghost" type="button" onClick={close}>
          Agora não
        </button>
      </div>
    </BottomSheet>
  );
}
