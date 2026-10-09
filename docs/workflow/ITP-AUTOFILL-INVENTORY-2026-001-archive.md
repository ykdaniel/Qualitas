# ITP-AUTOFILL-INVENTORY-2026-001 — 封存（原文保留；獨立審查 REVISE，下一輪補 R1-R3）

本檔封存 ITP-AUTOFILL-INVENTORY-2026-001 這一輪的 TASK.md、STATUS.md、REVIEW.md
原文。依 AGENTS.md 規則，原文保留，不因後續工作修改內容。REVIEW.md 判定為
**REVISE**，下一批 ITP-AUTOFILL-INVENTORY-2026-002 補 R1-R3，仍是純讀查核。

---

## TASK.md（原文，節錄要點；完整原文見本次對話記錄）

```markdown
# TASK.md — ITP 輸入欄位與基本資料自動帶入盤點（純讀查核）
TASK_ID: ITP-AUTOFILL-INVENTORY-2026-001
SOURCE_TASK_ID: FORMS-CONSISTENCY-2026-004
（完整 GOAL/SCOPE/ALLOWED_PATHS/FORBIDDEN_PATHS/ACCEPTANCE_CRITERIA/CLAUDE_PRECHECK
逐字原文見本次對話記錄。）
```

## STATUS.md（原文，節錄要點；完整原文見本次對話記錄）

```markdown
# STATUS.md — Claude 執行結果
TASK_ID: ITP-AUTOFILL-INVENTORY-2026-001
SOURCE_TASK_ID: FORMS-CONSISTENCY-2026-004

## RESULT
- [x] DONE

純讀查核已完成。Contractor 9 個欄位、Project 5 個欄位、無直接關聯表。三項優先建議：
NOI 選 ITP 補空白廠商與 Subject、ITP Contractor 依專案紀錄排序、ITP Description
預填 Project 名稱。

（完整內容已在本次對話中完整記錄，僅因封存檔篇幅在此節錄關鍵結論；本輪查核後被
下一輪審查指出數項與實際程式碼不符，詳見下方 REVIEW.md 原文。）
```

## REVIEW.md（原文，完整保留）

```markdown
# REVIEW.md — 產品設計／前端資料盤點審查
TASK_ID: ITP-AUTOFILL-INVENTORY-2026-001
SOURCE_TASK_ID: FORMS-CONSISTENCY-2026-004
審查日期：2026-10-04

## EVIDENCE_CHECK
本次只讀核對handoff、TASK及相關程式；沒有操作瀏覽器或建立資料。
確認Contractor有contactPerson/email/phone、Project無對應聯絡欄位。盤點其餘幾項未忠實反映現有輸入流程：
1. NOIDetailModal.tsx getInitialData預選第一個activeContractor；filteredITPList在contractor空白時直接[]，否則getITPByVendor(contractor)。因此「選ITP後補入空白Contractor」與目前操作相反，不能列作風險最低、價值最高的既成結論。須區分是否另設ITP-first流程，而不能暗中改變選擇順序。
2. ITP.tsx新建會設newItpDefaultVendor；ITPModals.tsx新建submissionDate預設今天。盤點漏掉這些既有預設，不應稱完全手動。
3. ITPModals.tsx初始化保留submit，itpStore亦映射submit。沒有可見輸入元件不等於沒有引用／死欄位；撤回「逐檔搜尋無引用」與建議刪除方向。
4. ITPAdvancedEditor已有handleCopyClick、複製入口；Inspection Plan不是只能從零完全手填。無主檔不等於不能使用既有項目／範本作使用者確認的輸入輔助。

## SCOPE_CHECK
本批純讀範圍維持。補正盤點，不新增產品功能或把NOI建議當成ITP本身已改善。

## DECISIONS_CHECK
產品設計判斷（非既定業務政策）：
- Project.name與ITP.description不是相同語意，沒有使用者工作樣本支持時不推薦預填。
- ITP.description與NOI.package也不可僅憑文字相似直接認定可互換；較保守候選是使用者明確點選「帶入ITP描述」，且先核對用途。
- 從歷史紀錄推導常用廠商不代表正式專案廠商關聯或授權；涉及來源完整性、scope、排序與無資料回退，不能把「只填空白」當作低風險保證。

## VERDICT
- [ ] PASS
- [x] REVISE
- [ ] HUMAN_REQUIRED

## REQUIRED_FIXES
R1：補回真實預設與依賴方向（ITP/NOI預選廠商、NOI廠商→ITP過濾、ITP日期預設、項目複製），更正submit無引用論述。不重做主檔全量盤點。
R2：重排建議，取消「NOI選ITP補空白廠商最高優先」與「Description預填專案名稱」的預設推薦。用既有流程找真正重複輸入／易誤選點，例如預選第一廠商是否造成誤選、預選廠商與聯絡資訊初始化是否一致；這些先查核，不直接修。給每項來源欄位、目標欄位、觸發時點、使用者可見提示、改選／已輸入時如何保護。
R3：明確區分三類：已存在可沿用、讀碼發現的候選、需要使用者確認的語意。不為湊滿三項推薦缺乏依據的自動填值；保留2項可靠候選亦可。交付簡短可決策表，不擴寫長報告、不新增必填/關聯/資料清洗。

## NEXT_STEP
交Claude補正只讀盤點；暫不實作自動帶入。產品與前端設計先改善正確選擇及輸入輔助，而非把不同語意欄位填滿。
```

