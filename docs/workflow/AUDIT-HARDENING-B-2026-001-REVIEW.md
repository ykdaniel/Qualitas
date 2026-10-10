# AUDIT-HARDENING-B-2026-001 — REVIEW（獨立審查）

審查者：獨立 Claude 審查代理（GPT 額度用盡，使用者 2026-10-09 於對話中指定）

TASK_ID: AUDIT-HARDENING-B-2026-001
ROUND: R1

## EVIDENCE_CHECK
- **差異可重現**：審查者在暫存目錄用 `git archive HEAD` 取出 HEAD，先套 `AUDIT-HARDENING-A-2026-001-evidence/A-backend.patch`，再套 `B.patch`，兩個補丁都能直接套用。結果和工作樹逐檔比對（audit_service.py、core/utils.py、routers/audit.py、schemas.py、strict_dates.py、三個 audit 測試檔、五個前端檔）**完全相同**。所以 `B.patch` 確實是「HEAD + A → 目前工作樹」的完整差異，沒有混進 A 的內容，也沒有漏掉的變更。
- **雜湊**：`B.patch` 的 SHA-256 是 `90ba94c7…3636`，和 STATUS 一致。`backend-tests.txt` 與 `frontend-checks.txt` 列出的 9 個檔案雜湊，和目前工作樹全部相同，所以證據對應的就是要審的版本。
- **CRLF**：AuditWizard.tsx 1117/1117、columns.tsx 140/140、auditStore.ts 125/125、LanguageContext.tsx 2952/2952、audit_service.py 390/390 行都是 CRLF（HEAD 原本也全是 CRLF）；Audit.tsx 在 HEAD 和現在都是 LF；新增的測試檔是 LF。換行沒有被改壞。
- **審查者實際執行**（拋棄式 `DATABASE_URL=$TMPDIR/review-b.db`，Python 3.14，沒有匯入 main、沒有起伺服器）：
  - `tests/test_audit_void_lock_http.py` + `tests/test_audit_service.py`：**21 passed**
  - `tests/test_audit_hardening_http.py` + `tests/test_attachment_authorization_http.py`：**300 passed**
  - `tests/test_scope_all_modules.py -k audit`：1 passed
  - 前端 `tsc --noEmit -p .` exit 0；`npm test` **144/144**
  - 跑完後 `git status` 沒有新增檔案；`backend/qualitas.db` 的修改時間仍是 10/6，沒有被動到。
- **瀏覽器證據**：`browser-acceptance.txt` 列了 3 個帳號、15 項，內容具體（DOM 值、API 回應、請求數）。審查者不能起伺服器，沒有重做瀏覽器測試。兩張截圖和文字描述相符：Void 紀錄顯示 AHB-VOID-1、專案 [AHB1]；多專案帳號在 P2 存草稿成功，畫面顯示「Draft saved」。截圖看不太出 fieldset 是停用狀態，這部分以 DOM 文字紀錄為準。
- STATUS 的說法（5 項新測試、231 passed、144/144、eslint 只有 1 個 HEAD 原本就有的警告、Python 3.11 未測、完整後端測試沒重跑）都和證據一致，沒有誇大。

