# TASK.md — Checklist 返回原 ITP 編輯視窗

TASK_ID: ITP-CHECKLIST-RETURN-2026-001
SOURCE: 使用者於對話中直接交辦（2026-10-11 22:29）：「按 Back 就直接回到原本那份 ITP 的編輯視窗，可以改程式」。

## 前一任務
`DEPLOY-EXEC-2026-001`：已結案（2026-10-10），三份檔案封存為 `docs/workflow/DEPLOY-EXEC-2026-001-CLOSED-{TASK,STATUS,REVIEW}-archive.md`。

## 問題（現況，讀碼）
- ITP 編輯視窗（`/itp` 頁的 `ITPDetailModal`）中點 Records 的 Checklist 連結，或按 Generate Checklist，會導到 `/checklist?openId=<recordsNo>&from=itp`。
- Checklist 的 Back（`handleBack`）在 `from=itp` 時執行 `navigate(-1)`，回到 `/itp`；但 ITP 編輯視窗的開啟狀態不在網址中，回去只看到 ITP 列表，必須再點一次原 ITP。

## 範圍
1. 從 ITP 編輯視窗進入 Checklist 的兩個入口（Records 連結、Generate Checklist），網址多帶來源 ITP 的 id。
2. Checklist 的 Back：有來源 ITP id 時，回到 `/itp` 並自動重新開啟該 ITP 的編輯視窗；沒有時維持原行為。
3. 重新開啟的 ITP 視窗，關閉後停在 ITP 列表（不得沿用 `openId` 深連結「關閉即 navigate(-1)」的行為，否則會跳回 Checklist）。
4. 重新開啟時停在 Inspection Plan 分頁（兩個入口都在該分頁）；一般點開與 Add New 仍從 General Information 開始。（實作中發現並補入，屬同一需求「回到原本那份 ITP 的編輯視窗」。）

## 不在範圍
- `/itp/:id`（`ITPDetail` 頁）：該頁本身有獨立網址，`navigate(-1)` 已回到原頁，不改。
- ITR 來源（`from=itr`）的返回行為不改。
- 不改後端、不改資料。

## 驗收
- 型別檢查與建置通過；既有前端單元測試通過。
- 隔離環境實測：ITP 視窗 → Records 連結 → Checklist → Back，回到同一份 ITP 的編輯視窗；關閉該視窗後停在 ITP 列表。
- 既有 `?openId=` 深連結（例如從其他模組開 ITP）的關閉行為不變。

## 限制
獨立審查 PASS 前不合併、不部署。不混入其他未審變更。
