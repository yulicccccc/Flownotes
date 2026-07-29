# FlowNotes to Obsidian Sync & Web Application

## Goal
A full-featured local-first personal knowledge and thinking web application (FlowNotes) deployed on Cloudflare Pages, with automated one-way sync of web-based graph relationships from FlowNotes (JSON) to Obsidian's file system (Markdown).

## Finalized & Locked Features
- **FlowNotes Web Application (`public/`)**:
  - Semantic HTML5 structure with Space Obsidian dark mode, glassmorphism, and micro-animations.
  - Interactive Owl Mascot SVG logo representing knowledge, observation, and reflection.
  - **⚡ Flow Stream**: Quick stream-of-consciousness capture with automatic `#tag` and `[[backlink]]` parsing.
  - **📝 Knowledge Notes**: Dual-pane Markdown editor with bidirectional link engine (backlinks & outbound links).
  - **🕸️ Visual Idea Map**: Interactive 2D force-directed physics graph canvas connecting nodes via `[[backlinks]]`.
  - **✨ AI Assistant**: Local heuristic knowledge network diagnosis and reflection prompt generator.
  - **Local-First Storage**: Browser localStorage persistence (`flownotes_nodes_v1`, `flownotes_stream_v1`, `flownotes_theme`).
- **Obsidian Sync Workflow**:
  - One-click export from FlowNotes Web to `obsidian_graph_backup.json` containing `.nodes` and `.edges`.
  - Automated PowerShell script `sync_to_obsidian.ps1` to parse JSON and map to local Obsidian Markdown vault.
  - Filenames cleaned to be Windows-compatible.
- **Automated Cloudflare Deployment**:
  - Cloudflare Pages project `flownotes` deployed via `Flownotes_一键更新网站.bat` using local portable Node (`.\node\npx.cmd --yes wrangler pages deploy public`).
