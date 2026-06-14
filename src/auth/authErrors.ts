export function getAuthErrorMessage(error: unknown) {
  if (error instanceof Error && error.name === 'FirebaseConfigurationError') {
    return error.message;
  }

  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';

  switch (code) {
    case 'auth/invalid-api-key':
      return 'A chave Firebase do deploy está inválida. Revise VITE_FIREBASE_API_KEY na Vercel.';
    case 'auth/unauthorized-domain':
      return 'Este domínio ainda não está autorizado no Firebase Auth. Adicione zerou-five.vercel.app em Authorized domains.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Confira email e senha para entrar na Zerou.';
    case 'auth/email-already-in-use':
      return 'Este email já tem uma conta Zerou. Tente entrar ou recuperar a senha.';
    case 'auth/popup-closed-by-user':
      return 'A janela do Google foi fechada antes de concluir.';
    case 'auth/provider-already-linked':
      return 'Este método já está vinculado à sua conta Zerou.';
    case 'auth/credential-already-in-use':
      return 'Este acesso pertence a outra conta. A Zerou não mescla UIDs automaticamente.';
    case 'auth/requires-recent-login':
      return 'Por segurança, reautentique-se antes de alterar métodos de acesso.';
    case 'functions/failed-precondition':
    case 'functions/invalid-argument':
    case 'functions/unauthenticated':
    case 'functions/not-found':
    case 'functions/unavailable':
      return 'A fundação Firebase ainda não está pronta neste ambiente. Verifique se as Functions foram implantadas e se as variáveis da Vercel estão corretas.';
    default:
      return 'Não foi possível concluir esta ação agora. Tente novamente.';
  }
}
