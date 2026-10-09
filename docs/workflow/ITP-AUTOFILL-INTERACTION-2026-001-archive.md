# ITP-AUTOFILL-INTERACTION-2026-001 — 封存（原文保留；獨立審查 REVISE，下一輪補 R1-R2）

本檔封存 ITP-AUTOFILL-INTERACTION-2026-001 這一輪的 TASK.md、STATUS.md、
REVIEW.md 原文。依 AGENTS.md 規則，原文保留，不因後續工作修改內容。REVIEW.md
判定為 **REVISE**，下一批 ITP-AUTOFILL-INTERACTION-2026-002 只補 R1-R2（設計
文件層級的補正，不實作、不跑測試），其餘已接受的方向（逐欄 system/user 追蹤、
保留手動輸入、來源提示、範圍限定 NOI）保留，不重新設計。

---

## TASK.md（原文，節錄要點；完整原文見本次對話記錄）

```markdown
# TASK.md — NOI 廠商聯絡資訊填表互動方案（設計提案，暫不改程式）
TASK_ID: ITP-AUTOFILL-INTERACTION-2026-001
SOURCE_TASK_ID: ITP-AUTOFILL-INVENTORY-2026-002
（完整 GOAL/SCOPE/ALLOWED_PATHS/FORBIDDEN_PATHS/ACCEPTANCE_CRITERIA/
CLAUDE_PRECHECK 逐字原文見本次對話記錄。）
```

## STATUS.md（原文，節錄要點；完整原文見本次對話記錄）

```markdown
# STATUS.md — Claude 執行結果
TASK_ID: ITP-AUTOFILL-INTERACTION-2026-001
SOURCE_TASK_ID: ITP-AUTOFILL-INVENTORY-2026-002

## RESULT
- [x] DONE

設計提案已交付：逐欄 system/user 來源追蹤、換廠商時只覆蓋 system 狀態欄位、
具體提示文字與 A→B 範例、既有紀錄視為 user 狀態不受影響。本批未修改任何產品
程式碼、未建立任何資料。

（完整內容已在本次對話中完整記錄，僅因封存檔篇幅在此節錄關鍵結論；本輪方案後
被下一輪審查指出兩處設計缺口，詳見下方 REVIEW.md 原文。）
```

## REVIEW.md（原文，完整保留）

```markdown
# REVIEW.md — 獨立審查
TASK_ID: ITP-AUTOFILL-INTERACTION-2026-001
SOURCE_TASK_ID: ITP-AUTOFILL-INVENTORY-2026-002
審查日期：2026-10-04

## EVIDENCE_CHECK
已核對 TASK、STATUS 與本輪設計全文；以先前直接核對的 NOIDetailModal 初始化及 onChange 程式作為現況依據。本輪是設計審查，未執行瀏覽器、測試或資料操作。
逐欄追蹤 system/user、保留手動輸入、來源提示與歷史值保留的方向可接受，但下列兩處未完整達到 AC1。

## SCOPE_CHECK
方案限 NOI，未建議新增 ITP 聯絡欄位或後端來源欄位。此次審查僅修改 REVIEW.md，未改產品程式。

## DECISIONS_CHECK
來源追蹤是前端互動方案，不代表聯絡資訊已經驗證與新廠商匹配。不得把保留手動值等同於避免錯配。新建預選第一家廠商的現況尚未授權改變。

## VERDICT
- [ ] PASS
- [x] REVISE
- [ ] HUMAN_REQUIRED

## REQUIRED_FIXES
### R1 — 補齊現有預選路徑
方案从「尚未選過廠商」開始，未明確處理本次主要問題：新建已預選第一家廠商時聯絡資訊仍空白。補明新建初始化如何同時依該預選廠商帶入三欄與來源狀態；無廠商資料時維持空白，主檔稍後載入不得覆蓋使用者輸入。不改預選政策。清除廠商時的 system/user 欄位處理亦列一行即可。

### R2 — 換廠商保留值必須可辨識
目前 A→B 範例靜默留下手改的 A 聯絡人，同時更新為 B 電話/Email；既有紀錄三欄都視為 user 也會保留舊廠商資訊。保留值可以，但不能宣稱已消除錯配。補上換廠商後明確、非阻斷提示，例如「已保留您原有的聯絡資訊，請確認仍適用於新廠商」，標示哪些欄位保留；使用者可手動修正，不強制清空或新增保存門檻。A→B 範例包含此提示及確認/修正步驟。
同時更正「刪空視為 user 與現有行為一致」：既有 prev.x || selected.x 會重新填空值；保護刻意清空是本方案的新行為。既有空白欄位一律視為 user 也會改變改選廠商時的既有填空行為，須明列為提案差異，不能稱完全不變。

## NEXT_STEP
只補正上述設計缺口；保留其餘已接受方向，不重新盤點，不實作、不啟動隔離環境、不重跑測試。STATUS 的 FILES_CHANGED 請如實列本輪修改的文件，不以「沒有改產品程式」代替所有文件變更清單。回報後再審查是否可進入實作。
```

