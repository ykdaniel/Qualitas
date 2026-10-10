# AUDIT-EXPORT-DOCX-2026-001 — REVIEW（Audit 匯出 Word 完整報告）

審查者：獨立 Claude 審查（GPT 額度用盡，使用者指定）
TASK_ID: AUDIT-EXPORT-DOCX-2026-001
ROUND: R1
審查日期：2026-10-10；基準 HEAD `37d71b03`（`ui/sidebar-shell-preview`），候選樹 = `git archive HEAD` + `evidence/G.patch`

## EVIDENCE_CHECK

以下都是審查者自己重做的，沒有引用 STATUS 的結論。

1. **G.patch 雜湊**：`shasum -a 256` 的結果是 `b5d11c94cfc1f183019cfebae649405af29afbaad48a54d5320580c77bdf3463`，和 STATUS 寫的相同。
2. **套用 patch**：在 `$TMPDIR/aedr1/cand` 解開 `git archive HEAD`（HEAD 是 `37d71b03…`），`git apply --check` 通過，9 個檔案都乾淨套上；patch 裡沒有檔案權限（mode）的變更。套用後用 `cmp` 比對，9 個檔案和工作樹逐位元組相同。工作樹另外還有 NOI-* 文件、`seed_noi_itr_desktop_review.py`、`noi-itr-desktop-review-vite-launcher.mjs` 等未追蹤檔案，屬於其他工作，不在本輪。
3. **換行字元**：候選樹裡 `audit_service.py`（537/537）、`routers/audit.py`（129/129）、`AuditWizard.tsx`（1151/1151）、`LanguageContext.tsx`（2982/2982）每一行都是 CRLF，沒有混用。`api.ts`、`LeaveGuard.tsx` 原本是 LF，現在仍是 LF。
4. **後端測試**（候選樹，本機 Python 3.14.6，`DATABASE_URL=sqlite:///$TMPDIR/aedr1/throwaway.db`）：6 個相關測試檔（`test_audit_export_docx_http`、`test_audit_hardening_http`、`test_audit_contractor_scope_http`、`test_docx_path_guard_http`、`test_docx_path_guard`、`test_contractor_options_http`）**85 passed**。開發資料庫 `backend/qualitas.db` 的修改時間仍是 Oct 6，這次沒有動到它。
5. **前端檢查**（候選樹，node_modules 用符號連結指向 repo 裡的 node_modules）：`tsc --noEmit -p .` exit 0；4 個改動的檔案跑 `eslint --max-warnings 0` exit 0。
6. **審查者另外寫的邊界測試**（放在候選樹的暫存檔，跑完已刪除，沒有寫進 repo）：
   - 查檢項目的值不是字串，例如 `no` 是數字、`clause` 是物件、`task` 是陣列、`note` 是數字；`selected_templates` 混了數字、null、空白字串、`\ud800`：回 200，內容轉成文字輸出，不合法字元被移除。
   - SQLite 欄位實際存的是整數（`custom_check_items = 5`、`title = 123`），而且 auditNo 含中文、`/`、`"`、CRLF：回 200。`Content-Disposition` 的 ASCII 檔名改成底線，`filename*` 用百分比編碼，所以標頭不會被注入。
   - 專案名稱和代號、承包商名稱含控制字元；狀態是不明的值：回 200，控制字元被移除。
   - `project_id` 指向已經不存在的專案時，改用 `project_name`：回 200。
   - 用 monkeypatch 讓 `docx_builder.add_masthead` 拋出 ValueError：回 **500，不是 404**。router 只在 service 回傳 None 時才回 404，產生文件的錯誤不會被誤報成「找不到」。符合預期。
   - **查檢項目的 `status` 是陣列或物件**（例如 `{"status": ["pass"]}`、`{"status": {"a": 1}}`）：**回 500**。原因是 `_RESULT_TEXT.get(item.get('status'), …)` 拿無法雜湊的值去查 dict，丟出 `TypeError: unhashable type`。另外確認過：一般的 `POST /api/audit/` 會接受這種資料並回 200（schema 的 `custom_check_items: Any`），讀取 `GET /api/audit/{id}` 也是 200，只有匯出是 500。也就是說，任何有 audit:create 權限的使用者，用正常 API 就能存出一筆之後永遠無法匯出的紀錄。這違反 TASK 第 1 點「舊資料或異常資料不能讓匯出失敗」，STATUS 寫的「型別不對」也沒有涵蓋到這種情況。**列為必改項。**
