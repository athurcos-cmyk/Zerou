import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpDown,
  Ban,
  Heart,
  Loader2,
  LogOut,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import {
  callAdminDeleteUser,
  callAdminForceLogout,
  getAdminCoupleWorkspaces,
  getAdminInvites,
  getAdminUsers,
  getAdminUserWorkspaceRefs,
  getAdminWorkspacesByIds,
  type AdminCursor,
  type AdminInvite,
  type AdminWorkspaceRef,
} from '../admin/adminService';
import { revokeCoupleInvite } from '../shared/sharedService';
import { formatCount } from '../admin/adminFormat';
import { getUserFacingErrorMessage } from '../utils/userFacingError';
import type { UserProfile, Workspace } from '../types/contracts';
import type { Timestamp } from 'firebase/firestore';

type Tab = 'overview' | 'users' | 'couples' | 'invites';
type SortDir = 'asc' | 'desc';

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

// Compara datas do Firestore ou strings — o bastante pra ordenar as 3 tabelas
// do admin sem precisar de uma lib de comparação genérica.
function compareField(a: string | Timestamp | null | undefined, b: string | Timestamp | null | undefined): number {
  if (a && typeof a === 'object' && 'toMillis' in a) {
    const bMillis = b && typeof b === 'object' && 'toMillis' in b ? b.toMillis() : 0;
    return a.toMillis() - bMillis;
  }
  if (typeof a === 'string' && typeof b === 'string') {
    return a.localeCompare(b, 'pt-BR');
  }
  return 0;
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
  else if (status === 'revoked' || status === 'pending_deletion' || status === 'removed') cls += ' admin-pill--danger';
  else cls += ' admin-pill--muted';

  const labels: Record<string, string> = {
    active: 'Ativo',
    accepted: 'Aceito',
    revoked: 'Revogado',
    expired: 'Expirado',
    archived: 'Arquivado',
    pending_deletion: 'Deletando',
    invited: 'Convidado',
    removed: 'Removido',
  };
  return <span className={cls}>{labels[status] ?? status}</span>;
}

function StatCard({
  icon,
  label,
  value,
  sub,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'article';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`admin-stat${onClick ? ' admin-stat--clickable' : ''}${active ? ' admin-stat--active' : ''}`}
      onClick={onClick}
    >
      <span className="admin-stat__icon">{icon}</span>
      <p className="admin-stat__label">{label}</p>
      <strong className="admin-stat__value display-number">{value}</strong>
      {sub ? <span className="admin-stat__sub">{sub}</span> : null}
    </Tag>
  );
}

function EmptyRow({ cols, filtered }: { cols: number; filtered?: boolean }) {
  return (
    <tr>
      <td colSpan={cols} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
        {filtered ? 'Nenhum resultado para esse filtro/busca.' : 'Nenhum registro encontrado.'}
      </td>
    </tr>
  );
}

function SortableTh({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <th className={`admin-th-sortable${active ? ' admin-th-sortable--active' : ''}`} onClick={onClick}>
      <span>
        {label}
        {active ? (
          <span className="admin-sort-arrow">{dir === 'asc' ? '↑' : '↓'}</span>
        ) : (
          <ArrowUpDown size={11} className="admin-sort-icon" />
        )}
      </span>
    </th>
  );
}

function LoadMoreButton({ hasMore, loading, onClick }: { hasMore: boolean; loading: boolean; onClick: () => void }) {
  if (!hasMore) return null;
  return (
    <div className="admin-load-more">
      <button type="button" className="button button--subtle" onClick={onClick} disabled={loading}>
        {loading ? <Loader2 size={15} className="admin-spin" /> : null}
        Carregar mais
      </button>
    </div>
  );
}

