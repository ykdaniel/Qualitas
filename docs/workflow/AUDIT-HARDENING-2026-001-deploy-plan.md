# AUDIT-HARDENING A＋B — 部署計畫與紀錄

範圍：`AUDIT-HARDENING-A-2026-001`（後端，獨立審查 PASS）＋`AUDIT-HARDENING-B-2026-001`（前端＋後端 Void 鎖，獨立審查 PASS）。
審查者：獨立 Claude 審查代理（GPT 額度用盡，使用者 2026-10-09 於對話中指定）。部署授權：DECISIONS 的「PASS 後提交、推送、部署」持續授權。
產物（本機）：`~/Documents/Qualitas-deploy-artifacts/AUDIT-HARDENING-2026-001/`；NAS 工作目錄：`~/deploy-audit-hardening-20261009T122621Z`（700）。

## 1. 正式站唯讀核對（2026-10-09，部署前）
- 後端原始碼：NAS `backend/` 中 HEAD（52986ac2）的所有產品 `.py` 都與 HEAD 相同（只有 4 個驗證腳本不同，不影響執行）。本次要換的 5 個檔案在 NAS 上的雜湊＝HEAD（`old-backend.sha256`）。
- **DOCX**：NAS 上的 `core/docx_builder.py` 已是 DOCX 路徑防護版本（`0e43664f…`），修改時間為 2026-10-09 19:54（台北）。執行中的映像是否已包含 DOCX，未核對（需要 sudo）。使用者在對話中同意：這次重建若連帶讓 DOCX 上線，可以接受（DOCX 已審查 PASS、已合併到 main，也包含在下面的 3.11 完整測試中）。
- 前端：正式站 `/index.html` 的 SHA-256 為 `4f71ef9f…3a5e`，和用 HEAD 乾淨匯出建置的結果相同，所以正式站前端＝HEAD。
- 資料（在備份檔上做唯讀查詢，結果見 `prod-readonly-precheck.txt`）：Audit 共 2 筆，都是 Draft；沒有空白的 auditNo；沒有格式錯誤或順序顛倒的日期；有 1 筆只有專案名稱、名稱對得上某個專案（下次存檔時會補上 `project_id`）。

## 2. 產物
- 後端覆蓋包：5 個檔案（`audit_service.py`、`routers/audit.py`、`schemas.py`、`core/strict_dates.py`、`core/utils.py`）。新舊雜湊見 `backend-overlay-manifest.txt`；`backend-overlay.tgz` 的 SHA-256 為 `b8c247a3…e4a2`。
- 前端候選：乾淨匯出 HEAD 的 react-app，放入 B 批的 5 個前端檔後建置，共 106 個檔案。index 的 SHA-256 為 `486f4964…d1ce`；`frontend-candidate.tgz` 為 `de1a69c2…9e40`。CSS 和正式站相同；新增 66 個資產（主程式碼塊含翻譯，雜湊改變後，引用它的程式碼塊也跟著換名）。
- 沒有 migration、沒有資料表結構變更，所以不需要做升級／回退演練，回退也不需要動資料庫。

## 3. 準備（已完成，`nas-prep-output.txt`）
- 線上的 5 個檔案仍是舊版。
- SQLite 線上備份 `qualitas-pre-audit-hardening.db`：integrity ok，SHA-256 `ca67e5f4…874f`。
- 舊檔備份 `backend-old/`。
- 前端舊入口 `frontend-index-pre-audit-hardening.html`，部署前清單 243 個檔案。
- 上傳雜湊相符；暫存區後端 5 個檔、前端 106 個檔逐一核對 OK。

## 4. 切換順序
先部署後端：B 的前端在舊後端上，第二次存檔時會清空編號（A 修的問題）。
1. Claude：`sh apply-backend.sh <TS>`。先確認線上仍是舊版，再把 5 個檔案複製進 `backend/` 並核對（不需要 sudo，執行中的容器不受影響）。
2. **使用者**（需要 sudo）：在自己的終端機執行。這一步會先記錄容器內 `docx_builder.py` 的雜湊、標記回退映像，再重建後端並列出容器狀態：
   `ssh -t ykdaniel@192.168.15.100 "cd /volume1/docker/Qualitas && sudo /usr/local/bin/docker exec qualitas-backend sha256sum /app/core/docx_builder.py /app/services/audit_service.py; sudo /usr/local/bin/docker tag qualitas-backend:latest qualitas-backend:pre-audit-hardening-20261009T122621Z && sudo /usr/local/bin/docker-compose up -d --build backend && sudo /usr/local/bin/docker ps -a | grep qualitas"`
3. Claude：讀 `backend/logs/app.log`，確認啟動和 migration 正常；對外檢查 `/api/user/profile` 未登入回 401。
4. Claude：`sh apply-frontend.sh <TS>`。只新增資產，不覆寫也不刪除既有資產，最後在同一個目錄用 `mv` 原子替換 `index.html`；dist 的 inode 不變。
5. Claude：對外核對 `/`、`index.html` 和新資產的雜湊；舊資產仍然回 200。
6. **使用者**：登入後做唯讀冒煙，**不新增業務資料**。打開 Audit 頁，打開既有紀錄看狀態下拉、專案下拉是否正常，然後不要存檔，直接關閉。

## 5. 回退
- 前端：`sh rollback-frontend.sh <TS>`（舊資產一直保留）。
- 後端，快：`sudo docker tag qualitas-backend:pre-audit-hardening-20261009T122621Z qualitas-backend:latest && sudo docker-compose up -d backend`（compose 會用這個 tag 起容器）。或者，穩：`sh rollback-backend-code.sh <TS>` 之後由使用者重建。
- 資料庫：不需要（沒有結構變更）。只有證實資料損毀時才考慮還原 `qualitas-pre-audit-hardening.db`，而且會遺失切換後的所有寫入，必須由使用者決定。

## 6. 執行紀錄
（部署時填寫）
