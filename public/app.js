/**
 * ============================================================================
 * FlowNotes — Mindmap-First Personal Knowledge System
 * (Powered by D3.js Interactive Graph Engine & GitHub Gist Anti-Loss Sync)
 * Full XMind Shortcuts Suite: Ctrl+Z Undo, Tab Child, Enter Sibling, Delete, F2, Arrows
 * ============================================================================
 */

const DEFAULT_GIST_ID = "4e7cc31fd55d0614a69e31283319953d";
const DEFAULT_PAT_TOKEN = "";

// --- 初始默认图谱树节点 ---
const DEFAULT_NODES = [
    { id: "root_1", label: "核心概念", parentId: null, content: "# 核心概念\n\n欢迎来到 FlowNotes **思维导图优先 (Mindmap-First)** 知识库！\n\n- 在图谱中按 `Enter` 键建同级节点，按 `Tab` 键建子节点，按 `Ctrl+Z` 撤销。\n- 双击空白处创建独立的全新主题节点！", order: 0, x: 450, y: 320 },
    { id: "node_2", label: "瞬时心流捕获", parentId: "root_1", content: "# 瞬时心流捕获\n\n以 Stream 形式无摩擦倾倒灵感，自动提取 `#标签` 与 `[[双链]]`。", order: 0, x: 250, y: 480 },
    { id: "node_3", label: "卡片盒笔记法原则", parentId: "root_1", content: "# 卡片盒笔记法原则\n\n原子化观点 + 自底向上的关联支撑。", order: 1, x: 650, y: 480 },
    { id: "node_4", label: "GitHub Gist 防误删", parentId: "node_3", content: "# GitHub Gist 防误删\n\n每一次修改产生独立 Commit，哪怕误删也能 100% 还原。", order: 0, x: 780, y: 620 }
];

const DEFAULT_LINKS = [
    { source: "root_1", target: "node_2" },
    { source: "root_1", target: "node_3" },
    { source: "node_3", target: "node_4" },
    { source: "node_2", target: "node_4", type: "relation" }
];

const DEFAULT_FLOW_STREAM = [
    { id: "flow-101", content: "在 [[核心概念]] 中按 Tab 快捷新增分支节点。 #灵感", tags: ["#灵感"], timestamp: new Date().toLocaleString() }
];

const OWL_WISDOMS = [
    "“XMind 连招全集：Enter 同级节点 | Tab 子节点 | Ctrl+Z 撤销 | Delete 删除 | F2 重命名 | 方向键漫游”",
    "“双击空白处建独立根节点，按 📖 随时隐现右侧编辑器，按 M 键秒切 XMind 树状清晰模式！”",
    "“已为你自动绑定私有 Gist，每次修改都会产生 Git Commit，误删任何卡片都能一键恢复！”"
];

// --- 状态管理与 Undo/Redo 历史栈 ---
let nodes = [];
let links = [];
let flowStream = [];
let selectedNode = null;
let selectedNodeIds = new Set();
let layoutMode = "tree"; // 默认使用整洁安全的 "tree" (XMind 模式)，点击 ✦ 按钮可切换为 Obsidian Q 弹网状模式
let ghSyncTimer = null;

// D3 全局引用
let svg, simulation, zoom, zoomContainer;

// XMind 风格调色板
const XMIND_ROOT_COLOR = "#E74C3C";
const XMIND_BRANCH_COLORS = [
    "#4FC3F7", "#FF8A65", "#81C784", "#BA68C8",
    "#FFD54F", "#4DB6AC", "#F06292", "#7986CB",
    "#A1887F", "#90A4AE"
];

// 追溯节点的分支祖先（根节点的直接子节点），返回分支索引
function getBranchIndex(node) {
    if (!node || node.parentId === null) return -1; // 根节点
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    let current = node;
    let visited = new Set();
    while (current && current.parentId !== null) {
        if (visited.has(current.id)) break;
        visited.add(current.id);
        const parent = nodeMap.get(current.parentId);
        if (!parent) break;
        if (parent.parentId === null) {
            // current 是根节点的直接子节点 = 分支祖先
            const siblings = nodes.filter(n => n.parentId === parent.id);
            siblings.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            return siblings.findIndex(s => s.id === current.id);
        }
        current = parent;
    }
    return 0;
}

function getNodeColor(d) {
    if (d.parentId === null) return XMIND_ROOT_COLOR;
    const idx = getBranchIndex(d);
    return XMIND_BRANCH_COLORS[idx % XMIND_BRANCH_COLORS.length];
}

function getLinkColor(link) {
    const target = typeof link.target === "object" ? link.target : nodes.find(n => n.id === link.target);
    if (!target) return "rgba(148,163,184,0.4)";
    if (link.type === "relation") return "rgba(56,189,248,0.45)";
    return getNodeColor(target);
}

let historyStack = [];
let historyRedoStack = [];
const MAX_HISTORY = 50;

function pushHistory() {
    const snapshot = JSON.stringify({ nodes, links });
    if (historyStack.length === 0 || historyStack[historyStack.length - 1] !== snapshot) {
        historyStack.push(snapshot);
        if (historyStack.length > MAX_HISTORY) historyStack.shift();
        historyRedoStack = [];
    }
}

function undo() {
    if (historyStack.length <= 1) {
        showToast("无法继续撤销 (已在最初起点)");
        return;
    }
    const current = historyStack.pop();
    historyRedoStack.push(current);
    const prevSnapshot = historyStack[historyStack.length - 1];
    restoreSnapshot(prevSnapshot);
    showToast("↩️ 已撤销操作 (Ctrl+Z)");
}

function redo() {
    if (historyRedoStack.length === 0) {
        showToast("无法重做");
        return;
    }
    const nextSnapshot = historyRedoStack.pop();
    historyStack.push(nextSnapshot);
    restoreSnapshot(nextSnapshot);
    showToast("↪️ 已重做操作 (Ctrl+Y)");
}

function restoreSnapshot(snapshotStr) {
    try {
        const data = JSON.parse(snapshotStr);
        nodes = data.nodes || [];
        links = data.links || [];
        saveGraphToStorage(false);
        if (layoutMode === "tree") tidyLayout();
        else updateD3Graph();
        renderEditor();
    } catch (e) {}
}

// 安全解析 Link 坐标
function getNodePos(idOrObj, axis) {
    if (!idOrObj) return 0;
    if (typeof idOrObj === "object") return Number.isFinite(idOrObj[axis]) ? idOrObj[axis] : 0;
    const n = nodes.find(item => item.id === idOrObj);
    return n && Number.isFinite(n[axis]) ? n[axis] : 0;
}

// --- 初始化系统 ---
document.addEventListener("DOMContentLoaded", () => {
    initStorage();
    initD3Mindmap();
    initEvents();
    renderAll();
    initGhSyncUI();
    showOwlWisdom();
    pushHistory();
});

// --- 多图谱全局状态管理 ---
let mapsManifest = [];
let activeMapId = "map_default";

function initStorage() {
    const savedManifest = localStorage.getItem("flownotes_maps_manifest");
    const savedActiveId = localStorage.getItem("flownotes_active_map_id");

    if (savedManifest) {
        try {
            mapsManifest = JSON.parse(savedManifest);
            activeMapId = savedActiveId || (mapsManifest[0] ? mapsManifest[0].id : "map_default");
        } catch (e) {
            mapsManifest = [];
        }
    }

    // 平滑兼容迁移：若没有 Manifest 但有旧版的 obsidian_nodes，包装为“默认思维导图”
    if (!mapsManifest || mapsManifest.length === 0) {
        const legacyNodes = localStorage.getItem("obsidian_nodes");
        const legacyLinks = localStorage.getItem("obsidian_links");
        const legacyFlows = localStorage.getItem("flownotes_stream_v1");

        activeMapId = "map_default";
        mapsManifest = [{
            id: "map_default",
            title: "默认思维导图",
            icon: "🧠",
            nodeCount: legacyNodes ? (JSON.parse(legacyNodes) || []).length : DEFAULT_NODES.length,
            updatedAt: new Date().toLocaleString()
        }];
        localStorage.setItem("flownotes_maps_manifest", JSON.stringify(mapsManifest));
        localStorage.setItem("flownotes_active_map_id", activeMapId);

        const initData = {
            nodes: legacyNodes ? JSON.parse(legacyNodes) : DEFAULT_NODES,
            links: legacyLinks ? JSON.parse(legacyLinks) : DEFAULT_LINKS,
            flowStream: legacyFlows ? JSON.parse(legacyFlows) : DEFAULT_FLOW_STREAM
        };
        localStorage.setItem(`flownotes_map_data_${activeMapId}`, JSON.stringify(initData));
    }

    loadMapData(activeMapId);
}

function loadMapData(mapId) {
    activeMapId = mapId;
    localStorage.setItem("flownotes_active_map_id", activeMapId);

    const raw = localStorage.getItem(`flownotes_map_data_${mapId}`);
    if (raw) {
        try {
            const data = JSON.parse(raw);
            nodes = data.nodes || [];
            links = data.links || [];
            flowStream = data.flowStream || [];
            sanitizeGraph();
        } catch (e) {
            nodes = [...DEFAULT_NODES];
            links = [...DEFAULT_LINKS];
            flowStream = [...DEFAULT_FLOW_STREAM];
        }
    } else {
        nodes = [...DEFAULT_NODES];
        links = [...DEFAULT_LINKS];
        flowStream = [...DEFAULT_FLOW_STREAM];
    }

    selectedNode = nodes[0] || null;
    if (selectedNode) selectedNodeIds = new Set([selectedNode.id]);
    else selectedNodeIds = new Set();
}

function saveGraphToStorage(recordHistory = true) {
    if (recordHistory) pushHistory();

    // 1. 保存当前激活图谱的数据
    const currentData = {
        nodes: nodes,
        links: cleanLinks(),
        flowStream: flowStream
    };
    localStorage.setItem(`flownotes_map_data_${activeMapId}`, JSON.stringify(currentData));

    // 兼顾向后兼容
    localStorage.setItem("obsidian_nodes", JSON.stringify(nodes));
    localStorage.setItem("obsidian_links", JSON.stringify(cleanLinks()));

    // 2. 更新当前图谱在 Manifest 中的元数据 (卡片数、修改时间)
    const targetMap = mapsManifest.find(m => m.id === activeMapId);
    if (targetMap) {
        targetMap.nodeCount = nodes.length;
        targetMap.updatedAt = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        localStorage.setItem("flownotes_maps_manifest", JSON.stringify(mapsManifest));
    }

    updateCurrentMapBadge();
    renderOrganizerUI();
    triggerAutoGhSync();
}

function saveFlowsToStorage() {
    localStorage.setItem("flownotes_stream_v1", JSON.stringify(flowStream));
    saveGraphToStorage(false);
}

