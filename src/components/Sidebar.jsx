import { supabase } from '../lib/supabase';
import S from '../S';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: '⊞' },
  { id: 'todos',     label: 'To-Do Lists', icon: '✓' },
  { id: 'calendar',  label: 'Calendar',    icon: '◫' },
  { id: 'finances',  label: 'Finances',    icon: '◈' },
  { id: 'goals',     label: 'Goals',       icon: '◎' },
];

export default function Sidebar({ page, setPage }) {
  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <div style={S.sidebar}>
      <div style={S.sidebarLogo}>ADHism</div>
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
