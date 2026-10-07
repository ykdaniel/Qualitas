# ITR-INPUT-UX-2026-001 — 封存（TASK / STATUS / REVIEW 逐字快照）

封存日期：2026-10-04。本輪 VERDICT：PASS（純 UX 審閱通過；REQUIRED_FIXES 為封存前文件精確化，
非另開補測輪）。STATUS.md 內容為依 REQUIRED_FIXES 更正後的版本。

## TASK.md（逐字）

````markdown
# TASK.md — ITR 填寫體驗審閱（純審閱，不改產品程式）

TASK_ID: ITR-INPUT-UX-2026-001
SOURCE_TASK_ID: （無，獨立新批；ITP 系列維持結案）

## 狀態
已交辦，Claude 執行中。**本批只審閱，不修改任何產品程式碼**（前端/後端皆不動）。

## 範圍（使用者原文四項，前兩項優先）
1. Checklist 的 Situation 在可編輯及唯讀狀態下，長文字是否容易填寫、完整閱讀；用含換行的真實長度內容驗證。
2. 評估把 Inspection Result／Remark 放在 Checklist 後面、附件區放後面並可收合的方案。保留現有保存、附件及權限行為，不改業務規則。
3. 盤點 ITR 基本資料哪些來自 NOI、哪些可編輯，提出來源摘要與輸入欄位的分組方案。
4. 查明「Related ITP 顯示 Select ITP，但 Related Documents 有 ITP」的原因，區分直接關聯與間接關聯。

優先確認 1、2，不擴大成全系統審查；3、4 以讀碼結論為主，搭配本輪種子資料做實機核對。

## PRECHECK（讀碼，已確認——委派 Explore agent 完成，逐項核對無誤）

### 1. Checklist Situation 欄位
- Situation 在任何畫面（編輯中的 Checklist 模板編輯器、ITR 內的 Checklist 實例編輯器
  `ChecklistSnapshotModal.tsx:417-426`、列印模板 `ChecklistPrintTemplate.tsx:108`）都是
  **單行 `<input type="text">`**，從未是 `<textarea>`。因為是單行輸入框，使用者**無法輸入換行**，
  所以不存在 ITP 曾出現過的「`white-space` 未設 `pre-line` 導致換行被壓縮」那類問題——沒有換行可壓縮。
  鎖定狀態經 `Checklist.tsx:534` 的外層 `<fieldset disabled={readOnly}>`、
  `ChecklistSnapshotModal.tsx` 的 `disabled={locked}` 實現，非逐欄位個別鎖定。
- 本輪種子資料故意塞入含 `\n` 換行與真實長度的 situation 字串，用來**實機確認**：
  單行 input 在內容超過可視寬度時，可編輯狀態下使用者如何瀏覽/編輯全文（捲動／選取／換行被攔截
  等現象），唯讀狀態下是否整段文字被截斷不可見。這是本輪的核心實機觀察項目，程式碼讀法不能
  取代——code reading 只能確認「有沒有 pre-line CSS」這種結構性問題，無法確認「使用者在真實操作
  時好不好填寫/好不好讀」的體感。

### 2. ITR 詳情版面順序
`ITRModals.tsx` 目前順序（已讀碼確認行號）：
1. 基本資料欄（含「Related ITP」select，line 732）
2. Linked Checklists 區塊（lines 815-968）
3. Defect/Improvement 照片上傳（974-1008）
4. 附件：Latest Drawings / Calibration Certificates / 一般 Attachments（1010-1053）
5. Inspection Result select（~1064）
6. Linked-checklist Fail/Pass 警示（1101-1113）
7. Remark textarea（1159-1171）
8. RelatedDocuments（1181）
附件目前**皆非可收合**，全專案（NOI/ITP 等）搜尋不到既有的共用 Collapsible/Accordion 元件可直接套用；
ITR 裡唯一的展開/收合先例是 Linked Checklists 清單本身每一列的 accordion（`expandedInstanceId`，
871-954），不是附件區的收合。本項是「設計建議」，本批**不實作**，只在 STATUS 提出具體方案與其
取捨（例如要不要新寫一個最小 Collapsible wrapper，還是沿用 Linked Checklists 的 toggle 模式）。