// --- D3 矢量思维导图引擎 (参照 obsidian.qchen9108.workers.dev 正确架构) ---

// 辅助：清理 link source/target 为字符串 ID
function cleanNodeId(val) {
    return val && val.id ? val.id : val;
}

// 辅助：生成唯一 link key 用于 D3 data join
function linkDataKey(link) {
    const s = cleanNodeId(link.source);
    const t = cleanNodeId(link.target);
    return link.type === "relation"
        ? `relation:${[s, t].sort().join("::")}`
        : `tree:${s}->${t}`;
}

// 辅助：清理 links 为干净的 {source, target, type?} 对象
function cleanLinks() {
    return links.map(l => {
        const link = { source: cleanNodeId(l.source), target: cleanNodeId(l.target) };
        if (l.type === "relation") link.type = "relation";
        return link;
    });
}

// 辅助：启动时清理孤儿链接 + 去重
function sanitizeGraph() {
    const nodeIds = new Set(nodes.map(n => n.id));
    // 清理 parentId
    nodes.forEach(n => {
        if (n.parentId && !nodeIds.has(n.parentId)) n.parentId = null;
    });
    // 清理孤儿链接 + 去重
    const seenLinks = new Set();
    links = cleanLinks().filter(l => {
        if (!nodeIds.has(l.source) || !nodeIds.has(l.target) || l.source === l.target) return false;
        const key = linkDataKey(l);
        if (seenLinks.has(key)) return false;
        seenLinks.add(key);
        return true;
    });
}

// D3 持久引用（与 reference 一致，分层 <g> 组）
let linkElements, nodeElements;

function initD3Mindmap() {
    const container = document.getElementById("graph-container");
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    svg = d3.select("#graph-svg")
        .attr("width", width)
        .attr("height", height);

    svg.selectAll("*").remove();

    zoomContainer = svg.append("g").attr("class", "zoom-container");

    // 链接层在节点层下面（z-order 正确）
    linkElements = zoomContainer.append("g").attr("class", "link-layer").selectAll("line");
    nodeElements = zoomContainer.append("g").attr("class", "node-layer").selectAll(".node-group");

    // Zoom: 禁用默认 wheel（我们自定义 Pan/Zoom 行为）
    zoom = d3.zoom()
        .scaleExtent([0.08, 5])
        .filter((event) => {
            if (event.type === 'wheel') return false; // 禁止 D3 默认 wheel zoom
            return true;
        })
        .on("zoom", (event) => {
            zoomContainer.attr("transform", event.transform);
        });

    svg.call(zoom).on("dblclick.zoom", null);

    // 自定义滚轮行为：裸滚轮 = 平移画布，Ctrl+滚轮 = 缩放（与 reference 一致）
    svg.node().addEventListener("wheel", handleGraphWheel, { passive: false });

    // 双击画布空白处创建 100% 独立的全新根主题节点
    svg.on("dblclick", (event) => {
        if (event.target.closest && event.target.closest(".node-group")) return;
        if (event.target.tagName === "circle" || event.target.tagName === "text") return;

        const coords = d3.pointer(event, zoomContainer.node());
        const newId = `root_${Date.now()}`;

        const newNode = {
            id: newId,
            label: `新主题 ${nodes.length + 1}`,
            parentId: null,
            content: `# 新主题 ${nodes.length + 1}\n\n点击编辑 Markdown 内容...`,
            order: nodes.length,
            x: coords[0],
            y: coords[1]
        };

        nodes.push(newNode);
        selectedNode = newNode;
        selectedNodeIds = new Set([newId]);

        saveGraphToStorage();
        if (layoutMode === "tree") tidyLayout();
        else updateD3Graph();
        renderPositions();
        renderEditor();
        focusOnNode(newNode);
        showToast(`✨ 创建了全新的独立根节点 [[${newNode.label}]]`);

        setTimeout(() => {
            const titleInput = document.getElementById("title-input");
            if (titleInput && !titleInput.disabled) {
                titleInput.focus();
                titleInput.select();
            }
        }, 60);
    });

    // 媲美 Obsidian Graph View 的四向柔和果冻 Q 弹物理仿真器
    simulation = d3.forceSimulation(nodes)
        .alphaDecay(0.028)
        .velocityDecay(0.32)
        .force("link", d3.forceLink(links).id(d => d.id).distance(110).strength(0.35))
        .force("charge", d3.forceManyBody().strength(-220))
        .force("collide", d3.forceCollide().radius(d => (d.parentId === null ? 35 : 25)).strength(0.85))
        .force("x", d3.forceX(width / 2).strength(0.02))
        .force("y", d3.forceY(height / 2).strength(0.02))
        .on("tick", renderPositions);

    updateD3Graph();
    initMarqueeSelection();
    if (layoutMode === "tree") {
        tidyLayout();
    }
}

// --- 🔳 矩形框选多选引擎 (Marquee Box Selection Engine) ---
let isMarqueeMode = false;
let isMarqueeDragging = false;
let marqueeStartCoords = [0, 0];

function toggleMarqueeMode(forceState) {
    isMarqueeMode = typeof forceState === "boolean" ? forceState : !isMarqueeMode;
    const btn = document.getElementById("btn-marquee");
    if (btn) btn.classList.toggle("active", isMarqueeMode);

    if (isMarqueeMode) {
        showToast("🔳 已开启矩形框选模式 (在空白拉框多选，双击或切按钮退出)");
    } else {
        showToast("✋ 已切换为画布平移模式");
    }
}

function initMarqueeSelection() {
    if (!svg || !zoomContainer) return;

    let marqueeBox = zoomContainer.select("#marquee-box");
    if (marqueeBox.empty()) {
        marqueeBox = zoomContainer.append("rect")
            .attr("id", "marquee-box")
            .attr("class", "marquee-box")
            .style("display", "none");
    }

    svg.on("mousedown.marquee", (event) => {
        // 当按住 Shift 键，或者开启了 isMarqueeMode 框选模式，且点击在空白处时触发
        const isShiftKey = event.shiftKey;
        const isClickCanvas = !event.target.closest || (!event.target.closest(".node-group") && event.target.tagName !== "circle" && event.target.tagName !== "text");

        if ((isShiftKey || isMarqueeMode) && isClickCanvas) {
            event.stopPropagation();
            isMarqueeDragging = true;
            marqueeStartCoords = d3.pointer(event, zoomContainer.node());

            marqueeBox
                .attr("x", marqueeStartCoords[0])
                .attr("y", marqueeStartCoords[1])
                .attr("width", 0)
                .attr("height", 0)
                .style("display", "block");

            // 如果没有按 Shift 键，则重置上一次的多选
            if (!isShiftKey) {
                selectedNodeIds.clear();
                refreshNodeStyles();
            }
        }
    });

    svg.on("mousemove.marquee", (event) => {
        if (!isMarqueeDragging) return;
        event.stopPropagation();

        const currentCoords = d3.pointer(event, zoomContainer.node());
        const x = Math.min(marqueeStartCoords[0], currentCoords[0]);
        const y = Math.min(marqueeStartCoords[1], currentCoords[1]);
        const w = Math.abs(currentCoords[0] - marqueeStartCoords[0]);
        const h = Math.abs(currentCoords[1] - marqueeStartCoords[1]);

        marqueeBox
            .attr("x", x)
            .attr("y", y)
            .attr("width", w)
            .attr("height", h);

        // 框选碰撞检测：找出位于 [x, y, w, h] 框内的节点
        const nodeMap = new Map(nodes.map(n => [n.id, n]));
        const visibleNodes = nodes.filter(n => isNodeVisible(n, nodeMap));

        visibleNodes.forEach(n => {
            const inBox = n.x >= x && n.x <= (x + w) && n.y >= y && n.y <= (y + h);
            if (inBox) {
                selectedNodeIds.add(n.id);
            }
        });

        refreshNodeStyles();
    });

    svg.on("mouseup.marquee", (event) => {
        if (!isMarqueeDragging) return;
        isMarqueeDragging = false;
        marqueeBox.style("display", "none");

        if (selectedNodeIds.size > 0) {
            const firstId = Array.from(selectedNodeIds)[0];
            const target = nodes.find(n => n.id === firstId);
            if (target) {
                selectedNode = target;
                renderEditor();
            }
            showToast(`🔳 已成功框选 ${selectedNodeIds.size} 个节点 (可批量平移 / 删除 / 划重点)`);
        }
    });
}

function focusOnNode(node) {
    if (!node || !svg) return;
    selectedNode = node;
    selectedNodeIds = new Set([node.id]);
    refreshNodeStyles();
    renderEditor();

    const container = document.getElementById("graph-container");
    const w = container ? container.clientWidth : 800;
    const h = container ? container.clientHeight : 600;

    const nodeX = Number.isFinite(node.x) ? node.x : w / 2;
    const nodeY = Number.isFinite(node.y) ? node.y : h / 2;
    const current = d3.zoomTransform(svg.node());
    const scale = Math.max(0.8, Math.min(current.k || 1.15, 1.35));
    const next = d3.zoomIdentity.translate(w / 2, h / 2).scale(scale).translate(-nodeX, -nodeY);
    svg.transition().duration(450).call(zoom.transform, next);
}

function handleGraphWheel(event) {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
        // Ctrl + 滚轮 = 缩放
        const point = d3.pointer(event, svg.node());
        const factor = Math.pow(1.0018, -event.deltaY);
        svg.call(zoom.scaleBy, factor, point);
        return;
    }
    // 裸滚轮 / 双指 = 平移画布
    zoom.translateBy(svg, -event.deltaX, -event.deltaY);
}

function renderPositions() {
    if (!linkElements || !nodeElements) return;
    linkElements
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);
    nodeElements
        .attr("transform", d => `translate(${d.x},${d.y})`);
}

