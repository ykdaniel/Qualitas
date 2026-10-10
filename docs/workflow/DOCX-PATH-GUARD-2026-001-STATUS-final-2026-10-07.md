# STATUS.md — Claude 執行結果

TASK_ID: DOCX-PATH-GUARD-2026-001

## RESULT
- [x] DONE（待獨立審查）
- [ ] PARTIAL
- [ ] BLOCKED

## 本輪變更（全部為未提交的工作樹變更）
- **產品程式**：`backend/core/docx_builder.py::resolve_local_upload_path` 的目錄包含檢查由
  `full.startswith(root)` 改為 `os.path.commonpath([root, full]) == root`；`commonpath` 拋 `ValueError`
  （無法判定）時視為越界、回傳 None。URL 解析（`/api/files/download/`、`/uploads/`、相對路徑、去 query）
  與「必須是實際存在的檔案」條件不變。完整 diff：`docs/workflow/DOCX-PATH-GUARD-2026-001-evidence/docx_builder.diff`。
- **新測試**：
  - `backend/tests/test_docx_path_guard.py`：直接呼叫正式 helper 與正式 `add_photo_section`。共 30 個案例
    ＝29 個路徑案例＋1 個嵌入案例（加上下方 HTTP 2 個，合計 32）。路徑案例：一般
    相對／前導斜線／下載網址／含 query 的下載網址／legacy `/uploads/`／legacy 絕對網址／根內 `..`／根內 symlink
    （皆應解析）；同前綴兄弟目錄 6 種（`..`、`/uploads/..`、下載網址 `..`、多層 `..`、symlink 檔案、symlink 目錄）；
    外部 3 種；絕對路徑；空值 3 種；不存在 3 種；目錄 5 種；以及一個嵌入測試（合法假圖片嵌入、兄弟與外部假圖片
    不嵌入，以 `word/media` 內容 SHA-256 判定）。
  - `backend/tests/test_docx_path_guard_http.py`：隔離 HTTP（自建 SQLite 檔、`QUALITAS_UPLOAD_ROOT` 指向
    `tmp_path`、自產 1×1 PNG）。具 `itr/ncr:view:all`＋`update:all` 的帳號真實登入 → `PUT /api/itr/{id}`／
    `PUT /api/ncr/{id}/` 寫入照片欄位（一個根內、兩個指向同前綴兄弟目錄）→ `GET .../export-docx` → 斷言合法圖片
    已嵌入、越界圖片未嵌入。ITR 與 NCR 各一條。
- **文件**：
  - 前一任務控制文件逐字保存：`docs/workflow/NOI-EXPORT-DOCX-2026-001-{TASK,STATUS,REVIEW}-2026-10-07.md`
    （SHA-256 與覆寫前一致）；未結案說明 `docs/workflow/NOI-EXPORT-DOCX-2026-001-OPEN-2026-10-07.md`。
  - NOI REVIEW 保存副本檔尾附「2026-10-07 更正」，原文本體 SHA-256 仍為 `65aea023…ac63b199`（已重新計算確認）。
  - `BACKLOG.md` #53 原文後附日期更正，區分 NOI 列檔名與 ITR／NCR 內嵌圖片，嚴重度上調。
  - `TASK.md`、`REVIEW.md`（待審 stub）改為本任務。

## 實測（隔離，僅本次相關測試）
指令：`DATABASE_URL=sqlite:///:memory: python3 -m pytest tests/test_docx_path_guard.py tests/test_docx_path_guard_http.py -v -p no:cacheprovider`
（於 `backend/`；HEAD `056c245c`＋工作樹變更；Python 3.14.6）。完整輸出含退出碼與檔案雜湊，未經 tail／grep。

| 階段 | 證據檔 | 結果 | 退出碼 |
|---|---|---|---|
| 修復前，第 1 次 | `pytest-before-fix-attempt1-itr-fixture-bug.txt` | 9 failed／23 passed；**其中 ITR HTTP 失敗原因是測試資料缺 `submit` 欄位（回應驗證錯誤），不是洩漏** → 不作為修復前證據，僅保留 | 1 |
| 修復前，第 2 次（修正測試資料後） | `pytest-before-fix.txt` | 9 failed／23 passed；9 個失敗全部是預期原因：兄弟目錄被放行 6 個、嵌入測試 1 個、ITR／NCR HTTP 各 1 個（斷言 `leak_sha not in media` 失敗，即越界圖片內容確實被嵌入匯出檔） | 1 |
| 修復後 | `pytest-after-fix.txt` | **32 passed** | 0 |

修復後檔案雜湊（與 `pytest-after-fix.txt` 檔頭記錄一致）：
- `backend/core/docx_builder.py` `0e43664f4e600804688cd37263bcd1b84e0c48da64f4767cc147cf2cf07b4cdd`
- `backend/tests/test_docx_path_guard.py` `4222b14bdc40aea5e7ac23dedf7663e6c27e8e1b67922386614db1ca151ad348`
- `backend/tests/test_docx_path_guard_http.py` `8251ca31b871a542ce7f1e23b9cb4adf4bb12a3a9bd72196f5672d7efccc984f`

輔助：舊 probe 對修復後 helper 重跑（`probe-after-fix.txt`），10 個案例全部符合預期，兄弟目錄圖片未嵌入。

## 未做／限制
- 未跑完整後端測試套件；未跑既有的 ITR／NCR／NOI 匯出驗收腳本（屬隔離堆疊腳本）。正常匯出路徑的保留由本次新測試中的
  「合法圖片仍嵌入」「一般附件三種寫法仍解析」覆蓋，**不等於**完整匯出版面回歸。
- 修復前第 2 次與修復後之間，只有 `docx_builder.py` 改變（兩個測試檔雜湊相同，可比對兩份輸出檔頭）。
- 未檢查正式環境是否存在同前綴目錄；未操作正式站、NAS、8240／3240、8198／3198、開發資料庫。
- 未提交、推送、部署。修復**尚未上線**，正式站仍為舊版 helper。
- ITP 英文必填（待使用者決策）未動；手機版延期。
- `NOI-EXPORT-DOCX-2026-001` 仍為 REVISE，本任務不處理其 REQUIRED_FIXES。

## 範圍確認
- 產品程式只改 `resolve_local_upload_path` 一個函式；其他 docx helper、`itr_service`／`ncr_service`／`noi_service` 未動。
- 權限與資料範圍邏輯未動（HTTP 測試以具正常權限帳號走既有端點）。
- 未使用 stash／reset／checkout；未改寫歷史。

---

## 2026-10-07 更正（附加；以上原文未改，封存檔 `docs/workflow/DOCX-PATH-GUARD-2026-001-STATUS-archive.md` 不動）

上方「未做／限制」一節「正式站仍為舊版 helper」一句措辭不精確，更正為：**本批未部署，線上實際版本未核對。** 本機 HEAD 的修復前雜湊只是比較基準，不是遠端證據。部署交接見 `docs/workflow/DOCX-PATH-GUARD-2026-001-deploy-handoff.md`（v3，未執行）。
