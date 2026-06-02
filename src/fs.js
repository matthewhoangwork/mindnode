// fs.js — File System Access API helpers + IndexedDB handle persistence

const DB_NAME = 'mindmapweb';
const STORE = 'handles';
const HANDLE_KEY = 'folder';
const TRASH_KEY = 'trash';

// ── IndexedDB for storing the directory handle ─────────────────────────────────
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbSet(key, val) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(val, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbDel(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── File System Access API ──────────────────────────────────────────────────────
export function isSupported() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export async function pickFolder() {
  if (!isSupported()) throw new Error('File System Access API not supported');
  const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
  await dbSet(HANDLE_KEY, handle);
  return handle;
}

export async function getStoredFolder() {
  try {
    return await dbGet(HANDLE_KEY);
  } catch {
    return null;
  }
}

export async function clearStoredFolder() {
  await dbDel(HANDLE_KEY);
}

export async function verifyPermission(handle, write = true) {
  if (!handle) return false;
  try {
    const opts = { mode: write ? 'readwrite' : 'read' };
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    return (await handle.requestPermission(opts)) === 'granted';
  } catch {
    return false;
  }
}

// ── File operations ─────────────────────────────────────────────────────────────
export async function listMindmaps(folder) {
  const out = [];
  for await (const entry of folder.values()) {
    if (entry.kind !== 'file') continue;
    if (!entry.name.endsWith('.mindmap.json')) continue;
    try {
      const file = await entry.getFile();
      const text = await file.text();
      const data = JSON.parse(text);
      out.push({ id: entry.name.replace(/\.mindmap\.json$/, ''), edited: data.edited || '', tree: data.tree, category: data.category || null });
    } catch (e) {
      console.warn('failed to read', entry.name, e);
    }
  }
  return out;
}

export async function readMindmap(folder, id) {
  const fileHandle = await folder.getFileHandle(`${id}.mindmap.json`);
  const file = await fileHandle.getFile();
  return JSON.parse(await file.text());
}

export async function writeMindmap(folder, id, doc) {
  const fileHandle = await folder.getFileHandle(`${id}.mindmap.json`, { create: true });
  const writable = await fileHandle.createWritable();
  const payload = { edited: doc.edited, tree: doc.tree };
  if (doc.category) payload.category = doc.category;
  await writable.write(JSON.stringify(payload, null, 2));
  await writable.close();
}

export async function deleteMindmap(folder, id) {
  try { await folder.removeEntry(`${id}.mindmap.json`); } catch { /* already gone */ }
}

// ── Trash (IndexedDB) ───────────────────────────────────────────────────────────
const TRASH_DAYS = 30;

export async function getTrash() {
  const items = (await dbGet(TRASH_KEY)) || [];
  const cutoff = Date.now() - TRASH_DAYS * 86400_000;
  return items.filter((i) => i.deletedAt > cutoff);
}

export async function moveToTrash(doc) {
  const items = await getTrash();
  items.push({ ...doc, deletedAt: Date.now() });
  await dbSet(TRASH_KEY, items);
}

export async function restoreFromTrash(id) {
  const items = await getTrash();
  await dbSet(TRASH_KEY, items.filter((i) => i.id !== id));
  return items.find((i) => i.id === id);
}

export async function purgeFromTrash(id) {
  const items = await getTrash();
  await dbSet(TRASH_KEY, items.filter((i) => i.id !== id));
}

export async function emptyTrash() {
  await dbSet(TRASH_KEY, []);
}