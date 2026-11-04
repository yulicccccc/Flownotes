# Project State: FlowNotes (v3.5.4)

## Current Version & Status
- **Current Version**: `v3.5.4`
- **Latest Releases**:
  - `v3.5.1`:
    - **Title-Only Mindmap Canvas & Anti-Clutter Layout Suite (`renderCardLabelHTML` + `getCardDisplayHTML` + `.card-has-note-badge` + Numbered List Preservation + `.canvas-action-pill-bar` + `.canvas-view-dock`)**: Resolved 3 major UX pain points. 1) Mindmap cards on canvas strictly display the title (`d.label`) and never get polluted or ballooned by large paragraphs in detailed notes (`d.content`). Cards with detailed notes show a clickable `📝` badge that opens the right note pane with 1 click; 2) Ordered list numbering (`1.`, `2.`, `4.`) is preserved verbatim without being reset to `1.` by `<ol>` rendering or serialization; 3) Replaced the clumsy 21-button two-row floating controls with a single-line frosted pill toolbar on the top-left and moved zoom/viewport controls to the bottom-left dock, completely eliminating clutter and collisions with the top-center formatting bubble.
  - `v3.5.0`:
    - **OneNote 3-Tier Collapsible Tree Notebook Center (`.onenote-tree-drawer` + `notebooksManifest` + `sectionsManifest` + 3-Tier Breadcrumb + Real-Time Search + Cross-Section Page Migration)**: Upgraded the flat, cramped Organizer into a modern OneNote 3-tier collapsible tree navigation drawer. Structures personal knowledge hierarchically across **Notebooks 📔 ➔ Color-Coded Sections 📑 ➔ Pages / Sandboxes 📄**. Supports full CRUD for notebooks and sections, signature OneNote section pastel color pills (`#38bdf8`, `#a855f7`, `#10b981`, `#f59e0b`, `#f43f5e`, `#ec4899`, etc.) with one-click cyclic color switching (`🎨`), real-time keyword tree filtering (`#onenote-tree-search`), expand/collapse all with persistent state, page duplication and moving across sections (`🚚`), dynamic 3-tier navbar breadcrumb pills (`#currentMapBadge`), and seamless integration into GitHub Gist cloud sync and high-capacity IndexedDB.
  - `v3.4.9`:
    - **Pomodoro Focus Growth Analytics & Multi-Device Cloud Sync Suite (`pomo-growth-card` + `pomoGrowthChart` + GitHub Gist Cloud Sync + IndexedDB Dual-Save)**: Added focus progress tracking and multi-device cloud synchronization for the Pomodoro Evidence Suite. Features a 7-day focus mini bar chart with daily minutes and weekday labels, weekly focus total, daily average, 7-day personal best peak, and week-over-week growth percentage (`↑ +X% 较上周长进` or `🌱 稳步积累中`). Fully integrates Pomodoro evidence into GitHub Gist multi-map backups with smart cloud deduplication and merging, plus dual IndexedDB persistence and auto-cloud sync on session completion.
  - `v3.4.8`:
    - **OneNote Interactive Card Table Suite (`renderMarkdownToHTML` + `htmlToSafeMarkdown` + `applyFormatting` + Table Cell Keyboard Navigation + Context Menu Table Suite)**: Brought full OneNote-style table creation, navigation, and editing directly into FlowNotes mindmap cards and Markdown editor. Full GFM Markdown table rendering into interactive, styled `<table class="canvas-card-table">`; bi-directional lossless Markdown serialization supporting inline bold, italic, handwriting, and colors; OneNote signature `Tab` cell jumping (with automatic new row generation at last cell), `Shift+Tab` previous cell jumping, `Enter` insert row below and focus directly underneath, and `Alt+T` quick table shortcut; quick formatting bubble & editor toolbar button `▦`; right-click context menu row/column manipulation tools (`table-insert-row`, `table-insert-col`, `table-delete-row`, `table-delete-col`, `table-delete`).
  - `v3.4.7`:
    - **Dual-Track Word & Box Typography Formatting Engine (`applyFormatting` + Box Level Bold/Italic/Underline/Handwriting/Color + Inline Selection Precision)**: Solved formatting ambiguity between individual words and whole card boxes. Selecting specific text modifies only those words (`<strong>`, `<em>`, `<u>`, `<span style="color">`); selecting a card box without highlighted words applies formatting (Bold, Italic, Underline, Strike, Handwriting, Red/Green Text, Amber Highlight, Clear) to the **entire box's text** with smart toggle and active button feedback; added `I` (Italic) button to quick bubble; bound `Ctrl+B`, `Ctrl+I`, `Ctrl+U` shortcuts.
  - `v3.4.6`:
    - **Pomodoro Focus Timer & Evidence Over Emotion Suite (`#headerPomoPill` + `#pomoFocusModal` + `Evidence Trail`)**: Integrated Pomodoro focus timer and daily study evidence tracker right in the top header. Embedded core philosophy: *Action before confidence, Evidence over emotion, Tiny tweaks, Willingness to feel fear*. Features 25/5/15m modes, SVG circular progress ring, one-click binding to selected mindmap card (`📍 绑定选中卡片`), Web Audio 432Hz Tibetan chime, live document.title sync, `Alt+P` global shortcut, automatic/manual `#专注证据` flowStream sync, and 4-metric evidence dashboard tracking today's minutes/pomodoros, streak days, total hours, and full footprint timeline.
  - `v3.4.5`:
    - **OneNote Card Frame Fill Swatches & Dual Font/Box Quick Suite (`🟥/🟩/🟨` + `toggleCardBgColor`)**: Added 3 square color swatches to the quick edit bubble toolbar representing card box background fill colors (`🟥` rose, `🟩` emerald, `🟨` amber); clearly decoupled from circular font/text colors (`🔴/🟢/🟡`); supports one-click apply and click-again toggle to restore clean defaults, active swatch glow cues (`.active-swatch`), and multi-card / inline-edit real-time tinting.
  - `v3.4.4`:
    - **OneNote Handwriting Annotation Font & Dockable Top Quick Bubble Suite (`AaJiandaoshitoubu` + `YeGenYouSanMo` + `isDockedTop`)**: Bundled Chinese handwriting fonts for thought annotations; quick formatting bubble toolbar can now dock elegantly at canvas top-center (`📌`) or float with selection (`📍`); direct card-level formatting support; `Ctrl+Shift+W` shortcut; enhanced Excalidraw and 1.pdf handwriting migration.
  - `v3.4.3`: OneNote fidelity pass — bundled TsangerXuanSanM W03 font, 8-way edge-anchored resize (n/s/e/w + 4 corners), live MTV collision nudge on resize/typing only (drag stays free-overlap), uniform OneNote frames with per-word colors + one-time cache migration, improved PDF→Excalidraw block splitting/soft-wrap/highlight, touch long-press no longer marquee.
  - `v3.4.2`:
    - **OneNote Native Spatial Fonts, Collision Nudge & Rich Span Color Suite (`applyOneNoteResizeNudge` + `TsangerXuanSanM W03`)**: System font defaults to user's favorite OneNote font `TsangerXuanSanM W03`; card resizing automatically pushes colliding neighbor cards away to avoid obscuration, while direct dragging allows free overlap; expanded resize hit zones to 20px and spaced out edge buttons; removed whole-card pink/green dyes and restored precise inline keyword coloring.
  - `v3.4.1`:
    - **Obsidian & Miro Pure Intuitive Canvas Drag & Shift-Marquee Engine (`startCanvasPointerDown` + `moveCanvasPointer`)**: 100% deterministic canvas panning on left mouse drag, completely eliminating the flawed 130ms hold-timer that hijacked normal mouse dragging into unwanted marquee boxes. Shift + Left-Drag now provides 0ms marquee box selection with instant crosshair cursor cues.
  - `v3.4.0`:
    - **Native Excalidraw & PDF Visual Mindmap Importer Suite (`importExcalidrawFile` + `loadDemoExcalidrawMap`)**: Enables FlowNotes to directly import `.excalidraw` and Excalidraw JSON documents, faithfully extracting text cards, colors, embedded base64 images, and directional arrows into a dedicated new mindmap project. Also converted `1.pdf` into a standalone `1.excalidraw` file with 70 elements saved to Desktop and project assets, with 1-click loading from the Organizer drawer.
  - `v3.3.0`:
    - **Diagonal Proportional Font Scaling & 4-Edge Adaptive Reflow Resize Engine (`startCardResize` + `resetCardCustomSize`)**: Dragging diagonal corners (`.handle-se` `◢` / `.handle-sw`) scales the card box AND automatically scales `d.customFontSize` (`9px`–`64px`) proportionally; dragging left/right edges (`.handle-e` / `.handle-w`) adjusts only width (`d.customWidth`) with automatic text wrapping; dragging bottom edge (`.handle-s`) adjusts only height (`d.customHeight`). Double-clicking any handle or clicking `📏 恢复默认字号与自适应框大小` in the context menu resets to defaults.
  - `v3.2.1`:
    - **0ms 120fps Instant Hand-Pan & Zero-Reflow `Shift`/Hold Marquee Engine (`initMarqueeSelection` + `syncMarqueeSelectionStyles`)**: Upgraded to the Obsidian Canvas / Miro / XMind gold-standard gesture model where immediate Left-Drag / 1-Finger Touch / Right-Drag pans the canvas at `0ms` latency, `Shift + Left-Drag` (or `130ms` pinpoint hold, or `🔳` mode) performs 120fps zero-reflow marquee box selection, and DOM layout thrashing during marquee dragging is completely eliminated.
  - `v3.2.0`:
    - **Direct Type-to-Edit on Selected Card + `Alt+Enter`/`Shift+Enter` Newline**: Typing when a card is selected immediately opens inline editing on that card.
    - **XMind `Ctrl+Enter`/`Insert` (`insertParentNode`), `Shift+Enter` Sibling Above & Arrow Midpoint `➕ 中间插卡片` (`insertNodeOnSelectedLink`)**.
    - **Smart Safe Delete (`deleteSelectedNode`)**: Normal `Delete` on expanded cards preserves unselected child cards; `Shift+Delete` (or deleting a collapsed branch) deletes the full subtree.
    - **Card Merge (`🧲 合并为一卡` `mergeSelectedNodes`) & Multi-Line Card Split (`✂️ 按行拆分为子卡片` `splitCardByLines`)**.
    - **Local Subtree Tidy (`📐 仅规整此分支子树` `tidySubtreeLayout`)**: Tidies only the selected parent's branch without disturbing other freeform cards.
    - **OneNote `Ctrl+1~5` Quick Semantic Tags (`☑` / `⭐` / `❓存疑` / `💡灵感` / `✅已验证`)**.
    - **OneNote Freehand Ink & Highlighter Layer (`🖍️` `#btn-ink-draw` / `P` key, `inkStrokes`)** & **Live Zoom Percentage Reset (`#btn-zoom-reset` `100%`)**.
  - `v3.1.3`:
    - **Long-Press Left Mouse / Long-Press Touch (`200ms`) Hand Panning (`🖐️`) + Immediate Drag Marquee Selection (`initMarqueeSelection` + `showCanvasHandCursor`)**: Holding left mouse button or 1-finger touch on empty canvas for `200ms` turns into a hand cursor (`grabbing` + floating `🖐️` badge `#canvas-hand-cursor`) and pans the canvas 1:1; dragging immediately (`< 200ms`) draws `#marquee-box` for rubber-band multi-selection.
  - `v3.1.2`:
    - **Right Note Editor Panel Close (`×`) & Top-Right Reopen Pill (`#btn-close-editor`, `#closeBannerBtn`, `#btn-reopen-editor-pill`)**: Added a dedicated `×` close button inside `#editor-header`, wired `#closeBannerBtn` so clicking the top-right `×` closes the banner & collapses `#editor-panel`, auto-resizes `#graph-svg` to full screen width, and shows a `📖 展开详细笔记` pill in the top-right corner when collapsed.
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
- **Cloudflare Deployment Script**: `FlowNotes_V3.4.5_flownotes-eze.pages.dev_一键更新网站.bat`

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
