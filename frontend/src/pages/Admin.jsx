import React, { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../api/client';
import { useAuth } from '../App';
import { TIER_COLORS, TIER_META, categoriesByTier } from '../categories';
import { FingerprintWatermark, EyeMark, FingerprintScan } from '../components/ForensicMotifs';

const PLANS = ['free', 'basic', 'pro'];

const labelStyle = { fontSize: 11, color: '#86efac', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, display: 'block' };

export default function Admin() {
  const { user: me } = useAuth();
  const isSuperAdmin = me?.role === "superadmin";
  const [tab, setTab] = useState('users'); // 'users', 'promo', 'dataset', 'logs'
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [codes, setCodes] = useState([]);
  const [codesLoading, setCodesLoading] = useState(false);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [newCode, setNewCode] = useState({ code: '', plan: 'pro', max_uses: '10', expires_in_days: '' });
  const [datasetTotals, setDatasetTotals] = useState({});
  const [trainedKeys, setTrainedKeys] = useState({});
  const [scanCat, setScanCat] = useState(null); // category to scan in modal
  const [geminiStatus, setGeminiStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [banningUserId, setBanningUserId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [list, s] = await Promise.all([
        api.adminListUsers({ q }),
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
  }, [q]);

  const loadCodes = useCallback(async () => {
    setCodesLoading(true);
    setError('');
    try {
      const data = await api.adminListCodes();
      setCodes(data.codes || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setCodesLoading(false);
    }
  }, []);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    setError('');
    try {
      const data = await api.adminViewLogs();
      setLogs(data.logs || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (tab === 'promo' && isSuperAdmin) loadCodes(); }, [tab, loadCodes, isSuperAdmin]);
  useEffect(() => { if (tab === 'logs' && isSuperAdmin) loadLogs(); }, [tab, loadLogs, isSuperAdmin]);
  useEffect(() => {
    if (tab === 'dataset') {
      api.getCategories().then(data => {
        const totals = {};
        const keys = {};
        Object.values(data.categories || {}).forEach(arr => {
          arr.forEach(item => {
            totals[item.api_key] = item.dataset_count || 0;
            keys[item.api_key] = !!item.is_trained;
          });
        });
        setDatasetTotals(totals);
        setTrainedKeys(keys);
      }).catch(() => {});
      api.adminGeminiStatus()
        .then(setGeminiStatus)
        .catch(() => setGeminiStatus({ configured: false, model: 'gemini-2.5-flash', calls_today: 0, daily_limit: 1500, calls_remaining_today: 1500, rpm_limit: 10, total_calls_ever: 0, resets_in_hours: 0 }));
    }
  }, [tab]);

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

  async function generateCode() {
    if (!newCode.code.trim() || !newCode.max_uses) {
      setError('Code and max uses are required');
      return;
    }
    setGeneratingCode(true);
    setError('');
    try {
      await api.adminGenerateCode(newCode.code, newCode.plan, parseInt(newCode.max_uses), newCode.expires_in_days);
      setNewCode({ code: '', plan: 'pro', max_uses: '10', expires_in_days: '' });
      await loadCodes();
    } catch (err) {
      setError(err.message);
    } finally {
      setGeneratingCode(false);
    }
  }

  async function deactivateCode(codeId) {
    setError('');
    try {
      await api.adminDeactivateCode(codeId);
      await loadCodes();
    } catch (err) {
      setError(err.message);
    }
  }

  async function banUser(userId) {
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <p className="classification-bar" style={{ marginBottom: 6 }}>
            CONTROL · ADMIN · CONSOLE
          </p>
          <h1 className="oswald glow" style={{
            fontSize: 26, color: '#00ff66', letterSpacing: 4, textTransform: 'uppercase', margin: 0,
          }}>
            Admin Panel
          </h1>
        </div>
        <span className="mono" style={{ fontSize: 11, color: '#86efac', letterSpacing: 2, textTransform: 'uppercase' }}>
          {total} OPERATOR{total === 1 ? '' : 'S'}
        </span>
      </div>

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
          <StatCard label="Total Users" value={stats.total_users} />
          <StatCard label="Total Scans" value={stats.total_scans} />
          <StatCard label="Admins" value={stats.admins} />
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
        {isSuperAdmin && (
          <>
            <button
              className="mono"
              onClick={() => setTab('promo')}
              style={{
                padding: '8px 12px', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer',
                color: tab === 'promo' ? '#00ff66' : '#86efac',
                textTransform: 'uppercase', letterSpacing: 1,
                borderBottom: tab === 'promo' ? '2px solid #00ff66' : 'none',
                marginBottom: '-12px',
              }}
            >
              Promo Codes
            </button>
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
          </>
        )}
        <button
          className="mono"
          onClick={() => setTab('dataset')}
          style={{
            padding: '8px 12px', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer',
            color: tab === 'dataset' ? '#00ff66' : '#86efac',
            textTransform: 'uppercase', letterSpacing: 1,
            borderBottom: tab === 'dataset' ? '2px solid #00ff66' : 'none',
            marginBottom: '-12px',
          }}
        >
          Dataset
        </button>
      </div>

      {tab === 'users' && (
      <div>
      <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 200px' }}>
          <label style={labelStyle}>Search</label>
          <input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="email, username, name" />
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
            onEdit={() => setEditing({ ...u, _password: '' })}
            onDelete={() => setDeleteId(u.id)}
            onBan={() => banUser(u.id)}
            onUnban={() => unbanUser(u.id)}
            isBanning={banningUserId === u.id}
          />
        ))}
        {!loading && users.length === 0 && (
          <div className="card" style={{ textAlign: 'center', color: '#86efac' }}>No users found.</div>
        )}
      </div>

      {editing && (
        <Modal onClose={() => setEditing(null)} title={`Edit user — ${editing.email}`}>
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label="Email"><input className="input" value={editing.email} onChange={e => setEditing({ ...editing, email: e.target.value })} /></Field>
            <Field label="Username"><input className="input" value={editing.username} onChange={e => setEditing({ ...editing, username: e.target.value })} /></Field>
            <Field label="Full name"><input className="input" value={editing.full_name || ''} onChange={e => setEditing({ ...editing, full_name: e.target.value })} /></Field>
            <Field label="Reset password (optional, min 6 chars)">
              <input className="input" type="password" value={editing._password} onChange={e => setEditing({ ...editing, _password: e.target.value })} placeholder="Leave blank to keep current" />
            </Field>
            <Field label="Role">
              <select className="input" value={editing.role || 'user'} onChange={e => setEditing({ ...editing, role: e.target.value })} disabled={editing.id === me?.id}>
                <option value="user">User</option>
                <option value="admin">Admin</option>
                <option value="superadmin">Super Admin</option>
              </select>
              {editing.id === me?.id && <span style={{ color: '#86efac', fontSize: 11, marginTop: 4, display: 'block' }}>(cannot change own role)</span>}
            </Field>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#e5e5e5' }}>
              <input type="checkbox" checked={editing.is_active} onChange={e => setEditing({ ...editing, is_active: e.target.checked })} disabled={editing.id === me?.id} />
              Active {editing.id === me?.id && <span style={{ color: '#86efac', fontSize: 11 }}>(cannot deactivate own)</span>}
            </label>
            <div style={{ borderTop: '1px solid #112418', paddingTop: 12, fontSize: 12, color: '#86efac' }}>
              <div>ID: <span style={{ color: '#d8ffe6', fontFamily: 'monospace' }}>{editing.id}</span></div>
              <div>Stripe customer: <span style={{ color: '#d8ffe6', fontFamily: 'monospace' }}>{editing.stripe_customer_id || '—'}</span></div>
              <div>Stripe subscription: <span style={{ color: '#d8ffe6', fontFamily: 'monospace' }}>{editing.stripe_subscription_id || '—'}</span></div>
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

      {deleteId && (
        <Modal onClose={() => setDeleteId(null)} title="Delete user?">
          <p style={{ color: '#e5e5e5', fontSize: 14 }}>
            This permanently deletes the user and all their scan history. This cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn" onClick={() => setDeleteId(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={confirmDelete}>Delete</button>
          </div>
        </Modal>
      )}
      </div>
      )}

      {tab === 'dataset' && (
        <div>
          {/* hero */}
          <div style={{ position: 'relative', textAlign: 'center', marginBottom: 36, padding: '12px 0 4px' }}>
            <FingerprintWatermark size={420} opacity={0.045} style={{ position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)', zIndex: 0 }} />
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
                <FingerprintScan size={150} color="#00ff66" />
              </div>
              <p className="classification-bar" style={{ marginBottom: 14 }}>CASE FILE · FORENSIC PIPELINE · CLASSIFIED</p>
              <h2 className="oswald glow-strong" style={{ fontSize: 'clamp(24px, 5vw, 40px)', fontWeight: 700, letterSpacing: 5, marginBottom: 12, color: '#00ff66', textTransform: 'uppercase' }}>
                Dataset Overview
              </h2>
              <p style={{ color: '#86efac', maxWidth: 580, margin: '0 auto', lineHeight: 1.7, fontSize: 14 }}>
                Sixteen forgery detectors. Click any trained category to run a scan with its YOLOv8 model.
              </p>
              <div style={{ display: 'inline-flex', gap: 24, marginTop: 20, padding: '10px 22px', border: '1px solid #1d3825', borderRadius: 2, background: 'rgba(0,255,102,0.03)', boxShadow: 'inset 0 0 18px rgba(0,255,102,0.06)' }}>
                <DStat label="DETECTORS" value="16" color="#00ff66" />
                <DDivider />
                <DStat label="TRAINED" value={String(Object.values(trainedKeys).filter(Boolean).length)} color="#00ffaa" />
                <DDivider />
                <DStat label="TIERS" value="3" color="#a3e635" />
              </div>
            </div>
          </div>

          {geminiStatus && <GeminiStatusBar status={geminiStatus} />}

          {[1, 2, 3].map(tier => (
            <DatasetTierBucket
              key={tier}
              tier={tier}
              categories={categoriesByTier(tier)}
              datasetTotals={datasetTotals}
              trainedKeys={trainedKeys}
              onScan={cat => setScanCat(cat)}
            />
          ))}
        </div>
      )}

      {scanCat && (
        <ScanModal cat={scanCat} onClose={() => setScanCat(null)} />
      )}

      {tab === 'promo' && isSuperAdmin && (
      <div>
        <div className="card" style={{ marginBottom: 16, padding: 14 }}>
          <h3 className="oswald" style={{ margin: '0 0 12px 0', fontSize: 16, letterSpacing: 1, textTransform: 'uppercase' }}>Generate Promo Code</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            <div>
              <label style={labelStyle}>Code</label>
              <input
                className="input"
                value={newCode.code}
                onChange={e => setNewCode({ ...newCode, code: e.target.value.toUpperCase() })}
                placeholder="e.g., FALL-2024"
              />
            </div>
            <div>
              <label style={labelStyle}>Plan</label>
              <select className="input" value={newCode.plan} onChange={e => setNewCode({ ...newCode, plan: e.target.value })}>
                <option value="free">Free</option>
                <option value="pro">Pro</option>
                <option value="premium">Premium</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Max Uses</label>
              <input
                className="input"
                type="number"
                value={newCode.max_uses}
                onChange={e => setNewCode({ ...newCode, max_uses: e.target.value })}
                placeholder="10"
              />
            </div>
            <div>
              <label style={labelStyle}>Expires In (days, optional)</label>
              <input
                className="input"
                type="number"
                value={newCode.expires_in_days}
                onChange={e => setNewCode({ ...newCode, expires_in_days: e.target.value })}
                placeholder="30"
              />
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={generateCode}
            disabled={generatingCode}
            style={{ marginTop: 12 }}
          >
            {generatingCode ? 'Generating...' : 'Generate Code'}
          </button>
        </div>

        <h3 className="oswald" style={{ fontSize: 16, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>Active Codes</h3>
        {codesLoading && <div className="card" style={{ textAlign: 'center', color: '#86efac' }}>Loading codes...</div>}
        {!codesLoading && codes.length === 0 && <div className="card" style={{ textAlign: 'center', color: '#86efac' }}>No promo codes yet.</div>}
        {codes.map(c => (
          <div key={c.id} className="card" style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#e5e5e5', fontWeight: 600, fontSize: 14, fontFamily: 'monospace' }}>{c.code}</div>
              <div style={{ color: '#86efac', fontSize: 12, marginTop: 4 }}>
                {c.plan.toUpperCase()} · Uses: {c.uses} · Expires: {c.expires_at} · {c.is_active ? 'Active' : 'Inactive'}
              </div>
            </div>
            <button
              className="btn"
              onClick={() => deactivateCode(c.id)}
              disabled={!c.is_active}
              style={{ borderColor: c.is_active ? '#ff3344' : '#1d3825', color: c.is_active ? '#ff8a99' : '#3f6e4a' }}
            >
              {c.is_active ? 'Deactivate' : 'Deactivated'}
            </button>
          </div>
        ))}
      </div>
      )}

      {tab === 'logs' && isSuperAdmin && (
      <div>
        <h3 className="oswald" style={{ fontSize: 16, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>Admin Audit Logs</h3>
        {logsLoading && <div className="card" style={{ textAlign: 'center', color: '#86efac' }}>Loading logs...</div>}
        {!logsLoading && logs.length === 0 && <div className="card" style={{ textAlign: 'center', color: '#86efac' }}>No audit logs yet.</div>}
        {logs.map(log => (
          <div key={log.id} className="card" style={{ marginBottom: 12, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ color: '#e5e5e5', fontWeight: 600 }}>
                {log.admin?.username} · <span style={{ color: '#86efac' }}>{log.action.replace(/_/g, ' ').toUpperCase()}</span>
              </div>
              <div style={{ color: '#737373', fontSize: 11 }}>{new Date(log.created_at).toLocaleString()}</div>
            </div>
            {log.target && (
              <div style={{ color: '#86efac', fontSize: 12, marginBottom: 4 }}>
                Target: <span style={{ color: '#d8ffe6' }}>{log.target.email}</span> (@{log.target.username})
              </div>
            )}
            {log.details && (
              <div style={{ color: '#737373', fontSize: 11, marginTop: 4, fontFamily: 'monospace' }}>
                {JSON.stringify(log.details, null, 2)}
              </div>
            )}
          </div>
        ))}
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

function UserRow({ user, isMe, onEdit, onDelete, onBan, onUnban, isBanning }) {
  const planColor = { free: '#86efac', basic: '#00ffaa', pro: '#00ff66' }[user.plan] || '#86efac';
  return (
    <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ flex: '1 1 240px', minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: '#e5e5e5', fontWeight: 600, fontSize: 14, wordBreak: 'break-all' }}>{user.email}</span>
          {isMe && <Badge color="#00ff66">You</Badge>}
          {["admin","superadmin"].includes(user.role) && <Badge color="#a3e635">{user.role}</Badge>}
          {!user.is_active && <Badge color="#ff3344">Banned</Badge>}
          <Badge color={planColor}>{user.plan}</Badge>
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
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onEdit}>Edit</button>
        {user.is_active ? (
          <button
            className="btn"
            onClick={onBan}
            disabled={isMe || isBanning}
            style={{ borderColor: isMe ? '#1d3825' : '#ff9500', color: isMe ? '#3f6e4a' : '#ffa500' }}
            title={isMe ? 'You cannot ban your own account' : 'Ban user'}
          >
            {isBanning ? 'Banning...' : 'Ban'}
          </button>
        ) : (
          <button
            className="btn"
            onClick={onUnban}
            disabled={isBanning}
            style={{ borderColor: '#00cc88', color: '#00ff99' }}
            title="Unban user"
          >
            {isBanning ? 'Unbanning...' : 'Unban'}
          </button>
        )}
        <button
          className="btn"
          onClick={onDelete}
          disabled={isMe}
          style={{ borderColor: isMe ? '#1d3825' : '#ff3344', color: isMe ? '#3f6e4a' : '#ff8a99' }}
          title={isMe ? 'You cannot delete your own account' : 'Delete user'}
        >
          Delete
        </button>
      </div>
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

function GeminiStatusBar({ status }) {
  const pct = status.daily_limit > 0 ? (status.calls_today / status.daily_limit) * 100 : 0;
  const barColor = pct > 85 ? '#ff4444' : pct > 60 ? '#ffa040' : '#00ff66';
  return (
    <div style={{
      border: '1px solid #1d3825', borderLeft: `3px solid ${status.configured ? '#a78bfa' : '#555'}`,
      background: 'rgba(167,139,250,0.04)', borderRadius: 2, padding: '12px 16px',
      marginBottom: 28, display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center',
    }}>
      <div>
        <span className="mono" style={{ fontSize: 9, color: '#a78bfa', letterSpacing: 2, textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Gemini Vision</span>
        <span className="mono" style={{ fontSize: 12, color: status.configured ? '#c4b5fd' : '#666' }}>
          {status.configured ? status.model : 'NOT CONFIGURED'}
        </span>
      </div>
      {status.configured && (
        <>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span className="mono" style={{ fontSize: 10, color: '#86efac' }}>Today's requests</span>
              <span className="mono" style={{ fontSize: 10, color: barColor }}>{status.calls_today} / {status.daily_limit}</span>
            </div>
            <div style={{ height: 4, background: '#1d3825', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: barColor, transition: 'width 0.4s ease' }} />
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span className="mono" style={{ fontSize: 10, color: '#6dba85', display: 'block' }}>{status.calls_remaining_today} remaining</span>
            <span className="mono" style={{ fontSize: 10, color: '#3f6e4a' }}>resets in {status.resets_in_hours}h · {status.rpm_limit} RPM limit</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span className="mono" style={{ fontSize: 10, color: '#6dba85', display: 'block' }}>All-time</span>
            <span className="mono" style={{ fontSize: 12, color: '#c4b5fd' }}>{status.total_calls_ever} calls</span>
          </div>
        </>
      )}
    </div>
  );
}

function DStat({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div className="oswald" style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1, textShadow: `0 0 10px ${color}80` }}>{value}</div>
      <div className="mono" style={{ fontSize: 9, letterSpacing: 2, color: '#3f6e4a', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function DDivider() {
  return <div style={{ width: 1, background: '#1d3825', alignSelf: 'stretch', minHeight: 28 }} />;
}

function DatasetTierBucket({ tier, categories, datasetTotals, trainedKeys, onScan }) {
  const accent = TIER_COLORS[tier];
  const meta = TIER_META[tier];
  const trainedCount = categories.filter(c => trainedKeys[c.apiKey]).length;

  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14, paddingBottom: 10, borderBottom: `1px solid ${accent}33` }}>
        <div className="eye-blink" style={{ width: 40, height: 40, background: `${accent}18`, border: `1px solid ${accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 2, boxShadow: `0 0 14px ${accent}50`, padding: 7 }}>
          <EyeMark size={24} color={accent} />
        </div>
        <div style={{ flex: 1 }}>
          <h3 className="oswald" style={{ fontSize: 17, fontWeight: 700, letterSpacing: 3, margin: 0, color: accent, textTransform: 'uppercase', textShadow: `0 0 10px ${accent}66` }}>{meta.label}</h3>
          <p style={{ fontSize: 12, color: '#6dba85', margin: '2px 0 0', lineHeight: 1.4 }}>{meta.sublabel}</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <span className="mono" style={{ fontSize: 9, color: accent, padding: '3px 8px', border: `1px solid ${accent}66`, borderRadius: 2, letterSpacing: 1.5 }}>{categories.length} CLASSES</span>
          <span className="mono" style={{ fontSize: 9, color: '#3f6e4a', letterSpacing: 1.5 }}>{trainedCount}/{categories.length} TRAINED</span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {categories.map((cat, i) => (
          <DatasetCategoryCard
            key={cat.id}
            cat={cat}
            index={i + 1}
            datasetCount={datasetTotals[cat.apiKey] || 0}
            trained={trainedKeys[cat.apiKey]}
            onScan={() => onScan(cat)}
          />
        ))}
      </div>
    </section>
  );
}

function DatasetCategoryCard({ cat, index, datasetCount = 0, trained, onScan }) {
  const [hover, setHover] = useState(false);
  const accent = cat.color;

  return (
    <div
      role={trained ? 'button' : undefined}
      tabIndex={trained ? 0 : undefined}
      onClick={trained ? onScan : undefined}
      onKeyDown={trained ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onScan(); } } : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover && trained
          ? `linear-gradient(135deg, ${accent}10 0%, transparent 70%), #0a120c`
          : 'linear-gradient(135deg, rgba(0,255,102,0.015) 0%, transparent 70%), #0a120c',
        border: `1px solid ${hover && trained ? accent : '#112418'}`,
        borderLeft: `3px solid ${accent}`,
        padding: 0, textAlign: 'left',
        cursor: trained ? 'pointer' : 'default',
        transition: 'all 0.2s ease', position: 'relative', overflow: 'hidden',
        borderRadius: 3, color: 'inherit', font: 'inherit', width: '100%',
        boxShadow: hover && trained
          ? `0 6px 28px ${accent}30, 0 0 18px ${accent}20, inset 0 1px 0 ${accent}25`
          : `inset 0 1px 0 ${accent}10`,
        transform: hover && trained ? 'translateY(-2px)' : 'translateY(0)',
        opacity: trained ? 1 : 0.6,
      }}
    >
      <div className="oswald" style={{
        position: 'absolute', top: 12, right: 12, width: 28, height: 28,
        color: '#001005', fontWeight: 800, fontSize: 11,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: accent, boxShadow: hover && trained ? `0 0 14px ${accent}` : 'none',
        transition: 'box-shadow 0.2s', fontFamily: "'JetBrains Mono', monospace",
      }}>
        {String(index).padStart(2, '0')}
      </div>

      {hover && trained && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 1,
          background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
          animation: 'scan-pulse 1.4s ease-in-out infinite',
        }} />
      )}

      <div style={{ padding: '18px 18px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10, paddingRight: 36 }}>
          <span style={{ fontSize: 24, color: accent, textShadow: `0 0 ${hover ? 14 : 8}px ${accent}99`, transition: 'text-shadow 0.2s', lineHeight: 1, marginTop: 2 }}>{cat.icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="mono" style={{ fontSize: 9, letterSpacing: 2.5, margin: 0, color: accent, textShadow: `0 0 6px ${accent}80` }}>{cat.code}</p>
            <h3 className="oswald" style={{ fontSize: 17, fontWeight: 600, margin: 0, letterSpacing: 1, color: '#d8ffe6', textTransform: 'uppercase' }}>{cat.title}</h3>
          </div>
        </div>
        <p style={{ fontSize: 12, color: '#86efac', margin: 0, lineHeight: 1.5, opacity: 0.85 }}>{cat.description}</p>
      </div>

      <div style={{ borderTop: '1px solid #112418', padding: '10px 16px', background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <span className="mono" style={{ fontSize: 9, letterSpacing: 1.5, color: trained ? accent : '#3f6e4a', textShadow: trained ? `0 0 6px ${accent}80` : 'none' }}>
            {trained ? '● TRAINED' : '○ PENDING'}
          </span>
          <span className="mono" style={{ fontSize: 9, color: '#3f6e4a', letterSpacing: 1.5 }}>
            {datasetCount.toLocaleString()} IMG
          </span>
        </div>
        {trained && (
          <span className="mono" style={{ fontSize: 9, color: accent, letterSpacing: 1.5, padding: '3px 7px', border: `1px solid ${accent}40`, borderRadius: 2 }}>
            ▶ SCAN
          </span>
        )}
      </div>
    </div>
  );
}

function ScanModal({ cat, onClose }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [scanError, setScanError] = useState('');
  const fileRef = useRef();
  const canvasRef = useRef();
  const accent = cat.color;

  function handleFileChange(e) {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setResult(null);
    setScanError('');
    const reader = new FileReader();
    reader.onload = ev => setPreview(ev.target.result);
    reader.readAsDataURL(f);
  }

  async function handleScan() {
    if (!file) return;
    setLoading(true);
    setScanError('');
    setResult(null);
    try {
      const data = await api.analyze(file, cat.apiKey);
      setResult(data);
      if (data.annotations?.length > 0) {
        setTimeout(() => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const img = new Image();
          img.onload = () => {
            const maxW = Math.min(canvas.parentElement.offsetWidth - 32, 700);
            const scale = maxW / data.original_image_dimensions.width;
            canvas.width = data.original_image_dimensions.width * scale;
            canvas.height = data.original_image_dimensions.height * scale;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            data.annotations.forEach((ann, idx) => {
              const c = ann.coordinates;
              const x = c.x_min * scale, y = c.y_min * scale;
              const w = (c.x_max - c.x_min) * scale, h = (c.y_max - c.y_min) * scale;
              ctx.shadowColor = ann.color || accent;
              ctx.shadowBlur = 8;
              ctx.strokeStyle = ann.color || accent;
              ctx.lineWidth = 2;
              ctx.strokeRect(x, y, w, h);
              ctx.shadowBlur = 0;
              ctx.fillStyle = ann.color || accent;
              ctx.font = 'bold 12px JetBrains Mono';
              const label = `${idx + 1}. ${ann.title} (${(ann.confidence * 100).toFixed(0)}%)`;
              const tw = ctx.measureText(label).width + 8;
              ctx.fillRect(x, y - 18, tw, 18);
              ctx.fillStyle = '#000';
              ctx.fillText(label, x + 4, y - 5);
            });
          };
          img.src = preview;
        }, 100);
      }
    } catch (err) {
      setScanError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const verdictColors = { forged: '#ff3344', suspicious: '#ffa040', no_forgery_detected: '#00ff66', not_a_document: '#737373' };
  const verdictLabels = { forged: 'Forged', suspicious: 'Suspicious', no_forgery_detected: 'No Forgery Detected', not_a_document: 'Not a Document' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 24, zIndex: 1000, overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 640, marginTop: 40 }}>
        {/* header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: `1px solid ${accent}33`, paddingBottom: 14 }}>
          <div>
            <p className="mono" style={{ fontSize: 9, letterSpacing: 3, color: accent, margin: 0 }}>▣ CATEGORY · {cat.code}</p>
            <h3 className="oswald" style={{ fontSize: 20, letterSpacing: 2, textTransform: 'uppercase', margin: '4px 0 0', color: '#d8ffe6' }}>{cat.title}</h3>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#86efac', fontSize: 24, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* upload */}
        <div style={{ marginBottom: 16 }}>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
          <button type="button" className="btn btn-secondary" onClick={() => fileRef.current.click()} style={{ marginBottom: 12, width: '100%', padding: '12px 0' }}>
            ⎙ Select Document Image
          </button>
          <div onClick={() => fileRef.current.click()} style={{ border: `1px dashed ${preview ? '#1d3825' : '#1f5d39'}`, borderRadius: 3, padding: preview ? 12 : 36, textAlign: 'center', cursor: 'pointer', background: preview ? 'transparent' : 'rgba(0,255,102,0.02)' }}>
            {preview
              ? <img src={preview} alt="Preview" style={{ maxWidth: '100%', maxHeight: 280, borderRadius: 3, border: '1px solid #1d3825' }} />
              : <div>
                  <div className="mono glow" style={{ fontSize: 28, marginBottom: 8, color: '#00ff66' }}>+</div>
                  <p className="mono" style={{ color: '#86efac', fontSize: 12, letterSpacing: 1.5 }}>NO IMAGE LOADED</p>
                </div>
            }
          </div>
        </div>

        <button className="btn btn-primary" onClick={handleScan} disabled={!file || loading} style={{ width: '100%', fontSize: 15, padding: '16px 0', marginBottom: 16 }}>
          {loading ? '◌ Running detection…' : `▶ Scan with ${cat.title} Detector`}
        </button>

        {scanError && (
          <div style={{ background: 'rgba(255,51,68,0.1)', border: '1px solid #ff3344', padding: 12, borderRadius: 2, marginBottom: 16, fontSize: 13, color: '#ff8a99', fontFamily: "'JetBrains Mono', monospace" }}>
            ⚠ {scanError}
          </div>
        )}

        {result && (() => {
          const vc = verdictColors[result.verdict] || '#1d3825';
          const cat = result.detected_category;
          const geminiOk = typeof result.category_confidence === 'number' && result.category_confidence > 0;
          const geminiForgery = geminiOk && cat !== 'no_forgery_detected' && cat !== 'not_a_document';
          const ga = !cat || !geminiOk ? '#737373' : cat === 'no_forgery_detected' ? '#00ff66' : cat === 'not_a_document' ? '#737373' : cat === 'other' ? '#ffa040' : '#a78bfa';
          const categoryMatch = !result.category_analyzed || result.detected_category === result.category_analyzed;
          const hasYolo = result.annotations?.length > 0 && geminiForgery && categoryMatch;
          return (
            <div style={{ border: `1px solid ${vc}`, borderRadius: 3, overflow: 'hidden', boxShadow: `0 0 24px ${vc}30` }}>
              {/* verdict */}
              <div style={{ textAlign: 'center', padding: '22px 16px 20px', background: '#000', borderBottom: `1px solid ${vc}33`, boxShadow: `inset 0 0 28px ${vc}18` }}>
                <div className="oswald" style={{ fontSize: 28, fontWeight: 700, color: vc, textTransform: 'uppercase', letterSpacing: 5, textShadow: `0 0 18px ${vc}99` }}>
                  {verdictLabels[result.verdict] || result.verdict}
                </div>
                <div className="mono" style={{ color: '#6dba85', marginTop: 8, fontSize: 11, letterSpacing: 1.5 }}>
                  YOLO CONFIDENCE · {(result.confidence_score * 100).toFixed(1)}%
                </div>
              </div>

              <div style={{ padding: '16px 16px 4px' }}>
                {/* gemini */}
                {geminiOk ? (
                  <div style={{ marginBottom: 16 }}>
                    <p className="mono" style={{ fontSize: 9, letterSpacing: 3, color: ga, margin: '0 0 6px' }}>▣ GEMINI VISION · CLASSIFICATION</p>
                    <div style={{ background: `${ga}08`, border: `1px solid ${ga}44`, borderLeft: `3px solid ${ga}`, borderRadius: 3, padding: '10px 12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                        <h4 className="oswald" style={{ fontSize: 15, color: '#d8ffe6', textTransform: 'uppercase', letterSpacing: 1.5, margin: 0 }}>
                          {result.detected_category_label || cat}
                        </h4>
                        <span className="mono" style={{ fontSize: 10, color: ga }}>{(result.category_confidence * 100).toFixed(0)}% CONF</span>
                      </div>
                      {result.detected_subtype && <p style={{ fontSize: 11, color: ga, margin: '0 0 6px', fontStyle: 'italic' }}>Subtype: {result.detected_subtype}</p>}
                      {result.category_explanation && <p style={{ lineHeight: 1.6, fontSize: 12, color: '#d8ffe6', margin: '0 0 6px' }}>{result.category_explanation}</p>}
                      {result.category_evidence?.length > 0 && (
                        <ul style={{ margin: '0 0 6px', paddingLeft: 16, color: '#86efac', fontSize: 11, lineHeight: 1.5 }}>
                          {result.category_evidence.map((e, i) => <li key={i}>{e}</li>)}
                        </ul>
                      )}
                      {result.tools_likely_used && <p style={{ fontSize: 11, color: '#86efac', margin: 0, borderTop: '1px solid #112418', paddingTop: 6 }}>
                        <span className="mono" style={{ color: ga, marginRight: 4 }}>TOOLS:</span>{result.tools_likely_used}
                      </p>}
                    </div>
                  </div>
                ) : (
                  <div style={{ marginBottom: 16 }}>
                    <span className="mono" style={{ fontSize: 9, letterSpacing: 2, color: '#3f6e4a', padding: '4px 10px', border: '1px solid #1d3825', borderRadius: 2 }}>
                      ▣ GEMINI VISION · TEMPORARILY UNAVAILABLE
                    </span>
                  </div>
                )}

                {/* llm */}
                {result.llm_explanation && (
                  <div style={{ marginBottom: 16 }}>
                    <p className="mono" style={{ fontSize: 9, letterSpacing: 3, color: '#6dba85', margin: '0 0 6px' }}>▸ AI FORENSIC EXPLANATION</p>
                    <p style={{ lineHeight: 1.7, fontSize: 13, color: '#d8ffe6', margin: 0 }}>{result.llm_explanation}</p>
                  </div>
                )}

                {/* yolo — only when detections exist */}
                {hasYolo && (
                  <div style={{ marginBottom: 12 }}>
                    <p className="mono" style={{ fontSize: 9, letterSpacing: 3, color: '#6dba85', margin: '0 0 8px' }}>▸ YOLO · DETECTED REGIONS</p>
                    <canvas ref={canvasRef} style={{ maxWidth: '100%', borderRadius: 2, border: '1px solid #1d3825', marginBottom: 10 }} />
                    {result.annotations.map((ann, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid #112418' }}>
                        <span style={{ width: 24, height: 24, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', background: ann.color, color: '#000', fontSize: 10, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span style={{ flex: 1, fontSize: 13, color: '#d8ffe6' }}>{ann.title}</span>
                        <span className="mono" style={{ fontSize: 11, color: ann.color }}>{(ann.confidence * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
