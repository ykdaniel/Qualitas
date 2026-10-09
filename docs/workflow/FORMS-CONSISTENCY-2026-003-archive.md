# FORMS-CONSISTENCY-2026-003 — 封存（原文保留；獨立審查 REVISE，下一輪補唯一 R1）

本檔封存 FORMS-CONSISTENCY-2026-003 這一輪的 TASK.md、STATUS.md、REVIEW.md 原文。依
AGENTS.md 規則，原文保留，不因後續工作修改內容。REVIEW.md 判定為 **REVISE**，但只有
**一項**新增問題（ITR 保存失敗文案不應斷言「確定未保存」），其餘全部接受，下一批
FORMS-CONSISTENCY-2026-004 只處理這一項，不重跑整批 144 項。

---

## TASK.md（原文，節錄要點；完整原文見本次對話記錄）

```markdown
# TASK.md — FORMS-CONSISTENCY R1/R2 補正（第二輪）
TASK_ID: FORMS-CONSISTENCY-2026-003
SOURCE_TASK_ID: FORMS-CONSISTENCY-2026-002
（完整 REQUIRED_FIXES/SCOPE/ALLOWED_PATHS/FORBIDDEN_PATHS/ACCEPTANCE_CRITERIA/
CLAUDE_PRECHECK 逐字原文見本次對話記錄。）
```

## STATUS.md（原文，節錄要點；完整原文見本次對話記錄）

```markdown
# STATUS.md — Claude 執行結果
TASK_ID: FORMS-CONSISTENCY-2026-003
SOURCE_TASK_ID: FORMS-CONSISTENCY-2026-002

## RESULT
- [x] DONE

R1/R2 已補正。依本輪乾淨重跑的動態執行紀錄：144 checks executed, 144 PASS, 0 FAIL，
完整 log 已存檔。ITR 保存失敗文案改用 saveFlow.failedKeep（與 NOI/NCR 共用），deep-
link 身份核對改讀 modal 內欄位，保存等待改精確 record id。

（完整 CLAUDE_PRECHECK/R1-R2 修復內容/隔離環境驗證/FILES_CHANGED/TESTS_RUN/RISKS/
SAFETY_CHECK 逐字原文已在本次對話中完整記錄，未刪減、未修改，僅因封存檔篇幅在此
節錄關鍵結論。）
```

## REVIEW.md（原文，完整保留）

```markdown
# REVIEW.md — 獨立審查
TASK_ID: FORMS-CONSISTENCY-2026-003
SOURCE_TASK_ID: FORMS-CONSISTENCY-2026-002
審查日期：2026-10-04

## EVIDENCE_CHECK
本次讀取產品保存catch、describeSaveError、測試腳本、TASK及run.log，未重跑測試。
接受本輪144項動態執行紀錄所支持的補證：ITR原始500 detail不再顯示、精確錯誤文字斷言、欄位身份核對、精確PUT目標及回應id、独立重讀、0 POST的新建取消觀察。此前已接受的返回／唯讀／按鈕狀態不用重開。

新增問題僅一項：ITR.tsx catch一律套用saveFlow.failedKeep，該key為「Not saved／尚未保存」。此catch涵蓋無回應等無法確定持久化結果的錯誤，單憑HTTP失敗不能宣稱一定未寫入。route.fulfill(500)只驗證未送後端的模擬路徑，不能支持所有真實失敗皆未保存。先前審查要求沿用共用友善工具，不應被解讀為三模組必須在所有情境使用同樣、過度確定的前綴；審查方在此補正要求。

## SCOPE_CHECK
原有產品修正及測試補強接受。不要求修改NOI/NCR共用key或保存機制；本輪只需修正新加到ITR的提示，避免影響其他模組。

## DECISIONS_CHECK
不更動授權、狀態轉換、附件或重試政策。

## VERDICT
- [ ] PASS
- [x] REVISE
- [ ] HUMAN_REQUIRED

## REQUIRED_FIXES
R1（唯一）：ITR保存catch繼續用describeSaveError遮蔽原始5xx，但改用不斷言是否落地的前綴，例如「未能確認保存完成，您填寫的內容仍保留。{message}」。必要ITR專用中英文key可新增，不改共用failedKeep以免擴散。
只做針對性驗證：ITR模擬500及無回應兩種情境，不含原始detail/Network Error、不稱確定未保存，輸入保留與按鈕恢复。無須另建commit後失敗機制、無須重跑全144項或所有模組。產品文案修改執行前端build即可；文件明列哪些為本次新證據、哪些沿用。

## NEXT_STEP
保留所有已接受修改，完成上述單一文案收尾後回審。不開其他功能，不改存檔交易或加去重機制。NOI/NCR既有相同措辭另記錄限制，不混入本次修正。
```

