# FORMS-CONSISTENCY-2026-004 — 封存（原文保留；獨立審查 PASS 結案）

本檔封存 FORMS-CONSISTENCY-2026-004 這一輪的 TASK.md、STATUS.md、REVIEW.md 原文。依
AGENTS.md 規則，原文保留，不因後續工作修改內容。REVIEW.md 判定為 **PASS**，
FORMS-CONSISTENCY 系列（001 REVISE → 002 REVISE → 003 REVISE → 004 PASS）結案，
**不再重跑**。

**維護注意（審查原文已指出，轉錄於此避免日後遺忘）**：舊
`react-app/tests-browser/forms-consistency-review.mjs` 的 Part D 仍假設三模組
（NOI/ITR/NCR）保存失敗時都顯示 `saveFlow.failedKeep`（"Not saved..."）這句話——
但 ITR 從 FORMS-CONSISTENCY-2026-004 起已改用 `itr.saveNotConfirmed`
（"Could not confirm the save completed..."），這份舊腳本對 ITR 的斷言已經過時。
它記錄的 144 項是歷史證據，**不代表**現行版本重跑這份腳本仍然全部通過。日後若要
重新執行這整套 144 項，必須先同步 ITR 的預期文字，否則會在 Part D 的 ITR 情境上
誤判為失敗。

---

## TASK.md（原文，節錄要點；完整原文見本次對話記錄）

```markdown
# TASK.md — ITR 保存失敗文案（唯一 R1）
TASK_ID: FORMS-CONSISTENCY-2026-004
SOURCE_TASK_ID: FORMS-CONSISTENCY-2026-003
（完整 REQUIRED_FIXES/SCOPE/ALLOWED_PATHS/FORBIDDEN_PATHS/ACCEPTANCE_CRITERIA/
CLAUDE_PRECHECK 逐字原文見本次對話記錄。）
```

## STATUS.md（原文，節錄要點；完整原文見本次對話記錄）

```markdown
# STATUS.md — Claude 執行結果
TASK_ID: FORMS-CONSISTENCY-2026-004
SOURCE_TASK_ID: FORMS-CONSISTENCY-2026-003

## RESULT
- [x] DONE

唯一 R1 已補正。新建小範圍腳本（ITR 模擬 500／無回應兩種情境）：18 checks
executed, 18 PASS, 0 FAIL。未重跑上一輪已接受的 144 項。build 通過。

（完整 CLAUDE_PRECHECK/修復內容/新增證據/沿用證據/TESTS_RUN/RISKS/SAFETY_CHECK
逐字原文已在本次對話中完整記錄，未刪減、未修改，僅因封存檔篇幅在此節錄關鍵結論。）
```

## REVIEW.md（原文，完整保留）

```markdown
# REVIEW.md — 獨立審查
TASK_ID: FORMS-CONSISTENCY-2026-004
SOURCE_TASK_ID: FORMS-CONSISTENCY-2026-003
審查日期：2026-10-04

## EVIDENCE_CHECK
本次讀取TASK、STATUS、實際ITR catch、語系key、完整小範圍腳本與run.log；未重新執行瀏覽器或套件。log有18項PASS，對應兩情境各9項，無FAIL。
- itr.saveNotConfirmed中英文皆不斷言確定未保存，catch仍呼叫describeSaveError且保留throw。
- 模擬500確認完整友善文案、不含注入detail，無回應確認完整網路友善文案；兩者均確認輸入保留、modal不關閉、Save/Cancel恢復。
- script與log支持此窄範圍結論，build成功為執行者紀錄；本審查未自稱獨立重跑。
- 前輪已接受的身份／返回／唯讀／保存狀態證據沿用，不當成本輪新跑144項。

## SCOPE_CHECK
修正限定ITR catch及必要中英文key，不改共用failedKeep或NOI/NCR。無需為本輪重開保存機制或其他模組。

## DECISIONS_CHECK
未新增業務政策，未改核准／作廢／複驗／附件授權。

## VERDICT
- [x] PASS
- [ ] REVISE
- [ ] HUMAN_REQUIRED

## REQUIRED_FIXES
無阻擋結案項。
維護註記：舊forms-consistency-review.mjs Part D仍期待三模組同為Not saved，對ITR已過時；其144項是歷史證據，不可宣稱現行版本重跑仍全部通過。日後執行整套前須同步ITR預期；本次專用18項已覆蓋新的文案要求，不要求再開一輪補測。

## NEXT_STEP
FORMS-CONSISTENCY系列結案，不再重跑本輪。保留模擬500／route.abort不證明commit後回應遺失或重試安全的限制。下一批可依使用者最新關注，先只讀盤點ITP基本資料／輸入欄位與現有廠商、專案主檔的可帶入關係；不自行新增必填、覆寫輸入或修改歷史文件。
```

