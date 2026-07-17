export function getAuthErrorMessage(error: unknown) {
  if (error instanceof Error && error.name === 'FirebaseConfigurationError') {
    return error.message;
  }

  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';

  switch (code) {
    case 'auth/invalid-api-key':
      return 'A chave Firebase do deploy esta invalida. Revise VITE_FIREBASE_API_KEY na Vercel.';
    case 'auth/unauthorized-domain':
      return 'Este dominio ainda nao esta autorizado no Firebase Auth. Adicione Granativa-five.vercel.app em Authorized domains.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Confira email e senha para entrar na Granativa.';
    case 'auth/email-already-in-use':
      return 'Este email ja tem uma conta Granativa. Tente entrar ou recuperar a senha.';
    case 'auth/popup-closed-by-user':
      return 'A janela do Google foi fechada antes de concluir.';
    case 'auth/user-mismatch':
      return 'Essa é uma conta Google diferente da que você está usando agora. Escolha a mesma conta pra confirmar.';
    case 'auth/provider-already-linked':
      return 'Este metodo ja esta vinculado a sua conta Granativa.';
    case 'auth/credential-already-in-use':
      return 'Este acesso pertence a outra conta. a Granativa nao mescla UIDs automaticamente.';
    case 'auth/requires-recent-login':
      return 'Por seguranca, saia e entre novamente na Granativa antes de continuar.';
    case 'auth/network-request-failed':
      return 'Sua conexao oscilou. Confira o sinal e tente de novo.';
    case 'permission-denied':
      return 'Nao foi possivel salvar agora. Atualize o app e tente novamente. Se continuar, fale com o suporte da Granativa.';
    case 'unavailable':
      return 'Sem conexao estavel com o Firebase agora. Tente novamente em instantes.';
    default:
      if (error instanceof Error && error.message && !error.message.includes('FirebaseError')) {
        return error.message;
      }

      return 'A conexao oscilou e a Granativa nao conseguiu confirmar a acao. Tente novamente em alguns segundos.';
  }
}
