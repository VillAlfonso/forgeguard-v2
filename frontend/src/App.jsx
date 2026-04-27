import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate, useLocation } from 'react-router-dom';
import { api } from './api/client';
import Login from './pages/Login';
import Register from './pages/Register';
import Scan from './pages/Scan';
import SampleGallery from './pages/SampleGallery';
import History from './pages/History';
import Account from './pages/Account';
import Admin from './pages/Admin';
import About from './pages/About';

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
  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#a3a3a3' }}>Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#a3a3a3' }}>Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.is_admin) return <Navigate to="/scan" replace />;
  return children;
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
    color: active ? '#f5c518' : '#a3a3a3',
    textDecoration: 'none',
    borderBottom: active ? '2px solid #f5c518' : '2px solid transparent',
    whiteSpace: 'nowrap',
  });

  return (
    <div>
      <div className="tape-border" />
      <header style={{
        background: 'linear-gradient(180deg, #111 0%, #0a0a0a 100%)',
        borderBottom: '1px solid #262626',
        padding: '12px 16px',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link to="/scan" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="oswald" style={{ fontSize: 20, fontWeight: 700, color: '#f5c518', letterSpacing: 3 }}>
              REVELATOR
            </span>
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
                    background: 'none', border: '1px solid #404040', color: '#a3a3a3',
                    padding: '6px 14px', cursor: 'pointer', fontSize: 12,
                    fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase',
                    letterSpacing: 1, borderRadius: 4, marginLeft: 8,
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
                  background: 'none', border: '1px solid #404040', color: '#f5c518',
                  padding: '8px 12px', cursor: 'pointer', borderRadius: 4,
                  fontSize: 18, lineHeight: 1,
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
              borderTop: '1px solid #262626', marginTop: 12, paddingTop: 8,
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
                background: 'none', border: 'none', color: '#a3a3a3',
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

export default function App() {
  return (
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
  );
}
