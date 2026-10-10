# DEPLOY-EXEC-2026-001 — handoff（結案，2026-10-10）

**一句話**：前端（ITP 7 檔）2026-10-07 上線；後端 DOCX 路徑防護 2026-10-09 12:14:09Z 上線。原定預檢 r3 因材料上線後基準改變而未執行，改以唯讀核對＋Python 3.11 測試＋備份取代（未經獨立審查）。程式已合併進 main。

- 前一版 handoff（PARTIAL）逐字封存為 `DEPLOY-EXEC-2026-001-PARTIAL-handoff-archive.md`。
- 後端紀錄：`DEPLOY-EXEC-2026-001-docx-deploy-record.md`；回退：NAS `~/deploy-docx-20261009T115405Z/rollback.sh` 或映像 `qualitas-backend:pre-docx-20261009T115405Z`。
- 待使用者：登入後唯讀冒煙（ITP 畫面、既有紀錄 DOCX 匯出）。
