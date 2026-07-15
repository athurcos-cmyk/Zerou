import { Seo } from '../components/Seo';
import { PublicLayout } from './PublicLayout';

const documents = {
  terms: {
    title: 'Termos de uso',
    description: 'Termos de uso da Granativa para organização financeira pessoal e compartilhada.',
    path: '/legal/terms',
    updatedAt: 'Última atualização: 15 de julho de 2026',
    sections: [
      [
        '1. Aceitação',
        'Ao criar uma conta, acessar ou utilizar a Granativa, você declara que leu, compreendeu e concorda integralmente com estes Termos de Uso e com a Política de Privacidade. Se não concordar com qualquer disposição aqui contida, não utilize o app. Estes Termos constituem contrato vinculante entre você e a Granativa.'
      ],
      [
        '2. Descrição do serviço',
        '2.1. A Granativa é um aplicativo web progressivo (PWA) de organização financeira pessoal e compartilhada, acessível via navegador e instalável como app em dispositivos móveis e desktop. 2.2. O app permite registrar contas, receitas, despesas, cartões de crédito, faturas, contas a pagar, recorrências, metas financeiras e orçamentos. 2.3. Oferece modo individual e modo compartilhado entre duas pessoas (espaço do casal), com separação explícita entre os dados de cada espaço. 2.4. Como funcionalidade opcional, permite o lançamento de transações por mensagem de WhatsApp, processada por inteligência artificial para extrair informações financeiras do texto.'
      ],
      [
        '3. Limitações do serviço',
        'A Granativa NÃO é: (a) instituição financeira, banco, fintech, instituição de pagamento ou carteira digital; (b) corretora de valores ou consultoria de investimentos; (c) consultoria contábil, fiscal, jurídica ou tributária; (d) ferramenta oficial de declaração de imposto de renda. As informações exibidas são exclusivamente organizacionais e dependem dos dados que você inserir manualmente ou por WhatsApp. O app não acessa, consulta ou movimenta contas bancárias reais. Recomendamos conferir os dados periodicamente e buscar orientação profissional qualificada antes de tomar decisões financeiras relevantes.'
      ],
      [
        '4. Cadastro, conta e segurança',
        '4.1. Para usar a Granativa, você precisa criar uma conta fornecendo informações verdadeiras, precisas e atualizadas. 4.2. Você é o único responsável por: (a) manter a confidencialidade de suas credenciais de acesso; (b) todas as atividades realizadas em sua conta; (c) manter seu dispositivo e navegador seguros; (d) não compartilhar sua conta com terceiros. 4.3. Você deve nos notificar imediatamente pelo e-mail suporte@granativa.app em caso de uso não autorizado ou suspeita de violação de segurança. 4.4. A Granativa reserva-se o direito de suspender, bloquear ou encerrar contas que: (a) violem estes Termos; (b) apresentem indícios de fraude, abuso ou atividade ilegal; (c) representem risco à segurança da plataforma ou de outros usuários.'
      ],
      [
        '5. Responsabilidade pelos dados inseridos',
        '5.1. Você é integralmente responsável pela veracidade, exatidão, legalidade e atualização de todos os dados que inserir na Granativa, incluindo: valores, datas, categorias, descrições, contas, cartões, faturas, metas, orçamentos, convites para espaço compartilhado, comentários e mensagens enviadas via WhatsApp. 5.2. Você se compromete a não inserir dados financeiros de terceiros sem autorização, exceto quando estritamente necessário para a organização financeira do espaço compartilhado. 5.3. A Granativa não audita, valida ou verifica a exatidão dos dados inseridos pelos usuários.'
      ],
      [
        '6. Integração com WhatsApp (funcionalidade opcional)',
        '6.1. O lançamento de transações via WhatsApp é uma funcionalidade opcional. Para utilizá-la, você precisa vincular seu número de WhatsApp à sua conta Granativa por meio de código de verificação gerado no app. 6.2. As mensagens enviadas ao bot são processadas por inteligência artificial exclusivamente para extrair valor, descrição e categoria do gasto, gerando um lançamento automático na sua conta. 6.3. Você pode desvincular o WhatsApp a qualquer momento pelas Configurações do app. 6.4. A Granativa não envia mensagens promocionais, de marketing ou de cobrança pelo WhatsApp. 6.5. A funcionalidade utiliza a API oficial da Meta (WhatsApp Cloud API) e está sujeita aos termos e políticas da Meta, além destes Termos. A disponibilidade do serviço de WhatsApp depende da infraestrutura da Meta e pode ser afetada por alterações nos termos, preços ou políticas da plataforma.'
      ],
      [
        '7. Espaço compartilhado',
        '7.1. Ao criar ou aceitar um convite para espaço compartilhado, você entende e concorda que: (a) os lançamentos, comentários, metas e contribuições criados nesse espaço ficarão visíveis para todos os membros ativos daquele espaço; (b) dados do seu espaço individual (contas, cartões, transações pessoais) não são compartilhados automaticamente com o parceiro ou parceira. 7.2. O espaço compartilhado é limitado a duas pessoas (casal) e exige aceitação explícita de convite para ingresso.'
      ],
      [
        '8. Natureza gratuita e alterações futuras',
        '8.1. O uso atual da Granativa é integralmente gratuito, sem cobrança de assinatura, taxas de uso ou funcionalidades pagas. 8.2. A Granativa poderá oferecer planos, recursos ou funcionalidades pagas no futuro. Qualquer introdução de cobrança será comunicada com antecedência razoável, com informação clara de preço e escopo, e dependerá de aceitação expressa antes da contratação. Funcionalidades gratuitas existentes não serão removidas ou tornadas pagas de forma retroativa sem comunicação e alternativa razoável.'
      ],
      [
        '9. Condutas vedadas',
        'Você se compromete a não: (a) utilizar a Granativa para atividades ilegais, fraudulentas ou contrárias à legislação brasileira; (b) violar direitos de propriedade intelectual, privacidade ou imagem de terceiros; (c) tentar obter acesso não autorizado a sistemas, contas ou dados de outros usuários; (d) realizar engenharia reversa, descompilação ou extração não autorizada do código-fonte, exceto nos limites legais; (e) sobrecarregar, prejudicar ou interromper o funcionamento da plataforma, inclusive por ataques de negação de serviço ou uso abusivo de requisições; (f) enviar conteúdo abusivo, difamatório, discriminatório, pornográfico ou que viole direitos humanos; (g) utilizar a plataforma para lavagem de dinheiro, financiamento ao terrorismo ou qualquer outra atividade criminosa; (h) criar contas falsas, utilizar identidade de terceiros sem autorização ou burlar sistemas de autenticação e segurança.'
      ],
      [
        '10. Disponibilidade do serviço',
        '10.1. A Granativa envidará esforços comercialmente razoáveis para manter o app disponível e funcional 24 horas por dia, 7 dias por semana. 10.2. O serviço pode sofrer interrupções programadas para manutenção e atualização, bem como interrupções não programadas decorrentes de: falhas de infraestrutura de terceiros (Firebase, Google Cloud, Vercel, Meta), problemas de conectividade de internet, ataques cibernéticos, casos fortuitos ou força maior. 10.3. A Granativa não garante disponibilidade ininterrupta ou livre de erros. 10.4. Atualizações do app podem alterar telas, funcionalidades, fluxos e regras de uso, sempre com o objetivo de melhorar o produto e a segurança.'
      ],
      [
        '11. Propriedade intelectual',
        '11.1. Todos os direitos de propriedade intelectual sobre a marca "Granativa", sua identidade visual, logotipos, interface, design, textos, ícones, fluxos de interação e código-fonte pertencem exclusivamente ao seu titular ou a terceiros licenciadores. 11.2. Estes Termos não transferem ao usuário qualquer direito de propriedade intelectual, conferindo apenas uma licença limitada, não exclusiva, intransferível e revogável para uso do app conforme aqui disposto. 11.3. O usuário mantém a propriedade sobre os dados financeiros que inserir no app, concedendo à Granativa uma licença limitada para processá-los conforme necessário à prestação do serviço e ao cumprimento destes Termos.'
      ],
      [
        '12. Exclusão de conta e encerramento',
        '12.1. Você pode encerrar sua conta a qualquer momento pela área de Configurações > Segurança no app, mediante confirmação expressa e reautenticação conforme exigido pelo Firebase Auth. O processo de exclusão remove seus dados pessoais, espaço individual, espaços de casal criados por você e demais registros associados, respeitadas as retenções legais descritas na Política de Privacidade. 12.2. A Granativa pode encerrar ou suspender sua conta, mediante notificacao prévia, nas hipóteses de violação destes Termos ou quando exigido por lei ou autoridade competente.'
      ],
      [
        '13. Limitação de responsabilidade',
        '13.1. Na extensão máxima permitida pela legislação brasileira, a Granativa não será responsável por: (a) prejuízos ou danos decorrentes de dados inseridos incorretamente pelo usuário; (b) decisões financeiras, de investimento ou de qualquer natureza tomadas com base nas informações exibidas pelo app sem conferência independente; (c) indisponibilidade temporária do serviço por causas não imputáveis à Granativa; (d) falhas de conectividade de internet, rede móvel ou dispositivo do usuário; (e) uso indevido da conta por terceiros em razão de negligência do usuário na guarda de suas credenciais; (f) danos indiretos, lucros cessantes ou perda de receita, exceto quando decorrentes de dolo ou culpa grave. 13.2. A responsabilidade da Granativa por danos diretos decorrentes de falha na prestação do serviço é limitada, em qualquer caso, ao valor equivalente a R$ 100,00 (cem reais), salvo disposição legal em contrário. 13.3. As limitações deste item não afastam direitos indisponíveis do consumidor previstos no Código de Defesa do Consumidor, quando aplicável.'
      ],
      [
        '14. Privacidade e proteção de dados',
        'O tratamento de dados pessoais é regido pela Política de Privacidade, que integra estes Termos para todos os fins. Ao aceitar estes Termos, você também declara ter lido e compreendido a Política de Privacidade. Em caso de conflito entre estes Termos e a Política de Privacidade em matéria de proteção de dados, prevalecerá a Política de Privacidade.'
      ],
      [
        '15. Lei aplicável e resolução de conflitos',
        '15.1. Estes Termos são regidos pelas leis da República Federativa do Brasil, incluindo o Código Civil (Lei nº 10.406/2002), o Marco Civil da Internet (Lei nº 12.965/2014), a Lei Geral de Proteção de Dados (Lei nº 13.709/2018) e o Código de Defesa do Consumidor (Lei nº 8.078/1990) quando aplicável. 15.2. Em caso de controvérsia, as partes envidarão esforços para solução amigável. Não sendo possível, fica eleito o foro da comarca de São Paulo - SP, com exclusão de qualquer outro, por mais privilegiado que seja, ressalvada a competência territorial do domicílio do consumidor prevista no CDC.'
      ],
      [
        '16. Alterações nos termos',
        '16.1. Estes Termos podem ser atualizados periodicamente. A data da última atualização constará no topo desta página. 16.2. Alterações relevantes serão comunicadas por e-mail e/ou por aviso no app com pelo menos 7 (sete) dias de antecedência. 16.3. O uso continuado do app após a entrada em vigor dos novos termos constitui aceitação tácita das alterações.'
      ],
      [
        '17. Disposições gerais',
        '17.1. Se qualquer disposição destes Termos for considerada inválida, ilegal ou inexequível por autoridade competente, as demais disposições permanecerão em pleno vigor. 17.2. A omissão ou tolerância da Granativa em exigir o cumprimento de qualquer cláusula não constitui renúncia ou novação. 17.3. O usuário não pode ceder ou transferir seus direitos e obrigações decorrentes destes Termos sem consentimento prévio da Granativa.'
      ],
      [
        '18. Contato',
        'Para suporte técnico, dúvidas sobre o app ou sobre estes Termos: suporte@granativa.app. Para privacidade, proteção de dados e exercício de direitos LGPD: privacidade@granativa.app.'
      ]
    ]
  },
  privacy: {
    title: 'Política de privacidade',
    description: 'Política de privacidade da Granativa conforme a Lei Geral de Proteção de Dados (LGPD), Marco Civil da Internet e legislação brasileira aplicável.',
    path: '/legal/privacy',
    updatedAt: 'Última atualização: 15 de julho de 2026',
    sections: [
      [
        '1. Introdução',
        'A Granativa ("plataforma", "app", "nós") é um aplicativo web progressivo (PWA) de organização financeira pessoal e compartilhada. Esta Política de Privacidade descreve como coletamos, usamos, armazenamos, compartilhamos e protegemos os dados pessoais dos usuários ("você", "titular") em conformidade com a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018 — LGPD), o Marco Civil da Internet (Lei nº 12.965/2014) e demais normas aplicáveis à proteção de dados no Brasil. Ao utilizar a Granativa, você declara ter lido e compreendido esta política. Se não concordar com qualquer disposição aqui descrita, não utilize o app.'
      ],
      [
        '2. Quem é o controlador dos dados',
        'A Granativa, operada por Arthur Thurcos (CPF sob registro), é a controladora dos dados pessoais tratados por meio da plataforma. Para exercer seus direitos como titular, esclarecer dúvidas sobre privacidade ou relatar incidentes de segurança, entre em contato pelo e-mail privacidade@granativa.app. Responderemos em até 15 (quinze) dias úteis, conforme previsto na LGPD.'
      ],
      [
        '3. Quais dados coletamos e como',
        '3.1. Dados fornecidos por você: nome, endereço de e-mail, identificadores de autenticação (Firebase Auth), preferências de aparência (tema, densidade, fonte, avatar), dados financeiros inseridos voluntariamente (contas, categorias, transações, cartões de crédito, faturas, contas a pagar, recorrências, metas financeiras, orçamentos), comentários em despesas compartilhadas, convites para espaço compartilhado e demais informações que você registrar no app. 3.2. Dados da integração com WhatsApp (funcionalidade opcional): ao optar por vincular sua conta Granativa ao WhatsApp, coletamos seu número de telefone, o conteúdo textual das mensagens enviadas ao bot (exclusivamente para extrair valor, descrição e categoria do gasto), o identificador da mensagem (wamid) e metadados de entrega fornecidos pela Meta. Não acessamos sua lista de contatos, foto de perfil, status, conversas privadas fora do bot nem qualquer outro dado do seu WhatsApp que não seja a mensagem voluntariamente enviada ao número da Granativa. 3.3. Dados técnicos coletados automaticamente: endereço IP, tipo de navegador e sistema operacional, logs de acesso e segurança, dados de uso e navegação anonimizados e informações sobre o dispositivo utilizadas exclusivamente para diagnóstico e prevenção de abusos.'
      ],
      [
        '4. Para que usamos seus dados',
        '(a) Criar, autenticar e manter sua conta; (b) Fornecer as funcionalidades do app: registro e categorização de transações, gerenciamento de contas e cartões, controle de contas a pagar, recorrências, metas e orçamentos; (c) Operar o espaço compartilhado entre duas pessoas, quando ativado; (d) Processar mensagens do WhatsApp para gerar lançamentos automáticos, exclusivamente quando você vincular o número e enviar mensagem ao bot; (e) Enviar notificações push de lembrete diário de gastos, vencimentos e alertas de orçamento, conforme suas preferências de notificação; (f) Garantir a segurança da plataforma, prevenir fraudes, detectar e responder a incidentes de segurança; (g) Prestar suporte técnico e responder a solicitações; (h) Cumprir obrigações legais e regulatórias e exercer direitos em processos judiciais, administrativos ou arbitrais; (i) Melhorar a estabilidade e o desempenho do serviço com base em dados agregados e anonimizados.'
      ],
      [
        '5. Bases legais para o tratamento',
        'Tratamos seus dados com fundamento nas seguintes bases legais previstas no art. 7º da LGPD: (a) Execução de contrato ou diligências preliminares (art. 7º, V) — para criar e manter sua conta, fornecer as funcionalidades contratadas e operar o espaço compartilhado; (b) Consentimento (art. 7º, I) — para a integração opcional com WhatsApp, que pode ser revogado a qualquer momento pela desvinculação do número nas Configurações do app; (c) Legítimo interesse (art. 7º, IX) — para segurança da plataforma, prevenção de fraudes e melhorias de estabilidade com dados agregados; (d) Cumprimento de obrigação legal ou regulatória (art. 7º, II) — para atender exigências legais e regulatórias; (e) Exercício regular de direitos (art. 7º, VI) — para defesa em processos judiciais, administrativos ou arbitrais.'
      ],
      [
        '6. Compartilhamento de dados',
        '6.1. Não vendemos, alugamos, licenciamos nem comercializamos dados pessoais para terceiros. 6.2. Compartilhamos dados com fornecedores técnicos estritamente necessários à operação do serviço, na qualidade de operadores, mediante obrigações contratuais de confidencialidade e segurança: (a) Google LLC (Firebase, Firestore, Cloud Functions, Cloud Storage) — autenticação, banco de dados, execução de funções serverless e armazenamento de arquivos, hospedados na região southamerica-east1 (São Paulo); (b) Vercel Inc. — hospedagem do frontend, deploy contínuo e logs técnicos; (c) Meta Platforms, Inc. (WhatsApp Cloud API) — processamento de mensagens do bot, exclusivamente quando você vincula o WhatsApp; os dados trafegam conforme a Política de Dados da Meta e os Termos de Serviço do WhatsApp Business; (d) DeepSeek (Hangzhou DeepSeek Artificial Intelligence Co., Ltd.) — processamento de linguagem natural para extrair informações financeiras do texto das mensagens, sem armazenamento do conteúdo pela DeepSeek após o processamento; (e) Provedores de e-mail — para envio de comunicações operacionais e de suporte. 6.3. Dados do espaço compartilhado: ao ativar um espaço compartilhado, os lançamentos criados nesse espaço ficam visíveis aos membros ativos daquele espaço. Dados do espaço individual nunca são compartilhados automaticamente com o parceiro ou parceira. 6.4. Compartilhamento legal: podemos divulgar dados quando exigido por lei, ordem judicial, autoridade administrativa competente ou para proteção de direitos, segurança e propriedade da Granativa e de seus usuários.'
      ],
      [
        '7. Transferência internacional de dados',
        'Alguns fornecedores técnicos operam servidores fora do Brasil. A Granativa adota as seguintes salvaguardas: (a) preferência por infraestrutura localizada no Brasil sempre que disponível (Firebase/Google Cloud em São Paulo); (b) para fornecedores sem infraestrutura local, exigimos cláusulas contratuais de proteção de dados, obrigações de confidencialidade e mecanismos de segurança compatíveis com a LGPD; (c) a Meta Platforms, Inc. processa dados de mensagens WhatsApp nos Estados Unidos e em outros países, conforme sua própria política de dados; (d) a DeepSeek processa conteúdo textual de mensagens para extração de linguagem natural em servidores próprios, sem retenção do conteúdo após o processamento. Ao utilizar funcionalidades que envolvam esses fornecedores, você consente com a transferência internacional necessária à prestação do serviço, nos termos do art. 33 da LGPD.'
      ],
      [
        '8. Armazenamento e retenção',
        'Os dados pessoais são armazenados em infraestrutura de nuvem com controles de acesso, criptografia em trânsito (TLS) e em repouso, e monitoramento de segurança. Mantemos os dados enquanto sua conta estiver ativa ou enquanto necessário para: (a) cumprir as finalidades descritas nesta política; (b) cumprir obrigações legais de guarda de registros; (c) exercer direitos em processos judiciais, administrativos ou arbitrais; (d) garantir a segurança da plataforma e prevenir fraudes. Dados do WhatsApp (conteúdo de mensagens) não são armazenados de forma permanente — apenas o lançamento financeiro resultante é gravado no seu espaço. O vínculo WhatsApp (número de telefone) é mantido até que você o desvincule ou exclua sua conta. Após a exclusão da conta, os dados são removidos ou anonimizados conforme rotina técnica, respeitados os prazos legais de retenção.'
      ],
      [
        '9. Segurança da informação',
        'Adotamos medidas técnicas e organizacionais para proteger seus dados contra acessos não autorizados, perda, alteração ou destruição: (a) autenticação via Firebase Auth com suporte a múltiplos provedores (Google, e-mail/senha); (b) regras de acesso baseadas em permissão (Firestore Security Rules) com separação lógica entre espaços individuais e compartilhados; (c) criptografia de dados em trânsito (TLS 1.3) e em repouso; (d) monitoramento de logs e alertas de segurança; (e) práticas de desenvolvimento seguro baseadas em revisão de código, validação de entradas e princípio do menor privilégio; (f) políticas de retenção e exclusão definidas. Nenhum sistema digital é invulnerável. Você também é responsável por proteger suas credenciais de acesso, manter seu dispositivo seguro e não compartilhar sua conta com terceiros.'
      ],
      [
        '10. Seus direitos como titular (LGPD)',
        'Nos termos do art. 18 da LGPD, você tem direito a: (I) confirmação da existência de tratamento; (II) acesso aos dados; (III) correção de dados incompletos, inexatos ou desatualizados; (IV) anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade; (V) portabilidade dos dados a outro fornecedor, observados os segredos comercial e industrial; (VI) eliminação de dados tratados com consentimento; (VII) informação sobre compartilhamento de dados com terceiros; (VIII) informação sobre a possibilidade de não fornecer consentimento e consequências; (IX) revogação do consentimento; (X) revisão de decisões automatizadas; (XI) oposição a tratamento baseado em descumprimento da LGPD. Para exercer qualquer desses direitos, envie um e-mail para privacidade@granativa.app com o assunto "LGPD - Direitos do Titular". Antes de atendermos, podemos solicitar informações para confirmar sua identidade.'
      ],
      [
        '11. Uso por menores de idade',
        'A Granativa é voltada a pessoas maiores de 18 anos ou emancipadas, capazes de gerir a própria vida financeira. Menores de 16 a 18 anos podem utilizar a plataforma mediante autorização e supervisão dos pais ou responsáveis legais. Menores de 16 anos não devem criar conta na Granativa. Se você é pai, mãe ou responsável e souber que um menor sob sua guarda forneceu dados sem sua autorização, entre em contato para que possamos tomar as medidas cabíveis.'
      ],
      [
        '12. Cookies e tecnologias similares',
        'A Granativa utiliza cookies estritamente necessários e tecnologias de armazenamento local (localStorage, IndexedDB, Service Worker cache) para funcionalidades essenciais: manutenção de sessão autenticada, preferências de tema e aparência, funcionamento offline (PWA) e segurança. Não utilizamos cookies de publicidade, rastreamento comportamental, redes sociais ou analytics de terceiros sem consentimento prévio e explícito. Caso o app venha a oferecer funcionalidades opcionais de analytics no futuro, isso será precedido de aviso claro e coleta de consentimento quando exigido por lei. Você pode configurar seu navegador para recusar cookies, mas funcionalidades essenciais do app podem ser prejudicadas.'
      ],
      [
        '13. Links para serviços de terceiros',
        'O app pode conter links para serviços externos (ex.: WhatsApp, Google). Esta política não se aplica a esses serviços. Recomendamos a leitura das políticas de privacidade de cada serviço de terceiro antes de utilizá-lo.'
      ],
      [
        '14. Alterações nesta política',
        'Podemos atualizar esta Política de Privacidade periodicamente para refletir mudanças no app, na operação, nos fornecedores técnicos ou na legislação. A data da última atualização estará sempre indicada no topo desta página. Alterações relevantes serão comunicadas por e-mail e/ou por aviso no app com pelo menos 7 (sete) dias de antecedência. O uso continuado do app após a vigência da nova política constitui aceitação das alterações.'
      ],
      [
        '15. Contato e encarregado de dados',
        'Encarregado pelo tratamento de dados pessoais (DPO): Arthur Thurcos. Para exercer seus direitos, esclarecer dúvidas sobre privacidade, relatar incidentes ou fazer reclamações: privacidade@granativa.app. Você também tem o direito de apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD) por meio do site www.gov.br/anpd.'
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
