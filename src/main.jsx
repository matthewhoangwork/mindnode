// main.jsx — routing (TanStack Router) + library context + folder persistence
import React, { useState, useEffect, createContext, useContext } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createRouter, createRootRoute, createRoute, RouterProvider, Outlet, useNavigate, useParams,
} from '@tanstack/react-router';
import { makeLibrary, BG_CREAM } from './engine.jsx';
import { Gallery } from './gallery.jsx';
import { Editor } from './editor.jsx';
import {
  isSupported, pickFolder, getStoredFolder, clearStoredFolder,
  verifyPermission, listMindmaps, writeMindmap, deleteMindmap,
  getTrash, moveToTrash, restoreFromTrash, purgeFromTrash, emptyTrash,
} from './fs.js';

// ── Library context ───────────────────────────────────────────────
const LibCtx = createContext(null);
export const useLib = () => useContext(LibCtx);

// ── Root layout — provides library state to all routes ────────────
function RootLayout() {
  const [folder, setFolder] = useState(null);
  const [folderName, setFolderName] = useState(null);
  const [library, setLibrary] = useState(null);
  const [fsError, setFsError] = useState(null);
  const [trash, setTrash] = useState([]);
  const [trashOpen, setTrashOpen] = useState(false);

  useEffect(() => { getTrash().then(setTrash).catch(() => {}); }, []);

  useEffect(() => {
    (async () => {
      if (!isSupported()) { setLibrary(makeLibrary()); return; }
      const h = await getStoredFolder();
      if (h) {
        const ok = await verifyPermission(h, true);
        if (ok) {
          setFolder(h); setFolderName(h.name);
          try {
            const docs = await listMindmaps(h);
            setLibrary(docs.length > 0 ? docs : makeLibrary());
          } catch (e) { setFsError(e.message); setLibrary(makeLibrary()); }
        } else {
          await clearStoredFolder(); setLibrary(makeLibrary());
        }
      } else { setLibrary(makeLibrary()); }
    })();
  }, []);

  const onChooseFolder = async () => {
    try {
      const h = await pickFolder();
      setFolder(h); setFolderName(h.name);
      const docs = await listMindmaps(h);
      setLibrary(docs.length > 0 ? docs : makeLibrary());
      setFsError(null);
    } catch (e) { if (e.name !== 'AbortError') setFsError(e.message); }
  };

  const onChangeFolder = async () => {
    await clearStoredFolder(); setFolder(null); setFolderName(null); setFsError(null);
  };

  const setTree = (id, updater) => setLibrary((lib) => lib ? lib.map((d) =>
    d.id === id ? { ...d, edited: 'Edited just now', tree: typeof updater === 'function' ? updater(d.tree) : updater } : d) : lib);

  const newMap = async () => {
    const id = 'd' + Date.now();
    const doc = { id, edited: 'Just now', tree: { id: 'r' + Date.now(), label: 'New Mindmap', children: [] } };
    if (folder) { try { await writeMindmap(folder, id, doc); } catch (e) { setFsError(e.message); } }
    setLibrary((l) => [doc, ...(l || [])]);
    return id;
  };

  const deleteMap = async (id) => {
    const doc = (library || []).find((d) => d.id === id);
    if (doc) await moveToTrash(doc);
    if (folder) { try { await deleteMindmap(folder, id); } catch (e) { setFsError(e.message); } }
    setLibrary((l) => (l || []).filter((d) => d.id !== id));
    setTrash(await getTrash());
  };

  const restoreMap = async (id) => {
    const item = await restoreFromTrash(id);
    if (item) {
      const { deletedAt, ...doc } = item;
      if (folder) { try { await writeMindmap(folder, id, doc); } catch (e) { setFsError(e.message); } }
      setLibrary((l) => [doc, ...(l || [])]);
    }
    setTrash(await getTrash());
  };

  const purgeMap = async (id) => { await purgeFromTrash(id); setTrash(await getTrash()); };
  const emptyTrashFn = async () => { await emptyTrash(); setTrash([]); };

  const ctx = {
    library, folder, folderName, fsError, trash, trashOpen,
    setTrashOpen, onChooseFolder, onChangeFolder,
    setTree, newMap, deleteMap, restoreMap, purgeMap, emptyTrashFn,
  };

  return (
    <LibCtx.Provider value={ctx}>
      <div style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
        <Outlet />
      </div>
    </LibCtx.Provider>
  );
}

// ── Gallery page ─────────────────────────────────────────────────
function GalleryPage() {
  const navigate = useNavigate();
  const {
    library, folderName, fsError, trash, trashOpen,
    setTrashOpen, onChooseFolder, onChangeFolder,
    newMap, deleteMap, restoreMap, purgeMap, emptyTrashFn,
  } = useLib();

  if (library === null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: '100%', height: '100%', color: '#3D3A37', fontFamily: 'inherit' }}>Loading…</div>
    );
  }

  const handleOpen = (id) => navigate({ to: '/map/$id', params: { id } });
  const handleNew = async () => {
    const id = await newMap();
    navigate({ to: '/map/$id', params: { id } });
  };

  return (
    <Gallery
      library={library}
      onOpen={handleOpen}
      onNew={handleNew}
      onDelete={deleteMap}
      folderName={folderName}
      onChooseFolder={onChooseFolder}
      onChangeFolder={onChangeFolder}
      fsError={fsError}
      trash={trash}
      trashOpen={trashOpen}
      onTrashToggle={() => setTrashOpen((o) => !o)}
      onRestore={restoreMap}
      onPurge={purgeMap}
      onEmptyTrash={emptyTrashFn}
    />
  );
}

// ── Editor page ───────────────────────────────────────────────────
function EditorPage() {
  const { id } = useParams({ strict: false });
  const navigate = useNavigate();
  const { library, folder, setTree, fsError } = useLib();
  const [, setFsError] = useState(null);

  const doc = (library || []).find((d) => d.id === id);

  // Auto-save
  useEffect(() => {
    if (!folder || !doc) return;
    const t = setTimeout(() => {
      writeMindmap(folder, doc.id, doc).catch((e) => setFsError(e.message));
    }, 500);
    return () => clearTimeout(t);
  }, [doc, folder]);

  if (library === null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: '100%', height: '100%', color: '#3D3A37', fontFamily: 'inherit' }}>Loading…</div>
    );
  }

  if (!doc) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        width: '100%', height: '100%', color: '#3D3A37', fontFamily: 'inherit', gap: 12 }}>
        <div>Mindmap not found.</div>
        <button onClick={() => navigate({ to: '/' })}
          style={{ border: 'none', background: '#B8A4D4', color: '#fff', padding: '6px 14px',
            borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit' }}>Back to gallery</button>
      </div>
    );
  }

  return (
    <Editor
      key={doc.id}
      doc={doc}
      setTree={(updater) => setTree(id, updater)}
      onClose={() => navigate({ to: '/' })}
    />
  );
}

// ── Router setup ──────────────────────────────────────────────────
const rootRoute = createRootRoute({ component: RootLayout });

const galleryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: GalleryPage,
});

const editorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/map/$id',
  component: EditorPage,
});

const routeTree = rootRoute.addChildren([galleryRoute, editorRoute]);

const router = createRouter({ routeTree });

createRoot(document.getElementById('root')).render(
  <RouterProvider router={router} />
);
