# ITP-AUTOFILL-INTERACTION-2026-002 — 封存（原文保留；獨立審查 PASS 結案）

本檔封存 ITP-AUTOFILL-INTERACTION-2026-002 這一輪的 TASK.md、STATUS.md、
REVIEW.md 原文。依 AGENTS.md 規則，原文保留，不因後續工作修改內容。REVIEW.md
判定為 **PASS**，ITP-AUTOFILL-INTERACTION 設計提案系列（001 REVISE → 002 PASS）
結案，不再開 003。PASS 後依審查要求的三項文件收尾（STATUS 的 FILES_CHANGED
如實列出、撤回競態保證、「既有政策」改稱「既有行為」＋補清除廠商時的提示處理）
已在封存前直接修正於本輪的 handoff／STATUS 原文裡，本檔封存的是收尾完成後的
最終版本。

**結論：設計已就緒，尚未實作**。下一個產品修改需另立實作 TASK，承接本輪設計
與本輪明列的所有行為差異（刻意清空保護、既有紀錄一律視為 user、延遲資料的
來源比對機制尚未設計等），不在本系列自動展開。

---

## TASK.md（原文，節錄要點；完整原文見本次對話記錄）

```markdown
# TASK.md — NOI 填表互動方案 R1-R2 補正（設計文件層級，暫不改程式）
TASK_ID: ITP-AUTOFILL-INTERACTION-2026-002
SOURCE_TASK_ID: ITP-AUTOFILL-INTERACTION-2026-001
（完整 REQUIRED_FIXES/SCOPE/ALLOWED_PATHS/FORBIDDEN_PATHS/ACCEPTANCE_CRITERIA/
CLAUDE_PRECHECK 逐字原文見本次對話記錄。）
```

## STATUS.md（原文，封存收尾完成後的最終版本；完整原文見本次對話記錄）

```markdown
# STATUS.md — Claude 執行結果
TASK_ID: ITP-AUTOFILL-INTERACTION-2026-002
SOURCE_TASK_ID: ITP-AUTOFILL-INTERACTION-2026-001

## RESULT
- [x] DONE

R1-R2 已補正，獨立審查判定 PASS，封存前完成審查要求的三項文件收尾。設計已就緒，
尚未實作。

（完整 CLAUDE_PRECHECK／R1-R2 修復內容／PASS 後文件收尾／FILES_CHANGED（如實
區分執行者/審查者）／TESTS_RUN／RISKS／SAFETY_CHECK 逐字原文已在本次對話中
完整記錄，僅因封存檔篇幅在此節錄關鍵結論。）
```

## REVIEW.md（原文，完整保留）

