import { supabase } from '../lib/supabase';
import S from '../S';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: '⊞' },
  { id: 'todos',     label: 'To-Do Lists', icon: '✓' },
  { id: 'calendar',  label: 'Calendar',    icon: '◫' },
  { id: 'finances',  label: 'Finances',    icon: '◈' },
  { id: 'goals',     label: 'Goals',       icon: '◎' },
];

export default function Sidebar({ page, setPage, isMobile, sidebarOpen, setSidebarOpen }) {
  async function signOut() {
    await supabase.auth.signOut();
  }

  const mobileStyle = isMobile ? {
    position: 'fixed',
    top: 0,
    left: 0,
    height: '100%',
    zIndex: 100,
    transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
    transition: 'transform 0.25s ease',
    boxShadow: sidebarOpen ? '4px 0 20px rgba(0,0,0,0.12)' : 'none',
  } : {};

  return (
    <div style={{ ...S.sidebar, ...mobileStyle }}>
      <div style={{ ...S.sidebarLogo, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span>ADHism</span>
        {isMobile && (
          <button
            onClick={() => setSidebarOpen(false)}
            style={{ background:'none', border:'none', cursor:'pointer', fontSize:18, color:'#b0adb8', padding:'0 4px', lineHeight:1 }}
          >
            ✕
          </button>
        )}
      </div>
      <nav style={S.sidebarNav}>
        {NAV.map((item) => (
          <button
            key={item.id}
            style={S.navItem(page === item.id)}
            onClick={() => setPage(item.id)}
          >
            <span style={{ fontSize: 16 }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
      <div style={S.sidebarBottom}>
        <button style={S.navItem(false)} onClick={signOut}>
          <span style={{ fontSize: 16 }}>→</span>
          Sign Out
        </button>
      </div>
    </div>
  );
}
