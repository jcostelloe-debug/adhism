import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { db, queueMutation } from '../lib/db';
import S from '../S';

const DEFAULT_LISTS = [
  { name: 'Work',     color: '#60a5fa' },
  { name: 'Personal', color: '#4ade80' },
  { name: 'Admin',    color: '#fb923c' },
];

const PRIORITIES = ['low', 'med', 'high'];
const FILTERS = ['All', 'Active', 'Done'];

const LIST_COLORS = ['#a78bfa', '#60a5fa', '#4ade80', '#fb923c', '#f472b6', '#facc15', '#34d399'];

function isOverdue(due) {
  if (!due) return false;
  return new Date(due) < new Date(new Date().toDateString());
}

function formatDue(due) {
  if (!due) return null;
  const d = new Date(due);
  const today = new Date(new Date().toDateString());
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function Todos({ user }) {
  const [lists, setLists] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const seedingRef = useRef(false);
  const [todos, setTodos] = useState([]);
  const [filter, setFilter] = useState('All');
  const [input, setInput] = useState('');
  const [priority, setPriority] = useState('med');
  const [dueDate, setDueDate] = useState('');
  const [addingList, setAddingList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListColor, setNewListColor] = useState(LIST_COLORS[0]);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // Load lists
  const loadLists = useCallback(async () => {
    if (online) {
      const { data, error } = await supabase
        .from('lists')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at');

      if (!error && data) {
        // Deduplicate by name — keep earliest created, delete the rest
        const seen = new Map();
        const dupes = [];
        for (const l of data) {
          if (seen.has(l.name)) dupes.push(l.id);
          else seen.set(l.name, l);
        }
        if (dupes.length > 0) {
          await Promise.all(dupes.map(id => supabase.from('lists').delete().eq('id', id)));
        }
        const clean = data.filter(l => !dupes.includes(l.id));

        // Seed default lists on first use
        if (clean.length === 0 && !seedingRef.current) {
          seedingRef.current = true;
          const seeded = await Promise.all(
            DEFAULT_LISTS.map((l) =>
              supabase.from('lists').insert({ ...l, user_id: user.id }).select().single()
            )
          );
          const newLists = seeded.map((r) => r.data).filter(Boolean);
          setLists(newLists);
          setSelectedId(newLists[0]?.id ?? null);
          await db.lists.bulkAdd(newLists);
        } else if (clean.length > 0) {
          setLists(clean);
          setSelectedId((prev) => prev ?? clean[0]?.id ?? null);
          await db.lists.clear();
          await db.lists.bulkAdd(clean);
        }
      }
    } else {
      const local = await db.lists.where('user_id').equals(user.id).toArray();
      setLists(local);
      setSelectedId((prev) => prev ?? local[0]?.id ?? null);
    }
  }, [online, user.id]);

  useEffect(() => { loadLists(); }, [loadLists]);

  // Load all todos for the user (so sidebar counts are always visible)
  const loadTodos = useCallback(async () => {
    if (online) {
      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setTodos(data);
        await db.todos.where('user_id').equals(user.id).delete();
        await db.todos.bulkAdd(data.map((t) => ({ ...t, synced: 1 })));
      }
    } else {
      const local = await db.todos.where('user_id').equals(user.id).toArray();
      setTodos(local.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    }
  }, [online, user.id]);

  useEffect(() => { loadTodos(); }, [loadTodos]);

  // Flush offline queue when back online
  useEffect(() => {
    if (!online) return;
    (async () => {
      const queue = await db.offlineQueue.toArray();
      for (const item of queue) {
        if (item.operation === 'insert') await supabase.from(item.table).insert(item.payload);
        else if (item.operation === 'update') await supabase.from(item.table).update(item.payload.changes).eq('id', item.payload.id);
        else if (item.operation === 'delete') await supabase.from(item.table).delete().eq('id', item.payload.id);
        await db.offlineQueue.delete(item.id);
      }
      if (queue.length > 0) { loadLists(); loadTodos(); }
    })();
  }, [online, loadLists, loadTodos]);

  async function addTodo() {
    const title = input.trim();
    if (!title || !selectedId) return;
    setInput('');

    const newTodo = {
      user_id: user.id,
      list_id: selectedId,
      title,
      done: false,
      priority,
      due_date: dueDate || null,
      created_at: new Date().toISOString(),
    };

    const tempId = `temp_${Date.now()}`;
    setTodos((prev) => [{ ...newTodo, id: tempId }, ...prev]);

    if (online) {
      const { data, error } = await supabase.from('todos').insert(newTodo).select().single();
      if (!error) setTodos((prev) => prev.map((t) => t.id === tempId ? data : t));
    } else {
      await db.todos.add({ ...newTodo, id: tempId, synced: 0 });
      await queueMutation('todos', 'insert', newTodo);
    }
  }

  async function toggleTodo(todo) {
    const updated = { ...todo, done: !todo.done };
    setTodos((prev) => prev.map((t) => t.id === todo.id ? updated : t));
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

  async function addList() {
    const name = newListName.trim();
    if (!name) return;
    setNewListName('');
    setAddingList(false);

    const newList = { user_id: user.id, name, color: newListColor, created_at: new Date().toISOString() };
    if (online) {
      const { data, error } = await supabase.from('lists').insert(newList).select().single();
      if (!error) {
        setLists((prev) => [...prev, data]);
        setSelectedId(data.id);
      }
    } else {
      const tempId = `temp_${Date.now()}`;
      await db.lists.add({ ...newList, id: tempId });
      await queueMutation('lists', 'insert', newList);
      setLists((prev) => [...prev, { ...newList, id: tempId }]);
      setSelectedId(tempId);
    }
  }

  const selectedList = lists.find((l) => l.id === selectedId);
  const filtered = todos.filter((t) => {
    if (t.list_id !== selectedId) return false;
    if (filter === 'Active') return !t.done;
    if (filter === 'Done') return t.done;
    return true;
  });

  const countActive = (listId) => todos.filter((t) => t.list_id === listId && !t.done).length;

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', height: '100%' }}>
      {/* Lists panel */}
      <div style={S.listsPanel}>
        <div style={S.listsPanelTitle}>My Lists</div>
        {lists.map((list) => (
          <div
            key={list.id}
            style={S.listItem(list.id === selectedId)}
            onClick={() => { setSelectedId(list.id); setFilter('All'); }}
          >
            <div style={S.listDot(list.color)} />
            <span style={S.listName(list.id === selectedId)}>{list.name}</span>
            {countActive(list.id) > 0 && (
              <span style={S.listCount}>{countActive(list.id)}</span>
            )}
          </div>
        ))}

        <div style={S.addListRow}>
          {addingList ? (
            <>
              <input
                style={S.addListInput}
                placeholder="List name…"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addList(); if (e.key === 'Escape') setAddingList(false); }}
                autoFocus
              />
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                {LIST_COLORS.map((c) => (
                  <div
                    key={c}
                    onClick={() => setNewListColor(c)}
                    style={{
                      width: 16, height: 16, borderRadius: '50%', backgroundColor: c, cursor: 'pointer',
                      border: newListColor === c ? '2px solid #fff' : '2px solid transparent',
                    }}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={{ ...S.btnPrimary, fontSize: 12, padding: '6px 12px' }} onClick={addList}>Add</button>
                <button style={{ ...S.btnGhost, fontSize: 12, padding: '6px 12px' }} onClick={() => setAddingList(false)}>Cancel</button>
              </div>
            </>
          ) : (
            <button
              style={{ ...S.navItem(false), width: '100%', fontSize: 13, color: '#666677' }}
              onClick={() => setAddingList(true)}
            >
              <span>+</span> New List
            </button>
          )}
        </div>
      </div>

      {/* Todos main */}
      <div style={S.todosMain}>
        {!selectedList ? (
          <div style={{ ...S.emptyState, padding: '80px 0' }}>Select a list</div>
        ) : (
          <>
            <div style={S.todosHeader}>
              <div style={S.todosTitle}>
                <div style={{ ...S.listDot(selectedList.color), width: 12, height: 12 }} />
                <span style={S.todosTitleText}>{selectedList.name}</span>
                {!online && (
                  <span style={{ fontSize: 11, color: '#fb923c', backgroundColor: '#2d1f0f', padding: '2px 8px', borderRadius: 20, border: '1px solid #4d2f0f' }}>
                    Offline
                  </span>
                )}
              </div>
              <div style={S.filterTabs}>
                {FILTERS.map((f) => (
                  <button key={f} style={S.filterTab(filter === f)} onClick={() => setFilter(f)}>{f}</button>
                ))}
              </div>
            </div>

            <div style={S.todosBody}>
              {/* Add todo */}
              <div style={S.addTodoRow}>
                <input
                  style={{ ...S.input, flex: 1 }}
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
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  style={S.dateInput}
                />
                <button style={S.btnPrimary} onClick={addTodo}>Add</button>
              </div>

              {/* Todo items */}
              {filtered.length === 0 ? (
                <div style={S.emptyState}>
                  {filter === 'Done' ? 'Nothing completed yet' : filter === 'Active' ? 'All done!' : 'No tasks — add one above'}
                </div>
              ) : (
                filtered.map((todo) => (
                  <div
                    key={todo.id}
                    style={S.todoItemFull(todo.done)}
                    onClick={() => toggleTodo(todo)}
                    onMouseEnter={(e) => {
                      const del = e.currentTarget.querySelector('[data-del]');
                      if (del) del.style.opacity = '1';
                    }}
                    onMouseLeave={(e) => {
                      const del = e.currentTarget.querySelector('[data-del]');
                      if (del) del.style.opacity = '0';
                    }}
                  >
                    <div style={{ ...S.todoCheck(todo.done), marginTop: 2 }}>
                      {todo.done && <span style={{ color: '#fff', fontSize: 11 }}>✓</span>}
                    </div>
                    <div style={S.todoItemBody}>
                      <div style={S.todoItemTitle(todo.done)}>{todo.title}</div>
                      <div style={S.todoItemMeta}>
                        <span style={S.priorityBadge(todo.priority)}>{todo.priority}</span>
                        {todo.due_date && (
                          <span style={S.dueDate(isOverdue(todo.due_date) && !todo.done)}>
                            {formatDue(todo.due_date)}
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      data-del
                      style={{ ...S.todoDelete, opacity: 0 }}
                      onClick={(e) => { e.stopPropagation(); deleteTodo(todo); }}
                    >
                      ×
                    </span>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
