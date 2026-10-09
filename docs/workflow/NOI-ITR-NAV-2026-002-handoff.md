# NOI-ITR-NAV-2026-002 — R1/R2 補正

延續 NOI-ITR-NAV-2026-001（REVISE，完整原文見
`docs/workflow/NOI-ITR-NAV-2026-001-archive.md`）。本輪只補兩項 REQUIRED_FIX，範圍不擴大。

**獨立審查結果：PASS**（見 `REVIEW.md`，原文未由 Claude 修改）。本文件已依審查指出的
兩點校正：斷言數原稱 21，已校正為實際 24（腳本 24 處 `assertTrue`，依本輪執行 log
24/24 PASS）；lint 仍為失敗狀態（13 errors／21 warnings），不稱「全部檢查通過」。
NOI-ITR-NAV 系列（001 REVISE → 002 PASS）至此結案，不另開 003。

## R1 — `onOpen` 限定為 ITR，其他文件類型維持原導航

**問題**：上一輪的 `onOpen` callback 對所有 `entityType` 都加上 `?openId=`，這會改變
NOI 面板內非 ITR 關聯文件（例如 NCR）的既有導航，超出「只處理 ITR」的授權範圍。

**修復**：`NOIDetailModal.tsx` 的 `onOpen` 改為：
```tsx
onOpen={(entityType, id) => {
    if (entityType === 'itr') {
        navigate(`/itr?openId=${encodeURIComponent(id)}`);
        return;
    }
    navigate(`/${entityType}`);
}}
```
非 ITR 類型呼叫 `navigate('/'+entityType)`，與 `RelatedDocuments.tsx` 未提供 `onOpen` 時
內建的 `ENTITY_ROUTE` 預設行為完全一致（`entityType` 字串本身就等於路由路徑片段，例如
`'ncr'` → `'/ncr'`），沒有 import 或修改 `ENTITY_ROUTE` 本身。

**驗證**：沿用既有種子資料中 `QTS-NIUP1-NOI-000003` 本來就有的 NCR 關聯
（`niu-ncr-3`/`QTS-NIUP1-NCR-000001`，`NOI<->NCR` 既有關聯邊），點擊後確認：
- 落地在未篩選的 `/ncr` 清單（`http://127.0.0.1:3200/ncr`，**完全沒有任何 query
  string**）——與修復前行為一致。
- 沒有新增任何種子資料。

## R2 — 保存成功的落點，以 PUT 回應＋獨立重讀證明，不再是無條件輸出

**問題**：上一輪的腳本把 remark 填寫失敗 catch 成 log、Save 按鈕不存在就直接跳過，最後
仍無條件輸出「after a successful Save」，沒有任何東西真正證明保存成功；「落點為 /noi」
的說法沒有被獨立證明過。

**修復**：腳本改為完整的證據鏈（`react-app/tests-browser/noi-itr-nav-review.mjs` 的 R2
段落）：
1. 斷言 remark 欄位確實被填入可辨識值（不再 catch 吞掉失敗）。
2. 斷言 Save 按鈕確實存在（不存在就是真實發現，不是跳過）。
3. 用 `page.waitForResponse` 真正等待 `PUT **/api/itr/*` 的回應，斷言
   `response.ok()`（HTTP 200），不是固定等待時間。
4. 斷言回應 JSON 的 `id`（`niu-itr-2`）與 `remark` 欄位值與剛才填入的完全一致——證明
   後端真的把這次送出的值存回去、回顯給前端，不是前端的樂觀假設。
5. **獨立重讀**：用全新的 `page.goto` 重新載入 `/itr`（不是沿用剛才保存後的 UI 狀態），
   手動從清單找到同一筆紀錄重新開啟，斷言 remark 欄位顯示的就是剛才存的值——這才是真正
   的持久化證明，獨立於步驟 3/4 的 PUT 回應。

**保存後落點的根因（本輪新查明，屬於既有程式碼行為，不是本輪新增的機制）**：