```markdown
# REVIEW.md — 獨立審查
TASK_ID: ITP-AUTOFILL-INTERACTION-2026-002
SOURCE_TASK_ID: ITP-AUTOFILL-INTERACTION-2026-001
審查日期：2026-10-04

## EVIDENCE_CHECK
已讀本輪 TASK、STATUS、handoff，針對 R1–R2 作文件設計審查，未執行產品測試或瀏覽器操作。
R1 已補同一次新建初始化帶入預選廠商聯絡資訊、逐欄来源及清除選擇的處理。R2 已補保留欄位提示與 A→B 確認步驟，並明列刻意清空、既有空白欄位兩項行為差異。既有已接受方向不重開。

## SCOPE_CHECK
本次核可設計提案交付，不代表程式已實作或競態已驗證。此次審查只修改 REVIEW.md，未操作產品資料及服務。

## DECISIONS_CHECK
- 保留逐欄來源、手動輸入保護、歷史原值及非阻斷提示的設計方向；提示不代表聯絡資訊已通過驗證。
- 預選第一家是既有行為，不應稱為已確認的業務政策。
- 僅判斷 system 不足以排除過時來源：未來實作若處理延遲資料，還須確認資料屬於目前選取廠商及當次表單，讀取最新欄位來源；不能僅因 onChange 就宣稱沒有競態。
- 清除廠商但保留聯絡值可作為暫存行為；此時不可用提示暗示值屬於目前所選廠商。實作時應隱藏帶入提示或明示為先前廠商資料，user 值照常保留。
- 本輪 PASS 不授權新增產品實作。既有紀錄空欄保留為空的差異已揭露，採用與否仍留待實作交辦確認。

## VERDICT
- [x] PASS
- [ ] REVISE
- [ ] HUMAN_REQUIRED

## REQUIRED_FIXES
無需另開設計補正輪次。封存前完成以下文件收尾：
1. STATUS 的 FILES_CHANGED 仍錯寫「無」；列 TASK.md、STATUS.md、REVIEW.md 的本輪更新，區分執行者重置與審查者填寫；產品程式修改另寫無。
2. 刪除 handoff「不會有競態視窗／不需要額外機制」的保證，改為上述來源匹配與最新狀態要求，標記未實作、未驗證。
3. 預選第一家改稱既有行為；補一句清除選擇時的來源提示處理。

## NEXT_STEP
Claude 完成三項文件收尾後封存本輪 PASS，不再重跑盤點或測試，不另開 003。回報設計已就緒、尚未實作；下一個產品修改需另立實作 TASK，承接本輪設計與明列的行為差異。
```


## 獨立審查補存：完整 TASK / STATUS 快照

原封存的 TASK / STATUS 段落為摘要，且引用日後會覆寫的根目錄文件。以下補存目前完整內容，保留上文不刪除；設計 PASS 結論不變。

### TASK.md 完整快照

````markdown
# TASK.md — NOI 填表互動方案 R1-R2 補正（設計文件層級，暫不改程式）

TASK_ID: ITP-AUTOFILL-INTERACTION-2026-002
SOURCE_TASK_ID: ITP-AUTOFILL-INTERACTION-2026-001
狀態：已交辦，待 Claude 執行。本批只補 R1-R2 兩項設計缺口，**保留**已接受的
方向（逐欄 system/user 來源追蹤、換廠商只覆蓋 system 狀態欄位、範圍限定 NOI），
不重新設計、不實作、不跑測試。

## REQUIRED_FIXES（逐字沿用審查原文）

### R1 — 補齊現有預選路徑
方案从「尚未選過廠商」開始，未明確處理本次主要問題：新建已預選第一家廠商時
聯絡資訊仍空白。補明新建初始化如何同時依該預選廠商帶入三欄與來源狀態；無廠商
資料時維持空白，主檔稍後載入不得覆蓋使用者輸入。不改預選政策。清除廠商時的
system/user 欄位處理亦列一行即可。

### R2 — 換廠商保留值必須可辨識
目前 A→B 範例靜默留下手改的 A 聯絡人，同時更新為 B 電話/Email；既有紀錄三欄都
視為 user 也會保留舊廠商資訊。保留值可以，但不能宣稱已消除錯配。補上換廠商後
明確、非阻斷提示，例如「已保留您原有的聯絡資訊，請確認仍適用於新廠商」，標示
哪些欄位保留；使用者可手動修正，不強制清空或新增保存門檻。A→B 範例包含此提示
及確認/修正步驟。
同時更正「刪空視為 user 與現有行為一致」：既有 prev.x || selected.x 會重新填
空值；保護刻意清空是本方案的新行為。既有空白欄位一律視為 user 也會改變改選
廠商時的既有填空行為，須明列為提案差異，不能稱完全不變。

## SCOPE
1. 補一段「新建初始化」的完整說明：預選的第一家廠商（既有政策不變）在表單
   初始化當下，如何同時把 contacts/phone/email 三欄位設成該廠商的資料並標記
   system 狀態；該廠商這幾個欄位若本身是空的，欄位維持空白（仍標 system）。
   說明「主檔資料若晚到（非同步載入）不得覆蓋使用者輸入」的保護規則——用同一個
   「寫入前檢查是否仍是 system 狀態」的既有原則即可涵蓋，不需要額外機制。
