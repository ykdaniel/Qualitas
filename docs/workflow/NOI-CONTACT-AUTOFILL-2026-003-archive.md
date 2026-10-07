# NOI-CONTACT-AUTOFILL-2026-003 — 封存（原文保留；獨立審查 PASS，系列結案）

本檔封存 NOI-CONTACT-AUTOFILL-2026-003 這一輪的 TASK.md、STATUS.md、REVIEW.md 原文。
依 AGENTS.md 規則，原文保留，不因後續工作修改內容。REVIEW.md 判定為 **PASS**，
NOI-CONTACT-AUTOFILL 系列（001 REVISE → 002 REVISE → 003 PASS）結案，不另開 004。
產品修正（逐欄位 system/user 來源追蹤、新建同步帶入、system 欄位換廠商覆蓋、保留
提示、清除廠商不連動清空、R1 提示條件修正）與隔離 guard（R3）皆已實作並通過驗收；
`npm run lint` 仍維持 13 errors / 21 warnings 的既有基線，**未被這個系列清零，是
已知限制，不是本系列範圍**。

---

## TASK.md（原文，完整保留）

````markdown
# TASK.md — NOI 聯絡資訊自動帶入：測試精確度補正

TASK_ID: NOI-CONTACT-AUTOFILL-2026-003
SOURCE_TASK_ID: NOI-CONTACT-AUTOFILL-2026-002
狀態：已交辦，待 Claude 執行。本批只補兩項測試精確度缺口（a/b/d 逐欄比對已知
值、g 等待延遲回應真正抵達後再驗證）。**產品修正（R1 提示條件）與隔離 guard
（R3）已被接受，不重寫，也不改動任何產品程式碼**；只改驗證腳本與文件措辭。

## REQUIRED_FIXES（逐字沿用審查原文，不得自行弱化）

### R1 — 精確核對帶入值與提示（只補 a/b/d 相關片段）
a 僅判斷字串非空；b6 只要求電話或 Email 任一改變，錯廠商值或僅一欄更新也能
通過。改用已知種子／獨立 API 來源，逐欄核對預選廠商與改選廠商的預期值。b 清空
保留案例同時斷言具名的保留 toast 可見且文案正確；d 現在只 count small，補核對
「先前廠商」實際文案。保留已接受的 b/c/e 清空斷言，不擴大測試矩陣。

### R2 — 證明延遲清單真的到達（只補 g）
在解除 gate 前註冊 response 等待，確認 contractors 回應成功且預期選項已出現，
再核對手改值保持、未自動預選。之後實際選一個已載入廠商，確認手改 contacts
保留、system phone/email 精確帶入。這是上一輪要求的「選定廠商後正常帶入」尚
缺部分，無需新增產品機制。

### 文件隨手校正（不另開審查項目）
- 修正 lazy initializer／函式只執行一次的敘述為 state 只採用初始化結果。
- f 目前以唯一 marker 重開，未直接比對 id；證據可支持該唯一測資重讀，描述改為
  實際方法，不冒稱已斷言同 id；不要求重跑 f。
- STATUS「換到空值廠商現在才會清空」改為既有本批實作行為、本輪新增驗證，避免
  將補測當新修復。
- handoff 範例勿內嵌密碼，改為使用既有環境變數（不需重跑 guard）。lint 明列
  仍失敗。

## SCOPE
1. 修改 `react-app/tests-browser/noi-contact-autofill-review.mjs`：
   a. 新增已知種子資訊的對照表（廠商A/B 的 db_seeder.py 預設值、本輪種子的
      No-Phone 廠商），scenario a 的三個欄位改為逐欄 `===` 精確比對預選廠商
      的已知值，而不是只判斷 `.length > 0`。
   b. scenario b 的換廠商目標固定選「廠商B」（已知值），phone/email 改為逐欄
      `===` 精確比對廠商B 的已知值；新增斷言：保留提示的 toast 確實可見
      （`[data-sonner-toast]` 存在）且文案包含正確具名的欄位（"Contact
      Person"）與確認語句。
   c/e/f 既有斷言邏輯**不修改**（已被接受），只因與 a/b/d/g 在同一個連續
      session 裡而隨之重新執行，不是獨立重新設計。
   d. scenario d 的「先前廠商」提示改為核對 `<small>` 的實際文字內容逐字等於
      `t('noi.contactFromPreviousContractor')` 的英文譯文，不是只數元素個數。
   g. 解除 gate 前用 `page.waitForResponse()` 等待 `/api/contractors/` 的
      GET 請求真正完成且回應成功；之後用 `page.waitForFunction()` 等待
      `<select>` 的 `options.length` 真的變多，再做既有的「手改值保留、廠商
      未被自動選取」斷言。新增：實際選定一個已載入的廠商（廠商A），確認手改
      的 Contact Person 仍保留、尚未手改的 Phone/Email 正確精確帶入該廠商的
      已知值（這是上一輪 TASK scope 就要求、但上一輪腳本從未真正執行到的
      「選定廠商後正常帶入」情境）。
