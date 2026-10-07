# ITP → Checklist → NOI → ITR → 核准／NCR／複驗 操作清單編寫與真實驗證 — 2026-09-29

使用者要求：先讀最新程式與交接紀錄，編寫一份可直接照做的業務試用操作清單（合格主流程＋不合格分
支），標明每步所需權限、畫面操作、儲存結果。第一版清單交付後，使用者核對出 5 類問題（權限描述
過於寬鬆、NCR/複驗關係誤判為互斥、Raise NCR 條件不完整、Checklist 保存/判定規則敘述矛盾、
Project 前置條件誤判），要求先修正清單，再用隔離環境＋真實瀏覽器操作完整跑通合格與不合格兩條
流程，逐步記錄實際使用的權限、畫面操作與保存結果。

## 一、清單修正（讀碼核對，5 點逐一修正）

### 1. 補齊每一步實際需要的權限

逐一追查前端 store 觸發的 GET 端點與後端路由的 `RoleChecker`／內部權限檢查，區分「進入畫面」
「載入跨模組選單」「建立」「更新」「連結 Checklist」「填寫結果」「核准」：

- ITP：進入/列表 `itp:view:all`；載入 Contractor 選單 `contractors:view:all`；新建存檔（不變
  更狀態進 Approved）`itp:create:all`；**Publish 或把狀態改成 Approved／Approved with
  comments**——除了 `itp:create:all`（新建）或 `itp:update:all`（既有紀錄）之外，**另外需要
  `itp:approve:all`**（前端 `canApprove` 同時控制 Publish 按鈕可見性與狀態下拉的合法選項，後端
  `itp_service.py::create_itp`/`update_itp` 各自呼叫 `_require_itp_permission(user_permissions,
  ITP_APPROVE)` 二次強制）。
- Checklist：**Generate Checklist 產生後已經是一筆既有範本**——查看清單/選取範本需要
  `checklist:view:all`（供 `useChecklistStore` 抓取範本清單，ITR 的「連結 Checklist」下拉選單
  沒有這個權限會是空的）；**後續編輯保存**（填 recordsNo/location/criteria 等）需要
  `checklist:update:all`（PUT 端點），不是 create——這是第一版清單的錯誤，已更正。
- NOI：進入/列表 `noi:view:all`；載入 Contractor 選單 `contractors:view:all`；**載入 ITP No.
  下拉選單需要 `itp:view:all`**（`NOIDetailModal.tsx` 讀 `useITPStore`，第一版清單漏列這個跨模
  組權限，已補上）；新建 `noi:create:all`。
- ITR：進入/列表 `itr:view:all`；載入 NOI 下拉 `noi:view:all`；新建 `itr:create:all`；連結／取
  消連結 Checklist 範本 `itr:update:all`（`POST/DELETE /itr/{id}/link-checklist`，路由層
  `RoleChecker(ITR_UPDATE)`）；填寫並存檔項目結果（Ongoing 首次變 Pass/Fail）
  `checklist:update:all`；**重新編輯一個已經是 Pass/Fail 的既有實例**才需要
  `checklist:close:all`（`routers/checklist.py::_require_checklist_close_permission`，只在
  `existing.status in ('Pass','Fail')` 時才檢查，首次填寫存檔不受影響）。
- **既有紀錄的 Publish 需要 `itr:update:all` ＋ `itr:approve:all` 兩者都要**——PUT
  `/itr/{id}/` 路由層是 `RoleChecker(ITR_UPDATE)`，狀態要進 Approved 時
  `routers/itr.py::update_itr` 再額外呼叫 `_require_itr_approve_permission`，兩個檢查都通過才
  放行；第一版清單只寫「`itr:approve:all`」，已更正為兩者皆需。
- **Revoke Approval 另列，只需要 `itr:approve:all`**——`POST /itr/{id}/revoke-approval` 路由層
  直接是 `RoleChecker(ITR_APPROVE)`，不檢查 `itr:update:all`（既有紀錄被鎖定後，只有真正握有核
  准權限的人能撤銷核准，不需要一般編輯權限）。
- Raise NCR：`ncr:create:all`（`POST /itr/{id}/create-ncr` 路由層直接是
  `RoleChecker(NCR_CREATE)`，不需要 `itr:update:all`）。
- Re-inspect：`itr:create:all`（`POST /itr/{id}/re-inspect` 路由層 `RoleChecker(ITR_CREATE)`）。

**不再把「只有 create 權限的帳號」描述成能完成後續所有操作**——例如只有 `itp:create:all` 的帳
號可以把 ITP 存成 Pending，但無法 Publish；只有 `itr:create:all` 的帳號可以新建 ITR、可以觸發
Re-inspect，但無法核准（缺 `itr:approve:all`）、也無法把 ITP/NOI 相關跨模組選單填起來（缺對應
的 `*:view:all`）。

### 2. 更正 NCR／複驗的關係

讀 `services/itr_service.py::create_ncr_from_itr` 與 `create_reinspection` 兩個函式的完整條
件（見下第 3 點），確認：

- 兩者互不觸發（各自獨立的按鈕/端點），但**不互斥**——只要各自的條件仍然成立，可以在同一筆
  Fail/Reject 的 ITR 上**先後都執行**，程式沒有任何互斥檢查。隔離環境實測：對同一筆
  `QTS-CWC-ITR-000002`（Fail）先點 Raise NCR（成功建立 `QTS-CWC-NCR-000001`），回頭再點
  Re-inspect（成功建立 `QTS-CWC-ITR-000003`），原始 ITR 的兩個按鈕全程都還在（見下方截圖
  `36-original-fail-itr-unchanged.png`）。
- 也沒有防止「同一來源重複執行同一動作」的機制——`create_ncr_from_itr` 沒有檢查
  `existingItem.ncrNumber` 是否已有值，`create_reinspection` 沒有檢查是否已經複驗過；兩者皆可
  在同一筆來源 ITR 上被重複觸發，各自都會成功建立新記錄（NCR 的情況下，ITR 上的 `ncrNumber` 欄
  位會被最新一次覆蓋，前一筆 NCR 本身不受影響、仍然存在，只是原 ITR 不再顯示它的編號）。

### 3. 補回 Raise NCR 的完整條件（複驗條件獨立核對，不套用 NCR 規則）

| | Raise NCR | Re-inspect |
|---|---|---|
| 共同前提 | Inspection Result = Fail 或 狀態 = Reject | 同左 |
| Approved/Void 保護 | **有**——`db_itr.status in ('Approved','Void')` 直接拒絕，訊息明講「a locked record」，需改走 NCR 模組自己新增 | **沒有**——`create_reinspection` 只檢查 Fail/Reject 這一個條件，沒有另外擋 Approved/Void；理論上若 `status='Approved'` 但 `inspectionResult` 欄位仍殘留 `'Fail'`（兩欄位彼此獨立，正常流程下核准前只檢查 Checklist 是否 Pass，不檢查 inspectionResult），Re-inspect 端點仍可能被觸發成功——這點僅讀碼推論，未做邊界情境的隔離驗證，列為待確認 |
| 資料範圍 | `record_in_scope(db_itr, scope)`，超出範圍回 404 | 同左 |
| 權限 | `ncr:create:all` | `itr:create:all` |

兩者條件**獨立核對，不能互相套用**——這是第一版清單的主要缺陷（把 Fail/Reject 當成兩者共通且
唯一的條件），已更正。

### 4. 釐清 Checklist 的保存與判定（更正矛盾敘述，列出畫面實際選項）