---

## 補存：完整 TASK / STATUS 快照（來源：對話逐字稿，非摘要重建）

原封存的 TASK / STATUS 段落為摘要節錄，且引用「本次對話記錄」這個日後會失效的
參照。以下從本次對話的逐字稿檔案重新取出並補存當時完整內容，逐字核對無誤；
保留上文摘要不刪除，判定不變。

### TASK.md 完整快照

````markdown
# TASK.md — FORMS-CONSISTENCY R1/R2 補正（第二輪）

TASK_ID: FORMS-CONSISTENCY-2026-003
SOURCE_TASK_ID: FORMS-CONSISTENCY-2026-002
狀態：已交辦，待 Claude 執行。本批只處理 R1/R2 兩項，**保留**已接受的九條返回路徑、
保存中狀態、唯讀與樣式比對等既有驗證結果，不重做。

## REQUIRED_FIXES（逐字沿用審查原文）

### R1 — ITR保存錯誤映射
下一批明列 ITR.tsx 保存 catch 為範圍，沿用現有 describeSaveError/getErrorMessage 等
適合的共用映射，使 HTTP 500 不直接顯示原始 detail；保留 modal 與輸入、單一錯誤提示、
按鈕恢復，避免抹掉已有部分保存階段語意。測試等待本次 PUT 並核對本次錯誤 toast 確切
預期文案、明確不含注入的原始 detail。不是只判「文字非空」。其餘三模組已通過的保存
狀態不用重新設計。

### R2 — 身份證據與文件收尾
在每次 deep-link 開啟後用 modal 內 inputValue 核對唯一 subject 或 id；成功保存等待
精確目標 PUT（mod.openId），回應含 id 則核對，獨立重讀核對同一筆。範圍限原有測試，
不追加入口矩陣。
同時修正兩項文件敘述：(a) 新建取消「未新增任何資料」目前只有畫面關閉證據，改窄敘述
或補 0 POST 觀察，不強制擴大 DB 驗證；(b) 新 context 通過證明正常返回路徑成立，支持
先前 history 問題診斷，但不要聲稱排除所有產品返回問題。未增加產品修改的部分不必
重跑全部歷史業務鏈。

## SCOPE
1. `react-app/src/components/ITR/ITR.tsx`：`handleSaveITRDetails` 的 catch 區塊改用
   `describeSaveError`（`react-app/src/utils/saveErrors.ts`）＋
   `t('saveFlow.failedKeep', { message: ... })`，與 NOI/NCR 既有模式一致。保留既有
   `throw error;` 的 re-throw（維持 modal 開啟）、保留檔案上傳部分失敗的既有獨立
   toast（不受此次修改影響）。
2. `react-app/tests-browser/forms-consistency-review.mjs`：
   - Part D：錯誤文案斷言改為精確字串比對（HTTP 500 情境下，三模組預期文字完全
     相同），並明確斷言不包含模擬的原始 detail 字串。
   - Part F（及 Part C 一併處理，確保一致）：身份核對改為讀取 modal 內實際欄位的
     `inputValue()`，不得用整頁文字搜尋；保存等待改為比對 `mod.openId` 的精確 PUT
     URL，若回應 body 含 `id` 則核對等於 `mod.openId`；獨立重讀維持既有作法。
   - Part A2：「取消未新增資料」的斷言改為監聽並斷言該模組建立端點的 POST 請求數
     為 0（不是只看畫面關閉），不擴大為 DB 層級驗證。
3. 執行相應前端檢查（`tsc`/`build`/`test`/`lint`），記錄結果。

## ALLOWED_PATHS
- `react-app/src/components/ITR/ITR.tsx`（限 `handleSaveITRDetails` 的 catch 區塊）
- `react-app/tests-browser/forms-consistency-review.mjs`
- `docs/workflow/`（本輪 handoff/evidence；上一輪 archive 已於本次對話建立）
- `TASK.md` / `STATUS.md` / `REVIEW.md`

## FORBIDDEN_PATHS
- 已接受的驗證邏輯本身（九條返回路徑的 context/known-source 機制、Part B/C/E 的
  明確斷言、Cancel 樣式比對）——只能在上面疊加 R1/R2 要求的修正，不得整段重寫或
  弱化既有斷言
- `react-app/src/components/NOI/**`、`react-app/src/components/NCR/**`（上一輪已
  落地的修正與本輪保存狀態驗證不變，不觸碰）
- `react-app/src/components/ITR/ITRModals.tsx`（上一輪 `displayAsReadOnly` 相關
  修正保留，本輪只動 `ITR.tsx` 的 catch 區塊）
