# FlowNotes — Mindmap-First Knowledge Engine & Obsidian Sync

## Goal
A full-featured Mindmap-First personal knowledge and thinking system (FlowNotes) deployed on Cloudflare Pages, with D3.js interactive graph workspace, GitHub Gist anti-loss version control, and automated one-way sync to Obsidian.

## Finalized & Locked Features
- **Mindmap-First Visual Workspace (`public/`)**:
  - D3.js SVG Mindmap canvas with D3 force simulation and XMind Tidy Tree layout engine (`🧭` / `M` key).
  - **Full XMind Keyboard Shortcuts Suite (XMind 级快捷键全集)**:
    - `Enter`: 新建同级节点 (Add sibling node).
    - `Tab`: 新建子分支节点 (Add child node).
    - `双击空白处`: 创建 100% 独立的全新根主题节点 (Create independent root topic).
    - `Ctrl + Z` / `Cmd + Z`: 撤销历史步骤 (Undo history state).
    - `Ctrl + Y` / `Cmd + Shift + Z`: 重做历史步骤 (Redo history state).
    - `Delete` / `Backspace`: 删除选中节点及其整个子分支 (Delete node & subtree).
    - `F2` / `Space`: 原处重命名节点 (Rename inline).
    - `方向键 ↑ / ↓ / ← / →`: 键盘吸附导航漫游节点 (Navigate node focus).
    - `Alt + ↑ / ↓`: 向上 / 向下微调同级节点顺序 (Reorder sibling nodes up/down).
    - `L` / `Ctrl + L`: 建立 / 解除节点间虚线双链关联 (Toggle dashed relation link).
    - `M`: 一键整理为 XMind 树状清晰模式 (Toggle XMind Tidy Layout).
    - `G`: 一键切换为自由网状力学图 (Toggle Force Layout).
  - Side Markdown editor panel (`#editor-panel`) with Live Edit, Markdown Source, and Preview mode, complete with `📖` toggle button.
- **GitHub Gist Anti-Loss Sync & Data Protection Guardrail**:
  - Auto-linked to private Gist (`4e7cc31fd55d0614a69e31283319953d`).
  - Auto-commit history on every edit for 100% accidental deletion recovery.
  - **Data Protection Guardrail (防误擦除安全防护规则)**: If local node count is less than 50% of the remote GitHub Gist node count (and remote count > 3), automatic synchronization/push MUST be blocked to prevent accidental local data wipes or cleared states from overwriting cloud history.
- **Obsidian Sync Workflow**:
  - One-click export to `obsidian_graph_backup.json` fully compatible with `sync_to_obsidian.ps1`.
- **Automated Cloudflare Deployment**:
  - Cloudflare Pages project `flownotes` deployed via `Flownotes_一键更新网站.bat`.