### 3. ITR 基本資料的 NOI 來源
`ITRModals.tsx` 選定 NOI 後，`subject`／`itpNo`（見第4點）／`raiseDate` 等欄位會變成
`readOnly={isLocked || !!formData.noiNumber}`（727/737/761 行）——即「連結 NOI 後直接鎖成唯讀顯示」，
不是 NOI 聯絡資訊那種帶 `system`/`user` 來源標記、允許個別覆寫的機制。沒有等價的來源追蹤型別。
後端 `ITR.noiNumber` 是對 `noi.referenceNo` 的真實 FK（`models.py` ITR 類別）。本批只整理「目前哪些
欄位因連結 NOI 而鎖定、哪些始終可編輯」的清單與分組建議，不新增來源追蹤機制（那是產品決策，
不在本批「不改程式」的範圍內）。

### 4. Related ITP vs Related Documents
已確認根本原因（非顯示錯誤，是兩條完全不同的資料路徑）：
- 「Related ITP」下拉綁定 `formData.itpNo`（`ITRModals.tsx:732-746`），來源是
  `existingItem.itpNo || dd.itpNo || ''`（168 行）——但 **`itpNo` 根本不是 ITR 的資料庫欄位或
  Pydantic schema 欄位**（`models.py`／`schemas.py` 的 `ITRBase`/`ITRCreate`/`ITRUpdate` 皆無此欄位；
  `schemas.py:37` 甚至有註解「取代舊的 itpNo」）。前端儲存路徑（`ITR.tsx:141-180` 組出的
  `itemData`）也從未把 `itpNo` 包進去——使用者在這個下拉選的任何值存檔後都會被直接丟棄。
  對現在的正常資料（本輪種子資料即是）顯示永遠是空的「Select ITP」，即使該筆 ITR 透過 NOI
  確實關聯到一個 ITP。
- 「Related Documents」面板走 `GET /{module}/{id}/related` → `RelatedService.get_related` →
  `backend/workflows/relationships.py` 的圖走訪：`itr --upstream--> noi --upstream--> itp`，
  `max_depth=2`，靠的是 `itr.noiNumber`／`noi.itpNo` 兩個**真實 FK**的兩段式間接查詢，
  跟「Related ITP」下拉完全是兩條不相干的資料路徑。
- 結論：**直接關聯**（ITR 自己的 `itpNo` 欄位）是死欄位、從未真正連到後端；**間接關聯**
  （透過 NOI 的兩段圖走訪）才是真正反映現況的那一條。這不是「哪個顯示錯了」，是「一個介面元件
  綁定一個從未存在過的欄位」。本批只記錄這個結論，**不自行回填資料、不決定要不要移除或修正那個
  下拉**（這是產品決策，需使用者確認）。

## SCOPE（本批實際要做的事）
1. 建立獨立隔離環境種子資料（`seed_itr_input_ux_review.py`）：一個 Project/Contractor/ITP/NOI，
   兩筆 ITR（In Progress 可編輯 + Approved 鎖定唯讀），各自連結一筆 Checklist 實例，
   situation 欄位皆為含換行、含唯一標記字串的真實長度內容。
2. 用瀏覽器（Playwright 或 Claude Browser 均可）實機觀察：
   - 可編輯狀態下填寫/瀏覽長 situation 文字的體感（捲動、選取、是否需要橫向滾動、是否有任何
     方式看到完整內容）。
   - 唯讀狀態下同一欄位的呈現（是否截斷、是否需要 hover/點擊才能看到全文）。
   - Checklist／Inspection Result／Remark／附件目前的視覺順序與資訊節奏。
   - Related ITP 下拉（應顯示 Select ITP）與 Related Documents 面板（應顯示該筆 ITP）同框對照。
