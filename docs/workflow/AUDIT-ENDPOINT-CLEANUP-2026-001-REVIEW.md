# AUDIT-ENDPOINT-CLEANUP-2026-001 — REVIEW（獨立審查）

審查者：獨立 Claude 審查代理（GPT 額度用盡，使用者 2026-10-09 於對話中指定）

TASK_ID: AUDIT-ENDPOINT-CLEANUP-2026-001
ROUND: R1
審查日期：2026-10-10。基準 HEAD `0798dbb9b72d498e9463f4706d24fa3988c2bf37`（與目前 HEAD 相同）。

## EVIDENCE_CHECK
審查者自己重做的驗證（未沿用 STATUS 的口頭結論）：

1. **差異與候選樹一致**：`G.patch` 的 SHA-256 為 `31616ebe43d350f7927602e70c5e1051e3aa10a21de08dd2269774dbe718b632`，與 STATUS 相符。在 `$TMPDIR` 用 `git archive HEAD backend` 解開後執行 `git apply --check`，再套用 G.patch，五個檔案都能乾淨套上。和 `cand/backend` 做 `diff -r`（排除 `__pycache__`）的結果是 **0 差異**，所以候選樹的 backend 等於 HEAD 加上 G.patch。
2. **`routers/audit.py` 回到 `98b4971d`**：用 `cmp` 比對候選樹與 `git show 98b4971d:backend/routers/audit.py`，**逐位元組相同**。`98b4971d..HEAD` 之間只有 `38e33275`（AUDIT-CONTRACTORS）改過這個檔，所以本輪等於完整撤回那次的改動。
3. **`services/audit_service.py`**：和 `98b4971d` 比，只剩 AUDIT-POLISH #13 的兩處改動：綁定承包商時用自己的承包商名稱，以及 `generate_reference_no` 改用 `audit_data.get("contractor")`。這兩處應該保留。`get_contractor_options` 已完全移除。
4. **`schemas.py`**：從 `class Audit(` 到 `class KPIWeightBase` 這一段與 `98b4971d` 用 `cmp` 比對相同。整檔和 `98b4971d` 比，只差 CONTRACTOR-OPTIONS 新增的 `ContractorOption` 與 `ContractorContact`，這兩個應該保留。G.patch 的 schemas 區塊對 HEAD 套用，沒有帶進工作樹裡另一個工作階段的材料改動。
5. **CRLF**：候選樹的 `audit.py` 和 `audit_service.py` 都是「with CRLF line terminators」。`audit_service.py` 有 397 行、397 個 `\r`，全部是 CRLF。`schemas.py` 在 HEAD 本來就是 LF，現在仍是 LF。新測試檔是 LF，與同目錄其他測試檔一致。
6. **殘留引用**（grep `audit/contractors|AuditContractorOption|get_contractor_options|read_audit_contractor_options` 等）：
   - 候選樹的 `backend`、`react-app/src`、`react-app/tests-browser`：只剩共用端點自己的 `ContractorService.get_contractor_options`（`routers/contractors.py:33`、`services/contractor_service.py:40`），以及新測試檔的說明與斷言。
   - HEAD 的 `react-app`、`backend`、`scripts`（`git grep`）：只有本輪要移除的那幾處。
   - 整個工作樹的非 md/patch/txt 檔：只有新測試檔和 `evidence/netwatch.mjs`（它是負面計數腳本，不是使用端）。
   - 沒有任何檔案 import 被刪的測試檔。DECISIONS.md 也沒有提到這個端點。
7. **定向測試**（依指示在候選樹執行，`DATABASE_URL` 指向 `$TMPDIR` 的拋棄式資料庫）：`tests/test_audit_contractor_scope_http.py` 和 `tests/test_contractor_options_http.py` 共 **12 passed**（Python 3.14 本機）。
8. **部署期間的風險（是否還有使用端）**：線上前端是 CONTRACTOR-OPTIONS 部署的版本，`index.html` 為 `93b7672a…`。審查者在 `Qualitas-deploy-artifacts/CONTRACTOR-OPTIONS-2026-001/deploy/frontend/dist/` 找到 SHA-256 相同的 `index.html`，在整個 dist（含所有 chunk）grep `audit/contractors`，結果 **0 筆**；`/contractors/options` 出現在 `assets/index-B9v8O0ER.js`。`f1e5560c..HEAD` 之間沒有 `react-app/src` 的提交，HEAD 的 Audit 頁和精靈都改用 `useContractorsStore`。後端重建後，線上前端不會再呼叫已移除的端點。
9. **STATUS 的誠實度**：STATUS 寫明 3.11 完整測試「執行中」，沒有虛報。`py311-full-suite.txt` 目前只記到 `pip_exit=0`，還沒有 pytest 結果。`backend-related-tests.txt` 沒有列出是哪 6 個檔案得到 76 passed，屬於小缺口，不影響判定。