- **未填完能否保存**：可以。`ChecklistSnapshotModal.tsx::handleSave` 只被一件事擋下——**任一
  項目選了 N/A 卻沒填理由**（`missingReason.length > 0` 時顯示錯誤、面板不關、已輸入內容不清
  空）；除此之外，不論項目填了幾項，Save 都會送出，狀態一律由 `deriveChecklistStatus(items)`
  即時算出送出，不會因為「沒填完」而被擋下來。第一版清單寫「全部填完才會存檔生效」與「Pass／
  Fail／N.A. 四選一」自相矛盾（若真的要求全部填完才能存，就不會有「保存未完成狀態」這回事）
  ——已更正為：**可隨時保存，保存後狀態依當下已填項目自動判定**。
- **畫面實際選項**：每個項目是 **Not filled／Pass／Fail／N.A. 四個互斥選項**（`ResultSelect`
  元件的 `data-result-option` 屬性值：`unfilled`／`pass`／`fail`／`na`），`Not filled` 是初始
  狀態，不是使用者主動點選的第四個「結果」，但畫面上它確實是四個並列的按鈕之一（見隔離環境截
  圖 `23-item-marked-pass.png`、`30b-fail-branch-instance-expand-attempt.png`）。
- **何時變 Pass／Fail／Ongoing**（`services/checklist_service.py::derive_checklist_status`，
  前端 `utils/checklistResult.ts::deriveChecklistStatus` 鏡射同一規則）：
  - 有任一項目還是 `Not filled`，或值無法辨識 → 整體 **Ongoing**（不論其他已填項目是否有 Fail）
  - 全部項目都已判定（O／X／N.A. 三態之一）且**至少一項 X** → **Fail**
  - 全部項目都已判定、沒有 X，但**至少一項 N.A.** → 仍是 **Ongoing**（N.A. 不算通過）
  - 全部項目都是 O → **Pass**

  **這條規則目前僅有程式碼與程式內註解為依據**（`checklist_service.py` 該函式的 docstring 開
  頭寫「THE status rule (2026-09-20)」），本次沒有找到使用者另外簽核/確認這條規則的獨立紀錄，
  因此在清單中一律標示為「目前行為」，不自稱「已確認政策」——這是第一版清單的用詞問題，已更
  正。
- **何時允許核准 ITR**：與上述規則相關但是不同層級的檢查——`_validate_approval`
  （`itr_service.py`）要求：(a) 至少 1 筆已連結的 Checklist 實例；(b) **全部**已連結實例的
  `status` 都必須是 `'Pass'`（任一筆 `Ongoing`/`Fail` 都會擋下）；(c) 額外用
  `pass_support_problems` 反查每個標記 Pass 的實例，確認其 `passCount`/`failCount` 與實際項目
  內容一致，防止竄改或陳舊資料冒充 Pass。這一層跟「單一 Checklist 自己何時變 Pass」是兩個獨立
  的檢查點，清單中分開說明。

### 5. 修正專案前置條件

讀 `core/scope.py::compute_scope`：非 Admin 帳號**完全沒有 `UserProject` 關聯、也沒有
`vendor_id`** 時，系統判定為 **unscoped（等同看得到全部專案的資料）**，不是「看不到／空
白」——這是第一版清單「未指派就一定空白」的誤判，已更正為：範圍限制是「加了才生效」，不是
「沒加就空白」。

- 為了讓測試乾淨對應準備好的測試資料，**必須明確給測試帳號指派剛好 1 筆 UserProject**：指派 1
  筆後，`enforce_create_scope`（`core/scope.py`）會在建立「畫面上沒有 Project 欄位」的紀錄
  （NOI／ITR／Checklist）時自動把 `project_id` 帶成這唯一的專案；若指派 2 筆以上又不由畫面指
  定 `project_id`，建立會直接被 `ScopeForbidden` 拒絕（「project_id is required and must be
  one of your projects」）。
- ITP／FAT 的新增畫面有一個**獨立的「Project」下拉選單**（`CreationProjectField.tsx`，其他模
  組沒有），選單內容已經照 `GET /projects/` 的 `apply_scope` 過濣，單一專案帳號只會看到自己那
  一個；請確實選取，不要留空。
- 畫面上方的 ProjectSelector（切換目前檢視範圍）需要切到同一個測試 Project 或「All
  Projects」，否則剛建立的資料可能因為檢視範圍不同而在列表上看不到——這是顯示層過濾，跟「建立
  時寫入哪個 `project_id`」是兩件事，清單中分開提醒。

本批用的隔離環境帳號 `chain_full` 持有清單中列出的完整權限集合（見
`backend/scripts/verification/seed_itp_checklist_itr_chain_walkthrough.py`），且明確只指派 1
筆 UserProject（`CHAIN-P1`），驗證了「單一專案帳號」路徑的 project_id 自動帶入確實如上述運作。

## 二、隔離環境真實瀏覽器驗證

新增 `react-app/tests-browser/itp-checklist-itr-chain-walkthrough.mjs`，用真實 Playwright 瀏
覽器操作（非模擬 API 呼叫）跑完整條合格主流程＋一條不合格分支（含 Raise NCR 與 Re-inspect 兩
個動作都在同一筆來源 ITR 上執行，驗證「不互斥」）。隔離環境重建 5 次（過程中修正腳本自身的選
擇器問題，詳見下方「過程中排除的假陽性」），最終一次乾淨執行從頭到尾無錯誤。

### 合格主流程（逐步記錄）

| 步驟 | 畫面操作 | 保存結果 |
|---|---|---|
| ITP 新建 | 選 Project=CHAINP1、Contractor、填 Subject，切到 Inspection Plan 新增 1 項，按 Save | `QTS-CWC-ITP-000001`，狀態 `Pending`（未進 Approved，符合「Save 不等於 Publish」） |
| Generate Checklist | 重新開啟該 ITP，Inspection Plan 分頁按 Generate Checklist | `QTS-CWC-CHECKLIST-000001` 建立成功，自動導頁到 Checklist 編輯畫面（範本模式） |
| Checklist 範本補齊 | 填 Criteria 文字，按 Save Template | 保存成功（見下方「發現的異常」——實際落地成 `-000002`，版本號變 2，非單純原地覆寫） |
| NOI 新建 | 選 Contractor、填 Subject、選 ITP No.=`QTS-CWC-ITP-000001`、填 Issue/Inspection Date、Time、Event #、Checkpoint、Contact/Phone/Email，按 Save | `QTS-CWC-NOI-000001`，狀態 `Open`，正確帶出 ITP 關聯 |
| ITR 新建 | 選 NOI No.=`QTS-CWC-NOI-000001`（自動帶出 Contractor/Subject/Inspection Date），按 Save | `QTS-CWC-ITR-000001`，狀態 `In Progress` |
| 連結 Checklist | 重新開啟 ITR，「+ Checklist」下拉選範本 | 建立 ITR 專屬實例（新 recordsNo，`Source Template` 標明來源與版本） |
| 填寫結果 | 展開實例 →「Checklist Items」分頁 → 項目結果點 Pass → 面板內 Save | PUT 成功，徽章變 `PASS`，`Judged 1/1` |
| 設定 Inspection Result | 主表單下拉選 Pass | — |
| 核准 | 按 Publish → 確認對話框 | ITR 狀態變 `Approved`，整份表單鎖定唯讀（含已連結 Checklist），出現「Revoke Approval」按鈕，`Publish` 仍可見（用途變成建立下一版），符合交接紀錄第一節第 3 點的權限敘述 |

**截圖**（隔離環境擷取，存於 `/private/tmp/claude-501/chain-walkthrough/`）：
`07-after-itp-save.png`、`09-after-generate-checklist.png`、`14-after-noi-save.png`、
`18-after-itr-save.png`、`23-item-marked-pass.png`、`28-approved-itr-locked.png`。

### 不合格分支（逐步記錄，Raise NCR 與 Re-inspect 皆在同一筆來源 ITR 執行）

