import { useEffect, useState } from 'react';

/**
 * Estado de conectividade do navegador — usado só pra decidir a MENSAGEM mostrada durante
 * carregamento (ver LoadingState.tsx), nunca pra bloquear nada: escritas continuam
 * fire-and-forget e leituras continuam servindo do cache local do Firestore independente
 * disso (offline de verdade com dado já cacheado antes segue funcionando normalmente).
 */
export function useIsOnline() {
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return isOnline;
}
