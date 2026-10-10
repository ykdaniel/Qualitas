# AUDIT-CONTRACTORS-2026-001 — REVIEW（獨立審查）

審查者：獨立 Claude 審查代理（GPT 額度用盡，使用者 2026-10-09 於對話中指定）

TASK_ID: AUDIT-CONTRACTORS-2026-001
ROUND: R1
審查基準：HEAD `98b4971d`（A＋B，已審）＋ `evidence/C.patch`。工作樹中另一工作階段的材料模組改動（`schemas.py` 的 MaterialCreate／MaterialUpdate、materials router／service／tests、DECISIONS.md）不在本輪範圍，未審查、未修改。

## EVIDENCE_CHECK
**候選樹與差異**
- 我把 HEAD 匯出（`git archive`）到 `$TMPDIR`，套上 `C.patch`，再和部署候選樹 `Qualitas-deploy-artifacts/AUDIT-CONTRACTORS-2026-001/py311-src` 的 `backend/` 和 `react-app/src/` 用 `diff -rq` 比對（排除 `__pycache__`），結果完全相同。候選樹就是 HEAD＋C.patch，沒有混入材料改動。
- 本輪 6 個檔案（routers/audit.py、services/audit_service.py、Audit.tsx、AuditWizard.tsx、auditStore.ts、新測試檔），工作樹和候選樹逐位元組相同。`schemas.py` 的工作樹和候選樹只差另一工作階段刪掉的 MaterialCreate／MaterialUpdate；候選樹保留了這兩個類別，也就是 HEAD 的狀態，符合本輪範圍。
- `frontend-checks.txt` 裡三個前端檔案的 sha256，和工作樹目前的檔案一致。

**CRLF**
- routers/audit.py（124/124 行）、audit_service.py（403/403）、AuditWizard.tsx（1117/1117）、auditStore.ts（147/147），在候選樹中仍全部是 CRLF。
- schemas.py、Audit.tsx 和新測試檔在 HEAD 就是 LF，維持 LF。

**我重跑的測試**（拋棄式 DATABASE_URL，不 import main、不啟服務、不開 port）
- `test_audit_contractor_options_http.py` 加 `test_audit_hardening_http.py`：37 passed。
- 4 個 `test_audit*.py` 一起跑：58 passed，和 STATUS 的數字相同。
- 前端：`tsc --noEmit` exit 0，`npm test` 144/144。
- 另外在 `$TMPDIR` 寫了 3 個臨時測試補驗，沒有寫進 repo，全部通過：
  - 只綁專案、沒綁承包商的帳號，拿到全部承包商；
  - 綁定一個不存在的承包商時，回傳空清單；
  - 未登入回 401。

**讀碼核對**
- **路由順序**：`@router.get("/contractors")` 宣告在 `/{audit_id}` 之前，所以 `/api/audit/contractors` 不會被當成 audit id。測試 4 也證明 `/audit/{id}` 和 404 仍然正常。
- **權限**：用 `RoleChecker(AUDIT_VIEW)`，也就是 `audit:view:all`。沒有這個權限會回 403，有測試證明。
- **欄位過濾**：`response_model=list[AuditContractorOption]` 只有 id／name／status。測試資料特別放了 `contactPerson` 和 `phone`，再斷言每列的鍵剛好是 `{'id','name','status'}`。這證明 response_model 真的把其他欄位濾掉了，不只是 schema 上宣告而已。
- **範圍**：`scope.vendor_id` 有值時只回傳自己的承包商，有測試證明。只綁專案的帳號拿到全部承包商，這是我的補驗結果。Contractor 是全域主檔，沒有和專案關聯，所以這裡沒有可以按專案過濾的依據。
- **前端型別**：VendorStatsPanel、ScheduleMatrix、columns 這三個子元件只用 `id` 和 `name`。精靈只用 `id` 和 `name` 填下拉和 `contractor` 欄位，沒有用到 abbreviation 等選項裡沒有的欄位。編號前綴由後端依 `vendor_id` 產生，截圖中的 `QTS-RV-AUDIT-000001` 可以佐證。
- **前端時序**：精靈的 `useMemo` 改成依 `contractorOptions` 更新，所以清單晚到時下拉會自動補上。舊寫法依 `getActiveContractors` 這個不會變的函式參照，清單晚到時不會更新，這個問題確實修好了。`AuditWizard` 只在 Audit.tsx 中使用（整個前端搜尋確認），Audit.tsx 掛載時就會抓清單，不會出現精靈開著卻從來沒抓清單的情況。精靈在清單載入前就打開時，下拉先是空的，載入後自動補上，不會壞。
- **篩選**：停用的承包商仍然用 `status === 'active'` 排除，和原本 `getActiveContractors` 的條件相同。
- **舊依賴**：Audit 模組內已經沒有任何 `contractorsStore` 或 `/contractors` 的引用（整個前端搜尋確認）。