| 步驟 | 畫面操作 | 保存結果 |
|---|---|---|
| 第二筆 ITR | 同一 NOI，新建 → Save | `QTS-CWC-ITR-000002`，`In Progress` |
| 連結並填 Fail | 連結新範本實例 → 項目結果點 Fail → 面板內 Save | 徽章變 `FAIL` |
| 設定 Inspection Result=Fail | 主表單下拉選 Fail → Save | — |
| Raise NCR | 重新開啟，按 Raise NCR | `QTS-CWC-NCR-000001` 建立成功，Subject 自動帶「NCR raised from failed ITR QTS-CWC-ITR-000002」，Contractor 自動帶入，**ITR no. 欄位正確回填 `QTS-CWC-ITR-000002`**（來源關聯確認），狀態 `Open` |
| 回到同一筆來源 ITR，Re-inspect | 按 Re-inspect | `QTS-CWC-ITR-000003` 建立成功，狀態重設為 `In Progress`；**其連結的 Checklist 實例（`QTS-CWC-CHECKLIST-000004`）狀態是 `NOT FILLED`（Not filled）**，項目/準則沿用同一來源範本，但結果確認清空（複驗結果清空確認） |
| 驗證原始紀錄未變 | 回到 `QTS-CWC-ITR-000002` | Inspection Result 仍是 `Fail`，其自己的 Checklist（`QTS-CWC-CHECKLIST-000003`）狀態仍是 `FAIL`，警告文字「WARNING: 1 FAILED CHECKLISTS」仍在，**Raise NCR／Re-inspect 兩個按鈕仍然都在**（確認未互斥、原紀錄未被任何一個動作改動） |

**截圖**：`29-fail-itr-created.png`、`30b-fail-branch-instance-expand-attempt.png`、
`33-after-raise-ncr.png`、`35-after-reinspect.png`、`36-original-fail-itr-unchanged.png`。

## 三、過程中排除的假陽性（不是產品問題）

- **NOI 的 ITP No. 下拉選單一度顯示空白**：一路追查到懷疑是跨模組 Zustand store 未持久化，最
  後用原始 DOM dump 確認該下拉選單其實有完整 17 個選項——問題出在本次新寫的 Playwright 測試腳
  本自己的 `label→control` XPath 定位邏輯對這個特定欄位不穩定（其餘欄位不受影響），改用
  `page.evaluate` 直接以原生 setter＋dispatch event 設值後穩定重現。純屬本次新增測試腳本的實
  作問題，與 NOI／ITP 任何程式碼無關，未列入產品缺陷。

## 四、過程中發現、未修的異常（**2026-09-29 後續調查後撤回，見第六節**）

~~Checklist 範本的 Save 會多產生一筆新紀錄，而不是原地覆蓋~~——**此發現已於後續專門調查中證實
為誤判，不是產品缺陷，也不是需要業務裁示的雙重語意問題。完整調查過程與證據見本文件第六節，此
處原文保留供對照，不再視為有效結論。**

原始描述（保留存查）：在 Checklist Template Library 畫面按「Save Template」保存一個已存在的範
本，畫面 Toast 顯示「Template saved (version 2)」，範本自身的 `version` 欄位確實原地遞增，但範
本列表同時多出一筆全新的 `recordsNo`，懷疑是版本語意與新建語意矛盾。**後續調查證實：這是當時
反覆在同一個持續累積的隔離環境上重跑開發中腳本所產生的假象**（每次重跑都各自呼叫一次
Generate Checklist，各自產生一筆全新、彼此無關的獨立範本；並非同一次 Save 動作產生兩筆紀
錄）——見第六節的完全乾淨環境、逐次點擊、逐次資料庫查證。

## 五、驗證範圍聲明（第一輪：清單編寫＋兩條流程驗證）

- 本批**沒有**重新做全面盤點，只在第一版清單與程式碼證據矛盾的地方做了針對性核對（上述五點）。
- 本批**沒有**重跑既有的其他模組測試套件（`tsc`／單元測試／後端 pytest 套件），因為沒有修改任
  何產品程式碼，只新增了兩個驗證用檔案：
  - `backend/scripts/verification/seed_itp_checklist_itr_chain_walkthrough.py`（種子腳本）
  - `react-app/tests-browser/itp-checklist-itr-chain-walkthrough.mjs`（Playwright 端到端腳本）
- 未建立正式資料（僅隔離環境內的種子資料，環境已 teardown）、未 commit／push／部署、未使用
  stash/reset/checkout、保留協作者所有未提交修改。

---

## 六、專項調查（第二輪，2026-09-29）：「Checklist 範本 Save 多開一筆新紀錄」

使用者要求只針對第四節的異常做隔離環境重現與調查，不重跑整條鏈，且明確要求：不能只憑筆數增加
就認定是範本膨脹，也不要先歸類為政策待決策；找出確切原因後，若是明確程式缺陷才做最小修正，若
是尚未定義的業務語意才回報後停下。

### 調查方法

新增 `react-app/tests-browser/checklist-save-template-investigation.mjs`，每次在**全新、乾淨
的隔離環境**（重建資料庫，不沿用任何先前殘留資料）上，精確控制每一次點擊，並在每個關鍵時間點
直接查詢後端 API（`GET /checklist/?include_instances=true`，繞過前端 store 快取）取得資料庫的
真實狀態，同時攔截瀏覽器發出的每一個 HTTP 請求（method、URL、request body、response body）。

### 1. 點擊的是哪個入口、按鈕

- 「Save Template」按鈕位於 Checklist 範本編輯畫面（`Checklist.tsx`），只在
  **`isBareTemplate`**（`itrId`／`template_id` 皆為空）時顯示這個文案；有 `itrId`/`template_id`
  的 ITR 專屬實例走的是另一個按鈕（ITR 內嵌面板的 Save，行為不同，不在本次調查範圍）。
- 對應的 `onSave` 處理常式（`Checklist.tsx:253`）邏輯是：`editingRecord ? await
  updateRecord(editingRecord.id, data) : await addRecord(data)`——**這是「更新既有紀錄」的語
  意，不是「另存新檔」也不是「建立新版本快照」**。只要 `editingRecord` 不是 `null`（也就是打開
  的是一筆既有紀錄，而非全新表單），就一定走 `updateRecord`。

### 2. 單次點擊實際送出的 POST／PUT 次數、目標 id 與回應

在全新環境中，依序執行「Generate Checklist → 不改內容直接按 Save Template → 改 Criteria 再按
一次 → 重新整理列表、重新開啟、再改一次 Criteria 再按第三次」，完整攔截結果：

| 動作 | 送出的請求 | 目標 id | 回應 version |
|---|---|---|---|
| Generate Checklist | `POST /api/checklist/`（僅此一次，來自 ITP 頁「Generate Checklist」自己的直接呼叫，不是 Save Template） | 新建 `...056`（範例） | 1 |
| 第 1 次 Save Template（未改內容） | `PUT /api/checklist/{同一個 id}/`（僅此一次） | 同一個 id | 1（內容未變，未觸發版本遞增） |
| 第 2 次 Save Template（改了 Criteria） | `PUT /api/checklist/{同一個 id}/`（僅此一次） | **同一個 id** | 2 |
| 第 3 次 Save Template（再改一次） | `PUT /api/checklist/{同一個 id}/`（僅此一次） | **同一個 id** | 3 |

**每一次「Save Template」點擊，從頭到尾都只送出恰好一個 PUT 請求，目標 id 三次都是同一個**——
沒有任何一次多送出一個 POST。

### 3. 操作前後的 id／version／template_id／itrId 對照，區分「同筆更新」「歷史版本」「獨立範本」

在同一個全新環境中，額外做「範本已被 ITR 連結後，再回頭編輯範本」的對照：

