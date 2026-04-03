import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import S from '../S';

const GOAL_COLORS  = ['#a78bfa','#60a5fa','#4ade80','#fb923c','#f472b6','#facc15','#34d399'];
const CATEGORIES   = ['Personal','Health','Career','Financial','Learning','Relationships','Creative','Other'];
const STATUSES     = ['active','paused','completed'];
const FILTERS      = ['All','Active','Paused','Completed'];

const SIZE_META = {
  short:  { label: 'Short-term',  sub: 'Days to weeks',    icon: '⚡' },
  medium: { label: 'Medium-term', sub: '1–6 months',       icon: '🎯' },
  long:   { label: 'Long-term',   sub: '6 months or more', icon: '🏔️' },
};

function daysLeft(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date(new Date().toDateString())) / 86400000);
}

function formatDaysLeft(d) {
  if (d === null) return null;
  if (d < 0)  return `${Math.abs(d)}d overdue`;
  if (d === 0) return 'Due today';
  if (d === 1) return '1 day left';
  if (d < 30) return `${d} days left`;
  if (d < 365) return `${Math.round(d / 30)}mo left`;
  return `${(d / 365).toFixed(1)}yr left`;
}

// ─── Goal Card ────────────────────────────────────────────────────────────────

function GoalCard({ goal, milestones, onToggleMilestone, onAddMilestone, onDeleteMilestone, onSetStatus, onDelete }) {
  const [expanded, setExpanded]     = useState(false);
  const [msInput, setMsInput]       = useState('');
  const [showMsForm, setShowMsForm] = useState(false);

  const ms      = milestones[goal.id] || [];
  const done    = ms.filter(m => m.done).length;
  const total   = ms.length;
  const pct     = goal.status === 'completed' ? 100 : total > 0 ? Math.round((done / total) * 100) : 0;
  const days    = daysLeft(goal.target_date);
  const urgent  = days !== null && days <= 7 && goal.status === 'active';

  async function submitMilestone() {
    const t = msInput.trim();
    if (!t) return;
    setMsInput('');
    await onAddMilestone(goal.id, t);
  }

  return (
    <div style={S.goalCard(goal.color, expanded)} onClick={() => setExpanded(v => !v)}>
      <div style={S.goalCardAccent(goal.color)} />
      <div style={S.goalCardBody}>
        <div style={S.goalCardTop}>
          <div style={S.goalTitle}>{goal.title}</div>
          <span style={S.statusBadge(goal.status)}>{goal.status}</span>
        </div>

        <div style={S.goalBadgeRow}>
          <span style={S.categoryBadge}>{goal.category}</span>
        </div>

        {goal.description && (
          <div style={{ fontSize: 12, color: '#666677', marginBottom: 8, lineHeight: 1.5 }}>
            {goal.description}
          </div>
        )}

        {days !== null && (
          <div style={S.goalDaysLeft(urgent)}>
            {urgent && '⚠ '}{formatDaysLeft(days)}
            {goal.target_date && ` · ${new Date(goal.target_date).toLocaleDateString('en-AU', { day:'numeric', month:'short', year:'numeric' })}`}
          </div>
        )}

        <div style={S.progressWrap}>
          <div style={S.progressFill(pct, goal.color)} />
        </div>

        <div style={S.goalMilestoneCount}>
          {goal.status === 'completed'
            ? '✓ Completed'
            : total > 0
              ? `${done} / ${total} milestones · ${pct}%`
              : 'No milestones yet — click to add'}
        </div>
      </div>

      {/* Expanded milestones */}
      {expanded && (
        <div style={S.goalExpanded} onClick={e => e.stopPropagation()}>
          {ms.length > 0 && ms.map(m => (
            <div key={m.id} style={S.milestoneItem(m.done)} onClick={() => onToggleMilestone(goal.id, m)}>
              <div style={S.milestoneCheck(m.done)}>
                {m.done && <span style={{ color:'#fff', fontSize:10, fontWeight:700 }}>✓</span>}
              </div>
              <span style={S.milestoneText(m.done)}>{m.title}</span>
              <span
                style={{ fontSize:15, color:'#333344', cursor:'pointer', padding:'0 4px' }}
                onClick={e => { e.stopPropagation(); onDeleteMilestone(goal.id, m.id); }}
              >×</span>
            </div>
          ))}

          {showMsForm ? (
            <div style={{ display:'flex', gap:8, marginTop:10 }}>
              <input
                style={{ ...S.input, flex:1, fontSize:13 }}
                placeholder="Milestone title…"
                value={msInput}
                onChange={e => setMsInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submitMilestone(); if (e.key === 'Escape') setShowMsForm(false); }}
                autoFocus
                onClick={e => e.stopPropagation()}
              />
              <button style={S.btnPrimary} onClick={e => { e.stopPropagation(); submitMilestone(); }}>Add</button>
              <button style={S.btnGhost} onClick={e => { e.stopPropagation(); setShowMsForm(false); }}>✕</button>
            </div>
          ) : (
            <button
              style={{ ...S.btnGhost, fontSize:12, marginTop:10, width:'100%' }}
              onClick={e => { e.stopPropagation(); setShowMsForm(true); }}
            >
              + Add Milestone
            </button>
          )}

          <div style={S.goalActionRow}>
            {STATUSES.filter(s => s !== goal.status).map(s => (
              <button
                key={s}
                style={S.goalActionBtn(s === 'completed' ? '#4ade80' : s === 'paused' ? '#fb923c' : '#a78bfa')}
                onClick={e => { e.stopPropagation(); onSetStatus(goal.id, s); }}
              >
                Mark {s}
              </button>
            ))}
            <button
              style={S.goalActionBtn('#f87171')}
              onClick={e => { e.stopPropagation(); onDelete(goal.id); }}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

function GoalSection({ size, goals, milestones, filter, ...handlers }) {
  const [collapsed, setCollapsed] = useState(false);
  const meta = SIZE_META[size];

  const visible = goals.filter(g => {
    if (filter === 'All') return true;
    return g.status === filter.toLowerCase();
  });

  if (visible.length === 0) return null;

  return (
    <div style={S.goalSection}>
      <div style={S.goalSectionHeader} onClick={() => setCollapsed(v => !v)}>
        <span style={{ fontSize: 16 }}>{meta.icon}</span>
        <span style={S.goalSectionTitle}>{meta.label}</span>
        <span style={{ fontSize:11, color:'#444455' }}>{meta.sub}</span>
        <span style={S.goalSectionCount}>{visible.length}</span>
        <span style={S.goalSectionToggle}>{collapsed ? '▶' : '▼'}</span>
      </div>

      {!collapsed && (
        <div style={S.goalGrid}>
          {visible.map(goal => (
            <GoalCard
              key={goal.id}
              goal={goal}
              milestones={milestones}
              {...handlers}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Add Goal Form ────────────────────────────────────────────────────────────

function AddGoalForm({ onSave, onCancel }) {
  const [form, setForm] = useState({
    title: '', description: '', category: 'Personal',
    size: 'medium', color: GOAL_COLORS[0], target_date: '', status: 'active',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div style={{ ...S.addFormBox, marginTop: 0 }}>
      <div style={{ fontSize:12, fontWeight:700, color:'#666677', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:14 }}>New Goal</div>

      <div style={{ marginBottom: 10 }}>
        <label style={S.fieldLabel}>Title</label>
        <input style={S.input} placeholder="What do you want to achieve?" value={form.title} onChange={e => set('title', e.target.value)} />
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={S.fieldLabel}>Description (optional)</label>
        <textarea
          style={{ ...S.input, resize:'none', height:60, fontSize:13 }}
          placeholder="Why does this matter to you?"
          value={form.description}
          onChange={e => set('description', e.target.value)}
        />
      </div>

      <div style={S.twoCol}>
        <div>
          <label style={S.fieldLabel}>Category</label>
          <select style={{ ...S.input, cursor:'pointer' }} value={form.category} onChange={e => set('category', e.target.value)}>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={S.fieldLabel}>Size</label>
          <select style={{ ...S.input, cursor:'pointer' }} value={form.size} onChange={e => set('size', e.target.value)}>
            <option value="short">Short-term (days–weeks)</option>
            <option value="medium">Medium-term (1–6 months)</option>
            <option value="long">Long-term (6+ months)</option>
          </select>
        </div>
      </div>

      <div style={S.twoCol}>
        <div>
          <label style={S.fieldLabel}>Target Date (optional)</label>
          <input type="date" style={{ ...S.dateInput, width:'100%' }} value={form.target_date} onChange={e => set('target_date', e.target.value)} />
        </div>
        <div>
          <label style={S.fieldLabel}>Status</label>
          <select style={{ ...S.input, cursor:'pointer' }} value={form.status} onChange={e => set('status', e.target.value)}>
            {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
          </select>
        </div>
      </div>

      <label style={S.fieldLabel}>Colour</label>
      <div style={{ display:'flex', gap:8, marginBottom:16 }}>
        {GOAL_COLORS.map(c => (
          <div key={c} onClick={() => set('color', c)} style={{ width:18, height:18, borderRadius:'50%', backgroundColor:c, cursor:'pointer', border: form.color===c ? '2px solid #fff' : '2px solid transparent' }} />
        ))}
      </div>

      <div style={{ display:'flex', gap:8 }}>
        <button style={S.btnPrimary} onClick={() => onSave(form)}>Save Goal</button>
        <button style={S.btnGhost} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Goals({ user }) {
  const [goals, setGoals]           = useState([]);
  const [milestones, setMilestones] = useState({}); // { goal_id: [milestone, ...] }
  const [filter, setFilter]         = useState('All');
  const [adding, setAdding]         = useState(false);

  const load = useCallback(async () => {
    const [{ data: g }, { data: m }] = await Promise.all([
      supabase.from('goals').select('*').eq('user_id', user.id).order('created_at'),
      supabase.from('goal_milestones').select('*').eq('user_id', user.id).order('created_at'),
    ]);
    if (g) setGoals(g);
    if (m) {
      const grouped = {};
      for (const ms of m) {
        if (!grouped[ms.goal_id]) grouped[ms.goal_id] = [];
        grouped[ms.goal_id].push(ms);
      }
      setMilestones(grouped);
    }
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  async function saveGoal(form) {
    if (!form.title.trim()) return;
    const row = { user_id: user.id, title: form.title.trim(), description: form.description.trim() || null, category: form.category, size: form.size, color: form.color, target_date: form.target_date || null, status: form.status };
    const { data } = await supabase.from('goals').insert(row).select().single();
    if (data) { setGoals(prev => [...prev, data]); setAdding(false); }
  }

  async function onAddMilestone(goalId, title) {
    const row = { user_id: user.id, goal_id: goalId, title, done: false };
    const { data } = await supabase.from('goal_milestones').insert(row).select().single();
    if (data) setMilestones(prev => ({ ...prev, [goalId]: [...(prev[goalId] || []), data] }));
  }

  async function onToggleMilestone(goalId, ms) {
    const updated = { ...ms, done: !ms.done };
    setMilestones(prev => ({ ...prev, [goalId]: prev[goalId].map(m => m.id === ms.id ? updated : m) }));
    await supabase.from('goal_milestones').update({ done: updated.done }).eq('id', ms.id);
  }

  async function onDeleteMilestone(goalId, msId) {
    setMilestones(prev => ({ ...prev, [goalId]: prev[goalId].filter(m => m.id !== msId) }));
    await supabase.from('goal_milestones').delete().eq('id', msId);
  }

  async function onSetStatus(goalId, status) {
    setGoals(prev => prev.map(g => g.id === goalId ? { ...g, status } : g));
    await supabase.from('goals').update({ status }).eq('id', goalId);
  }

  async function onDelete(goalId) {
    if (!confirm('Delete this goal and all its milestones?')) return;
    setGoals(prev => prev.filter(g => g.id !== goalId));
    setMilestones(prev => { const n = { ...prev }; delete n[goalId]; return n; });
    await supabase.from('goals').delete().eq('id', goalId);
  }

  const handlers = { onToggleMilestone, onAddMilestone, onDeleteMilestone, onSetStatus, onDelete };

  const short  = goals.filter(g => g.size === 'short');
  const medium = goals.filter(g => g.size === 'medium');
  const long   = goals.filter(g => g.size === 'long');

  const hasAny = ['short','medium','long'].some(size =>
    goals.filter(g => g.size === size && (filter === 'All' || g.status === filter.toLowerCase())).length > 0
  );

  return (
    <div style={S.goalsPage}>
      {/* Filter bar */}
      <div style={S.goalsFilterBar}>
        <div style={{ display:'flex' }}>
          {FILTERS.map(f => (
            <button key={f} style={S.financesTab(filter === f)} onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>
        <button style={{ ...S.btnPrimary, fontSize:13, padding:'7px 16px' }} onClick={() => setAdding(v => !v)}>
          {adding ? '✕ Cancel' : '+ New Goal'}
        </button>
      </div>

      <div style={S.goalsContent}>
        {adding && (
          <div style={{ marginBottom: 24 }}>
            <AddGoalForm onSave={saveGoal} onCancel={() => setAdding(false)} />
          </div>
        )}

        {!hasAny && !adding && (
          <div style={{ ...S.emptyState, paddingTop: 80 }}>
            <div style={{ fontSize:32, marginBottom:12 }}>🎯</div>
            <div style={{ fontSize:16, color:'#666677', marginBottom:6 }}>No goals yet</div>
            <div style={{ fontSize:13, color:'#444455' }}>Hit "+ New Goal" to get started</div>
          </div>
        )}

        <GoalSection size="short"  goals={short}  milestones={milestones} filter={filter} {...handlers} />
        <GoalSection size="medium" goals={medium} milestones={milestones} filter={filter} {...handlers} />
        <GoalSection size="long"   goals={long}   milestones={milestones} filter={filter} {...handlers} />
      </div>
    </div>
  );
}
