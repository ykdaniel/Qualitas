# Qualitas 開發伺服器啟動腳本

Write-Host "正在啟動 Qualitas 開發伺服器..." -ForegroundColor Green
Write-Host ""

# 啟動 Python 後端 (ITP 等 CRUD API, port 8000)
Write-Host "啟動 Python 後端 (port 8000, ITP 等)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\backend'; Write-Host 'Python 後端運行在 http://localhost:8000' -ForegroundColor Green; python -m uvicorn main:app --reload --port 8000"

# 等待 2 秒
Start-Sleep -Seconds 2

# 啟動 Node 後端 (登入/驗證, port 3001)
Write-Host "啟動 Node 後端 (port 3001)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\backend'; Write-Host 'Node 後端運行在 http://localhost:3001' -ForegroundColor Green; npm start"

# 等待 2 秒
Start-Sleep -Seconds 2

# 啟動前端伺服器
Write-Host "啟動前端伺服器 (port 3000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\react-app'; Write-Host '前端伺服器運行在 http://localhost:3000' -ForegroundColor Green; npm run dev"

Write-Host ""
Write-Host "伺服器正在啟動中..." -ForegroundColor Cyan
Write-Host "請稍候幾秒後訪問: http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "按任意鍵關閉此視窗（伺服器將繼續在背景運行）..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
