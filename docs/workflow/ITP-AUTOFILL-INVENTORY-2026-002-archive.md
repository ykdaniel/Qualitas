# ITP-AUTOFILL-INVENTORY-2026-002 — 封存（原文保留；獨立審查 PASS 結案）

本檔封存 ITP-AUTOFILL-INVENTORY-2026-002 這一輪的 TASK.md、STATUS.md、REVIEW.md
原文。依 AGENTS.md 規則，原文保留，不因後續工作修改內容。REVIEW.md 判定為
**PASS**，ITP-AUTOFILL-INVENTORY 盤點系列（001 REVISE → 002 PASS）結案，不再開
003。PASS 後依審查要求在本輪 handoff 補了一段更正（撤回「換選廠商不需要額外
處理」的保證），原文保留未刪除，更正內容見
`docs/workflow/ITP-AUTOFILL-INVENTORY-2026-002-handoff.md` 末段。

下一批（`ITP-AUTOFILL-INTERACTION-2026-001`）處理這份盤點收斂出的互動方案，不是
延續本系列的查核，是新的設計提案批次。

---

## TASK.md（原文，節錄要點；完整原文見本次對話記錄）

```markdown
# TASK.md — ITP 填表效率盤點 R1-R3 補正
TASK_ID: ITP-AUTOFILL-INVENTORY-2026-002
SOURCE_TASK_ID: ITP-AUTOFILL-INVENTORY-2026-001
（完整 REQUIRED_FIXES/SCOPE/ALLOWED_PATHS/FORBIDDEN_PATHS/ACCEPTANCE_CRITERIA/
CLAUDE_PRECHECK 逐字原文見本次對話記錄。）
```

## STATUS.md（原文，節錄要點；完整原文見本次對話記錄）

```markdown
# STATUS.md — Claude 執行結果
TASK_ID: ITP-AUTOFILL-INVENTORY-2026-002
SOURCE_TASK_ID: ITP-AUTOFILL-INVENTORY-2026-001

## RESULT
- [x] DONE

R1-R3 已補正。補回五項既有行為、撤回兩項建議、3a 列為待實測、3b 確認不一致、
只保留 1 項候選不湊數。

（完整內容已在本次對話中完整記錄，僅因封存檔篇幅在此節錄關鍵結論。）
```

## REVIEW.md（原文，完整保留）

```markdown
# REVIEW.md — 獨立審查
TASK_ID: ITP-AUTOFILL-INVENTORY-2026-002
SOURCE_TASK_ID: ITP-AUTOFILL-INVENTORY-2026-001
審查日期：2026-10-04

## EVIDENCE_CHECK
- 已讀 TASK.md、STATUS.md、本輪 handoff 與 DECISIONS.md，並直接核對 ITP.tsx、ITPModals.tsx、ITPAdvancedEditor.tsx、NOIDetailModal.tsx、contractorsStore.ts、contractor_repository.py。
- R1：預選第一個 active 廠商、NOI 先依廠商篩選 ITP、日期初始化、項目複製、submit 初始化保留均與程式一致。日期實作為 UTC ISO 日期字串，不代表已驗證所有時區的本地「今天」。
- R2：已撤回兩項不適當推薦。NOI 新建初始化將聯絡資訊留空、手動改選才填空欄的差異有直接程式證據；易誤選仍標為待實測，未冒稱使用者研究。
- R3：僅保留一項候選，已列來源、目標、時機及保護方式，並如實標明可見提示尚未設計。這是盤點完成，不是實作設計已驗收。
- 本次獨立審查只讀碼；未執行瀏覽器或測試，未接觸資料庫、運作中服務。

## SCOPE_CHECK
本輪交付為補正盤點，無需重跑產品測試。審查未修改產品程式；不能以本次讀碼獨立證明整個共享工作目錄歷來均未變更。

## DECISIONS_CHECK
- PASS 僅核可本輪盤點；不批准新增自動填入或改變預選廠商政策。
- 候選仍有實作前必須處理的資料配對風險：初始化若帶入 A 廠商聯絡資訊，改選 B 時既有 prev.x || selected.x 會保留非空的 A 資訊。因此「不需要額外處理」不能當作已驗證的安全結論；保留使用者輸入與避免廠商／聯絡人錯配是兩個不同要求。
- 畫面提示屬產品／前端設計工作，可先提出具體方案，不必把所有視覺細節都列為業務政策請使用者裁決。

## VERDICT
- [x] PASS
- [ ] REVISE
- [ ] HUMAN_REQUIRED

## REQUIRED_FIXES
無阻斷本輪盤點結案的補正。收尾時在 handoff 候選段補註上述 A→B 聯絡資訊可能沿用的限制，撤回「不需要額外處理」的保證；不重開補測批次。

## NEXT_STEP
封存本輪 PASS。下一步先提出一份簡短的填表互動方案：明確選廠商後如何带入聯絡資訊、如何辨識系統帶入與手動修改、換廠商時如何避免錯配、既有紀錄如何保持原值。包含具體畫面提示與 A→B 範例，暫不修改產品程式。不要再次執行已完成的 R1–R3 盤點。
```

