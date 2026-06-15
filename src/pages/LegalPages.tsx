import { Seo } from '../components/Seo';
import { PublicLayout } from './PublicLayout';

const legalVersion = 'zerou-legal-2026-06-15';

const documents = {
  terms: {
    title: 'Termos de uso',
    description: 'Termos de uso da Zerou para uso gratuito atual do app.',
    path: '/legal/terms',
    sections: [
      ['Serviço', 'A Zerou é um app de organização financeira pessoal e a dois. Ela separa o espaço individual do espaço compartilhado para que cada pessoa decida o que registrar e o que dividir.'],
      ['Conta e acesso', 'Você é responsável por informar dados corretos, proteger seus métodos de login e revisar as informações inseridas no app. Se perceber uso indevido, altere sua senha e fale com a Zerou pelos canais públicos do app.'],
      ['Dados financeiros', 'A Zerou organiza registros lançados pelo usuário, como contas, transações, cartões, faturas, compromissos e recorrências. O app não é banco, instituição de pagamento, consultoria financeira, contábil, jurídica ou tributária.'],
      ['Espaço compartilhado', 'Ao criar ou aceitar um convite, você concorda que os registros lançados no espaço compartilhado poderão ser vistos pela outra pessoa participante. Contas, cartões e histórico pessoal continuam privados por padrão.'],
      ['Uso gratuito atual', 'Nesta etapa, a Zerou é 100% gratuita para usuários finais. Qualquer cobrança futura deverá ser comunicada antes e dependerá de aceite próprio.'],
      ['Disponibilidade e limites', 'A Zerou busca manter o app estável, mas pode passar por manutenção, atualização, falhas de rede, indisponibilidade de fornecedores ou ajustes de segurança. Você deve conferir dados importantes antes de tomar decisões financeiras.'],
      ['Encerramento', 'Você pode parar de usar a Zerou a qualquer momento e solicitar exclusão ou exportação pelo Centro de privacidade. Algumas informações podem ser mantidas pelo período necessário para segurança, auditoria, cumprimento legal ou exercício regular de direitos.'],
      ['Atualizações', 'Estes termos podem ser atualizados para refletir mudanças no produto, exigências legais ou melhorias operacionais. A versão vigente mostra a data de atualização nesta página.']
    ]
  },
  privacy: {
    title: 'Política de privacidade',
    description: 'Política de privacidade da Zerou alinhada à LGPD.',
    path: '/legal/privacy',
    sections: [
      ['Quem trata os dados', 'A Zerou trata dados pessoais para oferecer o app financeiro, manter contas de usuário, proteger acesso, sincronizar informações e operar recursos individuais e compartilhados.'],
      ['Dados tratados', 'Podemos tratar nome, email, identificadores de autenticação, preferências de aparência, dados dos seus espaços na Zerou, registros financeiros que você inserir, convites, solicitações de privacidade, dados técnicos do dispositivo, logs de segurança e informações necessárias para suporte.'],
      ['Finalidades e bases', 'Usamos dados para executar o serviço solicitado por você, cumprir obrigações legais, proteger a plataforma, prevenir abuso, responder solicitações e melhorar a operação. Consentimento é usado apenas quando uma finalidade opcional depender dele, como analytics ou marketing futuros.'],
      ['Espaço compartilhado', 'Dados lançados no espaço compartilhado ficam visíveis aos membros daquele espaço conforme o recurso usado. O que fica no espaço individual não é compartilhado automaticamente.'],
      ['Compartilhamento', 'A Zerou não vende dados pessoais. Fornecedores técnicos podem processar dados apenas para autenticação, banco de dados, hospedagem, entrega do app, suporte operacional e segurança, conforme a lista de subprocessadores.'],
      ['Retenção', 'Mantemos dados enquanto sua conta estiver ativa ou enquanto forem necessários para funcionamento do serviço, segurança, auditoria, cumprimento legal, prevenção de fraude, resolução de disputas ou exercício regular de direitos.'],
      ['Direitos LGPD', 'Você pode solicitar confirmação de tratamento, acesso, correção, anonimização, bloqueio, eliminação, portabilidade, informação sobre compartilhamentos, revogação de consentimento e revisão de decisões automatizadas quando aplicável.'],
      ['Segurança', 'A Zerou usa autenticação, regras de acesso, separação por espaço, armazenamento local controlável e práticas de desenvolvimento voltadas à proteção dos dados. Nenhum serviço digital consegue prometer segurança absoluta.'],
      ['Contato e solicitações', 'Use o Centro de privacidade para registrar pedidos vinculados à sua conta. Se não estiver logado, use os canais públicos de contato disponíveis no app.']
    ]
  },
  cookies: {
    title: 'Política de cookies',
    description: 'Política de cookies e armazenamento local da Zerou.',
    path: '/legal/cookies',
    sections: [
      ['Uso atual', 'A Zerou não usa cookies opcionais de marketing ou analytics por padrão. O app usa armazenamento local necessário para manter login, tema, funcionamento em instabilidades de conexão e segurança básica.'],
      ['Necessários', 'Recursos necessários não dependem de consentimento separado porque permitem que o app funcione, mantenha sessão, aplique preferências essenciais e proteja o acesso. Você pode limpar esses dados pelo navegador, mas isso pode encerrar sessão e remover preferências locais.'],
      ['Analytics', 'Analytics fica desligado por padrão. Se a Zerou ativar medição opcional no futuro, isso deverá ocorrer com aviso e consentimento quando exigido.'],
      ['Marketing', 'Cookies ou identificadores de marketing não estão ativos nesta etapa. Campanhas futuras deverão respeitar consentimento e opção de revogação quando aplicável.'],
      ['Controle pelo usuário', 'Você pode remover dados locais pelo Centro de privacidade, pelo menu de segurança do app ou pelas configurações do navegador.']
    ]
  },
  subprocessors: {
    title: 'Subprocessadores',
    description: 'Subprocessadores técnicos usados ou preparados pela Zerou.',
    path: '/legal/subprocessors',
    sections: [
      ['Firebase / Google Cloud', 'Autenticação, banco de dados, infraestrutura técnica, logs de segurança e recursos de backend quando configurados.'],
      ['Vercel', 'Hospedagem do frontend, entrega de assets, previews, produção e logs técnicos de deploy.'],
      ['Pagamento futuro', 'Fornecedor de pagamento poderá ser usado se a Zerou oferecer planos pagos no futuro. Como a Zerou está gratuita nesta etapa, não há cobrança ativa para usuários finais.'],
      ['Provedor de email', 'Envio de emails transacionais pode ser configurado no futuro para autenticação, suporte e avisos operacionais.'],
      ['Atualizações', 'A lista pode mudar quando fornecedores forem adicionados, removidos ou substituídos. Mudanças relevantes devem ser refletidas nesta página.']
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
        <p className="notice notice--success">
          Versão {legalVersion}. Vigente desde 15/06/2026 para o lançamento gratuito atual da Zerou.
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
