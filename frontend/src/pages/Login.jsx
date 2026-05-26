import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { Capacitor } from '@capacitor/core';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { useAuth } from '../App';
import { api } from '../api/client';
import Logo from '../components/Logo';
import { FingerprintWatermark } from '../components/ForensicMotifs';

export default function Login() {
  const { loginUser, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const verifiedParam = searchParams.get('verified');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [needsResend, setNeedsResend] = useState(false);
  const [loading, setLoading] = useState(false);

  if (user) { navigate('/scan', { replace: true }); return null; }

  async function handleResend() {
    if (!email) { setError('Enter your email above, then tap resend.'); return; }
    setError('');
    try { await api.resendVerification(email); } catch {}
    setInfo('Verification link sent. Check your inbox.');
    setNeedsResend(false);
  }

  async function handleNativeGoogleSignIn() {
    setError('');
    setLoading(true);
    try {
      const result = await GoogleAuth.signIn();
      const data = await api.googleLogin(result.authentication.idToken);
      loginUser(data);
      navigate('/scan');
    } catch (err) {
      if (err.code !== 'CANCELED') setError('Google sign-in failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.login(email, password);
      loginUser(data);
      navigate('/scan');
    } catch (err) {
      setError(err.message);
      if (/verify/i.test(err.message)) setNeedsResend(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 440, margin: 'clamp(20px, 6vw, 60px) auto', position: 'relative' }}>
      <FingerprintWatermark
        size={420} opacity={0.06}
        style={{ position: 'absolute', top: -40, right: -120, zIndex: 0 }}
      />
      <div style={{ textAlign: 'center', marginBottom: 32, position: 'relative' }}>
        <p className="classification-bar" style={{ marginBottom: 18 }}>
          DOCUMENT · FORENSICS · UNIT
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <Logo size={86} glow animated />
        </div>
        <h1 className="oswald glow-strong" style={{
          fontSize: 32, color: '#00ff66', letterSpacing: 7, fontWeight: 700,
        }}>
          REVELATOR
        </h1>
        <p className="mono" style={{ color: '#6dba85', marginTop: 10, fontSize: 11, letterSpacing: 3 }}>
          [ AUTHENTICATE TO PROCEED ]
        </p>
      </div>

      <div className="card">
        <h2 className="oswald" style={{
          fontSize: 18, marginBottom: 20, letterSpacing: 3, textTransform: 'uppercase',
          color: '#d8ffe6',
        }}>
          ▸ Sign In
        </h2>

        {verifiedParam === '1' && (
          <div style={{
            background: 'rgba(0,255,102,0.1)', border: '1px solid #00ff66', padding: 12,
            borderRadius: 2, marginBottom: 16, fontSize: 13, color: '#86efac',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            ✓ Email confirmed. You can sign in now.
          </div>
        )}
        {verifiedParam === '0' && (
          <div style={{
            background: 'rgba(255,170,0,0.1)', border: '1px solid #ffaa00', padding: 12,
            borderRadius: 2, marginBottom: 16, fontSize: 13, color: '#ffcf80',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            ⚠ That link is invalid or expired. Sign in to request a new one.
          </div>
        )}
        {info && (
          <div style={{
            background: 'rgba(0,255,102,0.1)', border: '1px solid #00ff66', padding: 12,
            borderRadius: 2, marginBottom: 16, fontSize: 13, color: '#86efac',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            ✓ {info}
          </div>
        )}
        {error && (
          <div style={{
            background: 'rgba(255,51,68,0.1)', border: '1px solid #ff3344', padding: 12,
            borderRadius: 2, marginBottom: 16, fontSize: 13, color: '#ff8a99',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            ⚠ {error}
            {needsResend && (
              <button
                type="button"
                onClick={handleResend}
                style={{
                  display: 'block', marginTop: 10, background: 'transparent',
                  border: '1px solid #ff8a99', color: '#ff8a99', padding: '6px 12px',
                  borderRadius: 2, fontSize: 12, cursor: 'pointer',
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                ↻ Resend verification email
              </button>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label className="mono" style={{ fontSize: 11, color: '#86efac', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 6, display: 'block' }}>Email</label>
            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label className="mono" style={{ fontSize: 11, color: '#86efac', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 6, display: 'block' }}>Password</label>
            <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Your password" required />
          </div>
          <div style={{ textAlign: 'right', marginBottom: 24 }}>
            <Link to="/forgot-password" style={{ fontSize: 12, color: '#6dba85' }}>Forgot password?</Link>
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
            {loading ? '◌ Authenticating…' : '▶ Sign In'}
          </button>
        </form>

        <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid #112418' }}>
          <p className="mono" style={{ fontSize: 10, color: '#3f6e4a', textAlign: 'center', marginBottom: 12, letterSpacing: 1 }}>
            OR SIGN IN WITH
          </p>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            {Capacitor.isNativePlatform() ? (
              <button
                onClick={handleNativeGoogleSignIn}
                disabled={loading}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px',
                  background: '#fff', color: '#3c4043', border: 'none', borderRadius: 4,
                  fontSize: 14, fontWeight: 500, cursor: 'pointer', minHeight: 44, width: '100%',
                  justifyContent: 'center',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/></svg>
                Sign in with Google
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
                onError={() => setError('Google sign-in failed')}
                theme="filled_black"
                shape="rectangular"
                text="signin_with_google"
                size="large"
              />
            )}
          </div>
        </div>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#86efac' }}>
          New here? <Link to="/register">Create an account</Link>
        </p>
      </div>
    </div>
  );
}