3. 截圖存證（桌面寬度，必要時窄螢幕）。
4. 撰寫 STATUS.md：明確區分「實機觀察」「讀碼結論」「設計建議」三類陳述，不得混稱；
   第 1、2 項給出具體改善方向（不等於實作承諾），第 3、4 項給出盤點結果與分類（缺陷 vs
   呈現問題 vs 待確認業務規則）。
5. REVIEW.md 留待獨立審查，不自行判定 PASS。

## ALLOWED_PATHS
- `backend/scripts/verification/seed_itr_input_ux_review.py`（新建）
- `react-app/tests-browser/`（如需新建瀏覽器觀察腳本／launcher，純讀取/截圖，不送出會變更
  產品資料以外的操作——可以用種子資料本身的帳號登入瀏覽，不需要寫入新資料）
- `docs/workflows/` 或 `docs/workflow/`（本輪 handoff/evidence）
- `TASK.md` / `STATUS.md` / `REVIEW.md`

## FORBIDDEN_PATHS
- 任何 `react-app/src/**`、`backend/**`（除上方種子腳本）產品程式碼——本批純審閱，不修改。
- 開發資料庫、使用者 8198/3198。
- ITP-INPUT-UX 系列已接受的檔案與結論（`ITPAdvancedEditor.tsx`／`ITPPrintTemplate.tsx`／
  其測試腳本）——不重開、不重驗。
- 全站翻譯補齊（不在範圍內）。
- commit／push／部署。

## ACCEPTANCE_CRITERIA
1. 種子資料涵蓋可編輯／唯讀兩種 ITR 狀態，Situation 欄位為真實長度含換行內容。
2. STATUS.md 對第 1、2 項提供實機觀察證據（截圖＋文字描述），對第 3、4 項提供讀碼結論與
   盤點／分類結果，三種陳述（實機觀察／讀碼結論／設計建議）明確區分標示，不混稱。
3. 未修改任何產品程式碼；未操作使用者 8198/3198；未 commit/push/部署。
4. REVIEW.md 留白待審。
````

## STATUS.md（逐字，更正後版本）

````markdown
# STATUS.md — Claude 執行結果

TASK_ID: ITR-INPUT-UX-2026-001
SOURCE_TASK_ID: （無，獨立新批）

## RESULT
- [x] DONE
- [ ] PARTIAL
- [ ] BLOCKED

本批**未修改任何產品程式碼**（`react-app/src/**`、`backend/**` 業務邏輯皆未觸碰）。**更正**：這不
等於「整批是唯讀操作」——本批新增了一個種子腳本 `backend/scripts/verification/seed_itr_input_ux_review.py`
與審閱用的 vite launcher，且實際對**隔離環境自己的資料庫**寫入了種子資料（Project/Contractor/ITP/
NOI/兩筆 ITR/兩筆 Checklist）；「產品程式碼未修改」與「隔離環境種子資料有寫入」是兩件分開的事，
不能混為一談地說成「純讀取」。隔離資料庫與使用者 8198/3198、開發資料庫完全無關，詳見下方「隔離環境
與證據」。
以下依「實機觀察」「讀碼結論」「設計建議」三類分別標示，不混稱。

---

## 1. Checklist Situation 欄位：長文字可編輯／唯讀體驗

**讀碼結論**：Situation 在可編輯的畫面（Checklist 模板編輯器、ITR 內的 Checklist 實例編輯器
`ChecklistSnapshotModal.tsx:417-426`）都是單行 `<input type="text">`，從未是 `<textarea>`。
**更正**：列印模板 `ChecklistPrintTemplate.tsx:108` 不是 input，是純文字顯示的
`<td>{item.situation}</td>`——不受 input 單行限制，但同樣沒有 `white-space: pre-line` 之類的
CSS，若欄位值本身已經沒有換行（見下方讀碼推論），純文字 `<td>` 也無法把換行找回來。

