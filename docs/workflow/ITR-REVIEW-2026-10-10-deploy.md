# ITR-REVIEW-2026-10-10 — ITR 模組檢查修正上線紀錄

日期：2026-10-10（UTC；台灣時間 2026-10-11 凌晨）。執行：Claude（「ITR模組檢查」工作階段）。
授權：使用者在對話中直接指示「前三個部署」（NOI 那批先送審、不部署）。推送由協調中心（「調度中心 登入測試」）處理，使用者同意此分工。

## 上線範圍

| 提交 | 內容 | 獨立審查 |
|---|---|---|
| `3665860e` | ITR 已存附件重開後看不到（BACKLOG #23 的 ITR 根因）；Print／收合後待上傳檔案消失；共用 FileAttachment 預覽網址提早被釋放 | 獨立 Claude 審查 PASS |
| `5b2c67e3` | ITR 寫入保護 #3–#8：空狀態、Void 鎖定、複驗欄位由系統管理、NOI／NCR 引用檢查資料範圍與 Closed／Void NOI、關聯文件圖套用範圍（ITR／NOI／ITP）、同一 ITR 只能有一張進行中 NCR、被 NCR／OBS 引用的 ITR 不可刪 | R1 REVISE → R2 PASS |
| `4bdc49ec` | ITR 畫面：Checklist 有未存內容時擋 Save／Publish；新 ITR 第一次存檔後不關視窗 | 獨立 Claude 審查 PASS |

GPT 無額度，審查由不帶對話脈絡的獨立 Claude 審查代理執行（與 Audit 各批同樣做法）。
**不含** NOI 的 `127d187e`、`b13b8dff`（審查 PASS，但使用者指示這次不部署；已排在 ITR、AUDIT-PRINT 之後）。

## 準備與驗證

- 候選：`git archive 4bdc49ec`（不是工作樹；工作樹有其他工作階段未提交、未審的修改）。
- Python 3.11 完整測試（官方 `python:3.11-slim`，repo 版面 `/q/backend` + `/q/react-app`）：**2411 passed、16 skipped，pytest_exit=0**（`py311-full-suite.txt`）。比 AUDIT-EXPORT-DOCX 那次的 2379 多 32，正好是新增的 `test_itr_integrity_guards_http.py`。
- 前端候選：從乾淨匯出建置；原始碼與上一版正式候選（AUDIT-EXPORT-DOCX `cand3`）逐檔比對，只差本批 5 個前端檔（ITR.tsx、ITRModals.tsx、ChecklistSnapshotModal.tsx、Shared/FileAttachment.tsx、LanguageContext.tsx）。候選 index `8b0d19c9…91bd`，106 檔。
- 後端只換 4 檔：`services/itr_service.py`、`routers/itr.py`、`routers/noi.py`、`routers/itp.py`（`old-backend.sha256` = `688d87b3` 版，`new-backend.sha256` = `4bdc49ec` 版）。無資料庫結構變更。
- 正式站唯讀預檢（`precheck-output.txt`）：線上 4 檔 = `688d87b3`；線上 index = `cd426c4f…`（AUDIT-EXPORT-DOCX）。
- 協調：「Audit」工作階段有一份以 `688d87b3` 為基準、未切換的 AUDIT-PRINT 前端候選；已通知對方作廢並在 ITR 上線後以 `4bdc49ec` 重建。協調中心確認 NAS 無其他暫存或套用中的部署後才開始。

## 上線紀錄

- NAS 工作目錄：`~/deploy-itr-review-20261010T163551Z`。
- 準備（`nas-prep-output.txt`）：資料庫線上備份 `qualitas-pre-itr-review.db`，integrity ok（`5da6bdc2…`）；`backend-old/` 4 檔；前端舊入口；暫存區後端 4 檔、前端 106 檔逐檔 OK，無 `._` 檔。
- 後端：套用 4 檔（`apply-backend-output.txt`）。
  - 第一次 sudo 重建因密碼提示逾時沒有執行（`sudo: timed out reading password`；docker tag 與重建皆未執行）；第二次成功。
  - 回退映像：`qualitas-backend:pre-itr-review-20261010T163551Z`。新映像 `sha256:6038a80b52a2…`。
  - 新容器 `8c348e36d7c8` 於 **2026-10-10 17:06:48Z** 啟動，第 162 次啟動紀錄（部署前 161）。啟動時自動備份 `qualitas_20261010_170648.db`，migration 完成，權限同步 72 項，排程啟動，日誌 0 個 ERROR／Traceback（`backend-startup-check.txt`）。三個容器都是 Up。
- 前端：17:07Z 新增 66 個資產（另有 39 個原本就有），之後原子替換 `index.html`；dist inode（376368）未變；106 個候選檔全部在線上（`apply-frontend-output.txt`）。
- 對外核對（`post-deploy-http-check.txt`）：`/`、`/index.html` 200，雜湊 `8b0d19c9…91bd` = 候選；新主 bundle、ITR chunk、FileAttachment chunk、CSS 皆 200；上一版主 bundle 仍 200；未登入 `/api/user/profile`、`/api/itr/x/related` 皆 401。

## 回退

- 前端：`sh ~/deploy-itr-review-20261010T163551Z/rollback-frontend.sh 20261010T163551Z`（還原上一版 index；舊資產從未刪除）。
- 後端：`rollback-backend-code.sh` 還原 4 檔後由使用者重建；或 `sudo docker tag qualitas-backend:pre-itr-review-20261010T163551Z qualitas-backend:latest && sudo docker-compose up -d backend`。
- 無資料庫結構變更；部署前線上備份在 NAS 工作目錄。

## 未完成

- 登入後的唯讀冒煙由使用者執行（不新增資料）：打開一筆已有附件／照片的 ITR，確認附件區展開後看得到既有檔案、可點開預覽；打開一筆既有 ITR 的 Checklist 面板改一個字但不存，按 ITR 的 Save，應出現「檢查表 … 還有未儲存的變更」提示且不送出（之後取消變更即可）。
- 協調中心轉告：Audit 的 3.11 完整測試中 `test_itr_state_protection_http.py` 的 re-inspect 並發測試偶發失敗一次（重跑 10 次皆過）；本批 3.11 測試此項通過。待評估是否有時序問題。
