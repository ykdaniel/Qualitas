# TASK — Related Documents 點擊直接開啟該筆紀錄

TASK_ID: RELATED-DOCS-OPEN-2026-001
SOURCE: 使用者於對話中回報（2026-10-12 01:41）：NOI 視窗的 Related Documents 點 ITP 後只到 ITP 總清單，沒有直接進入該 ITP。
基準：`ui/sidebar-shell-preview` `5bba6665`（正式站實際使用的分支）。任務文件依前一輪做法放在 `docs/workflow/`，不覆寫根目錄控制檔。

## 問題（讀碼＋實測）
- `react-app/src/components/ui/RelatedDocuments.tsx` 預設點擊只 `navigate('/itp' | '/noi' | '/itr' | '/ncr')`，不帶要開的紀錄。
- `NOIDetailModal.tsx` 另以 `onOpen` 覆寫：只有 ITR 帶 `?openId=`，ITP／NCR 刻意維持「到列表」（10/05 提交 6fff14f8 的註解：當時只確認 ITR 有對應的 openId 處理）。
- 實際上 ITP（08/23 起）、NOI、NCR（06/04 起）、ITR 四個頁面都有 `?openId=<id>` 處理：清單載入後開啟該筆、移除參數、關閉時 `navigate(-1)` 回到來源頁。

## 範圍
1. `RelatedDocuments` 預設點擊改為 `<模組路徑>?openId=<id>`。
2. 移除 `NOIDetailModal` 的 `onOpen` 覆寫，改用預設（ITR 行為不變，ITP／NCR 改為直接開啟）；移除因此不再使用的 `useNavigate`。

## 不在範圍
- 關聯圖本身（後端 `related_service`）不改。關聯走訪只沿單一方向（上游或下游），目標模組必與來源模組不同，不會出現同模組跳轉。
- 關閉後回到來源頁的「列表」，不重新開啟來源紀錄視窗（與既有 openId 深連結一致）。

## 驗收
- tsc、vite build、前端單元測試通過；改動檔 ESLint 不新增問題。
- 隔離環境瀏覽器：NOI → 相關 ITP 開啟該 ITP；ITP → 相關 NOI 開啟該 NOI；關閉回來源頁；一般進入 /itp 不開視窗。