---

## 補存：完整 TASK / STATUS 快照（來源：對話逐字稿，非摘要重建）

原封存的 TASK / STATUS 段落為摘要節錄，且引用「本次對話記錄」這個日後會失效的
參照。以下從本次對話的逐字稿檔案重新取出並補存當時完整內容，逐字核對無誤；
保留上文摘要不刪除，判定不變。

### TASK.md 完整快照

````markdown
# TASK.md — ITR 保存失敗文案（唯一 R1）

TASK_ID: FORMS-CONSISTENCY-2026-004
SOURCE_TASK_ID: FORMS-CONSISTENCY-2026-003
狀態：已交辦，待 Claude 執行。本批只處理 REVIEW.md 的唯一 R1，**不重跑**上一輪已
接受的 144 項驗證。

## REQUIRED_FIXES（逐字沿用審查原文）

R1（唯一）：ITR保存catch繼續用describeSaveError遮蔽原始5xx，但改用不斷言是否落地的
前綴，例如「未能確認保存完成，您填寫的內容仍保留。{message}」。必要ITR專用中英文
key可新增，不改共用failedKeep以免擴散。
只做針對性驗證：ITR模擬500及無回應兩種情境，不含原始detail/Network Error、不稱
確定未保存，輸入保留與按鈕恢复。無須另建commit後失敗機制、無須重跑全144項或所有
模組。產品文案修改執行前端build即可；文件明列哪些為本次新證據、哪些沿用。

## SCOPE
1. 新增 ITR 專用 i18n key（例如 `itr.saveNotConfirmed`），文案不斷言「確定未保存」，
   只表達「未能確認保存完成，輸入已保留」。英文／中文兩區塊皆加，不改動
   `saveFlow.failedKeep`（NOI/NCR 繼續使用原樣）。
2. `react-app/src/components/ITR/ITR.tsx` 的 `handleSaveITRDetails` catch 區塊，
   把 `t('saveFlow.failedKeep', {...})` 換成 `t('itr.saveNotConfirmed', {...})`，
   `describeSaveError` 的使用方式不變（繼續遮蔽原始 5xx body）。
3. 新建一支**小範圍**驗證腳本，只測 ITR 模擬 500 與無回應（network error）兩種
   情境：toast 文字不含原始 detail／不含技術性 Network Error 物件內容、不含
   「Not saved」這類確定性字眼、輸入保留、Save/Cancel 按鈕恢復可點擊。不重跑
   `forms-consistency-review.mjs` 既有 144 項。
4. 執行 `npm run build`（前端型別檢查＋打包），記錄結果。
5. 文件明確區分：本輪新證據（ITR 兩種情境的小範圍驗證）與沿用上一輪的既有證據
   （144 項、九條返回路徑等），不得混為一談。

## ALLOWED_PATHS
- `react-app/src/components/ITR/ITR.tsx`（限 catch 區塊的 i18n key 替換）
- `react-app/src/context/LanguageContext.tsx`（限新增 `itr.saveNotConfirmed` 一個
  key 到 en/zh 兩區塊）
- `react-app/tests-browser/`（新建本輪小範圍驗證腳本）
- `docs/workflow/`（本輪 handoff/evidence；上一輪 archive 已於本次對話建立）
- `TASK.md` / `STATUS.md` / `REVIEW.md`

## FORBIDDEN_PATHS
- `saveFlow.failedKeep`（共用 key，NOI/NCR 繼續用，不改）
- `react-app/src/components/NOI/**`、`react-app/src/components/NCR/**`
- `react-app/src/components/ITR/ITRModals.tsx`
- `react-app/tests-browser/forms-consistency-review.mjs`（上一輪已接受的 144 項
  不重開、不修改）
- 存檔交易機制、去重機制、commit 後失敗重試機制（審查明確不要求）
- 後端任何檔案、全域 ESLint 清理、開發資料庫、使用者 8198/3198
- `TASK.md`（上一輪）／`DECISIONS.md`／`AGENTS.md`／任何既有 `docs/workflow/
  *-archive.md`（唯讀）

## ACCEPTANCE_CRITERIA
1. ITR 模擬 500：toast 文字不含原始 detail、不含「Not saved」等確定性字眼、輸入
   保留、Save/Cancel 按鈕恢復可點擊。