// 轻量级：只刷新节点视觉样式（选中高亮、重点发光等），不重启仿真
function refreshNodeStyles() {
    if (!nodeElements) return;
    nodeElements.each(function(d) {
        const group = d3.select(this);
        const r = d.parentId === null ? 22 : 16;
        const isSelected = selectedNodeIds.has(d.id);
        const isFocus = !!d.isFocus;

        group.select(".node-circle")
            .attr("r", r)
            .style("fill", getNodeColor(d))
            .style("stroke", isSelected ? "#fff" : (isFocus ? "#fbbf24" : "rgba(255,255,255,0.3)"))
            .style("stroke-width", isSelected ? "4px" : (isFocus ? "3px" : "2px"));

        group.select(".node-label")
            .attr("dy", (r + 15) + "px")
            .text((isFocus ? "⭐ " : "") + d.label)
            .style("fill", isSelected ? "var(--node-text-selected)" : (isFocus ? "#fef08a" : "var(--node-text)"))
            .style("font-weight", isSelected || isFocus ? "bold" : "normal");

        group.select(".focus-glow-ring")
            .style("display", isFocus ? "block" : "none")
            .attr("r", r + 10);

        group.select(".focus-star-label")
            .style("display", isFocus ? "block" : "none")
            .attr("transform", `translate(${-(r + 14)}, ${-(r / 2)})`);

        // 动态刷新折叠/展开 Badge 标志
        const descCount = getDescendantCount(d.id);
        const badge = group.select(".node-fold-badge");
        if (descCount > 0) {
            badge.style("display", "block")
                .attr("transform", `translate(${r + 6}, ${-r / 2})`);
            badge.select(".fold-circle")
                .attr("r", 9)
                .style("fill", d.collapsed ? "#ef4444" : "rgba(255,255,255,0.25)")
                .style("stroke", "#fff")
                .style("stroke-width", "1px");
            badge.select(".fold-text")
                .text(d.collapsed ? `+${descCount}` : "−")
                .style("fill", "#fff")
                .style("font-size", "10px")
                .style("font-weight", "bold");
        } else {
            badge.style("display", "none");
        }

        group.classed("multi-selected", isSelected);
        group.classed("is-focus-node", isFocus);
        group.classed("is-collapsed", !!d.collapsed);
    });
}

function updateD3Graph() {
    if (!zoomContainer) return;

    // 过滤得到所有可显示的节点与连线（只渲染祖先未被折叠的节点）
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const visibleNodes = nodes.filter(n => isNodeVisible(n, nodeMap));
    const visibleNodeIdSet = new Set(visibleNodes.map(n => n.id));

    const visibleLinks = cleanLinks().filter(l => visibleNodeIdSet.has(l.source) && visibleNodeIdSet.has(l.target));

    linkElements = linkElements.data(visibleLinks, linkDataKey).join("line")
        .attr("class", d => d.type === "relation" ? "link relation-link" : "link")
        .style("stroke", d => getLinkColor(d))
        .style("opacity", d => d.type === "relation" ? 0.5 : 0.6);

    nodeElements = nodeElements.data(visibleNodes, d => d.id).join(
        enter => {
            const g = enter.append("g").attr("class", "node-group")
                .call(d3.drag()
                    .on("start", dragstarted)
                    .on("drag", dragged)
                    .on("end", dragended))
                .on("click", (event, d) => {
                    event.stopPropagation();
                    selectedNode = d;
                    selectedNodeIds = new Set([d.id]);
                    refreshNodeStyles(); // 只更新视觉，不重启仿真
                    renderEditor();
                    if (document.activeElement && document.activeElement !== document.body) {
                        document.activeElement.blur();
                    }
                })
                .on("dblclick", (event, d) => {
                    event.stopPropagation();
                    renameSelectedNode(d);
                });

            // ⭐ 划重点金光动态呼吸外圈
            g.append("circle").attr("class", "focus-glow-ring").style("display", "none");

            g.append("circle").attr("class", "node-circle");
            g.append("text").attr("class", "node-label").attr("text-anchor", "middle");

            // ⭐ 划重点左上角小星号 Badge
            const focusStar = g.append("text").attr("class", "focus-star-label")
                .text("⭐")
                .style("font-size", "14px")
                .style("display", "none");

            // 节点折叠 / 展开徽章点按 Badge
            const badge = g.append("g").attr("class", "node-fold-badge")
                .style("cursor", "pointer")
                .on("click", (event, d) => {
                    event.stopPropagation();
                    toggleNodeFold(d);
                });
            badge.append("circle").attr("class", "fold-circle");
            badge.append("text").attr("class", "fold-text").attr("text-anchor", "middle").attr("dy", "3px");

            return g;
        },
        update => update
    );

    // 每次渲染都更新 ALL 节点属性（包含折叠徽章与重点发光样式）
    refreshNodeStyles();

    // 更新仿真
    simulation.nodes(visibleNodes);
    simulation.force("link").links(visibleLinks);
    if (layoutMode === "force") {
        simulation.alpha(0.15).restart();
    } else {
        simulation.stop();
    }

    renderOutlineTree();
}

let dragStartPositions = new Map();

function dragstarted(event, d) {
    if (layoutMode === "force") {
        if (!event.active) simulation.alphaTarget(0.3).restart();
    }

    dragStartPositions.clear();
    if (selectedNodeIds.has(d.id) && selectedNodeIds.size > 1) {
        nodes.forEach(n => {
            if (selectedNodeIds.has(n.id)) {
                dragStartPositions.set(n.id, { x: n.x, y: n.y });
            }
        });
    } else {
        selectedNode = d;
        selectedNodeIds = new Set([d.id]);
        refreshNodeStyles();
        renderEditor();
    }

    d.fx = d.x;
    d.fy = d.y;
}

function dragged(event, d) {
    if (event.x === undefined || event.y === undefined || isNaN(event.x) || isNaN(event.y)) return;

    const dx = event.x - d.x;
    const dy = event.y - d.y;

    if (dragStartPositions.size > 1 && dragStartPositions.has(d.id)) {
        nodes.forEach(n => {
            if (dragStartPositions.has(n.id)) {
                n.x += dx;
                n.y += dy;
                n.fx = n.x;
                n.fy = n.y;
            }
        });
    } else {
        d.fx = event.x;
        d.fy = event.y;
        d.x = event.x;
        d.y = event.y;
    }

    renderPositions();
}

function dragended(event, d) {
    if (layoutMode === "force") {
        if (!event.active) simulation.alphaTarget(0);
        if (dragStartPositions.size > 1) {
            nodes.forEach(n => {
                if (dragStartPositions.has(n.id)) {
                    delete n.fx;
                    delete n.fy;
                }
            });
        } else {
            delete d.fx;
            delete d.fy;
        }
    } else {
        if (dragStartPositions.size > 1) {
            nodes.forEach(n => {
                if (dragStartPositions.has(n.id)) {
                    n.fx = n.x;
                    n.fy = n.y;
                }
            });
        } else {
            d.fx = d.x;
            d.fy = d.y;
        }
    }
    dragStartPositions.clear();
    saveGraphToStorage();
}

// --- XMind 树状布局模式 (Tidy Layout Engine) ---
function tidyLayout() {
    layoutMode = "tree";
    const container = document.getElementById("graph-container");
    const width = container ? container.clientWidth : 800;

    const nodeById = new Map(nodes.map(n => [n.id, n]));
    const childrenByParent = new Map();
    nodes.forEach(n => childrenByParent.set(n.id, []));
    const visibleNodes = nodes.filter(n => isNodeVisible(n, nodeById));
    
    nodes.forEach(n => {
        if (n.parentId && childrenByParent.has(n.parentId)) {
            // 如果父节点已折叠，子节点不排列进入视觉计算
            const parent = nodeById.get(n.parentId);
            if (parent && !parent.collapsed) {
                childrenByParent.get(n.parentId).push(n);
            }
        }
    });

    childrenByParent.forEach(children => children.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));

    const roots = nodes.filter(n => !n.parentId || !nodeById.has(n.parentId));
    roots.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const levelGap = 240;
    const rowGap = 65;
    let cursorY = 100;

    function layoutSubtree(node, depth) {
        const children = childrenByParent.get(node.id) || [];
        if (children.length === 0) {
            node._targetX = 150 + depth * levelGap;
            node._targetY = cursorY;
            cursorY += rowGap;
        } else {
            children.forEach(child => layoutSubtree(child, depth + 1));
            node._targetX = 150 + depth * levelGap;
            node._targetY = (children[0]._targetY + children[children.length - 1]._targetY) / 2;
        }
    }

    roots.forEach(root => {
        layoutSubtree(root, 0);
        cursorY += 90;
    });

    nodes.forEach(d => {
        d.x = d._targetX || d.x;
        d.y = d._targetY || d.y;
        d.fx = d._targetX;
        d.fy = d._targetY;
    });

    // 重新触发 D3 元素数据绑定（让已折叠节点从 DOM 离场消失）
    updateD3Graph();

    if (nodeElements) {
        nodeElements
            .transition().duration(450).ease(d3.easeCubicInOut)
            .attr("transform", d => `translate(${d.x},${d.y})`);
    }

    if (linkElements) {
        linkElements
            .transition().duration(450).ease(d3.easeCubicInOut)
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);
    }

    document.getElementById("btn-layout").dataset.active = "true";
    document.getElementById("btn-graph").dataset.active = "false";
}

function switchToForceLayout() {
    layoutMode = "force";
    nodes.forEach(n => {
        delete n.fx;
        delete n.fy;
        delete n._targetX;
        delete n._targetY;
    });
    
    // 更新仿真连接
    simulation.nodes(nodes);
    simulation.force("link").links(links);
    simulation.alpha(0.85).restart();

    document.getElementById("btn-layout").dataset.active = "false";
    document.getElementById("btn-graph").dataset.active = "true";

    showToast("✦ 已切换为 Obsidian 果冻 Q 弹网络");
}

// --- XMind 全套核心快捷键逻辑 ---

// 1. Tab 键：建子节点
function createChildNode() {
    if (!selectedNode) selectedNode = nodes[0];
    const newId = `node_${Date.now()}`;
    const newNode = {
        id: newId,
        label: `新节点 ${nodes.length + 1}`,
        parentId: selectedNode.id,
        content: `# 新节点\n\n点击编辑 Markdown 内容...`,
        x: selectedNode.x + 180,
        y: selectedNode.y + 40,
        order: nodes.length
    };

    nodes.push(newNode);
    links.push({ source: selectedNode.id, target: newId });
    selectedNode = newNode;
    selectedNodeIds = new Set([newId]);

    saveGraphToStorage();
    if (layoutMode === "tree") tidyLayout();
    else updateD3Graph();
    renderPositions();
    renderEditor();
    focusOnNode(newNode);
    showToast(`✨ 已增加子节点 [[${newNode.label}]]`);

    setTimeout(() => {
        const titleInput = document.getElementById("title-input");
        if (titleInput && !titleInput.disabled) {
            titleInput.focus();
            titleInput.select();
        }
    }, 60);
}

// 2. Enter 键：新建同级节点
function createSiblingNode() {
    if (!selectedNode) {
        createChildNode();
        return;
    }
    const parentId = selectedNode.parentId;
    const newId = `node_${Date.now()}`;

    const siblings = nodes.filter(n => n.parentId === parentId);
    siblings.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const maxOrder = siblings.length > 0 ? Math.max(...siblings.map(s => s.order ?? 0)) + 1 : 0;

    const newNode = {
        id: newId,
        label: `同级节点 ${nodes.length + 1}`,
        parentId: parentId,
        content: `# 同级节点\n\n点击编辑 Markdown 内容...`,
        x: selectedNode.x,
        y: selectedNode.y + 60,
        order: maxOrder
    };

    nodes.push(newNode);
    if (parentId) {
        links.push({ source: parentId, target: newId });
    }

    selectedNode = newNode;
    selectedNodeIds = new Set([newId]);

    saveGraphToStorage();
    if (layoutMode === "tree") tidyLayout();
    else updateD3Graph();
    renderPositions();
    renderEditor();
    focusOnNode(newNode);
    showToast(`✨ 已新增同级节点 [[${newNode.label}]]`);

    setTimeout(() => {
        const titleInput = document.getElementById("title-input");
        if (titleInput && !titleInput.disabled) {
            titleInput.focus();
            titleInput.select();
        }
    }, 60);
}