---

## 補存：完整 TASK / STATUS 快照（來源：對話逐字稿，非摘要重建）

原封存的 TASK / STATUS 段落為摘要節錄，且引用「本次對話記錄」這個日後會失效的
參照。以下從本次對話的逐字稿檔案重新取出並補存當時完整內容，逐字核對無誤；
保留上文摘要不刪除，判定不變。

### TASK.md 完整快照

````markdown
# TASK.md — NOI 廠商聯絡資訊填表互動方案（設計提案，暫不改程式）

TASK_ID: ITP-AUTOFILL-INTERACTION-2026-001
SOURCE_TASK_ID: ITP-AUTOFILL-INVENTORY-2026-002
狀態：已交辦，待 Claude 執行。本批交付**互動設計提案**，暫不修改任何產品程式碼、
不建立任何資料。延續 ITP-AUTOFILL-INVENTORY 系列盤點結論（已 PASS 結案），不是
重開盤點。

## GOAL
針對盤點確認的既有落差（NOI 新建時預選廠商不會同步帶入聯絡資訊；換選廠商時既有
「只填空欄」guard 可能保留上一家廠商的聯絡資訊，造成廠商／聯絡人錯配），提出一份
簡短、可決策的填表互動方案。

## SCOPE
1. 選定廠商後，聯絡人／電話／Email 如何帶入（沿用既有 `Contractor.contactPerson/
   phone/email` 來源，不新增主檔欄位）。
2. 換選廠商時，如何區分「系統帶入」與「使用者手動修改過」兩種狀態，避免：
   (a) 錯配——換了廠商但聯絡資訊還是上一家的；(b) 覆蓋——使用者自己改過的聯絡
   資訊被新廠商的資料蓋掉。
3. 提供具體的畫面提示文字（中英文皆可只給示意，不必完整翻譯全站），以及一個
   「選 A 廠商 → 改選 B 廠商」的操作範例，具體描述每一步畫面上會看到什麼。
4. 既有紀錄（已存在的 NOI）維持原值，不因為 Contractor 主檔事後更新而改變已經
   存的聯絡資訊顯示。
5. 明確標示這項改善**只在 NOI**；ITP 本身沒有聯絡資訊欄位可以承接，不建議為了
   自動帶入去新增一個目前沒有實際用途的欄位。

## ALLOWED_PATHS
- 唯讀：`react-app/src/components/NOI/modals/NOIDetailModal.tsx`、
  `react-app/src/store/contractorsStore.ts`（確認既有樣式/欄位慣例，不修改）
- `docs/workflow/`（本輪設計提案文件；上一輪 archive 已於本次對話建立）
- `TASK.md` / `STATUS.md` / `REVIEW.md`

## FORBIDDEN_PATHS
- 任何產品程式碼（本批為設計提案，暫不實作）
- 任何資料庫 migration、種子腳本、正式或測試資料寫入
- ITP 任何檔案（本批明確排除 ITP，因為它沒有可承接聯絡資訊的欄位）
- `TASK.md`（上一輪）／`DECISIONS.md`／`AGENTS.md`／任何既有 `docs/workflow/
  *-archive.md`（唯讀）

## ACCEPTANCE_CRITERIA
1. 方案清楚回答「選定廠商後怎麼帶入」「換廠商時怎麼避免錯配/覆蓋」兩個核心問題，
   機制本身要能同時滿足：保留使用者已手動輸入的內容、避免殘留上一家廠商的資訊。
2. 有具體提示文字範例與 A→B 操作範例（逐步描述畫面變化），不是抽象原則。
3. 明確說明既有歷史 NOI 紀錄不受影響。
4. 明確標示範圍僅限 NOI，不涉及 ITP。
5. 全程未修改任何產品程式碼、未建立任何資料。
6. 不重跑已接受（PASS）的盤點測試。

## CLAUDE_PRECHECK
1. 已讀 `docs/workflow/ITP-AUTOFILL-INVENTORY-2026-002-archive.md` 與補註更正
   內容，理解「換選廠商可能殘留上一家聯絡資訊」這個已確認的風險。
2. 已讀 `NOIDetailModal.tsx` 既有的 Contractor `onChange` 邏輯
   （約 296-314 行，依上一輪盤點的行號，本輪開始前重新核對一次是否仍然一致）。
