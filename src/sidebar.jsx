// sidebar.jsx — Markdown sidebar: manual render to mindmap
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FONT } from './engine.jsx';

// ── Serialize tree → markdown ────────────────────────────────────
export function treeToMarkdown(node, depth = 0) {
  const indent = '  '.repeat(depth);
  const titleLine = node.label ? `${indent}- > ${node.label}` : `${indent}-`;
  const bodyLines = node.body
    ? node.body.split('\n').map((l) => `${indent}  ${l}`).join('\n')
    : '';
  const self = bodyLines ? `${titleLine}\n${bodyLines}` : titleLine;
  const kids = (node.children || [])
    .map((c) => treeToMarkdown(c, depth + 1))
    .join('\n');
  return kids ? `${self}\n${kids}` : self;
}

// ── Parse markdown → tree ────────────────────────────────────────
let _uid = 0;
const nid = () => 'md' + (++_uid);

export function markdownToTree(md, rootId) {
  const lines = md.split('\n');
  const stack = [];
  let rootNode = null;
  let bodyTarget = null;

  for (const raw of lines) {
    const listMatch = raw.match(/^(\s*)- (.*)$/);
    if (listMatch) {
      bodyTarget = null;
      const indentStr = listMatch[1];
      const depth = indentStr.length / 2;
      const content = listMatch[2].trim();
      const label = content.startsWith('> ') ? content.slice(2).trim() : content;
      const node = { id: nid(), label, body: undefined, children: [] };

      while (stack.length > 0 && stack[stack.length - 1].depth >= depth) stack.pop();

      if (stack.length === 0) {
        rootNode = node;
        if (rootId) node.id = rootId;
      } else {
        stack[stack.length - 1].node.children.push(node);
      }
      stack.push({ depth, node });
      bodyTarget = { node, indent: indentStr + '  ' };
    } else if (bodyTarget) {
      if (raw.startsWith(bodyTarget.indent)) {
        const line = raw.slice(bodyTarget.indent.length);
        bodyTarget.node.body = bodyTarget.node.body != null
          ? bodyTarget.node.body + '\n' + line
          : line;
      } else {
        bodyTarget = null;
      }
    }
  }

  const trim = (n) => {
    if (n.body != null) n.body = n.body.trim() || undefined;
    (n.children || []).forEach(trim);
  };
  if (rootNode) trim(rootNode);
  return rootNode;
}

// ── Sidebar component ────────────────────────────────────────────
export function MarkdownSidebar({ tree, onTreeChange }) {
  const rootId = tree.id;
  const [text, setText] = useState(() => treeToMarkdown(tree));
  const [error, setError] = useState(null);
  const [dirty, setDirty] = useState(false);
  const renderedMd = useRef(treeToMarkdown(tree));
  const isFocused = useRef(false);

  // sync canvas → sidebar only when sidebar is clean (no unrendered edits)
  useEffect(() => {
    if (isFocused.current || dirty) return;
    const md = treeToMarkdown(tree);
    if (md !== renderedMd.current) {
      renderedMd.current = md;
      setText(md);
      setError(null);
    }
  });

  const handleChange = useCallback((e) => {
    setText(e.target.value);
    setDirty(true);
    setError(null);
  }, []);

  const handleRender = useCallback(() => {
    try {
      const newRoot = markdownToTree(text, rootId);
      if (!newRoot) { setError('Nothing to render — add at least one node.'); return; }
      renderedMd.current = text;
      setDirty(false);
      setError(null);
      onTreeChange(newRoot);
    } catch (err) {
      setError(err.message);
    }
  }, [text, rootId, onTreeChange]);

  const handleKeyDown = useCallback((e) => {
    e.stopPropagation();
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleRender();
    }
  }, [handleRender]);

  return (
    <div style={{
      width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column',
      borderLeft: '1px solid rgba(61,58,55,0.10)',
      background: '#F5EFE3', fontFamily: FONT,
    }}>
      {/* header */}
      <div style={{
        height: 44, flexShrink: 0, display: 'flex', alignItems: 'center',
        padding: '0 12px', borderBottom: '1px solid rgba(61,58,55,0.10)', gap: 8,
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(61,58,55,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1 }}>Markdown</span>
        <button
          onClick={handleRender}
          title="Render to mindmap (⌘Enter)"
          style={{
            height: 28, padding: '0 14px', borderRadius: 8, border: 'none',
            background: dirty ? '#D97756' : 'rgba(61,58,55,0.10)',
            color: dirty ? '#fff' : 'rgba(61,58,55,0.4)',
            fontFamily: FONT, fontSize: 12.5, fontWeight: 700, cursor: dirty ? 'pointer' : 'default',
            transition: 'all .15s',
          }}>
          Render
        </button>
      </div>

      {/* hint */}
      <div style={{ padding: '5px 12px', borderBottom: '1px solid rgba(61,58,55,0.07)', fontSize: 11, color: 'rgba(61,58,55,0.45)', flexShrink: 0 }}>
        <code style={{ fontFamily: 'monospace' }}>- {'>'} Title</code> · body below · 2-space indent for children · <kbd style={{ fontSize: 10 }}>⌘↵</kbd> to render
      </div>

      {error && (
        <div style={{ padding: '5px 12px', background: '#FDE8E8', fontSize: 11, color: '#B85C5C', flexShrink: 0 }}>{error}</div>
      )}

      <textarea
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => { isFocused.current = true; }}
        onBlur={() => { isFocused.current = false; }}
        spellCheck={false}
        style={{
          flex: 1, resize: 'none', border: 'none', outline: 'none',
          background: 'transparent', fontFamily: '"Fira Mono", "Consolas", monospace',
          fontSize: 12.5, lineHeight: 1.65, color: '#3D3A37',
          padding: '14px', boxSizing: 'border-box',
        }}
      />
    </div>
  );
}
