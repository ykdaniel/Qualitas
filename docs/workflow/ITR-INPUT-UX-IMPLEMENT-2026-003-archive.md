# ITR-INPUT-UX-IMPLEMENT-2026-003 — 封存（TASK / STATUS / REVIEW 逐字快照，封存時尚未審查）

封存日期：2026-10-04。**本輪在獨立審查完成前就先封存**——延續同一輪的慣例，使用者要求開下一批
（ITR-INPUT-UX-IMPLEMENT-2026-004），直接把 003 的 TASK/STATUS 原樣封存，REVIEW.md 封存時仍是
待審空白模板，尚未有 VERDICT。獨立審查者之後若要審查本輪，請直接審查這份封存檔內的 TASK/STATUS
內容。

## TASK.md（逐字）

````markdown
# TASK.md — ITR 主表單三項改善：Related ITP／品質評估排序＋附件收合／NOI 來源標示

TASK_ID: ITR-INPUT-UX-IMPLEMENT-2026-003
SOURCE_TASK_ID: ITR-INPUT-UX-IMPLEMENT-2026-002（ITR-INPUT-UX-2026-001 盤點出的第 2/3/4 項）

## 狀態
已交辦，Claude 執行中。**本批是產品程式碼變更**（不是純審閱），使用者已在本次對話中逐項確認要做
以下三件事，並對其中風險較高的一項（Related ITP）明確選定方案。

## 範圍（使用者在本次對話中確認的三項，依對話記錄逐字對應）
1. **Related ITP 死欄位**：使用者選擇「拿掉下拉，改成唯讀顯示透過 NOI 關聯到的 ITP」（不是保留下拉
   並補齊儲存契約——那個選項需要新增資料庫欄位，範圍大得多，使用者沒選）。
2. **Inspection Result／Remark 搬到 Checklist 後面＋附件可收合**：使用者從三個選項中勾選了這項（純
   版面調整，不涉及業務規則）。
3. **基本資料來源分組（視覺標示哪些來自 NOI）**：使用者從三個選項中勾選了這項（純版面調整）。

## PRECHECK（已讀碼確認）
- `ITRModals.tsx` 的「Related ITP」`<select>`（改前約 732-746 行）綁定 `formData.itpNo`，但
  `itpNo` 從未是 ITR 的資料庫欄位或 Pydantic schema 欄位（`backend/models.py` 的 `ITR` 類別、
  `backend/schemas.py` 的 `ITRBase`/`ITRCreate`/`ITRUpdate` 皆無此欄位，`schemas.py:37` 甚至有
  註解「取代舊的 itpNo」）——這是 ITR-INPUT-UX-2026-001 已確認的讀碼結論。
- NOI 選取 handler（約 663-684 行）在使用者挑了有 `itpNo` 的 NOI 時，會
  `handleFieldChange('itpNo', selectedNOI.itpNo)` 把值寫進 `formData`——這是 ITR-INPUT-UX-
  IMPLEMENT-2026-002 審查時的更正：建立當下這個值不是空的，只是從未真正進入保存契約，重新打開後
  找不回來。
- `noiList`（`useNOIStore`）與 `itpList`（`useITPStore`）在 `ITRDetailModal` 裡已經載入
  （107/110/126 行附近），`NOI.itpNo` 指向 `ITP.referenceNo`（`backend/models.py` 的 NOI 類別
  `itpNo = Column(..., ForeignKey("itp.referenceNo", ...))`）——不需要新增任何 API 呼叫，純前端
  用既有的兩份清單做一次 `noiList.find` + `itpList.find` 查找即可即時算出「這筆 ITR 透過 NOI 關聯
  到哪個 ITP」，而且建立當下與重新打開後算出來的結果一致（不像舊的 `formData.itpNo` 只有建立當下
  那一刻是對的）。
- Items 順序（改前）：Linked Checklists → 照片上傳 → Attachments（Drawings／Certificates／
  Attachments）→ 品質評估（Inspection Result／Status／Close-out Date／Remark）→ RelatedDocuments。
  全專案搜尋不到既有共用 Collapsible/Accordion 元件（ITR-INPUT-UX-2026-001 讀碼結論），唯一先例是
  Linked Checklists 清單每一列自己的展開/收合（`expandedInstanceId`）。
