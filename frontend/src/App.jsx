import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate, useLocation } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { Capacitor } from '@capacitor/core';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { api } from './api/client';
import Login from './pages/Login';
import Register from './pages/Register';
import Terms from './pages/Terms';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Scan from './pages/Scan';
import SampleGallery from './pages/SampleGallery';
import History from './pages/History';
import Account from './pages/Account';
import Admin from './pages/Admin';
import ForensicsGuide from './pages/ForensicsGuide';
import Logo from './components/Logo';

// ── Theme Context ────────────────────────────────────

const ThemeContext = createContext({ theme: 'dark', toggleTheme: () => {} });

export function useTheme() {
  return useContext(ThemeContext);
}

function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('fg_theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('fg_theme', theme);
  }, [theme]);

  function toggleTheme() {
    setTheme(t => t === 'dark' ? 'light' : 'dark');
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ── Scan Context ────────────────────────────────────

const ScanContext = createContext(null);

export function useScan() {
  return useContext(ScanContext);
}

function ScanProvider({ children }) {
  const [status, setStatus] = useState('idle'); // 'idle' | 'scanning' | 'done' | 'error'
  const [result, setResult] = useState(null);
  const [scanError, setScanError] = useState('');
  const [previewUrl, setPreviewUrl] = useState(null);
  const abortRef = useRef(null);

  async function startScan(file, docType, extras, preview) {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setStatus('scanning');
    setResult(null);
    setScanError('');
    setPreviewUrl(preview || null);

    try {
      const data = await api.analyze(file, null, docType, extras, ctrl.signal);
      if (!ctrl.signal.aborted) {
        setStatus('done');
        setResult(data);
      }
    } catch (err) {
      if (ctrl.signal.aborted) return;
      if (err.message === 'quota_exhausted' || err.message === 'no_api_key') {
        localStorage.setItem('fg_quota_exhausted', 'true');
        localStorage.setItem('fg_highlight_key_input', 'true');
        localStorage.setItem('fg_no_api_key', err.message === 'no_api_key' ? 'true' : 'false');
      }
      setStatus('error');
      setScanError(err.message);
    }
  }

  function stopScan() {
    if (abortRef.current) abortRef.current.abort();
    setStatus('idle');
    setResult(null);
    setScanError('');
  }

  function clearScan() {
    setStatus('idle');
    setResult(null);
    setScanError('');
    setPreviewUrl(null);
  }

  return (
    <ScanContext.Provider value={{ status, result, error: scanError, previewUrl, startScan, stopScan, clearScan }}>
      {children}
    </ScanContext.Provider>
  );
}

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
  if (!["admin","superadmin"].includes(user.role)) return <Navigate to="/scan" replace />;
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
  const { theme, toggleTheme } = useTheme();
  const { status: scanStatus, stopScan } = useScan();
  const location = useLocation();
  const navigate = useNavigate();
  const onScanPage = location.pathname === '/scan';
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerOffset, setDrawerOffset] = useState(0); // for swipe-drag visual feedback
  const [quotaExhausted, setQuotaExhausted] = useState(() => localStorage.getItem('fg_quota_exhausted') === 'true');
  const touchStartX = React.useRef(null);
  const touchStartY = React.useRef(null);
  const isDragging = React.useRef(false);
  const DRAWER_WIDTH = 280;

  // Clear quota exhausted flag when entering Account page
  React.useEffect(() => {
    if (location.pathname === '/account') {
      setQuotaExhausted(false);
      localStorage.removeItem('fg_quota_exhausted');
      localStorage.removeItem('fg_no_api_key');
    }
  }, [location.pathname]);

  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  // Lock body scroll while drawer is open
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  // Close drawer on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') setDrawerOpen(false); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Swipe-from-edge to open / swipe-on-drawer to close
  useEffect(() => {
    if (!user) return;

    function onTouchStart(e) {
      const t = e.touches[0];
      // Open: touch must start near left edge (within 24px) and drawer is closed
      // Close: touch can start anywhere on drawer area when open
      const fromEdge = t.clientX <= 24;
      const onDrawer = drawerOpen && t.clientX <= DRAWER_WIDTH + 40;
      if (fromEdge || onDrawer) {
        touchStartX.current = t.clientX;
        touchStartY.current = t.clientY;
        isDragging.current = false;
      }
    }
    function onTouchMove(e) {
      if (touchStartX.current == null) return;
      const t = e.touches[0];
      const dx = t.clientX - touchStartX.current;
      const dy = t.clientY - touchStartY.current;
      // Only start dragging if horizontal motion dominates
      if (!isDragging.current && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
        isDragging.current = true;
      }
      if (!isDragging.current) return;

      if (drawerOpen) {
        // Closing drag: dx is negative as user swipes left; offset in [-W, 0]
        setDrawerOffset(Math.max(-DRAWER_WIDTH, Math.min(0, dx)));
      } else {
        // Opening drag: dx is positive as user swipes right; offset in [0, W]
        setDrawerOffset(Math.max(0, Math.min(DRAWER_WIDTH, dx)));
      }
    }
    function onTouchEnd() {
      if (isDragging.current) {
        if (drawerOpen) {
          if (drawerOffset < -DRAWER_WIDTH / 3) setDrawerOpen(false);
        } else {
          if (drawerOffset > DRAWER_WIDTH / 3) setDrawerOpen(true);
        }
      }
      touchStartX.current = null;
      touchStartY.current = null;
      isDragging.current = false;
      setDrawerOffset(0);
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [user, drawerOpen, drawerOffset]);

  const navItems = [
    { path: '/scan', label: 'Scan', icon: '⌖' },
    { path: '/history', label: 'History', icon: '▤' },
    { path: '/guide', label: 'Guide', icon: '◈' },
    { path: '/account', label: 'Account', icon: '◉' },
    ...(["admin","superadmin"].includes(user?.role) ? [{ path: '/admin', label: 'Admin', icon: '★' }] : []),
  ];

  // Translation for drawer (open + drag state)
  // When open: drawerOffset is [-W, 0]; transform translates from 0 (rest) toward -W during close drag.
  // When closed: drawerOffset is [0, W]; transform translates from -W (rest) toward 0 during open drag.
  const drawerTransform = drawerOpen
    ? `translateX(${drawerOffset}px)`
    : `translateX(${-DRAWER_WIDTH + drawerOffset}px)`;
  const backdropOpacity = drawerOpen
    ? Math.max(0, 1 + drawerOffset / DRAWER_WIDTH)
    : Math.max(0, Math.min(1, drawerOffset / DRAWER_WIDTH));

  return (
    <div>
      <div className="tape-border" />
      <header style={{
        background:
          'linear-gradient(180deg, rgba(8,18,12,0.95) 0%, rgba(0,0,0,0.92) 100%)',
        borderBottom: '1px solid #112418',
        padding: '10px 14px',
        position: 'sticky', top: 0, zIndex: 50,
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        boxShadow: '0 1px 0 rgba(0,255,102,0.08), 0 8px 24px rgba(0,0,0,0.6)',
      }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          {/* Hamburger — left side, mobile only */}
          {user && (
            <button
              className="nav-burger"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              style={{
                background: quotaExhausted ? 'rgba(0,255,102,0.18)' : 'rgba(0,255,102,0.06)',
                border: quotaExhausted ? '1px solid #00ff66' : '1px solid #1d3825',
                color: '#00ff66',
                width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', borderRadius: 3, padding: 0,
                fontSize: 22, lineHeight: 1, flexShrink: 0,
                textShadow: '0 0 8px rgba(0,255,102,0.5)',
                boxShadow: quotaExhausted ? '0 0 0 2px rgba(0,255,102,0.5), 0 0 20px rgba(0,255,102,0.6)' : 'none',
                animation: quotaExhausted ? 'spotlight-pulse 1.5s ease-in-out infinite' : 'none',
                position: 'relative', zIndex: quotaExhausted ? 51 : 'auto',
              }}
            >
              ☰
            </button>
          )}

          <Link to="/scan" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            <Logo size={32} glow animated />
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1, minWidth: 0 }}>
              <span className="oswald glow-strong" style={{
                fontSize: 20, fontWeight: 700, color: '#00ff66', letterSpacing: 5,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
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

          {/* Desktop nav — only on wide screens */}
          {user && (
            <nav className="nav-desktop" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <style>{`
                @keyframes flicker-glow {
                  0%, 100% { box-shadow: 0 0 8px rgba(0,255,102,0.8), 0 0 16px rgba(0,255,102,0.6); }
                  50% { box-shadow: 0 0 4px rgba(0,255,102,0.3), 0 0 8px rgba(0,255,102,0.2); }
                }
                @keyframes spotlight-pulse {
                  0%, 100% { box-shadow: 0 0 0 2px rgba(0,255,102,0.7), 0 0 28px rgba(0,255,102,0.9), 0 0 60px rgba(0,255,102,0.3); }
                  50% { box-shadow: 0 0 0 2px rgba(0,255,102,0.4), 0 0 14px rgba(0,255,102,0.5), 0 0 30px rgba(0,255,102,0.15); }
                }
              `}</style>
              {navItems.map(item => {
                const active = location.pathname === item.path;
                const isAccount = item.path === '/account';
                const shouldFlicker = quotaExhausted && isAccount;
                const shouldDim = quotaExhausted && !isAccount && !active;
                return (
                  <Link key={item.path} to={item.path} style={{
                    padding: '10px 14px', fontSize: 13,
                    fontFamily: "'Oswald', sans-serif",
                    textTransform: 'uppercase', letterSpacing: 1.5,
                    color: shouldDim ? '#2a4a30' : active ? '#00ff66' : shouldFlicker ? '#00ff66' : '#6dba85',
                    textDecoration: 'none',
                    borderBottom: active ? '2px solid #00ff66' : shouldFlicker ? '2px solid #00ff66' : '2px solid transparent',
                    textShadow: active ? '0 0 12px rgba(0,255,102,0.55)' : shouldFlicker ? '0 0 12px rgba(0,255,102,0.9)' : 'none',
                    whiteSpace: 'nowrap',
                    transition: 'color 0.15s, text-shadow 0.15s',
                    animation: shouldFlicker ? 'spotlight-pulse 1.5s ease-in-out infinite' : 'none',
                    borderRadius: shouldFlicker ? 3 : 0,
                    background: shouldFlicker ? 'rgba(0,255,102,0.1)' : 'transparent',
                    position: 'relative', zIndex: shouldFlicker ? 51 : 'auto',
                    pointerEvents: shouldDim ? 'none' : 'auto',
                    opacity: shouldDim ? 0.25 : 1,
                  }}>
                    {item.label}
                  </Link>
                );
              })}
              <button
                onClick={toggleTheme}
                aria-label="Toggle theme"
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                style={{
                  background: 'rgba(0,255,102,0.04)', border: '1px solid #1d3825', color: '#86efac',
                  width: 32, height: 32, cursor: 'pointer', fontSize: 16,
                  borderRadius: 2, marginLeft: 8, padding: 0,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {theme === 'dark' ? '☾' : '☀'}
              </button>
              <button
                onClick={logout}
                style={{
                  background: 'rgba(255,51,68,0.04)', border: '1px solid rgba(255,51,68,0.4)', color: '#ff7588',
                  padding: '6px 14px', cursor: 'pointer', fontSize: 11,
                  fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase',
                  letterSpacing: 1.5, borderRadius: 2, marginLeft: 8,
                }}
              >
                Logout
              </button>
            </nav>
          )}
        </div>
      </header>

      {/* API key tutorial overlay — dims everything below the header */}
      {user && quotaExhausted && !drawerOpen && (
        <div
          onClick={() => { navigate('/account'); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 48,
            background: 'rgba(0,0,0,0.82)',
            cursor: 'pointer',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            paddingBottom: 40,
          }}
        >
          {/* Mobile floating hint */}
          <div
            className="nav-burger"
            style={{
              background: 'rgba(0,0,0,0.92)', border: '1px solid rgba(0,255,102,0.5)',
              borderRadius: 8, padding: '16px 20px', maxWidth: 300, textAlign: 'center',
              boxShadow: '0 0 30px rgba(0,255,102,0.25)',
              pointerEvents: 'none',
            }}
          >
            <div className="mono" style={{ fontSize: 9, letterSpacing: 3, color: '#00ff66', marginBottom: 8, textTransform: 'uppercase' }}>
              ▲ API KEY REQUIRED
            </div>
            <div style={{ color: '#d8ffe6', fontSize: 13, lineHeight: 1.7, marginBottom: 10 }}>
              Tap the <strong style={{ color: '#00ff66' }}>☰</strong> menu icon above then go to <strong style={{ color: '#00ff66' }}>Account</strong> to add your Gemini API key.
            </div>
            <div className="mono" style={{ fontSize: 10, color: '#3f6e4a', letterSpacing: 1 }}>
              Tap anywhere to go there now →
            </div>
          </div>

          {/* Desktop hint — arrow pointing at Account nav */}
          <div
            className="nav-desktop"
            style={{
              position: 'absolute', top: 66, right: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
              paddingRight: 24, pointerEvents: 'none',
            }}
          >
            <div style={{ fontSize: 20, color: '#00ff66', lineHeight: 1, marginBottom: 4, textShadow: '0 0 10px rgba(0,255,102,0.8)' }}>▲</div>
            <div style={{
              background: 'rgba(0,0,0,0.92)', border: '1px solid rgba(0,255,102,0.4)',
              borderRadius: 6, padding: '10px 14px', maxWidth: 220,
              boxShadow: '0 0 20px rgba(0,255,102,0.2)',
            }}>
              <div className="mono" style={{ fontSize: 9, letterSpacing: 2, color: '#00ff66', marginBottom: 6, textTransform: 'uppercase' }}>
                API Key Required
              </div>
              <div style={{ color: '#d8ffe6', fontSize: 12, lineHeight: 1.6 }}>
                Go to <strong style={{ color: '#00ff66' }}>Account</strong> and paste your Gemini API key to start scanning.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Drawer backdrop */}
      {user && (drawerOpen || drawerOffset !== 0) && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 60,
            background: `rgba(0,0,0,${0.6 * backdropOpacity})`,
            backdropFilter: `blur(${4 * backdropOpacity}px)`,
            WebkitBackdropFilter: `blur(${4 * backdropOpacity}px)`,
            transition: drawerOffset === 0 ? 'background 0.25s, backdrop-filter 0.25s' : 'none',
          }}
        />
      )}

      {/* Slide-in drawer — left edge, X/Twitter style */}
      {user && (
        <aside
          aria-hidden={!drawerOpen}
          style={{
            position: 'fixed', top: 0, left: 0, bottom: 0,
            width: DRAWER_WIDTH, maxWidth: '85vw', zIndex: 70,
            background: 'linear-gradient(180deg, #06120a 0%, #02080a 100%)',
            borderRight: '1px solid #1d3825',
            boxShadow: drawerOpen ? '4px 0 32px rgba(0,255,102,0.12), 8px 0 60px rgba(0,0,0,0.85)' : 'none',
            transform: drawerTransform,
            transition: drawerOffset === 0 ? 'transform 0.28s cubic-bezier(0.32,0.72,0.4,1)' : 'none',
            display: 'flex', flexDirection: 'column',
            paddingTop: 'env(safe-area-inset-top, 0)',
          }}
        >
          {/* Drawer header — user identity */}
          <div style={{
            padding: '20px 18px 18px', borderBottom: '1px solid #112418',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 22,
              background: 'linear-gradient(135deg, rgba(0,255,102,0.18), rgba(0,255,170,0.06))',
              border: '1px solid #1d3825',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: "'Oswald', sans-serif", fontSize: 18, color: '#00ff66',
              textShadow: '0 0 8px rgba(0,255,102,0.7)', flexShrink: 0,
            }}>
              {(user?.username || user?.email || '?').slice(0, 1).toUpperCase()}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="oswald" style={{
                fontSize: 14, color: '#d8ffe6', textTransform: 'uppercase', letterSpacing: 1.5,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {user?.username || 'OPERATOR'}
              </div>
              <div className="mono" style={{
                fontSize: 10, color: '#6dba85', letterSpacing: 1, marginTop: 2,
                textTransform: 'uppercase',
              }}>
                {user?.plan ? `${user.plan} TIER` : 'FREE TIER'}
              </div>
            </div>
            <button
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
              style={{
                background: 'transparent', border: '1px solid #1d3825',
                color: '#6dba85', width: 32, height: 32, borderRadius: 16,
                cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0,
              }}
            >
              ✕
            </button>
          </div>

          {/* Drawer nav links */}
          <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
            <style>{`
              @keyframes flicker-glow-drawer {
                0%, 100% { box-shadow: inset 0 0 8px rgba(0,255,102,0.4); }
                50% { box-shadow: inset 0 0 4px rgba(0,255,102,0.1); }
              }
              @keyframes spotlight-drawer {
                0%, 100% { box-shadow: inset 0 0 16px rgba(0,255,102,0.3), 0 0 20px rgba(0,255,102,0.4); background: rgba(0,255,102,0.12); }
                50% { box-shadow: inset 0 0 8px rgba(0,255,102,0.1), 0 0 10px rgba(0,255,102,0.2); background: rgba(0,255,102,0.06); }
              }
            `}</style>
            {navItems.map(item => {
              const active = location.pathname === item.path;
              const isAccount = item.path === '/account';
              const shouldFlicker = quotaExhausted && isAccount;
              const shouldDimDrawer = quotaExhausted && !isAccount;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '14px 18px',
                    fontSize: 15,
                    fontFamily: "'Oswald', sans-serif",
                    textTransform: 'uppercase', letterSpacing: 2,
                    color: shouldDimDrawer ? '#1d3825' : active ? '#00ff66' : shouldFlicker ? '#00ff66' : '#86efac',
                    textDecoration: 'none',
                    borderLeft: active ? '3px solid #00ff66' : shouldFlicker ? '3px solid #00ff66' : '3px solid transparent',
                    background: shouldFlicker ? 'rgba(0,255,102,0.12)' : active ? 'rgba(0,255,102,0.06)' : 'transparent',
                    textShadow: active ? '0 0 10px rgba(0,255,102,0.5)' : shouldFlicker ? '0 0 14px rgba(0,255,102,0.9)' : 'none',
                    minHeight: 48,
                    opacity: shouldDimDrawer ? 0.2 : 1,
                    pointerEvents: shouldDimDrawer ? 'none' : 'auto',
                    animation: shouldFlicker ? 'spotlight-drawer 1.5s ease-in-out infinite' : 'none',
                  }}
                >
                  <span className="mono" style={{
                    fontSize: 16, color: active ? '#00ff66' : shouldFlicker ? '#00ff66' : '#3f6e4a', width: 20, textAlign: 'center',
                  }}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Drawer footer — theme toggle + logout */}
          <div style={{
            borderTop: '1px solid #112418',
            padding: '10px 12px',
            paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0))',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <button
              onClick={toggleTheme}
              style={{
                width: '100%', minHeight: 48,
                background: 'rgba(0,255,102,0.04)',
                border: '1px solid #1d3825', color: '#86efac',
                padding: '12px', cursor: 'pointer', fontSize: 13,
                fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase',
                letterSpacing: 2, borderRadius: 3,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              }}
            >
              <span style={{ fontSize: 18 }}>{theme === 'dark' ? '☾' : '☀'}</span>
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
            <button
              onClick={() => { setDrawerOpen(false); logout(); }}
              style={{
                width: '100%', minHeight: 48,
                background: 'rgba(255,51,68,0.06)',
                border: '1px solid rgba(255,51,68,0.35)', color: '#ff8a99',
                padding: '12px', cursor: 'pointer', fontSize: 13,
                fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase',
                letterSpacing: 2, borderRadius: 3,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <span style={{ fontSize: 16 }}>⤴</span> Logout
            </button>
          </div>
        </aside>
      )}

      {/* Floating scan status pill — visible on all pages while a scan is running */}
      {user && (scanStatus === 'scanning' || (scanStatus === 'done' && !onScanPage) || (scanStatus === 'error' && !onScanPage)) && (
        <div style={{
          position: 'fixed', bottom: 24, right: 20, zIndex: 200,
          background: 'rgba(6,18,10,0.97)',
          border: `1px solid ${scanStatus === 'done' ? '#00ff66' : scanStatus === 'error' ? '#ff3344' : '#1d3825'}`,
          borderRadius: 6, padding: '10px 14px',
          boxShadow: `0 4px 24px rgba(0,0,0,0.7), 0 0 16px ${scanStatus === 'done' ? 'rgba(0,255,102,0.2)' : scanStatus === 'error' ? 'rgba(255,51,68,0.2)' : 'rgba(0,255,102,0.1)'}`,
          display: 'flex', alignItems: 'center', gap: 10,
          minWidth: 200, maxWidth: 280,
        }}>
          {scanStatus === 'scanning' && (
            <>
              <span className="mono" style={{ fontSize: 11, color: '#6dba85', animation: 'ring-spin 1.2s linear infinite', display: 'inline-block' }}>◌</span>
              <span className="mono" style={{ fontSize: 11, color: '#86efac', letterSpacing: 1, flex: 1 }}>Scanning in progress…</span>
              <button
                onClick={stopScan}
                title="Stop scan"
                style={{
                  background: 'rgba(255,51,68,0.12)', border: '1px solid rgba(255,51,68,0.5)',
                  color: '#ff8a99', borderRadius: 3, padding: '3px 8px',
                  cursor: 'pointer', fontSize: 11,
                  fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase', letterSpacing: 1,
                  flexShrink: 0,
                }}
              >
                ✕ Stop
              </button>
            </>
          )}
          {scanStatus === 'done' && !onScanPage && (
            <>
              <span style={{ color: '#00ff66', fontSize: 14 }}>✓</span>
              <span className="mono" style={{ fontSize: 11, color: '#86efac', letterSpacing: 1, flex: 1 }}>Scan complete</span>
              <button
                onClick={() => navigate('/scan')}
                style={{
                  background: 'rgba(0,255,102,0.12)', border: '1px solid rgba(0,255,102,0.5)',
                  color: '#00ff66', borderRadius: 3, padding: '3px 8px',
                  cursor: 'pointer', fontSize: 11,
                  fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase', letterSpacing: 1,
                  flexShrink: 0,
                }}
              >
                View →
              </button>
            </>
          )}
          {scanStatus === 'error' && !onScanPage && (
            <>
              <span style={{ color: '#ff3344', fontSize: 14 }}>⚠</span>
              <span className="mono" style={{ fontSize: 11, color: '#ff8a99', letterSpacing: 1, flex: 1 }}>Scan failed</span>
              <button
                onClick={() => navigate('/scan')}
                style={{
                  background: 'rgba(255,51,68,0.12)', border: '1px solid rgba(255,51,68,0.5)',
                  color: '#ff8a99', borderRadius: 3, padding: '3px 8px',
                  cursor: 'pointer', fontSize: 11,
                  fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase', letterSpacing: 1,
                  flexShrink: 0,
                }}
              >
                View →
              </button>
            </>
          )}
        </div>
      )}

      <main style={{ padding: '20px 0', minHeight: 'calc(100vh - 80px)' }}>
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
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      GoogleAuth.initialize({
        clientId: GOOGLE_CLIENT_ID,
        scopes: ['profile', 'email'],
        grantOfflineAccess: false,
      });
    }
  }, []);

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <ScanProvider>
            <Layout>
              <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/" element={<Navigate to="/scan" replace />} />
              <Route path="/scan" element={<ProtectedRoute><Scan /></ProtectedRoute>} />
              <Route path="/samples/:categoryId" element={<ProtectedRoute><SampleGallery /></ProtectedRoute>} />
              <Route path="/history" element={<ProtectedRoute><History /></ProtectedRoute>} />
              <Route path="/guide" element={<ProtectedRoute><ForensicsGuide /></ProtectedRoute>} />
              <Route path="/account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
              <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
              <Route path="*" element={<Navigate to="/scan" replace />} />
              </Routes>
            </Layout>
            </ScanProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </GoogleOAuthProvider>
  );
}
