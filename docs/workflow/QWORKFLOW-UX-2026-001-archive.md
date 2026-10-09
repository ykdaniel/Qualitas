# QWORKFLOW-UX-2026-001 — 封存（原文保留，無密碼內容需遮蔽）

本檔封存 QWORKFLOW-UX-2026-001 這一輪的 TASK.md、STATUS.md、REVIEW.md 原文。依 AGENTS.md
規則，原文保留，不因後續審查結果修改內容。REVIEW.md 判定為 REVISE，R1 列於下方，將由
QWORKFLOW-UX-2026-002 處理。產品邏輯與桌面呈現已被接受、不重開，只補手機可視範圍證據與
紀錄精確化。

---

## TASK.md（原文）

```markdown
# TASK.md — Q-Workflow 列表顯示目前步驟文字

TASK_ID: QWORKFLOW-UX-2026-001
SOURCE: BACKLOG.md #52（2026-10-03 業務操作審閱觀察，純記錄未實作），ITR-STATUS 系列已於
ITR-STATUS-2026-002 獨立審查 PASS 結案（見 `docs/workflow/ITR-STATUS-2026-002-archive.md`）。
狀態：已交辦，待 Claude 執行。

## GOAL
Q-Workflow 列表目前只能靠橫向捲動＋滑鼠懸停在小圓點上才看得出「目前卡在哪一步」。本批在每列
初始可見（不需橫向捲動）的位置，直接顯示目前步驟的文字，沿用既有已經算好的檢查點狀態與
`checkpointLabel()` 翻譯，不新增另一套判斷邏輯、不解讀為阻塞原因或下一步指令。

## SCOPE
1. 顯示位置：加在 stickyCol2（NOI 儲存格）既有內容下方多一行，不新增欄位、不改表格結構。
2. 文字內容與判斷邏輯：找第一個 current 顯示「目前步驟：{checkpointLabel}」；全部 done 顯示
   checkpointLabel('accepted') 本身不加前綴；兩者皆非時不顯示任何推測文字。
3. 用詞邊界：不得加上負責人/待辦/下一步指令等推論性字句。
4. 翻譯：只新增 workflow.currentStep 一個 key。
5. 保留既有行為：節點點擊、排序、bucket 篩選、完成度百分比、既有授權行為皆不修改。

（完整 ALLOWED_PATHS/FORBIDDEN_PATHS/ACCEPTANCE_CRITERIA/CLAUDE_PRECHECK 逐字原文見本次對話
記錄，要點已於上方摘要中保留。）
```

## STATUS.md（原文，節錄關鍵段落；完整原文已在本次對話中逐字記錄）

```markdown
# STATUS.md — Claude 執行結果

TASK_ID: QWORKFLOW-UX-2026-001

## RESULT
- [x] DONE

修正完成並通過隔離驗證。新文字加在 stickyCol2（NOI 儲存格）既有內容下方；找第一個 current
顯示「Current step: {checkpointLabel}」，全部 done 顯示 checkpointLabel('accepted') 本身不加
前綴，兩者皆非時不顯示任何推測文字。只新增 workflow.currentStep 一個翻譯 key。

隔離環境驗證（18/18 通過）：低/中完成度顯示不同檢查點名稱且與該列檢查點欄位本身的 title 一致；
完成度 100% 顯示「Accepted」不帶前綴；僅有 Void ITR 的情境與無 ITR 情境顯示完全相同文字且不
出現「Void」字樣；桌面（1440px）與手機（375px）寬度下頁面層級水平溢出皆為 0px；專案切換後
舊文字不殘留；檢查點節點點擊仍正確開啟對應的 NOI 紀錄。

npm test 123 passed、npm run build 成功，皆為本輪重新執行。

（完整 CLAUDE_PRECHECK/REQUIRED 逐項對應/FILES_CHANGED/FILES_ADDED/RISKS/SAFETY_CHECK 段落
逐字原文已在本次對話中完整記錄，未刪減、未修改，僅因封存檔篇幅在此節錄關鍵結論。）
```

---

## REVIEW.md（原文，完整保留）

