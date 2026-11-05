# -*- coding: utf-8 -*-
"""
FlowNotes v3.7.0 — Windows PC 剪贴板实时快投推送器
功能：在 Windows 后台安静运行，检测到 Ctrl+C 复制新文字时，
自动通过加密 HTTPS 实时推送到 FlowNotes 云端通道，
iPad 上的 FlowNotes 瞬间弹出灵感快投胶囊，一键落入思维沙盘！

运行环境：纯 Python 3.x 标准库，零第三方依赖，无需管理员权限。
"""

import sys
import time
import json
import ctypes
import urllib.request
import urllib.error
from datetime import datetime

# 目标 FlowNotes 接收端 API
TARGET_API = "https://flownotes-eze.pages.dev/api/clipboard"

# Windows API 剪贴板常量
user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32
CF_UNICODETEXT = 13

def get_windows_clipboard():
    """使用 Windows 原生 Win32 API 高速读取系统剪贴板纯文本 (零依赖)"""
    if not user32.OpenClipboard(None):
        return ""
    try:
        handle = user32.GetClipboardData(CF_UNICODETEXT)
        if not handle:
            return ""
        data = kernel32.GlobalLock(handle)
        if not data:
            return ""
        try:
            text = ctypes.c_wchar_p(data).value
            return text or ""
        finally:
            kernel32.GlobalUnlock(handle)
    except Exception:
        return ""
    finally:
        user32.CloseClipboard()

def push_to_flownotes(text):
    """通过 HTTPS POST 推送至 FlowNotes 云端通道"""
    payload = {
        "text": text,
        "timestamp": int(time.time() * 1000),
        "source": "windows_pc",
        "id": f"win_{int(time.time()*1000)}"
    }
    data_bytes = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(
        TARGET_API,
        data=data_bytes,
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "User-Agent": "FlowNotes-WinSync/3.7.0"
        },
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=3.5) as resp:
            return resp.status == 200
    except Exception as e:
        # 网络波动不影响程序持续运行
        return False

def main():
    print("=" * 62)
    print("  🚀 FlowNotes v3.7.0 — Win-to-iPad 剪贴板实时快投助手")
    print(f"  📡 目标同步通道: {TARGET_API}")
    print("  ⚡ 状态: 正在后台监听 Windows 剪贴板... (按 Ctrl+C 退出)")
    print("=" * 62)
    print()

    last_text = get_windows_clipboard().strip()
    if last_text:
        print(f"[*] 启动初始化：已忽略当前已有剪贴板 ({len(last_text)} 字符)")

    while True:
        try:
            current_text = get_windows_clipboard().strip()
            # 只有当剪贴板变动，且长度大于 1 字符，且与上次不同时才推送
            if current_text and current_text != last_text:
                last_text = current_text
                now_str = datetime.now().strftime("%H:%M:%S")
                preview = current_text.replace("\r", " ").replace("\n", " ")
                if len(preview) > 35:
                    preview = preview[:35] + "..."

                # 执行推送
                success = push_to_flownotes(current_text)
                if success:
                    print(f"[{now_str}] ⚡ 已实时推送到 iPad: \"{preview}\" ({len(current_text)} 字符)")
                else:
                    print(f"[{now_str}] ⚠️ 推送重试中: \"{preview}\"")

            time.sleep(0.4)
        except KeyboardInterrupt:
            print("\n[*] FlowNotes 剪贴板同步已安全停止。")
            break
        except Exception as err:
            time.sleep(1.0)

if __name__ == "__main__":
    main()