2. 文件措辭校正（見上方「文件隨手校正」）：本輪的 STATUS.md／新建的
   `docs/workflow/NOI-CONTACT-AUTOFILL-2026-003-handoff.md` 必須：
   - 不用「lazy initializer」描述 `useState(getInitialData())`：這個寫法在
     每次 render 都會呼叫 `getInitialData()`，只是 React 只採用第一次
     render 的結果作為初始 state，不是 `useState(() => ...)` 那種真正的
     lazy initializer。
   - f 情境的描述改為「透過表單裡的唯一 marker 文字定位並重新開啟同一筆測資」
     ，不得寫成「比對同一個 id」（目前沒有在畫面上直接讀出並比較 `id` 欄位）。
   - 「換到空值廠商時 Phone 會被清空」這個行為本身是 2026-001 輪就已經實作、
     已審查接受的邏輯（`systemFields.forEach` 一律覆蓋成 `selected?.field || ''`），
     本輪（連同 2026-002）只是**補上這個情境的驗證**，不是本輪新修的行為，
     文件不得寫成「本輪新修復」。
   - handoff 文件若要示範指令，一律用 `$NOI_CONTACT_AUTOFILL_PASSWORD` 這種
     環境變數參照，不得內嵌實際密碼字串（即使是測試密碼）。
   - lint 結果需明列仍然失敗的既有基線數字（13 errors / 21 warnings，若本輪
     重跑數字不同依實際），不得省略或暗示已通過。
3. 執行修改後的腳本（整支重新跑一次，因為 a→b→c→d 在同一個瀏覽器 session
   接續，無法只抽跑 a/b/d/g 四段）；c/e/f 的既有斷言會隨之重新執行但邏輯未變、
   不是重新設計或擴大範圍。
4. **不**重跑 `npx tsc --noEmit`／`npm run build`／`node scripts/run-unit-tests.mjs`／
   `npm run lint` 這套完整檢查——本輪未修改任何產品程式碼（只動驗證腳本與
   文件），這些檢查的結果不會因此改變，重跑屬於不必要的範圍擴張。
5. 新增證據存到 `docs/workflow/NOI-CONTACT-AUTOFILL-2026-003-evidence/`（與
   上一輪的 `NOI-CONTACT-AUTOFILL-2026-002-evidence/` 分開目錄），handoff
   文件把「本輪新增/強化的斷言」與「沿用上一輪、本輪未變動邏輯的既有斷言」
   分開列示，不得混在同一份清單裡含糊帶過。

## ALLOWED_PATHS
- `react-app/tests-browser/noi-contact-autofill-review.mjs`（僅限上方 SCOPE
  第 1 點列出的 a/b/d/g 片段與已知值對照表，不改 c/e/f 的既有斷言邏輯）
- `docs/workflow/`（本輪 handoff/evidence；上一輪 archive 已建立）
- `TASK.md` / `STATUS.md` / `REVIEW.md`

## FORBIDDEN_PATHS
- `react-app/src/components/NOI/modals/NOIDetailModal.tsx`、
  `react-app/src/context/LanguageContext.tsx`、
  `react-app/src/components/Shared/FormShell.module.css`：R1（提示條件）已被
  審查接受，**不修改任何產品程式碼**。
- `backend/scripts/verification/seed_noi_contact_autofill.py`：R3（guard 呼叫
  順序）已被審查接受，**不修改**（除非上方 SCOPE 明確要求的對照表需要核對
  種子裡既有的值——核對不等於修改種子本身）。
- `react-app/tests-browser/noi-contact-autofill-review.mjs` 裡 c/e/f 的既有
  斷言邏輯——已被接受，不重新設計或擴大範圍。
