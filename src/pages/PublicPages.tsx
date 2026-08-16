import { Link } from 'react-router-dom';
import { ArrowRight, Mail, ShieldCheck } from 'lucide-react';
import { Seo } from '../components/Seo';
import { PublicLayout } from './PublicLayout';

export function FeaturesPage() {
  return (
    <PublicLayout>
      <Seo
        title="Funcionalidades"
        description="Registre pelo app ou pelo WhatsApp com a Vic. Cartões com fatura separada do saldo, metas, investimentos, análise por categoria e um espaço do casal com privacidade de verdade."
        path="/features"
      />

      <section className="public-section feat-hero">
        <p className="eyebrow">Funcionalidades</p>
        <h1 className="marketing-title">Manda uma mensagem no WhatsApp. A Vic lança pra você.</h1>
        <p className="marketing-copy">
          Fora do WhatsApp, dá pra fazer tudo direto no app: cartões, contas, metas, investimentos e um espaço só do
          casal, cada real exatamente onde deveria estar.
        </p>
        <div className="feat-chat" aria-hidden="true">
          <span className="feat-chat-bubble feat-chat-bubble--out">gastei 40 no mercado</span>
          <span className="feat-chat-bubble feat-chat-bubble--in">✅ Lançado: Mercado · R$ 40,00</span>
        </div>
      </section>

      <FeatureGroup
        kicker="Registrar"
        title="Lança em segundos, do jeito que for mais rápido."
        intro="3 toques no app ou uma mensagem no WhatsApp: o valor sempre em primeiro lugar."
        items={[
          'Categoria e subcategoria: separa "Mercado" de "Mercado > Farmácia" sem perder a visão geral',
          'Tags pra achar depois ("viagem", "reembolsável"...)',
          'Vic no WhatsApp: manda o gasto por mensagem, sem abrir o app',
          'Campo obrigatório é só o valor, o resto você completa se quiser'
        ]}
      />

      <FeatureGroup
        kicker="Entender"
        title="Cada real, rastreado até a categoria certa."
        items={[
          'Extrato com o saldo do dia, não só a lista de lançamentos',
          'Análise por categoria: o gráfico mostra quem está comendo seu salário',
          'Orçamento por categoria, com barra de limite',
          'Resumo anual: os 12 meses lado a lado'
        ]}
      />

      <FeatureGroup
        kicker="Cartões e contas"
        title="A fatura fica separada do saldo."
        items={[
          'Compra fica na fatura; o saldo da conta só muda quando você paga',
          'Parcelamento com antecipação de parcelas quando quiser adiantar',
          'Contas e assinaturas recorrentes, com aviso antes do vencimento',
          'Dinheiro a receber, separado do resto da sua conta'
        ]}
      />

      <FeatureGroup
        kicker="Guardar"
        title="Metas e investimentos, com histórico de verdade."
        items={[
          'Metas com progresso, retirada e histórico de cada aporte',
          'Investimentos com valor atualizado e gráfico da evolução'
        ]}
      />

      <FeatureGroup
        kicker="A dois"
        title="Organizam juntos sem abrir a vida financeira inteira."
        items={[
          'Despesas divididas viram um acerto automático: quem deve, quanto',
          'Cofrinho do casal, mostrando quanto cada um guardou',
          'Seu pessoal nunca aparece pro outro: é regra do servidor, não configuração'
        ]}
      />

      <FeatureGroup
        kicker="No seu ritmo"
        title="Funciona onde você já está."
        items={[
          'Web app: sem loja, adiciona um atalho na tela inicial',
          'Funciona offline: registra na hora e sincroniza depois',
          '6 temas visuais, cada pessoa com o seu'
        ]}
      />

      <section className="public-section final-cta">
        <h2>Quer ver isso funcionando no seu mês?</h2>
        <p>Grátis, sem cartão de crédito, em 2 minutos.</p>
        <Link className="button button--primary" to="/register">
          Quero ver meus gastos <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </section>
    </PublicLayout>
  );
}

