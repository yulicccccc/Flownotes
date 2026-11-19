"""
FlowNotes Fortress Regression Test Suite
Covers all 4 core pillars:
  1. Title / Node Card Isolation & Integrity
  2. Note Details Editor Persistence, Isolation, Mode Switching & Undo/Redo
  3. Arrows / Links Geometry, Direction, Reversal, Deletion, Port Drag & Cycle Safety
  4. Formatting Round-Trip (Bold, Colors, Highlights, Handwriting, Base64 Images, Tables, Linebreaks, Blockquotes)

Run: python tests/fortress_regression.py
"""
import os
import sys
import time
import http.server
import socketserver
import threading
import traceback
from playwright.sync_api import sync_playwright

PORT = 8097
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC_DIR = os.path.join(ROOT_DIR, "public")


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def log_message(self, format, *args):
        pass


def start_server():
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), QuietHandler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd


def reset_app_state(page, test_nodes, test_links=None, select_idx=0):
    test_links = test_links or []
    page.evaluate(
        """({testNodes, testLinks, selectIdx}) => {
            if (typeof resetEditorBindingState === "function") resetEditorBindingState();
            nodes = JSON.parse(JSON.stringify(testNodes));
            links = JSON.parse(JSON.stringify(testLinks));
            historyStack = [];
            historyRedoStack = [];
            selectedLink = null;
            selectedNode = nodes[selectIdx] || null;
            selectedNodeIds = selectedNode ? new Set([selectedNode.id]) : new Set();
            sanitizeGraph();
            updateD3Graph();
            refreshNodeStyles();
            renderPositions();
            renderEditor();
            pushHistory();
        }""",
        {"testNodes": test_nodes, "testLinks": test_links, "selectIdx": select_idx},
    )
    time.sleep(0.15)