// --- XMind 分支折叠 / 展开 (Fold / Unfold Engine) ---
function isNodeVisible(node, nodeMap) {
    if (!node) return false;
    if (!nodeMap) nodeMap = new Map(nodes.map(n => [n.id, n]));
    let curr = node;
    while (curr && curr.parentId) {
        const parent = nodeMap.get(curr.parentId);
        if (!parent) break;
        if (parent.collapsed) return false;
        curr = parent;
    }
    return true;
}

function getDescendantCount(nodeId) {
    let count = 0;
    const queue = [nodeId];
    const childrenMap = new Map();
    nodes.forEach(n => {
        if (n.parentId) {
            if (!childrenMap.has(n.parentId)) childrenMap.set(n.parentId, []);
            childrenMap.get(n.parentId).push(n.id);
        }
    });
    while (queue.length > 0) {
        const currentId = queue.shift();
        const kids = childrenMap.get(currentId) || [];
        count += kids.length;
        queue.push(...kids);
    }
    return count;
}

function foldNodeBranch(targetNode) {
    if (!targetNode || typeof targetNode !== "object" || !targetNode.id) {
        targetNode = selectedNode;
    }
    if (!targetNode) return;

    const descCount = getDescendantCount(targetNode.id);
    if (descCount === 0) {
        // 如果自身是没有子节点的叶节点，则向上折叠其父节点的子树（XMind 经典快捷键行为）
        if (targetNode.parentId) {
            const parent = nodes.find(n => n.id === targetNode.parentId);
            if (parent) {
                selectedNode = parent;
                selectedNodeIds = new Set([parent.id]);
                foldNodeBranch(parent);
            }
        }
        return;
    }
    targetNode.collapsed = true;
    saveGraphToStorage();
    if (layoutMode === "tree") tidyLayout();
    else updateD3Graph();
    showToast(`📁 已折叠分支 [[${targetNode.label}]] (-${descCount} 节点)`);
}

function unfoldNodeBranch(targetNode) {
    if (!targetNode || typeof targetNode !== "object" || !targetNode.id) {
        targetNode = selectedNode;
    }
    if (!targetNode) return;

    targetNode.collapsed = false;
    saveGraphToStorage();
    if (layoutMode === "tree") tidyLayout();
    else updateD3Graph();
    showToast(`📂 已展开分支 [[${targetNode.label}]]`);
}

function toggleNodeFold(targetNode) {
    if (!targetNode || typeof targetNode !== "object" || !targetNode.id) {
        targetNode = selectedNode;
    }
    if (!targetNode) return;
    if (targetNode.collapsed) unfoldNodeBranch(targetNode);
    else foldNodeBranch(targetNode);
}

// --- ⭐ 划重点 / 核心关注节点 (Focus Node) ---
function toggleNodeFocus(targetNode) {
    if (!targetNode || typeof targetNode !== "object" || !targetNode.id) {
        targetNode = selectedNode;
    }
    
    // 如果是批量多选节点，批量划重点
    if (selectedNodeIds.size > 1) {
        const targetNodes = nodes.filter(n => selectedNodeIds.has(n.id));
        const anyUnfocused = targetNodes.some(n => !n.isFocus);
        targetNodes.forEach(n => n.isFocus = anyUnfocused);
        
        saveGraphToStorage();
        refreshNodeStyles();
        renderEditor();
        renderSidebarNotesList();
        showToast(anyUnfocused ? `⭐ 已批量将 ${selectedNodeIds.size} 个节点划为重点` : `✨ 已批量取消 ${selectedNodeIds.size} 个节点的重点`);
        return;
    }

    if (!targetNode) return;

    targetNode.isFocus = !targetNode.isFocus;
    saveGraphToStorage();
    refreshNodeStyles();
    renderEditor();
    renderSidebarNotesList();

    const focusBtn = document.getElementById("btn-toggle-focus");
    if (focusBtn) {
        focusBtn.classList.toggle("active", !!targetNode.isFocus);
    }

    if (targetNode.isFocus) {
        showToast(`⭐ 已将 [[${targetNode.label}]] 划为核心重点节点`);
    } else {
        showToast(`✨ 已取消 [[${targetNode.label}]] 的重点标记`);
    }
}

// 3. Delete / Backspace：删除选中节点及其子分支 (支持批量删除)
function deleteSelectedNode() {
    if (!selectedNode && selectedNodeIds.size === 0) return;
    
    const toDeleteIds = new Set();
    function collectSubtree(id) {
        toDeleteIds.add(id);
        nodes.filter(n => n.parentId === id).forEach(child => collectSubtree(child.id));
    }

    // 若有多个多选节点，收集每一个多选节点及其子树
    if (selectedNodeIds.size > 0) {
        selectedNodeIds.forEach(id => collectSubtree(id));
    } else if (selectedNode) {
        collectSubtree(selectedNode.id);
    }

    if (toDeleteIds.size === 0) return;

    nodes = nodes.filter(n => !toDeleteIds.has(n.id));
    links = links.filter(l => {
        const sId = typeof l.source === "object" ? l.source.id : l.source;
        const tId = typeof l.target === "object" ? l.target.id : l.target;
        return !toDeleteIds.has(sId) && !toDeleteIds.has(tId);
    });

    selectedNode = nodes[0] || null;
    selectedNodeIds = selectedNode ? new Set([selectedNode.id]) : new Set();

    saveGraphToStorage();
    if (layoutMode === "tree") tidyLayout();
    else updateD3Graph();
    renderEditor();
    showToast("🗑️ 已删除节点及其关联子分支");
}

// 4. F2 / Space：重命名节点
function renameSelectedNode(targetNode = selectedNode) {
    if (!targetNode) return;
    const newTitle = prompt("修改节点标题:", targetNode.label);
    if (newTitle && newTitle.trim()) {
        targetNode.label = newTitle.trim();
        saveGraphToStorage();
        updateD3Graph();
        renderEditor();
    }
}

// 5. 方向键 ↑↓←→：节点键盘高亮漫游
function navigateNodes(direction) {
    if (!selectedNode) return;
    const parentId = selectedNode.parentId;
    const siblings = nodes.filter(n => n.parentId === parentId);
    siblings.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const idx = siblings.findIndex(n => n.id === selectedNode.id);

    let nextNode = null;
    if (direction === "ArrowUp") {
        if (idx > 0) nextNode = siblings[idx - 1];
    } else if (direction === "ArrowDown") {
        if (idx >= 0 && idx < siblings.length - 1) nextNode = siblings[idx + 1];
    } else if (direction === "ArrowLeft") {
        if (parentId) nextNode = nodes.find(n => n.id === parentId);
    } else if (direction === "ArrowRight") {
        const children = nodes.filter(n => n.parentId === selectedNode.id);
        children.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        if (children.length > 0) nextNode = children[0];
    }

    if (nextNode) {
        selectedNode = nextNode;
        selectedNodeIds = new Set([nextNode.id]);
        refreshNodeStyles();
        renderEditor();
    }
}

// 6. Alt + ↑ / ↓：微调节点顺序
function moveSiblingOrder(delta) {
    if (!selectedNode) return;
    const parentId = selectedNode.parentId;
    const siblings = nodes.filter(n => n.parentId === parentId);
    siblings.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const index = siblings.findIndex(n => n.id === selectedNode.id);
    if (index === -1) return;
    const targetIndex = index + delta;

    if (targetIndex < 0 || targetIndex >= siblings.length) {
        showToast("已经到达同级节点边界");
        return;
    }

    const tempOrder = siblings[index].order ?? index;
    siblings[index].order = siblings[targetIndex].order ?? targetIndex;
    siblings[targetIndex].order = tempOrder;

    saveGraphToStorage();
    if (layoutMode === "tree") tidyLayout();
    else updateD3Graph();
    showToast(delta < 0 ? "⬆️ 已向上调整节点顺序" : "⬇️ 已向下调整节点顺序");
}

function toggleRelationLink() {
    if (selectedNodeIds.size < 2) {
        showToast("请先选择两个节点以连接虚线关联");
        return;
    }
    const [id1, id2] = Array.from(selectedNodeIds);
    const existingIndex = links.findIndex(l => {
        const sId = typeof l.source === "object" ? l.source.id : l.source;
        const tId = typeof l.target === "object" ? l.target.id : l.target;
        return (sId === id1 && tId === id2) || (sId === id2 && tId === id1);
    });

    if (existingIndex >= 0) {
        links.splice(existingIndex, 1);
        showToast("已移除虚线关联");
    } else {
        links.push({ source: id1, target: id2, type: "relation" });
        showToast("🔗 已添加虚线关联");
    }

    saveGraphToStorage();
    updateD3Graph();
}

function renderOutlineTree() {
    const treeEl = document.getElementById("outline-tree");
    if (!treeEl) return;
    treeEl.innerHTML = "";
    nodes.forEach(n => {
        const row = document.createElement("div");
        row.className = "outline-row";
        row.innerHTML = `<span>${n.parentId === null ? "🌳" : "📄"}</span><span>${escapeHTML(n.label)}</span>`;
        row.addEventListener("click", () => {
            focusOnNode(n);
        });
        treeEl.appendChild(row);
    });
}