**實機觀察（隔離環境，種子資料故意塞入含 `\n` 換行、約 600 字元、含唯一標記字串的真實長度內容，
透過瀏覽器 JS 直接讀 DOM，非猜測）**：

- **可編輯狀態**（QTS-IUX2-ITR-000001, In Progress）：欄位 `clientWidth=220px`，
  實際內容 `scrollWidth=4122px`（約 1:19），畫面上只看得到「Rebar cover checked at 8
  location」就被裁斷，沒有 `title` 提示、沒有任何視覺線索顯示後面還有 18 倍的內容。
  點進欄位後可用方向鍵／End 捲動看到全文，但要逐字元捲動一個 619 字元的字串通過一個 35 字元寬的
  視窗（截圖 02、03；DOM 細節見 `situation-field-inspection.log`）。
- **唯讀（鎖定）狀態**（QTS-IUX2-ITR-000002, Approved）：欄位 `disabled=true`。瀏覽器標準行為是
  **disabled 的 input 無法 focus，方向鍵／Home／End 完全無效**——本輪實測的這個欄位在這個狀態下
  **沒有本輪測過的任何方式**看到裁斷以外的內容，比可編輯狀態更嚴重（至少可編輯時還能用鍵盤捲動著看
  完）；未測的替代入口（例如放大瀏覽器、改變視窗寬度、開發者工具）本輪未窮舉，不宣稱絕對沒有任何
  辦法看到全文，只確認「欄位自身沒有提供」（截圖 08）。
- **讀碼推論，本輪未驗證是否真的影響存檔內容**：透過瀏覽器 JS 直接讀到的 DOM `.value` 已經不含
  `\n`（`<input>`（非 `<textarea>`）是瀏覽器標準行為——換行字元會被直接丟棄，不會變成空格；種子
  資料中兩個句子之間、結尾段落與標記之間原本都有明確換行，讀出的 `.value` 是
  `"...Rev.C.Lap splice..."`、`"...compliance.SITU-MARK-ONE-abc123"` 這種句界直接黏死、毫無間隔的
  文字）。**但這只證明 input 顯示值本身已正規化掉換行，不能直接推論「存檔、顯示、列印出來的都會是
  整段擠在一起」**——本輪沒有實際觸發 Save、沒有重新載入核對存檔內容、也沒有打開列印預覽核對。
  `ChecklistSnapshotModal.tsx` 的保存來源是 React 的 `items` state，不是直接從這個 DOM `.value`
  重建；未編輯欄位不等於一定會把這個已正規化的值寫回 state——只有該欄位的 `onChange` 真的觸發過，
  才可能把正規化後的值帶進 state 並在保存時送出。這部分是**讀碼推論**，不是本輪已驗證的結論；
  真正要確認「存檔後換行是否真的消失」需要實際跑一次保存＋重新載入（見下方 ITR-INPUT-UX-IMPLEMENT-
  2026-001 驗收項目 2，將在實作輪一併驗證）。

**分類**：這是**可直接改善的介面問題**，不涉及業務規則（Situation 要不要存多行文字、要不要保留
單行限制，都不是本批已確認的業務規則，見下方設計建議）。

**設計建議（本批不實作，供後續任務參考）**：
- 比照 ITP 已接受的做法，把 Situation 改成 `<textarea rows={2-3} resize-y>`，搭配
  `white-space: pre-line` 顯示；唯讀狀態同樣用這個 CSS 而非 `disabled` 的單行 input（可用
  `readOnly` 的唯讀 `<textarea>` 或純顯示 `<div>`，兩者都能讓使用者捲動/選取看到全文，不像
  disabled input 完全鎖死）。
