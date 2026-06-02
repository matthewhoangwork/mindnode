// editor.jsx — Editor shell: canvas, nodes, connectors, inspector, toolbar
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { FONT, BG_CREAM, BRANCH_INK, computeLayout, computeColors, handDrawnCurve, walkSubtree, findNode, cloneTree } from './engine.jsx';
import {
  NodeView, Inspector, TBtn, TSep, IconPlus,
  IconChevron, IconBack, IconSidebar,
} from './app.jsx';
import { MarkdownSidebar } from './sidebar.jsx';

const VW = 2400, VH = 1800, CX = 300, CY = VH / 2, RING = 380;

export function Editor({ doc, setTree, onClose }) {
  const tree = doc.tree;
  const [sel, setSel] = useState(tree.id);
  const [editing, setEditing] = useState(null);
  const [panel, setPanel] = useState(null); // null | 'inspector' | 'markdown'
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const canvasRef = useRef(null);
  const pan = useRef(null);

  // A node with no title/label but with a description is an "inline" note.
  // It keeps its place in the layout (so spacing/connectors stay correct) but is
  // drawn as plain text riding on the connector instead of as a box — the line
  // runs parent → (label) → child as one continuous connection.
  const isInline = (n) => !(n.label && n.label.trim()) && !!(n.body && n.body.trim());

  const pos = useMemo(() => computeLayout(tree, CX, CY, RING, isInline), [tree]);
  const colors = useMemo(() => computeColors(tree), [tree]);
  const posRef = useRef(pos);
  posRef.current = pos;

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

  const update = (fn) => setTree((t) => { const n = cloneTree(t); fn(n); return n; });
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
  walkSubtree(tree, (n) => {
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
        <TBtn title="Panel" active={!!panel} onClick={() => setPanel((p) => (p ? null : 'inspector'))}><IconSidebar /></TBtn>
      </div>

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
                    maxWidth: 220, textAlign: 'left', whiteSpace: 'pre-wrap',
                    overflowWrap: 'break-word', wordBreak: 'break-word',
                    cursor: 'default', zIndex: 3, padding: '5px 11px', borderRadius: 14,
                    background: BG_CREAM, border: 'none',
                    boxShadow: on ? '0 0 0 3px #CF6526' : 'none',
                  }}>{il.body}</div>
              );
            })}
            {(() => {
              const out = [];
              walkSubtree(tree, (n) => {
                const p = pos[n.id]; if (!p) return;
                if (isInline(n) && editing !== n.id) return; // drawn as on-connector label unless being edited
                out.push(<NodeView key={n.id} node={n} p={p} color={colors[n.id]}
                  selected={sel === n.id} editing={editing === n.id}
                  onSelect={setSel} onStartEdit={setEditing} onCommit={commitLabel}
                  onAddChild={() => { setSel(n.id); addChild(); }}
                  onAddSibling={() => { setSel(n.id); addSibling(); }} />);
              });
              return out;
            })()}
          </div>
        </div>

      </div>

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
        </div>
      )}
    </div>
  );
}