function OverviewTab({
  users,
  usersHasMore,
  couples,
  couplesHasMore,
  invites,
  invitesHasMore,
  userMap,
}: {
  users: UserProfile[];
  usersHasMore: boolean;
  couples: Workspace[];
  couplesHasMore: boolean;
  invites: AdminInvite[];
  invitesHasMore: boolean;
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
          label="Usuários carregados"
          value={formatCount(users.length, usersHasMore)}
          sub="cadastros ativos"
        />
        <StatCard
          icon={<TrendingUp size={18} />}
          label="Novos (30 dias)"
          value={newUsers30d}
          sub={`de ${formatCount(users.length, usersHasMore)} carregados`}
        />
        <StatCard
          icon={<Heart size={18} />}
          label="Espaços de casal"
          value={formatCount(couples.length, couplesHasMore)}
          sub="workspaces de dupla"
        />
        <StatCard
          icon={<Send size={18} />}
          label="Convites ativos"
          value={activeInvites}
          sub={`de ${formatCount(invites.length, invitesHasMore)} carregados`}
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

// Frase fixa em vez do primeiro nome do usuário: se `user.name` estiver vazio
// (perfil incompleto), comparar contra '' deixaria o botão liberado sem digitar
// nada. "EXCLUIR" também segue o mesmo padrão da autoexclusão de conta do usuário
// (ver docs/PRIVACY.md / LoginMethodsPage).
const DELETE_CONFIRM_PHRASE = 'EXCLUIR';

function DeleteConfirmModal({ user, onConfirm, onCancel }: DeleteConfirmProps) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const expected = DELETE_CONFIRM_PHRASE;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleConfirm() {
    if (input.trim() !== expected) return;
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
          Isso vai apagar <strong>{user.name || user.email}</strong> ({user.email}) do Firebase Auth e todos os dados
          do Firestore — workspace pessoal, espaços de casal criados por ele, transações, cartões,
          metas, convites e billing. <strong>Irreversível.</strong>
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
          onKeyDown={(e) => e.key === 'Enter' && input.trim() === expected && !busy && void handleConfirm()}
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
            disabled={input.trim() !== expected || busy}
          >
            {busy ? <Loader2 size={15} className="admin-spin" /> : <Trash2 size={15} />}
            Deletar conta
          </button>
        </div>
      </div>
    </div>
  );
}

interface ConfirmModalProps {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

// Confirmação genérica pra ações reversíveis/de menor risco (ex.: revogar
// convite, forçar logout) — sem exigir digitar nada, diferente do DeleteConfirmModal.
function ConfirmModal({ title, body, confirmLabel, danger, onConfirm, onCancel }: ConfirmModalProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir a ação.');
      setBusy(false);
    }
  }

  return (
    <div className="admin-modal-backdrop" onClick={onCancel}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <span className="admin-modal__icon">
          <AlertTriangle size={22} />
        </span>
        <h2 className="admin-modal__title">{title}</h2>
        <p className="admin-modal__body">{body}</p>
        {error ? <p className="admin-modal__error">{error}</p> : null}
        <div className="admin-modal__actions">
          <button type="button" className="button button--ghost" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className={danger ? 'button admin-modal__delete-btn' : 'button button--primary'}
            onClick={() => void handleConfirm()}
            disabled={busy}
          >
            {busy ? <Loader2 size={15} className="admin-spin" /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const THEME_LABELS: Record<string, string> = {
  paper: 'Paper (Sol)',
  sakura: 'Sakura',
  obsidian: 'Obsidian',
  midnight: 'Midnight',
  aurora: 'Aurora',
  'rose-gold': 'Rose Gold',
};

// Painel de detalhes — só mostra metadados que o admin já consegue ler hoje
// (perfil + workspaceRefs), nunca dados financeiros (transações/contas/faturas
// exigem isActiveMember nas regras, de propósito — ver docs/PRIVACY.md).
function UserDetailModal({
  user,
  canDelete,
  onClose,
  onRequestDelete,
  onRequestForceLogout,
}: {
  user: UserProfile;
  canDelete: boolean;
  onClose: () => void;
  onRequestDelete: () => void;
  onRequestForceLogout: () => void;
}) {
  const [refs, setRefs] = useState<AdminWorkspaceRef[]>([]);
  const [workspaces, setWorkspaces] = useState<Map<string, Workspace>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getAdminUserWorkspaceRefs(user.id)
      .then(async (items) => {
        if (cancelled) return null;
        setRefs(items);
        return getAdminWorkspacesByIds(items.filter((item) => item.type === 'couple').map((item) => item.id));
      })
      .then((ws) => {
        if (!cancelled && ws) setWorkspaces(ws);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erro ao carregar espaços do usuário.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user.id]);

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div className="admin-modal admin-modal--wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="admin-detail-header">
          <Initials name={user.name || user.email} />
          <div>
            <h2 className="admin-modal__title">{user.name || 'Sem nome'}</h2>
            <p className="admin-td--muted">{user.email}</p>
          </div>
        </div>

        <dl className="admin-detail-grid">
          <div>
            <dt>UID</dt>
            <dd className="admin-monospace">{user.id}</dd>
          </div>
          <div>
            <dt>Tema</dt>
            <dd>{THEME_LABELS[user.themeId] ?? user.themeId}</dd>
          </div>
          <div>
            <dt>Cadastro</dt>
            <dd>{fmtDateFull(user.createdAt)}</dd>
          </div>
          <div>
            <dt>Workspace padrão</dt>
            <dd className="admin-monospace">{user.defaultWorkspaceId ?? '—'}</dd>
          </div>
        </dl>

        <h3 className="admin-detail-subtitle">Espaços</h3>
        {loading ? (
          <p className="admin-td--muted">Carregando…</p>
        ) : error ? (
          <p className="admin-modal__error">{error}</p>
        ) : refs.length === 0 ? (
          <p className="admin-td--muted">Nenhum espaço encontrado.</p>
        ) : (
          <ul className="admin-workspace-list">
            {refs.map((ref) => {
              const isPersonal = ref.type === 'personal';
              const ws = isPersonal ? null : workspaces.get(ref.id);
              return (
                <li key={ref.id}>
                  <span className="admin-name-cell">
                    <strong>{isPersonal ? 'Espaço pessoal' : ws?.name ?? 'Espaço compartilhado'}</strong>
                    <span className="admin-td--muted admin-uid admin-monospace">{ref.id.slice(0, 16)}…</span>
                  </span>
                  <span className="admin-pill admin-pill--info">{ref.role}</span>
                  <StatusPill status={ref.status} />
                </li>
              );
            })}
          </ul>
        )}

        <div className="admin-modal__actions admin-modal__actions--spread">
          <button type="button" className="admin-detail-action" onClick={onRequestForceLogout}>
            <LogOut size={15} /> Forçar logout
          </button>
          <div className="admin-modal__actions">
            {canDelete ? (
              <button type="button" className="button admin-modal__delete-btn" onClick={onRequestDelete}>
                <Trash2 size={15} /> Deletar conta
              </button>
            ) : null}
            <button type="button" className="button button--ghost" onClick={onClose}>
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

type UserSortKey = 'name' | 'createdAt';

function UsersTab({
  users,
  hasMore,
  loadingMore,
  onLoadMore,
  currentUserId,
  onOpenDetail,
}: {
  users: UserProfile[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  currentUserId?: string;
  onOpenDetail: (u: UserProfile) => void;
}) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: UserSortKey; dir: SortDir }>({ key: 'createdAt', dir: 'desc' });

  function toggleSort(key: UserSortKey) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? users.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      : users;
    const sorted = [...base].sort((a, b) => {
      const cmp = sort.key === 'name' ? compareField(a.name, b.name) : compareField(a.createdAt ?? null, b.createdAt ?? null);
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [users, search, sort]);

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
              <SortableTh label="Usuário" active={sort.key === 'name'} dir={sort.dir} onClick={() => toggleSort('name')} />
              <th>Email</th>
              <th>Tema</th>
              <SortableTh label="Cadastro" active={sort.key === 'createdAt'} dir={sort.dir} onClick={() => toggleSort('createdAt')} />
              <th>Workspace</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <EmptyRow cols={6} filtered={Boolean(search)} />
            ) : (
              filtered.map((u) => (
                <tr key={u.id} className="admin-row--clickable" onClick={() => onOpenDetail(u)}>
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
                      {THEME_LABELS[u.themeId] ?? u.themeId}
                    </span>
                  </td>
                  <td className="admin-td--muted" title={fmtDateFull(u.createdAt)}>
                    {fmtDate(u.createdAt)}
                  </td>
                  <td className="admin-td--muted admin-monospace">
                    {u.defaultWorkspaceId ? u.defaultWorkspaceId.slice(0, 16) + '…' : '—'}
                  </td>
                  <td>
                    {u.id === currentUserId ? (
                      <span className="admin-pill admin-pill--info" title="Você não pode deletar sua própria conta por aqui">
                        <ShieldCheck size={13} /> Você
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <LoadMoreButton hasMore={hasMore} loading={loadingMore} onClick={onLoadMore} />
    </div>
  );
}

type CoupleStatusFilter = 'all' | 'active' | 'archived' | 'pending_deletion';
type CoupleSortKey = 'name' | 'createdAt';

function CouplesTab({
  couples,
  hasMore,
  loadingMore,
  onLoadMore,
  userMap,
}: {
  couples: Workspace[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  userMap: Map<string, UserProfile>;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<CoupleStatusFilter>('all');
  const [sort, setSort] = useState<{ key: CoupleSortKey; dir: SortDir }>({ key: 'createdAt', dir: 'desc' });

  function toggleSort(key: CoupleSortKey) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }

  const counts = useMemo(() => ({
    active: couples.filter((w) => w.status === 'active').length,
    archived: couples.filter((w) => w.status === 'archived').length,
    pending_deletion: couples.filter((w) => w.status === 'pending_deletion').length,
  }), [couples]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byStatus = statusFilter === 'all' ? couples : couples.filter((w) => w.status === statusFilter);
    const byQuery = q
      ? byStatus.filter((w) => {
          const owner = userMap.get(w.ownerUserId);
          const partner = w.partnerUserId ? userMap.get(w.partnerUserId) : null;
          return (
            w.name.toLowerCase().includes(q) ||
            owner?.name.toLowerCase().includes(q) ||
            owner?.email.toLowerCase().includes(q) ||
            partner?.name.toLowerCase().includes(q) ||
            partner?.email.toLowerCase().includes(q)
          );
        })
      : byStatus;
    return [...byQuery].sort((a, b) => {
      const cmp = sort.key === 'name' ? compareField(a.name, b.name) : compareField(a.createdAt ?? null, b.createdAt ?? null);
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [couples, userMap, search, statusFilter, sort]);

  return (
    <div className="admin-content">
      <div className="admin-stats-grid">
        <StatCard icon={<Heart size={18} />} label="Ativos" value={counts.active} active={statusFilter === 'active'} onClick={() => setStatusFilter(statusFilter === 'active' ? 'all' : 'active')} />
        <StatCard icon={<AlertTriangle size={18} />} label="Arquivados" value={counts.archived} active={statusFilter === 'archived'} onClick={() => setStatusFilter(statusFilter === 'archived' ? 'all' : 'archived')} />
        <StatCard icon={<Trash2 size={18} />} label="Deletando" value={counts.pending_deletion} active={statusFilter === 'pending_deletion'} onClick={() => setStatusFilter(statusFilter === 'pending_deletion' ? 'all' : 'pending_deletion')} />
      </div>

      <div className="admin-search-bar">
        <Search size={16} className="admin-search-icon" />
        <input
          className="admin-search-input"
          type="search"
          placeholder="Buscar por nome do espaço, dono ou parceiro…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search || statusFilter !== 'all' ? (
          <span className="admin-search-count">{filtered.length} de {couples.length}</span>
        ) : null}
      </div>

      <section className="surface">
        <table className="admin-table admin-table--full">
          <thead>
            <tr>
              <SortableTh label="Nome do espaço" active={sort.key === 'name'} dir={sort.dir} onClick={() => toggleSort('name')} />
              <th>Dono</th>
              <th>Parceiro</th>
              <th>Membros</th>
              <th>Status</th>
              <SortableTh label="Criado em" active={sort.key === 'createdAt'} dir={sort.dir} onClick={() => toggleSort('createdAt')} />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <EmptyRow cols={6} filtered={Boolean(search) || statusFilter !== 'all'} />
            ) : (
              filtered.map((w) => {
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

      <LoadMoreButton hasMore={hasMore} loading={loadingMore} onClick={onLoadMore} />
    </div>
  );
}

type InviteStatusFilter = 'all' | 'active' | 'expired' | 'accepted';
type InviteSortKey = 'workspaceName' | 'createdAt';

function InvitesTab({
  invites,
  hasMore,
  loadingMore,
  onLoadMore,
  userMap,
  onRevoke,
}: {
  invites: AdminInvite[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  userMap: Map<string, UserProfile>;
  onRevoke: (invite: AdminInvite) => void;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InviteStatusFilter>('all');
  const [sort, setSort] = useState<{ key: InviteSortKey; dir: SortDir }>({ key: 'createdAt', dir: 'desc' });

  const isExpiredInvite = (inv: AdminInvite) =>
    Boolean(inv.status === 'active' && inv.expiresAt && inv.expiresAt.toDate().getTime() < Date.now());

  function effectiveStatus(inv: AdminInvite): InviteStatusFilter {
    if (isExpiredInvite(inv)) return 'expired';
    if (inv.status === 'accepted') return 'accepted';
    return 'active';
  }

  function toggleSort(key: InviteSortKey) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }

  const counts = useMemo(() => {
    const active = invites.filter((i) => i.status === 'active' && !isExpiredInvite(i)).length;
    const expiredPending = invites.filter(isExpiredInvite).length;
    const accepted = invites.filter((i) => i.status === 'accepted').length;
    return { active, expiredPending, accepted };
  }, [invites]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byStatus = statusFilter === 'all' ? invites : invites.filter((inv) => effectiveStatus(inv) === statusFilter);
    const byQuery = q
      ? byStatus.filter((inv) => {
          const creator = userMap.get(inv.createdBy);
          return (
            inv.workspaceName.toLowerCase().includes(q) ||
            inv.codeHint.toLowerCase().includes(q) ||
            creator?.name.toLowerCase().includes(q) ||
            creator?.email.toLowerCase().includes(q)
          );
        })
      : byStatus;
    return [...byQuery].sort((a, b) => {
      const cmp = sort.key === 'workspaceName'
        ? compareField(a.workspaceName, b.workspaceName)
        : compareField(a.createdAt ?? null, b.createdAt ?? null);
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [invites, userMap, search, statusFilter, sort]);

  return (
    <div className="admin-content">
      <div className="admin-stats-grid">
        <StatCard icon={<Send size={18} />} label="Ativos" value={counts.active} sub="dentro do prazo de 48h" active={statusFilter === 'active'} onClick={() => setStatusFilter(statusFilter === 'active' ? 'all' : 'active')} />
        <StatCard icon={<AlertTriangle size={18} />} label="Expirados" value={counts.expiredPending} sub="aguardando limpeza por TTL" active={statusFilter === 'expired'} onClick={() => setStatusFilter(statusFilter === 'expired' ? 'all' : 'expired')} />
        <StatCard icon={<ShieldCheck size={18} />} label="Aceitos" value={counts.accepted} sub="convite já usado" active={statusFilter === 'accepted'} onClick={() => setStatusFilter(statusFilter === 'accepted' ? 'all' : 'accepted')} />
      </div>

      <div className="admin-search-bar">
        <Search size={16} className="admin-search-icon" />
        <input
          className="admin-search-input"
          type="search"
          placeholder="Buscar por espaço, código ou quem criou…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search || statusFilter !== 'all' ? (
          <span className="admin-search-count">{filtered.length} de {invites.length}</span>
        ) : null}
      </div>

      <section className="surface">
        <table className="admin-table admin-table--full">
          <thead>
            <tr>
              <SortableTh label="Workspace" active={sort.key === 'workspaceName'} dir={sort.dir} onClick={() => toggleSort('workspaceName')} />
              <th>Hint</th>
              <th>Criado por</th>
              <th>Expira em</th>
              <th>Status</th>
              <th>Usado por</th>
              <SortableTh label="Criado em" active={sort.key === 'createdAt'} dir={sort.dir} onClick={() => toggleSort('createdAt')} />
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <EmptyRow cols={8} filtered={Boolean(search) || statusFilter !== 'all'} />
            ) : (
              filtered.map((inv) => {
                const creator = userMap.get(inv.createdBy);
                const usedByUser = inv.usedBy ? userMap.get(inv.usedBy) : null;
                const isExpired = isExpiredInvite(inv);
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
                    <td><StatusPill status={isExpired ? 'expired' : inv.status} /></td>
                    <td className="admin-td--muted">
                      {usedByUser ? usedByUser.name : inv.usedBy ? inv.usedBy.slice(0, 8) + '…' : '—'}
                    </td>
                    <td className="admin-td--muted" title={fmtDateFull(inv.createdAt)}>
                      {fmtDateRelative(inv.createdAt)}
                    </td>
                    <td>
                      {inv.status === 'active' ? (
                        <button
                          type="button"
                          className="admin-delete-row-btn"
                          title="Revogar convite"
                          onClick={() => onRevoke(inv)}
                        >
                          <Ban size={14} />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>

      <LoadMoreButton hasMore={hasMore} loading={loadingMore} onClick={onLoadMore} />
    </div>
  );
}

export function AdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [usersCursor, setUsersCursor] = useState<AdminCursor>(null);
  const [usersHasMore, setUsersHasMore] = useState(false);
  const [usersLoadingMore, setUsersLoadingMore] = useState(false);

  const [couples, setCouples] = useState<Workspace[]>([]);
  const [couplesCursor, setCouplesCursor] = useState<AdminCursor>(null);
  const [couplesHasMore, setCouplesHasMore] = useState(false);
  const [couplesLoadingMore, setCouplesLoadingMore] = useState(false);

  const [invites, setInvites] = useState<AdminInvite[]>([]);
  const [invitesCursor, setInvitesCursor] = useState<AdminCursor>(null);
  const [invitesHasMore, setInvitesHasMore] = useState(false);
  const [invitesLoadingMore, setInvitesLoadingMore] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDetailUser, setPendingDetailUser] = useState<UserProfile | null>(null);
  const [pendingDelete, setPendingDelete] = useState<UserProfile | null>(null);
  const [pendingForceLogout, setPendingForceLogout] = useState<UserProfile | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<AdminInvite | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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
      setUsers(u.items);
      setUsersCursor(u.cursor);
      setUsersHasMore(u.hasMore);
      setCouples(c.items);
      setCouplesCursor(c.cursor);
      setCouplesHasMore(c.hasMore);
      setInvites(i.items);
      setInvitesCursor(i.cursor);
      setInvitesHasMore(i.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  async function loadMoreUsers() {
    setUsersLoadingMore(true);
    try {
      const page = await getAdminUsers(usersCursor);
      setUsers((prev) => [...prev, ...page.items]);
      setUsersCursor(page.cursor);
      setUsersHasMore(page.hasMore);
    } finally {
      setUsersLoadingMore(false);
    }
  }

  async function loadMoreCouples() {
    setCouplesLoadingMore(true);
    try {
      const page = await getAdminCoupleWorkspaces(couplesCursor);
      setCouples((prev) => [...prev, ...page.items]);
      setCouplesCursor(page.cursor);
      setCouplesHasMore(page.hasMore);
    } finally {
      setCouplesLoadingMore(false);
    }
  }

  async function loadMoreInvites() {
    setInvitesLoadingMore(true);
    try {
      const page = await getAdminInvites(invitesCursor);
      setInvites((prev) => [...prev, ...page.items]);
      setInvitesCursor(page.cursor);
      setInvitesHasMore(page.hasMore);
    } finally {
      setInvitesLoadingMore(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    const result = await callAdminDeleteUser(target.id);
    setUsers((prev) => prev.filter((u) => u.id !== target.id));
    setCouples((prev) => prev.filter((w) => w.ownerUserId !== target.id));
    setInvites((prev) => prev.filter((i) => i.createdBy !== target.id));
    setPendingDelete(null);
    setPendingDetailUser(null);
    showToast(`${target.name || target.email} deletado — ${result.docsDeleted} documentos removidos.`);
  }

  async function handleForceLogoutConfirm() {
    if (!pendingForceLogout) return;
    const target = pendingForceLogout;
    await callAdminForceLogout(target.id);
    setPendingForceLogout(null);
    setPendingDetailUser(null);
    showToast(`Sessões de ${target.name || target.email} invalidadas.`);
  }

  async function handleRevokeConfirm() {
    if (!pendingRevoke || !user) return;
    const target = pendingRevoke;
    try {
      await revokeCoupleInvite(target.workspaceId, target.id, user.uid);
    } catch (err) {
      throw new Error(getUserFacingErrorMessage(err, 'Não foi possível revogar o convite agora.'));
    }
    setInvites((prev) => prev.filter((i) => i.id !== target.id));
    setPendingRevoke(null);
    showToast(`Convite de "${target.workspaceName}" revogado.`);
  }

  function showToast(message: string) {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 6000);
  }

  const tabs: { id: Tab; label: string; count?: string }[] = [
    { id: 'overview', label: 'Visão Geral' },
    { id: 'users', label: 'Usuários', count: formatCount(users.length, usersHasMore) },
    { id: 'couples', label: 'Casais', count: formatCount(couples.length, couplesHasMore) },
    { id: 'invites', label: 'Convites', count: formatCount(invites.length, invitesHasMore) },
  ];

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="admin-header__left">
          <span className="admin-header__badge">Admin</span>
          <span className="admin-header__title">Granativa</span>
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

      {toastMessage ? (
        <div className="admin-toast admin-toast--success">{toastMessage}</div>
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
              <OverviewTab
                users={users}
                usersHasMore={usersHasMore}
                couples={couples}
                couplesHasMore={couplesHasMore}
                invites={invites}
                invitesHasMore={invitesHasMore}
                userMap={userMap}
              />
            )}
            {tab === 'users' && (
              <UsersTab
                users={users}
                hasMore={usersHasMore}
                loadingMore={usersLoadingMore}
                onLoadMore={() => void loadMoreUsers()}
                currentUserId={user?.uid}
                onOpenDetail={(u) => setPendingDetailUser(u)}
              />
            )}
            {tab === 'couples' && (
              <CouplesTab
                couples={couples}
                hasMore={couplesHasMore}
                loadingMore={couplesLoadingMore}
                onLoadMore={() => void loadMoreCouples()}
                userMap={userMap}
              />
            )}
            {tab === 'invites' && (
              <InvitesTab
                invites={invites}
                hasMore={invitesHasMore}
                loadingMore={invitesLoadingMore}
                onLoadMore={() => void loadMoreInvites()}
                userMap={userMap}
                onRevoke={(inv) => setPendingRevoke(inv)}
              />
            )}
          </>
        )}
      </div>

      {pendingDetailUser ? (
        <UserDetailModal
          user={pendingDetailUser}
          canDelete={pendingDetailUser.id !== user?.uid}
          onClose={() => setPendingDetailUser(null)}
          onRequestDelete={() => setPendingDelete(pendingDetailUser)}
          onRequestForceLogout={() => setPendingForceLogout(pendingDetailUser)}
        />
      ) : null}

      {pendingDelete ? (
        <DeleteConfirmModal
          user={pendingDelete}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setPendingDelete(null)}
        />
      ) : null}

      {pendingForceLogout ? (
        <ConfirmModal
          title="Forçar logout deste usuário?"
          body={`Todas as sessões de "${pendingForceLogout.name || pendingForceLogout.email}" são invalidadas na próxima renovação de token (não é instantâneo — o dispositivo continua logado até o token atual expirar, cerca de 1h).`}
          confirmLabel="Forçar logout"
          onConfirm={handleForceLogoutConfirm}
          onCancel={() => setPendingForceLogout(null)}
        />
      ) : null}

      {pendingRevoke ? (
        <ConfirmModal
          title="Revogar este convite?"
          body={`O convite de "${pendingRevoke.workspaceName}" para de funcionar imediatamente. Quem criou pode gerar um novo a qualquer momento.`}
          confirmLabel="Revogar convite"
          danger
          onConfirm={handleRevokeConfirm}
          onCancel={() => setPendingRevoke(null)}
        />
      ) : null}
    </div>
  );
}
