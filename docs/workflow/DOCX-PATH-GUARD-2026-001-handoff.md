# DOCX-PATH-GUARD-2026-001 — handoff（待獨立審查）

**一句話**：`resolve_local_upload_path` 改用 `realpath` 後 `commonpath` 判斷是否在上傳根目錄內，同前綴兄弟目錄
（`..` 或 symlink）不再被放行；修復前 9 項失敗、修復後 32 項全過；未提交、未部署。

## 審查請看
1. 產品 diff：`DOCX-PATH-GUARD-2026-001-evidence/docx_builder.diff`（1 個函式，5 行）。
2. 測試：`backend/tests/test_docx_path_guard.py`（直接測正式 helper＋正式 `add_photo_section`）、
   `backend/tests/test_docx_path_guard_http.py`（隔離 HTTP，ITR／NCR 更新→匯出）。
3. 前後對照：`pytest-before-fix.txt`（9 failed，原因皆為放行／嵌入）→ `pytest-after-fix.txt`（32 passed）。
   兩份檔頭都有 HEAD、Python 版本、三個檔案的 SHA-256；兩次之間只有 `docx_builder.py` 雜湊不同。
4. 第 1 次修復前執行（`pytest-before-fix-attempt1-itr-fixture-bug.txt`）因 ITR 測試資料缺欄位而失敗於回應驗證，
   **不是**洩漏證據；已修正測試資料並重跑，第 1 次的輸出照原樣保留。
5. 文件更正：`BACKLOG.md` #53、`NOI-EXPORT-DOCX-2026-001-REVIEW-2026-10-07.md` 檔尾（原文本體雜湊未變）。

## 請判斷
- `commonpath` 在 `ValueError` 時拒絕是否足夠（例如不同磁碟機的 Windows 路徑；本系統部署於 Linux 容器）。
- 新測試是否足以保證「正常匯出不退化」，或需另跑既有匯出驗收腳本。
- 修復何時部署（需使用者決定；部署屬後端更新，需重建 backend 容器）。

## 不在本任務
- NOI 匯出任務的兩項 REQUIRED_FIXES（仍 REVISE）。
- ITP 英文必填與 BACKLOG #36 的衝突（待使用者決策）。
- 正式環境同前綴目錄檢查；手機版（延期）。

## 環境
未操作正式站／NAS／8240／3240／8198／3198／開發資料庫；8240／3240 仍保留。未提交、未推送。
