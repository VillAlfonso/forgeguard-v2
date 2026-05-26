import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import Logo from '../components/Logo';
import { FingerprintWatermark } from '../components/ForensicMotifs';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const labelStyle = { fontSize: 11, color: '#86efac', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 6, display: 'block', fontFamily: "'JetBrains Mono', monospace" };

  return (
    <div style={{ maxWidth: 440, margin: 'clamp(20px, 6vw, 60px) auto', position: 'relative' }}>
      <FingerprintWatermark size={420} opacity={0.06} style={{ position: 'absolute', top: -40, right: -120, zIndex: 0 }} />
      <div style={{ textAlign: 'center', marginBottom: 32, position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <Logo size={86} glow animated />
        </div>
        <h1 className="oswald glow-strong" style={{ fontSize: 32, color: '#00ff66', letterSpacing: 7, fontWeight: 700 }}>
          REVELATOR
        </h1>
        <p className="mono" style={{ color: '#6dba85', marginTop: 10, fontSize: 11, letterSpacing: 3 }}>
          [ RECOVER ACCESS ]
        </p>
      </div>

      <div className="card">
        {sent ? (
          <div style={{ textAlign: 'center' }}>
            <div className="mono glow" style={{ fontSize: 40, color: '#00ff66', marginBottom: 12 }}>✉</div>
            <h2 className="oswald" style={{ fontSize: 20, letterSpacing: 2, color: '#d8ffe6', marginBottom: 14 }}>
              CHECK YOUR EMAIL
            </h2>
            <p style={{ fontSize: 14, color: '#86efac', lineHeight: 1.6, marginBottom: 8 }}>
              If an account exists for <strong style={{ color: '#d8ffe6' }}>{email}</strong>, we’ve sent a password reset link.
            </p>
            <p style={{ fontSize: 13, color: '#6dba85', lineHeight: 1.6, marginBottom: 22 }}>
              The link expires in 1 hour. Check your spam folder if you don’t see it.
            </p>
            <p style={{ textAlign: 'center', fontSize: 13, color: '#86efac' }}>
              <Link to="/login">Back to sign in</Link>
            </p>
          </div>
        ) : (
          <>
            <h2 className="oswald" style={{ fontSize: 18, marginBottom: 8, letterSpacing: 3, textTransform: 'uppercase', color: '#d8ffe6' }}>
              ▸ Forgot Password
            </h2>
            <p style={{ fontSize: 13, color: '#6dba85', lineHeight: 1.6, marginBottom: 20 }}>
              Enter your email and we’ll send you a link to reset your password.
            </p>

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
              <div style={{ marginBottom: 24 }}>
                <label style={labelStyle}>Email</label>
                <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
              </div>
              <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
                {loading ? '◌ Sending…' : '▶ Send Reset Link'}
              </button>
            </form>

            <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#86efac' }}>
              Remembered it? <Link to="/login">Sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