---

## 補存：完整 TASK / STATUS 快照（來源：對話逐字稿，非摘要重建）

原封存的 TASK / STATUS 段落為摘要節錄，且引用「本次對話記錄」這個日後會失效的
參照。以下從本次對話的逐字稿檔案重新取出並補存當時完整內容，逐字核對無誤；
保留上文摘要不刪除，判定不變。

### TASK.md 完整快照

````markdown
# TASK.md — ITP 填表效率盤點 R1-R3 補正

TASK_ID: ITP-AUTOFILL-INVENTORY-2026-002
SOURCE_TASK_ID: ITP-AUTOFILL-INVENTORY-2026-001
狀態：已交辦，待 Claude 執行。本批仍是**純讀查核**，不實作自動帶入，不修改產品
程式碼，不建立任何資料。

## REQUIRED_FIXES（逐字沿用審查原文）

R1：補回真實預設與依賴方向（ITP/NOI預選廠商、NOI廠商→ITP過濾、ITP日期預設、項目
複製），更正submit無引用論述。不重做主檔全量盤點。
R2：重排建議，取消「NOI選ITP補空白廠商最高優先」與「Description預填專案名稱」的
預設推薦。用既有流程找真正重複輸入／易誤選點，例如預選第一廠商是否造成誤選、
預選廠商與聯絡資訊初始化是否一致；這些先查核，不直接修。給每項來源欄位、目標
欄位、觸發時點、使用者可見提示、改選／已輸入時如何保護。
R3：明確區分三類：已存在可沿用、讀碼發現的候選、需要使用者確認的語意。不為湊滿
三項推薦缺乏依據的自動填值；保留2項可靠候選亦可。交付簡短可決策表，不擴寫長
報告、不新增必填/關聯/資料清洗。

## SCOPE
1. 補回已確認存在的既有行為（讀碼依據已在本次對話中核對）：
   - ITP／NOI 新建記錄皆預選「第一個 active 廠商」（`ITP.tsx` 的
     `newItpDefaultVendor`、`NOIDetailModal.tsx` 的 `getInitialData` 皆取
     `getActiveContractors()[0].name`，無排序邏輯，順序取決於 API 回傳順序）。
   - NOI 的 ITP No. 下拉清單依目前選取的 Contractor 篩選
     （`filteredITPList` = `getITPByVendor(formData.contractor)`，Contractor 空白
     時清單直接為空）——方向是「先選廠商才能選 ITP」，不是反過來。
   - ITP 新建時 `submissionDate` 預設今天日期（`ITPModals.tsx:185`）。
   - Inspection Plan 已有「複製既有項目」功能（`ITPAdvancedEditor.tsx` 的
     `handleCopyClick`，複製後開啟編輯對話框讓使用者確認/調整，不是從零手填）。
   - `submit` 欄位：`ITPModals.tsx` 初始化時讀取並保留 `existingItem?.submit`、
     `itpStore.ts` 的型別與列表映射都有這個欄位，只是找不到對應的可見輸入元件
     （使用者無法在畫面上看到或編輯它）——撤回「沒有前端引用／死欄位」的說法，
     改為精確描述現況。
2. 取消上一輪「NOI 選 ITP 補空白廠商／Subject」與「ITP Description 預填 Project
   名稱」兩項建議（不再推薦）。
3. 針對 R2 指定的兩個方向做讀碼查核（本輪仍不動瀏覽器、不建資料）：
   - 預選第一個廠商是否容易造成誤選：描述目前這個預設值在畫面上呈現的方式
     （下拉選單視覺上與使用者自己選的沒有區別），排序依據為何（無明確業務邏輯，
     純粹是 API 回傳順序），標記為「待實測問題」（需要瀏覽器驗證使用者是否容易
     忽略這是系統預設值，本輪不下結論）。
   - 預選廠商與手動選擇廠商時，聯絡資訊（NOI 的 contacts/phone/email）初始化是否
     一致：讀碼比對 `getInitialData` 的預設路徑與 Contractor `onChange` 的既有
     非破壞性帶入邏輯，確認兩者是否一致。