````

### STATUS.md 完整快照

````markdown
# STATUS.md — Claude 執行結果

TASK_ID: ITP-AUTOFILL-INTERACTION-2026-001
SOURCE_TASK_ID: ITP-AUTOFILL-INVENTORY-2026-002

## RESULT
- [x] DONE
- [ ] PARTIAL
- [ ] BLOCKED

設計提案已交付，詳見下方與
`docs/workflow/ITP-AUTOFILL-INTERACTION-2026-001-handoff.md`。**本批未修改任何
產品程式碼、未建立任何正式或測試資料**——純設計提案。

## CLAUDE_PRECHECK 執行記錄
1. 已讀 `docs/workflow/ITP-AUTOFILL-INVENTORY-2026-002-archive.md` 與其補註
   更正（撤回「換選廠商不需要額外處理」的保證），理解本輪要解決的核心風險。
2. 重新核對 `NOIDetailModal.tsx` 的 Contractor `onChange` 邏輯（296-314 行，
   與上一輪盤點時的行號一致，程式碼未變動）。

## 方案摘要
核心問題：既有 `prev.x || selected?.x || ''` guard 只能判斷欄位「現在是否為
空」，無法判斷「這個值是系統帶的還是使用者自己打的」，導致換廠商時可能殘留
上一家廠商的聯絡資訊（上一輪補註已指出的風險）。

提案：`contacts`／`phone`／`email` 三個欄位各自在前端表單暫存狀態（不寫入
資料庫、不是 NOI 新欄位）多記一個來源標記——`system`（系統帶入、使用者未碰過）
或 `user`（使用者已手動輸入，不論是否已清空）：
- 選定廠商時，只有 `system` 狀態的欄位會套用新廠商的資料；`user` 狀態的欄位
  不受影響。
- 三個欄位狀態各自獨立追蹤，不是整組一起鎖住。
- 新增具體畫面提示文字：「由廠商資料帶入，可直接修改」，欄位變成 `user`
  狀態後提示消失。
- 附完整的「選 A 廠商 → 手動改聯絡人 → 改選 B 廠商」五步驟操作範例，說明每
  一步畫面上實際會看到什麼。
- 既有歷史 NOI：這個狀態只存在於當次編輯的表單暫存，不持久化；開啟既有紀錄
  時三欄位視為 `user` 狀態（避免編輯既有紀錄時被意外改掉），Contractor 主檔
  事後更新也不會回頭影響已存的 NOI 顯示——與現狀一致，本方案未改變這點。

## FILES_CHANGED
無（本批為設計提案，未修改任何產品程式碼）。

## FILES_ADDED
- `docs/workflow/ITP-AUTOFILL-INVENTORY-2026-002-archive.md`（封存上一輪 PASS
  原文）。
- `docs/workflow/ITP-AUTOFILL-INTERACTION-2026-001-handoff.md`（本輪設計提案）。

## FILES_DELETED
無。上一輪 handoff（`ITP-AUTOFILL-INVENTORY-2026-002-handoff.md`）依審查要求
補註更正，原文保留未刪除（附加於文末，標明補註日期與原因）。

## TESTS_RUN
無（本批為設計提案，未修改任何產品程式碼，無對應測試可跑；依交辦不重跑
ITP-AUTOFILL-INVENTORY 系列已接受的查核）。

## RISKS / LIMITATIONS
- 方案裡的提示文字（「由廠商資料帶入，可直接修改」）是本輪新提出的草案文字，
  未經使用者或前端設計確認最終字句、是否需要圖示等視覺細節。
- 方案僅處理 NOI 的 Contractor→contacts/phone/email 這一組欄位；本輪未系統性
  盤點其他模組是否有類似的「只填空欄」風險。
- 方案本身只是設計提案，未實作、未在瀏覽器驗證實際操作體驗是否如描述般直覺。

## SAFETY_CHECK
- 未修改 `AGENTS.md`、`DECISIONS.md`、任何既有 `docs/workflow/*-archive.md`。
  `REVIEW.md` 已重置為待審查狀態，**未自行填入任何審查結論**。
- 未修改任何產品程式碼、未建立任何正式或測試資料、未新增任何必填規則。
- 上一輪 handoff 的更正以附加方式處理，原文保留未刪除，符合「舊有交接文件只能
  補充更正，不得刪除原始歷史」的既有慣例。
- 未操作使用者環境或開發資料庫；本批無需隔離環境。
- 未使用 stash/reset/checkout；未還原協作者既有修改。
- 未 commit/push/部署。
````