7. **隔離環境 8320，只讀取**：以 `audit_viewer` 登入後，`/api/audit/ahb-export-1/export-docx` 回 200，Content-Type 是 docx；不存在的 id 回 404；未登入回 401。用 python-docx 讀出下載的檔案，所有段落和表格文字都和 `evidence/sample-AHB-EXPORT-1.docx` 相同（位元組不同只是 zip 內的時間戳記）。樣本有 6 個章節，統計是 5 項、60%、符合 2、不符合 1、注意 2，和種子資料一致，也和截圖 `unsaved-warning.png` 精靈畫面上的 5／60%／2／1 一致。
8. **讀程式碼**：
   - 權限與資料範圍：用 `RoleChecker(AUDIT_VIEW)`；`get_audit(audit_id, scope)` 底層是 `record_in_scope`，不存在和不在範圍內都回同一個 404「Audit not found」，不會洩漏紀錄是否存在。新測試 5–8 和審查者的 HTTP 檢查都確認了。
   - 統計算法：和 `AuditWizard.tsx` 的 `stats` 相同，不是 `'pass'`／`'fail'` 的都算 pending，`progress = round((total − pending) / total × 100)`。有一個極端情況：清單裡有不是物件的項目時，後端會先過濾掉，前端不會，兩邊總數可能不同。只有資料損壞時才會發生，不阻擋。
   - 前端：按鈕放在 `{recordId && …}` 裡，`recordId = openedId ?? createdId`，所以新紀錄第一次儲存草稿之後才會出現；按鈕外層是既有的 `no-print` 容器，列印時隱藏。`leaveGuard.dirty` 為 true 時只跳提示，不下載。唯讀時 `useDraftGuard` 的 enabled 是 false，dirty 一定是 false，所以唯讀可以照常匯出。
   - `useDraftGuard`：判斷式沒變，只是抽成變數，回傳值多了 `dirty`。搜尋了 23 個呼叫端，都只呼叫 `requestClose`／`markSaved` 等方法，沒有人把回傳物件展開成元件 props（搜尋 `{...leaveGuard}`、`{...guard}` 沒有結果），所以其他呼叫端不受影響。

## SCOPE_CHECK
- 只改了 TASK 列出的內容：後端端點與 service、測試、種子資料、精靈按鈕、`useDraftGuard` 回傳 `dirty`、6 個翻譯 key、`exportAuditDocx`、瀏覽器檢查腳本。tracked 檔案只有這 6 個有修改。
- 沒有改資料結構（models、alembic），沒有改列印，沒有改 NCR／NOI 或其他模組的匯出，也沒有改 `core/docx_builder.py`。
- 種子腳本 `seed_audit_export_docx_review.py` 沒有檢查 DATABASE_URL；沒設的話會寫進 `./qualitas.db`。同目錄既有的 seed_* 腳本（例如 `seed_audit_hardening_b_review.py`）也都是這樣，所以算沿用既有寫法，不阻擋。

## DECISIONS_CHECK
- DECISIONS.md 裡沒有和本輪衝突的決策，也沒有新增政策。公司名稱與標誌沿用 NCR 的佔位文字（BACKLOG #15 尚未決定），TASK 已明確排除在本輪之外。
- AGENTS.md：
  - 業務邏輯放在 service，router 只負責依賴與錯誤轉換。
  - 原始例外不會回傳給使用者：FastAPI 的 500 只回通用訊息。
  - 前端沿用 api service，沒有在元件裡直接用 fetch；錯誤用 try/catch 接住，顯示友善的 toast。
  - `handleExportDocx` 用了 `console.error`。AGENTS.md 要求改用 `logger`，但 repo 裡沒有 logger utility，同一個檔案的第 400、427 行和另外 21 個元件也都用 `console.error`，所以沿用既有寫法，不阻擋。
- 沒有提交、推送或部署，符合 TASK 的限制。

## VERDICT
- [ ] PASS
- [x] REVISE
- [ ] HUMAN_REQUIRED

## REQUIRED_FIXES
1. **查檢項目 `status` 不是字串時，匯出會失敗（500）**：`backend/services/audit_service.py` 的 `export_docx` 裡，`_RESULT_TEXT.get(item.get('status'), _RESULT_TEXT['pending'])` 碰到陣列或物件會丟出 `TypeError`。
   - 修法：查表之前先檢查型別，例如 `status = item.get('status'); status = status if isinstance(status, str) else None`，然後用 `_RESULT_TEXT.get(status, …)`。這樣該項目會照精靈的算法顯示成「注意／待改善」並算進 pending；統計那段已經用 `==` 比較，不必改。
   - 在 `test_audit_export_docx_http.py` 的異常資料測試加入 `status` 是陣列、物件、數字的項目，確認回 200、結果文字是「注意／待改善 Attention」、統計算成 pending。
   - 修改時保持 CRLF，然後重跑 6 個相關測試檔並更新 G.patch／STATUS。

非阻擋建議（本輪可以不做）：
- 種子腳本可以加一行檢查：沒設 DATABASE_URL 就停止，避免誤寫開發資料庫。
- 現在只有精靈的主表單（formData）算 dirty。如果 step 3 的項目編輯框開著還沒套用，或「新增項目」欄位裡有字，按匯出不會提醒。這些內容本來就不在已儲存的資料裡，影響很小。

## NEXT_STEP
1. 執行者修正上面的必改項並補測試，用同一個 TASK_ID 交 R2，附上新的 G.patch 雜湊與測試輸出。前端沒有改動的話，不必重跑瀏覽器檢查。
2. R2 審查通過後，部署前還需要確認：**Python 3.11 完整測試全數通過**。審查當下 `~/Documents/Qualitas-deploy-artifacts/AUDIT-EXPORT-DOCX-2026-001/py311-full-suite.txt` 只跑到 `pip_exit=0`，pytest 結果還沒出來；而且 R2 的候選樹變了，要用新的候選樹重跑。
3. 部署要等其他工作階段的部署結束，不能混在同一次重建裡（依 TASK 的限制）。

審查備註：第一次連線檢查時，shell 變數是空的，curl 的 cookie 檔意外寫到了 repo 根目錄（檔名 `-X`，內容只有隔離環境 8320 的測試登入 cookie）。這是審查者自己造成的，已經立即刪除；之後 repo 裡除了本文件，沒有其他變動。
