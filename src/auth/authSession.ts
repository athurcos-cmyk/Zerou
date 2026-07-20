// Sinaliza que um signOut/exclusão de conta foi disparado DE PROPÓSITO pelo app.
//
// O `AuthContext.finishBoot` reage a `onAuthStateChanged(null)` restaurando o
// usuário do cache local quando existe perfil salvo — proteção offline pra quando
// o Firebase não consegue renovar o token numa oscilação de rede (não deslogar/
// piscar a tela à toa). Mas esse `null` também chega num logout ou numa exclusão
// de conta REAL, e aí restaurar do cache cria um "usuário-zumbi": uid de uma conta
// que não existe mais no Firebase Auth, que o guard de rota manda pro onboarding e
// acaba gravando dados órfãos.
//
// Este sinal, gravado ANTES do signOut/deleteUser, deixa o `finishBoot` distinguir
// os dois casos: `null` intencional → desloga limpo; `null` inesperado → mantém a
// proteção de cache offline. É module-level (síncrono) de propósito — precisa estar
// setado antes do listener do Auth disparar.

let intentional = false;

export function beginIntentionalSignOut() {
  intentional = true;
}

export function isIntentionalSignOut() {
  return intentional;
}

export function clearIntentionalSignOut() {
  intentional = false;
}
