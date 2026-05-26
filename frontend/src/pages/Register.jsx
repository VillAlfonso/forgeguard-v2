import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { Capacitor } from '@capacitor/core';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { useAuth } from '../App';
import { api } from '../api/client';
import Logo from '../components/Logo';
import { FingerprintWatermark } from '../components/ForensicMotifs';

export default function Register() {
  const { loginUser, user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', username: '', password: '', full_name: '' });
  const [agreed, setAgreed] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) { navigate('/scan', { replace: true }); return null; }

  function update(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  async function handleNativeGoogleSignUp() {
    if (!agreed) { setError('Please agree to the Terms of Service first.'); return; }
    setError('');
    setLoading(true);
    try {
      const result = await GoogleAuth.signIn();
      const data = await api.googleLogin(result.authentication.idToken);
      loginUser(data);
      navigate('/scan');
    } catch (err) {
      if (err.code !== 'CANCELED') setError('Google sign-up failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!agreed) { setError('Please agree to the Terms of Service first.'); return; }
    setError('');
    setLoading(true);
    try {
      await api.register(form.email, form.username, form.password, form.full_name);
      setRegistered(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const labelStyle = { fontSize: 11, color: '#86efac', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 6, display: 'block', fontFamily: "'JetBrains Mono', monospace" };

  if (registered) {
    return (
      <div style={{ maxWidth: 440, margin: 'clamp(20px, 6vw, 60px) auto' }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="mono glow" style={{ fontSize: 40, color: '#00ff66', marginBottom: 12 }}>✉</div>
          <h2 className="oswald" style={{ fontSize: 20, letterSpacing: 2, color: '#d8ffe6', marginBottom: 14 }}>
            CHECK YOUR EMAIL
          </h2>
          <p style={{ fontSize: 14, color: '#86efac', lineHeight: 1.6, marginBottom: 8 }}>
            We sent a confirmation link to <strong style={{ color: '#d8ffe6' }}>{form.email}</strong>.
          </p>
          <p style={{ fontSize: 13, color: '#6dba85', lineHeight: 1.6, marginBottom: 22 }}>
            Click the link in that email to activate your account, then sign in. The link expires in 24 hours.
          </p>
          <button
            className="btn btn-primary"
            style={{ width: '100%' }}
            onClick={async () => {
              setError('');
              try { await api.resendVerification(form.email); } catch {}
              setError('If it didn’t arrive, we’ve sent another link.');
            }}
          >
            ↻ Resend email
          </button>
          <p style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: '#86efac' }}>
            <Link to="/login">Back to sign in</Link>
          </p>
          {error && (
            <p className="mono" style={{ marginTop: 12, fontSize: 12, color: '#6dba85' }}>{error}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 440, margin: 'clamp(20px, 5vw, 40px) auto', position: 'relative' }}>
      <FingerprintWatermark
        size={420} opacity={0.06}
        style={{ position: 'absolute', top: -40, left: -120, zIndex: 0 }}
      />
      <div style={{ textAlign: 'center', marginBottom: 32, position: 'relative' }}>
        <p className="classification-bar" style={{ marginBottom: 18 }}>
          NEW · OPERATOR · REGISTRATION
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <Logo size={86} glow animated />
        </div>
        <h1 className="oswald glow-strong" style={{ fontSize: 32, color: '#00ff66', letterSpacing: 7, fontWeight: 700 }}>
          REVELATOR
        </h1>
        <p className="mono" style={{ color: '#6dba85', marginTop: 10, fontSize: 11, letterSpacing: 3 }}>
          [ CREATE YOUR ACCOUNT ]
        </p>
      </div>

      <div className="card">
        <h2 className="oswald" style={{
          fontSize: 18, marginBottom: 20, letterSpacing: 3, textTransform: 'uppercase', color: '#d8ffe6',
        }}>
          ▸ Register
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
            <label style={labelStyle}>Full Name</label>
            <input className="input" value={form.full_name} onChange={update('full_name')} placeholder="John Doe" />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Username</label>
            <input className="input" value={form.username} onChange={update('username')} placeholder="johndoe" required />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Email</label>
            <input className="input" type="email" value={form.email} onChange={update('email')} placeholder="you@example.com" required />
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Password</label>
            <input className="input" type="password" value={form.password} onChange={update('password')} placeholder="Min 6 characters" required minLength={6} />
          </div>
          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 22,
            fontSize: 12, color: '#86efac', lineHeight: 1.5, cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              style={{ marginTop: 2, width: 16, height: 16, accentColor: '#00ff66', flexShrink: 0 }}
            />
            <span>
              I have read and agree to the{' '}
              <Link to="/terms" target="_blank" style={{ color: '#00ff66' }}>Terms of Service &amp; Privacy Policy</Link>.
            </span>
          </label>
          <button className="btn btn-primary" type="submit" disabled={loading || !agreed} style={{ width: '100%', opacity: agreed ? 1 : 0.55 }}>
            {loading ? '◌ Creating account…' : '▶ Create Account'}
          </button>
        </form>

        <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid #112418' }}>
          <p className="mono" style={{ fontSize: 10, color: '#3f6e4a', textAlign: 'center', marginBottom: 12, letterSpacing: 1 }}>
            OR SIGN UP WITH
          </p>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            {Capacitor.isNativePlatform() ? (
              <button
                onClick={handleNativeGoogleSignUp}
                disabled={loading}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px',
                  background: '#fff', color: '#3c4043', border: 'none', borderRadius: 4,
                  fontSize: 14, fontWeight: 500, cursor: 'pointer', minHeight: 44, width: '100%',
                  justifyContent: 'center',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/></svg>
                Sign up with Google
              </button>
            ) : (
              <GoogleLogin
                onSuccess={async (credentialResponse) => {
                  setError('');
                  setLoading(true);
                  try {
                    const data = await api.googleLogin(credentialResponse.credential);
                    loginUser(data);
                    navigate('/scan');
                  } catch (err) {
                    setError(err.message);
                  } finally {
                    setLoading(false);
                  }
                }}
                onError={() => setError('Google sign-up failed')}
                theme="filled_black"
                shape="rectangular"
                text="signup_with"
                size="large"
              />
            )}
          </div>
        </div>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#86efac' }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
