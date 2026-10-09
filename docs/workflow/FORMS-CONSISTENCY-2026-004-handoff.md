# FORMS-CONSISTENCY-2026-004 — ITR 保存失敗文案（唯一 R1）

延續 FORMS-CONSISTENCY-2026-003（REVISE，唯一新增問題，完整原文見
`docs/workflow/FORMS-CONSISTENCY-2026-003-archive.md`）。本輪只處理這一項，**不
重跑**上一輪已接受的 144 項驗證（`forms-consistency-review.mjs` 本輪完全未修改、
未執行）。

## 對使用者的改善

ITR 保存失敗時，畫面文字不再斷言「確定未保存」。之前（上一輪）統一套用 NOI/NCR
共用的「Not saved — everything you entered is kept.」字首，但 ITR 的保存失敗
catch 同時涵蓋「完全沒收到回應」（例如連線中斷、逾時）這種情況——這種情況下系統
其實**不知道**後端到底有沒有寫入成功，只是這次沒收到確認。用「Not saved」這麼
肯定的字眼去描述一個「不確定」的狀態，是不準確的。現在改成「Could not confirm
the save completed — what you entered is still kept here.」（未能確認保存是否
完成，您填寫的內容仍保留在這裡），不管是伺服器錯誤還是完全無回應，都不會誤導
使用者以為系統「確定知道」資料沒有寫入。

## 根因與修正範圍

**問題**：上一輪（FORMS-CONSISTENCY-2026-003）把 ITR 的保存失敗 catch 改成與
NOI/NCR 共用 `saveFlow.failedKeep`（"Not saved — ..."）。但這個 catch 區塊不只
處理「後端明確拒絕」（4xx，確實沒有寫入）的情況，也處理「請求根本沒有收到回應」
（網路錯誤、逾時、連線中斷——`error.response` 為 `undefined`）的情況。對後者，
系統無法確定後端到底有沒有先寫入成功才斷線，用「Not saved」描述這種不確定狀態
是過度確定的宣稱。

**修正**（只動 ITR，不動共用 key，不動 NOI/NCR）：

1. `react-app/src/context/LanguageContext.tsx` 新增 ITR 專用 key
   `itr.saveNotConfirmed`：
   - en: `"Could not confirm the save completed — what you entered is still kept here. {message}"`
   - zh: `"未能確認保存是否完成，您填寫的內容仍保留在這裡。{message}"`
   `saveFlow.failedKeep`（NOI/NCR 繼續使用）完全未修改。
2. `react-app/src/components/ITR/ITR.tsx` 的 `handleSaveITRDetails` catch 區塊，
   把 `t('saveFlow.failedKeep', {...})` 換成 `t('itr.saveNotConfirmed', {...})`；
   `describeSaveError(error, t)` 的呼叫方式完全不變（繼續對 5xx 回傳固定友善文字，
   不洩漏原始回應本文；對 4xx 仍回傳後端給的具體 detail；對無回應則回傳
   `saveFlow.network`「Network error. Check the connection and try again.」——這句
   本身也沒有斷言「未保存」，只描述連線本身失敗，與新的 ITR 字首組合起來語意
   一致）。既有 `throw error;`（維持 modal 開啟、保留輸入）與檔案上傳部分失敗的
   獨立 toast 完全未動。

## 新增證據（本輪，範圍限定兩種情境）

新建 `react-app/tests-browser/forms-consistency-itr-save-wording-review.mjs`——
**小範圍**腳本，只測 ITR，兩種情境，**不是**對 `forms-consistency-review.mjs`
144 項的重跑或取代：

- **情境 A：模擬 HTTP 500**（`route.fulfill({status:500, body:{detail: 一段
  獨特識別字串}})`）——斷言 toast 文字逐字等於新文案＋`describeSaveError` 對
  500 的既有友善文字；不含模擬送出的原始 detail 字串；不含「Not saved」；
  modal 保持開啟；輸入保留；Save/Cancel 按鈕恢復可點擊、文字恢復正常。
- **情境 B：完全無回應**（`route.abort('failed')`，讓 axios 收到的
  `error.response` 為 `undefined`，模擬真實的網路中斷/逾時）——斷言 toast 文字
  逐字等於新文案＋`saveFlow.network`；不含「Not saved」；不洩漏原始錯誤物件或
  堆疊內容；modal 保持開啟；輸入保留；按鈕恢復。

**本輪實際執行結果**：**18 checks executed, 18 PASS, 0 FAIL**（動態計數，完整
log 與兩張截圖見 `docs/workflow/FORMS-CONSISTENCY-2026-004-evidence/`）。

## 沿用的既有證據（本輪未重新驗證，明確區分）

以下全部沿用 FORMS-CONSISTENCY-2026-003 的既有結論，**本輪未重跑、未重新驗證**：
- `forms-consistency-review.mjs` 的 144 checks（九條返回路徑、pending 狀態、
  Cancel 樣式比對、readonly 欄位 disabled、新建取消的 0 POST 觀察、deep-link
  身份核對、精確 PUT 目標與回應 id 核對、獨立重讀）。
- ITR 鎖定記錄的 View ITR／Close 文案、保存中 Saving 文字與按鈕停用狀態（上一輪
  已修正，與本輪的文案調整無關，未受影響）。
- NOI／NCR 的 `saveFlow.failedKeep` 既有文案與行為——**本輪未改動，也未重新
  驗證**；若未來有需要討論 NOI/NCR 是否也該改用不確定性文案，是另一個獨立的
  決策，不在本輪範圍內，也沒有在本輪做出任何這方面的判斷。

## 前端檢查

- `tsc --noEmit`：通過，0 錯誤（含在 `npm run build` 內）。
- `npm run build`：通過（3.62s，輸出至已 gitignore 的 `react-app/dist/`）。
- 本輪未執行 `npm test`／`npm run lint`／其他前端套件——審查明確表示「無須重跑
  全144項或所有模組」，且本輪唯一的產品修改是一個 i18n 字串替換與對應 key，
  `npm test`（純函式單元測試，不涉及此文案）與 lint 基線沒有理由受影響，依
  交辦範圍不重跑。

## 隔離環境驗證

- `isolated_stack.py up --port 8200 --vite-port 3200`，沿用既有
  `noi-itr-nav-vite-launcher.mjs`。
- 種子：沿用 `seed_forms_consistency_review.py`（本輪未修改）。
- 隔離堆疊已拆除，`lsof` 確認埠號釋放；使用者 8198/3198 全程監聽未受影響。

## 變更檔案

- `react-app/src/context/LanguageContext.tsx`（新增 `itr.saveNotConfirmed` 一個
  key，en/zh 兩處）。
- `react-app/src/components/ITR/ITR.tsx`（catch 區塊的 toast key 替換，1 行）。
- `react-app/tests-browser/forms-consistency-itr-save-wording-review.mjs`
  （新建，小範圍驗證腳本）。
- `docs/workflow/FORMS-CONSISTENCY-2026-003-archive.md`（封存上一輪原文）。
- `docs/workflow/FORMS-CONSISTENCY-2026-004-handoff.md`（本檔）。
- `docs/workflow/FORMS-CONSISTENCY-2026-004-evidence/`（2 張截圖＋`run.log`）。

`react-app/tests-browser/forms-consistency-review.mjs`、
`backend/scripts/verification/seed_forms_consistency_review.py`、NOI/NCR 相關
檔案本輪**完全未修改**。