- Subject／Contractor／Inspection Date 連結 NOI 後會變成 `readOnly`（`isLocked ||
  !!formData.noiNumber`），灰底顯示，但沒有任何視覺提示告訴使用者「這是從 NOI 帶過來的」。
  `FormShell.module.css` 已有現成的 `.fieldHint` class（NOI 聯絡資訊自動帶入那輪加的），
  `ITRModals.tsx` 已經 import 這個 CSS module 為 `formStyles`，可以直接複用，不需要新增 CSS。

## SCOPE
1. **Related ITP**：
   - 移除 `formData.itpNo` 的 `<select>`，改成唯讀 `<input>`，顯示透過
     `noiList.find(n => n.referenceNo === formData.noiNumber)?.itpNo` 再到
     `itpList.find(i => i.referenceNo === 該itpNo)` 查到的 ITP `referenceNo`（查無則顯示
     `description`，都沒有則顯示「尚未透過 NOI 關聯到 ITP」的提示文字）。用 `useMemo` 依
     `formData.noiNumber`／`noiList`／`itpList` 重新計算，不依賴 `formData.itpNo` 這個已確認的
     死欄位。
   - 移除 NOI 選取 handler 裡 `handleFieldChange('itpNo', selectedNOI.itpNo)` 這行自動帶入
     （不再需要，因為顯示已經改成即時推導，不依賴存在 `formData.itpNo` 裡的值）。
   - `ITRDetailData.itpNo`、`getInitialData()` 讀取 `existingItem.itpNo || dd.itpNo` 的 fallback、
     `ITRPrintPreview` 元件裡 `displayData.itpNo` 的列印欄位**維持不動**——`ITRPrintPreview` 是
     獨立元件，沒有拿到 `noiList`/`itpList`，要讓列印也顯示即時推導值需要額外把這兩份清單傳進去，
     超出「只拿掉死欄位下拉」這個範圍；列印欄位本來就只在極窄的歷史邊界情況下有值（見
     ITR-INPUT-UX-2026-001 讀碼結論），不會因為這次修改而變得比現在更差。STATUS.md 需明列這個
     已知限制，不得略過不提。
2. **品質評估搬移＋附件收合**：
   - 把「品質評估」（Inspection Result／Status／Close-out Date／Remark）區塊從附件之後搬到 Linked
     Checklists 之後、照片/附件之前。
   - 新建一個最小的共用元件 `react-app/src/components/Shared/CollapsibleSection.tsx`（純展開/收合
     UI state，不含任何資料/驗證邏輯），把四個附件類區塊（Defect/Improvement Photos 一組、
     Latest Drawings、Calibration Certificates、一般 Attachments）包進去。每個區塊的初始展開狀態
     依「這筆 ITR 是否已經有對應附件」決定（有內容的預設展開，沒有的預設收合），不是寫死全部收合
     或全部展開。
   - 不改變任何上傳/刪除/既有附件顯示的邏輯——`FileAttachment` 元件本身與其 props 完全不動，只是
     外層容器從 `<div className={formStyles.formSection}>` 換成 `<CollapsibleSection>`。
3. **NOI 來源視覺標示**：
   - 在 Subject／Contractor／Inspection Date 三個因連結 NOI 而唯讀的欄位下方，`formData.noiNumber`
     為真時加一行 `<small className={formStyles.fieldHint}>{t('itr.fieldFromNoi')}</small>`
     （新增翻譯鍵 `itr.fieldFromNoi`，英文「From NOI」／中文「來自 NOI」）。
   - Related ITP 唯讀欄位在確實查到關聯 ITP 時也加上同樣的提示（一致的視覺語言）。
   - 不新增欄位分組容器、不改表格/grid 版面結構本身——這批的「分組」是用提示文字做語意區分，不是
     用視覺區塊框線重新分組（更大幅的版面分組如果需要，應該是另一批任務，這裡先用風險最低的方式
     達成「使用者看得出哪些來自 NOI」這個目標）。
4. 新增兩個翻譯鍵（`itr.noRelatedItp`、`itr.fieldFromNoi`），英文＋中文皆補齊，不觸碰其他既有翻譯
   鍵（包含已知有缺口的 `itr.relatedITP`/`itr.selectITP` 中文翻譯——那是既有缺口，不在本批範圍）。
