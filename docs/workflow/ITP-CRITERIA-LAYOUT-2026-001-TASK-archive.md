# TASK.md — ITP 檢驗項目編輯面板桌面排列改善

TASK_ID: ITP-CRITERIA-LAYOUT-2026-001
SOURCE: 使用者交辦（附截圖：面板寬度足夠，但 Criteria 中英文上下排列造成過多捲動）。

## 前一任務狀態（保留，不視為結案）
- `DOCX-PATH-GUARD-2026-001`：產品 PASS、**未部署**，見 `docs/workflow/DOCX-PATH-GUARD-2026-001-OPEN-2026-10-07.md`。
- `NOI-EXPORT-DOCX-2026-001`：**REVISE**，見 `docs/workflow/NOI-EXPORT-DOCX-2026-001-OPEN-2026-10-07.md`。

## SCOPE
1. 每條 Criteria 改為同列「左英文、右中文」，保留 EN／中文標籤、項目編號、刪除入口，視覺上表達兩欄屬同一條 Criteria。
2. Activity／Standard 維持目前左右分欄、各自英文在上中文在下。
3. Phase 在桌面縮為半列；新增模式有 Insert After 時兩者並排。
4. 保留多行輸入、垂直調整高度、固定標題與 Apply／Cancel；不以縮小字體或輸入框來壓縮。

兩個入口同步：`ITPDetail.tsx`（`/itp/:id` 的編輯面板）與 `ITPAdvancedEditor.tsx`（清單頁彈窗內的面板）。

## ALLOWED_PATHS
- `react-app/src/components/ITP/ITPDetail.tsx`、`react-app/src/components/ITP/ITPAdvancedEditor.tsx`（僅編輯面板的版面）
- `react-app/tests-browser/`（本輪隔離啟動器）
- `docs/workflow/`（證據、handoff）
- `TASK.md`／`STATUS.md`／`REVIEW.md`

## FORBIDDEN
- 資料結構、保存、複製、排序、核准邏輯。
- Subject、日期名稱、Record 引導、翻譯整理。
- 英文必填（與 BACKLOG #36 衝突，待使用者決策）——不改、不宣稱已核准。
- 手機版重設計或驗收（延期）。
- 使用者的 8240／3240、8198／3198 環境；開發資料庫。
- stash／reset／checkout；commit／push／部署。

## ACCEPTANCE_CRITERIA
1. 含長中英文、至少三條 Criteria 的資料，在一般桌面與寬桌面檢視：中英文可對照，編號與刪除不錯位，面板無新增水平溢出。
2. 新增與編輯入口都核對排列。
3. 修改其中一條 Criteria 的中英文 → Apply → 主表單 Save → 重新開啟：文字與換行完全一致，其他條目不變。
4. Cancel 不套用修改；底部按鈕不遮住最後一個欄位。
5. 只執行與變更相關的前端檢查；保存本輪截圖與實際結果。
6. STATUS／handoff 更新；REVIEW.md 留待獨立審查。
