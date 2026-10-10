# TASK.md — ITP 基本資料 Subject 欄位加寬（補正輪 R2）

TASK_ID: ITP-SUBJECT-WIDTH-2026-001
ROUND: R2（補正 REVIEW R1 的 REQUIRED_FIXES）
SOURCE: GPT 審查 REVISE，經使用者轉交（2026-10-07）。第 1 輪 TASK／STATUS／REVIEW 已逐字封存為 `docs/workflow/ITP-SUBJECT-WIDTH-2026-001-R1-REVISE-{TASK,STATUS,REVIEW}-archive.md`。

## 只處理 R1
ITP 基本資料在兩欄斷點（≤1024px）時，Version 占滿最後一列，消除右側空格。三欄桌面維持 Updated Date／Due Date／Version 原排列；Subject 始終整列。

## 實作限制
- 使用 ITP 限定樣式（`react-app/src/components/ITP/ITP.module.css`，僅 ITP 匯入）的明確 opt-in class；不改共用 `formGrid`，不影響其他模組。
- 只改 `ITPModals.tsx` 中 Version 欄位的 class；其他欄位、Subject 輸入與資料行為不變。

## ALLOWED_PATHS
- `react-app/src/components/ITP/ITP.module.css`（新增 class）
- `react-app/src/components/ITP/ITPModals.tsx`（Version 欄位 class）
- `docs/workflow/`、`TASK.md`／`STATUS.md`／`REVIEW.md`

## FORBIDDEN
- 共用 `FormShell.module.css` 的 `formGrid`；其他模組；其他 UI 改善；手機版。
- 8240／3240、8198／3198；commit／push／部署；stash／reset／checkout。

## ACCEPTANCE_CRITERIA
1. 1024 桌面視窗，新增與編輯：Subject、Version 各占整列，無溢出。
2. 1366 三欄排列快速回歸。
3. 相關前端檢查（tsc、build、變更檔 lint）並留存截圖；不重跑已接受的保存／Cancel 與整套單元測試。
4. REVIEW.md 待獨立審查。