- 任何「主檔資料晚到時的來源比對＋最新狀態確認」機制的實作或設計。
- ITP 任何檔案、後端產品邏輯（`backend/routers`、`backend/services` 等）。
- 既有 `docs/workflow/*-archive.md`（唯讀，含本輪新建的
  `NOI-CONTACT-AUTOFILL-2026-002-archive.md`）／`TASK.md`（上一輪）／
  `DECISIONS.md`／`AGENTS.md`。
- 開發資料庫、使用者 8198/3198。
- `npx tsc --noEmit`／`npm run build`／單元測試／`npm run lint` 的重新執行
  （本輪未改產品程式碼，不需要也不應該重跑；若在過程中意外發現需要改動
  產品程式碼，先在 STATUS 回報並停下，不自行擴大範圍）。

## ACCEPTANCE_CRITERIA
1. a 的三個欄位（Contact Person/Phone/Email）與預選廠商的已知種子值逐欄
   `===` 比對通過，不是只判斷非空。
2. b 換廠商後的 Phone/Email 與廠商B 的已知種子值逐欄 `===` 比對通過；保留
   提示的 toast 確實可見，且文案包含正確具名的欄位與確認語句。
3. d 的「先前廠商」提示文字逐字核對，不是只數元素個數。
4. g：確認 `/api/contractors/` 延遲回應真正完成成功（`waitForResponse` 核對
   狀態碼）、選項真的出現在 DOM 後，才做手改值保留與廠商未被自動選取的斷言；
   接著實際選定一個已載入的廠商，確認手改欄位仍保留、未手改的 system 欄位
   精確帶入該廠商的已知值。
5. 文件措辭四項校正全部完成（lazy initializer、f 的 marker 描述、c 的既有
   行為措辭、handoff 範例不內嵌密碼），lint 基線如實列出。
6. 本輪未修改任何產品程式碼，`git diff` 只應出現驗證腳本與 `docs/workflow/`
   下的文件變動。
7. 新舊證據分開列示：STATUS／handoff 清楚標示哪些是本輪新增或強化的斷言（a/b/
   d/g），哪些是沿用上一輪、本輪邏輯未變、只是隨同一 session 重新執行的既有
   斷言（c/e/f）。

## CLAUDE_PRECHECK
1. 已讀 `docs/workflow/NOI-CONTACT-AUTOFILL-2026-002-archive.md`（含完整
   REVIEW 原文），理解只需補 a/b/d/g 與文件措辭，不得自行擴大範圍或重新設計
   已接受的 c/e/f。
2. 已讀 `react-app/tests-browser/noi-contact-autofill-review.mjs` 現狀，確認
   a/b6/d 的精確度缺口與 g 的「未等待真正抵達」缺口與 REVIEW 描述一致。
3. 已讀 `db_seeder.py` 的 `seed_default_contractors()` 確認廠商A／廠商B 的
   既有預設聯絡資訊（供 a/b 的對照表使用），以及本輪種子
   `seed_noi_contact_autofill.py` 裡 No-Phone 廠商的值。
4. 隔離環境沿用既有 `isolated_stack.py` 與既有種子慣例，不操作使用者
   8198/3198、不操作開發資料庫；本輪不需要修改種子腳本本身。
````

## STATUS.md（原文，完整保留）

````markdown
# STATUS.md — Claude 執行結果

TASK_ID: NOI-CONTACT-AUTOFILL-2026-003
SOURCE_TASK_ID: NOI-CONTACT-AUTOFILL-2026-002

## RESULT
- [x] DONE
- [ ] PARTIAL
- [ ] BLOCKED

REVIEW.md 要求的兩項測試精確度缺口（a/b/d 逐欄比對已知值、g 等待延遲回應真正
抵達後再驗證）已補齊，詳見下方與
`docs/workflow/NOI-CONTACT-AUTOFILL-2026-003-handoff.md`。**本輪未修改任何
產品程式碼**——R1（提示條件）與 R3（隔離 guard）已被接受，只強化了
`react-app/tests-browser/noi-contact-autofill-review.mjs` 的斷言精確度，並
校正幾處文件措辭（lazy initializer 誤稱、f 的 marker 描述、c 的既有行為措辭、
handoff 密碼範例）。