## SCOPE_CHECK
- 只改了 TASK 列出的後端檔案：`routers/audit.py`、`services/audit_service.py`、`schemas.py`、刪除的舊測試檔、新測試檔。前端、共用端點 `/api/contractors/options`、NOI 聯絡端點都沒有動。
- **#13 測試的搬移**：斷言逐行相同，包括承包商名稱與 `vendor_id`、編號前綴 `AB`、不從 `AV` 序號取號。唯一的差別是前置資料從 `add_contractors`（zeta 和 alpha）縮成只建 alpha。zeta 只用在原本「不洩漏聯絡資料」的那個測試，與 #13 的斷言無關，所以實質沒變。這個測試仍然有意義：如果撤掉 #13 的修正，承包商名稱會變成 `Audit vendor`、前綴會變成 `AV`，而且會從 `AV` 序號取號，三個斷言都會失敗。
- **新的「端點已移除」測試**：用預設登入的 `auditor`（有 `audit:view:all`）打 `/api/audit/contractors`，斷言回 404 `{'detail': 'Audit not found'}`，同時確認 `/audit/{id}` 仍是 200。如果有人把端點加回來，會回 200，測試就會失敗，所以是有效的回歸防護。
  - 沒有 audit:view 的使用者：會被 `/{audit_id}` 的 `RoleChecker(AUDIT_VIEW)` 擋下，回 403。未登入的人回 401。這和移除前舊端點的 403/401 一致，沒有新的資訊洩漏，也沒有權限放寬。
  - 綁定承包商的使用者：`get_audit` 帶 scope 查詢，不存在的 id 一樣回 404。
  - 新測試沒有覆蓋「無 audit:view 得到 403」，但那是 `/{audit_id}` 原本就有的行為，不是本輪的變更。非必要。
- 舊測試檔裡的 `test_get_by_id_route_still_works` 由新測試的 200 斷言和 404 斷言涵蓋。綁定承包商只看到自己這類行為，已由 `test_contractor_options_http.py::test_contractor_scoped_user_sees_only_its_own_contractor` 在共用端點上覆蓋。

## DECISIONS_CHECK
- 沒有新增或改變業務規則。CONTRACTOR-OPTIONS 當時明說保留舊端點只是為了部署過渡，本輪依此收尾，符合原本的計畫。
- 符合 AGENTS.md：沒有遷移、沒有 schema 變更、沒有改到 API 契約的其他使用端。測試使用隔離的拋棄式資料庫，不碰開發資料庫。
- 非阻擋提醒：如果有人在 CONTRACTOR-OPTIONS 上線前就開著 Audit 頁、到現在一直沒重新整理，那個舊分頁在後端重建後會拿到 404，承包商清單會是空的，重新整理就會恢復。風險很低，不需要修改。

## VERDICT
- [x] PASS
- [ ] REVISE
- [ ] HUMAN_REQUIRED

## REQUIRED_FIXES
無。

部署前提（不是本輪要修的項目）：Python 3.11 完整測試必須在候選樹（HEAD `0798dbb9` + G.patch）跑完而且全數通過，並把 pytest 結果寫進 `py311-full-suite.txt`。目前檔案只記到 `pip_exit=0`。

## NEXT_STEP
1. 等 3.11 完整測試完成並確認全數通過，然後把結果補進 STATUS。
2. 依「PASS 後部署」的常設授權，只提交本輪範圍：G.patch 的五個檔案加上本輪文件。不要把工作樹裡另一個工作階段的材料改動（`schemas.py` 等）帶進提交。重建時用候選樹的 backend 重建 NAS 後端（只動後端，前端不變）。
3. 部署後確認 `/api/contractors/options` 仍正常，Audit 頁的承包商清單也正常顯示。這兩項只需要讀取，不建立資料。
