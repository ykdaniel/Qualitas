# STATUS.md — Claude 執行結果

TASK_ID: ITP-SUBJECT-WIDTH-2026-001
ROUND: R2（補正 REVIEW R1）

## RESULT
- [x] DONE（待獨立審查；本文件不填 PASS）
- [ ] PARTIAL
- [ ] BLOCKED

## 第 1 輪
審查 REVISE（R1：≤1024px 兩欄時 Version 旁空格）。第 1 輪 TASK／STATUS／REVIEW 已逐字封存為 `docs/workflow/ITP-SUBJECT-WIDTH-2026-001-R1-REVISE-{TASK,STATUS,REVIEW}-archive.md`（雜湊與封存時根目錄檔一致）。第 1 輪的保存／Cancel 驗收已被接受，本輪未重跑。

## 本輪變更（未提交的工作樹變更）
1. `react-app/src/components/ITP/ITP.module.css`（ITP 專用樣式，僅 `ITP.tsx`、`ITPModals.tsx`、`ITPPrintTemplate.tsx` 匯入）：新增 opt-in class `.versionFullRowWhenTwoColumns`，只在 `@media (max-width: 1024px)` 內設 `grid-column: 1 / -1`。另補上檔尾原本缺少的換行。
2. `react-app/src/components/ITP/ITPModals.tsx`：只有 Version 欄位的容器加上這個 class（`formGroup` 保留）。
- 未改：共用 `FormShell.module.css` 的 `formGrid`（第 1 輪新增的 `.formGroupSpan2` 維持不變）、其他模組、Subject 與其他欄位。

## 前端檢查（`docs/workflow/ITP-SUBJECT-WIDTH-2026-001-R2-evidence/`，完整輸出含退出碼與 2 個變更檔雜湊）— 實測
| 檢查 | 結果 |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npm run build` | exit 0 |
| `npx eslint src/components/ITP/ITPModals.tsx` | 0 errors、0 warnings、exit 0（第 1 輪的 `'styles' is defined but never used` 消失，因本輪開始使用該匯入；CSS 不在 eslint 範圍） |
- 依指示未重跑整套單元測試（本輪未改任何 TS 邏輯）。

## 瀏覽器驗收（隔離 8280／3280，使用前核對 run `f9d0b096`）— 實測
| 視埠 | 入口 | 排列（依列） | Subject 整列 | Version 整列 | 溢出（內容區／整頁） |
|---|---|---|---|---|---|
| 1024×768 | 編輯 | Ref＋Contractor／Subject 886／Updated Date＋Due Date／Version 886 | 是 | 是 | 0／0 |
| 1024×768 | 新增 | 同上 | 是 | 是 | 0／0 |
| 1366×768 | 新增（快速回歸） | Ref 397＋Contractor 813／Subject 1228／Updated Date、Due Date、Version 各 397 | 是 | 否（三欄同列，符合要求） | 0／0 |
- 截圖：`01`（1024 編輯）、`02`（1024 新增，捲到 Version）、`03`（1366 新增）。
- 新增與編輯皆以 Cancel 關閉，未建立或修改紀錄（清單仍 1 筆）。

## 未測
- 1366 只回歸新增畫面（編輯畫面同一元件同一 class，未另量）；1920 未重測（本輪 CSS 只在 ≤1024px 生效）。
- 手機延期；中文介面；鍵盤 Tab 順序。

## 未做
- 未提交、推送、部署。

## 仍在運作的環境
- 8280／3280（run `f9d0b096`）保留待審。8240／3240、8198／3198 未觸碰。
