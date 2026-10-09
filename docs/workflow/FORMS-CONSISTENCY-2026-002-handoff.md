# FORMS-CONSISTENCY-2026-002 — R1-R4 補正

延續 FORMS-CONSISTENCY-2026-001（REVISE，完整原文見
`docs/workflow/FORMS-CONSISTENCY-2026-001-archive.md`）。本輪**保留**上一輪已落地的
產品修正（ITR `displayAsReadOnly`／標題／Cancel 文字／保存狀態，NCR i18n key），只
重寫驗證腳本本身與文件措辭，依審查 R1-R4 逐項補正。

## R1 — 核心修復改為明確斷言，補保存證據鏈

- Part B：鎖定紀錄的標題與 Cancel/Close 文字改為**精確相等**斷言（`heading ===
  'View ITR'`、`cancelCloseText === 'Close'` 等），不是只判斷「不是 Edit」。
- Part C：pending 狀態的 Saving 文字（`=== 'Saving...'`）、Save disabled、Cancel/Close
  disabled 三者全部改為會失敗的明確 `assertTrue`，不再只是 `log()`。解除延遲後改用
  `page.waitForResponse` 等到真正的 PUT 回應，斷言 `response.ok()`；再用全新導航
  （`page.goto` 回列表、重新點擊同一筆紀錄）獨立重讀剛才存的值，確認已持久化。
- Part D：新增兩類斷言——(a) 錯誤提示本身：有 sonner toast 出現、文字可讀（非空、不
  是以 `{` 開頭的原始 JSON、不含 "Traceback"）；(b) 按鈕恢復：失敗後 Save 按鈕重新
  變回可點擊且文字回到 "Save"（不是卡在 "Saving..."），Cancel/Close 也重新可點擊。

## R2 — 可判定的返回測試（Part F 整段重寫）

每個模組的每種返回情境（取消／瀏覽器返回／成功保存）**各自使用全新的
`browser.newContext()`**，流程改為：
1. 全新 context 登入。
2. `page.goto('${BASE}/')`（Home，一個固定、已知、登入後可直接到達的來源頁）並斷言
   URL 精確等於這個來源頁。
3. `page.goto('${BASE}${path}?openId=...')` 進入指定紀錄，用 modal 內的唯一 marker
   斷言開啟的是正確那一筆。
4. 執行該情境的操作（取消／`page.goBack()`／成功保存）。
5. 斷言最終 URL **精確等於**步驟 2 的來源頁 URL（不是「不包含某字串」這種寬鬆判斷）。

這解決了上一輪 Part F 共用單一瀏覽器分頁、沒有固定來源、`navigate(-1)` 回到的是「這個
分頁截至目前為止累積的某個歷史紀錄」而非語意上的「使用者真正從哪裡進來」的問題。

**乾淨重跑結果**：NOI／ITR／NCR 三個模組的三種返回情境（共 9 條路徑）**全部精確
返回到已知來源頁**，包括上一輪在共用 history 情境下失敗的 NCR。這證實了上一輪
REVIEW 的提醒是對的——不能只憑「看起來合理」就把 NCR 的失敗定性為測試假象；現在是
用乾淨、可重現的方法**證明**了這一點，而不是用舊的 NOI→ITR 證據代替本輪 NCR 自己的
三條路徑。**沒有修改任何返回相關的產品程式碼**（`navigate(-1)`／
`openedViaDeepLinkRef` 機制本身完全未動）。

## R3 — 補齊漏掉的查核

- Part A2（新建）：三模組各自點擊「Add New X」、斷言彈窗標題精確等於 "Add NOI"／
  "Add ITR"／"Add NCR"，不填寫任何欄位直接按 Cancel，斷言不會誤跳「Unsaved Changes」
  提示、彈窗確實關閉。全程不填寫、不送出任何資料，沒有新增任何紀錄。
- Part E（唯讀帳號）：新增標題精確相等斷言；新增代表性主欄位（Subject，帶著該筆
  紀錄的 marker）確實被 disabled 的斷言（過程中發現 NCR 的 Subject 欄位是用
  react-hook-form 的 `register()` 綁定、不會把目前值反映在 DOM 的 `value`
  **屬性**上，只存在於即時的 DOM 屬性——`input[value=...]` 這種 CSS 選擇器找不到它；
  改用逐一讀取每個文字欄位的 `inputValue()` 比對 marker，三個模組統一適用，這是
  測試腳本本身的修正，不是產品問題）。
- Part A：補上 Cancel 按鈕的尺寸／顏色跨模組比對（上一輪只比對了 Save）。

