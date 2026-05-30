import React, { useState, useEffect } from 'react';
import axios from 'axios';
import LoginPage from './pages/LoginPage';

// ── API instance ──────────────────────────────────────────────────────────────
export const api = axios.create({ baseURL: '/api' });

// Attach token to every request automatically
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('tea_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// If 401 received, clear auth and reload
api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('tea_token');
      localStorage.removeItem('tea_user');
      window.location.reload();
    }
    return Promise.reject(err);
  }
);

// ── Shared UI components ──────────────────────────────────────────────────────
export const Card = ({ children, style }) => (
  <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', border: '1px solid #f0f4f8', padding: 20, ...style }}>
    {children}
  </div>
);

export const Button = ({ children, onClick, disabled, variant = 'primary', style }) => {
  const variants = {
    primary: { background: '#1a3c5e', color: '#fff' },
    success: { background: '#1a7a4a', color: '#fff' },
    danger:  { background: '#c0392b', color: '#fff' },
    outline: { background: '#fff', color: '#1a3c5e', border: '1.5px solid #1a3c5e' },
  };
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ padding: '8px 18px', borderRadius: 7, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 13, opacity: disabled ? 0.6 : 1, ...variants[variant], ...style }}>
      {children}
    </button>
  );
};

export const Alert = ({ msg, type }) => {
  const colors = {
    success: { bg: '#f0fdf4', border: '#bbf7d0', color: '#166534' },
    error:   { bg: '#fee2e2', border: '#fecaca', color: '#991b1b' },
    warning: { bg: '#fffbeb', border: '#fde68a', color: '#92400e' },
  };
  const c = colors[type] || colors.warning;
  return (
    <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13, fontWeight: 500, background: c.bg, border: `1px solid ${c.border}`, color: c.color }}>
      {msg}
    </div>
  );
};

// ── Nav pages ─────────────────────────────────────────────────────────────────
const pages = [
  { id: 'dashboard', label: '🏠 Dashboard' },
  { id: 'import',    label: '📥 Import' },
  { id: 'mapping',   label: '🗺 Mapping' },
  { id: 'marking',   label: '✅ Marking' },
  { id: 'labels',    label: '🏷 Labels' },
  { id: 'reports',   label: '📊 Reports' },
];

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [user,    setUser]    = useState(null);
  const [authChk, setAuthChk] = useState(true); // checking auth on load
  const [page,    setPage]    = useState('dashboard');
  const [PageComp, setPageComp] = useState(null);

  // Check if already logged in on mount
  useEffect(() => {
    const stored = localStorage.getItem('tea_user');
    const token  = localStorage.getItem('tea_token');
    if (stored && token) {
      try { setUser(JSON.parse(stored)); } catch { localStorage.clear(); }
    }
    setAuthChk(false);
  }, []);

  // Lazy load page component when page changes
  useEffect(() => {
    if (!user) return;
    const map = {
      dashboard: () => import('./pages/Dashboard'),
      import:    () => import('./pages/ImportPage'),
      mapping:   () => import('./pages/MappingPage'),
      marking:   () => import('./pages/MarkingPage'),
      labels:    () => import('./pages/LabelsPage'),
      reports:   () => import('./pages/ReportsPage'),
    };
    const loader = map[page];
    if (loader) {
      loader().then(m => setPageComp(() => m.default));
    }
  }, [page, user]);

  const handleLogin  = u => setUser(u);
  const handleLogout = () => {
    localStorage.removeItem('tea_token');
    localStorage.removeItem('tea_user');
    setUser(null);
  };

  // Loading auth check
  if (authChk) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a3c5e' }}>
      <div style={{ color: '#fff', fontSize: 16 }}>🍵 Loading…</div>
    </div>
  );

  // Not logged in
  if (!user) return <LoginPage onLogin={handleLogin} />;

  // Logged in — show full app
  return (
    <div style={{ minHeight: '100vh', background: '#f3f6fa', fontFamily: "'Segoe UI', Arial, sans-serif" }}>
      {/* ── Header ── */}
      <div style={{ background: '#1a3c5e', padding: '0 24px', display: 'flex', alignItems: 'center', height: 52, boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
        <div style={{ fontSize: 18, marginRight: 10 }}>🍵</div>
        <div style={{ color: '#fff', fontWeight: 800, fontSize: 16, flex: 1, letterSpacing: 0.3 }}>
          Vedanta Tea Auction Tool
        </div>
        {/* User info + logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>
            👤 <span style={{ fontWeight: 600 }}>{user.name}</span>
          </div>
          <button onClick={handleLogout}
            style={{ padding: '5px 12px', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Sign Out
          </button>
        </div>
      </div>

      {/* ── Nav ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 24px', display: 'flex', gap: 4, overflowX: 'auto' }}>
        {pages.map(p => (
          <button key={p.id} onClick={() => setPage(p.id)}
            style={{
              padding: '12px 14px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: page === p.id ? 700 : 500,
              color:  page === p.id ? '#1a3c5e' : '#6b7280',
              borderBottom: page === p.id ? '2.5px solid #1a3c5e' : '2.5px solid transparent',
              whiteSpace: 'nowrap', transition: 'all 0.15s'
            }}>
            {p.label}
          </button>
        ))}
      </div>

      {/* ── Page content ── */}
      <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
        {PageComp ? <PageComp /> : (
          <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>⏳ Loading…</div>
        )}
      </div>
    </div>
  );
}