// --- 事件绑定 ---
function initEvents() {
    // 导航标签切页
    document.querySelectorAll(".nav-tab").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".nav-tab").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));

            btn.classList.add("active");
            const tabName = btn.dataset.tab;
            document.getElementById(`pane-${tabName}`).classList.add("active");

            if (tabName === "graph") {
                setTimeout(initD3Mindmap, 100);
            } else if (tabName === "editor") {
                renderSidebarNotesList();
                renderEditor();
            }
        });
    });

    // 提示浮窗关闭 / 显示控制 (百分百硬隔离点击事件)
    const hintEl = document.getElementById("hint");
    const closeHintBtn = document.getElementById("btn-close-hint");
    const navHintBtn = document.getElementById("btn-hint");

    if (localStorage.getItem("flownotes_hint_hidden") === "true") {
        if (hintEl) hintEl.style.display = "none";
    }

    if (closeHintBtn && hintEl) {
        closeHintBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            hintEl.style.display = "none";
            localStorage.setItem("flownotes_hint_hidden", "true");
        });
    }

    if (navHintBtn && hintEl) {
        navHintBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (hintEl.style.display === "none") {
                hintEl.style.display = "block";
                localStorage.setItem("flownotes_hint_hidden", "false");
            } else {
                hintEl.style.display = "none";
                localStorage.setItem("flownotes_hint_hidden", "true");
            }
        });
    }

    // 撤销 / 重做按钮
    document.getElementById("btn-undo").addEventListener("click", undo);
    document.getElementById("btn-redo").addEventListener("click", redo);

    // ⭐ 划重点按钮
    const btnFocus = document.getElementById("btn-toggle-focus");
    if (btnFocus) {
        btnFocus.addEventListener("click", () => toggleNodeFocus(selectedNode));
    }

    // 🔳 框选模式按钮
    const btnMarquee = document.getElementById("btn-marquee");
    if (btnMarquee) {
        btnMarquee.addEventListener("click", () => toggleMarqueeMode());
    }

    // 编辑器侧边栏开关
    const toggleEdBtn = document.getElementById("btn-toggle-editor");
    if (toggleEdBtn) {
        toggleEdBtn.addEventListener("click", () => {
            const ed = document.getElementById("editor-panel");
            if (ed) ed.classList.toggle("collapsed");
        });
    }

    // 抽屉与 Modal 控制
    document.getElementById("btn-outline").addEventListener("click", () => {
        const panel = document.getElementById("outline-panel");
        panel.hidden = !panel.hidden;
    });
    document.getElementById("btn-outline-close").addEventListener("click", () => {
        document.getElementById("outline-panel").hidden = true;
    });

    document.getElementById("btn-articles").addEventListener("click", () => {
        const panel = document.getElementById("article-library-panel");
        panel.hidden = !panel.hidden;
    });
    document.getElementById("btn-articles-close").addEventListener("click", () => {
        document.getElementById("article-library-panel").hidden = true;
    });

    document.getElementById("btn-search").addEventListener("click", () => {
        const q = document.getElementById("quick-open");
        q.hidden = !q.hidden;
        if (!q.hidden) document.getElementById("quick-input").focus();
    });

    document.getElementById("btn-article-close").addEventListener("click", () => {
        document.getElementById("article-modal").hidden = true;
    });

    // 布局模式切换
    document.getElementById("btn-layout").addEventListener("click", tidyLayout);
    document.getElementById("btn-graph").addEventListener("click", switchToForceLayout);

    // 图谱视图控制按钮
    document.getElementById("btn-zoom-in").addEventListener("click", () => svg.transition().call(zoom.scaleBy, 1.25));
    document.getElementById("btn-zoom-out").addEventListener("click", () => svg.transition().call(zoom.scaleBy, 0.8));
    document.getElementById("btn-fit").addEventListener("click", () => svg.transition().call(zoom.transform, d3.zoomIdentity));
    document.getElementById("btn-relation").addEventListener("click", toggleRelationLink);

    // 编辑器绑定
    const titleInput = document.getElementById("title-input");
    const mdTextarea = document.getElementById("md-textarea");
    const richEditor = document.getElementById("rich-editor");

    titleInput.addEventListener("input", () => {
        if (!selectedNode) return;
        selectedNode.label = titleInput.value.trim() || "未命名";
        saveGraphToStorage();
        refreshNodeStyles(); // 只刷新文字标签，不重启仿真！
    });

    // XMind 风格：标题输入框中 Tab=子节点，Enter=姊妹节点
    titleInput.addEventListener("keydown", (e) => {
        if (e.key === "Tab") {
            e.preventDefault();
            createChildNode();
            // 自动聚焦新节点的标题输入框
            setTimeout(() => titleInput.select(), 50);
        } else if (e.key === "Enter") {
            e.preventDefault();
            createSiblingNode();
            setTimeout(() => titleInput.select(), 50);
        }
    });

    mdTextarea.addEventListener("input", () => {
        if (!selectedNode) return;
        selectedNode.content = mdTextarea.value;
        saveGraphToStorage();
    });

    richEditor.addEventListener("input", () => {
        if (!selectedNode) return;
        selectedNode.content = htmlToSafeMarkdown(richEditor.innerHTML);
        mdTextarea.value = selectedNode.content;
        saveGraphToStorage();
    });

    // 格式化按钮
    document.querySelectorAll(".format-btn[data-preview-mode]").forEach(btn => {
        btn.addEventListener("click", () => {
            const previewMode = btn.dataset.previewMode;
            document.getElementById("note-workspace").dataset.previewMode = previewMode;
        });
    });

    // 格式化按钮 mousedown 防止失焦 + click 应用格式
    document.querySelectorAll(".format-btn[data-format]").forEach(btn => {
        btn.addEventListener("mousedown", (e) => e.preventDefault());
        btn.addEventListener("click", () => {
            const format = btn.dataset.format;
            if (format) applyFormatting(format);
        });
    });

    // 颜色选择器也防止失焦
    const mdColorInput = document.getElementById("md-color");
    if (mdColorInput) {
        mdColorInput.addEventListener("mousedown", (e) => e.preventDefault());
    }

    // 导出 Obsidian
    document.getElementById("exportObsidianBtn").addEventListener("click", handleExportObsidian);
    document.getElementById("btn-export").addEventListener("click", handleExportObsidian);
    document.getElementById("closeModalBtn").addEventListener("click", () => document.getElementById("exportModal").style.display = "none");
    document.getElementById("confirmExportBtn").addEventListener("click", () => document.getElementById("exportModal").style.display = "none");

    // GitHub 同步弹窗
    const openGhModal = () => document.getElementById("ghSyncModal").style.display = "flex";
    document.getElementById("ghSyncBtn").addEventListener("click", openGhModal);
    document.getElementById("btn-password").addEventListener("click", openGhModal);
    document.getElementById("closeGhModalBtn").addEventListener("click", () => document.getElementById("ghSyncModal").style.display = "none");
    document.getElementById("saveGhSettingsBtn").addEventListener("click", saveGhSettings);
    document.getElementById("autoCreateGistBtn").addEventListener("click", autoCreateGhGist);
    document.getElementById("pushToGhBtn").addEventListener("click", () => pushToGhGist(false));
    document.getElementById("pullFromGhBtn").addEventListener("click", pullFromGhGist);

    // 图谱组织器抽屉绑定
    const toggleOrganizerPanel = () => {
        const panel = document.getElementById("organizer-panel");
        if (!panel) return;
        panel.hidden = !panel.hidden;
        if (!panel.hidden) renderOrganizerUI();
    };
    const btnOrg = document.getElementById("btn-organizer");
    const badgeOrg = document.getElementById("currentMapBadge");
    const closeOrg = document.getElementById("btn-organizer-close");
    const btnCreateMap = document.getElementById("btnCreateMap");

    if (btnOrg) btnOrg.addEventListener("click", toggleOrganizerPanel);
    if (badgeOrg) badgeOrg.addEventListener("click", toggleOrganizerPanel);
    if (closeOrg) closeOrg.addEventListener("click", () => document.getElementById("organizer-panel").hidden = true);
    if (btnCreateMap) btnCreateMap.addEventListener("click", handleCreateNewMap);

    // 主题
    document.getElementById("themeToggle").addEventListener("click", toggleTheme);

    // 全局快捷键处理 (XMind 连招全集)
    document.addEventListener("keydown", (e) => {
        const isEditing = document.activeElement.tagName === "TEXTAREA" || 
                          document.activeElement.tagName === "INPUT" || 
                          document.activeElement.isContentEditable;

        if (e.key === "Escape") {
            document.getElementById("quick-open").hidden = true;
            document.getElementById("article-modal").hidden = true;
            document.getElementById("outline-panel").hidden = true;
            document.getElementById("article-library-panel").hidden = true;
            document.getElementById("organizer-panel").hidden = true;
            document.getElementById("ghSyncModal").style.display = "none";
            document.getElementById("exportModal").style.display = "none";
            // 归还焦点到画布，恢复快捷键
            if (document.activeElement && document.activeElement !== document.body) {
                document.activeElement.blur();
            }
            return;
        }

        if (isEditing) return;

        // 1. Ctrl+Z / Cmd+Z 撤销
        if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z") && !e.shiftKey) {
            e.preventDefault();
            undo();
            return;
        }

        // 2. Ctrl+Y / Cmd+Shift+Z 重做
        if (((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) ||
            ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "z" || e.key === "Z"))) {
            e.preventDefault();
            redo();
            return;
        }

        // 3. Tab 键：新建分支子节点
        if (e.key === "Tab") {
            e.preventDefault();
            createChildNode();
            return;
        }

        // 4. Enter 键：新建同级节点
        if (e.key === "Enter") {
            e.preventDefault();
            createSiblingNode();
            return;
        }

        // 5. Delete / Backspace 键：删除节点及分支
        if (e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault();
            deleteSelectedNode();
            return;
        }

        // 6. F2 / Space 键：重命名节点
        if (e.key === "F2" || e.key === " ") {
            e.preventDefault();
            renameSelectedNode();
            return;
        }

        // 6.5. F 键 / Ctrl+Shift+F：划重点 / 设为核心关注节点
        if ((e.key === "f" || e.key === "F") || ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "f" || e.key === "F"))) {
            e.preventDefault();
            toggleNodeFocus(selectedNode);
            return;
        }

        // 6.8. B 键：切换矩形框选多选模式
        if ((e.key === "b" || e.key === "B") && !e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            toggleMarqueeMode();
            return;
        }

        // 7. XMind 分支折叠 / 展开连招: Ctrl + LeftArrow (折叠), Ctrl + RightArrow (展开), Ctrl + / (切换)
        if ((e.ctrlKey || e.metaKey) && (e.key === "/" || e.code === "Slash")) {
            e.preventDefault();
            toggleNodeFold(selectedNode);
            return;
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === "ArrowLeft" || e.code === "ArrowLeft" || e.key === "Left")) {
            e.preventDefault();
            foldNodeBranch(selectedNode);
            return;
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === "ArrowRight" || e.code === "ArrowRight" || e.key === "Right")) {
            e.preventDefault();
            unfoldNodeBranch(selectedNode);
            return;
        }

        // 8. 方向键：节点图谱漫游
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            navigateNodes(e.key);
            return;
        }

        // 8. Alt + ↑ / ↓：微调顺序
        if (e.altKey && e.key === "ArrowUp") {
            e.preventDefault();
            moveSiblingOrder(-1);
            return;
        }
        if (e.altKey && e.key === "ArrowDown") {
            e.preventDefault();
            moveSiblingOrder(1);
            return;
        }

        // 9. M 键：整理为 XMind 树
        if (e.key === "m" || e.key === "M") {
            e.preventDefault();
            tidyLayout();
            return;
        }

        // 10. G 键：网状图
        if (e.key === "g" || e.key === "G") {
            e.preventDefault();
            switchToForceLayout();
            return;
        }

        // 11. L 键：虚线关联
        if (e.key === "l" || e.key === "L") {
            e.preventDefault();
            toggleRelationLink();
            return;
        }
    });
}

