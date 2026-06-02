// engine.jsx — mindmap data model, radial layout, geometry, colors, library
// Exports: FONT, SYS_COLORS, BRANCH_PALETTE, BRANCH_INK, BG_CREAM, ROOT_NODE,
//          makeLibrary, computeLayout, computeColors, handDrawnCurve,
//          walkSubtree, findNode, cloneTree, countNodes

// Friendly handwritten sans-serif (loaded via Google Fonts in index.html)
export const FONT = '"Kalam", "Patrick Hand", "Comic Neue", -apple-system, "Helvetica Neue", cursive';

// Warm, off-white creamy background
export const BG_CREAM = '#FBF6EC';

// Charcoal-grey hand-drawn ink for connectors
export const BRANCH_INK = '#3D3A37';

// Soft pastel palette — lavender, peach, salmon, mint
export const SYS_COLORS = {
  lavender: '#C5B0DD',
  peach:    '#FFC9A4',
  salmon:   '#F4A5A5',
  mint:     '#B8E0CD',
};

// Slightly deeper mauve — anchors the root node visually
export const ROOT_NODE = '#D97756';

// Branch fills are auto-assigned in this order (root uses ROOT_NODE)
export const BRANCH_PALETTE = [
  SYS_COLORS.lavender, SYS_COLORS.peach, SYS_COLORS.salmon, SYS_COLORS.mint,
];

let _uid = 0;
const nid = () => 'n' + (++_uid);

// build a tree: tdoc('Root', [['Branch', ['leaf', 'leaf']], ...])
function tdoc(label, branches) {
  return {
    id: nid(), label,
    children: branches.map(([bl, lvs]) => ({
      id: nid(), label: bl,
      children: (lvs || []).map((l) => ({ id: nid(), label: l })),
    })),
  };
}

// ── Library of sample mindmaps ──────────────────────────────────
export function makeLibrary() {
  _uid = 0;
  return [
    { id: 'd1', edited: 'Edited 2 hours ago', tree: tdoc('Trip to Japan', [
      ['Itinerary', ['Tokyo', 'Kyoto', 'Osaka']],
      ['Food', ['Ramen', 'Sushi', 'Street eats']],
      ['Budget', ['Flights', 'Hotels', 'Daily spend']],
      ['Transit', ['JR Pass', 'Metro', 'Taxi']],
      ['Packing', ['Clothes', 'Adapters', 'Docs']],
    ]) },
    { id: 'd2', edited: 'Edited yesterday', tree: tdoc('Product Launch', [
      ['Marketing', ['Email', 'Social', 'Press']],
      ['Engineering', ['API', 'Web app', 'QA']],
      ['Timeline', ['Alpha', 'Beta', 'GA']],
      ['Pricing', ['Free', 'Pro', 'Team']],
    ]) },
    { id: 'd3', edited: 'Edited 3 days ago', tree: tdoc('2026 Goals', [
      ['Health', ['Run 10k', 'Sleep', 'Cook more']],
      ['Career', ['Promotion', 'Learn Rust', 'Mentor']],
      ['Finance', ['Save 20%', 'Invest', 'Budget']],
      ['Travel', ['Japan', 'Portugal', 'Local trips']],
    ]) },
    { id: 'd4', edited: 'Edited last week', tree: tdoc('Reading List', [
      ['Fiction', ['Dune', 'Circe', 'Project Hail Mary']],
      ['Technical', ['SICP', 'DDIA', 'Pragmatic Prog']],
      ['Design', ['The Design of…', 'Refactoring UI']],
    ]) },
    { id: 'd5', edited: 'Edited last week', tree: tdoc('Home Renovation', [
      ['Kitchen', ['Cabinets', 'Counters', 'Appliances']],
      ['Living room', ['Floors', 'Paint', 'Lighting']],
      ['Budget', ['Quotes', 'Permits', 'Buffer']],
      ['Schedule', ['Phase 1', 'Phase 2', 'Final']],
    ]) },
    { id: 'd6', edited: 'Edited 2 weeks ago', tree: tdoc('Startup Idea', [
      ['Market', ['TAM', 'Competitors', 'ICP']],
      ['Product', ['MVP', 'Roadmap', 'Moat']],
      ['Team', ['Founders', 'Hires', 'Advisors']],
    ]) },
  ];
}

