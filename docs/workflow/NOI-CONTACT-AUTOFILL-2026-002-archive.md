# NOI-CONTACT-AUTOFILL-2026-002 — 封存（原文保留；獨立審查 REVISE，下一輪補兩項證據）

本檔封存 NOI-CONTACT-AUTOFILL-2026-002 這一輪的 TASK.md、STATUS.md、REVIEW.md 原文。
依 AGENTS.md 規則，原文保留，不因後續工作修改內容。REVIEW.md 判定為 **REVISE**，下一批
NOI-CONTACT-AUTOFILL-2026-003 只補兩項測試精確度缺口（a/b/d 逐欄比對已知值、g 等待
延遲回應真正抵達後再驗證），產品修正（R1 提示條件）與隔離 guard（R3）**已被接受，不
重寫**；文件用詞的幾處不精確描述（lazy initializer 誤稱、f 的 marker vs id 描述、c
的「新修復」措辭）隨手校正，不另開審查項目。

---

## TASK.md（原文，完整保留）

````markdown
# TASK.md — NOI 聯絡資訊自動帶入 R1-R3 補正

TASK_ID: NOI-CONTACT-AUTOFILL-2026-002
SOURCE_TASK_ID: NOI-CONTACT-AUTOFILL-2026-001
狀態：已交辦，待 Claude 執行。本批只處理 REVIEW.md 的 R1-R3 三項，**保留**核心
實作（逐欄位 system/user 來源追蹤、新建同步帶入、system 欄位換廠商覆蓋、保留
提示、清除廠商不連動清空），不重寫。

## REQUIRED_FIXES（逐字沿用審查原文，不得自行弱化）

### R1 — 修正空白欄位的誤導來源提示
目前三個 small 只檢查 contactSource === system。新建且尚無廠商資料時，空欄會
顯示「先前選取廠商的資料」，即使從未選過任何廠商；廠商該欄位缺值時也宣稱已
帶入。依設計僅對 system 且實際有值的欄位顯示來源提示。保留清除廠商後非空值的
「先前廠商」提示。不新增新機制。

### R2 — 補足可複查的驗證證據，修正非同步說明
先保存現有瀏覽器截圖／操作輸出並索引；若已無法取得，僅補測本次必要情境，不
重跑歷史整套。
必須涵蓋：新建預選帶入；手改及「新建後刻意清空」再換廠商；換到主檔有空值的
廠商時 system 舊值確實清空；清除選擇的提示；既有紀錄空欄保留；保存後同 id
獨立重讀三欄值。現有既有紀錄空白案例不代替新建手動清空案例。
另延遲廠商清單後開新建表單，確認空欄無虛假來源提示、晚到清單不覆蓋手動輸入，
選定廠商後正常帶入尚未手改欄位；如目前 UI 不允許在載入前開啟則記錄實際阻擋
依據。只驗證現況，不新增自動晚到回填。
STATUS 區分已存證、沿用回報、未測；lint 寫仍失敗（13 errors/21 warnings，若
本輪結果不同依實際），不稱 lint 通過。未保留執行前基線時不要宣稱已證明基線
完全相同。

### R3 — 種子腳本真正執行隔離檢查
seed_noi_contact_autofill.py 目前只確認 QUALITAS_REQUIRE_ISOLATED_DB 字串為
1；database.py 不會因此自動驗證 DATABASE_URL。在 SessionLocal/任何查詢寫入
之前呼叫既有 core.startup_guard 的 enforce_from_environment，沿用既有保護，
不重造 guard。此為驗證工具修正，不擴大產品範圍。

## SCOPE
1. `NOIDetailModal.tsx`：三處來源提示的顯示條件改為
   `contactSource[field] === 'system' && formData[field]`（即 system 狀態**且**
   欄位目前有值才顯示）；`contactSource[field] === 'system'` 但欄位本身是空字串
   時完全不顯示提示（不分新建無廠商、或廠商該欄位本身缺值兩種情況，一律用同一
   個「有值才顯示」的判斷涵蓋，不新增額外分支）。