- `navigate(-1)`／`openedViaDeepLinkRef` 等既有返回機制本身
- 後端任何檔案、全域 ESLint 清理、開發資料庫、使用者 8198/3198
- `TASK.md`（上一輪）／`DECISIONS.md`／`AGENTS.md`／任何既有 `docs/workflow/
  *-archive.md`（唯讀）

## ACCEPTANCE_CRITERIA
1. ITR 模擬 500 時，toast 文字與 NOI/NCR 同情境**逐字相同**，且不包含模擬 detail
   原始字串。
2. deep-link 開啟後的身份核對改讀 modal 內欄位值，不使用整頁文字搜尋；保存等待
   精確 record id 的 PUT，回應 id 若存在則核對一致。
3. 新建取消的「未新增資料」改為有 0 POST 的網路層觀察佐證，不是只憑畫面關閉推論。
4. 文件不得用「排除所有產品返回問題」這類過度推論描述 Part F 的新 context 結果。
5. 已接受項目（九條返回路徑、pending 狀態、Cancel 樣式比對、readonly 欄位
   disabled）不重新設計，可在既有基礎上疊加本輪要求的精確化。

## CLAUDE_PRECHECK
1. 已讀 `docs/workflow/FORMS-CONSISTENCY-2026-002-archive.md`（含完整 REVIEW 原文），
   理解 R1/R2 的具體要求。
2. 已讀 `ITR.tsx` 約 217-230 行既有 catch 區塊、`utils/saveErrors.ts` 的
   `describeSaveError`、NOI/NCR 既有的 `saveFlow.failedKeep` 用法，確認修正方式與
   既有模式一致。
3. 隔離環境沿用 8200/3200（非使用者 8198/3198）。
````

### STATUS.md 完整快照

````markdown
# STATUS.md — Claude 執行結果

TASK_ID: FORMS-CONSISTENCY-2026-003
SOURCE_TASK_ID: FORMS-CONSISTENCY-2026-002

## RESULT
- [x] DONE
- [ ] PARTIAL
- [ ] BLOCKED

R1/R2 已補正，詳見下方與 `docs/workflow/FORMS-CONSISTENCY-2026-003-handoff.md`。
**保留**已接受的九條返回路徑、保存中狀態、唯讀與樣式比對，本輪未重做。依本輪乾淨
重跑的動態執行紀錄：**144 checks executed, 144 PASS, 0 FAIL**，完整 log 已存檔。

## 對使用者的改善
ITR 保存失敗（伺服器錯誤）時，不再直接顯示後端的原始錯誤細節；現在和 NOI／NCR 顯示
完全相同的友善文案，輸入內容、按鈕恢復、既有部分保存語意都未改變。

## CLAUDE_PRECHECK 執行記錄
1. 已讀 `docs/workflow/FORMS-CONSISTENCY-2026-002-archive.md`（含完整 REVIEW 原文），
   理解 R1/R2 具體要求。
2. 已讀 `ITR.tsx` 既有 catch 區塊、`utils/saveErrors.ts` 的 `describeSaveError`、
   NOI/NCR 既有的 `saveFlow.failedKeep` 用法，確認修正方式與既有模式一致。
3. 隔離環境沿用 8200/3200（非使用者 8198/3198）。

## R1 修復內容
`react-app/src/components/ITR/ITR.tsx` 的 `handleSaveITRDetails` catch 區塊，從
手動解析 `error.response.data.detail` 直接 toast，改為
`toast.error(t('saveFlow.failedKeep', { message: describeSaveError(error, t) }))`
——與 NOI/NCR 共用同一個工具。`describeSaveError` 對 5xx 永遠回傳固定友善文案、
從不顯示回應本文；4xx 仍維持顯示後端給的具體 detail。既有 `throw error;`
（維持 modal 開啟、輸入不遺失）與檔案上傳部分失敗的獨立 toast 完全未動。

測試面：Part D 的錯誤文案斷言從「非空、不像 JSON」這種寬鬆標準，改為三模組同一
模擬情境下**逐字比對**預期文案，並明確斷言不包含模擬送出的原始 detail 字串。

## R2 修復內容
- 新增 `findFieldWithValue()` 共用輔助函式：讀取 modal 內每個文字欄位的
  `inputValue()` 找出帶有唯一 marker 的那個，取代原本搜尋整頁文字的
  `getByText()`（可能誤判疊在列表上方、列表仍留在 DOM 裡的情況）。Part E 原本
  重複的類似邏輯一併改用這個共用函式。
- Part C／Part F 的 `page.waitForResponse` 從「任何打到這個模組端點的 PUT」改為
  精確比對 `mod.openId`；回應 body 含 `id` 則額外核對等於 `mod.openId`。
- Part A2 新增網路層觀察：監聽該模組建立端點，斷言「新建→取消」整個過程送出的
  POST 數量為 0（不是只看畫面關閉），但如實標註這不是 DB 層級驗證。
