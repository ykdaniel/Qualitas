# AUDIT-POLISH-2026-001 — REVIEW（獨立審查）

審查者：獨立 Claude 審查代理（GPT 額度用盡，使用者 2026-10-09 於對話中指定）

TASK_ID: AUDIT-POLISH-2026-001
ROUND: R1
審查基準：HEAD `6be70c12`（A＋B＋C，已上線）＋ `evidence/D.patch`（SHA-256 `6eed921d…7898`，我重算相符）。工作樹中另一工作階段的材料模組改動（schemas.py、materials router／service／tests、DECISIONS.md、BACKLOG.md、根目錄 TASK／STATUS／REVIEW）不在本輪範圍，未審查、未修改。

## EVIDENCE_CHECK
**候選樹與差異**
- 用 `git archive HEAD` 匯出到 `$TMPDIR`，`git apply --check` 後套上 D.patch，再和部署候選樹 `Qualitas-deploy-artifacts/AUDIT-POLISH-2026-001/py311-src` 的 `backend/`、`react-app/src/` 用 `diff -rq` 比對：完全相同。候選樹就是 HEAD＋D.patch，沒有混入材料改動。
- D.patch 涉及的 14 個檔案，工作樹和候選樹逐位元組相同。

**CRLF**
- AuditWizard.tsx（1113/1113 行）、auditStore.ts（148/148）、LanguageContext.tsx（2974/2974）、FollowUpIssue/columns.tsx（261/261）、audit_service.py（410/410）全部仍是 CRLF，沒有混入 LF 行。Audit.tsx 在 HEAD 就是 LF，維持 LF。

**我重跑的測試**（拋棄式 DATABASE_URL，不 import main、不啟服務、不開 port）
- 在 HEAD＋D.patch 的匯出樹上跑 `test_audit_contractor_options_http.py`、`test_audit_hardening_http.py`、`test_audit_void_lock_http.py`、`test_audit_service.py`：59 passed。
- #13 新測試放到 HEAD 的程式上跑：該測試失敗、其他 4 個通過，和 `test13-against-HEAD.txt` 一致，證明測試抓得到問題。
- 前端（工作樹的 react-app/src 只有本輪檔案有改動，和候選樹相同）：`tsc --noEmit` exit 0；`npm test` 144/144；`eslint src/components/Audit src/store/auditStore.ts` 0 個問題。

**列印證據**
- 我用 `pdfinfo`／`pdftotext` 重新讀了 6 個 PDF：
  - 修正前：第 3、4、5 步都只有 1 頁，項目分別是 0、5、4／60，而且都含背後清單的 AHB-CLOSED-1、AHB-LEGACY-1、AHB-VOID-1 等紀錄。
  - 修正後：第 3 步 1 頁（只剩本筆 AHB-DRAFT-1），第 4 步 9 頁 60／60，第 5 步 13 頁 60／60、Findings 完整，沒有背後清單。
  - 和 `print-check.txt` 相符。
- PNG：修正前第 4 步第一頁被截在第 6 項；修正後第 3 步是乾淨的計畫書，第 5 步最後一頁有完整的 Findings 純文字段落。看起來合理。

**讀碼核對（重點）**
- **AuditWizard：openedId／createdId**
  - `openedId` 用 `useState` 的初始值固定，`recordId = openedId ?? createdId`。父層每次重繪重新查 `existingItem`，不會再影響存檔目標；`existingItem` 現在只用在初始 state。
  - 精靈每次開啟都會重新掛載（`isEditModalOpen` 條件渲染），所以 id 不會殘留到下一筆。
- **AuditWizard：唯讀判斷與宣告順序**
  - `createdWithoutUpdate` 和 `readOnly` 宣告在 `createdId` 之後、`useDraftGuard(…, !readOnly)` 之前。中間沒有任何地方提前使用 `readOnly`。
  - 第一次 Save Draft 建立後，`readOnly` 變為 true，fieldset 全部 disabled，存檔按鈕隱藏，leave guard 停用。
  - 新紀錄直接 Submit 時照舊建立後關閉。有更新權限的人不受影響（`canUpdate` 預設 true，Audit.tsx 傳 `hasPermission('audit:update:all')`）。