function applyFormatting(format) {
    const mdTextarea = document.getElementById("md-textarea");
    const richEditor = document.getElementById("rich-editor");
    const previewMode = document.getElementById("note-workspace").dataset.previewMode;

    // 在 Markdown 源码模式下操作 textarea
    if (previewMode === "edit" && mdTextarea) {
        const start = mdTextarea.selectionStart;
        const end = mdTextarea.selectionEnd;
        const selected = mdTextarea.value.substring(start, end);
        let before = "", after = "";

        switch (format) {
            case "bold": before = "**"; after = "**"; break;
            case "italic": before = "*"; after = "*"; break;
            case "strike": before = "~~"; after = "~~"; break;
            case "underline": before = "<u>"; after = "</u>"; break;
            case "highlight": before = "=="; after = "=="; break;
            case "code": before = "`"; after = "`"; break;
            case "heading": before = "# "; after = ""; break;
            case "quote": before = "> "; after = ""; break;
            case "bullet": before = "- "; after = ""; break;
            case "task": before = "- [ ] "; after = ""; break;
            case "link": before = "["; after = "](url)"; break;
            case "color":
                const color = document.getElementById("md-color").value || "#ff6b6b";
                before = `<span style="color:${color}">`;
                after = "</span>";
                break;
            default: return;
        }

        const replacement = before + (selected || "文字") + after;
        mdTextarea.setRangeText(replacement, start, end, "select");
        mdTextarea.focus();

        if (selectedNode) {
            selectedNode.content = mdTextarea.value;
            saveGraphToStorage(false);
        }
        return;
    }

    // 在富文本 (live) 模式下操作 richEditor
    if (richEditor && (previewMode === "live")) {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;

        switch (format) {
            case "bold": document.execCommand("bold"); break;
            case "italic": document.execCommand("italic"); break;
            case "underline": document.execCommand("underline"); break;
            case "strike": document.execCommand("strikeThrough"); break;
            case "highlight":
                document.execCommand("hiliteColor", false, "#fef08a");
                break;
            case "color":
                const color = document.getElementById("md-color").value || "#ff6b6b";
                document.execCommand("foreColor", false, color);
                break;
            case "code":
                const range = sel.getRangeAt(0);
                const codeEl = document.createElement("code");
                codeEl.style.cssText = "background:rgba(99,102,241,0.15); padding:2px 4px; border-radius:3px; font-family:monospace;";
                range.surroundContents(codeEl);
                break;
            case "heading":
                document.execCommand("formatBlock", false, "h1");
                break;
            case "quote":
                document.execCommand("formatBlock", false, "blockquote");
                break;
            case "bullet":
                document.execCommand("insertUnorderedList");
                break;
            case "link":
                const url = prompt("请输入链接 URL:", "https://");
                if (url) document.execCommand("createLink", false, url);
                break;
            default: return;
        }

        // 同步 richEditor 内容到 mdTextarea 与 selectedNode
        if (selectedNode) {
            selectedNode.content = htmlToSafeMarkdown(richEditor.innerHTML);
            document.getElementById("md-textarea").value = selectedNode.content;
            saveGraphToStorage(false);
        }
    }
}

function renderAll() {
    renderFlowStream();
    renderSidebarNotesList();
    renderEditor();
}

function cleanHTMLSpill(text) {
    if (!text) return "";
    return text
        .replace(/<font color=["']?([^"'>]+)["']?>/gi, '<span style="color:$1">')
        .replace(/<\/font>/gi, '</span>')
        .replace(/<b>/gi, "**").replace(/<\/b>/gi, "**")
        .replace(/<strong>/gi, "**").replace(/<\/strong>/gi, "**")
        .replace(/<i>/gi, "*").replace(/<\/i>/gi, "*")
        .replace(/<em>/gi, "*").replace(/<\/em>/gi, "*");
}

function htmlToSafeMarkdown(html) {
    if (!html) return "";
    
    // 预处理块级换行，避免 div 包裹导致的换行丢失
    let preProcessed = html
        .replace(/<div><br><\/div>/gi, "\n")
        .replace(/<p><br><\/p>/gi, "\n")
        .replace(/<div>/gi, "\n<div>")
        .replace(/<p>/gi, "\n<p>")
        .replace(/<br\s*\/?>/gi, "\n");

    const div = document.createElement("div");
    div.innerHTML = preProcessed;
    
    function serializeNode(node) {
        if (node.nodeType === 3) {
            return node.textContent;
        }
        if (node.nodeType === 1) {
            const tag = node.tagName.toLowerCase();
            const inner = Array.from(node.childNodes).map(serializeNode).join("");
            
            let result = inner;
            
            if (tag === "strong" || tag === "b") result = `**${result}**`;
            if (tag === "em" || tag === "i") result = `*${result}*`;
            if (tag === "del" || tag === "s" || tag === "strike") result = `~~${result}~~`;
            if (tag === "u") result = `<u>${result}</u>`;
            if (tag === "code") result = `\`${result}\``;
            
            if (tag === "mark" || (node.style && node.style.backgroundColor)) {
                result = `==${result}==`;
            }
            
            let color = "";
            if (tag === "font" && node.color) {
                color = node.color;
            } else if (node.style && node.style.color) {
                color = node.style.color;
            }
            
            if (color) {
                result = `<span style="color:${color}">${result}</span>`;
            }
            
            return result;
        }
        return "";
    }

    let markdown = Array.from(div.childNodes).map(serializeNode).join("");
    markdown = markdown.replace(/&nbsp;/g, " ").replace(/\n{3,}/g, "\n\n").trimStart();
    return markdown;
}

