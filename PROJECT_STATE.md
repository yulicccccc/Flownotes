# Project State: FlowNotes (v2.6.0)

## Current Version & Status
- **Current Version**: `v2.6.0`
- **Latest Releases**: 
  - `v2.6.0`:
    - **Dynamic Directional Arrows (物理有向自适应跟随箭头)**: Explicit arrowheads (`Parent ➔ Child`) on all SVG links with intelligent node boundary stopping distance.
    - **Directional Fold/Unfold (有向分支收起与展开)**: Default "先建为父、后建为子", click parent fold badge to collapse/expand downstream branches.
    - **Zero-Friction Colors & Highlighting**:
      - `Ctrl + Shift + R`: 🔴 瞬间标红 (核心问题)
      - `Ctrl + Shift + G`: 🟢 瞬间标绿 (特征指标)
      - `Ctrl + Shift + H`: 🟡 瞬间高亮
      - `Ctrl + Shift + \`: 🧹 瞬间清除格式
      - **Selection Quick Bubble**: 划选文本时浮动调色胶囊微型工具条.
    - **Clipboard Direct Paste (剪贴板直贴画布)**: `Ctrl + V` anywhere on canvas pastes screenshots (`Win+Shift+S`) or text fragments as floating cards with auto-compression.
  - `v2.5.0` - `v2.5.4`: Drag-to-Reparent node re-attachment with proximity visual warning ring (`dropTargetPulse`), D3 node object resolution, Single Source of Truth architecture (`node.parentId` -> dynamic `cleanLinks()`), Ordered/Unordered Lists (`1.`, `-`), Clear Format & Lists button (`🧹`), Smart paste normalization (`•`).
- **Live Site**: https://flownotes-eze.pages.dev
- **GitHub Repository**: https://github.com/yulicccccc/Flownotes
- **Cloudflare Deployment Script**: `FlowNotes_V2.6.0_flownotes-eze.pages.dev_一键更新网站.bat`

## Finalized & Locked Features
1. **Dynamic Directional Arrows (v2.6.0)**: Sticky tracking SVG arrowheads automatically stretching, shrinking, and rotating as nodes move.
2. **Directional Branch Fold/Unfold (v2.6.0)**: Upstream parent badge collapsing all downstream descendant nodes and arrows.
3. **Zero-Friction Color & Highlight Suite (v2.6.0)**: `Ctrl+Shift+R/G/H/\` and selection floating bubble for sub-second visual coding.
4. **Global Clipboard Image & Text Paste (v2.6.0)**: `Ctrl+V` spawns independent floating cards at mouse cursor coordinates with auto-compression.
5. **Single Source of Truth Tree Links (v2.5.4)**: All tree links dynamically derived from `node.parentId` in `cleanLinks()`.
6. **Drag-to-Reparent with Proximity Pre-Warning (v2.5.1 - v2.5.3)**: Proximity pre-warning ring (`dropTargetPulse`) and cycle protection.
7. **Full Rich Text List & Formatting Controls (v2.5.0)**: `1.`, `-`, `🧹` clean formatting.
8. **Marquee Box Multi-Selection Engine (v2.4.0)**: `Shift + Drag` / `🔳` box selection for batch drag, delete, focus, and link.
9. **Multi-Map Organizer (🗂️ 图谱组织器)**: Multiple independent mindmaps with metadata manifests.
10. **Anti-Loss GitHub Gist Sync**: Gist backup with 8s rate-limit protection and total card count validation.

## Key Files Architecture
- `public/index.html`: Entry point with cache-busting version params (`?v=2.6.0`).
- `public/app.js`: Main application logic (D3 canvas, dynamic tracking arrows, clipboard paste, zero-friction coloring, state persistence).
- `public/index.css`: Styling and keyframe animations (`#selection-quick-bubble`, `.node-img-preview`, `flow-arrow-marker`).
- `PRD.md`: Full product requirements & locked features list.
- `CHANGELOG.md`: Detailed release notes per version.