2. 補一行說明：使用者把 Contractor 清回「請選擇」空白選項時，三個聯絡欄位與其
   system/user 狀態如何處理（提案：不連動清空，維持原狀）。
3. 修正 A→B 範例：換廠商後，若有任何欄位因為 user 狀態而被保留，顯示一個
   明確、非阻斷的提示（例如「已保留您原有的聯絡資訊（電話），請確認仍適用於
   新廠商」），標明具體是哪個/哪些欄位被保留；使用者可自行修正，不強制清空、
   不新增保存前的阻擋門檻。範例流程補上看到這個提示、以及使用者確認或修正的
   步驟。
4. 撤回「刪空視為 user 與既有行為一致」的說法，改為明確列出這是本提案**相對
   於現狀的差異**：現狀的 `prev.x || selected.x` 在欄位目前是空字串時會被新
   廠商資料填入（因為空字串是 falsy）；本提案用狀態標記取代這個判斷後，一個
   被使用者刻意清空的欄位會維持空白、不再被換廠商動作填入——這是刻意的新保護
   行為，不是沿用現狀。
5. 同樣明確列出：既有紀錄的三個欄位在本提案下一律標記為 `user`（不論原本是否
   為空），所以編輯既有紀錄時若某欄位剛好是空的、換廠商也不會像現狀一樣被自動
   填入——這也是提案差異，需要明列，不能說「與現狀完全一致」。
6. STATUS 的 FILES_CHANGED 如實列出本輪實際修改的文件（不是只寫「未改產品
   程式碼」帶過）。

## ALLOWED_PATHS
- `docs/workflow/`（本輪補正文件；上一輪 archive 已於本次對話建立）
- `TASK.md` / `STATUS.md` / `REVIEW.md`
- 唯讀：`react-app/src/components/NOI/modals/NOIDetailModal.tsx`（確認現況，
  不修改）

## FORBIDDEN_PATHS
- 任何產品程式碼（本批設計文件層級補正，不實作）
- 任何資料庫 migration、種子腳本、正式或測試資料寫入
- 任何測試執行、隔離環境操作
- ITP 任何檔案（範圍仍限定 NOI）
- `TASK.md`（上一輪）／`DECISIONS.md`／`AGENTS.md`／任何既有 `docs/workflow/
  *-archive.md`（唯讀）

## ACCEPTANCE_CRITERIA
1. 新建初始化路徑（已預選第一家廠商）明確說明如何同步帶入三欄與狀態標記，
   不改變預選政策本身。
2. 清除廠商選擇時的欄位處理已說明（一行即可）。
3. A→B 範例包含換廠商後的明確提示、標示哪些欄位被保留，以及使用者確認/修正
   步驟；不宣稱已消除錯配風險。
4. 「刪空保護」與「既有紀錄一律視為 user」兩處都明確列為相對現狀的差異，不是
   無變化。
5. STATUS 的 FILES_CHANGED 如實列出本輪修改的文件清單。
6. 全程未修改任何產品程式碼、未建立任何資料、未執行任何測試或隔離環境。

## CLAUDE_PRECHECK
1. 已讀 `docs/workflow/ITP-AUTOFILL-INTERACTION-2026-001-archive.md`（含完整
   REVIEW 原文），理解 R1-R2 的具體要求，不得自行弱化。
2. 已讀 `NOIDetailModal.tsx` 的 `getInitialData`（80-102 行）與 Contractor
   `onChange`（296-314 行），確認「現狀 blank 欄位換廠商會被填入」這個對照
   基準屬實。

````

### STATUS.md 完整快照

````markdown
# STATUS.md — Claude 執行結果

TASK_ID: ITP-AUTOFILL-INTERACTION-2026-002
SOURCE_TASK_ID: ITP-AUTOFILL-INTERACTION-2026-001