| 階段 | recordsNo | id | version | template_id | itrId／itrNumber |
|---|---|---|---|---|---|
| Generate Checklist 後 | `-000001` | `595aaa1...` | 1 | null | null（這是範本本身） |
| 範本自己 Save 三次後 | `-000001`（**不變**） | `595aaa1...`（**不變**） | 3 | null | null |
| 連結進 ITR（新建 NOI／ITR，用「+ Checklist」連結） | `-000002`（**新的一筆，正常現象**） | `ea27188...`（**新 id**） | 1 | `595aaa1...`（指回範本） | `b9a3cb8...` / `QTS-CWC-ITR-000001` |
| 連結後再編輯並儲存**範本**（`-000001`）一次 | `-000001`（**不變**） | `595aaa1...`（**不變**） | 4 | null | null |
| 重新查詢**實例**（`-000002`） | `-000002`（**不變**） | `ea27188...`（**逐位元組完全相同**） | 1（**不變**） | `595aaa1...`（**不變**） | `QTS-CWC-ITR-000001`（**不變**）；`source_template_version` 欄位固定停在連結當下的 `3`，不隨範本後續版本更新 |

**「同筆更新」**：範本自己的每一次 Save Template，`id` 全程不變，只有 `version` 遞增——這是同
一筆紀錄的原地更新，不是新建紀錄，也不是歷史版本快照（沒有另外的地方保存 v1/v2/v3 內容，舊版
本內容直接被覆蓋，只留最新內容＋一個遞增的版本號）。

**「獨立範本」**：`-000002` 是連結動作（`link_checklist`，「+ Checklist」下拉選單觸發）刻意產
生的**全新、獨立的一筆紀錄**（有自己的 `id`），`template_id` 指回來源範本、`itrId`/`itrNumber`
指向所屬 ITR——這是設計上就會發生的「實例化」，程式碼與程式內註解（`itr_service.py::
link_checklist` 的 docstring：「Link a checklist *template* to an ITR by creating an
INSTANCE」）明講這是刻意行為，本來就不是「同一筆」。

**沒有「歷史版本」這個第三種東西**：範本從 v1 改到 v4，全程只有一筆紀錄、一個 `id`，沒有任何地
方另外保存 v1/v2/v3 的快照內容（不像 PQP/ITP 有獨立的 `*History` 表）；本次調查沒有發現任何檔
案位置產生過「歷史版本」形式的新紀錄。

### 4. 對照前端/後端邏輯，找出前一輪「多一筆」觀察的確切原因

- 前端 `Checklist.tsx::onSave`：`editingRecord` 存在時只呼叫 `updateRecord`（單一 PUT），程式
  碼本身沒有任何分支會在更新既有紀錄時額外呼叫 `addRecord`／額外送出 POST。
- 後端 `services/checklist_service.py::update_checklist`：整個函式從查詢既有列、合併欄位、版
  本遞增判斷（`d['version'] = (db_checklist.version or 1) + 1`，直接寫回**同一個**
  `db_checklist` ORM 物件的屬性）、到最後 commit，全程沒有任何 `models.Checklist(...)`
  的新物件建構或 `db.add()` 呼叫——**沒有任何程式碼路徑會在這個函式裡建立新的資料庫列**。
- 唯一會建立新 Checklist 列的兩個地方：(a) `POST /checklist/`（`create_checklist`，由「Generate
  Checklist」或範本庫「+ New Template」呼叫）；(b) `itr_service.py::link_checklist`（連結範本
  到 ITR 時，刻意建立實例）。這兩個都不是「Save Template」按鈕本身會觸發的路徑。
- **結論**：前一輪觀察到「存檔一次、範本列表卻多一筆」的現象，其確切原因是**前一輪調查過程本
  身反覆在同一個持續存活、逐漸累積資料的隔離環境上重新執行還在開發中的整條鏈腳本**——每次重
  跑腳本，腳本自己的「Generate Checklist」步驟都會再呼叫一次 `POST /checklist/`，產生一筆全新
  的、內容或版本號恰好相近但彼此完全獨立的範本；當時把這些**不同次執行、各自獨立產生**的多筆
  範本，誤判成「同一次 Save Template 動作產生了兩筆紀錄」。這是調查方法本身的假象，**不是程式
  缺陷，也不涉及需要業務裁示的雙重語意**——不需要最小修正，也不需要提出業務語意選項讓使用者
  裁決，因為程式的實際行為本身自洽、單一、無矛盾。

### 已確認事實（本節結論）

1. 「Save Template」＝更新既有範本，單次點擊只送出一個 PUT，目標永遠是同一個 `id`。
2. `version` 只在範本的「定義性內容」（`activity` 或 `detail_data`／項目結構）真的改變時才遞
   增，且是同一列的原地遞增，不產生新列（`services/checklist_service.py` 第 656-666 行判斷邏
   輯，本次逐次驗證行為與程式碼完全一致）。
3. 一個範本被連結進 ITR 時，`link_checklist` 會**刻意**建立一筆新的、獨立的「實例」紀錄（設計
   如此，不是缺陷），此後範本本身如何繼續被編輯、存幾次版，都不會反過來影響已建立的實例——本
   次連續驗證確認實例前後逐位元組完全相同。
4. 前一輪報告的「多一筆新紀錄」現象，經全新隔離環境＋逐次點擊＋逐次資料庫查證後，**證實是調查
   方法造成的假象（反覆重跑同一份開發中腳本），不是產品行為**，予以撤回。

### 未決事項

無。本節調查已得出明確結論，不需要使用者裁示業務語意，也不需要修正程式碼。

---

## 七、修正（2026-09-29 第三輪）：ITR「未先 Save 直接 Publish」漏存 Inspection Result

使用者在自己手動操作的隔離試用環境（見上方帳號／URL）真實操作時發現：`QTS-CWC-ITR-000001` 的
Checklist 已保存 Pass，主表單 Inspection Result 選 Pass 後**沒有先按 Save，直接按 Publish 並確
認**，核准成功，但重新開啟後 Inspection Result 顯示「Not yet assessed」（未評估），Checklist
本身仍是 Pass。對照 `QTS-CWC-ITR-000002`：選 Fail 後**有**先按 Save，重開後正確顯示 Fail。

### 重現與根因（獨立隔離環境，未動使用者現場）

依指示保留使用者手動環境（8198／3198）與其中的核准紀錄不動，另外在**不同埠號**（8200／3200）
起一套獨立的隔離環境重現，避免與使用者現場互相干擾。

**直接對照三種情境的實際 HTTP 請求內容**（攔截瀏覽器實際送出的每一個請求）：

| 情境 | 操作 | 實際送出的 PUT body | 結果 |
|---|---|---|---|
| Case A（重現使用者回報的問題） | 選 Inspection Result=Pass，不按 Save，直接按 Publish＋確認 | `{"type":"Rev1.0","status":"Approved"}`——**完全沒有 `inspectionResult` 欄位** | 核准成功，但 `inspectionResult` 回應與資料庫皆為空字串，重開顯示「Not yet assessed」 |
| Case B（對照組，比照使用者的 000002） | 選 Inspection Result=Fail，按 Save | 完整表單內容，含 `"inspectionResult":"Fail"` | 重開正確顯示 Fail |

**確切原因**：`react-app/src/components/ITR/ITR.tsx::handleSaveITRDetails` 的 `publishOnly`
分支，**不論 ITR 目前是不是已經 Approved**，一律只送出
`{ type: details.type, status: details.status }` 兩個欄位，其餘表單內容（含
`inspectionResult`）一律捨棄不送。這段限制的原始註解寫「the backend rejects any other field on
a locked (Approved) ITR」——查證後這個限制**只在 ITR 目前狀態已經是 `Approved`** 時才成立
（`itr_service.py::update_itr` 第 430-451 行：`if db_itr.status == 'Approved': allowed_keys =
{'type','status','detail_data'}`，其餘欄位一律 `ValueError` 拒絕）。**但使用者回報的情境是「第
一次核准」（`In Progress` → `Approved`），這個限制在後端根本不成立**，後端在這個情境下並不會拒
絕額外欄位——是前端自己不分情境地把兩種完全不同的「Publish」用途（(1) 第一次核准；(2) 對已核
准記錄按 Publish 建立下一版）混用同一段邏輯，過度限制了 (1) 的情況，導致使用者剛選好但還沒按過
一般 Save 的欄位被整個丟棄，不是後端拒絕、不是顯示層問題，是**前端在建構這次要送出的請求時就
沒有把該欄位放進去**。

