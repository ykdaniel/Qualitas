# STATUS.md — Claude 執行結果

TASK_ID: ITP-LANG-FALLBACK-2026-001

## RESULT
- [x] DONE（待獨立審查；本文件不填 PASS）
- [ ] PARTIAL
- [ ] BLOCKED

## 前一任務（已收尾）
- `ITP-REQUIRED-POLICY-2026-001`：PASS。依審查更正 Generate Checklist 描述（STATUS、handoff、browser-results 三處：「仍有 `[項目編號]`、缺中文活動描述，中文 Criteria 未帶入；讀碼確認，未實測」），之後逐字封存為 `docs/workflow/ITP-REQUIRED-POLICY-2026-001-{TASK,STATUS,REVIEW}-archive.md`（雜湊與封存時根目錄檔一致）。
- 其餘：`ITP-CRITERIA-LAYOUT-2026-001` PASS 未部署；`DOCX-PATH-GUARD-2026-001` 產品 PASS 未部署；`NOI-EXPORT-DOCX-2026-001` REVISE。

## 實際變更（未提交的工作樹變更）
1. `react-app/src/utils/itpItemValidation.ts` 新增 `preferEnglishText()`：英文 `trim()` 後有內容回傳**英文原字串**；否則中文有內容回傳**中文原字串**；兩者皆無內容時回傳原英文值（維持既有輸出）。舊字串格式直接回傳。不修改傳入物件。
2. `ITPDetail.tsx`、`ITPAdvancedEditor.tsx`：Insert After 選項文字由 `item.activity.en` 改為 `preferEnglishText(item.activity)`；`{item.id} - ` 前綴與選項值不變。
3. `ITPModals.tsx` Generate Checklist：`activityText` 與每條 Criteria（物件格式）改用 `preferEnglishText`；`.filter(Boolean).join('; ')`、舊字串 Criteria 分支、`criteriaText || activityText`、`[${item.id}] ` 前綴皆未改。
4. `tests-unit/itpItemValidation.test.ts` 新增 3 項；新增種子 `backend/scripts/verification/seed_itp_lang_fallback_review.py`（只用於隔離堆疊）。
- 未改：Apply／Save、版面、核准、必填驗證；無 Standard 對應或其他轉換；不回填、不翻譯。
- 換行字元：`ITPAdvancedEditor.tsx`（CRLF）逐位元組依原檔修改，CR 數等於行數；其他檔為 LF。

## 前端檢查（`docs/workflow/ITP-LANG-FALLBACK-2026-001-evidence/`，完整輸出含退出碼與 5 個變更檔雜湊）
| 檢查 | 結果 |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npm run build` | exit 0 |
| `npm test` | 136 pass／0 fail（含新增 3 項），exit 0 |
| `npx eslint` 限定 5 個變更檔 | **0 errors、12 warnings、exit 0**（檔案組合較上輪多了 `ITPModals.tsx`；新增的那條是該檔第 18 行既有的 `'styles' is defined but never used`，非本次修改行。警告未清除，不代表全專案 lint 通過） |

## 隔離環境重現與驗證（詳見 `browser-results.md`）
- 沿用本輪專用 8270／3270（使用前核對 run `fc3f0a50`）；新測資 `lang-itp-1` 與新帳號 `lang_tester`，未使用前次矩陣資料。
- **修改前重現（實測）**：兩個入口的 Insert After 顯示「A1 -」「A4 -」「A6 -」；Generate Checklist 建立的 `QTS-SSE-CHECKLIST-000001` 中 A1／A6 為 `"[A1] "`、`"[A6] "` 且 Criteria 為空，A4 為 `"[A4]    "`、Criteria `"Mixed EN 1;   ; Mixed EN 4 only"`（只中文那條遺失、英文空白那條保留）。
- **修改後**：
  - Insert After 兩個入口：A1、A4、A6 顯示中文描述；A2、A3、A5 不變；選項值不變。
  - Generate Checklist 建立 `QTS-SSE-CHECKLIST-000002`；以新的 GET 獨立重讀，6 項逐項與預期相符：只中文、只英文、雙語、英文只有空白但中文有值、四條中英混用 Criteria（原順序）、舊字串格式、無 Criteria（以 Activity 代替，現為中文）。
  - 來源 ITP `detail_data` 雜湊產生前後相同（`e9565596…08fd20b1`），`rev` 不變。修改前產生的 000001 未被回填。
- 未重跑已接受的必填矩陣或版面驗收。

## 限制／未做
- 原生下拉展開無法截圖，Insert After 以頁內讀取的選項文字為證據。
- Generate Checklist 只在清單頁入口觸發（它只存在於 `ITPModals`）。
- 隔離資料庫新增兩份 Checklist 與 `lang-itp-1` 測資（僅隔離環境）。
- 手機延期。未提交、推送、部署。

## 仍在運作的環境
- 8270／3270（run `fc3f0a50`）保留待審。8240／3240、8198／3198 未觸碰。