2. 修正文件措辭：
   - 把「`getActiveContractors()` 是同步呼叫，沒有非同步晚到情境」這個不精確
     說法，改為如實描述：`getActiveContractors()` 本身雖是同步 getter，但
     `fetchContractors()` 是非同步的，`AppProviders` 會先渲染 children 再觸發
     載入；`NOIDetailModal` 的 `getInitialData`/`getInitialContactSource` 只在
     `useState` 初始化時執行一次，不會因為廠商清單晚到而重新執行——這是現狀的
     既有限制，不是「不存在晚到情境」。只需要驗證並如實記錄這個限制在現有程式
     下的實際行為，**不得**據此新增任何「晚到資料自動回填」機制（這套「來源
     比對＋最新狀態確認」機制的具體設計不在本批範圍，見 FORBIDDEN_PATHS）。
   - STATUS 的 `TESTS_RUN`／驗證段落需區分三類：本輪重新執行並留存證據的項目、
     沿用上一輪執行者回報但本輪未重跑的項目、尚未測試的項目，不得把三者混為
     一談或暗示「上一輪回報」等同「本輪已獨立驗證」。
   - lint 若與上一輪基線（13 errors / 21 warnings）不同，照實際重跑結果記錄，
     不假設沿用舊數字。
3. 新建一支可重複執行、留下實體證據（螢幕截圖 + 執行 log）的瀏覽器驗證腳本
   （Playwright，沿用既有 `forms-leave-guard-review-isolation-guard.mjs` 的
   `verifyIsolatedTarget` 模式防止誤連使用者環境），**動態累計**通過/失敗數，
   至少涵蓋：
   a. 新建 NOI：預選廠商同步帶入三欄位，且只有實際有值的欄位顯示提示（驗證
      R1：若預選廠商某欄位缺值，該欄位不顯示提示）。
   b. 新建 NOI 後，使用者手動把某個已自動帶入的欄位**清空**（不是改成別的值），
      再換廠商：驗證該欄位狀態已變成 `user`、不被新廠商覆蓋、維持空白、且不
      顯示提示（這是 R2 明確要求、必須新增的情境，既有紀錄空白案例不能代替）。
   c. 換到一個「對應欄位本身是空值」的廠商：驗證原本 `system` 狀態且有值的
      欄位，確實被覆蓋成空字串（不是殘留舊值）。
   d. 清除廠商選擇：驗證值與狀態不變，提示依現有規則顯示/隱藏。
   e. 開啟既有紀錄（某欄位原本空白）：驗證該欄位保持空白、不被自動帶入。
   f. 保存成功後，用新的 page/context 重新開啟同一筆記錄（同 `id`），獨立讀出
      三個聯絡欄位的值，核對與保存前畫面一致（不是只看保存當下畫面沒跳錯）。
   g. 延遲廠商清單 API 回應後開啟「新建 NOI」：驗證空欄位不顯示任何來源提示
      （不得因為 `contactSource` 預設是 `system` 就誤報）；之後讓清單回應抵達，
      驗證已手動輸入的欄位不被覆蓋，尚未手動輸入的欄位維持原樣（因為
      `getInitialData` 只在初始化執行一次，晚到的清單不會觸發重新初始化——如
      實記錄這個行為，不視為需要修的 bug，也不新增機制讓它「追上」）；若實際
      操作發現當下 UI 有任何東西擋住這個流程本身（例如 Add NOI 按鈕在清單載入
      前被禁用），如實記錄觀察到的阻擋，不用猜測代替。
4. 執行 log 與截圖留存到 `docs/workflow/NOI-CONTACT-AUTOFILL-2026-002-evidence/`，
   並在 handoff 文件裡索引每個情境對應的證據檔名，供審查者獨立核對。
5. `seed_noi_contact_autofill.py`：在 `import database`／任何 DB 連線建立之前，
   先 `assert os.environ.get('QUALITAS_REQUIRE_ISOLATED_DB') == '1'`，再呼叫
   `core.startup_guard.guard_if_required()`（沿用 `seed_active_assignee_review.py`
   等既有腳本的順序：先 import `guard_if_required`、assert、呼叫，之後才
   `from database import SessionLocal`），讓 `DATABASE_URL`／`LOG_DIR` 真正被
   `check_isolated_database`/`check_log_dir` 驗證，不是只檢查一個字串。
6. 重新執行 `npx tsc --noEmit`、`npm run build`、`node scripts/run-unit-tests.mjs`、
   `npm run lint`，如實記錄本輪實際結果。