### 修正（最小修正）

`ITR.tsx::handleSaveITRDetails`：只在**目前持久化狀態已經是 `Approved`**（`itrList.find(i =>
i.id === currentItrId)?.status === 'Approved'`）時，才維持原本「只送 type/status」的限制路徑；
否則（第一次核准）改為**直接沿用原本一般 Save 就會走的同一段邏輯**（原本就會正確組出包含
`inspectionResult` 在內的完整表單內容），只是這次多帶了 `status: 'Approved'`——等同「Publish
=存檔＋核准一次做完」，不再是「Publish 完全略過存檔」。一個檔案、一段條件判斷，未新增任何欄
位、未改變後端任何驗證邏輯，未改變已核准記錄的鎖定規則。

### 驗證（獨立隔離環境，8200／3200，驗證後已拆除；未動使用者現場）

- `npx tsc --noEmit`：乾淨無輸出。
- 前端單元測試：105 passed，0 failed（未新增測試，此案例屬跨模組即時互動行為，既有測試套件本
  來就不覆蓋這類情境，以下方三個真實瀏覽器案例作為主要證據）。
- **Case A 修正後重跑**：PUT body 變成完整表單內容（含 `"inspectionResult":"Pass"`），核准成
  功後 `inspectionResult` 回應與資料庫皆正確為 `"Pass"`，重新開啟正確顯示 `Pass`（不再是
  「Not yet assessed」）。
- **Case B 修正後重跑**：行為完全不變，`inspectionResult` 一樣正確存為 `Fail`——確認一般
  Save 路徑未受影響。
- **Case C（新增，驗證既有鎖定規則未被破壞）**：把 Case A 已核准的 ITR 再次按 Publish（建立下
  一版revision，即「已核准記錄再次 Publish」情境）——PUT body 仍然精確是
  `{"type":"Rev2.0","status":"Approved"}`，跟修正前完全一樣，沒有多送、也沒有被後端的「鎖定記
  錄」規則拒絕；重新開啟後 `status`／`inspectionResult`（沿用之前的 `Pass`，未被覆寫或清空）／
  `type`（正確變成 `Rev2.0`）皆正確——確認**已核准記錄的鎖定規則與既有版本管理行為完全未受影
  響**。
- 完整重跑一次合格＋不合格兩條鏈（`itp-checklist-itr-chain-walkthrough.mjs`，一般 Save 再
  Publish 的既有流程）：`ITR STATUS AFTER PUBLISH: Approved`、Fail 分支的 Raise
  NCR／Re-inspect／原始紀錄不變全部與先前批次結果一致，確認本次修正對既有（一路都有按 Save
  的）流程零迴歸。

### 範圍聲明

- 只修改 `react-app/src/components/ITR/ITR.tsx` 一個檔案；未動 `ITRModals.tsx`、未動後端任何
  程式碼、未動 Checklist 相關邏輯（依上一輪指示不重跑、不改動）。
- 只跑了 `tsc`、既有前端單元測試套件、以及本次新增的隔離環境真實瀏覽器驗證（含一次完整鏈路回
  歸）；未擴大到翻譯、重構或其他既有待辦。
- **使用者手動試用環境（8198／3198）從頭到尾完全未被觸碰**——沒有撤回上面的核准紀錄、沒有改
  寫任何現場資料；本次調查與驗證全程使用另一組獨立埠號（8200／3200）的隔離環境，驗證完畢後已
  拆除，使用者的環境仍照原樣持續運作。
- 未建立正式資料、未 commit／push／部署、未使用 stash/reset/checkout。

---

## 八、事故紀錄（2026-09-29 第四輪）：確認修正時誤寫入使用者現場的既有複驗實例

第七節的修正落地後，依使用者要求在**使用者自己手動試用中的環境**（8198／3198，非本文件第七節
獨立調查用的 8200／3200）跑一次「新建 ITR → 直接 Publish 不先 Save」確認流程。過程中腳本的表格
「最後一列」定位邏輯出錯，誤操作到既有的 `QTS-CWC-ITR-000003`（而非新建立的
`QTS-CWC-ITR-000004`），並對它的既有連結內容做了寫入。事後立即嘗試復原，但復原不完整。以下是
只讀取隔離環境自身 SQLite 資料庫（`audit_logs`／`checklist`／`itr` 三張表，唯讀模式查詢，本節
產出過程中**沒有再對任何資料表寫入**）比對後的精確事實，更正上一輪回報中不準確的描述。

### 上一輪回報的錯誤之處

上一輪回報聲稱「腳本誤新增了兩筆 Checklist 實例」「ITR-000003 除了多一筆連結之外完全未受影
響」——**這兩句都不準確**。真正發生的是：一筆全新誤建、一筆既有實例被誤寫入內容，且後者無法
復原。

### 逐項核對（依 `audit_logs` 表的時間序）

| audit id | 時間戳（本機時區） | 動作 | 對象 | 內容摘要 |
|---|---|---|---|---|
| 24 | 22:52:30.216522 | `CREATE` | ITR `b855ea8b...`（即 ITR-000003） | 建立 ITR-000003 |
| 25 | 22:52:30.216606 | `CREATE_REINSPECTION`（來源 ITR-000002） | ITR `6b7dcff1...` | 由 ITR-000002 複驗產生 ITR-000003；`create_reinspection` 的既有邏輯會同時複製來源已連結的 Checklist 實例到新 ITR，結果重置為空 |
| 29 | 23:08:55.269983 | `LINK_CHECKLIST` | ITR-000003 | `new_value` 明確記錄 `instance_id: "284fc744-d023-4ccf-a862-406f392d938d"`——**這是本次確認流程腳本誤點擊既有紀錄時，額外執行「+ Checklist」連結動作新建立的一筆全新實例（即 `QTS-CWC-CHECKLIST-000005`）** |
| 30 | 23:08:57.345346 | `UPDATE` | Checklist `c8c402a2...`（`QTS-CWC-CHECKLIST-000004`） | **`old_value`**：`status:"Ongoing"`、項目 `result:""`（空白，未填）、`evidence_recorded_at: null` ——**`new_value`**：`status:"Pass"`、項目 `result:"O"`、`passCount:1` |
| 33 | 23:10:10.702240 | `UNLINK_CHECKLIST` | ITR-000003 | 事後清理動作，成功移除 id 29 新建的那一筆（`284fc744...`，即 `-000005`） |

`checklist` 資料表目前查詢：`id=284fc744...`（`-000005`）**已不存在**（COUNT=0，確認已被刪
除）；`id=c8c402a2...`（`-000004`）**仍存在**，`status=Pass`，且自建立以來（22:52:30）到現在，
`audit_logs` 裡對這個 id 只有這一筆 audit 記錄——也就是**只有 id 30 這次寫入**，前後沒有其他人
或其他動作碰過它。

### 依使用者要求逐項回答

