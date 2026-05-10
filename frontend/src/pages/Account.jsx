import React, { useEffect, useState } from 'react';
import { useAuth } from '../App';
import { api } from '../api/client';

export default function Account() {
  const { user, refreshUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ full_name: '', username: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyMsg, setApiKeyMsg] = useState('');
  const [apiKeyError, setApiKeyError] = useState('');

  useEffect(() => {
    if (user) setForm({ full_name: user.full_name || '', username: user.username || '' });
  }, [user]);

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

  async function handleSetApiKey() {
    setApiKeyError('');
    setApiKeyMsg('');
    if (!apiKeyInput.trim()) {
      setApiKeyError('Please paste your API key');
      return;
    }
    if (!apiKeyInput.trim().startsWith('AIza')) {
      setApiKeyError('Invalid API key format. Gemini API keys start with "AIza".');
      return;
    }
    try {
      const result = await api.setApiKey(apiKeyInput.trim());
      setApiKeyMsg(result.message);
      setApiKeyInput('');
      setTimeout(() => setApiKeyMsg(''), 3000);
    } catch (err) {
      setApiKeyError(err.message);
    }
  }

  async function handleClearApiKey() {
    setApiKeyError('');
    setApiKeyMsg('');
    try {
      const result = await api.setApiKey('');
      setApiKeyMsg(result.message);
      setTimeout(() => setApiKeyMsg(''), 3000);
    } catch (err) {
      setApiKeyError(err.message);
    }
  }


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
        }}>
          ✓ {msg}
        </div>
      )}
      {error && (
        <div style={{
          background: 'rgba(255,51,68,0.1)', border: '1px solid #ff3344', padding: 12, borderRadius: 2,
          marginBottom: 16, fontSize: 13, color: '#ff8a99',
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          ⚠ {error}
        </div>
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
        <h2 className="oswald" style={{ fontSize: 14, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14 }}>Gemini API Key</h2>
        <p style={{ fontSize: 12, color: '#86efac', marginBottom: 12 }}>
          Use your own free-tier Google Gemini API key for unlimited scans.
        </p>

        {/* Step-by-step tutorial */}
        <div style={{
          background: 'rgba(0,255,102,0.05)', border: '1px solid rgba(0,255,102,0.2)',
          borderRadius: 3, padding: 12, marginBottom: 14
        }}>
          <div style={{ fontSize: 11, color: '#6dba85', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, fontWeight: 600 }}>
            ⚡ Quick Setup (3 steps)
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ fontSize: 12, color: '#d8ffe6', lineHeight: 1.5 }}>
              <span style={{ color: '#00ff66', fontWeight: 600 }}>1. Get your key:</span> Click the link below to open Google AI Studio and copy your API key
            </div>
            <div style={{ fontSize: 12, color: '#d8ffe6', lineHeight: 1.5 }}>
              <span style={{ color: '#00ff66', fontWeight: 600 }}>2. Come back:</span> Return to this app
            </div>
            <div style={{ fontSize: 12, color: '#d8ffe6', lineHeight: 1.5 }}>
              <span style={{ color: '#00ff66', fontWeight: 600 }}>3. Paste & save:</span> Paste your key below and you're done!
            </div>
          </div>
        </div>

        <a href="https://aistudio.google.com/api-keys" target="_blank" rel="noopener noreferrer" style={{
          display: 'inline-block',
          padding: '10px 16px',
          background: 'rgba(0,255,102,0.1)',
          border: '1px solid #00ff66',
          borderRadius: 3,
          color: '#00ff66',
          textDecoration: 'none',
          fontSize: 12,
          fontFamily: "'Oswald', sans-serif",
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginBottom: 14,
          cursor: 'pointer',
          transition: 'all 0.2s'
        }}>
          → Open Google AI Studio
        </a>
        {apiKeyMsg && (
          <div style={{
            background: 'rgba(0,255,102,0.1)', border: '1px solid #00ff66', padding: 10, borderRadius: 2,
            marginBottom: 12, fontSize: 12, color: '#86efac',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            ✓ {apiKeyMsg}
          </div>
        )}
        {apiKeyError && (
          <div style={{
            background: 'rgba(255,51,68,0.1)', border: '1px solid #ff3344', padding: 10, borderRadius: 2,
            marginBottom: 12, fontSize: 12, color: '#ff8a99',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            ⚠ {apiKeyError}
          </div>
        )}
        {user?.gemini_api_key ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{
              padding: 12, background: 'rgba(0,255,102,0.08)', border: '1px solid rgba(0,255,102,0.2)',
              borderRadius: 3, fontSize: 13, color: '#86efac'
            }}>
              ✓ You have an API key configured. Using your personal free-tier quota.
            </div>
            <button className="btn btn-secondary" onClick={handleClearApiKey} style={{ padding: '10px 24px' }}>
              Remove API Key
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="input"
              placeholder="Paste your API key here (starts with AIza...)"
              value={apiKeyInput}
              onChange={e => setApiKeyInput(e.target.value)}
              type="password"
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary" onClick={handleSetApiKey} style={{ padding: '10px 24px' }}>
              Save
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