## ALLOWED_PATHS
- `react-app/src/components/NOI/modals/NOIDetailModal.tsx`（僅限 R1 的提示顯示
  條件，不改其他已接受的邏輯）
- `backend/scripts/verification/seed_noi_contact_autofill.py`（僅限 R3 的
  guard 呼叫順序）
- `react-app/tests-browser/`（新增/改寫本輪驗證腳本）
- `docs/workflow/`（本輪 handoff/evidence；上一輪 archive 已建立）
- `TASK.md` / `STATUS.md` / `REVIEW.md`

## FORBIDDEN_PATHS
- `react-app/src/context/LanguageContext.tsx`、
  `react-app/src/components/Shared/FormShell.module.css`：上一輪已接受的新增
  （3 個 i18n key、`.fieldHint` 樣式）**保留，不修改**。
- 任何「主檔資料晚到時的來源比對＋最新狀態確認」機制的實作或設計——本批只
  如實驗證並記錄現狀行為，不得新增讓晚到資料自動回填/追上的機制。
- `NOIDetailModal.tsx` 裡 R1 以外的既有分支（`getInitialData`、
  `getInitialContactSource`、Contractor `onChange` 的欄位覆蓋/保留邏輯、
  `handleFieldChange` 的來源標記邏輯）——已審查接受，不重寫。
- ITP 任何檔案、後端產品邏輯（`backend/routers`、`backend/services` 等）。
- `TASK.md`（上一輪）／`DECISIONS.md`／`AGENTS.md`／任何既有
  `docs/workflow/*-archive.md`（唯讀）。
- 開發資料庫、使用者 8198/3198。

## ACCEPTANCE_CRITERIA
1. R1：讀碼＋實測證明，欄位為 `system` 但目前無值時，不顯示任何來源提示；
   有值時行為與上一輪相同。
2. R2：新增的 Playwright 腳本能重複執行，產出動態累計的 PASS/FAIL 數與實體
   log／截圖；至少涵蓋 SCOPE 第 3 點 a-g 七項情境，g 項的延遲載入情境必須
   實際用網路攔截模擬，不是用程式碼邏輯推論代替操作。
3. R2：STATUS 清楚區分「本輪重新驗證並留存證據」vs「沿用前一輪回報，本輪未
   重跑」vs「未測試」，不得含糊其辭；「沒有非同步晚到情境」這句不精確描述已
   更正為如實說明現狀限制。
4. R3：`seed_noi_contact_autofill.py` 在建立任何 DB 連線前呼叫
   `guard_if_required()`，可用刻意設定錯誤 `DATABASE_URL`/`LOG_DIR` 的方式
   實測證明它確實會擋下來（不是只讀程式碼就假設會擋）。
5. `npx tsc --noEmit`、`npm run build`、單元測試、lint 皆為本輪重新執行的
   結果，如實記錄數字。
6. 證據檔案（截圖、log）實際存在於
   `docs/workflow/NOI-CONTACT-AUTOFILL-2026-002-evidence/`，handoff 文件索引
   每項情境對應的檔名，供審查者獨立核對，不是只有執行者的文字回報。

## CLAUDE_PRECHECK
1. 已讀 `docs/workflow/NOI-CONTACT-AUTOFILL-2026-001-archive.md`（含完整
   REVIEW 原文），理解 R1-R3 的具體要求，不得自行弱化。
2. 已讀 `NOIDetailModal.tsx` 現狀程式碼，確認三處來源提示條件與 R1 描述的
   問題一致。
3. 已讀 `core/startup_guard.py` 的 `guard_if_required`/`enforce_from_environment`，
   以及 `scripts/verification/seed_active_assignee_review.py` 作為既有「seed
   腳本正確呼叫順序」的範例。
4. 已讀 `react-app/tests-browser/forms-leave-guard-review-isolation-guard.mjs`
   的 `verifyIsolatedTarget`，本批驗證腳本直接 import 沿用，不重造一份。
5. 隔離環境沿用既有 `isolated_stack.py` 與既有種子慣例，不操作使用者
   8198/3198、不操作開發資料庫。
````

## STATUS.md（原文，完整保留）

````markdown
# STATUS.md — Claude 執行結果