function FeatureGroup({ kicker, title, intro, items }: { kicker: string; title: string; intro?: string; items: string[] }) {
  return (
    <section className="public-section feat-group">
      <div className="feat-group-head">
        <p className="eyebrow">{kicker}</p>
        <h2 className="feat-group-title">{title}</h2>
        {intro ? <p className="feat-group-intro">{intro}</p> : null}
      </div>
      <ul className="dot-list feat-group-list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export function SecurityPage() {
  return (
    <PublicLayout>
      <Seo
        title="Segurança"
        description="Login protegido e dados isolados por conta: no seu espaço pessoal e, se você abrir, também no do casal."
        path="/security"
      />
      <section className="public-section sec-hero">
        <p className="eyebrow">Segurança</p>
        <h1 className="marketing-title">O que é seu, continua seu.</h1>
        <p className="marketing-copy">
          Sua conta só abre com o seu login. O que você registra fica isolado do de qualquer outra pessoa, inclusive
          dentro do espaço do casal, se um dia você abrir um.
        </p>
      </section>

      <section className="public-section sec-layers">
        <p className="eyebrow">Como protegemos sua conta</p>
        <h2 className="sec-layers-title">Três camadas, sempre ativas.</h2>
        <div className="sec-layers-list">
          <SecLayer n={1} title="Acesso com login" text="O app privado só abre depois de entrar na sua conta, com senha ou Google." />
          <SecLayer
            n={2}
            title="Dados isolados por conta"
            text="Cada conta enxerga só os próprios dados. A regra roda no servidor. O aplicativo não decide isso sozinho."
          />
          <SecLayer
            n={3}
            title="Conexão criptografada"
            text="Tudo que sai do seu aparelho viaja criptografado até o servidor, o mesmo padrão usado por bancos."
          />
        </div>
      </section>

      <section className="public-section sec-trust">
        <ShieldCheck size={26} aria-hidden="true" />
        <div>
          <h2>Não pedimos a senha do seu banco.</h2>
          <p>a Granativa não conecta a contas bancárias nem pede suas credenciais. Você registra o que quiser mostrar. O resto continua só seu.</p>
        </div>
      </section>

      <section className="public-section sec-boundary" aria-label="O que é privado e o que é compartilhado">
        <div>
          <p className="eyebrow">Se for usar com alguém</p>
          <h2 className="sec-layers-title">O espaço do casal não muda a regra.</h2>
          <p className="marketing-copy sec-boundary-intro">
            O espaço a dois é opcional, e só existe se você criar um. Dentro dele, a mesma fronteira continua de pé:
          </p>
        </div>
        <div className="sec-boundary-grid">
          <div className="sec-boundary-side">
            <p className="sec-boundary-label">O que é seu</p>
            <ul>
              <li>Contas e saldos</li>
              <li>Cartões e faturas</li>
              <li>Todo o seu histórico pessoal</li>
            </ul>
          </div>
          <div className="sec-boundary-rule" aria-hidden="true" />
          <div className="sec-boundary-side">
            <p className="sec-boundary-label">O que vocês decidem dividir</p>
            <ul>
              <li>Despesas marcadas como compartilhadas</li>
              <li>Acertos entre o casal</li>
              <li>O cofrinho em comum</li>
            </ul>
          </div>
        </div>
        <p className="text-secondary">Ações do espaço compartilhado registram um resumo, nunca o código do convite.</p>
      </section>

      <section className="public-section final-cta">
        <h2>Quer revisar a documentação de privacidade?</h2>
        <p>Veja como a Granativa trata dados, espaços compartilhados, retenção e solicitações LGPD.</p>
        <Link className="button button--primary" to="/legal/privacy">
          Ver política de privacidade
        </Link>
      </section>
    </PublicLayout>
  );
}

function SecLayer({ n, title, text }: { n: number; title: string; text: string }) {
  return (
    <article className="sec-layer">
      <span className="sec-layer-num" aria-hidden="true">{n}</span>
      <div>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
    </article>
  );
}

interface HelpFaqItem {
  q: string;
  a: string;
  linkTo?: string;
  linkLabel?: string;
}

const helpFaqGroups: { topic: string; id: string; items: HelpFaqItem[] }[] = [
  {
    topic: 'Começando',
    id: 'comecando',
    items: [
      {
        q: 'Preciso conectar minha conta do banco?',
        a: 'Não. a Granativa não conecta a bancos nem pede suas credenciais: você registra o que quiser mostrar, direto no app ou mandando mensagem pra Vic no WhatsApp.'
      },
      { q: 'É de graça?', a: 'Hoje sim: R$ 0, sem cartão de crédito.' },
      {
        q: 'Dá pra usar só pelo celular?',
        a: 'Sim, é assim que a Granativa foi pensada. Abra pelo navegador do celular e adicione o atalho na tela inicial; não precisa de loja de aplicativos.'
      }
    ]
  },
  {
    topic: 'Espaço do casal',
    id: 'espaco-do-casal',
    items: [
      {
        q: 'Meu parceiro vai ver meus gastos?',
        a: 'Só o que vocês decidirem colocar no espaço do casal. Contas, cartões e lançamentos do seu espaço pessoal continuam invisíveis pra ele. É regra aplicada no servidor, não uma configuração sua.'
      },
      {
        q: 'Como convidar meu parceiro?',
        a: 'Entre em Compartilhado, crie o espaço, gere o convite e envie o código ou link para a outra pessoa.'
      },
      {
        q: 'Dá pra sair do espaço do casal depois?',
        a: 'Sim, a qualquer momento. Sair não cancela nada: cofrinho, despesas e acertos continuam intactos, só o vínculo entre as contas é desfeito.'
      }
    ]
  },
  {
    topic: 'Cartões e faturas',
    id: 'cartoes-e-faturas',
    items: [
      {
        q: 'Como registro um cartão?',
        a: 'Use Cartões, crie o cartão e registre as compras. O saldo da conta só muda quando você marca a fatura como paga. A compra fica na fatura até lá.'
      },
      {
        q: 'Uma compra parcelada conta o valor todo de uma vez?',
        a: 'Não, cada parcela entra só no mês da fatura em que ela cai.'
      }
    ]
  },
  {
    topic: 'Conta e privacidade',
    id: 'conta-e-privacidade',
    items: [
      {
        q: 'Como excluo minha conta e meus dados?',
        a: 'Direto pelo app, em Configurações > Segurança > Métodos de login, sem precisar escrever pra ninguém.',
        linkTo: '/legal/data-deletion',
        linkLabel: 'Ver o passo a passo'
      },
      {
        q: 'Meus dados são privados?',
        a: 'Sim, cada conta só enxerga os próprios dados, mesmo dentro do espaço do casal.',
        linkTo: '/security',
        linkLabel: 'Ver como protegemos sua conta'
      }
    ]
  }
];

const helpFaqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: helpFaqGroups.flatMap((group) =>
    group.items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a }
    }))
  )
};