- 這個欄位目前被塞在一個窄表格欄（Item / Criteria / Situation / Result 四欄並排），要容納多行內容，
  表格版面本身也要跟著調整（例如 Situation 欄位加寬，或改成像 ITP Criteria 那樣的「每列展開」排版），
  不是單純換成 textarea 就好——這點與 ITP-INPUT-UX-IMPLEMENT 系列當時使用者特別強調「不能只把
  input 換成 textarea，必須一起調整版面」是同一類問題。

---

## 2. Inspection Result／Remark／附件區的順序與收合

**讀碼結論**（`ITRModals.tsx` 行號）：目前順序是 Checklist(815-968) → Defect/Improvement 照片
(974-1008) → 附件三區 Latest Drawings/Calibration Certificates/Attachments(1010-1053) →
Inspection Result(~1064) → Remark(1159-1171) → Related Documents(1181)。附件三區與照片上傳區
目前**皆非可收合**，全專案搜尋不到既有共用 Collapsible/Accordion 元件；ITR 內唯一的展開/收合先例
是 Linked Checklists 清單本身每一列的 accordion（`expandedInstanceId`），不是附件區的收合。

**實機觀察**：截圖 04、05 確認了上述順序——使用者要先捲過兩個照片上傳區與三個附件上傳區，才會看到
Inspection Result 下拉和 Remark。Remark 本身是正常的 `<textarea>`（與 Situation 的單行 input
形成對比，證實 textarea 在這個專案裡不是技術限制，只是 Situation 沒套用）。

**分類**：這是**設計建議**，不是缺陷——目前順序可用，只是使用者自己提出「評估移到 Checklist 後面、
附件可收合」的體驗改善方向。

**設計建議（本批不實作）**：
- 把 Inspection Result／Remark 移到 Checklist 區塊之後、附件之前，讓「填完檢驗結果」和「看完
  Checklist 判定」在動線上更連貫（目前中間被兩組上傳區隔開）。
- 附件三區（Latest Drawings/Calibration Certificates/Attachments）＋照片兩區改成可收合：由於
  專案內沒有現成的共用 Collapsible 元件，有兩個可行方向——(a) 新寫一個最小的
  `<CollapsibleSection>` wrapper（幾行程式碼，比照 Linked Checklists 列表已有的
  `expanded`/`onClick` toggle 模式）放進 `Shared/`，之後 NOI／ITP 若也想要可收合區塊可以直接共用；
  (b) 直接沿用 Linked Checklists 列表現有的 accordion pattern，複製貼上到附件區塊。兩者都不難，
  差別在於要不要順便建立一個共用元件——這是產品／架構決定，本批只列出選項，不替使用者決定。
- 保留現有保存、附件上傳與權限行為：移動 DOM 順序、加收合狀態都不涉及欄位資料結構或 API 呼叫，
  純粹是 JSX 排列與一個額外的展開/收合 UI state，不改變儲存/讀取邏輯。

---

## 3. ITR 基本資料的 NOI 來源盤點

**讀碼結論**：選定 NOI 後，以下欄位變成 `readOnly={isLocked || !!formData.noiNumber}`
（`ITRModals.tsx` 727/737/761 行），即「連結 NOI 後就整欄鎖成灰底唯讀顯示」，不是像 NOI 聯絡資訊
那種帶 `system`/`user` 來源標記、可個別覆寫的機制：

| 欄位 | 連結 NOI 後狀態 | 來源 |
|---|---|---|
| Subject | 唯讀（灰底） | NOI.package（建立時複製一次） |
| Related ITP | 重新打開既有記錄顯示空白，見第4項（更正後的結論） | 建立當下若選了有 `itpNo` 的 NOI 會即時帶入，但未持久化 |
| Inspection Date | 唯讀（灰底） | 建立時複製（本輪種子資料對應 NOI.inspectionDate） |
| Due Date | 唯讀（灰底） | 系統計算欄位，與 NOI 無直接關係（讀碼未深入，非本批重點；**不是**可編輯欄位，更正見下） |
| Reference no. | 唯讀（灰底，系統產生） | 系統自動編號，非 NOI 來源 |
| Contractor | 唯讀（灰底） | 隨 NOI 帶入（vendor_id） |
| Version | **未鎖定時**可編輯下拉；ITR 進入 Approved/Void 鎖定狀態後與其他欄位一樣變唯讀 | ITR 自己的版本欄位，非 NOI 來源 |