## R4 — 檢查與紀錄

- 腳本改用執行期累加的 `totalChecks`／`failures` 計數器，結案訊息改為
  `"${totalChecks} checks executed, ${totalChecks - failures} PASS, ${failures} FAIL"`
  ——這是**實際執行次數**，不是原始碼裡 `assertTrue(` 呼叫點的靜態計數（上一輪的
  "32項" 就是後者，已被審查正確指出不對應實際執行）。
- 完整執行 log 已存檔：`docs/workflow/FORMS-CONSISTENCY-2026-002-evidence/run.log`，
  與 22 張截圖放在同一個 evidence 目錄。
- 本輪執行了 `npm run build`（上一輪 STATUS 只有 `tsc --noEmit`），結果見下方
  TESTS_RUN，輸出到 `react-app/dist/`（已在 `.gitignore`，確認不影響 git 狀態）。
- 文件措辭修正：
  - 不再使用「已證實假性失敗」這種過度結論；上一輪的 NCR FAIL 現在是用乾淨重跑
    的正面證據（9 條路徑全部精確返回）確認，不是用推論排除。
  - 「未修改任何後端檔案」改為精確陳述：**未修改後端產品邏輯**；
    `backend/scripts/verification/seed_forms_consistency_review.py`
    是隔離測試種子腳本，不是產品程式碼，但它本身是一個 repo 內的檔案，說「未修改
    任何後端檔案」不精確。
  - 明確說明：上一輪查證的 `referenceNo`／ITR 400 問題，結論僅限於「本輪種子資料
    自己選用了一個不符合系統自動產生格式的編號，觸發了既有的重新編號分支」這個
    範圍；**不代表**正式環境或其他情境不可能出現類似的 reference 字串不匹配問題
    ——本輪沒有也不需要去驗證這件事在正式環境發生的機率，只是如實說明本輪查到的
    根因僅限於本輪 fixture。

## 隔離環境驗證（依本輪實際執行紀錄）

- 環境：`isolated_stack.py up --port 8200 --vite-port 3200`，沿用既有
  `noi-itr-nav-vite-launcher.mjs`。
- 種子：沿用 `seed_forms_consistency_review.py`（上一輪已修正 NOI referenceNo 格式
  與 NCR 必填欄位，本輪未再修改）。
- 重寫後的 `forms-consistency-review.mjs`：**132 checks executed, 132 PASS, 0
  FAIL**（動態計數，見 `run.log`）。
- 隔離堆疊已拆除，`lsof` 確認埠號釋放；使用者 8198/3198 全程監聽未受影響。

## 前端檢查

- `tsc --noEmit`：通過，0 錯誤。
- `npm run build`：通過（`vite build`，含 tsc，3.62s，輸出至
  `react-app/dist/`，已在 `.gitignore`）。
- `npm run lint`：13 個錯誤、21 個警告，與修改前基線相同；本輪修改的檔案（僅測試
  腳本本身，本輪未再改動任何產品程式碼）不在既有錯誤清單中，目前無證據顯示這些
  既有錯誤與本輪改動有關，不推論「絕不可能由本輪造成」，也不歸因給其他協作者。
- `npm test`（`scripts/run-unit-tests.mjs`）：123/123 全部通過，0 失敗。

## 產品修正範圍（沿用上一輪，本輪未重寫）

`react-app/src/components/ITR/ITRModals.tsx`、`react-app/src/components/NCR/
NCRModals.tsx`、`react-app/src/context/LanguageContext.tsx` 這三個檔案的修改內容與
上一輪完全相同，未在本輪重新觸碰。完整修正內容見
`docs/workflow/FORMS-CONSISTENCY-2026-001-archive.md` 封存的原始 STATUS.md。

## 變更檔案（本輪）

- `react-app/tests-browser/forms-consistency-review.mjs`（整段重寫：動態計數、
  明確斷言、Part F 全新 context、Part A2 新建查核、Part E 欄位 disabled 查核、
  Part A Cancel 樣式比對）。
- `docs/workflow/FORMS-CONSISTENCY-2026-001-archive.md`（封存上一輪 REVISE 原文）。
- `docs/workflow/FORMS-CONSISTENCY-2026-002-handoff.md`（本檔）。
- `docs/workflow/FORMS-CONSISTENCY-2026-002-evidence/`（22 張截圖＋完整執行
  `run.log`）。

`backend/scripts/verification/seed_forms_consistency_review.py` 本輪**未修改**（沿用
上一輪已修正的版本）。
