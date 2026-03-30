import Dexie from 'dexie';

// Offline queue — stores mutations made while offline, synced when back online
export const db = new Dexie('adhism');

db.version(1).stores({
  todos: '++id, user_id, title, done, priority, due_date, synced, created_at',
  offlineQueue: '++id, table, operation, payload, created_at',
});

// Push a mutation to the offline queue
export async function queueMutation(table, operation, payload) {
  await db.offlineQueue.add({
    table,
    operation,
    payload,
    created_at: new Date().toISOString(),
  });
}