TASK_ID: NOI-CONTACT-AUTOFILL-2026-002
SOURCE_TASK_ID: NOI-CONTACT-AUTOFILL-2026-001

## RESULT
- [x] DONE
- [ ] PARTIAL
- [ ] BLOCKED

REVIEW.md 的 R1-R3 已全部補正，詳見下方與
`docs/workflow/NOI-CONTACT-AUTOFILL-2026-002-handoff.md`。核心實作（逐欄位
system/user 來源追蹤、新建同步帶入、system 欄位換廠商覆蓋、保留提示、清除廠商
不連動清空）保留，**未重寫**。本輪新增可重複執行的 Playwright 驗證腳本，產出
動態累計的 37 checks executed, 37 PASS, 0 FAIL，連同截圖與 log 留存於
`docs/workflow/NOI-CONTACT-AUTOFILL-2026-002-evidence/`，供審查者獨立核對。

## 對使用者的改善（本輪新增，疊加在上一輪之上）
1. 修正一個上一輪引入的誤導顯示：新建 NOI 時若廠商清單尚未載入、或預選廠商
   某個聯絡欄位本身是空的，先前版本會顯示「由廠商資料帶入」或「先前廠商的
   資料」這類提示，但欄位其實是空的，容易誤導使用者以為已經有資料。現在只有
   欄位**真的有值**時才顯示來源提示。
2. 換到一家某個聯絡欄位本身是空值的廠商時，該欄位現在會確實被清空（先前只驗
   證過「填入有值的欄位」，沒驗證過「清空變空值」這個方向）。

## CLAUDE_PRECHECK 執行記錄
1. 已讀 `docs/workflow/NOI-CONTACT-AUTOFILL-2026-001-archive.md`（含完整 REVIEW
   原文），理解 R1-R3 的具體要求，未自行弱化。
2. 已讀 `NOIDetailModal.tsx` 現狀程式碼，確認三處來源提示條件與 R1 描述的問題
   一致。
3. 已讀 `core/startup_guard.py` 的 `guard_if_required`/`enforce_from_environment`
   與 `scripts/verification/seed_active_assignee_review.py` 的既有呼叫順序範例。
4. 已讀 `react-app/tests-browser/forms-leave-guard-review-isolation-guard.mjs`
   的 `verifyIsolatedTarget`，本輪驗證腳本直接 import 沿用，未重造一份。

## R1 修復內容
`NOIDetailModal.tsx` 三處來源提示的顯示條件，從
`contactSource[field] === 'system'` 改為
`contactSource[field] === 'system' && formData[field]`（system 狀態**且**欄位
目前有值才顯示）。`contacts`／`phone`／`email` 三處皆同樣修改，無新增分支。

## R2 修復內容
1. 新建 `react-app/tests-browser/noi-contact-autofill-review.mjs`：Playwright
   腳本，沿用既有 `verifyIsolatedTarget` 防誤連使用者環境；通過/失敗數為執行期
   動態累計，非靜態計數。涵蓋 TASK.md SCOPE 第 3 點 a-g 七項情境，包含兩個
   REVIEW 明確要求、上一輪沒做過的新情境：
   - b：新建後**手動清空**一個已自動帶入的欄位，再換廠商——驗證該欄位維持
     空白、不被覆蓋（既有紀錄的空白案例不能代替這個「新建+手動清空」案例）。
   - c：換到一家**該欄位本身是空值**的廠商——驗證原本有值的 system 欄位確實
     被清空，不是殘留舊值。
   另外新增 g：攔截並延遲 `/api/contractors/` 回應，驗證清單載入前開啟新建
   表單時空欄位不顯示任何來源提示、清單晚到也不會回頭覆蓋已手動輸入的內容或
   自動選定廠商（如實記錄此為現狀既有限制，非新機制）。
2. 更正「`getActiveContractors()` 是同步呼叫，沒有非同步晚到情境」這個不精確
   說法：`fetchContractors()` 本身是非同步的，`AppProviders` 會先渲染
   `children` 再觸發載入；`NOIDetailModal` 的初始化只在 `useState` 當下執行
   一次，晚到的清單不會觸發重新初始化。這是現狀限制，本輪**未新增**任何晚到
   資料自動回填機制。詳見 handoff 文件。
