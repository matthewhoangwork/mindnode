// editor.jsx — Editor shell: canvas, nodes, connectors, inspector, toolbar
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { FONT, BG_CREAM, BRANCH_INK, computeLayout, computeColors, handDrawnCurve, walkSubtree, findNode, cloneTree, diffTrees } from './engine.jsx';
import {
  NodeView, Inspector, TBtn, TSep, IconPlus,
  IconChevron, IconBack, IconSidebar, IconHistory,
} from './app.jsx';
import { MarkdownSidebar } from './sidebar.jsx';
import { listVersions, readVersionTree, saveVersion } from './fs.js';

const VW = 2400, VH = 2400, CX = 300, CY = VH / 2, RING = 380;

const MM_W = 180, MM_H = 120;

function EditorMinimap({ tree, pos, colors, view, canvasRef, onNavigate }) {
  const mmRef = useRef(null);
  const dragging = useRef(false);
  const [open, setOpen] = useState(false);

  const edges2 = [];
  walkSubtree(tree, (n) => (n.children || []).forEach((c) => edges2.push([n, c])));

  // Scale from canvas space → minimap space
  const kx = MM_W / VW, ky = MM_H / VH;

  // Viewport rect in canvas space
  const getViewport = useCallback(() => {
    const el = canvasRef.current;
    if (!el) return null;
    const vw = el.clientWidth, vh = el.clientHeight;
    // canvas coords of the visible corners
    const x = -view.x / view.k;
    const y = -view.y / view.k;
    const w = vw / view.k;
    const h = vh / view.k;
    return { x: x * kx, y: y * ky, w: w * kx, h: h * ky };
  }, [view, canvasRef, kx, ky]);

  const navigateTo = useCallback((e) => {
    const mm = mmRef.current; if (!mm) return;
    const rect = mm.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    // center view on clicked point
    const cx = (mx / kx) * view.k;
    const cy = (my / ky) * view.k;
    const el = canvasRef.current; if (!el) return;
    onNavigate((v) => ({ ...v, x: el.clientWidth / 2 - cx, y: el.clientHeight / 2 - cy }));
  }, [view.k, kx, ky, canvasRef, onNavigate]);

  useEffect(() => {
    const onMove = (e) => { if (dragging.current) navigateTo(e); };
    const onUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [navigateTo]);

  const vp = getViewport();

  return (
    <div
      style={{
        position: 'absolute', bottom: 14, left: 14, zIndex: 18,
        width: open ? MM_W : 32, height: open ? MM_H : 32,
        borderRadius: open ? 14 : 10,
        overflow: 'hidden',
        background: 'linear-gradient(135deg, rgba(255,255,255,0.40) 0%, rgba(255,255,255,0.15) 100%)',
        backdropFilter: 'blur(28px) saturate(2.2) brightness(1.08)',
        WebkitBackdropFilter: 'blur(28px) saturate(2.2) brightness(1.08)',
        border: '1px solid rgba(255,255,255,0.70)',
        borderBottom: '1px solid rgba(255,255,255,0.30)',
        boxShadow: open
          ? '0 8px 32px rgba(61,58,55,0.12), 0 2px 8px rgba(61,58,55,0.06), inset 0 1.5px 0 rgba(255,255,255,0.80)'
          : '0 2px 8px rgba(61,58,55,0.10), inset 0 1px 0 rgba(255,255,255,0.80)',
        transition: 'width .18s ease, height .18s ease, border-radius .18s ease, box-shadow .18s ease',
      }}>
      {/* Icon button shown when collapsed */}
      <div
        onClick={() => setOpen(true)}
        style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: open ? 0 : 1, transition: 'opacity .12s ease', pointerEvents: open ? 'none' : 'auto',
          cursor: 'pointer',
        }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="rgba(61,58,55,0.60)" strokeWidth="1.5" strokeLinecap="round">
          <rect x="1.5" y="1.5" width="4" height="4" rx="1" />
          <rect x="6.5" y="1.5" width="3" height="4" rx="1" />
          <rect x="10.5" y="1.5" width="4" height="4" rx="1" />
          <rect x="1.5" y="6.5" width="4" height="3" rx="1" />
          <rect x="6.5" y="6.5" width="3" height="3" rx="1" />
          <rect x="10.5" y="6.5" width="4" height="3" rx="1" />
          <rect x="1.5" y="10.5" width="4" height="4" rx="1" />
          <rect x="6.5" y="10.5" width="3" height="4" rx="1" />
          <rect x="10.5" y="10.5" width="4" height="4" rx="1" />
        </svg>
      </div>
      {/* Minimap content shown when open — click outside closes */}
      <div
        ref={mmRef}
        onMouseDown={(e) => { e.stopPropagation(); dragging.current = true; navigateTo(e); }}
        style={{
          position: 'absolute', inset: 0,
          opacity: open ? 1 : 0, transition: 'opacity .15s ease',
          pointerEvents: open ? 'auto' : 'none',
          cursor: 'crosshair',
        }}>
        <svg width={MM_W} height={MM_H} style={{ display: 'block', position: 'absolute', inset: 0 }}>
          <g transform={`scale(${MM_W / VW}, ${MM_H / VH})`}>
            {edges2.map(([p, c]) => {
              const P = pos[p.id], C = pos[c.id]; if (!P || !C) return null;
              return <line key={c.id} x1={P.x} y1={P.y} x2={C.x} y2={C.y}
                stroke={BRANCH_INK} strokeWidth={P.depth === 0 ? 10 : 7}
                strokeOpacity="0.5" strokeLinecap="round" />;
            })}
            {Object.entries(pos).map(([id, p]) => {
              const r = p.depth === 0 ? 22 : p.depth === 1 ? 16 : 10;
              return <circle key={id} cx={p.x} cy={p.y} r={r} fill={colors[id]} opacity="0.85" />;
            })}
          </g>
        </svg>
        {vp && (
          <div style={{
            position: 'absolute',
            left: Math.max(0, vp.x), top: Math.max(0, vp.y),
            width: Math.min(MM_W - Math.max(0, vp.x), vp.w),
            height: Math.min(MM_H - Math.max(0, vp.y), vp.h),
            border: '1.5px solid rgba(207,101,38,0.75)',
            borderRadius: 3,
            background: 'rgba(207,101,38,0.10)',
            pointerEvents: 'none',
          }} />
        )}
        {/* Close button */}
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); setOpen(false); dragging.current = false; }}
          style={{
            position: 'absolute', top: 5, right: 5, width: 16, height: 16, borderRadius: '50%',
            border: 'none', background: 'rgba(61,58,55,0.30)', color: '#fff',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, lineHeight: 1, padding: 0,
          }}>×</button>
      </div>
    </div>
  );
}

