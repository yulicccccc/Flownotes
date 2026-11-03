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
let layoutMode = "free"; // 默认使用自由空间白板模式 ("free"，允许笔记放到一坨自由摆放)，按 M 键可一键整理为 XMind 树状结构
let ghSyncTimer = null;
let saveDebounceTimer = null;
let pendingHistoryRecord = false;
let isImeComposing = false;
let isTouchMultiSelectMode = false;
let lastCanvasMouseCoords = { x: 450, y: 320 };
let allMapsMemoryCache = {};
let deferredPwaPrompt = null;
let lastCloudCheckMs = 0;

// 安全写入 localStorage（捕获 QuotaExceededError，防止贴大量截图超过 5MB 时崩溃或阻断云同步）
function safeLocalStorageSet(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (e) {
        console.warn("[FlowNotes] localStorage quota exceeded for key:", key, "— falling back to IndexedDB + Memory Cache.");
        return false;
    }
}

// --- v2.8.0 高容量 IndexedDB 异步持久化引擎 (支持几百 MB 截图与多图谱无损本地存储) ---
const FlowNotesIDB = {
    dbPromise: null,
    open() {
        if (this.dbPromise) return this.dbPromise;
        this.dbPromise = new Promise((resolve, reject) => {
            if (!window.indexedDB) return resolve(null);
            const req = indexedDB.open("FlowNotesDB_v1", 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains("kv")) {
                    db.createObjectStore("kv");
                }
            };
            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror = () => resolve(null);
        });
        return this.dbPromise;
    },
    async set(key, val) {
        const db = await this.open();
        if (!db) return;
        return new Promise((resolve) => {
            try {
                const tx = db.transaction("kv", "readwrite");
                tx.objectStore("kv").put(val, key);
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
            } catch (e) {
                resolve(false);
            }
        });
    },
    async get(key) {
        const db = await this.open();
        if (!db) return null;
        return new Promise((resolve) => {
            try {
                const tx = db.transaction("kv", "readonly");
                const req = tx.objectStore("kv").get(key);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => resolve(null);
            } catch (e) {
                resolve(null);
            }
        });
    }
};

// 辅助：获取节点的创建时间 (用于“默认先 make 的是父”规则)
function getNodeCreatedTime(node) {
    if (!node) return Number.MAX_SAFE_INTEGER;
    if (typeof node.createdAt === "number" && Number.isFinite(node.createdAt)) {
        return node.createdAt;
    }
    const idStr = String(node.id || "");
    const m = idStr.match(/_(\d{10,})$/);
    if (m) {
        return parseInt(m[1], 10);
    }
    const idx = nodes.findIndex(n => n.id === node.id);
    return idx >= 0 ? idx : Number.MAX_SAFE_INTEGER - 1;
}

// 防抖保存：彻底消除打字、划词标色、连续拖拽时的 JSON.stringify / localStorage 同步阻塞卡顿
function scheduleSaveGraph(recordHistory = true, delayMs = 360) {
    if (recordHistory) pendingHistoryRecord = true;
    if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(() => {
        const shouldRecord = pendingHistoryRecord;
        pendingHistoryRecord = false;
        saveDebounceTimer = null;
        saveGraphToStorage(shouldRecord);
    }, delayMs);
}

// 页面关闭/刷新/切后台时立即冲刷尚未落盘的防抖修改，确保 0 丢失
function flushPendingSave() {
    if (saveDebounceTimer) {
        clearTimeout(saveDebounceTimer);
        saveDebounceTimer = null;
        const shouldRecord = pendingHistoryRecord;
        pendingHistoryRecord = false;
        saveGraphToStorage(shouldRecord);
    }
}

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
    initSelectionQuickBubble();
    initClipboardPaste();
    renderAll();
    initGhSyncUI();
    initPwaAndLifecycleSync();
    showOwlWisdom();
    pushHistory();
});

// 注册 PWA Service Worker、卸载前防丢冲刷与多端窗口聚焦自动云同步检测
function initPwaAndLifecycleSync() {
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const installBtn = document.getElementById("btnInstallPwa");
    window.addEventListener("beforeinstallprompt", (e) => {
        e.preventDefault();
        deferredPwaPrompt = e;
        if (installBtn) installBtn.style.display = "inline-flex";
    });
    if (installBtn) {
        installBtn.addEventListener("click", async () => {
            if (deferredPwaPrompt) {
                deferredPwaPrompt.prompt();
                await deferredPwaPrompt.userChoice;
                deferredPwaPrompt = null;
                installBtn.style.display = "none";
            } else {
                showToast("💡 你可以在浏览器地址栏右侧点击“安装应用”图标，将 FlowNotes 固定到桌面和任务栏！");
            }
        });
    }

    window.addEventListener("beforeunload", flushPendingSave);
    window.addEventListener("pagehide", flushPendingSave);
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
            flushPendingSave();
        } else if (document.visibilityState === "visible") {
            autoCheckCloudGist(true);
        }
    });
    window.addEventListener("focus", () => autoCheckCloudGist(true));

    // 启动后 900ms 自动检测云端是否有其他设备（手机/平板/家里电脑）推送的更新版本
    setTimeout(() => autoCheckCloudGist(true), 900);
}

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
        safeLocalStorageSet("flownotes_maps_manifest", JSON.stringify(mapsManifest));
        safeLocalStorageSet("flownotes_active_map_id", activeMapId);

        const initData = {
            nodes: legacyNodes ? JSON.parse(legacyNodes) : DEFAULT_NODES,
            links: legacyLinks ? JSON.parse(legacyLinks) : DEFAULT_LINKS,
            flowStream: legacyFlows ? JSON.parse(legacyFlows) : DEFAULT_FLOW_STREAM
        };
        allMapsMemoryCache[activeMapId] = initData;
        safeLocalStorageSet(`flownotes_map_data_${activeMapId}`, JSON.stringify(initData));
    } else {
        mapsManifest.forEach(m => {
            const raw = localStorage.getItem(`flownotes_map_data_${m.id}`);
            if (raw) {
                try { allMapsMemoryCache[m.id] = JSON.parse(raw); } catch (e) {}
            }
        });
    }

    loadMapData(activeMapId);

    // 异步从高容量 IndexedDB 恢复（如果贴了大量图片超出 localStorage 5MB 上限，IndexedDB 依然保留 100% 完整数据）
    FlowNotesIDB.get("flownotes_full_bundle").then(bundle => {
        if (!bundle || !bundle.mapsManifest) return;
        const lsUpdatedMs = parseInt(localStorage.getItem("flownotes_local_updated_ms") || "0", 10);
        const idbUpdatedMs = bundle.updatedAtMs || 0;
        if (idbUpdatedMs >= lsUpdatedMs && bundle.allMapsData) {
            allMapsMemoryCache = { ...allMapsMemoryCache, ...bundle.allMapsData };
            if (idbUpdatedMs > lsUpdatedMs) {
                mapsManifest = bundle.mapsManifest;
                activeMapId = bundle.activeMapId || activeMapId;
                loadMapData(activeMapId);
                if (layoutMode === "tree") tidyLayout();
                else updateD3Graph();
                renderPositions();
                renderAll();
                renderOrganizerUI();
            }
        }
    });
}

function loadMapData(mapId) {
    activeMapId = mapId;
    safeLocalStorageSet("flownotes_active_map_id", activeMapId);

    let data = allMapsMemoryCache[mapId];
    if (!data) {
        const raw = localStorage.getItem(`flownotes_map_data_${mapId}`);
        if (raw) {
            try { data = JSON.parse(raw); } catch (e) { data = null; }
        }
    }

    if (data) {
        nodes = data.nodes || [];
        links = data.links || [];
        flowStream = data.flowStream || [];
        allMapsMemoryCache[mapId] = data;
        sanitizeGraph();
    } else {
        nodes = [...DEFAULT_NODES];
        links = [...DEFAULT_LINKS];
        flowStream = [...DEFAULT_FLOW_STREAM];
        sanitizeGraph();
    }

    selectedNode = nodes[0] || null;
    if (selectedNode) selectedNodeIds = new Set([selectedNode.id]);
    else selectedNodeIds = new Set();
}

