# Project State: FlowNotes (v3.1.1)

## Current Version & Status
- **Current Version**: `v3.1.1`
- **Latest Releases**:
  - `v3.1.1`:
    - **Fixed Initial Freeform Card Transform Bug (`refreshNodeStyles` + `updateD3Graph`)**: Fixed the bug where `simulation.stop()` in `free` mode prevented the initial `tick` (`renderPositions`), leaving `<g class="node-group">` at `(0,0)` while only the `<line>` arrows were visible in the center of the canvas.
    - **Fixed Overlapped Card Inverted Arrow Stub (`getLinkCoords`)**: Hides zero/negative-length arrows when two cards touch or overlap, preventing floating reversed arrowheads.
    - **Cleaned Default Demo Nodes (`DEFAULT_NODES`, `DEFAULT_LINKS`, `sanitizeGraph`)**: Removed the confusing default dashed relation link (`node_2 -> node_4`) and spaced out the initial 4 demo cards cleanly.
  - `v3.1.0`:
    - **Global Instant Search (`Ctrl + K`, `#searchInput`, `#quick-open`) & Hierarchical Outline Filter (`#outline-filter`)**: Cross-map instant search with `🔴`/`🟢`/`⭐`/`待办` filters, auto-unfolding ancestors (`unfoldAncestorsOf`) on jump.
    - **One-Click Copy Outline as Markdown (`copyOutlineAsMarkdown` / `#btn-copy-outline-md`)**: Copy whole map or right-clicked branch as clean hierarchical Markdown.
    - **True Bounding-Box Fit-to-Screen (`fitCanvasToAllNodes` on `⛶` `#btn-fit` & `Ctrl + 0`)**: Computes exact `(minX, minY, maxX, maxY)` of visible cards and centers/scales them into the viewport.
    - **HD Image Lightbox (`openImageLightbox`) & Desktop File Drag-and-Drop (`initCanvasDragAndDrop`)**: Double-click any screenshot card to inspect at full resolution; drag image files or `.json` backups from Explorer onto canvas.
    - **Whole-Card Semantic Background Tints (`d.cardBgColor`) & Expand/Collapse All (`expandOrCollapseAllBranches`)**.
    - **Secondary Workbenches Fully Wired (`initSecondaryWorkbenches`)**: `🚀 送入脑图` in Flow Capture, live `[[双链]]` Backlinks/Outbound in Note Library, and Structural Radar in AI Assistant.
  - `v3.0.0`:
    - **XMind Subtree Dragging (`collectSubtreeNodeIds`)**: Dragging a parent card moves its entire connected subtree together (`Alt + Drag` moves single card).
    - **OneNote Click-Anywhere-and-Type on Empty Canvas**: Clicking empty canvas and typing a character spawns a card at `lastCanvasMouseCoords` and enters inline editing.
    - **OneNote Card & Image Width Resize Handle (`.card-resize-handle`, `d.customWidth`)**: Drag right edge of any card/image to resize (`96px`–`680px`), double-click handle to reset.
    - **OneNote Interactive To-Do Checkboxes (`Ctrl + 1`, `.canvas-todo-checkbox`)**: Directly clickable checkboxes on canvas cards.
    - **XMind Relationship Labels on Arrows (`✏️ 写关系词` & `<g class="link-label-layer">`)**: Double-click any arrow or click `✏️ 写关系词` in `#link-action-bar` to add midpoint relationship badges.
    - **XMind `Shift + Tab` Promote, `Space` Tap-to-Edit & 2D Spatial Arrow-Key Navigation (`↑` `↓` `←` `→`)**.
    - **Expanded `#selection-quick-bubble` (`🔴` `🟢` `🟡` `B` `U` `☑` `🧹`)**.
  - `v2.9.0`:
    - Default-on left-mouse rubber-band marquee selection (`#marquee-box`), `#multi-select-action-bar`, clickable arrows + `#link-action-bar`, `.node-quick-add-btn` (`+`), and `#canvas-context-menu`.
  - `v2.8.0`:
    - **PWA Standalone Desktop/Mobile App (`public/manifest.json` + `public/sw.js` + `#btnInstallPwa`)**: Installable to taskbar/desktop/mobile with Network-First offline cache.
    - **High-Capacity `IndexedDB` Engine (`FlowNotesIDB` + `safeLocalStorageSet` + `allMapsMemoryCache`)**: Unlimited screenshot storage without `localStorage` 5MB `QuotaExceededError`.
    - **Multi-Device Cloud Sync Reliability (`autoCheckCloudGist` + `flushPendingSave` + bottom-left IO buttons)**: Auto-flushes pending saves on tab close/hide, auto-pulls newer cloud Gist data on startup/window focus, and wires up `#btn-sync`, `#btn-pull`, `#btn-import`.
    - **Zero-Latency Touch & Non-Touch Controls**: `touch-action: none` (0ms touch delay), fast touch double-tap on cards/canvas, and 1-tap `+子`, `+同`, `☑️多选` buttons.
  - `v2.7.0`:
    - **Freeform Spatial Whiteboard Default (`layoutMode = "free"`)**: Preserves exact `(x, y)` coordinates when double-clicking, pasting (`Ctrl+V`), pressing `Tab`/`Enter`, or folding/unfolding so notes can be freely clustered ("放到一坨") without snapping into a tree column unless `M` (`🧭`) is pressed.
    - **Direct On-Canvas Rich Text & Image Cards (`<foreignObject class="node-card-fo">`)**: Renders formatted sentences (inline 🔴 red, 🟢 green, 🟡 yellow highlight, multi-line text) and 📸 screenshots directly inside rectangular cards on the canvas, with double-click inline editing and on-canvas `#selection-quick-bubble` popups.
    - **Rectangle-Edge Sticky Arrow Intersection (`getRectEdgePoint`)**: Arrows dynamically compute exact border intersection points using each card's measured width/height (`_cardW`, `_cardH`).
    - **"默认先 make 的是父" Foldable Arrow Linking (`connectNodesWithParentRule` & `.node-connect-port`)**: Selecting 2+ cards (`Shift+Click` or marquee box) and pressing `L` (or clicking `➔`) connects them with a foldable parent-child arrow where the earlier-created (`createdAt`) card is automatically the Parent (`Parent ➔ Child`). Also added a right-edge `.node-connect-port` (`➔`) handle for mouse drag-to-connect.
    - **Zero-Lag Input Debounce & IME Guard (`scheduleSaveGraph` + `isImeComposing`)**: Eliminated synchronous `JSON.stringify` / `localStorage.setItem` / `renderOrganizerUI` stalls on every keystroke.
  - `v2.6.0`: SVG directional arrow markers (`#arrow-marker`), `#selection-quick-bubble`, `Ctrl+Shift+R/G/H/\` shortcuts, and clipboard screenshot/text paste (`initClipboardPaste` + `compressImage`).
- **Live Site**: https://flownotes-eze.pages.dev
- **GitHub Repository**: https://github.com/yulicccccc/Flownotes
- **Cloudflare Deployment Script**: `FlowNotes_V3.1.1_flownotes-eze.pages.dev_一键更新网站.bat`

## Finalized & Locked Features
1. **Freeform Spatial Dumping ("放到一坨", v2.9.0)**: `layoutMode = "free"` default; no forced `tidyLayout()` or accidental proximity reparenting when placing cards near each other.
2. **Direct On-Canvas Rich Text & Image Cards + Inline Editing (v2.9.0)**: `<foreignObject>` cards directly display 🔴 red, 🟢 green, 🟡 yellow highlights, and 📸 images on the canvas; double-click to edit and highlight directly on the canvas.
3. **"默认先 make 的是父" Foldable Arrow Connections (v2.9.0)**: Multi-select + `L` key sorts by `createdAt` ascending so earlier-created card = Parent (`Parent ➔ Child`), plus `.node-connect-port` drag handle; all arrow-connected parents support fold/unfold (`+N` / `−`).
4. **Dynamic Directional Arrows (v2.6.0 - v2.9.0)**: Sticky tracking SVG arrowheads stopping at exact rectangular card boundaries.
5. **Zero-Friction Color & Highlight Suite (v2.6.0 - v2.9.0)**: `Ctrl+Shift+R/G/H/\` and selection floating bubble (`#selection-quick-bubble` mounted on `document.body`).
6. **Global Clipboard Image & Text Paste (v2.6.0 - v2.9.0)**: `Ctrl+V` spawns independent floating cards at mouse cursor coordinates without camera jumps.
7. **Zero-Lag Debounced Persistence & IME Guard (v2.9.0)**: 360ms debounced `scheduleSaveGraph` + IME `isImeComposing` guard.
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
