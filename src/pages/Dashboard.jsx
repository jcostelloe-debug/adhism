import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { db, queueMutation } from '../lib/db';
import { getDailyQuote } from '../lib/quotes';
import S from '../S';

const PRIORITIES = ['low', 'med', 'high'];

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export default function Dashboard({ user }) {
  const [todos, setTodos] = useState([]);
  const [input, setInput] = useState('');
  const [priority, setPriority] = useState('med');
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(navigator.onLine);
  const quote = getDailyQuote();

  // Track online status
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // Load todos — from Supabase if online, else from Dexie
  const loadTodos = useCallback(async () => {
    setLoading(true);
    if (online) {
      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setTodos(data);
        // Sync to local cache
        await db.todos.clear();
        await db.todos.bulkAdd(data.map((t) => ({ ...t, synced: 1 })));
      }
    } else {
      const local = await db.todos.where('user_id').equals(user.id).toArray();
      setTodos(local.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    }
    setLoading(false);
  }, [online, user.id]);

  useEffect(() => { loadTodos(); }, [loadTodos]);

  // Flush offline queue when back online
  useEffect(() => {
    if (!online) return;
    (async () => {
      const queue = await db.offlineQueue.toArray();
      for (const item of queue) {
        if (item.operation === 'insert') {
          await supabase.from(item.table).insert(item.payload);
        } else if (item.operation === 'update') {
          await supabase.from(item.table).update(item.payload.changes).eq('id', item.payload.id);
        } else if (item.operation === 'delete') {
          await supabase.from(item.table).delete().eq('id', item.payload.id);
        }
        await db.offlineQueue.delete(item.id);
      }
      if (queue.length > 0) loadTodos();
    })();
  }, [online, loadTodos]);

  async function addTodo() {
    const title = input.trim();
    if (!title) return;
    setInput('');

    const newTodo = {
      user_id: user.id,
      title,
      done: false,
      priority,
      created_at: new Date().toISOString(),
    };

    // Optimistic UI
    const tempId = `temp_${Date.now()}`;
    setTodos((prev) => [{ ...newTodo, id: tempId }, ...prev]);

    if (online) {
      const { data, error } = await supabase.from('todos').insert(newTodo).select().single();
      if (!error) {
        setTodos((prev) => prev.map((t) => (t.id === tempId ? data : t)));
        await db.todos.add({ ...data, synced: 1 });
      }
    } else {
      await db.todos.add({ ...newTodo, id: tempId, synced: 0 });
      await queueMutation('todos', 'insert', newTodo);
    }
  }

  async function toggleTodo(todo) {
    const updated = { ...todo, done: !todo.done };
    setTodos((prev) => prev.map((t) => (t.id === todo.id ? updated : t)));

    if (online) {
      await supabase.from('todos').update({ done: updated.done }).eq('id', todo.id);
    } else {
      await db.todos.update(todo.id, { done: updated.done });
      await queueMutation('todos', 'update', { id: todo.id, changes: { done: updated.done } });
    }
  }

  async function deleteTodo(todo) {
    setTodos((prev) => prev.filter((t) => t.id !== todo.id));
    if (online) {
      await supabase.from('todos').delete().eq('id', todo.id);
    } else {
      await db.todos.delete(todo.id);
      await queueMutation('todos', 'delete', { id: todo.id });
    }
  }

  const done = todos.filter((t) => t.done).length;
  const total = todos.length;
  const highCount = todos.filter((t) => !t.done && t.priority === 'high').length;

  return (
    <div style={S.content}>
      {/* Stats */}
      <div style={S.statsRow}>
        <div style={S.statCard}>
          <div style={S.statLabel}>Today's Tasks</div>
          <div style={S.statValue}>{total}</div>
          <div style={S.statSub}>{done} completed</div>
        </div>
        <div style={S.statCard}>
          <div style={S.statLabel}>Remaining</div>
          <div style={S.statValue}>{total - done}</div>
          <div style={S.statSub}>{highCount} high priority</div>
        </div>
        <div style={S.statCard}>
          <div style={S.statLabel}>Progress</div>
          <div style={S.statValue}>{total ? Math.round((done / total) * 100) : 0}%</div>
          <div style={S.statSub}>completion rate</div>
        </div>
      </div>

      <div style={S.dashGrid}>
        {/* Left: Todos */}
        <div style={S.dashLeft}>
          <div style={S.card}>
            <div style={S.sectionHeader}>
              <div style={S.cardTitle}>To-Do</div>
              {!online && (
                <span style={{ fontSize: 11, color: '#fb923c', backgroundColor: '#2d1f0f', padding: '2px 8px', borderRadius: 20, border: '1px solid #4d2f0f' }}>
                  Offline
                </span>
              )}
            </div>

            {/* Add task */}
            <div style={S.todoInput}>
              <input
                style={S.input}
                placeholder="Add a task…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTodo()}
              />
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                style={{ ...S.input, flex: 'none', width: 80, cursor: 'pointer' }}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
              <button style={S.btnPrimary} onClick={addTodo}>Add</button>
            </div>

            {/* Task list */}
            {loading ? (
              <div style={S.emptyState}>Loading…</div>
            ) : todos.length === 0 ? (
              <div style={S.emptyState}>No tasks yet — add one above</div>
            ) : (
              <div style={S.todoList}>
                {todos.map((todo) => (
                  <div
                    key={todo.id}
                    style={S.todoItem(todo.done)}
                    onMouseEnter={(e) => {
                      const del = e.currentTarget.querySelector('[data-del]');
                      if (del) del.style.opacity = '1';
                    }}
                    onMouseLeave={(e) => {
                      const del = e.currentTarget.querySelector('[data-del]');
                      if (del) del.style.opacity = '0';
                    }}
                    onClick={() => toggleTodo(todo)}
                  >
                    <div style={S.todoCheck(todo.done)}>
                      {todo.done && <span style={{ color: '#fff', fontSize: 11 }}>✓</span>}
                    </div>
                    <span style={S.todoText(todo.done)}>{todo.title}</span>
                    <span style={S.priorityBadge(todo.priority)}>{todo.priority}</span>
                    <span
                      data-del
                      style={S.todoDelete}
                      onClick={(e) => { e.stopPropagation(); deleteTodo(todo); }}
                    >
                      ×
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Quote + coming soon stubs */}
        <div style={S.dashRight}>
          <div style={S.quoteCard}>
            <div style={S.cardTitle}>Daily Reminder</div>
            <div style={S.quoteText}>"{quote.text}"</div>
            <div style={S.quoteAuthor}>— {quote.author}</div>
          </div>

          <div style={S.card}>
            <div style={S.cardTitle}>Upcoming</div>
            <div style={S.emptyState}>Calendar coming soon</div>
          </div>

          <div style={S.card}>
            <div style={S.cardTitle}>Bills Due</div>
            <div style={S.emptyState}>Finances coming soon</div>
          </div>
        </div>
      </div>
    </div>
  );
}