## RESULT
- [x] DONE
- [ ] PARTIAL
- [ ] BLOCKED

R1-R2 已補正，獨立審查判定 **PASS**（見 `REVIEW.md`），封存前完成審查要求的
三項文件收尾，詳見下方「PASS 後文件收尾」與
`docs/workflow/ITP-AUTOFILL-INTERACTION-2026-002-handoff.md`。**本批（含收尾）
只處理文件，未修改任何產品程式碼、未建立任何資料、未執行任何測試或隔離環境。**
**設計已就緒，尚未實作**——下一個產品修改需另立實作 TASK，承接本輪設計與明列
的行為差異，不在本批自動展開。

## CLAUDE_PRECHECK 執行記錄
1. 已讀 `docs/workflow/ITP-AUTOFILL-INTERACTION-2026-001-archive.md`（含完整
   REVIEW 原文），理解 R1-R2 的具體要求。
2. 重新核對 `NOIDetailModal.tsx` 的 `getInitialData`（80-102 行）與 Contractor
   `onChange`（296-314 行），確認「現狀 blank 欄位換廠商會被填入（因為空字串
   是 falsy）」這個對照基準屬實，程式碼未變動。

## R1 修復內容（補齊已預選第一家廠商這條主要路徑）
- 補上新建初始化的完整說明：`getInitialData` 預選第一家廠商的同一個初始化
  動作，同步把 `contacts`／`phone`／`email` 設成該廠商的資料並標記 `system`
  狀態；廠商該欄位本身是空的就維持空白（仍標 `system`）。不改變預選第一家
  廠商這個既有**行為**本身（程式碼現狀，不是已確認的業務政策）。
- 「主檔資料晚到不得覆蓋使用者輸入」：PASS 後審查指出僅檢查 `system` 狀態
  不足以保證安全，已撤回「不需要額外機制」「不會有競態視窗」的保證（見下方
  「PASS 後文件收尾」）。
- 補上一行：清除 Contractor 選擇時，三個聯絡欄位與其狀態維持原樣、不連動
  清空（與既有程式碼對 `itpNo` 的清空處理不同，刻意不比照）。

## R2 修復內容（換廠商保留值必須可辨識，且明列差異）
- 新增換廠商後的明確、非阻斷提示：若有欄位因 `user` 狀態被保留，顯示具體
  列出哪個欄位被保留的提示文字（例如「已保留您原有的聯絡人（王小明），請確認
  是否仍適用於新廠商」），使用者可忽略或手動修正，不強制清空、不新增保存
  門檻。**不宣稱已消除錯配風險**——提示只是讓使用者知情，決定權在使用者。
- A→B 範例重寫為六步驟，加入換廠商後看到提示、以及使用者確認或修正的步驟。
- **撤回**上一輪「刪空視為 user 與現有行為一致」的說法，明確列為提案差異：
  現狀 `prev.x || selected.x` 會把刻意清空的欄位在換廠商時重新填入（空字串
  是 falsy）；本提案的狀態標記會保護刻意清空的欄位不被重新填入，這是刻意的
  新增保護行為。
- 補上另一個此前未講明的差異：既有紀錄的三個欄位一律標記 `user`（保護歷史
  資料），副作用是「既有紀錄裡本來空白的欄位，換廠商時也不會再像現狀一樣被
  自動填入」——明確列為差異點，不擅自改設計去遷就現狀，留待使用者決定是否
  可接受。

## PASS 後文件收尾（審查 PASS，REQUIRED_FIXES 的三項收尾，封存前完成）
1. 本檔 `FILES_CHANGED` 原本錯寫「無」，已改為如實列出本輪 `TASK.md`／
   `STATUS.md`／`REVIEW.md` 的控制文件更新，並區分 Claude（執行者）與獨立
   審查者各自負責的部分；產品程式碼修改另外明確寫「無」，不與控制文件混在
   一起用一個「無」帶過。