3. STATUS（本節下方「驗證證據分級」）明確區分本輪重新驗證並留存證據、沿用
   前一輪回報但本輪未重跑、與未測試三類，不混為一談。

## R3 修復內容
`seed_noi_contact_autofill.py`：在 `import database`（建立 DB 連線物件）之前，
先呼叫既有 `core.startup_guard.guard_if_required()`（沿用
`seed_active_assignee_review.py` 等既有腳本的順序）。實測證明：
- 刻意設定錯誤 `DATABASE_URL`（指向專案自己的 `qualitas.db`）時，腳本在建立
  任何 DB session 之前就被 `UnsafeDatabaseError` 擋下，不會碰到任何資料。
- 正確的隔離設定（`DATABASE_URL`/`LOG_DIR`/`QUALITAS_UPLOAD_ROOT` 皆指向
  臨時目錄）可以正常通過。
- 本輪實際跑 `isolated_stack.py seed` 建立的隔離環境也是透過這個修正後的
  版本成功 seed（37 項驗證的前提），不只是獨立小範例。
詳細指令與輸出見 handoff 文件「R3」一節。

## 隔離環境驗證（本輪重新執行，依本輪實際操作紀錄）
- `isolated_stack.py up --port 8220`，新建本輪專屬 launcher
  `react-app/tests-browser/noi-contact-autofill-review-vite-launcher.mjs`
  （8220/3220，沿用既有每輪一組專屬埠號慣例，與上一輪的 8210/3210 launcher
  並存、不覆寫）。
- 種子：`seed_noi_contact_autofill.py`（R3 修正後版本）：三家 active 廠商
  （含一家 Phone 刻意留空，供 c 情境使用）、兩筆既有 NOI 紀錄（分別標記
  `NCAF-SAVE-MARK`／`NCAF-BLANK-MARK` 供腳本定位）、兩筆 ITP 供保存流程的
  必填「ITP no.」可選。
- `noi-contact-autofill-review.mjs`：**37 checks executed, 37 PASS, 0 FAIL**，
  完整 `run.log` 與 10 張截圖見
  `docs/workflow/NOI-CONTACT-AUTOFILL-2026-002-evidence/`，逐情境對應表見
  handoff 文件。
- 啟動/拆除隔離堆疊與執行本輪驗證腳本，因本機埠號綁定／跨行程存活檢查
  （`process.kill(pid, 0)`）被沙盒封鎖，以 `dangerouslyDisableSandbox`
  執行這幾個明確需要的指令；其餘讀寫操作維持在沙盒內。
- 隔離堆疊已拆除（`isolated_stack.py down`），`lsof` 確認 8220/3220 埠號釋放；
  使用者 8198/3198 全程監聽未受影響（`lsof` 核對前後皆正常）。

## 驗證證據分級（R2 要求，避免含糊）
**本輪重新執行並留存實體證據**：
- R1/R2 的全部 37 項情境（a-g，見上表），截圖＋log 皆為本輪產出。
- R3 的 guard 阻擋／通過兩個實測案例（見 handoff，指令與輸出皆為本輪執行）。
- `npx tsc --noEmit`、`npm run build`、`node scripts/run-unit-tests.mjs`、
  `npm run lint`：本輪重新執行，見下方 TESTS_RUN，不沿用上一輪數字（即使
  結果相同也是重新測出來的）。

**沿用上一輪、本輪未重跑**：
- 核心實作本身（逐欄位來源追蹤、新建同步帶入、system 覆蓋、保留提示、清除
  廠商不連動清空）的程式邏輯未變動，上一輪已有的驗證邏輯本輪未重複驗證其
  正確性本身（但本輪的 a/b/d/e/f 情境仍會間接走過這些邏輯路徑，只是不是
  專門為了重新驗證它們而設計）。

**未測試**：
- 「主檔資料晚到＋最新狀態確認」機制：未實作，因此無測試對象；g 情境驗證的
  是「現狀沒有這套機制時的實際行為」，不是驗證這套機制本身。
- 只驗證了 NOI 模組，未擴及其他可能有類似模式的模組。

## FILES_CHANGED
- `react-app/src/components/NOI/modals/NOIDetailModal.tsx`（R1：三處來源提示
  顯示條件，各加一個 `&& formData[field]`）。
