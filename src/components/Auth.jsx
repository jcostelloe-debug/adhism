import { useState } from 'react';
import { supabase } from '../lib/supabase';
import S from '../S';

export default function Auth() {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } },
      });
      if (error) setError(error.message);
      else setMessage('Check your email to confirm your account.');
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    }

    setLoading(false);
  }

  return (
    <div style={S.authWrap}>
      <div style={S.authCard}>
        <div style={S.authTitle}>ADHism</div>
        <div style={S.authSub}>
          {mode === 'login' ? 'Sign in to your account' : 'Create your account'}
        </div>

        {error && <div style={S.authError}>{error}</div>}
        {message && (
          <div style={{ ...S.authError, backgroundColor: '#0f2d1a', borderColor: '#1a5c30', color: '#4ade80' }}>
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div style={S.authField}>
              <label style={S.authLabel}>Name</label>
              <input
                style={S.authInput}
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          )}
          <div style={S.authField}>
            <label style={S.authLabel}>Email</label>
            <input
              style={S.authInput}
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div style={S.authField}>
            <label style={S.authLabel}>Password</label>
            <input
              style={S.authInput}
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button style={S.authBtn} type="submit" disabled={loading}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div style={S.authToggle}>
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button style={S.authToggleBtn} onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}>
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}
