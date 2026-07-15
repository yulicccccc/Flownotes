# ==========================================
# 心流笔记 -> Obsidian 自动转换器
# ==========================================

# 1. 配置路径
$jsonFile = "$HOME\Downloads\obsidian_graph_backup.json" # 你的下载路径
$vaultPath = "C:\Users\qchen\OneDrive - Professional Compounding Centers of America, Inc\Documents\Flownotes" # 修改为你Obsidian的路径

# 2. 检查源文件
if (-not (Test-Path $jsonFile)) {
    Write-Host "错误：未找到 backup.json，请确保文件已下载到下载文件夹。" -ForegroundColor Red
    return
}

# 3. 确保目标文件夹存在
if (-not (Test-Path $vaultPath)) {
    New-Item -ItemType Directory -Path $vaultPath -Force | Out-Null
}

# 4. 解析 JSON
$jsonData = Get-Content $jsonFile -Raw | ConvertFrom-Json
$nodes = $jsonData.nodes

# 5. 遍历并创建 Markdown 文件
foreach ($node in $nodes) {
    # 清理文件名中的非法字符 (例如 / \ : * ? " < > |)
    $safeFileName = $node.label -replace '[\\/:\*\?"<>|]', '_'
    $filePath = Join-Path $vaultPath "$safeFileName.md"
    
    # 写入内容
    # 如果 content 为空，默认写入标题
    $fileContent = if ([string]::IsNullOrWhiteSpace($node.content)) { "# $($node.label)" } else { $node.content }
    
    $fileContent | Set-Content -Path $filePath -Encoding UTF8
    Write-Host "已同步: $safeFileName.md" -ForegroundColor Green
}

# 6. 任务完成，自动打开文件夹
Write-Host "同步完成，正在打开 Obsidian 文件夹..." -ForegroundColor Cyan
explorer.exe $vaultPath