- `backend/scripts/verification/seed_noi_contact_autofill.py`（R3：guard 呼叫
  順序；另外新增第三家廠商 `NCAF-VC`（Phone 留空）供 c 情境使用，記錄文件
  更新，兩筆既有 NOI 紀錄加上 `NCAF-SAVE-MARK`／`NCAF-BLANK-MARK` 標記文字）。

## FILES_ADDED
- `docs/workflow/NOI-CONTACT-AUTOFILL-2026-001-archive.md`（封存上一輪 REVISE
  原文）。
- `docs/workflow/NOI-CONTACT-AUTOFILL-2026-002-handoff.md`。
- `docs/workflow/NOI-CONTACT-AUTOFILL-2026-002-evidence/`（10 張截圖 +
  `run.log`）。
- `react-app/tests-browser/noi-contact-autofill-review.mjs`（本輪驗證腳本）。
- `react-app/tests-browser/noi-contact-autofill-review-vite-launcher.mjs`
  （本輪專屬隔離 vite launcher，8220/3220）。

## FILES_DELETED
無。

## TESTS_RUN
- `npx tsc --noEmit`：通過，0 錯誤。
- `npm run build`：通過。
- `node scripts/run-unit-tests.mjs`：123/123 全部通過，0 失敗。
- `npm run lint`：**13 個錯誤、21 個警告**（本輪重新執行的結果；與上一輪數字
  相同，但這是重跑出來的，不是沿用舊數字）。本輪修改的兩個檔案
  （`NOIDetailModal.tsx`／`seed_noi_contact_autofill.py`）皆不在既有錯誤清單
  中。
- `noi-contact-autofill-review.mjs`（隔離瀏覽器驗證，Playwright）：
  **37 checks executed, 37 PASS, 0 FAIL**，動態執行期計數，log 已存檔。

## RISKS / LIMITATIONS
- 「主檔資料晚到（非同步載入）不得覆蓋使用者輸入」這套「來源比對＋最新狀態
  確認」機制，依範圍限制本輪**仍未**設計或實作；g 情境已實測記錄現狀行為
  （晚到清單不會自動回填，也不會覆蓋使用者已輸入的內容），但這不等於這套
  機制已經存在或已經安全——若未來廠商資料改成在使用者已經開始編輯之後才
  抵達（目前的實測只涵蓋「清單一開始就還沒載入」這個情境，不是「使用者已經
  選了一家廠商、該廠商的詳細聯絡資訊才非同步晚到」這個更複雜的情境，因為
  目前 `Contractor` 物件的聯絡資訊本來就是清單的一部分、不是另外非同步載入
  的），需要另外設計與驗證，不能假設目前的 `system`/`user` 狀態判斷就足夠
  安全。
- 只驗證了 NOI 模組；ITP 沒有對應欄位，依範圍未涉及。
- `react-app/tests-browser/noi-contact-autofill-review-vite-launcher.mjs`、
  `noi-contact-autofill-review.mjs` 與種子腳本修改是本輪新增/修改的隔離驗證
  輔助檔案，會保留在 repo 中（沿用既有每輪慣例），非產品程式碼。上一輪的
  `noi-contact-autofill-vite-launcher.mjs`（8210/3210）與
  `forms-consistency-review.mjs` 風格的驗證腳本未被本輪取代或刪除，仍保留
  在 repo。

## SAFETY_CHECK
- 未修改 `AGENTS.md`、`DECISIONS.md`、任何既有 `docs/workflow/*-archive.md`。
  `REVIEW.md` 已重置為待審查狀態，**未自行填入任何審查結論**。
- 未修改 `react-app/src/context/LanguageContext.tsx`、
  `react-app/src/components/Shared/FormShell.module.css`（上一輪已接受的新增，
  本輪保留不動）。
- 未修改 `NOIDetailModal.tsx` 裡 R1 以外的既有分支（`getInitialData`、
  `getInitialContactSource`、Contractor `onChange` 的覆蓋/保留邏輯、
  `handleFieldChange` 的來源標記邏輯）。
- 未修改 ITP 任何檔案、任何後端產品邏輯（`backend/routers`、
  `backend/services` 等）、既有 `handleSave`／驗證／授權邏輯。