NOI 連結後解除連結（`noiNumber` 清空）理論上欄位會變回可編輯，但**沒有任何紀錄保留「這個值原本是
NOI 帶入還是使用者後來改的」**——這與 NOI 自己的聯絡資訊欄位（有 `system`/`user` 來源標記＋保留
手動覆寫的值＋換廠商保護）是完全不同的設計。後端 `ITR.noiNumber` 是對 `noi.referenceNo` 的真實 FK。

**分類**：這是**盤點結果**，不是缺陷——目前「連結 NOI 後鎖死」的行為本身是否要改成可覆寫＋來源標記，
是未確認的業務規則，不在本批範圍內下結論。

**設計建議（分組方案，本批不實作）**：
把目前並排的「Base Information」拆成兩個視覺群組，而不是現在這種看不出哪些來自 NOI、哪些是 ITR
自己的欄位混排在一張表格裡：
- **來自 NOI（唯讀，附簡短來源提示，例如小字「來自 NOI」）**：Subject、Inspection Date、
  Contractor。
- **ITR 自己的欄位（未鎖定時可編輯）**：Version。Due Date 本輪未深入讀碼確認其計算邏輯，**不**
  歸類為「可編輯」，留待後續任務確認它是否該獨立於 NOI 分組之外。
- **目前有確認過的呈現缺口、建議檢討呈現方式的**：Related ITP（見第4項；本批未下「死欄位」這種
  全稱結論，見該項更正後的說明）。

---

## 4. 「Related ITP 顯示 Select ITP」與「Related Documents 有 ITP」的原因

**讀碼結論（已確認根本原因；以下為 REVIEW 更正後的版本——撤回「永遠空白」「從未存在」「所有選值
都會被丟棄」等超出證據的全稱陳述）**：
- 「Related ITP」下拉綁定 `formData.itpNo`（`ITRModals.tsx:732-746`，來源
  `existingItem.itpNo || dd.itpNo || ''`，168 行）。**更正**：新增 ITR 時選定 NOI，若該 NOI 有
  `itpNo`，`ITRModals.tsx:680-681` 的 handler 會立刻 `handleFieldChange('itpNo', selectedNOI.itpNo)`
  把值帶進 `formData`——**這個欄位當下不是空的**，也不是「使用者選了就一定丟棄」；是「建立當下
  有值」與「這個值從未真正進入保存契約、重新打開後找不回來」兩件不同的事。
- **`itpNo` 不是 ITR 的資料庫欄位或 Pydantic schema 欄位**：`models.py` 的 `ITR` 類別、
  `schemas.py` 的 `ITRBase`/`ITRCreate`/`ITRUpdate` 都沒有這個欄位；`schemas.py:37` 有註解
  「（取代舊的 itpNo）」。前端存檔路徑（`ITR.tsx:141-180` 組出的 `itemData`）也未把 `itpNo` 包進去
  ——這部分讀碼結論成立：目前的保存契約裡沒有 `itpNo` 的位置。但「歷史上從未存在過」本輪沒有查過
  `models.py`/`schemas.py` 的異動歷史，不能用本輪證據斷言。
- 「Related Documents」面板走 `GET /{module}/{id}/related` → `RelatedService.get_related` →
  `backend/workflows/relationships.py` 的圖走訪：`itr --upstream--> noi --upstream--> itp`，
  `max_depth=2`，靠的是 `itr.noiNumber`／`noi.itpNo` 兩個**真實 FK**的兩段式間接查詢——這條是
  目前**真正反映 ITR↔ITP 關聯**的資料路徑，後端沒有獨立的 `ITR.itpNo` 資料庫關聯。