// ── Tree helpers ────────────────────────────────────────────────
export function cloneTree(n) { return { ...n, children: (n.children || []).map(cloneTree) }; }
export function findNode(root, id, parent = null) {
  if (root.id === id) return { node: root, parent };
  for (const c of root.children || []) { const hit = findNode(c, id, root); if (hit) return hit; }
  return null;
}
export function walkSubtree(node, fn) { fn(node); (node.children || []).forEach((c) => walkSubtree(c, fn)); }
export function countNodes(root) { let n = 0; walkSubtree(root, () => n++); return n; }

// ── Auto colors: root = soft mauve, each branch a pastel, descendants inherit ─
export function computeColors(root) {
  const map = { [root.id]: ROOT_NODE };
  (root.children || []).forEach((b, i) => {
    const col = BRANCH_PALETTE[i % BRANCH_PALETTE.length];
    walkSubtree(b, (n) => { map[n.id] = col; });
  });
  return map;
}

// ── Horizontal layout (depth → x, leaf bands → y) ───────────────
// `isInline(n)` (optional): nodes that render as compact on-connector text
// rather than boxes — they take a fraction of the normal horizontal gap.
export function computeLayout(root, cx, cy, ringGap, isInline) {
  const inline = isInline || (() => false);
  const INLINE_GAP = 0.62; // inline notes nest closer than a full ring step, but clear the parent box
  function leaves(n) {
    if (!n.children || !n.children.length || n.collapsed) {
      n._leaves = inline(n) ? 0.55 : 1;
      return n._leaves;
    }
    n._leaves = n.children.reduce((s, c) => s + leaves(c), 0);
    return n._leaves;
  }
  leaves(root);
  const leafGap = ringGap * 0.5;
  const totalH = root._leaves * leafGap;
  const pos = { [root.id]: { x: cx, y: cy, angle: 0, depth: 0 } };
  // x accumulates per-node so inline notes advance less than a full ring step
  function assign(node, y0, y1, depth, px) {
    const kids = node.collapsed ? [] : (node.children || []);
    let y = y0;
    for (const k of kids) {
      const frac = k._leaves / node._leaves;
      const ky0 = y, ky1 = y + (y1 - y0) * frac, ky = (ky0 + ky1) / 2;
      const kx = px + ringGap * (inline(k) ? INLINE_GAP : 1);
      pos[k.id] = { x: kx, y: ky, angle: Math.atan2(ky - cy, kx - cx), depth };
      assign(k, ky0, ky1, depth + 1, kx);
      y = ky1;
    }
  }
  assign(root, cy - totalH / 2, cy + totalH / 2, 1, cx);
  return pos;
}

// ── Connector geometry: horizontal S-curve bezier ───────────────
// Control points pull horizontally so the curve leaves the parent
// heading right and arrives at the child heading right — correct for
// a left-to-right tree layout.
// Deterministic pseudo-random in [-1,1] from a seed — stable across renders.
function seeded(seed) {
  let h = 2166136261 >>> 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h += 0x6D2B79F5; let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

export function handDrawnCurve(p, c, seed = 0) {
  const dx = c.x - p.x, dy = c.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  // unit normal — jitter perpendicular to the line so wobble reads as a sketch
  const nx = -dy / len, ny = dx / len;
  const rnd = seeded(seed);
  const j = Math.min(len * 0.06, 7); // jitter amplitude, capped
  const pull = Math.max(Math.abs(dx) * 0.5, 60);
  // two control points pushed off the straight line by a little hand-jitter
  const t1x = p.x + pull + nx * j * rnd(), t1y = p.y + ny * j * rnd();
  const t2x = c.x - pull + nx * j * rnd(), t2y = c.y + ny * j * rnd();
  // endpoints nudged slightly too, like a pen not landing exactly
  const e = Math.min(len * 0.015, 1.6);
  const sx = p.x + nx * e * rnd(), sy = p.y + ny * e * rnd();
  const ex = c.x + nx * e * rnd(), ey = c.y + ny * e * rnd();
  return `M ${sx} ${sy} C ${t1x} ${t1y} ${t2x} ${t2y} ${ex} ${ey}`;
}

// Stop short of the child node so the arrowhead lands cleanly on its left edge
export function handDrawnCurveTo(p, c, inset) {
  return handDrawnCurve(p, { x: c.x - inset, y: c.y });
}
