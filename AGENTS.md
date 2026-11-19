# FlowNotes Project Engineering Guardrails (`AGENTS.md`)

Before modifying ANY code in this repository, every agent MUST obey these non-negotiable architectural invariants:

## 1. Mandatory Pre-Commit / Pre-Deploy Fortress Regression Gate
- After ANY modification to `public/app.js`, `public/index.css`, or `public/index.html`, you MUST run:
  ```powershell
  python -u tests/fortress_regression.py
  ```
- **ALL 30/30 tests MUST PASS with 0 page errors** before committing, pushing, or deploying.
- Whenever a new bug is reported, add a regression test to `tests/fortress_regression.py` FIRST so it reproduces the bug, then fix the root cause and verify 100% pass.

## 2. Four Sacred Data & Rendering Invariants
1. **Title / Node Isolation (`node.label` vs `node.content`)**:
   - `node.label` is ONLY the canvas card title (supports inline rich HTML/Markdown and multi-line `<br>`).
   - `node.content` is ONLY the note details Markdown.
   - NEVER overwrite `node.label` with `node.content` in `sanitizeGraph()` (only recover legacy `...`-truncated titles).
   - NEVER overwrite or strip user `# H1/H2/H3/H4` headings inside `node.content` when renaming a card title or editing a canvas table/image card (`replaceTableInNoteContent` and `updateImageAltInNoteContent` MUST be used).
   - `renderEditor()` MUST remain a pure read-only view projection — NEVER mutate `selectedNode.content` inside `renderEditor()`.
2. **Editor Dirty-Flag & Context Isolation**:
   - `commitCurrentEditorToSelectedNode()` MUST ONLY commit to `nodes.find(n => n.id === editorActiveNodeId)`.
   - NEVER write `titleInput.value`, `richEditor.innerHTML`, or `mdTextarea.value` back to the model unless the corresponding dirty flag (`isTitleInputDirty`, `isRichEditorDirty`, `isMdTextareaDirty`) is `true`.
   - Always call `resetEditorBindingState()` on map load (`loadMapData`), backup restore (`applyParsedBackupData`), and undo/redo (`restoreSnapshot`), and reset `historyStack` on `switchActiveMap()`.
3. **Arrows / Links & D3 Live Datum Integrity**:
   - `getLinkCoords(d)` MUST always resolve live node coordinates from `nodes` via `cleanNodeId` (never return `(0,0)` on string IDs or stale detached objects).
   - `refreshNodeStyles()` MUST rebind live `.datum(d)` onto `cardDiv`, `.card-resize-handle`, `.node-fold-badge`, `.node-quick-add-btn`, and `.node-connect-port`.
   - `linkDataKey()` MUST keep `relation` links directional (`relation:${s}->${t}`).
   - `isNodeDescendantOf()` MUST always guard against cycles with a `visited` Set.
   - `endPortConnectDrag()` MUST ignore hidden/collapsed nodes (`isNodeVisible`).
4. **Formatting Lossless Round-Trip**:
   - `renderMarkdownToHTML()` MUST extract and protect Markdown images `![alt](src)` BEFORE any inline regexes (`==`, `**`, `*`, `~~`, `` ` ``) so Base64 `==` padding never triggers highlights.
   - Inline regexes (`==`, `**`, `*`, `~~`, `` ` ``) MUST NEVER span across `\n` / block elements.
   - `serializeCardLabelFromHTML()` MUST compose bold, italic, underline, strike, code, color, highlight, and handwriting cumulatively without early returns.
   - Do NOT put `!important` on `mark`'s `background-color` or `color` in `public/index.css`.