一開始重跑舊腳本仍觀察到落點是 `/noi`，但沒有解釋為什麼——`ITR.tsx` 的
`handleSaveITRDetails`（父層 `onSave`）本身只有 `setIsEditModalOpen(false);
setCurrentItrId(null);`，沒有任何 `navigate()` 呼叫，乍看不應該跳轉頁面。用一次性的
instrumented 腳本（記錄 `page.on('framenavigated')` 的精確時間戳）才查明：
`ITRModals.tsx` 的 `handleSave`（第 478-480 行）在 `await onSave(...)` 成功後，**自己
還會呼叫 `onClose()`**：
```tsx
await onSave(formData, pendingUploads, deletedFileIds);
leaveGuard.release();
onClose();
```
而這個 `onClose` prop，就是 `ITR.tsx` 裡那個檢查 `openedViaDeepLinkRef.current` 並呼叫
`navigate(-1)` 的既有函式——跟 Cancel 按鈕走的是**完全同一條**既有路徑，不是另一個機制、
也不是本輪新發現的 bug。這解釋了為什麼保存成功後會回到 `/noi`：不是因為父層的
`setIsEditModalOpen(false)` 本身做了什麼，而是子元件自己的 `handleSave` 在成功後額外呼叫
了 `onClose()`。

這點本輪**只用於解釋測試腳本觀察到的真實行為、寫進斷言的依據**，**沒有修改**
`ITRModals.tsx`／`ITR.tsx` 的任何程式碼——這條路徑原本就存在，本輪只是查清楚並且用
`page.waitForResponse` 與重讀提供了严謹證據，不是新建或修改返回機制。

## 隔離環境驗證（依本輪實際執行紀錄，24 項斷言全數 PASS）

- 環境：`isolated_stack.py up --port 8200 --vite-port 3200`，vite 啟動腳本沿用
  `react-app/tests-browser/noi-itr-nav-vite-launcher.mjs`（啟動前已先讀過內容確認埠號
  為 8200/3200，不是使用者的 8198/3198）。
- 種子：沿用 `seed_noi_itr_ux_review.py`（**未修改**）。
- 驗證腳本：修改既有 `react-app/tests-browser/noi-itr-nav-review.mjs`（同一檔案，沒有
  新建檔名）。腳本原始碼共有 **24 處 `assertTrue` 呼叫**（此為靜態計數，核對原始碼
  本身即可數出）；依本輪實際執行的 log 紀錄（非審查重新執行，是本輪產生腳本時已跑過
  並記錄下來的 log），**24/24 PASS，0 FAIL**，exit code 0：

| 區塊 | 斷言內容 | 數量 | 結果 |
|---|---|---|---|
| AC1a/AC1b | 原始／複驗 ITR 分別點擊，開啟的紀錄確實對應各自目標、關閉後落回 /noi | 8 | PASS |
| **R1** | NCR 關聯存在、點擊後落地在完全未篩選無 query string 的 `/ncr` | 2 | PASS |
| AC3 | 從 deep-link 開啟的 ITR 直接按瀏覽器真實返回，落回 `/noi` | 1 | PASS |
| AC2 | 表單 dirty 時點擊關聯 ITR，Unsaved Changes 彈窗出現、導航被攔截；
  Stay 後輸入保留、未被導航到 /itr | 4 | PASS |
| **R2** | remark 填寫、Save 按鈕存在、PUT 200、PUT 回應 id／remark 核對、modal 關閉、
  落點（根因已查明見上）、獨立重讀持久化 | 9 | PASS |
| **合計** | | **24** | **24 PASS, 0 FAIL** |

9 張截圖見 `docs/workflow/NOI-ITR-NAV-2026-002-evidence/`。

## 前端檢查（本輪重跑，如實列出，不做任何歸因推論）

- `tsc --noEmit`：通過，0 錯誤。
- `npm run lint`：**13 個錯誤、21 個警告**，共 34 個問題。確切錯誤清單（檔案：行:列）：
  - `FollowUpIssue/FollowUpIssue.tsx:121:5` — Unused eslint-disable directive
  - `FollowUpIssue/columns.tsx:249:68` — Expected an assignment or function call and
    instead saw an expression
  - `ITP/ITP.tsx:101:5` — Calling setState synchronously within an effect
  - `ITR/ITR.tsx:86:9` — Calling setState synchronously within an effect
  - `KM/KMModals.tsx:478:17` — 'importedChapters' is never reassigned, use 'const'
  - `MeetingMinutes/MeetingMinutesModals.tsx:484:117` — Irregular whitespace not allowed
  - `NCR/NCR.tsx:86:5` — Calling setState synchronously within an effect
  - `NOI/NOI.tsx:144:5` — Calling setState synchronously within an effect
  - `OBS/OBS.tsx:94:5` — Calling setState synchronously within an effect
  - `PQP/PQP.tsx:79:5` — Calling setState synchronously within an effect
  - `Shared/AppProviders.tsx:48:5` — Unused eslint-disable directive
  - `ui/RelatedDocuments.tsx:78:13` — Calling setState synchronously within an effect
  - `hooks/useWorkflowData.ts:23:9` — Calling setState synchronously within an effect

  本輪**不推論**這些錯誤的成因或起源（上一輪用 `git diff --stat` 推論「本輪未修改的
  檔案」已被審查指出不成立——diff 只能顯示目前未提交的差異，不能證明錯誤是何時、由誰
  引入）；本輪沒有修改這份清單裡的任何檔案，但不代表這能免除或歸因任何責任，純粹
  如實列出 lint 本身回報的結果。本輪也不要求修復這些既有 lint 問題（超出授權範圍）。
