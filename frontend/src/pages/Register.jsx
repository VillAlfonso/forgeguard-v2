import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import { api } from '../api/client';

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

  const labelStyle = { fontSize: 12, color: '#a3a3a3', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, display: 'block' };

  return (
    <div style={{ maxWidth: 420, margin: '40px auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <h1 className="oswald" style={{ fontSize: 28, color: '#f5c518', letterSpacing: 4 }}>REVELATOR</h1>
        <p style={{ color: '#a3a3a3', marginTop: 8, fontSize: 14 }}>Create your account</p>
      </div>

      <div className="card">
        <h2 className="oswald" style={{ fontSize: 20, marginBottom: 20, letterSpacing: 2, textTransform: 'uppercase' }}>Register</h2>

        {error && (
          <div style={{ background: 'rgba(220,38,38,0.15)', border: '1px solid #dc2626', padding: 12, borderRadius: 4, marginBottom: 16, fontSize: 13, color: '#f87171' }}>
            {error}
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
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: '#a3a3a3' }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