## SCOPE_CHECK
逐項對照 TASK 範圍，並讀過目前的程式碼：
- **#1 Audit No 回填**：`auditNo` 從 formData 移到獨立 state；建立成功後用 `created.auditNo` 回填（Save Draft 和 Submit 兩條路都有）；畫面上三個顯示位置都改用它。HEAD 時 `auditDocNo` 在 formData 裡、而且從不改變，所以移出來不會改變離開提醒的判斷；回填也不會被誤判成有未存的變更。`useDraftGuard` 是用 JSON 和基準值比較，審查者確認這個推論成立。
- **#2 切換專案重新載入**：拿掉掛載時的 `fetchAudits`，改用 `currentScopeId` 當 effect 的依賴（和 FollowUpIssue.tsx 一樣），所以掛載時只抓一次，不會重複。`auditStore.fetchAudits` 已經有 `auditFetchSeq`，過期的回應會被丟掉。Audit 不在 AppProviders 的 `preloadProjectScopedData` 裡，也沒有其他頁面會抓 Audit 清單，所以不會兩邊同時抓。
- **#8 權限**：前端 `hasPermission` 和後端 `RoleChecker` 都用完全相同的字串比對 `audit:update:all`／`audit:delete:all`（core/perms.py），兩邊一致，不會出現前端擋了、後端其實允許的情況。這也和 NCR.tsx 依權限設唯讀的做法相同。
- **#9 狀態**：前端的 `AUDIT_STATUS_TRANSITIONS` 和 `core/utils.py` 的 `WorkflowEngine.TRANSITIONS["Audit"]` 逐項相同；`AUDIT_CREATE_STATUSES` 等於後端的 `_CREATE_STATUSES`；鎖定的狀態等於後端的 `_LOCKED_STATUSES`（Closed、Void）。`savedStatus` 的邏輯審查者逐一走過：
  - 新紀錄（undefined）：只列四個可建立的狀態，不唯讀。
  - 本次開啟中建立：成功後設成 `created.status`，選項立刻變成「目前狀態 + 允許的下一步」。
  - 存成 Void：在 `await` 成功之後才設定，所以立即唯讀、離開提醒停用；存檔失敗時 `savedStatus` 不變。
  - 編輯中改了選項但還沒存：選項仍依 DB 的狀態列出，和後端驗證狀態轉換的依據相同。
  - 舊的未知狀態：只列它自己，不鎖定。原狀態重送不會觸發後端的轉換檢查，所以可以照常存其他欄位。（Model 的 `status` 是 `nullable=False`，不會出現 null。）
  - 後端：鎖定條件改用從工作流程推導的 `_LOCKED_STATUSES`，`delete_audit` 不受這個鎖影響，Void 仍然可以刪除。新增的 5 個 HTTP 測試涵蓋：Void 後改內容或改狀態都是 400 且沒有寫入、精靈原樣重送不寫入、Void 可刪除、未鎖定的紀錄可編輯、`project_id` 在建立和更新時都會存。
- **#10**：第 5 步搜尋框擋 Enter；`handleSaveDraft`／`handleSubmit` 一開始就檢查 `readOnly` 並返回。
- **#11 專案**：下拉的值改成專案 id；payload 送 `selectedProjectId || null`（沒選就送 null，不會送 `''`）。新紀錄預設帶入目前選的專案，「全部專案」時留空。`Project.name` 在資料庫是 `unique=True`，所以用名稱對應舊紀錄不會對到兩個專案。受範圍限制的帳號：建立時沿用 `enforce_create_scope`（只有一個專案的帳號會自動補上，多個專案的帳號沒選就 403）；更新時沿用 `enforce_update_scope`（明確送 null 或範圍外的專案會被拒絕）。受範圍限制的帳號本來就看不到沒有 project_id 的舊紀錄（`record_in_scope`），所以「自動補上連結」只會發生在不受範圍限制的帳號身上。
- **順手修的 Low #16**：刪除按鈕加了 `stopPropagation`；`handleDeleteConfirm` 用 try/catch/finally，store 會先把友善的錯誤訊息放進 `error`，頁面錯誤橫幅會顯示，確認框一定會關閉。
- **範圍外的檔案**：只有種子資料腳本和 Vite 啟動檔（隔離環境專用，3320/8320）。種子裡的固定測試密碼沿用該目錄既有慣例，只用在隔離環境。沒有發現超出範圍的修改。

## DECISIONS_CHECK
- 使用者的四個決定（專案下拉改選 id、預設帶入目前專案、加入 Void 並前後端都唯讀、關閉不另設權限）都照做，沒有多做也沒有少做。
- **舊紀錄依名稱補上 `project_id`（handoff 請審查者判斷）**：審查者認為**可以接受**，理由如下：
  1. HEAD 時下拉的值就是 `projectList` 裡的專案名稱，而專案名稱在資料庫是唯一的，所以名稱相同就能可靠地判斷是哪個專案；
  2. 對到的專案在存檔前就已經顯示在下拉裡，只有在有 `audit:update:all` 權限的人主動存檔時才會寫入，而且會留下 UPDATE 稽核紀錄；
  3. 這不是批次回填。

  副作用：補上連結後，這筆紀錄會出現在該專案的篩選清單裡，也會被限制在該專案的帳號看到。這是改用專案 id 本來就要達到的效果，STATUS 也已經寫在「行為變化」裡。建議回報時讓使用者知道這一點。
