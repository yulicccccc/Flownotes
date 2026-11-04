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
    { id: "root_1", label: "核心概念", parentId: null, content: "# 核心概念\n\n欢迎来到 FlowNotes **思维导图优先 (Mindmap-First)** 知识库！\n\n- 在图谱中按 `Enter` 键建同级节点，按 `Tab` 键建子节点，按 `Ctrl+Z` 撤销。\n- 双击空白处创建独立的全新主题节点！", order: 0, x: 240, y: 320 },
    { id: "node_2", label: "瞬时心流捕获", parentId: "root_1", content: "# 瞬时心流捕获\n\n以 Stream 形式无摩擦倾倒灵感，自动提取 `#标签` 与 `[[双链]]`。", order: 0, x: 640, y: 200 },
    { id: "node_3", label: "卡片盒笔记法原则", parentId: "root_1", content: "# 卡片盒笔记法原则\n\n原子化观点 + 自底向上的关联支撑。", order: 1, x: 640, y: 420 },
    { id: "node_4", label: "GitHub Gist 防误删", parentId: "node_3", content: "# GitHub Gist 防误删\n\n每一次修改产生独立 Commit，哪怕误删也能 100% 还原。", order: 0, x: 990, y: 420 }
];

const DEFAULT_LINKS = [
    { source: "root_1", target: "node_2" },
    { source: "root_1", target: "node_3" },
    { source: "node_3", target: "node_4" }
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
let inkStrokes = [];
let inkLayer = null;
let isInkDrawMode = false;
let currentInkTool = "red"; // "red" | "green" | "highlighter" | "sky" | "eraser"
let selectedNode = null;
let selectedNodeIds = new Set();
let layoutMode = "free"; // 默认使用自由空间白板模式 ("free"，允许笔记放到一坨自由摆放)，按 M 键可一键整理为 XMind 树状结构
let ghSyncTimer = null;
let saveDebounceTimer = null;
let pendingHistoryRecord = false;
let isImeComposing = false;
let isTouchMultiSelectMode = false;
let isSpacePressed = false;
let spacePanMoved = false;
let selectedLink = null;
let copiedNodesBuffer = [];
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
    const snapshot = JSON.stringify({ nodes, links, inkStrokes });
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
        inkStrokes = Array.isArray(data.inkStrokes) ? data.inkStrokes : [];
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
    console.log("[FlowNotes] v3.5.8 loaded — Natural Shrink-Wrap Auto-Sizing Engine & Truncation Recovery");
    initStorage();
    initD3Mindmap();
    initEvents();
    initSelectionQuickBubble();
    initIntuitiveActionBarsAndContextMenu();
    initClipboardPaste();
    initV31Enhancements();
    initV32XMindOneNoteSuite();
    initPomodoroSuite();
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

// --- OneNote 3级树状层级全局状态管理 (v3.5.0) ---
let notebooksManifest = [];
let sectionsManifest = [];
let mapsManifest = [];
let activeMapId = "map_default";
let expandedTreeNodes = new Set();
let organizerTreeFilter = "";

const ONENOTE_SECTION_COLORS = [
    "#38bdf8", // 亮天蓝
    "#a855f7", // 紫罗兰
    "#10b981", // 薄荷绿
    "#f59e0b", // 琥珀黄
    "#f43f5e", // 玫红
    "#ec4899", // 粉桃
    "#6366f1", // 靛蓝
    "#14b8a6", // 青碧
    "#84cc16"  // 浅柠檬绿
];

function initStorage() {
    // 1. 初始化笔记本 Manifest (Tier 1)
    try {
        const savedNbs = localStorage.getItem("flownotes_notebooks_manifest");
        notebooksManifest = savedNbs ? JSON.parse(savedNbs) : [];
    } catch (e) {
        notebooksManifest = [];
    }
    if (!Array.isArray(notebooksManifest) || notebooksManifest.length === 0) {
        notebooksManifest = [{
            id: "nb_default",
            title: "AI Biologist 课题研究",
            icon: "📔",
            createdAt: new Date().toLocaleDateString()
        }];
        safeLocalStorageSet("flownotes_notebooks_manifest", JSON.stringify(notebooksManifest));
    }

    // 2. 初始化彩色分区 Manifest (Tier 2)
    try {
        const savedSecs = localStorage.getItem("flownotes_sections_manifest");
        sectionsManifest = savedSecs ? JSON.parse(savedSecs) : [];
    } catch (e) {
        sectionsManifest = [];
    }
    if (!Array.isArray(sectionsManifest) || sectionsManifest.length === 0) {
        sectionsManifest = [
            { id: "sec_default", notebookId: "nb_default", title: "核心思维沙盘", color: "#38bdf8", order: 0 },
            { id: "sec_literature", notebookId: "nb_default", title: "文献与假说研讨", color: "#a855f7", order: 1 },
            { id: "sec_notes", notebookId: "nb_default", title: "快速笔记与待办", color: "#10b981", order: 2 }
        ];
        safeLocalStorageSet("flownotes_sections_manifest", JSON.stringify(sectionsManifest));
    }

    // 3. 初始化展开折叠状态 (localStorage)
    try {
        const rawExpanded = localStorage.getItem("flownotes_tree_expanded");
        if (rawExpanded) {
            expandedTreeNodes = new Set(JSON.parse(rawExpanded));
        } else {
            expandedTreeNodes = new Set(["nb_default", "sec_default", "sec_literature", "sec_notes"]);
        }
    } catch (e) {
        expandedTreeNodes = new Set(["nb_default", "sec_default", "sec_literature", "sec_notes"]);
    }

    // 4. 初始化思维图谱/沙盘页面 Manifest (Tier 3)
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
            notebookId: "nb_default",
            sectionId: "sec_default",
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
        // 确保每个已存在的 map 都有正确的 notebookId 和 sectionId
        let manifestMigrated = false;
        mapsManifest.forEach(m => {
            if (!m.notebookId) {
                m.notebookId = "nb_default";
                manifestMigrated = true;
            }
            if (!m.sectionId) {
                const isExcalidraw = (m.id && m.id.includes("excalidraw")) || (m.title && (m.title.includes("Excalidraw") || m.title.includes("1.pdf")));
                m.sectionId = isExcalidraw ? "sec_literature" : "sec_default";
                manifestMigrated = true;
            }
            const raw = localStorage.getItem(`flownotes_map_data_${m.id}`);
            if (raw) {
                try { allMapsMemoryCache[m.id] = JSON.parse(raw); } catch (e) {}
            }
        });
        if (manifestMigrated) {
            safeLocalStorageSet("flownotes_maps_manifest", JSON.stringify(mapsManifest));
        }
    }

    loadMapData(activeMapId);
    updateCurrentMapBadge();

    // 异步从高容量 IndexedDB 恢复（如果贴了大量图片超出 localStorage 5MB 上限，IndexedDB 依然保留 100% 完整数据）
    FlowNotesIDB.get("flownotes_full_bundle").then(bundle => {
        if (!bundle || !bundle.mapsManifest) return;
        const lsUpdatedMs = parseInt(localStorage.getItem("flownotes_local_updated_ms") || "0", 10);
        const idbUpdatedMs = bundle.updatedAtMs || 0;
        if (idbUpdatedMs >= lsUpdatedMs && bundle.allMapsData) {
            allMapsMemoryCache = { ...allMapsMemoryCache, ...bundle.allMapsData };
            if (bundle.notebooksManifest && Array.isArray(bundle.notebooksManifest)) {
                notebooksManifest = bundle.notebooksManifest;
                safeLocalStorageSet("flownotes_notebooks_manifest", JSON.stringify(notebooksManifest));
            }
            if (bundle.sectionsManifest && Array.isArray(bundle.sectionsManifest)) {
                sectionsManifest = bundle.sectionsManifest;
                safeLocalStorageSet("flownotes_sections_manifest", JSON.stringify(sectionsManifest));
            }
            if (idbUpdatedMs > lsUpdatedMs) {
                mapsManifest = bundle.mapsManifest;
                activeMapId = bundle.activeMapId || activeMapId;
                loadMapData(activeMapId);
    updateCurrentMapBadge();
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
        inkStrokes = Array.isArray(data.inkStrokes) ? data.inkStrokes : [];
        allMapsMemoryCache[mapId] = data;
        sanitizeGraph();
    } else {
        nodes = [...DEFAULT_NODES];
        links = [...DEFAULT_LINKS];
        flowStream = [...DEFAULT_FLOW_STREAM];
        inkStrokes = [];
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
        flowStream: flowStream,
        inkStrokes: inkStrokes
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

    // 3. 异步写入高容量 IndexedDB（突破 5MB 限制，支持无限贴图与 OneNote 3级树状层级）
    FlowNotesIDB.set("flownotes_full_bundle", {
        updatedAtMs: nowMs,
        activeMapId: activeMapId,
        notebooksManifest: notebooksManifest,
        sectionsManifest: sectionsManifest,
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

    // 1. 唯一真理来源：根据每个节点的 parentId 精确生成树状连线（并保留箭头上的关系词 edgeLabel）
    nodes.forEach(n => {
        if (n.parentId && nodeMap.has(n.parentId)) {
            treeLinks.push({
                source: cleanNodeId(n.parentId),
                target: cleanNodeId(n.id),
                label: n.edgeLabel || ""
            });
        }
    });

    // 2. 包含保留用户自定义的 relation 关系虚线（及关系词 label）
    const relationLinks = (links || [])
        .filter(l => l && l.type === "relation")
        .map(l => ({
            source: cleanNodeId(l.source),
            target: cleanNodeId(l.target),
            type: "relation",
            label: l.label || ""
        }));

    return [...treeLinks, ...relationLinks];
}

// 辅助：启动时清理孤儿链接 + 去重 + 修正初始默认演示坐标
function sanitizeGraph() {
    const nodeIds = new Set(nodes.map(n => n.id));
    // 清理孤立的 parentId 并补齐 createdAt 时间戳与有效坐标
    nodes.forEach((n, idx) => {
        if (n.parentId && !nodeIds.has(n.parentId)) n.parentId = null;
        if (typeof n.createdAt !== "number") {
            const m = String(n.id || "").match(/_(\d{10,})$/);
            n.createdAt = m ? parseInt(m[1], 10) : (1700000000000 + idx * 1000);
        }
        if (!Number.isFinite(n.x)) n.x = 260 + (idx % 3) * 320;
        if (!Number.isFinite(n.y)) n.y = 220 + Math.floor(idx / 3) * 180;
    });

    // v3.4.3 还原 OneNote 原生视觉与自动热迁移：
    // 1. 清理 Excalidraw 导入节点误染色的整卡背景色，确保所有卡片框保持统一，仅文字局部标色
    // 2. 自动将旧缓存中整句染色或包含死换行的 1.pdf 卡片无感升级为 OneNote 精确局部词语标色与流式自适应宽度
    const ONENOTE_SPAN_UPGRADE_MAP = {
        "肠道微生物合成丁酸的能力，如何随着年龄变化？": '肠道微生物<span style="color:#ef4444">合成丁酸</span>的能力，如何随着<span style="color:#ef4444">年龄</span>变化？',
        "需要计算通路丰度与年龄的相关性、基因丰度比值、相关基因数量。": '需要计算<span style="color:#10b981">通路丰度</span>与<span style="color:#10b981">年龄</span>的相关性、<span style="color:#10b981">基因丰度</span>比值、<span style="color:#10b981">相关基因数量</span>。',
        "shotgun metagenomic sequencing（宏基因组鸟枪法测序）": '==shotgun metagenomic sequencing==（宏基因组鸟枪法测序）',
        "数据处理是否合理，取决于它想回答什么问题，以及过滤规则是否真的能识别想要排除的对象。": '数据处理是否合理，取决于它<span style="color:#ef4444">想回答什么问题</span>，以及过滤规则是否真的能识别想要排除的对象。',
        "被过滤的 reads 确实主要来自人为添加的 Salmonella，并且过滤后不会明显扭曲我们想研究的原有菌群": '被过滤的 reads 确实主要来自<span style="color:#ef4444">人为添加的 Salmonella</span>，并且过滤后不会明显<span style="color:#ef4444">扭曲我们想研究的原有菌群</span>',
        "biological justification: why": '<span style="color:#ef4444">biological</span> justification: why',
        "empirical validation: how do you know": '<span style="color:#ef4444">empirical</span> validation: how do you know',
        "合理平衡病例与对照组能够减少 batch confounding，但不代表批次差异会消失。": '合理<span style="color:#ef4444">平衡</span>病例与对照组能够减少 batch confounding，但不代表批次差异<span style="color:#ef4444">会消失</span>。',
        "研究某个变量时，不能让另一个可能影响结果的变量与它完全重合": '研究某个变量时，不能让另一个<span style="color:#ef4444">可能影响结果</span>的<span style="color:#ef4444">变量</span>与它完全重合',
        "AI 最主要的失败原因，往往不是无法运行分析工具，而是没有正确理解科学问题。": 'AI 最主要的失败原因，往往不是无法运行分析工具，而是没有<span style="color:#ef4444">正确理解科学问题</span>。',
        "错误理解研究问题：Incorrect problem interpretation": '错误理解<span style="color:#ef4444">研究问题</span>：Incorrect problem interpretation',
        "例如没有正确决定应该排除哪些基因、采用什么检测阈值。": '例如没有正确决定应该<span style="color:#ef4444">排除</span>哪些基因、采用什么<span style="color:#ef4444">检测阈值</span>。',
        "例如忽略测序深度差异、混杂因素或重复采样之间的关联。": '例如忽略测序<span style="color:#ef4444">深度差异</span>、混杂因素或<span style="color:#ef4444">重复采样</span>之间的关联。',
        "发现矛盾，却没有采取纠正行动：Ignored contradictory evidence": '发现矛盾，却没有采取纠正行动：<span style="color:#ef4444">Ignored </span><span style="color:#ef4444">contradictory evidence</span>',
        "我们的目的是出一套好的考题": '我们的目的是出一套<span style="color:#ef4444">好</span>的考题',
        "是不是都求关联性比较多？": '是不是都求<span style="color:#ef4444">关联性</span>比较多？',
        "还有一个容易忽略的细节：Shotgun 读到的不只是基因，也可能包括非编码 DNA；如果样本含有宿主 DNA，也可能测到宿主 DNA。": '还有一个容易忽略的细节：Shotgun 读到的不只是基因，也可能包括非编码 DNA；如果样本含有宿主 DNA，也可能测到宿主 DNA。'
    };

    nodes.forEach(n => {
        // v3.5.8 消除右侧空白与框自适应失败：对于所有非用户显式手动调整过的卡片，彻底清理过时僵硬的 customWidth / customHeight
        // 保证卡片回归自然的 width: max-content; max-width: 520px; 紧密自适应文字包裹，杜绝右侧冗余死白空间！
        if (!n.isImage && !n._userResized) {
            delete n.customWidth;
            delete n.customHeight;
        }

        // v3.5.8 自动无损修复旧版被截断的标题（如「还有一个容易忽略的细节...」）：若 content 首行更完整，恢复完整首行为 label
        if (n.content && typeof n.content === "string") {
            const fullFirstLine = n.content.split("\n")[0].replace(/^#{1,4}\s+/, "").trim();
            const plainLabel = stripFormattingToPlainText(n.label || "");
            const plainFirst = stripFormattingToPlainText(fullFirstLine);
            if (plainLabel && plainFirst.startsWith(plainLabel) && plainFirst.length > plainLabel.length) {
                n.label = fullFirstLine;
            }
        }

        if (n.id && n.id.startsWith("ex_")) {
            if (n.cardBgColor === "rose" || n.cardBgColor === "emerald" || n.cardBgColor === "") {
                delete n.cardBgColor;
            }
            if (!n.isImage && !n._userResized && !n._oneNoteV343Migrated) {
                n._oneNoteV343Migrated = true;
                delete n.customHeight;
                if (typeof n.customFontSize === "number" && n.customFontSize <= 16) {
                    delete n.customFontSize;
                }
                const plain = String(n.content || n.label || "")
                    .replace(/<br\s*\/?>/gi, "\n")
                    .replace(/<[^>]+>/g, "")
                    .replace(/批次差\s*\n\s*异/g, "批次差异")
                    .replace(/排除哪些\s*\n\s*基因/g, "排除哪些基因")
                    .replace(/混杂\s*\n\s*因素/g, "混杂因素")
                    .replace(/仍然报\s*\n\s*告/g, "仍然报告")
                    .replace(/无法运行\s*\n\s*分析工具/g, "无法运行分析工具")
                    .replace(/也可能包括\s*\n\s*非编码/g, "也可能包括非编码")
                    .replace(/Incorrect problem\s*\n\s*interpretation/g, "Incorrect problem interpretation")
                    .replace(/Ignored\s*\n\s*contradictory/g, "Ignored contradictory")
                    .trim();

                if (ONENOTE_SPAN_UPGRADE_MAP[plain]) {
                    n.content = ONENOTE_SPAN_UPGRADE_MAP[plain];
                    n.label = ONENOTE_SPAN_UPGRADE_MAP[plain];
                } else if (typeof n.content === "string" && n.content.includes("<br>")) {
                    n.content = n.content.replace(/<br\s*\/?>/gi, "\n");
                }
                // v3.5.6 自动热修复旧缓存：若 n.content 首行包含格式化颜色，自动同步进 n.label
                if (n.content && (!n.label || !n.label.includes("<span")) && (n.content.includes("<span style=\"color") || n.content.includes("<font color") || n.content.includes("=="))) {
                    const fLine = n.content.split("\n")[0].replace(/^#{1,4}\s+/, "").trim();
                    if (fLine.includes("<span") || fLine.includes("<font") || fLine.includes("==")) {
                        n.label = fLine;
                    }
                }

                // v3.4.4 灵感批注手写体自动热迁移：1.pdf 中的思考、提问与反思批注自动恢复为 Aa剪刀石头布/叶根友散墨手写体
                const handwritingPatterns = [
                    "如何做数据清洗应该是重点",
                    "我们的目的是出一套",
                    "是不是都求",
                    "专门用于选择基因的",
                    "为什么从科学问题出发需要过滤",
                    "数据是否支持过滤规则",
                    "当时为什么这么做是合理的",
                    "但那么做有什么局限性",
                    "现在如果重来回如何做得更好"
                ];
                if (handwritingPatterns.some(kw => plain.includes(kw))) {
                    n.fontStyle = "handwriting";
                }

                // 修复旧版导入把单行短句设得过窄导致末字意外折行（如「逻辑陷/阱」「负/担」「比较/多？」）
                if (!plain.includes("\n") && plain.length <= 28) {
                    delete n.customWidth;
                }
            }
        }
    });

    // 若仍是旧版拥挤的 4 个初始演示节点坐标 (450,320 / 250,480)，自动升级为舒展树状坐标并清理旧演示虚线
    if (nodes.length === 4) {
        const r1 = nodes.find(n => n.id === "root_1");
        const n2 = nodes.find(n => n.id === "node_2");
        const n3 = nodes.find(n => n.id === "node_3");
        const n4 = nodes.find(n => n.id === "node_4");
        if (r1 && n2 && n3 && n4 && Math.round(r1.x) === 450 && Math.round(n2.x) === 250 && Math.round(n3.x) === 650) {
            r1.x = 240; r1.y = 320; r1.fx = 240; r1.fy = 320;
            n2.x = 640; n2.y = 200; n2.fx = 640; n2.fy = 200;
            n3.x = 640; n3.y = 420; n3.fx = 640; n3.fy = 420;
            n4.x = 990; n4.y = 420; n4.fx = 990; n4.fy = 420;
            links = (links || []).filter(l => !(l.type === "relation" && cleanNodeId(l.source) === "node_2" && cleanNodeId(l.target) === "node_4"));
        }
    }

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
let linkElements, linkLabelElements, nodeElements;

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

    // 链接层与箭头关系词层在节点层下面（z-order 正确），OneNote 手绘圈注层在最上层 (默认 pointer-events: none 不遮挡卡片点击)
    linkElements = zoomContainer.append("g").attr("class", "link-layer").selectAll("line");
    linkLabelElements = zoomContainer.append("g").attr("class", "link-label-layer").selectAll(".link-label-group");
    nodeElements = zoomContainer.append("g").attr("class", "node-layer").selectAll(".node-group");
    inkLayer = zoomContainer.append("g").attr("class", "ink-layer");

    // Zoom: 双指触控缩放平移、按住空格键(Space)+左键拖拽、鼠标中键拖拽交给 d3.zoom；单指触屏与鼠标左键交给“长按变抓手平移(🖐️) + 立即拖拽框选”双模直觉引擎
    zoom = d3.zoom()
        .scaleExtent([0.08, 5])
        .filter((event) => {
            if (isInkDrawMode && event.type !== "wheel") return false;
            if (event.type === "wheel") return false; // 禁止 D3 默认 wheel zoom
            if (event.type === "touchstart") {
                return !!(event.touches && event.touches.length >= 2); // 双指捏合缩放交给 d3.zoom，单指长按/框选由直觉引擎接管
            }
            if (event.type === "mousedown") {
                const onNode = event.target.closest && (
                    event.target.closest(".node-group") ||
                    event.target.closest(".link") ||
                    event.target.closest(".link-label-group")
                );
                if (onNode) return false;
                return isSpacePressed || event.button === 1;
            }
            return true;
        })
        .on("zoom", (event) => {
            zoomContainer.attr("transform", event.transform);
            const zoomBtn = document.getElementById("btn-zoom-reset");
            if (zoomBtn) {
                const nextPct = `${Math.round((event.transform.k || 1) * 100)}%`;
                if (zoomBtn.textContent !== nextPct) zoomBtn.textContent = nextPct;
            }
            if (selectedNodeIds.size >= 2 || selectedLink) {
                updateFloatingActionBarsPosition();
            }
        });

    svg.call(zoom).on("dblclick.zoom", null);

    // 自定义滚轮行为：裸滚轮 = 平移画布，Ctrl+滚轮 = 缩放（与 reference 一致）
    svg.node().addEventListener("wheel", handleGraphWheel, { passive: false });

    // 实时追踪鼠标在画布内部的坐标，便于 Ctrl+V 或空白处直接打字时在光标处落子生成卡片
    svg.on("mousemove.canvasCoords", (event) => {
        if (isSpacePressed) spacePanMoved = true;
        const c = d3.pointer(event, zoomContainer.node());
        if (c && Number.isFinite(c[0]) && Number.isFinite(c[1])) {
            lastCanvasMouseCoords = { x: c[0], y: c[1] };
        }
    });

    function spawnFreeCardAtCoords(coords, initialText = "") {
        const nowTs = Date.now();
        const newId = `root_${nowTs}`;
        const hasInit = typeof initialText === "string" && initialText.length > 0;
        const defaultTitle = hasInit ? initialText : `新笔记 ${nodes.length + 1}`;

        const newNode = {
            id: newId,
            label: defaultTitle,
            parentId: null,
            content: defaultTitle,
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
        selectedLink = null;

        scheduleSaveGraph(true);
        if (layoutMode === "tree") tidyLayout();
        else updateD3Graph();
        renderPositions();
        renderEditor();
        if (!hasInit) {
            showToast(`✨ 已在当前位置创建自由卡片 [[${newNode.label}]] (可直接输入或划词标色)`);
        }

        setTimeout(() => {
            startInlineCardEditById(newId, !hasInit, hasInit);
        }, 35);
    }
    window.spawnFreeCardAtCoords = spawnFreeCardAtCoords;

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

// --- 🖐️ + 🔳 120fps 零延迟「一碰即拖画布 + Shift/定格极速框选」双模直觉引擎 (v3.4.1) ---
// 参照 Obsidian Canvas / Miro / Figma / XMind 黄金标准：
// 1. 默认模式 (isMarqueeMode = false, ✋ 抓手平移优先)：
//    - 鼠标左键直接拖 / 触屏单指直接滑 / 鼠标右键直接拖 = 0ms 零延迟丝滑平移画布 (一碰即走，绝无倒计时劫持！)
//    - 按住 Shift + 左键拖拽 = 0ms 零延迟拉出蓝色虚线框选 (#marquee-box) 多张卡片！
// 2. 框选优先模式 (点右下角 ✋/🔳 按钮或按 B 键切换为 isMarqueeMode = true)：
//    - 鼠标左键直接拖 = 0ms 零延迟拉框多选；右键拖拽 / 空格+左键拖拽 = 平移画布！
let isMarqueeMode = false;
let isMarqueeDragging = false;
let isLongPressHandPan = false;
let isLongPressMarqueeReady = false;
let longPressPanTimer = null;
let pointerDownActive = false;
let pointerIsRightButton = false;
let pointerIsTouch = false;
let rightDragMoved = false;
let pointerStartClient = { x: 0, y: 0 };
let pointerLastClient = { x: 0, y: 0 };
let marqueeStartCoords = [0, 0];
let marqueeInitialSelectedIds = new Set();
let marqueeCachedVisibleNodes = [];

function showCanvasHandCursor(clientX, clientY, visible, modeIcon = "🖐️") {
    let handEl = document.getElementById("canvas-hand-cursor");
    if (!handEl) {
        handEl = document.createElement("div");
        handEl.id = "canvas-hand-cursor";
        handEl.className = "canvas-hand-cursor-badge";
        handEl.innerHTML = `<span>🖐️</span>`;
        document.body.appendChild(handEl);
    }
    const svgEl = document.getElementById("graph-svg");
    if (visible) {
        if (pointerIsTouch) {
            const spanEl = handEl.firstElementChild;
            if (spanEl && spanEl.textContent !== modeIcon) {
                spanEl.textContent = modeIcon;
            }
            handEl.style.display = "flex";
            handEl.style.transform = `translate3d(${clientX}px, ${clientY}px, 0)`;
        } else {
            handEl.style.display = "none";
        }
        if (svgEl && modeIcon === "🖐️") {
            svgEl.classList.add("is-hand-panning");
            svgEl.style.cursor = "grabbing";
        }
    } else {
        handEl.style.display = "none";
        if (svgEl) {
            svgEl.classList.remove("is-hand-panning");
            svgEl.style.cursor = isMarqueeMode ? "crosshair" : "grab";
        }
    }
}

// 120fps 零重排 (Zero-Reflow) 框选高亮同步：拉框过程中绝不触发 offsetWidth/offsetHeight 布局测量与重绘，仅在选中状态真正改变时切换 CSS 类名！
function syncMarqueeSelectionStyles(nextSelection) {
    let changed = (nextSelection.size !== selectedNodeIds.size);
    if (!changed) {
        for (const id of nextSelection) {
            if (!selectedNodeIds.has(id)) {
                changed = true;
                break;
            }
        }
    }
    if (!changed) return;

    selectedNodeIds = nextSelection;
    selectedLink = null;
    if (nodeElements) {
        nodeElements.each(function(d) {
            const isSel = selectedNodeIds.has(d.id);
            const g = d3.select(this);
            g.classed("multi-selected", isSel);
            g.select(".canvas-note-card").classed("is-selected", isSel);
        });
    }
    updateFloatingActionBarsPosition();
}

function toggleMarqueeMode(forceState) {
    isMarqueeMode = typeof forceState === "boolean" ? forceState : !isMarqueeMode;
    const btn = document.getElementById("btn-marquee");
    if (btn) {
        btn.classList.toggle("active", isMarqueeMode);
        btn.textContent = isMarqueeMode ? "🔳" : "✋";
        btn.title = isMarqueeMode
            ? "当前：🔳 左键直接框选模式（左键拖=框选多卡；右键拖/空格+拖=移动画布；点此切回抓手平移）"
            : "当前：✋ 0ms丝滑抓手模式（左键直接拖=移动画布；按住Shift+拖=框选多卡；点此切换为框选优先）";
    }
    const svgEl = document.getElementById("graph-svg");
    if (svgEl) svgEl.style.cursor = isMarqueeMode ? "crosshair" : "grab";

    if (isMarqueeMode) {
        showToast("🔳 已切为「左键直接框选模式」：左键直接拉=框选 | 右键/空格拖拽=移动画布 (按 B 切换)");
    } else {
        showToast("✋ 已切为「0ms丝滑抓手模式」：左键直接拉=移动画布 | 按住Shift+拖拽=框选 (按 B 切换)");
    }
}

function initMarqueeSelection() {
    if (!svg || !zoomContainer) return;

    const btn = document.getElementById("btn-marquee");
    if (btn) {
        btn.classList.toggle("active", isMarqueeMode);
        btn.textContent = isMarqueeMode ? "🔳" : "✋";
    }
    const svgEl = document.getElementById("graph-svg");
    if (svgEl) svgEl.style.cursor = isMarqueeMode ? "crosshair" : "grab";

    let marqueeBox = zoomContainer.select("#marquee-box");
    if (marqueeBox.empty()) {
        marqueeBox = zoomContainer.append("rect")
            .attr("id", "marquee-box")
            .attr("class", "marquee-box")
            .style("display", "none");
    }

    function clearLongPressTimer() {
        if (longPressPanTimer) {
            clearTimeout(longPressPanTimer);
            longPressPanTimer = null;
        }
    }

    function prepareMarqueeVisibleCache() {
        const nodeMap = new Map(nodes.map(n => [n.id, n]));
        marqueeCachedVisibleNodes = nodes.filter(n => isNodeVisible(n, nodeMap)).map(n => ({
            id: n.id,
            x: Number.isFinite(n.x) ? n.x : 450,
            y: Number.isFinite(n.y) ? n.y : 320,
            halfW: (n._cardW || 120) / 2,
            halfH: (n._cardH || 38) / 2
        }));
    }

    function startCanvasPointerDown(clientX, clientY, rawEvent, isShiftKey, isRightBtn = false, isTouch = false) {
        hideCanvasContextMenu();
        if (isSpacePressed || isInkDrawMode) return;

        const targetEl = rawEvent && rawEvent.target;
        const onNodeOrLink = targetEl && targetEl.closest && (
            targetEl.closest(".node-group") ||
            targetEl.closest(".link") ||
            targetEl.closest(".link-label-group") ||
            targetEl.closest(".link-hit-area") ||
            targetEl.closest("#nav-controls") ||
            targetEl.closest("#io-controls") ||
            targetEl.closest("#hint") ||
            targetEl.closest(".canvas-floating-bar") ||
            targetEl.closest(".canvas-hand-cursor-badge")
        );
        if (onNodeOrLink) return;

        // 如果正在某张卡片内编辑文字，点击空白处先完成并退出卡片编辑
        if (document.activeElement && document.activeElement.isContentEditable && document.activeElement.closest(".canvas-note-card-body")) {
            document.activeElement.blur();
        }

        pointerDownActive = true;
        pointerIsRightButton = isRightBtn;
        pointerIsTouch = isTouch;
        if (isRightBtn) rightDragMoved = false;
        isMarqueeDragging = false;
        isLongPressHandPan = false;
        isLongPressMarqueeReady = false;
        pointerStartClient = { x: clientX, y: clientY };
        pointerLastClient = { x: clientX, y: clientY };
        marqueeStartCoords = d3.pointer(rawEvent, zoomContainer.node());
        marqueeInitialSelectedIds = isShiftKey ? new Set(selectedNodeIds) : new Set();

        clearLongPressTimer();

        // 1. XMind 经典：鼠标右键按住拖动永远是 0ms 抓手平移画布
        if (isRightBtn) {
            return;
        }

        // 2. 按住 Shift / Ctrl / Cmd，或处于 🔳 框选优先模式：0ms 极速拉框多选！
        if (isShiftKey || isMarqueeMode) {
            isLongPressMarqueeReady = true;
            prepareMarqueeVisibleCache();
            return;
        }

        // 3. 默认 ✋ 抓手平移模式（Obsidian Canvas / Miro / OneNote 黄金标准）：
        //    鼠标左键或触屏单指在空白处按住拖动 100% 纯粹平移画布，绝无任何计时器抢夺或意外变成框选！
        //    （如需框选多张卡片，按住 Shift + 左键拖拽，或点击右下角 ✋/🔳 按钮切换框选模式）
    }

    function moveCanvasPointer(clientX, clientY, rawEvent) {
        if (!pointerDownActive || !zoomContainer) return;

        const dx = clientX - pointerLastClient.x;
        const dy = clientY - pointerLastClient.y;
        pointerLastClient = { x: clientX, y: clientY };
        const distFromStart = Math.hypot(clientX - pointerStartClient.x, clientY - pointerStartClient.y);

        // 判定 1：进入 🔳 框选模式？
        // 条件：手势移动 > 3px，且 (按住了Shift / 处于框选优先模式 / 触屏长按350ms就绪)
        if (!isLongPressHandPan && !isMarqueeDragging && isLongPressMarqueeReady && distFromStart > 3) {
            clearLongPressTimer();
            isMarqueeDragging = true;
            if (marqueeCachedVisibleNodes.length === 0) prepareMarqueeVisibleCache();
            showCanvasHandCursor(clientX, clientY, false);
            marqueeBox
                .attr("x", marqueeStartCoords[0])
                .attr("y", marqueeStartCoords[1])
                .attr("width", 0)
                .attr("height", 0)
                .style("display", "block");
        }

        // 判定 2：进入 🖐️ 抓手平移画布？
        // 条件：只要不是框选，手势一动 (>3px) 0ms 零延迟立即锁定抓手平移！
        if (!isMarqueeDragging && !isLongPressHandPan && distFromStart > 3) {
            clearLongPressTimer();
            isLongPressHandPan = true;
            if (pointerIsRightButton && distFromStart > 4) rightDragMoved = true;
            showCanvasHandCursor(clientX, clientY, true, "🖐️");
        }

        // A. 🖐️ 120fps 极速平移画布
        if (isLongPressHandPan) {
            if (pointerIsRightButton && distFromStart > 4) rightDragMoved = true;
            showCanvasHandCursor(clientX, clientY, true, "🖐️");
            const currentTransform = d3.zoomTransform(svg.node());
            const nextTransform = d3.zoomIdentity
                .translate(currentTransform.x + dx, currentTransform.y + dy)
                .scale(currentTransform.k);
            svg.call(zoom.transform, nextTransform);
            return;
        }

        // B. 🔳 120fps 零重排拉框多选
        if (isMarqueeDragging) {
            const currentCoords = d3.pointer(rawEvent, zoomContainer.node());
            const x = Math.min(marqueeStartCoords[0], currentCoords[0]);
            const y = Math.min(marqueeStartCoords[1], currentCoords[1]);
            const w = Math.abs(currentCoords[0] - marqueeStartCoords[0]);
            const h = Math.abs(currentCoords[1] - marqueeStartCoords[1]);

            marqueeBox
                .attr("x", x)
                .attr("y", y)
                .attr("width", w)
                .attr("height", h);

            if (w < 3 && h < 3) return;

            // 120fps 纯数值 AABB 碰撞检测（零 DOM 测量，丝滑不掉帧）
            const nextSelection = new Set(marqueeInitialSelectedIds);
            for (let i = 0; i < marqueeCachedVisibleNodes.length; i++) {
                const n = marqueeCachedVisibleNodes[i];
                if ((n.x + n.halfW >= x) && (n.x - n.halfW <= x + w) &&
                    (n.y + n.halfH >= y) && (n.y - n.halfH <= y + h)) {
                    nextSelection.add(n.id);
                }
            }

            syncMarqueeSelectionStyles(nextSelection);
        }
    }

    function endCanvasPointer(rawEvent, isShiftKey) {
        if (!pointerDownActive) return;
        pointerDownActive = false;
        const wasRightBtn = pointerIsRightButton;
        pointerIsRightButton = false;
        pointerIsTouch = false;
        clearLongPressTimer();
        showCanvasHandCursor(0, 0, false);

        if (isLongPressHandPan) {
            isLongPressHandPan = false;
            return;
        }
        isLongPressMarqueeReady = false;

        const wasMarquee = isMarqueeDragging;
        isMarqueeDragging = false;
        marqueeBox.style("display", "none");

        if (wasRightBtn) return;

        const totalMove = Math.hypot(pointerLastClient.x - pointerStartClient.x, pointerLastClient.y - pointerStartClient.y);

        // 如果只是在画布空白处轻点了一下（未平移也未拉框），则直觉式取消所有选中状态，并记录该点坐标供直接敲键盘打字建卡（同 OneNote）！
        if (!wasMarquee && totalMove < 6 && !isShiftKey) {
            if (rawEvent) {
                const currentCoords = d3.pointer(rawEvent, zoomContainer.node());
                if (currentCoords && Number.isFinite(currentCoords[0]) && Number.isFinite(currentCoords[1])) {
                    lastCanvasMouseCoords = { x: currentCoords[0], y: currentCoords[1] };
                }
            }
            selectedNodeIds.clear();
            selectedNode = null;
            selectedLink = null;
            refreshNodeStyles();
            renderEditor();
            updateFloatingActionBarsPosition();
            return;
        }

        if (selectedNodeIds.size > 0) {
            const firstId = Array.from(selectedNodeIds)[0];
            const target = nodes.find(n => n.id === firstId);
            if (target) {
                selectedNode = target;
                renderEditor();
            }
        }
        refreshNodeStyles();
        updateFloatingActionBarsPosition();
    }

    // 1. 鼠标左键 & 右键事件绑定（带触屏合成鼠标事件防重入保护）
    let lastTouchActiveMs = 0;

    svg.on("mousedown.marquee", (event) => {
        if (Date.now() - lastTouchActiveMs < 500) return;
        if (event.button !== 0 && event.button !== 2) return;
        const isShiftKey = !!(event.shiftKey || event.ctrlKey || event.metaKey);
        startCanvasPointerDown(event.clientX, event.clientY, event, isShiftKey, event.button === 2, false);
    });

    if (window._flownotesMarqueeMoveHandler) {
        window.removeEventListener("mousemove", window._flownotesMarqueeMoveHandler);
    }
    if (window._flownotesMarqueeUpHandler) {
        window.removeEventListener("mouseup", window._flownotesMarqueeUpHandler);
    }

    window._flownotesMarqueeMoveHandler = (event) => {
        if (Date.now() - lastTouchActiveMs < 500) return;
        moveCanvasPointer(event.clientX, event.clientY, event);
    };
    window.addEventListener("mousemove", window._flownotesMarqueeMoveHandler);

    window._flownotesMarqueeUpHandler = (event) => {
        if (Date.now() - lastTouchActiveMs < 500) return;
        const isShiftKey = !!(event.shiftKey || event.ctrlKey || event.metaKey);
        endCanvasPointer(event, isShiftKey);
    };
    window.addEventListener("mouseup", window._flownotesMarqueeUpHandler);

    // 2. 触屏单指事件绑定（单指直接滑=移动画布，双指捏合由 d3.zoom 缩放，长按或切🔳模式拉框）
    svg.on("touchstart.longpressPan", (event) => {
        lastTouchActiveMs = Date.now();
        if (!event.touches) return;
        if (event.touches.length >= 2) {
            // 双指触控：立即取消单指状态，交给 d3.zoom 处理双指缩放与平移
            pointerDownActive = false;
            isMarqueeDragging = false;
            isLongPressHandPan = false;
            clearLongPressTimer();
            marqueeBox.style("display", "none");
            showCanvasHandCursor(0, 0, false);
            return;
        }
        if (event.touches.length === 1) {
            const t = event.touches[0];
            startCanvasPointerDown(t.clientX, t.clientY, t, false, false, true);
        }
    });

    svg.on("touchmove.longpressPan", (event) => {
        lastTouchActiveMs = Date.now();
        if (!pointerDownActive || !event.touches || event.touches.length !== 1) return;
        const t = event.touches[0];
        moveCanvasPointer(t.clientX, t.clientY, t);
    });

    svg.on("touchend.longpressPan touchcancel.longpressPan", (event) => {
        lastTouchActiveMs = Date.now();
        const t = (event.changedTouches && event.changedTouches[0]) ? event.changedTouches[0] : null;
        endCanvasPointer(t, false);
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

    // 防重叠倒刺：当两张卡片紧贴或重叠导致起点越过终点时，收缩至中点避免出现悬空反向短箭头
    if ((endPt.x - startPt.x) * dx + (endPt.y - startPt.y) * dy <= 0) {
        const mx = (sxCenter + txCenter) / 2;
        const my = (syCenter + tyCenter) / 2;
        return { sx: mx, sy: my, tx: mx, ty: my };
    }

    return { sx: startPt.x, sy: startPt.y, tx: endPt.x, ty: endPt.y };
}

function renderPositions() {
    if (!linkElements || !nodeElements) return;
    nodeElements
        .attr("transform", d => `translate(${Number.isFinite(d.x) ? d.x : 450},${Number.isFinite(d.y) ? d.y : 320})`);
    linkElements.each(function(d) {
        const c = getLinkCoords(d);
        const isOverlapped = Math.hypot(c.tx - c.sx, c.ty - c.sy) < 2;
        d3.select(this)
            .attr("x1", c.sx)
            .attr("y1", c.sy)
            .attr("x2", c.tx)
            .attr("y2", c.ty)
            .style("visibility", isOverlapped ? "hidden" : "visible");
    });
    if (linkLabelElements) {
        linkLabelElements.each(function(d) {
            const c = getLinkCoords(d);
            const mx = (c.sx + c.tx) / 2;
            const my = (c.sy + c.ty) / 2;
            d3.select(this).attr("transform", `translate(${mx},${my})`);
        });
    }
}

// v3.5.4 颜色格式标准化辅助函数：统一将 rgb(r, g, b) 转换为十六进制字符串 #rrggbb
function stripFormattingToPlainText(text) {
    if (!text) return "";
    return text
        .replace(/<[^>]+>/g, "")
        .replace(/==([^=]+)==/g, "$1")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/\*([^*]+)\*/g, "$1")
        .replace(/~~([^~]+)~~/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .trim();
}

function rgbToHex(color) {
    if (!color) return "#ef4444";
    if (color.startsWith("#")) return color;
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (match) {
        const r = parseInt(match[1], 10).toString(16).padStart(2, "0");
        const g = parseInt(match[2], 10).toString(16).padStart(2, "0");
        const b = parseInt(match[3], 10).toString(16).padStart(2, "0");
        return `#${r}${g}${b}`;
    }
    return color;
}

// v3.5.4 卡片标题富文本序列化器：将编辑区 DOM 节点精确序列化为支持行内颜色、高亮、加粗、手写体的轻量 Markdown/HTML 标记
function serializeCardLabelFromHTML(html) {
    if (!html) return "未命名";
    const temp = document.createElement("div");
    temp.innerHTML = html;

    function serializeInline(node) {
        if (node.nodeType === 3) {
            return node.textContent;
        }
        if (node.nodeType === 1) {
            const tag = node.tagName.toLowerCase();
            if (tag === "br") return "\n";
            const inner = Array.from(node.childNodes).map(serializeInline).join("");

            if (tag === "b" || tag === "strong") return `**${inner}**`;
            if (tag === "i" || tag === "em") return `*${inner}*`;
            if (tag === "u") return `<u>${inner}</u>`;
            if (tag === "s" || tag === "del" || tag === "strike") return `~~${inner}~~`;
            if (tag === "code") return `\`${inner}\``;
            if (tag === "mark") return `==${inner}==`;

            // 背景荧光高亮 (hiliteColor / backColor)
            if (node.style && node.style.backgroundColor) {
                const bg = node.style.backgroundColor.toLowerCase();
                if (bg && bg !== "transparent" && bg !== "inherit" && !bg.includes("rgba(0, 0, 0, 0)")) {
                    return `==${inner}==`;
                }
            }

            // 字体标色
            let color = "";
            if (tag === "font" && node.color) {
                color = node.color;
            } else if (node.style && node.style.color) {
                color = node.style.color;
            }
            if (color) {
                const hexColor = rgbToHex(color);
                return `<span style="color:${hexColor}">${inner}</span>`;
            }

            // 手写批注字体
            if (tag === "span" && node.classList && node.classList.contains("font-handwriting")) {
                return `<span class="font-handwriting">${inner}</span>`;
            }

            return inner;
        }
        return "";
    }

    const lines = Array.from(temp.childNodes).map(serializeInline).join("").split("\n").map(s => s.trim()).filter(Boolean);
    const firstLine = lines[0] || "未命名";
    return firstLine.replace(/^\[[ xX]\]\s*/, "") || "未命名";
}

// v3.5.1 卡片标题专用富文本渲染器：仅渲染行内加粗、斜体、手写体、颜色与复选框，绝不自动转为 <ol> 列表，保证 1.、2.、4. 等数字序号原汁原味！
function renderCardLabelHTML(text) {
    if (!text) return "";
    let cleaned = cleanHTMLSpill(text);

    let protectedText = cleaned
        .replace(/<span class=["']font-handwriting["']>/gi, '___HANDWRITING_START___')
        .replace(/<span style=["']color:\s*([^"'>]+)["']?>/gi, '___SPAN_START_$1___')
        .replace(/<\/span>/gi, '___SPAN_END___')
        .replace(/<u>/gi, '___U_START___')
        .replace(/<\/u>/gi, '___U_END___');

    let html = escapeHTML(protectedText);

    // 检查 To-Do 复选框 - [ ] / - [x] / [ ] / [x]
    const taskMatch = /^[ \t]*(?:[•·▪⁃‣\-\*][ \t]+)?\[([ xX])\][ \t]+(.*)/.exec(html);
    if (taskMatch) {
        const checked = taskMatch[1].toLowerCase() === "x";
        html = `<input type="checkbox" class="canvas-todo-checkbox" data-task-index="0" ${checked ? "checked" : ""}><span class="task-item-text">${taskMatch[2]}</span>`;
    }

    html = html
        .replace(/___HANDWRITING_START___/g, '<span class="font-handwriting">')
        .replace(/___SPAN_START_(.*?)___/g, '<span style="color:$1">')
        .replace(/___SPAN_END___/g, '</span>')
        .replace(/___U_START___/g, '<u>')
        .replace(/___U_END___/g, '</u>');

    html = html
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/~~([^~]+)~~/g, '<del>$1</del>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/==([^=]+)==/g, '<mark>$1</mark>');

    return html;
}

// v3.5.5 表格双工作区引擎：从卡片内容中提取 Markdown 表格并渲染为交互式表格 HTML
function extractTableHTMLFromContent(content) {
    if (!content || !content.includes("|")) return "";
    if (!/\|[ \t]*:?---+:?[ \t]*\|/.test(content)) return "";
    const fullHtml = renderMarkdownToHTML(content);
    const match = fullHtml.match(/<table class="canvas-card-table">[\s\S]*?<\/table>/gi);
    if (match && match.length > 0) {
        return match.join("<br>");
    }
    return "";
}

// v3.5.5 表格变更双向同步：无论在画布卡片还是右侧详细笔记触发表格增删行列，双向平滑同步
function syncNodeContentFromTableChange(targetNode, targetTable) {
    if (!targetNode || !targetTable) return;
    const richEditorEl = document.getElementById("rich-editor");
    const mdTextarea = document.getElementById("md-textarea");
    if (targetTable.closest("#rich-editor") && richEditorEl) {
        targetNode.content = htmlToSafeMarkdown(richEditorEl.innerHTML).trim();
        if (mdTextarea) mdTextarea.value = targetNode.content;
    } else {
        const bodyEl = targetTable.closest(".canvas-note-card-body") || document.querySelector(`.node-card-body[data-node-id="${targetNode.id}"]`);
        if (bodyEl) {
            const tableWrap = bodyEl.querySelector(".canvas-card-table-wrap") || bodyEl.querySelector("table.canvas-card-table") || targetTable;
            const tableMd = htmlToSafeMarkdown(tableWrap.matches("table") ? tableWrap.outerHTML : tableWrap.innerHTML);
            const otherNotes = (targetNode.content || "")
                .replace(/\|[^\n]+\|/g, "")
                .replace(/^[ \t]*:?---+:?[ \t]*$/gm, "")
                .replace(/^#{1,4}\s+[^\n]*/gm, "")
                .trim();
            targetNode.content = `# ${stripFormattingToPlainText(targetNode.label)}\n\n${tableMd}` + (otherNotes ? `\n\n${otherNotes}` : "");
            if (mdTextarea) mdTextarea.value = targetNode.content;
            if (richEditorEl && document.activeElement !== richEditorEl) {
                richEditorEl.innerHTML = renderMarkdownToHTML(targetNode.content);
            }
        }
    }
}

// v3.5.7 真实意图详细笔记判定引擎：仅当用户真正展开详细笔记并在其中撰写了有价值的正文时，才显示 📝 图标！
function hasDetailedNote(d) {
    if (!d || !d.content || typeof d.content !== "string") return false;
    const raw = d.content.trim();
    if (!raw) return false;
    if (raw.includes("点击编辑 Markdown 内容...")) return false;

    // 获取卡片的纯文本标题
    const plainTitle = stripFormattingToPlainText(d.label || "").trim();

    // 默认系统占位符正则 (如 新分支 1, 同级卡片 2, 新笔记 3, 父级节点, 过渡节点 等)
    const isPlaceholderRegex = /^(新分支|同级卡片|新笔记|父级节点|过渡节点)\s*\d*$/;
    if (isPlaceholderRegex.test(plainTitle)) {
        const cleanContent = raw.replace(/^#{1,4}\s+/, "").trim();
        if (isPlaceholderRegex.test(cleanContent) || !cleanContent) return false;
    }

    // 剔除 Markdown 表格（表格已在画布卡片直接呈现）
    let text = raw
        .replace(/\|[^\n]+\|/g, "")
        .replace(/^[ \t]*:?---+:?[ \t]*$/gm, "");

    // 逐行分析非表格内容
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return false;

    // 第一行如果是标题（带 # 或不带 #，或者等于 plainTitle），将其剔除
    const firstLine = lines[0].replace(/^#{1,4}\s+/, "").trim();
    const firstLinePlain = stripFormattingToPlainText(firstLine);

    let remainingLines = [];
    if (firstLinePlain === plainTitle || firstLine === plainTitle || (plainTitle && firstLinePlain.includes(plainTitle)) || (firstLinePlain && plainTitle.includes(firstLinePlain))) {
        remainingLines = lines.slice(1);
    } else if (lines.length === 1) {
        // 只有 1 行内容：这行本身就是卡片标题或单句，用户根本没在右侧写后续正文！
        return false;
    } else {
        remainingLines = lines.slice(1);
    }

    // 检查剩余段落
    const remainingText = remainingLines
        .map(l => l.replace(/^#{1,4}\s+/, "").trim())
        .filter(l => l && !l.includes("点击编辑 Markdown 内容...") && !isPlaceholderRegex.test(l))
        .join(" ")
        .trim();

    // 只有在剩余的详细笔记正文中真正有内容（字数 > 5）时，才视为有详细笔记
    return remainingText.length > 5;
}

// 生成画布卡片内部直接显示的 HTML (v3.5.1 核心规范：画布卡片严格只显示标题 d.label，长篇详细笔记点进右侧面板呈现)
function getCardDisplayHTML(d) {
    if (!d) return "";
    if (d.isImage && d.imageUrl) {
        const caption = (d.label && !d.label.startsWith("📸 截图")) ? `<div class="canvas-card-caption">${renderCardLabelHTML(d.label)}</div>` : "";
        return `<img class="canvas-card-img" src="${d.imageUrl}" alt="截图" draggable="false" />${caption}`;
    }

    // v3.5.6 高保真标题提取：优先保留 d.label 中的格式；若 d.label 是纯文本而 d.content 首行包含格式化颜色或强调，智能恢复首行色彩
    let rawTitle = (d.label || "").trim();
    const labelHasStyle = rawTitle.includes("<span") || rawTitle.includes("<font") || rawTitle.includes("<mark") || rawTitle.includes("==") || rawTitle.includes("**");
    
    if (d.content && typeof d.content === "string") {
        const firstLine = d.content.split("\n")[0].replace(/^#{1,4}\s+/, "").trim();
        const firstLineHasStyle = firstLine.includes("<span") || firstLine.includes("<font") || firstLine.includes("<mark") || firstLine.includes("==") || firstLine.includes("**");
        if (!labelHasStyle && firstLineHasStyle) {
            rawTitle = firstLine;
        } else {
            // v3.5.8 若 d.label 被截断而 d.content 首行更完整，自动取更完整的首行作为卡片标题
            const plainRaw = stripFormattingToPlainText(rawTitle);
            const plainFirst = stripFormattingToPlainText(firstLine);
            if (plainFirst.startsWith(plainRaw) && plainFirst.length > plainRaw.length) {
                rawTitle = firstLine;
            }
        }
    }
    if (!rawTitle) rawTitle = "未命名";

    const titleHTML = renderCardLabelHTML(rawTitle);
    const tableHTML = extractTableHTMLFromContent(d.content);

    const noteBadge = hasDetailedNote(d)
        ? `<span class="card-has-note-badge" title="📝 包含详细笔记 (点击选中并在右侧查看)">📝</span>`
        : "";

    if (tableHTML) {
        return `<div class="canvas-card-title-row"><span>${titleHTML}</span>${noteBadge}</div><div class="canvas-card-table-wrap">${tableHTML}</div>`;
    }

    return `${titleHTML}${noteBadge}`;
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
                const quickTagMap = {
                    question: '<span class="card-quick-tag-badge tag-question" title="OneNote 存疑问题标签 (Ctrl+3)">❓存疑</span>',
                    idea: '<span class="card-quick-tag-badge tag-idea" title="OneNote 关键灵感标签 (Ctrl+4)">💡灵感</span>',
                    done: '<span class="card-quick-tag-badge tag-done" title="OneNote 已验证结论标签 (Ctrl+5)">✅已验证</span>'
                };
                const qTagHTML = (d.quickTag && quickTagMap[d.quickTag]) ? quickTagMap[d.quickTag] : "";
                const targetHTML = (isFocus ? '<span class="card-focus-star">⭐ </span>' : '') + qTagHTML + getCardDisplayHTML(d);
                if (bodyNode.innerHTML !== targetHTML) {
                    bodyNode.innerHTML = targetHTML;
                }
            }

            // v3.5.8 自然包裹自适应排版：仅当用户显式拖拽缩放 (d._userResized) 或图片卡片时才应用固定 customWidth；否则回归 max-content 贴紧文字
            const hasCustomW = (!!d._userResized || !!d.isImage) && typeof d.customWidth === "number" && Number.isFinite(d.customWidth) && d.customWidth >= 36;
            const hasCustomH = (!!d._userResized || !!d.isImage || !!d._manualHeight) && typeof d.customHeight === "number" && Number.isFinite(d.customHeight) && d.customHeight >= 24;
            const hasCustomFont = typeof d.customFontSize === "number" && Number.isFinite(d.customFontSize) && d.customFontSize >= 8;

            // 关键修复 1：确保所有 8 向缩放手柄 (.card-resize-handle) 实时绑定当前最新的节点数据引用 d，杜绝 IDB 恢复或撤销后引用脱离导致拉动失效！
            cardDiv.selectAll(".card-resize-handle").datum(d);

            // 关键修复 2：先放开 foreignObject 容器宽度，避免旧窄宽度锁死内部 inline-block 卡片的扩展与重排测量
            fo.attr("width", hasCustomW ? Math.max(120, d.customWidth + 32) : 980)
              .attr("height", 920);

            bodyDiv
                .style("font-size", hasCustomFont ? `${d.customFontSize}px` : null)
                .style("line-height", hasCustomFont ? "1.45" : null)
                .style("font-weight", d.isBold ? "700" : null)
                .style("font-style", d.isItalic ? "italic" : null)
                .style("text-decoration", d.isUnderline ? "underline" : (d.isStrike ? "line-through" : null))
                .style("color", d.textColor || null);

            cardDiv
                .classed("is-root", d.parentId === null)
                .classed("is-selected", isSelected)
                .classed("is-focus", isFocus)
                .classed("is-image-card", !!(d.isImage && d.imageUrl))
                .classed("is-handwriting", d.fontStyle === "handwriting")
                .classed("is-card-bold", !!d.isBold)
                .classed("is-card-italic", !!d.isItalic)
                .classed("is-card-underline", !!d.isUnderline)
                .classed("is-card-strike", !!d.isStrike)
                .classed("is-card-highlight", !!d.isHighlight)
                .classed("has-custom-width", hasCustomW)
                .classed("has-custom-height", hasCustomH)
                .classed("has-custom-font", hasCustomFont)
                .attr("data-card-bg", d.cardBgColor || null)
                .style("width", hasCustomW ? `${d.customWidth}px` : "max-content")
                .style("max-width", hasCustomW ? "none" : "520px")
                .style("min-height", hasCustomH ? `${d.customHeight}px` : null)
                .style("--card-accent", borderColor);

            // 测量卡片实际宽高，缓存到 d._cardW / d._cardH 供矩形边缘箭头交点算法与碰撞避让使用
            const cardEl = cardDiv.node();
            const measuredW = Math.max(36, Math.min(980, (cardEl ? cardEl.offsetWidth : 130) || 130));
            const measuredH = Math.max(24, Math.min(860, (cardEl ? cardEl.offsetHeight : 34) || 34));
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
                .attr("transform", `translate(${halfW + 20}, ${-Math.min(halfH - 4, 10)})`);
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

        // 右侧 + 一键建子卡按钮与 ➔ 拖拽连线手柄 (留出充足间距，绝不遮挡 .handle-e 右侧缩放拉动手柄)
        const quickAdd = group.select(".node-quick-add-btn");
        if (!quickAdd.empty()) {
            quickAdd.attr("transform", `translate(${halfW + 20}, ${descCount > 0 ? 4 : -9})`);
        }
        const port = group.select(".node-connect-port");
        if (!port.empty()) {
            port.attr("transform", `translate(${halfW + 20}, ${descCount > 0 ? 21 : 9})`);
        }

        group.classed("multi-selected", isSelected);
        group.classed("is-focus-node", isFocus);
        group.classed("is-collapsed", !!d.collapsed);

        // 关键修复：在自由白板模式 (layoutMode === "free") 下仿真器处于 stop 状态，必须同步把每个卡片 <g> 定位到 (d.x, d.y)，防止卡片留在 (0,0) 而只剩箭头悬空！
        const nx = Number.isFinite(d.x) ? d.x : 450;
        const ny = Number.isFinite(d.y) ? d.y : 320;
        group.attr("transform", `translate(${nx},${ny})`);
    });

    // 卡片尺寸变化后同步刷新箭头端点与关系词位置
    if (linkElements) {
        linkElements.each(function(d) {
            const c = getLinkCoords(d);
            const isOverlapped = Math.hypot(c.tx - c.sx, c.ty - c.sy) < 2;
            d3.select(this)
                .attr("x1", c.sx)
                .attr("y1", c.sy)
                .attr("x2", c.tx)
                .attr("y2", c.ty)
                .style("visibility", isOverlapped ? "hidden" : "visible");
        });
    }
    if (linkLabelElements) {
        linkLabelElements.each(function(d) {
            const c = getLinkCoords(d);
            d3.select(this).attr("transform", `translate(${(c.sx + c.tx) / 2},${(c.sy + c.ty) / 2})`);
        });
    }
}

// 在画布卡片上直接原地编辑文字与划词标红/标绿/高亮（无需跳转弹窗）
function startInlineCardEditById(nodeId, selectAll = false, cursorAtEnd = false, initialAppendChar = "") {
    if (!nodeElements) return;
    nodeElements.filter(d => d.id === nodeId).each(function(d) {
        startInlineCardEdit(d, this, selectAll, cursorAtEnd, initialAppendChar);
    });
}

function startInlineCardEdit(d, groupEl, selectAll = false, cursorAtEnd = false, initialAppendChar = "") {
    if (!d || !groupEl) return;
    if (d.isImage && d.imageUrl) {
        openImageLightbox(d);
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

    // 载入可编辑内容 (v3.5.5: 若卡片包含表格，在画布上同步呈现表格与标题，供双向交互编辑)
    let raw = (d.label || "").trim() || "未命名";
    if (initialAppendChar) {
        const isDefaultPlaceholder = /^(新分支|同级卡片|新笔记|父级节点|过渡节点)\s*\d*$/.test(raw.trim());
        raw = isDefaultPlaceholder ? initialAppendChar : (raw + initialAppendChar);
        d.label = raw;
    }
    const inlineTableHTML = extractTableHTMLFromContent(d.content);
    if (inlineTableHTML) {
        bodyEl.innerHTML = `<div class="canvas-card-title-row"><span>${renderCardLabelHTML(raw)}</span></div><div class="canvas-card-table-wrap">${inlineTableHTML}</div>`;
    } else {
        bodyEl.innerHTML = renderCardLabelHTML(raw);
    }
    bodyEl.setAttribute("contenteditable", "true");
    cardDiv.classed("is-editing", true);
    bodyEl.focus();

    const titleEl = bodyEl.querySelector(".canvas-card-title-row span") || bodyEl;
    if (selectAll && !initialAppendChar) {
        const range = document.createRange();
        range.selectNodeContents(titleEl);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    } else if (cursorAtEnd || initialAppendChar) {
        const range = document.createRange();
        range.selectNodeContents(titleEl);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }

    const syncFromInlineCard = () => {
        // v3.5.5 双工作区表格引擎：若卡片含有表格，提取标题与表格分别同步
        const tableWrap = bodyEl.querySelector(".canvas-card-table-wrap") || bodyEl.querySelector("table.canvas-card-table");
        const titleRow = bodyEl.querySelector(".canvas-card-title-row");

        if (tableWrap) {
            let titleSourceHtml = "";
            if (titleRow) {
                titleSourceHtml = titleRow.innerHTML;
            } else {
                const clone = bodyEl.cloneNode(true);
                clone.querySelectorAll(".canvas-card-table-wrap, table.canvas-card-table").forEach(el => el.remove());
                titleSourceHtml = clone.innerHTML;
            }
            d.label = serializeCardLabelFromHTML(titleSourceHtml);
            const tableNode = tableWrap.matches("table.canvas-card-table") ? tableWrap : (tableWrap.querySelector("table.canvas-card-table") || tableWrap);
            const tableMd = htmlToSafeMarkdown(tableNode.outerHTML || tableWrap.innerHTML || "");
            
            // 保留原有除表格外的长篇详细笔记
            const otherNotes = (d.content || "")
                .replace(/\|[^\n]+\|/g, "")
                .replace(/^[ \t]*:?---+:?[ \t]*$/gm, "")
                .replace(/^#{1,4}\s+[^\n]*/gm, "")
                .trim();
            d.content = `# ${stripFormattingToPlainText(d.label)}\n\n${tableMd}` + (otherNotes ? `\n\n${otherNotes}` : "");
        } else {
            d.label = serializeCardLabelFromHTML(bodyEl.innerHTML);
            const isPlaceholder = /^(新分支|同级卡片|新笔记|父级节点|过渡节点)\s*\d*$/.test(d.content ? d.content.trim() : "");
            const isContentEmpty = !d.content || 
                !d.content.trim() || 
                d.content.includes("点击编辑 Markdown 内容...") ||
                isPlaceholder ||
                d.content.trim() === d.label.trim() ||
                d.content.trim() === `# ${d.label.trim()}`;
            if (isContentEmpty) {
                d.content = `# ${d.label}\n\n`;
            }
        }

        const titleInput = document.getElementById("title-input");
        const mdTextarea = document.getElementById("md-textarea");
        const richEditor = document.getElementById("rich-editor");
        if (selectedNode && selectedNode.id === d.id) {
            if (titleInput) titleInput.value = stripFormattingToPlainText(d.label);
            if (tableWrap || (!d.content || !d.content.trim() || d.content.includes("点击编辑 Markdown 内容..."))) {
                if (mdTextarea) mdTextarea.value = d.content;
                if (richEditor && document.activeElement !== richEditor) {
                    richEditor.innerHTML = renderMarkdownToHTML(d.content);
                }
            }
        }
        // 更新卡片自适应宽高与连线端点，并在输入增长触碰邻卡时按 OneNote 直觉自动轻微避让
        const cardEl = cardDiv.node();
        if (cardEl) {
            const foSel = group.select(".node-card-fo");
            const hasCW = (!!d._userResized || !!d.isImage) && typeof d.customWidth === "number" && Number.isFinite(d.customWidth) && d.customWidth >= 36;
            foSel.attr("width", hasCW ? Math.max(120, d.customWidth + 32) : 980).attr("height", 920);
            d._cardW = Math.max(36, Math.min(980, cardEl.offsetWidth || 130));
            d._cardH = Math.max(24, Math.min(860, cardEl.offsetHeight || 34));
            const foW = d._cardW + 20;
            const foH = d._cardH + 20;
            foSel
                .attr("width", foW)
                .attr("height", foH)
                .attr("x", -foW / 2)
                .attr("y", -foH / 2);
            applyOneNoteResizeNudge(d, "e");
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

        const activeSel = window.getSelection();
        const activeCell = activeSel && activeSel.anchorNode
            ? (activeSel.anchorNode.nodeType === 1 ? activeSel.anchorNode : activeSel.anchorNode.parentElement)?.closest("td, th")
            : null;

        // OneNote 招牌表格交互 1: Tab / Shift+Tab 单元格跳转与末尾自动加行
        if (e.key === "Tab") {
            if (activeCell) {
                e.preventDefault();
                const activeTr = activeCell.closest("tr");
                const activeTable = activeTr ? activeTr.closest("table") : null;
                if (activeTable) {
                    const allCells = Array.from(activeTable.querySelectorAll("th, td"));
                    const currIdx = allCells.indexOf(activeCell);
                    if (e.shiftKey) {
                        const prevCell = allCells[currIdx - 1];
                        if (prevCell) {
                            const r = document.createRange();
                            r.selectNodeContents(prevCell);
                            activeSel.removeAllRanges();
                            activeSel.addRange(r);
                        }
                    } else {
                        if (currIdx < allCells.length - 1) {
                            const nextCell = allCells[currIdx + 1];
                            if (nextCell) {
                                const r = document.createRange();
                                r.selectNodeContents(nextCell);
                                activeSel.removeAllRanges();
                                activeSel.addRange(r);
                            }
                        } else {
                            // 位于整个表格最后一个单元格：按 OneNote 黄金体验自动在末尾追加新行！
                            const colCount = activeTr.children.length || 2;
                            const newTr = document.createElement("tr");
                            for (let c = 0; c < colCount; c++) {
                                const newTd = document.createElement("td");
                                newTd.innerHTML = "<br>";
                                newTr.appendChild(newTd);
                            }
                            const tbody = activeTable.querySelector("tbody") || activeTable;
                            tbody.appendChild(newTr);
                            syncFromInlineCard();
                            const firstCell = newTr.firstElementChild;
                            if (firstCell) {
                                const r = document.createRange();
                                r.selectNodeContents(firstCell);
                                r.collapse(true);
                                activeSel.removeAllRanges();
                                activeSel.addRange(r);
                            }
                        }
                    }
                    return;
                }
            }

            e.preventDefault();
            bodyEl.blur();
            if (e.shiftKey) promoteSelectedNode();
            else createChildNode();
            return;
        }

        // OneNote 招牌表格交互 2: 在单元格内按 Enter 自动在下方插入新行并对齐当前列
        if (e.key === "Enter" && !e.isComposing && !isImeComposing) {
            if (activeCell) {
                if (e.altKey || e.shiftKey) {
                    e.preventDefault();
                    document.execCommand("insertLineBreak");
                    syncFromInlineCard();
                    return;
                }
                e.preventDefault();
                const activeTr = activeCell.closest("tr");
                const colIdx = Array.from(activeTr.children).indexOf(activeCell);
                const colCount = activeTr.children.length;
                const newTr = document.createElement("tr");
                for (let c = 0; c < colCount; c++) {
                    const newTd = document.createElement("td");
                    newTd.innerHTML = "<br>";
                    newTr.appendChild(newTd);
                }
                activeTr.parentNode.insertBefore(newTr, activeTr.nextSibling);
                syncFromInlineCard();
                const targetCell = newTr.children[Math.min(colIdx, colCount - 1)] || newTr.firstElementChild;
                if (targetCell) {
                    const r = document.createRange();
                    r.selectNodeContents(targetCell);
                    r.collapse(true);
                    activeSel.removeAllRanges();
                    activeSel.addRange(r);
                }
                return;
            }

            if (e.altKey) {
                // XMind 经典：卡片内按 Alt + Enter 插入换行
                e.preventDefault();
                document.execCommand("insertLineBreak");
                syncFromInlineCard();
                return;
            }
            if (!e.shiftKey) {
                e.preventDefault();
                bodyEl.blur();
                return;
            }
        }

        // OneNote 招牌快捷键: Alt+T 极速插入表格
        if (e.altKey && (e.key === "t" || e.key === "T" || e.code === "KeyT")) {
            e.preventDefault();
            applyFormatting("table");
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
            } else if (e.key === "W" || e.code === "KeyW") {
                e.preventDefault();
                applyFormatting("handwriting");
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
        .attr("class", d => {
            const isSel = selectedLink && linkDataKey(selectedLink) === linkDataKey(d);
            return (d.type === "relation" ? "link relation-link" : "link") + (isSel ? " link-selected" : "");
        })
        .attr("marker-end", d => d.type === "relation" ? "url(#arrow-marker-relation)" : "url(#arrow-marker)")
        .style("stroke", d => (selectedLink && linkDataKey(selectedLink) === linkDataKey(d)) ? "#38bdf8" : getLinkColor(d))
        .style("opacity", d => d.type === "relation" ? 0.8 : 0.92)
        .style("cursor", "pointer")
        .on("click", (event, d) => {
            event.stopPropagation();
            hideCanvasContextMenu();
            selectedLink = d;
            selectedNodeIds.clear();
            selectedNode = null;
            refreshNodeStyles();
            updateD3Graph();
            updateFloatingActionBarsPosition();
        })
        .on("dblclick", (event, d) => {
            event.stopPropagation();
            hideCanvasContextMenu();
            selectedLink = d;
            selectedNodeIds.clear();
            selectedNode = null;
            refreshNodeStyles();
            updateD3Graph();
            updateFloatingActionBarsPosition();
            promptEditSelectedLinkLabel();
        })
        .on("contextmenu", (event, d) => {
            event.preventDefault();
            event.stopPropagation();
            selectedLink = d;
            selectedNodeIds.clear();
            refreshNodeStyles();
            updateD3Graph();
            updateFloatingActionBarsPosition();
        });

    // 渲染箭头中央的关系词胶囊标签 (.link-label-group)
    const labeledLinks = visibleLinks.filter(l => l.label && String(l.label).trim().length > 0);
    if (linkLabelElements) {
        linkLabelElements = linkLabelElements.data(labeledLinks, linkDataKey).join(
            enter => {
                const lg = enter.append("g")
                    .attr("class", "link-label-group")
                    .on("click", (event, d) => {
                        event.stopPropagation();
                        hideCanvasContextMenu();
                        selectedLink = d;
                        selectedNodeIds.clear();
                        selectedNode = null;
                        refreshNodeStyles();
                        updateD3Graph();
                        updateFloatingActionBarsPosition();
                    })
                    .on("dblclick", (event, d) => {
                        event.stopPropagation();
                        selectedLink = d;
                        promptEditSelectedLinkLabel();
                    });
                lg.append("rect").attr("class", "link-label-bg");
                lg.append("text").attr("class", "link-label-text").attr("text-anchor", "middle").attr("dy", "3.8px");
                return lg;
            },
            update => update
        );

        linkLabelElements.each(function(d) {
            const lg = d3.select(this);
            const isSel = selectedLink && linkDataKey(selectedLink) === linkDataKey(d);
            lg.classed("is-selected", !!isSel);
            const txt = String(d.label || "").trim();
            const textEl = lg.select(".link-label-text").text(txt);
            const approxW = Math.max(32, txt.length * 12 + 16);
            const approxH = 20;
            lg.select(".link-label-bg")
                .attr("width", approxW)
                .attr("height", approxH)
                .attr("x", -approxW / 2)
                .attr("y", -approxH / 2);
            const c = getLinkCoords(d);
            lg.attr("transform", `translate(${(c.sx + c.tx) / 2},${(c.sy + c.ty) / 2})`);
        });
    }

    nodeElements = nodeElements.data(visibleNodes, d => d.id).join(
        enter => {
            const g = enter.append("g").attr("class", "node-group")
                .call(d3.drag()
                    .filter(event => {
                        if (event.target.closest && (
                            event.target.closest('[contenteditable="true"]') ||
                            event.target.closest('.node-connect-port') ||
                            event.target.closest('.node-quick-add-btn') ||
                            event.target.closest('.node-fold-badge') ||
                            event.target.closest('.card-resize-handle') ||
                            event.target.closest('.canvas-todo-checkbox')
                        )) {
                            return false;
                        }
                        return !event.button;
                    })
                    .on("start", dragstarted)
                    .on("drag", dragged)
                    .on("end", dragended))
                .on("click", (event, d) => {
                    event.stopPropagation();
                    hideCanvasContextMenu();
                    if (event.target.closest && event.target.closest('[contenteditable="true"]')) return;
                    if (d._dragMoved) return; // 刚刚发生过拖拽位移，不当作点击处理

                    selectedLink = null;

                    // 支持 Shift+Click、Ctrl/Cmd+Click 或开启“☑️多选”按钮模式点选多个节点
                    if (event.shiftKey || event.ctrlKey || event.metaKey || isTouchMultiSelectMode) {
                        if (selectedNodeIds.has(d.id)) {
                            selectedNodeIds.delete(d.id);
                        } else {
                            selectedNodeIds.add(d.id);
                        }
                        selectedNode = d;
                        refreshNodeStyles();
                        renderEditor();
                        updateFloatingActionBarsPosition();
                        return;
                    }

                    // 直觉式交互（同 OneNote / PPT）：如果这张卡片此前已经是唯一选中状态，再次单击它直接进入原地文字编辑/划词标色！
                    if (d._wasSingleSelectedBeforeMousedown) {
                        startInlineCardEdit(d, event.currentTarget, false);
                        return;
                    }

                    selectedNode = d;
                    selectedNodeIds = new Set([d.id]);
                    refreshNodeStyles();
                    renderEditor();
                    updateFloatingActionBarsPosition();
                })
                .on("dblclick", (event, d) => {
                    event.stopPropagation();
                    startInlineCardEdit(d, event.currentTarget, false);
                })
                .on("contextmenu", (event, d) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (!selectedNodeIds.has(d.id)) {
                        selectedNode = d;
                        selectedNodeIds = new Set([d.id]);
                        refreshNodeStyles();
                        renderEditor();
                        updateFloatingActionBarsPosition();
                    }
                    showCanvasContextMenu(event.clientX, event.clientY, d, event.target);
                });

            // 画布富文本与图片直接渲染卡片容器 (<foreignObject>)
            const fo = g.append("foreignObject")
                .attr("class", "node-card-fo")
                .attr("width", 160)
                .attr("height", 54)
                .attr("x", -80)
                .attr("y", -27);

            const cardDiv = fo.append("xhtml:div")
                .attr("class", "canvas-note-card")
                .on("click.todoToggle", function(event, d) {
                    const cb = event.target && event.target.closest ? event.target.closest(".canvas-todo-checkbox") : null;
                    if (!cb) return;
                    event.stopPropagation();
                    const idx = parseInt(cb.getAttribute("data-task-index") || "0", 10);
                    toggleNthTaskCheckboxInNode(d, idx, cb.checked);
                });

            cardDiv.on("click.noteBadge", function(event, d) {
                    const badge = event.target && event.target.closest ? event.target.closest(".card-has-note-badge") : null;
                    if (!badge) return;
                    event.stopPropagation();
                    selectedNode = d;
                    selectedNodeIds = new Set([d.id]);
                    setEditorPanelCollapsed(false);
                    renderEditor();
                    const richEditor = document.getElementById("rich-editor");
                    if (richEditor) richEditor.focus();
                    showToast(`📖 已打开【${d.label}】详细笔记`);
                });

            cardDiv.append("xhtml:div")
                .attr("class", "canvas-note-card-body");

            // v3.4.3 全向 8 手柄智能分向缩放引擎：
            // 1. 左右拉 (.handle-e / .handle-w)：仅调宽度，对侧边缘锚定不动，文字自动换行自适应，字号不变
            // 2. 上下拉 (.handle-s / .handle-n)：调整高度，对侧边缘锚定不动，往上拉缩高时自动扩宽重排换行，字号不变
            // 3. 拉对角线 (.handle-se / .handle-sw / .handle-ne / .handle-nw)：框框缩放的同时，内部字体大小自动按比例同步变大/变小！
            const resizeConfigs = [
                { mode: "e", cls: "card-resize-handle handle-e", title: "↔ 左右拉：调整卡片宽度（内部文字自动换行自适应，字号不变；双击恢复默认）" },
                { mode: "w", cls: "card-resize-handle handle-w", title: "↔ 左右拉：调整卡片宽度（内部文字自动换行自适应，字号不变；双击恢复默认）" },
                { mode: "s", cls: "card-resize-handle handle-s", title: "↕ 上下拉：调整卡片高度（内部换行与排版自适应，字号不变；双击恢复默认）" },
                { mode: "n", cls: "card-resize-handle handle-n", title: "↕ 上下拉：调整卡片高度（内部换行与排版自适应，字号不变；双击恢复默认）" },
                { mode: "se", cls: "card-resize-handle handle-se", title: "⤡ 拉对角线：字体大小自动随框框比例变大/变小！(双击恢复默认字号与尺寸)", text: "◢" },
                { mode: "sw", cls: "card-resize-handle handle-sw", title: "⤢ 拉对角线：字体大小自动随框框比例变大/变小！(双击恢复默认字号与尺寸)" },
                { mode: "ne", cls: "card-resize-handle handle-ne", title: "⤢ 拉对角线：字体大小自动随框框比例变大/变小！(双击恢复默认字号与尺寸)" },
                { mode: "nw", cls: "card-resize-handle handle-nw", title: "⤡ 拉对角线：字体大小自动随框框比例变大/变小！(双击恢复默认字号与尺寸)" }
            ];
            resizeConfigs.forEach(cfg => {
                const h = cardDiv.append("xhtml:div")
                    .attr("class", cfg.cls)
                    .attr("title", cfg.title)
                    .on("mousedown", function(event, d) {
                        event.stopPropagation();
                        event.preventDefault();
                        startCardResize(event, d, this, cfg.mode);
                    })
                    .on("touchstart", function(event, d) {
                        event.stopPropagation();
                        if (event.cancelable) event.preventDefault();
                        startCardResize(event, d, this, cfg.mode);
                    })
                    .on("dblclick", function(event, d) {
                        event.stopPropagation();
                        resetCardCustomSize(d, this);
                    });
                if (cfg.text) h.text(cfg.text);
            });

            // 节点折叠 / 展开徽章点按 Badge
            const badge = g.append("g").attr("class", "node-fold-badge")
                .style("cursor", "pointer")
                .on("click", (event, d) => {
                    event.stopPropagation();
                    toggleNodeFold(d);
                });
            badge.append("circle").attr("class", "fold-circle");
            badge.append("text").attr("class", "fold-text").attr("text-anchor", "middle").attr("dy", "3.5px");

            // 右侧一键衍生子卡片按钮 (.node-quick-add-btn)
            const quickAdd = g.append("g").attr("class", "node-quick-add-btn")
                .attr("title", "点击直接衍生带箭头的子卡片 (等同 Tab 键)")
                .on("click", (event, d) => {
                    event.stopPropagation();
                    selectedNode = d;
                    selectedNodeIds = new Set([d.id]);
                    createChildNode();
                });
            quickAdd.append("circle")
                .attr("r", 7.5)
                .attr("class", "quick-add-circle");
            quickAdd.append("text")
                .attr("text-anchor", "middle")
                .attr("dy", "3.5px")
                .attr("class", "quick-add-plus")
                .text("+");

            // 右侧拖拽拉出箭头手柄 (.node-connect-port)
            const port = g.append("g").attr("class", "node-connect-port")
                .attr("title", "按住拖拽拉出箭头连接到其他卡片")
                .call(d3.drag()
                    .on("start", startPortConnectDrag)
                    .on("drag", dragPortConnect)
                    .on("end", endPortConnectDrag));
            port.append("circle")
                .attr("r", 7.5)
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
        renderPositions();
    }

    if (typeof renderInkStrokes === "function") {
        renderInkStrokes();
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

// 收集指定节点集合及其全部下属子孙节点 ID（用于 XMind 风格拖拽父节点时子树自动整体跟随移动）
function collectSubtreeNodeIds(rootIdSet) {
    const result = new Set(rootIdSet);
    const childrenMap = new Map();
    nodes.forEach(n => {
        if (n.parentId) {
            if (!childrenMap.has(n.parentId)) childrenMap.set(n.parentId, []);
            childrenMap.get(n.parentId).push(n.id);
        }
    });
    const queue = Array.from(rootIdSet);
    while (queue.length > 0) {
        const currId = queue.shift();
        const kids = childrenMap.get(currId) || [];
        kids.forEach(kidId => {
            if (!result.has(kidId)) {
                result.add(kidId);
                queue.push(kidId);
            }
        });
    }
    return result;
}

function dragstarted(event, d) {
    hideCanvasContextMenu();
    d._dragMoved = false;
    d._wasSingleSelectedBeforeMousedown = (selectedNodeIds.size === 1 && selectedNodeIds.has(d.id));

    const srcEvt = event.sourceEvent;
    const isMultiModifier = !!(srcEvt && (srcEvt.shiftKey || srcEvt.ctrlKey || srcEvt.metaKey)) || isTouchMultiSelectMode;
    const isAltOnlySingle = !!(srcEvt && srcEvt.altKey); // 按住 Alt 键时仅单独移动当前节点（或触发靠近挂载父节点）

    if (layoutMode === "force") {
        if (!event.active) simulation.alphaTarget(0.3).restart();
    }

    dragStartPositions.clear();
    clearDropCandidateHighlight();

    let baseDragIds = new Set([d.id]);

    // 如果按住了 Shift/Ctrl 或者是多选模式，绝不在 mousedown 阶段清空已选中的其他卡片！
    if (isMultiModifier) {
        selectedNodeIds.forEach(id => baseDragIds.add(id));
    } else if (selectedNodeIds.has(d.id) && selectedNodeIds.size > 1) {
        selectedNodeIds.forEach(id => baseDragIds.add(id));
    } else {
        selectedNode = d;
        selectedNodeIds = new Set([d.id]);
        selectedLink = null;
        refreshNodeStyles();
        renderEditor();
        updateFloatingActionBarsPosition();
    }

    // XMind 核心直觉：拖拽父节点时，其所有下属子孙卡片默认自动整体跟随移动（按住 Alt 键可单独移动父卡片）
    const moveIds = isAltOnlySingle ? baseDragIds : collectSubtreeNodeIds(baseDragIds);
    nodes.forEach(n => {
        if (moveIds.has(n.id)) {
            dragStartPositions.set(n.id, { x: n.x, y: n.y });
        }
    });

    d.fx = d.x;
    d.fy = d.y;
}

function dragged(event, d) {
    if (event.x === undefined || event.y === undefined || isNaN(event.x) || isNaN(event.y)) return;

    const dx = event.x - d.x;
    const dy = event.y - d.y;
    if (Math.hypot(dx, dy) > 1.5) {
        d._dragMoved = true;
    }

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
    updateFloatingActionBarsPosition();
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
        content: "",
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

// 2. Enter 键：新建同级姊妹节点 (insertBefore=true 时为 Shift+Enter 在上方新建同级节点)
function createSiblingNode(insertBefore = false) {
    if (!selectedNode) {
        createChildNode();
        return;
    }
    const parentId = selectedNode.parentId;
    const nowTs = Date.now();
    const newId = `node_${nowTs}`;

    const siblings = nodes.filter(n => n.parentId === parentId);
    siblings.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const currOrder = selectedNode.order ?? 0;
    const maxOrder = siblings.length > 0 ? Math.max(...siblings.map(s => s.order ?? 0)) + 1 : 0;
    const nextOrder = insertBefore ? (currOrder - 0.5) : maxOrder;

    const targetX = Number.isFinite(selectedNode.x) ? selectedNode.x : 450;
    const deltaY = Math.max(68, (selectedNode._cardH || 40) + 32);
    const targetY = (Number.isFinite(selectedNode.y) ? selectedNode.y : 320) + (insertBefore ? -deltaY : deltaY);

    const newNode = {
        id: newId,
        label: `同级卡片 ${nodes.length + 1}`,
        parentId: parentId,
        content: "",
        createdAt: nowTs,
        x: targetX,
        y: targetY,
        fx: targetX,
        fy: targetY,
        order: nextOrder
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
    showToast(insertBefore ? `⬆️ 已在上方新增同级卡片 [[${newNode.label}]]` : `✨ 已新增姊妹卡片 [[${newNode.label}]]`);

    setTimeout(() => {
        startInlineCardEditById(newId, true);
    }, 50);
}

// 2.5. Ctrl + Enter / Insert 键：XMind 经典「插入中间父卡片」(Insert Parent Topic)
function insertParentNode(targetNode = selectedNode) {
    if (!targetNode) return;
    const nowTs = Date.now();
    const newId = `node_${nowTs}`;
    const oldParentId = targetNode.parentId;
    const oldParent = oldParentId ? nodes.find(n => n.id === oldParentId) : null;

    const tx = Number.isFinite(targetNode.x) ? targetNode.x : 550;
    const ty = Number.isFinite(targetNode.y) ? targetNode.y : 320;
    const newX = oldParent && Number.isFinite(oldParent.x) ? Math.round((oldParent.x + tx) / 2) : (tx - 210);
    const newY = oldParent && Number.isFinite(oldParent.y) ? Math.round((oldParent.y + ty) / 2) : ty;

    const newParent = {
        id: newId,
        label: `父级节点 ${nodes.length + 1}`,
        parentId: oldParentId,
        content: "",
        createdAt: Math.max(1000, getNodeCreatedTime(targetNode) - 500),
        x: newX,
        y: newY,
        fx: newX,
        fy: newY,
        order: targetNode.order ?? nodes.length
    };

    targetNode.parentId = newId;
    nodes.push(newParent);
    sanitizeGraph();

    selectedNode = newParent;
    selectedNodeIds = new Set([newId]);

    scheduleSaveGraph(true);
    if (layoutMode === "tree") tidyLayout();
    else updateD3Graph();
    renderPositions();
    renderEditor();
    showToast(`➕ 已在【${targetNode.label}】前插入父卡片 [[${newParent.label}]]`);

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

// 3. Delete / Backspace：智能防误删机制 —— 默认仅删除选中的展开卡片（自动保留下级未选中子卡片），仅当分支处于折叠状态 (+N) 或按住 Shift+Delete 时才连同整个下属分支删除！
function deleteSelectedNode(forceDeleteSubtree = false) {
    if (selectedLink) {
        deleteSelectedLink();
        return;
    }
    if (!selectedNode && selectedNodeIds.size === 0) return;

    const baseIds = selectedNodeIds.size > 0
        ? new Set(selectedNodeIds)
        : (selectedNode ? new Set([selectedNode.id]) : new Set());
    if (baseIds.size === 0) return;

    const toDeleteIds = new Set();
    function collectSubtree(id) {
        toDeleteIds.add(id);
        nodes.filter(n => n.parentId === id).forEach(child => collectSubtree(child.id));
    }

    baseIds.forEach(id => {
        const nodeObj = nodes.find(n => n.id === id);
        if (forceDeleteSubtree || (nodeObj && nodeObj.collapsed)) {
            collectSubtree(id);
        } else {
            toDeleteIds.add(id);
        }
    });

    if (toDeleteIds.size === 0) return;

    // 对于未被删除的下级子卡片，将其 parentId 平滑继承到被删父卡片的上一级（或转为独立顶层卡片），绝不无故连坐误删！
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    let preservedChildrenCount = 0;
    nodes.forEach(n => {
        if (!toDeleteIds.has(n.id) && n.parentId && toDeleteIds.has(n.parentId)) {
            let up = nodeMap.get(n.parentId);
            while (up && toDeleteIds.has(up.id)) {
                up = up.parentId ? nodeMap.get(up.parentId) : null;
            }
            n.parentId = up ? up.id : null;
            preservedChildrenCount++;
        }
    });

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
    updateFloatingActionBarsPosition();
    showToast(preservedChildrenCount > 0
        ? `🗑️ 已删除选中卡片（自动保留了 ${preservedChildrenCount} 张下级子卡片；按 Shift+Del 可连同分支删除）`
        : `🗑️ 已删除 ${toDeleteIds.size} 张卡片`);
}

// 4. F2 / 双击：直接在画布卡片上原地富文本编辑（取代简陋的弹窗 prompt）
function renameSelectedNode(targetNode = selectedNode) {
    if (!targetNode) return;
    startInlineCardEditById(targetNode.id, true);
}

// 4.5. Shift + Tab：提升/外缩选中子卡片层级 (XMind 经典 Outdent/Promote 快捷键)
function promoteSelectedNode() {
    if (!selectedNode) return;
    if (!selectedNode.parentId) {
        showToast("💡 当前卡片已经是顶层独立卡片");
        return;
    }
    const oldParent = nodes.find(n => n.id === selectedNode.parentId);
    const newParentId = oldParent ? oldParent.parentId : null;
    selectedNode.parentId = newParentId;
    sanitizeGraph();
    if (layoutMode === "tree") tidyLayout();
    else updateD3Graph();
    renderPositions();
    renderEditor();
    scheduleSaveGraph(true);
    showToast(newParentId ? `⬅️ 已将【${selectedNode.label}】提升一级` : `⬅️ 已将【${selectedNode.label}】提升为独立顶层卡片`);
}

// 5. 方向键 ↑↓←→：XMind 树分支 + 2D 自由空间智能几何漫游
function navigateNodes(direction) {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const visibleNodes = nodes.filter(n => isNodeVisible(n, nodeMap));
    if (visibleNodes.length === 0) return;

    if (!selectedNode || !isNodeVisible(selectedNode, nodeMap)) {
        selectedNode = visibleNodes[0];
        selectedNodeIds = new Set([selectedNode.id]);
        refreshNodeStyles();
        renderEditor();
        return;
    }

    // XMind 直觉：如果当前父节点处于折叠状态，按右方向键 (→) 先展开其子分支
    if (direction === "ArrowRight" && selectedNode.collapsed && getDescendantCount(selectedNode.id) > 0) {
        unfoldNodeBranch(selectedNode);
        return;
    }

    let nextNode = null;

    // A. 在树状布局下优先沿父子/同级关系跳转
    if (layoutMode === "tree") {
        const parentId = selectedNode.parentId;
        const siblings = visibleNodes.filter(n => n.parentId === parentId);
        siblings.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const idx = siblings.findIndex(n => n.id === selectedNode.id);

        if (direction === "ArrowUp" && idx > 0) nextNode = siblings[idx - 1];
        else if (direction === "ArrowDown" && idx >= 0 && idx < siblings.length - 1) nextNode = siblings[idx + 1];
        else if (direction === "ArrowLeft" && parentId) nextNode = nodeMap.get(parentId);
        else if (direction === "ArrowRight") {
            const children = visibleNodes.filter(n => n.parentId === selectedNode.id);
            children.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            if (children.length > 0) nextNode = children[0];
        }
    }

    // B. 2D 空间最近邻方向锥寻路（支持自由摆放的卡片群与跨分支跳转）
    if (!nextNode) {
        const sx = Number.isFinite(selectedNode.x) ? selectedNode.x : 0;
        const sy = Number.isFinite(selectedNode.y) ? selectedNode.y : 0;
        let bestScore = Infinity;

        visibleNodes.forEach(cand => {
            if (cand.id === selectedNode.id) return;
            const dx = (Number.isFinite(cand.x) ? cand.x : 0) - sx;
            const dy = (Number.isFinite(cand.y) ? cand.y : 0) - sy;

            let primary = 0;
            let perp = 0;
            if (direction === "ArrowRight") { primary = dx; perp = Math.abs(dy); }
            else if (direction === "ArrowLeft") { primary = -dx; perp = Math.abs(dy); }
            else if (direction === "ArrowDown") { primary = dy; perp = Math.abs(dx); }
            else if (direction === "ArrowUp") { primary = -dy; perp = Math.abs(dx); }

            if (primary > 8) {
                const score = primary + perp * 1.65;
                if (score < bestScore) {
                    bestScore = score;
                    nextNode = cand;
                }
            }
        });
    }

    if (nextNode) {
        selectedNode = nextNode;
        selectedNodeIds = new Set([nextNode.id]);
        selectedLink = null;
        refreshNodeStyles();
        renderEditor();
        updateFloatingActionBarsPosition();
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

function renderOutlineTree(filterQuery = "") {
    const treeEl = document.getElementById("outline-tree");
    if (!treeEl) return;
    treeEl.innerHTML = "";
    const filterInput = document.getElementById("outline-filter");
    const q = (typeof filterQuery === "string" && filterQuery.length > 0)
        ? filterQuery.trim().toLowerCase()
        : (filterInput ? filterInput.value.trim().toLowerCase() : "");

    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const childrenByParent = new Map();
    nodes.forEach(n => childrenByParent.set(n.id, []));
    nodes.forEach(n => {
        if (n.parentId && childrenByParent.has(n.parentId)) {
            childrenByParent.get(n.parentId).push(n);
        }
    });
    childrenByParent.forEach(list => list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));

    const roots = nodes.filter(n => !n.parentId || !nodeMap.has(n.parentId));
    roots.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const orderedWithDepth = [];
    const visited = new Set();
    function walk(node, depth) {
        if (!node || visited.has(node.id)) return;
        visited.add(node.id);
        orderedWithDepth.push({ node, depth });
        (childrenByParent.get(node.id) || []).forEach(child => walk(child, depth + 1));
    }
    roots.forEach(r => walk(r, 0));
    nodes.forEach(n => { if (!visited.has(n.id)) orderedWithDepth.push({ node: n, depth: 0 }); });

    orderedWithDepth.forEach(({ node: n, depth }) => {
        if (q) {
            const hay = `${n.label || ""} ${n.content || ""} ${n.edgeLabel || ""}`.toLowerCase();
            if (!hay.includes(q)) return;
        }
        const row = document.createElement("div");
        row.className = "outline-row" + (selectedNode && selectedNode.id === n.id ? " is-active" : "");
        row.style.paddingLeft = `${10 + Math.min(depth, 7) * 14}px`;
        const icon = n.isImage ? "🖼️" : (n.parentId === null ? "🌳" : "📄");
        const star = n.isFocus ? "⭐ " : "";
        const edgeTag = n.edgeLabel ? `<span class="outline-edge-pill">${escapeHTML(n.edgeLabel)}</span>` : "";
        row.innerHTML = `<span>${icon}</span>${edgeTag}<span class="outline-label-text">${star}${escapeHTML(n.label)}</span>`;
        row.addEventListener("click", () => {
            unfoldAncestorsOf(n);
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

    // 顶部猫头鹰智慧横幅关闭按钮 (#closeBannerBtn) 与点击 Logo 呼出
    const owlBanner = document.getElementById("owlBanner");
    const closeBannerBtn = document.getElementById("closeBannerBtn");
    const logoGroup = document.getElementById("logoGroup");
    if (localStorage.getItem("flownotes_banner_hidden") !== "false" && owlBanner) {
        owlBanner.style.display = "none";
    }
    if (closeBannerBtn) {
        closeBannerBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (owlBanner) {
                owlBanner.style.display = "none";
                localStorage.setItem("flownotes_banner_hidden", "true");
            }
            // 用户直觉支持：很多用户点击右上角这个 × 是为了叉掉正下方的右侧详细笔记面板 (#editor-panel)，因此同步收起右侧详情面板并在右上角留出“📖 展开详细笔记”胶囊！
            setEditorPanelCollapsed(true);
        });
    }
    if (logoGroup && owlBanner) {
        logoGroup.addEventListener("click", () => {
            const isHidden = owlBanner.style.display === "none";
            owlBanner.style.display = isHidden ? "flex" : "none";
            localStorage.setItem("flownotes_banner_hidden", isHidden ? "false" : "true");
            showOwlWisdom();
        });
    }

    // 右侧详细笔记面板 (#editor-panel) 开关、右上角 × 关闭按钮与收起后悬浮展开胶囊
    const edPanel = document.getElementById("editor-panel");
    const toggleEdBtn = document.getElementById("btn-toggle-editor");
    const closeEdBtn = document.getElementById("btn-close-editor");
    const reopenEdPill = document.getElementById("btn-reopen-editor-pill");

    function setEditorPanelCollapsed(shouldCollapse) {
        if (!edPanel) return;
        edPanel.classList.toggle("collapsed", shouldCollapse);
        if (reopenEdPill) {
            reopenEdPill.style.display = shouldCollapse ? "inline-flex" : "none";
        }
        localStorage.setItem("flownotes_editor_collapsed", shouldCollapse ? "true" : "false");
        setTimeout(() => {
            const container = document.getElementById("graph-container");
            if (container && svg) {
                svg.attr("width", container.clientWidth || 800)
                   .attr("height", container.clientHeight || 600);
            }
            updateFloatingActionBarsPosition();
        }, 30);
    }
    window.setEditorPanelCollapsed = setEditorPanelCollapsed;

    if (localStorage.getItem("flownotes_editor_collapsed") === "true") {
        setEditorPanelCollapsed(true);
    }

    if (toggleEdBtn) {
        toggleEdBtn.addEventListener("click", () => {
            const nextState = !(edPanel && edPanel.classList.contains("collapsed"));
            setEditorPanelCollapsed(nextState);
        });
    }
    if (closeEdBtn) {
        closeEdBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            setEditorPanelCollapsed(true);
            showToast("📖 已收起右侧详细笔记面板（点右上角“📖 展开详细笔记”可随时恢复）");
        });
    }
    if (reopenEdPill) {
        reopenEdPill.addEventListener("click", (e) => {
            e.stopPropagation();
            setEditorPanelCollapsed(false);
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
    const btnZoomReset = document.getElementById("btn-zoom-reset");
    if (btnZoomReset) {
        btnZoomReset.addEventListener("click", () => {
            if (!svg || !zoom) return;
            const container = document.getElementById("graph-container");
            const vw = (container && container.clientWidth) ? container.clientWidth : 900;
            const vh = (container && container.clientHeight) ? container.clientHeight : 620;
            const cur = d3.zoomTransform(svg.node());
            const worldCenterX = (vw / 2 - cur.x) / (cur.k || 1);
            const worldCenterY = (vh / 2 - cur.y) / (cur.k || 1);
            const nextT = d3.zoomIdentity.translate(vw / 2 - worldCenterX, vh / 2 - worldCenterY).scale(1);
            svg.transition().duration(320).call(zoom.transform, nextT);
            showToast("🔍 已恢复 100% 原始缩放比例");
        });
    }
    document.getElementById("btn-fit").addEventListener("click", () => fitCanvasToAllNodes());
    document.getElementById("btn-relation").addEventListener("click", toggleRelationLink);
    const btnInkDraw = document.getElementById("btn-ink-draw");
    if (btnInkDraw) {
        btnInkDraw.addEventListener("click", () => toggleInkDrawMode());
    }

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

    // v3.5.5 OneNote 招牌表格体验：在详细笔记 richEditor 中支持 Tab/Shift+Tab 换格与末尾自动加行
    richEditor.addEventListener("keydown", (e) => {
        const activeSel = window.getSelection();
        const activeCell = activeSel && activeSel.anchorNode
            ? (activeSel.anchorNode.nodeType === 1 ? activeSel.anchorNode : activeSel.anchorNode.parentElement)?.closest("td, th")
            : null;

        if (e.key === "Tab" && activeCell) {
            e.preventDefault();
            const activeTr = activeCell.closest("tr");
            const activeTable = activeTr ? activeTr.closest("table") : null;
            if (activeTable) {
                const allCells = Array.from(activeTable.querySelectorAll("th, td"));
                const currIdx = allCells.indexOf(activeCell);
                if (e.shiftKey) {
                    const prevCell = allCells[currIdx - 1];
                    if (prevCell) {
                        const r = document.createRange();
                        r.selectNodeContents(prevCell);
                        activeSel.removeAllRanges();
                        activeSel.addRange(r);
                    }
                } else {
                    if (currIdx < allCells.length - 1) {
                        const nextCell = allCells[currIdx + 1];
                        if (nextCell) {
                            const r = document.createRange();
                            r.selectNodeContents(nextCell);
                            activeSel.removeAllRanges();
                            activeSel.addRange(r);
                        }
                    } else {
                        // 位于整个表格最后一个单元格：在末尾自动追加新行！
                        const colCount = activeTr.children.length || 2;
                        const newTr = document.createElement("tr");
                        for (let c = 0; c < colCount; c++) {
                            const newTd = document.createElement("td");
                            newTd.innerHTML = "<br>";
                            newTr.appendChild(newTd);
                        }
                        const tbody = activeTable.querySelector("tbody") || activeTable;
                        tbody.appendChild(newTr);
                        if (selectedNode) {
                            selectedNode.content = htmlToSafeMarkdown(richEditor.innerHTML);
                            if (mdTextarea) mdTextarea.value = selectedNode.content;
                            refreshNodeStyles();
                            scheduleSaveGraph(true);
                        }
                        const firstCell = newTr.firstElementChild;
                        if (firstCell) {
                            const r = document.createRange();
                            r.selectNodeContents(firstCell);
                            r.collapse(true);
                            activeSel.removeAllRanges();
                            activeSel.addRange(r);
                        }
                        showToast("▦ 已在表格末尾追加新行 (Tab)");
                    }
                }
            }
        }
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

            if (file.name && file.name.toLowerCase().endsWith(".pdf")) {
                showToast(`📄 检测到选入 PDF【${file.name}】，正在自动载入桌面转换版 Excalidraw 导图...`);
                loadDemoExcalidrawMap(file.name);
                fileInput.value = "";
                return;
            }

            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const parsed = JSON.parse(ev.target.result);
                    if (parsed.type === "excalidraw" || Array.isArray(parsed.elements)) {
                        importExcalidrawFile(parsed, file.name);
                    } else {
                        applyParsedBackupData(parsed, file.name);
                        saveGraphToStorage(true);
                        showToast(`📥 已成功导入备份文件 (${nodes.length} 张卡片)！`);
                    }
                } catch (err) {
                    showToast("❌ 文件格式解析失败");
                }
                fileInput.value = "";
            };
            reader.readAsText(file);
        });
    }

    const btnLoadExcalidrawDemo = document.getElementById("btnLoadExcalidrawDemo");
    if (btnLoadExcalidrawDemo) {
        btnLoadExcalidrawDemo.addEventListener("click", () => {
            showToast("🎨 正在载入《1.pdf (AI Biologist 宏基因组)》导图...");
            loadDemoExcalidrawMap("1 - AI Biologist.pdf");
        });
    }

    // OneNote 现代化树状抽屉操作按钮绑定 (v3.5.0)
    const toggleOrganizerPanel = () => {
        const panel = document.getElementById("organizer-panel");
        if (!panel) return;
        panel.hidden = !panel.hidden;
        if (!panel.hidden) renderOrganizerUI();
    };
    const btnOrg = document.getElementById("btn-organizer");
    const badgeOrg = document.getElementById("currentMapBadge");
    const closeOrg = document.getElementById("btn-organizer-close");

    if (btnOrg) btnOrg.addEventListener("click", toggleOrganizerPanel);
    if (badgeOrg) badgeOrg.addEventListener("click", toggleOrganizerPanel);
    if (closeOrg) closeOrg.addEventListener("click", () => {
        const panel = document.getElementById("organizer-panel");
        if (panel) panel.hidden = true;
    });

    const btnTreeNewNotebook = document.getElementById("btnTreeNewNotebook");
    const btnTreeNewSection = document.getElementById("btnTreeNewSection");
    const btnTreeNewPage = document.getElementById("btnTreeNewPage");
    const btnCollapseAllTree = document.getElementById("btnCollapseAllTree");
    const btnExpandAllTree = document.getElementById("btnExpandAllTree");
    const onenoteTreeSearch = document.getElementById("onenote-tree-search");

    if (btnTreeNewNotebook) btnTreeNewNotebook.addEventListener("click", () => createNotebook());
    if (btnTreeNewSection) btnTreeNewSection.addEventListener("click", () => createSection());
    if (btnTreeNewPage) btnTreeNewPage.addEventListener("click", () => createNewMap());
    if (btnCollapseAllTree) btnCollapseAllTree.addEventListener("click", collapseAllTree);
    if (btnExpandAllTree) btnExpandAllTree.addEventListener("click", expandAllTree);
    if (onenoteTreeSearch) {
        onenoteTreeSearch.addEventListener("input", (e) => {
            organizerTreeFilter = e.target.value.trim().toLowerCase();
            renderOrganizerUI(organizerTreeFilter);
        });
    }

    // 主题
    document.getElementById("themeToggle").addEventListener("click", toggleTheme);

    // 顶部导航栏「更多」下拉菜单 (⋯) 控制 (v3.5.2)
    const btnNavbarMore = document.getElementById("btnNavbarMore");
    const navbarMoreDropdown = document.getElementById("navbarMoreDropdown");
    if (btnNavbarMore && navbarMoreDropdown) {
        btnNavbarMore.addEventListener("click", (e) => {
            e.stopPropagation();
            const isOpen = navbarMoreDropdown.style.display === "flex";
            navbarMoreDropdown.style.display = isOpen ? "none" : "flex";
        });

        navbarMoreDropdown.querySelectorAll(".navbar-dropdown-item").forEach(item => {
            item.addEventListener("click", () => {
                navbarMoreDropdown.style.display = "none";
            });
        });

        document.addEventListener("click", (e) => {
            if (!navbarMoreDropdown.contains(e.target) && e.target !== btnNavbarMore) {
                navbarMoreDropdown.style.display = "none";
            }
        });
    }

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
            if (isInkDrawMode) {
                toggleInkDrawMode(false);
                return;
            }
            const lb = document.getElementById("img-lightbox-modal");
            if (lb && lb.style.display !== "none") {
                lb.style.display = "none";
                return;
            }
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

        // Ctrl+K / Cmd+K：随时呼出全局即时搜索跳转面板 (Quick Open)
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === "k" || e.key === "K")) {
            e.preventDefault();
            openQuickSearchModal();
            return;
        }

        // Ctrl+0 / Cmd+0：一键智能缩放全景适配所有可见卡片 (Fit to Screen)
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key === "0") {
            e.preventDefault();
            fitCanvasToAllNodes();
            return;
        }

        // Ctrl+B / Ctrl+I / Ctrl+U: 粗体 / 斜体 / 下划线 (选框整体变粗/变斜/下划线 或 划词局部变粗/变斜/下划线)
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
            if (e.key === "b" || e.key === "B" || e.code === "KeyB") {
                const s = window.getSelection();
                const hasSelectedText = !!(s && !s.isCollapsed && s.toString().trim());
                if (!isEditing || !hasSelectedText) {
                    e.preventDefault();
                    applyFormatting("bold");
                    return;
                }
            } else if (e.key === "i" || e.key === "I" || e.code === "KeyI") {
                const s = window.getSelection();
                const hasSelectedText = !!(s && !s.isCollapsed && s.toString().trim());
                if (!isEditing || !hasSelectedText) {
                    e.preventDefault();
                    applyFormatting("italic");
                    return;
                }
            } else if (e.key === "u" || e.key === "U" || e.code === "KeyU") {
                const s = window.getSelection();
                const hasSelectedText = !!(s && !s.isCollapsed && s.toString().trim());
                if (!isEditing || !hasSelectedText) {
                    e.preventDefault();
                    applyFormatting("underline");
                    return;
                }
            }
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
            if (e.key === "W" || e.code === "KeyW") {
                e.preventDefault();
                applyFormatting("handwriting");
                return;
            }
            if (e.key === "\\" || e.code === "Backslash") {
                e.preventDefault();
                applyFormatting("clear");
                showToast("🧹 已清除格式");
                return;
            }
        }

        // OneNote 经典快捷键体系：Ctrl + 1~5 一键打标 (1: ☑待办, 2: ⭐重点, 3: ❓存疑, 4: 💡灵感, 5: ✅已验证)
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && ["1", "2", "3", "4", "5"].includes(e.key)) {
            if (selectedNode) {
                e.preventDefault();
                if (e.key === "1") toggleTodoOnSelectedCard(selectedNode);
                else if (e.key === "2") toggleNodeFocus(selectedNode);
                else if (e.key === "3") toggleNodeQuickTag("question", selectedNode);
                else if (e.key === "4") toggleNodeQuickTag("idea", selectedNode);
                else if (e.key === "5") toggleNodeQuickTag("done", selectedNode);
                return;
            }
        }

        // OneNote 招牌快捷键: Alt+T 极速插入/扩展表格
        if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === "t" || e.key === "T" || e.code === "KeyT")) {
            e.preventDefault();
            applyFormatting("table");
            return;
        }

        if (isEditing) return;

        // Shift 键按下时在画布上即时呈现 crosshair 框选准星，给予 100% 直觉确定性
        if (e.key === "Shift" && !isEditing) {
            const svgEl = document.getElementById("graph-svg");
            if (svgEl && !isInkDrawMode && !isSpacePressed) {
                svgEl.style.cursor = "crosshair";
            }
        }

        // 按住空格键 (Space) 开启临时抓手平移画布模式；若在选中卡片上轻按一下空格松开则直接进入卡片编辑 (XMind 经典连招)
        if (e.code === "Space" && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            if (!isSpacePressed) {
                isSpacePressed = true;
                spacePanMoved = false;
                const svgEl = document.getElementById("graph-svg");
                if (svgEl) svgEl.style.cursor = "grab";
            }
            return;
        }

        // P 键：一键开启/关闭 OneNote 画布自由手绘/荧光笔圈注模式
        if ((e.key === "p" || e.key === "P") && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            toggleInkDrawMode();
            return;
        }

        // OneNote 核心直觉：当点击了画布空白处（无任何选中卡片）时，直接敲键盘打字即刻在鼠标位置生成新卡片并输入！
        if (!selectedNode && selectedNodeIds.size === 0 && !selectedLink && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const isGlobalShortcutKey = ["b", "B", "m", "M", "g", "G", "l", "L", "p", "P"].includes(e.key);
            if (!isGlobalShortcutKey && (e.key.length === 1 || e.key === "Process")) {
                const initChar = e.key === "Process" ? "" : e.key;
                if (initChar) e.preventDefault();
                if (typeof window.spawnFreeCardAtCoords === "function") {
                    window.spawnFreeCardAtCoords([lastCanvasMouseCoords.x, lastCanvasMouseCoords.y], initChar);
                }
                return;
            }
        }

        // XMind 核心直觉：当选中了单张卡片（未处于双击编辑态）时，直接敲键盘打字即刻进入该卡片的原地编辑！
        if (selectedNode && selectedNodeIds.size === 1 && !selectedLink && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const isGlobalShortcutKey = ["f", "F", "b", "B", "m", "M", "g", "G", "l", "L", "p", "P"].includes(e.key);
            if (!isGlobalShortcutKey && (e.key.length === 1 || e.key === "Process") && !selectedNode.isImage) {
                const initChar = e.key === "Process" ? "" : e.key;
                if (initChar) e.preventDefault();
                startInlineCardEditById(selectedNode.id, false, true, initChar);
                return;
            }
        }

        // Ctrl+A / Cmd+A：全选画布上所有可见卡片
        if ((e.ctrlKey || e.metaKey) && (e.key === "a" || e.key === "A")) {
            e.preventDefault();
            selectAllVisibleNodes();
            return;
        }

        // Ctrl+C / Cmd+C：复制选中的卡片
        if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C") && !e.shiftKey) {
            const selText = window.getSelection ? window.getSelection().toString() : "";
            if (!selText && selectedNodeIds.size > 0) {
                e.preventDefault();
                copySelectedNodes();
                return;
            }
        }

        // Ctrl+D / Cmd+D：一键克隆/复制生成选中卡片的副本
        if ((e.ctrlKey || e.metaKey) && (e.key === "d" || e.key === "D")) {
            e.preventDefault();
            duplicateSelectedNodes();
            return;
        }

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

        // 3. Tab 键：新建分支子节点 | Shift + Tab：提升节点层级 (Outdent)
        if (e.key === "Tab") {
            e.preventDefault();
            if (e.shiftKey) promoteSelectedNode();
            else createChildNode();
            return;
        }

        // 4. Enter 键：新建下方同级节点 | Shift + Enter：新建上方同级节点 | Ctrl + Enter / Insert：插入中间父节点 (XMind 经典连招)
        if (e.key === "Insert") {
            e.preventDefault();
            insertParentNode(selectedNode);
            return;
        }
        if (e.key === "Enter") {
            e.preventDefault();
            if (e.ctrlKey || e.metaKey) {
                insertParentNode(selectedNode);
            } else if (e.shiftKey) {
                createSiblingNode(true);
            } else {
                createSiblingNode(false);
            }
            return;
        }

        // 5. Delete / Backspace 键：默认删除选中卡片（自动保留展开的下级子卡）；按住 Shift+Delete 则连同整个下属分支删除！
        if (e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault();
            deleteSelectedNode(!!e.shiftKey);
            return;
        }

        // 6. F2 键：直接进入卡片原地编辑
        if (e.key === "F2") {
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
            case "handwriting":
                before = `<span class="font-handwriting">`;
                after = "</span>";
                break;
            case "table": {
                const tableTpl = `\n| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n`;
                const replacement = (start === end) ? tableTpl : `\n| ${selected} | 详情 |\n| --- | --- |\n|  |  |\n`;
                mdTextarea.setRangeText(replacement, start, end, "select");
                mdTextarea.focus();
                if (selectedNode) { selectedNode.content = mdTextarea.value; saveGraphToStorage(false); }
                return;
            }
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

    // 支持在画布卡片原地编辑区 (.canvas-note-card-body) 或右侧富文本编辑器 (#rich-editor) 直接划词标红/标绿/高亮/加粗/斜体
    const sel = window.getSelection();
    const activeInlineBody = (sel && sel.rangeCount > 0 && sel.anchorNode)
        ? (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement)?.closest?.(".canvas-note-card-body[contenteditable='true']")
        : null;
    const inRichEditor = !!(richEditor && (previewMode === "live") && sel && sel.anchorNode && richEditor.contains(sel.anchorNode));

    // 核心判定：用户是否在富文本区高亮划选了具体的某些词句（选区非空且长度大于0）
    const hasTextRange = !!(sel && sel.rangeCount > 0 && !sel.isCollapsed && sel.toString().trim().length > 0);
    const isInlineWordFormatting = (activeInlineBody || inRichEditor) && hasTextRange;

    // OneNote 经典表格插入与扩展处理
    if (format === "table") {
        const activeCell = sel && sel.anchorNode
            ? (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement)?.closest?.("td, th")
            : null;

        // 场景 A: 已经在单元格内，向下插入新行并跳转
        if (activeCell) {
            const activeTr = activeCell.closest("tr");
            const colCount = activeTr ? activeTr.children.length : 2;
            const newTr = document.createElement("tr");
            for (let c = 0; c < colCount; c++) {
                const td = document.createElement("td");
                td.innerHTML = "<br>";
                newTr.appendChild(td);
            }
            if (activeTr) {
                activeTr.parentNode.insertBefore(newTr, activeTr.nextSibling);
            }
            if (activeInlineBody && selectedNode) {
                selectedNode.content = htmlToSafeMarkdown(activeInlineBody.innerHTML);
                if (richEditor) richEditor.innerHTML = renderMarkdownToHTML(selectedNode.content);
            } else if (inRichEditor && selectedNode) {
                selectedNode.content = htmlToSafeMarkdown(richEditor.innerHTML);
            }
            scheduleSaveGraph(true);
            const firstTd = newTr.firstElementChild;
            if (firstTd && sel) {
                const r = document.createRange();
                r.selectNodeContents(firstTd);
                r.collapse(true);
                sel.removeAllRanges();
                sel.addRange(r);
            }
            showToast("▦ 已在下方插入新行");
            return;
        }

        // 场景 B: 正在编辑卡片文字，插入 2x2 表格
        if (activeInlineBody || inRichEditor) {
            const tableHtml = `<table class="canvas-card-table"><thead><tr><th>列 1</th><th>列 2</th></tr></thead><tbody><tr><td><br></td><td><br></td></tr></tbody></table><br>`;
            document.execCommand("insertHTML", false, tableHtml);
            if (activeInlineBody && selectedNode) {
                selectedNode.content = htmlToSafeMarkdown(activeInlineBody.innerHTML);
                if (richEditor) richEditor.innerHTML = renderMarkdownToHTML(selectedNode.content);
            } else if (inRichEditor && selectedNode) {
                selectedNode.content = htmlToSafeMarkdown(richEditor.innerHTML);
            }
            scheduleSaveGraph(true);
            showToast("▦ 已插入 OneNote 风格卡片表格 (按 Tab 跳格，按 Enter 换行)");
            return;
        }

        // 场景 C: 选中了卡片但未进入文字光标，直接向卡片内容追加表格
        if (selectedNode) {
            const tableMd = `\n\n| 列 1 | 列 2 |\n| --- | --- |\n| 内容 1 | 内容 2 |\n`;
            selectedNode.content = (selectedNode.content || "") + tableMd;
            renderEditor();
            updateD3Graph();
            renderPositions();
            scheduleSaveGraph(true);
            showToast("▦ 已为卡片插入表格");
            return;
        }
    }

    // 分支 1：划词局部格式化 —— 仅改变被选中的具体字词
    if (isInlineWordFormatting) {
        switch (format) {
            case "handwriting":
                const range = sel.getRangeAt(0);
                let container = range.commonAncestorContainer;
                if (container.nodeType === 3) container = container.parentElement;
                const existingSpan = container ? container.closest(".font-handwriting") : null;
                if (existingSpan) {
                    const parent = existingSpan.parentNode;
                    while (existingSpan.firstChild) {
                        parent.insertBefore(existingSpan.firstChild, existingSpan);
                    }
                    parent.removeChild(existingSpan);
                } else {
                    const span = document.createElement("span");
                    span.className = "font-handwriting";
                    try {
                        range.surroundContents(span);
                    } catch (err) {
                        const frag = range.extractContents();
                        span.appendChild(frag);
                        range.insertNode(span);
                    }
                }
                break;
            case "bold": document.execCommand("bold"); break;
            case "italic": document.execCommand("italic"); break;
            case "underline": document.execCommand("underline"); break;
            case "strike": document.execCommand("strikeThrough"); break;
            case "highlight":
                try {
                    if (!document.execCommand("hiliteColor", false, "#fef08a")) {
                        document.execCommand("backColor", false, "#fef08a");
                    }
                } catch (e) {
                    document.execCommand("backColor", false, "#fef08a");
                }
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
                const cRange = sel.getRangeAt(0);
                const codeEl = document.createElement("code");
                codeEl.style.cssText = "background:rgba(99,102,241,0.15); padding:2px 4px; border-radius:3px; font-family:monospace;";
                cRange.surroundContents(codeEl);
                break;
            case "heading": document.execCommand("formatBlock", false, "h1"); break;
            case "quote": document.execCommand("formatBlock", false, "blockquote"); break;
            case "bullet": document.execCommand("insertUnorderedList"); break;
            case "ordered": document.execCommand("insertOrderedList"); break;
            case "clear":
                document.execCommand("removeFormat");
                break;
            case "link":
                const url = prompt("请输入链接 URL:", "https://");
                if (url) document.execCommand("createLink", false, url);
                break;
            default: return;
        }

        // 划词修改后立即同步到底层数据 (v3.5.4 精确保留卡片标题行内高亮与颜色)
        if (selectedNode) {
            if (activeInlineBody) {
                selectedNode.label = serializeCardLabelFromHTML(activeInlineBody.innerHTML);
                const isContentEmpty = !selectedNode.content || !selectedNode.content.trim() || selectedNode.content.includes("点击编辑 Markdown 内容...");
                if (isContentEmpty) {
                    selectedNode.content = `# ${selectedNode.label}\n\n`;
                }
                if (richEditor) richEditor.innerHTML = renderMarkdownToHTML(selectedNode.content);
            } else if (richEditor) {
                selectedNode.content = htmlToSafeMarkdown(richEditor.innerHTML);
            }
            const mdEl = document.getElementById("md-textarea");
            if (mdEl) mdEl.value = selectedNode.content;
            scheduleSaveGraph(true);
        }
        return;
    }

    // 分支 2：卡片/框框级整体格式化 —— 没有划选具体字词，格式化直接作用于整个框框内的全部文字！
    let targetNodes = [];
    if (selectedNodeIds && selectedNodeIds.size > 0) {
        targetNodes = nodes.filter(n => selectedNodeIds.has(n.id));
    }
    if (targetNodes.length === 0 && selectedNode) {
        targetNodes = [selectedNode];
    }
    if (targetNodes.length === 0 && activeInlineBody) {
        const grp = activeInlineBody.closest(".node-group");
        if (grp) {
            const d = d3.select(grp).datum();
            if (d) targetNodes = [d];
        }
    }

    if (targetNodes.length === 0) return;

    switch (format) {
        case "bold": {
            const willBold = !targetNodes.every(n => n.isBold);
            targetNodes.forEach(n => { n.isBold = willBold; });
            showToast(willBold ? "B 已将整个框内文字设为粗体" : "已取消整个框内粗体");
            break;
        }
        case "italic": {
            const willItalic = !targetNodes.every(n => n.isItalic);
            targetNodes.forEach(n => { n.isItalic = willItalic; });
            showToast(willItalic ? "I 已将整个框内文字设为斜体" : "已取消整个框内斜体");
            break;
        }
        case "underline": {
            const willUnderline = !targetNodes.every(n => n.isUnderline);
            targetNodes.forEach(n => { n.isUnderline = willUnderline; });
            showToast(willUnderline ? "U 已为整个框内文字添加下划线" : "已取消整个框内下划线");
            break;
        }
        case "strike": {
            const willStrike = !targetNodes.every(n => n.isStrike);
            targetNodes.forEach(n => { n.isStrike = willStrike; });
            showToast(willStrike ? "S 已为整个框内文字添加删除线" : "已取消整个框内删除线");
            break;
        }
        case "handwriting": {
            const willHw = !targetNodes.every(n => n.fontStyle === "handwriting");
            targetNodes.forEach(n => { n.fontStyle = willHw ? "handwriting" : ""; });
            showToast(willHw ? "✍️ 已将整个框内文字设为灵感批注手写体" : "已恢复默认印刷字体");
            break;
        }
        case "color-red": {
            const willRed = !targetNodes.every(n => n.textColor === "#ef4444");
            targetNodes.forEach(n => { n.textColor = willRed ? "#ef4444" : ""; });
            showToast(willRed ? "🔴 已将整个框内文字设为红色" : "已恢复默认文字颜色");
            break;
        }
        case "color-green": {
            const willGreen = !targetNodes.every(n => n.textColor === "#10b981");
            targetNodes.forEach(n => { n.textColor = willGreen ? "#10b981" : ""; });
            showToast(willGreen ? "🟢 已将整个框内文字设为绿色" : "已恢复默认文字颜色");
            break;
        }
        case "highlight": {
            const willHl = !targetNodes.every(n => n.isHighlight);
            targetNodes.forEach(n => { n.isHighlight = willHl; });
            showToast(willHl ? "🟡 已为整个框内文字添加荧光高亮" : "已取消整个框内高亮");
            break;
        }
        case "clear": {
            targetNodes.forEach(n => {
                n.isBold = false;
                n.isItalic = false;
                n.isUnderline = false;
                n.isStrike = false;
                n.fontStyle = "";
                n.textColor = "";
                delete n.cardBgColor;
                n.color = null;
                n.customFontSize = null;
            });
            showToast("🧹 已清除整个框内的格式与底色");
            break;
        }
        default:
            return;
    }

    // 立即刷新画布渲染与右侧详情视图
    refreshNodeStyles();
    if (activeInlineBody && selectedNode) {
        activeInlineBody.style.fontWeight = selectedNode.isBold ? "700" : "";
        activeInlineBody.style.fontStyle = selectedNode.isItalic ? "italic" : "";
        activeInlineBody.style.textDecoration = selectedNode.isUnderline ? "underline" : (selectedNode.isStrike ? "line-through" : "");
        activeInlineBody.style.color = selectedNode.textColor || "";
    }
    renderEditor();
    scheduleSaveGraph(true);
    if (typeof updateQuickBubblePosition === "function") updateQuickBubblePosition();
}

function renderAll() {
    renderFlowStream();
    renderSidebarNotesList();
    renderEditor();
}

function cleanHTMLSpill(text) {
    if (!text) return "";
    return text
        .replace(/<br\s*\/?>/gi, "\n")
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
            
            if (tag === "table") {
                const rows = Array.from(node.querySelectorAll("tr"));
                if (rows.length === 0) return "";
                const tableMdLines = [];
                let hasHeader = false;
                
                rows.forEach((tr, rIdx) => {
                    const cells = Array.from(tr.children).filter(c => {
                        const cTag = c.tagName.toLowerCase();
                        return cTag === "th" || cTag === "td";
                    });
                    if (cells.length === 0) return;
                    
                    const isThRow = cells.some(c => c.tagName.toLowerCase() === "th") || rIdx === 0;
                    const cellTexts = cells.map(cell => {
                        let cText = Array.from(cell.childNodes).map(serializeNode).join("").trim();
                        cText = cText.replace(/\r?\n+/g, " ").replace(/\|/g, "\\|");
                        return cText || " ";
                    });
                    
                    tableMdLines.push(`| ${cellTexts.join(" | ")} |`);
                    
                    if (isThRow && !hasHeader) {
                        hasHeader = true;
                        const delimiter = cells.map(() => "---").join(" | ");
                        tableMdLines.push(`| ${delimiter} |`);
                    }
                });
                
                if (!hasHeader && tableMdLines.length > 0) {
                    const colCount = rows[0].querySelectorAll("th, td").length || 2;
                    const delimiter = Array(colCount).fill("---").join(" | ");
                    tableMdLines.splice(1, 0, `| ${delimiter} |`);
                }
                
                return `\n\n${tableMdLines.join("\n")}\n\n`;
            }

            if (tag === "thead" || tag === "tbody" || tag === "tr" || tag === "th" || tag === "td") {
                return Array.from(node.childNodes).map(serializeNode).join("");
            }

            if (tag === "ul") {
                const items = Array.from(node.childNodes).map(child => {
                    if (child.nodeType === 1 && child.querySelector) {
                        const cb = child.querySelector('input[type="checkbox"]');
                        if (cb) {
                            const isChecked = cb.checked || cb.hasAttribute("checked");
                            const text = serializeNode(child).trim().replace(/^(\[[ xX]\]|[•·▪⁃‣\-\*])[ \t]*/, "");
                            return `- [${isChecked ? "x" : " "}] ${text}`;
                        }
                    }
                    const text = serializeNode(child).trim();
                    if (!text) return "";
                    const cleanText = text.replace(/^[•·▪⁃‣\-\*][ \t]*/, "");
                    return `- ${cleanText}`;
                }).filter(Boolean).join("\n");
                return `\n${items}\n`;
            }
            
            if (tag === "ol") {
                const startAttr = node.getAttribute("start");
                let idx = startAttr ? parseInt(startAttr, 10) : 1;
                const items = Array.from(node.childNodes).map(child => {
                    const text = serializeNode(child).trim();
                    if (!text) return "";
                    let currentNum = idx++;
                    if (child.getAttribute && child.getAttribute("value")) {
                        currentNum = parseInt(child.getAttribute("value"), 10);
                        idx = currentNum + 1;
                    }
                    const cleanText = text.replace(/^(\d+\.|[•·▪⁃‣\-\*])[ \t]*/, "");
                    return `${currentNum}. ${cleanText}`;
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

            if (tag === "span" && node.classList && node.classList.contains("font-handwriting")) {
                result = `<span class="font-handwriting">${result}</span>`;
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
    
    // 保护 <span class="font-handwriting">, <span style="color:..."> 和 <u> 标签不被 escapeHTML 破坏
    // 我们只替换标签本身，不替换内容，从而完美支持嵌套！
    let protectedText = cleaned
        .replace(/<span class=["']font-handwriting["']>/gi, '___HANDWRITING_START___')
        .replace(/<span style=["']color:\s*([^"'>]+)["']?>/gi, '___SPAN_START_$1___')
        .replace(/<\/span>/gi, '___SPAN_END___')
        .replace(/<u>/gi, '___U_START___')
        .replace(/<\/u>/gi, '___U_END___');

    let html = escapeHTML(protectedText);

    // 解析 Markdown 表格与列表 (包含 To-Do 复选框 - [ ] / - [x]、实心圆点 • 和数字序号 1.)
    const lines = html.split('\n');
    let inUl = false, inOl = false;
    let listProcessed = [];
    let taskCounter = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // 优先检查 Markdown GFM 表格语法
        const nextLine = (i + 1 < lines.length) ? lines[i + 1] : "";
        const isTableHead = line.includes("|") && !line.trim().startsWith("#") && !line.trim().startsWith("- [");
        const isNextDelim = isTableHead && /^\|?(\s*:?-+:?\s*\|?)+\s*$/.test(nextLine.trim()) && nextLine.includes("-");

        if (isTableHead && isNextDelim) {
            if (inUl) { listProcessed.push("</ul>"); inUl = false; }
            if (inOl) { listProcessed.push("</ol>"); inOl = false; }

            const parseCells = (rStr) => {
                let s = rStr.trim();
                if (s.startsWith("|")) s = s.slice(1);
                if (s.endsWith("|")) s = s.slice(0, -1);
                s = s.replace(/\\\|/g, "___ESCAPED_PIPE___");
                return s.split("|").map(c => c.replace(/___ESCAPED_PIPE___/g, "|").trim());
            };

            const headerCells = parseCells(line);
            const colCount = Math.max(1, headerCells.length);
            const bodyRows = [];
            let j = i + 2;
            while (j < lines.length) {
                const cur = lines[j];
                if (!cur || !cur.trim() || !cur.includes("|")) break;
                if (/^#{1,6}\s/.test(cur.trim())) break;
                const bCells = parseCells(cur);
                bodyRows.push(bCells);
                j++;
            }
            i = j - 1;

            if (bodyRows.length === 0) {
                bodyRows.push(Array(colCount).fill(""));
            }

            let tHtml = '<table class="canvas-card-table"><thead><tr>';
            headerCells.forEach(hc => {
                tHtml += `<th>${hc || "<br>"}</th>`;
            });
            tHtml += '</tr></thead><tbody>';
            bodyRows.forEach(row => {
                tHtml += '<tr>';
                for (let c = 0; c < colCount; c++) {
                    const val = (row[c] !== undefined && row[c] !== "") ? row[c] : "<br>";
                    tHtml += `<td>${val}</td>`;
                }
                tHtml += '</tr>';
            });
            tHtml += '</tbody></table>';
            listProcessed.push(tHtml);
            continue;
        }

        const isTask = /^[ \t]*(?:[•·▪⁃‣\-\*][ \t]+)?\[([ xX])\][ \t]+(.*)/.exec(line);
        const isBullet = !isTask && /^[ \t]*[•·▪⁃‣\-\*][ \t]+(.*)/.exec(line);
        const isOrdered = /^[ \t]*(\d+)\.[ \t]+(.*)/.exec(line);

        if (isTask) {
            if (inOl) { listProcessed.push("</ol>"); inOl = false; }
            if (!inUl) { listProcessed.push("<ul>"); inUl = true; }
            const checked = isTask[1].toLowerCase() === "x";
            const tIdx = taskCounter++;
            listProcessed.push(`<li class="task-list-item ${checked ? "task-done" : ""}"><input type="checkbox" class="canvas-todo-checkbox" data-task-index="${tIdx}" ${checked ? "checked" : ""}><span class="task-item-text">${isTask[2]}</span></li>`);
        } else if (isBullet) {
            if (inOl) { listProcessed.push("</ol>"); inOl = false; }
            if (!inUl) { listProcessed.push("<ul>"); inUl = true; }
            listProcessed.push(`<li>${isBullet[1]}</li>`);
        } else if (isOrdered) {
            if (inUl) { listProcessed.push("</ul>"); inUl = false; }
            const startNum = parseInt(isOrdered[1], 10);
            if (!inOl) { 
                listProcessed.push(`<ol start="${startNum}">`); 
                inOl = true; 
            }
            listProcessed.push(`<li value="${startNum}">${isOrdered[2]}</li>`);
        } else {
            if (inUl) { listProcessed.push("</ul>"); inUl = false; }
            if (inOl) { listProcessed.push("</ol>"); inOl = false; }
            listProcessed.push(line);
        }
    }
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

    // 还原受保护的颜色 span、手写体 span 与 u 标签
    html = html
        .replace(/~✍️([\s\S]*?)✍️~/g, '<span class="font-handwriting">$1</span>')
        .replace(/___HANDWRITING_START___/g, '<span class="font-handwriting">')
        .replace(/___SPAN_START_(.*?)___/g, '<span style="color:$1">')
        .replace(/___SPAN_END___/g, '</span>')
        .replace(/___U_START___/g, '<u>')
        .replace(/<\/u>/gi, '</u>');

    // 清理 <br> 紧随 list 与 table 标签后的多余换行
    html = html
        .replace(/<\/ul><br>/gi, "</ul>")
        .replace(/<\/ol><br>/gi, "</ol>")
        .replace(/<\/li><br>/gi, "</li>")
        .replace(/<ul><br>/gi, "<ul>")
        .replace(/<ol><br>/gi, "<ol>")
        .replace(/<\/table><br>/gi, "</table>")
        .replace(/<br><table/gi, "<table");

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

        titleInput.value = stripFormattingToPlainText(selectedNode.label);
        titleInput.disabled = false;
        mdTextarea.value = cleanContent;
        richEditor.innerHTML = renderMarkdownToHTML(cleanContent);
        previewPanel.innerHTML = renderMarkdownToHTML(cleanContent);

        if (richEditor) {
            richEditor.classList.toggle("is-card-bold", !!selectedNode.isBold);
            richEditor.classList.toggle("is-card-italic", !!selectedNode.isItalic);
            richEditor.classList.toggle("is-card-underline", !!selectedNode.isUnderline);
            richEditor.classList.toggle("is-handwriting", selectedNode.fontStyle === "handwriting");
            richEditor.style.color = selectedNode.textColor || "";
        }
        if (previewPanel) {
            previewPanel.classList.toggle("is-card-bold", !!selectedNode.isBold);
            previewPanel.classList.toggle("is-card-italic", !!selectedNode.isItalic);
            previewPanel.classList.toggle("is-card-underline", !!selectedNode.isUnderline);
            previewPanel.classList.toggle("is-handwriting", selectedNode.fontStyle === "handwriting");
            previewPanel.style.color = selectedNode.textColor || "";
        }

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
    const countEl = document.getElementById("flowCount");
    const tagSelect = document.getElementById("flowTagFilter");
    if (!listEl) return;

    const allTags = new Set();
    flowStream.forEach(item => {
        const matches = String(item.content || "").match(/#[^\s#]+/g) || [];
        matches.forEach(t => allTags.add(t));
    });
    if (tagSelect) {
        const currentVal = tagSelect.value || "all";
        tagSelect.innerHTML = `<option value="all">全部分类/标签</option>` +
            Array.from(allTags).map(t => `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`).join("");
        if (allTags.has(currentVal)) tagSelect.value = currentVal;
    }

    const activeTag = tagSelect ? tagSelect.value : "all";
    const filtered = activeTag === "all"
        ? flowStream
        : flowStream.filter(item => String(item.content || "").includes(activeTag));

    if (countEl) countEl.textContent = String(filtered.length);
    listEl.innerHTML = "";

    filtered.forEach(item => {
        const card = document.createElement("div");
        card.className = "flow-card";
        card.innerHTML = `
            <div class="flow-card-meta">
                <span>⚡ 思考流</span>
                <div style="display:flex; align-items:center; gap:8px;">
                    <span>${escapeHTML(item.timestamp || "")}</span>
                    <button class="flow-to-canvas-btn" title="一键将这条灵感发送为脑图画布上的自由卡片">🚀 送入脑图</button>
                    <button class="flow-delete-btn" title="删除此条心流">×</button>
                </div>
            </div>
            <div class="flow-card-content">${renderMarkdownToHTML(item.content || "")}</div>
        `;
        const sendBtn = card.querySelector(".flow-to-canvas-btn");
        if (sendBtn) {
            sendBtn.addEventListener("click", () => sendFlowItemToCanvas(item));
        }
        const delBtn = card.querySelector(".flow-delete-btn");
        if (delBtn) {
            delBtn.addEventListener("click", () => {
                flowStream = flowStream.filter(f => f.id !== item.id);
                saveFlowsToStorage();
                renderFlowStream();
                showToast("🗑️ 已删除心流记录");
            });
        }
        listEl.appendChild(card);
    });
}

function renderSidebarNotesList() {
    const container = document.getElementById("notesListItems");
    if (!container) return;
    const filterInput = document.getElementById("noteListFilter");
    const q = filterInput ? filterInput.value.trim().toLowerCase() : "";
    container.innerHTML = "";

    nodes.forEach(note => {
        if (q) {
            const hay = `${note.label || ""} ${note.content || ""}`.toLowerCase();
            if (!hay.includes(q)) return;
        }
        const item = document.createElement("div");
        item.className = `note-item ${selectedNode && selectedNode.id === note.id ? "active" : ""}`;
        const star = note.isFocus ? "⭐ " : "";
        item.innerHTML = `<div class="note-item-title">${star}${escapeHTML(note.label)}</div>`;
        item.addEventListener("click", () => {
            selectedNode = note;
            selectedNodeIds = new Set([note.id]);
            renderSidebarNotesList();
            renderEditor();
            syncDeepNotePaneWithSelectedNode();
        });
        container.appendChild(item);
    });
    syncDeepNotePaneWithSelectedNode();
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
        if (ghSyncText) ghSyncText.textContent = "⏳ GitHub 同步中...";
    } else {
        if (syncBtn) { syncBtn.disabled = false; syncBtn.innerHTML = "💾 同步"; }
        if (pullBtn) { pullBtn.disabled = false; }
        if (ghSyncText) ghSyncText.textContent = state === "ok" ? `🟢 已同步 (${nodes.length}卡片)` : "GitHub 云端同步设置";
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
            flowStream: flowStream,
            inkStrokes: inkStrokes,
            pomoEvidenceLog: (window.pomoEvidenceLog && Array.isArray(window.pomoEvidenceLog)) ? window.pomoEvidenceLog : JSON.parse(localStorage.getItem("flownotes_pomo_evidence_log") || "[]"),
            pomoSettings: (window.pomoSettings) ? window.pomoSettings : JSON.parse(localStorage.getItem("flownotes_pomo_settings") || "{}")
        };
        allMapsMemoryCache[activeMapId] = allMapsData[activeMapId];

        const syncTimestampMs = Date.now();
        const localPayload = JSON.stringify({
            version: "FlowNotes-MultiMap-3.5.0",
            updatedAtMs: syncTimestampMs,
            activeMapId: activeMapId,
            notebooksManifest: notebooksManifest,
            sectionsManifest: sectionsManifest,
            mapsManifest: mapsManifest,
            allMapsData: allMapsData,
            nodes: nodes,
            links: cleanLinks(),
            flowStream: flowStream,
            inkStrokes: inkStrokes,
            pomoEvidenceLog: (window.pomoEvidenceLog && Array.isArray(window.pomoEvidenceLog)) ? window.pomoEvidenceLog : JSON.parse(localStorage.getItem("flownotes_pomo_evidence_log") || "[]"),
            pomoSettings: (window.pomoSettings) ? window.pomoSettings : JSON.parse(localStorage.getItem("flownotes_pomo_settings") || "{}")
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

// --- v3.4.0 Excalidraw 格式与思维导图导入引擎 ---
function importExcalidrawFile(parsed, fileName = "") {
    if (!parsed || !Array.isArray(parsed.elements)) {
        showToast("❌ 非有效的 Excalidraw 格式文件");
        return false;
    }

    const elements = parsed.elements.filter(el => !el.isDeleted);
    const files = parsed.files || {};
    const importedNodes = [];
    const elementToNodeId = new Map();
    const nowTs = Date.now();

    // 1. 智能推断思维导图主题名称
    let detectedTitle = "";
    const titleCandidates = elements.filter(el => el.type === "text" && (el.fontSize >= 20 || (el.y < 300 && el.fontSize >= 16)));
    if (titleCandidates.length > 0) {
        titleCandidates.sort((a, b) => (b.fontSize || 0) - (a.fontSize || 0));
        detectedTitle = titleCandidates[0].text.split("\n")[0].trim().slice(0, 32);
    }
    const cleanFileName = (fileName || "").replace(/\.(excalidraw|json|pdf)$/i, "").trim();
    const mapTitle = detectedTitle ? `${detectedTitle} (Excalidraw 导入)` : (cleanFileName ? `${cleanFileName} (导图)` : `Excalidraw 导入 ${mapsManifest.length + 1}`);

    // 2. 转换 Text 文本卡片与 Image 流程图卡片
    elements.forEach((el, idx) => {
        if (el.type === "text") {
            const rawText = (el.text || "").trim();
            if (!rawText) return;

            const firstLine = rawText.split("\n")[0].trim() || "卡片";
            const nodeId = `ex_${nowTs}_${idx}`;
            elementToNodeId.set(el.id, nodeId);

            // 识别局部文字标色 (同 OneNote: 仅改变内部文字颜色，绝不改变整个卡片框底色)
            let styledContent = (el.customData && el.customData.richHtml) ? el.customData.richHtml : rawText;
            if (!el.customData || !el.customData.richHtml) {
                const stroke = (el.strokeColor || "").toLowerCase();
                if (stroke === "#e03131" || stroke === "#fa0000" || stroke === "#c92a2a" || stroke === "#ff8787") {
                    styledContent = `<span style="color:#ef4444">${rawText}</span>`;
                } else if (stroke === "#2f9e44" || stroke === "#00b050" || stroke === "#2b8a3e" || stroke === "#51cf66") {
                    styledContent = `<span style="color:#10b981">${rawText}</span>`;
                } else if (stroke === "#1971c2" || stroke === "#1c7ed6" || stroke === "#339af0") {
                    styledContent = `<span style="color:#38bdf8">${rawText}</span>`;
                }
            }

            const isSoftWrapped = !!(el.customData && el.customData.softWrapped);
            const isHandwriting = !!(el.customData && el.customData.fontStyle === "handwriting") ||
                (el.fontFamily === 4) ||
                (styledContent && styledContent.includes("font-handwriting"));
            const fontStyle = isHandwriting ? "handwriting" : null;
            const preferredW = (el.customData && typeof el.customData.preferredWidth === "number")
                ? el.customData.preferredWidth
                : (isSoftWrapped ? Math.round((el.width || 240) + 38) : null);
            const customW = null; // v3.5.8 文本卡片默认自然流式自适应包裹，仅当用户显式拖拽调整手柄时才锁定固定宽度
            const customFont = (typeof el.fontSize === "number" && el.fontSize >= 20 && el.fontSize <= 64) ? el.fontSize : null;

            const firstLineStyled = styledContent.split("\n")[0].trim().slice(0, 160) || firstLine;
            importedNodes.push({
                id: nodeId,
                label: firstLineStyled,
                content: styledContent,
                parentId: null,
                order: idx,
                createdAt: nowTs + idx,
                x: Math.round(el.x + (el.width || 120) / 2),
                y: Math.round(el.y + (el.height || 40) / 2),
                fx: Math.round(el.x + (el.width || 120) / 2),
                fy: Math.round(el.y + (el.height || 40) / 2),
                fontStyle: fontStyle,
                customWidth: customW,
                customHeight: null,
                customFontSize: customFont
            });
        } else if (el.type === "image") {
            const fileData = files[el.fileId];
            if (fileData && fileData.dataURL) {
                const nodeId = `ex_img_${nowTs}_${idx}`;
                elementToNodeId.set(el.id, nodeId);
                const customW = Math.round(Math.max(120, Math.min(960, el.width || 240)));
                const customH = Math.round(Math.max(40, Math.min(820, el.height || 120)));

                importedNodes.push({
                    id: nodeId,
                    label: "📸 流程/图解卡片",
                    content: `![图解](${fileData.dataURL})`,
                    isImage: true,
                    imageUrl: fileData.dataURL,
                    parentId: null,
                    order: idx,
                    createdAt: nowTs + idx,
                    x: Math.round(el.x + (el.width || 200) / 2),
                    y: Math.round(el.y + (el.height || 80) / 2),
                    fx: Math.round(el.x + (el.width || 200) / 2),
                    fy: Math.round(el.y + (el.height || 80) / 2),
                    customWidth: customW,
                    customHeight: customH
                });
            }
        }
    });

    // 3. 转换箭头连线 (支持绑定箭头与空间就近吸附箭头)
    const importedLinks = [];
    const arrows = elements.filter(el => el.type === "arrow" || el.type === "line");

    arrows.forEach(arr => {
        let sourceId = null;
        let targetId = null;

        if (arr.startBinding && arr.startBinding.elementId) {
            sourceId = elementToNodeId.get(arr.startBinding.elementId);
        }
        if (arr.endBinding && arr.endBinding.elementId) {
            targetId = elementToNodeId.get(arr.endBinding.elementId);
        }

        if (!sourceId || !targetId) {
            const pts = arr.points || [[0, 0], [arr.width || 50, arr.height || 50]];
            const pStart = pts[0];
            const pEnd = pts[pts.length - 1];
            const startX = arr.x + pStart[0];
            const startY = arr.y + pStart[1];
            const endX = arr.x + pEnd[0];
            const endY = arr.y + pEnd[1];

            if (!sourceId) {
                let minDist = 220;
                importedNodes.forEach(n => {
                    const d = Math.hypot(n.x - startX, n.y - startY);
                    if (d < minDist) { minDist = d; sourceId = n.id; }
                });
            }
            if (!targetId) {
                let minDist = 220;
                importedNodes.forEach(n => {
                    if (n.id === sourceId) return;
                    const d = Math.hypot(n.x - endX, n.y - endY);
                    if (d < minDist) { minDist = d; targetId = n.id; }
                });
            }
        }

        if (sourceId && targetId && sourceId !== targetId) {
            const exists = importedLinks.some(l => (l.source === sourceId && l.target === targetId) || (l.source === targetId && l.target === sourceId));
            if (!exists) {
                importedLinks.push({
                    source: sourceId,
                    target: targetId,
                    type: "relation",
                    label: ""
                });
            }
        }
    });

    if (importedNodes.length === 0) {
        showToast("⚠️ 该 Excalidraw 文件未包含可提取的文本或图片卡片");
        return false;
    }

    // 4. 创建独立新思维导图项目，绝不冲掉用户现有导图
    const newMapId = `map_${nowTs}`;
    const newMapMeta = {
        id: newMapId,
        title: mapTitle,
        icon: "🎨",
        notebookId: "nb_default",
        sectionId: "sec_literature",
        nodeCount: importedNodes.length,
        updatedAt: new Date().toLocaleTimeString('zh-CN', { hour12: false })
    };

    mapsManifest.push(newMapMeta);
    safeLocalStorageSet("flownotes_maps_manifest", JSON.stringify(mapsManifest));

    const newMapData = {
        nodes: importedNodes,
        links: importedLinks,
        flowStream: [],
        inkStrokes: []
    };
    allMapsMemoryCache[newMapId] = newMapData;
    safeLocalStorageSet(`flownotes_map_data_${newMapId}`, JSON.stringify(newMapData));

    FlowNotesIDB.set("flownotes_full_bundle", {
        updatedAtMs: nowTs,
        activeMapId: newMapId,
        notebooksManifest: notebooksManifest,
        sectionsManifest: sectionsManifest,
        mapsManifest: mapsManifest,
        allMapsData: allMapsMemoryCache
    });

    switchActiveMap(newMapId);
    setTimeout(() => {
        fitCanvasToAllNodes();
        showToast(`🎉 成功导入 Excalidraw 导图【${mapTitle}】(共 ${importedNodes.length} 张卡片，${importedLinks.length} 条连线)！`);
    }, 180);

    return true;
}

function loadDemoExcalidrawMap(sourceName = "1.pdf") {
    fetch("/1.excalidraw")
        .then(res => {
            if (!res.ok) throw new Error("无法读取 /1.excalidraw 资源");
            return res.json();
        })
        .then(parsed => {
            importExcalidrawFile(parsed, sourceName);
        })
        .catch(err => {
            showToast("❌ 载入 Excalidraw 示范导图失败: " + err.message);
        });
}

// 统一解析并应用从 GitHub Gist 或本地 JSON 导入的备份数据
function applyParsedBackupData(parsed, fileName = "") {
    if (!parsed) return;
    if (parsed.type === "excalidraw" || Array.isArray(parsed.elements)) {
        return importExcalidrawFile(parsed, fileName);
    }
    if (parsed.notebooksManifest && Array.isArray(parsed.notebooksManifest)) {
        notebooksManifest = parsed.notebooksManifest;
        safeLocalStorageSet("flownotes_notebooks_manifest", JSON.stringify(notebooksManifest));
    }
    if (parsed.sectionsManifest && Array.isArray(parsed.sectionsManifest)) {
        sectionsManifest = parsed.sectionsManifest;
        safeLocalStorageSet("flownotes_sections_manifest", JSON.stringify(sectionsManifest));
    }
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
        inkStrokes = Array.isArray(parsed.inkStrokes) ? parsed.inkStrokes : [];
        sanitizeGraph();
        allMapsMemoryCache[activeMapId] = { nodes, links: cleanLinks(), flowStream, inkStrokes };
    }

    // 恢复与合并番茄专注行动证据库 (v3.4.9 多端云同步)
    const incomingPomoLog = parsed.pomoEvidenceLog || (parsed.allMapsData && parsed.activeMapId && parsed.allMapsData[parsed.activeMapId]?.pomoEvidenceLog);
    if (incomingPomoLog && Array.isArray(incomingPomoLog) && incomingPomoLog.length > 0) {
        try {
            const localRaw = localStorage.getItem("flownotes_pomo_evidence_log");
            const localLog = localRaw ? JSON.parse(localRaw) : [];
            const evMap = new Map();
            localLog.forEach(it => { if (it && it.id) evMap.set(it.id, it); });
            incomingPomoLog.forEach(it => { if (it && it.id) evMap.set(it.id, it); });
            const mergedLog = Array.from(evMap.values()).sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
            safeLocalStorageSet("flownotes_pomo_evidence_log", JSON.stringify(mergedLog));
            if (typeof FlowNotesIDB !== "undefined") {
                FlowNotesIDB.set("flownotes_pomo_evidence_log", mergedLog);
            }
            if (window.pomoEvidenceLog) {
                window.pomoEvidenceLog.length = 0;
                mergedLog.forEach(item => window.pomoEvidenceLog.push(item));
            }
            if (typeof window.renderEvidenceDashboard === "function") {
                window.renderEvidenceDashboard();
            }
        } catch (e) {
            console.warn("[Pomo] Merge cloud evidence failed:", e);
        }
    }

    const stampMs = parsed.updatedAtMs || Date.now();
    FlowNotesIDB.set("flownotes_full_bundle", {
        updatedAtMs: stampMs,
        activeMapId: activeMapId,
        notebooksManifest: notebooksManifest,
        sectionsManifest: sectionsManifest,
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
    if (!current) {
        badge.innerHTML = "<span>🧠 思维导图</span>";
        return;
    }
    const sec = sectionsManifest.find(s => s.id === current.sectionId);
    const nb = notebooksManifest.find(n => n.id === (sec ? sec.notebookId : (current.notebookId || "nb_default")));
    const secColor = sec?.color || "#38bdf8";

    badge.className = "current-map-badge onenote-breadcrumb";
    badge.innerHTML = `
        <span class="tree-sec-pill" style="background:${secColor}; box-shadow:0 0 6px ${secColor};"></span>
        <span class="nb-title" style="opacity:0.85; max-width:90px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${nb ? (nb.icon || "📔") + " " + escapeHTML(nb.title) : "📔 笔记本"}</span>
        <span class="bc-sep">/</span>
        <span class="sec-tag" style="color:${secColor}; font-weight:600; max-width:95px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">📑 ${sec ? escapeHTML(sec.title) : "分区"}</span>
        <span class="bc-sep">/</span>
        <span class="page-title" style="font-weight:700; max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${current.icon || "📄"} ${escapeHTML(current.title)}</span>
    `;
    badge.title = "点击打开 OneNote 笔记本中心管理库";
}

function renderOrganizerUI(searchQuery = organizerTreeFilter) {
    updateCurrentMapBadge();
    const container = document.getElementById("organizerMapList");
    if (!container) return;
    container.innerHTML = "";

    const query = (searchQuery || "").trim().toLowerCase();

    // 统计数据
    let totalCards = 0;
    mapsManifest.forEach(m => { totalCards += (m.nodeCount || 0); });
    const statsEl = document.getElementById("onenote-tree-stats");
    if (statsEl) {
        statsEl.textContent = `共 ${notebooksManifest.length} 个笔记本 · ${sectionsManifest.length} 个分区 · ${mapsManifest.length} 个页面 (${totalCards} 卡片)`;
    }

    // 遍历每一个笔记本 (Tier 1)
    notebooksManifest.forEach(nb => {
        const nbSecs = sectionsManifest.filter(s => s.notebookId === nb.id);
        const nbSecIds = new Set(nbSecs.map(s => s.id));
        const nbMaps = mapsManifest.filter(m => m.notebookId === nb.id || nbSecIds.has(m.sectionId));
        const nbTotalCards = nbMaps.reduce((acc, m) => acc + (m.nodeCount || 0), 0);

        // 搜索过滤检查
        const nbMatch = !query || nb.title.toLowerCase().includes(query);
        const anySecMatch = nbSecs.some(s => s.title.toLowerCase().includes(query));
        const anyMapMatch = nbMaps.some(m => m.title.toLowerCase().includes(query));

        if (query && !nbMatch && !anySecMatch && !anyMapMatch) {
            return; // 不符合过滤条件
        }

        const isNbExpanded = query ? true : expandedTreeNodes.has(nb.id);

        const nbGroup = document.createElement("div");
        nbGroup.className = "tree-nb-group";

        // 笔记本行 (Tier 1 Header)
        const nbItem = document.createElement("div");
        nbItem.className = "tree-nb-item";
        nbItem.innerHTML = `
            <span class="tree-caret ${isNbExpanded ? 'expanded' : ''}">▶</span>
            <span class="tree-nb-icon">${nb.icon || '📔'}</span>
            <span class="tree-nb-title" title="${escapeHTML(nb.title)}">${escapeHTML(nb.title)}</span>
            <span class="tree-count-badge">${nbMaps.length}页 / ${nbTotalCards}卡</span>
            <div class="tree-node-actions">
                <button class="tree-act-btn btn-add-sec" title="➕ 在此笔记本下新建彩色分区">📑+</button>
                <button class="tree-act-btn btn-rename-nb" title="✏️ 重命名笔记本">✏️</button>
                ${notebooksManifest.length > 1 ? '<button class="tree-act-btn btn-del-nb" title="🗑️ 删除笔记本" style="color:#f87171;">🗑️</button>' : ''}
            </div>
        `;

        // 展开/收起笔记本点击
        nbItem.addEventListener("click", (e) => {
            if (e.target.closest(".tree-node-actions")) return;
            if (expandedTreeNodes.has(nb.id)) {
                expandedTreeNodes.delete(nb.id);
            } else {
                expandedTreeNodes.add(nb.id);
            }
            safeLocalStorageSet("flownotes_tree_expanded", JSON.stringify([...expandedTreeNodes]));
            renderOrganizerUI(query);
        });

        // 笔记本按钮动作
        const addSecBtn = nbItem.querySelector(".btn-add-sec");
        if (addSecBtn) addSecBtn.addEventListener("click", (e) => { e.stopPropagation(); createSection(nb.id); });

        const renameNbBtn = nbItem.querySelector(".btn-rename-nb");
        if (renameNbBtn) renameNbBtn.addEventListener("click", (e) => { e.stopPropagation(); renameNotebook(nb.id); });

        const delNbBtn = nbItem.querySelector(".btn-del-nb");
        if (delNbBtn) delNbBtn.addEventListener("click", (e) => { e.stopPropagation(); deleteNotebook(nb.id); });

        nbGroup.appendChild(nbItem);

        // 如果展开，渲染其下所有彩色分区 (Tier 2)
        if (isNbExpanded) {
            nbSecs.forEach(sec => {
                const secMaps = mapsManifest.filter(m => m.sectionId === sec.id);
                const secMatch = !query || sec.title.toLowerCase().includes(query);
                const anyPageMatch = secMaps.some(m => m.title.toLowerCase().includes(query));

                if (query && !secMatch && !anyPageMatch && !nbMatch) {
                    return;
                }

                const isSecExpanded = query ? true : expandedTreeNodes.has(sec.id);

                const secGroup = document.createElement("div");
                secGroup.className = "tree-sec-group";

                const secItem = document.createElement("div");
                secItem.className = "tree-sec-item";
                secItem.innerHTML = `
                    <span class="tree-caret ${isSecExpanded ? 'expanded' : ''}">▶</span>
                    <span class="tree-sec-pill" style="background:${sec.color || '#38bdf8'}; box-shadow:0 0 6px ${sec.color || '#38bdf8'};"></span>
                    <span class="tree-sec-title" title="${escapeHTML(sec.title)}">${escapeHTML(sec.title)}</span>
                    <span class="tree-count-badge">${secMaps.length}页</span>
                    <div class="tree-node-actions">
                        <button class="tree-act-btn btn-add-page" title="➕ 在此分区下新建思维沙盘页面">📄+</button>
                        <button class="tree-act-btn btn-color-sec" title="🎨 点击循环切换分区主题色">🎨</button>
                        <button class="tree-act-btn btn-rename-sec" title="✏️ 重命名分区">✏️</button>
                        ${nbSecs.length > 1 ? '<button class="tree-act-btn btn-del-sec" title="🗑️ 删除分区" style="color:#f87171;">🗑️</button>' : ''}
                    </div>
                `;

                // 展开/收起分区点击
                secItem.addEventListener("click", (e) => {
                    if (e.target.closest(".tree-node-actions")) return;
                    if (expandedTreeNodes.has(sec.id)) {
                        expandedTreeNodes.delete(sec.id);
                    } else {
                        expandedTreeNodes.add(sec.id);
                    }
                    safeLocalStorageSet("flownotes_tree_expanded", JSON.stringify([...expandedTreeNodes]));
                    renderOrganizerUI(query);
                });

                // 分区按钮动作
                const addPageBtn = secItem.querySelector(".btn-add-page");
                if (addPageBtn) addPageBtn.addEventListener("click", (e) => { e.stopPropagation(); createNewMap("新思维沙盘", "📄", nb.id, sec.id); });

                const colorSecBtn = secItem.querySelector(".btn-color-sec");
                if (colorSecBtn) colorSecBtn.addEventListener("click", (e) => { e.stopPropagation(); cycleSectionColor(sec.id); });

                const renameSecBtn = secItem.querySelector(".btn-rename-sec");
                if (renameSecBtn) renameSecBtn.addEventListener("click", (e) => { e.stopPropagation(); renameSection(sec.id); });

                const delSecBtn = secItem.querySelector(".btn-del-sec");
                if (delSecBtn) delSecBtn.addEventListener("click", (e) => { e.stopPropagation(); deleteSection(sec.id); });

                secGroup.appendChild(secItem);

                // 如果分区展开，渲染其下所有思维沙盘页面 (Tier 3)
                if (isSecExpanded) {
                    const pageGroup = document.createElement("div");
                    pageGroup.className = "tree-page-group";

                    if (secMaps.length === 0) {
                        const emptyTip = document.createElement("div");
                        emptyTip.style.cssText = "font-size:11px; opacity:0.45; padding:4px 8px; font-style:italic;";
                        emptyTip.textContent = "空分区，点击上方 📄+ 新建页面";
                        pageGroup.appendChild(emptyTip);
                    } else {
                        secMaps.forEach(map => {
                            if (query && !map.title.toLowerCase().includes(query) && !secMatch && !nbMatch) {
                                return;
                            }
                            const isActive = map.id === activeMapId;
                            const pageItem = document.createElement("div");
                            pageItem.className = `tree-page-item ${isActive ? 'is-active-page' : ''}`;
                            pageItem.dataset.id = map.id;

                            pageItem.innerHTML = `
                                <span class="tree-page-icon">${map.icon || '📄'}</span>
                                <span class="tree-page-title" title="${escapeHTML(map.title)}">${escapeHTML(map.title)}</span>
                                <span class="tree-page-cards">${map.nodeCount || 0}卡片</span>
                                <div class="tree-node-actions">
                                    <button class="tree-act-btn btn-rename-page" title="✏️ 重命名页面">✏️</button>
                                    <button class="tree-act-btn btn-dup-page" title="📋 复制页面副本">📋</button>
                                    <button class="tree-act-btn btn-move-page" title="🚚 移动至其他分区">🚚</button>
                                    ${mapsManifest.length > 1 ? '<button class="tree-act-btn btn-del-page" title="🗑️ 删除页面" style="color:#f87171;">🗑️</button>' : ''}
                                </div>
                            `;

                            // 切换激活页面
                            pageItem.addEventListener("click", (e) => {
                                if (e.target.closest(".tree-node-actions")) return;
                                if (!isActive) switchActiveMap(map.id);
                            });

                            const rBtn = pageItem.querySelector(".btn-rename-page");
                            if (rBtn) rBtn.addEventListener("click", (e) => { e.stopPropagation(); renameMap(map.id); });

                            const dupBtn = pageItem.querySelector(".btn-dup-page");
                            if (dupBtn) dupBtn.addEventListener("click", (e) => { e.stopPropagation(); duplicateMap(map.id); });

                            const mvBtn = pageItem.querySelector(".btn-move-page");
                            if (mvBtn) mvBtn.addEventListener("click", (e) => { e.stopPropagation(); movePageToSection(map.id); });

                            const dBtn = pageItem.querySelector(".btn-del-page");
                            if (dBtn) dBtn.addEventListener("click", (e) => { e.stopPropagation(); deleteMap(map.id); });

                            pageGroup.appendChild(pageItem);
                        });
                    }
                    secGroup.appendChild(pageGroup);
                }

                nbGroup.appendChild(secGroup);
            });
        }

        container.appendChild(nbGroup);
    });
}

// 笔记本 CRUD
function createNotebook(title = null, icon = "📔") {
    const nbTitle = title || prompt("请输入新笔记本名称 (如: 生物计算课题研讨):", "新笔记本");
    if (!nbTitle || !nbTitle.trim()) return;

    const newNbId = `nb_${Date.now()}`;
    const newNbMeta = {
        id: newNbId,
        title: nbTitle.trim(),
        icon: icon,
        createdAt: new Date().toLocaleDateString()
    };
    notebooksManifest.push(newNbMeta);
    safeLocalStorageSet("flownotes_notebooks_manifest", JSON.stringify(notebooksManifest));

    // 默认附带一个基础分区
    const newSecId = `sec_${Date.now()}`;
    const newSec = {
        id: newSecId,
        notebookId: newNbId,
        title: "常规分区",
        color: ONENOTE_SECTION_COLORS[sectionsManifest.length % ONENOTE_SECTION_COLORS.length],
        order: 0
    };
    sectionsManifest.push(newSec);
    safeLocalStorageSet("flownotes_sections_manifest", JSON.stringify(sectionsManifest));

    expandedTreeNodes.add(newNbId);
    expandedTreeNodes.add(newSecId);
    safeLocalStorageSet("flownotes_tree_expanded", JSON.stringify([...expandedTreeNodes]));

    // 在该分区创建第一张导图
    createNewMap(`${nbTitle.trim()} 核心思维导图`, "📄", newNbId, newSecId);
    showToast(`📔 成功创建笔记本【${nbTitle.trim()}】！`);
}

function renameNotebook(nbId) {
    const target = notebooksManifest.find(n => n.id === nbId);
    if (!target) return;
    const newTitle = prompt("请输入笔记本新名称:", target.title);
    if (newTitle && newTitle.trim()) {
        target.title = newTitle.trim();
        safeLocalStorageSet("flownotes_notebooks_manifest", JSON.stringify(notebooksManifest));
        updateCurrentMapBadge();
        renderOrganizerUI();
        showToast("✏️ 笔记本重命名成功");
    }
}

function deleteNotebook(nbId) {
    if (notebooksManifest.length <= 1) {
        showToast("⚠️ 至少需要保留一个笔记本，无法删除唯一笔记本。");
        return;
    }
    const target = notebooksManifest.find(n => n.id === nbId);
    if (!target) return;
    if (!confirm(`确定要删除笔记本【${target.title}】及其包含的所有分区和思维导图吗？此操作不可逆！`)) return;

    const secIds = sectionsManifest.filter(s => s.notebookId === nbId).map(s => s.id);
    sectionsManifest = sectionsManifest.filter(s => s.notebookId !== nbId);
    safeLocalStorageSet("flownotes_sections_manifest", JSON.stringify(sectionsManifest));

    const deletedMapIds = mapsManifest.filter(m => m.notebookId === nbId || secIds.includes(m.sectionId)).map(m => m.id);
    deletedMapIds.forEach(mId => {
        delete allMapsMemoryCache[mId];
        localStorage.removeItem(`flownotes_map_data_${mId}`);
    });
    mapsManifest = mapsManifest.filter(m => !deletedMapIds.includes(m.id));
    if (mapsManifest.length === 0) {
        mapsManifest = [{
            id: "map_default",
            title: "默认思维导图",
            icon: "🧠",
            notebookId: notebooksManifest[0].id,
            sectionId: sectionsManifest[0]?.id || "sec_default",
            nodeCount: 1,
            updatedAt: new Date().toLocaleTimeString('zh-CN', { hour12: false })
        }];
    }
    safeLocalStorageSet("flownotes_maps_manifest", JSON.stringify(mapsManifest));

    notebooksManifest = notebooksManifest.filter(n => n.id !== nbId);
    safeLocalStorageSet("flownotes_notebooks_manifest", JSON.stringify(notebooksManifest));

    if (deletedMapIds.includes(activeMapId)) {
        switchActiveMap(mapsManifest[0].id);
    } else {
        updateCurrentMapBadge();
        renderOrganizerUI();
    }
    showToast("🗑️ 笔记本已删除");
}

// 分区 CRUD
function createSection(notebookId = null, title = null, color = null) {
    const curMap = mapsManifest.find(m => m.id === activeMapId);
    const targetNbId = notebookId || (curMap ? curMap.notebookId : notebooksManifest[0].id);
    const secTitle = title || prompt("请输入新彩色分区名称 (如: 实验假说分析):", "新分区");
    if (!secTitle || !secTitle.trim()) return;

    const assignedColor = color || ONENOTE_SECTION_COLORS[sectionsManifest.length % ONENOTE_SECTION_COLORS.length];
    const newSecId = `sec_${Date.now()}`;
    const newSec = {
        id: newSecId,
        notebookId: targetNbId,
        title: secTitle.trim(),
        color: assignedColor,
        order: sectionsManifest.length
    };
    sectionsManifest.push(newSec);
    safeLocalStorageSet("flownotes_sections_manifest", JSON.stringify(sectionsManifest));

    expandedTreeNodes.add(targetNbId);
    expandedTreeNodes.add(newSecId);
    safeLocalStorageSet("flownotes_tree_expanded", JSON.stringify([...expandedTreeNodes]));

    // 在新分区创建第一张页面
    createNewMap(`${secTitle.trim()} 思维沙盘`, "📄", targetNbId, newSecId);
    showToast(`📑 成功创建分区【${secTitle.trim()}】！`);
}

function renameSection(secId) {
    const target = sectionsManifest.find(s => s.id === secId);
    if (!target) return;
    const newTitle = prompt("请输入分区新名称:", target.title);
    if (newTitle && newTitle.trim()) {
        target.title = newTitle.trim();
        safeLocalStorageSet("flownotes_sections_manifest", JSON.stringify(sectionsManifest));
        updateCurrentMapBadge();
        renderOrganizerUI();
        showToast("✏️ 分区重命名成功");
    }
}

function cycleSectionColor(secId) {
    const sec = sectionsManifest.find(s => s.id === secId);
    if (!sec) return;
    const curIdx = ONENOTE_SECTION_COLORS.indexOf(sec.color || "#38bdf8");
    const nextColor = ONENOTE_SECTION_COLORS[(curIdx + 1) % ONENOTE_SECTION_COLORS.length];
    sec.color = nextColor;
    safeLocalStorageSet("flownotes_sections_manifest", JSON.stringify(sectionsManifest));
    updateCurrentMapBadge();
    renderOrganizerUI();
    showToast(`🎨 分区【${sec.title}】颜色已更新`);
}

function deleteSection(secId) {
    const target = sectionsManifest.find(s => s.id === secId);
    if (!target) return;
    const sameNbSecs = sectionsManifest.filter(s => s.notebookId === target.notebookId);
    if (sameNbSecs.length <= 1) {
        showToast("⚠️ 该笔记本下只剩一个分区，无法删除。");
        return;
    }
    if (!confirm(`确定要删除分区【${target.title}】及其包含的所有页面吗？此操作不可逆！`)) return;

    const deletedMapIds = mapsManifest.filter(m => m.sectionId === secId).map(m => m.id);
    deletedMapIds.forEach(mId => {
        delete allMapsMemoryCache[mId];
        localStorage.removeItem(`flownotes_map_data_${mId}`);
    });
    mapsManifest = mapsManifest.filter(m => !deletedMapIds.includes(m.id));
    if (mapsManifest.length === 0) {
        mapsManifest = [{
            id: "map_default",
            title: "默认思维导图",
            icon: "🧠",
            notebookId: target.notebookId,
            sectionId: sameNbSecs.find(s => s.id !== secId).id,
            nodeCount: 1,
            updatedAt: new Date().toLocaleTimeString('zh-CN', { hour12: false })
        }];
    }
    safeLocalStorageSet("flownotes_maps_manifest", JSON.stringify(mapsManifest));

    sectionsManifest = sectionsManifest.filter(s => s.id !== secId);
    safeLocalStorageSet("flownotes_sections_manifest", JSON.stringify(sectionsManifest));

    if (deletedMapIds.includes(activeMapId)) {
        switchActiveMap(mapsManifest[0].id);
    } else {
        updateCurrentMapBadge();
        renderOrganizerUI();
    }
    showToast("🗑️ 分区已删除");
}

// 页面/思维沙盘 CRUD
function createNewMap(title = null, icon = "📄", notebookId = null, sectionId = null) {
    let finalTitle = title;
    if (!finalTitle) {
        const input = prompt("请输入思维沙盘页面标题 (如: 基因组分析框架):", "新思维沙盘");
        if (!input || !input.trim()) return;
        finalTitle = input.trim();
    }

    const curMap = mapsManifest.find(m => m.id === activeMapId);
    const targetNbId = notebookId || (curMap ? curMap.notebookId : (notebooksManifest[0] ? notebooksManifest[0].id : "nb_default"));
    const targetSecId = sectionId || (curMap ? curMap.sectionId : (sectionsManifest.find(s => s.notebookId === targetNbId)?.id || sectionsManifest[0]?.id || "sec_default"));

    const newMapId = `map_${Date.now()}`;
    const nowStr = new Date().toLocaleTimeString('zh-CN', { hour12: false });

    const initialRoot = {
        id: `root_${Date.now()}`,
        label: finalTitle,
        parentId: null,
        content: `# ${finalTitle}\n\n欢迎开始构建 **${finalTitle}** 主题思维沙盘！\n\n- 按 ` + '`Tab`' + ` 键增加子节点\n- 按 ` + '`Enter`' + ` 键增加同级节点\n- 选中节点可进行富文本加粗、高亮、复选框或手写体批注！`,
        order: 0,
        x: 450,
        y: 320
    };

    const newMapMeta = {
        id: newMapId,
        title: finalTitle,
        icon: icon,
        notebookId: targetNbId,
        sectionId: targetSecId,
        nodeCount: 1,
        updatedAt: nowStr
    };

    mapsManifest.push(newMapMeta);
    safeLocalStorageSet("flownotes_maps_manifest", JSON.stringify(mapsManifest));

    const newMapData = {
        nodes: [initialRoot],
        links: [],
        flowStream: [],
        inkStrokes: []
    };
    allMapsMemoryCache[newMapId] = newMapData;
    safeLocalStorageSet(`flownotes_map_data_${newMapId}`, JSON.stringify(newMapData));

    expandedTreeNodes.add(targetNbId);
    expandedTreeNodes.add(targetSecId);
    safeLocalStorageSet("flownotes_tree_expanded", JSON.stringify([...expandedTreeNodes]));

    switchActiveMap(newMapId);
    showToast(`✨ 成功创建新思维沙盘 [[${finalTitle}]]`);
}

function movePageToSection(mapId) {
    const map = mapsManifest.find(m => m.id === mapId);
    if (!map) return;
    if (sectionsManifest.length <= 1) {
        showToast("⚠️ 当前只有一个分区，请先创建更多分区后再移动页面。");
        return;
    }
    const list = sectionsManifest.map((s, idx) => {
        const nb = notebooksManifest.find(n => n.id === s.notebookId);
        const isCurrent = s.id === map.sectionId;
        return `${idx + 1}. [${nb ? nb.title : '笔记本'}] > ${s.title} ${isCurrent ? '(当前)' : ''}`;
    }).join("\n");

    const answer = prompt(`请选择要移动到的目标分区序号 (1 ~ ${sectionsManifest.length}):\n\n${list}`);
    if (!answer) return;
    const choiceIdx = parseInt(answer.trim(), 10) - 1;
    if (isNaN(choiceIdx) || choiceIdx < 0 || choiceIdx >= sectionsManifest.length) {
        showToast("❌ 输入序号无效");
        return;
    }
    const targetSec = sectionsManifest[choiceIdx];
    map.sectionId = targetSec.id;
    map.notebookId = targetSec.notebookId;
    map.updatedAt = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    safeLocalStorageSet("flownotes_maps_manifest", JSON.stringify(mapsManifest));

    expandedTreeNodes.add(targetSec.notebookId);
    expandedTreeNodes.add(targetSec.id);
    safeLocalStorageSet("flownotes_tree_expanded", JSON.stringify([...expandedTreeNodes]));

    updateCurrentMapBadge();
    renderOrganizerUI();
    showToast(`🚚 页面已成功移动至【${targetSec.title}】分区！`);
}

function switchActiveMap(mapId) {
    if (mapId === activeMapId) return;
    flushPendingSave();

    // 先保存当前激活图谱的数据
    const currentData = {
        nodes: nodes,
        links: cleanLinks(),
        flowStream: flowStream,
        inkStrokes: inkStrokes
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
    const newTitle = prompt("请输入新页面标题:", target.title);
    if (newTitle && newTitle.trim()) {
        target.title = newTitle.trim();
        target.updatedAt = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        safeLocalStorageSet("flownotes_maps_manifest", JSON.stringify(mapsManifest));
        updateCurrentMapBadge();
        renderOrganizerUI();
        showToast("✏️ 页面重命名成功");
    }
}

function duplicateMap(mapId) {
    const sourceMap = mapsManifest.find(m => m.id === mapId);
    if (!sourceMap) return;

    let raw = allMapsMemoryCache[mapId];
    if (!raw) {
        const rawStr = localStorage.getItem(`flownotes_map_data_${mapId}`);
        if (rawStr) {
            try { raw = JSON.parse(rawStr); } catch (e) {}
        }
    }
    if (!raw) return;

    const newMapId = `map_${Date.now()}`;
    const nowStr = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const dupTitle = `${sourceMap.title} (副本)`;

    const dupMeta = {
        id: newMapId,
        title: dupTitle,
        icon: sourceMap.icon || "📄",
        notebookId: sourceMap.notebookId || "nb_default",
        sectionId: sourceMap.sectionId || "sec_default",
        nodeCount: sourceMap.nodeCount || 0,
        updatedAt: nowStr
    };

    mapsManifest.push(dupMeta);
    safeLocalStorageSet("flownotes_maps_manifest", JSON.stringify(mapsManifest));
    allMapsMemoryCache[newMapId] = JSON.parse(JSON.stringify(raw));
    safeLocalStorageSet(`flownotes_map_data_${newMapId}`, JSON.stringify(allMapsMemoryCache[newMapId]));

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

    if (!confirm(`确定要彻底删除思维沙盘 [[${target.title}]] 吗？此操作无法撤销。`)) return;

    mapsManifest = mapsManifest.filter(m => m.id !== mapId);
    safeLocalStorageSet("flownotes_maps_manifest", JSON.stringify(mapsManifest));
    delete allMapsMemoryCache[mapId];
    localStorage.removeItem(`flownotes_map_data_${mapId}`);

    if (activeMapId === mapId) {
        switchActiveMap(mapsManifest[0].id);
    } else {
        renderOrganizerUI();
    }
    showToast("🗑️ 页面已成功删除");
}

function collapseAllTree() {
    expandedTreeNodes.clear();
    safeLocalStorageSet("flownotes_tree_expanded", JSON.stringify([]));
    renderOrganizerUI();
    showToast("📁 已全部折叠");
}

function expandAllTree() {
    notebooksManifest.forEach(n => expandedTreeNodes.add(n.id));
    sectionsManifest.forEach(s => expandedTreeNodes.add(s.id));
    safeLocalStorageSet("flownotes_tree_expanded", JSON.stringify([...expandedTreeNodes]));
    renderOrganizerUI();
    showToast("📂 已全部展开");
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


// --- v3.4.4 划词与卡片快速格式工具栏 (Selection & Card Quick Bubble) ---
let updateQuickBubblePosition = () => {};

function initSelectionQuickBubble() {
    const bubble = document.getElementById("selection-quick-bubble");
    const richEditor = document.getElementById("rich-editor");
    if (!bubble) return;
    if (bubble.parentElement !== document.body) {
        document.body.appendChild(bubble);
    }

    // 默认固定在画布上方中央（如 OneNote 格式区），用户可随时点击 📌/📍 切换为跟随选区浮动
    let isDockedTop = localStorage.getItem("flownotes_bubble_docked") !== "float";
    const dockBtn = bubble.querySelector('[data-action="toggle-dock"]') || document.getElementById("btn-toggle-bubble-dock");

    function updateDockUI() {
        bubble.classList.toggle("is-docked-top", isDockedTop);
        if (dockBtn) {
            dockBtn.innerHTML = isDockedTop ? "📌" : "📍";
            dockBtn.title = isDockedTop
                ? "📌 工具栏位置：已固定在画布上方中央 (点击切换为跟随选区悬浮)"
                : "📍 工具栏位置：跟随选区悬浮 (点击固定到画布顶部中央)";
            dockBtn.classList.toggle("active", isDockedTop);
        }
    }
    updateDockUI();

    updateQuickBubblePosition = function() {
        const sel = window.getSelection();
        const hasTextSel = !!(sel && sel.rangeCount > 0 && !sel.isCollapsed && sel.toString().trim());
        const hasCardSel = !!selectedNode;
        const isEditingCard = !!document.querySelector(".canvas-note-card.is-editing");

        // 只要没有划词选区、也没有选中卡片、也没有正在卡片内打字，则隐藏工具栏
        if (!hasTextSel && !hasCardSel && !isEditingCard) {
            bubble.style.display = "none";
            return;
        }

        bubble.style.display = "flex";
        const bubbleWidth = bubble.offsetWidth || 350;

        if (isDockedTop) {
            // 固定在画布上方中央模式
            const container = document.getElementById("graph-container");
            if (!container) {
                bubble.style.display = "none";
                return;
            }

            const cRect = container.getBoundingClientRect();
            const left = Math.max(10, cRect.left + (cRect.width / 2) - (bubbleWidth / 2));
            const top = Math.max(10, cRect.top + 14);
            bubble.style.left = `${left}px`;
            bubble.style.top = `${top}px`;
        } else {
            // 跟随选区 / 卡片悬浮模式
            let targetRect = null;
            if (hasTextSel) {
                const range = sel.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                if (rect.width > 0 || rect.height > 0) {
                    targetRect = rect;
                }
            }
            if (!targetRect) {
                const cardEl = document.querySelector(".canvas-note-card.is-editing") ||
                               document.querySelector(".canvas-note-card.is-selected");
                if (cardEl) {
                    targetRect = cardEl.getBoundingClientRect();
                }
            }

            if (!targetRect) {
                bubble.style.display = "none";
                return;
            }

            const left = Math.max(10, targetRect.left + (targetRect.width / 2) - (bubbleWidth / 2));
            const top = Math.max(10, targetRect.top - 46);
            bubble.style.left = `${left}px`;
            bubble.style.top = `${top}px`;
        }

        // 同步更新 3 个正方形框框填色按钮的激活高亮状态
        const activeBg = (selectedNode && selectedNode.cardBgColor) || "";
        const btnRose = bubble.querySelector('[data-action="bg-rose"]');
        const btnEmerald = bubble.querySelector('[data-action="bg-emerald"]');
        const btnAmber = bubble.querySelector('[data-action="bg-amber"]');
        if (btnRose) btnRose.classList.toggle("active-swatch", activeBg === "rose");
        if (btnEmerald) btnEmerald.classList.toggle("active-swatch", activeBg === "emerald");
        if (btnAmber) btnAmber.classList.toggle("active-swatch", activeBg === "amber");

        // 同步更新粗体、斜体、下划线、手写体、字色的激活高亮反馈状态
        const btnBold = bubble.querySelector('[data-action="bold"]');
        const btnItalic = bubble.querySelector('[data-action="italic"]');
        const btnUnderline = bubble.querySelector('[data-action="underline"]');
        const btnHandwriting = bubble.querySelector('[data-action="handwriting"]');
        const btnRed = bubble.querySelector('[data-action="red"]');
        const btnGreen = bubble.querySelector('[data-action="green"]');

        if (selectedNode) {
            if (btnBold) btnBold.classList.toggle("active-swatch", !!selectedNode.isBold);
            if (btnItalic) btnItalic.classList.toggle("active-swatch", !!selectedNode.isItalic);
            if (btnUnderline) btnUnderline.classList.toggle("active-swatch", !!selectedNode.isUnderline);
            if (btnHandwriting) btnHandwriting.classList.toggle("active-swatch", selectedNode.fontStyle === "handwriting");
            if (btnRed) btnRed.classList.toggle("active-swatch", selectedNode.textColor === "#ef4444");
            if (btnGreen) btnGreen.classList.toggle("active-swatch", selectedNode.textColor === "#10b981");
        } else {
            if (btnBold) btnBold.classList.remove("active-swatch");
            if (btnItalic) btnItalic.classList.remove("active-swatch");
            if (btnUnderline) btnUnderline.classList.remove("active-swatch");
            if (btnHandwriting) btnHandwriting.classList.remove("active-swatch");
            if (btnRed) btnRed.classList.remove("active-swatch");
            if (btnGreen) btnGreen.classList.remove("active-swatch");
        }
    };

    document.addEventListener("mouseup", () => setTimeout(updateQuickBubblePosition, 25));
    document.addEventListener("keyup", (e) => {
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Shift"].includes(e.key)) {
            setTimeout(updateQuickBubblePosition, 25);
        }
    });
    window.addEventListener("resize", () => {
        if (bubble.style.display !== "none") updateQuickBubblePosition();
    });

    document.addEventListener("mousedown", (e) => {
        const inCanvasCard = !!(e.target && e.target.closest && e.target.closest(".canvas-note-card"));
        const inMultiBar = !!(e.target && e.target.closest && e.target.closest("#multi-select-action-bar"));
        if (!bubble.contains(e.target) && (!richEditor || !richEditor.contains(e.target)) && !inCanvasCard && !inMultiBar) {
            setTimeout(() => {
                if (!selectedNode && window.getSelection().isCollapsed) {
                    bubble.style.display = "none";
                }
            }, 30);
        }
    });

    bubble.querySelectorAll(".bubble-btn").forEach(btn => {
        btn.addEventListener("mousedown", (e) => e.preventDefault());
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;
            if (action === "toggle-dock") {
                isDockedTop = !isDockedTop;
                localStorage.setItem("flownotes_bubble_docked", isDockedTop ? "top" : "float");
                updateDockUI();
                updateQuickBubblePosition();
                showToast(isDockedTop ? "📌 工具栏已固定在画布上方中央" : "📍 工具栏已切换为跟随选区悬浮", "info");
                return;
            }
            if (action === "bg-rose") toggleCardBgColor("rose");
            else if (action === "bg-emerald") toggleCardBgColor("emerald");
            else if (action === "bg-amber") toggleCardBgColor("amber");
            else if (action === "handwriting") applyFormatting("handwriting");
            else if (action === "red") applyFormatting("color-red");
            else if (action === "green") applyFormatting("color-green");
            else if (action === "highlight") applyFormatting("highlight");
            else if (action === "bold") applyFormatting("bold");
            else if (action === "italic") applyFormatting("italic");
            else if (action === "underline") applyFormatting("underline");
            else if (action === "todo") {
                if (selectedNode) toggleTodoOnSelectedCard(selectedNode);
            }
            else if (action === "table") applyFormatting("table");
            else if (action === "clear") {
                if (selectedNode) {
                    delete selectedNode.cardBgColor;
                    selectedNode.fontStyle = "";
                    selectedNode.customFontSize = null;
                    refreshNodeStyles();
                    scheduleSaveGraph(true);
                }
                applyFormatting("clear");
            }
            setTimeout(updateQuickBubblePosition, 30);
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

        // 2. 如果当前不在编辑文字，且在画布空白处按了 Ctrl+V
        if (!isEditing) {
            const text = clipboardData.getData("text/plain");
            if (text && text.trim() === "__FLOWNOTES_CARDS__" && copiedNodesBuffer.length > 0) {
                e.preventDefault();
                const tx = (lastCanvasMouseCoords && Number.isFinite(lastCanvasMouseCoords.x)) ? lastCanvasMouseCoords.x : 450;
                const ty = (lastCanvasMouseCoords && Number.isFinite(lastCanvasMouseCoords.y)) ? lastCanvasMouseCoords.y : 320;
                pasteCopiedNodesAt(tx, ty);
                return;
            }
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


// ============================================================================
// v2.9.0 直觉式交互套件：多选浮动操作栏、箭头点击反转/删除、右键菜单、对齐与复制克隆
// ============================================================================

document.addEventListener("keyup", (e) => {
    if (e.key === "Shift") {
        const svgEl = document.getElementById("graph-svg");
        if (svgEl && !isInkDrawMode && !isSpacePressed) {
            svgEl.style.cursor = isMarqueeMode ? "crosshair" : "grab";
        }
    }
    if (e.code === "Space" && isSpacePressed) {
        const wasMoved = spacePanMoved;
        isSpacePressed = false;
        spacePanMoved = false;
        const svgEl = document.getElementById("graph-svg");
        if (svgEl) svgEl.style.cursor = isMarqueeMode ? "default" : "grab";

        // XMind 经典直觉：如果选中了一张卡片，且刚才只是轻按了一下空格键（没有拖动鼠标平移画布），则直接进入卡片文字编辑！
        const isEditing = document.activeElement && (
            document.activeElement.tagName === "TEXTAREA" ||
            document.activeElement.tagName === "INPUT" ||
            document.activeElement.isContentEditable
        );
        if (!wasMoved && !isEditing && selectedNode && selectedNodeIds.size === 1) {
            startInlineCardEditById(selectedNode.id, false);
        }
    }
});

function initIntuitiveActionBarsAndContextMenu() {
    // 1. 多选卡片浮动快捷操作栏 (#multi-select-action-bar)
    if (!document.getElementById("multi-select-action-bar")) {
        const bar = document.createElement("div");
        bar.id = "multi-select-action-bar";
        bar.className = "canvas-floating-bar";
        bar.style.display = "none";
        bar.innerHTML = `
            <span class="floating-bar-badge" id="multi-select-count-label">已选 2 项</span>
            <button class="floating-bar-btn primary" data-act="connect-parent" title="按创建时间连接有向可折叠箭头（默认先 make 的是父节点，快捷键 L）">➔ 连箭头 (先建为父)</button>
            <button class="floating-bar-btn" data-act="connect-chain" title="按创建时间先后顺序依次串联箭头 (1 ➔ 2 ➔ 3)">⛓️ 顺序串联</button>
            <button class="floating-bar-btn" data-act="merge-cards" title="OneNote/XMind 风格：将选中的多张卡片按创建顺序无损合并为一页卡片">🧲 合并为一卡</button>
            <button class="floating-bar-btn" data-act="align-v" title="将选中卡片左对齐并垂直等距排齐">📐 垂直排齐</button>
            <button class="floating-bar-btn" data-act="align-h" title="将选中卡片水平对齐并等距排齐">📐 水平排齐</button>
            <div class="card-bg-swatch-row" title="批量为选中卡片设置背景底色标签">
                <button class="card-bg-swatch" data-bg="" title="默认深空底色">🌌</button>
                <button class="card-bg-swatch swatch-rose" data-bg="rose" title="🌹 绯红底色 (核心问题/风险)"></button>
                <button class="card-bg-swatch swatch-emerald" data-bg="emerald" title="🌿 翡翠底色 (结论/测量指标)"></button>
                <button class="card-bg-swatch swatch-amber" data-bg="amber" title="🟡 琥珀底色 (核心假设/警示)"></button>
                <button class="card-bg-swatch swatch-sky" data-bg="sky" title="💎 晴空底色 (方法/概念)"></button>
                <button class="card-bg-swatch swatch-violet" data-bg="violet" title="🔮 紫晶底色 (文献/灵感)"></button>
            </div>
            <button class="floating-bar-btn" data-act="focus" title="批量设为/取消重点 (F)">⭐ 重点</button>
            <button class="floating-bar-btn" data-act="duplicate" title="批量克隆卡片 (Ctrl+D)">🧬 克隆</button>
            <button class="floating-bar-btn danger" data-act="delete" title="批量删除选中卡片 (Delete)">🗑️ 删除</button>
        `;
        document.body.appendChild(bar);

        bar.addEventListener("mousedown", (e) => e.stopPropagation());
        bar.querySelectorAll(".floating-bar-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const act = btn.dataset.act;
                if (act === "connect-parent") toggleRelationLink();
                else if (act === "connect-chain") chainConnectSelectedNodes();
                else if (act === "merge-cards") mergeSelectedNodes();
                else if (act === "align-v") alignSelectedNodes("vertical");
                else if (act === "align-h") alignSelectedNodes("horizontal");
                else if (act === "focus") toggleNodeFocus();
                else if (act === "duplicate") duplicateSelectedNodes();
                else if (act === "delete") deleteSelectedNode(false);
                updateFloatingActionBarsPosition();
            });
        });
        bar.querySelectorAll(".card-bg-swatch").forEach(sw => {
            sw.addEventListener("click", (e) => {
                e.stopPropagation();
                setCardBgColor(sw.dataset.bg || "");
            });
        });
    }

    // 2. 选中箭头连线时的浮动操作栏 (#link-action-bar)
    if (!document.getElementById("link-action-bar")) {
        const lbar = document.createElement("div");
        lbar.id = "link-action-bar";
        lbar.className = "canvas-floating-bar";
        lbar.style.display = "none";
        lbar.innerHTML = `
            <span class="floating-bar-badge">🏹 已选中箭头</span>
            <button class="floating-bar-btn primary" data-lact="label" title="在箭头中央添加或修改关系词说明（如：导致、抑制、混杂变量；也可直接双击箭头）">✏️ 写关系词</button>
            <button class="floating-bar-btn" data-lact="insert-mid" title="在这条箭头正中间插入一张过渡卡片 (A ➔ 新卡片 ➔ B)">➕ 中间插卡片</button>
            <button class="floating-bar-btn" data-lact="reverse" title="调换这条箭头的父子指向（让另一端作为可折叠的父节点）">⇄ 反转父子方向</button>
            <button class="floating-bar-btn danger" data-lact="delete" title="只断开/删除这条箭头，保留两端的文字卡片 (Delete)">✂️ 删除此箭头</button>
        `;
        document.body.appendChild(lbar);

        lbar.addEventListener("mousedown", (e) => e.stopPropagation());
        lbar.querySelectorAll(".floating-bar-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const act = btn.dataset.lact;
                if (act === "label") promptEditSelectedLinkLabel();
                else if (act === "insert-mid") insertNodeOnSelectedLink();
                else if (act === "reverse") reverseSelectedLink();
                else if (act === "delete") deleteSelectedLink();
            });
        });
    }

    // 3. 右键上下文菜单 (#canvas-context-menu)
    if (!document.getElementById("canvas-context-menu")) {
        const menu = document.createElement("div");
        menu.id = "canvas-context-menu";
        menu.className = "canvas-context-menu";
        menu.style.display = "none";
        document.body.appendChild(menu);

        menu.addEventListener("mousedown", (e) => e.stopPropagation());
    }

    const svgEl = document.getElementById("graph-svg");
    if (svgEl) {
        svgEl.addEventListener("contextmenu", (e) => {
            if (e.target.closest && e.target.closest(".node-group")) return;
            e.preventDefault();
            if (rightDragMoved) {
                rightDragMoved = false;
                return;
            }
            const coords = d3.pointer(e, zoomContainer.node());
            lastCanvasMouseCoords = { x: coords[0], y: coords[1] };
            showCanvasContextMenu(e.clientX, e.clientY, null, e.target);
        });
    }

    document.addEventListener("click", () => hideCanvasContextMenu());
}

// 实时计算并更新多选操作栏与箭头操作栏在屏幕上的浮动位置
function updateFloatingActionBarsPosition() {
    const multiBar = document.getElementById("multi-select-action-bar");
    const linkBar = document.getElementById("link-action-bar");
    const svgEl = document.getElementById("graph-svg");
    if (!svgEl || !zoomContainer) return;

    const svgRect = svgEl.getBoundingClientRect();
    const transform = d3.zoomTransform(svgEl);

    // A. 更新多选操作栏位置
    if (multiBar) {
        if (selectedNodeIds.size >= 2) {
            const selNodes = nodes.filter(n => selectedNodeIds.has(n.id));
            if (selNodes.length >= 2) {
                const countLabel = document.getElementById("multi-select-count-label");
                if (countLabel) countLabel.textContent = `已选 ${selNodes.length} 项`;

                const minX = Math.min(...selNodes.map(n => n.x - (n._cardW || 120) / 2));
                const maxX = Math.max(...selNodes.map(n => n.x + (n._cardW || 120) / 2));
                const minY = Math.min(...selNodes.map(n => n.y - (n._cardH || 40) / 2));

                const centerX = (minX + maxX) / 2;
                const screenX = svgRect.left + transform.applyX(centerX);
                const screenY = svgRect.top + transform.applyY(minY) - 48;

                multiBar.style.display = "flex";
                const barW = multiBar.offsetWidth || 480;
                multiBar.style.left = `${Math.max(12, Math.min(window.innerWidth - barW - 12, screenX - barW / 2))}px`;
                multiBar.style.top = `${Math.max(64, Math.min(window.innerHeight - 60, screenY))}px`;
            } else {
                multiBar.style.display = "none";
            }
        } else {
            multiBar.style.display = "none";
        }
    }

    // B. 更新箭头连线操作栏位置
    if (linkBar) {
        if (selectedLink) {
            const sNode = typeof selectedLink.source === "object" ? selectedLink.source : nodes.find(n => n.id === selectedLink.source);
            const tNode = typeof selectedLink.target === "object" ? selectedLink.target : nodes.find(n => n.id === selectedLink.target);
            if (sNode && tNode) {
                const midX = (sNode.x + tNode.x) / 2;
                const midY = (sNode.y + tNode.y) / 2;
                const screenX = svgRect.left + transform.applyX(midX);
                const screenY = svgRect.top + transform.applyY(midY) - 42;

                linkBar.style.display = "flex";
                const barW = linkBar.offsetWidth || 280;
                linkBar.style.left = `${Math.max(12, Math.min(window.innerWidth - barW - 12, screenX - barW / 2))}px`;
                linkBar.style.top = `${Math.max(64, Math.min(window.innerHeight - 60, screenY))}px`;
            } else {
                linkBar.style.display = "none";
            }
        } else {
            linkBar.style.display = "none";
        }
    }

    // C. 同步更新置顶/悬浮格式工具栏
    if (typeof updateQuickBubblePosition === "function") {
        updateQuickBubblePosition();
    }
}

// 删除当前选中的箭头连线（保留卡片）
function deleteSelectedLink() {
    if (!selectedLink) return;
    const sId = cleanNodeId(selectedLink.source);
    const tId = cleanNodeId(selectedLink.target);

    if (selectedLink.type === "relation") {
        links = links.filter(l => !(l.type === "relation" && ((cleanNodeId(l.source) === sId && cleanNodeId(l.target) === tId) || (cleanNodeId(l.source) === tId && cleanNodeId(l.target) === sId))));
    } else {
        const child = nodes.find(n => n.id === tId);
        if (child && child.parentId === sId) {
            child.parentId = null;
        }
    }
    selectedLink = null;
    sanitizeGraph();
    updateD3Graph();
    renderPositions();
    updateFloatingActionBarsPosition();
    scheduleSaveGraph(true);
    showToast("✂️ 已删除箭头连线（两端卡片已保留）");
}

// 一键反转当前选中箭头的父子方向
function reverseSelectedLink() {
    if (!selectedLink) return;
    const sId = cleanNodeId(selectedLink.source);
    const tId = cleanNodeId(selectedLink.target);
    const oldParent = nodes.find(n => n.id === sId);
    const oldChild = nodes.find(n => n.id === tId);
    if (!oldParent || !oldChild) return;

    if (oldChild.parentId === oldParent.id) {
        oldChild.parentId = oldParent.parentId;
        oldParent.parentId = oldChild.id;
        oldChild.collapsed = false;
        selectedLink = { source: oldChild, target: oldParent };
        sanitizeGraph();
        updateD3Graph();
        renderPositions();
        updateFloatingActionBarsPosition();
        scheduleSaveGraph(true);
        showToast(`⇄ 已反转箭头方向：【${oldChild.label}】(父) ➔ 【${oldParent.label}】(子)`);
    }
}

// 按创建时间顺序将多选卡片依次串联 (1 ➔ 2 ➔ 3)
function chainConnectSelectedNodes() {
    if (selectedNodeIds.size < 2) return;
    const selectedList = nodes.filter(n => selectedNodeIds.has(n.id));
    selectedList.sort((a, b) => getNodeCreatedTime(a) - getNodeCreatedTime(b));

    for (let i = 1; i < selectedList.length; i++) {
        const prev = selectedList[i - 1];
        const curr = selectedList[i];
        if (!isNodeDescendantOf(prev.id, curr.id)) {
            curr.parentId = prev.id;
            prev.collapsed = false;
        }
    }
    sanitizeGraph();
    updateD3Graph();
    renderPositions();
    scheduleSaveGraph(true);
    showToast(`⛓️ 已按创建先后顺序将 ${selectedList.length} 张卡片依次串联！`);
}

// 批量垂直排齐 / 水平排齐选中的凌乱卡片
function alignSelectedNodes(direction = "vertical") {
    if (selectedNodeIds.size < 2) return;
    const selNodes = nodes.filter(n => selectedNodeIds.has(n.id));
    if (direction === "vertical") {
        selNodes.sort((a, b) => a.y - b.y);
        const avgX = selNodes.reduce((s, n) => s + n.x, 0) / selNodes.length;
        let currentY = selNodes[0].y;
        selNodes.forEach((n, idx) => {
            n.x = avgX;
            n.fx = avgX;
            if (idx > 0) {
                const prev = selNodes[idx - 1];
                currentY += ((prev._cardH || 40) / 2) + ((n._cardH || 40) / 2) + 24;
                n.y = currentY;
                n.fy = currentY;
            }
        });
        showToast("📐 已将选中卡片垂直对齐并等距排列");
    } else {
        selNodes.sort((a, b) => a.x - b.x);
        const avgY = selNodes.reduce((s, n) => s + n.y, 0) / selNodes.length;
        let currentX = selNodes[0].x;
        selNodes.forEach((n, idx) => {
            n.y = avgY;
            n.fy = avgY;
            if (idx > 0) {
                const prev = selNodes[idx - 1];
                currentX += ((prev._cardW || 130) / 2) + ((n._cardW || 130) / 2) + 36;
                n.x = currentX;
                n.fx = currentX;
            }
        });
        showToast("📐 已将选中卡片水平对齐并等距排列");
    }
    renderPositions();
    updateFloatingActionBarsPosition();
    scheduleSaveGraph(true);
}

// Ctrl+A 全选所有可见卡片
function selectAllVisibleNodes() {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const visibleNodes = nodes.filter(n => isNodeVisible(n, nodeMap));
    selectedNodeIds = new Set(visibleNodes.map(n => n.id));
    selectedNode = visibleNodes[0] || null;
    selectedLink = null;
    refreshNodeStyles();
    renderEditor();
    updateFloatingActionBarsPosition();
    showToast(`☑️ 已全选画布上全部 ${visibleNodes.length} 张卡片`);
}

// Ctrl+C 复制选中卡片（支持在任意画布位置按 Ctrl+V 粘贴卡片，也支持右键粘贴）
function copySelectedNodes() {
    const selNodes = nodes.filter(n => selectedNodeIds.has(n.id));
    if (selNodes.length === 0) return;
    copiedNodesBuffer = selNodes.map(n => ({
        label: n.label,
        content: n.content,
        isImage: n.isImage,
        imageUrl: n.imageUrl,
        isFocus: n.isFocus,
        customWidth: n.customWidth,
        customHeight: n.customHeight,
        customFontSize: n.customFontSize,
        _manualHeight: n._manualHeight,
        edgeLabel: n.edgeLabel,
        cardBgColor: n.cardBgColor,
        x: n.x,
        y: n.y
    }));
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText("__FLOWNOTES_CARDS__").catch(() => {});
    }
    showToast(`📋 已复制 ${copiedNodesBuffer.length} 张卡片 (在任意位置按 Ctrl+V 即可粘贴，或按 Ctrl+D 克隆)`);
}

function pasteCopiedNodesAt(targetCenterX, targetCenterY) {
    if (!copiedNodesBuffer || copiedNodesBuffer.length === 0) return false;
    const avgX = copiedNodesBuffer.reduce((s, n) => s + (Number.isFinite(n.x) ? n.x : 450), 0) / copiedNodesBuffer.length;
    const avgY = copiedNodesBuffer.reduce((s, n) => s + (Number.isFinite(n.y) ? n.y : 320), 0) / copiedNodesBuffer.length;

    const newIds = new Set();
    const baseTs = Date.now();
    copiedNodesBuffer.forEach((src, idx) => {
        const newId = `card_${baseTs + idx}`;
        const nx = targetCenterX + ((Number.isFinite(src.x) ? src.x : avgX) - avgX);
        const ny = targetCenterY + ((Number.isFinite(src.y) ? src.y : avgY) - avgY);
        const pasted = {
            id: newId,
            label: src.label,
            parentId: null,
            content: src.content,
            isImage: src.isImage,
            imageUrl: src.imageUrl,
            isFocus: src.isFocus,
            customWidth: src.customWidth,
            customHeight: src.customHeight,
            customFontSize: src.customFontSize,
            _manualHeight: src._manualHeight,
            cardBgColor: src.cardBgColor,
            createdAt: baseTs + idx,
            order: nodes.length + idx,
            x: nx,
            y: ny,
            fx: nx,
            fy: ny
        };
        nodes.push(pasted);
        newIds.add(newId);
    });

    sanitizeGraph();
    selectedNodeIds = newIds;
    selectedNode = nodes.find(n => newIds.has(n.id)) || null;
    updateD3Graph();
    renderPositions();
    renderEditor();
    updateFloatingActionBarsPosition();
    scheduleSaveGraph(true);
    showToast(`📋 已在当前位置粘贴 ${newIds.size} 张卡片`);
    return true;
}

// Ctrl+D 一键克隆选中卡片
function duplicateSelectedNodes() {
    const sourceList = nodes.filter(n => selectedNodeIds.has(n.id));
    if (sourceList.length === 0) return;

    const newIds = new Set();
    const baseTs = Date.now();
    sourceList.forEach((src, idx) => {
        const newId = `card_${baseTs + idx}`;
        const nx = (Number.isFinite(src.x) ? src.x : 450) + 36;
        const ny = (Number.isFinite(src.y) ? src.y : 320) + 36;
        const cloned = {
            id: newId,
            label: src.label,
            parentId: src.parentId,
            content: src.content,
            isImage: src.isImage,
            imageUrl: src.imageUrl,
            isFocus: src.isFocus,
            customWidth: src.customWidth,
            customHeight: src.customHeight,
            customFontSize: src.customFontSize,
            _manualHeight: src._manualHeight,
            edgeLabel: src.edgeLabel,
            cardBgColor: src.cardBgColor,
            createdAt: baseTs + idx,
            order: nodes.length + idx,
            x: nx,
            y: ny,
            fx: nx,
            fy: ny
        };
        nodes.push(cloned);
        newIds.add(newId);
    });

    sanitizeGraph();
    selectedNodeIds = newIds;
    selectedNode = nodes.find(n => newIds.has(n.id)) || null;
    updateD3Graph();
    renderPositions();
    renderEditor();
    updateFloatingActionBarsPosition();
    scheduleSaveGraph(true);
    showToast(`🧬 已克隆 ${newIds.size} 张卡片`);
}

// 显示画布/卡片右键菜单
function showCanvasContextMenu(clientX, clientY, targetNode, eventTarget) {
    const menu = document.getElementById("canvas-context-menu");
    if (!menu) return;

    const targetCell = eventTarget ? (eventTarget.nodeType === 1 ? eventTarget : eventTarget.parentElement)?.closest?.("td, th") : null;
    const targetTable = targetCell ? targetCell.closest("table") : (eventTarget ? (eventTarget.nodeType === 1 ? eventTarget : eventTarget.parentElement)?.closest?.("table") : null);

    if (targetNode) {
        const hasParent = !!targetNode.parentId;
        const hasKids = getDescendantCount(targetNode.id) > 0;
        const isImg = !!(targetNode.isImage && targetNode.imageUrl);
        const lineCount = String(targetNode.content || "").split("\n").map(s => s.trim()).filter(Boolean).length;
        
        let tableMenuItems = "";
        if (targetCell && targetTable) {
            tableMenuItems = `
                <div class="ctx-item" data-cact="table-insert-row">➕ 在下方插入行 <span class="ctx-kbd">Enter</span></div>
                <div class="ctx-item" data-cact="table-insert-col">➕ 在右侧插入列</div>
                <div class="ctx-item" data-cact="table-delete-row">➖ 删除当前行</div>
                <div class="ctx-item" data-cact="table-delete-col">➖ 删除当前列</div>
                <div class="ctx-item danger" data-cact="table-delete">🗑️ 删除整个表格</div>
                <div class="ctx-divider"></div>
            `;
        } else {
            tableMenuItems = `
                <div class="ctx-item" data-cact="insert-table">▦ 插入 OneNote 表格 <span class="ctx-kbd">Alt+T</span></div>
            `;
        }

        menu.innerHTML = `
            ${tableMenuItems}
            <div class="ctx-item" data-cact="edit">${isImg ? "🔍 高清放大查看图片" : "✏️ 编辑卡片文字"} <span class="ctx-kbd">直接打字 / 双击</span></div>
            <div class="ctx-item" data-cact="toggle-handwriting">✍️ ${targetNode.fontStyle === "handwriting" ? "恢复默认印刷字体" : "切换为灵感批注手写体"} <span class="ctx-kbd">Ctrl+Shift+W</span></div>
            <div class="ctx-item" data-cact="todo">☑ 切换待办复选框 <span class="ctx-kbd">Ctrl+1</span></div>
            <div class="ctx-item" data-cact="child">➕ 衍生子卡片 <span class="ctx-kbd">Tab</span></div>
            <div class="ctx-item" data-cact="sibling">➕ 新增同级卡片 <span class="ctx-kbd">Enter</span></div>
            <div class="ctx-item" data-cact="insert-parent">➕ 插入中间父卡片 <span class="ctx-kbd">Ctrl+Enter</span></div>
            ${hasParent ? `<div class="ctx-item" data-cact="promote">⬅️ 提升节点层级 <span class="ctx-kbd">Shift+Tab</span></div>` : ""}
            ${hasKids ? `<div class="ctx-item" data-cact="fold">📁 ${targetNode.collapsed ? "展开" : "折叠"}子分支 <span class="ctx-kbd">Ctrl+/</span></div>` : ""}
            ${hasKids ? `<div class="ctx-item" data-cact="tidy-branch">📐 仅规整此分支子树 (不改其他卡片)</div>` : ""}
            ${lineCount >= 2 && !isImg ? `<div class="ctx-item" data-cact="split-lines">✂️ 按行拆分为 ${lineCount - 1} 张子卡片</div>` : ""}
            ${selectedNodeIds.size >= 2 ? `<div class="ctx-item" data-cact="merge-selected">🧲 合并选中的 ${selectedNodeIds.size} 张卡片为一卡</div>` : ""}
            ${hasParent ? `<div class="ctx-item" data-cact="unlink-parent">✂️ 断开与父卡片的箭头</div>` : ""}
            <div class="ctx-divider"></div>
            <div class="ctx-swatch-line">
                <span class="ctx-swatch-label">🏷️ OneNote 标记</span>
                <div class="card-bg-swatch-row">
                    <button class="card-bg-swatch" data-qtag="question" title="❓ 存疑/待查证 (Ctrl+3)">❓</button>
                    <button class="card-bg-swatch" data-qtag="idea" title="💡 关键灵感/假说 (Ctrl+4)">💡</button>
                    <button class="card-bg-swatch" data-qtag="done" title="✅ 已验证结论 (Ctrl+5)">✅</button>
                    <button class="card-bg-swatch" data-qtag="" title="🧹 清除标记">🧹</button>
                </div>
            </div>
            <div class="ctx-swatch-line">
                <span class="ctx-swatch-label">🎨 卡片底色</span>
                <div class="card-bg-swatch-row">
                    <button class="card-bg-swatch" data-bg="" title="默认深空底色">🌌</button>
                    <button class="card-bg-swatch swatch-rose" data-bg="rose" title="🌹 绯红底色 (核心问题/风险)"></button>
                    <button class="card-bg-swatch swatch-emerald" data-bg="emerald" title="🌿 翡翠底色 (结论/指标)"></button>
                    <button class="card-bg-swatch swatch-amber" data-bg="amber" title="🟡 琥珀底色 (核心假设)"></button>
                    <button class="card-bg-swatch swatch-sky" data-bg="sky" title="💎 晴空底色 (方法/概念)"></button>
                    <button class="card-bg-swatch swatch-violet" data-bg="violet" title="🔮 紫晶底色 (文献/灵感)"></button>
                </div>
            </div>
            <div class="ctx-divider"></div>
            <div class="ctx-item" data-cact="focus">⭐ ${targetNode.isFocus ? "取消重点" : "设为重点"} <span class="ctx-kbd">Ctrl+2 / F</span></div>
            ${(targetNode.customWidth || targetNode.customHeight || targetNode.customFontSize) ? `<div class="ctx-item" data-cact="reset-size">📏 恢复默认字号与自适应框大小 <span class="ctx-kbd">双击边框</span></div>` : ""}
            <div class="ctx-item" data-cact="copy-subtree-md">📋 复制此分支为 Markdown</div>
            <div class="ctx-item" data-cact="duplicate">🧬 克隆此卡片 <span class="ctx-kbd">Ctrl+D</span></div>
            <div class="ctx-divider"></div>
            <div class="ctx-item danger" data-cact="delete">🗑️ 仅删此卡片 (保留子卡) <span class="ctx-kbd">Del</span></div>
            ${hasKids ? `<div class="ctx-item danger" data-cact="delete-subtree">💥 删除整条分支 (含子卡) <span class="ctx-kbd">Shift+Del</span></div>` : ""}
        `;
    } else {
        menu.innerHTML = `
            <div class="ctx-item" data-cact="new-here">✨ 在此处新建自由卡片 <span class="ctx-kbd">双击空白</span></div>
            <div class="ctx-item" data-cact="ink-draw">🖍️ ${isInkDrawMode ? "退出" : "开启"}画布自由手绘/荧光笔圈注 <span class="ctx-kbd">P</span></div>
            <div class="ctx-item" data-cact="search">🔍 全局搜索卡片/内容 <span class="ctx-kbd">Ctrl+K</span></div>
            <div class="ctx-item" data-cact="select-all">☑️ 全选所有卡片 <span class="ctx-kbd">Ctrl+A</span></div>
            <div class="ctx-divider"></div>
            <div class="ctx-item" data-cact="expand-all">📂 展开全图所有折叠分支</div>
            <div class="ctx-item" data-cact="collapse-all">📁 折叠全图所有分支</div>
            <div class="ctx-item" data-cact="copy-all-md">📋 复制全图大纲为 Markdown</div>
            <div class="ctx-divider"></div>
            <div class="ctx-item" data-cact="tidy">🧭 一键整理为树状结构 <span class="ctx-kbd">M</span></div>
            <div class="ctx-item" data-cact="fit">⛶ 智能全景缩放适配 <span class="ctx-kbd">Ctrl+0</span></div>
        `;
    }

    menu.style.display = "block";
    const menuW = menu.offsetWidth || 235;
    const menuH = menu.offsetHeight || 320;
    menu.style.left = `${Math.min(window.innerWidth - menuW - 10, clientX)}px`;
    menu.style.top = `${Math.min(window.innerHeight - menuH - 10, clientY)}px`;

    menu.querySelectorAll(".card-bg-swatch[data-bg]").forEach(sw => {
        sw.addEventListener("click", (e) => {
            e.stopPropagation();
            hideCanvasContextMenu();
            setCardBgColor(sw.dataset.bg || "", targetNode);
        });
    });

    menu.querySelectorAll(".card-bg-swatch[data-qtag]").forEach(sw => {
        sw.addEventListener("click", (e) => {
            e.stopPropagation();
            hideCanvasContextMenu();
            toggleNodeQuickTag(sw.dataset.qtag || "", targetNode, true);
        });
    });

    menu.querySelectorAll(".ctx-item").forEach(item => {
        item.addEventListener("click", (e) => {
            e.stopPropagation();
            const act = item.dataset.cact;
            hideCanvasContextMenu();
            if (act === "insert-table") {
                applyFormatting("table");
            }
            else if (act === "table-insert-row" && targetNode && targetTable && targetCell) {
                const activeTr = targetCell.closest("tr");
                if (activeTr) {
                    const colCount = activeTr.children.length;
                    const newTr = document.createElement("tr");
                    for (let c = 0; c < colCount; c++) {
                        const newTd = document.createElement("td");
                        newTd.innerHTML = "<br>";
                        newTr.appendChild(newTd);
                    }
                    activeTr.parentNode.insertBefore(newTr, activeTr.nextSibling);
                    syncNodeContentFromTableChange(targetNode, targetTable);
                    renderEditor();
                    updateD3Graph();
                    renderPositions();
                    scheduleSaveGraph(true);
                    showToast("➕ 已在下方插入新行");
                }
            }
            else if (act === "table-insert-col" && targetNode && targetTable && targetCell) {
                const activeTr = targetCell.closest("tr");
                if (activeTr) {
                    const cIdx = Array.from(activeTr.children).indexOf(targetCell);
                    const allRows = Array.from(targetTable.querySelectorAll("tr"));
                    allRows.forEach(row => {
                        const isTh = !!row.querySelector("th");
                        const newCell = document.createElement(isTh ? "th" : "td");
                        newCell.innerHTML = isTh ? "新列" : "<br>";
                        const refCell = row.children[cIdx];
                        if (refCell && refCell.nextSibling) {
                            row.insertBefore(newCell, refCell.nextSibling);
                        } else {
                            row.appendChild(newCell);
                        }
                    });
                    syncNodeContentFromTableChange(targetNode, targetTable);
                    renderEditor();
                    updateD3Graph();
                    renderPositions();
                    scheduleSaveGraph(true);
                    showToast("➕ 已在右侧插入新列");
                }
            }
            else if (act === "table-delete-row" && targetNode && targetTable && targetCell) {
                const activeTr = targetCell.closest("tr");
                if (activeTr) {
                    const allRows = Array.from(targetTable.querySelectorAll("tr"));
                    if (allRows.length <= 1) {
                        targetTable.remove();
                    } else {
                        activeTr.remove();
                    }
                    syncNodeContentFromTableChange(targetNode, targetTable);
                    renderEditor();
                    updateD3Graph();
                    renderPositions();
                    scheduleSaveGraph(true);
                    showToast("➖ 已删除当前行");
                }
            }
            else if (act === "table-delete-col" && targetNode && targetTable && targetCell) {
                const activeTr = targetCell.closest("tr");
                if (activeTr) {
                    const cIdx = Array.from(activeTr.children).indexOf(targetCell);
                    const allRows = Array.from(targetTable.querySelectorAll("tr"));
                    allRows.forEach(row => {
                        if (row.children[cIdx]) row.children[cIdx].remove();
                    });
                    if (activeTr.children.length === 0) {
                        targetTable.remove();
                    }
                    const bodyEl = targetTable.closest(".canvas-note-card-body") || document.querySelector(`.node-card-body[data-node-id="${targetNode.id}"]`);
                    if (bodyEl) {
                        targetNode.content = htmlToSafeMarkdown(bodyEl.innerHTML).trim();
                    }
                    renderEditor();
                    updateD3Graph();
                    renderPositions();
                    scheduleSaveGraph(true);
                    showToast("➖ 已删除当前列");
                }
            }
            else if (act === "table-delete" && targetNode && targetTable) {
                const bodyEl = targetTable.closest(".canvas-note-card-body") || document.querySelector(`.node-card-body[data-node-id="${targetNode.id}"]`);
                targetTable.remove();
                if (bodyEl) {
                    targetNode.content = htmlToSafeMarkdown(bodyEl.innerHTML).trim();
                }
                renderEditor();
                updateD3Graph();
                renderPositions();
                scheduleSaveGraph(true);
                showToast("🗑️ 已删除整个表格");
            }
            else if (act === "edit" && targetNode) {
                if (targetNode.isImage && targetNode.imageUrl) openImageLightbox(targetNode);
                else startInlineCardEditById(targetNode.id, false);
            }
            else if (act === "toggle-handwriting" && targetNode) {
                targetNode.fontStyle = (targetNode.fontStyle === "handwriting" ? "" : "handwriting");
                refreshNodeStyles();
                showToast(targetNode.fontStyle === "handwriting" ? "✍️ 已设为灵感批注手写体" : "已恢复默认印刷字体", "info");
                scheduleSaveGraph(true);
            }
            else if (act === "todo" && targetNode) toggleTodoOnSelectedCard(targetNode);
            else if (act === "child") createChildNode();
            else if (act === "sibling") createSiblingNode(false);
            else if (act === "insert-parent" && targetNode) insertParentNode(targetNode);
            else if (act === "promote") promoteSelectedNode();
            else if (act === "fold" && targetNode) toggleNodeFold(targetNode);
            else if (act === "tidy-branch" && targetNode) tidySubtreeLayout(targetNode);
            else if (act === "split-lines" && targetNode) splitCardByLines(targetNode);
            else if (act === "merge-selected") mergeSelectedNodes();
            else if (act === "unlink-parent" && targetNode) {
                targetNode.parentId = null;
                sanitizeGraph();
                updateD3Graph();
                renderPositions();
                scheduleSaveGraph(true);
                showToast("✂️ 已断开与父卡片的箭头");
            }
            else if (act === "focus") toggleNodeFocus(targetNode);
            else if (act === "reset-size" && targetNode) resetCardCustomSize(targetNode);
            else if (act === "copy-subtree-md" && targetNode) copyOutlineAsMarkdown(targetNode);
            else if (act === "duplicate") duplicateSelectedNodes();
            else if (act === "delete") deleteSelectedNode(false);
            else if (act === "delete-subtree") deleteSelectedNode(true);
            else if (act === "new-here") {
                if (typeof window.spawnFreeCardAtCoords === "function") {
                    window.spawnFreeCardAtCoords([lastCanvasMouseCoords.x, lastCanvasMouseCoords.y], "");
                }
            }
            else if (act === "ink-draw") toggleInkDrawMode();
            else if (act === "search") openQuickSearchModal();
            else if (act === "select-all") selectAllVisibleNodes();
            else if (act === "expand-all") expandOrCollapseAllBranches(false);
            else if (act === "collapse-all") expandOrCollapseAllBranches(true);
            else if (act === "copy-all-md") copyOutlineAsMarkdown(null);
            else if (act === "tidy") tidyLayout();
            else if (act === "fit") fitCanvasToAllNodes();
        });
    });
}

function hideCanvasContextMenu() {
    const menu = document.getElementById("canvas-context-menu");
    if (menu) menu.style.display = "none";
}

// ============================================================================
// v3.0.0 OneNote + XMind 满配直觉引擎：箭头关系词编辑、卡片宽度拖拽与 To-Do 复选框切换
// ============================================================================

// 1. 双击箭头或点“✏️ 写关系词”在箭头中央添加/修改关系词（如“导致”、“抑制”、“混杂变量”）
function promptEditSelectedLinkLabel() {
    if (!selectedLink) return;
    const sId = cleanNodeId(selectedLink.source);
    const tId = cleanNodeId(selectedLink.target);

    if (selectedLink.type === "relation") {
        const rel = links.find(l => l.type === "relation" && (
            (cleanNodeId(l.source) === sId && cleanNodeId(l.target) === tId) ||
            (cleanNodeId(l.source) === tId && cleanNodeId(l.target) === sId)
        ));
        const currentLabel = (rel && rel.label) ? rel.label : (selectedLink.label || "");
        const nextLabel = prompt("请输入这条箭头上的关系说明词（留空并确定即可清除关系词）：", currentLabel);
        if (nextLabel === null) return;
        const trimmed = nextLabel.trim();
        if (rel) rel.label = trimmed;
        selectedLink.label = trimmed;
    } else {
        const child = nodes.find(n => n.id === tId);
        if (!child) return;
        const currentLabel = child.edgeLabel || "";
        const nextLabel = prompt("请输入这条箭头上的关系说明词（如：导致、抑制、混杂变量；留空即可清除）：", currentLabel);
        if (nextLabel === null) return;
        const trimmed = nextLabel.trim();
        if (trimmed) child.edgeLabel = trimmed;
        else delete child.edgeLabel;
        selectedLink.label = trimmed;
    }

    sanitizeGraph();
    updateD3Graph();
    renderPositions();
    updateFloatingActionBarsPosition();
    scheduleSaveGraph(true);
    showToast(selectedLink.label ? `🏷️ 已设置箭头关系词：「${selectedLink.label}」` : "🧹 已清除箭头关系词");
}

// 2. v3.4.3 全向 8 手柄对侧锚定调整尺寸 + 上下拉智能重排 + 对角线等比字号缩放 + OneNote MTV 实时轻微避让引擎：
// - 左右拉 (mode === "e" | "w")：对侧边缘固定，仅调宽度 (d.customWidth)，字号不变，内部文字自动折行自适应
// - 上下拉 (mode === "s" | "n")：对侧边缘固定，调高度 (d.customHeight)，往上拉缩高时自动扩宽重排换行，字号不变
// - 拉对角线 (mode === "se" | "sw" | "ne" | "nw")：对角顶点固定，框框缩放的同时，内部字体大小 (d.customFontSize) 自动按框框比例同步变大/变小！
function resolveAuthoritativeNode(rawD, el) {
    const groupEl = el && el.closest ? el.closest(".node-group") : null;
    const groupDatum = groupEl ? d3.select(groupEl).datum() : null;
    const targetId = (groupDatum && groupDatum.id) || (rawD && rawD.id);
    if (targetId && Array.isArray(nodes)) {
        const found = nodes.find(n => n.id === targetId);
        if (found) return found;
    }
    return groupDatum || rawD;
}

function resetCardCustomSize(rawD, handleEl = null) {
    const d = resolveAuthoritativeNode(rawD, handleEl);
    if (!d) return;
    delete d.customWidth;
    delete d.customHeight;
    delete d.customFontSize;
    delete d._manualHeight;
    delete d._userResized;
    refreshNodeStyles();
    renderPositions();
    updateFloatingActionBarsPosition();
    scheduleSaveGraph(true);
    showToast("📏 已恢复卡片默认字号与自适应尺寸");
}

// OneNote 经典碰撞自动轻微避让机制 (v3.4.3 最小平移向量 MTV + 级联传导)：
// 1. 当拉动边框/对角线改变卡片框大小（或打字使卡片框变大）碰到其他卡片时，被碰卡片沿最小重叠轴自动位移一点点 (8px 呼吸间距)；
// 2. 但如果是选中卡片直接拖动移动位置 (dragged)，绝不触发避让，100% 保持自由重合叠放效果！
function applyOneNoteResizeNudge(resizedNode, mode = "e") {
    if (!resizedNode || !Array.isArray(nodes) || nodes.length < 2) return;
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const visibleList = nodes.filter(n => isNodeVisible(n, nodeMap));
    if (visibleList.length < 2) return;

    const getBox = (n) => {
        const w = Math.max(36, n._cardW || n.customWidth || 130);
        const h = Math.max(24, n._cardH || n.customHeight || 36);
        const cx = Number.isFinite(n.x) ? n.x : 450;
        const cy = Number.isFinite(n.y) ? n.y : 320;
        return {
            w, h, cx, cy,
            left: cx - w / 2,
            right: cx + w / 2,
            top: cy - h / 2,
            bottom: cy + h / 2
        };
    };

    const GAP = 8; // OneNote 风格：碰到其他框时仅轻微推开一点点 (8px)
    let anyMoved = false;
    const activeSources = new Set([resizedNode.id]);

    // 最多进行 4 轮级联微移（防止 A 推 B 后 B 压住 C）
    for (let pass = 0; pass < 4; pass++) {
        let passMoved = false;
        const currentSources = Array.from(activeSources)
            .map(id => nodeMap.get(id))
            .filter(Boolean);

        for (const src of currentSources) {
            const boxA = getBox(src);
            for (const other of visibleList) {
                if (other.id === src.id || other.id === resizedNode.id) continue;
                const boxB = getBox(other);

                const overlapX = Math.min(boxA.right, boxB.right) - Math.max(boxA.left, boxB.left);
                const overlapY = Math.min(boxA.bottom, boxB.bottom) - Math.max(boxA.top, boxB.top);

                if (overlapX > 0 && overlapY > 0) {
                    passMoved = true;
                    anyMoved = true;

                    // 沿最小重叠方向 (MTV) 轻微推开一点点，兼顾当前拉动方向直觉
                    const preferHorizontal = (mode === "e" || mode === "w")
                        ? (overlapX <= overlapY * 1.6)
                        : (overlapX < overlapY * 0.85);

                    if (preferHorizontal) {
                        const pushRight = (boxB.cx > boxA.cx) || (boxB.cx === boxA.cx && mode !== "w");
                        const shiftX = Math.ceil(overlapX + GAP);
                        other.x = Math.round(boxB.cx + (pushRight ? shiftX : -shiftX));
                        if (typeof other.fx === "number") other.fx = other.x;
                    } else {
                        const pushDown = (boxB.cy >= boxA.cy) || (boxB.cy === boxA.cy && mode !== "n");
                        const shiftY = Math.ceil(overlapY + GAP);
                        other.y = Math.round(boxB.cy + (pushDown ? shiftY : -shiftY));
                        if (typeof other.fy === "number") other.fy = other.y;
                    }
                    activeSources.add(other.id);
                }
            }
        }
        if (!passMoved) break;
    }

    if (anyMoved) {
        renderPositions();
    }
}

function startCardResize(event, rawD, handleEl, mode = "e") {
    const d = resolveAuthoritativeNode(rawD, handleEl);
    if (!d || !svg) return;
    const cardEl = handleEl.closest(".canvas-note-card");
    const pt0 = (event.touches && event.touches[0]) ? event.touches[0] : event;
    const startClientX = pt0.clientX;
    const startClientY = pt0.clientY;

    const startW = (cardEl && cardEl.offsetWidth)
        ? cardEl.offsetWidth
        : ((typeof d.customWidth === "number" && Number.isFinite(d.customWidth)) ? d.customWidth : (d._cardW || 140));
    const startH = (cardEl && cardEl.offsetHeight)
        ? cardEl.offsetHeight
        : ((typeof d.customHeight === "number" && Number.isFinite(d.customHeight)) ? d.customHeight : (d._cardH || 36));
    const startFontSize = (typeof d.customFontSize === "number" && Number.isFinite(d.customFontSize))
        ? d.customFontSize
        : 13.5;
    const startNodeX = Number.isFinite(d.x) ? d.x : 450;
    const startNodeY = Number.isFinite(d.y) ? d.y : 320;

    const zoomScale = (d3.zoomTransform(svg.node()) && d3.zoomTransform(svg.node()).k) || 1;

    d._userResized = true;
    handleEl.classList.add("is-resizing");
    if (cardEl) cardEl.classList.add("is-resizing-card");

    const updateResize = (clientX, clientY) => {
        const rawDeltaX = (clientX - startClientX) / zoomScale;
        const rawDeltaY = (clientY - startClientY) / zoomScale;

        if (mode === "e" || mode === "w") {
            // 1. 左右拉：对侧边缘固定，仅调宽度，字号保持不变，内部文字自动换行自适应
            const deltaW = (mode === "w") ? -rawDeltaX : rawDeltaX;
            const nextW = Math.round(Math.max(36, Math.min(960, startW + deltaW)));
            d.customWidth = nextW;
            delete d.customHeight;
            delete d._manualHeight;

            refreshNodeStyles();
            const actualW = d._cardW || nextW;
            const signX = (mode === "w") ? -1 : 1;
            d.x = Math.round(startNodeX + signX * (actualW - startW) / 2);
            if (layoutMode !== "force") d.fx = d.x;

            if (cardEl) {
                cardEl.setAttribute("data-resize-hud", `↔ 宽 ${actualW}px · 自动换行`);
            }
        } else if (mode === "s" || mode === "n") {
            // 2. 上下拉：对侧边缘固定，调整卡片高度；若往上拉缩减多行卡片高度，自动扩宽让内部文字重排为更少行！
            const deltaH = (mode === "n") ? -rawDeltaY : rawDeltaY;
            const nextH = Math.round(Math.max(26, Math.min(820, startH + deltaH)));
            d.customHeight = nextH;
            d._manualHeight = true;

            if (nextH < startH - 2) {
                // 用户正把卡片压扁（减少高度）：若当前宽度下文字换行导致高度大于目标高度，自动渐进加宽卡片以减少换行行数
                let trialW = startW;
                d.customWidth = trialW;
                refreshNodeStyles();
                let guard = 0;
                while ((d._cardH || startH) > nextH + 4 && trialW < 920 && guard < 8) {
                    trialW = Math.min(960, Math.round(trialW + Math.max(28, (startH - nextH) * 2.2)));
                    d.customWidth = trialW;
                    refreshNodeStyles();
                    guard++;
                }
            } else {
                refreshNodeStyles();
            }

            const actualH = d._cardH || nextH;
            const signY = (mode === "n") ? -1 : 1;
            d.y = Math.round(startNodeY + signY * (actualH - startH) / 2);
            if (layoutMode !== "force") d.fy = d.y;

            if (cardEl) {
                cardEl.setAttribute("data-resize-hud", `↕ 高 ${actualH}px · 换行自适应`);
            }
        } else if (mode === "se" || mode === "sw" || mode === "ne" || mode === "nw") {
            // 3. 拉对角线：对角顶点锚定，框框与内部字体大小同步按比例缩放！
            const signX = (mode === "sw" || mode === "nw") ? -1 : 1;
            const signY = (mode === "ne" || mode === "nw") ? -1 : 1;
            const deltaW = rawDeltaX * signX;
            const deltaH = rawDeltaY * signY;

            const ratioX = (startW + deltaW) / Math.max(40, startW);
            const ratioY = (startH + deltaH) / Math.max(26, startH);
            const scaleFactor = Math.max(0.45, Math.min(4.5, ratioX * 0.65 + ratioY * 0.35));

            const nextFontSize = Math.round(Math.max(8.5, Math.min(64, startFontSize * scaleFactor)) * 10) / 10;
            const nextW = Math.round(Math.max(38, Math.min(960, startW * scaleFactor)));
            const nextH = Math.round(Math.max(26, Math.min(820, startH * scaleFactor)));

            d.customFontSize = nextFontSize;
            d.customWidth = nextW;
            d.customHeight = nextH;
            d._manualHeight = false;

            refreshNodeStyles();
            const actualW = d._cardW || nextW;
            const actualH = d._cardH || nextH;
            d.x = Math.round(startNodeX + signX * (actualW - startW) / 2);
            d.y = Math.round(startNodeY + signY * (actualH - startH) / 2);
            if (layoutMode !== "force") {
                d.fx = d.x;
                d.fy = d.y;
            }

            if (cardEl) {
                const pct = Math.round((nextFontSize / 13.5) * 100);
                cardEl.setAttribute("data-resize-hud", `⤡ 字号 ${Math.round(nextFontSize)}px (${pct}%)`);
            }
        }

        // OneNote 直觉：框变动碰到其他框时，实时自动轻微位移避让一点点
        applyOneNoteResizeNudge(d, mode);
        renderPositions();
        updateFloatingActionBarsPosition();
    };

    const onMouseMove = (ev) => {
        updateResize(ev.clientX, ev.clientY);
    };

    const onTouchMove = (ev) => {
        if (!ev.touches || ev.touches.length === 0) return;
        if (ev.cancelable) ev.preventDefault();
        updateResize(ev.touches[0].clientX, ev.touches[0].clientY);
    };

    const onUp = () => {
        handleEl.classList.remove("is-resizing");
        if (cardEl) {
            cardEl.classList.remove("is-resizing-card");
            cardEl.removeAttribute("data-resize-hud");
        }
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onUp);
        window.removeEventListener("touchmove", onTouchMove);
        window.removeEventListener("touchend", onUp);
        window.removeEventListener("touchcancel", onUp);

        refreshNodeStyles();
        applyOneNoteResizeNudge(d, mode);
        renderPositions();
        updateFloatingActionBarsPosition();
        scheduleSaveGraph(true);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onUp);
    window.addEventListener("touchcancel", onUp);
}

// 3. OneNote 风格：Ctrl + 1（或点气泡/右键菜单 ☑）一键为当前卡片切换 To-Do 待办复选框
function toggleTodoOnSelectedCard(targetNode = selectedNode) {
    if (!targetNode) return;
    let raw = (targetNode.content || targetNode.label || "").trim();
    if (!raw) raw = targetNode.label || "待办事项";

    const lines = raw.split("\n");
    const taskRegex = /^([ \t]*(?:[•·▪⁃‣\-\*][ \t]+)?)\[([ xX])\][ \t]+(.*)$/;
    const hasAnyTask = lines.some(l => taskRegex.test(l));

    const updatedLines = lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return line;
        if ( /^#{1,4}\s+/.test(trimmed) && lines.length > 1 && i === 0) return line;
        const m = taskRegex.exec(line);
        if (hasAnyTask) {
            return m ? m[3] : line;
        } else {
            const cleanLine = line.replace(/^[ \t]*[•·▪⁃‣\-\*][ \t]+/, "");
            return `- [ ] ${cleanLine}`;
        }
    });

    targetNode.content = updatedLines.join("\n");
    refreshNodeStyles();
    renderEditor();
    scheduleSaveGraph(true);
    showToast(hasAnyTask ? "🧹 已移除待办复选框" : "☑ 已添加待办复选框 (可直接点击画布卡片上的方框打勾！)");
}

// 4. 在画布卡片上直接点击第 N 个复选框时，实时切换 [ ] 与 [x] 状态
function toggleNthTaskCheckboxInNode(node, taskIdx, isChecked) {
    if (!node) return;
    let raw = (node.content || node.label || "");
    const lines = raw.split("\n");
    const taskRegex = /^([ \t]*(?:[•·▪⁃‣\-\*][ \t]+)?)\[([ xX])\]([ \t]+.*)$/;
    let currentIdx = 0;

    const nextLines = lines.map(line => {
        const m = taskRegex.exec(line);
        if (!m) return line;
        if (currentIdx === taskIdx) {
            currentIdx++;
            const prefix = m[1] && m[1].trim() ? m[1] : "- ";
            return `${prefix}[${isChecked ? "x" : " "}]${m[3]}`;
        }
        currentIdx++;
        return line;
    });

    node.content = nextLines.join("\n");
    refreshNodeStyles();
    if (selectedNode && selectedNode.id === node.id) {
        renderEditor();
    }
    scheduleSaveGraph(true);
}

// ============================================================================
// v3.1.0 终极自我进化套件：
// 1. Ctrl+K 跨图谱全局秒搜与大纲实时筛选 + 一键复制大纲为 Markdown
// 2. ⛶ (Ctrl+0) 真正的包围盒智能全景自适应缩放 (fitCanvasToAllNodes)
// 3. 🖼️ 截图双击高清灯箱放大镜 (HD Lightbox) + 桌面图片/JSON 直接拖拽上画布
// 4. 🎨 整卡语义底色染色 (Card Tints) + 全图分支一键展开/折叠
// 5. ⚡ 心流捕获一键送入脑图 + 📝 双链反向链接实时引擎 + ✨ AI 知识结构雷达
// ============================================================================

function initV31Enhancements() {
    initGlobalQuickSearch();
    initCanvasDragAndDrop();
    initSecondaryWorkbenches();
}

// 1. 自动展开目标卡片的所有折叠祖先，确保跳转聚焦时卡片一定可见
function unfoldAncestorsOf(node) {
    if (!node) return;
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    let curr = node;
    let changed = false;
    const visited = new Set();
    while (curr && curr.parentId && !visited.has(curr.id)) {
        visited.add(curr.id);
        const parent = nodeMap.get(curr.parentId);
        if (parent && parent.collapsed) {
            parent.collapsed = false;
            changed = true;
        }
        curr = parent;
    }
    if (changed) {
        if (layoutMode === "tree") tidyLayout();
        else updateD3Graph();
        renderPositions();
    }
}

// 2. ⛶ / Ctrl+0：计算画布上所有可见卡片的真实包围盒 (Bounding Box) 并平滑居中缩放适配视口
function fitCanvasToAllNodes() {
    if (!svg || !zoom) return;
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const visibleNodes = nodes.filter(n => isNodeVisible(n, nodeMap));
    if (visibleNodes.length === 0) {
        svg.transition().duration(420).call(zoom.transform, d3.zoomIdentity);
        return;
    }

    const container = document.getElementById("graph-container");
    const viewW = (container && container.clientWidth) ? container.clientWidth : 900;
    const viewH = (container && container.clientHeight) ? container.clientHeight : 620;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    visibleNodes.forEach(n => {
        const cx = Number.isFinite(n.x) ? n.x : 450;
        const cy = Number.isFinite(n.y) ? n.y : 320;
        const hw = (n._cardW || 130) / 2 + 24;
        const hh = (n._cardH || 42) / 2 + 24;
        if (cx - hw < minX) minX = cx - hw;
        if (cy - hh < minY) minY = cy - hh;
        if (cx + hw > maxX) maxX = cx + hw;
        if (cy + hh > maxY) maxY = cy + hh;
    });

    const boxW = Math.max(160, maxX - minX);
    const boxH = Math.max(120, maxY - minY);
    const pad = 72;
    const scaleX = (viewW - pad * 2) / boxW;
    const scaleY = (viewH - pad * 2) / boxH;
    const nextScale = Math.max(0.18, Math.min(1.25, Math.min(scaleX, scaleY)));

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const transform = d3.zoomIdentity
        .translate(viewW / 2, viewH / 2)
        .scale(nextScale)
        .translate(-centerX, -centerY);

    svg.transition().duration(460).ease(d3.easeCubicOut).call(zoom.transform, transform);
    showToast(`⛶ 已智能居中适配全图 (${visibleNodes.length} 张可见卡片)`);
}

// 3. 整卡语义背景底色设置 (Heptabase / OneNote / XMind 风格)
const CARD_BG_LABELS = {
    "": "🌌 默认深空",
    "rose": "🌹 绯红底色 (核心问题/风险)",
    "emerald": "🌿 翡翠底色 (结论/测量指标)",
    "amber": "🟡 琥珀底色 (核心假设/警示)",
    "sky": "💎 晴空底色 (方法/概念)",
    "violet": "🔮 紫晶底色 (文献/灵感)"
};

function toggleCardBgColor(colorKey = "", singleFallbackNode = null) {
    const targetList = selectedNodeIds.size > 0
        ? nodes.filter(n => selectedNodeIds.has(n.id))
        : (singleFallbackNode ? [singleFallbackNode] : (selectedNode ? [selectedNode] : []));
    if (targetList.length === 0) return;

    // 如果选中的所有卡片此前已经是该底色，则再次点击取消底色（恢复默认深空/浅色纯净背景）
    const allMatch = targetList.every(n => n.cardBgColor === colorKey);
    const newColor = allMatch ? "" : colorKey;
    setCardBgColor(newColor, singleFallbackNode);
    if (typeof updateQuickBubblePosition === "function") {
        updateQuickBubblePosition();
    }
}

function setCardBgColor(colorKey = "", singleFallbackNode = null) {
    const targetList = selectedNodeIds.size > 0
        ? nodes.filter(n => selectedNodeIds.has(n.id))
        : (singleFallbackNode ? [singleFallbackNode] : (selectedNode ? [selectedNode] : []));
    if (targetList.length === 0) return;

    targetList.forEach(n => {
        if (colorKey) n.cardBgColor = colorKey;
        else delete n.cardBgColor;
    });
    refreshNodeStyles();
    scheduleSaveGraph(true);
    showToast(colorKey ? `🎨 框框底色已设为 ${CARD_BG_LABELS[colorKey] || colorKey}` : "🎨 框框已恢复默认底色");
    if (typeof updateQuickBubblePosition === "function") {
        updateQuickBubblePosition();
    }
}

// 4. 全图一键展开或折叠所有分支
function expandOrCollapseAllBranches(shouldCollapse = false) {
    const parentIds = new Set(nodes.map(n => n.parentId).filter(Boolean));
    let count = 0;
    nodes.forEach(n => {
        if (parentIds.has(n.id)) {
            if (shouldCollapse && n.parentId !== null) {
                n.collapsed = true;
                count++;
            } else if (!shouldCollapse && n.collapsed) {
                n.collapsed = false;
                count++;
            }
        }
    });
    if (shouldCollapse && count === 0) {
        nodes.forEach(n => {
            if (parentIds.has(n.id)) {
                n.collapsed = true;
                count++;
            }
        });
    }
    if (layoutMode === "tree") tidyLayout();
    else updateD3Graph();
    renderPositions();
    scheduleSaveGraph(true);
    showToast(shouldCollapse ? `📁 已折叠 ${count} 个父级分支` : "📂 已展开全图所有折叠分支");
}

// 5. 一键将全图或选中分支导出/复制为干净的层级 Markdown 大纲
function copyOutlineAsMarkdown(rootNode = null) {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const childrenByParent = new Map();
    nodes.forEach(n => childrenByParent.set(n.id, []));
    nodes.forEach(n => {
        if (n.parentId && childrenByParent.has(n.parentId)) {
            childrenByParent.get(n.parentId).push(n);
        }
    });
    childrenByParent.forEach(list => list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));

    const roots = rootNode
        ? [rootNode]
        : nodes.filter(n => !n.parentId || !nodeMap.has(n.parentId)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const lines = [];
    const visited = new Set();

    function serializeBranch(n, depth) {
        if (!n || visited.has(n.id)) return;
        visited.add(n.id);
        const edgePrefix = n.edgeLabel ? `【${n.edgeLabel}】➔ ` : "";
        const starPrefix = n.isFocus ? "⭐ " : "";
        const rawBody = (n.content || n.label || "未命名").replace(/<[^>]+>/g, "").trim();
        const bodyLines = rawBody.split("\n").map(s => s.trim()).filter(Boolean);
        const headLine = bodyLines[0] || n.label || "未命名";

        if (depth === 0) {
            lines.push(`## ${starPrefix}${edgePrefix}${headLine}`);
            bodyLines.slice(1).forEach(sub => lines.push(`  ${sub}`));
        } else {
            const indent = "  ".repeat(depth - 1);
            lines.push(`${indent}- ${starPrefix}${edgePrefix}${headLine}`);
            bodyLines.slice(1).forEach(sub => lines.push(`${indent}  ${sub}`));
        }
        (childrenByParent.get(n.id) || []).forEach(child => serializeBranch(child, depth + 1));
    }

    roots.forEach(r => {
        serializeBranch(r, 0);
        lines.push("");
    });

    const mdOutput = lines.join("\n").trim();
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(mdOutput).then(() => {
            showToast(rootNode ? `📋 已复制【${rootNode.label}】分支 Markdown 大纲到剪贴板！` : `📋 已复制全图 Markdown 大纲 (${visited.size} 张卡片) 到剪贴板！`);
        }).catch(() => {
            prompt("请复制以下 Markdown 大纲：", mdOutput);
        });
    } else {
        prompt("请复制以下 Markdown 大纲：", mdOutput);
    }
}

// 6. Ctrl+K 全局即时搜索面板 (#quick-open / #searchInput / #outline-filter)
function openQuickSearchModal(initialQuery = "") {
    const modal = document.getElementById("quick-open");
    const input = document.getElementById("quick-input");
    if (!modal || !input) return;
    modal.hidden = false;
    if (typeof initialQuery === "string" && initialQuery.length > 0) {
        input.value = initialQuery;
    }
    input.focus();
    input.select();
    renderQuickSearchResults(input.value);
}

function renderQuickSearchResults(rawQuery = "") {
    const resultsEl = document.getElementById("quick-results");
    if (!resultsEl) return;
    const q = (rawQuery || "").trim().toLowerCase();

    // 收集当前图谱以及所有其他图谱中的匹配卡片
    const matches = [];
    const currentMapTitle = mapsManifest.find(m => m.id === activeMapId)?.title || "当前图谱";

    function checkNodeMatch(n, mapId, mapTitle) {
        const title = String(n.label || "");
        const body = String(n.content || "");
        const edge = String(n.edgeLabel || "");
        const isRed = body.includes("#ef4444") || body.includes("rgb(239, 68, 68)");
        const isGreen = body.includes("#10b981") || body.includes("rgb(16, 185, 129)");
        const isTodo = /\[[ xX]\]/.test(body);

        if (!q) {
            matches.push({ node: n, mapId, mapTitle, isRed, isGreen, isTodo, score: (n.isFocus ? 0 : 1) });
            return;
        }
        if ((q === "红" || q === "red" || q === "🔴") && isRed) {
            matches.push({ node: n, mapId, mapTitle, isRed, isGreen, isTodo, score: 0 });
            return;
        }
        if ((q === "绿" || q === "green" || q === "🟢") && isGreen) {
            matches.push({ node: n, mapId, mapTitle, isRed, isGreen, isTodo, score: 0 });
            return;
        }
        if ((q === "重点" || q === "star" || q === "⭐") && n.isFocus) {
            matches.push({ node: n, mapId, mapTitle, isRed, isGreen, isTodo, score: 0 });
            return;
        }
        if ((q === "todo" || q === "待办" || q === "☑") && isTodo) {
            matches.push({ node: n, mapId, mapTitle, isRed, isGreen, isTodo, score: 0 });
            return;
        }

        const hay = `${title} ${body.replace(/<[^>]+>/g, " ")} ${edge}`.toLowerCase();
        if (hay.includes(q)) {
            const inTitle = title.toLowerCase().includes(q) ? 0 : 1;
            matches.push({ node: n, mapId, mapTitle, isRed, isGreen, isTodo, score: inTitle });
        }
    }

    nodes.forEach(n => checkNodeMatch(n, activeMapId, currentMapTitle));

    // 如果有查询词，同时检索其他图谱的卡片，支持一键跨图谱直达！
    if (q) {
        mapsManifest.forEach(m => {
            if (m.id === activeMapId) return;
            const mData = allMapsMemoryCache[m.id];
            if (mData && Array.isArray(mData.nodes)) {
                mData.nodes.forEach(n => checkNodeMatch(n, m.id, m.title));
            }
        });
    }

    matches.sort((a, b) => a.score - b.score);
    const topMatches = matches.slice(0, 35);

    if (topMatches.length === 0) {
        resultsEl.innerHTML = `<div class="quick-empty-hint">未找到匹配的卡片（可搜标题、正文、关系词，或输入 🔴 / 🟢 / ⭐ / 待办 筛选）</div>`;
        return;
    }

    resultsEl.innerHTML = "";
    topMatches.forEach((item, idx) => {
        const row = document.createElement("div");
        row.className = "quick-result-item" + (idx === 0 ? " is-active" : "");
        const cleanSnippet = String(item.node.content || "")
            .replace(/!\[.*?\]\(.*?\)/g, "[图片]")
            .replace(/<[^>]+>/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 75);
        const badges = [
            item.node.isFocus ? "⭐" : "",
            item.isRed ? "🔴" : "",
            item.isGreen ? "🟢" : "",
            item.isTodo ? "☑" : "",
            item.node.edgeLabel ? `🏷️${escapeHTML(item.node.edgeLabel)}` : ""
        ].filter(Boolean).join(" ");

        row.innerHTML = `
            <div class="quick-result-main">
                <span class="quick-result-title">${escapeHTML(item.node.label || "未命名")}</span>
                <span class="quick-result-badges">${badges}</span>
                <span class="quick-result-map">${escapeHTML(item.mapTitle)}</span>
            </div>
            <div class="quick-result-snippet">${escapeHTML(cleanSnippet)}</div>
        `;
        row.addEventListener("click", () => {
            document.getElementById("quick-open").hidden = true;
            if (item.mapId !== activeMapId) {
                switchActiveMap(item.mapId);
            }
            const target = nodes.find(n => n.id === item.node.id);
            if (target) {
                // 确保切回思维图谱主工作台
                const graphTabBtn = document.querySelector('.nav-tab[data-tab="graph"]');
                if (graphTabBtn && !graphTabBtn.classList.contains("active")) graphTabBtn.click();
                unfoldAncestorsOf(target);
                setTimeout(() => focusOnNode(target), 60);
            }
        });
        resultsEl.appendChild(row);
    });
}

function initGlobalQuickSearch() {
    const topSearch = document.getElementById("searchInput");
    const quickModal = document.getElementById("quick-open");
    const quickInput = document.getElementById("quick-input");
    const outlineFilter = document.getElementById("outline-filter");

    // 在大纲抽屉顶部注入“📋 复制 MD”快捷按钮
    const outlineHeader = document.querySelector("#outline-panel .outline-header");
    if (outlineHeader && !document.getElementById("btn-copy-outline-md")) {
        const copyBtn = document.createElement("button");
        copyBtn.id = "btn-copy-outline-md";
        copyBtn.className = "outline-copy-md-btn";
        copyBtn.title = "一键将当前思维导图大纲复制为层级 Markdown (可直接粘贴到 Word / Notion / 汇报材料)";
        copyBtn.textContent = "📋 复制 MD";
        copyBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            copyOutlineAsMarkdown(null);
        });
        const closeBtn = document.getElementById("btn-outline-close");
        outlineHeader.insertBefore(copyBtn, closeBtn);
    }

    if (topSearch) {
        topSearch.addEventListener("focus", () => {
            openQuickSearchModal(topSearch.value);
        });
        topSearch.addEventListener("input", () => {
            openQuickSearchModal(topSearch.value);
        });
    }

    if (quickModal && quickInput) {
        quickModal.addEventListener("click", (e) => {
            if (e.target === quickModal) quickModal.hidden = true;
        });
        quickInput.addEventListener("input", () => {
            renderQuickSearchResults(quickInput.value);
        });
        quickInput.addEventListener("keydown", (e) => {
            const rows = Array.from(document.querySelectorAll("#quick-results .quick-result-item"));
            if (rows.length === 0) return;
            let activeIdx = rows.findIndex(r => r.classList.contains("is-active"));
            if (e.key === "ArrowDown") {
                e.preventDefault();
                if (activeIdx >= 0) rows[activeIdx].classList.remove("is-active");
                activeIdx = (activeIdx + 1) % rows.length;
                rows[activeIdx].classList.add("is-active");
                rows[activeIdx].scrollIntoView({ block: "nearest" });
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                if (activeIdx >= 0) rows[activeIdx].classList.remove("is-active");
                activeIdx = (activeIdx - 1 + rows.length) % rows.length;
                rows[activeIdx].classList.add("is-active");
                rows[activeIdx].scrollIntoView({ block: "nearest" });
            } else if (e.key === "Enter") {
                e.preventDefault();
                const targetRow = rows[activeIdx >= 0 ? activeIdx : 0];
                if (targetRow) targetRow.click();
            }
        });
    }

    if (outlineFilter) {
        outlineFilter.addEventListener("input", () => {
            renderOutlineTree(outlineFilter.value);
        });
    }
}

// 7. 🖼️ 双击截图卡片打开全屏高清灯箱放大镜 (HD Image Lightbox) + 拖拽桌面图片文件直接落入画布
function openImageLightbox(node) {
    if (!node || !node.imageUrl) return;
    let modal = document.getElementById("img-lightbox-modal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "img-lightbox-modal";
        modal.className = "img-lightbox-overlay";
        modal.innerHTML = `
            <div class="img-lightbox-toolbar">
                <span class="img-lightbox-title" id="img-lightbox-caption">📸 截图高清预览</span>
                <div style="display:flex; gap:8px;">
                    <button class="floating-bar-btn" id="img-lightbox-rename-btn">✏️ 修改图片图注</button>
                    <button class="floating-bar-btn danger" id="img-lightbox-close-btn">✕ 关闭 (Esc)</button>
                </div>
            </div>
            <img id="img-lightbox-view" class="img-lightbox-img" src="" alt="高清预览" />
        `;
        document.body.appendChild(modal);

        modal.addEventListener("click", (e) => {
            if (e.target === modal || e.target.id === "img-lightbox-close-btn") {
                modal.style.display = "none";
            }
        });
    }

    const imgEl = document.getElementById("img-lightbox-view");
    const capEl = document.getElementById("img-lightbox-caption");
    const renBtn = document.getElementById("img-lightbox-rename-btn");

    if (imgEl) imgEl.src = node.imageUrl;
    if (capEl) capEl.textContent = node.label || "📸 截图高清预览";
    if (renBtn) {
        renBtn.onclick = (e) => {
            e.stopPropagation();
            const nextCaption = prompt("请输入截图卡片的图注标题：", node.label || "");
            if (nextCaption !== null && nextCaption.trim()) {
                node.label = nextCaption.trim();
                if (capEl) capEl.textContent = node.label;
                refreshNodeStyles();
                renderEditor();
                scheduleSaveGraph(true);
                showToast("✏️ 已更新截图说明文字");
            }
        };
    }
    modal.style.display = "flex";
}

function initCanvasDragAndDrop() {
    const container = document.getElementById("graph-container");
    if (!container) return;

    container.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
    });

    container.addEventListener("drop", (e) => {
        e.preventDefault();
        const files = e.dataTransfer && e.dataTransfer.files;
        if (!files || files.length === 0) return;

        const coords = zoomContainer ? d3.pointer(e, zoomContainer.node()) : [450, 320];
        Array.from(files).forEach((file, idx) => {
            if (file.type && file.type.startsWith("image/")) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    compressImage(ev.target.result, 1100, 0.86, (compressedUrl) => {
                        const nowTs = Date.now() + idx;
                        const newId = `img_${nowTs}`;
                        const tx = (Number.isFinite(coords[0]) ? coords[0] : 450) + idx * 36;
                        const ty = (Number.isFinite(coords[1]) ? coords[1] : 320) + idx * 36;
                        const cleanName = (file.name || "").replace(/\.[^.]+$/, "") || `📸 截图 ${nodes.length + 1}`;
                        const newNode = {
                            id: newId,
                            label: cleanName,
                            parentId: null,
                            content: `![${cleanName}](${compressedUrl})\n\n`,
                            isImage: true,
                            imageUrl: compressedUrl,
                            createdAt: nowTs,
                            order: nodes.length,
                            x: tx,
                            y: ty,
                            fx: tx,
                            fy: ty
                        };
                        nodes.push(newNode);
                        selectedNode = newNode;
                        selectedNodeIds = new Set([newId]);
                        scheduleSaveGraph(true);
                        updateD3Graph();
                        renderPositions();
                        renderEditor();
                        showToast(`🖼️ 已将图片【${cleanName}】拖入画布！(双击图片可高清放大)`);
                    });
                };
                reader.readAsDataURL(file);
            } else if (file.name && (file.name.endsWith(".json") || file.name.endsWith(".excalidraw"))) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    try {
                        const parsed = JSON.parse(ev.target.result);
                        if (parsed.type === "excalidraw" || Array.isArray(parsed.elements)) {
                            importExcalidrawFile(parsed, file.name);
                        } else {
                            applyParsedBackupData(parsed, file.name);
                            saveGraphToStorage(true);
                            showToast(`📥 已成功拖入导入备份 (${nodes.length} 张卡片)！`);
                        }
                    } catch (err) {
                        showToast("❌ 导入文件格式解析失败");
                    }
                };
                reader.readAsText(file);
            } else if (file.name && file.name.toLowerCase().endsWith(".pdf")) {
                showToast(`📄 检测到拖入 PDF【${file.name}】，正在自动载入桌面转换版 Excalidraw 导图...`);
                loadDemoExcalidrawMap(file.name);
            }
        });
    });
}

// 8. ⚡ 心流捕获、📝 双链笔记库与 ✨ 智慧助手三大辅助工作台全功能打通
function sendFlowItemToCanvas(item) {
    if (!item || !item.content) return;
    const nowTs = Date.now();
    const newId = `flow_${nowTs}`;
    const raw = item.content.trim();
    const firstLine = raw.split("\n")[0].replace(/#[^\s#]+/g, "").trim().slice(0, 32) || `心流卡片 ${nodes.length + 1}`;
    const newNode = {
        id: newId,
        label: firstLine,
        parentId: selectedNode ? selectedNode.id : null,
        content: raw,
        createdAt: nowTs,
        order: nodes.length,
        x: (selectedNode && Number.isFinite(selectedNode.x)) ? selectedNode.x + 220 : 480,
        y: (selectedNode && Number.isFinite(selectedNode.y)) ? selectedNode.y + 40 : 320
    };
    newNode.fx = newNode.x;
    newNode.fy = newNode.y;
    nodes.push(newNode);
    sanitizeGraph();
    updateD3Graph();
    renderPositions();
    scheduleSaveGraph(true);

    // 切回脑图画布并聚焦到新生成的卡片
    const graphTabBtn = document.querySelector('.nav-tab[data-tab="graph"]');
    if (graphTabBtn) graphTabBtn.click();
    setTimeout(() => focusOnNode(newNode), 120);
    showToast(`🚀 已将心流灵感送入脑图画布：【${firstLine}】`);
}

function syncDeepNotePaneWithSelectedNode() {
    const titleEl = document.getElementById("noteTitleInput");
    const contentEl = document.getElementById("noteContentInput");
    const tagsEl = document.getElementById("noteTagsInput");
    const timeEl = document.getElementById("noteUpdatedTime");
    const backlinksEl = document.getElementById("backlinksList");
    const outboundEl = document.getElementById("outboundList");
    const suggestEl = document.getElementById("aiSuggestLinks");

    if (!titleEl || !contentEl) return;
    if (!selectedNode) {
        titleEl.value = "";
        contentEl.value = "";
        if (tagsEl) tagsEl.value = "";
        if (backlinksEl) backlinksEl.innerHTML = `<div class="empty-sub-hint">暂无链入卡片</div>`;
        if (outboundEl) outboundEl.innerHTML = `<div class="empty-sub-hint">暂无链出卡片</div>`;
        return;
    }

    titleEl.value = selectedNode.label || "";
    contentEl.value = selectedNode.content || "";
    const tagMatches = String(selectedNode.content || "").match(/#[^\s#]+/g) || [];
    if (tagsEl) tagsEl.value = (selectedNode.tags && selectedNode.tags.length > 0) ? selectedNode.tags.join(", ") : tagMatches.join(", ");
    if (timeEl) timeEl.textContent = `实时同步 · ID: ${selectedNode.id.slice(-6)}`;

    // 计算 🔗 链入本笔记 (Backlinks: 父卡片 + 正文中通过 [[标题]] 引用了本卡片的卡片)
    if (backlinksEl) {
        const inbound = nodes.filter(n => {
            if (n.id === selectedNode.id) return false;
            if (selectedNode.parentId === n.id) return true;
            return String(n.content || "").includes(`[[${selectedNode.label}]]`);
        });
        backlinksEl.innerHTML = inbound.length === 0
            ? `<div class="empty-sub-hint">暂无上级或引用卡片</div>`
            : inbound.map(n => `<div class="backlink-pill" data-nid="${escapeHTML(n.id)}">⬅️ ${escapeHTML(n.label)}</div>`).join("");
        backlinksEl.querySelectorAll(".backlink-pill").forEach(el => {
            el.addEventListener("click", () => {
                const target = nodes.find(x => x.id === el.dataset.nid);
                if (target) { selectedNode = target; selectedNodeIds = new Set([target.id]); renderSidebarNotesList(); renderEditor(); }
            });
        });
    }

    // 计算 ↗️ 本文链接到 (Outbound: 子卡片 + 本文中 [[笔记名]] 指向的卡片)
    if (outboundEl) {
        const wikiMatches = Array.from(String(selectedNode.content || "").matchAll(/\[\[([^\]]+)\]\]/g)).map(m => m[1].trim());
        const outbound = nodes.filter(n => {
            if (n.id === selectedNode.id) return false;
            if (n.parentId === selectedNode.id) return true;
            return wikiMatches.includes(n.label);
        });
        outboundEl.innerHTML = outbound.length === 0
            ? `<div class="empty-sub-hint">暂无下属分支或 [[双链]]</div>`
            : outbound.map(n => `<div class="backlink-pill" data-nid="${escapeHTML(n.id)}">➔ ${escapeHTML(n.label)}</div>`).join("");
        outboundEl.querySelectorAll(".backlink-pill").forEach(el => {
            el.addEventListener("click", () => {
                const target = nodes.find(x => x.id === el.dataset.nid);
                if (target) { selectedNode = target; selectedNodeIds = new Set([target.id]); renderSidebarNotesList(); renderEditor(); }
            });
        });
    }

    // 计算 🦉 猫头鹰潜在关联建议
    if (suggestEl) {
        const keywords = String(selectedNode.label || "").split(/[\s,，、/]+/).filter(w => w.length >= 2);
        const suggestions = nodes.filter(n => {
            if (n.id === selectedNode.id || n.parentId === selectedNode.id || selectedNode.parentId === n.id) return false;
            return keywords.some(kw => String(n.content || "").includes(kw) || String(n.label || "").includes(kw));
        }).slice(0, 5);
        suggestEl.innerHTML = suggestions.length === 0
            ? `<div class="empty-sub-hint">可在正文输入 [[卡片名]] 建立双链</div>`
            : suggestions.map(n => `<div class="backlink-pill suggest" data-nid="${escapeHTML(n.id)}" title="点击在末尾插入 [[${escapeHTML(n.label)}]] 双链">✨ 关联 [[${escapeHTML(n.label)}]]</div>`).join("");
        suggestEl.querySelectorAll(".backlink-pill.suggest").forEach(el => {
            el.addEventListener("click", () => {
                const target = nodes.find(x => x.id === el.dataset.nid);
                if (!target || !selectedNode) return;
                selectedNode.content = `${(selectedNode.content || "").trim()}\n\n关联参考：[[${target.label}]]`;
                syncDeepNotePaneWithSelectedNode();
                renderEditor();
                scheduleSaveGraph(true);
                showToast(`🔗 已插入双链 [[${target.label}]]`);
            });
        });
    }
}

function initSecondaryWorkbenches() {
    // A. ⚡ 心流捕获工作台绑定
    const flowInput = document.getElementById("flowInputText");
    const addFlowBtn = document.getElementById("addFlowBtn");
    const flowTagFilter = document.getElementById("flowTagFilter");

    const submitFlowCapture = () => {
        if (!flowInput) return;
        const text = flowInput.value.trim();
        if (!text) {
            showToast("💡 请先输入心流内容");
            return;
        }
        flowStream.unshift({
            id: `f_${Date.now()}`,
            content: text,
            timestamp: new Date().toLocaleString("zh-CN", { hour12: false })
        });
        flowInput.value = "";
        saveFlowsToStorage();
        renderFlowStream();
        showToast("⚡ 已记录瞬时心流 (点击卡片上的“🚀 送入脑图”可一键生成脑图卡片)");
    };

    if (addFlowBtn) addFlowBtn.addEventListener("click", submitFlowCapture);
    if (flowInput) {
        flowInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey || !e.shiftKey)) {
                e.preventDefault();
                submitFlowCapture();
            }
        });
    }
    document.querySelectorAll(".quick-tags .tag-chip").forEach(chip => {
        chip.addEventListener("click", () => {
            if (!flowInput) return;
            const tag = chip.dataset.tag || "";
            flowInput.value = `${flowInput.value.trim()} ${tag} `.trimStart();
            flowInput.focus();
        });
    });
    if (flowTagFilter) {
        flowTagFilter.addEventListener("change", () => renderFlowStream());
    }

    // B. 📝 双链笔记库工作台绑定
    const noteFilter = document.getElementById("noteListFilter");
    const newNoteBtn = document.getElementById("newNoteBtn");
    const saveNoteBtn = document.getElementById("saveNoteBtn");
    const deleteNoteBtn = document.getElementById("deleteNoteBtn");
    const noteTitleInput = document.getElementById("noteTitleInput");
    const noteContentInput = document.getElementById("noteContentInput");

    if (noteFilter) {
        noteFilter.addEventListener("input", () => renderSidebarNotesList());
    }
    if (newNoteBtn) {
        newNoteBtn.addEventListener("click", () => {
            const nowTs = Date.now();
            const newNode = {
                id: `note_${nowTs}`,
                label: `深度笔记 ${nodes.length + 1}`,
                parentId: null,
                content: `# 深度笔记 ${nodes.length + 1}\n\n`,
                createdAt: nowTs,
                order: nodes.length,
                x: 460 + (nodes.length % 5) * 40,
                y: 300 + (nodes.length % 5) * 40
            };
            nodes.push(newNode);
            selectedNode = newNode;
            selectedNodeIds = new Set([newNode.id]);
            updateD3Graph();
            renderSidebarNotesList();
            renderEditor();
            scheduleSaveGraph(true);
            if (noteTitleInput) { noteTitleInput.focus(); noteTitleInput.select(); }
            showToast("✨ 已新建深度笔记卡片");
        });
    }
    if (saveNoteBtn) {
        saveNoteBtn.addEventListener("click", () => {
            if (!selectedNode) return;
            if (noteTitleInput) selectedNode.label = noteTitleInput.value.trim() || "未命名";
            if (noteContentInput) selectedNode.content = noteContentInput.value;
            refreshNodeStyles();
            renderSidebarNotesList();
            renderEditor();
            saveGraphToStorage(true);
            showToast("💾 笔记修改已保存并同步至脑图画布");
        });
    }
    if (noteTitleInput) {
        noteTitleInput.addEventListener("input", () => {
            if (!selectedNode) return;
            selectedNode.label = noteTitleInput.value.trim() || "未命名";
            refreshNodeStyles();
            renderEditor();
            scheduleSaveGraph(true);
        });
    }
    if (noteContentInput) {
        noteContentInput.addEventListener("input", () => {
            if (!selectedNode) return;
            selectedNode.content = noteContentInput.value;
            refreshNodeStyles();
            renderEditor();
            syncDeepNotePaneWithSelectedNode();
            scheduleSaveGraph(true);
        });
    }
    if (deleteNoteBtn) {
        deleteNoteBtn.addEventListener("click", () => {
            deleteSelectedNode();
            renderSidebarNotesList();
        });
    }

    // C. ✨ 智慧助手工作台绑定 (知识结构雷达与思考发散器)
    const runAnalysisBtn = document.getElementById("runAnalysisBtn");
    const reportBox = document.getElementById("aiReportBox");
    const aiNoteSelector = document.getElementById("aiNoteSelector");
    const generatePromptBtn = document.getElementById("generatePromptBtn");
    const aiPromptOutput = document.getElementById("aiPromptOutput");

    const populateAiNoteSelector = () => {
        if (!aiNoteSelector) return;
        aiNoteSelector.innerHTML = nodes.map(n => `<option value="${escapeHTML(n.id)}">${escapeHTML(n.label)}</option>`).join("");
        if (selectedNode) aiNoteSelector.value = selectedNode.id;
    };

    document.querySelectorAll('.nav-tab[data-tab="ai"]').forEach(btn => {
        btn.addEventListener("click", populateAiNoteSelector);
    });

    if (runAnalysisBtn && reportBox) {
        runAnalysisBtn.addEventListener("click", () => {
            const roots = nodes.filter(n => !n.parentId);
            const focusNodes = nodes.filter(n => n.isFocus);
            const redNodes = nodes.filter(n => String(n.content || "").includes("#ef4444"));
            const greenNodes = nodes.filter(n => String(n.content || "").includes("#10b981"));
            const todoNodes = nodes.filter(n => /\[ \]/.test(String(n.content || "")));
            const childSet = new Set(nodes.map(n => n.parentId).filter(Boolean));
            const orphans = nodes.filter(n => !n.parentId && !childSet.has(n.id));

            reportBox.innerHTML = `
                <div style="line-height:1.75; font-size:13px;">
                    <div>📊 <b>当前图谱概览</b>：共 <b>${nodes.length}</b> 张卡片 | 顶层主题 <b>${roots.length}</b> 个 | 独立自由卡 <b>${orphans.length}</b> 张</div>
                    <div>⭐ <b>核心重点卡片 (${focusNodes.length})</b>：${focusNodes.map(n => `<code>${escapeHTML(n.label)}</code>`).join("、") || "暂未标记 (按 F 键可标重点)"}</div>
                    <div>🔴 <b>红色核心问题/痛点 (${redNodes.length})</b>：${redNodes.map(n => `<span style="color:#f87171">${escapeHTML(n.label)}</span>`).join("、") || "暂无"}</div>
                    <div>🟢 <b>绿色关键指标/变量 (${greenNodes.length})</b>：${greenNodes.map(n => `<span style="color:#34d399">${escapeHTML(n.label)}</span>`).join("、") || "暂无"}</div>
                    <div>☑ <b>未完成待办事项 (${todoNodes.length})</b>：${todoNodes.map(n => escapeHTML(n.label)).join("、") || "全部已完成 🎉"}</div>
                </div>
            `;
            showToast("🦉 已生成当前思维图谱结构诊断报告");
        });
    }

    if (generatePromptBtn && aiPromptOutput) {
        generatePromptBtn.addEventListener("click", () => {
            const targetId = aiNoteSelector ? aiNoteSelector.value : (selectedNode ? selectedNode.id : "");
            const target = nodes.find(n => n.id === targetId) || selectedNode || nodes[0];
            if (!target) return;
            const cleanBody = String(target.content || target.label || "").replace(/<[^>]+>/g, "").trim();
            aiPromptOutput.innerHTML = `
                <div style="line-height:1.7; font-size:13px;">
                    <div>🎯 <b>针对卡片【${escapeHTML(target.label)}】的深度追问与发散建议：</b></div>
                    <ol style="margin:6px 0 0 18px; padding:0;">
                        <li><b>因果与机制追问 (🔴 标红问题)</b>：导致「${escapeHTML(target.label)}」发生的核心驱动因素或混杂变量是什么？</li>
                        <li><b>可量化指标 (🟢 标绿变量)</b>：在实验或业务中，我们可以用哪 2~3 个客观指标来度量「${escapeHTML( cleanBody.slice(0, 28) )}」？</li>
                        <li><b>反向证伪思考</b>：如果该假设不成立，最可能在哪一个环节出现断层？（可在脑图中按 <code>Tab</code> 衍生子卡片记录）</li>
                    </ol>
                </div>
            `;
            showToast(`🌱 已为【${target.label}】生成深度发散思考框架`);
        });
    }
}

// ============================================================================
// v3.2.0 XMind + OneNote 终极遗漏交互补完套件：
// 1. OneNote Ctrl+1~5 完整标记体系 (☑待办 / ⭐重点 / ❓存疑 / 💡灵感 / ✅已验证)
// 2. 多卡「🧲 一键合并为一页笔记」(mergeSelectedNodes) 与多行卡「✂️ 按行拆分为子卡片」(splitCardByLines)
// 3. 选中箭头「➕ 中间插卡片」(insertNodeOnSelectedLink) 与局部子树整理「📐 仅规整此分支」(tidySubtreeLayout)
// 4. OneNote 画布自由手绘/荧光笔圈注图层 (🖍️ #ink-draw-toolbar & inkStrokes)
// ============================================================================

// 1. OneNote Ctrl + 3/4/5 语义标记切换 (question: ❓存疑, idea: 💡灵感, done: ✅已验证)
function toggleNodeQuickTag(tagKey = "", singleFallbackNode = null, forceSet = false) {
    const targetList = selectedNodeIds.size > 0
        ? nodes.filter(n => selectedNodeIds.has(n.id))
        : (singleFallbackNode ? [singleFallbackNode] : (selectedNode ? [selectedNode] : []));
    if (targetList.length === 0) return;

    const tagNames = {
        question: "❓ 存疑问题 (Ctrl+3)",
        idea: "💡 关键灵感 (Ctrl+4)",
        done: "✅ 已验证结论 (Ctrl+5)"
    };

    const allHaveSame = targetList.every(n => n.quickTag === tagKey);
    const nextTag = (!tagKey || (!forceSet && allHaveSame)) ? "" : tagKey;

    targetList.forEach(n => {
        if (nextTag) n.quickTag = nextTag;
        else delete n.quickTag;
    });

    refreshNodeStyles();
    scheduleSaveGraph(true);
    showToast(nextTag ? `🏷️ 已标记为 ${tagNames[nextTag] || nextTag}` : "🧹 已清除 OneNote 标记");
}

// 2. OneNote / XMind 风格：将选中的多张卡片按创建顺序无损合并为一张综合卡片
function mergeSelectedNodes() {
    const selNodes = nodes.filter(n => selectedNodeIds.has(n.id));
    if (selNodes.length < 2) {
        showToast("💡 请先框选或按住 Shift 点选 2 张以上卡片再合并");
        return;
    }

    selNodes.sort((a, b) => getNodeCreatedTime(a) - getNodeCreatedTime(b));
    const primary = selNodes[0];
    const others = selNodes.slice(1);
    const otherIds = new Set(others.map(n => n.id));

    const mergedParts = selNodes.map(n => String(n.content || n.label || "").trim()).filter(Boolean);
    primary.content = mergedParts.join("\n\n");
    const firstPlain = primary.content.replace(/<[^>]+>/g, "").split("\n").map(s => s.trim()).find(Boolean) || primary.label;
    primary.label = firstPlain.replace(/^#{1,4}\s+/, "").slice(0, 42) || primary.label;

    // 将被合并卡片的下属子卡片平滑转移到合并后的主卡片下
    nodes.forEach(n => {
        if (!otherIds.has(n.id) && n.id !== primary.id && n.parentId && otherIds.has(n.parentId)) {
            n.parentId = primary.id;
        }
    });

    nodes = nodes.filter(n => !otherIds.has(n.id));
    sanitizeGraph();

    selectedNode = primary;
    selectedNodeIds = new Set([primary.id]);
    updateD3Graph();
    renderPositions();
    renderEditor();
    updateFloatingActionBarsPosition();
    scheduleSaveGraph(true);
    showToast(`🧲 已将 ${selNodes.length} 张卡片无损合并至【${primary.label}】！`);
}

// 3. XMind 经典神器：将多行文字卡片一键按行拆分为多张带箭头的子卡片
function splitCardByLines(targetNode = selectedNode) {
    if (!targetNode) return;
    const rawLines = String(targetNode.content || targetNode.label || "")
        .split("\n")
        .map(s => s.trim())
        .filter(Boolean);

    if (rawLines.length < 2) {
        showToast("💡 当前卡片只有 1 行内容，包含 2 行以上文字即可一键按行拆分为子卡片！");
        return;
    }

    const headLine = rawLines[0];
    const childLines = rawLines.slice(1);

    targetNode.content = headLine;
    targetNode.label = headLine.replace(/<[^>]+>/g, "").replace(/^#{1,4}\s+/, "").slice(0, 42) || targetNode.label;
    targetNode.collapsed = false;

    const baseTs = Date.now();
    const baseX = (Number.isFinite(targetNode.x) ? targetNode.x : 450) + Math.max(240, (targetNode._cardW || 150) + 110);
    const startY = (Number.isFinite(targetNode.y) ? targetNode.y : 320) - ((childLines.length - 1) * 64) / 2;

    childLines.forEach((lineText, idx) => {
        const cleanTitle = lineText.replace(/<[^>]+>/g, "").replace(/^[-*•]\s+/, "").slice(0, 42) || `子要点 ${idx + 1}`;
        const ny = Math.round(startY + idx * 64);
        nodes.push({
            id: `split_${baseTs + idx}`,
            label: cleanTitle,
            parentId: targetNode.id,
            content: lineText,
            createdAt: baseTs + idx,
            order: nodes.length + idx,
            x: baseX,
            y: ny,
            fx: baseX,
            fy: ny
        });
    });

    sanitizeGraph();
    updateD3Graph();
    renderPositions();
    renderEditor();
    scheduleSaveGraph(true);
    showToast(`✂️ 已将多行内容自动拆分为 ${childLines.length} 张子卡片！`);
}

// 4. 在选中的箭头连线正中间插入一张过渡卡片 (A ➔ 新卡片 ➔ B)
function insertNodeOnSelectedLink() {
    if (!selectedLink) return;
    const sId = cleanNodeId(selectedLink.source);
    const tId = cleanNodeId(selectedLink.target);
    const sourceNode = nodes.find(n => n.id === sId);
    const targetNode = nodes.find(n => n.id === tId);
    if (!sourceNode || !targetNode) return;

    const nowTs = Date.now();
    const newId = `mid_${nowTs}`;
    const midX = Math.round(((Number.isFinite(sourceNode.x) ? sourceNode.x : 350) + (Number.isFinite(targetNode.x) ? targetNode.x : 650)) / 2);
    const midY = Math.round(((Number.isFinite(sourceNode.y) ? sourceNode.y : 320) + (Number.isFinite(targetNode.y) ? targetNode.y : 320)) / 2);

    const midNode = {
        id: newId,
        label: `过渡节点 ${nodes.length + 1}`,
        parentId: sourceNode.id,
        content: `过渡节点 ${nodes.length + 1}`,
        createdAt: Math.max(1000, getNodeCreatedTime(targetNode) - 200),
        order: nodes.length,
        x: midX,
        y: midY,
        fx: midX,
        fy: midY
    };

    if (selectedLink.type === "relation") {
        links = links.filter(l => !(l.type === "relation" && (
            (cleanNodeId(l.source) === sId && cleanNodeId(l.target) === tId) ||
            (cleanNodeId(l.source) === tId && cleanNodeId(l.target) === sId)
        )));
    }
    targetNode.parentId = newId;
    nodes.push(midNode);

    selectedLink = null;
    selectedNode = midNode;
    selectedNodeIds = new Set([newId]);

    sanitizeGraph();
    updateD3Graph();
    renderPositions();
    renderEditor();
    updateFloatingActionBarsPosition();
    scheduleSaveGraph(true);
    showToast(`➕ 已在【${sourceNode.label}】与【${targetNode.label}】之间插入过渡卡片`);

    setTimeout(() => {
        startInlineCardEditById(newId, true);
    }, 50);
}

// 5. XMind 局部树状整理：仅规整当前选中父卡片下属的分支子树，绝不打乱画布上其他自由卡片 ("放到一坨") 的位置！
function tidySubtreeLayout(rootNode = selectedNode) {
    if (!rootNode) return;
    rootNode.collapsed = false;

    const childrenByParent = new Map();
    nodes.forEach(n => childrenByParent.set(n.id, []));
    nodes.forEach(n => {
        if (n.parentId && childrenByParent.has(n.parentId)) {
            const p = nodes.find(x => x.id === n.parentId);
            if (p && !p.collapsed) {
                childrenByParent.get(n.parentId).push(n);
            }
        }
    });
    childrenByParent.forEach(list => list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));

    const rootX = Number.isFinite(rootNode.x) ? rootNode.x : 320;
    const rootY = Number.isFinite(rootNode.y) ? rootNode.y : 320;
    const levelGap = 250;
    const rowGap = 68;
    let cursorY = 0;
    const touched = [];

    function layoutLocal(node, depth) {
        touched.push(node);
        const kids = childrenByParent.get(node.id) || [];
        if (kids.length === 0) {
            node._localX = rootX + depth * levelGap;
            node._localY = cursorY;
            cursorY += rowGap;
        } else {
            kids.forEach(k => layoutLocal(k, depth + 1));
            node._localX = rootX + depth * levelGap;
            node._localY = (kids[0]._localY + kids[kids.length - 1]._localY) / 2;
        }
    }

    layoutLocal(rootNode, 0);
    const offsetY = rootY - (rootNode._localY || 0);
    touched.forEach(n => {
        n.x = Math.round(n._localX);
        n.y = Math.round(n._localY + offsetY);
        n.fx = n.x;
        n.fy = n.y;
        delete n._localX;
        delete n._localY;
    });

    updateD3Graph();
    renderPositions();
    scheduleSaveGraph(true);
    showToast(`📐 已整齐排布【${rootNode.label}】分支下的 ${touched.length - 1} 张子卡片（其他自由卡片位置保持不变）`);
}

// 6. OneNote 风格：画布自由手绘 / 荧光笔圈注图层 (支持鼠标、触屏与手写笔直接在卡片周围画圈、画大括号、涂荧光笔)
function initV32XMindOneNoteSuite() {
    const container = document.getElementById("graph-container");
    if (!container) return;

    if (!document.getElementById("ink-draw-toolbar")) {
        const bar = document.createElement("div");
        bar.id = "ink-draw-toolbar";
        bar.className = "ink-draw-toolbar";
        bar.innerHTML = `
            <span style="font-size:12px; font-weight:700; color:#38bdf8; margin-right:4px;">🖍️ OneNote 画布手绘圈注</span>
            <button class="ink-tool-btn active" data-itool="red" title="红色圈注笔 (圈重点/画箭头)">🔴 红笔</button>
            <button class="ink-tool-btn" data-itool="green" title="绿色批注笔">🟢 绿笔</button>
            <button class="ink-tool-btn" data-itool="highlighter" title="半透明荧光黄马克笔 (涂抹高亮区域)">🟡 荧光笔</button>
            <button class="ink-tool-btn" data-itool="sky" title="天蓝连接笔">🔵 蓝笔</button>
            <button class="ink-tool-btn" data-itool="eraser" title="点击任意手绘笔迹即可擦除">🧹 橡皮擦</button>
            <button class="ink-tool-btn" id="btn-ink-clear-all" title="清空当前画布所有手绘涂鸦">🗑️ 清空</button>
            <button class="ink-tool-btn" id="btn-ink-done" style="background:rgba(16,185,129,0.25); border-color:#10b981;" title="退出手绘模式 (按 P 或 Esc)">✓ 完成 (Esc)</button>
        `;
        container.appendChild(bar);

        bar.addEventListener("mousedown", (e) => e.stopPropagation());
        bar.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: true });

        bar.querySelectorAll(".ink-tool-btn[data-itool]").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                currentInkTool = btn.dataset.itool || "red";
                bar.querySelectorAll(".ink-tool-btn[data-itool]").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                const svgEl = document.getElementById("graph-svg");
                if (svgEl) {
                    svgEl.classList.toggle("is-ink-drawing", isInkDrawMode && currentInkTool !== "eraser");
                    svgEl.classList.toggle("is-ink-erasing", isInkDrawMode && currentInkTool === "eraser");
                }
            });
        });

        const clearBtn = document.getElementById("btn-ink-clear-all");
        if (clearBtn) {
            clearBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                if (inkStrokes.length === 0) return;
                inkStrokes = [];
                renderInkStrokes();
                scheduleSaveGraph(true);
                showToast("🧹 已清空画布手绘笔迹 (可按 Ctrl+Z 撤销恢复)");
            });
        }

        const doneBtn = document.getElementById("btn-ink-done");
        if (doneBtn) {
            doneBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                toggleInkDrawMode(false);
            });
        }
    }

    initInkDrawingEvents();
    renderInkStrokes();
}

function toggleInkDrawMode(forceState) {
    isInkDrawMode = typeof forceState === "boolean" ? forceState : !isInkDrawMode;
    const btn = document.getElementById("btn-ink-draw");
    const bar = document.getElementById("ink-draw-toolbar");
    const svgEl = document.getElementById("graph-svg");

    if (btn) btn.classList.toggle("active", isInkDrawMode);
    if (bar) bar.style.display = isInkDrawMode ? "flex" : "none";
    if (svgEl) {
        svgEl.classList.toggle("is-ink-drawing", isInkDrawMode && currentInkTool !== "eraser");
        svgEl.classList.toggle("is-ink-erasing", isInkDrawMode && currentInkTool === "eraser");
    }

    showToast(isInkDrawMode
        ? "🖍️ 已开启 OneNote 画布手绘圈注：可直接在卡片周围画圈、画大括号或涂荧光笔 (按 Esc 或 P 退出)"
        : "👆 已退出手绘圈注模式，恢复卡片点击与拖拽");
}

function pointsToSvgPath(pts) {
    if (!Array.isArray(pts) || pts.length === 0) return "";
    if (pts.length === 1) {
        const p = pts[0];
        return `M ${p[0]} ${p[1]} L ${p[0] + 0.5} ${p[1] + 0.5}`;
    }
    let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
        const prev = pts[i - 1];
        const curr = pts[i];
        const midX = ((prev[0] + curr[0]) / 2).toFixed(1);
        const midY = ((prev[1] + curr[1]) / 2).toFixed(1);
        d += ` Q ${prev[0].toFixed(1)} ${prev[1].toFixed(1)} ${midX} ${midY}`;
    }
    const last = pts[pts.length - 1];
    d += ` L ${last[0].toFixed(1)} ${last[1].toFixed(1)}`;
    return d;
}

function renderInkStrokes() {
    if (!inkLayer && zoomContainer) {
        inkLayer = zoomContainer.select(".ink-layer");
        if (inkLayer.empty()) {
            inkLayer = zoomContainer.append("g").attr("class", "ink-layer");
        }
    }
    if (!inkLayer) return;

    const strokePaths = inkLayer.selectAll("path.ink-stroke-path")
        .data(inkStrokes, d => d.id);

    strokePaths.join(
        enter => enter.append("path")
            .attr("class", "ink-stroke-path")
            .on("click", function(event, d) {
                if (!isInkDrawMode || currentInkTool !== "eraser") return;
                event.stopPropagation();
                inkStrokes = inkStrokes.filter(s => s.id !== d.id);
                renderInkStrokes();
                scheduleSaveGraph(true);
            }),
        update => update
    )
    .attr("d", d => pointsToSvgPath(d.points))
    .attr("stroke", d => d.color || "#ef4444")
    .attr("stroke-width", d => d.width || 3.5)
    .style("opacity", d => d.opacity || 0.9);
}

function initInkDrawingEvents() {
    const svgEl = document.getElementById("graph-svg");
    if (!svgEl) return;

    let activeStroke = null;

    const INK_PRESETS = {
        red: { color: "#ef4444", width: 3.5, opacity: 0.92 },
        green: { color: "#10b981", width: 3.5, opacity: 0.92 },
        highlighter: { color: "#facc15", width: 18, opacity: 0.36 },
        sky: { color: "#38bdf8", width: 3.5, opacity: 0.92 }
    };

    function getCanvasPt(clientEvent) {
        if (!zoomContainer) return [0, 0];
        return d3.pointer(clientEvent, zoomContainer.node());
    }

    function onStart(clientEvent, rawEvent) {
        if (!isInkDrawMode) return;
        if (currentInkTool === "eraser") return;
        if (rawEvent && rawEvent.target && rawEvent.target.closest && rawEvent.target.closest("#ink-draw-toolbar")) return;
        if (rawEvent && rawEvent.cancelable) rawEvent.preventDefault();

        const pt = getCanvasPt(clientEvent);
        const preset = INK_PRESETS[currentInkTool] || INK_PRESETS.red;
        activeStroke = {
            id: `ink_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            color: preset.color,
            width: preset.width,
            opacity: preset.opacity,
            points: [[Math.round(pt[0] * 10) / 10, Math.round(pt[1] * 10) / 10]]
        };
        inkStrokes.push(activeStroke);
        renderInkStrokes();
    }

    function onMove(clientEvent) {
        if (!activeStroke || !isInkDrawMode) return;
        const pt = getCanvasPt(clientEvent);
        const last = activeStroke.points[activeStroke.points.length - 1];
        if (!last || Math.hypot(pt[0] - last[0], pt[1] - last[1]) >= 2.2) {
            activeStroke.points.push([Math.round(pt[0] * 10) / 10, Math.round(pt[1] * 10) / 10]);
            renderInkStrokes();
        }
    }

    function onEnd() {
        if (!activeStroke) return;
        activeStroke = null;
        scheduleSaveGraph(true);
    }

    svgEl.addEventListener("mousedown", (e) => {
        if (!isInkDrawMode || e.button !== 0) return;
        e.stopPropagation();
        onStart(e, e);
    }, true);

    window.addEventListener("mousemove", (e) => {
        if (!activeStroke) return;
        onMove(e);
    });

    window.addEventListener("mouseup", () => {
        if (!activeStroke) return;
        onEnd();
    });

    svgEl.addEventListener("touchstart", (e) => {
        if (!isInkDrawMode || !e.touches || e.touches.length !== 1) return;
        e.stopPropagation();
        onStart(e.touches[0], e);
    }, { passive: false, capture: true });

    window.addEventListener("touchmove", (e) => {
        if (!activeStroke || !e.touches || e.touches.length !== 1) return;
        if (e.cancelable) e.preventDefault();
        onMove(e.touches[0]);
    }, { passive: false });

    window.addEventListener("touchend", () => {
        if (!activeStroke) return;
        onEnd();
    });
}

// ==========================================
// v3.4.6: 番茄专注与行动证据库 (Pomodoro Focus & Evidence Over Emotion Suite)
// 核心哲学：Action before confidence · Evidence over emotion · Tiny tweaks · Willingness to feel fear
// ==========================================
function initPomodoroSuite() {
    const defaultSettings = {
        focusMins: 25,
        shortBreakMins: 5,
        longBreakMins: 15,
        soundEnabled: true,
        autoSyncFlow: true
    };

    let pomoSettings = { ...defaultSettings };
    try {
        const savedSettings = localStorage.getItem("flownotes_pomo_settings");
        if (savedSettings) pomoSettings = { ...defaultSettings, ...JSON.parse(savedSettings) };
    } catch (e) {
        console.warn("[Pomo] Failed to parse settings:", e);
    }

    let pomoState = {
        mode: "focus", // 'focus' | 'shortBreak' | 'longBreak'
        totalSeconds: pomoSettings.focusMins * 60,
        remainingSeconds: pomoSettings.focusMins * 60,
        isRunning: false,
        target: "",
        completedPomosToday: 0,
        lastTimestamp: Date.now()
    };

    try {
        const savedState = localStorage.getItem("flownotes_pomo_state");
        if (savedState) {
            const parsed = JSON.parse(savedState);
            pomoState.mode = parsed.mode || "focus";
            pomoState.totalSeconds = parsed.totalSeconds || pomoSettings.focusMins * 60;
            pomoState.remainingSeconds = typeof parsed.remainingSeconds === "number" ? parsed.remainingSeconds : pomoState.totalSeconds;
            pomoState.target = parsed.target || "";
        }
    } catch (e) {
        console.warn("[Pomo] Failed to restore state:", e);
    }

    let pomoEvidenceLog = [];
    try {
        const savedLog = localStorage.getItem("flownotes_pomo_evidence_log");
        if (savedLog) pomoEvidenceLog = JSON.parse(savedLog);
    } catch (e) {
        console.warn("[Pomo] Failed to load evidence log:", e);
    }
    window.pomoEvidenceLog = pomoEvidenceLog;
    window.pomoSettings = pomoSettings;
    if (typeof FlowNotesIDB !== "undefined") {
        FlowNotesIDB.get("flownotes_pomo_evidence_log").then(idbLog => {
            if (idbLog && Array.isArray(idbLog) && idbLog.length > pomoEvidenceLog.length) {
                pomoEvidenceLog = idbLog;
                window.pomoEvidenceLog = pomoEvidenceLog;
                localStorage.setItem("flownotes_pomo_evidence_log", JSON.stringify(pomoEvidenceLog));
            if (typeof FlowNotesIDB !== "undefined") {
                FlowNotesIDB.set("flownotes_pomo_evidence_log", pomoEvidenceLog);
            }
                if (typeof renderEvidenceDashboard === "function") renderEvidenceDashboard();
                if (typeof updateUI === "function") updateUI();
            }
        }).catch(() => {});
    }

    // DOM 元素引用
    const headerPill = document.getElementById("headerPomoPill");
    const pillTimer = document.getElementById("pomoPillTimer");
    const pillToggleBtn = document.getElementById("pomoPillToggleBtn");
    const pillTodayBadge = document.getElementById("pomoPillTodayBadge");

    const modal = document.getElementById("pomoFocusModal");
    const closeModalBtn = document.getElementById("closePomoModalBtn");

    const subtabs = document.querySelectorAll(".pomo-subtab");
    const paneTimer = document.getElementById("pomoPaneTimer");
    const paneEvidence = document.getElementById("pomoPaneEvidence");
    const paneSettings = document.getElementById("pomoPaneSettings");
    const countBadge = document.getElementById("pomoEvidenceCountBadge");

    const modeBtns = document.querySelectorAll(".pomo-mode-btn");
    const ringProgress = document.getElementById("pomoRingProgress");
    const largeTimer = document.getElementById("pomoLargeTimer");
    const modeLabel = document.getElementById("pomoModeLabel");
    const targetInput = document.getElementById("pomoTargetInput");
    const btnBindCard = document.getElementById("btnPomoBindCard");
    const durationChips = document.querySelectorAll(".pomo-chip");

    const primaryBtn = document.getElementById("pomoPrimaryBtn");
    const primaryIcon = document.getElementById("pomoPrimaryIcon");
    const primaryText = document.getElementById("pomoPrimaryText");
    const resetBtn = document.getElementById("pomoResetBtn");
    const skipBtn = document.getElementById("pomoSkipBtn");
    const finishEarlyBtn = document.getElementById("pomoFinishEarlyBtn");

    const statTodayMins = document.getElementById("pomoStatTodayMins");
    const statTodayPomos = document.getElementById("pomoStatTodayPomos");
    const statStreak = document.getElementById("pomoStatStreak");
    const statTotalHours = document.getElementById("pomoStatTotalHours");
    const statTotalCount = document.getElementById("pomoStatTotalCount");
    const growthChart = document.getElementById("pomoGrowthChart");
    const statWeekMins = document.getElementById("pomoStatWeekMins");
    const statWeekTrend = document.getElementById("pomoStatWeekTrend");
    const statDailyAvg = document.getElementById("pomoStatDailyAvg");
    const statPeakDay = document.getElementById("pomoStatPeakDay");
    const timelineList = document.getElementById("pomoTimelineList");
    const btnSyncAll = document.getElementById("btnSyncAllToFlowStream");
    const btnExportMd = document.getElementById("btnExportEvidenceMd");
    const btnClearHistory = document.getElementById("btnClearEvidenceHistory");

    const cfgFocus = document.getElementById("cfgPomoFocusMins");
    const cfgShort = document.getElementById("cfgPomoShortMins");
    const cfgLong = document.getElementById("cfgPomoLongMins");
    const cfgSound = document.getElementById("cfgPomoSound");
    const cfgAutoSync = document.getElementById("cfgPomoAutoSyncFlow");
    const btnSaveSettings = document.getElementById("btnSavePomoSettings");

    const RING_CIRCUMFERENCE = 2 * Math.PI * 95; // ~596.903
    if (ringProgress) {
        ringProgress.style.strokeDasharray = `${RING_CIRCUMFERENCE}`;
    }

    const baseDocumentTitle = document.title;
    let timerInterval = null;

    function formatTime(totalSec) {
        const m = Math.floor(Math.max(0, totalSec) / 60);
        const s = Math.floor(Math.max(0, totalSec) % 60);
        return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }

    function getTodayStr() {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    function saveState() {
        try {
            localStorage.setItem("flownotes_pomo_state", JSON.stringify({
                mode: pomoState.mode,
                totalSeconds: pomoState.totalSeconds,
                remainingSeconds: pomoState.remainingSeconds,
                target: pomoState.target
            }));
        } catch (e) {}
    }

    function saveEvidenceLog() {
        try {
            localStorage.setItem("flownotes_pomo_evidence_log", JSON.stringify(pomoEvidenceLog));
            if (typeof FlowNotesIDB !== "undefined") {
                FlowNotesIDB.set("flownotes_pomo_evidence_log", pomoEvidenceLog);
            }
        } catch (e) {}
    }

    function saveSettings() {
        try {
            localStorage.setItem("flownotes_pomo_settings", JSON.stringify(pomoSettings));
        } catch (e) {}
    }

    // 禅意和声：Web Audio 432Hz (专注结束) / 528Hz (休息结束) 舒缓泛音
    function playChime(isBreak = false) {
        if (!pomoSettings.soundEnabled) return;
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const now = ctx.currentTime;
            const baseFreq = isBreak ? 528 : 432;
            const harmonics = [1, 2, 2.76, 4];
            const gains = [0.35, 0.2, 0.12, 0.06];

            harmonics.forEach((ratio, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = "sine";
                osc.frequency.setValueAtTime(baseFreq * ratio, now);

                gain.gain.setValueAtTime(0, now);
                gain.gain.linearRampToValueAtTime(gains[i], now + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.5);

                osc.connect(gain);
                gain.connect(ctx.destination);

                osc.start(now);
                osc.stop(now + 2.5);
            });
        } catch (e) {
            console.warn("[Pomo] Audio play failed:", e);
        }
    }

    function updateUI() {
        const timeStr = formatTime(pomoState.remainingSeconds);
        if (pillTimer) pillTimer.textContent = timeStr;
        if (largeTimer) largeTimer.textContent = timeStr;

        const todayStr = getTodayStr();
        const todayItems = pomoEvidenceLog.filter(item => item.date === todayStr && item.mode === "focus");
        pomoState.completedPomosToday = todayItems.length;

        if (pillTodayBadge) pillTodayBadge.textContent = String(pomoState.completedPomosToday);
        if (countBadge) countBadge.textContent = String(pomoEvidenceLog.length);

        if (headerPill) {
            headerPill.classList.toggle("pomo-running", pomoState.isRunning);
            headerPill.classList.toggle("pomo-break", pomoState.mode !== "focus");
        }

        if (pillToggleBtn) {
            pillToggleBtn.textContent = pomoState.isRunning ? "⏸" : "▶";
            pillToggleBtn.title = pomoState.isRunning ? "暂停番茄专注 (Alt+P)" : "继续番茄专注 (Alt+P)";
        }

        if (primaryIcon && primaryText) {
            if (pomoState.isRunning) {
                primaryIcon.textContent = "⏸";
                primaryText.textContent = "暂停专注 (Alt+P)";
            } else {
                primaryIcon.textContent = "▶";
                primaryText.textContent = pomoState.mode === "focus" ? "开始专注 (Alt+P)" : "开始休息 (Alt+P)";
            }
        }

        if (modeLabel) {
            if (pomoState.mode === "focus") modeLabel.textContent = pomoState.isRunning ? "深度专注中..." : "准备专注";
            else if (pomoState.mode === "shortBreak") modeLabel.textContent = pomoState.isRunning ? "快速小憩中..." : "准备小憩";
            else modeLabel.textContent = pomoState.isRunning ? "彻底放松中..." : "准备放松";
        }

        modeBtns.forEach(btn => {
            btn.classList.toggle("active", btn.dataset.pmode === pomoState.mode);
        });

        if (ringProgress && pomoState.totalSeconds > 0) {
            const progress = (pomoState.totalSeconds - pomoState.remainingSeconds) / pomoState.totalSeconds;
            const offset = RING_CIRCUMFERENCE * (1 - Math.max(0, Math.min(1, progress)));
            ringProgress.style.strokeDashoffset = `${offset}`;
            ringProgress.style.stroke = pomoState.mode === "focus" ? "#ef4444" : "#10b981";
        }

        if (pomoState.isRunning) {
            const icon = pomoState.mode === "focus" ? "🍅" : "☕";
            document.title = `(${timeStr}) ${icon} FlowNotes`;
        } else {
            document.title = baseDocumentTitle;
        }

        if (targetInput && document.activeElement !== targetInput) {
            targetInput.value = pomoState.target || "";
        }
    }

    function switchMode(newMode, customMins = null) {
        pomoState.mode = newMode;
        let mins = customMins;
        if (!mins) {
            if (newMode === "focus") mins = pomoSettings.focusMins;
            else if (newMode === "shortBreak") mins = pomoSettings.shortBreakMins;
            else mins = pomoSettings.longBreakMins;
        }
        pomoState.totalSeconds = mins * 60;
        pomoState.remainingSeconds = pomoState.totalSeconds;
        pauseTimer();
        updateUI();
        saveState();
    }

    function startTimer() {
        if (pomoState.isRunning) return;
        pomoState.isRunning = true;
        pomoState.lastTimestamp = Date.now();

        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            const now = Date.now();
            const elapsedSec = Math.round((now - pomoState.lastTimestamp) / 1000);
            if (elapsedSec >= 1) {
                pomoState.remainingSeconds = Math.max(0, pomoState.remainingSeconds - elapsedSec);
                pomoState.lastTimestamp = now;
                updateUI();
                saveState();

                if (pomoState.remainingSeconds <= 0) {
                    completeSession(false);
                }
            }
        }, 500);

        updateUI();
    }

    function pauseTimer() {
        pomoState.isRunning = false;
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        updateUI();
        saveState();
    }

    function toggleTimer() {
        if (pomoState.isRunning) pauseTimer();
        else startTimer();
    }

    function completeSession(isEarly = false) {
        pauseTimer();
        const isFocus = pomoState.mode === "focus";
        playChime(!isFocus);

        if (isFocus) {
            const elapsedSec = pomoState.totalSeconds - pomoState.remainingSeconds;
            const durationMins = isEarly ? Math.max(1, Math.round(elapsedSec / 60)) : Math.round(pomoState.totalSeconds / 60);
            const targetText = (targetInput && targetInput.value.trim()) || pomoState.target.trim() || "深度沉浸学习与思维整理";

            const now = new Date();
            const timeStr = now.toLocaleTimeString("zh-CN", { hour12: false });
            const dateStr = getTodayStr();

            const evidenceItem = {
                id: `pomo_ev_${Date.now()}`,
                date: dateStr,
                timestamp: `${dateStr} ${timeStr}`,
                mode: "focus",
                target: targetText,
                durationMins: durationMins,
                type: isEarly ? "early_finish" : "completed",
                syncedToFlow: false
            };

            pomoEvidenceLog.unshift(evidenceItem);
            saveEvidenceLog();

            if (pomoSettings.autoSyncFlow) {
                pushEvidenceToFlowStream(evidenceItem);
                if (typeof triggerAutoGhSync === "function") triggerAutoGhSync();
            }

            renderEvidenceDashboard();

            showToast(isEarly
                ? `⚡ 已记录行动证据：${targetText} (${durationMins}分钟)`
                : `🎉 太棒了！已完成 1 颗专注番茄并沉淀客观证据：${targetText} (${durationMins}分钟)`
            );

            const nextMode = (pomoState.completedPomosToday + 1) % 4 === 0 ? "longBreak" : "shortBreak";
            switchMode(nextMode);
        } else {
            showToast("☕ 休息结束！带着刚才的蓄能，开启下一个可控行动吧！");
            switchMode("focus");
        }
    }

    function pushEvidenceToFlowStream(evItem) {
        try {
            if (typeof flowStream !== "undefined" && Array.isArray(flowStream)) {
                const streamContent = `#专注证据 🍅【${evItem.target}】· 扎实投入 ${evItem.durationMins} 分钟 · ${evItem.type === "completed" ? "完整达成" : "灵活沉淀"}`;
                flowStream.unshift({
                    id: `f_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                    content: streamContent,
                    timestamp: evItem.timestamp
                });
                evItem.syncedToFlow = true;
                saveEvidenceLog();
                if (typeof saveFlowsToStorage === "function") saveFlowsToStorage();
                if (typeof renderFlowStream === "function") renderFlowStream();
            }
        } catch (e) {
            console.warn("[Pomo] Push to flowStream failed:", e);
        }
    }

    function renderEvidenceDashboard() {
        const todayStr = getTodayStr();
        const focusItems = pomoEvidenceLog.filter(item => item.mode === "focus");
        const todayItems = focusItems.filter(item => item.date === todayStr);

        const todayMins = todayItems.reduce((acc, cur) => acc + (cur.durationMins || 0), 0);
        const todayPomos = todayItems.length;
        const totalMins = focusItems.reduce((acc, cur) => acc + (cur.durationMins || 0), 0);
        const totalHours = (totalMins / 60).toFixed(1);

        const uniqueDates = Array.from(new Set(focusItems.map(item => item.date))).sort().reverse();
        let streak = 0;
        let checkDate = new Date();

        for (let i = 0; i < 365; i++) {
            const y = checkDate.getFullYear();
            const m = String(checkDate.getMonth() + 1).padStart(2, "0");
            const d = String(checkDate.getDate()).padStart(2, "0");
            const dateKey = `${y}-${m}-${d}`;

            if (uniqueDates.includes(dateKey)) {
                streak++;
                checkDate.setDate(checkDate.getDate() - 1);
            } else {
                if (i === 0) {
                    checkDate.setDate(checkDate.getDate() - 1);
                    continue;
                }
                break;
            }
        }

        if (statTodayMins) statTodayMins.textContent = String(todayMins);
        if (statTodayPomos) statTodayPomos.textContent = String(todayPomos);
        if (statStreak) statStreak.textContent = `${streak} 天`;
        if (statTotalHours) statTotalHours.textContent = `${totalHours}h`;
        if (statTotalCount) statTotalCount.textContent = String(focusItems.length);

        // 专注长进与成长趋势分析 (v3.4.9 近 7 天每日趋势柱状图与周环比)
        const daysMap = [];
        const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
        let thisWeekMins = 0;
        let prevWeekMins = 0;

        for (let i = 6; i >= 0; i--) {
            const curDate = new Date();
            curDate.setDate(curDate.getDate() - i);
            const y = curDate.getFullYear();
            const m = String(curDate.getMonth() + 1).padStart(2, "0");
            const d = String(curDate.getDate()).padStart(2, "0");
            const dateStr = `${y}-${m}-${d}`;
            const dayName = (i === 0) ? "今天" : weekdays[curDate.getDay()];

            const dayFocusItems = focusItems.filter(it => it.date === dateStr);
            const dayMins = dayFocusItems.reduce((acc, it) => acc + (it.durationMins || 0), 0);
            thisWeekMins += dayMins;
            daysMap.push({
                date: dateStr,
                dayName: dayName,
                mins: dayMins,
                isToday: i === 0
            });
        }

        for (let i = 13; i >= 7; i--) {
            const prevDate = new Date();
            prevDate.setDate(prevDate.getDate() - i);
            const y = prevDate.getFullYear();
            const m = String(prevDate.getMonth() + 1).padStart(2, "0");
            const d = String(prevDate.getDate()).padStart(2, "0");
            const dateStr = `${y}-${m}-${d}`;
            const prevFocusItems = focusItems.filter(it => it.date === dateStr);
            prevWeekMins += prevFocusItems.reduce((acc, it) => acc + (it.durationMins || 0), 0);
        }

        const dailyAvg = Math.round(thisWeekMins / 7);
        const peakDayMins = Math.max(...daysMap.map(d => d.mins), 0);

        if (statWeekMins) statWeekMins.textContent = String(thisWeekMins);
        if (statDailyAvg) statDailyAvg.textContent = String(dailyAvg);
        if (statPeakDay) statPeakDay.textContent = String(peakDayMins);

        if (statWeekTrend) {
            if (prevWeekMins > 0) {
                const diff = thisWeekMins - prevWeekMins;
                const pct = Math.round((diff / prevWeekMins) * 100);
                if (pct >= 0) {
                    statWeekTrend.className = "pomo-trend-badge";
                    statWeekTrend.textContent = `↑ 较上周长进 +${pct}%`;
                } else {
                    statWeekTrend.className = "pomo-trend-badge trend-down";
                    statWeekTrend.textContent = `↓ 较上周 ${pct}%`;
                }
            } else if (thisWeekMins > 0) {
                statWeekTrend.className = "pomo-trend-badge";
                statWeekTrend.textContent = "🌱 稳步积累中";
            } else {
                statWeekTrend.className = "pomo-trend-badge";
                statWeekTrend.textContent = "🎯 准备开始";
            }
        }

        if (growthChart) {
            const maxMins = Math.max(peakDayMins, 30);
            growthChart.innerHTML = daysMap.map(day => {
                const fillPct = Math.max(day.mins > 0 ? 8 : 4, Math.round((day.mins / maxMins) * 100));
                return `
                    <div class="pomo-bar-col ${day.isToday ? 'is-today' : ''}" title="${day.date} (${day.dayName}): 投入 ${day.mins} 分钟">
                        <span class="pomo-bar-val">${day.mins > 0 ? `${day.mins}m` : '0'}</span>
                        <div class="pomo-bar-fill-wrap">
                            <div class="pomo-bar-fill" style="height: ${fillPct}%;"></div>
                        </div>
                        <span class="pomo-bar-day">${day.dayName}</span>
                    </div>
                `;
            }).join("");
        }

        if (timelineList) {
            if (pomoEvidenceLog.length === 0) {
                timelineList.innerHTML = `
                    <div class="pomo-empty-hint">
                        🌱 暂无行动证据记录。<br>不必等待感觉准备好，点击上方开始，完成一个可控的小步骤！
                    </div>
                `;
            } else {
                timelineList.innerHTML = pomoEvidenceLog.map(item => `
                    <div class="pomo-timeline-item" data-evid="${item.id}">
                        <div class="pomo-item-left">
                            <span class="pomo-item-tag">${item.mode === "focus" ? "🍅 专注" : "☕ 休息"} ${item.durationMins}m</span>
                            <span class="pomo-item-title">${escapeHtml(item.target || "未命名目标")}</span>
                        </div>
                        <div class="pomo-item-meta">
                            <span>${item.timestamp}</span>
                            ${!item.syncedToFlow ? `<button class="btn btn-xs btn-secondary btn-sync-single" data-evid="${item.id}" style="margin-left:8px;padding:1px 6px;font-size:10px;">⚡ 同步心流</button>` : `<span style="margin-left:8px;color:#10b981;font-size:11px;">✓ 已沉淀</span>`}
                        </div>
                    </div>
                `).join("");

                timelineList.querySelectorAll(".btn-sync-single").forEach(btn => {
                    btn.addEventListener("click", (e) => {
                        e.stopPropagation();
                        const evid = btn.dataset.evid;
                        const item = pomoEvidenceLog.find(x => x.id === evid);
                        if (item) {
                            pushEvidenceToFlowStream(item);
                            renderEvidenceDashboard();
                            showToast("已将该条证据同步至心流捕获！");
                        }
                    });
                });
            }
        }
    }

    window.renderEvidenceDashboard = renderEvidenceDashboard;

    function escapeHtml(str) {
        return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    // 事件监听绑定
    if (headerPill) {
        headerPill.addEventListener("click", (e) => {
            if (e.target === pillToggleBtn || (pillToggleBtn && pillToggleBtn.contains(e.target))) return;
            openModal();
        });
    }

    if (pillToggleBtn) {
        pillToggleBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleTimer();
        });
    }

    function openModal(defaultTab = null) {
        if (!modal) return;
        modal.style.display = "flex";
        if (defaultTab) switchSubtab(defaultTab);
        renderEvidenceDashboard();
        updateUI();
    }

    function closeModal() {
        if (!modal) return;
        modal.style.display = "none";
    }

    if (closeModalBtn) closeModalBtn.addEventListener("click", closeModal);
    if (modal) {
        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeModal();
        });
    }

    function switchSubtab(tabKey) {
        subtabs.forEach(btn => btn.classList.toggle("active", btn.dataset.ptab === tabKey));
        if (paneTimer) paneTimer.classList.toggle("active", tabKey === "timer");
        if (paneEvidence) paneEvidence.classList.toggle("active", tabKey === "evidence");
        if (paneSettings) paneSettings.classList.toggle("active", tabKey === "settings");
        if (tabKey === "evidence") renderEvidenceDashboard();
    }

    subtabs.forEach(btn => {
        btn.addEventListener("click", () => switchSubtab(btn.dataset.ptab));
    });

    modeBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            switchMode(btn.dataset.pmode);
        });
    });

    durationChips.forEach(chip => {
        chip.addEventListener("click", () => {
            durationChips.forEach(c => c.classList.remove("active"));
            chip.classList.add("active");
            const mins = parseInt(chip.dataset.mins, 10);
            if (!isNaN(mins) && mins > 0) {
                switchMode(pomoState.mode, mins);
            }
        });
    });

    if (targetInput) {
        targetInput.addEventListener("input", (e) => {
            pomoState.target = e.target.value;
            saveState();
        });
    }

    if (btnBindCard) {
        btnBindCard.addEventListener("click", () => {
            let cardTitle = "";
            if (typeof selectedNode !== "undefined" && selectedNode) {
                cardTitle = (selectedNode.label || selectedNode.content || "").replace(/<[^>]*>/g, "").trim();
            }
            if (cardTitle) {
                if (targetInput) targetInput.value = cardTitle;
                pomoState.target = cardTitle;
                saveState();
                showToast(`🎯 已绑定思维卡片：「${cardTitle}」`);
            } else {
                showToast("请先在画布上点击选中一张思维卡片，再点击绑定");
            }
        });
    }

    if (primaryBtn) primaryBtn.addEventListener("click", toggleTimer);
    if (resetBtn) {
        resetBtn.addEventListener("click", () => {
            let mins = pomoSettings.focusMins;
            if (pomoState.mode === "shortBreak") mins = pomoSettings.shortBreakMins;
            if (pomoState.mode === "longBreak") mins = pomoSettings.longBreakMins;
            pomoState.totalSeconds = mins * 60;
            pomoState.remainingSeconds = pomoState.totalSeconds;
            pauseTimer();
            showToast("本轮番茄钟已重置");
        });
    }
    if (skipBtn) {
        skipBtn.addEventListener("click", () => {
            pauseTimer();
            const nextMode = pomoState.mode === "focus" ? "shortBreak" : "focus";
            switchMode(nextMode);
            showToast(`已跳过本轮，切换至 ${nextMode === "focus" ? "🍅 专注" : "☕ 休息"} 模式`);
        });
    }
    if (finishEarlyBtn) {
        finishEarlyBtn.addEventListener("click", () => {
            completeSession(true);
        });
    }

    if (btnSyncAll) {
        btnSyncAll.addEventListener("click", () => {
            let count = 0;
            pomoEvidenceLog.forEach(item => {
                if (!item.syncedToFlow) {
                    pushEvidenceToFlowStream(item);
                    count++;
                }
            });
            renderEvidenceDashboard();
            showToast(count > 0 ? `⚡ 已将 ${count} 条证据同步至心流捕获！` : "所有证据此前已全部同步过");
        });
    }

    if (btnExportMd) {
        btnExportMd.addEventListener("click", () => {
            if (pomoEvidenceLog.length === 0) {
                showToast("证据库为空，暂无数据可导出");
                return;
            }
            let md = `# 🍅 FlowNotes 专注行动证据库 (Evidence Over Emotion)\n\n`;
            md += `> "用可信证据校准感受，记录每一个扎实脚印。"\n\n`;
            md += `| 日期时间 | 类型 | 投入时长 | 专注目标 / 任务 | 状态 |\n`;
            md += `| :--- | :--- | :--- | :--- | :--- |\n`;
            pomoEvidenceLog.forEach(item => {
                md += `| ${item.timestamp} | ${item.mode === "focus" ? "🍅 深度专注" : "☕ 休息"} | ${item.durationMins} 分钟 | ${item.target.replace(/\|/g, "/")} | ${item.type === "completed" ? "完整达成" : "灵活沉淀"} |\n`;
            });
            navigator.clipboard.writeText(md).then(() => {
                showToast("📋 证据 Markdown 表格已复制到剪贴板！可直接粘贴至 Obsidian/双链笔记");
            }).catch(() => {
                showToast("复制失败，请重试");
            });
        });
    }

    if (btnClearHistory) {
        btnClearHistory.addEventListener("click", () => {
            if (confirm("确定要清空所有专注证据历史吗？每一份走过的记录都很珍贵，建议先导出备份。")) {
                pomoEvidenceLog = [];
                saveEvidenceLog();
                renderEvidenceDashboard();
                updateUI();
                showToast("专注证据记录已清空");
            }
        });
    }

    if (btnSaveSettings) {
        btnSaveSettings.addEventListener("click", () => {
            const f = parseInt(cfgFocus.value, 10);
            const s = parseInt(cfgShort.value, 10);
            const l = parseInt(cfgLong.value, 10);
            if (!isNaN(f) && f > 0) pomoSettings.focusMins = f;
            if (!isNaN(s) && s > 0) pomoSettings.shortBreakMins = s;
            if (!isNaN(l) && l > 0) pomoSettings.longBreakMins = l;
            pomoSettings.soundEnabled = cfgSound.checked;
            pomoSettings.autoSyncFlow = cfgAutoSync.checked;
            saveSettings();
            showToast("💾 番茄钟偏好设置已保存");
            switchSubtab("timer");
        });
    }

    if (cfgFocus) cfgFocus.value = pomoSettings.focusMins;
    if (cfgShort) cfgShort.value = pomoSettings.shortBreakMins;
    if (cfgLong) cfgLong.value = pomoSettings.longBreakMins;
    if (cfgSound) cfgSound.checked = pomoSettings.soundEnabled;
    if (cfgAutoSync) cfgAutoSync.checked = pomoSettings.autoSyncFlow;

    // 全局快捷键 Alt+P：启动/暂停番茄钟
    window.addEventListener("keydown", (e) => {
        if (e.altKey && (e.key === "p" || e.key === "P" || e.code === "KeyP")) {
            e.preventDefault();
            toggleTimer();
            showToast(pomoState.isRunning ? "🍅 番茄专注已开始 (Alt+P)" : "⏸ 番茄专注已暂停 (Alt+P)");
        }
    });

    updateUI();
    renderEvidenceDashboard();
}




