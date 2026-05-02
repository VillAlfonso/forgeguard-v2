import React, { useEffect, useState } from 'react';
import { useAuth } from '../App';
import { api } from '../api/client';

export default function Account() {
  const { user, refreshUser } = useAuth();
  const [plans, setPlans] = useState([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ full_name: '', username: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('stripe');

  useEffect(() => {
    api.getPlans().then(data => setPlans(data.plans)).catch(() => {});
    if (user) setForm({ full_name: user.full_name || '', username: user.username || '' });
  }, [user]);

  // Check for payment redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      setMsg('Payment successful! Your plan will update shortly.');
      refreshUser();
      window.history.replaceState({}, '', '/account');
    } else if (params.get('payment') === 'cancelled') {
      setError('Payment was cancelled.');
      window.history.replaceState({}, '', '/account');
    }
  }, []);

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

  async function handleUpgrade(planId) {
    try {
      const data = await api.createCheckout(planId, paymentMethod);
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCancel() {
    if (!confirm('Cancel your subscription? You will keep access until the end of your billing period.')) return;
    try {
      await api.cancelSubscription();
      setMsg('Subscription cancelled. Access continues until end of billing period.');
      refreshUser();
    } catch (err) {
      setError(err.message);
    }
  }

  const planLimits = { free: 10, pro: -1, premium: -1 };
  const userLimit = planLimits[user?.plan] ?? 10;
  const usageDisplay = userLimit === -1
    ? `${user?.scans_this_month || 0} scans this month · unlimited`
    : `${user?.scans_this_month || 0} / ${userLimit} scans used this month`;

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

      {/* Current Plan */}
      <div className="card" style={{
        marginBottom: 24, borderColor: '#00ff66',
        boxShadow: '0 0 20px rgba(0,255,102,0.15), inset 0 1px 0 rgba(0,255,102,0.2)',
      }}>
        <h2 className="oswald" style={{ fontSize: 14, letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 12, color: '#6dba85' }}>
          ▸ Current Plan
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <span className="oswald glow" style={{ fontSize: 26, color: '#00ff66', textTransform: 'uppercase', letterSpacing: 3 }}>
            {user?.plan}
          </span>
          <span className="mono" style={{ color: '#86efac', fontSize: 13 }}>
            {usageDisplay}
          </span>
        </div>
        {user?.plan !== 'free' && (
          <button onClick={handleCancel} style={{
            background: 'none', border: 'none', color: '#ff8a99', cursor: 'pointer',
            fontSize: 11, fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase',
            letterSpacing: 2, marginTop: 14, padding: 0,
          }}>Cancel Subscription</button>
        )}
      </div>

      {/* Payment Method Selection */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h2 className="oswald" style={{ fontSize: 14, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14 }}>Payment Method</h2>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={() => setPaymentMethod('stripe')}
            style={{
              flex: 1, padding: '12px 14px', borderRadius: 3, cursor: 'pointer',
              border: paymentMethod === 'stripe' ? '2px solid #00ff66' : '1px solid #1d3825',
              background: paymentMethod === 'stripe' ? 'rgba(0,255,102,0.08)' : 'transparent',
              color: paymentMethod === 'stripe' ? '#00ff66' : '#86efac',
              fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase', fontSize: 12, letterSpacing: 1,
              transition: 'all 0.2s',
            }}
          >
            💳 Stripe (Global)
          </button>
          <button
            onClick={() => setPaymentMethod('paymongo')}
            style={{
              flex: 1, padding: '12px 14px', borderRadius: 3, cursor: 'pointer',
              border: paymentMethod === 'paymongo' ? '2px solid #00ff66' : '1px solid #1d3825',
              background: paymentMethod === 'paymongo' ? 'rgba(0,255,102,0.08)' : 'transparent',
              color: paymentMethod === 'paymongo' ? '#00ff66' : '#86efac',
              fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase', fontSize: 12, letterSpacing: 1,
              transition: 'all 0.2s',
            }}
          >
            🇵🇭 PayMongo (PH)
          </button>
        </div>
        <p style={{ fontSize: 12, color: '#3f6e4a', marginTop: 10, fontFamily: "'JetBrains Mono', monospace" }}>
          {paymentMethod === 'paymongo' ? 'Pay with cards, GCash, or other e-wallets' : 'Pay with Visa, Mastercard, and more'}
        </p>
      </div>

      {/* Plans */}
      <h2 className="oswald" style={{ fontSize: 16, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 16 }}>Plans</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        {plans.map(plan => {
          const isCurrent = user?.plan === plan.id;
          const isPremium = plan.id === 'premium';
          return (
            <div key={plan.id} className="card" style={{
              borderColor: isCurrent ? '#00ff66' : (isPremium ? '#8b5cf6' : '#112418'),
              opacity: isCurrent ? 0.85 : 1,
              position: 'relative',
              boxShadow: isCurrent
                ? '0 0 18px rgba(0,255,102,0.18)'
                : isPremium ? '0 0 14px rgba(139,92,246,0.15)' : 'none',
            }}>
              {isPremium && !isCurrent && (
                <span className="mono" style={{
                  position: 'absolute', top: -10, right: 14,
                  background: '#8b5cf6', color: '#fff', fontSize: 9,
                  padding: '3px 8px', borderRadius: 2, letterSpacing: 1.5,
                  boxShadow: '0 0 10px rgba(139,92,246,0.6)',
                }}>BEST VALUE</span>
              )}
              <h3 className="oswald" style={{ fontSize: 18, textTransform: 'uppercase', letterSpacing: 3, color: '#d8ffe6' }}>{plan.name}</h3>
              <div style={{ margin: '12px 0' }}>
                <span className="mono" style={{
                  fontSize: 30, fontWeight: 700, color: '#00ff66',
                  textShadow: '0 0 10px rgba(0,255,102,0.5)',
                }}>
                  ${plan.price}
                </span>
                {plan.price > 0 && <span style={{ color: '#3f6e4a', fontSize: 13 }}>/mo</span>}
              </div>
              <div className="mono" style={{
                fontSize: 10, color: plan.unlimited ? '#00ff66' : '#86efac',
                marginBottom: 10, letterSpacing: 2, textTransform: 'uppercase',
              }}>
                {plan.unlimited ? '∞ UNLIMITED SCANS' : `${plan.scans_per_month} SCANS / MONTH`}
              </div>
              {plan.llm_included && (
                <div className="mono" style={{
                  display: 'inline-block', fontSize: 10, padding: '3px 8px',
                  background: 'rgba(139,92,246,0.18)', color: '#a78bfa',
                  borderRadius: 2, letterSpacing: 1.5, marginBottom: 10,
                  border: '1px solid rgba(139,92,246,0.4)',
                }}>
                  ✨ AI EXPLANATION
                </div>
              )}
              <ul style={{ listStyle: 'none', padding: 0, marginBottom: 16 }}>
                {plan.features.map(f => (
                  <li key={f} style={{ padding: '4px 0', fontSize: 13, color: '#d8ffe6', display: 'flex', gap: 8 }}>
                    <span style={{ color: '#00ff66', textShadow: '0 0 6px rgba(0,255,102,0.6)' }}>✓</span><span>{f}</span>
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <div className="mono" style={{
                  textAlign: 'center', color: '#00ff66', fontSize: 11, textTransform: 'uppercase', letterSpacing: 2,
                  textShadow: '0 0 6px rgba(0,255,102,0.6)',
                }}>● Current Plan</div>
              ) : plan.price > 0 ? (
                <button className="btn btn-primary" onClick={() => handleUpgrade(plan.id)} style={{ width: '100%', padding: '12px' }}>
                  {user?.plan === 'free' ? '▶ Upgrade' : '⇄ Switch'}
                </button>
              ) : (
                <div className="mono" style={{ textAlign: 'center', color: '#3f6e4a', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5 }}>
                  Free tier
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