- 前端狀態表是手動複製後端的對照，和 ITP 既有做法相同，目前兩邊逐項一致。後端仍然是最終把關，所以就算以後前端沒同步更新，也只會造成畫面上的選項錯誤，不會寫入不合法的狀態。
- DECISIONS「每批 PASS 後提交、推送、部署」的條件仍然適用（需要 3.11、備份、回退準備）。

## VERDICT
- [x] PASS
- [ ] REVISE
- [ ] HUMAN_REQUIRED

## REQUIRED_FIXES
沒有必須修正的項目。部署條件與不阻擋的備註如下：

**部署條件**
1. **B 只能和 A 一起部署，或在 A 之後部署**。B 的後端補丁是以 A 的 `audit_service.py` 為基準；前端送出的 `project_id` 和 `auditNo` 的處理方式，也依賴 A 的 schema 與「更新時忽略 auditNo」。A 已經是 PASS。
2. **部署前要用 Python 3.11 跑過**：至少 `test_audit_void_lock_http.py`、`test_audit_hardening_http.py`、`test_audit_service.py`，並跑一次完整的後端測試。審查者用肉眼看過，B 的 f-string 沒有 3.12 才支援的寫法，但這不能取代實際執行。
3. 建議在正式環境做唯讀預檢：
   - 有幾筆 Audit 只有 `project_name`、沒有 `project_id`，其中幾筆名稱對得上專案（這些就是會在下次存檔時補上連結的紀錄）；
   - 有沒有 `status` 不在 Draft/Planned/In Progress/Completed/Closed/Void 裡的舊紀錄。這種紀錄在前端只能維持原狀態，後端也不允許改狀態或刪除。這是後端（A）的既有規則，不是 B 造成的，但部署後使用者可能會注意到。

**不阻擋，建議放進 C 批**
- N1：`Audit.tsx` 的 `FINISHED_STATUSES` 只有 Completed 和 Closed。B 讓 Void 可以從畫面上選，所以日期已過的 Void 稽核會讓該承包商在排程矩陣裡被標成「逾期未完成」，左側統計也會把 Void 算進去。只要把 Void 加進該集合（或排除）就好，一行的事。
- N2（B 之前就有）：`existingItem` 是每次從 `auditList` 重新找出來的。如果精靈開著時清單被重新抓、而且新清單裡沒有這筆紀錄（例如進頁面時舊清單的時間差，或抓取失敗把清單清空），`recordId` 會變成 null，下一次 Save Draft 就會建立一筆重複的紀錄。精靈是全螢幕覆蓋，碰不到上方的專案選單，所以 B 新增的「切換專案就重新抓」不會觸發這個問題。建議以後讓精靈記住開啟時的 id。
- N3（B 之前就有）：只有 `audit:create` 沒有 `audit:update` 的帳號，新增時存過一次草稿後，之後再存都會被後端 403，畫面只顯示通用錯誤。
- N4：同意 STATUS「發現、未修」的判斷：只有 audit 權限的帳號看不到承包商清單（`contractors:view:all`），要不要處理需要使用者決定。補充一點，既有紀錄的 `contractor`／`vendor_id` 會保留在 formData 裡照原樣送出，不會因為下拉是空的而被清掉。
- N5：截圖裡標題欄的 placeholder 顯示成 `audit.auditTitlePlaceholder`，是翻譯缺漏，屬於 C 批。

## NEXT_STEP
1. Python 3.11 補跑上述測試與完整後端測試（Colima 或其他 3.11 環境），結果留存。
2. 依 DECISIONS 的持續授權，把 A + B 一起（或 A 先 B 後）完成部署準備：核對部署範圍（只包含 A、B 的檔案；根目錄的 DEPLOY-EXEC 控制文件和其他未結案的修改不要混進來）、做正式環境唯讀預檢（上面第 3 點）、備份、準備回退；然後提交、推送、部署；部署後做不會建立資料的冒煙檢查並回報。
3. N1 到 N5 記到 BACKLOG／C 批；N4 請使用者決定。