## 對使用者的改善
本輪不涉及產品行為變更，純粹是驗證證據本身的精確度提升：
1. 先前的驗證只確認「新建時有自動帶入東西」「換廠商後有變化」，沒有確認帶入
   的到底是不是**正確廠商**的資料、是不是**每個欄位都對**；現在逐欄精確比對
   已知種子值，排除了「帶對一半」或「帶錯廠商」仍能通過測試的空隙。
2. 先前沒有驗證過「保留提示」這個使用者看得到的 toast 真的會出現、文案是否
   正確具名；現在確認了。
3. 先前「廠商清單延遲載入」情境只驗證到「清單還沒到時不誤報、清單晚到時手改
   值不被蓋掉」，沒有驗證到使用者在清單到達後實際選定廠商、確認自動帶入仍然
   正常運作——這段是 2026-001 一開始就要求、但一直沒被真正測過的部分，現在
   補上了。

## CLAUDE_PRECHECK 執行記錄
1. 已讀 `docs/workflow/NOI-CONTACT-AUTOFILL-2026-002-archive.md`（含完整
   REVIEW 原文），理解只需補 a/b/d/g 與文件措辭，不擴大範圍或重新設計已接受
   的 c/e/f。
2. 已讀 `react-app/tests-browser/noi-contact-autofill-review.mjs` 現狀，確認
   a/b6/d 的精確度缺口與 g「未等待真正抵達」缺口與 REVIEW 描述一致。
3. 已讀 `db_seeder.py` 的 `seed_default_contractors()` 確認廠商A（張三／
   02-1234-5678／vendor-a@example.com）、廠商B（李四／02-2345-6789／
   vendor-b@example.com）的既有預設值；核對本輪種子
   `seed_noi_contact_autofill.py` 裡 No-Phone 廠商（Chen Mingde／
   chen@yungchang-nophone.example.com／phone 空白）的值，建立腳本內的
   `KNOWN_CONTRACTOR_INFO` 對照表。

## 修復內容（僅驗證腳本與文件，無產品程式碼異動）
`react-app/tests-browser/noi-contact-autofill-review.mjs`：
- 新增 `KNOWN_CONTRACTOR_INFO` 已知種子值對照表。
- **a**：三個欄位改為逐欄 `===` 精確比對預選廠商（廠商A）的已知值，取代原本
  `.length > 0` 的非空判斷。
- **b**：換廠商目標固定為「廠商B」（取代「清單裡第一個不是目前廠商的選項」
  這種不確定目標），Phone/Email 逐欄精確比對廠商B 已知值（取代原本「任一
  欄位有變化即算過」的弱斷言）；新增保留提示 toast 的可見性與文案核對。
- **d**：「先前廠商」提示改為逐字核對實際文字內容，取代原本只數元素個數。
- **g**：解除延遲前用 `page.waitForResponse()` 註冊對 `/api/contractors/`
  的等待，解除後確認回應成功（狀態碼）；用 `page.waitForFunction()` 確認
  `<select>` 選項真的變多，才做後續斷言；新增實際選定一個已載入廠商、確認
  未手改的 system 欄位正確精確帶入的情境（g9-g11），這是上一輪要求但從未
  真正執行到的部分。
- c/e/f 的既有斷言邏輯**完全未修改**，只因與 a/b/d/g 同在一支腳本、一個連續
  瀏覽器 session 裡，重跑整支腳本時連帶重新執行。

文件措辭校正（見 handoff 文件「其他文件措辭校正」一節）：
- 不再用「lazy initializer」描述 `useState(getInitialData())`。
- f 情境改為如實描述「透過唯一 marker 文字定位」，不冒稱已直接比對 `id`。
- c 情境（換到空值廠商時 system 欄位被清空）改為如實描述「2026-001 就已經
  實作、已接受的既有行為，2026-002 才新增驗證」，不再寫成「本輪新修復」。
- handoff 範例改用 `$NOI_CONTACT_AUTOFILL_PASSWORD` 環境變數參照，不內嵌
  實際密碼字串。

## 隔離環境驗證（本輪重新執行）
- `isolated_stack.py up --port 8230`，新建本輪專屬 launcher
  `react-app/tests-browser/noi-contact-autofill-review-r3-vite-launcher.mjs`
  （8230/3230，與前兩輪的 8210/3210、8220/3220 launcher 並存、不覆寫）。
