import fitz, json, sys, os, base64, random, time

sys.stdout.reconfigure(encoding='utf-8')

pdf_path = r"C:\Users\qchen\OneDrive - Professional Compounding Centers of America, Inc\Desktop\1.pdf"
desktop_out = r"C:\Users\qchen\OneDrive - Professional Compounding Centers of America, Inc\Desktop\1.excalidraw"
local_out = r"c:\Users\qchen\OneDrive - Professional Compounding Centers of America, Inc\Documents\Flownotes\public\1.excalidraw"

doc = fitz.open(pdf_path)
page = doc[0]

# 我们将坐标按比例缩放，使得在大画布上展开清晰可见
SCALE = 3.6
OFFSET_X = 120
OFFSET_Y = 100

def gen_id():
    chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    return "".join(random.choice(chars) for _ in range(20))

def estimate_text_dims(text, font_size, line_height=1.35):
    lines = text.split("\n")
    max_w = 0
    for l in lines:
        line_w = 0
        for ch in l:
            if ord(ch) > 127:
                line_w += font_size * 1.05 # 中文字符宽度
            else:
                line_w += font_size * 0.62 # 英文字符宽度
        if line_w > max_w:
            max_w = line_w
    h = len(lines) * font_size * line_height
    return max(40, round(max_w + 12, 1)), max(24, round(h + 8, 1))

files_dict = {}
elements = []
now_ts = int(time.time() * 1000)

# 1. 提取图片
image_map = {}
for i, img_info in enumerate(page.get_images()):
    xref = img_info[0]
    pix = fitz.Pixmap(doc, xref)
    if pix.n >= 5:
        pix = fitz.Pixmap(fitz.csRGB, pix)
    img_bytes = pix.tobytes("png")
    b64_str = base64.b64encode(img_bytes).decode("ascii")
    data_url = f"data:image/png;base64,{b64_str}"
    
    file_id = f"img_file_{xref}_{i}"
    files_dict[file_id] = {
        "mimeType": "image/png",
        "id": file_id,
        "dataURL": data_url,
        "created": now_ts
    }
    
    rects = page.get_image_rects(xref)
    if rects:
        r = rects[0]
        w = (r.x1 - r.x0) * SCALE
        h = (r.y1 - r.y0) * SCALE
        x = r.x0 * SCALE + OFFSET_X
        y = r.y0 * SCALE + OFFSET_Y
        
        img_el = {
            "id": gen_id(),
            "type": "image",
            "x": round(x, 1),
            "y": round(y, 1),
            "width": round(w, 1),
            "height": round(h, 1),
            "angle": 0,
            "strokeColor": "transparent",
            "backgroundColor": "transparent",
            "fillStyle": "solid",
            "strokeWidth": 1,
            "strokeStyle": "solid",
            "roughness": 0,
            "opacity": 100,
            "groupIds": [],
            "frameId": None,
            "roundness": {"type": 3},
            "seed": random.randint(10000, 99999),
            "version": 1,
            "versionNonce": random.randint(10000, 99999),
            "isDeleted": False,
            "boundElements": [],
            "updated": now_ts,
            "link": None,
            "locked": False,
            "fileId": file_id,
            "status": "saved",
            "scale": [1, 1]
        }
        elements.append(img_el)
        image_map[xref] = img_el

