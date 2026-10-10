# TASK.md — ITP 檢驗項目 Activity／Standard 中英擇一必填

TASK_ID: ITP-REQUIRED-POLICY-2026-001
SOURCE: 使用者確認的必填政策，經 GPT 轉交（2026-10-07）。決策已記入 `DECISIONS.md`「ITP 檢驗項目 Activity／Standard 中英擇一必填」，並更新 BACKLOG #36。

## 前一任務狀態（保留）
- `ITP-CRITERIA-LAYOUT-2026-001`：PASS，已封存（`docs/workflow/ITP-CRITERIA-LAYOUT-2026-001-{TASK,STATUS,REVIEW}-archive.md`），未提交、未部署。
- `DOCX-PATH-GUARD-2026-001`：產品 PASS，未部署。`NOI-EXPORT-DOCX-2026-001`：REVISE。

## 政策
- Activity：英文或中文至少填一個；Standard：英文或中文至少填一個；另一語言選填。
- 以 `trim()` 後內容判斷；只有空白字元不算已填。
- 不要求翻譯、不自動複製、不擴大其他欄位必填；歷史資料不回填、不清洗。

## SCOPE
1. `ITPDetail.tsx`／`ITPAdvancedEditor.tsx` 新增與編輯的 Apply 驗證改為上述政策（取代目前的英文必填）。被阻擋時保留輸入。
2. 欄位組標示改為「英文或中文至少填一項」，不使用會暗示英文必填或雙語必填的星號。
3. 核對有無其他相衝突的驗證（前端、後端），列出結果；非驗證的下游影響只記錄、不在本批修改。

## ALLOWED_PATHS
- `react-app/src/components/ITP/ITPDetail.tsx`、`ITPAdvancedEditor.tsx`（驗證與標示）
- `react-app/src/utils/`（新增共用判斷函式）、`react-app/tests-unit/`（其單元測試）
- `react-app/src/context/LanguageContext.tsx`（新增標示與提示文字鍵）
- `react-app/tests-browser/`（本輪隔離啟動器）
- `DECISIONS.md`、`BACKLOG.md`（#36）、`docs/workflow/`、`TASK.md`／`STATUS.md`／`REVIEW.md`

## FORBIDDEN
- Subject 加寬或其他 UI 改善；手機版。
- 資料結構、保存、排序、核准邏輯；歷史資料回填或清洗；自動翻譯／複製。
- 8240／3240、8198／3198、開發資料庫；stash／reset／checkout；commit／push／部署。

## ACCEPTANCE_CRITERIA
1. 兩個入口（`/itp/:id` 面板、清單頁 `ITPAdvancedEditor`），新增與編輯：只填英文、只填中文、兩者皆填 → 可 Apply；兩者皆空、只有空白字元 → 阻擋並保留輸入。
2. 只填中文的項目 Apply → 主表單 Save → 重開，內容完整保留。
3. 標示不再暗示英文必填或雙語必填。
4. 只跑與變更相關的前端檢查（含新單元測試），保存完整輸出與退出碼；不重跑不相關的版面驗收。
5. STATUS／handoff 更新；REVIEW.md 留待獨立審查。