- 種子：`seed_noi_contact_autofill.py`（本輪**未修改**，直接沿用 2026-002
  修正後的版本）。
- `noi-contact-autofill-review.mjs`（強化後）：**48 checks executed, 48
  PASS, 0 FAIL**（上一輪 37 項基礎上，新增/拆分 11 項更精確的斷言）。完整
  `run.log` 與 11 張截圖（含新增的 `g3-selected-after-late-arrival.png`）見
  `docs/workflow/NOI-CONTACT-AUTOFILL-2026-003-evidence/`，與上一輪的
  `NOI-CONTACT-AUTOFILL-2026-002-evidence/`（11 張）**分開存放**，不覆蓋。
- 啟動/拆除隔離堆疊，因本機埠號綁定被沙盒封鎖（`EPERM`），以
  `dangerouslyDisableSandbox` 執行這幾個明確需要的指令；其餘讀寫操作維持在
  沙盒內。
- 隔離堆疊已拆除（`isolated_stack.py down`），`lsof` 確認 8230/3230 埠號釋放；
  使用者 8198/3198 全程監聽未受影響（`lsof` 核對前後皆正常）。

## 新舊證據分開列示（R2 要求，見 handoff 文件完整對照表）
**本輪新增/強化（a/b/d/g）**：逐欄精確值比對（a）、固定換廠商目標＋逐欄精確
比對＋保留提示文案核對（b）、提示文字逐字核對（d）、真正等待延遲回應抵達＋
選項出現＋新增選定廠商後正常帶入情境（g，含新截圖 g3）。

**沿用上一輪、本輪邏輯未變（c/e/f）**：清空目標廠商確實清空（c）、既有紀錄
空欄位維持空白（e）、保存後獨立重讀（f，描述已訂正為「唯一 marker 定位」）。
這三項的截圖是本輪重新執行腳本時連帶產生的最新畫面，不是沿用舊檔案，但斷言
邏輯本身與上一輪完全相同。

**未測試（沿用上一輪的限制，本輪未變）**：
- 「主檔資料晚到＋最新狀態確認」機制：未實作，無測試對象。
- 只驗證了 NOI 模組。

## FILES_CHANGED
無產品程式碼異動。`react-app/tests-browser/noi-contact-autofill-review.mjs`
（驗證腳本本身，非產品程式碼）：a/b/d/g 四段斷言強化，詳見上方「修復內容」。

## FILES_ADDED
- `docs/workflow/NOI-CONTACT-AUTOFILL-2026-002-archive.md`（封存上一輪
  REVISE 原文）。
- `docs/workflow/NOI-CONTACT-AUTOFILL-2026-003-handoff.md`。
- `docs/workflow/NOI-CONTACT-AUTOFILL-2026-003-evidence/`（11 張截圖 +
  `run.log`，與 2026-002 的證據目錄分開）。
- `react-app/tests-browser/noi-contact-autofill-review-r3-vite-launcher.mjs`
  （本輪專屬隔離 vite launcher，8230/3230）。

## FILES_DELETED
無。

## TESTS_RUN
- `noi-contact-autofill-review.mjs`（隔離瀏覽器驗證，Playwright，強化後）：
  **48 checks executed, 48 PASS, 0 FAIL**，動態執行期計數，log 已存檔。
- `npx tsc --noEmit`／`npm run build`／`node scripts/run-unit-tests.mjs`／
  `npm run lint`：**本輪未重新執行**——未修改任何產品程式碼，依 TASK.md
  明確指示不重跑；上一輪（2026-002）本輪重新執行過的結果為 tsc 0 錯誤、
  build 通過、單元測試 123/123、lint 13 errors/21 warnings（與更早的基線
  相同，但那是 2026-002 重新測出來的數字，本輪沿用、不重測）。

## RISKS / LIMITATIONS
沿用上一輪（`docs/workflow/NOI-CONTACT-AUTOFILL-2026-002-archive.md` 的
STATUS「RISKS / LIMITATIONS」一節）未變：
- 「主檔資料晚到＋最新狀態確認」機制仍未設計或實作；g 情境驗證的是現狀沒有
  這套機制時的實際行為，不是驗證這套機制本身。目前的實測仍只涵蓋「清單一
  開始就還沒載入」，不是「使用者已選定廠商後、該廠商詳細資料才非同步晚到」
  這個更複雜的情境（因為目前 `Contractor` 的聯絡資訊本來就是清單的一部分，
  不是另外非同步載入的）。
