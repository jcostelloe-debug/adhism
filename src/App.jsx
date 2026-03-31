import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import Auth from './components/Auth';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Todos from './pages/Todos';
import Calendar from './pages/Calendar';
import Placeholder from './pages/Placeholder';
import S from './S';

function formatDate(d) {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

const PAGE_TITLES = {
  dashboard: 'Dashboard',
  todos:     'To-Do Lists',
  calendar:  'Calendar',
  finances:  'Finances',
  goals:     'Goals',
};

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState('dashboard');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div style={{ ...S.authWrap }}>
        <div style={{ color: '#666677', fontSize: 14 }}>Loading…</div>
      </div>
    );
  }

  if (!session) return <Auth />;

  const user = session.user;
  const initials = (user.user_metadata?.full_name || user.email || '?')
    .split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  function renderPage() {
    switch (page) {
      case 'dashboard': return <Dashboard user={user} />;
      case 'todos':     return <Todos user={user} />;
      case 'calendar':  return <Calendar user={user} />;
      case 'finances':  return <Placeholder title="Finances" />;
      case 'goals':     return <Placeholder title="Goals" />;
      default:          return <Dashboard user={user} />;
    }
  }

  return (
    <div style={S.app}>
      <Sidebar page={page} setPage={setPage} />
      <div style={S.main}>
        <div style={S.topbar}>
          <div>
            <div style={S.topbarTitle}>{PAGE_TITLES[page]}</div>
            <div style={S.topbarDate}>{formatDate(new Date())}</div>
          </div>
          <div style={S.userBadge}>
            <span>{user.user_metadata?.full_name || user.email}</span>
            <div style={S.avatar}>{initials}</div>
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {renderPage()}
        </div>
      </div>
    </div>
  );
}
