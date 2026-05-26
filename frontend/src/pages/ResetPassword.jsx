import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import Logo from '../components/Logo';
import { FingerprintWatermark } from '../components/ForensicMotifs';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setError('');
    setLoading(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const labelStyle = { fontSize: 11, color: '#86efac', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 6, display: 'block', fontFamily: "'JetBrains Mono', monospace" };

  return (
    <div style={{ maxWidth: 440, margin: 'clamp(20px, 6vw, 60px) auto', position: 'relative' }}>
      <FingerprintWatermark size={420} opacity={0.06} style={{ position: 'absolute', top: -40, left: -120, zIndex: 0 }} />
      <div style={{ textAlign: 'center', marginBottom: 32, position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <Logo size={86} glow animated />
        </div>
        <h1 className="oswald glow-strong" style={{ fontSize: 32, color: '#00ff66', letterSpacing: 7, fontWeight: 700 }}>
          REVELATOR
        </h1>
        <p className="mono" style={{ color: '#6dba85', marginTop: 10, fontSize: 11, letterSpacing: 3 }}>
          [ SET A NEW PASSWORD ]
        </p>
      </div>

      <div className="card">
        {done ? (
          <div style={{ textAlign: 'center' }}>
            <div className="mono glow" style={{ fontSize: 40, color: '#00ff66', marginBottom: 12 }}>✓</div>
            <h2 className="oswald" style={{ fontSize: 20, letterSpacing: 2, color: '#d8ffe6', marginBottom: 14 }}>
              PASSWORD UPDATED
            </h2>
            <p style={{ fontSize: 14, color: '#86efac', lineHeight: 1.6, marginBottom: 22 }}>
              Your password has been changed. You can now sign in with your new password.
            </p>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => navigate('/login')}>
              ▶ Go to Sign In
            </button>
          </div>
        ) : !token ? (
          <div style={{ textAlign: 'center' }}>
            <h2 className="oswald" style={{ fontSize: 18, letterSpacing: 2, color: '#d8ffe6', marginBottom: 14 }}>
              INVALID LINK
            </h2>
            <p style={{ fontSize: 13, color: '#6dba85', lineHeight: 1.6, marginBottom: 22 }}>
              This reset link is missing its token. Request a new one.
            </p>
            <p style={{ textAlign: 'center', fontSize: 13, color: '#86efac' }}>
              <Link to="/forgot-password">Request a reset link</Link>
            </p>
          </div>
        ) : (
          <>
            <h2 className="oswald" style={{ fontSize: 18, marginBottom: 20, letterSpacing: 3, textTransform: 'uppercase', color: '#d8ffe6' }}>
              ▸ Reset Password
            </h2>

            {error && (
              <div style={{
                background: 'rgba(255,51,68,0.1)', border: '1px solid #ff3344', padding: 12,
                borderRadius: 2, marginBottom: 16, fontSize: 13, color: '#ff8a99',
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                ⚠ {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>New Password</label>
                <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 6 characters" required minLength={6} />
              </div>
              <div style={{ marginBottom: 24 }}>
                <label style={labelStyle}>Confirm Password</label>
                <input className="input" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Re-enter password" required minLength={6} />
              </div>
              <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
                {loading ? '◌ Updating…' : '▶ Update Password'}
              </button>
            </form>

            <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#86efac' }}>
              <Link to="/login">Back to sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
