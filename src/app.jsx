// app.jsx — Mindmap UI primitives (icons, toolbar, node, inspector)
import React, { useState, useRef, useEffect } from 'react';
import { FONT, BG_CREAM } from './engine.jsx';

export const TEXT_PT = { small: 11, medium: 14, large: 32 };

// Per-depth organic asymmetric radius — "soft, imperfect" edges from the brief
const ORG_RADIUS = {
  root: '28px 24px 30px 22px',
  d1:   '22px 26px 20px 24px',
  leaf: '18px 20px 16px 22px',
};

// ── Icons (SF-Symbol-flavoured strokes) ─────────────────────────
const ic = (paths, vb = 18) => (props) => (
  <svg width="17" height="17" viewBox={`0 0 ${vb} ${vb}`} fill="none"
       stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
       strokeLinejoin="round" {...props}>{paths}</svg>
);
export const IconPlus    = ic(<><path d="M9 4v10M4 9h10"/></>);
export const IconTrash   = ic(<><path d="M3.5 5h11M7 5V3.5h4V5M6 5l.6 9h4.8L12 5"/></>);
export const IconMinus   = ic(<><path d="M4 9h10"/></>);
export const IconFit     = ic(<><path d="M3 6.5V3.5h3M15 6.5V3.5h-3M3 11.5v3h3M15 11.5v3h-3"/></>);
export const IconSidebar = ic(<><rect x="2.5" y="3.5" width="13" height="11" rx="2"/><path d="M11 3.5v11"/></>);
export const IconRecenter= ic(<><circle cx="9" cy="9" r="2"/><path d="M9 2v2.5M9 13.5V16M2 9h2.5M13.5 9H16"/></>);
export const IconChevron = ic(<><path d="M6 4l5 5-5 5"/></>, 18);
export const IconShare   = ic(<><path d="M9 11V3M6 5.5L9 2.5l3 3M4 9v5.5h10V9"/></>);
export const IconBack    = ic(<><path d="M11 4l-5 5 5 5"/></>);

// ── Toolbar button ──────────────────────────────────────────────
export function TBtn({ children, onClick, disabled, title, active }) {
  const [hover, setHover] = useState(false);
  return (
    <button title={title} onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        width: 30, height: 26, borderRadius: 9, border: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: active ? 'rgba(184,164,212,0.30)' : (hover && !disabled ? 'rgba(61,58,55,0.08)' : 'transparent'),
        color: disabled ? 'rgba(61,58,55,0.30)' : (active ? '#7A5C9A' : 'rgba(61,58,55,0.72)'),
        cursor: disabled ? 'default' : 'pointer', transition: 'background .12s', padding: 0,
      }}>{children}</button>
  );
}
export const TSep = () => <div style={{ width: 1, height: 18, background: 'rgba(61,58,55,0.14)', margin: '0 5px' }} />;

// ── Node ────────────────────────────────────────────────────────
// Parse raw text: lines starting with `> ` become the title (joined), rest is body
function parseNodeText(raw) {
  const lines = raw.split('\n');
  const titleLines = [], bodyLines = [];
  for (const l of lines) {
    if (l.startsWith('> ')) titleLines.push(l.slice(2));
    else bodyLines.push(l);
  }
  return { label: titleLines.join(' ').trim(), body: bodyLines.join('\n').trim() };
}

// Reconstruct edit text from stored label + body
function toEditText(label, body) {
  const titlePart = label ? `> ${label}` : '';
  const bodyPart = body || '';
  return [titlePart, bodyPart].filter(Boolean).join('\n');
}

