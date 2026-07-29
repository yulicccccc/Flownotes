/**
 * ============================================================================
 * FlowNotes — Local-First Personal Knowledge & Thinking System
 * ============================================================================
 */

// --- 默认演示数据 (初次打开加载，展示丰富的双链与心流捕获效果) ---
const DEFAULT_NOTES = [
    {
        id: "note-1",
        label: "欢迎使用 FlowNotes",
        content: `# 欢迎使用 FlowNotes

FlowNotes 是一款**本地优先 (Local-First)**、支持瞬时心流捕获与深度双向链接的个人知识流管理系统。

## 核心特性
- **心流捕获**：在 [[瞬时心流捕获]] 中快速倾倒思绪，自动提取标签。
- **双向连接**：通过 \`[[笔记名]]\` 语法构建互联图谱，与 [[卡片盒笔记法原则]] 深度结合。
- **思维图谱**：在 [[思维图谱可视化]] 视图中观测你的全景认知网络。
- **Obsidian 联动**：支持一键导出适配 \`sync_to_obsidian.ps1\` 的结构化 JSON！`,
        tags: ["介绍", "指南", "知识管理"],
        updatedAt: new Date(Date.now() - 3600000 * 24).toISOString()
    },
    {
        id: "note-2",
        label: "瞬时心流捕获",
        content: `# 瞬时心流捕获 (Flow Capture)

瞬时心流捕获旨在降低信息录入的认知摩擦。灵感闪现时，无需立刻分类或建结构，而是以流（Stream）的形式存入。

相关方法论：[[卡片盒笔记法原则]] 和 [[知识的有机自组织]]。`,
        tags: ["心流", "方法论"],
        updatedAt: new Date(Date.now() - 3600000 * 18).toISOString()
    },
    {
        id: "note-3",
        label: "卡片盒笔记法原则",
        content: `# 卡片盒笔记法 (Zettelkasten) 原则

1. **原子化 (Atomicity)**：一张卡片只阐述一个完整的核心观点。
2. **连接胜于分类 (Connection over Categorization)**：不要依赖自上而下的严格文件夹，通过 \`[[双链]]\` 让笔记在网络中互相支撑。

进一步理解参阅：[[知识的有机自组织]] 与 [[思维图谱可视化]]。`,
        tags: ["Zettelkasten", "方法论"],
        updatedAt: new Date(Date.now() - 3600000 * 12).toISOString()
    },
    {
        id: "note-4",
        label: "知识的有机自组织",
        content: `# 知识的有机自组织

正如智慧猫头鹰所隐喻的，真正有效的知识网络不会是一成不变的树形目录，而是像森林生态系统一样**自底向上生成**。

- 与 [[欢迎使用 FlowNotes]] 配合使用，随时通过 [[Obsidian 本地单向同步方案]] 备份到本地 Markdown 金库。`,
        tags: ["知识理论", "哲学"],
        updatedAt: new Date(Date.now() - 3600000 * 6).toISOString()
    },
    {
        id: "note-5",
        label: "思维图谱可视化",
        content: `# 思维图谱可视化 (Visual Idea Map)

借由力导向物理引擎（Force-Directed Layout），节点之间能够产生斥力，而通过 \`[[笔记名]]\` 构建的连线则如同弹簧般拉紧它们。

这使得核心思考枢纽（Hubs）在视觉上瞬间凸显。更多见 [[卡片盒笔记法原则]]。`,
        tags: ["可视化", "图谱"],
        updatedAt: new Date(Date.now() - 3600000 * 3).toISOString()
    },
    {
        id: "note-6",
        label: "Obsidian 本地单向同步方案",
        content: `# Obsidian 本地单向同步方案

为了兼顾浏览器打开即用与本地文件的绝对安全性，FlowNotes 与 \`sync_to_obsidian.ps1\` 脚本达成无缝兼容：

1. 点击右上角 **导出 Obsidian** 按钮。
2. 将导出的 \`obsidian_graph_backup.json\` 保存在下载路径。
3. 执行 PowerShell 脚本，自动转化为 UTF-8 编码的 \`.md\` 本地文件。`,
        tags: ["本地同步", "Obsidian"],
        updatedAt: new Date().toISOString()
    }
];