---

## 補存：完整 TASK / STATUS 快照（來源：對話逐字稿，非摘要重建）

原封存的 TASK / STATUS 段落為摘要節錄，且引用「本次對話記錄」這個日後會失效的
參照。以下從本次對話的逐字稿檔案重新取出並補存當時完整內容，逐字核對無誤；
保留上文摘要不刪除，判定不變。

### TASK.md 完整快照

````markdown
# TASK.md — ITP 輸入欄位與基本資料自動帶入盤點（純讀查核）

TASK_ID: ITP-AUTOFILL-INVENTORY-2026-001
SOURCE_TASK_ID: FORMS-CONSISTENCY-2026-004
狀態：已交辦，待 Claude 執行。本批**純讀查核**，不修改任何產品程式碼、不建立任何
正式資料，目標是交出一份可決策的盤點結果。

## GOAL
使用者關注填表效率（不是按鈕一致性）。逐欄核對 ITP 基本資料與 Inspection Plan 的
實際輸入方式，對照既有廠商、專案等主檔，確認哪些欄位已有來源、哪些已自動帶入、
哪些仍須使用者重複輸入；整理對照表，選出最值得先改的三項並附具體例子。

## SCOPE
1. 讀碼確認 ITP 的實際欄位結構（表單＋後端 schema＋資料庫欄位），不臆測。
2. 讀碼確認 Project／Contractor（廠商、專案）等主檔實際有哪些欄位——**不假設**主檔
   有電話、聯絡人、合約等欄位，必須讀碼確認存在與否、欄位名稱為何。
3. 逐欄核對 ITP 建立/編輯表單：目前輸入方式（自由輸入／下拉選單選既有主檔／自動
   帶入唯讀顯示／完全沒有這個來源可帶）。
4. 整理一張簡短對照表：欄位／目前來源／現有行為／建議改善方向。
5. 選出最值得優先改善的三項，各自附一個具體的「現在怎麼填」vs「改善後可以怎麼填」
   的例子（不是抽象描述）。
6. 本批**不**：新增必填規則、自動覆蓋使用者已輸入的值、讓主檔事後更新悄悄改變
   既有歷史 ITP 的顯示內容、做全站翻譯、重新設計保存機制、建立任何正式資料或種子
   資料、修改任何產品程式碼。

## ALLOWED_PATHS
- 唯讀：`backend/models.py`、`backend/schemas.py`、`backend/routers/itp.py`、
  `backend/services/itp_service.py`、`backend/repositories/itp_repository.py`、
  `backend/routers/contractors.py`、`backend/routers/projects.py`（及對應
  service/repository）
