import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../App';
import { api } from '../api/client';

export default function Account() {
  const { user, refreshUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ full_name: '', username: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const [apiKeys, setApiKeys] = useState([]);
  const [newKeyValue, setNewKeyValue] = useState('');
  const [keyError, setKeyError] = useState('');
  const [keyMsg, setKeyMsg] = useState('');
  const [highlightKeyInput, setHighlightKeyInput] = useState(() => localStorage.getItem('fg_highlight_key_input') === 'true');

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
    if (!trimmed.startsWith('AIza')) { setKeyError('Invalid format — key must start with "AIza"'); return; }
    try {
      await api.addApiKey(trimmed, '');
      setNewKeyValue('');
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

      {/* API Keys */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h2 className="oswald" style={{ fontSize: 14, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>
          Gemini API Keys
        </h2>
        <p style={{ fontSize: 12, color: '#86efac', marginBottom: 14, lineHeight: 1.6 }}>
          Each Google account gives you 1,500 free scans per day. Add keys from different accounts as backups — activate the one you want to use, the rest stay saved but inactive.
        </p>

        {/* How to get a key */}
        <div style={{
          background: 'rgba(0,255,102,0.04)', border: '1px solid rgba(0,255,102,0.15)',
          borderRadius: 3, padding: 12, marginBottom: 16,
          boxShadow: highlightKeyInput ? '0 0 12px rgba(0,255,102,0.6), inset 0 0 8px rgba(0,255,102,0.2)' : 'none',
          transition: 'box-shadow 0.3s',
        }}>
          <div style={{ fontSize: 11, color: '#6dba85', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            ⚡ How to get a key
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {[
              '1. Tap "Open Google AI Studio" below',
              '2. Press the copy icon next to your key (shown in the screenshot)',
              '3. Come back here, paste it, and tap Add',
              '4. If your quota runs out, repeat with a different Google account',
            ].map(step => (
              <div key={step} style={{ fontSize: 12, color: '#d8ffe6', lineHeight: 1.5 }}>{step}</div>
            ))}
          </div>
        </div>

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
              return (
                <div
                  key={k.id}
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
                    <div style={{ fontSize: 11, color: '#3f6e4a', fontFamily: "'JetBrains Mono', monospace" }}>
                      {k.key_preview}
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
              );
            })}
          </div>
        )}

        {/* Add key row */}
        <div style={{ borderTop: apiKeys.length > 0 ? '1px solid #112418' : 'none', paddingTop: apiKeys.length > 0 ? 16 : 0 }}>
          <div style={{ fontSize: 11, color: '#3f6e4a', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            Add a key <span style={{ color: '#6dba85', fontStyle: 'italic' }}>(from a different Google account)</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="input"
              placeholder="Paste API key (AIza...)"
              value={newKeyValue}
              onChange={e => setNewKeyValue(e.target.value)}
              type="password"
              style={{
                flex: 1,
                boxShadow: highlightKeyInput ? '0 0 8px rgba(0,255,102,0.5), inset 0 0 6px rgba(0,255,102,0.15)' : 'none',
                transition: 'box-shadow 0.3s',
              }}
              autoFocus={highlightKeyInput}
            />
            <button
              className="btn btn-primary"
              onClick={handleAddKey}
              style={{ padding: '10px 20px', whiteSpace: 'nowrap' }}
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
