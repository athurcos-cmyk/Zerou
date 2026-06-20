import { ArrowDownLeft, ArrowUpRight, CreditCard, Home, PieChart, Plus, Wallet } from 'lucide-react';

/**
 * Faithful, self-contained CSS render of the Granix dashboard for landing showcases.
 * No app dependencies — purely presentational with static data.
 */
export function AppMockup({ screen = 'dashboard' }: { screen?: 'dashboard' | 'transaction' }) {
  return (
    <div className="mk-phone" aria-hidden="true">
      <div className="mk-notch" />
      <div className="mk-screen">
        {screen === 'transaction' ? <TransactionScreen /> : <DashboardScreen />}
        <nav className="mk-nav">
          <span className="mk-nav-item mk-nav-item--active"><Home size={18} /></span>
          <span className="mk-nav-item"><Wallet size={18} /></span>
          <span className="mk-fab"><Plus size={20} /></span>
          <span className="mk-nav-item"><PieChart size={18} /></span>
          <span className="mk-nav-item"><CreditCard size={18} /></span>
        </nav>
      </div>
    </div>
  );
}

function DashboardScreen() {
  return (
    <div className="mk-body">
      <div className="mk-statusbar"><span>9:41</span><span className="mk-dots"><i /><i /><i /></span></div>
      <p className="mk-eyebrow">Olá, Arthur</p>
      <h3 className="mk-title">Seu resumo</h3>

      <div className="mk-summary">
        <div className="mk-balance">
          <span className="mk-label">Saldo total</span>
          <strong className="mk-amount">R$ 8.240</strong>
          <span className="mk-sub">Contas ativas</span>
        </div>
        <div className="mk-metrics">
          <div className="mk-metric">
            <span className="mk-label">Disponível</span>
            <strong>R$ 2.480</strong>
          </div>
          <div className="mk-metric">
            <span className="mk-label">Comprometido</span>
            <strong>R$ 1.120</strong>
          </div>
        </div>
      </div>

      <div className="mk-list">
        <div className="mk-row">
          <span className="mk-cat" style={{ background: '#5FA052' }}><ArrowDownLeft size={15} /></span>
          <div className="mk-row-text"><strong>Salário</strong><span>Hoje</span></div>
          <span className="mk-pos">+ R$ 5.200</span>
        </div>
        <div className="mk-row">
          <span className="mk-cat" style={{ background: '#EE5524' }}><ArrowUpRight size={15} /></span>
          <div className="mk-row-text"><strong>Mercado</strong><span>Ontem</span></div>
          <span className="mk-neg">− R$ 318</span>
        </div>
        <div className="mk-row">
          <span className="mk-cat" style={{ background: '#6366C9' }}><CreditCard size={15} /></span>
          <div className="mk-row-text"><strong>Uber</strong><span>Cartão · 2x</span></div>
          <span className="mk-neg">− R$ 47</span>
        </div>
      </div>
    </div>
  );
}

function TransactionScreen() {
  return (
    <div className="mk-body">
      <div className="mk-statusbar"><span>9:41</span><span className="mk-dots"><i /><i /><i /></span></div>
      <div className="mk-hero">
        <div className="mk-typeswitch">
          <span>Receita</span><span className="mk-typeswitch--on">Gasto</span><span>Transfer.</span>
        </div>
        <span className="mk-hero-label">Valor</span>
        <div className="mk-hero-amount"><em>R$</em> 318,00</div>
      </div>
      <div className="mk-tx-fields">
        <div className="mk-field"><span>Título</span><strong>Mercado do mês</strong></div>
        <div className="mk-field mk-field--cat"><span className="mk-cat mk-cat--sm" style={{ background: '#EE5524' }} /><strong>Alimentação</strong></div>
        <div className="mk-field mk-field--cat"><span className="mk-cat mk-cat--sm" style={{ background: '#3B82C4' }} /><strong>Nubank</strong></div>
      </div>
    </div>
  );
}