1. **原有實例是哪一筆，是否被寫入 Pass**：
   原有實例是 `QTS-CWC-CHECKLIST-000004`（id `c8c402a2-61c4-4e63-b96f-f7190210babb`），由
   `CREATE_REINSPECTION`（audit id 25，22:52:30）建立，建立時 `status="Ongoing"`、項目
   `result=""`（未填）——與 Codex 先前確認的「原本連結 CHECKLIST-000004，結果為 Not filled」一
   致。**是，已被寫入 Pass**：audit id 30（23:08:57）的 UPDATE 記錄顯示
   `status: "Ongoing"→"Pass"`、`result: ""→"O"`、`passCount: 0→1`，是本次確認流程腳本的動作造
   成，發生在使用者的既有複驗實例上，不是新建紀錄。

2. **誤新增的實例是哪一筆**：**只有一筆**是真正新增的——`QTS-CWC-CHECKLIST-000005`（id
   `284fc744-d023-4ccf-a862-406f392d938d`），由 `LINK_CHECKLIST`（audit id 29，23:08:55）建
   立。上一輪回報稱「誤新增兩筆」不準確，予以更正：新增的只有這一筆，`-000004` 不是新增，是既
   有紀錄被誤寫入。

3. **實際移除的是哪一筆**：`QTS-CWC-CHECKLIST-000005`（`UNLINK_CHECKLIST`，audit id 33，
   23:10:10）——這筆本身從未持有真實檢驗證據，可合法刪除，資料表查詢確認已不存在。
   `QTS-CWC-CHECKLIST-000004`（被誤寫入 Pass 的既有實例）**沒有被移除、也無法移除**——系統的
   證據保存規則（一旦寫入真實 Pass/Fail 結果即永久禁止刪除／取消連結）擋下了移除嘗試（回應
   400，訊息：「it has held inspection evidence...even if its fields have since been
   cleared...an instance that has ever held real results can never be removed」）。

4. **目前 ITR-000003 的所有連結與結果**：資料庫查詢目前僅有一筆連結——
   `QTS-CWC-CHECKLIST-000004`（id `c8c402a2...`），`status=Pass`，`version=1`，
   `source_template_version=2`，`evidence_recorded_at=2026-09-29T23:08:57.345346`
   （`evidence_recorded_at_reliable=true`）。ITR-000003 本身的欄位（`status="In Progress"`，
   `inspectionResult=null`）：`audit_logs` 中除了上表列出的 `CREATE`／`CREATE_REINSPECTION`／
   `LINK_CHECKLIST`／`UNLINK_CHECKLIST` 四筆之外，**沒有其他任何 `UPDATE` 類型的 audit 記錄**，
   目前查詢到的欄位值與這四筆記錄的內容一致，沒有找到與之矛盾的寫入痕跡——但這只是「沒有找到
   反面證據」，不等於窮盡排除了所有可能，證據不足以更進一步保證之處，如實標示為無法確認。

### 未做的事（依指示）

本節調查全程只用 `sqlite3 -readonly` 對隔離環境自己的 SQLite 檔案唯讀查詢
`audit_logs`／`checklist`／`itr` 三張表，**沒有執行任何寫入、沒有清空結果、沒有 Reopen、沒有
Unlink、沒有刪除資料、沒有嘗試繞過證據保存規則**。`QTS-CWC-ITR-000003` 現狀維持原樣不動，**標
記為受本次誤操作影響、不再是乾淨的複驗案例**，這個標記只存在於本交接文件，未寫回任何產品資
料。

### 更正聲明

上一輪回報中「完全復原」「只有新增，原有紀錄完全未受影響」的說法有誤，予以撤回，以本節為準。

## Claude 接續

- ITR Publish 漏存 Inspection Result 的問題已修正並驗證（見上方第七節），修正後使用者環境裡
  `QTS-CWC-ITR-000001` 那筆記錄本身**仍然是修正前產生的錯誤狀態**（`inspectionResult` 空白）
  ——本次修正只影響「之後」的操作，不會回填已經存在的錯誤資料；如果使用者想看到這筆記錄本身被
  修正，需要在使用者自己的環境裡對這筆記錄重新操作一次（例如重新選 Pass 並存檔），而不是期待
  程式碼修正自動改掉已經寫入的資料。
- **`QTS-CWC-ITR-000003` 已標記為受第八節誤操作影響、不再是乾淨的複驗案例**——它原本連結的
  `QTS-CWC-CHECKLIST-000004`（Not filled）已被誤寫入 `Pass`，且系統的證據保存規則使這個寫入無
  法撤銷；後續若要用這個環境示範或驗證複驗（Re-inspect）流程，不要用 ITR-000003 當作「未填寫」
  的範例，需要另建一筆。
- 之後在任何試用環境對既有紀錄操作前，務必先用穩定的方式定位目標記錄（例如帶 `id` 的
  `?openId=` 深連結），不要用「表格最後一列」這類依賴排序順序的定位方式去猜——第八節的誤操作
  正是這樣發生的。
- 「Checklist 範本 Save 多開一筆新紀錄」已證實非產品缺陷，第四節原始描述已標記撤回，之後若再
  遇到類似「筆數變多」的觀察，優先懷疑是不是在同一個持續累積的隔離環境上重複執行了會建立資料
  的腳本，而不是急著歸類成產品缺陷或業務語意問題。
- 複驗（Re-inspect）沒有 Approved/Void 保護一事，**已於第九節完成隔離環境邊界驗證**（不再只是
  讀碼推論）：確認前後端行為一致（不是不一致的錯誤），Approved/Void 狀態下 Inspection
  Result=Fail 確實可以成功觸發複驗，來源紀錄不受影響；是否要加上與 Raise NCR 相同的狀態鎖定，
  屬於業務政策選擇，本輪未自行修改，列出實際行為與建議供使用者裁示。
- NCR 詳情頁自己的必填欄位（根因分析、矯正措施等）仍未查證，若使用者試用時在 Raise NCR 之後卡
  住，需要另外確認。
- 本次驗證用的三個 Playwright 腳本（`itp-checklist-itr-chain-walkthrough.mjs`、
  `checklist-save-template-investigation.mjs`、
  `itr-publish-inspection-result-investigation.mjs`）都已可重複執行（每次對一個全新隔離環境跑
  一次，不依賴前次殘留資料），可作為之後這條業務鏈、Checklist 版本行為、或 ITR Publish 相關改
  動的回歸腳本基礎。

未使用 stash/reset/checkout，保留協作者未提交修改。未 commit/push/部署，未操作開發資料庫／
uploads／日誌。本批新開的獨立調查用隔離堆疊（backend port 8200／vite port 3200）已於驗證結束
後用 `isolated_stack.py down` 拆除；**使用者自己手動試用中的隔離環境（backend port 8198／
vite port 3198）依指示保持運作，本批未拆除**，需要另外請使用者確認何時可以拆除。第八節的事故
調查全程只對該環境自己的 SQLite 檔案做 `sqlite3 -readonly` 唯讀查詢，未執行任何寫入、清空、
Reopen、Unlink 或刪除操作，未改動任何產品程式碼，未碰開發資料庫。

---

## 九、補查（2026-09-29 第五輪）：ITR 複驗（Re-inspect）的 Approved／Void 邊界

延續第一節第 3 點與第八節「Claude 接續」保留的待辦：先前只靠讀碼推論「複驗沒有 Approved/Void
保護」，未做邊界情境的隔離驗證。本輪在**另一組獨立埠號（8200／3200）的隔離環境**（不使用使用
者的 8198／3198、不沿用受第八節事故影響的 `ITR-000003`）建立 6 組完全獨立的新資料（狀態
`In Progress／Approved／Void` × Inspection Result `Fail／Pass`），逐一核對按鈕顯示、直接呼叫
API（繞過按鈕）、實際建立結果、以及來源紀錄是否被動到。

每個案例開啟畫面後，先用 API 直接讀回「剛剛建立的那筆」的 id／單號，再用 `?openId=<id>` 深連結
開啟並核對畫面顯示的單號與預期一致才繼續寫入；單號不符會直接拋錯終止（依上一輪訂下的操作規
則），本輪 6 個案例全部單號核對通過，沒有觸發任何一次終止。