// ── Version-time formatting ──────────────────────────────────────
function fmtVersionTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `Today, ${time}`;
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

// ── History panel (Google-Docs-style version list) ───────────────
const DIFF_LEGEND = [
  ['added',   '#4FA86A', 'Added since'],
  ['removed', '#D9534F', 'Removed since'],
  ['changed', '#D9913F', 'Edited since'],
  ['moved',   '#5B8DD9', 'Moved since'],
];

// A small colored dot + label header for a diff category group.
function DiffGroupHeader({ col, label, count }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, margin: '10px 0 5px' }}>
      <span style={{ width: 9, height: 9, borderRadius: 3, background: col, flexShrink: 0 }} />
      <span style={{ fontSize: 11, fontWeight: 700, color: col, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(61,58,55,0.4)' }}>{count}</span>
    </div>
  );
}

// One row for an added / removed / moved node (label only).
function DiffItem({ children, strike }) {
  return (
    <div style={{
      fontSize: 12, color: strike ? 'rgba(61,58,55,0.55)' : '#3D3A37',
      textDecoration: strike ? 'line-through' : 'none',
      padding: '3px 0 3px 16px', lineHeight: 1.4, wordBreak: 'break-word',
    }}>{children}</div>
  );
}

function DiffSummary({ diff }) {
  if (!diff) return null;
  const total = diff.added.length + diff.removed.length + diff.changed.length + diff.moved.length;
  return (
    <div style={{ padding: '10px 12px 12px', borderBottom: '1px solid rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.18)', maxHeight: '42%', overflowY: 'auto' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(61,58,55,0.55)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Changes vs. current
      </div>

      {total === 0 ? (
        <div style={{ fontSize: 12.5, color: 'rgba(61,58,55,0.6)', marginTop: 8 }}>Identical to the current version.</div>
      ) : (
        <React.Fragment>
          {/* Added — exist in current, not in this version */}
          {diff.added.length > 0 && (
            <React.Fragment>
              <DiffGroupHeader col="#4FA86A" label="Added since" count={diff.added.length} />
              {diff.added.map((a) => <DiffItem key={a.id}>{a.label || '(note)'}</DiffItem>)}
            </React.Fragment>
          )}

          {/* Removed — exist in this version, gone in current */}
          {diff.removed.length > 0 && (
            <React.Fragment>
              <DiffGroupHeader col="#D9534F" label="Removed since" count={diff.removed.length} />
              {diff.removed.map((r) => <DiffItem key={r.id} strike>{r.label || '(note)'}</DiffItem>)}
            </React.Fragment>
          )}

          {/* Edited — label and/or body changed */}
          {diff.changed.length > 0 && (
            <React.Fragment>
              <DiffGroupHeader col="#D9913F" label="Edited since" count={diff.changed.length} />
              {diff.changed.map((c) => (
                <div key={c.id} style={{ padding: '4px 0 5px 16px', borderBottom: '1px dashed rgba(61,58,55,0.10)', marginBottom: 2 }}>
                  {c.from.label !== c.to.label ? (
                    <div style={{ fontSize: 12, lineHeight: 1.45 }}>
                      <span style={{ color: '#D9534F', textDecoration: 'line-through' }}>{c.from.label || '∅'}</span>
                      <span style={{ color: 'rgba(61,58,55,0.4)' }}> → </span>
                      <span style={{ color: '#4FA86A', fontWeight: 600 }}>{c.to.label || '∅'}</span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#3D3A37' }}>{c.to.label || '(note)'}</div>
                  )}
                  {c.from.body !== c.to.body && (
                    <div style={{ marginTop: 3 }}>
                      {c.from.body && (
                        <div style={{ fontSize: 11, lineHeight: 1.4, color: '#D9534F', textDecoration: 'line-through', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.from.body}</div>
                      )}
                      {c.to.body && (
                        <div style={{ fontSize: 11, lineHeight: 1.4, color: '#4FA86A', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.to.body}</div>
                      )}
                      {!c.from.body && !c.to.body && (
                        <div style={{ fontSize: 10.5, color: 'rgba(61,58,55,0.5)' }}>body edited</div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </React.Fragment>
          )}

          {/* Moved — same content, different parent */}
          {diff.moved.length > 0 && (
            <React.Fragment>
              <DiffGroupHeader col="#5B8DD9" label="Moved since" count={diff.moved.length} />
              {diff.moved.map((m) => <DiffItem key={m.id}>{m.label || '(note)'}</DiffItem>)}
            </React.Fragment>
          )}
        </React.Fragment>
      )}
    </div>
  );
}

function HistoryPanel({ versions, preview, diff, onSaveNamed, onPreview, onRestore, onExitPreview }) {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 46, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 14px', borderBottom: '1px solid rgba(255,255,255,0.35)' }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'rgba(61,58,55,0.55)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Version history</span>
        <button onClick={onSaveNamed} title="Save a named version now" style={{
          height: 26, padding: '0 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
          background: 'rgba(217,119,86,0.18)', color: '#CF6526', fontFamily: FONT, fontSize: 11.5, fontWeight: 700,
        }}>+ Save</button>
      </div>
      {preview && <DiffSummary diff={diff} />}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 8px 12px' }}>
        {versions.length === 0 ? (
          <div style={{ padding: '24px 14px', fontSize: 12.5, color: 'rgba(61,58,55,0.5)', lineHeight: 1.55 }}>
            No saved versions yet. Versions are captured automatically a few seconds after you stop editing, or click <strong>+ Save</strong> for a named checkpoint.
          </div>
        ) : versions.map((v) => {
          const on = preview && preview.ts === v.ts;
          return (
            <div key={v.ts}
              onClick={() => (on ? onExitPreview() : onPreview(v.ts))}
              style={{
                display: 'flex', flexDirection: 'column', gap: 2, padding: '9px 11px', marginBottom: 4,
                borderRadius: 10, cursor: 'pointer',
                background: on ? 'rgba(217,119,86,0.20)' : 'transparent',
                boxShadow: on ? 'inset 0 0 0 1.5px rgba(217,119,86,0.55)' : 'none',
              }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#3D3A37' }}>
                {v.label || fmtVersionTime(v.ts)}
              </span>
              {v.label && <span style={{ fontSize: 11, color: 'rgba(61,58,55,0.5)' }}>{fmtVersionTime(v.ts)}</span>}
              {on && (
                <button onClick={(e) => { e.stopPropagation(); onRestore(); }} style={{
                  marginTop: 6, height: 28, borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: '#D97756', color: '#fff', fontFamily: FONT, fontSize: 12, fontWeight: 700,
                }}>Restore this version</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Editor({ doc, folder, setTree, onClose }) {
  const tree = doc.tree;
  const [sel, setSel] = useState(null);
  const [editing, setEditing] = useState(null);
  const [panel, setPanel] = useState(null); // null | 'inspector' | 'markdown' | 'history'
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const canvasRef = useRef(null);
  const pan = useRef(null);

  // ── Version history ──
  const [versions, setVersions] = useState([]);      // [{ ts, label }] newest first
  const [preview, setPreview] = useState(null);      // { ts, tree } when previewing a past version
  const refreshVersions = useCallback(() => {
    listVersions(folder, doc.id).then(setVersions).catch(() => {});
  }, [folder, doc.id]);
  useEffect(() => { refreshVersions(); }, [refreshVersions]);

  // A node with no title/label but with a description is an "inline" note.
  // It keeps its place in the layout (so spacing/connectors stay correct) but is
  // drawn as plain text riding on the connector instead of as a box — the line
  // runs parent → (label) → child as one continuous connection.
  const isInline = (n) => !(n.label && n.label.trim()) && !!(n.body && n.body.trim());

  // While previewing a past version, the canvas renders that snapshot (read-only).
  const displayTree = preview ? preview.tree : tree;

  // Diff between the previewed (old) version and the current tree. On the old
  // canvas: `removed` = deleted since, `changed` = edited since, `moved` = reparented.
  // `added` exist only in current, so they're listed in the panel, not drawn here.
  const diff = useMemo(() => (preview ? diffTrees(preview.tree, tree) : null), [preview, tree]);

  const pos = useMemo(() => computeLayout(displayTree, CX, CY, RING, isInline), [displayTree]);
  const colors = useMemo(() => computeColors(displayTree), [displayTree]);
  const posRef = useRef(pos);
  posRef.current = pos;

  // ── Undo / redo history ──
  // Snapshots of the tree captured *before* each mutation. Cmd+Z pops `past`,
  // Cmd+Shift+Z (or Cmd+Y) pops `future`. Snapshots are deep clones so later
  // edits don't mutate them.
  const treeRef = useRef(tree);
  treeRef.current = tree;
  const past = useRef([]);
  const future = useRef([]);
  const skipSnapshot = useRef(false); // set during undo/redo so they don't self-record

  const pushHistory = () => {
    if (skipSnapshot.current) return;
    past.current.push(cloneTree(treeRef.current));
    if (past.current.length > 100) past.current.shift();
    future.current = []; // a fresh edit invalidates the redo stack
  };

  const undo = useCallback(() => {
    if (!past.current.length) return;
    const prev = past.current.pop();
    future.current.push(cloneTree(treeRef.current));
    skipSnapshot.current = true;
    setTree(() => prev);
    setEditing(null);
    setTimeout(() => { skipSnapshot.current = false; }, 0);
  }, [setTree]);

  const redo = useCallback(() => {
    if (!future.current.length) return;
    const next = future.current.pop();
    past.current.push(cloneTree(treeRef.current));
    skipSnapshot.current = true;
    setTree(() => next);
    setEditing(null);
    setTimeout(() => { skipSnapshot.current = false; }, 0);
  }, [setTree]);

  // ── Auto-version on idle ──
  // 3s after the last change settles, snapshot the tree. saveVersion() dedups
  // against the latest snapshot, so no-op renders don't spam history.
  const restoring = useRef(false); // suppress auto-save right after a restore
  useEffect(() => {
    if (preview) return;             // don't snapshot while previewing
    if (restoring.current) { restoring.current = false; return; }
    const t = setTimeout(() => {
      saveVersion(folder, doc.id, treeRef.current).then((ts) => { if (ts) refreshVersions(); }).catch(() => {});
    }, 3000);
    return () => clearTimeout(t);
  }, [tree, folder, doc.id, preview, refreshVersions]);

  const saveNamedVersion = useCallback(() => {
    const label = (window.prompt('Name this version (optional):') || '').trim() || null;
    saveVersion(folder, doc.id, treeRef.current, label).then((ts) => {
      // even if dedup skips a file write, force a labelled entry by retrying when null
      if (ts || label) refreshVersions();
    }).catch(() => {});
  }, [folder, doc.id, refreshVersions]);

  const previewVersion = useCallback((ts) => {
    readVersionTree(folder, doc.id, ts).then((t) => { if (t) setPreview({ ts, tree: t }); }).catch(() => {});
  }, [folder, doc.id]);

  const restoreVersion = useCallback(() => {
    if (!preview) return;
    pushHistory();                    // make the restore itself undoable
    restoring.current = true;
    setTree(() => cloneTree(preview.tree));
    setPreview(null);
    setEditing(null);
    setSel(null);
  }, [preview, setTree]);

  const exitPreview = useCallback(() => setPreview(null), []);

  const fit = useCallback(() => {
    const el = canvasRef.current; if (!el) return;
    const xs = Object.values(posRef.current).map((p) => p.x), ys = Object.values(posRef.current).map((p) => p.y);
    const minX = Math.min(...xs) - 120, maxX = Math.max(...xs) + 120;
    const minY = Math.min(...ys) - 80, maxY = Math.max(...ys) + 80;
    const w = el.clientWidth, h = el.clientHeight;
    const k = Math.min(w / (maxX - minX), h / (maxY - minY), 1.15);
    setView({ k, x: w / 2 - ((minX + maxX) / 2) * k, y: h / 2 - ((minY + maxY) / 2) * k });
  }, []);

  useEffect(() => { fit(); }, []);
  useEffect(() => {
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [fit]);

  const update = (fn) => { pushHistory(); setTree((t) => { const n = cloneTree(t); fn(n); return n; }); };
  const setNodeSize = (size) => {
    if (!sel) return;
    update((root) => { const hit = findNode(root, sel); if (hit) hit.node.size = size; });
  };
  const setNodeStyle = (style) => {
    if (!sel) return;
    update((root) => { const hit = findNode(root, sel); if (hit) hit.node.style = style; });
  };
  const commitLabel = (id, val, body) => {
    const v = (val || '').trim();
    const b = (body || '').trim();
    if (!v && !b && id !== tree.id) {
      update((root) => { const hit = findNode(root, id); if (hit && hit.parent) hit.parent.children = hit.parent.children.filter((c) => c.id !== id); });
      setSel(tree.id);
    } else {
      update((root) => { const hit = findNode(root, id); if (hit) { hit.node.label = v; hit.node.body = b || undefined; } });
    }
    setEditing(null);
  };
  const addChild = () => {
    if (!sel) return;
    const newId = 'new' + Date.now();
    update((root) => {
      const hit = findNode(root, sel); if (!hit) return;
      (hit.node.children = hit.node.children || []).push({ id: newId, label: '' });
    });
    setSel(newId); setTimeout(() => setEditing(newId), 60);
  };
  const addSibling = () => {
    if (!sel || sel === tree.id) return; // root has no sibling
    const newId = 'new' + Date.now();
    update((root) => {
      const hit = findNode(root, sel); if (!hit || !hit.parent) return;
      (hit.parent.children = hit.parent.children || []).push({ id: newId, label: '' });
    });
    setSel(newId); setTimeout(() => setEditing(newId), 60);
  };
  const removeNode = () => {
    if (!sel || sel === tree.id) return;
    update((root) => { const hit = findNode(root, sel); if (hit && hit.parent) hit.parent.children = hit.parent.children.filter((c) => c.id !== sel); });
    setSel(tree.id);
  };

  // Arrow navigation: ←parent, →first child, ↑/↓ previous/next sibling.
  const navigate = (dir) => {
    if (!sel) { setSel(tree.id); return; }
    const hit = findNode(tree, sel); if (!hit) return;
    const { node, parent } = hit;
    if (dir === 'right') {
      const kids = (node.children || []).filter((c) => !c.collapsed);
      if (kids.length) setSel(kids[0].id);
    } else if (dir === 'left') {
      if (parent) setSel(parent.id);
    } else if ((dir === 'up' || dir === 'down') && parent) {
      const sibs = (parent.children || []).filter((c) => !c.collapsed);
      const i = sibs.findIndex((c) => c.id === sel);
      const j = dir === 'up' ? i - 1 : i + 1;
      if (j >= 0 && j < sibs.length) setSel(sibs[j].id);
    }
  };

  useEffect(() => {
    const onKey = (e) => {
      // Undo / redo — works regardless of edit/selection state
      if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo(); return; }
      if (preview) { if (e.key === 'Escape') exitPreview(); return; } // read-only while previewing
      if (editing) return;
      if (e.target.contentEditable === 'true') return;
      // Cmd/Ctrl+Enter — edit the selected note
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && sel) { e.preventDefault(); setEditing(sel); return; }
      if (e.key === 'Tab') { e.preventDefault(); addChild(); }
      else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); removeNode(); }
      else if (e.key === 'Enter' && sel) { e.preventDefault(); addSibling(); }
      else if (e.key === 'ArrowLeft')  { e.preventDefault(); navigate('left'); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); navigate('right'); }
      else if (e.key === 'ArrowUp')    { e.preventDefault(); navigate('up'); }
      else if (e.key === 'ArrowDown')  { e.preventDefault(); navigate('down'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const selInfo = sel ? findNode(tree, sel) : null;
  const selDepth = selInfo && pos[sel] ? pos[sel].depth : 0;

  const onBgDown = (e) => { setSel(null); pan.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; };
  useEffect(() => {
    const move = (e) => { if (!pan.current) return; setView((v) => ({ ...v, x: pan.current.vx + (e.clientX - pan.current.sx), y: pan.current.vy + (e.clientY - pan.current.sy) })); };
    const up = () => { pan.current = null; };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, []);
  const zoom = (f) => setView((v) => ({ ...v, k: Math.max(0.3, Math.min(2, v.k * f)) }));
  useEffect(() => {
    const el = canvasRef.current; if (!el) return;
    const handler = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      setView((v) => {
        const k2 = Math.max(0.3, Math.min(2, v.k * (1 - e.deltaY * 0.01)));
        return { k: k2, x: mx - (mx - v.x) * (k2 / v.k), y: my - (my - v.y) * (k2 / v.k) };
      });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const edges = [];
  const inlineLabelPos = [];
  walkSubtree(displayTree, (n) => {
    if (n.collapsed) return;
    (n.children || []).forEach((c) => edges.push([n, c]));
    if (isInline(n) && pos[n.id]) {
      inlineLabelPos.push({ id: n.id, body: n.body, x: pos[n.id].x, y: pos[n.id].y });
    }
  });

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: BG_CREAM, fontFamily: FONT, overflow: 'hidden' }}>
      {/* Floating liquid-glass — left pill */}
      <div style={{
        position: 'absolute', top: 14, left: 14, zIndex: 20,
        display: 'flex', alignItems: 'center', gap: 2,
        padding: '0 8px', height: 44, borderRadius: 26,
        background: 'linear-gradient(135deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.18) 100%)',
        backdropFilter: 'blur(28px) saturate(2.2) brightness(1.08)',
        WebkitBackdropFilter: 'blur(28px) saturate(2.2) brightness(1.08)',
        border: '1px solid rgba(255,255,255,0.70)',
        borderBottom: '1px solid rgba(255,255,255,0.30)',
        boxShadow: '0 8px 32px rgba(61,58,55,0.12), 0 2px 8px rgba(61,58,55,0.06), inset 0 1.5px 0 rgba(255,255,255,0.80), inset 0 -1px 0 rgba(255,255,255,0.20)',
      }}>
        <button onClick={onClose} title="All MindNode" style={{
          display: 'flex', alignItems: 'center', gap: 3, height: 30, padding: '0 8px 0 6px', borderRadius: 18,
          border: 'none', background: 'transparent', color: 'rgba(61,58,55,0.75)', cursor: 'pointer',
          fontFamily: FONT, fontSize: 12.5, fontWeight: 600,
        }}>
          <IconBack /> MindNode
        </button>
        <div style={{ width: 1, height: 16, background: 'rgba(61,58,55,0.14)', margin: '0 3px' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#3D3A37', padding: '0 6px', maxWidth: 200,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tree.label}</span>
      </div>

      {/* Floating liquid-glass — right pill */}
      <div style={{
        position: 'absolute', top: 14, right: 14, zIndex: 20,
        display: 'flex', alignItems: 'center',
        padding: '0 6px', height: 44, borderRadius: 26,
        background: 'linear-gradient(135deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.18) 100%)',
        backdropFilter: 'blur(28px) saturate(2.2) brightness(1.08)',
        WebkitBackdropFilter: 'blur(28px) saturate(2.2) brightness(1.08)',
        border: '1px solid rgba(255,255,255,0.70)',
        borderBottom: '1px solid rgba(255,255,255,0.30)',
        boxShadow: '0 8px 32px rgba(61,58,55,0.12), 0 2px 8px rgba(61,58,55,0.06), inset 0 1.5px 0 rgba(255,255,255,0.80), inset 0 -1px 0 rgba(255,255,255,0.20)',
      }}>
        <TBtn title="Version history" active={panel === 'history'} onClick={() => setPanel((p) => (p === 'history' ? null : 'history'))}><IconHistory /></TBtn>
        <TSep />
        <TBtn title="Panel" active={panel === 'inspector' || panel === 'markdown'} onClick={() => setPanel((p) => ((p === 'inspector' || p === 'markdown') ? null : 'inspector'))}><IconSidebar /></TBtn>
      </div>

      {/* Version-preview banner */}
      {preview && (
        <div style={{
          position: 'absolute', top: 70, left: '50%', transform: 'translateX(-50%)', zIndex: 19,
          display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px 8px 16px', borderRadius: 16,
          background: 'linear-gradient(135deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.25) 100%)',
          backdropFilter: 'blur(28px) saturate(2.2) brightness(1.08)',
          WebkitBackdropFilter: 'blur(28px) saturate(2.2) brightness(1.08)',
          border: '1px solid rgba(255,255,255,0.70)',
          boxShadow: '0 8px 32px rgba(61,58,55,0.14), inset 0 1.5px 0 rgba(255,255,255,0.80)',
        }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: '#3D3A37' }}>
            Previewing version · {fmtVersionTime(preview.ts)}
          </span>
          <button onClick={restoreVersion} style={{
            height: 28, padding: '0 14px', borderRadius: 9, border: 'none', cursor: 'pointer',
            background: '#D97756', color: '#fff', fontFamily: FONT, fontSize: 12.5, fontWeight: 700,
          }}>Restore this version</button>
          <button onClick={exitPreview} style={{
            height: 28, padding: '0 12px', borderRadius: 9, border: 'none', cursor: 'pointer',
            background: 'rgba(61,58,55,0.10)', color: 'rgba(61,58,55,0.7)', fontFamily: FONT, fontSize: 12.5, fontWeight: 700,
          }}>Exit</button>
        </div>
      )}

      {/* Body */}
      <div style={{ width: '100%', height: '100%', display: 'flex' }}>
        <div ref={canvasRef} onMouseDown={onBgDown}
          style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: pan.current ? 'grabbing' : 'grab',
            background: `${BG_CREAM}`,
            backgroundImage: `radial-gradient(circle, rgba(61,58,55,0.18) 1px, transparent 1px)`,
            backgroundSize: '24px 24px' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: VW, height: VH,
            transform: `translate(${view.x}px,${view.y}px) scale(${view.k})`, transformOrigin: '0 0' }}>
            <svg width={VW} height={VH} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 0 }}>
              <defs>
                {/* Subtle hand-drawn wobble — applied to branches only.
                    Region is in absolute user space so a perfectly horizontal
                    connector (zero-height bbox) isn't clipped to nothing. */}
                {/* Simple distinct arrowhead, charcoal ink */}
                <marker id="arrowInk" viewBox="0 0 10 10" refX="8" refY="5"
                  markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 L 2.2 5 Z" fill={BRANCH_INK} />
                </marker>
              </defs>
              <g>
                {edges.map(([p, c]) => {
                  const P = pos[p.id], C = pos[c.id]; if (!P || !C) return null;
                  // offset from node centers to right/left edges — inline notes have
                  // no box, so the line runs to their center (offset 0).
                  const pHW = isInline(p) ? 0 : (P.depth === 0 ? 70 : 60);
                  const cHW = isInline(c) ? 0 : (C.depth === 0 ? 70 : 60);
                  const from = { x: P.x + pHW, y: P.y };
                  const to   = { x: C.x - cHW, y: C.y };
                  return <path key={c.id}
                    d={handDrawnCurve(from, to, c.id)}
                    fill="none" stroke={BRANCH_INK}
                    strokeWidth={P.depth === 0 ? 2.6 : 1.9}
                    strokeLinecap="round" strokeLinejoin="round" />;
                })}
              </g>
            </svg>
            {/* Inline-note bodies riding on the connectors — text only, no box.
                While editing, the full NodeView editor below takes over instead. */}
            {inlineLabelPos.map((il) => {
              if (editing === il.id) return null;
              const on = sel === il.id;
              return (
                <div key={'el' + il.id}
                  onMouseDown={(e) => { e.stopPropagation(); setSel(il.id); }}
                  onDoubleClick={(e) => { e.stopPropagation(); setEditing(il.id); }}
                  style={{
                    position: 'absolute', left: il.x, top: il.y, transform: 'translate(-50%,-50%)',
                    fontFamily: FONT, fontSize: 14, fontWeight: 400, lineHeight: 1.5, color: '#3D3A37',
                    maxWidth: 220, textAlign: 'left', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    cursor: 'default', zIndex: 3, padding: '5px 11px', borderRadius: 14,
                    background: BG_CREAM, border: 'none',
                    boxShadow: on ? '0 0 0 3px #CF6526' : 'none',
                  }}>{il.body}</div>
              );
            })}
            {(() => {
              const out = [];
              walkSubtree(displayTree, (n) => {
                const p = pos[n.id]; if (!p) return;
                if (isInline(n) && editing !== n.id) return; // drawn as on-connector label unless being edited
                out.push(<NodeView key={n.id} node={n} p={p} color={colors[n.id]}
                  selected={!preview && sel === n.id} editing={!preview && editing === n.id}
                  diffStatus={diff ? diff.status[n.id] : null}
                  onSelect={preview ? () => {} : setSel} onStartEdit={preview ? () => {} : setEditing} onCommit={commitLabel}
                  onAddChild={() => { setSel(n.id); addChild(); }}
                  onAddSibling={() => { setSel(n.id); addSibling(); }} />);
              });
              return out;
            })()}
          </div>
        </div>

      </div>

      {/* Floating minimap */}
      <EditorMinimap tree={displayTree} pos={pos} colors={colors} view={view} canvasRef={canvasRef} onNavigate={setView} />

      {/* Floating liquid-glass panel */}
      {panel && (
        <div style={{
          position: 'absolute', top: 72, right: 14, bottom: 14, width: 300, zIndex: 15,
          display: 'flex', flexDirection: 'column', borderRadius: 20,
          background: 'linear-gradient(160deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.16) 100%)',
          backdropFilter: 'blur(28px) saturate(2.2) brightness(1.08)',
          WebkitBackdropFilter: 'blur(28px) saturate(2.2) brightness(1.08)',
          border: '1px solid rgba(255,255,255,0.70)',
          borderBottom: '1px solid rgba(255,255,255,0.30)',
          boxShadow: '0 8px 32px rgba(61,58,55,0.12), 0 2px 8px rgba(61,58,55,0.06), inset 0 1.5px 0 rgba(255,255,255,0.80), inset 0 -1px 0 rgba(255,255,255,0.20)',
          overflow: 'hidden',
        }}>
          {panel === 'history' ? (
            <HistoryPanel
              versions={versions} preview={preview} diff={diff}
              onSaveNamed={saveNamedVersion} onPreview={previewVersion}
              onRestore={restoreVersion} onExitPreview={exitPreview} />
          ) : (
            <React.Fragment>
              {/* Tabs */}
              <div style={{ height: 46, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4,
                padding: '0 10px', borderBottom: '1px solid rgba(255,255,255,0.35)' }}>
                {[['inspector', 'Inspector'], ['markdown', 'Markdown']].map(([key, label]) => {
                  const on = panel === key;
                  return (
                    <button key={key} onClick={() => setPanel(key)} style={{
                      height: 28, padding: '0 12px', borderRadius: 10, border: 'none', cursor: 'pointer',
                      fontFamily: FONT, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                      background: on ? 'rgba(255,255,255,0.45)' : 'transparent',
                      boxShadow: on ? 'inset 0 1px 0 rgba(255,255,255,0.8), 0 1px 4px rgba(61,58,55,0.08)' : 'none',
                      color: on ? '#CF6526' : 'rgba(61,58,55,0.45)', transition: 'all .14s',
                    }}>{label}</button>
                  );
                })}
              </div>
              {/* Body */}
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: panel === 'inspector' ? 'auto' : 'hidden' }}>
                {panel === 'inspector'
                  ? <Inspector node={selInfo ? selInfo.node : null} depth={selDepth} onSize={setNodeSize} onNodeStyle={setNodeStyle} />
                  : <MarkdownSidebar tree={tree} onTreeChange={(newRoot) => setTree(() => newRoot)} />}
              </div>
            </React.Fragment>
          )}
        </div>
      )}
    </div>
  );
}
