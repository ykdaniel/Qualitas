# TASK.md — docx 匯出共用附件路徑防護修復

TASK_ID: DOCX-PATH-GUARD-2026-001
SOURCE: GPT 核對 `docs/workflow/unrecorded-work-reconciliation-2026-10-07-review.md` 後交辦；使用者轉交。
前一任務：`NOI-EXPORT-DOCX-2026-001` 仍為 REVISE、未結案，控制文件已逐字保存，見
`docs/workflow/NOI-EXPORT-DOCX-2026-001-OPEN-2026-10-07.md`。

## 狀態
已交辦，Claude 執行中。

## 背景（已有本地重現）
`backend/core/docx_builder.py::resolve_local_upload_path` 以 `realpath` 後 `startswith(root)` 判斷是否在
上傳根目錄內，未補路徑分隔符。臨時目錄實驗（`docs/workflow/unrecorded-work-reconciliation-2026-10-07-evidence/docx_path_guard_probe*`）
證明：與上傳根目錄同前綴的兄弟目錄（`..` 或根目錄內 symlink 指向它）會被放行；ITR／NCR 匯出把結果交給
`add_photo_section` → `run.add_picture()`，圖片**內容**被嵌入 Word。NOI 只走 `add_file_list`（列檔名）。
不代表正式站已發生洩漏。

## SCOPE
1. 修正 `resolve_local_upload_path` 的目錄包含檢查：`realpath` 後以 `os.path.commonpath` 比對，或等價可靠方案；
   無法判定（例如 `commonpath` 拋例外）時拒絕。保留既有 URL 解析（`/api/files/download/`、`/uploads/`、
   相對路徑、去掉 query string）、正常附件、權限與資料範圍行為。
2. 新增 pytest 回歸測試，**直接呼叫正式 helper**（不測複製的候選函式）：正常相對路徑／下載網址／legacy
   `/uploads/` 路徑、空值、不存在檔案、目錄、同前綴兄弟目錄（`..` 與 symlink）、指向外部的 symlink。
3. 自建假圖片驗證：合法圖片仍能嵌入 Word；越界圖片不會嵌入（以 `word/media` 內容雜湊判定）。
4. 獨立隔離環境的 HTTP 路徑：具正常權限的帳號更新紀錄的照片欄位 → 呼叫匯出端點，確認實際呼叫端受保護；
   只用自建資料與假檔案。
5. 更正 BACKLOG #53 與原 NOI REVIEW 的風險描述：保留原文、附日期更正，明確區分 NOI 列檔名與 ITR／NCR
   內嵌圖片。**不**改判 NOI 任務。

## ALLOWED_PATHS
- `backend/core/docx_builder.py`（僅 `resolve_local_upload_path`）
- `backend/tests/`（新增測試檔）
- `BACKLOG.md`（#53 附日期更正）
- `docs/workflow/`（NOI REVIEW 保存副本附更正、本任務證據與 handoff）
- `TASK.md`／`STATUS.md`／`REVIEW.md`

## FORBIDDEN
- 其他 `docx_builder` helper 的簽名或行為；`itr_service.py`／`ncr_service.py`／`noi_service.py` 的匯出邏輯。
- 正式站、NAS、保留中的 8240／3240、使用者 8198／3198、開發資料庫。
- commit、push、部署；改寫歷史；stash／reset／checkout。
- ITP 英文必填規則（待使用者決策）；手機版（延期）。

## ACCEPTANCE_CRITERIA
1. 同前綴兄弟目錄（`..`、symlink）被拒絕；一般附件三種寫法仍可解析。
2. pytest 直接測正式 helper，涵蓋 SCOPE 2 全部情況，修復前應失敗、修復後通過。
3. 合法假圖片嵌入、越界假圖片不嵌入，以內容雜湊判定。
4. HTTP：更新 → 匯出路徑在隔離環境驗證，實際呼叫端不嵌入越界圖片、仍嵌入合法圖片。
5. 只跑本次相關測試；完整輸出、退出碼、版本識別（HEAD、相關檔案雜湊）全部保存，不以 tail／grep 截掉主要證據。
6. REVIEW.md 留待獨立審查。
