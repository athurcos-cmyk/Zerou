import { Seo } from '../components/Seo';
import { PublicLayout } from './PublicLayout';

const documents = {
  terms: {
    title: 'Termos de uso',
    description: 'Termos de uso da Granativa para organização financeira pessoal e compartilhada.',
    path: '/legal/terms',
    updatedAt: 'Atualizado em 15/06/2026',
    sections: [
      [
        'Aceitação dos termos',
        'Ao criar uma conta, acessar ou usar a Granativa, você declara que leu e concorda com estes Termos de uso e com a Política de privacidade. Se não concordar, não use o app.'
      ],
      [
        'O que é a Granativa',
        'a Granativa é um aplicativo web progressivo de organização financeira pessoal e compartilhada. O app ajuda a registrar contas, receitas, despesas, cartões, faturas, compromissos e combinados entre duas pessoas, mantendo separado o que é individual e o que é compartilhado.'
      ],
      [
        'O que a Granativa não é',
        'a Granativa não é banco, instituição de pagamento, carteira digital, corretora, consultoria financeira, consultoria contábil, consultoria jurídica ou consultoria tributária. As informações exibidas são organizacionais e dependem dos dados que você inserir. Antes de tomar decisões financeiras relevantes, confira os dados e, quando necessário, procure orientação profissional.'
      ],
      [
        'Conta e segurança',
        'Você é responsável por manter seus dados de cadastro corretos, proteger seu login, não compartilhar sua conta com terceiros e avisar a Granativa se suspeitar de uso indevido. a Granativa pode bloquear ou limitar acessos que indiquem fraude, abuso, violação destes termos ou risco de segurança.'
      ],
      [
        'Dados inseridos pelo usuário',
        'Você é responsável pela veracidade, legalidade e atualização dos lançamentos, categorias, comentários, valores, datas, faturas, convites e demais informações que registrar. Evite inserir dados de terceiros que não sejam necessários para a organização financeira.'
      ],
      [
        'Espaço compartilhado',
        'Ao criar ou aceitar um convite de espaço compartilhado, você entende que as informações lançadas nesse espaço poderão ser vistas pela outra pessoa participante. Contas, cartões, transações e histórico do espaço individual não são compartilhados automaticamente.'
      ],
      [
        'Uso gratuito',
        'O uso atual da Granativa é gratuito. Se a Granativa oferecer recursos pagos no futuro, qualquer cobrança dependerá de comunicação clara, preço informado e aceite próprio antes da contratação.'
      ],
      [
        'Uso adequado',
        'Você não deve usar a Granativa para atividades ilegais, fraude, lavagem de dinheiro, violação de direitos de terceiros, tentativa de invasão, engenharia reversa indevida, sobrecarga do serviço ou envio de conteúdo abusivo.'
      ],
      [
        'Disponibilidade e atualizações',
        'a Granativa busca manter o app estável, mas o serviço pode passar por manutenções, atualizações, falhas de conexão, indisponibilidade de fornecedores, mudanças de navegador, problemas de dispositivo ou ajustes de segurança. Atualizações podem alterar telas, recursos e regras de uso para melhorar o produto.'
      ],
      [
        'Propriedade intelectual',
        'A marca Granativa, a interface, os textos, o design, os fluxos, a identidade visual e o código do app pertencem aos seus titulares. O uso do app não transfere propriedade intelectual ao usuário.'
      ],
      [
        'Encerramento e exclusão',
        'Você pode parar de usar a Granativa a qualquer momento. A exclusão definitiva de conta ocorre pelas Configurações do app, na área de Segurança, com confirmação expressa e reautenticação quando exigida pelo Firebase. Algumas informações podem ser mantidas pelo tempo necessário para segurança, prevenção de fraude, cumprimento legal, resolução de disputas ou exercício regular de direitos.'
      ],
      [
        'Responsabilidade',
        'Na extensão permitida pela lei brasileira, a Granativa não se responsabiliza por prejuízos decorrentes de dados inseridos incorretamente pelo usuário, decisões financeiras tomadas sem conferência, indisponibilidade temporária, falhas de internet, falhas do dispositivo, uso indevido da conta ou uso contrário a estes termos.'
      ],
      [
        'Lei aplicável',
        'Estes termos são regidos pelas leis brasileiras, incluindo o Código Civil, o Marco Civil da Internet, a Lei Geral de Proteção de Dados e o Código de Defesa do Consumidor quando aplicável. Eventuais controvérsias observarão as regras de competência previstas na legislação brasileira.'
      ],
      [
        'Contato',
        'Dúvidas sobre estes termos podem ser enviadas para suporte@Granativa.app. Solicitações sobre privacidade e dados pessoais podem ser enviadas para privacidade@Granativa.app.'
      ]
    ]
  },
  privacy: {
    title: 'Política de privacidade',
    description: 'Política de privacidade da Granativa conforme a LGPD e a legislação brasileira aplicável.',
    path: '/legal/privacy',
    updatedAt: 'Atualizado em 15/06/2026',
    sections: [
      [
        'Controlador e contato',
        'a Granativa é responsável por tratar os dados pessoais necessários para operar o app. Para assuntos de privacidade, proteção de dados, dúvidas ou exercício de direitos, use o canal privacidade@Granativa.app.'
      ],
      [
        'Dados que podem ser tratados',
        'Podemos tratar nome, email, identificadores de autenticação, preferências de tema, dados dos seus espaços na Granativa, contas, transações, categorias, cartões, faturas, compromissos, recorrências, despesas compartilhadas, comentários, convites, dados técnicos do dispositivo, logs de segurança, registros de suporte e informações que você inserir voluntariamente no app.'
      ],
      [
        'Dados financeiros',
        'a Granativa armazena os registros financeiros que você digita para organizar sua rotina. a Granativa não acessa conta bancária, não movimenta dinheiro, não consulta saldo bancário real, não solicita senha de banco e não vende dados pessoais.'
      ],
      [
        'Finalidades',
        'Usamos dados para criar e proteger sua conta, manter login, salvar preferências, sincronizar informações entre dispositivos, organizar dados financeiros, operar o espaço compartilhado, gerar resumos dentro do app, prevenir abuso, manter segurança, responder suporte, cumprir obrigações legais e melhorar a estabilidade do serviço.'
      ],
      [
        'Bases legais',
        'O tratamento pode se apoiar na execução de contrato ou procedimentos preliminares, cumprimento de obrigação legal ou regulatória, legítimo interesse para segurança e melhoria do serviço, exercício regular de direitos e consentimento quando uma finalidade opcional depender dele.'
      ],
      [
        'Espaço compartilhado',
        'Quando você usa um espaço compartilhado, os lançamentos e comentários criados nesse espaço ficam disponíveis aos membros daquele espaço. Dados do espaço individual não são compartilhados automaticamente com parceiro ou parceira.'
      ],
      [
        'Fornecedores técnicos',
        'Para funcionar, a Granativa pode usar Firebase e Google Cloud para autenticação, banco de dados, segurança e infraestrutura técnica; Vercel para hospedagem, entrega do app, deploy e logs técnicos; e provedores de email ou suporte quando necessários para comunicação operacional. Esses fornecedores processam dados apenas para viabilizar o serviço contratado pela Granativa.'
      ],
      [
        'Transferência internacional',
        'Alguns fornecedores técnicos podem armazenar ou processar dados fora do Brasil. Quando isso ocorrer, a Granativa buscará usar fornecedores com mecanismos contratuais, técnicos e organizacionais compatíveis com a LGPD e com padrões reconhecidos de proteção de dados.'
      ],
      [
        'Cookies e armazenamento local',
        'a Granativa usa tecnologias necessárias como localStorage, IndexedDB, cache do PWA e mecanismos do Firebase Auth para manter login, preferências, funcionamento no celular e segurança básica. Não usamos cookies opcionais de publicidade ou rastreamento por padrão. Se analytics opcional for ativado no futuro, ele deverá respeitar aviso e consentimento quando exigido.'
      ],
      [
        'Retenção e exclusão',
        'Mantemos dados enquanto sua conta estiver ativa ou enquanto forem necessários para funcionamento do app, segurança, prevenção de fraude, cumprimento legal, resolução de disputas ou exercício regular de direitos. Após exclusão de conta, dados serão removidos ou anonimizados conforme a rotina aplicável, respeitadas retenções legais necessárias.'
      ],
      [
        'Segurança',
        'a Granativa usa autenticação, regras de acesso, separação por usuário e por espaço, controles de permissão e práticas de desenvolvimento voltadas à proteção dos dados. Nenhum serviço digital consegue garantir segurança absoluta, por isso também é importante proteger seu login e seu dispositivo.'
      ],
      [
        'Seus direitos',
        'Nos termos da LGPD, você pode solicitar confirmação de tratamento, acesso, correção, anonimização, bloqueio, eliminação, portabilidade, informação sobre compartilhamentos, informação sobre consequências de negar consentimento, revogação de consentimento e revisão de decisões automatizadas quando aplicável.'
      ],
      [
        'Menores de idade',
        'a Granativa é voltada a pessoas capazes de gerir a própria vida financeira. O uso por menores de idade deve ocorrer com autorização e acompanhamento do responsável legal.'
      ],
      [
        'Alterações desta política',
        'Esta política pode ser atualizada para refletir mudanças no app, na operação, nos fornecedores ou na legislação. Mudanças relevantes poderão ser comunicadas pelos canais disponíveis no app.'
      ],
      [
        'Contato',
        'Para privacidade e proteção de dados, escreva para privacidade@Granativa.app. Para suporte geral, escreva para suporte@Granativa.app.'
      ]
    ]
  }
} as const;

export function TermsPage() {
  return <LegalDocument kind="terms" />;
}

export function PrivacyPolicyPage() {
  return <LegalDocument kind="privacy" />;
}

function LegalDocument({ kind }: { kind: keyof typeof documents }) {
  const document = documents[kind];

  return (
    <PublicLayout>
      <Seo title={document.title} description={document.description} path={document.path} />
      <article className="public-section legal-document">
        <p className="eyebrow">Granativa</p>
        <h1 className="marketing-title">{document.title}</h1>
        <p className="text-secondary">{document.updatedAt}</p>
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