- 只驗證了 NOI 模組。

## SAFETY_CHECK
- 未修改 `AGENTS.md`、`DECISIONS.md`、任何既有 `docs/workflow/*-archive.md`
  （含本輪新建的 `NOI-CONTACT-AUTOFILL-2026-002-archive.md`，建立後未再
  修改）。`REVIEW.md` 已重置為待審查狀態，**未自行填入任何審查結論**。
- 未修改 `NOIDetailModal.tsx`、`LanguageContext.tsx`、`FormShell.module.css`、
  `seed_noi_contact_autofill.py`——R1/R3 已被接受，本輪不動產品程式碼或種子
  腳本本身。
- 未修改 `noi-contact-autofill-review.mjs` 裡 c/e/f 的既有斷言邏輯。
- 未修改 ITP 任何檔案、任何後端產品邏輯、既有 `handleSave`／驗證／授權邏輯。
- 未操作或拆除使用者 8198/3198、日常開發 5173 及其後端；只操作自建隔離堆疊
  （8230/3230，已拆除，`lsof` 確認埠號釋放、使用者埠號前後皆正常監聽）。
- 未使用 stash/reset/checkout；未還原協作者既有修改。
- 未 commit/push/部署。
- 未將任何測試帳密寫入 repo；種子沿用既有環境變數機制，無預設或硬編碼值；
  handoff 範例已改用環境變數參照，不內嵌密碼字串。
- 啟動/拆除隔離環境的指令因本機埠號綁定被沙盒封鎖（`EPERM`），以
  `dangerouslyDisableSandbox` 執行這幾個明確需要的指令；其餘操作維持在沙盒
  內執行，未因此繞過其他安全限制。
````

## REVIEW.md（原文，完整保留）

````markdown
# REVIEW.md — 獨立審查

TASK_ID: NOI-CONTACT-AUTOFILL-2026-003
SOURCE_TASK_ID: NOI-CONTACT-AUTOFILL-2026-002
審查日期：2026-10-04

## EVIDENCE_CHECK
已核對本輪 TASK、STATUS、handoff、驗證腳本 a/b/d/g、完整 run.log 與證據檔案目錄，並目視 g3-selected-after-late-arrival.png。未獨立重跑瀏覽器或前端套件。
- R1 通過：a 逐欄比對已知廠商值，b 固定目標並精確比對 phone/email，包含保留欄位提示內容，d 核對先前廠商提示文字。
- R2 通過：解除 gate 前註冊 response 等待，核對成功回應與實際選項，然後選定廠商驗證手改 contacts 保留、system phone/email 正確帶入。g3 畫面與 log 所列值、提示一致。
- run.log 實際記錄 48 checks / 48 PASS / 0 FAIL。這是本輪腳本總數，包含連帶執行的 c/e/f；不是 48 個新增案例。既有核心產品修正與隔離 guard 沿用前輪已接受結論。
- 本輪未重跑 tsc/build/unit/lint，與只改驗證腳本和文件的範圍一致；lint 最新留存結果仍為前輪 13 errors / 21 warnings，不代表全專案檢查皆通過。

## SCOPE_CHECK
兩項補正證據已足夠，無需為此擴大矩陣、重新盤點或重寫功能。本次審查只填 REVIEW.md；沒有操作產品資料、使用者環境或測試堆疊。

## DECISIONS_CHECK
限定 NOI 聯絡資料帶入；保留手改及刻意清空、既有紀錄原值與非阻斷提示。晚到清單不自動預選／回填為已揭露的現況，本輪未引入新的晚到同步機制。不涉及 ITP 欄位、後端授權或歷史資料清洗。

## VERDICT
- [x] PASS
- [ ] REVISE
- [ ] HUMAN_REQUIRED

## REQUIRED_FIXES
無阻斷項目。不另開 004、不要求重跑。

## NEXT_STEP
NOI-CONTACT-AUTOFILL 系列結案。Claude 將本輪 TASK/STATUS/REVIEW 完整逐字封存，保留各輪證據及 lint 尚未通過的限制；更新本批對應待辦狀態即可，不延伸整理其他歷史文件、不自動開新修復批次。交接摘要清楚寫明功能已實作並通過本批驗收，未 commit/push/部署。
````
