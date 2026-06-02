// gallery.jsx — library page: minimap thumbnails + card grid
import React, { useState } from 'react';
import {
  FONT, BG_CREAM, BRANCH_INK, computeLayout, computeColors, walkSubtree, countNodes,
} from './engine.jsx';
import { IconPlus } from './app.jsx';

// ── Minimap thumbnail (re-uses the radial engine at small scale) ─
export function MiniMap({ tree, w = 248, h = 150 }) {
  const pos = computeLayout(tree, 0, 0, 42);
  const colors = computeColors(tree);
  const ps = Object.values(pos);
  const xs = ps.map((p) => p.x), ys = ps.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad = 22;
  const k = Math.min((w - pad * 2) / ((maxX - minX) || 1), (h - pad * 2) / ((maxY - minY) || 1));
  const ox = w / 2 - ((minX + maxX) / 2) * k, oy = h / 2 - ((minY + maxY) / 2) * k;
  const T = (p) => ({ x: ox + p.x * k, y: oy + p.y * k });

  const edges = [];
  walkSubtree(tree, (n) => (n.children || []).forEach((c) => edges.push([n, c])));

  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      {edges.map(([p, c]) => {
        const P = T(pos[p.id]), C = T(pos[c.id]);
        return <line key={c.id} x1={P.x} y1={P.y} x2={C.x} y2={C.y}
          stroke={BRANCH_INK} strokeWidth={pos[p.id].depth === 0 ? 1.6 : 1.1}
          strokeOpacity="0.55" strokeLinecap="round" />;
      })}
      {Object.entries(pos).map(([id, p]) => {
        const P = T(p);
        if (p.depth === 0) return <circle key={id} cx={P.x} cy={P.y} r="6" fill={colors[id]} />;
        if (p.depth === 1) return <circle key={id} cx={P.x} cy={P.y} r="4.5" fill={colors[id]} />;
        return <circle key={id} cx={P.x} cy={P.y} r="3" fill={BG_CREAM} stroke={colors[id]} strokeWidth="1.4" />;
      })}
    </svg>
  );
}

// ── Card ────────────────────────────────────────────────────────
function MapCard({ doc, onOpen, onDelete }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative', textAlign: 'left', padding: 0, background: 'transparent',
        fontFamily: FONT, display: 'flex', flexDirection: 'column',
        transform: hover ? 'translateY(-2px)' : 'none', transition: 'transform .14s',
      }}>
      {onDelete && hover && (
        <button title="Delete mindmap" onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${doc.tree.label}"? This removes the file from the folder.`)) onDelete(doc.id); }}
          style={{
            position: 'absolute', top: 8, right: 8, zIndex: 2, width: 24, height: 24, borderRadius: '50%',
            border: 'none', background: 'rgba(61,58,55,0.55)', color: '#fff', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, lineHeight: 1, padding: 0,
          }}>×</button>
      )}
      <button onClick={() => onOpen(doc.id)}
        style={{
          textAlign: 'left', padding: 0, border: 'none', cursor: 'pointer', background: 'transparent',
          fontFamily: FONT, display: 'flex', flexDirection: 'column',
        }}>
        <div style={{
          borderRadius: 16, overflow: 'hidden', background: '#FFFFFF',
          border: '1px solid rgba(61,58,55,0.10)',
          boxShadow: hover ? '0 10px 26px rgba(61,58,55,0.14)' : '0 2px 6px rgba(61,58,55,0.08)',
          transition: 'box-shadow .14s, transform .14s',
        }}>
          <div style={{ background: BG_CREAM, borderBottom: '1px solid rgba(61,58,55,0.06)' }}>
            <MiniMap tree={doc.tree} />
          </div>
          <div style={{ padding: '12px 15px 14px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#3D3A37', marginBottom: 2 }}>{doc.tree.label}</div>
            <div style={{ fontSize: 12, color: 'rgba(61,58,55,0.5)' }}>{countNodes(doc.tree)} nodes · {doc.edited}</div>
          </div>
        </div>
      </button>
    </div>
  );
}

// ── New-map card ────────────────────────────────────────────────
function NewCard({ onNew }) {
  const [hover, setHover] = useState(false);
  return (
    <button onClick={onNew} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        border: `1.5px dashed ${hover ? '#B8A4D4' : 'rgba(61,58,55,0.22)'}`,
        borderRadius: 16, cursor: 'pointer',
        background: hover ? 'rgba(184,164,212,0.10)' : 'transparent', fontFamily: FONT,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
        minHeight: 150 + 49, transition: 'all .14s',
      }}>
      <div style={{ width: 44, height: 44, borderRadius: '50%', background: hover ? '#B8A4D4' : 'rgba(61,58,55,0.06)',
        color: hover ? '#fff' : 'rgba(61,58,55,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .14s' }}>
        <IconPlus width="22" height="22" />
      </div>
      <span style={{ fontSize: 13.5, fontWeight: 700, color: hover ? '#7A5C9A' : 'rgba(61,58,55,0.65)' }}>New Mindmap</span>
    </button>
  );
}