**截圖**
- 修改前：只有「All 4」，排程表沒有列。
- 修改後：出現「Review Vendor 4」，10/1 有一筆。
- 精靈：選了 Review Vendor，編號前綴是 RV。

三張截圖都和 STATUS 的描述相符。「下拉有 4 個選項」從截圖本身看不出來，但不影響結論。

**STATUS 的誠實度**
- STATUS 寫明 Python 3.11 完整測試「執行中」，沒有宣稱已通過。審查時 `py311-full-suite.txt` 只寫到 `pip_exit=0`，測試還沒有結果。
- 「行為變化」一節如實揭露了資料暴露面的變化。
- 沒有自填 PASS。

## SCOPE_CHECK
- 改動限於 TASK 範圍 1、2：後端一個唯讀端點、一個 schema、一個 service 方法，前端是 auditStore、Audit.tsx、AuditWizard.tsx 三個檔案。
- `/api/contractors` 的權限沒有改。NCR、NOI 等其他模組沒有改。也沒有混入之前列為 C 批的其他事項。
- 沒有 schema 遷移，也沒有寫入行為。
- **資料暴露的評估（可以接受）**
  - 新端點讓每個有 `audit:view:all` 的人，都能看到所有承包商的名稱和狀態，包括只綁專案的帳號。
  - 理由一：Contractor 是全域主檔，沒有專案歸屬，沒有可以按專案過濾的依據。
  - 理由二：只露出名稱和狀態，聯絡人、email、電話、地址、package、scope 都沒有回傳。
  - 理由三：Audit 列表本身就會在範圍內顯示承包商名稱。
  - 理由四：綁定承包商的帳號在新端點只看得到自己的承包商，比現有的 `/api/contractors` 更嚴格。現有端點完全沒有承包商範圍過濾，有 `contractors:view:all` 的承包商帳號可以看到所有承包商的完整聯絡資料。
  - 這個方向是使用者在對話中選定的（「用第 2 種，改程式」），TASK 也寫明了這個行為。

## DECISIONS_CHECK
- DECISIONS.md（HEAD 版本）沒有關於承包商主檔可見度的既有決策，本輪沒有和任何決策衝突，也沒有把未確認的業務規則升格為政策。
- 部署條件符合「PASS 後部署」的常設授權：本輪 PASS 後，Python 3.11 完整測試通過才能和 A＋B 一起部署，不能單獨提前上線。

## VERDICT
- [x] PASS
- [ ] REVISE
- [ ] HUMAN_REQUIRED

## REQUIRED_FIXES
無。

非阻擋建議（可以下一輪或順手處理，不影響部署）：
1. `test_audit_only_role_gets_names_without_contractors_permission` 斷言 `/api/contractors/` 的狀態碼 `in (403, 404)`。但共用 fixture 只掛了 `auth` 和 `audit` 兩個 router，所以實際一定是 404，這行斷言沒有驗證任何權限。「該角色沒有 contractors 權限」其實是由 fixture 的角色設定保證的，瀏覽器實測也看到 403，所以結論仍然成立。建議在 fixture 掛上 contractors router 並斷言 403，或直接刪掉這行，避免讓人誤會。
2. TASK 寫了「其他模組另列待辦」，但目前只寫在 STATUS 的「發現、未修」，BACKLOG.md 沒有對應條目。建議補一條：NCR、NOI 等模組依賴 `contractorsStore`，只有模組權限的角色在那些頁面的承包商清單會是空的。
3. `fetchContractorOptions` 失敗時清單不會被清空。同一分頁先後登入兩個帳號時，如果後者的請求失敗，會短暫看到前一個帳號的名稱清單。這和 store 既有的模式一致（`auditList` 也不會在登出時重置），而且只有名稱，風險很低。
4. `get_contractor_options` 直接用 `self.repo.db` 查詢，沒有經過 repository 層。同一檔案第 359 行已有相同寫法，屬於既有風格，不要求修改。

## NEXT_STEP
1. 等候選樹上的 Python 3.11 完整測試跑完。必須全部通過，並把結果寫進 `py311-full-suite.txt`。
2. 通過後，依常設部署授權將本輪和 A＋B 一起提交、推送、部署。部署範圍只限 HEAD＋C.patch，不能混入材料模組的改動。
3. 部署後做唯讀冒煙檢查：用只有 Audit 權限的角色開 Audit 頁，確認 `/api/audit/contractors` 回 200，承包商面板和排程表都有資料。不要建立測試資料。
4. 非阻擋建議 1、2 可以另外排入後續處理。
