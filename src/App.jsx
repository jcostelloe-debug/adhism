import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import Auth from './components/Auth';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Todos from './pages/Todos';
import Calendar from './pages/Calendar';
import Finances from './pages/Finances';
import Goals from './pages/Goals';
import Placeholder from './pages/Placeholder';
import UpdateBanner from './components/UpdateBanner';
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

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

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
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
      case 'finances':  return <Finances user={user} />;
      case 'goals':     return <Goals user={user} />;
      default:          return <Dashboard user={user} />;
    }
  }

  return (
    <div style={S.app}>
      <UpdateBanner />
      <Sidebar
        page={page}
        setPage={(p) => { setPage(p); if (isMobile) setSidebarOpen(false); }}
        isMobile={isMobile}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />
      {/* Backdrop for mobile drawer */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.3)', zIndex:99 }}
        />
      )}
      <div style={S.main}>
        <div style={S.topbar}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            {isMobile && (
              <button
                onClick={() => setSidebarOpen(o => !o)}
                style={{ background:'none', border:'none', cursor:'pointer', padding:'4px 6px', borderRadius:8, fontSize:20, color:'#6d5fc7', lineHeight:1 }}
              >
                ☰
              </button>
            )}
            <div>
              <div style={S.topbarTitle}>{PAGE_TITLES[page]}</div>
              <div style={S.topbarDate}>{formatDate(new Date())}</div>
            </div>
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