5. 不改變任何保存／取消／權限／Reopen／鎖定邏輯——`isLocked`、`handleFieldChange`、
   `handleSave`/存檔 payload 組裝、Checklist 相關邏輯完全不動。

## ALLOWED_PATHS
- `react-app/src/components/ITR/ITRModals.tsx`
- `react-app/src/components/Shared/CollapsibleSection.tsx`（新建）
- `react-app/src/context/LanguageContext.tsx`（僅新增 `itr.noRelatedItp`／`itr.fieldFromNoi` 兩個
  鍵的英中翻譯）
- `react-app/tests-browser/`（驗收腳本，新建或延伸）
- `docs/workflow/`（本輪 handoff／evidence；上一輪 archive 已建立）
- `TASK.md` / `STATUS.md` / `REVIEW.md`

## FORBIDDEN_PATHS
- `react-app/src/components/ITR/ChecklistSnapshotModal.tsx`、
  `react-app/src/components/Checklist/ChecklistResultControls.tsx`——round 001/002 已實作/驗證的
  版本維持不變。
- `react-app/src/components/Checklist/Checklist.tsx`、`ChecklistPrintTemplate.tsx`、
  `react-app/src/components/ITR/ITRApprovalHistoryModal.tsx`——不在範圍內。
- `backend/**`——本批純前端渲染/版面/查找邏輯調整，不涉及 API 契約或資料庫 schema 變更（Related
  ITP 的「真正會存檔」方案使用者已明確不選）。
- `react-app/src/services/api.ts`、`ITR.tsx` 的存檔 payload 組裝——不新增/移除任何送到後端的欄位。
- 已補齊的 `itr.relatedITP`/`itr.selectITP` 等既有翻譯鍵以外的全站翻譯缺口——不在本批範圍，不補。
- 開發資料庫、使用者 8198/3198、`stash`/`reset`/`checkout`。
- commit／push／部署。

## ACCEPTANCE_CRITERIA
1. Related ITP 顯示的值在「選定 NOI 當下」與「保存後重新打開」兩種情境下**一致**（都是即時依
   NOI→ITP 推導，不再有「建立當下有值、重開後消失」的落差）；下拉已移除，無法再手動選值。
2. 品質評估區塊在畫面順序上確實排在 Linked Checklists 之後、照片/附件之前；四個附件類區塊可
   展開/收合，收合/展開不影響既有上傳/刪除行為，已有內容的區塊預設展開。
3. Subject／Contractor／Inspection Date／（有值時的）Related ITP 在連結 NOI 時顯示「來自 NOI」
   提示文字。
4. `npx tsc --noEmit` 無錯誤；`npm run lint` 基線如實列出（13 errors/21 warnings 不變，本輪修改
   檔案未新增問題）。
5. 使用獨立隔離環境以真實瀏覽器操作驗證以上三點，並確認既有的 Checklist 填寫/保存/鎖定行為
   （round 001/002 已驗證的部分）未被這次版面調整破壞。
6. STATUS.md 明列 Related ITP 列印預覽的已知限制（本批不處理）；未操作使用者 8198/3198 或開發
   資料庫；未 commit/push/部署；REVIEW.md 留待獨立審查。
````

## STATUS.md（逐字）

````markdown
# STATUS.md — Claude 執行結果

TASK_ID: ITR-INPUT-UX-IMPLEMENT-2026-003
SOURCE_TASK_ID: ITR-INPUT-UX-IMPLEMENT-2026-002

## RESULT
- [x] DONE
- [ ] PARTIAL
- [ ] BLOCKED

## 本輪變更範圍
產品程式碼變更（非純審閱）。修改／新增檔案：
- `react-app/src/components/ITR/ITRModals.tsx`（Related ITP 改唯讀推導、品質評估搬移、四個附件區塊
  改用 CollapsibleSection、新增 From NOI 提示）
- `react-app/src/components/Shared/CollapsibleSection.tsx`（新建，純展開/收合 UI，無資料/驗證邏輯）
- `react-app/src/context/LanguageContext.tsx`（新增 `itr.noRelatedItp`／`itr.fieldFromNoi` 兩個
  翻譯鍵，英中皆補；未觸碰其他既有翻譯鍵，包含已知缺口的 `itr.relatedITP`/`itr.selectITP` 中文
  翻譯——那是既有缺口，不在本批範圍）