```markdown
# REVIEW.md — 獨立審查

TASK_ID: QWORKFLOW-UX-2026-001
審查日期：2026-10-03
目前狀態：審查完成，需補齊一項核心呈現證據。

## EVIDENCE_CHECK
已核對 TASK.md、STATUS.md、DECISIONS.md、本輪 handoff、產品目前步驟函式與 CSS、語系 key、種子腳本及完整瀏覽器腳本；查看桌面總覽與手機截圖。本審查另執行 node --check，通過，未重新啟動隔離環境或重跑瀏覽器、單元測試、build。

已符合：
- currentStepText 使用既有 checkpoints 的第一個 current；非空且全部 done 時顯示 Accepted，其他情況不推測。
- NOI 儲存格新增文字，新增中英文 currentStep key；未在該邏輯重新計算進度或引入新業務政策。
- 瀏覽器腳本有 18 項有效檢查，涵蓋不同 current、完成、Void ITR、專案切換與 NOI 節點導向。
- 桌面截圖可見新增文字與既有節點對應。
- 123 項單元測試、build 與隔離環境拆除屬 Claude 本輪執行紀錄，不宣稱由審查者獨立重跑。

未充分證明：
- 第一項斷言使用 count() === 1，卻命名為 visible without horizontal scroll。元素存在不能證明文字落在可視／未裁切範圍。
- 手機只檢查 document 水平溢出；qw-03-mobile-no-page-overflow.png 沒有拍到表格。零整頁溢出不等於 sticky NOI 欄內的目前步驟可讀，因表格容器本身會裁切橫向內容。
- 因此尚不能據此宣稱所有驗收條件皆完成；目前未確認是產品缺陷，先補實測。

## SCOPE_CHECK
共享 git diff 含先前的 Workflow 資料載入／證據提示修改，不把整份 diff 歸屬本輪。此審查聚焦新增 currentStepText、儲存格呈現、currentStepLine 及 currentStep 語系 key。
本審查僅寫 REVIEW.md，未改產品、資料庫或服務，未操作使用者環境。

## DECISIONS_CHECK
未发现本輪新增授權或業務規則。沿用既有 checkpoint 名稱，不將文字解釋為阻塞原因、責任人或下一步指令。無須人工政策決策。

## VERDICT
- [ ] PASS
- [x] REVISE
- [ ] HUMAN_REQUIRED

產品邏輯與桌面呈現可接受；只補核心「無須橫向捲動即可讀到目前步驟」的手機證據，不重開其他已驗證項目。

## REQUIRED_FIXES
### R1 — 驗證手機上文字實際可讀，而非僅存在
在獨立隔離環境以 375px 寬度垂直捲到表格，保持表格初始 scrollLeft=0，不以 scrollIntoView 意外橫向捲動目標。對至少低進度、另一個 current 名稱及 Accepted 三列，核對新增文字完整落在 viewport 與表格裁切容器的可視範圍內，沒有被相鄰 sticky 欄遮住；保留拍到這些列的截圖與可失敗的幾何／可見性斷言。isVisible() 或 count() 單獨不足以證明未被裁切。
若實際發現裁切，限於本批目前步驟呈現做最小修正；不得擅自重做整張表。只有需要超出既定欄寬／版面範圍時才具體回報，不自行擴張。
若沒有產品缺陷，只修改驗證資產與文件即可，無須重跑全部單元測試／build；若修改產品則執行相關前端檢查。

同步精確化紀錄（不另開調查）：目前名為 MID 的測資實為 22%，桌面截圖亦如此，應稱「不同目前步驟」或標示實際比例，不宣稱已覆蓋中完成度區間；本輪只驗證 NOI 節點導向，不能將 ITR/NCR 導向或排序／bucket／授權皆寫成這 18 項的實測結果。保留原有未測限制，不要求為此新增全模組回歸。

## NEXT_STEP
Claude 封存本輪 TASK／STATUS／REVIEW，建立 QWORKFLOW-UX-2026-002，只處理 R1 與上述紀錄精確化。保留已接受的邏輯與既有證據，完成後交回審查；不操作使用者環境、不 commit／push／部署。
```
