# STATUS.md — Claude 執行結果

TASK_ID: ITP-CRITERIA-LAYOUT-2026-001

## RESULT
- [x] DONE（待獨立審查；本文件不填 PASS）
- [ ] PARTIAL
- [ ] BLOCKED

## 前一任務狀態（保留）
- `DOCX-PATH-GUARD-2026-001`：產品 PASS、未部署；控制文件逐字保存為 `docs/workflow/DOCX-PATH-GUARD-2026-001-{TASK,STATUS,REVIEW}-final-2026-10-07.md`，狀態說明 `DOCX-PATH-GUARD-2026-001-OPEN-2026-10-07.md`。
- `NOI-EXPORT-DOCX-2026-001`：REVISE，未結案。

## 實際變更（未提交的工作樹變更）
`react-app/src/components/ITP/ITPDetail.tsx` 與 `react-app/src/components/ITP/ITPAdvancedEditor.tsx` 同步，各一處 Phase 外框、一處 Criteria 列：
1. **Phase 外框**：`grid grid-cols-1 ${isNew ? 'sm:grid-cols-2' : ''}` → 固定 `grid grid-cols-1 sm:grid-cols-2`。編輯模式 Phase 只占左半；新增模式 Phase 與 Insert After 並排（行為與先前相同）。
2. **每條 Criteria**：外層加淡框（`p-2 rounded-lg border border-slate-200 bg-slate-50/60`）與 `data-criteria-row={idx}`；內層由上下堆疊改為 `grid grid-cols-1 sm:grid-cols-2 gap-3`：左 EN、右中文，各自保留 EN／中文標籤、`rows={2}`、`resize-y`。編號（多於一條時顯示）與刪除鈕位置不變。窄於 `sm`（640px）時退回上下堆疊。
3. Activity／Standard、資料結構、保存、複製、排序、核准邏輯、英文必填檢查：**未改**。
4. 新增 `react-app/tests-browser/itp-criteria-layout-vite-launcher.mjs`（本輪隔離啟動器，port 3260→8260）。

差異量：`ITPDetail.tsx` +17／−12，`ITPAdvancedEditor.tsx` +12／−7。

**過程中的錯誤（已修正）**：以 Python 改寫時，`ITPAdvancedEditor.tsx` 原本的 CRLF 換行被轉成 LF，`git diff` 一度顯示 1359 行變動。已逐位元組還原為 CRLF（原檔 677 行全為 CRLF），差異回到 19 行；之後才執行下列檢查。

## 前端檢查（完整輸出含退出碼與檔案雜湊，`docs/workflow/ITP-CRITERIA-LAYOUT-2026-001-evidence/`）
| 檢查 | 檔案 | 結果 |
|---|---|---|
| `npx tsc --noEmit -p tsconfig.json` | `tsc.txt` | exit 0，無錯誤 |
| `npm run build` | `build.txt` | exit 0 |
| `npm test`（單元測試） | `unit-test.txt` | 129 pass／0 fail，exit 0 |
| `npx eslint` 兩個變更檔 | `eslint-changed-files.txt` | **限定兩個變更檔：0 errors、11 warnings、exit 0**（有警告，未清除；不代表全專案 lint 通過） |

## 瀏覽器驗收（實際結果見 `browser-results.md`，截圖 `01`–`09`）
- 隔離堆疊 8260／3260（新開；未用 8240／3240、8198／3198）；種子資料 B1 有 3 條 Criteria，另於驗收中寫入 3 行的長中英文。
- **寬桌面 1920**（Chrome）與**一般桌面 1366×768**（內建瀏覽器模擬；Chrome 視窗無法縮小）：英文在左、中文在右且同高；編號與刪除在該條框內；面板 `scrollWidth − clientWidth = 0`；Phase 編輯模式占 0.49。
- **入口**：`/itp/:id` 編輯 B1、`/itp/:id` 新增、清單頁 Inspection Plan 編輯 B1、清單頁新增，四個入口皆核對；新增模式 Phase 與 Insert After 同列。
- **Apply → Save Document → 重新載入 → 重開 B1**：第 2 條 EN／中文逐字相同（各含 2 個換行）；第 1、3 條不變。
- **Cancel**：觸發既有 Unsaved Changes 對話框，選 Leave 後未套用，重開後 3 條與原值逐字相同。
- **底部按鈕**：捲到最底，最後欄位（HSE）底邊 718 < 按鈕列頂邊 777，未被遮住。

## 限制／未做
- 手機與窄螢幕延期，未驗收（`sm` 以下為上下堆疊）。
- `ITPAdvancedEditor` 只在 1366 驗排列；往返儲存只在 `ITPDetail` 入口做（本批未改保存邏輯）。
- 長文字在 `rows={2}` 的框內需捲動或手動拉高；本批依指示保留多行與垂直調整，未改成自動長高。
- 截圖與量測輸出只在本輪證據目錄；量測是頁面內 JavaScript，非自動化測試檔，無法直接重跑。
- 隔離資料庫中 B1 第 2 條已被改為測試文字。
- 未提交、推送、部署；英文必填（#36 衝突）未動。

## 仍在運作的環境
- 本輪新開：8260／3260（run 目錄 `qualitas-manual-o0cbz3ml`）——**保留**，等審查完畢再決定是否 `down`。
- 既有保留：8240／3240，未觸碰。
