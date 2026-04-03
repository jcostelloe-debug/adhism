import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { db, queueMutation } from '../lib/db';
import S from '../S';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AUD = (n) => `$${Number(Math.abs(n)).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const toMonthStr = (y, m) => `${y}-${String(m + 1).padStart(2, '0')}`;

const GOAL_COLORS  = ['#a78bfa','#60a5fa','#4ade80','#fb923c','#f472b6','#facc15'];
const BILL_COLORS  = ['#a78bfa','#60a5fa','#4ade80','#fb923c','#f472b6','#facc15','#34d399'];
const BILL_CATS    = ['Housing','Utilities','Telecom','Insurance','Transport','Subscription','Food','Health','Other'];

const CAT_COLORS = {
  Groceries:'#4ade80', Transport:'#60a5fa', Dining:'#fb923c', Utilities:'#facc15',
  Telecom:'#a78bfa', Streaming:'#f472b6', Shopping:'#34d399', Health:'#ef4444',
  Insurance:'#94a3b8', Other:'#555566',
};

// ─── CSV parsing ──────────────────────────────────────────────────────────────

function parseCSVRow(line) {
  const result = []; let cur = ''; let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  result.push(cur.trim());
  return result;
}

function parseDate(s) {
  if (!s) return null;
  let m;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return s;
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  return null;
}

const KWS = {
  Groceries:  ['woolworths','coles','aldi','iga','foodworks','harris farm','costco'],
  Transport:  ['uber','taxi','bp ','shell','caltex','ampol','7-eleven','petrol','translink','opal','myki'],
  Dining:     ['mcdonald','kfc','domino','pizza','cafe','restaurant',' bar ',' pub ','hungry jack','subway','grill','burger'],
  Utilities:  ['agl','origin energy','synergy','horizon','water corp','council','ausgrid','energex','powercor'],
  Telecom:    ['telstra','optus','vodafone','boost mobile','amaysim','aussie broadband','exetel','iinet','tpg','dodo'],
  Streaming:  ['netflix','spotify','stan ','disney+','youtube premium','apple tv','binge','foxtel','paramount'],
  Shopping:   ['amazon','kmart','target','big w','myer','david jones','cotton on','ikea','ebay'],
  Health:     ['chemist warehouse','priceline','pharmacy','medicare','hospital','dental','gym','fitness'],
  Insurance:  ['aami','nrma','budget direct','allianz','suncorp','racq','racv','gio'],
};

function categorize(desc) {
  const d = desc.toLowerCase();
  for (const [cat, kws] of Object.entries(KWS)) {
    if (kws.some(k => d.includes(k))) return cat;
  }
  return 'Other';
}

function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const cols = lines[0].toLowerCase().replace(/"/g, '').split(',').map(c => c.trim());

  const dateIdx   = Math.max(0, cols.findIndex(c => c.includes('date')));
  const descIdx   = cols.findIndex(c => ['description','details','narration','particulars','merchant name'].some(k => c.includes(k)));
  const debitIdx  = cols.findIndex(c => ['debit','withdrawal'].includes(c));
  const creditIdx = cols.findIndex(c => ['credit','deposit'].includes(c));
  const amtIdx    = cols.findIndex(c => c === 'amount');

  const txns = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVRow(lines[i]);
    if (!row || row.length < 2) continue;
    let amount = 0;
    if (debitIdx !== -1 && creditIdx !== -1) {
      const d = parseFloat(row[debitIdx]?.replace(/[^0-9.-]/g,'') || '0') || 0;
      const c = parseFloat(row[creditIdx]?.replace(/[^0-9.-]/g,'') || '0') || 0;
      amount = c > 0 ? c : -d;
    } else if (amtIdx !== -1) {
      amount = parseFloat(row[amtIdx]?.replace(/[^0-9.-]/g,'') || '0') || 0;
    }
    const date = parseDate(row[dateIdx]?.replace(/"/g,'').trim());
    const description = row[descIdx >= 0 ? descIdx : 1]?.replace(/"/g,'').trim() || '';
    if (!date || isNaN(amount) || !description) continue;
    txns.push({ date, description, amount, category: categorize(description) });
  }
  return txns;
}

function analyseTransactions(transactions) {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90);
  const recent = transactions.filter(t => new Date(t.date) >= cutoff);
  const expenses = recent.filter(t => t.amount < 0);
  const income   = recent.filter(t => t.amount > 0);

  const monthlyByCategory = {};
  for (const t of expenses) {
    monthlyByCategory[t.category] = (monthlyByCategory[t.category] || 0) + Math.abs(t.amount) / 3;
  }

  const avgWeeklyIncome = income.reduce((s, t) => s + t.amount, 0) / (90 / 7);

  const tips = [];
  if ((monthlyByCategory['Telecom'] || 0) > 100)
    tips.push({ icon: '📡', text: `Telecom averaging ${AUD(monthlyByCategory['Telecom'])}/month. Comparable Australian plans start from $40–60 — worth a call to your provider.` });

  const streamTx = expenses.filter(t => t.category === 'Streaming');
  const services = new Set(streamTx.map(t => t.description.split(' ')[0].toLowerCase()));
  if (services.size >= 3)
    tips.push({ icon: '📺', text: `${services.size} streaming services detected. Rotating monthly instead of stacking could save $20–40/month.` });

  if ((monthlyByCategory['Dining'] || 0) > 500)
    tips.push({ icon: '🍔', text: `Dining & takeaway at ${AUD(monthlyByCategory['Dining'])}/month. Meal prepping 3 days/week typically cuts this by 25–30%.` });

  if ((monthlyByCategory['Shopping'] || 0) > 400)
    tips.push({ icon: '🛍️', text: `Retail/online shopping at ${AUD(monthlyByCategory['Shopping'])}/month. A 48-hour rule before non-essential purchases reduces impulse spending.` });

  const top = Object.entries(monthlyByCategory).sort((a,b) => b[1]-a[1]);
  if (top.length > 0)
    tips.push({ icon: '📊', text: `Biggest expense category: ${top[0][0]} at ${AUD(top[0][1])}/month.` });

  if (!tips.length)
    tips.push({ icon: '✅', text: 'No major spending red flags detected based on your statements.' });

  return { monthlyByCategory, avgWeeklyIncome, tips };
}

// ─── Bills Tab ────────────────────────────────────────────────────────────────

function BillsTab({ user, online }) {
  const today = new Date();
  const [viewYear, setViewYear]   = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [bills, setBills]         = useState([]);
  const [paidIds, setPaidIds]     = useState(new Set());
  const [adding, setAdding]       = useState(false);
  const [form, setForm] = useState({ name:'', amount:'', due_day:'', category:'Other', color: BILL_COLORS[0] });

  const monthStr = toMonthStr(viewYear, viewMonth);

  const load = useCallback(async () => {
    const { data: b } = await supabase.from('bills').select('*').eq('user_id', user.id).order('due_day');
    const { data: p } = await supabase.from('bill_payments').select('bill_id').eq('user_id', user.id).eq('month', monthStr);
    if (b) setBills(b);
    if (p) setPaidIds(new Set(p.map(x => x.bill_id)));
  }, [user.id, monthStr]);

  useEffect(() => { load(); }, [load]);

  async function togglePaid(bill) {
    if (paidIds.has(bill.id)) {
      setPaidIds(prev => { const s = new Set(prev); s.delete(bill.id); return s; });
      await supabase.from('bill_payments').delete().eq('bill_id', bill.id).eq('month', monthStr);
    } else {
      setPaidIds(prev => new Set(prev).add(bill.id));
      await supabase.from('bill_payments').insert({ user_id: user.id, bill_id: bill.id, month: monthStr });
    }
  }

  async function addBill() {
    if (!form.name.trim() || !form.amount) return;
    const row = { user_id: user.id, name: form.name.trim(), amount: parseFloat(form.amount), due_day: parseInt(form.due_day) || null, category: form.category, color: form.color };
    const { data } = await supabase.from('bills').insert(row).select().single();
    if (data) { setBills(prev => [...prev, data]); setAdding(false); setForm({ name:'', amount:'', due_day:'', category:'Other', color: BILL_COLORS[0] }); }
  }

  async function deleteBill(id) {
    setBills(prev => prev.filter(b => b.id !== id));
    await supabase.from('bills').delete().eq('id', id);
  }

  function prevMonth() { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y-1); } else setViewMonth(m => m-1); }
  function nextMonth() { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y+1); } else setViewMonth(m => m+1); }

  const totalMonthly = bills.reduce((s, b) => s + Number(b.amount), 0);
  const totalPaid    = bills.filter(b => paidIds.has(b.id)).reduce((s, b) => s + Number(b.amount), 0);

  return (
    <div style={S.financesContent}>
      {/* Summary */}
      <div style={S.financesSummaryRow}>
        <div style={S.statCard}><div style={S.statLabel}>Monthly Total</div><div style={S.statValue}>{AUD(totalMonthly)}</div></div>
        <div style={S.statCard}><div style={S.statLabel}>Paid</div><div style={{ ...S.statValue, color: '#4ade80' }}>{AUD(totalPaid)}</div></div>
        <div style={S.statCard}><div style={S.statLabel}>Remaining</div><div style={{ ...S.statValue, color: '#fb923c' }}>{AUD(totalMonthly - totalPaid)}</div></div>
      </div>

      {/* Month nav */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#f0f0f5' }}>{MONTH_NAMES[viewMonth]} {viewYear}</div>
        <div style={{ display:'flex', gap: 8 }}>
          <button style={S.calendarNavBtn} onClick={prevMonth}>‹</button>
          <button style={S.calendarNavBtn} onClick={nextMonth}>›</button>
        </div>
      </div>

      {/* Bill list */}
      {bills.length === 0 && <div style={S.emptyState}>No bills yet — add one below</div>}
      {bills.sort((a,b) => (a.due_day||99) - (b.due_day||99)).map(bill => (
        <div
          key={bill.id}
          style={S.billRow(paidIds.has(bill.id))}
          onMouseEnter={e => { const d = e.currentTarget.querySelector('[data-del]'); if (d) d.style.opacity='1'; }}
          onMouseLeave={e => { const d = e.currentTarget.querySelector('[data-del]'); if (d) d.style.opacity='0'; }}
        >
          <div style={{ ...S.listDot(bill.color), width:10, height:10 }} />
          <div style={{ flex:1 }}>
            <div style={S.billName}>{bill.name}</div>
            <div style={S.billMeta}>{bill.category}{bill.due_day ? ` · due ${bill.due_day}${['th','st','nd','rd'][bill.due_day <= 3 ? bill.due_day : 0]}` : ''}</div>
          </div>
          <div style={S.billAmount(paidIds.has(bill.id))}>{AUD(bill.amount)}</div>
          <div style={S.paidToggle(paidIds.has(bill.id))} onClick={() => togglePaid(bill)}>
            {paidIds.has(bill.id) && <span style={{ color:'#0f0f13', fontSize:12, fontWeight:700 }}>✓</span>}
          </div>
          <span data-del style={{ ...S.todoDelete, opacity:0 }} onClick={() => deleteBill(bill.id)}>×</span>
        </div>
      ))}

      {/* Add bill */}
      {!adding
        ? <button style={{ ...S.btnGhost, marginTop: 8 }} onClick={() => setAdding(true)}>+ Add Bill</button>
        : (
          <div style={S.addFormBox}>
            <div style={{ fontSize:12, fontWeight:700, color:'#666677', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:12 }}>New Recurring Bill</div>
            <div style={S.twoCol}>
              <div>
                <label style={S.fieldLabel}>Name</label>
                <input style={S.input} placeholder="e.g. Rent" value={form.name} onChange={e => setForm(f => ({...f, name:e.target.value}))} />
              </div>
              <div>
                <label style={S.fieldLabel}>Amount (AUD)</label>
                <input style={S.input} type="number" placeholder="0.00" value={form.amount} onChange={e => setForm(f => ({...f, amount:e.target.value}))} />
              </div>
            </div>
            <div style={S.twoCol}>
              <div>
                <label style={S.fieldLabel}>Due Day of Month</label>
                <input style={S.input} type="number" min="1" max="31" placeholder="e.g. 15" value={form.due_day} onChange={e => setForm(f => ({...f, due_day:e.target.value}))} />
              </div>
              <div>
                <label style={S.fieldLabel}>Category</label>
                <select style={{ ...S.input, cursor:'pointer' }} value={form.category} onChange={e => setForm(f => ({...f, category:e.target.value}))}>
                  {BILL_CATS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <label style={S.fieldLabel}>Colour</label>
            <div style={{ display:'flex', gap:8, marginBottom:14 }}>
              {BILL_COLORS.map(c => (
                <div key={c} onClick={() => setForm(f => ({...f, color:c}))} style={{ width:18, height:18, borderRadius:'50%', backgroundColor:c, cursor:'pointer', border: form.color===c ? '2px solid #fff' : '2px solid transparent' }} />
              ))}
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button style={S.btnPrimary} onClick={addBill}>Save Bill</button>
              <button style={S.btnGhost} onClick={() => setAdding(false)}>Cancel</button>
            </div>
          </div>
        )}
    </div>
  );
}

// ─── Savings Tab ──────────────────────────────────────────────────────────────

function SavingsTab({ user, bills, avgWeeklyIncome }) {
  const [goals, setGoals]           = useState([]);
  const [weeklyTarget, setWeeklyTarget] = useState(() => parseFloat(localStorage.getItem('adhism_weekly_target') || '0'));
  const [editingWeekly, setEditingWeekly] = useState(false);
  const [weeklyInput, setWeeklyInput]     = useState('');
  const [adding, setAdding]   = useState(false);
  const [addingFunds, setAddingFunds] = useState(null);
  const [fundsInput, setFundsInput]   = useState('');
  const [form, setForm] = useState({ name:'', target:'', saved:'', target_date:'', color: GOAL_COLORS[0] });

  useEffect(() => {
    supabase.from('savings_goals').select('*').eq('user_id', user.id).order('created_at')
      .then(({ data }) => { if (data) setGoals(data); });
  }, [user.id]);

  async function addGoal() {
    if (!form.name.trim() || !form.target) return;
    const row = { user_id: user.id, name: form.name.trim(), target: parseFloat(form.target), saved: parseFloat(form.saved) || 0, target_date: form.target_date || null, color: form.color };
    const { data } = await supabase.from('savings_goals').insert(row).select().single();
    if (data) { setGoals(prev => [...prev, data]); setAdding(false); setForm({ name:'', target:'', saved:'', target_date:'', color: GOAL_COLORS[0] }); }
  }

  async function addFunds(goal) {
    const amt = parseFloat(fundsInput);
    if (!amt || isNaN(amt)) return;
    const newSaved = Number(goal.saved) + amt;
    const { data } = await supabase.from('savings_goals').update({ saved: newSaved }).eq('id', goal.id).select().single();
    if (data) setGoals(prev => prev.map(g => g.id === goal.id ? data : g));
    setAddingFunds(null); setFundsInput('');
  }

  async function deleteGoal(id) {
    setGoals(prev => prev.filter(g => g.id !== id));
    await supabase.from('savings_goals').delete().eq('id', id);
  }

  function saveWeeklyTarget() {
    const v = parseFloat(weeklyInput) || 0;
    setWeeklyTarget(v);
    localStorage.setItem('adhism_weekly_target', v);
    setEditingWeekly(false);
  }

  const weeklyBills    = bills.reduce((s, b) => s + Number(b.amount), 0) / 4.33;
  const dailySpendLimit = avgWeeklyIncome > 0
    ? Math.max(0, (avgWeeklyIncome - weeklyTarget - weeklyBills) / 7)
    : weeklyTarget > 0 ? null : null;

  return (
    <div style={S.financesContent}>
      {/* Weekly savings card */}
      <div style={S.weeklyCard}>
        <div style={S.weeklyCardTitle}>Weekly Savings Budget</div>
        {editingWeekly ? (
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <input style={{ ...S.input, width:140 }} type="number" placeholder="e.g. 100" value={weeklyInput} onChange={e => setWeeklyInput(e.target.value)} onKeyDown={e => e.key==='Enter' && saveWeeklyTarget()} autoFocus />
            <button style={S.btnPrimary} onClick={saveWeeklyTarget}>Save</button>
            <button style={S.btnGhost} onClick={() => setEditingWeekly(false)}>Cancel</button>
          </div>
        ) : (
          <>
            {weeklyTarget > 0 ? (
              <>
                <div style={S.dailyBudgetAmt}>{AUD(dailySpendLimit ?? weeklyTarget / 7)}<span style={{ fontSize:16, fontWeight:400, color:'#7c6faa' }}>/day</span></div>
                <div style={S.dailyBudgetSub}>
                  {dailySpendLimit !== null && avgWeeklyIncome > 0
                    ? `Max daily spend to save ${AUD(weeklyTarget)}/week after bills`
                    : `Upload statements to see your personalised daily spend limit`}
                </div>
                {avgWeeklyIncome > 0 && (
                  <div style={S.dailyBudgetRow}>
                    <div><div style={S.goalStatLabel}>Avg weekly income</div><div style={S.goalStatVal}>{AUD(avgWeeklyIncome)}</div></div>
                    <div><div style={S.goalStatLabel}>Weekly bills</div><div style={S.goalStatVal}>{AUD(weeklyBills)}</div></div>
                    <div><div style={S.goalStatLabel}>Weekly target</div><div style={S.goalStatVal}>{AUD(weeklyTarget)}</div></div>
                  </div>
                )}
              </>
            ) : (
              <div style={{ color:'#666677', fontSize:14 }}>Set a weekly savings target to see your daily spend limit.</div>
            )}
            <button style={{ ...S.btnGhost, marginTop:12, fontSize:12 }} onClick={() => { setEditingWeekly(true); setWeeklyInput(weeklyTarget || ''); }}>
              {weeklyTarget > 0 ? 'Change target' : 'Set weekly target'}
            </button>
          </>
        )}
      </div>

      {/* Goals */}
      <div style={{ ...S.sectionHeader, marginBottom: 16 }}>
        <div style={S.cardTitle}>Savings Goals</div>
      </div>

      {goals.length === 0 && <div style={S.emptyState}>No goals yet — add one below</div>}

      {goals.map(goal => {
        const pct       = Math.min(100, (Number(goal.saved) / Number(goal.target)) * 100);
        const remaining = Number(goal.target) - Number(goal.saved);
        const weeksLeft = goal.target_date ? Math.max(0, (new Date(goal.target_date) - new Date()) / (1000*60*60*24*7)) : null;
        const weeklyNeed = weeksLeft > 0 ? remaining / weeksLeft : null;

        return (
          <div key={goal.id} style={S.goalCard}
            onMouseEnter={e => { const d = e.currentTarget.querySelector('[data-del]'); if (d) d.style.opacity='1'; }}
            onMouseLeave={e => { const d = e.currentTarget.querySelector('[data-del]'); if (d) d.style.opacity='0'; }}
          >
            <div style={S.goalCardTop}>
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ ...S.listDot(goal.color), width:10, height:10 }} />
                  <span style={S.goalName}>{goal.name}</span>
                </div>
                <div style={{ fontSize:13, color:'#666677', marginTop:3 }}>{AUD(goal.saved)} of {AUD(goal.target)}</div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span style={S.goalPct(goal.color)}>{pct.toFixed(0)}%</span>
                <span data-del style={{ ...S.todoDelete, opacity:0 }} onClick={() => deleteGoal(goal.id)}>×</span>
              </div>
            </div>

            <div style={S.progressWrap}>
              <div style={S.progressFill(pct, goal.color)} />
            </div>

            <div style={S.goalStats}>
              {weeklyNeed !== null && (
                <div><div style={S.goalStatLabel}>Weekly needed</div><div style={S.goalStatVal}>{AUD(weeklyNeed)}</div></div>
              )}
              {weeksLeft !== null && (
                <div><div style={S.goalStatLabel}>Weeks left</div><div style={S.goalStatVal}>{Math.ceil(weeksLeft)}</div></div>
              )}
              {goal.target_date && (
                <div><div style={S.goalStatLabel}>Target date</div><div style={S.goalStatVal}>{new Date(goal.target_date).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'})}</div></div>
              )}
              <div><div style={S.goalStatLabel}>Still needed</div><div style={S.goalStatVal}>{AUD(Math.max(0,remaining))}</div></div>
            </div>

            {addingFunds === goal.id ? (
              <div style={{ display:'flex', gap:8, marginTop:12 }}>
                <input style={{ ...S.input, width:120 }} type="number" placeholder="Amount" value={fundsInput} onChange={e => setFundsInput(e.target.value)} onKeyDown={e => e.key==='Enter' && addFunds(goal)} autoFocus />
                <button style={S.btnPrimary} onClick={() => addFunds(goal)}>Add</button>
                <button style={S.btnGhost} onClick={() => setAddingFunds(null)}>Cancel</button>
              </div>
            ) : (
              <button style={{ ...S.btnGhost, fontSize:12, marginTop:12 }} onClick={() => { setAddingFunds(goal.id); setFundsInput(''); }}>+ Add Funds</button>
            )}
          </div>
        );
      })}

      {/* Add goal form */}
      {!adding
        ? <button style={{ ...S.btnGhost, marginTop: 8 }} onClick={() => setAdding(true)}>+ Add Goal</button>
        : (
          <div style={S.addFormBox}>
            <div style={{ fontSize:12, fontWeight:700, color:'#666677', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:12 }}>New Savings Goal</div>
            <div style={S.twoCol}>
              <div>
                <label style={S.fieldLabel}>Goal Name</label>
                <input style={S.input} placeholder="e.g. Emergency Fund" value={form.name} onChange={e => setForm(f => ({...f, name:e.target.value}))} />
              </div>
              <div>
                <label style={S.fieldLabel}>Target (AUD)</label>
                <input style={S.input} type="number" placeholder="5000" value={form.target} onChange={e => setForm(f => ({...f, target:e.target.value}))} />
              </div>
            </div>
            <div style={S.twoCol}>
              <div>
                <label style={S.fieldLabel}>Already Saved</label>
                <input style={S.input} type="number" placeholder="0.00" value={form.saved} onChange={e => setForm(f => ({...f, saved:e.target.value}))} />
              </div>
              <div>
                <label style={S.fieldLabel}>Target Date</label>
                <input style={{ ...S.dateInput, width:'100%' }} type="date" value={form.target_date} onChange={e => setForm(f => ({...f, target_date:e.target.value}))} />
              </div>
            </div>
            <label style={S.fieldLabel}>Colour</label>
            <div style={{ display:'flex', gap:8, marginBottom:14 }}>
              {GOAL_COLORS.map(c => (
                <div key={c} onClick={() => setForm(f => ({...f, color:c}))} style={{ width:18, height:18, borderRadius:'50%', backgroundColor:c, cursor:'pointer', border: form.color===c ? '2px solid #fff' : '2px solid transparent' }} />
              ))}
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button style={S.btnPrimary} onClick={addGoal}>Save Goal</button>
              <button style={S.btnGhost} onClick={() => setAdding(false)}>Cancel</button>
            </div>
          </div>
        )}
    </div>
  );
}

// ─── Statements Tab ───────────────────────────────────────────────────────────

function StatementsTab({ user, transactions, setTransactions }) {
  const fileRef     = useRef();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showAll, setShowAll]     = useState(false);

  useEffect(() => {
    supabase.from('transactions').select('*').eq('user_id', user.id).order('date', { ascending: false }).limit(500)
      .then(({ data }) => { if (data && data.length > 0) setTransactions(data); });
  }, [user.id, setTransactions]);

  async function processFile(file) {
    setUploading(true);
    const text = await file.text();
    const parsed = parseCSV(text);
    if (!parsed.length) { alert('Could not parse this CSV. Please export as CSV from your bank.'); setUploading(false); return; }
    const rows = parsed.map(t => ({ ...t, user_id: user.id }));
    const { data } = await supabase.from('transactions').insert(rows).select();
    if (data) setTransactions(prev => [...data, ...prev]);
    setUploading(false);
  }

  function onDrop(e) {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  async function clearTransactions() {
    if (!confirm('Delete all uploaded transactions?')) return;
    await supabase.from('transactions').delete().eq('user_id', user.id);
    setTransactions([]);
  }

  const { monthlyByCategory, avgWeeklyIncome, tips } = transactions.length > 0
    ? analyseTransactions(transactions)
    : { monthlyByCategory: {}, avgWeeklyIncome: 0, tips: [] };

  const sortedCats = Object.entries(monthlyByCategory).sort((a,b) => b[1]-a[1]);
  const maxCat     = sortedCats[0]?.[1] || 1;

  const displayed = showAll ? transactions : transactions.slice(0, 30);

  return (
    <div style={S.financesContent}>
      {/* Upload */}
      <div
        style={S.uploadBox(dragging)}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
      >
        <input ref={fileRef} type="file" accept=".csv" style={{ display:'none' }} onChange={e => e.target.files[0] && processFile(e.target.files[0])} />
        <div style={{ fontSize:28, marginBottom:8 }}>📂</div>
        <div style={S.uploadText}>{uploading ? 'Importing…' : 'Drop bank statement CSV here, or click to upload'}</div>
        <div style={S.uploadSub}>Supports CommBank, ANZ, Westpac, NAB, ING and most Australian bank CSV exports</div>
      </div>

      {transactions.length > 0 && (
        <>
          {/* Summary stats */}
          <div style={S.financesSummaryRow}>
            <div style={S.statCard}>
              <div style={S.statLabel}>Avg Weekly Income</div>
              <div style={{ ...S.statValue, color:'#4ade80' }}>{AUD(avgWeeklyIncome)}</div>
            </div>
            <div style={S.statCard}>
              <div style={S.statLabel}>Transactions</div>
              <div style={S.statValue}>{transactions.length}</div>
            </div>
            <div style={S.statCard}>
              <div style={S.statLabel}>Top Category</div>
              <div style={{ ...S.statValue, fontSize:16 }}>{sortedCats[0]?.[0] || '—'}</div>
            </div>
          </div>

          {/* Spending breakdown */}
          <div style={{ ...S.cardTitle, marginBottom:14 }}>Monthly Spending by Category</div>
          <div style={{ ...S.card, marginBottom:24 }}>
            {sortedCats.map(([cat, amt]) => (
              <div key={cat} style={S.categoryBarRow}>
                <div style={S.categoryBarLabel}>
                  <span>{cat}</span>
                  <span>{AUD(amt)}/mo avg</span>
                </div>
                <div style={S.progressWrap}>
                  <div style={S.progressFill((amt / maxCat) * 100, CAT_COLORS[cat] || '#555566')} />
                </div>
              </div>
            ))}
          </div>

          {/* Tips */}
          <div style={{ ...S.cardTitle, marginBottom:14 }}>Savings Tips</div>
          {tips.map((tip, i) => (
            <div key={i} style={S.tipCard}>
              <div style={S.tipIcon}>{tip.icon}</div>
              <div style={S.tipText}>{tip.text}</div>
            </div>
          ))}

          {/* Transactions */}
          <div style={{ ...S.sectionHeader, marginTop: 24, marginBottom:14 }}>
            <div style={S.cardTitle}>Recent Transactions</div>
            <button style={{ ...S.btnGhost, fontSize:12 }} onClick={clearTransactions}>Clear all</button>
          </div>
          <div style={S.card}>
            {displayed.map((t, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'9px 0', borderBottom: i < displayed.length-1 ? '1px solid #1a1a22' : 'none' }}>
                <div style={{ ...S.listDot(CAT_COLORS[t.category] || '#555566'), width:8, height:8, flexShrink:0 }} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, color:'#e0e0ec' }}>{t.description}</div>
                  <div style={{ fontSize:11, color:'#444455' }}>{t.date} · {t.category}</div>
                </div>
                <div style={{ fontSize:13, fontWeight:600, color: t.amount >= 0 ? '#4ade80' : '#f0f0f5' }}>
                  {t.amount >= 0 ? '+' : ''}{AUD(t.amount)}
                </div>
              </div>
            ))}
            {transactions.length > 30 && (
              <button style={{ ...S.btnGhost, width:'100%', marginTop:12, fontSize:13 }} onClick={() => setShowAll(v => !v)}>
                {showAll ? 'Show less' : `Show all ${transactions.length} transactions`}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Finances({ user }) {
  const [tab, setTab]               = useState('bills');
  const [bills, setBills]           = useState([]);
  const [transactions, setTransactions] = useState([]);

  // Load bills at top level so SavingsTab can use them for weekly calc
  useEffect(() => {
    supabase.from('bills').select('*').eq('user_id', user.id)
      .then(({ data }) => { if (data) setBills(data); });
  }, [user.id]);

  const { avgWeeklyIncome } = transactions.length > 0
    ? analyseTransactions(transactions)
    : { avgWeeklyIncome: 0 };

  return (
    <div style={S.financesPage}>
      <div style={S.financesTabBar}>
        {['bills','savings','statements'].map(t => (
          <button key={t} style={S.financesTab(tab === t)} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'bills'      && <BillsTab      user={user} online={navigator.onLine} bills={bills} />}
      {tab === 'savings'    && <SavingsTab    user={user} bills={bills} avgWeeklyIncome={avgWeeklyIncome} />}
      {tab === 'statements' && <StatementsTab user={user} transactions={transactions} setTransactions={setTransactions} />}
    </div>
  );
}