### 結果矩陣

| 案例 | 來源狀態 | Inspection Result | 「Re-inspect」按鈕是否顯示 | 直接呼叫 API 結果 | 來源紀錄事後是否不變 |
|---|---|---|---|---|---|
| A | In Progress | Fail | 顯示 | `200`，成功建立 | 是 |
| B | In Progress | Pass | **不顯示** | `400`，拒絕（訊息：inspectionResult must be 'Fail' or status must be 'Reject'） | 是（未嘗試也未變） |
| C | **Approved** | Fail | **顯示** | **`200`，成功建立** | 是 |
| D | Approved | Pass | 不顯示 | `400`，拒絕 | 是 |
| E | **Void** | Fail | **顯示** | **`200`，成功建立** | 是 |
| F | Void | Pass | 不顯示 | `400`，拒絕 | 是 |

（完整請求/回應內容、新建複驗 ITR 的 id／單號／狀態／Checklist 實例狀態，見
`/private/tmp/claude-501/itr-reinspect-boundary/`（截圖）與本次執行 log；驗證腳本：
`react-app/tests-browser/itr-reinspect-boundary-investigation.mjs`。）

### 逐項核對

- **按鈕顯示與後端行為完全一致，沒有前後端不一致的情形**——`ITRModals.tsx` 的按鈕顯示條件
  （`inspectionResult === 'Fail' || status === 'Reject'`）與後端 `create_reinspection` 的檢查
  條件（同一組判斷，只是沒有狀態鎖定檢查）在全部 6 種組合下給出完全相同的允許／拒絕結果——**不
  是前後端不一致的錯誤，是兩邊一致地共享同一個缺口**：都沒有檢查來源 ITR 的 `status`
  是否為 `Approved`／`Void`。
- **Case C（Approved + Fail）與 Case E（Void + Fail）都能成功建立複驗 ITR**，不是理論推測，是
  實際隔離環境驗證出的行為：一筆已核准（Approved）的 ITR，只要 `inspectionResult` 欄位仍是
  `Fail`（核准流程本身只檢查已連結 Checklist 是否 Pass，不檢查 `inspectionResult`，兩者是各自
  獨立的欄位——見第七節），就能直接對它呼叫 Re-inspect，成功建立一筆全新的複驗 ITR；一筆已作廢
  （Void）的 ITR 同樣可以。
- **新建立的複驗 ITR 本身內容正確、符合既有機制**：狀態重設為 `In Progress`、自動複製來源已連
  結的 Checklist 實例（結果重置為 `Ongoing`/未填），與非邊界情境（Case A）的既有行為一致，沒有
  因為來源是 Approved/Void 而產生任何異常內容。
- **來源紀錄在全部 6 個案例中，事後查詢皆與呼叫前完全一致**（`status`／`inspectionResult`／
  `type` 三個欄位逐一比對）——包含 Case C／E 這兩個「成功建立」的案例：來源 ITR 的 `Approved`
  或 `Void` 狀態、`inspectionResult` 都沒有被複驗動作改變或清空，複驗只新建一筆獨立記錄，不動
  來源本身。

### 是否為前後端不一致：否；是否符合業務要求：尚待決策

依使用者指示更正用詞：這不是「前後端與已確認規則不一致」的情形（兩邊行為一致，只是這個一致的
行為本身沒有涵蓋 Approved/Void 這個邊界）——**但「前後端行為一致」不等於「這個行為已經過業務
確認」**。目前流程能夠產生 Approved+Fail 這個組合（見上方 Case C），不代表業務上已經認可這個
組合可以再拿去複驗；這一點本輪同樣**尚待決策**，不是已經確認可接受的既定行為。以下是實際行為
與待決策建議，本輪不自行新增限制、不修改程式：

- **實際行為**：目前任何持有 `itr:create:all` 的使用者，可以對「已核准」或「已作廢」的 ITR 執
  行複驗，只要它的 `inspectionResult` 欄位仍停留在 `Fail`（這在正常流程下確實可能發生——核准
  時只檢查 Checklist，不會自動把 `inspectionResult` 一併清空或鎖定）。
- **待決策建議**：
  - `Void` 狀態的 ITR：禁止複驗（作廢後不代表有效檢驗意圖，理由與 Raise NCR 現行對 Void 的限
    制一致）。
  - `Approved` 狀態的 ITR：不直接允許複驗，須先走既有的「撤回核准」（Revoke Approval）流程回
    到 `In Progress`，再依既有的複驗條件（Inspection Result=Fail 或狀態=Reject）判斷是否可複
    驗——不新增一條「Approved 直接複驗」的旁路。
  - 在使用者確認以上任一方向之前，**維持現況不動**，不自行修改 `create_reinspection` 或前端按
    鈕條件。
- **獨立政策問題，不與本項合併處理**：「核准（Approve）時是否應該一併檢查
  `inspectionResult`」是另一個獨立的業務政策問題（目前核准只檢查已連結 Checklist 是否
  Pass，不檢查 `inspectionResult`，兩者是否應該綁在一起是核准流程本身的設計問題）——本輪不與
  複驗的 Approved/Void 限制一起修改，留待另外決策。

### 範圍聲明

- 只做隔離環境驗證與讀碼核對，**未修改任何程式碼**（`itr_service.py`／`ITRModals.tsx` 皆未
  變動）。
- 只新增一個驗證用檔案：`react-app/tests-browser/itr-reinspect-boundary-investigation.mjs`。
- 每個案例使用全新建立的獨立 ITP／Checklist 範本／NOI／ITR（範本與 NOI 在 6 案例間重複使用，
  ITR 逐案例各自新建），沒有操作使用者的 8198／3198 環境，也沒有沿用受第八節事故影響的
  `ITR-000003`。
- 未重跑已完成的完整合格／不合格鏈（`itp-checklist-itr-chain-walkthrough.mjs`）、未補翻譯、未
  重構。
- 未建立正式資料（僅本次獨立隔離環境內的種子與測試資料，環境已 teardown）、未 commit／push／
  部署、未使用 stash/reset/checkout。


## 十、Codex 接續 Claude 未完成的複驗限制（2026-09-29）

使用者要求接續正在實作的批次。接手時 Claude 已在 `create_reinspection` 寫入 Void／Approved 拒絕條件（在鎖定並重讀來源後、產生序號前），前端亦已加入依 persistedStatus 停用複驗按鈕及說明文字。保留這些修改，未重做或回退。

本輪補齊：
- 前端新引用的 `itr.reinspectBlockedVoid`／`itr.reinspectBlockedApproved` 尚未定義。因 `t()` 缺字時回傳 key，原本 `||` 英文備援不會生效；補上此功能必要的中英文提示，未擴大補翻譯。
- `handleReinspect` 自身也檢查同一禁止原因，不只依赖按鈕 disabled。
- Claude 的撤回後測試原本以 `_set(... status="In Progress")` 代替撤回 API，已改走真正 `POST /revoke-approval`，附理由。
- 新增 Approved／Void × Fail／Pass 四項 HTTP 拒絕測試，比對 `_full_world` 快照，確認 ITR、Checklist、NCR 整列、序號及核准事件不變；audit 比對沿用 helper 所選五欄，並非稽核表全欄。
- 新增真正核准 → 拒絕直接複驗 → 真正撤回 → 成功複驗的 HTTP 案例；確認來源 ITR、原 Checklist 及核准事件未因複驗被改寫。複驗本來會另增稽核，不宣稱完全無任何資料寫入。

### 本輪實際驗證

