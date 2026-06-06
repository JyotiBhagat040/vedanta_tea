import React, { useState } from 'react';
import { api } from '../App';

export default function LoginPage({ onLogin }) {
  const [mode,     setMode]     = useState('login'); // 'login' | 'signup'
  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPwd,  setShowPwd]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const isLogin = mode === 'login';

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    if (!email || !password || (!isLogin && !name)) {
      setError('Please fill in all fields.');
      return;
    }
    setLoading(true);
    try {
      const endpoint = isLogin ? '/auth/login' : '/auth/signup';
      const payload  = isLogin ? { email, password } : { name, email, password };
      const r = await api.post(endpoint, payload);
      localStorage.setItem('tea_token', r.data.token);
      localStorage.setItem('tea_user',  JSON.stringify(r.data.user));
      onLogin(r.data.user);
    } catch (e) {
      setError(e.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setMode(isLogin ? 'signup' : 'login');
    setError('');
    setName(''); setEmail(''); setPassword('');
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f2744 0%, #1a3c5e 50%, #0f2744 100%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Segoe UI', Arial, sans-serif",
      padding: 20
    }}>
      {/* Tea leaf decorative pattern */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', opacity: 0.04 }}>
        {[...Array(20)].map((_, i) => (
          <div key={i} style={{
            position: 'absolute',
            width: 40, height: 60,
            border: '2px solid #fff',
            borderRadius: '50% 10% 50% 10%',
            left: `${(i * 17) % 100}%`,
            top:  `${(i * 23) % 100}%`,
            transform: `rotate(${i * 37}deg)`
          }} />
        ))}
      </div>

      {/* Logo / Brand */}
      <div style={{ textAlign: 'center', marginBottom: 32, zIndex: 1 }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🍵</div>
        <h1 style={{
          color: '#fff', fontSize: 28, fontWeight: 800,
          margin: 0, letterSpacing: 0.5, lineHeight: 1.2
        }}>
          Tea Sampling Tool
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 8 }}>
          Developed by Jyoti Bhagat
        </p>
      </div>

      {/* Card */}
      <div style={{
        background: '#fff',
        borderRadius: 16,
        padding: '36px 40px',
        width: '100%',
        maxWidth: 420,
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
        zIndex: 1
      }}>
        {/* Tab switcher */}
        <div style={{ display: 'flex', marginBottom: 28, background: '#f0f4f8', borderRadius: 10, padding: 4 }}>
          {['login', 'signup'].map(m => (
            <button key={m} onClick={() => { setMode(m); setError(''); setName(''); setEmail(''); setPassword(''); }}
              style={{
                flex: 1, padding: '9px 0', border: 'none', borderRadius: 8, cursor: 'pointer',
                fontWeight: 700, fontSize: 14, transition: 'all 0.2s',
                background: mode === m ? '#1a3c5e' : 'transparent',
                color:      mode === m ? '#fff'    : '#6b7280'
              }}>
              {m === 'login' ? 'Sign In' : 'Sign Up'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          {/* Name field — signup only */}
          {!isLogin && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your full name"
                autoFocus
                style={{
                  width: '100%', padding: '11px 14px', fontSize: 14,
                  border: '1.5px solid #e2e8f0', borderRadius: 8, outline: 'none',
                  boxSizing: 'border-box', transition: 'border-color 0.2s',
                  fontFamily: 'inherit'
                }}
                onFocus={e => e.target.style.borderColor = '#1a3c5e'}
                onBlur={e  => e.target.style.borderColor = '#e2e8f0'}
              />
            </div>
          )}

          {/* Email */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoFocus={isLogin}
              style={{
                width: '100%', padding: '11px 14px', fontSize: 14,
                border: '1.5px solid #e2e8f0', borderRadius: 8, outline: 'none',
                boxSizing: 'border-box', fontFamily: 'inherit'
              }}
              onFocus={e => e.target.style.borderColor = '#1a3c5e'}
              onBlur={e  => e.target.style.borderColor = '#e2e8f0'}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={isLogin ? 'Your password' : 'At least 6 characters'}
                style={{
                  width: '100%', padding: '11px 44px 11px 14px', fontSize: 14,
                  border: '1.5px solid #e2e8f0', borderRadius: 8, outline: 'none',
                  boxSizing: 'border-box', fontFamily: 'inherit'
                }}
                onFocus={e => e.target.style.borderColor = '#1a3c5e'}
                onBlur={e  => e.target.style.borderColor = '#e2e8f0'}
              />
              <button type="button" onClick={() => setShowPwd(v => !v)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#9ca3af' }}>
                {showPwd ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{ marginBottom: 16, padding: '10px 14px', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#991b1b', fontWeight: 500 }}>
              {error}
            </div>
          )}

          {/* Submit */}
          <button type="submit" disabled={loading}
            style={{
              width: '100%', padding: '13px 0', fontSize: 15, fontWeight: 800,
              background: loading ? '#93a3bc' : '#1a3c5e',
              color: '#fff', border: 'none', borderRadius: 8,
              cursor: loading ? 'not-allowed' : 'pointer',
              letterSpacing: 0.3, transition: 'background 0.2s',
              fontFamily: 'inherit'
            }}
            onMouseEnter={e => { if (!loading) e.target.style.background = '#234d78'; }}
            onMouseLeave={e => { if (!loading) e.target.style.background = '#1a3c5e'; }}>
            {loading ? '⏳ Please wait…' : isLogin ? 'Sign In →' : 'Create Account →'}
          </button>
        </form>

        {/* Switch mode text */}
        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#6b7280' }}>
          {isLogin ? "Don't have an account?" : 'Already have an account?'}
          <button onClick={switchMode}
            style={{ marginLeft: 6, background: 'none', border: 'none', color: '#1a3c5e', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
            {isLogin ? 'Sign Up' : 'Sign In'}
          </button>
        </p>
      </div>

      {/* Footer */}
      <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: 24, zIndex: 1 }}>
        Tea Sampling Tool &copy; {new Date().getFullYear()}
      </p>
    </div>
  );
}
