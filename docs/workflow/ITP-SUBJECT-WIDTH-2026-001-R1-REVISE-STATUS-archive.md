# STATUS.md — Claude 執行結果

TASK_ID: ITP-SUBJECT-WIDTH-2026-001

## RESULT
- [x] DONE（待獨立審查；本文件不填 PASS）
- [ ] PARTIAL
- [ ] BLOCKED

## 前一任務狀態（保留）
- `ITP-LANG-FALLBACK-2026-001`：PASS，封存檔於本輪開始前再次核對與根目錄一致；8270／3270 已拆除。
- 其他 ITP 批次 PASS 未部署；`DOCX-PATH-GUARD-2026-001` 產品 PASS 未部署；`NOI-EXPORT-DOCX-2026-001` REVISE。

## 實際變更（未提交的工作樹變更）
1. `react-app/src/components/ITP/ITPModals.tsx`（新增與編輯共用的 `ITPDetailModal`，只此一處）General Information：
   - Subject 區塊移到 Contractor 之後，class 改為 `formGroup formGroupFull`（既有共用 class，占整列）；輸入元件、`value`、`onChange` 不變。
   - Contractor 區塊加上 `formGroupSpan2`，桌面三欄時占兩欄，讓第 1 列 Reference no.＋Contractor 排滿。
   - 結果（三欄時）：① Reference no.＋Contractor ② Subject ③ Submission Date、Due Date、Rev。
2. `react-app/src/components/Shared/FormShell.module.css`：只新增 `.formGroupSpan2 { grid-column: span 2; }`，並在既有 `max-width: 1024px` 斷點設為 `auto`；既有 class 未改。
3. 新增 `react-app/tests-browser/itp-subject-width-vite-launcher.mjs`（8280／3280）。
- 未改：Inspection Plan、Apply／Save、標籤文字、Record、翻譯；未新增換行、必填、字數限制或自動帶入。

## 前端檢查（`docs/workflow/ITP-SUBJECT-WIDTH-2026-001-evidence/`，完整輸出含退出碼與 2 個變更檔雜湊）— 實測
| 檢查 | 結果 |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npm run build` | exit 0 |
| `npm test` | 136 pass／0 fail，exit 0 |
| `npx eslint src/components/ITP/ITPModals.tsx` | **0 errors、1 warning、exit 0**（第 18 行既有 `'styles' is defined but never used`，非本次修改；CSS 不在 eslint 範圍） |

## 瀏覽器驗收（隔離 8280／3280；詳見 `browser-results.md`，截圖 `01`–`05`）
**實測**
- 一般桌面 1366×768、寬桌面 1920×1080，編輯與新增兩個畫面：Subject 單獨一列，輸入框寬度等於內容列（比例 1.000；1366 為 1243／1228px，1920 為 1797px）；其餘 5 欄排成兩列無空格；內容區與整頁水平溢出皆 0。
- 206 字元真實長主旨：1920 可一行完整顯示；1366 仍需在單行框內捲動（文字 1434px、框 1241px），但可見寬度由原約 402px 增為 1241px。
- 保存往返：Save → 重新載入 → API `description` 與重開輸入值皆逐字相同（206 字元）。
- Cancel：既有未儲存提示 → Leave，API 與重開值仍為原主旨。
- 1024×768（量測）：兩欄斷點下 Version 單獨一列、旁邊空一格——**本批新產生的空格**（改動前 6 欄在兩欄時剛好排滿）。未修正，待審查決定。

**未測**
- 手機（延期）；中文介面排列；鍵盤 Tab 順序（DOM 順序已改為 Reference no.→Contractor→Subject→日期→Rev，未用鍵盤實際驗證）。
- 保存成功的 toast 本次未擷取到（以重新載入後的 API 與畫面值為準）。

## 未做
- 未提交、推送、部署。未重跑已接受的 Criteria／語言 fallback 驗收。

## 仍在運作的環境
- 本輪新開 8280／3280（run `f9d0b096`）保留待審。8240／3240、8198／3198 未觸碰。
