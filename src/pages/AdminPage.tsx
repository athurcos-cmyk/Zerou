import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Heart,
  Loader2,
  RefreshCw,
  Search,
  Send,
  Trash2,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import {
  callAdminDeleteUser,
  getAdminCoupleWorkspaces,
  getAdminInvites,
  getAdminUsers,
  type AdminInvite,
} from '../admin/adminService';
import type { UserProfile, Workspace } from '../types/contracts';
import type { Timestamp } from 'firebase/firestore';

type Tab = 'overview' | 'users' | 'couples' | 'invites';

function fmtDate(ts: Timestamp | null | undefined): string {
  if (!ts) return '—';
  return ts.toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateRelative(ts: Timestamp | null | undefined): string {
  if (!ts) return '—';
  const d = ts.toDate();
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Hoje';
  if (days === 1) return 'Ontem';
  if (days < 7) return `${days} dias atrás`;
  if (days < 30) return `${Math.floor(days / 7)} sem.`;
  if (days < 365) return `${Math.floor(days / 30)} meses`;
  return `${Math.floor(days / 365)} ano(s)`;
}

function fmtDateFull(ts: Timestamp | null | undefined): string {
  if (!ts) return '—';
  return ts.toDate().toLocaleString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const init = parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`
    : parts[0]?.slice(0, 2) ?? '?';
  return (
    <span className="admin-avatar">{init.toUpperCase()}</span>
  );
}

function StatusPill({ status }: { status: string }) {
  let cls = 'admin-pill';
  if (status === 'active') cls += ' admin-pill--success';
  else if (status === 'accepted') cls += ' admin-pill--info';
  else if (status === 'revoked' || status === 'pending_deletion') cls += ' admin-pill--danger';
  else cls += ' admin-pill--muted';

  const labels: Record<string, string> = {
    active: 'Ativo',
    accepted: 'Aceito',
    revoked: 'Revogado',
    expired: 'Expirado',
    archived: 'Arquivado',
    pending_deletion: 'Deletando',
  };
  return <span className={cls}>{labels[status] ?? status}</span>;
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
}) {
  return (
    <article className="admin-stat">
      <span className="admin-stat__icon">{icon}</span>
      <p className="admin-stat__label">{label}</p>
      <strong className="admin-stat__value display-number">{value}</strong>
      {sub ? <span className="admin-stat__sub">{sub}</span> : null}
    </article>
  );
}

function EmptyRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
        Nenhum registro encontrado.
      </td>
    </tr>
  );
}

function OverviewTab({
  users,
  couples,
  invites,
  userMap,
}: {
  users: UserProfile[];
  couples: Workspace[];
  invites: AdminInvite[];
  userMap: Map<string, UserProfile>;
}) {
  const now = Date.now();
  const thirtyDays = 30 * 86400000;
  const newUsers30d = users.filter((u) => u.createdAt && (now - u.createdAt.toDate().getTime()) < thirtyDays).length;
  const activeInvites = invites.filter((i) => i.status === 'active').length;
  const recentUsers = users.slice(0, 10);
  const recentCouples = couples.slice(0, 6);

  return (
    <div className="admin-content">
      <div className="admin-stats-grid">
        <StatCard
          icon={<Users size={18} />}
          label="Total de usuários"
          value={users.length}
          sub="cadastros ativos"
        />
        <StatCard
          icon={<TrendingUp size={18} />}
          label="Novos (30 dias)"
          value={newUsers30d}
          sub={`de ${users.length} total`}
        />
        <StatCard
          icon={<Heart size={18} />}
          label="Espaços de casal"
          value={couples.length}
          sub="workspaces de dupla"
        />
        <StatCard
          icon={<Send size={18} />}
          label="Convites ativos"
          value={activeInvites}
          sub={`de ${invites.length} total`}
        />
      </div>

      <div className="admin-two-col">
        <section className="surface surface-pad">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Últimos cadastros</p>
              <h2>Usuários recentes</h2>
            </div>
          </div>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Email</th>
                <th>Cadastro</th>
              </tr>
            </thead>
            <tbody>
              {recentUsers.length === 0 ? (
                <EmptyRow cols={3} />
              ) : (
                recentUsers.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <span className="admin-name-cell">
                        <Initials name={u.name} />
                        {u.name}
                      </span>
                    </td>
                    <td className="admin-td--muted">{u.email}</td>
                    <td className="admin-td--muted">{fmtDateRelative(u.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section className="surface surface-pad">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Espaços criados</p>
              <h2>Casais recentes</h2>
            </div>
          </div>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Dono</th>
                <th>Membros</th>
              </tr>
            </thead>
            <tbody>
              {recentCouples.length === 0 ? (
                <EmptyRow cols={3} />
              ) : (
                recentCouples.map((w) => {
                  const owner = userMap.get(w.ownerUserId);
                  return (
                    <tr key={w.id}>
                      <td><strong>{w.name}</strong></td>
                      <td className="admin-td--muted">{owner?.name ?? w.ownerUserId.slice(0, 8) + '…'}</td>
                      <td>
                        <span className="admin-pill admin-pill--info">
                          {w.activeMemberCount ?? 1}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

interface DeleteConfirmProps {
  user: UserProfile;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

function DeleteConfirmModal({ user, onConfirm, onCancel }: DeleteConfirmProps) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const expected = user.name.split(/\s+/)[0]!;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleConfirm() {
    if (input !== expected) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao deletar.');
      setBusy(false);
    }
  }

  return (
    <div className="admin-modal-backdrop" onClick={onCancel}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <span className="admin-modal__icon">
          <AlertTriangle size={22} />
        </span>
        <h2 className="admin-modal__title">Deletar conta permanentemente?</h2>
        <p className="admin-modal__body">
          Isso vai apagar <strong>{user.name}</strong> ({user.email}) do Firebase Auth e todos os dados
          do Firestore — workspace pessoal, espaços de casal criados por ele, transações, cartões,
          metas e billing. <strong>Irreversível.</strong>
        </p>
        <label className="admin-modal__label">
          Digite <strong>{expected}</strong> para confirmar:
        </label>
        <input
          ref={inputRef}
          className="admin-modal__input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && input === expected && !busy && void handleConfirm()}
          placeholder={expected}
          disabled={busy}
        />
        {error ? <p className="admin-modal__error">{error}</p> : null}
        <div className="admin-modal__actions">
          <button
            type="button"
            className="button button--ghost"
            onClick={onCancel}
            disabled={busy}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="button admin-modal__delete-btn"
            onClick={() => void handleConfirm()}
            disabled={input !== expected || busy}
          >
            {busy ? <Loader2 size={15} className="admin-spin" /> : <Trash2 size={15} />}
            Deletar conta
          </button>
        </div>
      </div>
    </div>
  );
}

function UsersTab({ users, onDelete }: { users: UserProfile[]; onDelete: (u: UserProfile) => void }) {
  const [search, setSearch] = useState('');
  const themeLabels: Record<string, string> = {
    paper: 'Paper (Sol)',
    sakura: 'Sakura',
    obsidian: 'Obsidian',
    midnight: 'Midnight',
    aurora: 'Aurora',
    'rose-gold': 'Rose Gold',
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(
      (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  }, [users, search]);

  return (
    <div className="admin-content">
      <div className="admin-search-bar">
        <Search size={16} className="admin-search-icon" />
        <input
          className="admin-search-input"
          type="search"
          placeholder="Buscar por nome ou email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search ? (
          <span className="admin-search-count">{filtered.length} de {users.length}</span>
        ) : null}
      </div>

      <section className="surface">
        <table className="admin-table admin-table--full">
          <thead>
            <tr>
              <th>Usuário</th>
              <th>Email</th>
              <th>Tema</th>
              <th>Cadastro</th>
              <th>Workspace</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <EmptyRow cols={6} />
            ) : (
              filtered.map((u) => (
                <tr key={u.id}>
                  <td>
                    <span className="admin-name-cell">
                      <Initials name={u.name} />
                      <span>
                        <strong>{u.name}</strong>
                        <span className="admin-td--muted admin-uid">UID: {u.id.slice(0, 12)}…</span>
                      </span>
                    </span>
                  </td>
                  <td className="admin-td--muted">{u.email}</td>
                  <td>
                    <span className="admin-pill admin-pill--muted">
                      {themeLabels[u.themeId] ?? u.themeId}
                    </span>
                  </td>
                  <td className="admin-td--muted" title={fmtDateFull(u.createdAt)}>
                    {fmtDate(u.createdAt)}
                  </td>
                  <td className="admin-td--muted admin-monospace">
                    {u.defaultWorkspaceId ? u.defaultWorkspaceId.slice(0, 16) + '…' : '—'}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="admin-delete-row-btn"
                      title="Deletar conta"
                      onClick={() => onDelete(u)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function CouplesTab({
  couples,
  userMap,
}: {
  couples: Workspace[];
  userMap: Map<string, UserProfile>;
}) {
  return (
    <div className="admin-content">
      <section className="surface">
        <table className="admin-table admin-table--full">
          <thead>
            <tr>
              <th>Nome do espaço</th>
              <th>Dono</th>
              <th>Parceiro</th>
              <th>Membros</th>
              <th>Status</th>
              <th>Criado em</th>
            </tr>
          </thead>
          <tbody>
            {couples.length === 0 ? (
              <EmptyRow cols={6} />
            ) : (
              couples.map((w) => {
                const owner = userMap.get(w.ownerUserId);
                const partner = w.partnerUserId ? userMap.get(w.partnerUserId) : null;
                return (
                  <tr key={w.id}>
                    <td><strong>{w.name}</strong></td>
                    <td>
                      {owner ? (
                        <span className="admin-name-cell">
                          <Initials name={owner.name} />
                          <span>
                            <strong>{owner.name}</strong>
                            <span className="admin-td--muted admin-uid">{owner.email}</span>
                          </span>
                        </span>
                      ) : (
                        <span className="admin-td--muted admin-monospace">{w.ownerUserId.slice(0, 12)}…</span>
                      )}
                    </td>
                    <td>
                      {w.partnerUserId ? (
                        partner ? (
                          <span className="admin-name-cell">
                            <Initials name={partner.name} />
                            <span>
                              <strong>{partner.name}</strong>
                              <span className="admin-td--muted admin-uid">{partner.email}</span>
                            </span>
                          </span>
                        ) : (
                          <span className="admin-td--muted admin-monospace">{w.partnerUserId.slice(0, 12)}…</span>
                        )
                      ) : (
                        <span className="admin-td--muted">Aguardando…</span>
                      )}
                    </td>
                    <td>
                      <span className="admin-pill admin-pill--info">{w.activeMemberCount ?? 1}</span>
                    </td>
                    <td><StatusPill status={w.status} /></td>
                    <td className="admin-td--muted" title={fmtDateFull(w.createdAt)}>
                      {fmtDate(w.createdAt)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function InvitesTab({
  invites,
  userMap,
}: {
  invites: AdminInvite[];
  userMap: Map<string, UserProfile>;
}) {
  return (
    <div className="admin-content">
      <section className="surface">
        <table className="admin-table admin-table--full">
          <thead>
            <tr>
              <th>Workspace</th>
              <th>Hint</th>
              <th>Criado por</th>
              <th>Expira em</th>
              <th>Status</th>
              <th>Usado por</th>
              <th>Criado em</th>
            </tr>
          </thead>
          <tbody>
            {invites.length === 0 ? (
              <EmptyRow cols={7} />
            ) : (
              invites.map((inv) => {
                const creator = userMap.get(inv.createdBy);
                const usedByUser = inv.usedBy ? userMap.get(inv.usedBy) : null;
                const isExpired = inv.expiresAt && inv.expiresAt.toDate().getTime() < Date.now();
                return (
                  <tr key={inv.id}>
                    <td>
                      <strong>{inv.workspaceName}</strong>
                      <span className="admin-td--muted admin-uid admin-monospace">
                        {inv.workspaceId.slice(0, 16)}…
                      </span>
                    </td>
                    <td>
                      <span className="admin-pill admin-pill--muted admin-monospace">
                        {inv.codeHint}••••
                      </span>
                    </td>
                    <td className="admin-td--muted">
                      {creator?.name ?? inv.createdBy.slice(0, 8) + '…'}
                    </td>
                    <td className="admin-td--muted" title={fmtDateFull(inv.expiresAt)}>
                      {isExpired
                        ? <span style={{ color: 'var(--danger)' }}>{fmtDate(inv.expiresAt)}</span>
                        : fmtDate(inv.expiresAt)}
                    </td>
                    <td><StatusPill status={inv.status} /></td>
                    <td className="admin-td--muted">
                      {usedByUser ? usedByUser.name : inv.usedBy ? inv.usedBy.slice(0, 8) + '…' : '—'}
                    </td>
                    <td className="admin-td--muted" title={fmtDateFull(inv.createdAt)}>
                      {fmtDateRelative(inv.createdAt)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export function AdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [couples, setCouples] = useState<Workspace[]>([]);
  const [invites, setInvites] = useState<AdminInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<UserProfile | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);

  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [u, c, i] = await Promise.all([
        getAdminUsers(),
        getAdminCoupleWorkspaces(),
        getAdminInvites(),
      ]);
      setUsers(u);
      setCouples(c);
      setInvites(i);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  async function handleDeleteConfirm() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    const result = await callAdminDeleteUser(target.id);
    setUsers((prev) => prev.filter((u) => u.id !== target.id));
    setCouples((prev) => prev.filter((w) => w.ownerUserId !== target.id));
    setInvites((prev) => prev.filter((i) => i.createdBy !== target.id));
    setPendingDelete(null);
    setDeleteSuccess(`${target.name} deletado — ${result.docsDeleted} documentos removidos.`);
    setTimeout(() => setDeleteSuccess(null), 6000);
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview', label: 'Visão Geral' },
    { id: 'users', label: 'Usuários', count: users.length },
    { id: 'couples', label: 'Casais', count: couples.length },
    { id: 'invites', label: 'Convites', count: invites.length },
  ];

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="admin-header__left">
          <span className="admin-header__badge">Admin</span>
          <span className="admin-header__title">Zerou</span>
        </div>

        <nav className="admin-tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`admin-tab${tab === t.id ? ' admin-tab--active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.count !== undefined && !loading ? (
                <span className="admin-tab__count">{t.count}</span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="admin-header__right">
          <span className="admin-header__email">{user?.email}</span>
          <button
            type="button"
            className="admin-refresh-btn"
            onClick={() => void loadAll()}
            disabled={loading}
            title="Recarregar dados"
          >
            <RefreshCw size={15} className={loading ? 'admin-spin' : ''} />
          </button>
          <Link to="/app" className="admin-back-btn">
            <ArrowLeft size={15} />
            App
          </Link>
        </div>
      </header>

      {deleteSuccess ? (
        <div className="admin-toast admin-toast--success">{deleteSuccess}</div>
      ) : null}

      <div className="admin-body">
        {loading ? (
          <div className="admin-loading">
            <Loader2 size={28} className="admin-spin" />
            <p>Carregando dados…</p>
          </div>
        ) : error ? (
          <div className="admin-error">
            <p>{error}</p>
            <button type="button" className="button button--subtle" onClick={() => void loadAll()}>
              <RefreshCw size={15} /> Tentar novamente
            </button>
          </div>
        ) : (
          <>
            {tab === 'overview' && (
              <OverviewTab users={users} couples={couples} invites={invites} userMap={userMap} />
            )}
            {tab === 'users' && (
              <UsersTab users={users} onDelete={(u) => setPendingDelete(u)} />
            )}
            {tab === 'couples' && <CouplesTab couples={couples} userMap={userMap} />}
            {tab === 'invites' && <InvitesTab invites={invites} userMap={userMap} />}
          </>
        )}
      </div>

      {pendingDelete ? (
        <DeleteConfirmModal
          user={pendingDelete}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setPendingDelete(null)}
        />
      ) : null}
    </div>
  );
}
