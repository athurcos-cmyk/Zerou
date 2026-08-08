import {
  hasAttemptedFirestoreRecovery,
  isFirestoreInternalCorruption,
  recoverFromCorruptedFirestorePersistence
} from '../firebase/firestoreRecovery';
import { getUserFacingErrorMessage } from './userFacingError';

/**
 * Rede de segurança de ÚLTIMO nível: o que acontece quando nem o React chegou a montar.
 *
 * O `AppErrorBoundary` só enxerga erro lançado durante render/lifecycle da árvore abaixo dele.
 * Ele NÃO vê (a) erro de callback assíncrono — e o "INTERNAL ASSERTION FAILED" do Firestore,
 * que é exatamente o erro que a recuperação automática existe pra tratar, nasce assíncrono
 * dentro do SDK (entrega de snapshot, callback de IndexedDB); (b) erro lançado na avaliação
 * dos módulos, antes do `createRoot().render()`; (c) erro de um provider que fica ACIMA do
 * boundary na árvore.
 *
 * Nos três casos o resultado era o mesmo: `#root` vazio, tela BRANCA, nenhuma mensagem, e a
 * recuperação automática nunca disparando. Investigado em 07/08/2026, quando o PWA instalado
 * parou de abrir — com internet e sem internet, e fechar/reabrir o app não resolvia, porque
 * o estado ruim é local e persistente.
 *
 * Este módulo se instala sozinho no import. Ele precisa ser o PRIMEIRO import do `main.tsx`:
 * imports estáticos são avaliados na ordem em que aparecem, então estar em primeiro lugar é
 * o que garante que os listeners existem antes de qualquer outro módulo poder quebrar.
 */

const FALLBACK_MESSAGE = 'Não foi possível abrir o app. Isso costuma ser o cache local do aparelho.';

let alreadyReported = false;

function rootIsEmpty() {
  const root = document.getElementById('root');
  return !root || root.childElementCount === 0;
}

function button(label: string, onClick: () => void) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'button button--primary';
  element.textContent = label;
  element.style.margin = '0.25rem';
  element.addEventListener('click', onClick);
  return element;
}

/**
 * Só pinta a tela de falha se o app realmente não subiu. Um erro assíncrono solto com a UI já
 * na tela não pode apagar a UI que está funcionando — nesse caso o erro segue pro console e a
 * pessoa continua usando o app.
 */
function renderFatalScreen(error: unknown) {
  const root = document.getElementById('root');
  if (!root) return;

  const wrapper = document.createElement('main');
  wrapper.className = 'app-main';
  wrapper.style.cssText = 'display:flex;align-items:center;justify-content:center;padding:2rem;text-align:center';

  const box = document.createElement('div');
  box.style.maxWidth = '22rem';

  const title = document.createElement('h2');
  title.style.marginBottom = '0.75rem';
  title.textContent = 'O app não conseguiu abrir';

  const text = document.createElement('p');
  text.className = 'text-secondary';
  text.style.marginBottom = '1.25rem';
  text.textContent = getUserFacingErrorMessage(error, FALLBACK_MESSAGE);

  box.append(title, text);
  box.append(button('Recarregar', () => window.location.reload()));
  // Escape manual: no incidente de 07/08 a única saída era desinstalar o PWA. Limpar o cache
  // local resolve o mesmo problema sem perder nada — os dados de verdade vivem no servidor.
  box.append(
    button('Limpar cache local', () => {
      recoverFromCorruptedFirestorePersistence().finally(() => window.location.reload());
    })
  );

  wrapper.append(box);
  root.replaceChildren(wrapper);
}

/**
 * Corrupção de persistência do Firestore é auto-recuperável: limpa o cache local e recarrega
 * sozinho. `hasAttemptedFirestoreRecovery` impede loop se o erro persistir mesmo depois de
 * limpo — nesse caso sobra a tela de falha, que ainda oferece o botão manual.
 */
function handledAsCorruption(error: unknown) {
  if (isFirestoreInternalCorruption(error) && !hasAttemptedFirestoreRecovery()) {
    recoverFromCorruptedFirestorePersistence().finally(() => window.location.reload());
    return true;
  }

  return false;
}

/** O app não subiu. Pinta a tela de falha — só se `#root` estiver mesmo vazio. */
export function reportFatalError(error: unknown) {
  console.error('[globalErrorHandler] fatal:', error);

  if (handledAsCorruption(error) || alreadyReported || !rootIsEmpty()) {
    return;
  }

  alreadyReported = true;
  renderFatalScreen(error);
}

/**
 * Promise rejeitada sem catch. NUNCA pinta tela: este app grava em fire-and-forget de propósito
 * (ver a regra offline-first no CLAUDE.md), então rejeição solta é rotina — some com a internet
 * e volta depois. Cobrir a UI por causa disso quebraria o uso offline. O que vale a pena aqui é
 * só o caso auto-recuperável, que nasce assíncrono e por isso nenhum boundary do React alcança.
 */
function reportAsyncError(error: unknown) {
  console.error('[globalErrorHandler] async:', error);
  handledAsCorruption(error);
}

export function installGlobalErrorHandler() {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (event) => {
    // Falha ao CARREGAR um recurso (script/css) também dispara 'error', mas com o elemento
    // como target e sem `error` preenchido. Um chunk que sumiu do servidor cai aqui.
    if (event.error) {
      reportFatalError(event.error);
      return;
    }

    // Só script DO PRÓPRIO app conta como fatal. Recurso de terceiro (fonte do Google, gstatic,
    // tag de analytics) falha o tempo todo em rede ruim e OFFLINE — e offline é operação normal
    // aqui, não erro. Tratar isso como fatal cobriria o app funcionando com uma tela de falha,
    // que é exatamente o contrário do que este arquivo existe pra fazer.
    const target = event.target;
    if (target instanceof HTMLScriptElement && target.src.startsWith(window.location.origin)) {
      reportFatalError(new Error('Falha ao carregar um arquivo do app.'));
    }
  }, true); // captura: erro de carregamento de recurso não sobe por bubbling

  window.addEventListener('unhandledrejection', (event) => {
    reportAsyncError(event.reason);
  });
}

installGlobalErrorHandler();
