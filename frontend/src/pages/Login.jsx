import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import { api } from '../api/client';

export default function Login() {
  const { loginUser, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) { navigate('/scan', { replace: true }); return null; }

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
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: '60px auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <h1 className="oswald" style={{ fontSize: 28, color: '#f5c518', letterSpacing: 4 }}>
          REVELATOR
        </h1>
        <p style={{ color: '#a3a3a3', marginTop: 8, fontSize: 14 }}>Document Forensics Unit</p>
      </div>

      <div className="card">
        <h2 className="oswald" style={{ fontSize: 20, marginBottom: 20, letterSpacing: 2, textTransform: 'uppercase' }}>
          Sign In
        </h2>

        {error && (
          <div style={{ background: 'rgba(220,38,38,0.15)', border: '1px solid #dc2626', padding: 12, borderRadius: 4, marginBottom: 16, fontSize: 13, color: '#f87171' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: '#a3a3a3', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, display: 'block' }}>Email</label>
            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 12, color: '#a3a3a3', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, display: 'block' }}>Password</label>
            <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Your password" required />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: '#a3a3a3' }}>
          Don't have an account? <Link to="/register">Create one</Link>
        </p>
      </div>
    </div>
  );
}