function renderMarkdownToHTML(text) {
    if (!text) return "";
    let cleaned = cleanHTMLSpill(text);
    
    // 保护 <span style="color:..."> 和 <u> 标签不被 escapeHTML 破坏
    // 我们只替换标签本身，不替换内容，从而完美支持嵌套！
    let protectedText = cleaned
        .replace(/<span style=["']color:\s*([^"'>]+)["']?>/gi, '___SPAN_START_$1___')
        .replace(/<\/span>/gi, '___SPAN_END___')
        .replace(/<u>/gi, '___U_START___')
        .replace(/<\/u>/gi, '___U_END___');

    let html = escapeHTML(protectedText);

    // 还原 Markdown 语法 (支持跨行匹配)
    html = html
        .replace(/==([\s\S]*?)==/g, "<mark style='background:#fef08a; color:#854d0e; padding:0 4px; border-radius:2px;'>$1</mark>")
        .replace(/\*\*([\s\S]*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*([\s\S]*?)\*/g, "<em>$1</em>")
        .replace(/~~([\s\S]*?)~~/g, "<del>$1</del>")
        .replace(/`([\s\S]*?)`/g, "<code style='background:rgba(99,102,241,0.15); padding:2px 4px; border-radius:3px; font-family:monospace;'>$1</code>")
        .replace(/\n/g, "<br>");

    // 还原受保护的颜色 span 与 u 标签
    html = html
        .replace(/___SPAN_START_(.*?)___/g, '<span style="color:$1">')
        .replace(/___SPAN_END___/g, '</span>')
        .replace(/___U_START___/g, '<u>')
        .replace(/___U_END___/g, '</u>');

    return html;
}

function renderEditor() {
    const titleInput = document.getElementById("title-input");
    const mdTextarea = document.getElementById("md-textarea");
    const richEditor = document.getElementById("rich-editor");
    const previewPanel = document.getElementById("preview-panel");
    const focusBtn = document.getElementById("btn-toggle-focus");

    if (selectedNode) {
        // 自动净化清洗之前残留的 HTML 污染
        const cleanContent = cleanHTMLSpill(selectedNode.content || "");
        selectedNode.content = cleanContent;

        titleInput.value = selectedNode.label;
        titleInput.disabled = false;
        mdTextarea.value = cleanContent;
        richEditor.innerHTML = renderMarkdownToHTML(cleanContent);
        previewPanel.innerHTML = renderMarkdownToHTML(cleanContent);

        if (focusBtn) {
            focusBtn.disabled = false;
            focusBtn.classList.toggle("active", !!selectedNode.isFocus);
        }
    } else {
        titleInput.value = "未选择节点";
        titleInput.disabled = true;
        mdTextarea.value = "";
        richEditor.innerHTML = "";
        if (focusBtn) {
            focusBtn.disabled = true;
            focusBtn.classList.remove("active");
        }
    }
}

function renderFlowStream() {
    const listEl = document.getElementById("flowList");
    if (!listEl) return;
    listEl.innerHTML = "";
    flowStream.forEach(item => {
        const card = document.createElement("div");
        card.className = "flow-card";
        card.innerHTML = `<div class="flow-card-meta"><span>⚡ 思考流</span><span>${item.timestamp}</span></div><div class="flow-card-content">${escapeHTML(item.content)}</div>`;
        listEl.appendChild(card);
    });
}

function renderSidebarNotesList() {
    const container = document.getElementById("notesListItems");
    if (!container) return;
    container.innerHTML = "";
    nodes.forEach(note => {
        const item = document.createElement("div");
        item.className = `note-item ${selectedNode && selectedNode.id === note.id ? "active" : ""}`;
        item.innerHTML = `<div class="note-item-title">${escapeHTML(note.label)}</div>`;
        item.addEventListener("click", () => {
            focusOnNode(note);
            renderSidebarNotesList();
        });
        container.appendChild(item);
    });
}

// --- GitHub Gist 双向同步与卡片数实时追踪 ---
function initGhSyncUI() {
    let pat = localStorage.getItem("flownotes_gh_pat") || DEFAULT_PAT_TOKEN;
    let gistId = localStorage.getItem("flownotes_gh_gist_id") || DEFAULT_GIST_ID;

    localStorage.setItem("flownotes_gh_pat", pat);
    localStorage.setItem("flownotes_gh_gist_id", gistId);

    document.getElementById("ghPatInput").value = pat;
    document.getElementById("ghGistIdInput").value = gistId;

    updateGhStatusDisplay();
}

function updateSyncStatusUI(state, message, detailText = "") {
    const syncStatusEl = document.getElementById("sync-status");
    const syncBtn = document.getElementById("btn-sync");
    const pullBtn = document.getElementById("btn-pull");
    const ghSyncText = document.getElementById("ghSyncText");
    const ghSyncStatusBox = document.getElementById("ghSyncStatusBox");

    if (syncStatusEl) {
        syncStatusEl.dataset.state = state; // "busy", "ok", "error", "warn", "local"
        syncStatusEl.textContent = message;
        if (detailText) syncStatusEl.title = detailText;
    }

    if (state === "busy") {
        if (syncBtn) { syncBtn.disabled = true; syncBtn.innerHTML = "⏳ 同步中..."; }
        if (pullBtn) { pullBtn.disabled = true; }
        if (ghSyncText) ghSyncText.textContent = "⏳ 同步中...";
    } else {
        if (syncBtn) { syncBtn.disabled = false; syncBtn.innerHTML = "💾 同步"; }
        if (pullBtn) { pullBtn.disabled = false; }
        if (ghSyncText) ghSyncText.textContent = state === "ok" ? `🟢 GitHub (${nodes.length}卡片)` : "GitHub 同步";
    }

    if (ghSyncStatusBox) {
        const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        ghSyncStatusBox.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span>当前同步状态: <b>${message}</b></span>
                <small style="color:var(--text-muted);">${time}</small>
            </div>
            ${detailText ? `<div style="font-size:12px; color:var(--text-muted); margin-top:6px;">${detailText}</div>` : ""}
        `;
    }
}

function saveGhSettings() {
    const pat = document.getElementById("ghPatInput").value.trim();
    const gistId = document.getElementById("ghGistIdInput").value.trim();

    localStorage.setItem("flownotes_gh_pat", pat);
    localStorage.setItem("flownotes_gh_gist_id", gistId);

    updateGhStatusDisplay();
    showToast("⚙️ GitHub 同步配置已保存");
}

function updateGhStatusDisplay() {
    const pat = localStorage.getItem("flownotes_gh_pat");
    const gistId = localStorage.getItem("flownotes_gh_gist_id");
    const lastSyncTime = localStorage.getItem("flownotes_last_sync_time");
    const cloudCountRaw = localStorage.getItem("flownotes_cloud_node_count");
    
    const localCount = nodes.length;
    // 如果没有云端数量记录，且已同步过，默认等于本地数量
    const cloudCount = cloudCountRaw !== null ? parseInt(cloudCountRaw, 10) : localCount;

    const indicator = document.getElementById("ghStatusIndicator");
    const details = document.getElementById("ghStatusDetails");

    if (pat && gistId) {
        if (details) {
            details.innerHTML = `Gist ID: <a href="https://gist.github.com/yulicccccc/${gistId}" target="_blank" style="color:var(--accent-cyan)">${gistId}</a> | 云端备份: <b>${cloudCount}</b> 张卡片`;
        }

        if (lastSyncTime) {
            if (localCount === cloudCount) {
                const msg = `🟢 GitHub 已同步 (共 ${localCount} 卡片 | ${lastSyncTime})`;
                const tip = `数据 100% 已同步到 GitHub 云端 (包含 ${localCount} 个笔记卡片，时间: ${lastSyncTime})`;
                updateSyncStatusUI("ok", msg, tip);
                if (indicator) {
                    indicator.textContent = `🟢 已同步 (共 ${localCount} 卡片 | ${lastSyncTime})`;
                    indicator.style.color = "#10b981";
                }
            } else {
                const diff = localCount - cloudCount;
                const diffText = diff > 0 ? `+${diff}` : `${diff}`;
                const msg = `🟡 本地有改动未同步 (本地 ${localCount} / 云端 ${cloudCount} 卡片)`;
                const tip = `本地包含 ${localCount} 个卡片，云端包含 ${cloudCount} 个卡片 (变动: ${diffText})，点击“💾 同步”提交至 GitHub`;
                updateSyncStatusUI("warn", msg, tip);
                if (indicator) {
                    indicator.textContent = `🟡 待同步 (本地 ${localCount} / 云端 ${cloudCount} 卡片)`;
                    indicator.style.color = "#f59e0b";
                }
            }
        } else {
            updateSyncStatusUI("local", `🟢 本地已保存 (本地 ${localCount} 卡片 | Gist 已连通)`, "点击“💾 同步”提交初次备份到 GitHub");
            if (indicator) {
                indicator.textContent = `🟢 已连通 (本地 ${localCount} 卡片未初始推送)`;
                indicator.style.color = "#10b981";
            }
        }
    } else {
        updateSyncStatusUI("local", `⚪ 未配置 GitHub (本地 ${localCount} 卡片)`, "请配置 GitHub PAT 和 Gist ID 以启用云端同步");
    }
}

async function autoCreateGhGist() {
    const pat = document.getElementById("ghPatInput").value.trim();
    if (!pat) {
        showToast("请先填入 PAT Token");
        return;
    }

    try {
        updateSyncStatusUI("busy", "🔄 正在创建 Gist...", "正与 GitHub 通信创建新的私有 Gist 存储库");
        const res = await fetch("https://api.github.com/gists", {
            method: "POST",
            headers: { "Authorization": `Bearer ${pat}`, "Content-Type": "application/json" },
            body: JSON.stringify({ description: "FlowNotes Mindmap Backup", public: false, files: { "flownotes_backup.json": { content: JSON.stringify({ nodes, links, flowStream }, null, 2) } } })
        });
        const data = await res.json();
        document.getElementById("ghGistIdInput").value = data.id;
        localStorage.setItem("flownotes_gh_gist_id", data.id);

        const nowStr = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        localStorage.setItem("flownotes_last_sync_time", nowStr);
        localStorage.setItem("flownotes_cloud_node_count", nodes.length.toString());

        updateGhStatusDisplay();
        showToast("🚀 Gist 创建成功！");
    } catch (e) {
        updateSyncStatusUI("error", "🔴 创建 Gist 失败", e.message || "网络或 Token 无效");
        showToast("❌ 创建失败");
    }
}

let lastGhPatchTimestamp = 0;

async function pushToGhGist(silent = false) {
    const pat = localStorage.getItem("flownotes_gh_pat");
    const gistId = localStorage.getItem("flownotes_gh_gist_id");
    if (!pat || !gistId) {
        if (!silent) showToast("请先在同步设置中配置 GitHub PAT 和 Gist ID");
        return;
    }

    // 频率冷却保护：如果距离上一次发送 PATCH 不足 8 秒，且属于自动静默同步，则跳过本次防抖，进入下一次
    const nowMs = Date.now();
    if (silent && (nowMs - lastGhPatchTimestamp < 8000)) {
        triggerAutoGhSync();
        return;
    }

    const totalCardCount = mapsManifest.reduce((acc, m) => acc + (m.nodeCount || 0), 0);
    updateSyncStatusUI("busy", `🔄 正在同步 GitHub... (${mapsManifest.length}图谱 / ${totalCardCount}卡片)`, "正在进行防误删安全校验并推送多图谱全量数据");

    try {
        // 1. 安全防护检查
        const checkRes = await fetch(`https://api.github.com/gists/${gistId}`, {
            headers: { "Authorization": `Bearer ${pat}` }
        });
        if (checkRes.ok) {
            const checkData = await checkRes.json();
            if (checkData.files && checkData.files["flownotes_backup.json"]) {
                const cloudContent = checkData.files["flownotes_backup.json"].content;
                const cloudParsed = JSON.parse(cloudContent);

                // 正确计算云端全量卡片总数 vs 本地全量卡片总数
                const cloudTotalNodes = cloudParsed.mapsManifest ? cloudParsed.mapsManifest.reduce((acc, m) => acc + (m.nodeCount || 0), 0) : (cloudParsed.nodes || []).length;
                const localTotalNodes = mapsManifest.reduce((acc, m) => acc + (m.nodeCount || 0), 0);

                // 防误擦除校验：如果本地总卡片数少于云端的 50%，且云端总卡片数 > 3，则拦截覆盖！
                if (cloudTotalNodes > 3 && localTotalNodes < cloudTotalNodes * 0.5) {
                    const warnMsg = `⚠️ 拦截同步！本地(${localTotalNodes})远少于云端(${cloudTotalNodes})`;
                    updateSyncStatusUI("warn", warnMsg, `触发自动安全保护：本地全量节点数(${localTotalNodes})低于云端(${cloudTotalNodes})的 50%，已被自动拦截，防止误删云端数据。`);
                    if (!silent) showToast(`⚠️ 拦截同步！本地全量节点数(${localTotalNodes})远少于 GitHub 云端(${cloudTotalNodes})，防止误删覆盖。`);
                    return;
                }
            }
        }

        // 2. 打包包含所有多图谱项目与元数据的全量大包裹
        const allMapsData = {};
        mapsManifest.forEach(m => {
            const raw = localStorage.getItem(`flownotes_map_data_${m.id}`);
            if (raw) {
                try { allMapsData[m.id] = JSON.parse(raw); } catch (e) {}
            }
        });
        allMapsData[activeMapId] = {
            nodes: nodes,
            links: cleanLinks(),
            flowStream: flowStream
        };

        const localPayload = JSON.stringify({
            version: "FlowNotes-MultiMap-2.0",
            activeMapId: activeMapId,
            mapsManifest: mapsManifest,
            allMapsData: allMapsData,
            nodes: nodes,
            links: cleanLinks(),
            flowStream: flowStream
        }, null, 2);

        const patchRes = await fetch(`https://api.github.com/gists/${gistId}`, {
            method: "PATCH",
            headers: { "Authorization": `Bearer ${pat}`, "Content-Type": "application/json" },
            body: JSON.stringify({ files: { "flownotes_backup.json": { content: localPayload } } })
        });

        if (!patchRes.ok) {
            if (patchRes.status === 403) {
                throw new Error("HTTP 403 (GitHub 频率限制/防刷保护)");
            }
            throw new Error(`HTTP ${patchRes.status}`);
        }

        lastGhPatchTimestamp = Date.now();
        const nowStr = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        localStorage.setItem("flownotes_last_sync_time", nowStr);
        localStorage.setItem("flownotes_cloud_node_count", totalCardCount.toString());

        updateGhStatusDisplay();
        if (!silent) showToast(`✅ 共 ${mapsManifest.length} 个思维图谱库 (${totalCardCount} 卡片) 已安全同步至 GitHub！(${nowStr})`);

    } catch (e) {
        const nowStr = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        if (e.message && e.message.includes("403")) {
            updateSyncStatusUI("warn", `⏳ 暂缓同步 (${nowStr})`, "触发 GitHub 自动防刷保护 (HTTP 403)，本地修改已安全存储在浏览器中，10 秒后自动重试");
            if (!silent) showToast("⏳ GitHub 请求频繁 (HTTP 403)，已自动暂停，10 秒后重试");
        } else {
            updateSyncStatusUI("error", `🔴 同步失败 (${nowStr})`, `推送失败原因: ${e.message || "网络异常或 Token 失效"}`);
            if (!silent) showToast(`❌ GitHub 同步失败 (${e.message || "网络错误"})`);
        }
    }
}