// ── Trash item row ───────────────────────────────────────────────
function TrashRow({ item, onRestore, onPurge }) {
  const daysLeft = Math.ceil((item.deletedAt + 30 * 86400_000 - Date.now()) / 86400_000);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10,
      background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(61,58,55,0.08)', marginBottom: 8 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#3D3A37' }}>{item.tree.label || '(untitled)'}</div>
        <div style={{ fontSize: 11, color: 'rgba(61,58,55,0.45)', marginTop: 2 }}>Deleted · {daysLeft}d left</div>
      </div>
      <button onClick={() => onRestore(item.id)} style={{ ...btnSm, background: '#B8A4D4', color: '#fff' }}>Restore</button>
      <button onClick={() => { if (confirm('Permanently delete?')) onPurge(item.id); }} style={{ ...btnSm, background: 'rgba(61,58,55,0.08)', color: '#B85C5C' }}>Delete</button>
    </div>
  );
}
const btnSm = { border: 'none', borderRadius: 7, padding: '5px 11px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };

// ── Gallery page ────────────────────────────────────────────────
export function Gallery({ library, onOpen, onNew, onDelete, folderName, onChooseFolder, onChangeFolder, fsError,
  trash, trashOpen, onTrashToggle, onRestore, onPurge, onEmptyTrash }) {
  const [q, setQ] = useState('');
  const shown = library.filter((d) => d.tree.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: BG_CREAM, fontFamily: FONT }}>
      {/* toolbar */}
      <div style={{ height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 14px',
        background: 'rgba(251,246,236,0.85)', borderBottom: '1px solid rgba(61,58,55,0.10)' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#3D3A37' }}>Mindmaps</span>
        <div style={{ flex: 1 }} />
        {/* folder */}
        {folderName
          ? <button onClick={onChangeFolder} title={`Saving to: ${folderName}`} style={{
              display: 'flex', alignItems: 'center', gap: 5, height: 30, padding: '0 11px', borderRadius: 9,
              border: '1px solid rgba(61,58,55,0.15)', background: 'rgba(255,255,255,0.7)', color: '#3D3A37',
              fontFamily: FONT, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', marginRight: 8,
            }}>📁 {folderName}</button>
          : <button onClick={onChooseFolder} title="Choose a folder to save mindmaps" style={{
              display: 'flex', alignItems: 'center', gap: 5, height: 30, padding: '0 11px', borderRadius: 9,
              border: '1px dashed rgba(61,58,55,0.30)', background: 'transparent', color: 'rgba(61,58,55,0.6)',
              fontFamily: FONT, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', marginRight: 8,
            }}>📁 Choose folder…</button>
        }
        {/* trash toggle */}
        <button onClick={onTrashToggle} title="Trash" style={{
          display: 'flex', alignItems: 'center', gap: 5, height: 30, padding: '0 11px', borderRadius: 9, marginRight: 8,
          border: trashOpen ? 'none' : '1px solid rgba(61,58,55,0.15)',
          background: trashOpen ? 'rgba(184,164,212,0.25)' : 'transparent',
          color: trashOpen ? '#7A5C9A' : 'rgba(61,58,55,0.6)',
          fontFamily: FONT, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
        }}>
          🗑 Trash {trash && trash.length > 0 && <span style={{ background: '#B8A4D4', color: '#fff', borderRadius: 8, padding: '0 5px', fontSize: 11 }}>{trash.length}</span>}
        </button>
        {/* search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(61,58,55,0.07)', borderRadius: 9, padding: '5px 11px', width: 180, marginRight: 10 }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="5.5" cy="5.5" r="4" stroke="rgba(61,58,55,0.55)" strokeWidth="1.5"/><path d="M8.5 8.5l3 3" stroke="rgba(61,58,55,0.55)" strokeWidth="1.5" strokeLinecap="round"/></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search"
            style={{ border: 'none', outline: 'none', background: 'transparent', fontFamily: FONT, fontSize: 13, color: '#3D3A37', width: '100%' }} />
        </div>
        <button onClick={onNew} style={{
          display: 'flex', alignItems: 'center', gap: 5, height: 30, padding: '0 14px', borderRadius: 10, border: 'none',
          background: '#B8A4D4', color: '#FFFFFF', fontFamily: FONT, fontSize: 13, fontWeight: 700, cursor: 'pointer',
          boxShadow: '0 1px 2px rgba(61,58,55,0.10)',
        }}>
          <IconPlus width="14" height="14" /> New
        </button>
      </div>

      {/* body */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#F5EFE3', padding: '24px 28px' }}>
        {trashOpen ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(61,58,55,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1 }}>
                Trash · {trash.length} item{trash.length !== 1 ? 's' : ''} · deleted items removed after 30 days
              </div>
              {trash.length > 0 && <button onClick={() => { if (confirm('Empty trash? This cannot be undone.')) onEmptyTrash(); }}
                style={{ ...btnSm, background: 'rgba(61,58,55,0.08)', color: '#B85C5C' }}>Empty Trash</button>}
            </div>
            {trash.length === 0
              ? <div style={{ color: 'rgba(61,58,55,0.4)', fontSize: 13 }}>Trash is empty.</div>
              : trash.map((item) => <TrashRow key={item.id} item={item} onRestore={onRestore} onPurge={onPurge} />)
            }
          </>
        ) : (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(61,58,55,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>
              {shown.length} {shown.length === 1 ? 'Mindmap' : 'Mindmaps'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(248px, 1fr))', gap: 22 }}>
              <NewCard onNew={onNew} />
              {shown.map((d) => <MapCard key={d.id} doc={d} onOpen={onOpen} onDelete={onDelete} />)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