const DEFAULT_FLOW_STREAM = [
    {
        id: "flow-101",
        content: "今天想到了通过 [[思维图谱可视化]] 来帮助我更好地梳理正在构建的架构方案。 #灵感 #思考",
        tags: ["#灵感", "#思考"],
        timestamp: new Date(Date.now() - 7200000).toLocaleString()
    },
    {
        id: "flow-102",
        content: "读完新书第4章，核心概念可以提炼并归入 [[卡片盒笔记法原则]]。 #知识点",
        tags: ["#知识点"],
        timestamp: new Date(Date.now() - 3600000).toLocaleString()
    },
    {
        id: "flow-103",
        content: "提醒自己晚上做一次备份，验证 [[Obsidian 本地单向同步方案]] 的完整性。 #待办",
        tags: ["#待办"],
        timestamp: new Date().toLocaleString()
    }
];

const OWL_WISDOMS = [
    "“智慧由点滴汇聚。使用 [[笔记名称]] 可轻松创建双向连接，构建知识网络。”",
    "“猫头鹰夜间视力绝佳——通过上方搜索或 Ctrl+K 瞬间透视全部卡片与心流。”",
    "“真正的卡片盒就像长久的森林，连线比单纯的文件夹层级更有生命力。”",
    "“数据主权属于你：我们坚持本地存储 (Local-First)，配合 powershell 脚本安全备份。”",
    "“如果某篇笔记一直孤立无援，试着在文本中引用它，或去‘智慧助手’看看联结建议。”"
];

// --- 状态管理 ---
let notes = [];
let flowStream = [];
let currentNoteId = null;
let currentTab = "flow";

// --- 初始化系统 ---
document.addEventListener("DOMContentLoaded", () => {
    initStorage();
    initUI();
    initEvents();
    renderAll();

    // 默认展示欢迎提醒
    showOwlWisdom();
});

function initStorage() {
    const savedNotes = localStorage.getItem("flownotes_nodes_v1");
    const savedFlows = localStorage.getItem("flownotes_stream_v1");
    const savedTheme = localStorage.getItem("flownotes_theme");

    if (savedNotes) {
        try { notes = JSON.parse(savedNotes); } catch (e) { notes = DEFAULT_NOTES; }
    } else {
        notes = [...DEFAULT_NOTES];
        saveNotesToStorage();
    }

    if (savedFlows) {
        try { flowStream = JSON.parse(savedFlows); } catch (e) { flowStream = DEFAULT_FLOW_STREAM; }
    } else {
        flowStream = [...DEFAULT_FLOW_STREAM];
        saveFlowsToStorage();
    }

    if (savedTheme) {
        document.documentElement.setAttribute("data-theme", savedTheme);
        updateThemeIcon(savedTheme);
    }

    if (notes.length > 0) {
        currentNoteId = notes[0].id;
    }
}

function saveNotesToStorage() {
    localStorage.setItem("flownotes_nodes_v1", JSON.stringify(notes));
}

function saveFlowsToStorage() {
    localStorage.setItem("flownotes_stream_v1", JSON.stringify(flowStream));
}

function initUI() {
    updateFlowTagFilters();
    populateAISelect();
}

