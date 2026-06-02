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

// ── Version history ───────────────────────────────────────────────────────────
// Saved to the doc's folder under `.versions/<id>/<ts>.json` when a folder is
// available; otherwise to IndexedDB under `versions:<id>`. Each entry is
// { ts, label, tree }. Newest first. Capped to keep storage bounded.
const VERSION_CAP = 100;

async function versionsDir(folder, id, create = false) {
  const root = await folder.getDirectoryHandle('.versions', { create });
  return root.getDirectoryHandle(id, { create });
}

// Returns [{ ts, label }] newest first (no tree payload — cheap to list).
export async function listVersions(folder, id) {
  if (folder) {
    try {
      const dir = await versionsDir(folder, id, false);
      const out = [];
      for await (const entry of dir.values()) {
        if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue;
        try {
          const file = await entry.getFile();
          const data = JSON.parse(await file.text());
          out.push({ ts: data.ts, label: data.label || null });
        } catch { /* skip bad file */ }
      }
      return out.sort((a, b) => b.ts - a.ts);
    } catch { return []; }
  }
  const items = (await dbGet('versions:' + id)) || [];
  return items.map(({ ts, label }) => ({ ts, label: label || null })).sort((a, b) => b.ts - a.ts);
}

export async function readVersionTree(folder, id, ts) {
  if (folder) {
    const dir = await versionsDir(folder, id, false);
    const fh = await dir.getFileHandle(`${ts}.json`);
    const file = await fh.getFile();
    return JSON.parse(await file.text()).tree;
  }
  const items = (await dbGet('versions:' + id)) || [];
  return (items.find((v) => v.ts === ts) || {}).tree;
}

// Save a snapshot. Skips if identical to the latest snapshot (dedup for idle
// auto-save). Returns the saved entry's ts, or null if skipped.
export async function saveVersion(folder, id, tree, label = null) {
  const snapshot = JSON.stringify(tree);
  const ts = Date.now();
  if (folder) {
    const dir = await versionsDir(folder, id, true);
    // dedup against the newest existing version
    const existing = (await listVersions(folder, id));
    if (existing.length) {
      try {
        const latest = await readVersionTree(folder, id, existing[0].ts);
        if (JSON.stringify(latest) === snapshot) return null;
      } catch { /* fall through and save */ }
    }
    const fh = await dir.getFileHandle(`${ts}.json`, { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify({ ts, label, tree }, null, 2));
    await w.close();
    // prune oldest beyond cap
    const all = await listVersions(folder, id);
    for (const old of all.slice(VERSION_CAP)) {
      try { await dir.removeEntry(`${old.ts}.json`); } catch { /* ignore */ }
    }
    return ts;
  }
  // IndexedDB fallback
  const items = (await dbGet('versions:' + id)) || [];
  if (items.length && JSON.stringify(items[items.length - 1].tree) === snapshot) return null;
  items.push({ ts, label, tree: JSON.parse(snapshot) });
  while (items.length > VERSION_CAP) items.shift();
  await dbSet('versions:' + id, items);
  return ts;
}

export async function deleteVersionsFor(id, folder) {
  await dbDel('versions:' + id);
  if (folder) {
    try {
      const root = await folder.getDirectoryHandle('.versions', { create: false });
      await root.removeEntry(id, { recursive: true });
    } catch { /* nothing to remove */ }
  }
}