- 三份相關 HTTP 測試（state_protection、write_paths_atomic、revoke_approval_acceptance）：58 passed。
- 上述五項新增案例另行執行：5 passed。兩次合計 63 個不同案例；後加案例未在第一次收集範圍，未混稱單次完整跑完。
- 前端單元測試：105 passed；`npm run build`（含 tsc）：通過。
- 測試使用記憶體／測試 fixture 暫存 SQLite，不使用開發 DB；未操作或拆除使用者 8198/3198 環境。
- 本輪未重新執行真實瀏覽器邊界驗收，前端停用呈現僅讀碼核對與型別／建置檢查；後端為實際 ASGI HTTP 路由測試，不是 mock service。未重跑全後端或整條業務鏈。

### 目前狀態與後續

複驗限制已實作，相關自動化通過，尚未部署。第九節的允許行為與待決策描述保留為修正前歷史，以本節為目前實作狀態。Approved 須先撤回核准，Void 禁止複驗；核准是否應檢查 Inspection Result 仍獨立保留，不在此批改動。Claude 若接回，可僅補隔離瀏覽器對停用原因與合法撤回後入口的確認，不重做已完成的限制與測試。

未 commit／push／部署，未使用 stash／reset／checkout；保留協作者其他未提交修改。


## 十一、修正後真實畫面驗收完成（Codex，2026-09-29）

使用獨立 8202/3202 環境、reinspect.localhost 瀏覽器來源，未操作使用者 8198/3198。既有 chain_full seed 建立帳號與單專案範圍；新增 `seed_itr_reinspect_ui_acceptance.py` 建立兩筆獨立 Approved／Void + Fail 測資及各一份 Pass Checklist。此為直接種入的歷史狀態，不宣稱本輪從畫面核准建立來源；真正核准→撤回的 HTTP 證據見第十節。

本轮瀏覽器實際結果：
- 英文：UI-ITR-APPROVED 的 Re-inspect disabled，顯示先撤回核准的說明；UI-ITR-VOID 同樣 disabled，顯示 Void records cannot be re-inspected。
- 中文：兩筆分別顯示「請先撤回核准，再依原有條件建立複驗。」與「已作廢的紀錄不可建立複驗。」，兩個新增提示均未顯示原始語系 key。其他既有中文缺字（如 itr.relatedITP）未處理，不宣稱整頁翻譯完整。
- UI-ITR-APPROVED 經畫面「撤回核准」填原因並確認，回到 In Progress。重開核對單號後，重新檢驗按鈕恢復可用；點擊成功建立 QTS-CWC-ITR-000001，狀態 In Progress，其 QTS-CWC-CHECKLIST-000001 顯示尚未填寫。
- 在合法撤回之後、複驗之前，唯讀取得兩筆來源 ITR 與兩筆原 Checklist 全欄快照；複驗後逐列比對完全相同（撤回本身的預期改變不在「不變」比較範圍）。新 Checklist 為 Ongoing，項目 result/situation 都清空，item/criteria 保留。

測資建置曾缺 description/rev/submit/date，造成測試資料回應驗證 500，已補正種子腳本後才執行上述完整 UI 操作；此為本輪測資錯誤，未誤列成產品缺陷。種子腳本限定隔離環境，最終使用新增語意，不能重跑覆寫已驗收來源。

本輪只新增種子腳本與更新交接／BACKLOG，未再改產品程式；先前63項後端、105項前端及建置結果沿用，未重跑。此批所列 UI 補驗已完成，未擴充整條業務鏈或所有角色驗證。自己的隔離環境驗畢拆除，使用者 3198 未動。未 commit/push/部署。

---

## 十二、獨立補充驗證：真實 UI 核准→撤回→複驗完整循環（Claude，2026-09-29）

接手時發現 Codex 已完成第十／十一節的實作、自動化與畫面驗收，複驗限制已落地且雙方（63 項後端＋
108 項前端，含 Codex 新增的部分）皆通過。本節是**接手後才進行、與第十一節互補、非重複**的獨立
驗證——第十一節的種子腳本是「直接種入 Approved／Void 歷史狀態」（明確聲明「不宣稱本輪從畫面核
准建立來源」）；本節則是在**另一組獨立隔離環境（8200／3200，事後已拆除，未用使用者 8198／
3198、未沿用受第八節事故影響的 ITR-000003）**，從頭全程走**真實畫面操作**：建立 ITR → 連結
Checklist → 填 Pass → 存 Inspection Result=Fail → 按 **Publish 真正核准**（非直接寫入資料
庫）→ 核對按鈕停用與提示 → 直接呼叫 API 確認後端拒絕 → 按**真實 Revoke Approval**（畫面填理
由）→ 核對按鈕恢復可用 → 點擊 Re-inspect 真正成功建立新紀錄。

### 結果（每步皆先核對開啟畫面單號與目標一致才寫入）

| 案例 | 按鈕顯示 | 按鈕可用 | 提示文字 | 直接 API | 新增 ITR／Checklist 筆數 | 來源紀錄事後 |
|---|---|---|---|---|---|---|
| In Progress + Fail（既有行為回歸） | 顯示 | 可用 | — | 200 成功 | — | — |
| **Approved + Fail**（畫面 Publish 真正核准後） | 顯示 | **停用** | 「Revoke the approval first, then re-inspect if it still meets the usual conditions.」（與 `itr.reinspectBlockedApproved` 譯文逐字相符） | 400 拒絕，訊息與後端程式碼一致 | **+0／+0**（未新增任何紀錄） | 狀態／Inspection Result／Rev 完全不變 |
| Approved + Fail → **真實撤回核准後** | 顯示 | **恢復可用** | — | 點擊成功 | +1（新複驗 ITR） | 撤回後狀態正確回到 In Progress，Inspection Result 保留 Fail |
| **Void + Fail** | 顯示 | **停用** | 「Void records cannot be re-inspected.」（與 `itr.reinspectBlockedVoid` 譯文逐字相符） | 400 拒絕 | **+0／+0** | 狀態／Inspection Result 完全不變 |

截圖：`/private/tmp/claude-501/itr-reinspect-fix-verify/`（`B-approved-fail.png` 可見停用按鈕
與下方提示文字、Revoke Approval／Publish 按鈕並列）。驗證腳本：
`react-app/tests-browser/itr-reinspect-boundary-fix-verify.mjs`。

### 與第十一節的差異與互補關係

- 第十一節：驗證「已經是 Approved/Void 狀態的既有紀錄」畫面停用是否正確、提示文字是否翻譯完
  整——**起點是種入的既有狀態**。
  本節：額外驗證「從 In Progress 真的走一次 Publish 核准，狀態轉換那一刻」開始，畫面立即正確
  反映停用與提示，且**核准與撤回的動作本身也走真實 UI／API**，不是預先種好的狀態——確認狀態
  轉換的當下（而不只是轉換後的靜態畫面）也正確。
- 兩節合起來，涵蓋了「靜態既有狀態」與「動態轉換過程」兩種角度，互不重複。

### 範圍聲明

- 未再修改任何產品程式碼（`itr_service.py`／`ITRModals.tsx`／`LanguageContext.tsx` 均維持
  Codex 接手後的版本不動）。
- 只新增一個驗證用檔案：`react-app/tests-browser/itr-reinspect-boundary-fix-verify.mjs`。
- 重新確認 `tsc --noEmit` 乾淨、前端單元測試 108 passed、後端三個相關 HTTP 測試檔（
  `test_itr_state_protection_http.py`／`test_itr_write_paths_atomic_http.py`／
  `test_itr_revoke_approval_acceptance.py`）63 passed——與 Codex 回報的數字一致，確認雙方修改
  彼此相容、沒有衝突。
- 未使用使用者的 8198／3198 環境、未沿用 ITR-000003。未建立正式資料（獨立隔離環境已 teardown）、
  未 commit／push／部署、未使用 stash/reset/checkout、保留協作者（Codex）所有修改。
