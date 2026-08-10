import { Link } from 'react-router-dom';
import { ArrowRight, HelpCircle, Mail, ShieldCheck } from 'lucide-react';
import { Seo } from '../components/Seo';
import { PublicLayout } from './PublicLayout';

export function FeaturesPage() {
  return (
    <PublicLayout>
      <Seo
        title="Funcionalidades"
        description="Registre pelo app ou pelo WhatsApp com a Vic. Cartões sem contar duas vezes, metas, investimentos, análise por categoria e um espaço do casal com privacidade de verdade."
        path="/features"
      />

      <section className="public-section feat-hero">
        <p className="eyebrow">Funcionalidades</p>
        <h1 className="marketing-title">Manda uma mensagem no WhatsApp. A Vic lança pra você.</h1>
        <p className="marketing-copy">
          Fora do WhatsApp, dá pra fazer tudo direto no app — cartões, contas, metas, investimentos e um espaço só do
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
        intro="3 toques no app ou uma mensagem no WhatsApp — o valor sempre em primeiro lugar."
        items={[
          'Categoria e subcategoria: separa "Mercado" de "Mercado > Farmácia" sem perder a visão geral',
          'Tags pra achar depois ("viagem", "reembolsável"...)',
          'Vic no WhatsApp: manda o gasto por mensagem, sem abrir o app',
          'Campo obrigatório é só o valor — o resto você completa se quiser'
        ]}
      />

      <FeatureGroup
        kicker="Entender"
        title="Cada real, rastreado até a categoria certa."
        items={[
          'Extrato com o saldo do dia, não só a lista de lançamentos',
          'Análise por categoria — o gráfico mostra quem está comendo seu salário',
          'Orçamento por categoria, com barra de limite',
          'Resumo anual: os 12 meses lado a lado'
        ]}
      />

      <FeatureGroup
        kicker="Cartões e contas"
        title="A fatura nunca conta duas vezes."
        items={[
          'Compra fica na fatura; o saldo da conta só muda quando você paga',
          'Parcelamento com antecipação de parcelas quando quiser adiantar',
          'Contas e assinaturas recorrentes, com aviso antes do vencimento',
          'Dinheiro a receber, separado do resto pra nunca contar duas vezes'
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
          'Seu pessoal nunca aparece pro outro — é regra do servidor, não configuração'
        ]}
      />

      <FeatureGroup
        kicker="No seu ritmo"
        title="Funciona onde você já está."
        items={[
          'Web app: sem loja, adiciona um atalho na tela inicial',
          'Funciona offline — registra na hora e sincroniza depois',
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
        description="Como a Granativa separa os dados de cada pessoa, sem prometer segurança absoluta."
        path="/security"
      />
      <section className="public-section sec-hero">
        <p className="eyebrow">Segurança</p>
        <h1 className="marketing-title">Duas contas, uma fronteira que não se move.</h1>
        <p className="marketing-copy">
          Isso não é uma configuração que dá pra esquecer de marcar — é o servidor decidindo o que cada pessoa vê.
          Segurança é prática contínua, não promessa absoluta.
        </p>
      </section>

      <section className="public-section sec-boundary" aria-label="O que é privado e o que é compartilhado">
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
      </section>

      <section className="public-section sec-layers">
        <p className="eyebrow">Em camadas</p>
        <h2 className="sec-layers-title">Do perímetro até o dado.</h2>
        <div className="sec-layers-list">
          <SecLayer n={1} title="Acesso com login" text="O app privado só abre depois de entrar na sua conta." />
          <SecLayer
            n={2}
            title="Dados separados"
            text="A regra que isola seus dados roda no servidor — não é uma opção que dá pra esquecer de marcar."
          />
          <SecLayer
            n={3}
            title="Auditoria do casal"
            text="Ações do espaço compartilhado registram resumo sem salvar código puro de convite."
          />
        </div>
      </section>

      <section className="public-section sec-trust">
        <ShieldCheck size={26} aria-hidden="true" />
        <div>
          <h2>Não pedimos a senha do seu banco.</h2>
          <p>a Granativa não conecta a contas bancárias nem pede suas credenciais. Você registra o que quiser mostrar — o resto continua só seu.</p>
        </div>
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

export function HelpPage() {
  return (
    <PublicLayout>
      <Seo title="Ajuda" description="Ajuda inicial da Granativa para começar, organizar cartões e usar o espaço compartilhado." path="/help" />
      <section className="public-section pricing-hero">
        <p className="eyebrow">Ajuda</p>
        <h1 className="marketing-title">Comece pelo seu espaço pessoal.</h1>
        <p className="marketing-copy">
          Crie a conta, conclua o onboarding, cadastre uma conta financeira e registre suas primeiras movimentações.
        </p>
      </section>
      <section className="public-section faq-grid">
        <div>
          <HelpCircle size={28} aria-hidden="true" />
          <h2>Perguntas rápidas</h2>
        </div>
        <div className="faq-list">
          <details className="surface surface-pad faq-item" open>
            <summary>Como convidar outra pessoa?</summary>
            <p>Entre em Compartilhado, crie o espaço, gere o convite e envie o código ou link para a outra pessoa.</p>
          </details>
          <details className="surface surface-pad faq-item">
            <summary>Como registrar cartão?</summary>
            <p>Use Cartões, crie um cartão e registre compras. Pagamentos de fatura saem de uma conta financeira.</p>
          </details>
          <details className="surface surface-pad faq-item">
            <summary>Posso usar pelo celular?</summary>
            <p>Sim. a Granativa foi pensada primeiro para celular. Abra pelo navegador e adicione o atalho na tela inicial se quiser.</p>
          </details>
        </div>
      </section>
    </PublicLayout>
  );
}

export function ContactPage() {
  return (
    <PublicLayout>
      <Seo title="Contato" description="Canais de contato da Granativa para suporte e privacidade." path="/contact" />
      <section className="public-section split-section">
        <div>
          <p className="eyebrow">Contato</p>
          <h1 className="marketing-title">Fale com a Granativa.</h1>
        </div>
        <div className="contact-list">
          <p>
            <Mail size={18} aria-hidden="true" /> Suporte: <a className="inline-link" href="mailto:suporte@granativa.com.br">suporte@granativa.com.br</a>
          </p>
          <p>
            <Mail size={18} aria-hidden="true" /> Privacidade: <a className="inline-link" href="mailto:privacidade@granativa.com.br">privacidade@granativa.com.br</a>
          </p>
          <Link className="button button--primary" to="/legal/privacy">
            Ver política de privacidade <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </PublicLayout>
  );
}