- **pickerContractors**：依序處理三種情況：
  - 沒有承包商，或承包商仍啟用：直接用啟用清單；
  - 已停用：從 `contractorOptions` 補回該承包商；
  - 清單尚未載入：用紀錄自己的名稱暫代。
  - `handleContractorChange` 也改查同一份清單。瀏覽器證據顯示 Retired Co 仍被選中。
- **成功畫面移除**
  - `isSubmitted` 已全部刪除。`CheckCircle` 仍被進度條使用，`requestClose` 仍被關閉按鈕使用。
  - tsc／eslint 乾淨，沒有殘留引用。幾個不再使用的 i18n 鍵（successTitle 等）留著無害。
- **handleInputChange**
  - toast 已移出 updater，用 `{ ...formData, [name]: value }` 計算，也就是當前 render 的值加上本次變更，日期比較用的值正確。
  - 理論上同一 tick 連續兩次變更會讀到舊閉包，但日期欄位實務上不會發生。
- **錯誤訊息**：store 丟出 `new Error(getErrorMessage(...))`。4xx 顯示後端說明的原因（含 422 陣列的 `field: msg`），5xx 顯示固定的友善雙語訊息，不會外露 stack。精靈顯示為「無法儲存：<原因>」。
- **列印區塊**
  - 外層加 `print:static print:overflow-visible print:block`，Tailwind v4 有內建 print variant。
  - 備註和 Findings 的輸入框加 `print:hidden`，旁邊放 `hidden print:block` 的純文字區塊，保留換行（`whitespace-pre-wrap`）。
  - Audit.tsx 只在精靈開著時，對錯誤橫幅、工具列、上方面板、清單加上 `no-print`。精靈關閉時，頁面的列印行為和 HEAD 相同。
- **Audit.tsx**
  - `SETTLED_STATUSES` 包含 Void。
  - `pastUnfinishedVendors` 對整份 `auditList` 計算，統計面板直接使用；排程列的標示也改用同一個 Set。
  - `parseLocalDate` 用本地時間建立日期；`locale` 依語系（zh→zh-TW）傳到星期和月份顯示。
- **deep link**
  - 寫法和 NOI／ITR／OBS 相同：用 ref 防止重複套用，以 id 或 auditNo 比對，套用後以 `replace` 移除 openId。
  - 只有透過連結打開時，`closeWizard` 才會 `navigate(-1)`。
  - LeaveGuard 的 `requestClose` 會先 release 再執行關閉；Submit 也會先 `leaveGuard.release()`。所以返回上一頁不會跳出第二次未存檔警告。
- **Follow Up 的 AUDIT 來源**：後端 `core/validators.py` 以 `models.Audit.auditNo` 驗證 `sourceReferenceNo`。前端連結 `/audit?openId=<auditNo>`，Audit.tsx 以 `item.auditNo === openId` 比對，兩邊一致；`/audit` 路由也存在。
- **ScheduleMatrix**：空狀態改為 `vendors.length === 0`。原本的 `matrixDates.length === 0` 在月檢視中永遠不成立。
- **auditStore**：只有新增、更新失敗不再寫入頁面的 `error`；刪除失敗仍會寫入（頁面橫幅是刪除錯誤唯一的顯示位置）。`useAuditStore` 的其他使用者（Contractors.tsx）只讀 `auditList`，不受影響。
- **i18n**：11 個新鍵中英各一份，tsc 沒有報重複鍵。程式用到的鍵全部存在。
- **後端 #13**
  - 新邏輯放在 `enforce_create_scope` 之後、取號之前。
  - `scope.vendor_id` 不是 None 就代表 scope 不是 unrestricted（`unrestricted` 要求兩者皆 None），條件正確。
  - 取號改用 `audit_data["contractor"]`，audit log 的 new_value 也會是修正後的名稱。
  - scope 的 vendor_id 在 Contractor 表找不到時，保留 client 傳來的名稱：編號前綴會用那個名稱，vendor_id 則照舊被強制成不存在的 id，由外鍵擋下（409）。這和 HEAD 的行為相同，屬於極端情形，不阻擋。
- **測試修正**
  - 弱斷言 `status_code in (403, 404)` 改成直接檢查 fixture 角色沒有 `contractors:view:all`，前提更明確。
  - `after_rollback` listener 改成具名函式，在 finally 移除，不再外洩到其他測試。
  - strict_dates 只改說明文字，`AUDIT_ORDER_RELATIONS` 確實存在，說明正確。