2. ITR 無回應（network error）：toast 文字不含原始技術錯誤內容（如 AxiosError、
   堆疊）、不含「Not saved」、輸入保留、按鈕恢復。
3. NOI/NCR 的 `saveFlow.failedKeep` 原樣不變。
4. `npm run build` 已執行並記錄結果。
5. 文件清楚標示本輪新增證據（兩種 ITR 情境）與沿用的既有證據（144 項）分開陳述。

## CLAUDE_PRECHECK
1. 已讀 `docs/workflow/FORMS-CONSISTENCY-2026-003-archive.md`（含完整 REVIEW 原文），
   理解唯一 R1 的具體要求。
2. 已讀 `ITR.tsx` 現有 catch 區塊（已於上一輪改用 `describeSaveError`＋
   `saveFlow.failedKeep`）、`utils/saveErrors.ts` 確認 `describeSaveError` 對
   5xx／無回應兩種情境分別回傳的文字內容。
3. 隔離環境沿用 8200/3200（非使用者 8198/3198）。
````

### STATUS.md 完整快照

````markdown
# STATUS.md — Claude 執行結果

TASK_ID: FORMS-CONSISTENCY-2026-004
SOURCE_TASK_ID: FORMS-CONSISTENCY-2026-003

## RESULT
- [x] DONE
- [ ] PARTIAL
- [ ] BLOCKED

唯一 R1 已補正，詳見下方與 `docs/workflow/FORMS-CONSISTENCY-2026-004-handoff.md`。
**未重跑**上一輪已接受的 144 項驗證（`forms-consistency-review.mjs` 本輪完全未
修改、未執行）。本輪新建的小範圍腳本（ITR 模擬 500／無回應兩種情境）：**18 checks
executed, 18 PASS, 0 FAIL**。

## 對使用者的改善
ITR 保存失敗時不再斷言「確定未保存」（"Not saved"）；改為「未能確認保存是否完成，
您填寫的內容仍保留在這裡」，不管是伺服器錯誤還是完全無回應，都不會讓使用者誤以為
系統「確定知道」資料沒有寫入。

## CLAUDE_PRECHECK 執行記錄
1. 已讀 `docs/workflow/FORMS-CONSISTENCY-2026-003-archive.md`（含完整 REVIEW 原文），
   理解唯一 R1 的具體要求。
2. 已讀 `ITR.tsx` 現有 catch 區塊（上一輪已改用 `describeSaveError`＋
   `saveFlow.failedKeep`）、`utils/saveErrors.ts` 確認 `describeSaveError` 對
   5xx／無回應兩種情境分別回傳的文字內容。
3. 隔離環境沿用 8200/3200（非使用者 8198/3198）。

## 修復內容
- `react-app/src/context/LanguageContext.tsx` 新增 ITR 專用 key
  `itr.saveNotConfirmed`（en: "Could not confirm the save completed — what you
  entered is still kept here. {message}"；zh: "未能確認保存是否完成，您填寫的
  內容仍保留在這裡。{message}"）。`saveFlow.failedKeep` 完全未修改，NOI/NCR
  繼續使用原樣。
- `react-app/src/components/ITR/ITR.tsx` 的 catch 區塊改用這個新 key；
  `describeSaveError` 呼叫方式不變；既有 `throw error;`、檔案上傳部分失敗的獨立
  toast 完全未動。

## 新增證據（本輪，範圍限定兩種情境）
新建 `react-app/tests-browser/forms-consistency-itr-save-wording-review.mjs`——
小範圍腳本，只測 ITR：
- 情境 A（模擬 HTTP 500）：toast 文字逐字比對新文案、不含原始 detail、不含
  "Not saved"、輸入保留、按鈕恢復。
- 情境 B（完全無回應，`route.abort`）：toast 文字逐字比對新文案、不含 "Not
  saved"、不洩漏原始錯誤物件/堆疊、輸入保留、按鈕恢復。

**18 checks executed, 18 PASS, 0 FAIL**（動態計數，完整 log 與 2 張截圖見
`docs/workflow/FORMS-CONSISTENCY-2026-004-evidence/`）。

## 沿用的既有證據（本輪未重新驗證，明確區分）
`forms-consistency-review.mjs` 的既有 144 項（九條返回路徑、pending 狀態、Cancel
樣式比對、readonly 欄位 disabled、新建取消 0 POST、deep-link 身份核對、精確 PUT
目標與回應 id、獨立重讀）**本輪未重跑**，原樣沿用上一輪結論。ITR 鎖定記錄的
View ITR／Close 文案與保存中狀態同樣沿用，未受本輪文案調整影響。NOI/NCR 的
`saveFlow.failedKeep` 本輪未改動、未重新驗證。

