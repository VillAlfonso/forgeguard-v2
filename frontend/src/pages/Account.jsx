import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../App';
import { api } from '../api/client';

export default function Account() {
  const { user, refreshUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ full_name: '', username: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  // Multi-key state
  const [apiKeys, setApiKeys] = useState([]);
  const [newKeyValue, setNewKeyValue] = useState('');
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [keyMsg, setKeyMsg] = useState('');
  const [keyError, setKeyError] = useState('');
  const [addingKey, setAddingKey] = useState(false);

  useEffect(() => {
    if (user) setForm({ full_name: user.full_name || '', username: user.username || '' });
  }, [user]);

  const loadKeys = useCallback(async () => {
    try {
      const data = await api.listApiKeys();
      setApiKeys(data.keys || []);
    } catch {}
  }, []);

  useEffect(() => { loadKeys(); }, [loadKeys]);

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
    if (!trimmed) { setKeyError('Paste your API key first'); return; }
    if (!trimmed.startsWith('AIza')) { setKeyError('Invalid key format — must start with "AIza"'); return; }
    try {
      await api.addApiKey(trimmed, newKeyLabel.trim() || `Key ${apiKeys.length + 1}`);
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
    setKeyError('');
    try {
      await api.activateApiKey(keyId);
      await loadKeys();
    } catch (err) {
      setKeyError(err.message);
    }
  }

  async function handleDelete(keyId) {
    setKeyError('');
    try {
      await api.deleteApiKey(keyId);
      await loadKeys();
    } catch (err) {
      setKeyError(err.message);
    }
  }

  const activeKey = apiKeys.find(k => k.is_active);

  return (
    <div style={{ maxWidth: 760 }}>
      <p className="classification-bar" style={{ marginBottom: 12 }}>
        OPERATOR · ACCOUNT · CONTROLS
      </p>
      <h1 className="oswald glow" style={{
        fontSize: 28, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 24,
        color: '#00ff66',
      }}>
        Account
      </h1>

      {msg && (
        <div style={{
          background: 'rgba(0,255,102,0.1)', border: '1px solid #00ff66', padding: 12, borderRadius: 2,
          marginBottom: 16, fontSize: 13, color: '#86efac',
          fontFamily: "'JetBrains Mono', monospace",
        }}>✓ {msg}</div>
      )}
      {error && (
        <div style={{
          background: 'rgba(255,51,68,0.1)', border: '1px solid #ff3344', padding: 12, borderRadius: 2,
          marginBottom: 16, fontSize: 13, color: '#ff8a99',
          fontFamily: "'JetBrains Mono', monospace",
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

      {/* API Key Management */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h2 className="oswald" style={{ fontSize: 14, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>
          Gemini API Keys
        </h2>
        <p style={{ fontSize: 12, color: '#86efac', marginBottom: 14 }}>
          Each key uses Google's free tier (1,500 scans/day). If your quota runs out, activate a different key or wait ~24 hours for it to reset.
        </p>

        {/* How to get a key */}
        <div style={{
          background: 'rgba(0,255,102,0.05)', border: '1px solid rgba(0,255,102,0.15)',
          borderRadius: 3, padding: 12, marginBottom: 16
        }}>
          <div style={{ fontSize: 11, color: '#6dba85', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, fontWeight: 600 }}>
            ⚡ How to get a free API key
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {[
              ['1', 'Tap the link below to open Google AI Studio'],
              ['2', 'Press the copy icon next to your API key (see image above)'],
              ['3', 'Come back here and paste it in the field below'],
              ['4', 'Hit "Add Key" — you\'re ready to scan!'],
            ].map(([n, text]) => (
              <div key={n} style={{ fontSize: 12, color: '#d8ffe6', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ color: '#00ff66', fontWeight: 700, minWidth: 16 }}>{n}.</span>
                <span style={{ lineHeight: 1.5 }}>{text}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: '#3f6e4a', fontStyle: 'italic' }}>
            💡 If you run out of quota, sign in to Google AI Studio with a different Google account to get a second key and add it as a backup.
          </div>
        </div>

        <a href="https://aistudio.google.com/api-keys" target="_blank" rel="noopener noreferrer" style={{
          display: 'inline-block', padding: '10px 16px', marginBottom: 16,
          background: 'rgba(0,255,102,0.1)', border: '1px solid #00ff66', borderRadius: 3,
          color: '#00ff66', textDecoration: 'none', fontSize: 12,
          fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase', letterSpacing: 1,
        }}>
          → Open Google AI Studio
        </a>

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

        {/* Existing keys */}
        {apiKeys.length > 0 && (
          <div style={{ marginBottom: 16, display: 'grid', gap: 8 }}>
            {apiKeys.map(k => {
              const exhausted = k.quota_exhausted && k.hours_until_reset > 0;
              return (
                <div key={k.id} style={{
                  padding: 12, borderRadius: 3, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                  border: k.is_active
                    ? (exhausted ? '1px solid #ff3344' : '1px solid #00ff66')
                    : '1px solid #1d3825',
                  background: k.is_active
                    ? (exhausted ? 'rgba(255,51,68,0.06)' : 'rgba(0,255,102,0.06)')
                    : 'rgba(0,0,0,0.2)',
                }}>
                  {/* Status dot */}
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: k.is_active ? (exhausted ? '#ff3344' : '#00ff66') : '#1d3825',
                    boxShadow: k.is_active && !exhausted ? '0 0 6px rgba(0,255,102,0.8)' : 'none',
                  }} />

                  {/* Label + preview */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: '#d8ffe6', fontWeight: 600 }}>{k.label}</div>
                    <div style={{ fontSize: 11, color: '#3f6e4a', fontFamily: "'JetBrains Mono', monospace" }}>
                      {k.key_preview}
                      {k.is_active && !exhausted && <span style={{ color: '#00ff66', marginLeft: 8 }}>● ACTIVE</span>}
                      {exhausted && (
                        <span style={{ color: '#ff8a99', marginLeft: 8 }}>
                          ⚠ QUOTA EXHAUSTED — resets in ~{k.hours_until_reset}h
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Activate / Delete */}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {!k.is_active && (
                      <button
                        onClick={() => handleActivate(k.id)}
                        style={{
                          padding: '6px 12px', background: 'none', border: '1px solid #1d3825',
                          color: '#86efac', cursor: 'pointer', borderRadius: 3, fontSize: 11,
                          fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase', letterSpacing: 1,
                        }}
                      >Use This</button>
                    )}
                    <button
                      onClick={() => handleDelete(k.id)}
                      style={{
                        padding: '6px 10px', background: 'none', border: '1px solid rgba(255,51,68,0.3)',
                        color: '#ff8a99', cursor: 'pointer', borderRadius: 3, fontSize: 11,
                      }}
                    >✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty slots indicator */}
        {apiKeys.length === 0 && (
          <div style={{
            padding: 16, border: '1px dashed #1d3825', borderRadius: 3, textAlign: 'center',
            marginBottom: 14, color: '#3f6e4a', fontSize: 12,
          }}>
            No API keys yet. Add one below to start scanning.
          </div>
        )}

        {/* Add new key form */}
        {apiKeys.length < 5 && (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 11, color: '#3f6e4a', textTransform: 'uppercase', letterSpacing: 1 }}>
              Add Key ({apiKeys.length}/5 slots used)
            </div>
            <input
              className="input"
              placeholder="Label (e.g. My Google Account)"
              value={newKeyLabel}
              onChange={e => setNewKeyLabel(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="input"
                placeholder="Paste API key here (AIza...)"
                value={newKeyValue}
                onChange={e => setNewKeyValue(e.target.value)}
                type="password"
                style={{ flex: 1 }}
              />
              <button className="btn btn-primary" onClick={handleAddKey} style={{ padding: '10px 20px', whiteSpace: 'nowrap' }}>
                Add Key
              </button>
            </div>
          </div>
        )}

        {apiKeys.length >= 5 && (
          <div style={{ fontSize: 12, color: '#3f6e4a', marginTop: 8 }}>
            Maximum of 5 keys reached. Remove one to add another.
          </div>
        )}
      </div>
    </div>
  );
}
