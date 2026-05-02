import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate, useLocation } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { api } from './api/client';
import Login from './pages/Login';
import Register from './pages/Register';
import Scan from './pages/Scan';
import SampleGallery from './pages/SampleGallery';
import History from './pages/History';
import Account from './pages/Account';
import Admin from './pages/Admin';
import About from './pages/About';
import Logo from './components/Logo';

// ── Auth Context ────────────────────────────────────

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('fg_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (api.getToken()) {
      api.getMe()
        .then(u => { setUser(u); localStorage.setItem('fg_user', JSON.stringify(u)); })
        .catch(() => { setUser(null); api.clearTokens(); })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    function onSessionExpired() {
      setUser(null);
      localStorage.removeItem('fg_user');
      navigate('/login', { replace: true });
    }
    window.addEventListener('fg:session-expired', onSessionExpired);
    return () => window.removeEventListener('fg:session-expired', onSessionExpired);
  }, [navigate]);

  function loginUser(data) {
    api.saveTokens(data.access_token, data.refresh_token);
    setUser(data.user);
    localStorage.setItem('fg_user', JSON.stringify(data.user));
  }

  function logout() {
    api.clearTokens();
    setUser(null);
    localStorage.removeItem('fg_user');
  }

  function refreshUser() {
    return api.getMe().then(u => {
      setUser(u);
      localStorage.setItem('fg_user', JSON.stringify(u));
    });
  }

  return (
    <AuthContext.Provider value={{ user, loading, loginUser, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <BootSplash />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <BootSplash />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.is_admin) return <Navigate to="/scan" replace />;
  return children;
}

function BootSplash() {
  return (
    <div style={{ padding: 60, textAlign: 'center' }}>
      <div className="mono glow" style={{ color: 'var(--green-neon)', fontSize: 12, letterSpacing: 4 }}>
        ▣ INITIALIZING FORENSIC PIPELINE
      </div>
      <div className="mono caret" style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 10, letterSpacing: 2 }}>
        loading
      </div>
    </div>
  );
}

// ── Layout ──────────────────────────────────────────

function Layout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  const navItems = [
    { path: '/scan', label: 'Scan' },
    { path: '/history', label: 'History' },
    { path: '/about', label: 'About' },
    { path: '/account', label: 'Account' },
    ...(user?.is_admin ? [{ path: '/admin', label: 'Admin' }] : []),
  ];

  const linkStyle = (active) => ({
    padding: '10px 14px',
    fontSize: 13,
    fontFamily: "'Oswald', sans-serif",
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: active ? '#00ff66' : '#6dba85',
    textDecoration: 'none',
    borderBottom: active ? '2px solid #00ff66' : '2px solid transparent',
    textShadow: active ? '0 0 12px rgba(0,255,102,0.55)' : 'none',
    whiteSpace: 'nowrap',
    transition: 'color 0.15s, text-shadow 0.15s',
  });

  return (
    <div>
      <div className="tape-border" />
      <header style={{
        background:
          'linear-gradient(180deg, rgba(8,18,12,0.95) 0%, rgba(0,0,0,0.92) 100%)',
        borderBottom: '1px solid #112418',
        padding: '12px 16px',
        position: 'sticky', top: 0, zIndex: 50,
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        boxShadow: '0 1px 0 rgba(0,255,102,0.08), 0 8px 24px rgba(0,0,0,0.6)',
      }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link to="/scan" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
            <Logo size={36} glow animated />
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
              <span className="oswald glow-strong" style={{
                fontSize: 22, fontWeight: 700, color: '#00ff66', letterSpacing: 6,
              }}>
                REVELATOR
              </span>
              <span className="mono" style={{
                fontSize: 8, letterSpacing: 3, color: '#3f6e4a', marginTop: 3,
              }}>
                FORENSIC ENGINE
              </span>
            </div>
          </Link>

          {user && (
            <>
              <nav className="nav-desktop" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {navItems.map(item => (
                  <Link key={item.path} to={item.path} style={linkStyle(location.pathname === item.path)}>
                    {item.label}
                  </Link>
                ))}
                <button
                  onClick={logout}
                  style={{
                    background: 'rgba(255,51,68,0.04)', border: '1px solid rgba(255,51,68,0.4)', color: '#ff7588',
                    padding: '6px 14px', cursor: 'pointer', fontSize: 11,
                    fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase',
                    letterSpacing: 1.5, borderRadius: 2, marginLeft: 8,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(255,51,68,0.18)';
                    e.currentTarget.style.color = '#ffffff';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'rgba(255,51,68,0.04)';
                    e.currentTarget.style.color = '#ff7588';
                  }}
                >
                  Logout
                </button>
              </nav>

              <button
                className="nav-burger"
                onClick={() => setMenuOpen(v => !v)}
                aria-label="Toggle menu"
                style={{
                  background: 'rgba(0,255,102,0.04)', border: '1px solid #1d3825', color: '#00ff66',
                  padding: '8px 12px', cursor: 'pointer', borderRadius: 2,
                  fontSize: 18, lineHeight: 1,
                  textShadow: '0 0 8px rgba(0,255,102,0.5)',
                }}
              >
                {menuOpen ? '✕' : '☰'}
              </button>
            </>
          )}
        </div>

        {user && menuOpen && (
          <div
            className="nav-mobile-panel"
            style={{
              borderTop: '1px solid #112418', marginTop: 12, paddingTop: 8,
              display: 'flex', flexDirection: 'column',
            }}
          >
            {navItems.map(item => (
              <Link key={item.path} to={item.path} style={{ ...linkStyle(location.pathname === item.path), borderBottom: 'none', padding: '12px 16px' }}>
                {item.label}
              </Link>
            ))}
            <button
              onClick={() => { setMenuOpen(false); logout(); }}
              style={{
                background: 'none', border: 'none', color: '#ff7588',
                padding: '12px 16px', textAlign: 'left', cursor: 'pointer',
                fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase',
                letterSpacing: 1.5, fontSize: 13,
              }}
            >
              Logout
            </button>
          </div>
        )}
      </header>
      <main style={{ padding: '24px 0', minHeight: 'calc(100vh - 80px)' }}>
        <div className="container">
          {children}
        </div>
      </main>
    </div>
  );
}

// ── App ─────────────────────────────────────────────

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export default function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <BrowserRouter>
        <AuthProvider>
          <Layout>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/" element={<Navigate to="/scan" replace />} />
              <Route path="/scan" element={<ProtectedRoute><Scan /></ProtectedRoute>} />
              <Route path="/samples/:categoryId" element={<ProtectedRoute><SampleGallery /></ProtectedRoute>} />
              <Route path="/about" element={<About />} />
              <Route path="/history" element={<ProtectedRoute><History /></ProtectedRoute>} />
              <Route path="/account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
              <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
              <Route path="*" element={<Navigate to="/scan" replace />} />
            </Routes>
          </Layout>
        </AuthProvider>
      </BrowserRouter>
    </GoogleOAuthProvider>
  );
}
