export function getAuthErrorMessage(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';

  switch (code) {
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
      return typeof error === 'object' && error && 'message' in error
        ? String(error.message)
        : 'Não foi possível concluir esta etapa.';
    default:
      return 'Não foi possível concluir esta ação agora. Tente novamente.';
  }
}