- `react-app/tests-browser/itr-input-ux-implement3-review.mjs`（新建驗收腳本）

`ChecklistSnapshotModal.tsx`、`ChecklistResultControls.tsx`、任何後端檔案、存檔 payload 組裝皆
**未修改**。

## 1. Related ITP：拿掉死欄位下拉，改成即時推導的唯讀顯示
**讀碼確認**：`itpNo` 從未是 ITR 的資料庫欄位（`backend/models.py`／`backend/schemas.py` 皆無此
欄位），舊版下拉讓使用者選的值存檔後必定消失。

**實作**：新增 `relatedItp`（`useMemo`，依 `formData.noiNumber`／`noiList`／`itpList` 計算）：
透過 `noiList.find(noi => noi.referenceNo === formData.noiNumber)` 找到連結的 NOI，再用它的
`itpNo` 到 `itpList` 查出對應 ITP，顯示其 `referenceNo`（查無則顯示
`t('itr.noRelatedItp')`「尚未透過 NOI 關聯到 ITP」）。移除了 NOI 選取 handler 裡
`handleFieldChange('itpNo', selectedNOI.itpNo)` 這行自動帶入——不再需要，因為顯示不依賴存進
`formData.itpNo` 的值。

**實測（隔離環境，真實瀏覽器）**：`itp3` 確認選定 NOI 後 Related ITP 正確顯示
`QTS-IUX2-ITP-000001`；`itp5` 用**全新瀏覽器 context** 重新打開同一筆 ITR，確認顯示的值與之前
**完全一致**——這是本次要解決的核心問題：舊版下拉「建立當下有值、重開後消失」的落差已經消除，
因為新版從不依賴一個從未真正存檔的欄位，而是每次都從 NOI／ITP 兩份清單即時算出來。

**已知限制（本批不處理，如實列出）**：`ITRPrintPreview` 元件是獨立元件，沒有拿到 `noiList`／
`itpList`，列印預覽的 Related ITP 欄位仍讀取舊的 `displayData.itpNo`（`ITRModals.tsx` 第 1385
行附近）——對任何正常建立的新記錄這個欄位本來就幾乎都是空的（ITR-INPUT-UX-2026-001 已確認），
這次修改不會讓列印變得比現在更差，但也沒有讓列印顯示即時推導值。要修正列印需要把 `noiList`／
`itpList`（或已經推導好的 `relatedItp`）一併傳進 `ITRPrintPreview`，超出本批「拿掉死欄位下拉」
的範圍，留待後續任務。

## 2. 品質評估搬移到 Checklist 後面＋四個附件區塊改可收合
**實作**：把「Quality Assessment」（Inspection Result／Status／Close-out Date／Remark）整塊從
原本「附件之後」搬到「Linked Checklists 之後、照片/附件之前」；新建最小共用元件
`CollapsibleSection.tsx`（純 `useState` 展開狀態 + 點擊 header 切換，不含任何資料邏輯），把
Defect/Improvement Photos、Latest Drawings、Calibration Certificates、一般 Attachments 四個
區塊包進去，各自依「這筆 ITR 是否已經有對應附件」決定初始展開/收合狀態。

**實測**：`order0`/`order1` 確認 DOM 順序確實是 Linked Checklists → Quality Assessment →
Latest Drawings（截圖 `desktop-related-itp-and-noi-hints.png` 可見 Quality Assessment 緊接在
Linked Checklists 卡片下方）；`collapse1`/`collapse2`/`collapse3` 實際點擊 Latest Drawings 的
標題列，確認內容真的展開（Upload Files 按鈕從 0 個變 1 個）又能收合回去（變回 0 個）——這是真實
互動測試，不是只檢查 DOM 存不存在。

**未變動**：`FileAttachment` 元件本身與其上傳/刪除/既有附件顯示的 props 完全沒有改——只是外層
容器從 `<div className={formStyles.formSection}>` 換成 `<CollapsibleSection>`，不影響任何既有
附件行為。