export function NodeView({ node, p, color, selected, editing, onSelect, onStartEdit, onCommit, onAddChild, onAddSibling }) {
  const inputRef = useRef(null);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    if (editing && inputRef.current) {
      const el = inputRef.current;
      el.focus();
      // place cursor at end
      const r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(r);
    }
  }, [editing]);

  const doCommit = () => {
    const raw = inputRef.current?.innerText ?? '';
    const { label, body } = parseNodeText(raw);
    onCommit(node.id, label, body);
  };

  const depth = p.depth;
  const fs = 32;
  const padScale = fs / 14;
  const hasLabel = node.label && node.label.trim();
  const onLine = depth > 0 && (node.style === 'on' || (!hasLabel && node.body && node.body.trim()));
  const hasBody = node.body && node.body.trim();

  const editor = editing ? (
    <div ref={inputRef} contentEditable suppressContentEditableWarning
      onMouseDown={(e) => e.stopPropagation()}
      onBlur={doCommit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); onCommit(node.id, node.label, node.body || ''); }
        if (e.key === 'Enter' && e.shiftKey) { /* allow newline */ return; }
        if (e.key === 'Enter') { e.preventDefault(); doCommit(); }
      }}
      style={{
        outline: 'none', cursor: 'text', whiteSpace: 'pre-wrap', width: '100%',
        fontSize: 14, fontWeight: 400, lineHeight: 1.6,
        background: 'rgba(255,255,255,0.92)', borderRadius: 8,
        padding: '8px 10px', boxSizing: 'border-box',
        border: '1.5px solid rgba(184,164,212,0.6)', minHeight: '3em',
      }}>{toEditText(node.label, node.body)}</div>
  ) : null;

  const titleBlock = hasLabel ? node.label : null;
  const bodyBlock = hasBody ? (
    <div style={{ whiteSpace: 'pre-wrap', fontWeight: 400, fontSize: 14, color: '#3D3A37' }}>{node.body}</div>
  ) : null;

  const common = {
    position: 'absolute', left: p.x, top: p.y, transform: 'translate(-50%,-50%)',
    fontFamily: FONT, fontSize: fs, lineHeight: 1.35,
    display: 'inline-block', width: 'max-content', minWidth: '5em', maxWidth: '10em', hyphens: 'auto',
    cursor: 'default', userSelect: 'none', transition: 'box-shadow .14s ease, transform .14s ease',
    zIndex: selected ? 5 : 2,
  };

  // ── On-connection (on-line) style ──
  if (onLine) {
    return (
      <div onMouseDown={(e) => { e.stopPropagation(); onSelect(node.id); }}
        onDoubleClick={(e) => { e.stopPropagation(); onStartEdit(node.id); }}
        style={{
          ...common, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 * padScale,
          padding: `${3 * padScale}px ${6 * padScale}px`, borderRadius: 12,
          background: selected ? 'rgba(184,164,212,0.22)' : 'transparent',
          boxShadow: selected ? '0 0 0 1.5px #7A5C9A' : 'none',
          color: depth === 1 ? color : '#3D3A37', fontWeight: depth === 1 ? 700 : 500,
          textShadow: '0 0 4px #FBF6EC, 0 0 4px #FBF6EC, 0 0 4px #FBF6EC',
          textAlign: 'center',
        }}>
        {editing ? editor : <>{titleBlock}{titleBlock && <div style={{ height: Math.max(2.5, fs * 0.16), width: '100%', minWidth: 18, background: color, borderRadius: 2 }} />}{bodyBlock}</>}
      </div>
    );
  }

  // ── Between-connection (boxed) style ──
  let style;
  if (depth === 0)      style = { bg: color, fg: '#FFFFFF', fw: 700, padV: 13, padH: 22, border: 'none', radius: ORG_RADIUS.root };
  else if (depth === 1) style = { bg: 'transparent', fg: '#3D3A37', fw: 700, padV: 9,  padH: 17, border: 'none', radius: ORG_RADIUS.d1 };
  else                  style = { bg: 'transparent', fg: '#3D3A37', fw: 500, padV: 7,  padH: 14, border: 'none', radius: ORG_RADIUS.leaf };

  const ring = selected
    ? `0 0 0 3px #7A5C9A`
    : hover
      ? `0 0 0 2px rgba(184,164,212,0.7)`
      : 'none';

  return (
    <div
      onMouseDown={(e) => { e.stopPropagation(); onSelect(node.id); }}
      onDoubleClick={(e) => { e.stopPropagation(); onStartEdit(node.id); }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ ...common, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, background: depth === 0 ? BG_CREAM : 'transparent', position: 'absolute', borderRadius: 12, boxShadow: ring, transition: 'box-shadow .12s', padding: '4px' }}>
      {editing ? editor : <>
        {/* title pill — colored block, hidden when empty */}
        {titleBlock && (
          <div style={{
            background: style.bg, color: style.fg, fontWeight: style.fw,
            padding: `${style.padV * padScale}px ${style.padH * padScale}px`,
            borderRadius: style.radius,
            textAlign: 'center', letterSpacing: depth === 0 ? '-0.01em' : 0,
            overflowWrap: 'break-word', wordBreak: 'break-word', whiteSpace: 'pre-wrap',
            width: '100%', boxSizing: 'border-box',
            textShadow: depth === 0 ? 'none' : '0 0 4px #FBF6EC, 0 0 4px #FBF6EC, 0 0 4px #FBF6EC',
          }}>
            {titleBlock}
          </div>
        )}
        {/* body — floats below, outside the pill */}
        {bodyBlock && (
          <div style={{
            fontSize: 14, fontWeight: 400, color: '#3D3A37', textAlign: 'left',
            overflowWrap: 'break-word', wordBreak: 'break-word',
            width: '100%', boxSizing: 'border-box',
            textShadow: '0 0 4px #FBF6EC, 0 0 4px #FBF6EC, 0 0 4px #FBF6EC',
          }}>
            {bodyBlock}
          </div>
        )}
      </>}
      {/* hover buttons */}
      {hover && !editing && (<>
        <button
          onMouseDown={(e) => { e.stopPropagation(); onAddChild(); }}
          title="Add child"
          style={{
            position: 'absolute', right: -18, top: '50%', transform: 'translateY(-50%)',
            width: 24, height: 24, borderRadius: '50%', border: 'none',
            background: '#B8A4D4', color: '#fff', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, lineHeight: 1, padding: 0, zIndex: 10,
            boxShadow: '0 2px 6px rgba(61,58,55,0.18)',
          }}>+</button>
        {p.depth > 0 && <button
          onMouseDown={(e) => { e.stopPropagation(); onAddSibling(); }}
          title="Add sibling"
          style={{
            position: 'absolute', bottom: -18, left: '50%', transform: 'translateX(-50%)',
            width: 24, height: 24, borderRadius: '50%', border: 'none',
            background: '#B8A4D4', color: '#fff', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, lineHeight: 1, padding: 0, zIndex: 10,
            boxShadow: '0 2px 6px rgba(61,58,55,0.18)',
          }}>↓</button>}
      </>)}
    </div>
  );
}