**實機觀察**（截圖 01、06、07）：本輪測試的兩筆 ITR 是**直接寫入資料庫的種子資料**，跳過了
「新增 ITR → 選 NOI → `handleFieldChange('itpNo', ...)` 當場帶入」這段流程，所以兩筆記錄重新打開
時都顯示「Select ITP」（空）、「Related Documents → Upstream (2)」正確列出 NOI 與 ITP——**這證實
的是「重新打開已存在記錄時，`itpNo` 顯示為空」，不是「使用者在建立當下選了也一定存不進去、介面
元件完全沒作用過」**。本輪沒有實際走過「新增 ITR→選 NOI→存檔→重新打開」這個完整流程，無法確認
建立當下帶入的 `itpNo` 值是否真的在送出 API 前就被捨棄，還是保存當下其實有送出但後端 schema
直接忽略了這個多餘欄位。

**結論（收斂後）**：ITR 目前**沒有獨立持久化的 `itpNo` 資料庫關聯**，重新打開既有記錄時
「Related ITP」顯示為空是確認過的實機現象；真正反映 ITR↔ITP 關聯的是透過 NOI 的間接查詢
（Related Documents）。「這個下拉從建立到保存全程都是裝飾、對使用者完全沒有即時回饋」這個更強的
說法本輪未驗證，不下此結論。

**分類**：**確認的呈現缺口**（重新打開後 Related ITP 顯示空白，即使透過 NOI 確實有關聯的 ITP）。
建議優先方向：依既有 NOI 關聯做唯讀呈現（例如直接顯示 Related Documents 已查到的 ITP，不需要使用者
再選一次），而非新增獨立的 `ITR.itpNo` schema 欄位——但要不要這樣改、要不要保留現在這個下拉讓使用者
在建立當下手動選，是產品決策，本批**不自行回填資料、不決定怎麼修**，留待使用者確認。

---

## 隔離環境與證據
`isolated_stack.py up --port 8280 --vite-port 3280`（與使用者 8198/3198 無關，執行前後以 `lsof`
確認未受影響），種子腳本 `backend/scripts/verification/seed_itr_input_ux_review.py`（新建，帳號
`itrux_full`）。瀏覽器使用 Claude Browser 實機操作（非 Playwright 自動化腳本——本批是人工審閱，
非迴歸測試），關鍵 DOM 細節額外用瀏覽器 JS console 直接讀取記錄存證。

截圖與記錄見 `docs/workflow/ITR-INPUT-UX-2026-001-evidence/`：
- `01-itr1-basicinfo-related-itp-select.jpg` — ITR1（可編輯）基本資料，Related ITP 顯示 Select ITP
- `02-itr1-checklist-situation-truncated.jpg` — Situation 欄位截斷
- `03-itr1-checklist-situation-end-scrolled.jpg` — 按 End 鍵後捲到尾端
- `04-itr1-attachments-sections.jpg` — Checklist 後面接著照片/附件區塊順序
- `05-itr1-quality-assessment-remark.jpg` — Inspection Result/Remark 在附件之後
- `06-itr1-related-documents-shows-itp.jpg` — Related Documents 正確顯示 ITP
- `07-itr2-locked-basicinfo-related-itp-select.jpg` — ITR2（鎖定）同樣顯示 Select ITP
- `08-itr2-locked-checklist-situation-truncated.jpg` — 鎖定狀態 Situation 同樣截斷（disabled）
- `situation-field-inspection.log` — 兩筆記錄 Situation 欄位的 DOM 細節（clientWidth/scrollWidth/
  disabled/實際讀出的 value 字串）

隔離環境執行前後以 `lsof -i :8198 -i :3198` 確認使用者本機開發環境全程未被影響；測試期間未儲存任何
修改（兩次 Checklist Snapshot 編輯皆按 Cancel 關閉，未觸發 Save）。