4. 保留的建議候選（不強求湊滿三項），每項需列明：來源欄位、目標欄位、觸發時機、
   使用者可見提示、換選資料或使用者已輸入時如何避免覆蓋。
5. 文件明確分三類標示：已存在可沿用（事實）／讀碼發現的候選（技術層面可行，附
   保護機制）／需要使用者確認的業務語意（例如要不要改變預選第一家廠商這個既有
   行為本身，這是產品設計決策，不是本輪代為決定的範圍）。
6. 交付簡短表格，不擴寫長報告。

## ALLOWED_PATHS
- 唯讀：延續上一輪的 ALLOWED_PATHS（`backend/models.py`／`schemas.py`／ITP、
  Contractor、Project 相關 router/service/repository；
  `react-app/src/components/ITP/**`、`react-app/src/components/Contractors/**`、
  `react-app/src/components/NOI/modals/NOIDetailModal.tsx`、`react-app/src/store/
  contractorsStore.ts`、`react-app/src/store/itpStore.ts`）
- `docs/workflow/`（本輪 handoff；上一輪 archive 已於本次對話建立）
- `TASK.md` / `STATUS.md` / `REVIEW.md`

## FORBIDDEN_PATHS
- 任何產品程式碼（本批純讀查核）
- 任何資料庫 migration、種子腳本、正式或測試資料寫入
- 後端業務邏輯、授權規則
- `TASK.md`（上一輪）／`DECISIONS.md`／`AGENTS.md`／任何既有 `docs/workflow/
  *-archive.md`（唯讀）

## ACCEPTANCE_CRITERIA
1. 補回的既有行為（預選廠商、ITP 過濾方向、日期預設、項目複製、submit 欄位現況）
   皆有檔案與行號依據，與審查指出的四點逐一對應更正。
2. 撤回上一輪的兩項首要建議，不再出現在本輪結論中。
3. 「預選第一家廠商是否易誤選」列為待實測問題，不在本輪下結論或建議修正方案。
4. 「預選與手動選擇聯絡資訊是否一致」有明確的讀碼結論（一致或不一致，附證據）。
5. 保留的建議候選（0-2 項皆可）每項都有來源欄位／目標欄位／觸發時機／使用者
   可見提示／保護機制五個要素。
6. 文件清楚分「事實／候選／待確認語意」三類，不混為一談，篇幅精簡。

## CLAUDE_PRECHECK
1. 已讀 `docs/workflow/ITP-AUTOFILL-INVENTORY-2026-001-archive.md`（含完整 REVIEW
   原文），理解 R1-R3 的具體要求。
2. 已讀 `NOIDetailModal.tsx` 的 `getInitialData`／`filteredITPList`、`ITP.tsx` 的
   `newItpDefaultVendor`、`ITPModals.tsx` 的 `submissionDate`／`submit` 初始化、
   `ITPAdvancedEditor.tsx` 的 `handleCopyClick`，確認上方 SCOPE 第 1 點屬實，
   不是臆測。
````

### STATUS.md 完整快照

````markdown
# STATUS.md — Claude 執行結果

TASK_ID: ITP-AUTOFILL-INVENTORY-2026-002
SOURCE_TASK_ID: ITP-AUTOFILL-INVENTORY-2026-001

## RESULT
- [x] DONE
- [ ] PARTIAL
- [ ] BLOCKED

R1-R3 已補正，詳見下方與
`docs/workflow/ITP-AUTOFILL-INVENTORY-2026-002-handoff.md`。**仍是純讀查核**，
未修改任何產品程式碼、未建立任何正式或測試資料。

## CLAUDE_PRECHECK 執行記錄
1. 已讀 `docs/workflow/ITP-AUTOFILL-INVENTORY-2026-001-archive.md`（含完整
   REVIEW 原文），理解 R1-R3 具體要求。
2. 重新讀碼逐一核對審查指出的四個落差點（詳見 R1）。

## R1 修復內容（補回真實預設與依賴方向、更正 submit 論述）
- ITP／NOI 新建記錄皆預選「第一個 active 廠商」（`ITP.tsx:114-117`、
  `NOIDetailModal.tsx:80-81,92`），且 `getActiveContractors()`
  （`contractorsStore.ts:124`）與後端列表端點皆無排序，「第一個」純粹是資料庫
  回傳順序，無業務意義。