- 唯讀：`react-app/src/components/ITP/**`、`react-app/src/components/Contractors/**`
  （若有獨立的 Project 編輯表單一併讀）
- `docs/workflow/`（本輪 handoff）
- `TASK.md` / `STATUS.md` / `REVIEW.md`

## FORBIDDEN_PATHS
- 任何產品程式碼（本批純讀查核，不修改）
- 任何資料庫 migration、種子腳本、正式或測試資料寫入
- 後端業務邏輯、授權規則
- `TASK.md`（上一批）／`DECISIONS.md`／`AGENTS.md`／任何既有 `docs/workflow/
  *-archive.md`（唯讀）

## ACCEPTANCE_CRITERIA
1. 對照表裡每一欄的「目前來源」與「現有行為」都有對應的檔案/行號依據，不是憑印象
   寫的。
2. 明確指出哪些欄位主檔**沒有**對應資料（例如若 Contractor 真的沒有電話欄位，要
   如實寫「無此欄位，需先確認是否該新增」，不能假裝有）。
3. 三項優先建議各自附具體的「現在」vs「改善後」例子，不是空泛描述。
4. 全程未修改任何產品程式碼、未建立任何正式或測試資料。
5. 明確標示哪些是本輪讀碼確認的事實、哪些是建議（尚未決策，需要使用者確認）。

## CLAUDE_PRECHECK
1. 已讀 `docs/workflow/FORMS-CONSISTENCY-2026-004-archive.md` 了解上一批結案狀態。
2. 讀 ITP 的 model/schema/router/service/repository 確認實際欄位。
3. 讀 Contractor／Project 的 model/schema 確認實際有哪些欄位，不假設存在電話、
   聯絡人、合約等欄位。
4. 讀 ITP 前端表單確認每個欄位目前的輸入元件型態（自由文字／下拉選單／唯讀顯示／
   無）。
````

### STATUS.md 完整快照

````markdown
# STATUS.md — Claude 執行結果

TASK_ID: ITP-AUTOFILL-INVENTORY-2026-001
SOURCE_TASK_ID: FORMS-CONSISTENCY-2026-004

## RESULT
- [x] DONE
- [ ] PARTIAL
- [ ] BLOCKED

純讀查核已完成，詳見下方與
`docs/workflow/ITP-AUTOFILL-INVENTORY-2026-001-handoff.md`。**未修改任何產品
程式碼、未建立任何正式或測試資料。**

## CLAUDE_PRECHECK 執行記錄
1. 已讀 `docs/workflow/FORMS-CONSISTENCY-2026-004-archive.md` 了解上一批結案
   狀態（PASS，FORMS-CONSISTENCY 系列結案）。
2. 讀 `backend/models.py` 確認 ITP（19-46 行）、Contractor（559-571 行）、
   Project（610-619 行）的實際欄位，**不假設**主檔有電話、聯絡人、合約等欄位——
   確認 Contractor 確實有 `contactPerson`/`email`/`phone`，Project **沒有**
   這些欄位。
3. 讀 `backend/schemas.py`（`ITPDetailBody`，139-144 行）、
   `react-app/src/types/itp.ts`（`InspectionItem`）確認 Inspection Plan
   （`detail_data.a/b/c`）的逐列欄位結構。
4. 讀 `react-app/src/components/ITP/ITPModals.tsx` 逐欄確認目前的輸入方式
   （自由輸入／下拉選單／唯讀／無）與是否有自動帶入。
5. 讀 `react-app/src/components/Contractors/ContractorModal.tsx` 確認
   Contractor 的 9 個 DB 欄位在前端全部可編輯，沒有欄位被隱藏。
6. 讀 `react-app/src/components/NOI/modals/NOIDetailModal.tsx` 找到既有的
   「選 Contractor 非破壞性帶入 contacts/phone/email」模式（296-314 行），作為
   後續建議的既有先例，並發現 NOI 的 ITP No. 選擇器完全沒有套用同樣的模式
   （336-337 行）。