- 未操作或拆除使用者 8198/3198、日常開發 5173 及其後端；只操作自建隔離堆疊
  （8220/3220，已拆除，`lsof` 確認埠號釋放、使用者埠號前後皆正常監聽）。
- 未使用 stash/reset/checkout；未還原協作者既有修改。
- 未 commit/push/部署。
- 未將任何測試帳密寫入 repo；種子腳本要求環境變數提供密碼，無預設或硬編碼值。
- 啟動/拆除隔離環境與執行驗證腳本的指令，因本機埠號綁定／跨行程存活檢查被
  沙盒封鎖（`EPERM`／`process.kill` 被拒），以 `dangerouslyDisableSandbox`
  執行這幾個明確需要的指令；其餘操作維持在沙盒內執行，未因此繞過其他安全
  限制。
````

## REVIEW.md（原文，完整保留）

````markdown
# REVIEW.md — 獨立審查

TASK_ID: NOI-CONTACT-AUTOFILL-2026-002
SOURCE_TASK_ID: NOI-CONTACT-AUTOFILL-2026-001
審查日期：2026-10-04

## EVIDENCE_CHECK
已讀 TASK/STATUS/handoff、完整 noi-contact-autofill-review.mjs 與留存 run.log，核對三處提示條件、種子 guard 呼叫順序及 guard 實作。log 確有動態 37 PASS / 0 FAIL；本次未重新執行瀏覽器或前端套件，執行結果為保存的執行者證據。
R1 通過：三欄均要求 system 且實際非空；b/c/g 對空白提示有有效斷言。
R3 通過：環境旗標先強制為 1，再 guard_if_required，之後才 import database 與建立 session，符合要求。
R2 部分通過：刻意清空、新廠商空值、既有空值、全新 browser.newPage 所建立獨立 context 的重讀證據可接受。尚有下列兩個測試空隙，未發現需要重寫產品的理由。

## SCOPE_CHECK
保留已接受產品邏輯、R1/R3 與既有保存驗證。不新增自動晚到回填，不擴大模組。本次只填 REVIEW。

## DECISIONS_CHECK
證據數量不替代斷言內容；等待固定時間不等於資料已到達。初始化寫法為 useState(getInitialData())，函式會在 render 評估，只有結果在首次初始化被採用；並非 lazy initializer。現有晚到資料不自動重置 state 的行為結論不因此改變。

## VERDICT
- [ ] PASS
- [x] REVISE
- [ ] HUMAN_REQUIRED

## REQUIRED_FIXES
### R1 — 精確核對帶入值與提示（只補 a/b/d 相關片段）
a 僅判斷字串非空；b6 只要求電話或 Email 任一改變，錯廠商值或僅一欄更新也能通過。改用已知種子／獨立 API 來源，逐欄核對預選廠商與改選廠商的預期值。b 清空保留案例同時斷言具名的保留 toast 可見且文案正確；d 現在只 count small，補核對「先前廠商」實際文案。保留已接受的 b/c/e 清空斷言，不擴大測試矩陣。

### R2 — 證明延遲清單真的到達（只補 g）
在解除 gate 前註冊 response 等待，確認 contractors 回應成功且預期選項已出現，再核對手改值保持、未自動預選。之後實際選一個已載入廠商，確認手改 contacts 保留、system phone/email 精確帶入。這是上一輪要求的「選定廠商後正常帶入」尚缺部分，無需新增產品機制。

### 文件隨手校正（不另開審查項目）
- 修正 lazy initializer／函式只執行一次的敘述為 state 只採用初始化結果。
- f 目前以唯一 marker 重開，未直接比對 id；證據可支持該唯一測資重讀，描述改為實際方法，不冒稱已斷言同 id；不要求重跑 f。
- STATUS「換到空值廠商現在才會清空」改為既有本批實作行為、本輪新增驗證，避免將補測當新修復。
- handoff 範例勿內嵌密碼，改為使用既有環境變數（不需重跑 guard）。lint 明列仍失敗。

## NEXT_STEP
只補上述短段落的精確斷言及文件，重跑受影響 a/b/d/g 即可；不重跑完整 37 項、123 項或 build（除非因此有產品修改），不重開 R1 提示修正或 R3 guard。保留既有證據並將新增結果分開列示。依協作規則封存本輪後建立補正 TASK，避免覆寫歷史。
````