// --- 事件监听绑定 ---
function initEvents() {
    // 导航标签切页
    document.querySelectorAll(".nav-tab").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".nav-tab").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));

            btn.classList.add("active");
            const tabName = btn.dataset.tab;
            document.getElementById(`pane-${tabName}`).classList.add("active");
            currentTab = tabName;

            if (tabName === "graph") {
                setTimeout(startGraphSimulation, 100);
            } else if (tabName === "editor") {
                renderEditor();
            } else if (tabName === "ai") {
                populateAISelect();
            }
        });
    });

    // 快捷标签插入
    document.querySelectorAll(".tag-chip").forEach(chip => {
        chip.addEventListener("click", () => {
            const input = document.getElementById("flowInputText");
            input.value = (input.value.trim() + " " + chip.dataset.tag + " ").trimStart();
            input.focus();
        });
    });

    // 记录心流按钮
    document.getElementById("addFlowBtn").addEventListener("click", handleAddFlow);
    document.getElementById("flowInputText").addEventListener("keydown", (e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            handleAddFlow();
        }
    });

    // 新建笔记
    document.getElementById("newNoteBtn").addEventListener("click", createNewNote);

    // 保存笔记
    document.getElementById("saveNoteBtn").addEventListener("click", saveCurrentNote);

    // 删除笔记
    document.getElementById("deleteNoteBtn").addEventListener("click", deleteCurrentNote);

    // 实时保存提示/输入绑定
    const titleInput = document.getElementById("noteTitleInput");
    const tagsInput = document.getElementById("noteTagsInput");
    const contentInput = document.getElementById("noteContentInput");

    [titleInput, tagsInput, contentInput].forEach(elem => {
        elem.addEventListener("input", () => {
            const current = notes.find(n => n.id === currentNoteId);
            if (!current) return;
            current.label = titleInput.value.trim() || "未命名笔记";
            current.tags = tagsInput.value.split(",").map(t => t.trim()).filter(Boolean);
            current.content = contentInput.value;
            current.updatedAt = new Date().toISOString();
            saveNotesToStorage();
            renderSidebarNotesList();
            renderBacklinksPanel();
        });
    });

    // 主题切换
    document.getElementById("themeToggle").addEventListener("click", toggleTheme);

    // 猫头鹰随机提醒
    document.getElementById("logoGroup").addEventListener("click", () => {
        showOwlWisdom();
        showToast("🦉 猫头鹰智慧已送达");
    });
    document.getElementById("closeBannerBtn").addEventListener("click", () => {
        document.getElementById("owlBanner").style.display = "none";
    });

    // 导出 Obsidian 兼容 JSON
    document.getElementById("exportObsidianBtn").addEventListener("click", handleExportObsidian);
    document.getElementById("closeModalBtn").addEventListener("click", () => {
        document.getElementById("exportModal").style.display = "none";
    });
    document.getElementById("confirmExportBtn").addEventListener("click", () => {
        document.getElementById("exportModal").style.display = "none";
    });

    // 搜索与过滤
    document.getElementById("searchInput").addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase().trim();
        filterAllViews(query);
    });

    document.getElementById("noteListFilter").addEventListener("input", (e) => {
        renderSidebarNotesList(e.target.value);
    });

    document.getElementById("flowTagFilter").addEventListener("change", (e) => {
        renderFlowStream(e.target.value);
    });

    // AI 助手操作
    document.getElementById("runAnalysisBtn").addEventListener("click", runAIAnalysis);
    document.getElementById("generatePromptBtn").addEventListener("click", generateAIPrompt);

    // 图谱缩放重置
    document.getElementById("resetGraphBtn").addEventListener("click", () => {
        resetGraphZoom();
    });

    // 全局快捷键
    document.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "s") {
            e.preventDefault();
            saveCurrentNote();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "k") {
            e.preventDefault();
            document.getElementById("searchInput").focus();
        }
    });
}

// --- 渲染全部主视图 ---
function renderAll() {
    renderFlowStream();
    renderSidebarNotesList();
    renderEditor();
    updateFlowTagFilters();
}