# 2. 提取矢量图形 (高亮黄色背景与箭头)
drawings = page.get_drawings()
yellow_rects = []
for d in drawings:
    fill = d.get("fill")
    color = d.get("color")
    rect = d.get("rect")
    items = d.get("items", [])
    
    # 检测黄色荧光笔矩形
    if fill and fill[0] > 0.8 and fill[1] > 0.8 and fill[2] < 0.3 and rect:
        yellow_rects.append(rect)
        rx = rect.x0 * SCALE + OFFSET_X - 6
        ry = rect.y0 * SCALE + OFFSET_Y - 4
        rw = (rect.x1 - rect.x0) * SCALE + 12
        rh = (rect.y1 - rect.y0) * SCALE + 8
        elements.insert(0, {
            "id": gen_id(),
            "type": "rectangle",
            "x": round(rx, 1),
            "y": round(ry, 1),
            "width": round(rw, 1),
            "height": round(rh, 1),
            "angle": 0,
            "strokeColor": "transparent",
            "backgroundColor": "#fff3bf",
            "fillStyle": "solid",
            "strokeWidth": 1,
            "strokeStyle": "solid",
            "roughness": 0,
            "opacity": 75,
            "groupIds": [],
            "frameId": None,
            "roundness": {"type": 3},
            "seed": random.randint(10000, 99999),
            "version": 1,
            "versionNonce": random.randint(10000, 99999),
            "isDeleted": False,
            "boundElements": [],
            "updated": now_ts,
            "link": None,
            "locked": False
        })
    
    # 检测黑色主干箭头线条（过滤掉 <= 20px 的箭头小尖角线段，防止误生成多余随机箭头）
    if color and color[0] < 0.2 and color[1] < 0.2 and color[2] < 0.2:
        for it in items:
            if it[0] == "l" and len(it) == 3:
                p1, p2 = it[1], it[2]
                dx = (p2.x - p1.x) * SCALE
                dy = (p2.y - p1.y) * SCALE
                if abs(dx) + abs(dy) > 22:
                    elements.append({
                        "id": gen_id(),
                        "type": "arrow",
                        "x": round(p1.x * SCALE + OFFSET_X, 1),
                        "y": round(p1.y * SCALE + OFFSET_Y, 1),
                        "width": round(abs(dx), 1) or 1,
                        "height": round(abs(dy), 1) or 1,
                        "angle": 0,
                        "strokeColor": "#1e1e1e",
                        "backgroundColor": "transparent",
                        "fillStyle": "solid",
                        "strokeWidth": 2,
                        "strokeStyle": "solid",
                        "roughness": 1,
                        "opacity": 100,
                        "groupIds": [],
                        "frameId": None,
                        "roundness": None,
                        "seed": random.randint(10000, 99999),
                        "version": 1,
                        "versionNonce": random.randint(10000, 99999),
                        "isDeleted": False,
                        "boundElements": [],
                        "updated": now_ts,
                        "link": None,
                        "locked": False,
                        "points": [[0, 0], [round(dx, 1), round(dy, 1)]],
                        "lastCommittedPoint": None,
                        "startBinding": None,
                        "endBinding": None,
                        "startArrowhead": None,
                        "endArrowhead": "arrow"
                    })

def split_block_into_logical_subblocks(b):
    """将 PyMuPDF 误合并的不同列/同行远距文本拆分为独立的逻辑卡片块，并合并同行紧邻序号(如 '1.' + 正文)"""
    raw_lines = b.get("lines", [])
    if not raw_lines:
        return []
    # 先合并同一水平行 (y0 相差 < 1.5pt) 且水平间距 < 15pt 的行（如 '1.' 与右侧正文，或日期与时间）
    sorted_lines = sorted(raw_lines, key=lambda l: (round(l["bbox"][1], 1), l["bbox"][0]))
    merged_lines = []
    for line in sorted_lines:
        if merged_lines:
            prev = merged_lines[-1]
            same_y = abs(line["bbox"][1] - prev["bbox"][1]) < 1.5
            gap_x = max(line["bbox"][0], prev["bbox"][0]) - min(line["bbox"][2], prev["bbox"][2])
            if same_y and gap_x < 15:
                # 同一行内的相邻片段，按 x0 排序合并 spans
                combined_spans = sorted(prev["spans"] + line["spans"], key=lambda s: s["bbox"][0])
                # 如果两个英文/数字片段之间有明显间距（如日期与时间），补一个空格
                fixed_spans = []
                for idx_s, sp in enumerate(combined_spans):
                    sp_copy = dict(sp)
                    if idx_s > 0:
                        prev_sp = fixed_spans[-1]
                        sp_gap = sp_copy["bbox"][0] - prev_sp["bbox"][2]
                        if sp_gap > 1.5 and not prev_sp["text"].endswith(" ") and not sp_copy["text"].startswith(" "):
                            sp_copy["text"] = " " + sp_copy["text"]
                    fixed_spans.append(sp_copy)
                prev["spans"] = fixed_spans
                prev["bbox"] = [
                    min(prev["bbox"][0], line["bbox"][0]),
                    min(prev["bbox"][1], line["bbox"][1]),
                    max(prev["bbox"][2], line["bbox"][2]),
                    max(prev["bbox"][3], line["bbox"][3])
                ]
                continue
        merged_lines.append({
            "bbox": list(line["bbox"]),
            "spans": [dict(s) for s in line["spans"]]
        })

    # 再按列拆分：如果下一行的 x0 与上一行相差 > 20pt（属于不同列），或同行但水平距离 >= 15pt，拆为独立卡片
    sub_blocks = []
    curr_lines = []
    for line in merged_lines:
        if curr_lines:
            prev = curr_lines[-1]
            same_y = abs(line["bbox"][1] - prev["bbox"][1]) < 1.5
            x_jump = abs(line["bbox"][0] - curr_lines[0]["bbox"][0])
            if same_y or x_jump > 20:
                sub_blocks.append(curr_lines)
                curr_lines = [line]
                continue
        curr_lines.append(line)
    if curr_lines:
        sub_blocks.append(curr_lines)
    return sub_blocks