def run_all_tests():
    httpd = start_server()
    results = []

    def run_case(name, fn):
        try:
            fn()
            results.append((name, True, ""))
            print(f"  [PASS] {name}", flush=True)
        except Exception as e:
            results.append((name, False, str(e)))
            print(f"  [FAIL] {name} -> {e}", flush=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()

        console_errors = []
        page.on("pageerror", lambda err: console_errors.append(str(err)))

        page.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
        page.wait_for_selector("#graph-svg")
        time.sleep(0.8)

        # Ensure editor panel is open for editor tests
        page.evaluate('() => { if (typeof setEditorPanelCollapsed === "function") setEditorPanelCollapsed(false); }')
        time.sleep(0.2)

        # =====================================================================
        # PILLAR 1: TITLE / NODE ISOLATION & INTEGRITY
        # =====================================================================
        print("\n=== Pillar 1: Title / Node Isolation ===")

        def t1_1():
            reset_app_state(page, [{
                "id": "n1",
                "label": "Observation",
                "content": "Observation: 在 benchmarks.bio 上，相同 LLM 使用不同 Harness 表现差异很大。\n\n# 一、核心发现\n正文内容",
                "x": 300, "y": 250, "fx": 300, "fy": 250, "parentId": None
            }])
            res = page.evaluate('() => ({ label: nodes[0].label, content: nodes[0].content })')
            assert res["label"] == "Observation", f"Title hijacked by content! Got: {res['label']!r}"
            assert "# 一、核心发现" in res["content"], f"Heading lost from content! Got: {res['content']!r}"
        run_case("T1.1 Title never hijacked by content on sanitize/reload", t1_1)

        def t1_2():
            tiny_png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
            reset_app_state(page, [
                {
                    "id": "n_txt",
                    "label": "原标题",
                    "content": "# 一、重要章节\n详细正文内容",
                    "x": 260, "y": 200, "fx": 260, "fy": 200, "parentId": None
                },
                {
                    "id": "n_img",
                    "label": "旧图",
                    "isImage": True,
                    "imageUrl": tiny_png,
                    "content": f"![旧图]({tiny_png})\n\n# 图像分析\n细节说明",
                    "x": 260, "y": 460, "fx": 260, "fy": 460, "parentId": None
                }
            ])
            page.fill("#title-input", "新标题")
            page.dispatch_event("#title-input", "input")
            page.dispatch_event("#title-input", "blur")
            time.sleep(0.1)
            r1 = page.evaluate('() => ({ label: nodes[0].label, content: nodes[0].content })')
            assert r1["label"] == "新标题", f"Expected '新标题', got {r1['label']!r}"
            assert "# 一、重要章节" in r1["content"], f"H1 heading destroyed on title rename! Got: {r1['content']!r}"
            assert "详细正文内容" in r1["content"], f"Body text lost! Got: {r1['content']!r}"

            # Now select image node and rename
            page.evaluate('() => { selectedNode = nodes[1]; selectedNodeIds = new Set(["n_img"]); renderEditor(); }')
            page.fill("#title-input", "新图标题")
            page.dispatch_event("#title-input", "input")
            page.dispatch_event("#title-input", "blur")
            time.sleep(0.1)
            r2 = page.evaluate('() => ({ label: nodes[1].label, content: nodes[1].content })')
            assert r2["label"] == "新图标题", f"Image title not updated: {r2['label']!r}"
            assert "# 图像分析" in r2["content"], f"Image note H1 heading destroyed! Got: {r2['content']!r}"
            assert "细节说明" in r2["content"], f"Image note body lost! Got: {r2['content']!r}"
            assert f"![新图标题]({tiny_png})" in r2["content"], f"Image markdown alt not updated cleanly: {r2['content'][:80]!r}"
        run_case("T1.2 Renaming title never destroys H1 headings or image notes", t1_2)

        def t1_3():
            reset_app_state(page, [{
                "id": "n_tbl",
                "label": "表格卡",
                "content": "# 表格前说明\n\n| 列1 | 列2 |\n| --- | --- |\n| A | B |\n\n## 表格后总结\n重要结论",
                "x": 350, "y": 260, "fx": 350, "fy": 260, "parentId": None
            }])
            page.evaluate("""() => {
                const grp = document.querySelector('.node-group[data-node-id="n_tbl"]');
                const tbl = grp.querySelector('table');
                const cell = tbl.querySelector('tbody td');
                executeTableAction("table-insert-row-below", nodes[0], tbl, cell, false);
            }""")
            time.sleep(0.1)
            c = page.evaluate('() => nodes[0].content')
            assert "# 表格前说明" in c, f"Heading before table was wiped! Got:\n{c}"
            assert "## 表格后总结" in c, f"Heading after table was wiped! Got:\n{c}"
            assert "重要结论" in c, f"Notes after table wiped! Got:\n{c}"
        run_case("T1.3 Table actions on canvas card preserve all headings and notes", t1_3)

        def t1_4():
            reset_app_state(page, [{
                "id": "n_todo",
                "label": "- [ ] 任务1<br>- [ ] 任务2",
                "content": "",
                "x": 350, "y": 260, "fx": 350, "fy": 260, "parentId": None
            }])
            # Click first checkbox on canvas card
            cb0 = page.locator('.node-group[data-node-id="n_todo"] .canvas-todo-checkbox').nth(0)
            cb0.click()
            time.sleep(0.15)
            page.evaluate('() => flushPendingSave()')
            time.sleep(0.1)
            lbl1 = page.evaluate('() => nodes[0].label')
            assert "[x] 任务1" in lbl1 and "[ ] 任务2" in lbl1, f"Todo toggle failed or double-toggled! Got: {lbl1!r}"

            # Undo then redo, then click checkbox 2 (tests stale D3 child datum!)
            page.evaluate('() => { undo(); redo(); }')
            time.sleep(0.15)
            cb1 = page.locator('.node-group[data-node-id="n_todo"] .canvas-todo-checkbox').nth(1)
            cb1.click()
            time.sleep(0.15)
            lbl2 = page.evaluate('() => nodes[0].label')
            assert "[x] 任务1" in lbl2 and "[x] 任务2" in lbl2, f"Todo toggle after Undo/Redo failed (stale datum)! Got: {lbl2!r}"
        run_case("T1.4 Canvas To-Do checkbox toggles cleanly once and works after Undo/Redo", t1_4)

        def t1_5():
            reset_app_state(page, [
                {
                    "id": "n_ml",
                    "label": "第一行标题",
                    "content": "",
                    "x": 280, "y": 220, "fx": 280, "fy": 220, "parentId": None
                },
                {
                    "id": "n_h1",
                    "label": "原卡片名",
                    "content": "# 一、用户自写主标题\n深度内容段落",
                    "x": 280, "y": 420, "fx": 280, "fy": 420, "parentId": None
                }
            ])
            res = page.evaluate("""() => {
                // 1. Multiline edit on card with empty content must NOT fabricate phantom content
                const grp1 = document.querySelector('.node-group[data-node-id="n_ml"]');
                startInlineCardEdit(nodes[0], grp1, false, true);
                const body1 = grp1.querySelector('.canvas-note-card-body');
                body1.innerHTML = '第一行标题<br>第二行副标题';
                body1.dispatchEvent(new Event('input', { bubbles: true }));
                body1.blur();

                // 2. Inline title edit on card whose content starts with # H1 must NOT overwrite # H1
                const grp2 = document.querySelector('.node-group[data-node-id="n_h1"]');
                startInlineCardEdit(nodes[1], grp2, false, true);
                const body2 = grp2.querySelector('.canvas-note-card-body');
                body2.innerHTML = '改名后的卡片';
                body2.dispatchEvent(new Event('input', { bubbles: true }));
                body2.blur();
                return { c0: nodes[0].content, l0: nodes[0].label, c1: nodes[1].content, l1: nodes[1].label };
            }""")
            assert res["c0"] == "", f"Multiline card title fabricated phantom content! Got: {res['c0']!r}"
            assert "第二行副标题" in res["l0"], f"Multiline label lost: {res['l0']!r}"
            assert res["l1"] == "改名后的卡片", f"Inline rename failed: {res['l1']!r}"
            assert "# 一、用户自写主标题" in res["c1"], f"Inline card rename destroyed H1 heading in content! Got: {res['c1']!r}"
        run_case("T1.5 Canvas inline card edit never fabricates phantom content or overwrites H1 heading", t1_5)

        # =====================================================================
        # PILLAR 2: NOTE DETAILS ISOLATION, PERSISTENCE & UNDO/REDO
        # =====================================================================
        print("\n=== Pillar 2: Note Details Isolation & Persistence ===")

        def t2_1():
            reset_app_state(page, [
                {
                    "id": "node_A",
                    "label": "稿子和具体改进方法",
                    "content": "| 失败类型 | 改进 |\n| --- | --- |\n| QC | 检查规则 |",
                    "x": 320, "y": 180, "fx": 320, "fy": 180, "parentId": None
                },
                {
                    "id": "node_B",
                    "label": "Surprisingly Popular",
                    "content": "Node B 专属独立正文内容。",
                    "x": 320, "y": 480, "fx": 320, "fy": 480, "parentId": None
                }
            ])
            page.click("#rich-editor")
            page.keyboard.type(" 补充")
            time.sleep(0.1)
            page.click('.node-group[data-node-id="node_B"] .canvas-note-card')
            time.sleep(0.2)
            page.evaluate('() => flushPendingSave()')
            res = page.evaluate('() => ({ a: nodes[0].content, b: nodes[1].content, ed: document.getElementById("rich-editor").innerHTML })')
            assert "失败类型" in res["a"], "Node A lost its table"
            assert "失败类型" not in res["b"], f"Node A table leaked into Node B! B={res['b']!r}"
            assert "Node B 专属独立正文内容" in res["ed"], f"Editor did not load Node B! ed={res['ed']!r}"
        run_case("T2.1 Cross-node isolation when switching from focused rich-editor via canvas click", t2_1)

        def t2_2():
            reset_app_state(page, [{
                "id": "n_dirty",
                "label": '标题<span style="color:#ef4444">重点</span>',
                "content": "原始内容",
                "x": 320, "y": 240, "fx": 320, "fy": 240, "parentId": None
            }])
            # Simulate direct model mutation (like canvas action) while rich-editor was untouched
            page.evaluate("""() => {
                nodes[0].content = "画布更新后的权威内容";
                commitCurrentEditorToSelectedNode();
            }""")
            res = page.evaluate('() => ({ label: nodes[0].label, content: nodes[0].content })')
            assert 'color:#ef4444' in res["label"], f"Label color wiped! Got: {res['label']!r}"
            assert res["content"] == "画布更新后的权威内容", f"Untouched rich-editor clobbered node.content! Got: {res['content']!r}"
        run_case("T2.2 Dirty-flag protection prevents untouched editor from clobbering label/content", t2_2)

        def t2_3():
            reset_app_state(page, [{
                "id": "n_mode",
                "label": "模式切换测试",
                "content": "初始内容",
                "x": 320, "y": 240, "fx": 320, "fy": 240, "parentId": None
            }])
            # Switch to Markdown edit mode
            page.click('.format-btn[data-preview-mode="edit"]')
            time.sleep(0.1)
            page.fill("#md-textarea", "第一段\n\n第二段源码修改")
            page.dispatch_event("#md-textarea", "input")
            # Switch back to Live mode
            page.click('.format-btn[data-preview-mode="live"]')
            time.sleep(0.15)
            # Trigger commit (e.g. clicking away)
            page.evaluate('() => commitCurrentEditorToSelectedNode()')
            res = page.evaluate('() => ({ content: nodes[0].content, html: document.getElementById("rich-editor").innerHTML })')
            assert "第二段源码修改" in res["html"], f"Switching edit->live didn't update rich-editor! html={res['html']!r}"
            assert "第二段源码修改" in res["content"], f"Edit mode changes lost after switching to live! content={res['content']!r}"
        run_case("T2.3 Live <-> Markdown Edit mode switching commits and syncs without data loss", t2_3)

        def t2_4():
            reset_app_state(page, [
                {
                    "id": "n_sel_A",
                    "label": "选中节点A",
                    "content": "Node A 独立正文",
                    "x": 260, "y": 160, "fx": 260, "fy": 160, "parentId": None
                },
                {
                    "id": "n_tbl_B",
                    "label": "表格节点B",
                    "content": "| H1 | H2 |\n| --- | --- |\n| B1 | B2 |",
                    "x": 260, "y": 420, "fx": 260, "fy": 420, "parentId": None
                }
            ], select_idx=0)
            # Click [+行] on Node B while Node A is selected!
            page.evaluate("""() => {
                const grpB = document.querySelector('.node-group[data-node-id="n_tbl_B"]');
                const tblB = grpB.querySelector('table');
                executeTableAction("table-insert-row-below", nodes[1], tblB, tblB.querySelector('tbody td'), false);
            }""")
            time.sleep(0.1)
            res = page.evaluate('() => ({ a: nodes[0].content, ed: document.getElementById("rich-editor").innerHTML, b: nodes[1].content })')
            assert "H1" not in res["ed"], f"Node B table action polluted Node A's rich-editor! ed={res['ed']!r}"
            assert res["a"] == "Node A 独立正文", f"Node A content corrupted: {res['a']!r}"
        run_case("T2.4 Canvas table toolbar on Node B never pollutes selected Node A editor", t2_4)

        def t2_5():
            # Create two maps both containing id 'root_1'
            res = page.evaluate("""() => {
                const m1 = "test_map_iso_1";
                const m2 = "test_map_iso_2";
                allMapsMemoryCache[m1] = {
                    nodes: [{ id: "root_1", label: "M1Root", content: "Map1 独有笔记", x: 250, y: 250, fx: 250, fy: 250, parentId: null }],
                    links: [], flowStream: [], inkStrokes: []
                };
                allMapsMemoryCache[m2] = {
                    nodes: [{ id: "root_1", label: "M2Root", content: "Map2 独有笔记", x: 250, y: 250, fx: 250, fy: 250, parentId: null }],
                    links: [], flowStream: [], inkStrokes: []
                };
                if (!mapsManifest.some(m => m.id === m1)) mapsManifest.push({ id: m1, title: "Map 1" });
                if (!mapsManifest.some(m => m.id === m2)) mapsManifest.push({ id: m2, title: "Map 2" });

                switchActiveMap(m1);
                document.getElementById("rich-editor").focus();
                switchActiveMap(m2);
                const edAfterSwitch = document.getElementById("rich-editor").innerHTML;
                const m2ContentBeforeUndo = nodes[0].content;
                undo(); // Must NOT jump back to Map 1!
                const m2ContentAfterUndo = nodes[0].content;
                return { edAfterSwitch, m2ContentBeforeUndo, m2ContentAfterUndo };
            }""")
            assert "Map2 独有笔记" in res["edAfterSwitch"], f"Map 2 failed to load into rich-editor (same id root_1)! Got: {res['edAfterSwitch']!r}"
            assert "Map2 独有笔记" in res["m2ContentAfterUndo"], f"Undo in Map 2 leaked Map 1 graph! Got: {res['m2ContentAfterUndo']!r}"
        run_case("T2.5 Map switching with identical node IDs (root_1) isolates editor & undo stack", t2_5)

        def t2_6():
            reset_app_state(page, [{
                "id": "n_undo",
                "label": "撤销节点",
                "content": "V1 内容",
                "x": 320, "y": 240, "fx": 320, "fy": 240, "parentId": None
            }])
            page.evaluate("""() => {
                nodes[0].content = "V2 内容";
                renderEditor();
                saveGraphToStorage(true);
            }""")
            page.click("#rich-editor")
            page.evaluate('() => undo()')
            time.sleep(0.1)
            res = page.evaluate("""() => {
                const live = nodes.find(n => n.id === "n_undo");
                return {
                    sameRef: selectedNode === live,
                    content: live ? live.content : null,
                    edHtml: document.getElementById("rich-editor").innerHTML
                };
            }""")
            assert res["sameRef"], "After undo(), selectedNode is a STALE detached object (not === live node in nodes)!"
            assert res["content"] == "V1 内容", f"Expected V1 内容, got {res['content']!r}"
            assert "V1 内容" in res["edHtml"], f"Editor didn't update to V1 on undo! edHtml={res['edHtml']!r}"
        run_case("T2.6 Undo/Redo rebinds selectedNode to live node and updates rich-editor", t2_6)

        def t2_7():
            reset_app_state(page, [{
                "id": "n_ime",
                "label": "IME卡片",
                "content": "初始正文",
                "x": 320, "y": 240, "fx": 320, "fy": 240, "parentId": None
            }])
            res = page.evaluate("""() => {
                // Corrupt rich-editor DOM artificially without marking dirty, then trigger IME compositionend on canvas card
                document.getElementById("rich-editor").innerHTML = "脏DOM绝对不能写回";
                const grp = document.querySelector('.node-group[data-node-id="n_ime"]');
                startInlineCardEdit(nodes[0], grp, false, true);
                const body = grp.querySelector('.canvas-note-card-body');
                body.dispatchEvent(new Event("compositionend", { bubbles: true }));
                body.blur();
                return nodes[0].content;
            }""")
            assert res == "初始正文", f"Canvas IME compositionend clobbered node.content from right panel! Got: {res!r}"
        run_case("T2.7 IME compositionend on canvas card never clobbers content from right panel", t2_7)

        # =====================================================================
        # PILLAR 3: ARROWS / LINKS INTEGRITY
        # =====================================================================
        print("\n=== Pillar 3: Arrows / Links Integrity ===")

        def t3_1():
            reset_app_state(page, [
                {"id": "a1", "label": "父节点A", "content": "", "x": 200, "y": 200, "fx": 200, "fy": 200, "parentId": None},
                {"id": "b1", "label": "子节点B", "content": "", "x": 600, "y": 200, "fx": 600, "fy": 200, "parentId": "a1", "arrowStyle": "solid"}
            ])
            # Move B and save history, then undo, then move A and check arrow coords
            res = page.evaluate("""() => {
                nodes[1].x = 700; nodes[1].y = 400; nodes[1].fx = 700; nodes[1].fy = 400;
                renderPositions();
                saveGraphToStorage(true);
                undo();
                // Now move live node A
                nodes[0].x = 240; nodes[0].y = 260; nodes[0].fx = 240; nodes[0].fy = 260;
                renderPositions();
                const line = document.querySelector("line.link");
                const x1 = parseFloat(line.getAttribute("x1"));
                const y1 = parseFloat(line.getAttribute("y1"));
                const x2 = parseFloat(line.getAttribute("x2"));
                const y2 = parseFloat(line.getAttribute("y2"));
                // Also test getLinkCoords with raw string IDs
                const strCoords = getLinkCoords({ source: "a1", target: "b1", arrowStyle: "solid" });
                return { x1, y1, x2, y2, strCoords };
            }""")
            assert res["x1"] > 200 and res["y1"] > 220, f"Arrow detached from moved node A after undo! ({res['x1']}, {res['y1']})"
            assert res["strCoords"]["sx"] > 200 and res["strCoords"]["tx"] > 450, f"getLinkCoords shot to (0,0) on string IDs! {res['strCoords']}"
        run_case("T3.1 Arrow geometry tracks live nodes after Undo and never shoots to (0,0)", t3_1)

        def t3_2():
            reset_app_state(page, [
                {"id": "p_vis", "label": "父", "content": "", "x": 200, "y": 200, "fx": 200, "fy": 200, "parentId": None, "collapsed": True},
                {"id": "c_hid", "label": "隐藏子", "content": "", "x": 500, "y": 300, "fx": 500, "fy": 300, "parentId": "p_vis"},
                {"id": "n_src", "label": "起点", "content": "", "x": 200, "y": 420, "fx": 200, "fy": 420, "parentId": None}
            ])
            # Push & undo so D3 update path runs
            res = page.evaluate("""() => {
                saveGraphToStorage(true);
                undo();
                const grp = document.querySelector('.node-group[data-node-id="n_src"]');
                const liveSrc = nodes.find(n => n.id === "n_src");
                const portDatum = d3.select(grp.querySelector(".node-connect-port")).datum();
                const foldDatum = d3.select(grp.querySelector(".node-fold-badge")).datum();
                const quickDatum = d3.select(grp.querySelector(".node-quick-add-btn")).datum();
                const cardDatum = d3.select(grp.querySelector(".canvas-note-card")).datum();
                return {
                    portLive: portDatum === liveSrc,
                    foldLive: foldDatum === liveSrc,
                    quickLive: quickDatum === liveSrc,
                    cardLive: cardDatum === liveSrc
                };
            }""")
            assert res["portLive"], "STALE D3 DATUM on .node-connect-port after undo!"
            assert res["foldLive"], "STALE D3 DATUM on .node-fold-badge after undo!"
            assert res["quickLive"], "STALE D3 DATUM on .node-quick-add-btn after undo!"
            assert res["cardLive"], "STALE D3 DATUM on .canvas-note-card after undo!"
        run_case("T3.2 D3 child elements (.node-connect-port, fold, quick-add, card) rebind live datum after Undo", t3_2)

        def t3_3():
            reset_app_state(page, [
                {"id": "a", "label": "节点A", "content": "", "x": 200, "y": 200, "fx": 200, "fy": 200, "parentId": None},
                {"id": "b", "label": "节点B", "content": "", "x": 560, "y": 200, "fx": 560, "fy": 200, "parentId": "a", "arrowStyle": "bold", "edgeLabel": "导致"},
                {"id": "c", "label": "节点C", "content": "", "x": 200, "y": 440, "fx": 200, "fy": 440, "parentId": None},
                {"id": "d", "label": "节点D", "content": "", "x": 560, "y": 440, "fx": 560, "fy": 440, "parentId": None}
            ], [
                {"source": "c", "target": "d", "type": "relation", "arrowStyle": "dotted", "label": "关联"}
            ])
            res = page.evaluate("""() => {
                // 1. Reverse tree arrow A -> B
                selectedLink = { source: nodes[0], target: nodes[1], arrowStyle: "bold", label: "导致" };
                reverseSelectedLink();
                const treeAfter = {
                    aParent: nodes[0].parentId,
                    aStyle: nodes[0].arrowStyle,
                    aEdgeLabel: nodes[0].edgeLabel,
                    bParent: nodes[1].parentId,
                    bEdgeLabel: nodes[1].edgeLabel || ""
                };
                // 2. Reverse relation arrow C -> D
                const rel = links.find(l => l.type === "relation");
                selectedLink = rel;
                reverseSelectedLink();
                const relAfter = links.find(l => l.type === "relation");
                return {
                    treeAfter,
                    relSrc: cleanNodeId(relAfter.source),
                    relTgt: cleanNodeId(relAfter.target),
                    relStyle: relAfter.arrowStyle,
                    relLabel: relAfter.label
                };
            }""")
            t = res["treeAfter"]
            assert t["aParent"] == "b" and t["bParent"] is None, f"Tree reversal parentId wrong: {t}"
            assert t["aStyle"] == "bold" and t["aEdgeLabel"] == "导致", f"Tree reversal lost arrowStyle/edgeLabel! {t}"
            assert t["bEdgeLabel"] == "", f"Old child kept stale edgeLabel! {t}"
            assert res["relSrc"] == "d" and res["relTgt"] == "c", f"Relation arrow reversal failed! {res}"
            assert res["relStyle"] == "dotted" and res["relLabel"] == "关联", f"Relation arrow lost style/label! {res}"
        run_case("T3.3 reverseSelectedLink works for both Tree (keeps style/label) and Relation arrows", t3_3)

        def t3_4():
            reset_app_state(page, [
                {"id": "a", "label": "A", "content": "笔记A", "x": 200, "y": 200, "fx": 200, "fy": 200, "parentId": None},
                {"id": "b", "label": "B", "content": "", "x": 560, "y": 200, "fx": 560, "fy": 200, "parentId": "a", "edgeLabel": "旧关系"}
            ])
            # Click arrow
            page.locator("line.link").first.click(force=True)
            time.sleep(0.1)
            sel_cls_1 = page.evaluate('() => document.querySelector("line.link").classList.contains("link-selected")')
            assert sel_cls_1, "Arrow did not get .link-selected on click"
            # Click node A -> arrow must lose .link-selected immediately!
            page.click('.node-group[data-node-id="a"] .canvas-note-card')
            time.sleep(0.1)
            sel_cls_2 = page.evaluate('() => document.querySelector("line.link").classList.contains("link-selected")')
            assert not sel_cls_2, "Arrow stayed .link-selected after clicking a node!"
            # Click arrow again and delete it
            page.locator("line.link").first.click(force=True)
            time.sleep(0.1)
            page.evaluate('() => deleteSelectedLink()')
            res = page.evaluate('() => ({ count: nodes.length, bParent: nodes[1].parentId, bEdge: nodes[1].edgeLabel || "" })')
            assert res["count"] == 2 and res["bParent"] is None, f"deleteSelectedLink failed: {res}"
            assert res["bEdge"] == "", f"deleteSelectedLink left stale edgeLabel: {res['bEdge']!r}"
        run_case("T3.4 Arrow selection clears on node click & deleteSelectedLink clears stale edgeLabel", t3_4)

        def t3_5():
            reset_app_state(page, [
                {"id": "a", "label": "A", "content": "", "x": 200, "y": 200, "fx": 200, "fy": 200, "parentId": None},
                {"id": "b", "label": "B", "content": "", "x": 600, "y": 200, "fx": 600, "fy": 200, "parentId": "a", "arrowStyle": "dashed"}
            ])
            res = page.evaluate("""() => {
                selectedLink = { source: nodes[0], target: nodes[1], arrowStyle: "dashed" };
                insertNodeOnSelectedLink();
                const mid = nodes.find(n => n.id.startsWith("mid_"));
                const b = nodes.find(n => n.id === "b");
                return {
                    midContent: mid ? mid.content : null,
                    midParent: mid ? mid.parentId : null,
                    midStyle: mid ? mid.arrowStyle : null,
                    bParent: b ? b.parentId : null
                };
            }""")
            assert res["midContent"] == "", f"insertNodeOnSelectedLink created phantom content! {res['midContent']!r}"
            assert res["midParent"] == "a" and res["bParent"] and res["bParent"].startswith("mid_"), f"Topology wrong: {res}"
            assert res["midStyle"] == "dashed", f"insertNodeOnSelectedLink lost arrowStyle: {res['midStyle']!r}"
        run_case("T3.5 insertNodeOnSelectedLink creates pure empty content and preserves arrowStyle", t3_5)

        def t3_6():
            has_guard = page.evaluate('() => /visited/i.test(isNodeDescendantOf.toString())')
            assert has_guard, "isNodeDescendantOf has NO visited cycle guard (will infinite-loop freeze browser)!"
            res = page.evaluate("""() => {
                nodes = [
                    { id: "cyc1", label: "C1", parentId: "cyc2", x: 100, y: 100 },
                    { id: "cyc2", label: "C2", parentId: "cyc1", x: 200, y: 100 }
                ];
                return isNodeDescendantOf("cyc1", "nonexistent");
            }""")
            assert res is False, "Cycle guard failed"
        run_case("T3.6 isNodeDescendantOf terminates safely on cyclic parentId graphs", t3_6)

        def t3_7():
            reset_app_state(page, [
                {"id": "p_col", "label": "折叠父", "content": "", "x": 180, "y": 180, "fx": 180, "fy": 180, "parentId": None, "collapsed": True},
                {"id": "c_hid", "label": "不可见子", "content": "", "x": 520, "y": 320, "fx": 520, "fy": 320, "parentId": "p_col"},
                {"id": "src_p", "label": "拉线起点", "content": "", "x": 180, "y": 420, "fx": 180, "fy": 420, "parentId": None},
                {"id": "vis_t", "label": "可见目标", "content": "", "x": 520, "y": 480, "fx": 520, "fy": 480, "parentId": None}
            ])
            res = page.evaluate("""() => {
                // Simulate port drag landing directly on hidden c_hid's coordinates
                const svgEl = document.getElementById("graph-svg");
                const rect = svgEl.getBoundingClientRect();
                const t = d3.zoomTransform(svgEl);
                const makeEvt = (wx, wy) => ({ sourceEvent: { clientX: rect.left + t.applyX(wx), clientY: rect.top + t.applyY(wy), stopPropagation() {} } });

                const grpSrc = document.querySelector('.node-group[data-node-id="src_p"]');
                const portEl = grpSrc.querySelector('.node-connect-port');
                startPortConnectDrag.call(portEl, makeEvt(180, 420), nodes[2]);
                endPortConnectDrag(makeEvt(520, 320), nodes[2]);
                const hidParentAfter = nodes[1].parentId;

                startPortConnectDrag.call(portEl, makeEvt(180, 420), nodes[2]);
                endPortConnectDrag(makeEvt(520, 480), nodes[2]);
                const visParentAfter = nodes[3].parentId;
                return { hidParentAfter, visParentAfter };
            }""")
            assert res["hidParentAfter"] == "p_col", f"Port drag snapped to hidden collapsed node! {res}"
            assert res["visParentAfter"] == "src_p", f"Port drag failed to connect to visible node! {res}"
        run_case("T3.7 Port drag ignores hidden/collapsed nodes and connects cleanly to visible nodes", t3_7)

        # =====================================================================
        # PILLAR 4: FORMATTING ROUND-TRIP, BASE64, TABLES, HANDWRITING
        # =====================================================================
        print("\n=== Pillar 4: Formatting, Base64, Tables & Handwriting ===")

        def t4_1():
            img1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=="
            img2 = "data:image/png;base64,R0lGODlhAQABAIAAAAAAAP=="
            md = f"![图1]({img1})\n\n中间正文段落\n\n![图2]({img2})"
            res = page.evaluate("""(md) => {
                const html = renderMarkdownToHTML(md);
                const div = document.createElement("div");
                div.innerHTML = html;
                const imgs = div.querySelectorAll("img.note-embedded-img");
                const marks = div.querySelectorAll("mark");
                const roundtrip = htmlToSafeMarkdown(html);
                return { imgCount: imgs.length, markCount: marks.length, html, roundtrip };
            }""", md)
            assert res["imgCount"] == 2, f"Two Base64 images ending in == were destroyed! imgCount={res['imgCount']}"
            assert res["markCount"] == 0, f"Base64 == falsely triggered <mark> highlight! markCount={res['markCount']}"
            assert img1 in res["roundtrip"] and img2 in res["roundtrip"] and "中间正文段落" in res["roundtrip"], "Base64 roundtrip lost image or text!"
        run_case("T4.1 Two Base64 images ending in '==' are never corrupted by highlight regex", t4_1)

        def t4_2():
            md = '==黄色高亮== 和 <mark style="background-color:#bbf7d0">绿色高亮</mark>'
            res = page.evaluate("""(md) => {
                let cur = md;
                let html = "";
                for (let i = 0; i < 3; i++) {
                    html = renderMarkdownToHTML(cur);
                    cur = htmlToSafeMarkdown(html);
                }
                return { cur, html };
            }""", md)
            assert "rgb(133, 77, 14)" not in res["cur"], f"Infinite <span style='color:rgb(133,77,14)'> bloat on highlight! Got: {res['cur']!r}"
            assert "#bbf7d0" in res["cur"], f"Multi-color highlight #bbf7d0 lost! Got: {res['cur']!r}"
            assert "&lt;mark" not in res["html"], f"Multi-color <mark> escaped as raw HTML! Got: {res['html']!r}"
        run_case("T4.2 Highlights (yellow & custom color) round-trip 3x cleanly with zero bloat", t4_2)

        def t4_3():
            html = '<span style="font-weight:700; color:#ef4444">红粗字</span> 和 <span class="font-handwriting" style="font-weight:700">手写粗</span> 和 <mark style="background-color:#bbf7d0; color:#10b981">绿亮彩字</mark>'
            res = page.evaluate("""(h) => {
                const ser = serializeCardLabelFromHTML(h);
                const ren = renderCardLabelHTML(ser);
                return { ser, ren };
            }""", html)
            assert "#ef4444" in res["ser"] and "**" in res["ser"], f"Bold+Color dropped one style! ser={res['ser']!r}"
            assert "font-handwriting" in res["ser"], f"Bold+Handwriting dropped handwriting! ser={res['ser']!r}"
            assert "#bbf7d0" in res["ser"] and "#10b981" in res["ser"], f"Highlight+Color dropped one style! ser={res['ser']!r}"
            assert "<strong>" in res["ren"] and 'color:#ef4444' in res["ren"] and 'font-handwriting' in res["ren"], f"Rendered label missing styles! ren={res['ren']!r}"
        run_case("T4.3 Combined inline styles (bold+color, bold+handwriting, highlight+color) survive card round-trip", t4_3)

        def t4_4():
            md = "第一段计算 p * 0.05\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n最后一段 3 * 4"
            res = page.evaluate("""(md) => {
                const html = renderMarkdownToHTML(md);
                const div = document.createElement("div");
                div.innerHTML = html;
                const tbl = div.querySelector("table");
                const emInsideTbl = tbl ? tbl.closest("em") : null;
                return { hasTbl: !!tbl, tblWrappedInEm: !!emInsideTbl, html };
            }""", md)
            assert res["hasTbl"] and not res["tblWrappedInEm"], f"Stray * across paragraphs corrupted table! html={res['html']!r}"
        run_case("T4.4 Stray '*' across paragraphs never wraps or corrupts intermediate tables", t4_4)

        def t4_5():
            reset_app_state(page, [{
                "id": "n_hw",
                "label": "1. 改进harness:<br>Observation -> Comparison",
                "content": "详细笔记内容",
                "x": 320, "y": 240, "fx": 320, "fy": 240, "parentId": None
            }])
            page.evaluate('() => applyFormatting("handwriting")')
            time.sleep(0.1)
            page.evaluate('() => flushPendingSave()')
            res = page.evaluate("""() => {
                const card = document.querySelector(".canvas-note-card");
                const ed = document.getElementById("rich-editor");
                return {
                    fontStyle: nodes[0].fontStyle,
                    cardHasCls: card.classList.contains("is-handwriting"),
                    edHasCls: ed.classList.contains("is-handwriting"),
                    edFont: getComputedStyle(ed).fontFamily
                };
            }""")
            assert res["fontStyle"] == "handwriting" and res["cardHasCls"] and res["edHasCls"], f"Handwriting toggle failed: {res}"
            assert "FlowNotesHandwriting" in res["edFont"], f"Editor missing handwriting font CSS: {res['edFont']!r}"
        run_case("T4.5 Card & editor handwriting toggle persists and applies FlowNotesHandwriting CSS", t4_5)

        def t4_6():
            res = page.evaluate("""() => {
                // 1. Multiline table cell
                const tblHtml = '<table class="canvas-card-table"><thead><tr><th>标题</th><th>说明</th></tr></thead><tbody><tr><td>第一行<br>第二行</td><td>正常</td></tr></tbody></table>';
                const tblMd = htmlToSafeMarkdown(tblHtml);
                const tblReHtml = renderMarkdownToHTML(tblMd);
                // 2. Multi-paragraph paste
                const pHtml = '<p>Para 1.</p><p>Para 2.</p><p>Para 3.</p>';
                const pMd = htmlToSafeMarkdown(pHtml);
                // 3. Blockquote
                const bqMd = '> 这是引用段落';
                const bqHtml = renderMarkdownToHTML(bqMd);
                const bqBack = htmlToSafeMarkdown(bqHtml);
                return { tblMd, tblReHtml, pMd, bqHtml, bqBack };
            }""")
            assert "第一行<br>第二行" in res["tblReHtml"] or ("第一行" in res["tblReHtml"] and "<br>" in res["tblReHtml"] and "第二行" in res["tblReHtml"]), f"Table cell multiline <br> lost! md={res['tblMd']!r}, html={res['tblReHtml']!r}"
            assert "Para 1.\n\nPara 2.\n\nPara 3." in res["pMd"], f"Multi-paragraph linebreaks lost! {res['pMd']!r}"
            assert "<blockquote" in res["bqHtml"] and "> 这是引用段落" in res["bqBack"], f"Blockquote round-trip failed! html={res['bqHtml']!r}, back={res['bqBack']!r}"
        run_case("T4.6 Multiline table cells, multi-paragraph paste, and blockquotes survive round-trip", t4_6)

        def t4_7():
            # Test canvas card inline edit with collapsed cursor + clicking color-red -> card turns red!
            reset_app_state(page, [{
                "id": "n_fmt",
                "label": "测试卡片颜色",
                "content": "",
                "x": 320, "y": 240, "fx": 320, "fy": 240, "parentId": None
            }])
            res = page.evaluate("""() => {
                const grp = document.querySelector('.node-group[data-node-id="n_fmt"]');
                startInlineCardEdit(nodes[0], grp, false, true);
                applyFormatting("color-red");
                return { textColor: nodes[0].textColor, label: nodes[0].label };
            }""")
            assert res["textColor"] == "#ef4444", f"Collapsed cursor color-red on card didn't apply card color! Got: {res}"
        run_case("T4.7 Collapsed cursor color formatting on canvas card applies cleanly to card", t4_7)

        def t4_8():
            reset_app_state(page, [{
                "id": "n_tbl_paste",
                "label": "数据表卡片",
                "content": "# 表前标题\n\n| 列1 | 列2 |\n| --- | --- |\n| 旧1 | 旧2 |\n\n## 表后结论\n关键说明",
                "x": 360, "y": 280, "fx": 360, "fy": 280, "parentId": None
            }])
            res = page.evaluate("""() => {
                const grp = document.querySelector('.node-group[data-node-id="n_tbl_paste"]');
                startInlineCardEdit(nodes[0], grp, false, false);
                const cell = grp.querySelector('tbody td');
                const r = document.createRange();
                r.selectNodeContents(cell);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(r);
                // 1. Bold inside canvas card table cell -> must save to node.content!
                applyFormatting("bold");
                const afterBold = nodes[0].content;

                // 2. Smart TSV paste into canvas card table cell -> must keep headings & notes!
                const r2 = document.createRange();
                r2.selectNodeContents(grp.querySelector('tbody td'));
                r2.collapse(true);
                sel.removeAllRanges();
                sel.addRange(r2);
                const fakeEvt = {
                    clipboardData: {
                        getData: (t) => t === "text/plain" ? "新A\\t新B\\n新C\\t新D" : ""
                    },
                    preventDefault() {},
                    stopImmediatePropagation() {}
                };
                handleTablePasteEvent(fakeEvt);
                return { afterBold, afterPaste: nodes[0].content };
            }""")
            assert "**旧1**" in res["afterBold"], f"Bold inside canvas table cell not saved to content! {res['afterBold']!r}"
            assert "# 表前标题" in res["afterPaste"] and "## 表后结论" in res["afterPaste"] and "关键说明" in res["afterPaste"], f"Canvas table paste wiped headings/notes! {res['afterPaste']!r}"
            assert "新A" in res["afterPaste"] and "新D" in res["afterPaste"], f"Canvas table paste data missing! {res['afterPaste']!r}"
        run_case("T4.8 Canvas card table cell bold & TSV paste both persist and preserve all notes/headings", t4_8)

        def t4_9():
            reset_app_state(page, [{
                "id": "n_hl_css",
                "label": '<mark style="background-color:#bbf7d0"><span style="color:#ef4444">绿底红字</span></mark>',
                "content": '<mark style="background-color:#bbf7d0">绿色荧光笔</mark>',
                "x": 360, "y": 280, "fx": 360, "fy": 280, "parentId": None
            }])
            res = page.evaluate("""() => {
                const cardMark = document.querySelector('.canvas-note-card mark');
                const cardSpan = cardMark ? cardMark.querySelector('span') : null;
                const edMark = document.querySelector('#rich-editor mark');
                return {
                    cardBg: cardMark ? getComputedStyle(cardMark).backgroundColor : null,
                    cardColor: cardSpan ? getComputedStyle(cardSpan).color : null,
                    edBg: edMark ? getComputedStyle(edMark).backgroundColor : null
                };
            }""")
            assert res["cardBg"] == "rgb(187, 247, 208)", f"Card multi-color mark bg overridden to yellow! {res}"
            assert res["cardColor"] == "rgb(239, 68, 68)", f"Card colored text inside mark overridden! {res}"
            assert res["edBg"] == "rgb(187, 247, 208)", f"Editor multi-color mark bg overridden! {res}"
        run_case("T4.9 Multi-color highlighter renders true background & inner text color (no !important hijack)", t4_9)

        def t4_10():
            reset_app_state(page, [{
                "id": "n_bold_clear",
                "label": "加粗与清除测试",
                "content": 'Observation is key and <span class="font-handwriting">手写词</span>',
                "x": 360, "y": 280, "fx": 360, "fy": 280, "parentId": None
            }])
            res = page.evaluate("""() => {
                const ed = document.getElementById("rich-editor");
                ed.focus();
                // Place collapsed caret inside "Observation"
                const txtNode = ed.firstChild;
                const r = document.createRange();
                r.setStart(txtNode, 4);
                r.setEnd(txtNode, 4);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(r);
                applyFormatting("bold");
                const boldEl = ed.querySelector("b, strong");
                const stroke = boldEl ? getComputedStyle(boldEl).webkitTextStrokeWidth : "";
                const mdAfterBold = nodes[0].content;

                // Now select inside .font-handwriting and click clear
                const hw = ed.querySelector(".font-handwriting");
                const r2 = document.createRange();
                r2.selectNodeContents(hw);
                sel.removeAllRanges();
                sel.addRange(r2);
                applyFormatting("clear");
                const hasHwAfterClear = !!ed.querySelector(".font-handwriting");
                return { boldText: boldEl ? boldEl.textContent : null, stroke, mdAfterBold, hasHwAfterClear };
            }""")
            assert res["boldText"] == "Observation", f"Word bold on collapsed caret failed: {res}"
            assert "**Observation**" in res["mdAfterBold"], f"Bold not serialized to Markdown: {res}"
            assert res["stroke"] and res["stroke"] != "0px", f"DirectWrite faux-bold stroke missing: {res}"
            assert not res["hasHwAfterClear"], f"Inline clear did not unwrap .font-handwriting! {res}"
        run_case("T4.10 Rich-editor word bold (with DirectWrite stroke) & inline clear unwrap handwriting", t4_10)

        def t4_11():
            res = page.evaluate("""() => {
                localStorage.removeItem("flownotes_theme");
                initTheme();
                const defTheme = document.documentElement.getAttribute("data-theme");
                toggleTheme();
                const afterToggle = document.documentElement.getAttribute("data-theme");
                toggleTheme();
                const backToLight = document.documentElement.getAttribute("data-theme");
                return { defTheme, afterToggle, backToLight };
            }""")
            assert res["defTheme"] == "light" and res["afterToggle"] == "dark" and res["backToLight"] == "light", f"Theme regression: {res}"
        run_case("T4.11 Default Light Theme & persistent light <-> dark toggle work cleanly", t4_11)

        browser.close()

    httpd.shutdown()

    passed = sum(1 for _, ok, _ in results if ok)
    failed = sum(1 for _, ok, _ in results if not ok)
    print(f"\n==========================================")
    print(f"FORTRESS REGRESSION SUMMARY: {passed}/{len(results)} PASSED, {failed} FAILED")
    if console_errors:
        print(f"PAGE ERRORS ({len(console_errors)}): {console_errors}")
    print(f"==========================================")
    sys.exit(0 if failed == 0 and not console_errors else 1)


if __name__ == "__main__":
    run_all_tests()
