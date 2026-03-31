import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { db, queueMutation } from '../lib/db';
import S from '../S';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const URGENCY = [
  { value: 'red',    label: 'Urgent' },
  { value: 'yellow', label: 'Medium' },
  { value: 'green',  label: 'Low' },
];

function toDateStr(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function formatPanelDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatTime(t) {
  if (!t) return null;
  const [h, m] = t.split(':');
  const hour = parseInt(h);
  return `${hour % 12 || 12}:${m} ${hour < 12 ? 'AM' : 'PM'}`;
}

export default function Calendar({ user }) {
  const today = new Date();
  const [year, setYear]   = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selected, setSelected] = useState(toDateStr(today.getFullYear(), today.getMonth(), today.getDate()));
  const [appointments, setAppointments] = useState([]); // all for current month
  const [online, setOnline] = useState(navigator.onLine);

  // Form state
  const [title, setTitle]   = useState('');
  const [time, setTime]     = useState('');
  const [notes, setNotes]   = useState('');
  const [urgency, setUrgency] = useState('green');

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const loadAppointments = useCallback(async () => {
    const from = toDateStr(year, month, 1);
    const to   = toDateStr(month === 11 ? year + 1 : year, month === 11 ? 0 : month + 1, 1);

    if (online) {
      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', from)
        .lt('date', to)
        .order('time', { nullsFirst: true });

      if (!error && data) {
        setAppointments(data);
        await db.appointments.where('date').between(from, to, true, false).delete();
        await db.appointments.bulkAdd(data);
      }
    } else {
      const local = await db.appointments
        .where('date').between(from, to, true, false)
        .toArray();
      setAppointments(local);
    }
  }, [year, month, online, user.id]);

  useEffect(() => { loadAppointments(); }, [loadAppointments]);

  // Flush offline queue on reconnect
  useEffect(() => {
    if (!online) return;
    (async () => {
      const queue = await db.offlineQueue.toArray();
      for (const item of queue) {
        if (item.operation === 'insert') await supabase.from(item.table).insert(item.payload);
        else if (item.operation === 'delete') await supabase.from(item.table).delete().eq('id', item.payload.id);
        await db.offlineQueue.delete(item.id);
      }
      if (queue.length > 0) loadAppointments();
    })();
  }, [online, loadAppointments]);

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  async function addAppointment() {
    const t = title.trim();
    if (!t || !selected) return;
    setTitle(''); setTime(''); setNotes('');

    const appt = {
      user_id: user.id,
      title: t,
      date: selected,
      time: time || null,
      urgency,
      notes: notes.trim() || null,
      created_at: new Date().toISOString(),
    };

    const tempId = `temp_${Date.now()}`;
    setAppointments(prev => [...prev, { ...appt, id: tempId }]);

    if (online) {
      const { data, error } = await supabase.from('appointments').insert(appt).select().single();
      if (!error) setAppointments(prev => prev.map(a => a.id === tempId ? data : a));
    } else {
      await db.appointments.add({ ...appt, id: tempId });
      await queueMutation('appointments', 'insert', appt);
    }
  }

  async function deleteAppointment(appt) {
    setAppointments(prev => prev.filter(a => a.id !== appt.id));
    if (online) {
      await supabase.from('appointments').delete().eq('id', appt.id);
    } else {
      await db.appointments.delete(appt.id);
      await queueMutation('appointments', 'delete', { id: appt.id });
    }
  }

  // Build calendar grid
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev  = new Date(year, month, 0).getDate();
  const todayStr    = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());

  const cells = [];
  // Leading days from prev month
  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push({ day: daysInPrev - i, currentMonth: false, dateStr: toDateStr(month === 0 ? year - 1 : year, month === 0 ? 11 : month - 1, daysInPrev - i) });
  }
  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, currentMonth: true, dateStr: toDateStr(year, month, d) });
  }
  // Trailing days for next month
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    cells.push({ day: d, currentMonth: false, dateStr: toDateStr(month === 11 ? year + 1 : year, month === 11 ? 0 : month + 1, d) });
  }

  // Group appointments by date
  const byDate = {};
  for (const a of appointments) {
    if (!byDate[a.date]) byDate[a.date] = [];
    byDate[a.date].push(a);
  }

  const dayAppts = (byDate[selected] || []).sort((a, b) => (a.time || '99') > (b.time || '99') ? 1 : -1);

  return (
    <div style={S.calendarPage}>
      {/* Main calendar */}
      <div style={S.calendarMain}>
        {/* Month navigation */}
        <div style={S.calendarNav}>
          <button style={S.calendarNavBtn} onClick={prevMonth}>‹</button>
          <div style={S.calendarMonth}>{MONTHS[month]} {year}</div>
          <button style={S.calendarNavBtn} onClick={nextMonth}>›</button>
        </div>

        {/* Grid */}
        <div style={S.calendarGrid}>
          {DAYS.map(d => (
            <div key={d} style={S.calendarDayHeader}>{d}</div>
          ))}
          {cells.map((cell, i) => {
            const flags = byDate[cell.dateStr] || [];
            const isToday = cell.dateStr === todayStr;
            const isSelected = cell.dateStr === selected;
            return (
              <div
                key={i}
                style={S.calendarCell(cell.currentMonth, isToday, isSelected)}
                onClick={() => setSelected(cell.dateStr)}
              >
                <div style={S.calendarDayNum(cell.currentMonth, isToday)}>{cell.day}</div>
                {flags.length > 0 && (
                  <div style={S.calendarFlags}>
                    {flags.slice(0, 5).map((a, j) => (
                      <div key={j} style={S.calendarFlag(a.urgency)} title={a.title} />
                    ))}
                    {flags.length > 5 && (
                      <span style={S.calendarFlagMore}>+{flags.length - 5}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 20, marginTop: 16 }}>
          {URGENCY.map(u => (
            <div key={u.value} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={S.calendarFlag(u.value)} />
              <span style={{ fontSize: 12, color: '#555566' }}>{u.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Day panel */}
      <div style={S.dayPanel}>
        <div style={S.dayPanelHeader}>
          <div style={S.dayPanelDate}>{formatPanelDate(selected)}</div>
          <div style={S.dayPanelSub}>
            {dayAppts.length === 0 ? 'No appointments' : `${dayAppts.length} appointment${dayAppts.length > 1 ? 's' : ''}`}
          </div>
        </div>

        <div style={S.dayPanelBody}>
          {dayAppts.length === 0 ? (
            <div style={{ ...S.emptyState, paddingTop: 40 }}>Nothing scheduled</div>
          ) : (
            dayAppts.map(appt => (
              <div
                key={appt.id}
                style={S.appointmentItem(appt.urgency)}
                onMouseEnter={e => { const d = e.currentTarget.querySelector('[data-del]'); if (d) d.style.color = '#9999aa'; }}
                onMouseLeave={e => { const d = e.currentTarget.querySelector('[data-del]'); if (d) d.style.color = '#333344'; }}
              >
                <div style={S.appointmentStripe(appt.urgency)} />
                <div style={S.appointmentBody}>
                  <div style={S.appointmentTitle}>{appt.title}</div>
                  {appt.time && <div style={S.appointmentTime}>{formatTime(appt.time)}</div>}
                  {appt.notes && <div style={S.appointmentNotes}>{appt.notes}</div>}
                </div>
                <span
                  data-del
                  style={S.appointmentDelete}
                  onClick={() => deleteAppointment(appt)}
                >×</span>
              </div>
            ))
          )}
        </div>

        {/* Add form */}
        <div style={S.dayPanelForm}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#444455', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Add Appointment
          </div>
          <input
            style={S.input}
            placeholder="Title…"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addAppointment()}
          />
          <input
            type="time"
            value={time}
            onChange={e => setTime(e.target.value)}
            style={{ ...S.dateInput, width: '100%' }}
          />
          <textarea
            style={{ ...S.input, resize: 'none', height: 56, fontSize: 13 }}
            placeholder="Notes (optional)…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
          <div style={S.urgencyPicker}>
            {URGENCY.map(u => (
              <button
                key={u.value}
                style={S.urgencyBtn(u.value, urgency === u.value)}
                onClick={() => setUrgency(u.value)}
              >
                {u.label}
              </button>
            ))}
          </div>
          <button style={S.btnPrimary} onClick={addAppointment}>Add</button>
        </div>
      </div>
    </div>
  );
}