## 查核結果摘要
- Contractor：`id, package, name, abbreviation, scope, contactPerson, email,
  phone, address, status`（9 個資料欄位，前端全部可編輯）。
- Project：`id, name, code, description, owner, created_at`（5 個資料欄位，
  `owner` 是純文字，不是關聯欄位）。**沒有**電話、聯絡人、合約欄位。
- Project 與 Contractor **沒有**直接關聯表，無法直接查出「專案配合哪些廠商」。
- ITP 表單共 11 個頭部欄位（不含 Inspection Plan），逐欄來源與現有行為已整理
  成對照表，詳見 handoff 文件第二節。
- ITP 的 Contractor／Project 下拉選單選定後，**完全不影響**表單內任何其他欄位
  （因為 ITP 本身沒有可承接聯絡資訊的欄位）。
- `submit` 這個 DB 欄位在前端三個 ITP 相關檔案裡完全沒有對應輸入元件，疑似死
  欄位——另記，不在本輪自動帶入建議範圍。
- 下游關聯：NOI 選擇「ITP No.」後不會帶入該 ITP 的 vendor／description，是最
  具體、風險最低的落差（NOI 的 Contractor 欄位本身已有同類型的既有非破壞性
  帶入模式，只是 ITP No. 選擇器沒有套用）。

## 三項優先建議（摘要，完整例子見 handoff 文件第三節）
1. NOI 選定 ITP No. 後，非破壞性帶入 Contractor 與 Subject（風險最低、與既有
   模式一致）。
2. ITP 的 Contractor 下拉清單依「本專案既有紀錄」優先排序（需要從既有紀錄反推，
   工作量中等，沒有現成的 Project↔Contractor 關聯表）。
3. ITP 的 Description 欄位以 Project 名稱作非強制初始值。

三項皆為「只在目標欄位空白時才帶入、使用者可自由覆蓋、只在操作當下讀取主檔、
不回溯影響已存的歷史 ITP」的非破壞性預設值模式，符合交辦的不新增必填／不覆蓋
輸入／不悄悄改變歷史紀錄的限制。

## FILES_CHANGED
無（本批純讀查核，未修改任何產品程式碼）。

## FILES_ADDED
- `docs/workflow/FORMS-CONSISTENCY-2026-004-archive.md`（封存上一批 PASS 原文）。
- `docs/workflow/ITP-AUTOFILL-INVENTORY-2026-001-handoff.md`（本輪查核結果）。
- `BACKLOG.md` 新增一筆 FORMS-CONSISTENCY 系列結案記錄（含舊
  `forms-consistency-review.mjs` Part D 對 ITR 已過時的維護注意事項）。

## FILES_DELETED
無。

## TESTS_RUN
無（本批為純讀查核，未修改任何產品程式碼，無對應測試可跑）。

## RISKS / LIMITATIONS
- 本輪只盤點 ITP／Contractor／Project 三者，未擴及其他模組（NOI 的發現是研究
  過程中順帶找到的下游關聯，不是本輪系統性盤點 NOI 全部欄位的結果）。
- 候選＃2（依本專案既有紀錄排序 Contractor）的具體判斷邏輯（用哪些模組的歷史
  紀錄、新專案沒有歷史紀錄時如何處理）尚未設計，只是指出方向。
- `submit` 欄位疑似死欄位的判斷，只憑前端原始碼搜尋得出，未反查資料庫是否有
  既有資料存在這個欄位裡。

## SAFETY_CHECK
- 未修改 `AGENTS.md`、`DECISIONS.md`、任何既有 `docs/workflow/*-archive.md`。
  `REVIEW.md` 已重置為待審查狀態，**未自行填入任何審查結論**。
- 未修改任何產品程式碼、未建立任何正式或測試資料、未新增任何必填規則、未覆蓋
  任何使用者輸入、未讓主檔更新影響歷史 ITP。
- 未操作使用者環境或開發資料庫；本批無需隔離環境（純讀查核）。
- 未使用 stash/reset/checkout；未還原協作者既有修改。
- 未 commit/push/部署。
````