## SCOPE_CHECK
- D.patch 只涉及 Audit 模組的前後端、FollowUp 的 AUDIT 連結、i18n、兩個測試檔、strict_dates 說明、一個種子腳本和兩個瀏覽器檢查腳本，和 TASK 範圍 1–12 一一對應。
- 「不在本輪」的項目（排程表的期間顯示、獨立列印樣板、承包商以名稱比對、其他模組的承包商清單、BACKLOG.md）都沒有碰。
- 材料模組的改動不在候選樹中。

## DECISIONS_CHECK
- **列印**：先實測，修改很小，沒有另寫樣板。修正前後都有 PDF 證據。符合。
- **成功畫面**：死碼已刪除。Submit 後照舊直接 `onSaveSuccess` 關閉，行為沒有變。符合。
- **只有建立權限的人**：第一次建立後精靈唯讀並顯示提示，權限規則（前後端）都沒有改。符合。
- **排程表**：仍然只標開始日、同一天只顯示一筆，沒有改。符合。
- AGENTS.md：沒有新增裸 fetch，錯誤用 try/catch 並顯示友善訊息，沒有 schema 或 migration 變更，沒有 hardcode 秘密。`console.error` 是 HEAD 原本就有的，本輪沒有新增 console.log。

## VERDICT
- [ ] PASS
- [x] REVISE
- [ ] HUMAN_REQUIRED

## REQUIRED_FIXES
1. **中文輸入法的 Enter 防護在 Safari 無效，而且相對 HEAD 是退步**（AuditWizard.tsx 的 `onKeyDown`，原本是 `onKeyPress`）。
   - **問題**：macOS／iOS 的 Safari（WebKit）在用 Enter 確認輸入法選字時，事件順序是先 `compositionend` 再 `keydown`。這個 keydown 的 `isComposing` 是 **false**，`keyCode` 是 **229**。所以只看 `e.nativeEvent.isComposing` 擋不住。
   - **影響**：注音、拼音使用者在 Safari 按 Enter 選字時：
     - 新增項目的「Audit Question」欄會直接觸發 `addCustomItem()`，送出未完成的文字並清空欄位；
     - 編輯項目的 task 欄會觸發 `saveEdit()`。
   - **為什麼是退步**：HEAD 用的 `onKeyPress`，在 keyCode 229 時不會觸發，所以原本沒有這個問題。這正是本輪第 5 項宣稱要處理的情境，而使用者以中文為主、使用 Mac。
   - **最小修正**：四個 `onKeyDown` 的條件都改成同時排除 `isComposing` 和 keyCode 229，例如 `if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229)`，或抽成一個小函式共用。真正會觸發動作的是 new-item task 和 edit task 兩處，必修；另外兩處只做 preventDefault，建議一併修改以保持一致。
   - **證據**：STATUS 註明修改內容。若無法在 Safari 實測，請標為「讀碼」。

**不阻擋、供參考（不要求本輪修）**
- `checkDateOrder` 的訊息樣板是英文（`X is before Y`），中文介面會顯示「稽核結束日 (…) is before 稽核開始日 (…)」。本輪只要求欄位名稱改用翻譯鍵，所以不算缺失。
- `parseLocalDate` 只接受完整的 `YYYY-MM-DD`。以前用 `new Date()` 還能解析的時間戳格式舊資料（若有），現在不會被標成過期，也不參與排序。這類紀錄本來就因為 `a.date === dateStr` 而不會出現在排程表上。若要保留舊行為，可以改成比對日期前綴。
- 錯誤訊息是空字串時只會顯示「無法儲存：」；網路斷線時顯示英文的「Network Error」。可接受。
- 第 4 步列印仍會印出每個項目的編輯、刪除圖示（STATUS 已說明，屬於「不重寫列印版面」的決定）。
- 從新分頁直接打開 `/audit?openId=…` 再關閉時，`navigate(-1)` 會離開本站。NOI／ITR／OBS 也是同樣行為，維持一致。

## NEXT_STEP
- Claude 依 REQUIRED_FIXES 第 1 項修正（四個 onKeyDown 加上 keyCode 229 防護）。
- 更新 D.patch、候選樹、frontend-checks（tsc／npm test／eslint）和 STATUS，交 R2 審查。R2 只需要核對這一處修正，以及修正沒有影響其他部分。
- Python 3.11 完整測試在候選樹上通過，仍是部署前提。
