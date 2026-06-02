# Mindmap — ReactJS Web Implementation

**Date:** 2026-06-02
**Status:** Approved
**Source bundle:** `https://api.anthropic.com/v1/design/h/JlGQn_xkf5Gqyrm5Js7twg?open_file=Mindmap.html`

## Goal

Recreate the macOS mindmap app from the design handoff bundle as a real ReactJS web app, using Vite + React 18 + JSX (no TypeScript). Pixel-identical to the prototype.

## Source files (from the handoff)

| Source | Purpose | Action |
|---|---|---|
| `Mindmap.html` | Host page (CDN React + Babel, then JSX scripts) | Replace with `index.html` + Vite entry |
| `engine.jsx` | Data model, radial layout, geometry, library | Move to `src/engine.jsx`, convert global exports to ES modules |
| `app.jsx` | NodeView, Inspector, Segmented, icons | Move to `src/app.jsx` |
| `gallery.jsx` | Library page, MiniMap thumbnail | Move to `src/gallery.jsx` |
| `main.jsx` | Root, Editor, Stage (routing + window chrome) | Split: editor → `src/editor.jsx`, root/stage → `src/main.jsx` |
| `macos-window.jsx` | Discarded Tahoe starter | Skip (author explicitly discarded it; chrome is hand-built in `main.jsx`) |

## Target project layout

```
mindmapweb/
├── package.json           # vite, react, react-dom
├── vite.config.js
├── index.html             # Vite entry, <div id="root">
└── src/
    ├── main.jsx           # Entry: mounts <Stage />
    ├── engine.jsx         # Data + layout + colors + sample library
    ├── app.jsx            # NodeView, Inspector, Segmented, icons, TBtn, TSep
    ├── gallery.jsx        # Gallery + MiniMap + MapCard + NewCard
    └── editor.jsx         # Editor (extracted from main.jsx)
```

## Conversion rules

1. `const { useState, useRef, ... } = React;` → `import { useState, useRef, ... } from 'react';`
2. `Object.assign(window, { FOO, BAR })` → `export { FOO, BAR }`
3. `ReactDOM.createRoot(...).render(<Stage />)` → in `src/main.jsx`:
   ```js
   import { createRoot } from 'react-dom/client';
   createRoot(document.getElementById('root')).render(<Stage />);
   ```
4. Same DOM, same inline styles, same `VW/VH/CX/CY/RING` constants. No visual changes.
5. Keep `Stage` as a fixed-size window scaled to fit the viewport — the macOS feel is the point.

## Features to preserve

User-validated scope (from `chats/chat1.md`):

- **Gallery:** 6 sample mindmaps, search field, "+ New" toolbar button, "New Mindmap" tile, live radial minimap thumbnails
- **Editor:** radial auto-layout, tapered organic connectors, auto-assigned branch colors, per-node text size (Small / Medium 14 / Large 32), per-node style (Between / On connection), pan/zoom, fit-to-view, breadcrumbs back to gallery
- **Toolbar:** traffic lights, breadcrumb, add/delete child, zoom in/out, fit, share, inspector toggle
- **Keyboard:** Tab = add child, Backspace/Delete = remove, Enter = rename, double-click = rename
- **Inspector:** Node info, Text Size (per-node), Node Style (Between / On connection) — depth > 0 only

## Out of scope

User explicitly removed these during design iteration:

- Manual color picker (auto-assigned only, root graphite, branches cycle through macOS palette)
- "Connections" inspector section (curved/straight, thickness, taper)
- Free-drag node positioning (auto-layout only)
- `macos-window.jsx` Tahoe glass starter
- Persistence to disk (in-memory only, like the prototype)

## Persistence (added 2026-06-02)

User wants mindmaps saved to a real folder on disk. Implementation:

- **`src/fs.js`** — File System Access API + IndexedDB handle persistence
- Each mindmap = one file in the chosen folder, named `<id>.mindmap.json`
  - Format: `{ "edited": "...", "tree": { id, label, children: [...] } }`
- Directory handle stored in IndexedDB (`mindmapweb` DB, `handles` store, key `folder`)
- On reload: restore handle, request permission if needed, scan folder for `*.mindmap.json`
- **Auto-save:** debounced 500ms write of the open doc on every edit
- **New mindmap:** creates a new `<id>.mindmap.json` immediately
- **Delete:** removes the file from the folder (× button on hover, confirms first)
- **Change folder:** clears the handle, prompts for a new one; existing in-memory library stays until refresh

UI: a thin `FolderBar` above the gallery/editor chrome shows "📁 <folder name>" with a "Change…" button. Shows a warning banner if File System Access API isn't supported (Safari/Firefox).

**Browser support:** Chromium browsers on macOS (Chrome, Edge, Arc, Brave). Safari/Firefox show "in-memory only" banner.

**Keys:** Enter = add sibling (in addition to Tab = child).

## Testing / verification

1. `npm install` then `npm run dev` — Vite dev server starts, page loads
2. **Gallery:** 6 cards render + "New Mindmap" tile; search filters
3. **Navigation:** Click card → editor opens; click "Mindmaps" breadcrumb → gallery
4. **Edit:** Click selects, double-click renames, Tab adds child, Backspace removes (not root), Enter renames
5. **Inspector:** Per-node text size (Small/Medium/Large) and node style (Between/On) update only the selected node
6. **Canvas:** Drag to pan, ⌘+scroll to zoom, Fit button re-frames
7. **Visual:** macOS chrome (traffic lights, toolbar, breadcrumb), dot grid background, radial layout balanced
8. **No console errors**

## Risks

- **JSX → ESM conversion** is mechanical and low-risk (the source is already React).
- **Babel-standalone removal** is the only behavioral change — Vite uses SWC for transform, faster + production-ready.
- **No backend / persistence** — closing the tab loses edits. Matches the prototype.
- **Browser-only** — no SSR; the "macOS window" is a CSS-scaled div, not a native shell.