# 3. 提取文字块
text_dict = page.get_text("dict")
for b in text_dict["blocks"]:
    if b["type"] == 0:
        for sub_lines in split_block_into_logical_subblocks(b):
            lines_text = []
            lines_html = []
            is_red = False
            is_green = False
            is_gray = False
            max_font_size = 3.1
            sub_bbox = [
                min(l["bbox"][0] for l in sub_lines),
                min(l["bbox"][1] for l in sub_lines),
                max(l["bbox"][2] for l in sub_lines),
                max(l["bbox"][3] for l in sub_lines)
            ]

            for line in sub_lines:
                line_str = ""
                line_html_parts = []
                for span in line["spans"]:
                    c = span["color"]
                    r = (c >> 16) & 255
                    g = (c >> 8) & 255
                    b_col = c & 255
                    raw_s = span["text"]
                    line_str += raw_s
                    
                    safe_s = raw_s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                    # 检测该 span 是否覆盖了黄色荧光笔高亮区域
                    sb = span.get("bbox", sub_bbox)
                    has_yellow_hl = False
                    for yr in yellow_rects:
                        overlap_x = min(sb[2], yr.x1) - max(sb[0], yr.x0)
                        overlap_y = min(sb[3], yr.y1) - max(sb[1], yr.y0)
                        if overlap_x > 4 and overlap_y > 1:
                            has_yellow_hl = True
                            break

                    if has_yellow_hl and "（" in safe_s:
                        # 精准高亮英文短语部分（如 ==shotgun metagenomic sequencing==（宏基因组鸟枪法测序））
                        en_part, zh_part = safe_s.split("（", 1)
                        safe_s = f"=={en_part}==（{zh_part}"
                    elif has_yellow_hl:
                        safe_s = f"=={safe_s}=="

                    if r > 160 and g < 100 and b_col < 100:
                        is_red = True
                        line_html_parts.append(f'<span style="color:#ef4444">{safe_s}</span>')
                    elif g > 120 and r < 100 and b_col < 120:
                        is_green = True
                        line_html_parts.append(f'<span style="color:#10b981">{safe_s}</span>')
                    elif b_col > 160 and r < 100 and g < 150:
                        line_html_parts.append(f'<span style="color:#38bdf8">{safe_s}</span>')
                    else:
                        line_html_parts.append(safe_s)

                    if span["size"] > max_font_size:
                        max_font_size = span["size"]
                lines_text.append(line_str)
                lines_html.append("".join(line_html_parts))
            
            raw_joined_check = "\n".join(lines_text).strip()
            if not raw_joined_check or "New Section 1 Page 1" in raw_joined_check:
                continue

            # 区分「显式多行列表/双语对照」与「OneNote 文本框自动折行句子」：
            # 如果是自动折行的完整句子，合并为连续流式文本（不插入死换行 \n），使左右拉动框宽时能 100% 自由重排换行！
            has_explicit_linebreaks = (
                len(lines_text) > 1 and (
                    any(l.strip().startswith(("1.", "2.", "3.", "- ", "•")) for l in lines_text[1:]) or
                    (len(lines_text) == 2 and lines_text[0].strip() == "混杂变量")
                )
            )

            if has_explicit_linebreaks:
                full_text = "\n".join(lines_text).strip()
                full_html = "\n".join(lines_html).strip()
            else:
                # 流式拼接：若上一行以英文字母结尾且下一行以英文字母开头，补一个空格，否则直接无缝拼接中文
                full_text = lines_text[0]
                full_html = lines_html[0]
                for idx_l in range(1, len(lines_text)):
                    prev_t = lines_text[idx_l - 1]
                    curr_t = lines_text[idx_l]
                    need_space = (
                        prev_t and curr_t and
                        prev_t[-1].isascii() and prev_t[-1].isalnum() and
                        curr_t[0].isascii() and curr_t[0].isalnum()
                    )
                    sep = " " if need_space else ""
                    full_text += sep + curr_t
                    full_html += sep + lines_html[idx_l]
                full_text = full_text.strip()
                full_html = full_html.strip()

            bbox = sub_bbox
            x = bbox[0] * SCALE + OFFSET_X
            y = bbox[1] * SCALE + OFFSET_Y
            pdf_box_w = round((bbox[2] - bbox[0]) * SCALE, 1)
            
            # 颜色映射 (标题用蓝，其他默认中性，具体文字颜色由 richHtml 内嵌)
            stroke_color = "#1e1e1e"
            if is_red:
                stroke_color = "#e03131"
            elif is_green:
                stroke_color = "#2f9e44"
            elif is_gray:
                stroke_color = "#868e96"
                
            font_size = 16
            if max_font_size > 4.5:
                font_size = 28 # 大标题 AI Biologist
                stroke_color = "#1971c2"
            elif max_font_size < 3.0:
                font_size = 13
            elif len(full_text) > 40:
                font_size = 15
                
            est_w, est_h = estimate_text_dims(full_text, font_size)
            # 若原 OneNote 框有软折行 (len(lines_text) > 1 且非显式列表)，记录原 OneNote 框宽度供还原折行比例
            is_soft_wrapped = (len(lines_text) > 1 and not has_explicit_linebreaks)
            calc_w = round(max(64, pdf_box_w + 36), 1) if is_soft_wrapped else est_w
            calc_h = round(max(28, (bbox[3] - bbox[1]) * SCALE + 16), 1) if len(lines_text) > 1 else est_h
            
            elements.append({
                "id": gen_id(),
                "type": "text",
                "x": round(x, 1),
                "y": round(y, 1),
                "width": calc_w,
                "height": calc_h,
                "angle": 0,
                "strokeColor": stroke_color,
                "backgroundColor": "transparent",
                "fillStyle": "solid",
                "strokeWidth": 1,
                "strokeStyle": "solid",
                "roughness": 0,
                "opacity": 100,
                "groupIds": [],
                "frameId": None,
                "roundness": None,
                "seed": random.randint(10000, 99999),
                "version": 1,
                "versionNonce": random.randint(10000, 99999),
                "isDeleted": False,
                "boundElements": [],
                "updated": now_ts,
                "link": None,
                "locked": False,
                "text": full_text,
                "customData": {
                    "richHtml": full_html,
                    "softWrapped": is_soft_wrapped,
                    "preferredWidth": calc_w if is_soft_wrapped else None
                },
                "fontSize": font_size,
                "fontFamily": 1,
                "textAlign": "left",
                "verticalAlign": "top",
                "baseline": round(font_size * 0.9, 1),
                "containerId": None,
                "originalText": full_text,
                "lineHeight": 1.35
            })

excalidraw_data = {
    "type": "excalidraw",
    "version": 2,
    "source": "https://flownotes-eze.pages.dev",
    "elements": elements,
    "appState": {
        "viewBackgroundColor": "#ffffff",
        "gridSize": None
    },
    "files": files_dict
}

with open(desktop_out, "w", encoding="utf-8") as f:
    json.dump(excalidraw_data, f, ensure_ascii=False, indent=2)

with open(local_out, "w", encoding="utf-8") as f:
    json.dump(excalidraw_data, f, ensure_ascii=False, indent=2)

print(f"Generated {len(elements)} elements, {len(files_dict)} images.")
print(f"Saved to Desktop: {desktop_out}")
print(f"Saved to Project: {local_out}")
