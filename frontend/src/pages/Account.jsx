import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../App';
import { api } from '../api/client';

const darkInput = {
  background: '#0a0f0c',
  border: '2px solid rgba(0,255,102,0.5)',
  color: '#ffffff',
  width: '100%',
};

export default function Account() {
  const { user, refreshUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ full_name: '', username: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const [apiKeys, setApiKeys] = useState([]);
  const [newKeyValue, setNewKeyValue] = useState('');
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [keyError, setKeyError] = useState('');
  const [keyMsg, setKeyMsg] = useState('');
  const [highlightKeyInput, setHighlightKeyInput] = useState(() => localStorage.getItem('fg_highlight_key_input') === 'true');
  const [editingKeyId, setEditingKeyId] = useState(null);
  const [editLabel, setEditLabel] = useState('');
  const [editKeyValue, setEditKeyValue] = useState('');
  const [revealedKeys, setRevealedKeys] = useState({});

  const [allRoles, setAllRoles] = useState([]);
  const [roleMsg, setRoleMsg] = useState('');
  const [roleError, setRoleError] = useState('');

  useEffect(() => {
    if (user) setForm({ full_name: user.full_name || '', username: user.username || '' });
  }, [user]);

  useEffect(() => {
    if (highlightKeyInput) {
      localStorage.removeItem('fg_highlight_key_input');
      const timer = setTimeout(() => setHighlightKeyInput(false), 6000);
      return () => clearTimeout(timer);
    }
  }, [highlightKeyInput]);

  const loadKeys = useCallback(async () => {
    try {
      const data = await api.listApiKeys();
      setApiKeys(data.keys || []);
    } catch {}
  }, []);

  useEffect(() => { loadKeys(); }, [loadKeys]);

  useEffect(() => {
    api.listRoles().then(d => setAllRoles(d.roles || [])).catch(() => {});
  }, []);

  async function pickRole(roleName) {
    setRoleError('');
    setRoleMsg('');
    try {
      await api.assignUserRole(user.id, roleName);
      await refreshUser();
      setRoleMsg(`Role set to "${roleName}"`);
      setTimeout(() => setRoleMsg(''), 3000);
    } catch (err) {
      setRoleError(err.message);
    }
  }

  async function saveProfile() {
    setError('');
    try {
      await api.updateMe(form);
      await refreshUser();
      setEditing(false);
      setMsg('Profile updated.');
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAddKey() {
    setKeyError('');
    const trimmed = newKeyValue.trim();
    const labelTrimmed = newKeyLabel.trim();
    if (!trimmed) { setKeyError('Paste your API key first'); return; }
    if (!trimmed.startsWith('AIza')) { setKeyError('Invalid format — key must start with "AIza"'); return; }
    if (!labelTrimmed) { setKeyError('Give your key a name (e.g., "Account 1", "Backup")'); return; }
    try {
      await api.addApiKey(trimmed, labelTrimmed);
      setNewKeyValue('');
      setNewKeyLabel('');
      setKeyMsg('Key added!');
      await loadKeys();
      setTimeout(() => setKeyMsg(''), 3000);
    } catch (err) {
      setKeyError(err.message);
    }
  }

  async function handleActivate(keyId) {
    try {
      await api.activateApiKey(keyId);
      await loadKeys();
    } catch (err) {
      setKeyError(err.message);
    }
  }

  async function handleDelete(keyId) {
    try {
      await api.deleteApiKey(keyId);
      await loadKeys();
    } catch (err) {
      setKeyError(err.message);
    }
  }

  function startEdit(key) {
    setEditingKeyId(key.id);
    setEditLabel(key.label || '');
    setEditKeyValue(''); // User must re-paste the key if they want to change it
  }

  async function handleSaveEdit(keyId) {
    setKeyError('');
    if (!editLabel.trim()) { setKeyError('Key name is required'); return; }
    const trimmedKey = editKeyValue.trim();
    if (trimmedKey && !trimmedKey.startsWith('AIza')) { setKeyError('Invalid key format — must start with "AIza"'); return; }
    try {
      const patch = { label: editLabel.trim() };
      if (trimmedKey) patch.api_key = trimmedKey;
      await api.updateApiKey(keyId, patch);
      setEditingKeyId(null);
      setKeyMsg('Key updated!');
      await loadKeys();
      setTimeout(() => setKeyMsg(''), 3000);
    } catch (err) {
      setKeyError(err.message);
    }
  }

  function cancelEdit() {
    setEditingKeyId(null);
    setEditLabel('');
    setEditKeyValue('');
  }

  function toggleReveal(keyId) {
    setRevealedKeys(prev => ({ ...prev, [keyId]: !prev[keyId] }));
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <p className="classification-bar" style={{ marginBottom: 12 }}>
        OPERATOR · ACCOUNT · CONTROLS
      </p>
      <h1 className="oswald glow" style={{
        fontSize: 28, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 24, color: '#00ff66',
      }}>
        Account
      </h1>

      {msg && (
        <div style={{
          background: 'rgba(0,255,102,0.1)', border: '1px solid #00ff66', padding: 12, borderRadius: 2,
          marginBottom: 16, fontSize: 13, color: '#86efac', fontFamily: "'JetBrains Mono', monospace",
        }}>✓ {msg}</div>
      )}
      {error && (
        <div style={{
          background: 'rgba(255,51,68,0.1)', border: '1px solid #ff3344', padding: 12, borderRadius: 2,
          marginBottom: 16, fontSize: 13, color: '#ff8a99', fontFamily: "'JetBrains Mono', monospace",
        }}>⚠ {error}</div>
      )}

      {/* Profile */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 className="oswald" style={{ fontSize: 16, letterSpacing: 2, textTransform: 'uppercase' }}>Profile</h2>
          {!editing && (
            <button onClick={() => setEditing(true)} style={{
              background: 'none', border: '1px solid #1d3825', color: '#86efac',
              padding: '6px 14px', cursor: 'pointer', fontSize: 11, borderRadius: 3,
              fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase', letterSpacing: 1,
            }}>Edit</button>
          )}
        </div>
        {editing ? (
          <div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: '#86efac', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, display: 'block' }}>Full Name</label>
              <input className="input" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: '#86efac', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, display: 'block' }}>Username</label>
              <input className="input" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-primary" onClick={saveProfile} style={{ padding: '10px 24px' }}>Save</button>
              <button className="btn btn-secondary" onClick={() => setEditing(false)} style={{ padding: '10px 24px' }}>Cancel</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            <div><span style={{ color: '#3f6e4a', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Email:</span> <span className="mono" style={{ fontSize: 14 }}>{user?.email}</span></div>
            <div><span style={{ color: '#3f6e4a', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Username:</span> <span style={{ fontSize: 14 }}>{user?.username}</span></div>
            <div><span style={{ color: '#3f6e4a', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Name:</span> <span style={{ fontSize: 14 }}>{user?.full_name || '-'}</span></div>
            <div><span style={{ color: '#3f6e4a', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Member since:</span> <span className="mono" style={{ fontSize: 14 }}>{user?.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}</span></div>
          </div>
        )}
      </div>

      {/* Role / Section picker (only shows roles flagged is_self_assignable) */}
      {allRoles.some(r => r.is_self_assignable) && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h2 className="oswald" style={{ fontSize: 14, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>
            My Role / Section
          </h2>
          <p style={{ fontSize: 12, color: '#86efac', marginBottom: 14, lineHeight: 1.6 }}>
            Pick the role that matches your section or group. Your professor or admin set these up.
          </p>

          {roleMsg && (
            <div style={{
              background: 'rgba(0,255,102,0.1)', border: '1px solid #00ff66', padding: 10, borderRadius: 2,
              marginBottom: 12, fontSize: 12, color: '#86efac', fontFamily: "'JetBrains Mono', monospace",
            }}>✓ {roleMsg}</div>
          )}
          {roleError && (
            <div style={{
              background: 'rgba(255,51,68,0.1)', border: '1px solid #ff3344', padding: 10, borderRadius: 2,
              marginBottom: 12, fontSize: 12, color: '#ff8a99', fontFamily: "'JetBrains Mono', monospace",
            }}>⚠ {roleError}</div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {allRoles.filter(r => r.is_self_assignable).map(r => {
              const active = user?.role === r.name;
              return (
                <button
                  key={r.id}
                  onClick={() => pickRole(r.name)}
                  style={{
                    padding: '10px 16px', borderRadius: 3, cursor: 'pointer',
                    background: active ? `${r.color}26` : 'transparent',
                    border: active ? `2px solid ${r.color}` : `1px solid ${r.color}66`,
                    color: active ? r.color : '#d8ffe6',
                    fontFamily: "'Oswald', sans-serif", fontSize: 13, letterSpacing: 1.5, textTransform: 'uppercase',
                    fontWeight: active ? 700 : 500,
                  }}
                >
                  {active && '✓ '}{r.name}
                </button>
              );
            })}
          </div>
          {user?.role && !allRoles.find(r => r.name === user.role)?.is_self_assignable && (
            <div style={{ marginTop: 10, fontSize: 11, color: '#3f6e4a' }}>
              Current role: <span style={{ color: user?.role_color || '#86efac' }}>{user.role}</span> (assigned by admin)
            </div>
          )}
        </div>
      )}

      {/* API Keys */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h2 className="oswald" style={{ fontSize: 14, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>
        API Keys
        </h2>
        <p style={{ fontSize: 12, color: '#86efac', marginBottom: 14, lineHeight: 1.6 }}>
          Each Google account gives you 1,500 free scans per day. Add keys from different accounts as backups — activate the one you want to use, the rest stay saved but inactive.
        </p>

        <a
          href="https://aistudio.google.com/api-keys"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-block', padding: '10px 16px', marginBottom: 20,
            background: 'rgba(0,255,102,0.1)', border: '1px solid #00ff66', borderRadius: 3,
            color: '#00ff66', textDecoration: 'none', fontSize: 12,
            fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase', letterSpacing: 1,
          }}
        >
          → Open Google AI Studio
        </a>

        {/* How to get a key — collapsible tutorial */}
        <details style={{
          background: 'rgba(0,255,102,0.04)', border: '1px solid rgba(0,255,102,0.15)',
          borderRadius: 3, padding: 12, marginBottom: 16,
          boxShadow: highlightKeyInput ? '0 0 12px rgba(0,255,102,0.6), inset 0 0 8px rgba(0,255,102,0.2)' : 'none',
          transition: 'box-shadow 0.3s',
        }}>
          <summary style={{
            fontSize: 11, color: '#6dba85', textTransform: 'uppercase', letterSpacing: 1,
            cursor: 'pointer', fontWeight: 600, userSelect: 'none',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span>▸ How to get a key (step-by-step tutorial)</span>
          </summary>
          <div style={{ display: 'grid', gap: 16, marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(0,255,102,0.15)' }}>
            {[
              { step: 1, text: 'Click "Open Google AI Studio" button below', img: null },
              { step: 2, text: 'Accept the terms and conditions', img: '/tutorial-1.jpg' },
              { step: 3, text: 'Click the "Create API Key" button', img: '/tutorial-2.jpg' },
              { step: 4, text: 'Click "Create Key"', img: '/tutorial-3.jpg' },
              { step: 5, text: 'Copy your API key (click the copy icon)', img: '/tutorial-4.jpg' },
              { step: 6, text: 'Come back here and paste it in the "API Key" field below, then click "Add Key"', img: null },
              { step: 7, text: '(Optional but recommended) Sign in to a different Google account and get more API keys — quota resets every 12 hours', img: null },
            ].map((item, idx) => (
              <div key={idx} style={{ display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 12, color: '#d8ffe6', lineHeight: 1.6 }}>
                  <span style={{ color: item.step === 7 ? '#6dba85' : '#00ff66', fontWeight: 600, marginRight: 8 }}>
                    Step {item.step}{item.step === 7 ? ' (optional)' : ''}:
                  </span>
                  {item.text}
                </div>
                {item.img && (
                  <img
                    src={item.img}
                    alt={`Step ${item.step}`}
                    style={{
                      width: '100%', borderRadius: 3,
                      border: '1px solid #1d3825',
                      maxHeight: 260, objectFit: 'contain',
                      background: '#000',
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        </details>

        {keyMsg && (
          <div style={{
            background: 'rgba(0,255,102,0.1)', border: '1px solid #00ff66', padding: 10, borderRadius: 2,
            marginBottom: 12, fontSize: 12, color: '#86efac', fontFamily: "'JetBrains Mono', monospace",
          }}>✓ {keyMsg}</div>
        )}
        {keyError && (
          <div style={{
            background: 'rgba(255,51,68,0.1)', border: '1px solid #ff3344', padding: 10, borderRadius: 2,
            marginBottom: 12, fontSize: 12, color: '#ff8a99', fontFamily: "'JetBrains Mono', monospace",
          }}>⚠ {keyError}</div>
        )}

        {/* Key cells */}
        {apiKeys.length > 0 && (
          <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
            {apiKeys.map(k => {
              const exhausted = k.quota_exhausted && k.hours_until_reset > 0;
              const isEditing = editingKeyId === k.id;
              return (
                <div key={k.id}>
                  {isEditing ? (
                    <div style={{
                      padding: '14px',
                      borderRadius: 3,
                      border: '1px solid rgba(0,255,102,0.4)',
                      background: 'rgba(0,10,5,0.5)',
                      display: 'grid', gap: 12,
                    }}>
                      <div>
                        <label style={{ fontSize: 10, color: '#86efac', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, display: 'block' }}>Key Name</label>
                        <input
                          className="input"
                          value={editLabel}
                          onChange={e => setEditLabel(e.target.value)}
                          type="text"
                          autoComplete="off"
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 10, color: '#86efac', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, display: 'block' }}>API Key </label>
                        <input
                          className="input"
                          placeholder="Leave blank to keep current key, or paste new one"
                          value={editKeyValue}
                          onChange={e => setEditKeyValue(e.target.value)}
                          type="password"
                          autoComplete="off"
                        />
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="btn btn-primary"
                          onClick={() => handleSaveEdit(k.id)}
                          style={{ padding: '8px 16px', flex: 1 }}
                        >
                          Save
                        </button>
                        <button
                          className="btn btn-secondary"
                          onClick={cancelEdit}
                          style={{ padding: '8px 16px', flex: 1 }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        padding: '12px 14px',
                        borderRadius: 3,
                        border: k.is_active
                          ? (exhausted ? '1px solid #ff3344' : '1px solid #00ff66')
                          : '1px solid #1a2e1f',
                        background: k.is_active ? 'rgba(0,255,102,0.05)' : 'transparent',
                        opacity: k.is_active ? 1 : 0.45,
                        transition: 'opacity 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        flexWrap: 'wrap',
                      }}
                    >
                      {/* Active indicator dot */}
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                        background: k.is_active ? (exhausted ? '#ff3344' : '#00ff66') : '#2a4a30',
                        boxShadow: k.is_active && !exhausted ? '0 0 8px rgba(0,255,102,0.9)' : 'none',
                      }} />

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: '#d8ffe6', fontWeight: 600, marginBottom: 2 }}>
                          {k.label}
                        </div>
                        <div style={{ fontSize: 11, color: '#3f6e4a', fontFamily: "'JetBrains Mono', monospace", wordBreak: 'break-all' }}>
                          <span
                            onClick={() => toggleReveal(k.id)}
                            title="Click to show/hide full key"
                            style={{ cursor: 'pointer', userSelect: revealedKeys[k.id] ? 'all' : 'none' }}
                          >
                            {revealedKeys[k.id] ? k.api_key : k.key_preview}
                          </span>
                          <span
                            onClick={() => toggleReveal(k.id)}
                            style={{ marginLeft: 8, cursor: 'pointer', color: '#3f6e4a', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}
                          >
                            {revealedKeys[k.id] ? '[hide]' : '[show]'}
                          </span>
                          {k.is_active && !exhausted && (
                            <span style={{ color: '#00ff66', marginLeft: 10, letterSpacing: 1 }}>● ACTIVE</span>
                          )}
                          {k.is_active && exhausted && (
                            <span style={{ color: '#ff8a99', marginLeft: 10 }}>
                              ⚠ QUOTA EXHAUSTED — resets in ~{k.hours_until_reset}h
                            </span>
                          )}
                          {!k.is_active && exhausted && (
                            <span style={{ color: '#ff8a99', marginLeft: 10 }}>⚠ quota exhausted</span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button
                          onClick={() => startEdit(k)}
                          style={{
                            padding: '5px 12px', background: 'none', border: '1px solid #1d3825',
                            color: '#86efac', cursor: 'pointer', borderRadius: 3, fontSize: 11,
                            fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase', letterSpacing: 1,
                          }}
                        >
                          Edit
                        </button>
                        {!k.is_active && (
                          <button
                            onClick={() => handleActivate(k.id)}
                            style={{
                              padding: '5px 12px', background: 'none', border: '1px solid #1d3825',
                              color: '#86efac', cursor: 'pointer', borderRadius: 3, fontSize: 11,
                              fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase', letterSpacing: 1,
                            }}
                          >
                            Activate
                          </button>
                        )}
                        {k.is_active && (
                          <div style={{
                            padding: '5px 12px', fontSize: 11, color: '#00ff66',
                            fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase', letterSpacing: 1,
                          }}>
                            In Use
                          </div>
                        )}
                        <button
                          onClick={() => handleDelete(k.id)}
                          style={{
                            padding: '5px 10px', background: 'none', border: '1px solid rgba(255,51,68,0.25)',
                            color: '#ff8a99', cursor: 'pointer', borderRadius: 3, fontSize: 13, lineHeight: 1,
                          }}
                        >✕</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Add key row */}
        <div style={{ borderTop: apiKeys.length > 0 ? '1px solid #112418' : 'none', paddingTop: apiKeys.length > 0 ? 16 : 0 }}>
          <div style={{ display: 'grid', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 10, color: '#86efac', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, display: 'block' }}>Key Name</label>
              <input
                className="input"
                placeholder="e.g., Account 1, Backup, Personal"
                value={newKeyLabel}
                onChange={e => setNewKeyLabel(e.target.value)}
                type="text"
                style={{ width: '100%' }}
                autoComplete="one-time-code"
                name="gemini-key-label"
              />
            </div>
            <div>
              <label style={{ fontSize: 10, color: '#86efac', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, display: 'block' }}>API Key</label>
              <input
                className="input"
                placeholder="Paste API key (AIza...)"
                value={newKeyValue}
                onChange={e => setNewKeyValue(e.target.value)}
                type="password"
                style={{
                  width: '100%',
                  boxShadow: highlightKeyInput ? '0 0 8px rgba(0,255,102,0.5), inset 0 0 6px rgba(0,255,102,0.15)' : 'none',
                  transition: 'box-shadow 0.3s',
                }}
                autoComplete="new-password"
                name="gemini-api-key"
                autoFocus={highlightKeyInput}
              />
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={handleAddKey}
            style={{ width: '100%', padding: '12px' }}
          >
            Add Key
          </button>
        </div>
      </div>
    </div>
  );
}