async function pullFromGhGist() {
    const pat = localStorage.getItem("flownotes_gh_pat");
    const gistId = localStorage.getItem("flownotes_gh_gist_id");
    if (!pat || !gistId) {
        showToast("请先在同步设置中配置 GitHub PAT 和 Gist ID");
        return;
    }

    updateSyncStatusUI("busy", "🔄 正在从 GitHub 拉取多图谱...", "正在拉取全量云端 Gist 备份文件");

    try {
        const res = await fetch(`https://api.github.com/gists/${gistId}`, { headers: { "Authorization": `Bearer ${pat}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        const parsed = JSON.parse(data.files["flownotes_backup.json"].content);

        // 安全防护：如果拉取到的云端数据极其微小（如 0 个节点），阻止覆盖本地有效数据
        if (parsed.nodes && parsed.nodes.length === 0 && nodes.length > 0) {
            updateSyncStatusUI("warn", "⚠️ 拉取拦截: 云端数据为空", "云端数据为 0 个节点，阻止覆盖本地已有节点");
            showToast("⚠️ 拦截拉取！云端数据为空，阻止覆盖本地数据。");
            return;
        }

        // 多图谱还原逻辑
        if (parsed.mapsManifest && Array.isArray(parsed.mapsManifest)) {
            mapsManifest = parsed.mapsManifest;
            localStorage.setItem("flownotes_maps_manifest", JSON.stringify(mapsManifest));

            if (parsed.allMapsData) {
                Object.keys(parsed.allMapsData).forEach(mId => {
                    localStorage.setItem(`flownotes_map_data_${mId}`, JSON.stringify(parsed.allMapsData[mId]));
                });
            }

            const targetActiveId = parsed.activeMapId || (mapsManifest[0] ? mapsManifest[0].id : "map_default");
            loadMapData(targetActiveId);
        } else {
            // 向下兼容单图谱还原
            if (parsed.nodes) nodes = parsed.nodes;
            if (parsed.links) links = parsed.links;
            saveGraphToStorage(false);
        }

        if (layoutMode === "tree") tidyLayout();
        else updateD3Graph();
        renderAll();
        renderEditor();
        renderOrganizerUI();

        const nowStr = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        const totalCardCount = mapsManifest.reduce((acc, m) => acc + (m.nodeCount || 0), 0);
        localStorage.setItem("flownotes_last_sync_time", nowStr);
        localStorage.setItem("flownotes_cloud_node_count", totalCardCount.toString());

        updateGhStatusDisplay();
        showToast(`🎉 已成功从 GitHub 恢复 ${mapsManifest.length} 个思维图谱项目 (${totalCardCount} 卡片)！(${nowStr})`);

    } catch (e) {
        const nowStr = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        updateSyncStatusUI("error", `🔴 拉取失败 (${nowStr})`, `拉取失败原因: ${e.message || "网络或 JSON 解析异常"}`);
        showToast(`❌ 拉取失败 (${e.message || "网络错误"})`);
    }
}

function triggerAutoGhSync() {
    if (ghSyncTimer) clearTimeout(ghSyncTimer);
    ghSyncTimer = setTimeout(() => pushToGhGist(true), 8000);
}

function handleExportObsidian() {
    const exportBundle = { version: "FlowNotes-1.0", nodes: nodes.map(n => ({ id: n.id, label: n.label, content: n.content, tags: [] })) };
    const blob = new Blob([JSON.stringify(exportBundle, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "obsidian_graph_backup.json";
    a.click();
    document.getElementById("exportModal").style.display = "flex";
}

function updateCurrentMapBadge() {
    const badge = document.getElementById("currentMapBadge");
    if (!badge) return;
    const current = mapsManifest.find(m => m.id === activeMapId);
    if (current) {
        badge.textContent = `${current.icon || '🧠'} ${current.title}`;
    } else {
        badge.textContent = "🧠 思维导图";
    }
}

function renderOrganizerUI() {
    updateCurrentMapBadge();
    const container = document.getElementById("organizerMapList");
    if (!container) return;
    container.innerHTML = "";

    mapsManifest.forEach(map => {
        const isActive = map.id === activeMapId;
        const card = document.createElement("div");
        card.className = "map-card";
        card.dataset.active = isActive ? "true" : "false";

        card.innerHTML = `
            <div class="map-card-header">
                <div class="map-card-title">
                    <span>${map.icon || '🧠'}</span>
                    <span>${escapeHTML(map.title)}</span>
                    ${isActive ? '<span style="font-size:0.7rem; padding:1px 6px; background:var(--accent-indigo); color:#fff; border-radius:10px;">当前打开</span>' : ''}
                </div>
            </div>
            <div class="map-card-meta">
                <span>包含 <b>${map.nodeCount ?? 0}</b> 个卡片</span>
                <span>${map.updatedAt || ''}</span>
            </div>
            <div class="map-card-actions">
                ${!isActive ? `<button class="map-card-btn btn-switch" style="color:var(--accent-cyan); border-color:var(--accent-cyan);">切换</button>` : ''}
                <button class="map-card-btn btn-rename">重命名</button>
                <button class="map-card-btn btn-duplicate">复制</button>
                ${mapsManifest.length > 1 ? `<button class="map-card-btn btn-delete" style="color:#f87171;">删除</button>` : ''}
            </div>
        `;

        // 事件绑定
        card.addEventListener("click", (e) => {
            if (e.target.tagName === "BUTTON") return;
            if (!isActive) switchActiveMap(map.id);
        });

        const switchBtn = card.querySelector(".btn-switch");
        if (switchBtn) switchBtn.addEventListener("click", () => switchActiveMap(map.id));

        const renameBtn = card.querySelector(".btn-rename");
        if (renameBtn) renameBtn.addEventListener("click", (e) => { e.stopPropagation(); renameMap(map.id); });

        const dupBtn = card.querySelector(".btn-duplicate");
        if (dupBtn) dupBtn.addEventListener("click", (e) => { e.stopPropagation(); duplicateMap(map.id); });

        const delBtn = card.querySelector(".btn-delete");
        if (delBtn) delBtn.addEventListener("click", (e) => { e.stopPropagation(); deleteMap(map.id); });

        container.appendChild(card);
    });
}

function handleCreateNewMap() {
    const titleInput = document.getElementById("newMapTitleInput");
    const iconSelect = document.getElementById("newMapIconSelect");
    const title = (titleInput ? titleInput.value.trim() : "") || "新思维导图";
    const icon = iconSelect ? iconSelect.value : "🧠";

    createNewMap(title, icon);
    if (titleInput) titleInput.value = "";
}

function createNewMap(title, icon = "🧠") {
    const newMapId = `map_${Date.now()}`;
    const nowStr = new Date().toLocaleTimeString('zh-CN', { hour12: false });

    // 初始化新导图（包含单个核心根节点）
    const initialRoot = {
        id: `root_${Date.now()}`,
        label: title,
        parentId: null,
        content: `# ${title}\n\n欢迎开始构建 **${title}** 主题思维图谱！\n\n- 按 ` + '`Tab`' + ` 键增加子节点\n- 按 ` + '`Enter`' + ` 键增加同级节点`,
        order: 0,
        x: 450,
        y: 320
    };

    const newMapMeta = {
        id: newMapId,
        title: title,
        icon: icon,
        nodeCount: 1,
        updatedAt: nowStr
    };

    mapsManifest.push(newMapMeta);
    localStorage.setItem("flownotes_maps_manifest", JSON.stringify(mapsManifest));

    const newMapData = {
        nodes: [initialRoot],
        links: [],
        flowStream: []
    };
    localStorage.setItem(`flownotes_map_data_${newMapId}`, JSON.stringify(newMapData));

    switchActiveMap(newMapId);
    showToast(`✨ 成功创建新思维图谱 [[${title}]]`);
}

function switchActiveMap(mapId) {
    if (mapId === activeMapId) return;

    // 先保存当前激活图谱的数据
    const currentData = {
        nodes: nodes,
        links: cleanLinks(),
        flowStream: flowStream
    };
    localStorage.setItem(`flownotes_map_data_${activeMapId}`, JSON.stringify(currentData));

    // 加载新图谱
    loadMapData(mapId);

    // 刷新全套视图
    if (layoutMode === "tree") tidyLayout();
    else updateD3Graph();
    renderAll();
    renderEditor();
    renderOrganizerUI();
    showToast(`🔀 已切换至图谱 [[${mapsManifest.find(m => m.id === mapId)?.title || ''}]]`);
}

function renameMap(mapId) {
    const target = mapsManifest.find(m => m.id === mapId);
    if (!target) return;
    const newTitle = prompt("请输入新图谱名称:", target.title);
    if (newTitle && newTitle.trim()) {
        target.title = newTitle.trim();
        target.updatedAt = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        localStorage.setItem("flownotes_maps_manifest", JSON.stringify(mapsManifest));
        updateCurrentMapBadge();
        renderOrganizerUI();
        showToast("✏️ 图谱重命名成功");
    }
}

function duplicateMap(mapId) {
    const sourceMap = mapsManifest.find(m => m.id === mapId);
    if (!sourceMap) return;

    const raw = localStorage.getItem(`flownotes_map_data_${mapId}`);
    if (!raw) return;

    const newMapId = `map_${Date.now()}`;
    const nowStr = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const dupTitle = `${sourceMap.title} (副本)`;

    const dupMeta = {
        id: newMapId,
        title: dupTitle,
        icon: sourceMap.icon || "🧠",
        nodeCount: sourceMap.nodeCount || 0,
        updatedAt: nowStr
    };

    mapsManifest.push(dupMeta);
    localStorage.setItem("flownotes_maps_manifest", JSON.stringify(mapsManifest));
    localStorage.setItem(`flownotes_map_data_${newMapId}`, raw);

    switchActiveMap(newMapId);
    showToast(`📋 已创建副本 [[${dupTitle}]]`);
}

function deleteMap(mapId) {
    if (mapsManifest.length <= 1) {
        showToast("⚠️ 至少需要保留一张思维图谱，无法删除唯一图谱。");
        return;
    }

    const target = mapsManifest.find(m => m.id === mapId);
    if (!target) return;

    if (!confirm(`确定要彻底删除思维图谱 [[${target.title}]] 吗？此操作无法撤销。`)) return;

    mapsManifest = mapsManifest.filter(m => m.id !== mapId);
    localStorage.setItem("flownotes_maps_manifest", JSON.stringify(mapsManifest));
    localStorage.removeItem(`flownotes_map_data_${mapId}`);

    if (activeMapId === mapId) {
        switchActiveMap(mapsManifest[0].id);
    } else {
        renderOrganizerUI();
    }
    showToast("🗑️ 图谱已成功删除");
}

function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
}

function showOwlWisdom() {
    const msgEl = document.getElementById("owlMessage");
    if (msgEl) msgEl.textContent = OWL_WISDOMS[Math.floor(Math.random() * OWL_WISDOMS.length)];
}

function showToast(msg) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2800);
}

function escapeHTML(str) {
    return (str || "").replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
}
