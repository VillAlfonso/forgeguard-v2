import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../App';
import { api } from '../api/client';
import Logo from '../components/Logo';
import { FingerprintWatermark } from '../components/ForensicMotifs';

export default function Register() {
  const { loginUser, user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', username: '', password: '', full_name: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) { navigate('/scan', { replace: true }); return null; }

  function update(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.register(form.email, form.username, form.password, form.full_name);
      loginUser(data);
      navigate('/scan');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const labelStyle = { fontSize: 11, color: '#86efac', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 6, display: 'block', fontFamily: "'JetBrains Mono', monospace" };

  return (
    <div style={{ maxWidth: 440, margin: '40px auto', position: 'relative' }}>
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
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>Password</label>
            <input className="input" type="password" value={form.password} onChange={update('password')} placeholder="Min 6 characters" required minLength={6} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
            {loading ? '◌ Creating account…' : '▶ Create Account'}
          </button>
        </form>

        <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid #112418' }}>
          <p className="mono" style={{ fontSize: 10, color: '#3f6e4a', textAlign: 'center', marginBottom: 12, letterSpacing: 1 }}>
            OR SIGN UP WITH
          </p>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
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
              onError={() => {
                setError('Google sign-up failed');
              }}
              theme="filled_black"
              shape="rectangular"
              text="signup_with"
              size="large"
            />
          </div>
        </div>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#86efac' }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