- 文件措辭：「排除所有產品返回問題」這類過度推論字眼本來就未使用；本輪再次確認
  並維持「9 條**本輪測試覆蓋到的**路徑」這個限定敘述。

## 隔離環境驗證（已完成，依本輪實際執行紀錄）
- `isolated_stack.py up --port 8200 --vite-port 3200`，沿用既有
  `noi-itr-nav-vite-launcher.mjs`。
- 種子：沿用 `seed_forms_consistency_review.py`（本輪未修改）。
- `forms-consistency-review.mjs`：**144 checks executed, 144 PASS, 0 FAIL**（動態
  計數，完整 log 見 `docs/workflow/FORMS-CONSISTENCY-2026-003-evidence/run.log`）。
- 隔離堆疊已拆除，`lsof` 確認埠號釋放；使用者 8198/3198 全程監聽未受影響。

## FILES_CHANGED
- `react-app/src/components/ITR/ITR.tsx`（catch 區塊改用 `describeSaveError`，
  新增 1 行 import）。
- `react-app/tests-browser/forms-consistency-review.mjs`（新增共用輔助函式、
  精確斷言、POST 數量觀察）。

## FILES_ADDED
- `docs/workflow/FORMS-CONSISTENCY-2026-002-archive.md`（封存上一輪 REVISE 原文）。
- `docs/workflow/FORMS-CONSISTENCY-2026-003-handoff.md`。
- `docs/workflow/FORMS-CONSISTENCY-2026-003-evidence/`（22 張截圖 + `run.log`）。

## FILES_DELETED
無（repo 內無刪除；沙盒暫存目錄的密碼暫存檔與 stack JSON 已刪除，非 repo 檔案）。

## 未修改（沿用既有，說明避免混淆）
- `react-app/src/components/ITR/ITRModals.tsx`：上一輪 `displayAsReadOnly` 相關
  修正保留，本輪未觸碰。
- `react-app/src/components/NOI/**`、`react-app/src/components/NCR/**`：本輪未
  修改。
- `backend/scripts/verification/seed_forms_consistency_review.py`：本輪未修改。
- 既有九條返回路徑的 context/known-source 機制、Part B/C/E 的斷言邏輯主體、
  Cancel 樣式比對：本輪只在上面疊加 R1/R2 要求的精確化，未整段重寫。

## TESTS_RUN
- `npx tsc --noEmit`：通過，0 錯誤。
- `npm run build`：通過（含 tsc，3.61s，輸出至已 gitignore 的 `react-app/dist/`）。
- `npm run lint`：13 個錯誤、21 個警告，與修改前基線相同；本輪修改的檔案不在既有
  錯誤清單中，目前無證據顯示既有錯誤與本輪改動有關，不推論「絕不可能由本輪
  造成」，也不歸因給其他協作者。
- `npm test`（`scripts/run-unit-tests.mjs`）：123/123 全部通過，0 失敗。
- `forms-consistency-review.mjs`：**144 checks executed, 144 PASS, 0 FAIL**（動態
  執行期計數，log 已存檔）。

## RISKS / LIMITATIONS
- Part A2 的「0 POST」只是網路層觀察，不是 DB 層級驗證，未查詢資料庫確認真的沒有
  新增紀錄。
- Part F 驗證的「固定來源頁」仍只用 `/`（Home）；未測試從其他真實業務入口（例如
  FollowUp 或另一模組的 Related Documents）深連結進入的情境，本輪未擴大入口矩陣。
- 沿用上一輪已記錄的限制：只驗證 NOI/ITR/NCR 三個模組；`noi_service.py` 的
  referenceNo 重新編號行為僅查證本輪 fixture 範圍，不代表正式環境不會遇到類似
  情況。

## SAFETY_CHECK
- 未修改 `AGENTS.md`、`DECISIONS.md`、任何既有 `docs/workflow/*-archive.md`。
  `REVIEW.md` 已重置為待審查狀態，**未自行填入任何審查結論**。
- 未修改 `NOI/**`、`NCR/**`、`ITRModals.tsx`、後端任何檔案、`navigate(-1)`／
  `openedViaDeepLinkRef` 等既有返回機制本身。
- 未操作或拆除使用者 8198/3198、日常開發 5173 及其後端；只操作自建隔離堆疊
  （8200/3200，已拆除，`lsof` 確認埠號釋放）。
- 未使用 stash/reset/checkout；未還原協作者既有修改。
- 未 commit/push/部署。
- 未清理全域 lint（依交辦明確不在本輪範圍）。
- 未將任何測試帳密寫入 repo；暫存密碼檔與 stack JSON 已刪除，未讀出或記錄密碼內容
  到任何文件。
````
