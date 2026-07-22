/**
 * Tela final de uma sessão cuja conta não existe mais.
 *
 * Aparece quando o app detecta que a conta foi excluída (normalmente em OUTRO aparelho). O
 * caso que motivou isto: navegador fechado durante a exclusão. Ao reabrir, o app subia com o
 * perfil do cache local e parecia logado — mas nada funcionava, porque no servidor não existia
 * mais nada. Em vez de deixar a pessoa num app inerte, explica o que houve e oferece a saída.
 */
export function AccountDeletedScreen() {
  return (
    <div className="public-page">
      <article
        className="surface surface-pad"
        style={{ maxWidth: '26rem', margin: '0 auto', textAlign: 'center' }}
        role="alert"
      >
        <p className="eyebrow">Sessão encerrada</p>
        <h1 className="page-title page-title--compact" style={{ marginTop: '0.25rem' }}>
          Esta conta foi excluída
        </h1>
        <p className="text-secondary" style={{ margin: '0.75rem 0 1.5rem', lineHeight: 1.6 }}>
          Todos os dados desta conta foram removidos, então esta sessão não vale mais. Se foi
          engano ou você quiser voltar, é só criar uma conta nova.
        </p>
        <button
          className="button button--primary"
          type="button"
          // Recarrega a página inteira de propósito: garante que nenhum estado ou cache da
          // sessão morta sobreviva até a landing.
          onClick={() => window.location.assign('/')}
        >
          Voltar ao início
        </button>
      </article>
    </div>
  );
}
