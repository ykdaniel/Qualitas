# NOI-ITR-NAV-2026-002 — 封存（原文保留；獨立審查 PASS 結案）

本檔封存 NOI-ITR-NAV-2026-002 這一輪的 TASK.md、STATUS.md、REVIEW.md 原文。依 AGENTS.md
規則，原文保留，不因後續工作修改內容。REVIEW.md 判定為 **PASS**，NOI-ITR-NAV 系列
（001 REVISE → 002 PASS）結案，不另開 003。下一批 NOI-ITR-LABEL-2026-001 處理複驗
ITR 的標示顯示，與本系列的導航修復範圍不同。

審查 PASS 後，使用者對 STATUS.md/handoff 的兩點校正（斷言數 21→24、lint 用語）已直接
反映在 STATUS.md 與 `docs/workflow/NOI-ITR-NAV-2026-002-handoff.md` 本身（非本封存檔），
本封存檔保留校正後的最終版本原文。

---

## TASK.md（原文）

```markdown
# TASK.md — NOI-ITR-NAV R1/R2 補正

TASK_ID: NOI-ITR-NAV-2026-002
SOURCE_TASK_ID: NOI-ITR-NAV-2026-001
狀態：已交辦，待 Claude 執行。本批為 REVISE 後的補正，修改前端程式碼與驗證腳本。

## GOAL
NOI-ITR-NAV-2026-001 獨立審查判定 REVISE（完整原文見
`docs/workflow/NOI-ITR-NAV-2026-001-archive.md`）。本輪只補兩項 REQUIRED_FIX：

- R1：`onOpen` callback 目前對所有 `entityType` 都加上 `?openId=`，這會改變 NOI 面板內
  非 ITR 關聯文件（例如 NCR）的既有導航，超出「只處理 ITR」的授權範圍。必須限定為只有
  `entityType === 'itr'` 才走 deep-link，其餘類型維持原本的 `navigate('/'+entityType)`
  （與未提供 `onOpen` 時 `RelatedDocuments.tsx` 內建的 `ENTITY_ROUTE` 預設行為完全一致）。
- R2：前一輪的「保存成功後落點」驗證不可信——填寫 remark 失敗被 catch 吞掉、Save 按鈕
  不存在就直接跳過，最後仍無條件輸出「after a successful Save」，沒有任何東西真正證明
  保存成功。必須改為：成功填入可辨識值 → 點擊 Save → 等待目標 ITR 的 PUT request 真正
  回應成功 → 核對 response 的 id／該欄位值 → 以同一 id 重新讀取確認已持久化（不是只看
  UI 樂觀狀態）→ 最後核對 modal 已關閉、精確核對當下的 URL pathname（記錄真實值，不得
  預先假設一定是 `/noi`——若實測發現與預期不同，如實回報，不得為了符合預期去新建返回
  機制）。

## SCOPE
1. 修改 `NOIDetailModal.tsx` 的 `onOpen` callback：只有 `entityType === 'itr'` 才呼叫
   `navigate('/itr?openId=' + encodeURIComponent(id))`；其他 `entityType` 呼叫
   `navigate('/' + entityType)`（與 `RelatedDocuments.tsx` 的 `ENTITY_ROUTE` 預設行為
   一致，不需要也不允許 import 或修改 `ENTITY_ROUTE` 本身）。
2. 用既有種子資料中已有的 NCR 關聯（`QTS-NIUP1-NOI-000003` 的 Related Documents 本來就
   會列出 `niu-ncr-3`/`QTS-NIUP1-NCR-000001`，因為 `NOI<->NCR` 既有關聯邊——不需要新增
   種子）驗證：點擊這筆 NCR，行為與修復前完全相同（落地在未篩選的 `/ncr` 清單，不帶
   `openId`，不開啟該筆紀錄）——這是刻意保留的既有行為，不是本輪要修的對象。
3. 重寫保存驗證：用 Playwright 的 `page.waitForResponse` 真正等待
   `PUT **/api/itr/*` 的回應，核對 `response.ok()`、回應 JSON 的 `id` 與剛才填入的欄位
   值一致；再以同一 id 重新開啟（例如重新導向 `?openId=` 或重新從清單點開）確認欄位值
   已持久化；最後記錄 modal 關閉後的精確 URL pathname（不預設結果）。
4. 重跑 `tsc --noEmit`、`npm run lint`、`npm test`，lint 失敗如實列出確切數字與檔案，
   不得用「這些檔案本輪未修改」之類的 `git diff --stat` 推論去歸因或免責。
5. 同步修正交接文件與前一輪遺留的「只影響 ITR」「保存驗證範圍外」等不準確陳述。

## ALLOWED_PATHS
- `react-app/src/components/NOI/modals/NOIDetailModal.tsx`
- `react-app/tests-browser/noi-itr-nav-review.mjs`（修改既有，不須重新建立新檔名）
- `react-app/tests-browser/noi-itr-nav-vite-launcher.mjs`（沿用既有，啟動前先核對埠號
  設定為 8200/3200，不是使用者的 8198/3198）
- `docs/workflow/`（本輪 handoff/evidence 更新；archive 已於本次對話建立）
- `TASK.md` / `STATUS.md` / `REVIEW.md`

## FORBIDDEN_PATHS
- `backend/**` 所有既有檔案
- `react-app/src/components/ui/RelatedDocuments.tsx`（`ENTITY_ROUTE` 不可修改或 export）
- 其他模組的 `RelatedDocuments` 呼叫端（ITP/NCR/ITR 自己的）
- `react-app/src/components/Shared/LeaveGuard.tsx`
- `react-app/src/components/NOI/NOI.tsx`、`react-app/src/components/ITR/ITR.tsx`
  （既有 deep-link／`navigate(-1)` 機制已確認無需修改，本輪不得因為保存落點跟預期不同
  而「新建」或「修改」返回機制——只能如實記錄）
- `TASK.md`（上一輪）／`DECISIONS.md`／`AGENTS.md`／任何既有
  `docs/workflow/*-archive.md`／`docs/workflow/NOI-ITR-UX-2026-00{1,2}-handoff.md`（唯讀）

## ACCEPTANCE_CRITERIA
1. 點擊原始 ITR／複驗 ITR 仍分別開啟正確紀錄（沿用前一輪已驗證通過的斷言，不須重新
   設計，但要保留在腳本內一起跑一次確認沒有因為 R1 的修改而退化）。
2. 點擊 NOI 面板內的非 ITR 關聯文件（NCR），確認導航行為與修復前相同：沒有
   `?openId=`、落地在該文件類型的未篩選清單。
3. 保存成功的證據鏈完整：PUT 回應成功 + 回應欄位核對 + 重讀持久化核對，三者缺一不可；
   不得用固定等待時間或 URL 字串包含關係代替。
4. 最終的 modal-close／browser-back landing point 以實測結果原樣記錄，不預設、不迎合
   先前錯誤的「落回 /noi」說法。
5. lint 錯誤如實列出確切數字（檔名＋錯誤訊息），不使用 `git diff --stat` 或任何其他
   推論方式去歸因成因或免除本輪責任。
6. 其餘未變更範圍與前一輪相同：不改後端、不擴大共用元件、不加複驗徽章。

## CLAUDE_PRECHECK
1. 已讀 `docs/workflow/NOI-ITR-NAV-2026-001-archive.md`（含完整 REVIEW 原文），理解
   R1/R2 的具體要求，不得重新臆測或擴大範圍。
2. 已讀 `backend/scripts/verification/seed_noi_itr_ux_review.py`，確認
   `QTS-NIUP1-NOI-000003` 已有一筆既存的 NCR 關聯（`niu-ncr-3`），R1 驗證可直接沿用，
   不須新增種子。
3. 已讀 `backend/routers/itr.py` 確認 PUT 端點為 `/{itr_id}`（即前端呼叫的
   `/api/itr/{id}`），已讀 `backend/schemas.py` 確認回應 model 含 `id`／`remark` 欄位，
   可用於 R2 的回應核對。
4. 啟動隔離環境前，先讀 `noi-itr-nav-vite-launcher.mjs` 內容確認埠號為 8200/3200，
   不是使用者的 8198/3198，避免重複上一輪第一次嘗試時的埠號衝突錯誤。
5. 清除本批不再需要的暫存憑證檔（上一輪遺留在沙盒暫存目錄的密碼檔），不讀出或記錄
   密碼內容到任何文件。
```

## STATUS.md（原文，含 PASS 後校正的最終版本）

```markdown
# STATUS.md — Claude 執行結果

TASK_ID: NOI-ITR-NAV-2026-002
SOURCE_TASK_ID: NOI-ITR-NAV-2026-001

## RESULT
- [x] DONE
- [ ] PARTIAL
- [ ] BLOCKED

R1/R2 兩項 REQUIRED_FIX 已補正並在獨立隔離環境以 24 項斷言實測通過，詳見下方與
`docs/workflow/NOI-ITR-NAV-2026-002-handoff.md`。獨立審查已判定 **PASS**（見
`REVIEW.md`）；本節為本輪執行時的原始紀錄，PASS 後僅校正「21」應為「24」與 lint
措辭兩處，其餘內容未變。

## CLAUDE_PRECHECK 執行記錄
1. 已讀 `docs/workflow/NOI-ITR-NAV-2026-001-archive.md`（含完整 REVIEW 原文），理解
   R1/R2 的具體要求。
2. 讀 `seed_noi_itr_ux_review.py` 確認 `QTS-NIUP1-NOI-000003` 已有既存 NCR 關聯
   （`niu-ncr-3`），R1 驗證可直接沿用，未新增種子。
3. 讀 `backend/routers/itr.py` 確認 PUT 端點為 `/{itr_id}`，讀 `backend/schemas.py`
   確認回應 model 含 `id`／`remark` 欄位，可用於 R2 的回應核對。
4. 啟動隔離環境前先讀 `noi-itr-nav-vite-launcher.mjs` 內容確認埠號為 8200/3200。
5. 刪除上一輪遺留在沙盒暫存目錄（非 repo 內）的密碼暫存檔。

## R1 修復內容
`NOIDetailModal.tsx` 的 `onOpen` callback 改為：
```tsx
onOpen={(entityType, id) => {
    if (entityType === 'itr') {
        navigate(`/itr?openId=${encodeURIComponent(id)}`);
        return;
    }
    navigate(`/${entityType}`);
}}
```
非 ITR 類型呼叫 `navigate('/'+entityType)`，與 `RelatedDocuments.tsx` 未提供 `onOpen`
時內建 `ENTITY_ROUTE` 的預設行為完全一致。驗證：點擊既有種子資料中的 NCR 關聯，落地在
完全未篩選、無 query string 的 `/ncr`，與修復前行為一致。

## R2 修復內容
重寫 `noi-itr-nav-review.mjs` 的保存驗證段落，建立完整證據鏈：
1. 斷言 remark 欄位確實填入成功（不再 catch 吞掉失敗）。
2. 斷言 Save 按鈕確實存在。
3. `page.waitForResponse` 真正等待 `PUT **/api/itr/*`，斷言 `response.ok()`（HTTP 200）。
4. 斷言回應 JSON 的 `id`／`remark` 欄位與填入值一致。
5. **獨立重讀**：全新 `page.goto` 重新載入 `/itr`，手動重新開啟同一筆紀錄，斷言 remark
   欄位顯示剛才存的值——真正的持久化證明，不依賴剛保存後的 UI 狀態。

**根因查明（既有程式碼行為，本輪未修改任何返回機制）**：用一次性 instrumented 腳本
（記錄 `page.on('framenavigated')` 時間戳）查明保存成功後落回 `/noi` 的真正原因：
`ITRModals.tsx` 的 `handleSave`（第 478-480 行）在 `onSave()` 成功後自己呼叫
`onClose()`，而這正是 `ITR.tsx` 裡檢查 `openedViaDeepLinkRef` 並呼叫 `navigate(-1)`
的既有函式——跟 Cancel 按鈕走的是同一條既有路徑，不是另一個機制。本輪只查明並用證據
確認這個既有行為，沒有修改 `ITRModals.tsx`／`ITR.tsx`。

## 隔離環境驗證（已完成）
- `isolated_stack.py up --port 8200 --vite-port 3200`，啟動前已核對
  `noi-itr-nav-vite-launcher.mjs` 埠號設定正確（8200/3200，非使用者 8198/3198）。
- 種子：沿用 `seed_noi_itr_ux_review.py`（未修改）。
- `noi-itr-nav-review.mjs`：腳本共 24 處 `assertTrue` 呼叫（原始／複驗 ITR 8、
  R1 的 NCR 2、瀏覽器返回 1、dirty/Stay 4、保存與重讀 9），依本輪實際執行紀錄
  **24/24 PASS，0 FAIL**，exit code 0；9 張截圖見
  `docs/workflow/NOI-ITR-NAV-2026-002-evidence/`。
- 隔離堆疊（8200/3200）已拆除，`lsof` 確認埠號釋放；使用者 8198/3198 全程監聽未受影響。

## FILES_CHANGED
- `react-app/src/components/NOI/modals/NOIDetailModal.tsx`（`onOpen` callback 改為只對
  `entityType==='itr'` 加 `openId`，R1）。
- `react-app/tests-browser/noi-itr-nav-review.mjs`（新增 R1 的 NCR 驗證、重寫 R2 的
  保存證據鏈，共 24 項斷言）。

## FILES_ADDED
- `docs/workflow/NOI-ITR-NAV-2026-001-archive.md`（封存上一輪 REVISE 的三份檔案原文）。
- `docs/workflow/NOI-ITR-NAV-2026-002-handoff.md`（本輪交接文件）。
- `docs/workflow/NOI-ITR-NAV-2026-002-evidence/`（9 張截圖）。

## FILES_DELETED
無（repo 內無刪除；沙盒暫存目錄的密碼暫存檔已刪除，非 repo 檔案）。

## TESTS_RUN
- `npx tsc --noEmit`：通過，0 錯誤。
- `npm run lint`：**13 個錯誤、21 個警告**（共 34 個問題）。確切清單（檔案:行:列）：
  `FollowUpIssue/FollowUpIssue.tsx:121:5`、`FollowUpIssue/columns.tsx:249:68`、
  `ITP/ITP.tsx:101:5`、`ITR/ITR.tsx:86:9`、`KM/KMModals.tsx:478:17`、
  `MeetingMinutes/MeetingMinutesModals.tsx:484:117`、`NCR/NCR.tsx:86:5`、
  `NOI/NOI.tsx:144:5`、`OBS/OBS.tsx:94:5`、`PQP/PQP.tsx:79:5`、
  `Shared/AppProviders.tsx:48:5`、`ui/RelatedDocuments.tsx:78:13`、
  `hooks/useWorkflowData.ts:23:9`。**本輪不推論這些錯誤的成因或起源**（上一輪用
  `git diff --stat` 推論「本輪未修改的檔案」已被審查指出不成立），純粹如實列出 lint
  本身回報的結果，不要求本輪修復（超出授權範圍）。
- `npm test`（`scripts/run-unit-tests.mjs`）：**123/123 全部通過**，0 失敗。
- `noi-itr-nav-review.mjs`（隔離瀏覽器驗證）：腳本共 24 處 `assertTrue`，依本輪實際
  執行紀錄 **24/24 PASS**，0 FAIL。
- **以上四項不可合稱「全部檢查通過」**：lint 仍為失敗狀態（13 errors／21 warnings），
  只有 tsc／npm test／本輪瀏覽器驗證三項通過。

## RISKS / LIMITATIONS
- 瀏覽器返回與保存測試只在 Playwright 預設 Chromium 驗證。
- Save 按鈕驗證只覆蓋「存在且可用」的情境（In Progress 狀態）；鎖定狀態（Approved/
  Void）下 Save 按鈕不存在的情境未另外驗證，不在本輪範圍。
- R1 只驗證了 NCR 這一種非 ITR 類型（現有種子資料僅有此關聯）；ITP 類型未另外補測資，
  但程式碼層級已確認非 itr 分支統一呼叫 `navigate('/'+entityType)`，不因 entityType
  不同而有差異。

## SAFETY_CHECK
- 未修改 `AGENTS.md`、`DECISIONS.md`、任何既有 `docs/workflow/*-archive.md`、
  `docs/workflow/NOI-ITR-UX-2026-00{1,2}-handoff.md`（唯讀）。`REVIEW.md` 當時已重置為
  待審查狀態、未自行填入任何審查結論；獨立審查現已判定 **PASS**（原文見
  `REVIEW.md`，未由 Claude 修改或覆寫）。
- 未修改 `RelatedDocuments.tsx`、`ITR.tsx`、`NOI.tsx`、`LeaveGuard.tsx`、後端任何檔案。
- 未操作或拆除使用者 8198/3198、日常開發 5173 及其後端；只操作自建隔離堆疊
  （8200/3200，已拆除，`lsof` 確認埠號釋放，且核對 8198/3198 全程仍在監聽）。
- 未使用 stash/reset/checkout；未還原協作者既有修改。
- 未 commit/push/部署。
- 未將任何測試帳密寫入 repo；上一輪與本輪遺留在沙盒暫存目錄（非 repo）的密碼暫存檔
  已刪除，未讀出或記錄密碼內容到任何文件。
```

## REVIEW.md（原文，完整保留）

```markdown
# REVIEW.md — 獨立審查

TASK_ID: NOI-ITR-NAV-2026-002
SOURCE_TASK_ID: NOI-ITR-NAV-2026-001
審查日期：2026-10-03

## EVIDENCE_CHECK
已讀 TASK、STATUS、handoff、完整 noi-itr-nav-review.mjs，核對 NOIDetailModal callback 與 RelatedDocuments 的 ENTITY_ROUTE，查看重新開啟 ITR 截圖；另執行 node --check 通過。本審查未獨立重跑隔離瀏覽器、tsc、npm test 或 lint，執行結果引用 Claude 本輪紀錄。

- R1：僅 itr 分支加入 openId；其他分支 /{entityType} 與目前 ENTITY_ROUTE 的四種路徑一致。NCR 有精確無 query URL 的回歸斷言，ITP 未另行瀏覽器驗證的限制已揭露。
- R2：填寫失敗不再被吞掉；Save 缺失會記錄失敗並最終非零退出。腳本等待 PUT 成功回應、核對 id=niu-itr-2 及 remark，再以完整 page.goto 重新載入列表、選回同一文件編號核對值；與先前單純保存後 UI 樂觀狀態不同，足以支持本批持久化驗收。
- 另斷言 ITR 視窗關閉及保存後返回 /noi；原始／複驗紀錄分別開啟、dirty/Stay 保留輸入與瀏覽器返回案例保留。
- 重讀截圖確認開啟的是 ITR-000002，但截圖未捲到 Remark，該欄位重讀依腳本及執行回報，不冒稱截圖顯示保存值。
- 文件稱 21 項，現行腳本有 24 處 assertTrue 呼叫：原始／複驗 8、NCR 2、瀏覽器返回 1、dirty/Stay 4、保存與重讀 9。這是靜態計數，非本審查重新執行通過數；結案文件應對照原執行紀錄校正。
- lint 仍為失敗（回報 13 errors／21 warnings），不可稱全部檢查通過。tsc 與 123 項單元測試通過屬 Claude 執行證據；全域 lint 問題保留，不擴張本批修復範圍。

## SCOPE_CHECK
本輪產品修正限 NOI 呼叫端分支，未新增返回機制、複驗標示、後端規則或共用元件修改。共享工作目錄既有修改不歸屬本輪。
本審查僅寫 REVIEW.md，未操作服務、資料庫或使用者環境。隔離拆除與暫存憑證清理由執行者回報，未宣稱本審查重新驗證。

## DECISIONS_CHECK
沿用現有授權、離開保護與 deep-link 返回機制；未增加業務政策。PASS 限本批導航修正，不代表全站導航或全域 lint 已驗收。

## VERDICT
- [x] PASS
- [ ] REVISE
- [ ] HUMAN_REQUIRED
R1/R2 已補正，無阻擋本批結案的產品或驗收缺口。

## REQUIRED_FIXES
無需再開產品／補測批次。結案時依既有執行紀錄校正斷言數；若沒有可核對的完整執行輸出，就分別寫「回報執行成功」與「現行腳本靜態 24 處呼叫」，不要直接宣稱 24/24 已重跑。

## NEXT_STEP
Claude 同步 handoff 與 STATUS 的 PASS、斷言數及 lint 仍失敗的事實，保留歷次 REVISE 與未測限制。證據輸出預設仍指向 001 暫存目錄，下一次使用前須指定新批次專屬目錄，避免混入舊截圖；不因這點重跑本批。
不另開 NOI-ITR-NAV-2026-003、不再改產品或重跑測試。完成文件同步後停止，不 commit/push/部署。
```