## 範圍確認
- 未修改任何 `react-app/src/**`、`backend/**` 產品程式碼。
- 未重開 ITP-INPUT-UX 系列已接受項目。
- 未補齊全站翻譯。
- 未操作使用者 8198/3198 或開發資料庫。
- 未 commit／push／部署。
- REVIEW.md 留待獨立審查。
````

## REVIEW.md（逐字）

````markdown
# REVIEW.md — 獨立審查

TASK_ID: ITR-INPUT-UX-2026-001
SOURCE_TASK_ID: （無，獨立新批）
審查日期：2026-10-04

## EVIDENCE_CHECK
- 已核對 TASK、STATUS、handoff、Situation DOM 記錄、鎖定畫面截圖，以及 ChecklistSnapshotModal、ChecklistPrintTemplate、ITRModals、ITR 保存映射、後端 model/schema/relationship graph。未重跑瀏覽器或保存測試。
- 接受 Situation 單行、長文字截斷且鎖定時缺乏方便全文閱讀入口的 UX 發現；附件位於 Checklist 與評估區之間的排列與既有畫面觀察一致。
- DOM value 無換行僅證明 input 顯示值正規化。本輪未保存，不能宣稱資料庫或列印內容必然已丟失換行。ChecklistSnapshotModal 保存來源是 React items state，未觸碰欄位不等於從 DOM value 重建資料；onChange 後才可能把正規化值帶入 state。
- Related ITP 的重開顯示缺口成立；但新增選 NOI 的 handler 明確會帶入 selectedNOI.itpNo，不能稱永遠空白或完全沒有來源。後端沒有獨立 ITR.itpNo；真正關聯由 NOI 推導。歷史「從未存在」也非本輪證據可證明。

## SCOPE_CHECK
本輪審查僅寫 REVIEW.md；未修改產品、未操作資料庫或使用者環境。種子腳本有寫入隔離資料，不能把整批稱為只讀操作；「產品未修改」與「隔離種子寫入」須分開。本輪大範圍共享工作樹不作修改歸因依據。

## DECISIONS_CHECK
不改核准、鎖定、Checklist 結果與 ITR 判定規則。不新增直接 ITR→ITP 資料庫關聯，不把 Due Date 列為已授權可編輯欄位。版面及多行輸入方向可承接為獨立實作任務，尚未實作。

## VERDICT
- [x] PASS
- [ ] REVISE
- [ ] HUMAN_REQUIRED

純 UX 審閱通過；不是產品修正或保存完整性驗收。下列為封存前文件精確化，不要求另開補測輪。

## REQUIRED_FIXES
1. 在 STATUS/handoff/DOM 記錄的解說補註更正：已觀察 DOM value 換行消失；編輯後保存風險屬讀碼推論；本轮未測 PUT/重讀/列印，不宣稱實際存檔必然丟失。保留原始 DOM 數值。另更正「列印也是 input」：ChecklistPrintTemplate.tsx:108 為 td 顯示 item.situation。
2. 更正 Related ITP：新增選 NOI 時有帶入；重開初始化未由 NOI 還原且獨立 itpNo 未納入目前保存契約，造成所測兩筆顯示空白。撤回「永遠空白」「從未存在」「所有選值都會丟棄」等超出目前證據的全稱。優先建議依既有 NOI 關聯唯讀呈現，不新增 schema。
3. 來源盤點保留 Due Date 為計算/唯讀；Version 的可編輯敘述須限定未鎖定情境。把「沒有任何方式／唯一方式」收斂為本輪確認的欄位閱讀限制，未測替代入口不作窮盡結論。

## NEXT_STEP
Claude 只做上述文件收尾，逐字封存本輪 TASK/修正後 STATUS/本 REVIEW，保留原始證據，不重跑測試、不改產品、不重開 ITP。完成後交接。下一批建議先限定 ITR Checklist Situation 多行填寫及唯讀全文呈現，並驗證保存重讀；版面重排與 Related ITP 分批處理，避免把三種改動混在同一驗收。
````
