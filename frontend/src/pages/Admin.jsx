import React, { useEffect, useState, useCallback } from 'react';
import {
  Plus, RefreshCw, Copy, Check, Trash2, ChevronDown, ChevronRight,
  GraduationCap, Users, Pencil, AlertTriangle,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../App';
import PromptDashboard from '../components/PromptDashboard';

const PLANS = ['free', 'basic', 'pro'];

const labelStyle = { fontSize: 11, color: '#86efac', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, display: 'block' };

export default function Admin() {
  const { user: me } = useAuth();
  const isSuperAdmin = me?.role === "superadmin";
  const [tab, setTab] = useState('users'); // 'users', 'sections', 'roles', 'logs', 'prompt'
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logsStats, setLogsStats] = useState({ admin_actions_total: 0, scans_total: 0, total: 0 });
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsFilter, setLogsFilter] = useState('all'); // 'all', 'admin', 'scan'
  const [banningUserId, setBanningUserId] = useState(null);
  const [roles, setRoles] = useState([]);
  const [permissionsCatalog, setPermissionsCatalog] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [list, s] = await Promise.all([
        api.adminListUsers({ q, role: roleFilter }),
        api.adminStats(),
      ]);
      setUsers(list.users);
      setTotal(list.total);
      setStats(s);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [q, roleFilter]);

  const loadRoles = useCallback(async () => {
    try {
      const data = await api.listRoles();
      setRoles(data.roles || []);
      setPermissionsCatalog(data.permissions || []);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { loadRoles(); }, [loadRoles]);


  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    setError('');
    try {
      const kind = logsFilter === 'all' ? null : logsFilter;
      const data = await api.adminViewLogs(200, 0, kind);
      setLogs(data.logs || []);
      setLogsStats({
        admin_actions_total: data.admin_actions_total || 0,
        scans_total: data.scans_total || 0,
        total: data.total || 0,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLogsLoading(false);
    }
  }, [logsFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (tab === 'logs') loadLogs(); }, [tab, loadLogs]);

  async function saveEdit() {
    setSaving(true);
    setError('');
    try {
      const patch = {
        is_active: editing.is_active,
        full_name: editing.full_name,
        username: editing.username,
        email: editing.email,
        role: editing.role,
      };
      if (editing._password) patch.password = editing._password;
      await api.adminUpdateUser(editing.id, patch);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteId) return;
    setError('');
    try {
      await api.adminDeleteUser(deleteId);
      setDeleteId(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function findUser(userId) {
    return users.find(u => u.id === userId);
  }

  async function banUser(userId) {
    const u = findUser(userId);
    const label = u ? `${u.username} (${u.email})` : 'this user';
    if (!window.confirm(`Ban ${label}?\n\nThey will not be able to sign in until you unban them. Their data and scans remain intact.`)) return;
    setBanningUserId(userId);
    setError('');
    try {
      await api.adminBanUser(userId);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBanningUserId(null);
    }
  }

  async function unbanUser(userId) {
    const u = findUser(userId);
    const label = u ? `${u.username} (${u.email})` : 'this user';
    if (!window.confirm(`Unban ${label}?\n\nThey will be able to sign in again immediately.`)) return;
    setBanningUserId(userId);
    setError('');
    try {
      await api.adminUnbanUser(userId);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBanningUserId(null);
    }
  }

  async function promoteUser(userId) {
    const u = findUser(userId);
    const label = u ? `${u.username} (${u.email})` : 'this user';
    if (!window.confirm(`Promote ${label} to ADMIN?\n\nThey will gain access to the Admin Panel and every permission the admin role grants.`)) return;
    setError('');
    try {
      await api.adminPromoteAdmin(userId);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function demoteUser(userId) {
    const u = findUser(userId);
    const label = u ? `${u.username} (${u.email})` : 'this user';
    if (!window.confirm(`Demote ${label} back to a regular user?\n\nThey will lose access to the Admin Panel immediately.`)) return;
    setError('');
    try {
      await api.adminDemoteAdmin(userId);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <p className="classification-bar" style={{ marginBottom: 6 }}>
          CONTROL · ADMIN · CONSOLE
        </p>
        <h1 className="oswald glow" style={{
          fontSize: 26, color: '#00ff66', letterSpacing: 4, textTransform: 'uppercase', margin: 0,
        }}>
          Admin Panel
        </h1>
      </div>

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
          <StatCard label="Total Users" value={stats.total_users} />
          <StatCard label="Admins" value={stats.admins ?? 0} />
          <StatCard label="Super Admins" value={stats.super_admins ?? 0} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid #1d3825', paddingBottom: 12 }}>
        <button
          className="mono"
          onClick={() => setTab('users')}
          style={{
            padding: '8px 12px', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer',
            color: tab === 'users' ? '#00ff66' : '#86efac',
            textTransform: 'uppercase', letterSpacing: 1,
            borderBottom: tab === 'users' ? '2px solid #00ff66' : 'none',
            marginBottom: '-12px',
          }}
        >
          Users
        </button>
        <button
          className="mono"
          onClick={() => setTab('sections')}
          style={{
            padding: '8px 12px', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer',
            color: tab === 'sections' ? '#00ff66' : '#86efac',
            textTransform: 'uppercase', letterSpacing: 1,
            borderBottom: tab === 'sections' ? '2px solid #00ff66' : 'none',
            marginBottom: '-12px',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          Sections
        </button>
        {isSuperAdmin && (
          <button
            className="mono"
            onClick={() => setTab('roles')}
            style={{
              padding: '8px 12px', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer',
              color: tab === 'roles' ? '#00ff66' : '#86efac',
              textTransform: 'uppercase', letterSpacing: 1,
              borderBottom: tab === 'roles' ? '2px solid #00ff66' : 'none',
              marginBottom: '-12px',
            }}
          >
            Roles
          </button>
        )}
        <button
          className="mono"
          onClick={() => setTab('logs')}
          style={{
            padding: '8px 12px', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer',
            color: tab === 'logs' ? '#00ff66' : '#86efac',
            textTransform: 'uppercase', letterSpacing: 1,
            borderBottom: tab === 'logs' ? '2px solid #00ff66' : 'none',
            marginBottom: '-12px',
          }}
        >
          Audit Logs
        </button>
        <button
          className="mono"
          onClick={() => setTab('prompt')}
          style={{
            padding: '8px 12px', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer',
            color: tab === 'prompt' ? '#00ff66' : '#86efac',
            textTransform: 'uppercase', letterSpacing: 1,
            borderBottom: tab === 'prompt' ? '2px solid #00ff66' : 'none',
            marginBottom: '-12px',
          }}
        >
          Prompt Analytics
        </button>
      </div>

      {tab === 'users' && (
      <div>
      <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 200px' }}>
          <label style={labelStyle}>Search</label>
          <input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="email, username, name" />
        </div>
        <div style={{ flex: '0 1 200px', minWidth: 160 }}>
          <label style={labelStyle}>Filter by role</label>
          <select className="input" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
            <option value="">All roles</option>
            {roles.map(r => (
              <option key={r.id} value={r.name}>{r.name}</option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary" onClick={load} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div style={{
          background: 'rgba(255,51,68,0.1)', border: '1px solid #ff3344', padding: 12, borderRadius: 2,
          marginBottom: 16, fontSize: 13, color: '#ff8a99',
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          ⚠ {error}
        </div>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        {users.map(u => (
          <UserRow
            key={u.id}
            user={u}
            isMe={u.id === me?.id}
            isSuperAdmin={isSuperAdmin}
            onEdit={() => setEditing({ ...u, _password: '' })}
            onDelete={() => setDeleteId(u.id)}
            onBan={() => banUser(u.id)}
            onUnban={() => unbanUser(u.id)}
            onPromote={() => promoteUser(u.id)}
            onDemote={() => demoteUser(u.id)}
            isBanning={banningUserId === u.id}
            roles={roles}
          />
        ))}
        {!loading && users.length === 0 && (
          <div className="card" style={{ textAlign: 'center', color: '#86efac' }}>No users found.</div>
        )}
      </div>

      {editing && (
        <Modal onClose={() => setEditing(null)} title={`Edit user ${editing.email}`}>
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label="Email"><input className="input" value={editing.email} onChange={e => setEditing({ ...editing, email: e.target.value })} /></Field>
            <Field label="Username"><input className="input" value={editing.username} onChange={e => setEditing({ ...editing, username: e.target.value })} /></Field>
            <Field label="Full name"><input className="input" value={editing.full_name || ''} onChange={e => setEditing({ ...editing, full_name: e.target.value })} /></Field>
            <Field label="Reset password (optional, min 6 chars)">
              <input className="input" type="password" value={editing._password} onChange={e => setEditing({ ...editing, _password: e.target.value })} placeholder="Leave blank to keep current" />
            </Field>
            <Field label="Role">
              <select className="input" value={editing.role || 'user'} onChange={e => setEditing({ ...editing, role: e.target.value })} disabled={editing.id === me?.id}>
                {roles.map(r => (
                  <option key={r.id} value={r.name}>{r.name}{r.description ? ` ${r.description}` : ''}</option>
                ))}
              </select>
              {editing.id === me?.id && <span style={{ color: '#86efac', fontSize: 11, marginTop: 4, display: 'block' }}>(cannot change own role)</span>}
            </Field>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#e5e5e5' }}>
              <input type="checkbox" checked={editing.is_active} onChange={e => setEditing({ ...editing, is_active: e.target.checked })} disabled={editing.id === me?.id} />
              Active {editing.id === me?.id && <span style={{ color: '#86efac', fontSize: 11 }}>(cannot deactivate own)</span>}
            </label>
            <div style={{ borderTop: '1px solid #112418', paddingTop: 12, fontSize: 12, color: '#86efac' }}>
              <div>ID: <span style={{ color: '#d8ffe6', fontFamily: 'monospace' }}>{editing.id}</span></div>
              <div>Scans this month: <span style={{ color: '#d8ffe6' }}>{editing.scans_this_month}</span></div>
              <div>Created: <span style={{ color: '#d8ffe6' }}>{editing.created_at}</span></div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn" onClick={() => setEditing(null)} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </Modal>
      )}

      {deleteId && (() => {
        const target = users.find(u => u.id === deleteId);
        return (
          <Modal onClose={() => setDeleteId(null)} title="Delete user?">
            <p style={{ color: '#e5e5e5', fontSize: 14, marginBottom: 12 }}>
              You are about to permanently delete:
            </p>
            <div style={{
              background: 'rgba(255,51,68,0.06)', border: '1px solid #7a1f28',
              borderRadius: 4, padding: 12, marginBottom: 14,
            }}>
              <div style={{ fontSize: 14, color: '#d8ffe6', fontWeight: 600 }}>
                {target?.full_name || target?.username || '—'}
              </div>
              <div className="mono" style={{ fontSize: 12, color: '#86efac', marginTop: 4 }}>
                @{target?.username} · {target?.email}
              </div>
              <div className="mono" style={{ fontSize: 11, color: '#6dba85', marginTop: 4 }}>
                {target?.scans_this_month ?? 0} scans this month
              </div>
            </div>
            <p style={{ color: '#ff8a99', fontSize: 13, lineHeight: 1.6, margin: 0 }}>
              This permanently deletes the user, their scan history, uploaded images, and any classroom memberships. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn" onClick={() => setDeleteId(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmDelete}>Delete forever</button>
            </div>
          </Modal>
        );
      })()}
      </div>
      )}

      {tab === 'sections' && (
        <RoomsManager onError={setError} />
      )}

      {tab === 'roles' && isSuperAdmin && (
        <RolesManager
          roles={roles}
          permissions={permissionsCatalog}
          onReload={loadRoles}
          onError={setError}
        />
      )}

      {tab === 'logs' && (
        <LogsView
          logs={logs}
          logsStats={logsStats}
          loading={logsLoading}
          filter={logsFilter}
          onFilterChange={setLogsFilter}
          onRefresh={loadLogs}
        />
      )}

      {tab === 'prompt' && (
      <div className="card">
        <div style={{ marginBottom: 20 }}>
          <h2 className="oswald" style={{
            fontSize: 13, letterSpacing: 2.5, textTransform: 'uppercase',
            color: '#6dba85', marginBottom: 14, margin: 0,
          }}>
            ▸ How the Analyst Reasons - Live Prompt Analytics
          </h2>
          <p style={{ fontSize: 12, color: '#86efac', marginBottom: 16, lineHeight: 1.6 }}>
            Behind every classification is a prompt that defines 19 forgery categories, branching rules, and
            user-context variables. This dashboard reads the live prompt and shows how each category is
            described, where overlaps exist, and which categories tend to dominate when evidence is ambiguous.
          </p>
        </div>
        <PromptDashboard />
      </div>
      )}
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="mono" style={{ fontSize: 10, color: '#3f6e4a', textTransform: 'uppercase', letterSpacing: 2 }}>{label}</div>
      <div className="oswald" style={{
        fontSize: 24, color: '#00ff66', marginTop: 4,
        textShadow: '0 0 10px rgba(0,255,102,0.5)',
        letterSpacing: 1,
      }}>{value}</div>
    </div>
  );
}

function Badge({ children, color }) {
  return (
    <span style={{
      fontSize: 10, fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase', letterSpacing: 1,
      padding: '2px 8px', borderRadius: 3, border: `1px solid ${color}`, color, background: `${color}1a`,
    }}>{children}</span>
  );
}

function UserRow({ user, isMe, isSuperAdmin, onEdit, onDelete, onBan, onUnban, onPromote, onDemote, isBanning, roles = [] }) {
  const planColor = { free: '#86efac', basic: '#00ffaa', pro: '#00ff66' }[user.plan] || '#86efac';
  const targetIsSuperAdmin = user.role === 'superadmin';
  const canMutate = isSuperAdmin && !targetIsSuperAdmin;
  // Resolve role color from user.role_color (backend) or roles list, fallback to default green
  const roleObj = roles.find(r => r.name === user.role);
  const roleColor = user.role_color || roleObj?.color || '#6dba85';
  // Card background tinted with role color for at-a-glance grouping
  const tintHex = roleColor + '14';  // ~8% alpha
  return (
    <div className="card" style={{
      display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between',
      background: tintHex, borderLeft: `4px solid ${roleColor}`,
    }}>
      <div style={{ flex: '1 1 240px', minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: '#e5e5e5', fontWeight: 600, fontSize: 14, wordBreak: 'break-all' }}>{user.email}</span>
          {isMe && <Badge color="#00ff66">You</Badge>}
          <Badge color={roleColor}>{user.role}</Badge>
          {!user.is_active && <Badge color="#ff3344">Banned</Badge>}
          {user.plan && <Badge color={planColor}>{user.plan}</Badge>}
        </div>
        <div style={{ color: '#86efac', fontSize: 12, marginTop: 4 }}>
          @{user.username} {user.full_name && `· ${user.full_name}`}
        </div>
        <div style={{ color: '#737373', fontSize: 11, marginTop: 4, fontFamily: 'monospace', wordBreak: 'break-all' }}>
          {user.id}
        </div>
        <div style={{ color: '#737373', fontSize: 11, marginTop: 2 }}>
          {user.scans_this_month} scans this month · joined {(user.created_at || '').slice(0, 10)}
        </div>
      </div>
      {canMutate && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button
            className="btn"
            onClick={onEdit}
            disabled={isMe}
            style={isMe ? {
              background: 'transparent', borderColor: '#1d3825', color: '#3f6e4a',
            } : {
              background: 'rgba(124, 184, 255, 0.06)',
              borderColor: '#2a4a6e',
              color: '#7cb8ff',
            }}
            title={isMe ? 'You cannot edit your own account here' : 'Edit user'}
          >
            Edit
          </button>
          {user.role === 'user' && (
            <button
              className="btn"
              onClick={onPromote}
              style={{
                background: 'rgba(0,255,102,0.06)',
                borderColor: '#1f5d39',
                color: '#00ff66',
              }}
              title="Promote to admin"
            >
              Promote to Admin
            </button>
          )}
          {user.role === 'admin' && (
            <button
              className="btn"
              onClick={onDemote}
              style={{
                background: 'rgba(255,170,64,0.06)',
                borderColor: '#7a4e10',
                color: '#ffa040',
              }}
              title="Demote to regular user"
            >
              Demote to User
            </button>
          )}
          {user.is_active ? (
            <button
              className="btn"
              onClick={onBan}
              disabled={isMe || isBanning}
              style={isMe ? {
                background: 'transparent', borderColor: '#1d3825', color: '#3f6e4a',
              } : {
                background: 'rgba(255,170,64,0.06)',
                borderColor: '#7a4e10',
                color: '#ffa040',
              }}
              title={isMe ? 'You cannot ban your own account' : 'Ban user'}
            >
              {isBanning ? 'Banning...' : 'Ban'}
            </button>
          ) : (
            <button
              className="btn"
              onClick={onUnban}
              disabled={isBanning}
              style={{
                background: 'rgba(0,255,102,0.06)',
                borderColor: '#1f5d39',
                color: '#00ff66',
              }}
              title="Unban user"
            >
              {isBanning ? 'Unbanning...' : 'Unban'}
            </button>
          )}
          <button
            className="btn"
            onClick={onDelete}
            disabled={isMe}
            style={isMe ? {
              background: 'transparent', borderColor: '#1d3825', color: '#3f6e4a',
            } : {
              background: 'rgba(255,51,68,0.08)',
              borderColor: '#7a1f28',
              color: '#ff8a99',
            }}
            title={isMe ? 'You cannot delete your own account' : 'Delete user'}
          >
            Delete
          </button>
        </div>
      )}
      {!isSuperAdmin && (
        <span className="mono" style={{ fontSize: 10, color: '#737373', letterSpacing: 1.5, padding: '4px 8px', border: '1px solid #1d3825', borderRadius: 2 }}>
          READ-ONLY
        </span>
      )}
      {isSuperAdmin && targetIsSuperAdmin && !isMe && (
        <span className="mono" style={{ fontSize: 10, color: '#a3e635', letterSpacing: 1.5, padding: '4px 8px', border: '1px solid #a3e635', borderRadius: 2 }}>
          PROTECTED
        </span>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: 24, zIndex: 1000, overflowY: 'auto',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="card"
        style={{ width: '100%', maxWidth: 520, marginTop: 40 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 className="oswald" style={{ margin: 0, fontSize: 18, letterSpacing: 2, textTransform: 'uppercase' }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#86efac', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────
// AUDIT LOG VIEW
// ─────────────────────────────────────────────────────────────────

const ACTION_COLORS = {
  ban_user:       '#ff8a99',
  unban_user:     '#86efac',
  promote_admin:  '#c4b5fd',
  demote_admin:   '#ffa040',
  update_user:    '#86efac',
  delete_user:    '#ff8a99',
  user_scan:      '#00ff66',
};

function LogsView({ logs, logsStats, loading, filter, onFilterChange, onRefresh }) {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 18 }}>
        <StatCard label="Total Scans" value={logsStats.scans_total ?? 0} />
        <StatCard label="Admin Actions" value={logsStats.admin_actions_total ?? 0} />
        <StatCard label="Total Events" value={logsStats.total ?? 0} />
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <span className="mono" style={{ fontSize: 10, color: '#3f6e4a', letterSpacing: 2, textTransform: 'uppercase', marginRight: 4 }}>FILTER</span>
        {[
          { id: 'all',   label: 'All' },
          { id: 'admin', label: 'Admin Actions' },
          { id: 'scan',  label: 'User Scans' },
        ].map(opt => (
          <button
            key={opt.id}
            className="mono"
            onClick={() => onFilterChange(opt.id)}
            style={{
              padding: '6px 12px', fontSize: 11, cursor: 'pointer',
              background: filter === opt.id ? 'rgba(0,255,102,0.1)' : 'transparent',
              border: `1px solid ${filter === opt.id ? '#00ff66' : '#1d3825'}`,
              color: filter === opt.id ? '#00ff66' : '#86efac',
              letterSpacing: 1, textTransform: 'uppercase', borderRadius: 2,
            }}
          >
            {opt.label}
          </button>
        ))}
        <button
          className="btn"
          onClick={onRefresh}
          disabled={loading}
          style={{ marginLeft: 'auto', fontSize: 11 }}
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {loading && <div className="card" style={{ textAlign: 'center', color: '#86efac' }}>Loading logs...</div>}
      {!loading && logs.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: '#86efac' }}>No log entries.</div>
      )}
      {logs.map(log => (
        <LogRow key={log.id} log={log} />
      ))}
    </div>
  );
}

function LogRow({ log }) {
  const [expanded, setExpanded] = useState(false);
  const isScan = log.kind === 'scan';
  const accent = ACTION_COLORS[log.action] || '#86efac';
  const timestamp = log.created_at ? new Date(log.created_at).toLocaleString() : '';

  return (
    <div className="card" style={{
      marginBottom: 10, padding: 12, borderLeft: `3px solid ${accent}`,
    }}>
      <div
        onClick={() => setExpanded(s => !s)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
          <span className="mono" style={{
            fontSize: 9, padding: '3px 8px', borderRadius: 2, letterSpacing: 1.5,
            background: `${accent}1a`, color: accent, border: `1px solid ${accent}66`, textTransform: 'uppercase',
          }}>
            {isScan ? 'SCAN' : 'ADMIN'}
          </span>
          <span style={{ color: '#e5e5e5', fontWeight: 600, fontSize: 13 }}>
            {log.actor?.username || '-'}
          </span>
          {log.actor?.role && (
            <span className="mono" style={{ fontSize: 9, color: '#6dba85', letterSpacing: 1.5, textTransform: 'uppercase' }}>
              {log.actor.role}
            </span>
          )}
          <span style={{ color: '#86efac', fontSize: 12 }}>·</span>
          <span style={{ color: '#86efac', fontSize: 12, letterSpacing: 0.5 }}>
            {log.action.replace(/_/g, ' ')}
          </span>
          {log.target && (
            <>
              <span style={{ color: '#3f6e4a', fontSize: 12 }}>→</span>
              <span style={{ color: '#d8ffe6', fontSize: 12 }}>@{log.target.username}</span>
            </>
          )}
          {isScan && log.scan && (
            <>
              <span style={{ color: '#3f6e4a', fontSize: 12 }}>·</span>
              <span className="mono" style={{ fontSize: 11, color: accent, letterSpacing: 1 }}>
                {log.scan.verdict?.toUpperCase()}
              </span>
              <span className="mono" style={{ fontSize: 11, color: '#6dba85' }}>
                {(log.scan.confidence_score * 100).toFixed(0)}%
              </span>
            </>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#737373', fontSize: 11, whiteSpace: 'nowrap' }}>{timestamp}</span>
          <span className="mono" style={{ fontSize: 11, color: '#00ff66' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #112418' }}>
          {isScan && log.scan ? (
            <ScanLogDetail scan={log.scan} />
          ) : (
            <pre style={{
              color: '#86efac', fontSize: 11, lineHeight: 1.6, fontFamily: "'JetBrains Mono', monospace",
              background: '#000', padding: 10, borderRadius: 2, border: '1px solid #112418',
              whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0,
            }}>
              {JSON.stringify(log.details ?? {}, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function ScanLogDetail({ scan }) {
  const imageUrl = scan.has_image ? api.adminScanImageUrl(scan.scan_id) : null;
  const verdictColors = { forged: '#ff3344', suspicious: '#ffa040', no_forgery_detected: '#00ff66', not_a_document: '#737373' };
  const vc = verdictColors[scan.verdict] || '#86efac';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: imageUrl ? '220px 1fr' : '1fr', gap: 16 }}>
      {imageUrl && (
        <div>
          <p className="mono" style={{ fontSize: 9, letterSpacing: 2, color: '#3f6e4a', margin: '0 0 6px', textTransform: 'uppercase' }}>
            Scan Image
          </p>
          <img
            src={imageUrl}
            alt={scan.filename}
            style={{ width: '100%', border: '1px solid #1d3825', borderRadius: 2 }}
          />
          <p className="mono" style={{ fontSize: 10, color: '#6dba85', margin: '6px 0 0', wordBreak: 'break-all' }}>
            {scan.filename}
          </p>
          <p className="mono" style={{ fontSize: 10, color: '#3f6e4a', margin: '2px 0 0' }}>
            {scan.image_width} × {scan.image_height}
          </p>
        </div>
      )}
      <div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 10 }}>
          <Pill label="Scan ID" value={scan.scan_id} mono />
          <Pill label="Verdict" value={scan.verdict?.toUpperCase()} color={vc} />
          <Pill label="Confidence" value={`${(scan.confidence_score * 100).toFixed(1)}%`} />
          {scan.detected_category && <Pill label="Category" value={scan.detected_category} />}
          {scan.certainty_level && <Pill label="Certainty" value={scan.certainty_level} />}
          {scan.document_type && <Pill label="Doc Type" value={scan.document_type} />}
        </div>

        {scan.category_explanation && (
          <div style={{ marginBottom: 10 }}>
            <p className="mono" style={{ fontSize: 9, letterSpacing: 2, color: '#3f6e4a', margin: '0 0 4px', textTransform: 'uppercase' }}>
              Gemini Explanation
            </p>
            <p style={{ color: '#d8ffe6', fontSize: 12, lineHeight: 1.6, margin: 0 }}>{scan.category_explanation}</p>
          </div>
        )}

        {scan.category_evidence?.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <p className="mono" style={{ fontSize: 9, letterSpacing: 2, color: '#3f6e4a', margin: '0 0 4px', textTransform: 'uppercase' }}>
              Evidence
            </p>
            <ul style={{ margin: 0, paddingLeft: 18, color: '#86efac', fontSize: 12, lineHeight: 1.6 }}>
              {scan.category_evidence.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}

        {scan.llm_explanation && (
          <div style={{ marginBottom: 10 }}>
            <p className="mono" style={{ fontSize: 9, letterSpacing: 2, color: '#3f6e4a', margin: '0 0 4px', textTransform: 'uppercase' }}>
              LLM Explanation
            </p>
            <p style={{ color: '#d8ffe6', fontSize: 12, lineHeight: 1.6, margin: 0 }}>{scan.llm_explanation}</p>
          </div>
        )}

        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: 'pointer', color: '#86efac', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace" }}>
            ▸ Full JSON
          </summary>
          <pre style={{
            color: '#86efac', fontSize: 11, lineHeight: 1.6, fontFamily: "'JetBrains Mono', monospace",
            background: '#000', padding: 10, borderRadius: 2, border: '1px solid #112418', marginTop: 8,
            whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 360, overflow: 'auto',
          }}>
            {JSON.stringify(scan, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}

function Pill({ label, value, color = '#86efac', mono = false }) {
  return (
    <div style={{ background: '#0a120c', border: '1px solid #112418', padding: '6px 10px', borderRadius: 2 }}>
      <div className="mono" style={{ fontSize: 9, letterSpacing: 1.5, color: '#3f6e4a', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{
        fontSize: 12, color, fontFamily: mono ? "'JetBrains Mono', monospace" : 'inherit',
        marginTop: 2, wordBreak: 'break-all',
      }}>
        {value}
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────
// ROLES MANAGER (super admin only)
// ─────────────────────────────────────────────────────────────────

const DEFAULT_ROLE_COLORS = [
  '#00ff66', '#00ffaa', '#a3e635', '#fbbf24', '#fb923c',
  '#f87171', '#c084fc', '#60a5fa', '#22d3ee', '#86efac',
];

function RolesManager({ roles, permissions, onReload, onError }) {
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  function emptyRole() {
    return {
      name: '',
      color: DEFAULT_ROLE_COLORS[Math.floor(Math.random() * DEFAULT_ROLE_COLORS.length)],
      description: '',
      permissions: [],
      is_self_assignable: false,
      sort_order: 100,
    };
  }

  async function saveRole(role) {
    setBusy(true);
    try {
      if (role.id) {
        await api.updateRole(role.id, {
          name: role.name,
          color: role.color,
          description: role.description,
          permissions: role.permissions,
          is_self_assignable: role.is_self_assignable,
          sort_order: role.sort_order,
        });
      } else {
        await api.createRole({
          name: role.name,
          color: role.color,
          description: role.description,
          permissions: role.permissions,
          is_self_assignable: role.is_self_assignable,
          sort_order: role.sort_order,
        });
      }
      setEditing(null);
      setCreating(false);
      await onReload();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteRole(role) {
    if (!confirm(`Delete role "${role.name}"? All users with this role will be moved back to "user".`)) return;
    setBusy(true);
    try {
      await api.deleteRole(role.id);
      await onReload();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Group permissions by their group label for display
  const permGroups = permissions.reduce((acc, p) => {
    (acc[p.group] = acc[p.group] || []).push(p);
    return acc;
  }, {});

  return (
    <div>
      <div className="card" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 className="oswald" style={{ fontSize: 16, letterSpacing: 2, textTransform: 'uppercase', color: '#00ff66', margin: 0 }}>
            Role Management
          </h2>
          <p style={{ color: '#86efac', fontSize: 12, marginTop: 6, marginBottom: 0 }}>
            Create roles for sections / groups. Edit privileges for any role. Color-code for at-a-glance grouping in the Users tab.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(emptyRole()); setCreating(true); }} disabled={busy}>
          + New Role
        </button>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {roles.map(r => (
          <div key={r.id} className="card" style={{
            background: `${r.color}10`, borderLeft: `4px solid ${r.color}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexWrap: 'wrap', gap: 12,
          }}>
            <div style={{ flex: '1 1 240px', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{
                  display: 'inline-block', width: 14, height: 14, borderRadius: 3,
                  background: r.color, border: '1px solid rgba(0,0,0,0.2)',
                }} />
                <span className="oswald" style={{
                  color: r.color, fontSize: 16, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 600,
                }}>
                  {r.name}
                </span>
                {r.is_system && <Badge color="#a3e635">System</Badge>}
                {r.is_self_assignable && <Badge color="#22d3ee">Self-assignable</Badge>}
              </div>
              {r.description && (
                <div style={{ color: '#86efac', fontSize: 12, marginTop: 6 }}>{r.description}</div>
              )}
              <div style={{ color: '#3f6e4a', fontSize: 11, marginTop: 4 }}>
                {r.permissions.length === 0 ? 'No permissions' : r.permissions.map(pKey => {
                  const perm = permissions && permissions.length > 0
                    ? permissions.find(p => p.key === pKey)
                    : null;
                  return perm ? perm.label : pKey;
                }).join(', ')}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn" onClick={() => { setEditing({ ...r }); setCreating(false); }} disabled={busy}>
                Edit
              </button>
              {!r.is_system && (
                <button
                  className="btn"
                  onClick={() => deleteRole(r)}
                  disabled={busy}
                  style={{ borderColor: '#ff3344', color: '#ff8a99' }}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <Modal
          onClose={() => { setEditing(null); setCreating(false); }}
          title={creating ? 'New role' : `Edit role ${editing.name}`}
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label="Name">
              <input
                className="input"
                value={editing.name}
                onChange={e => setEditing({ ...editing, name: e.target.value })}
                disabled={editing.is_system && !creating}
                placeholder="e.g., Section A, Mentor, Student"
              />
              {editing.is_system && !creating && (
                <div style={{ color: '#86efac', fontSize: 11, marginTop: 4 }}>System roles cannot be renamed.</div>
              )}
            </Field>

            <Field label="Color">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {DEFAULT_ROLE_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setEditing({ ...editing, color: c })}
                    style={{
                      width: 28, height: 28, borderRadius: 4, background: c, cursor: 'pointer',
                      border: editing.color === c ? '2px solid #fff' : '1px solid #1d3825',
                    }}
                  />
                ))}
                <input
                  type="color"
                  value={editing.color}
                  onChange={e => setEditing({ ...editing, color: e.target.value })}
                  style={{ width: 36, height: 28, border: '1px solid #1d3825', background: '#0a120c', cursor: 'pointer', borderRadius: 4 }}
                />
                <span style={{ color: '#86efac', fontSize: 11, fontFamily: 'monospace' }}>{editing.color}</span>
              </div>
            </Field>

            <Field label="Description">
              <input
                className="input"
                value={editing.description || ''}
                onChange={e => setEditing({ ...editing, description: e.target.value })}
                placeholder="What this role is for"
              />
            </Field>

            <Field label="Permissions">
              <div style={{
                border: '1px solid #1d3825', borderRadius: 3, padding: 10, background: '#0a120c',
                maxHeight: 280, overflowY: 'auto', display: 'grid', gap: 10,
              }}>
                {Object.entries(permGroups).map(([group, perms]) => (
                  <div key={group}>
                    <div className="mono" style={{ fontSize: 10, color: '#3f6e4a', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>
                      {group}
                    </div>
                    {perms.map(p => {
                      const checked = editing.permissions.includes(p.key);
                      const isSuperPerm = p.key === 'is_superadmin';
                      const disabled = isSuperPerm && editing.name !== 'superadmin';
                      return (
                        <label
                          key={p.key}
                          style={{
                            display: 'flex', alignItems: 'flex-start', gap: 8, padding: '5px 0',
                            color: disabled ? '#3f6e4a' : '#d8ffe6', fontSize: 12, cursor: disabled ? 'not-allowed' : 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={e => {
                              const next = e.target.checked
                                ? [...editing.permissions, p.key]
                                : editing.permissions.filter(k => k !== p.key);
                              setEditing({ ...editing, permissions: next });
                            }}
                            style={{ marginTop: 2 }}
                          />
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ color: disabled ? '#3f6e4a' : '#d8ffe6' }}>{p.label}</span>
                            {p.description && (
                              <span style={{ color: '#5fa873', fontSize: 11, lineHeight: '1.3' }}>{p.description}</span>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>
            </Field>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#d8ffe6' }}>
              <input
                type="checkbox"
                checked={!!editing.is_self_assignable}
                onChange={e => setEditing({ ...editing, is_self_assignable: e.target.checked })}
              />
              Self-assignable (users can pick this role themselves on their Account page)
            </label>

            <Field label="Sort order">
              <input
                className="input"
                type="number"
                value={editing.sort_order}
                onChange={e => setEditing({ ...editing, sort_order: parseInt(e.target.value) || 0 })}
              />
            </Field>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn" onClick={() => { setEditing(null); setCreating(false); }} disabled={busy}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={() => saveRole(editing)} disabled={busy}>
                {busy ? 'Saving…' : creating ? 'Create role' : 'Save'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Rooms (Sections) - admins create rooms, students join via code
// ──────────────────────────────────────────────────────────────────

function RoomsManager({ onError }) {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listRooms();
      setRooms(data.rooms || []);
    } catch (err) {
      onError(err.message);
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    if (!newName.trim()) { onError('Name is required'); return; }
    setBusy(true);
    try {
      const created = await api.createRoom(newName.trim(), newDescription.trim());
      setNewName(''); setNewDescription(''); setCreating(false);
      setRooms(cs => [created, ...cs]);
      setExpandedId(created.id);
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 className="oswald" style={{
              fontSize: 16, letterSpacing: 2, textTransform: 'uppercase',
              color: '#d8ffe6', margin: 0, fontWeight: 700,
            }}>
              Rooms
            </h2>
            <span className="mono" style={{ fontSize: 11, color: '#3f6e4a', letterSpacing: 1 }}>
              {rooms.length} TOTAL
            </span>
          </div>
          {!creating && (
            <button
              className="btn btn-primary"
              onClick={() => setCreating(true)}
              style={{ fontSize: 12, padding: '8px 14px', minHeight: 'unset', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Plus size={14} strokeWidth={2.5} />
              Add Room
            </button>
          )}
        </div>

        {creating && (
          <div style={{
            background: 'rgba(0,255,102,0.04)', border: '1px solid #1d3825',
            borderRadius: 4, padding: 14, marginTop: 8,
          }}>
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>Room name</label>
              <input
                className="input"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. BSCS 3-A · Document Forensics"
                maxLength={120}
                autoFocus
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Description (optional)</label>
              <textarea
                className="input"
                value={newDescription}
                onChange={e => setNewDescription(e.target.value)}
                placeholder="What students will work on in this section."
                rows={2}
                maxLength={2000}
                style={{ resize: 'vertical', fontFamily: "'Source Sans Pro', sans-serif" }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                className="btn"
                onClick={() => { setCreating(false); setNewName(''); setNewDescription(''); }}
                disabled={busy}
              >
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={busy}>
                {busy ? 'Creating…' : 'Create Room'}
              </button>
            </div>
          </div>
        )}

        <p style={{ fontSize: 13, color: '#86efac', lineHeight: 1.6, margin: '8px 0 0' }}>
          Share each room's join code with your students, they'll enter it from their account page to join. You'll see them in the class list below.
        </p>
      </div>

      {loading ? (
        <p className="mono" style={{ color: '#6dba85', textAlign: 'center', padding: 24 }}>
          ◌ Loading rooms…
        </p>
      ) : rooms.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <GraduationCap size={32} strokeWidth={1.5} style={{ color: '#3f6e4a', margin: '0 auto 10px' }} />
          <p className="mono" style={{ color: '#6dba85', letterSpacing: 1, fontSize: 13 }}>
            No rooms yet, click "Add Room" to create your first one.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rooms.map(c => (
            <RoomCard
              key={c.id}
              room={c}
              expanded={expandedId === c.id}
              onToggle={() => setExpandedId(id => id === c.id ? null : c.id)}
              onChange={updated => setRooms(cs => cs.map(x => x.id === updated.id ? updated : x))}
              onDelete={() => setRooms(cs => cs.filter(x => x.id !== c.id))}
              onError={onError}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RoomCard({ room, expanded, onToggle, onChange, onDelete, onError }) {
  const [detail, setDetail] = useState(room);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(room.name);
  const [description, setDescription] = useState(room.description || '');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Fetch full details (with members) when first expanded
  useEffect(() => {
    if (expanded && !detail.members) {
      api.getRoom(room.id).then(setDetail).catch(err => onError(err.message));
    }
  }, [expanded, room.id]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(detail.join_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  async function regenerate() {
    if (!confirm('Generate a new join code? The old code will stop working immediately.')) return;
    setBusy(true);
    try {
      const res = await api.regenerateRoomCode(room.id);
      const updated = { ...detail, join_code: res.join_code };
      setDetail(updated);
      onChange(updated);
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    setBusy(true);
    try {
      const updated = await api.updateRoom(room.id, {
        name: name.trim(),
        description: description.trim(),
      });
      setDetail(updated);
      onChange(updated);
      setEditing(false);
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    setBusy(true);
    try {
      await api.deleteRoom(room.id);
      onDelete();
    } catch (err) {
      onError(err.message);
      setBusy(false);
    }
  }

  async function kickMember(userId, username) {
    if (!confirm(`Remove ${username} from this room?`)) return;
    try {
      await api.removeRoomMember(room.id, userId);
      const fresh = await api.getRoom(room.id);
      setDetail(fresh);
      onChange(fresh);
    } catch (err) {
      onError(err.message);
    }
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
          padding: '14px 18px', textAlign: 'left',
          display: 'flex', alignItems: 'center', gap: 12,
        }}
      >
        {expanded
          ? <ChevronDown size={18} strokeWidth={2} style={{ color: '#6dba85', flexShrink: 0 }} />
          : <ChevronRight size={18} strokeWidth={2} style={{ color: '#6dba85', flexShrink: 0 }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="oswald" style={{
            fontSize: 15, color: '#d8ffe6', letterSpacing: 1, fontWeight: 600,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {detail.name}
          </div>
          {detail.description && (
            <div style={{
              fontSize: 12, color: '#86efac', marginTop: 2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {detail.description}
            </div>
          )}
        </div>
        <span className="mono" style={{
          fontSize: 11, color: '#00ff66', letterSpacing: 2, fontWeight: 700,
          background: 'rgba(0,255,102,0.08)', border: '1px solid #1d3825',
          borderRadius: 4, padding: '4px 10px', flexShrink: 0,
        }}>
          {detail.join_code}
        </span>
        <span className="mono" style={{
          fontSize: 11, color: '#3f6e4a', letterSpacing: 1, flexShrink: 0,
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          <Users size={12} strokeWidth={2} />
          {detail.member_count ?? (detail.members?.length || 0)}
        </span>
      </button>

      {expanded && (
        <div style={{ padding: '0 18px 18px', borderTop: '1px solid #112418' }}>
          {/* Join code panel */}
          <div style={{
            marginTop: 14, padding: 14,
            background: 'rgba(0,255,102,0.05)', border: '1px solid #1d3825',
            borderRadius: 4,
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div className="mono" style={{ fontSize: 9, color: '#3f6e4a', letterSpacing: 2, marginBottom: 4, textTransform: 'uppercase' }}>
                Join code
              </div>
              <div className="mono" style={{ fontSize: 22, color: '#00ff66', letterSpacing: 4, fontWeight: 700 }}>
                {detail.join_code}
              </div>
            </div>
            <button
              onClick={copyCode}
              className="btn btn-secondary"
              style={{ fontSize: 11, padding: '8px 12px', minHeight: 'unset', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {copied ? <Check size={14} strokeWidth={2.5} /> : <Copy size={14} strokeWidth={2} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={regenerate}
              className="btn btn-secondary"
              disabled={busy}
              style={{ fontSize: 11, padding: '8px 12px', minHeight: 'unset', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <RefreshCw size={14} strokeWidth={2} />
              Regenerate
            </button>
          </div>

          {/* Edit / delete controls */}
          <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!editing && !confirmDelete && (
              <>
                <button
                  className="btn btn-secondary"
                  onClick={() => setEditing(true)}
                  style={{ fontSize: 11, padding: '6px 10px', minHeight: 'unset', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <Pencil size={12} strokeWidth={2.2} />
                  Edit
                </button>
                <button
                  className="btn"
                  onClick={() => setConfirmDelete(true)}
                  style={{
                    fontSize: 11, padding: '6px 10px', minHeight: 'unset', background: 'transparent',
                    color: '#ff8a99', border: '1px solid #ff8a99',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <Trash2 size={12} strokeWidth={2.2} />
                  Delete
                </button>
              </>
            )}
          </div>

          {editing && (
            <div style={{ marginTop: 12, padding: 12, border: '1px solid #1d3825', borderRadius: 4 }}>
              <div style={{ marginBottom: 8 }}>
                <label style={labelStyle}>Room name</label>
                <input className="input" value={name} onChange={e => setName(e.target.value)} maxLength={120} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Description</label>
                <textarea
                  className="input"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  style={{ resize: 'vertical', fontFamily: "'Source Sans Pro', sans-serif" }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn" onClick={() => { setEditing(false); setName(detail.name); setDescription(detail.description || ''); }} disabled={busy}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={saveEdit} disabled={busy}>
                  {busy ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          )}

          {confirmDelete && (
            <div style={{
              marginTop: 12, padding: 14,
              background: 'rgba(255,51,68,0.08)', border: '1px solid #ff3344',
              borderRadius: 4,
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            }}>
              <AlertTriangle size={16} strokeWidth={2.2} style={{ color: '#ff8a99' }} />
              <span style={{ fontSize: 13, color: '#ff8a99', flex: 1, minWidth: 200 }}>
                Delete <strong>{detail.name}</strong> and remove all enrolled students? This can't be undone.
              </span>
              <button className="btn" onClick={() => setConfirmDelete(false)} disabled={busy}>
                Keep
              </button>
              <button
                className="btn"
                onClick={doDelete}
                disabled={busy}
                style={{ background: '#ff3344', color: '#fff' }}
              >
                {busy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          )}

          {/* Class list */}
          <div style={{ marginTop: 18 }}>
            <div className="mono" style={{
              fontSize: 10, color: '#6dba85', letterSpacing: 2,
              textTransform: 'uppercase', marginBottom: 10, fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <Users size={12} strokeWidth={2.2} />
              Class List ({detail.members?.length || 0})
            </div>
            {detail.members && detail.members.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid #112418', borderRadius: 4 }}>
                {detail.members.map((m, i) => (
                  <div key={m.id} style={{
                    padding: '10px 12px',
                    borderTop: i === 0 ? 'none' : '1px solid #112418',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: 'rgba(0,255,102,0.1)', border: '1px solid #1d3825',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, color: '#00ff66', fontFamily: "'JetBrains Mono', monospace", flexShrink: 0,
                    }}>
                      {(m.full_name || m.username || '?').charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: '#d8ffe6', fontWeight: 500 }}>
                        {m.full_name || m.username}
                      </div>
                      <div className="mono" style={{ fontSize: 10, color: '#3f6e4a', letterSpacing: 0.5 }}>
                        {m.email} · {m.role}
                      </div>
                    </div>
                    <button
                      onClick={() => kickMember(m.id, m.username)}
                      title="Remove from room"
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: '#ff8a99', padding: 4, display: 'inline-flex',
                      }}
                    >
                      <Trash2 size={14} strokeWidth={2} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mono" style={{ fontSize: 12, color: '#3f6e4a', padding: '12px 0', fontStyle: 'italic' }}>
                No students yet. Share the join code above.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
