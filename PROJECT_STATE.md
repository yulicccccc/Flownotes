# Project State: FlowNotes (v2.7.0)

## Current Version & Status
- **Current Version**: `v2.7.0`
- **Latest Releases**:
  - `v2.7.0`:
    - **Freeform Spatial Whiteboard Default (`layoutMode = "free"`)**: Preserves exact `(x, y)` coordinates when double-clicking, pasting (`Ctrl+V`), pressing `Tab`/`Enter`, or folding/unfolding so notes can be freely clustered ("放到一坨") without snapping into a tree column unless `M` (`🧭`) is pressed.
    - **Direct On-Canvas Rich Text & Image Cards (`<foreignObject class="node-card-fo">`)**: Renders formatted sentences (inline 🔴 red, 🟢 green, 🟡 yellow highlight, multi-line text) and 📸 screenshots directly inside rectangular cards on the canvas, with double-click inline editing and on-canvas `#selection-quick-bubble` popups.
    - **Rectangle-Edge Sticky Arrow Intersection (`getRectEdgePoint`)**: Arrows dynamically compute exact border intersection points using each card's measured width/height (`_cardW`, `_cardH`).
    - **"默认先 make 的是父" Foldable Arrow Linking (`connectNodesWithParentRule` & `.node-connect-port`)**: Selecting 2+ cards (`Shift+Click` or marquee box) and pressing `L` (or clicking `➔`) connects them with a foldable parent-child arrow where the earlier-created (`createdAt`) card is automatically the Parent (`Parent ➔ Child`). Also added a right-edge `.node-connect-port` (`➔`) handle for mouse drag-to-connect.
    - **Zero-Lag Input Debounce & IME Guard (`scheduleSaveGraph` + `isImeComposing`)**: Eliminated synchronous `JSON.stringify` / `localStorage.setItem` / `renderOrganizerUI` stalls on every keystroke.
  - `v2.6.0`: SVG directional arrow markers (`#arrow-marker`), `#selection-quick-bubble`, `Ctrl+Shift+R/G/H/\` shortcuts, and clipboard screenshot/text paste (`initClipboardPaste` + `compressImage`).
- **Live Site**: https://flownotes-eze.pages.dev
- **GitHub Repository**: https://github.com/yulicccccc/Flownotes
- **Cloudflare Deployment Script**: `FlowNotes_V2.7.0_flownotes-eze.pages.dev_一键更新网站.bat`

## Finalized & Locked Features
1. **Freeform Spatial Dumping ("放到一坨", v2.7.0)**: `layoutMode = "free"` default; no forced `tidyLayout()` or accidental proximity reparenting when placing cards near each other.
2. **Direct On-Canvas Rich Text & Image Cards + Inline Editing (v2.7.0)**: `<foreignObject>` cards directly display 🔴 red, 🟢 green, 🟡 yellow highlights, and 📸 images on the canvas; double-click to edit and highlight directly on the canvas.
3. **"默认先 make 的是父" Foldable Arrow Connections (v2.7.0)**: Multi-select + `L` key sorts by `createdAt` ascending so earlier-created card = Parent (`Parent ➔ Child`), plus `.node-connect-port` drag handle; all arrow-connected parents support fold/unfold (`+N` / `−`).
4. **Dynamic Directional Arrows (v2.6.0 - v2.7.0)**: Sticky tracking SVG arrowheads stopping at exact rectangular card boundaries.
5. **Zero-Friction Color & Highlight Suite (v2.6.0 - v2.7.0)**: `Ctrl+Shift+R/G/H/\` and selection floating bubble (`#selection-quick-bubble` mounted on `document.body`).
6. **Global Clipboard Image & Text Paste (v2.6.0 - v2.7.0)**: `Ctrl+V` spawns independent floating cards at mouse cursor coordinates without camera jumps.
7. **Zero-Lag Debounced Persistence & IME Guard (v2.7.0)**: 360ms debounced `scheduleSaveGraph` + IME `isImeComposing` guard.
8. **Single Source of Truth Tree Links (v2.5.4)**: All tree links dynamically derived from `node.parentId` in `cleanLinks()`.
9. **Full Rich Text List & Formatting Controls (v2.5.0)**: `1.`, `-`, `🧹` clean formatting.
10. **Marquee Box Multi-Selection Engine (v2.4.0)**: `Shift + Drag` / `🔳` box selection + `Shift + Click` multi-selection.
11. **Multi-Map Organizer (🗂️ 图谱组织器)** & **Anti-Loss GitHub Gist Sync**.

## Key Files Architecture
- `public/index.html`: Entry point with cache-busting version params (`?v=2.7.0`).
- `public/app.js`: Main application logic (D3 freeform & tree canvas, `<foreignObject>` rich cards, rectangle-ray arrow tracking, `createdAt` parent rule, debounced persistence).
- `public/index.css`: Styling for `.canvas-note-card`, `.node-connect-port`, `#selection-quick-bubble`, and themes.
- `PRD.md`: Full product requirements & locked features list.
- `CHANGELOG.md`: Detailed release notes per version.