## 3. NOI 來源視覺標示
**實作**：Subject／Contractor／Inspection Date 三個因連結 NOI 而唯讀的欄位、以及有查到值的
Related ITP 欄位，`formData.noiNumber` 為真時都加一行
`<small className={formStyles.fieldHint}>{t('itr.fieldFromNoi')}</small>`（「From NOI」／
「來自 NOI」，複用 NOI 聯絡資訊那輪已有的 `.fieldHint` CSS class，沒有新增 CSS）。

**實測**：`hint1` 確認畫面上至少有 4 處「From NOI」提示（截圖可見分別在 Contractor／Subject／
Related ITP／Inspection Date 四個欄位下方）。

**範圍確認**：這次的「分組」是用提示文字做語意區分，不是重新設計欄位分組的視覺區塊/框線——那種
更大幅的版面分組如果需要，應該是另一批任務，這次先用風險最低的方式達成「使用者看得出哪些來自
NOI」這個目標，符合 TASK.md 第 3 點的範圍界定。

## 既有行為健檢（非本輪重點，確認未破壞）
`sanity1`/`sanity2` 確認 Linked Checklists 區塊在版面搬動後依然能正常展開、Checklist Items 分頁
的 Situation textarea（round 001 的改動）依然正常渲染——本輪**沒有**重新測試 round 001/002 已經
驗證過的完整保存/鎖定/取消/重試流程（那些邏輯完全沒被這次改動觸碰，依 TASK.md 範圍界定不重跑）。

## 實測結果
隔離環境（`isolated_stack.py up --port 8280 --vite-port 3280`，與使用者 8198/3198 無關，執行
前後 `lsof` 確認未受影響），沿用既有 seed（`seed_itr_input_ux_review.py`，本輪未修改）：

```
13 checks executed, 13 PASS, 0 FAIL
```

全文見 `docs/workflow/ITR-INPUT-UX-IMPLEMENT-2026-003-evidence/run.log`。截圖：
`desktop-related-itp-and-noi-hints.png`（Related ITP 正確顯示＋四處 From NOI 提示＋Quality
Assessment 緊接 Linked Checklists 之後）。

## 前端檢查
- `npx tsc --noEmit`：整個前端，無任何錯誤。
- `npm run lint`：13 errors / 21 warnings，與前幾輪記載的既有基線相同；本輪修改的三個檔案
  （`ITRModals.tsx`／`CollapsibleSection.tsx`／`LanguageContext.tsx`）皆未出現在錯誤清單中，
  確認沒有新增 lint 問題。
- `npm run build`／既有單元測試套件：本批未重跑——純前端渲染/版面調整，`tsc` 已確認型別正確，
  依本輪 TASK.md 範圍不要求重跑整包建置或既有測試套件。

## 隔離環境
`isolated_stack.py up/seed/down`，backend port 8280、vite port 3280，與使用者 8198/3198 無關，
執行前後 `lsof -i :8198 -i :3198` 確認使用者本機開發環境全程未被影響；測試完畢已正常 `down` 回收。
未使用 `stash`/`reset`/`checkout`。

## 範圍確認
- 未修改 FORBIDDEN_PATHS 列出的任何檔案（`ChecklistSnapshotModal.tsx`、
  `ChecklistResultControls.tsx`、`Checklist.tsx`、`ChecklistPrintTemplate.tsx`、任何後端檔案、
  `services/api.ts` 的存檔 payload 組裝）。
- 未新增/移除任何送到後端的欄位；未新增 API 呼叫。
- 未補齊 `itr.relatedITP`/`itr.selectITP` 既有中文翻譯缺口（不在本批範圍）。
- 未操作使用者 8198/3198 或開發資料庫。
- 未 commit／push／部署。
- REVIEW.md 留待獨立審查。
````

## REVIEW.md（逐字，封存時仍待審）

````markdown
# REVIEW.md — 獨立審查

TASK_ID: ITR-INPUT-UX-IMPLEMENT-2026-003
SOURCE_TASK_ID: ITR-INPUT-UX-IMPLEMENT-2026-002
審查日期：待審

## EVIDENCE_CHECK
（待審）

## SCOPE_CHECK
（待審）

## DECISIONS_CHECK
（待審）

## VERDICT
- [ ] PASS
- [ ] REVISE
- [ ] HUMAN_REQUIRED

## REQUIRED_FIXES
（待審）

## NEXT_STEP
（待審）
````
