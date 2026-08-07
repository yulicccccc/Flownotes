# Project State: FlowNotes (v2.5.4)

## Current Version & Status
- **Current Version**: `v2.5.4`
- **Latest Releases**: 
  - `v2.5.0`: Full Ordered/Unordered Lists (`1.`, `-`), Clear Format & Lists button (`🧹`), Smart paste normalization (`•`).
  - `v2.5.1` - `v2.5.4`: Drag-to-Reparent node re-attachment with proximity visual warning ring (`dropTargetPulse`), D3 node object resolution, and Single Source of Truth architecture (`node.parentId` -> dynamic `cleanLinks()`).
- **Live Site**: https://flownotes-eze.pages.dev
- **GitHub Repository**: https://github.com/yulicccccc/Flownotes
- **Cloudflare Deployment Script**: `FlowNotes_V2.5.4_flownotes-eze.pages.dev_一键更新网站.bat`

## Finalized & Locked Features
1. **Single Source of Truth Tree Links (v2.5.4)**: All tree links are dynamically derived directly from `node.parentId` in `cleanLinks()`, preventing any line desync across dragging, folding, unfolding, or storage sync.
2. **Drag-to-Reparent with Proximity Pre-Warning (v2.5.1 - v2.5.3)**: Dragging any node within 75px of a candidate target parent lights up an animated cyan/gold dashed glowing ring (`dropTargetPulse`). Releasing the mouse instantly re-parents the branch with cycle protection (`isNodeDescendantOf`).
3. **Full Rich Text List & Formatting Controls (v2.5.0)**:
   - `1.` (Ordered List) & `-` (Unordered List) buttons with live markdown serialization.
   - `🧹` (Clear Formatting & Lists) button to strip HTML styling, list tags, and bullet characters (`•`, `·`, `▪`).
4. **Font Color & Multi-Tag Nested Formatting (v2.4.1)**: Pure DOM tree traversal serialization (`serializeNode`) preventing nested tag loss.
5. **Marquee Box Multi-Selection Engine (v2.4.0)**: `Shift + Drag` / `🔳` box selection for batch drag, batch delete, batch focus (`F`), and batch link (`L`).
6. **Multi-Map Organizer (🗂️ 图谱组织器)**: Support creating, switching, renaming, duplicating, and deleting multiple independent mindmaps with metadata manifests.
7. **XMind Clean Tree Default + Physics Mode**: Default tidy XMind tree view with one-click toggle to 360° symmetric jelly physics (`forceCollide` + `forceCenter`).
8. **Anti-Loss GitHub Gist Sync**: Gist backup with 8s rate-limit protection and total card count validation.
9. **Golden Authentication Interface**: Available at `/login.html` with direct workspace access on `/index.html`.

## Key Files Architecture
- `public/index.html`: Entry point with cache-busting version params (`?v=2.5.4`).
- `public/app.js`: Main application logic (D3 graph, mindmap shortcuts, list engine, drag-to-reparent, state persistence).
- `public/index.css`: Styling and keyframe animations (`focusGlowPulse`, `dropTargetPulse`).
- `PRD.md`: Full product requirements & locked features list.
- `CHANGELOG.md`: Detailed release notes per version.
