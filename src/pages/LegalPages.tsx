import { Seo } from '../components/Seo';
import { PublicLayout } from './PublicLayout';

const legalVersion = 'zerou-v12.2-legal-draft-2026-06-15';

const documents = {
  terms: {
    title: 'Termos de uso',
    description: 'Termos de uso da Zerou em rascunho, com revisão jurídica pendente.',
    path: '/legal/terms',
    sections: [
      ['Escopo', 'A Zerou organiza finanças pessoais e a dois, mantendo espaços individuais e compartilhados separados.'],
      ['Conta', 'O usuário é responsável por manter seus métodos de acesso seguros e por revisar dados inseridos no app.'],
      ['Uso gratuito atual', 'Nesta etapa, a Zerou está 100% gratuita. Cobrança futura só deve ocorrer após comunicação e aceite adequados.'],
      ['Limitações', 'A Zerou não substitui aconselhamento financeiro, jurídico, contábil ou tributário.'],
      ['Placeholder jurídico', '[PREENCHER CNPJ, razão social, endereço, foro, SLA de suporte e regras finais de encerramento de conta].']
    ]
  },
  privacy: {
    title: 'Política de privacidade',
    description: 'Política de privacidade da Zerou em rascunho, com revisão jurídica pendente.',
    path: '/legal/privacy',
    sections: [
      ['Dados tratados', 'Conta, email, perfil, preferências, workspaces, registros financeiros inseridos pelo usuário e solicitações LGPD.'],
      ['Finalidade', 'Autenticar, salvar dados financeiros, sincronizar dispositivos, operar espaço compartilhado e responder solicitações de privacidade.'],
      ['Compartilhamento', 'Dados pessoais não são vendidos. Fornecedores técnicos podem processar dados para hospedagem, autenticação e infraestrutura.'],
      ['Direitos LGPD', 'O Centro de privacidade permite registrar pedidos de correção, exportação, exclusão e revogação de marketing.'],
      ['Placeholder jurídico', '[PREENCHER controlador, encarregado/DPO, base legal por finalidade, prazos finais e canal oficial].']
    ]
  },
  cookies: {
    title: 'Política de cookies',
    description: 'Política de cookies da Zerou em rascunho, com categorias necessárias, preferências, analytics e marketing.',
    path: '/legal/cookies',
    sections: [
      ['Necessários', 'Usados para autenticação, segurança básica, tema, PWA e funcionamento do app. Ficam sempre ativos.'],
      ['Preferências', 'Guardam escolhas como consentimento, aparência e preferências de produto no dispositivo.'],
      ['Analytics', 'Só é inicializado após consentimento explícito. Pode ser recusado sem impedir o uso do app.'],
      ['Marketing', 'Reservado para campanhas futuras e desativado por padrão.'],
      ['Placeholder jurídico', '[PREENCHER lista final de cookies, duração, fornecedores e base legal].']
    ]
  },
  subprocessors: {
    title: 'Subprocessadores',
    description: 'Lista preliminar de subprocessadores da Zerou em rascunho, com revisão jurídica pendente.',
    path: '/legal/subprocessors',
    sections: [
      ['Firebase / Google Cloud', 'Autenticação, banco de dados Firestore, Storage, Functions futuras e infraestrutura.'],
      ['Vercel', 'Hospedagem do frontend, entrega de assets e logs técnicos de deploy.'],
      ['Stripe', 'Infraestrutura futura de billing. No lançamento gratuito, checkout não fica ativo para usuários.'],
      ['Email provider', 'Adapter preparado, mas envio real exige provedor configurado e variáveis server-side.'],
      ['Placeholder jurídico', '[PREENCHER DPA, regiões de processamento, contatos e notificações de mudança].']
    ]
  }
} as const;

export function TermsPage() {
  return <LegalDocument kind="terms" />;
}

export function PrivacyPolicyPage() {
  return <LegalDocument kind="privacy" />;
}

export function CookiePolicyPage() {
  return <LegalDocument kind="cookies" />;
}

export function SubprocessorsPage() {
  return <LegalDocument kind="subprocessors" />;
}

function LegalDocument({ kind }: { kind: keyof typeof documents }) {
  const document = documents[kind];

  return (
    <PublicLayout>
      <Seo title={document.title} description={document.description} path={document.path} />
      <article className="public-section legal-document">
        <p className="eyebrow">Documento versionado</p>
        <h1 className="marketing-title">{document.title}</h1>
        <p className="notice notice--danger">
          Versão {legalVersion}. Rascunho operacional pendente de revisão jurídica. Não usar como parecer legal final.
        </p>
        {document.sections.map(([title, body]) => (
          <section className="legal-section" key={title}>
            <h2>{title}</h2>
            <p>{body}</p>
          </section>
        ))}
      </article>
    </PublicLayout>
  );
}
