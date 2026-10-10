# TASK.md — ITP 基本資料 Subject 欄位加寬

TASK_ID: ITP-SUBJECT-WIDTH-2026-001
SOURCE: 使用者經 GPT 轉交（2026-10-07）。

## 前一任務狀態（保留）
- `ITP-LANG-FALLBACK-2026-001`：PASS，已逐字封存（`docs/workflow/ITP-LANG-FALLBACK-2026-001-{TASK,STATUS,REVIEW}-archive.md`，本輪開始前再次核對雜湊一致），8270／3270 已拆除。未提交、未部署。
- `ITP-REQUIRED-POLICY-2026-001`、`ITP-CRITERIA-LAYOUT-2026-001`：PASS，未部署。`DOCX-PATH-GUARD-2026-001`：產品 PASS，未部署。`NOI-EXPORT-DOCX-2026-001`：REVISE。

## SCOPE
1. ITP → General Information 的 Subject 獨立占一整列，不再與 Reference no.、Contractor 三等分。
2. 保留原本的單行輸入元件與資料行為；不新增換行、必填、字數限制或自動帶入。
3. 其他欄位合理補位，避免無意義的空欄。
4. 新增與編輯入口共用 `ITPModals.tsx` 的 `ITPDetailModal`，只改共用位置。

## ALLOWED_PATHS
- `react-app/src/components/ITP/ITPModals.tsx`（僅 General Information 欄位排列）
- `react-app/src/components/Shared/FormShell.module.css`（僅新增 class，不改既有 class）
- `react-app/tests-browser/`（本輪隔離啟動器）、`docs/workflow/`、`TASK.md`／`STATUS.md`／`REVIEW.md`

## FORBIDDEN
- Inspection Plan、Apply／Save 語意、語言標籤、Record 提示、翻譯、手機版、整個表單重設計。
- 8240／3240、8198／3198、開發資料庫；stash／reset／checkout；commit／push／部署。

## ACCEPTANCE_CRITERIA
1. 一般桌面與寬桌面：真實長度主旨，Subject 占滿內容列、較易閱讀，無新增水平溢出。
2. 新增與編輯畫面都核對。
3. 隔離環境修改長主旨 → 保存 → 重新開啟，完整文字保留；Cancel 不保存修改。
4. 只跑相關前端檢查；保存截圖與結果；不重跑已接受的 Criteria／語言 fallback 驗收。
5. STATUS／handoff 區分實測與未測；REVIEW.md 待獨立審查。