- NOI 的 ITP No. 清單依**已選的** Contractor 篩選（`NOIDetailModal.tsx:47,
  107-110`），方向是先選廠商才能選 ITP，與上一輪「選 ITP 補廠商」建議的方向
  相反。
- ITP 新建 `submissionDate` 預設今天（`ITPModals.tsx:185`）。
- Inspection Plan 已有「複製既有項目」輸入輔助（`ITPAdvancedEditor.tsx:
  108-117` 的 `handleCopyClick`），複製後需使用者在編輯對話框確認才真正加入。
- `submit` 欄位**撤回**「無前端引用／死欄位」的說法：`ITPModals.tsx:182` 與
  `itpStore.ts:27,122` 皆有讀取與保留此欄位，只是沒有可見輸入元件讓使用者
  編輯。

## R2 修復內容（取消兩項建議；查核兩個指定方向）
- 已取消：「NOI 選 ITP 補空白廠商／Subject」（與現有流程方向相反）、「ITP
  Description 預填 Project 名稱」（語意不同，無使用者樣本支持）。
- **3a 預選第一家廠商是否易誤選**：列為待實測問題，本輪不下結論、不建議修正
  方案——讀碼只能確認「預選了什麼、依什麼順序」，無法判斷使用者在真實畫面上
  是否容易注意到這是系統預設。
- **3b 預選與手動選擇聯絡資訊初始化是否一致**：**已確認不一致**。預設路徑
  （`getInitialData`）只設定 `contractor`，`contacts`/`phone`/`email` 維持
  空字串；手動選擇路徑（`onChange`，`NOIDetailModal.tsx:300-314`）才會依既有
  非破壞性邏輯帶入這三個欄位。確認本檔案無任何 `useEffect`，不存在掛載時自動
  同步機制。

## R3 修復內容（三類區分，保留 1 項可靠候選，不湊數）
- **事實**（已存在可沿用）：R1 補回的五項既有行為。
- **候選**（讀碼發現，技術可行）：僅保留 1 項——讓「預選廠商」初始化路徑套用
  與「手動選擇」相同的既有非破壞性聯絡資訊帶入邏輯（不是新邏輯，是讓既有邏輯
  多一個觸發點）。完整列明來源欄位／目標欄位／觸發時機／使用者可見提示／
  覆蓋保護機制，見 handoff 文件第四節。
- **待確認業務語意**（不代為決定）：「新建記錄要不要預選第一家廠商」本身是否
  恰當（目前無業務邏輯支撐）、候選項目是否需要「系統帶入」的畫面提示（本輪未
  找到既有樣式可沿用）。

## FILES_CHANGED
無（本批純讀查核，未修改任何產品程式碼）。

## FILES_ADDED
- `docs/workflow/ITP-AUTOFILL-INVENTORY-2026-001-archive.md`（封存上一輪
  REVISE 原文）。
- `docs/workflow/ITP-AUTOFILL-INVENTORY-2026-002-handoff.md`（本輪補正結果）。

## FILES_DELETED
無。

## TESTS_RUN
無（本批為純讀查核，未修改任何產品程式碼，無對應測試可跑；審查明確要求本輪
不重跑已接受的測試、不建資料、不動瀏覽器）。

## RISKS / LIMITATIONS
- 3a（預選第一家廠商是否易誤選）仍是待實測問題，需要下一批實際開瀏覽器驗證
  才能下結論，本輪只讀碼不足以判斷。
- 保留候選的「使用者可見提示」設計本輪未給出具體做法，需要前端設計另行確認
  是否有既有的「系統預設值」視覺樣式可沿用。
- 本輪只針對 NOI 的 Contractor→contacts/phone/email 這組既有邏輯做一致性查核；
  其他模組是否有類似的預設路徑與手動路徑不一致的情況，本輪未系統性盤點。

## SAFETY_CHECK
- 未修改 `AGENTS.md`、`DECISIONS.md`、任何既有 `docs/workflow/*-archive.md`。
  `REVIEW.md` 已重置為待審查狀態，**未自行填入任何審查結論**。
- 未修改任何產品程式碼、未建立任何正式或測試資料、未新增任何必填規則、未覆蓋
  任何使用者輸入、未讓主檔更新影響歷史 ITP/NOI。
- 未操作使用者環境或開發資料庫；本批無需隔離環境（純讀查核）。
- 未使用 stash/reset/checkout；未還原協作者既有修改。
- 未 commit/push/部署。
````
