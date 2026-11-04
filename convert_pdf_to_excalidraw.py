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
for d in drawings:
    fill = d.get("fill")
    color = d.get("color")
    rect = d.get("rect")
    items = d.get("items", [])
    
    # 检测黄色荧光笔矩形
    if fill and fill[0] > 0.8 and fill[1] > 0.8 and fill[2] < 0.3 and rect:
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
    
    # 检测黑色线条/箭头
    if color and color[0] < 0.2 and color[1] < 0.2 and color[2] < 0.2:
        for it in items:
            if it[0] == "l" and len(it) == 3:
                p1, p2 = it[1], it[2]
                dx = (p2.x - p1.x) * SCALE
                dy = (p2.y - p1.y) * SCALE
                if abs(dx) + abs(dy) > 8:
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

# 3. 提取文字块
text_dict = page.get_text("dict")
for b in text_dict["blocks"]:
    if b["type"] == 0:
        lines_text = []
        lines_html = []
        is_red = False
        is_green = False
        is_gray = False
        max_font_size = 3.1
        
        for line in b["lines"]:
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
        
        full_text = "\n".join(lines_text).strip()
        full_html = "<br>".join(lines_html).strip()
        if not full_text:
            continue
        
        # 过滤页底无用页码
        if "New Section 1 Page 1" in full_text:
            continue
            
        bbox = b["bbox"]
        x = bbox[0] * SCALE + OFFSET_X
        y = bbox[1] * SCALE + OFFSET_Y
        
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
            
        calc_w, calc_h = estimate_text_dims(full_text, font_size)
        
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
            "customData": {"richHtml": full_html},
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
