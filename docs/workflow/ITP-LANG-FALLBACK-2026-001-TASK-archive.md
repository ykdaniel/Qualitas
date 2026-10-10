# TASK.md — 中英擇一政策的下游相容（Insert After、Generate Checklist）

TASK_ID: ITP-LANG-FALLBACK-2026-001
SOURCE: GPT 審查 `ITP-REQUIRED-POLICY-2026-001`（PASS）後交辦，使用者轉交。中英擇一已是確認政策（`DECISIONS.md`），本批不重新決定是否支援中文。

## 前一任務狀態（保留）
- `ITP-REQUIRED-POLICY-2026-001`：PASS，已逐字封存（`docs/workflow/ITP-REQUIRED-POLICY-2026-001-{TASK,STATUS,REVIEW}-archive.md`），未提交、未部署。
- `ITP-CRITERIA-LAYOUT-2026-001`：PASS，未部署。`DOCX-PATH-GUARD-2026-001`：產品 PASS，未部署。`NOI-EXPORT-DOCX-2026-001`：REVISE。

## SCOPE
1. 兩個編輯器的 Insert After 選單標籤：英文優先；英文 `trim()` 後為空才用中文；項目編號保留。
2. Generate Checklist（`ITPModals.tsx`）：Activity 與每條 Criteria 各自採相同 fallback。保留既有 Criteria 合併順序與分隔、舊字串格式、無 Criteria 時以 Activity 代替的行為、`[項目編號]` 前綴。
3. `trim()` 只用於判斷有無內容；顯示與產生時使用原字串，不修改來源資料，不自動翻譯或填回另一語言。不新增 Standard 對應或其他轉換規則。

## ALLOWED_PATHS
- `react-app/src/utils/itpItemValidation.ts`（新增取值函式）、`react-app/tests-unit/`
- `react-app/src/components/ITP/ITPDetail.tsx`、`ITPAdvancedEditor.tsx`（僅 Insert After 標籤）
- `react-app/src/components/ITP/ITPModals.tsx`（僅 Generate Checklist 的取值）
- `backend/scripts/verification/`（本輪新測資種子）、`docs/workflow/`、`TASK.md`／`STATUS.md`／`REVIEW.md`

## FORBIDDEN
- Apply／Save 機制、版面、核准規則、必填驗證（已 PASS，不重跑其矩陣）。
- Standard 對應或其他轉換規則；資料回填、清洗、自動翻譯。
- 手機版；8240／3240、8198／3198、開發資料庫；commit／push／部署；stash／reset／checkout。

## ACCEPTANCE_CRITERIA
1. 先在隔離環境重現修改前的問題，再驗證修改後。
2. 測資：只中文、只英文、雙語、英文只有空白但中文有值；同一項目內中英混用的多條 Criteria；舊字串格式；無 Criteria。
3. 兩個入口的 Insert After 顯示正確。
4. 實際 Generate Checklist：核對建立回應，並獨立重讀新建的 Checklist，確認活動描述與 Criteria 真正保存、順序與內容正確；來源 ITP 不變。
5. 只跑相關前端檢查，保存完整輸出；STATUS／handoff 更新；REVIEW.md 待獨立審查。