- `npm test`（`scripts/run-unit-tests.mjs`）：**123/123 全部通過**，0 失敗。
- **總結：不稱「全部檢查通過」**——`tsc`／`npm test`／本輪瀏覽器驗證三項通過，但
  `npm run lint` 仍為失敗狀態（13 errors／21 warnings），本輪未修復、也不要求修復。

## 風險／限制

- 瀏覽器返回與保存測試只在 Playwright 預設 Chromium 驗證，未測試其他瀏覽器。
- 本輪只驗證了「ITR Save 按鈕存在且可用」這一種情境（`QTS-NIUP1-ITR-000002`，
  status=In Progress，非鎖定狀態）；鎖定狀態（Approved/Void）下 Save 按鈕不存在的情境
  不在本輪範圍內，沒有另外驗證。
- R1 只驗證了 NCR 這一種非 ITR 類型（現有種子資料僅有此關聯）；ITP 類型的非 ITR 導航
  未另外補測資驗證（現有種子資料沒有 ITP 關聯），上一輪 TASK 原文允許「若補最小測資則
  同樣檢查」為可選項，本輪判斷不需要新增種子即可證明 `entityType==='itr'` 分支邏輯本身
  正確（程式碼層級已確認非 itr 分支統一呼叫 `navigate('/'+entityType)`，不因
  entityType 值不同而有差異）。
- 獨立審查指出：`r2-02-independent-reread-after-reload.png` 截圖確認重新開啟的是
  `QTS-NIUP1-ITR-000002`，但截圖本身沒有捲動到 Remark 欄位可見範圍——該欄位重讀斷言
  （`rereadRemarkValue === itrMarker`）是依腳本斷言邏輯與本輪執行 log 回報的結果，
  不冒稱截圖畫面本身顯示了保存值，兩者證據來源不同，保留此區分。
- `noi-itr-nav-review.mjs` 的證據輸出目錄預設值（`OUT` 的 fallback）目前仍硬寫為
  `noi-itr-nav-2026-001-evidence`——本輪與上一輪實際執行時都用
  `NOI_ITR_NAV_REVIEW_EVIDENCE_DIR` 環境變數明確覆寫為對應批次目錄，沒有混入舊截圖，
  但這個 fallback 字串本身沒有同步更新。下次使用這個腳本前，務必明確指定
  `NOI_ITR_NAV_REVIEW_EVIDENCE_DIR`，不要依賴預設值；本輪不因這點重跑或修改腳本。

## 隔離堆疊拆除

- Root：`/private/var/folders/.../qualitas-manual-tbr95hiw`（backend 8200 / vite 3200）。
- `isolated_stack.py down` 執行成功，`lsof` 確認 8200/3200 已釋放；使用者 8198/3198
  全程在監聽、未受任何影響。
- 本輪與上一輪遺留在沙盒暫存目錄（非 repo 內）的密碼暫存檔已刪除
  （`/tmp/noi-itr-nav-pw.txt`、`/tmp/noi-itr-nav-pw2.txt`、兩份 stack JSON），未讀出或
  記錄密碼內容到任何文件。

## 變更檔案

- `react-app/src/components/NOI/modals/NOIDetailModal.tsx`（`onOpen` callback 改為只對
  `entityType==='itr'` 加 `openId`）。
- `react-app/tests-browser/noi-itr-nav-review.mjs`（修改既有檔案：新增 R1 的 NCR 驗證、
  重寫 R2 的保存證據鏈，共 24 項斷言，沒有建立新檔名）。
- `docs/workflow/NOI-ITR-NAV-2026-001-archive.md`（封存上一輪 REVISE 的三份檔案原文）。
- `docs/workflow/NOI-ITR-NAV-2026-002-handoff.md`（本檔）。
- `docs/workflow/NOI-ITR-NAV-2026-002-evidence/`（9 張截圖）。