// --- 1. 心流捕获处理 ---
function handleAddFlow() {
    const textarea = document.getElementById("flowInputText");
    const text = textarea.value.trim();
    if (!text) {
        showToast("请先写一点心流想法哦 ~");
        return;
    }

    // 正则提取所有 #tag
    const tagMatches = text.match(/#[\w\u4e00-\u9fa5]+/g) || [];
    const newEntry = {
        id: `flow-${Date.now()}`,
        content: text,
        tags: [...new Set(tagMatches)],
        timestamp: new Date().toLocaleString()
    };

    flowStream.unshift(newEntry);
    saveFlowsToStorage();
    textarea.value = "";
    renderFlowStream();
    updateFlowTagFilters();
    showToast("⚡ 心流已记录");
}

function renderFlowStream(filterTag = "all") {
    const listEl = document.getElementById("flowList");
    const countEl = document.getElementById("flowCount");
    listEl.innerHTML = "";

    const filtered = flowStream.filter(item => {
        if (filterTag === "all") return true;
        return item.tags.includes(filterTag);
    });

    countEl.textContent = filtered.length;

    filtered.forEach(item => {
        const card = document.createElement("div");
        card.className = "flow-card";

        // 高亮 #标签 与 [[笔记名]]
        let formatted = escapeHTML(item.content)
            .replace(/#([\w\u4e00-\u9fa5]+)/g, '<span class="tag-pill">#$1</span>')
            .replace(/\[\[(.*?)\]\]/g, '<span class="bilink-pill" data-title="$1">[[ $1 ]]</span>');

        card.innerHTML = `
            <div class="flow-card-meta">
                <span>⚡ 思考流</span>
                <span>${item.timestamp}</span>
            </div>
            <div class="flow-card-content">${formatted}</div>
        `;

        card.querySelectorAll(".bilink-pill").forEach(pill => {
            pill.addEventListener("click", () => {
                const targetTitle = pill.dataset.title;
                openNoteByTitle(targetTitle);
            });
        });

        listEl.appendChild(card);
    });
}

function updateFlowTagFilters() {
    const select = document.getElementById("flowTagFilter");
    const tagsSet = new Set();
    flowStream.forEach(f => f.tags.forEach(t => tagsSet.add(t)));

    select.innerHTML = `<option value="all">全部分类/标签 (${flowStream.length})</option>`;
    tagsSet.forEach(tag => {
        const option = document.createElement("option");
        option.value = tag;
        option.textContent = `${tag}`;
        select.appendChild(option);
    });
}

// --- 2. 深度笔记编辑器与双向链接 ---
function renderSidebarNotesList(query = "") {
    const container = document.getElementById("notesListItems");
    container.innerHTML = "";

    const filterText = query.toLowerCase().trim();
    const sorted = [...notes].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    sorted.forEach(note => {
        if (filterText && !note.label.toLowerCase().includes(filterText)) return;

        const item = document.createElement("div");
        item.className = `note-item ${note.id === currentNoteId ? "active" : ""}`;
        item.innerHTML = `
            <div class="note-item-title">${escapeHTML(note.label)}</div>
            <div class="note-item-sub">${new Date(note.updatedAt).toLocaleDateString()} · ${note.tags.length} 标签</div>
        `;

        item.addEventListener("click", () => {
            currentNoteId = note.id;
            renderSidebarNotesList();
            renderEditor();
        });

        container.appendChild(item);
    });
}

function renderEditor() {
    const currentNote = notes.find(n => n.id === currentNoteId);
    if (!currentNote) return;

    document.getElementById("noteTitleInput").value = currentNote.label;
    document.getElementById("noteTagsInput").value = currentNote.tags ? currentNote.tags.join(", ") : "";
    document.getElementById("noteContentInput").value = currentNote.content || "";
    document.getElementById("noteUpdatedTime").textContent = `保存于 ${new Date(currentNote.updatedAt).toLocaleTimeString()}`;

    renderBacklinksPanel();
}

function renderBacklinksPanel() {
    const currentNote = notes.find(n => n.id === currentNoteId);
    if (!currentNote) return;

    const targetTitle = currentNote.label.toLowerCase();

    // 1. 查找链入到当前卡片的反链 (Backlinks)
    const backlinksEl = document.getElementById("backlinksList");
    backlinksEl.innerHTML = "";

    const backlinks = notes.filter(n => {
        if (n.id === currentNote.id) return false;
        const links = extractBiLinks(n.content);
        return links.some(l => l.toLowerCase() === targetTitle);
    });

    if (backlinks.length === 0) {
        backlinksEl.innerHTML = `<p class="section-desc">暂无笔记链入此处。通过 <code>[[${escapeHTML(currentNote.label)}]]</code> 来建立连接！</p>`;
    } else {
        backlinks.forEach(sourceNote => {
            const el = document.createElement("div");
            el.className = "backlink-item";
            el.innerHTML = `
                <div class="backlink-title">📄 ${escapeHTML(sourceNote.label)}</div>
                <div class="backlink-preview">${escapeHTML(sourceNote.content.slice(0, 80))}...</div>
            `;
            el.addEventListener("click", () => {
                currentNoteId = sourceNote.id;
                renderSidebarNotesList();
                renderEditor();
            });
            backlinksEl.appendChild(el);
        });
    }

    // 2. 查找本文引用的正向链接 (Outbound links)
    const outboundEl = document.getElementById("outboundList");
    outboundEl.innerHTML = "";
    const outboundLinks = extractBiLinks(currentNote.content);

    if (outboundLinks.length === 0) {
        outboundEl.innerHTML = `<p class="section-desc">未引用其他卡片。键入 [[笔记名]] 快速关联。</p>`;
    } else {
        outboundLinks.forEach(linkTitle => {
            const targetNote = notes.find(n => n.label.toLowerCase() === linkTitle.toLowerCase());
            const el = document.createElement("div");
            el.className = "backlink-item";
            el.innerHTML = `
                <div class="backlink-title">${targetNote ? "↗️" : "✨ 新建"} ${escapeHTML(linkTitle)}</div>
                <div class="backlink-preview">${targetNote ? "跳转打开这条笔记" : "点击创建这条新笔记"}</div>
            `;
            el.addEventListener("click", () => openNoteByTitle(linkTitle));
            outboundEl.appendChild(el);
        });
    }

    // 3. 渲染本地推荐提示
    const aiEl = document.getElementById("aiSuggestLinks");
    aiEl.innerHTML = "";
    const others = notes.filter(n => n.id !== currentNote.id && !outboundLinks.includes(n.label)).slice(0, 2);
    others.forEach(o => {
        const el = document.createElement("div");
        el.className = "backlink-item";
        el.innerHTML = `<div class="backlink-title">🦉 建议：[[${escapeHTML(o.label)}]]</div>`;
        el.addEventListener("click", () => {
            const input = document.getElementById("noteContentInput");
            input.value += `\n\n相关关联：[[${o.label}]]`;
            input.dispatchEvent(new Event("input"));
            showToast(`已添加对 [[${o.label}]] 的链接`);
        });
        aiEl.appendChild(el);
    });
}

function extractBiLinks(text) {
    if (!text) return [];
    const matches = [...text.matchAll(/\[\[(.*?)\]\]/g)];
    return [...new Set(matches.map(m => m[1].trim()))];
}

function openNoteByTitle(title) {
    let target = notes.find(n => n.label.toLowerCase() === title.toLowerCase());
    if (!target) {
        target = {
            id: `note-${Date.now()}`,
            label: title,
            content: `# ${title}\n\n该卡片由双向链接自动引出。在此补充原子化观点。`,
            tags: ["新卡片"],
            updatedAt: new Date().toISOString()
        };
        notes.unshift(target);
        saveNotesToStorage();
        showToast(`✨ 已创建卡片 [[${title}]]`);
    }

    currentNoteId = target.id;
    // 切换到 Editor 视图
    document.querySelector('.nav-tab[data-tab="editor"]').click();
    renderSidebarNotesList();
    renderEditor();
}

function createNewNote() {
    const title = `新卡片 ${notes.length + 1}`;
    const newNote = {
        id: `note-${Date.now()}`,
        label: title,
        content: `# ${title}\n\n写下一个清晰的知识节点，通过 [[链接]] 与已有卡片发生化学反应。`,
        tags: ["默认"],
        updatedAt: new Date().toISOString()
    };
    notes.unshift(newNote);
    saveNotesToStorage();
    currentNoteId = newNote.id;
    renderSidebarNotesList();
    renderEditor();
    showToast("✨ 成功新建深度笔记");
}

function saveCurrentNote() {
    saveNotesToStorage();
    showToast("💾 笔记已安全保存至本地");
}

function deleteCurrentNote() {
    if (notes.length <= 1) {
        showToast("请至少保留一条笔记知识哦 ~");
        return;
    }
    notes = notes.filter(n => n.id !== currentNoteId);
    currentNoteId = notes[0].id;
    saveNotesToStorage();
    renderSidebarNotesList();
    renderEditor();
    showToast("🗑️ 已删除改条笔记");
}

// --- 3. 导出为 Obsidian 完美支持的结构化 JSON ---
function handleExportObsidian() {
    // 构建兼容 sync_to_obsidian.ps1 的格式
    const edges = [];
    notes.forEach(note => {
        const links = extractBiLinks(note.content);
        links.forEach(linkTitle => {
            edges.push({
                source: note.label,
                target: linkTitle
            });
        });
    });

    const exportBundle = {
        version: "FlowNotes-1.0",
        exportedAt: new Date().toISOString(),
        nodes: notes.map(n => ({
            id: n.id,
            label: n.label,
            content: n.content,
            tags: n.tags,
            updatedAt: n.updatedAt
        })),
        edges: edges
    };

    const jsonString = JSON.stringify(exportBundle, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "obsidian_graph_backup.json"; // 与 PowerShell 默认读取名称绝对保持一致
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // 弹出说明模态框
    document.getElementById("exportModal").style.display = "flex";
}

// --- 4. 思维图谱可视化 (Visual Idea Map Canvas) ---
let graphNodes = [];
let graphEdges = [];
let animFrame = null;
let graphZoom = 1;
let draggedNode = null;

function startGraphSimulation() {
    const canvas = document.getElementById("graphCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    // 1. 初始化所有卡片节点
    graphNodes = notes.map((note, index) => {
        const angle = (index / notes.length) * Math.PI * 2;
        const radius = Math.min(canvas.width, canvas.height) * 0.25;
        return {
            id: note.id,
            label: note.label,
            x: canvas.width / 2 + Math.cos(angle) * radius,
            y: canvas.height / 2 + Math.sin(angle) * radius,
            vx: 0,
            vy: 0,
            radius: 26,
            tagsCount: note.tags.length
        };
    });

    // 2. 建立双链相联 Edges
    graphEdges = [];
    notes.forEach(note => {
        const links = extractBiLinks(note.content);
        links.forEach(targetTitle => {
            const targetNode = graphNodes.find(n => n.label.toLowerCase() === targetTitle.toLowerCase());
            if (targetNode) {
                graphEdges.push({
                    source: graphNodes.find(n => n.id === note.id),
                    target: targetNode
                });
            }
        });
    });

    document.getElementById("statNodes").textContent = graphNodes.length;
    document.getElementById("statEdges").textContent = graphEdges.length;

    // 3. 绑定 Canvas 拖拽事件
    canvas.onmousedown = (e) => {
        const mouseX = e.offsetX;
        const mouseY = e.offsetY;
        draggedNode = graphNodes.find(n => {
            const dx = n.x - mouseX;
            const dy = n.y - mouseY;
            return Math.sqrt(dx * dx + dy * dy) < n.radius * 1.5;
        });
    };

    canvas.onmousemove = (e) => {
        if (draggedNode) {
            draggedNode.x = e.offsetX;
            draggedNode.y = e.offsetY;
            draggedNode.vx = 0;
            draggedNode.vy = 0;
        }
    };

    canvas.onmouseup = (e) => {
        if (draggedNode) {
            // 如果单击释放，打开笔记
            const n = draggedNode;
            setTimeout(() => {
                openNoteByTitle(n.label);
            }, 100);
            draggedNode = null;
        }
    };

    // 4. 启动轻量物理渲染循环
    if (animFrame) cancelAnimationFrame(animFrame);

    function step() {
        // 力导向逻辑
        const kCenter = 0.015;
        const kRepel = 2400;
        const kSpring = 0.05;

        graphNodes.forEach(node => {
            if (node === draggedNode) return;
            // 吸引向画布核心
            node.vx += (canvas.width / 2 - node.x) * kCenter;
            node.vy += (canvas.height / 2 - node.y) * kCenter;

            // 节点间排斥
            graphNodes.forEach(other => {
                if (other === node) return;
                let dx = node.x - other.x;
                let dy = node.y - other.y;
                let dist = Math.sqrt(dx * dx + dy * dy) || 1;
                if (dist < 320) {
                    let force = kRepel / (dist * dist);
                    node.vx += (dx / dist) * force;
                    node.vy += (dy / dist) * force;
                }
            });
        });

        // 连线弹簧吸引
        graphEdges.forEach(edge => {
            if (!edge.source || !edge.target) return;
            let dx = edge.target.x - edge.source.x;
            let dy = edge.target.y - edge.source.y;
            let dist = Math.sqrt(dx * dx + dy * dy) || 1;
            let force = (dist - 140) * kSpring;
            if (edge.source !== draggedNode) {
                edge.source.vx += (dx / dist) * force;
                edge.source.vy += (dy / dist) * force;
            }
            if (edge.target !== draggedNode) {
                edge.target.vx -= (dx / dist) * force;
                edge.target.vy -= (dy / dist) * force;
            }
        });

        // 位置更新与阻尼
        graphNodes.forEach(node => {
            if (node === draggedNode) return;
            node.vx *= 0.85;
            node.vy *= 0.85;
            node.x += node.vx;
            node.y += node.vy;
        });

        // 绘制图表
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 绘制连线 (Edges)
        ctx.strokeStyle = "rgba(139, 92, 246, 0.45)";
        ctx.lineWidth = 2;
        graphEdges.forEach(edge => {
            ctx.beginPath();
            ctx.moveTo(edge.source.x, edge.source.y);
            ctx.lineTo(edge.target.x, edge.target.y);
            ctx.stroke();
        });

        // 绘制卡片圆球 (Nodes)
        graphNodes.forEach(node => {
            // 荧光外圈
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.radius + 6, 0, Math.PI * 2);
            ctx.fillStyle = node.id === currentNoteId ? "rgba(56, 189, 248, 0.25)" : "rgba(99, 102, 241, 0.15)";
            ctx.fill();

            // 内边框球体
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
            ctx.fillStyle = node.id === currentNoteId ? "#38bdf8" : "#6366f1";
            ctx.fill();

            // 文字标识
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 13px Inter, sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(node.label, node.x, node.y + node.radius + 20);
        });

        animFrame = requestAnimationFrame(step);
    }

    step();
}

function resetGraphZoom() {
    showToast("🕸️ 图谱坐标已归中");
    startGraphSimulation();
}

// --- 5. 智慧助手面板 ---
function populateAISelect() {
    const select = document.getElementById("aiNoteSelector");
    select.innerHTML = "";
    notes.forEach(note => {
        const opt = document.createElement("option");
        opt.value = note.id;
        opt.textContent = note.label;
        select.appendChild(opt);
    });
}

function runAIAnalysis() {
    const box = document.getElementById("aiReportBox");
    box.innerHTML = "🦉 猫头鹰正在深度分析知识网络...";

    setTimeout(() => {
        const total = notes.length;
        const totalTags = new Set(notes.flatMap(n => n.tags)).size;
        const allLinks = notes.flatMap(n => extractBiLinks(n.content));
        const orphanNotes = notes.filter(n => {
            const isTargeted = notes.some(o => extractBiLinks(o.content).includes(n.label));
            const hasOutbound = extractBiLinks(n.content).length > 0;
            return !isTargeted && !hasOutbound;
        });

        box.innerHTML = `【知识库健康诊断报告】
- 知识节点统计：共 ${total} 篇深度卡片，使用了 ${totalTags} 个独立标签。
- 双链连通率：全局构建了 ${allLinks.length} 条反向和关联引用。
- 孤立知识卡片：发现 ${orphanNotes.length} 篇无双链引用的独立条目 (${orphanNotes.map(o => o.label).join(", ") || "无孤立节点"})。

🦉 猫头鹰指导建议：
你可以为最近录入的《${notes[0]?.label || "新笔记"}》补充关于“卡片盒原理解析”的关联描述。`;
    }, 600);
}

function generateAIPrompt() {
    const select = document.getElementById("aiNoteSelector");
    const noteId = select.value;
    const note = notes.find(n => n.id === noteId);
    if (!note) return;

    const outBox = document.getElementById("aiPromptOutput");
    outBox.innerHTML = `【反思与发散角度：${note.label}】

1. [因果探究] 支撑这个关键核心想法的前置条件和实践背景是什么？
2. [反向验证] 是否在某些特殊场景下，该原则不成立或需要修订？
3. [跨维联结] 这个概念如何与你的项目实践（例如 [[瞬时心流捕获]]）结合？
4. [建议标签] #核心方法 #自我提升 #长期复盘`;
}

// --- 6. 辅助工具与交互效果 ---
function filterAllViews(query) {
    if (!query) {
        renderFlowStream();
        renderSidebarNotesList();
        return;
    }
    // 过滤心流
    const listEl = document.getElementById("flowList");
    listEl.innerHTML = "";
    flowStream.filter(f => f.content.toLowerCase().includes(query) || f.tags.some(t => t.toLowerCase().includes(query)))
        .forEach(item => {
            const card = document.createElement("div");
            card.className = "flow-card";
            card.innerHTML = `<div class="flow-card-meta"><span>⚡ 思考流</span><span>${item.timestamp}</span></div><div class="flow-card-content">${escapeHTML(item.content)}</div>`;
            listEl.appendChild(card);
        });

    // 过滤卡片目录
    renderSidebarNotesList(query);
}

function toggleTheme() {
    const root = document.documentElement;
    const current = root.getAttribute("data-theme") || "dark";
    const next = current === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("flownotes_theme", next);
    updateThemeIcon(next);
}

function updateThemeIcon(theme) {
    const icon = document.getElementById("themeIcon");
    if (icon) {
        icon.textContent = theme === "dark" ? "🌙" : "☀️";
    }
}

function showOwlWisdom() {
    const msgEl = document.getElementById("owlMessage");
    const banner = document.getElementById("owlBanner");
    const rand = OWL_WISDOMS[Math.floor(Math.random() * OWL_WISDOMS.length)];
    if (msgEl && banner) {
        msgEl.textContent = rand;
        banner.style.display = "flex";
    }
}

function showToast(msg) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => {
        toast.classList.remove("show");
    }, 2800);
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}