## 隔離環境驗證
- `isolated_stack.py up --port 8200 --vite-port 3200`，沿用既有
  `noi-itr-nav-vite-launcher.mjs`。
- 種子：沿用 `seed_forms_consistency_review.py`（本輪未修改）。
- 隔離堆疊已拆除，`lsof` 確認埠號釋放；使用者 8198/3198 全程監聽未受影響。

## FILES_CHANGED
- `react-app/src/context/LanguageContext.tsx`（新增 1 個 key，en/zh 兩處）。
- `react-app/src/components/ITR/ITR.tsx`（catch 區塊 toast key 替換，1 行）。

## FILES_ADDED
- `react-app/tests-browser/forms-consistency-itr-save-wording-review.mjs`。
- `docs/workflow/FORMS-CONSISTENCY-2026-003-archive.md`（封存上一輪原文）。
- `docs/workflow/FORMS-CONSISTENCY-2026-004-handoff.md`。
- `docs/workflow/FORMS-CONSISTENCY-2026-004-evidence/`（2 張截圖 + `run.log`）。

## FILES_DELETED
無（repo 內無刪除；沙盒暫存目錄的密碼暫存檔與 stack JSON 已刪除，非 repo 檔案）。

## 未修改（沿用既有，說明避免混淆）
- `react-app/tests-browser/forms-consistency-review.mjs`：本輪完全未修改、未
  執行，144 項既有結論原樣沿用。
- `backend/scripts/verification/seed_forms_consistency_review.py`：本輪未修改。
- `react-app/src/components/NOI/**`、`react-app/src/components/NCR/**`、
  `react-app/src/components/ITR/ITRModals.tsx`：本輪未觸碰。
- `saveFlow.failedKeep`（共用 key）：本輪未修改，NOI/NCR 繼續使用原樣。

## TESTS_RUN
- `npx tsc --noEmit`：通過，0 錯誤（含在 build 內）。
- `npm run build`：通過（3.62s，輸出至已 gitignore 的 `react-app/dist/`）。
- `forms-consistency-itr-save-wording-review.mjs`：**18 checks executed, 18
  PASS, 0 FAIL**（動態執行期計數，log 已存檔）。
- 本輪未執行 `npm test`／`npm run lint`——依審查明確範圍（唯一文案修正，無須
  重跑全 144 項或所有模組），且改動僅限一個 i18n 字串與其替換點，與既有單元
  測試／lint 基線無關，不在本輪重跑範圍內。

## RISKS / LIMITATIONS
- 本輪新增的小範圍腳本只覆蓋 ITR 的模擬 500 與完全無回應兩種情境，未涵蓋 4xx
  等其他失敗型態（`describeSaveError` 對 4xx 的既有行為本輪未變更，也未在本輪
  重新驗證）。
- NOI/NCR 是否也該採用類似「不確定性」文案，本輪未討論、未決策，維持現狀
  （`saveFlow.failedKeep` 的「Not saved」字首對 NOI/NCR 而言是否同樣不精確，
  是獨立於本輪的另一個問題，留待後續視需要另行交辦）。
- 沿用上一輪已記錄的所有限制（Part A2 僅網路層 0 POST 觀察、Part F 固定來源頁
  僅測 `/`、referenceNo 重新編號僅本輪 fixture 範圍等）。

## SAFETY_CHECK
- 未修改 `AGENTS.md`、`DECISIONS.md`、任何既有 `docs/workflow/*-archive.md`。
  `REVIEW.md` 已重置為待審查狀態，**未自行填入任何審查結論**。
- 未修改 `saveFlow.failedKeep`、NOI/NCR 任何檔案、`ITRModals.tsx`、
  `forms-consistency-review.mjs`、後端任何檔案、存檔交易或去重機制。
- 未操作或拆除使用者 8198/3198、日常開發 5173 及其後端；只操作自建隔離堆疊
  （8200/3200，已拆除，`lsof` 確認埠號釋放）。
- 未使用 stash/reset/checkout；未還原協作者既有修改。
- 未 commit/push/部署。
- 未將任何測試帳密寫入 repo；暫存密碼檔與 stack JSON 已刪除，未讀出或記錄密碼
  內容到任何文件。
````