// ── Inspector pieces ────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(61,58,55,0.08)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(61,58,55,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 11 }}>{title}</div>
      {children}
    </div>
  );
}
function Segmented({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', background: 'rgba(61,58,55,0.07)', borderRadius: 9, padding: 2, gap: 2 }}>
      {options.map((o) => {
        const on = value === o.v;
        return (
          <button key={o.v} onClick={() => onChange(o.v)} style={{
            flex: 1, height: 26, border: 'none', borderRadius: 7, cursor: 'pointer',
            fontFamily: FONT, fontSize: 12.5, fontWeight: on ? 700 : 500,
            background: on ? '#FFFFFF' : 'transparent',
            color: on ? '#3D3A37' : 'rgba(61,58,55,0.55)',
            boxShadow: on ? '0 1px 3px rgba(61,58,55,0.12)' : 'none',
            transition: 'color .12s',
          }}>{o.l}</button>
        );
      })}
    </div>
  );
}
function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
      <span style={{ fontSize: 12.5, color: 'rgba(61,58,55,0.72)' }}>{label}</span>
      {children}
    </div>
  );
}
function OptionRow({ title, desc, selected, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
      padding: '8px 10px', borderRadius: 10, border: 'none', cursor: 'pointer', marginBottom: 4,
      background: selected ? 'rgba(184,164,212,0.22)' : 'transparent', fontFamily: FONT,
    }}>
      <div style={{ width: 16, height: 16, borderRadius: '50%', boxSizing: 'border-box', flexShrink: 0,
        border: selected ? '5px solid #7A5C9A' : '1.5px solid rgba(61,58,55,0.30)' }} />
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#3D3A37' }}>{title}</div>
        {desc && <div style={{ fontSize: 11, color: 'rgba(61,58,55,0.5)', marginTop: 1 }}>{desc}</div>}
      </div>
    </button>
  );
}

export function Inspector({ node, depth, onSize, onNodeStyle }) {
  const kind = node ? (depth === 0 ? 'Central topic' : depth === 1 ? 'Main branch' : 'Subtopic') : null;
  const cur = node ? (node.size || 'medium') : 'medium';
  const curStyle = node ? (node.style || 'between') : 'between';
  return (
    <div>
      {node ? (
        <React.Fragment>
          <Section title="Node">
            <div style={{ fontSize: 14, fontWeight: 700, color: '#3D3A37', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.label}</div>
            <div style={{ fontSize: 12, color: 'rgba(61,58,55,0.5)' }}>{kind}{node.children && node.children.length ? ` · ${node.children.length} children` : ''}</div>
          </Section>

          <Section title="Text Size">
            <Segmented
              options={[{ v: 'small', l: 'Small' }, { v: 'medium', l: 'Medium' }, { v: 'large', l: 'Large' }]}
              value={cur} onChange={onSize} />
            <div style={{ fontSize: 11, color: 'rgba(61,58,55,0.5)', marginTop: 9 }}>
              Label size for this node · <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{TEXT_PT[cur]} pt</span>
            </div>
          </Section>

          {depth > 0 && (
            <Section title="Node Style">
              <OptionRow title="Between connection" desc="Boxed node joined by lines"
                selected={curStyle === 'between'} onClick={() => onNodeStyle('between')} />
              <OptionRow title="On connection" desc="Label rides on the branch line"
                selected={curStyle === 'on'} onClick={() => onNodeStyle('on')} />
            </Section>
          )}
        </React.Fragment>
      ) : (
        <div style={{ padding: '16px', fontSize: 12.5, color: 'rgba(61,58,55,0.5)', lineHeight: 1.55 }}>
          Select a node to edit its text size and style. Colors are assigned automatically by branch.
        </div>
      )}
    </div>
  );
}