function saveGraphToStorage(recordHistory = true) {
    if (recordHistory) pushHistory();

    const nowMs = Date.now();
    safeLocalStorageSet("flownotes_local_updated_ms", String(nowMs));

    // 1. 保存当前激活图谱的数据（内存缓存 + localStorage + IndexedDB 大容量双保险）
    const currentData = {
        nodes: nodes,
        links: cleanLinks(),
        flowStream: flowStream
    };
    allMapsMemoryCache[activeMapId] = currentData;
    safeLocalStorageSet(`flownotes_map_data_${activeMapId}`, JSON.stringify(currentData));

    // 兼顾向后兼容
    safeLocalStorageSet("obsidian_nodes", JSON.stringify(nodes));
    safeLocalStorageSet("obsidian_links", JSON.stringify(cleanLinks()));

    // 2. 更新当前图谱在 Manifest 中的元数据 (卡片数、修改时间)
    const targetMap = mapsManifest.find(m => m.id === activeMapId);
    if (targetMap) {
        targetMap.nodeCount = nodes.length;
        targetMap.updatedAt = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        safeLocalStorageSet("flownotes_maps_manifest", JSON.stringify(mapsManifest));
    }

    // 3. 异步写入高容量 IndexedDB（突破 5MB 限制，支持无限贴图）
    FlowNotesIDB.set("flownotes_full_bundle", {
        updatedAtMs: nowMs,
        activeMapId: activeMapId,
        mapsManifest: mapsManifest,
        allMapsData: allMapsMemoryCache
    });

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

// 辅助：清理与构建 100% 权威的 links 连线数组 (父子连线以 node.parentId 为唯一真理来源)
function cleanLinks() {
    const treeLinks = [];
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    // 1. 唯一真理来源：根据每个节点的 parentId 精确生成树状连线
    nodes.forEach(n => {
        if (n.parentId && nodeMap.has(n.parentId)) {
            treeLinks.push({
                source: cleanNodeId(n.parentId),
                target: cleanNodeId(n.id)
            });
        }
    });

    // 2. 包含保留用户自定义的 relation 关系虚线
    const relationLinks = (links || [])
        .filter(l => l && l.type === "relation")
        .map(l => ({
            source: cleanNodeId(l.source),
            target: cleanNodeId(l.target),
            type: "relation"
        }));

    return [...treeLinks, ...relationLinks];
}

// 辅助：启动时清理孤儿链接 + 去重
function sanitizeGraph() {
    const nodeIds = new Set(nodes.map(n => n.id));
    // 清理孤立的 parentId 并补齐 createdAt 时间戳
    nodes.forEach((n, idx) => {
        if (n.parentId && !nodeIds.has(n.parentId)) n.parentId = null;
        if (typeof n.createdAt !== "number") {
            const m = String(n.id || "").match(/_(\d{10,})$/);
            n.createdAt = m ? parseInt(m[1], 10) : (1700000000000 + idx * 1000);
        }
    });
    // 去重并更新全局 links
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

    // SVG 有向箭头 Markers 定义 (用于动态自适应拓扑连线)
    let defs = svg.select("defs");
    if (defs.empty()) {
        defs = svg.append("defs");
    }
    defs.selectAll(".flow-arrow-marker").remove();

    defs.append("marker")
        .attr("class", "flow-arrow-marker")
        .attr("id", "arrow-marker")
        .attr("viewBox", "0 0 10 10")
        .attr("refX", 7)
        .attr("refY", 5)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto-start-reverse")
        .append("path")
        .attr("d", "M 0 1.5 L 8 5 L 0 8.5 z")
        .attr("fill", "rgba(129, 140, 248, 0.95)");

    defs.append("marker")
        .attr("class", "flow-arrow-marker")
        .attr("id", "arrow-marker-relation")
        .attr("viewBox", "0 0 10 10")
        .attr("refX", 7)
        .attr("refY", 5)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto-start-reverse")
        .append("path")
        .attr("d", "M 0 1.5 L 8 5 L 0 8.5 z")
        .attr("fill", "rgba(56, 189, 248, 0.95)");

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

    // 实时追踪鼠标在画布内部的坐标，便于 Ctrl+V 直接在光标处落子生成卡片
    svg.on("mousemove.canvasCoords", (event) => {
        const c = d3.pointer(event, zoomContainer.node());
        if (c && Number.isFinite(c[0]) && Number.isFinite(c[1])) {
            lastCanvasMouseCoords = { x: c[0], y: c[1] };
        }
    });

    function spawnFreeCardAtCoords(coords) {
        const nowTs = Date.now();
        const newId = `root_${nowTs}`;

        const newNode = {
            id: newId,
            label: `新笔记 ${nodes.length + 1}`,
            parentId: null,
            content: `新笔记 ${nodes.length + 1}`,
            createdAt: nowTs,
            order: nodes.length,
            x: coords[0],
            y: coords[1],
            fx: coords[0],
            fy: coords[1]
        };

        nodes.push(newNode);
        selectedNode = newNode;
        selectedNodeIds = new Set([newId]);

        scheduleSaveGraph(true);
        if (layoutMode === "tree") tidyLayout();
        else updateD3Graph();
        renderPositions();
        renderEditor();
        showToast(`✨ 已在当前位置创建自由卡片 [[${newNode.label}]] (可直接输入或划词标色)`);

        setTimeout(() => {
            startInlineCardEditById(newId, true);
        }, 50);
    }

    // 双击画布空白处创建 100% 独立的自由空间卡片（指哪打哪，支持放到一坨）
    svg.on("dblclick", (event) => {
        if (event.target.closest && event.target.closest(".node-group")) return;
        if (event.target.tagName === "circle" || event.target.tagName === "text") return;
        const coords = d3.pointer(event, zoomContainer.node());
        spawnFreeCardAtCoords(coords);
    });

    // 触屏设备（iPad/手机/触屏本）零延迟快速双击空白处创建卡片支持
    let lastCanvasTapMs = 0;
    let lastCanvasTapPt = [0, 0];
    svg.on("touchend.fastDoubleTap", (event) => {
        if (event.changedTouches && event.changedTouches.length === 1) {
            if (event.target.closest && event.target.closest(".node-group")) return;
            const touch = event.changedTouches[0];
            const now = Date.now();
            const dist = Math.hypot(touch.clientX - lastCanvasTapPt[0], touch.clientY - lastCanvasTapPt[1]);
            if (now - lastCanvasTapMs < 320 && dist < 28) {
                event.preventDefault();
                const coords = d3.pointer(touch, zoomContainer.node());
                spawnFreeCardAtCoords(coords);
                lastCanvasTapMs = 0;
            } else {
                lastCanvasTapMs = now;
                lastCanvasTapPt = [touch.clientX, touch.clientY];
            }
        }
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

// 辅助：射线与矩形边界交点算法（确保 360° 任意方向有向箭头刚好停在卡片外框边缘，绝不被卡片遮挡）
function getRectEdgePoint(cx, cy, halfW, halfH, dx, dy) {
    if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001) return { x: cx, y: cy };
    const sx = Math.abs(dx) > 0.0001 ? halfW / Math.abs(dx) : Infinity;
    const sy = Math.abs(dy) > 0.0001 ? halfH / Math.abs(dy) : Infinity;
    const s = Math.min(sx, sy);
    return {
        x: cx + dx * s,
        y: cy + dy * s
    };
}

// 计算连接线两端坐标：精确从父卡片边缘出发，在子卡片外边缘收尾，保证有向箭头 100% 显式可见且随拖动自动伸缩
function getLinkCoords(d) {
    const sxCenter = Number.isFinite(d.source.x) ? d.source.x : 0;
    const syCenter = Number.isFinite(d.source.y) ? d.source.y : 0;
    const txCenter = Number.isFinite(d.target.x) ? d.target.x : 0;
    const tyCenter = Number.isFinite(d.target.y) ? d.target.y : 0;

    const dx = txCenter - sxCenter;
    const dy = tyCenter - syCenter;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) {
        return { sx: sxCenter, sy: syCenter, tx: txCenter, ty: tyCenter };
    }

    const sHalfW = ((d.source && d.source._cardW) ? d.source._cardW : 120) / 2 + 2;
    const sHalfH = ((d.source && d.source._cardH) ? d.source._cardH : 40) / 2 + 2;
    const tHalfW = ((d.target && d.target._cardW) ? d.target._cardW : 120) / 2 + 7;
    const tHalfH = ((d.target && d.target._cardH) ? d.target._cardH : 40) / 2 + 7;

    const startPt = getRectEdgePoint(sxCenter, syCenter, sHalfW, sHalfH, dx, dy);
    const endPt = getRectEdgePoint(txCenter, tyCenter, tHalfW, tHalfH, -dx, -dy);

    return { sx: startPt.x, sy: startPt.y, tx: endPt.x, ty: endPt.y };
}

function renderPositions() {
    if (!linkElements || !nodeElements) return;
    nodeElements
        .attr("transform", d => `translate(${d.x},${d.y})`);
    linkElements.each(function(d) {
        const c = getLinkCoords(d);
        d3.select(this)
            .attr("x1", c.sx)
            .attr("y1", c.sy)
            .attr("x2", c.tx)
            .attr("y2", c.ty);
    });
}

// 生成画布卡片内部直接显示的富文本 HTML（直接呈现 🔴红字、🟢绿字、🟡荧光高亮与 📸粘贴截图）
function getCardDisplayHTML(d) {
    if (!d) return "";
    if (d.isImage && d.imageUrl) {
        const caption = (d.label && !d.label.startsWith("📸 截图")) ? `<div class="canvas-card-caption">${renderMarkdownToHTML(d.label)}</div>` : "";
        return `<img class="canvas-card-img" src="${d.imageUrl}" alt="截图" draggable="false" />${caption}`;
    }

    let raw = (d.content || "").trim();
    const isDefaultPlaceholder = !raw || raw.includes("点击编辑 Markdown 内容...");
    if (isDefaultPlaceholder) {
        raw = d.label || "未命名";
    } else {
        // 如果第一行是 # Title，去掉多余的 # 符号以便在画布卡片上更自然地显示句子与颜色
        raw = raw.replace(/^#{1,4}\s+/gm, "");
    }
    return renderMarkdownToHTML(raw);
}

// 轻量级：刷新画布富文本卡片样式、自适应尺寸测量、折叠徽章与选中发光状态
function refreshNodeStyles() {
    if (!nodeElements) return;
    nodeElements.each(function(d) {
        const group = d3.select(this);
        const isSelected = selectedNodeIds.has(d.id);
        const isFocus = !!d.isFocus;
        const borderColor = getNodeColor(d);

        const fo = group.select(".node-card-fo");
        const cardDiv = fo.select(".canvas-note-card");
        const bodyDiv = fo.select(".canvas-note-card-body");

        if (!cardDiv.empty() && !bodyDiv.empty()) {
            const bodyNode = bodyDiv.node();
            const isCurrentlyEditing = bodyNode && bodyNode.getAttribute("contenteditable") === "true";

            if (!isCurrentlyEditing) {
                const targetHTML = (isFocus ? '<span class="card-focus-star">⭐ </span>' : '') + getCardDisplayHTML(d);
                if (bodyNode.innerHTML !== targetHTML) {
                    bodyNode.innerHTML = targetHTML;
                }
            }

            cardDiv
                .classed("is-root", d.parentId === null)
                .classed("is-selected", isSelected)
                .classed("is-focus", isFocus)
                .classed("is-image-card", !!(d.isImage && d.imageUrl))
                .style("--card-accent", borderColor);

            // 测量卡片实际宽高，缓存到 d._cardW / d._cardH 供矩形边缘箭头交点算法使用
            const cardEl = cardDiv.node();
            const measuredW = Math.max(76, Math.min(340, (cardEl ? cardEl.offsetWidth : 130) || 130));
            const measuredH = Math.max(34, Math.min(280, (cardEl ? cardEl.offsetHeight : 38) || 38));
            d._cardW = measuredW;
            d._cardH = measuredH;

            const foW = measuredW + 20;
            const foH = measuredH + 20;
            fo.attr("width", foW)
              .attr("height", foH)
              .attr("x", -foW / 2)
              .attr("y", -foH / 2);
        }

        const halfW = (d._cardW || 120) / 2;
        const halfH = (d._cardH || 38) / 2;

        // 动态刷新折叠/展开 Badge 标志（位于卡片右侧边缘偏上）
        const descCount = getDescendantCount(d.id);
        const badge = group.select(".node-fold-badge");
        if (descCount > 0) {
            badge.style("display", "block")
                .attr("transform", `translate(${halfW + 11}, ${-Math.min(halfH - 4, 10)})`);
            badge.select(".fold-circle")
                .attr("r", 9)
                .style("fill", d.collapsed ? "#ef4444" : "rgba(30, 41, 59, 0.9)")
                .style("stroke", borderColor)
                .style("stroke-width", "1.5px");
            badge.select(".fold-text")
                .text(d.collapsed ? `+${descCount}` : "−")
                .style("fill", "#fff")
                .style("font-size", "10px")
                .style("font-weight", "bold");
        } else {
            badge.style("display", "none");
        }

        // 右侧拖拽连线手柄（从当前卡片拖出箭头连接到任意目标卡片）
        const port = group.select(".node-connect-port");
        if (!port.empty()) {
            port.attr("transform", `translate(${halfW + 11}, ${descCount > 0 ? 11 : 0})`);
        }

        group.classed("multi-selected", isSelected);
        group.classed("is-focus-node", isFocus);
        group.classed("is-collapsed", !!d.collapsed);
    });

    // 卡片尺寸变化后同步刷新箭头端点位置
    if (linkElements) {
        linkElements.each(function(d) {
            const c = getLinkCoords(d);
            d3.select(this)
                .attr("x1", c.sx)
                .attr("y1", c.sy)
                .attr("x2", c.tx)
                .attr("y2", c.ty);
        });
    }
}

// 在画布卡片上直接原地编辑文字与划词标红/标绿/高亮（无需跳转弹窗）
function startInlineCardEditById(nodeId, selectAll = false) {
    if (!nodeElements) return;
    nodeElements.filter(d => d.id === nodeId).each(function(d) {
        startInlineCardEdit(d, this, selectAll);
    });
}

function startInlineCardEdit(d, groupEl, selectAll = false) {
    if (!d || !groupEl) return;
    if (d.isImage && d.imageUrl) {
        const ti = document.getElementById("title-input");
        if (ti && !ti.disabled) { ti.focus(); ti.select(); }
        return;
    }
    const group = d3.select(groupEl);
    const cardDiv = group.select(".canvas-note-card");
    const bodyDiv = group.select(".canvas-note-card-body");
    if (bodyDiv.empty()) return;

    const bodyEl = bodyDiv.node();
    if (bodyEl.getAttribute("contenteditable") === "true") return;

    selectedNode = d;
    selectedNodeIds = new Set([d.id]);
    renderEditor();

    // 载入纯净可编辑富文本
    let raw = (d.content || "").trim();
    if (!raw || raw.includes("点击编辑 Markdown 内容...")) {
        raw = d.label || "";
    } else {
        raw = raw.replace(/^#{1,4}\s+/gm, "");
    }
    bodyEl.innerHTML = renderMarkdownToHTML(raw);
    bodyEl.setAttribute("contenteditable", "true");
    cardDiv.classed("is-editing", true);
    bodyEl.focus();

    if (selectAll) {
        const range = document.createRange();
        range.selectNodeContents(bodyEl);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }

    const syncFromInlineCard = () => {
        const md = htmlToSafeMarkdown(bodyEl.innerHTML).trim();
        d.content = md || "未命名";
        const plainFirstLine = bodyEl.innerText.split("\n").map(s => s.trim()).find(Boolean) || "未命名";
        d.label = plainFirstLine.slice(0, 42);

        const titleInput = document.getElementById("title-input");
        const mdTextarea = document.getElementById("md-textarea");
        const richEditor = document.getElementById("rich-editor");
        if (selectedNode && selectedNode.id === d.id) {
            if (titleInput) titleInput.value = d.label;
            if (mdTextarea) mdTextarea.value = d.content;
            if (richEditor && document.activeElement !== richEditor) {
                richEditor.innerHTML = renderMarkdownToHTML(d.content);
            }
        }
        // 更新卡片自适应宽高与连线端点
        const cardEl = cardDiv.node();
        if (cardEl) {
            d._cardW = Math.max(76, Math.min(340, cardEl.offsetWidth || 130));
            d._cardH = Math.max(34, Math.min(280, cardEl.offsetHeight || 38));
            const foW = d._cardW + 20;
            const foH = d._cardH + 20;
            group.select(".node-card-fo")
                .attr("width", foW)
                .attr("height", foH)
                .attr("x", -foW / 2)
                .attr("y", -foH / 2);
            renderPositions();
        }
        scheduleSaveGraph(true);
    };

    const onInput = (e) => {
        if (e.isComposing || isImeComposing) return;
        syncFromInlineCard();
    };

    const onKeyDown = (e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
            e.preventDefault();
            bodyEl.blur();
            return;
        }
        if (e.key === "Tab") {
            e.preventDefault();
            bodyEl.blur();
            createChildNode();
            return;
        }
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing && !isImeComposing) {
            e.preventDefault();
            bodyEl.blur();
            return;
        }
        // 支持在画布卡片内直接使用 Ctrl+Shift+R/G/H/\ 快捷键标色
        if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
            if (e.key === "R" || e.code === "KeyR") {
                e.preventDefault();
                applyFormatting("color-red");
                syncFromInlineCard();
            } else if (e.key === "G" || e.code === "KeyG") {
                e.preventDefault();
                applyFormatting("color-green");
                syncFromInlineCard();
            } else if (e.key === "H" || e.code === "KeyH") {
                e.preventDefault();
                applyFormatting("highlight");
                syncFromInlineCard();
            } else if (e.key === "\\" || e.code === "Backslash") {
                e.preventDefault();
                applyFormatting("clear");
                syncFromInlineCard();
            }
        }
    };

    const onBlur = () => {
        bodyEl.removeEventListener("input", onInput);
        bodyEl.removeEventListener("keydown", onKeyDown);
        bodyEl.removeEventListener("blur", onBlur);
        bodyEl.setAttribute("contenteditable", "false");
        cardDiv.classed("is-editing", false);
        syncFromInlineCard();
        refreshNodeStyles();
    };

    bodyEl.addEventListener("input", onInput);
    bodyEl.addEventListener("keydown", onKeyDown);
    bodyEl.addEventListener("blur", onBlur);
}

// 拖拽手柄拉线连接两个节点（支持直接从任意卡片拖出箭头连向目标卡片）
let tempConnectLine = null;
let connectSourceNode = null;

function startPortConnectDrag(event, d) {
    event.sourceEvent.stopPropagation();
    connectSourceNode = d;
    const coords = d3.pointer(event.sourceEvent, zoomContainer.node());
    if (!tempConnectLine) {
        tempConnectLine = zoomContainer.append("line")
            .attr("class", "temp-connect-line")
            .attr("marker-end", "url(#arrow-marker)");
    }
    tempConnectLine
        .attr("x1", d.x)
        .attr("y1", d.y)
        .attr("x2", coords[0])
        .attr("y2", coords[1])
        .style("display", "block");
}

function dragPortConnect(event, d) {
    if (!connectSourceNode || !tempConnectLine) return;
    const coords = d3.pointer(event.sourceEvent, zoomContainer.node());
    tempConnectLine
        .attr("x1", connectSourceNode.x)
        .attr("y1", connectSourceNode.y)
        .attr("x2", coords[0])
        .attr("y2", coords[1]);
}

function endPortConnectDrag(event, d) {
    if (tempConnectLine) tempConnectLine.style("display", "none");
    if (!connectSourceNode) return;

    const coords = d3.pointer(event.sourceEvent, zoomContainer.node());
    const targetNode = nodes.find(n => {
        if (n.id === connectSourceNode.id) return false;
        const hw = (n._cardW || 120) / 2 + 16;
        const hh = (n._cardH || 40) / 2 + 16;
        return Math.abs(coords[0] - n.x) <= hw && Math.abs(coords[1] - n.y) <= hh;
    });

    if (targetNode) {
        connectNodesWithParentRule(connectSourceNode, targetNode, true);
    }
    connectSourceNode = null;
}

// 连接两个节点并支持折叠展开（explicitDirection=false 时严格遵循“默认先 make 的是父”）
function connectNodesWithParentRule(nodeA, nodeB, explicitDirection = false) {
    if (!nodeA || !nodeB || nodeA.id === nodeB.id) return;

    let parentNode = nodeA;
    let childNode = nodeB;

    if (!explicitDirection) {
        const timeA = getNodeCreatedTime(nodeA);
        const timeB = getNodeCreatedTime(nodeB);
        if (timeA <= timeB) {
            parentNode = nodeA;
            childNode = nodeB;
        } else {
            parentNode = nodeB;
            childNode = nodeA;
        }
    }

    // 如果已经存在父子连线，再次触发则断开父子连线
    if (childNode.parentId === parentNode.id) {
        childNode.parentId = null;
        sanitizeGraph();
        updateD3Graph();
        renderPositions();
        scheduleSaveGraph(true);
        showToast(`🔓 已断开【${parentNode.label}】➔【${childNode.label}】的箭头连线`);
        return;
    }

    // 防止环路：如果 parentNode 原本是 childNode 的子孙，先解除 parentNode 的旧父级
    if (isNodeDescendantOf(parentNode.id, childNode.id)) {
        parentNode.parentId = null;
    }

    childNode.parentId = parentNode.id;
    parentNode.collapsed = false;
    sanitizeGraph();
    updateD3Graph();
    renderPositions();
    scheduleSaveGraph(true);
    showToast(`🔗 已连接箭头：【${parentNode.label}】(父) ➔ 【${childNode.label}】(子，可折叠收起)`);
}

function updateD3Graph() {
    if (!zoomContainer) return;

    // 过滤得到所有可显示的节点与连线（只渲染祖先未被折叠的节点）
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const visibleNodes = nodes.filter(n => isNodeVisible(n, nodeMap));
    const visibleNodeIdSet = new Set(visibleNodes.map(n => n.id));

    const rawVisibleLinks = cleanLinks().filter(l => visibleNodeIdSet.has(l.source) && visibleNodeIdSet.has(l.target));
    const visibleLinks = rawVisibleLinks.map(l => ({
        ...l,
        source: nodeMap.get(l.source) || l.source,
        target: nodeMap.get(l.target) || l.target
    }));

    linkElements = linkElements.data(visibleLinks, linkDataKey).join("line")
        .attr("class", d => d.type === "relation" ? "link relation-link" : "link")
        .attr("marker-end", d => d.type === "relation" ? "url(#arrow-marker-relation)" : "url(#arrow-marker)")
        .style("stroke", d => getLinkColor(d))
        .style("opacity", d => d.type === "relation" ? 0.75 : 0.88);

    nodeElements = nodeElements.data(visibleNodes, d => d.id).join(
        enter => {
            const g = enter.append("g").attr("class", "node-group")
                .call(d3.drag()
                    .filter(event => {
                        if (event.target.closest && (event.target.closest('[contenteditable="true"]') || event.target.closest('.node-connect-port') || event.target.closest('.node-fold-badge'))) {
                            return false;
                        }
                        return !event.button;
                    })
                    .on("start", dragstarted)
                    .on("drag", dragged)
                    .on("end", dragended))
                .on("click", (event, d) => {
                    event.stopPropagation();
                    if (event.target.closest && event.target.closest('[contenteditable="true"]')) return;

                    // 触屏快速双击卡片检测（320ms 内连续轻点两次直接进入画布原地富文本编辑）
                    const nowTap = Date.now();
                    if (d._lastTapMs && (nowTap - d._lastTapMs < 320) && !event.shiftKey && !isTouchMultiSelectMode) {
                        d._lastTapMs = 0;
                        startInlineCardEdit(d, event.currentTarget, false);
                        return;
                    }
                    d._lastTapMs = nowTap;

                    // 支持 Shift+Click、Ctrl/Cmd+Click 或开启“☑️多选”按钮模式点选多个节点（方便按 L 键或点 ➔ 用“先 make 的是父”规则连箭头）
                    if (event.shiftKey || event.ctrlKey || event.metaKey || isTouchMultiSelectMode) {
                        if (selectedNodeIds.has(d.id)) {
                            selectedNodeIds.delete(d.id);
                        } else {
                            selectedNodeIds.add(d.id);
                        }
                        selectedNode = d;
                        refreshNodeStyles();
                        renderEditor();
                        if (selectedNodeIds.size >= 2) {
                            showToast(`已选中 ${selectedNodeIds.size} 个卡片，点左侧 ➔（或按 L 键）即可按“先 make 的是父”连上可折叠箭头！`);
                        }
                        return;
                    }

                    selectedNode = d;
                    selectedNodeIds = new Set([d.id]);
                    refreshNodeStyles();
                    renderEditor();
                })
                .on("dblclick", (event, d) => {
                    event.stopPropagation();
                    startInlineCardEdit(d, event.currentTarget, false);
                });

            // 画布富文本与图片直接渲染卡片容器 (<foreignObject>)
            const fo = g.append("foreignObject")
                .attr("class", "node-card-fo")
                .attr("width", 160)
                .attr("height", 54)
                .attr("x", -80)
                .attr("y", -27);

            const cardDiv = fo.append("xhtml:div")
                .attr("class", "canvas-note-card");

            cardDiv.append("xhtml:div")
                .attr("class", "canvas-note-card-body");

            // 节点折叠 / 展开徽章点按 Badge
            const badge = g.append("g").attr("class", "node-fold-badge")
                .style("cursor", "pointer")
                .on("click", (event, d) => {
                    event.stopPropagation();
                    toggleNodeFold(d);
                });
            badge.append("circle").attr("class", "fold-circle");
            badge.append("text").attr("class", "fold-text").attr("text-anchor", "middle").attr("dy", "3.5px");

            // 右侧拖拽拉出箭头手柄 (.node-connect-port)
            const port = g.append("g").attr("class", "node-connect-port")
                .attr("title", "拖拽拉出箭头连接到其他卡片")
                .call(d3.drag()
                    .on("start", startPortConnectDrag)
                    .on("drag", dragPortConnect)
                    .on("end", endPortConnectDrag));
            port.append("circle")
                .attr("r", 7)
                .attr("class", "port-circle");
            port.append("text")
                .attr("text-anchor", "middle")
                .attr("dy", "3.5px")
                .attr("class", "port-arrow")
                .text("➔");

            return g;
        },
        update => update
    );

    // 每次渲染都更新 ALL 节点属性（包含富文本卡片尺寸测量、折叠徽章与重点发光样式）
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
let dropCandidateTargetNode = null;

function isNodeDescendantOf(nodeId, ancestorId) {
    if (!nodeId || !ancestorId || nodeId === ancestorId) return true;
    const nodeById = new Map(nodes.map(n => [n.id, n]));
    let curr = nodeById.get(nodeId);
    while (curr && curr.parentId) {
        if (curr.parentId === ancestorId) return true;
        curr = nodeById.get(curr.parentId);
    }
    return false;
}

function clearDropCandidateHighlight() {
    d3.selectAll(".node-group").classed("drop-target-highlight", false);
    dropCandidateTargetNode = null;
}

function dragstarted(event, d) {
    if (layoutMode === "force") {
        if (!event.active) simulation.alphaTarget(0.3).restart();
    }

    dragStartPositions.clear();
    clearDropCandidateHighlight();

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
        clearDropCandidateHighlight();
    } else {
        d.fx = event.x;
        d.fy = event.y;
        d.x = event.x;
        d.y = event.y;

        // 仅当按住 Alt 键拖拽靠近目标节点时才触发吸附挂载父节点，确保平时把笔记“放到一坨”紧挨摆放时绝不误触自动连线
        let nearestNode = null;
        const allowReparentDrop = !!(event.sourceEvent && event.sourceEvent.altKey);
        let minDist = 48;

        if (allowReparentDrop) {
            nodes.forEach(n => {
                if (n.id === d.id) return;
                if (isNodeDescendantOf(n.id, d.id)) return;

                const dist = Math.hypot(d.x - n.x, d.y - n.y);
                if (dist < minDist) {
                    minDist = dist;
                    nearestNode = n;
                }
            });
        }

        if (nearestNode !== dropCandidateTargetNode) {
            clearDropCandidateHighlight();
            if (nearestNode) {
                dropCandidateTargetNode = nearestNode;
                d3.selectAll(".node-group")
                  .filter(n => n.id === nearestNode.id)
                  .classed("drop-target-highlight", true);
            }
        }
    }

    renderPositions();
}

function setNodeParent(nodeId, newParentId) {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    // 1. 更新节点的 parentId 唯一真理来源
    node.parentId = newParentId;

    // 2. 重排全局 links
    sanitizeGraph();
}

function dragended(event, d) {
    if (layoutMode === "force") {
        if (!event.active) simulation.alphaTarget(0);
    }

    // 如果触发了 Drag-to-Reparent (拖拽靠近重新指定父节点)
    if (dropCandidateTargetNode && dragStartPositions.size <= 1) {
        const oldParentId = d.parentId;
        const newParentId = dropCandidateTargetNode.id;

        if (oldParentId !== newParentId) {
            setNodeParent(d.id, newParentId);
            showToast(`已将节点 "${d.label}" 挂载为 "${dropCandidateTargetNode.label}" 的子节点`);
            
            // 解除固定定位，让新分支重新优雅排布
            delete d.fx;
            delete d.fy;

            sanitizeGraph();
            updateD3Graph();

            if (layoutMode === "tree") {
                tidyLayout();
            } else {
                updateD3Graph();
            }
        }
    } else {
        if (layoutMode === "force") {
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
    }

    if (layoutMode === "tree" && !dropCandidateTargetNode) {
        layoutMode = "free";
        const btnLayout = document.getElementById("btn-layout");
        if (btnLayout) btnLayout.dataset.active = "false";
    }
    clearDropCandidateHighlight();
    dragStartPositions.clear();
    scheduleSaveGraph(true);
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
            .attr("x1", d => getLinkCoords(d).sx)
            .attr("y1", d => getLinkCoords(d).sy)
            .attr("x2", d => getLinkCoords(d).tx)
            .attr("y2", d => getLinkCoords(d).ty);
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

// 1. Tab 键：建子节点（自带动态跟随箭头，且父节点默认可收起展开）
function createChildNode() {
    if (!selectedNode) selectedNode = nodes[0];
    if (!selectedNode) return;
    selectedNode.collapsed = false;

    const nowTs = Date.now();
    const newId = `node_${nowTs}`;
    const existingChildren = nodes.filter(n => n.parentId === selectedNode.id);
    const parentW = selectedNode._cardW || 140;
    const targetX = (Number.isFinite(selectedNode.x) ? selectedNode.x : 450) + Math.max(220, parentW + 100);
    const targetY = (Number.isFinite(selectedNode.y) ? selectedNode.y : 320) + (existingChildren.length * 68);

    const newNode = {
        id: newId,
        label: `新分支 ${nodes.length + 1}`,
        parentId: selectedNode.id,
        content: `新分支 ${nodes.length + 1}`,
        createdAt: nowTs,
        x: targetX,
        y: targetY,
        fx: targetX,
        fy: targetY,
        order: nodes.length
    };

    nodes.push(newNode);
    links.push({ source: selectedNode.id, target: newId });
    selectedNode = newNode;
    selectedNodeIds = new Set([newId]);

    scheduleSaveGraph(true);
    if (layoutMode === "tree") tidyLayout();
    else updateD3Graph();
    renderPositions();
    renderEditor();
    showToast(`✨ 已衍生子卡片 [[${newNode.label}]] (箭头自动跟随，父节点可折叠)`);

    setTimeout(() => {
        startInlineCardEditById(newId, true);
    }, 50);
}

// 2. Enter 键：新建同级姊妹节点
function createSiblingNode() {
    if (!selectedNode) {
        createChildNode();
        return;
    }
    const parentId = selectedNode.parentId;
    const nowTs = Date.now();
    const newId = `node_${nowTs}`;

    const siblings = nodes.filter(n => n.parentId === parentId);
    siblings.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const maxOrder = siblings.length > 0 ? Math.max(...siblings.map(s => s.order ?? 0)) + 1 : 0;

    const targetX = Number.isFinite(selectedNode.x) ? selectedNode.x : 450;
    const targetY = (Number.isFinite(selectedNode.y) ? selectedNode.y : 320) + Math.max(68, (selectedNode._cardH || 40) + 32);

    const newNode = {
        id: newId,
        label: `同级卡片 ${nodes.length + 1}`,
        parentId: parentId,
        content: `同级卡片 ${nodes.length + 1}`,
        createdAt: nowTs,
        x: targetX,
        y: targetY,
        fx: targetX,
        fy: targetY,
        order: maxOrder
    };

    nodes.push(newNode);
    if (parentId) {
        links.push({ source: parentId, target: newId });
    }

    selectedNode = newNode;
    selectedNodeIds = new Set([newId]);

    scheduleSaveGraph(true);
    if (layoutMode === "tree") tidyLayout();
    else updateD3Graph();
    renderPositions();
    renderEditor();
    showToast(`✨ 已新增姊妹卡片 [[${newNode.label}]]`);

    setTimeout(() => {
        startInlineCardEditById(newId, true);
    }, 50);
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

// 4. F2 / 双击：直接在画布卡片上原地富文本编辑（取代简陋的弹窗 prompt）
function renameSelectedNode(targetNode = selectedNode) {
    if (!targetNode) return;
    startInlineCardEditById(targetNode.id, true);
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
        showToast("💡 请先按住 Shift 点击（或框选）2 个以上卡片，再按 L 键即可按“先 make 的是父”连上可折叠箭头！");
        return;
    }
    const selectedList = nodes.filter(n => selectedNodeIds.has(n.id));
    if (selectedList.length < 2) return;

    // 严格按照创建时间排序：先 make (创建) 的节点默认作为父节点 (Parent ➔ Child)
    selectedList.sort((a, b) => getNodeCreatedTime(a) - getNodeCreatedTime(b));
    const parentNode = selectedList[0];
    const childNodes = selectedList.slice(1);

    // 若只有两个节点，直接调用带切换开关的父子箭头连接
    if (childNodes.length === 1) {
        connectNodesWithParentRule(parentNode, childNodes[0], false);
        return;
    }

    // 若多选了 3 个及以上节点，最先创建的作为父节点，其余全部挂载为其子节点
    let connectedCount = 0;
    childNodes.forEach(child => {
        if (!isNodeDescendantOf(parentNode.id, child.id)) {
            child.parentId = parentNode.id;
            connectedCount++;
        }
    });
    parentNode.collapsed = false;
    sanitizeGraph();
    updateD3Graph();
    renderPositions();
    scheduleSaveGraph(true);
    showToast(`🔗 已将最先创建的【${parentNode.label}】设为父节点，连向 ${connectedCount} 个子卡片（支持折叠展开）！`);
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

    // 图谱视图控制按钮 + 触屏/鼠标单手快捷建卡与多选按钮
    document.getElementById("btn-zoom-in").addEventListener("click", () => svg.transition().call(zoom.scaleBy, 1.25));
    document.getElementById("btn-zoom-out").addEventListener("click", () => svg.transition().call(zoom.scaleBy, 0.8));
    document.getElementById("btn-fit").addEventListener("click", () => svg.transition().call(zoom.transform, d3.zoomIdentity));
    document.getElementById("btn-relation").addEventListener("click", toggleRelationLink);

    const btnAddChild = document.getElementById("btn-add-child");
    if (btnAddChild) btnAddChild.addEventListener("click", () => createChildNode());

    const btnAddSibling = document.getElementById("btn-add-sibling");
    if (btnAddSibling) btnAddSibling.addEventListener("click", () => createSiblingNode());

    const btnMultiSelect = document.getElementById("btn-multi-select");
    if (btnMultiSelect) {
        btnMultiSelect.addEventListener("click", () => {
            isTouchMultiSelectMode = !isTouchMultiSelectMode;
            btnMultiSelect.classList.toggle("active", isTouchMultiSelectMode);
            showToast(isTouchMultiSelectMode
                ? "☑️ 已开启点选多选模式：直接依次点击两张卡片，再点 ➔ 即可按“先 make 的是父”连上箭头！"
                : "👆 已恢复单选模式");
        });
    }

    // 编辑器绑定
    const titleInput = document.getElementById("title-input");
    const mdTextarea = document.getElementById("md-textarea");
    const richEditor = document.getElementById("rich-editor");

    // 全局中文输入法 (IME) 组合状态守卫，彻底解决中文拼音打字与手写输入卡顿
    document.addEventListener("compositionstart", () => { isImeComposing = true; });
    document.addEventListener("compositionend", () => {
        isImeComposing = false;
        if (document.activeElement === richEditor && selectedNode) {
            selectedNode.content = htmlToSafeMarkdown(richEditor.innerHTML);
            mdTextarea.value = selectedNode.content;
            refreshNodeStyles();
            scheduleSaveGraph(true);
        }
    });

    titleInput.addEventListener("input", (e) => {
        if (!selectedNode) return;
        selectedNode.label = titleInput.value.trim() || "未命名";
        refreshNodeStyles();
        if (!e.isComposing && !isImeComposing) {
            scheduleSaveGraph(true);
        }
    });

    // XMind 风格：标题输入框中 Tab=子节点，Enter=姊妹节点
    titleInput.addEventListener("keydown", (e) => {
        if (e.isComposing || isImeComposing) return;
        if (e.key === "Tab") {
            e.preventDefault();
            createChildNode();
        } else if (e.key === "Enter") {
            e.preventDefault();
            createSiblingNode();
        }
    });

    mdTextarea.addEventListener("input", (e) => {
        if (!selectedNode) return;
        selectedNode.content = mdTextarea.value;
        refreshNodeStyles();
        if (!e.isComposing && !isImeComposing) {
            scheduleSaveGraph(true);
        }
    });

    richEditor.addEventListener("input", (e) => {
        if (!selectedNode || e.isComposing || isImeComposing) return;
        selectedNode.content = htmlToSafeMarkdown(richEditor.innerHTML);
        mdTextarea.value = selectedNode.content;
        refreshNodeStyles();
        scheduleSaveGraph(true);
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
    document.getElementById("pullFromGhBtn").addEventListener("click", () => pullFromGhGist(false));

    // 左下角快捷 IO 栏按钮绑定 (💾 同步、↙️ 拉取、⬆️ 导入 JSON)
    const btnQuickSync = document.getElementById("btn-sync");
    if (btnQuickSync) btnQuickSync.addEventListener("click", () => pushToGhGist(false));

    const btnQuickPull = document.getElementById("btn-pull");
    if (btnQuickPull) btnQuickPull.addEventListener("click", () => pullFromGhGist(false));

    const btnImport = document.getElementById("btn-import");
    const fileInput = document.getElementById("file-input");
    if (btnImport && fileInput) {
        btnImport.addEventListener("click", () => fileInput.click());
        fileInput.addEventListener("change", (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const parsed = JSON.parse(ev.target.result);
                    applyParsedBackupData(parsed);
                    saveGraphToStorage(true);
                    showToast(`📥 已成功导入备份文件 (${nodes.length} 张卡片)！`);
                } catch (err) {
                    showToast("❌ JSON 文件格式解析失败");
                }
                fileInput.value = "";
            };
            reader.readAsText(file);
        });
    }

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

    // 退出登录
    const btnLogout = document.getElementById("btnLogout");
    if (btnLogout) {
        btnLogout.addEventListener("click", () => {
            if (confirm("确定要退出登录吗？")) {
                localStorage.removeItem("flownotes_auth");
                window.location.href = "login.html";
            }
        });
    }

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

        // 零摩擦高频标注快捷键：Ctrl+Shift+R (🔴标红), Ctrl+Shift+G (🟢标绿), Ctrl+Shift+H (🟡高亮), Ctrl+Shift+\ (🧹清除格式)
        if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
            if (e.key === "R" || e.code === "KeyR") {
                e.preventDefault();
                applyFormatting("color-red");
                showToast("🔴 已应用红色标注");
                return;
            }
            if (e.key === "G" || e.code === "KeyG") {
                e.preventDefault();
                applyFormatting("color-green");
                showToast("🟢 已应用绿色标注");
                return;
            }
            if (e.key === "H" || e.code === "KeyH") {
                e.preventDefault();
                applyFormatting("highlight");
                showToast("🟡 已应用高亮标注");
                return;
            }
            if (e.key === "\\" || e.code === "Backslash") {
                e.preventDefault();
                applyFormatting("clear");
                showToast("🧹 已清除格式");
                return;
            }
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

function toggleTextareaLinePrefix(textarea, prefix) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;

    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    let lineEnd = value.indexOf("\n", end);
    if (lineEnd === -1) lineEnd = value.length;

    const selectedLines = value.substring(lineStart, lineEnd).split("\n");
    const isAllPrefixed = selectedLines.every(l => l.trim().startsWith(prefix.trim()) || /^[•·▪⁃‣\-\*]/.test(l.trim()));

    const newLines = selectedLines.map((line, i) => {
        const clean = line.replace(/^[ \t]*[•·▪⁃‣\-\*][ \t]*/, "").replace(/^[ \t]*\d+\.[ \t]*/, "");
        if (isAllPrefixed) {
            return clean;
        } else {
            const p = prefix === "1. " ? `${i + 1}. ` : prefix;
            return clean ? `${p}${clean}` : line;
        }
    });

    const newText = newLines.join("\n");
    textarea.setRangeText(newText, lineStart, lineEnd, "select");
    textarea.focus();
}

function clearTextareaFormatAndLists(textarea) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;

    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    let lineEnd = value.indexOf("\n", end);
    if (lineEnd === -1) lineEnd = value.length;

    const selectedText = value.substring(lineStart, lineEnd);
    const cleaned = selectedText
        .replace(/^[ \t]*[•·▪⁃‣\-\*][ \t]*/gm, "")
        .replace(/^[ \t]*\d+\.[ \t]*/gm, "")
        .replace(/<[^>]+>/g, "");

    textarea.setRangeText(cleaned, lineStart, lineEnd, "select");
    textarea.focus();
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
            case "bullet":
                toggleTextareaLinePrefix(mdTextarea, "- ");
                if (selectedNode) { selectedNode.content = mdTextarea.value; saveGraphToStorage(false); }
                return;
            case "ordered":
                toggleTextareaLinePrefix(mdTextarea, "1. ");
                if (selectedNode) { selectedNode.content = mdTextarea.value; saveGraphToStorage(false); }
                return;
            case "clear":
                clearTextareaFormatAndLists(mdTextarea);
                if (selectedNode) { selectedNode.content = mdTextarea.value; saveGraphToStorage(false); }
                return;
            case "task": before = "- [ ] "; after = ""; break;
            case "link": before = "["; after = "](url)"; break;
            case "color":
                const color = document.getElementById("md-color").value || "#ff6b6b";
                before = `<span style="color:${color}">`;
                after = "</span>";
                break;
            case "color-red":
                before = `<span style="color:#ef4444">`;
                after = "</span>";
                break;
            case "color-green":
                before = `<span style="color:#10b981">`;
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

    // 支持在画布卡片原地编辑区 (.canvas-note-card-body) 或右侧富文本编辑器 (#rich-editor) 直接划词标红/标绿/高亮
    const sel = window.getSelection();
    const activeInlineBody = (sel && sel.rangeCount > 0 && sel.anchorNode)
        ? (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement)?.closest?.(".canvas-note-card-body[contenteditable='true']")
        : null;

    if (activeInlineBody || (richEditor && (previewMode === "live"))) {
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
            case "color-red":
                document.execCommand("foreColor", false, "#ef4444");
                break;
            case "color-green":
                document.execCommand("foreColor", false, "#10b981");
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
            case "ordered":
                document.execCommand("insertOrderedList");
                break;
            case "clear":
                document.execCommand("removeFormat");
                const selClear = window.getSelection();
                if (selClear && selClear.rangeCount > 0) {
                    let node = selClear.getRangeAt(0).commonAncestorContainer;
                    if (node.nodeType === 3) node = node.parentNode;
                    const li = node.closest ? node.closest("li") : null;
                    if (li) {
                        document.execCommand("insertUnorderedList");
                    }
                    if (richEditor) {
                        richEditor.innerHTML = richEditor.innerHTML.replace(/[•·▪⁃‣]/g, "");
                    }
                }
                break;
            case "link":
                const url = prompt("请输入链接 URL:", "https://");
                if (url) document.execCommand("createLink", false, url);
                break;
            default: return;
        }

        // 同步画布内联卡片或 richEditor 内容到 selectedNode，并立即在画布上呈现红/绿/高亮效果
        if (selectedNode) {
            if (activeInlineBody) {
                selectedNode.content = htmlToSafeMarkdown(activeInlineBody.innerHTML);
                const plainFirst = activeInlineBody.innerText.split("\n").map(s => s.trim()).find(Boolean);
                if (plainFirst) selectedNode.label = plainFirst.slice(0, 42);
                if (richEditor) richEditor.innerHTML = renderMarkdownToHTML(selectedNode.content);
            } else if (richEditor) {
                selectedNode.content = htmlToSafeMarkdown(richEditor.innerHTML);
            }
            const mdEl = document.getElementById("md-textarea");
            if (mdEl) mdEl.value = selectedNode.content;
            refreshNodeStyles();
            scheduleSaveGraph(true);
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
        .replace(/<em>/gi, "*").replace(/<\/em>/gi, "*")
        .replace(/^[ \t]*[•·▪⁃‣][ \t]*/gm, "- ");
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
            return node.textContent.replace(/^[ \t]*[•·▪⁃‣][ \t]*/gm, "- ");
        }
        if (node.nodeType === 1) {
            const tag = node.tagName.toLowerCase();
            
            if (tag === "ul") {
                const items = Array.from(node.childNodes).map(child => {
                    const text = serializeNode(child).trim();
                    if (!text) return "";
                    const cleanText = text.replace(/^[•·▪⁃‣\-\*][ \t]*/, "");
                    return `- ${cleanText}`;
                }).filter(Boolean).join("\n");
                return `\n${items}\n`;
            }
            
            if (tag === "ol") {
                let idx = 1;
                const items = Array.from(node.childNodes).map(child => {
                    const text = serializeNode(child).trim();
                    if (!text) return "";
                    const cleanText = text.replace(/^(\d+\.|[•·▪⁃‣\-\*])[ \t]*/, "");
                    return `${idx++}. ${cleanText}`;
                }).filter(Boolean).join("\n");
                return `\n${items}\n`;
            }
            
            const inner = Array.from(node.childNodes).map(serializeNode).join("");
            if (tag === "li") {
                return inner.trim();
            }

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

    // 解析 Markdown 列表 (包含粘贴的实心圆点 • 和数字序号 1.)
    const lines = html.split('\n');
    let inUl = false, inOl = false;
    let listProcessed = [];

    lines.forEach(line => {
        const isBullet = /^[ \t]*[•·▪⁃‣\-\*][ \t]+(.*)/.exec(line);
        const isOrdered = /^[ \t]*(\d+)\.[ \t]+(.*)/.exec(line);

        if (isBullet) {
            if (inOl) { listProcessed.push("</ol>"); inOl = false; }
            if (!inUl) { listProcessed.push("<ul>"); inUl = true; }
            listProcessed.push(`<li>${isBullet[1]}</li>`);
        } else if (isOrdered) {
            if (inUl) { listProcessed.push("</ul>"); inUl = false; }
            if (!inOl) { listProcessed.push("<ol>"); inOl = true; }
            listProcessed.push(`<li>${isOrdered[2]}</li>`);
        } else {
            if (inUl) { listProcessed.push("</ul>"); inUl = false; }
            if (inOl) { listProcessed.push("</ol>"); inOl = false; }
            listProcessed.push(line);
        }
    });
    if (inUl) listProcessed.push("</ul>");
    if (inOl) listProcessed.push("</ol>");

    html = listProcessed.join('\n');

    // 还原 Markdown 其它内联语法
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
        .replace(/<\/u>/gi, '</u>');

    // 清理 <br> 紧随 list 标签后的多余换行
    html = html
        .replace(/<\/ul><br>/gi, "</ul>")
        .replace(/<\/ol><br>/gi, "</ol>")
        .replace(/<\/li><br>/gi, "</li>")
        .replace(/<ul><br>/gi, "<ul>")
        .replace(/<ol><br>/gi, "<ol>");

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

        // 2. 打包包含所有多图谱项目与元数据的全量大包裹（优先从内存缓存读取，即使超出 localStorage 5MB 也 100% 完整）
        const allMapsData = {};
        mapsManifest.forEach(m => {
            if (allMapsMemoryCache[m.id]) {
                allMapsData[m.id] = allMapsMemoryCache[m.id];
            } else {
                const raw = localStorage.getItem(`flownotes_map_data_${m.id}`);
                if (raw) {
                    try { allMapsData[m.id] = JSON.parse(raw); } catch (e) {}
                }
            }
        });
        allMapsData[activeMapId] = {
            nodes: nodes,
            links: cleanLinks(),
            flowStream: flowStream
        };
        allMapsMemoryCache[activeMapId] = allMapsData[activeMapId];

        const syncTimestampMs = Date.now();
        const localPayload = JSON.stringify({
            version: "FlowNotes-MultiMap-2.8",
            updatedAtMs: syncTimestampMs,
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

        lastGhPatchTimestamp = syncTimestampMs;
        const nowStr = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        safeLocalStorageSet("flownotes_last_sync_time", nowStr);
        safeLocalStorageSet("flownotes_cloud_node_count", totalCardCount.toString());
        safeLocalStorageSet("flownotes_cloud_updated_ms", String(syncTimestampMs));
        safeLocalStorageSet("flownotes_local_updated_ms", String(syncTimestampMs));

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

// 统一解析并应用从 GitHub Gist 或本地 JSON 导入的备份数据
function applyParsedBackupData(parsed) {
    if (!parsed) return;
    if (parsed.mapsManifest && Array.isArray(parsed.mapsManifest)) {
        mapsManifest = parsed.mapsManifest;
        safeLocalStorageSet("flownotes_maps_manifest", JSON.stringify(mapsManifest));

        if (parsed.allMapsData) {
            Object.keys(parsed.allMapsData).forEach(mId => {
                allMapsMemoryCache[mId] = parsed.allMapsData[mId];
                safeLocalStorageSet(`flownotes_map_data_${mId}`, JSON.stringify(parsed.allMapsData[mId]));
            });
        }

        const targetActiveId = parsed.activeMapId || (mapsManifest[0] ? mapsManifest[0].id : "map_default");
        loadMapData(targetActiveId);
    } else if (parsed.nodes) {
        nodes = parsed.nodes;
        links = parsed.links || [];
        sanitizeGraph();
        allMapsMemoryCache[activeMapId] = { nodes, links: cleanLinks(), flowStream };
    }

    const stampMs = parsed.updatedAtMs || Date.now();
    FlowNotesIDB.set("flownotes_full_bundle", {
        updatedAtMs: stampMs,
        activeMapId: activeMapId,
        mapsManifest: mapsManifest,
        allMapsData: allMapsMemoryCache
    });

    if (layoutMode === "tree") tidyLayout();
    else updateD3Graph();
    renderPositions();
    renderAll();
    renderEditor();
    renderOrganizerUI();
}

async function pullFromGhGist(silent = false) {
    const pat = localStorage.getItem("flownotes_gh_pat");
    const gistId = localStorage.getItem("flownotes_gh_gist_id");
    if (!pat || !gistId) {
        if (!silent) showToast("请先在同步设置中配置 GitHub PAT 和 Gist ID");
        return;
    }

    if (!silent) {
        updateSyncStatusUI("busy", "🔄 正在从 GitHub 拉取多图谱...", "正在拉取全量云端 Gist 备份文件");
    }

    try {
        const res = await fetch(`https://api.github.com/gists/${gistId}`, { headers: { "Authorization": `Bearer ${pat}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        if (!data.files || !data.files["flownotes_backup.json"]) return;
        const parsed = JSON.parse(data.files["flownotes_backup.json"].content);

        // 安全防护：如果拉取到的云端数据极其微小（如 0 个节点），阻止覆盖本地有效数据
        if (parsed.nodes && parsed.nodes.length === 0 && nodes.length > 0) {
            updateSyncStatusUI("warn", "⚠️ 拉取拦截: 云端数据为空", "云端数据为 0 个节点，阻止覆盖本地已有节点");
            if (!silent) showToast("⚠️ 拦截拉取！云端数据为空，阻止覆盖本地数据。");
            return;
        }

        applyParsedBackupData(parsed);

        const cloudStampMs = parsed.updatedAtMs || (data.updated_at ? Date.parse(data.updated_at) : Date.now());
        const nowStr = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        const totalCardCount = mapsManifest.reduce((acc, m) => acc + (m.nodeCount || 0), 0);
        safeLocalStorageSet("flownotes_last_sync_time", nowStr);
        safeLocalStorageSet("flownotes_cloud_node_count", totalCardCount.toString());
        safeLocalStorageSet("flownotes_cloud_updated_ms", String(cloudStampMs));
        safeLocalStorageSet("flownotes_local_updated_ms", String(cloudStampMs));

        updateGhStatusDisplay();
        if (silent) {
            showToast(`☁️ 已自动同步云端最新笔记 (${totalCardCount} 张卡片)`);
        } else {
            showToast(`🎉 已成功从 GitHub 恢复 ${mapsManifest.length} 个思维图谱项目 (${totalCardCount} 卡片)！(${nowStr})`);
        }

    } catch (e) {
        if (!silent) {
            const nowStr = new Date().toLocaleTimeString('zh-CN', { hour12: false });
            updateSyncStatusUI("error", `🔴 拉取失败 (${nowStr})`, `拉取失败原因: ${e.message || "网络或 JSON 解析异常"}`);
            showToast(`❌ 拉取失败 (${e.message || "网络错误"})`);
        }
    }
}

// 跨设备开机/切回窗口自动云端新版本检测（实现手机/平板/办公电脑/家里电脑打开即最新）
async function autoCheckCloudGist(silent = true) {
    const now = Date.now();
    if (now - lastCloudCheckMs < 20000) return; // 20秒冷却防频繁请求
    lastCloudCheckMs = now;

    const pat = localStorage.getItem("flownotes_gh_pat");
    const gistId = localStorage.getItem("flownotes_gh_gist_id");
    if (!pat || !gistId) return;

    try {
        const res = await fetch(`https://api.github.com/gists/${gistId}`, { headers: { "Authorization": `Bearer ${pat}` } });
        if (!res.ok) return;
        const data = await res.json();
        if (!data.files || !data.files["flownotes_backup.json"]) return;

        const parsed = JSON.parse(data.files["flownotes_backup.json"].content);
        const cloudStampMs = parsed.updatedAtMs || (data.updated_at ? Date.parse(data.updated_at) : 0);
        const lastKnownCloudMs = parseInt(localStorage.getItem("flownotes_cloud_updated_ms") || "0", 10);
        const localUpdatedMs = parseInt(localStorage.getItem("flownotes_local_updated_ms") || "0", 10);

        const isDefaultInitialState = (mapsManifest.length === 1 && nodes.length === DEFAULT_NODES.length && nodes[0] && nodes[0].id === "root_1" && !lastKnownCloudMs);

        // 如果这台设备是刚打开的初始状态，或者云端比上次已知同步时间更新且本地没有未推送的新修改，则自动无感拉取云端最新数据！
        if (isDefaultInitialState || (cloudStampMs > lastKnownCloudMs + 1000 && localUpdatedMs <= lastKnownCloudMs + 1000)) {
            applyParsedBackupData(parsed);
            const nowStr = new Date().toLocaleTimeString('zh-CN', { hour12: false });
            const totalCardCount = mapsManifest.reduce((acc, m) => acc + (m.nodeCount || 0), 0);
            safeLocalStorageSet("flownotes_last_sync_time", nowStr);
            safeLocalStorageSet("flownotes_cloud_node_count", totalCardCount.toString());
            safeLocalStorageSet("flownotes_cloud_updated_ms", String(cloudStampMs));
            safeLocalStorageSet("flownotes_local_updated_ms", String(cloudStampMs));
            updateGhStatusDisplay();
            showToast(`☁️ 已自动同步云端最新笔记 (${totalCardCount} 张卡片)`);
        }
    } catch (e) {}
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
    flushPendingSave();

    // 先保存当前激活图谱的数据
    const currentData = {
        nodes: nodes,
        links: cleanLinks(),
        flowStream: flowStream
    };
    allMapsMemoryCache[activeMapId] = currentData;
    safeLocalStorageSet(`flownotes_map_data_${activeMapId}`, JSON.stringify(currentData));

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


// --- v2.6.0 划词悬浮调色胶囊 (Selection Quick Bubble) ---
function initSelectionQuickBubble() {
    const bubble = document.getElementById("selection-quick-bubble");
    const richEditor = document.getElementById("rich-editor");
    if (!bubble || !richEditor) return;
    if (bubble.parentElement !== document.body) {
        document.body.appendChild(bubble);
    }

    function updateBubblePosition() {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
            bubble.style.display = "none";
            return;
        }

        const range = sel.getRangeAt(0);
        const containerEl = range.commonAncestorContainer.nodeType === 1
            ? range.commonAncestorContainer
            : range.commonAncestorContainer.parentElement;
        const inRichEditor = richEditor.contains(range.commonAncestorContainer);
        const inCanvasCard = !!(containerEl && containerEl.closest && containerEl.closest(".canvas-note-card-body"));
        if (!inRichEditor && !inCanvasCard) {
            bubble.style.display = "none";
            return;
        }

        const text = sel.toString().trim();
        if (!text) {
            bubble.style.display = "none";
            return;
        }

        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
            bubble.style.display = "none";
            return;
        }

        bubble.style.display = "flex";
        const bubbleWidth = bubble.offsetWidth || 140;
        const left = Math.max(10, rect.left + (rect.width / 2) - (bubbleWidth / 2));
        const top = Math.max(10, rect.top - 42);
        bubble.style.left = `${left}px`;
        bubble.style.top = `${top}px`;
    }

    document.addEventListener("mouseup", () => setTimeout(updateBubblePosition, 25));
    document.addEventListener("keyup", (e) => {
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Shift"].includes(e.key)) {
            setTimeout(updateBubblePosition, 25);
        }
    });

    document.addEventListener("mousedown", (e) => {
        const inCanvasCard = !!(e.target && e.target.closest && e.target.closest(".canvas-note-card-body"));
        if (!bubble.contains(e.target) && !richEditor.contains(e.target) && !inCanvasCard) {
            bubble.style.display = "none";
        }
    });

    bubble.querySelectorAll(".bubble-btn").forEach(btn => {
        btn.addEventListener("mousedown", (e) => e.preventDefault());
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;
            if (action === "red") applyFormatting("color-red");
            else if (action === "green") applyFormatting("color-green");
            else if (action === "highlight") applyFormatting("highlight");
            else if (action === "clear") applyFormatting("clear");
            setTimeout(updateBubblePosition, 30);
        });
    });
}

// --- v2.6.0 剪贴板截图直接贴画布与轻量压缩 ---
function initClipboardPaste() {
    window.addEventListener("paste", async (e) => {
        const activeTag = document.activeElement ? document.activeElement.tagName : "";
        const isEditing = activeTag === "INPUT" || activeTag === "TEXTAREA" || (document.activeElement && document.activeElement.isContentEditable);

        const clipboardData = e.clipboardData || window.clipboardData;
        if (!clipboardData) return;

        // 1. 检测剪贴板是否含有图片 (如 Win+Shift+S 截图)
        const items = clipboardData.items;
        let imageFile = null;
        if (items) {
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf("image") !== -1) {
                    imageFile = items[i].getAsFile();
                    break;
                }
            }
        }

        if (imageFile) {
            e.preventDefault();
            const reader = new FileReader();
            reader.onload = (uploadEvent) => {
                const rawDataUrl = uploadEvent.target.result;
                compressImage(rawDataUrl, 1000, 0.85, (compressedDataUrl) => {
                    const newId = `img_${Date.now()}`;
                    const targetX = (lastCanvasMouseCoords && Number.isFinite(lastCanvasMouseCoords.x)) ? lastCanvasMouseCoords.x : 450;
                    const targetY = (lastCanvasMouseCoords && Number.isFinite(lastCanvasMouseCoords.y)) ? lastCanvasMouseCoords.y : 320;

                    const nowTs = Date.now();
                    const newNode = {
                        id: newId,
                        label: `📸 截图 ${nodes.length + 1}`,
                        parentId: null, // 独立自由悬浮卡片
                        content: `![截图](${compressedDataUrl})\n\n`,
                        isImage: true,
                        imageUrl: compressedDataUrl,
                        createdAt: nowTs,
                        order: nodes.length,
                        x: targetX,
                        y: targetY,
                        fx: targetX,
                        fy: targetY
                    };

                    nodes.push(newNode);
                    selectedNode = newNode;
                    selectedNodeIds = new Set([newId]);

                    scheduleSaveGraph(true);
                    if (layoutMode === "tree") tidyLayout();
                    else updateD3Graph();
                    renderPositions();
                    renderEditor();
                    showToast("📸 截图已粘贴在鼠标位置 (可自由摆放、按 Tab 衍生箭头或拉线连接)！");
                });
            };
            reader.readAsDataURL(imageFile);
            return;
        }

        // 2. 如果当前不在编辑文字，且在画布空白处按了 Ctrl+V 粘贴纯文本
        if (!isEditing) {
            const text = clipboardData.getData("text/plain");
            if (text && text.trim()) {
                e.preventDefault();
                const newId = `card_${Date.now()}`;
                const trimmed = text.trim();
                const firstLine = trimmed.split("\n")[0].slice(0, 25) || `笔记 ${nodes.length + 1}`;
                const targetX = (lastCanvasMouseCoords && Number.isFinite(lastCanvasMouseCoords.x)) ? lastCanvasMouseCoords.x : 450;
                const targetY = (lastCanvasMouseCoords && Number.isFinite(lastCanvasMouseCoords.y)) ? lastCanvasMouseCoords.y : 320;

                const nowTs = Date.now();
                const newNode = {
                    id: newId,
                    label: firstLine,
                    parentId: null, // 独立自由悬浮卡片，支持放到一坨
                    content: trimmed,
                    createdAt: nowTs,
                    order: nodes.length,
                    x: targetX,
                    y: targetY,
                    fx: targetX,
                    fy: targetY
                };

                nodes.push(newNode);
                selectedNode = newNode;
                selectedNodeIds = new Set([newId]);

                scheduleSaveGraph(true);
                if (layoutMode === "tree") tidyLayout();
                else updateD3Graph();
                renderPositions();
                renderEditor();
                showToast(`📋 已在光标处粘贴卡片: [[${firstLine}]] (双击卡片可直接划词标红/标绿/高亮)`);
            }
        }
    });
}

function compressImage(dataUrl, maxDimension, quality, callback) {
    const img = new Image();
    img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxDimension || h > maxDimension) {
            if (w > h) {
                h = Math.round((h * maxDimension) / w);
                w = maxDimension;
            } else {
                w = Math.round((w * maxDimension) / h);
                h = maxDimension;
            }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL("image/jpeg", quality);
        callback(compressed);
    };
    img.onerror = () => callback(dataUrl);
    img.src = dataUrl;
}