export function HelpPage() {
  return (
    <PublicLayout>
      <Seo
        title="Ajuda"
        description="Como começar, convidar o parceiro pro espaço do casal, registrar cartão e excluir sua conta na Granativa."
        path="/help"
      />
      <section className="public-section help-hero">
        <p className="eyebrow">Ajuda</p>
        <h1 className="marketing-title">Comece pelo seu espaço pessoal.</h1>
        <p className="marketing-copy">
          Crie a conta, cadastre uma conta financeira e registre suas primeiras movimentações. O espaço do casal é
          opcional, pra quando você quiser.
        </p>
        <nav className="help-jump" aria-label="Ir para um tópico">
          {helpFaqGroups.map((group) => (
            <a key={group.id} className="help-jump-chip" href={`#${group.id}`}>
              {group.topic}
            </a>
          ))}
        </nav>
      </section>

      {helpFaqGroups.map((group) => (
        <section className="public-section help-group feat-group" id={group.id} key={group.topic}>
          <div className="feat-group-head">
            <h2 className="feat-group-title">{group.topic}</h2>
          </div>
          <div className="faq-list">
            {group.items.map((item) => (
              <details className="surface surface-pad faq-item" key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
                {item.linkTo ? (
                  <Link className="inline-link" to={item.linkTo}>
                    {item.linkLabel}
                  </Link>
                ) : null}
              </details>
            ))}
          </div>
        </section>
      ))}
      {/* Schema derivado do mesmo array que renderiza a lista visível — impossível desalinhar. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(helpFaqSchema) }} />

      <section className="public-section final-cta">
        <h2>Ainda com dúvida?</h2>
        <p>Escreva pro suporte. A gente lê tudo.</p>
        <Link className="button button--primary" to="/contact">
          Falar com a gente <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </section>
    </PublicLayout>
  );
}

export function ContactPage() {
  return (
    <PublicLayout>
      <Seo title="Contato" description="Fale com o suporte da Granativa ou tire dúvidas sobre privacidade e seus dados." path="/contact" />
      <section className="public-section contact-hero">
        <p className="eyebrow">Contato</p>
        <h1 className="marketing-title">Fale com a gente.</h1>
        <p className="marketing-copy">
          Dúvida, erro no app ou pedido sobre os seus dados: escreva direto pro canal certo, sem formulário
          escondendo o que você quer perguntar.
        </p>
      </section>

      <section className="public-section privacy-action-grid contact-cards">
        <article className="surface surface-pad privacy-action-card">
          <span className="empty-icon">
            <Mail size={22} aria-hidden="true" />
          </span>
          <h2>Suporte</h2>
          <p>Erro no app, dúvida sobre como algo funciona ou sugestão de melhoria.</p>
          <a className="button button--secondary" href="mailto:suporte@granativa.com.br">
            suporte@granativa.com.br
          </a>
        </article>
        <article className="surface surface-pad privacy-action-card">
          <span className="empty-icon">
            <ShieldCheck size={22} aria-hidden="true" />
          </span>
          <h2>Privacidade e dados</h2>
          <p>Pedido de exclusão de conta, dúvida sobre LGPD ou como usamos suas informações.</p>
          <a className="button button--secondary" href="mailto:privacidade@granativa.com.br">
            privacidade@granativa.com.br
          </a>
        </article>
      </section>

      <section className="public-section final-cta">
        <h2>Sua dúvida já pode estar respondida</h2>
        <p>Como convidar alguém, registrar cartão ou usar pelo celular: veja a Ajuda antes de escrever.</p>
        <Link className="button button--primary" to="/help">
          Ver Ajuda <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </section>
    </PublicLayout>
  );
}