2. `docs/workflow/ITP-AUTOFILL-INTERACTION-2026-002-handoff.md` 已刪除「不會
   有競態視窗」「不需要額外機制」的保證，改為明確指出：僅檢查 `system`/`user`
   狀態不足以排除過時來源，真正需要的是同時確認延遲回應的資料是否仍對應
   「目前選取的廠商」與「當次表單」——這套「來源比對＋最新狀態確認」的機制
   **本輪只提出方向，尚未設計具體做法、也尚未實作或驗證**。
3. 「預選第一家廠商」在本檔與 handoff 文件裡，用詞已從「既有政策」統一改為
   「既有行為」（程式碼現狀，不是已確認的業務政策）。另外補上：使用者清除
   廠商選擇、但聯絡資訊欄位的值被保留下來時，若畫面上還留著「由廠商資料
   帶入」這類提示，**不得**繼續暗示這些值屬於「目前選取的廠商」（此時已經
   沒有選取任何廠商）——實作時應讓這個提示跟著 Contractor 是否有值一起
   判斷，清空廠商時隱藏提示或改標「先前廠商的資料」。

## FILES_CHANGED（控制文件，如實列出，區分執行者/審查者）
- `TASK.md`：本輪由 Claude（執行者）整份改寫為 ITP-AUTOFILL-INTERACTION-2026-002
  的交辦內容。
- `STATUS.md`：本輪由 Claude（執行者）撰寫並持續更新（含本次 PASS 後的文件
  收尾修正）。
- `REVIEW.md`：Claude（執行者）先重置為待審查的空白模板；`EVIDENCE_CHECK`／
  `SCOPE_CHECK`／`DECISIONS_CHECK`／`VERDICT`／`REQUIRED_FIXES`／`NEXT_STEP`
  的實際內容由獨立審查者（非 Claude）填寫，判定 PASS。
- **產品程式碼：無修改**（本批自始至終是設計文件層級的工作）。

## FILES_ADDED
- `docs/workflow/ITP-AUTOFILL-INTERACTION-2026-001-archive.md`（封存上一輪
  REVISE 原文）。
- `docs/workflow/ITP-AUTOFILL-INTERACTION-2026-002-handoff.md`（本輪補正
  設計文件，PASS 後依審查要求再做三項文件收尾修正，見下方）。

## FILES_DELETED
無。

## TESTS_RUN
無（本批為設計文件層級補正，未修改任何產品程式碼，依交辦不執行任何測試或
隔離環境）。

## RISKS / LIMITATIONS
- 本輪補正的仍是設計提案，未實作、未在瀏覽器驗證實際操作體驗。
- 「延遲資料須同時比對目前選取廠商與當次表單」這套機制只提出方向，具體做法
  （例如用什麼識別每次請求/每次表單）本輪未設計，留待實作批次處理。
- R2 補上的「既有紀錄空白欄位不再被自動填入」這個差異點，是否可接受是產品
  設計決策，本輪只負責講清楚差異本身，未代為判斷是否要調整這個設計細節。
- 沿用上一輪已記錄的限制：方案僅處理 NOI 的 Contractor→contacts/phone/email
  這一組欄位，未系統性盤點其他模組是否有類似情況。

## SAFETY_CHECK
- 未修改 `AGENTS.md`、`DECISIONS.md`、任何既有 `docs/workflow/*-archive.md`。
  `REVIEW.md` 當時已重置為待審查狀態、未自行填入任何審查結論；獨立審查現已
  判定 **PASS**（原文見 `REVIEW.md`，未由 Claude 修改或覆寫）。
- 未修改任何產品程式碼、未建立任何正式或測試資料、未新增任何必填規則。
- 未操作使用者環境或開發資料庫；本批無需隔離環境。
- 未使用 stash/reset/checkout；未還原協作者既有修改。
- 未 commit/push/部署。

````
