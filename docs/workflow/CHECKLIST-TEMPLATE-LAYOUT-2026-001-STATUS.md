# STATUS — CHECKLIST-TEMPLATE-LAYOUT-2026-001

TASK_ID: CHECKLIST-TEMPLATE-LAYOUT-2026-001
基準：worktree `nostalgic-mestorf-ee1943`，分支 `claude/brave-lamport-d2e0fe`，基準 33b8a1ce（內容等於 5bba6665）。協調中心確認正式站 0766d7d3 未改 Checklist.tsx。

## 本輪修改（實際檔案）
| 檔案 | 內容 |
|------|------|
| `react-app/src/components/Checklist/Checklist.tsx` | 項目表格改為 `<colgroup>` 比例欄寬；Item／Criteria／Actual Situation 改用 `ChecklistCellInput`；Result 格、刪除格加 class。存檔、readOnly、returnItp 邏輯未動。CRLF 保留（diff 只含改動行）。 |
| `react-app/src/components/Checklist/ChecklistCellInput.tsx`（新） | 包 `Audit/AutoGrowTextarea`（rows=1）：Enter 不換行（IME 組字中的 Enter 放行：`isComposing`／keyCode 229）；貼上的換行轉空格；舊資料原有換行保留顯示。 |
| `react-app/src/components/Checklist/Checklist.module.css` | `table-layout: fixed`；範本模式 #44px／Item 36%／Criteria 其餘／刪除 44px；結果欄模式 Result 172px，表格 ≥900px（container query）時 Item 22%、Criteria 32%、Situation 其餘，較窄時三欄平分；Result 四鈕在本表內排 2×2（只用本模組 CSS 覆寫，不改共用 ResultSelect）；格距 16/24px → 6/12px、表頭 10/12px；`.cellInput` 細框樣式（停用時淺灰底、文字不變淡）；移除已無引用的 `.criteriaBox`、`.underlineInput`。 |
| `backend/scripts/verification/seed_checklist_template_layout_review.py`（新） | 隔離環境 seed：範本（長短 Criteria、一筆含舊換行）、ITP（Record 指向範本，供 returnItp）、有 template_id 無 ITR 的實例（可編輯結果欄）、帶歷史結果的範本（唯讀結果欄）、編輯帳號與唯讀帳號。密碼只從環境變數讀。 |
| `react-app/tests-browser/checklist-template-layout-vite-launcher.mjs`（新） | 8372/3372，cacheDir `.vite-chklayout-3372`。 |
| `react-app/tests-browser/checklist-template-layout-check.mjs`（新） | Playwright 實測腳本（見下）。 |

未改：後端程式、資料格式、ChecklistPrintTemplate.tsx、ChecklistSnapshotModal.tsx、ChecklistResultControls.tsx、AutoGrowTextarea.tsx、LanguageContext.tsx、共用檔。

## 讀碼確認（未實測者標明）
- **結果欄在本編輯器出現的情況**：Checklist 頁清單只列 `itrId` 為空的紀錄（`checklist_repository.py` 預設篩選），連到 ITR 的實例由 ITR 的 `ChecklistSnapshotModal` 開啟，不經本表。因此本表的結果欄只在 (1) 有 template_id、無 ITR 的實例（可編輯），(2) 帶歷史結果的裸範本（唯讀）出現；兩者都已實測。ITR 快照本輪未動、未測。
- **存檔 payload**：onSave 兩個分支未改；欄位值仍是字串，只是輸入元件從 input 換成 textarea。
- **readOnly**：仍由外層 `<fieldset disabled>` 鎖定；textarea 同樣受其停用。
- **列印版**：不讀本表 DOM（portal 用 formData），未改。

## 執行證據
- `npx tsc --noEmit -p .`：exit 0。
- `npx eslint --max-warnings 0 Checklist.tsx ChecklistCellInput.tsx`：exit 0。
- `npm test`：173 pass／0 fail。
- `npx vite build`（臨時 outDir）：成功，產出 CSS 含 `@container (min-width: 900px)` 與 `container-type:inline-size`。
- 瀏覽器實測（隔離環境 8372/3372，Chromium headless，1440 與 1024 寬）：`CHECKLIST-TEMPLATE-LAYOUT-2026-001-evidence/browser-check.txt`，49 PASS／0 FAIL。涵蓋：
  - 範本模式 1440：Item 381px／Criteria 589px；1024：250／356；無頁面水平溢出、表格不超出卡片、每個輸入框 scrollHeight ≤ clientHeight（全文顯示）。
  - Enter 不插入換行；輸入長文字時框長高（32→52px）；貼上多行文字轉為單行；舊資料換行保留顯示。
  - 範本存檔 payload：頂層 `activity, date, detail_data, itpIndex, status`，項目 `criteria, id, item, result, situation`；status Ongoing、situation／result 為空；資料庫寫入一致。
  - returnItp：Cancel → `/itp?reopenItp=<ITP id>`（截圖 return-to-itp-1440.png 顯示原 ITP 視窗重新開啟）。
  - 結果欄（實例）1440：#44／Item 233／Criteria 339／Situation 227／Result 172／刪除 44；1024：Item／Criteria／Situation 各 145。Result 2×2 按鈕組 145px ≤ 可用 148px。實例存檔 payload 保留 situation 與 O／X／/ 結果。
  - 歷史範本（唯讀）1440／1024：結果欄顯示、所有輸入框 `:disabled`。
  - 唯讀帳號（只有 view）：範本與實例所有輸入框 `:disabled`，全文顯示。
- 截圖：template-1440／1024、template-1440-edited、instance-1440／1024、historical-1440／1024、readonly-template-1440、readonly-instance-1440、return-to-itp-1440。

## 未測／已知
- 實際中文輸入法（IME）組字按 Enter：headless 無法模擬，只讀碼（`isComposing`／229 判斷）。
- Safari／Firefox 未測（只測 Chromium）；`@container` 需 Chrome 105／Safari 16 以上。
- 1024 寬的結果欄模式，三個文字欄各約 145px，長 Criteria 會長得很高；無溢出。這種模式在本頁只出現在上述兩種少見資料。
- 唯讀時空白的 Actual Situation 會顯示提示文字「Enter observation...」（與原本單行 input 相同）。
- 拖放（drop）含換行的文字不經 onPaste，仍可能帶入換行；含換行的貼上由程式寫入，該次貼上無法以 Ctrl+Z 復原（R1 建議 2，未改）。
- 結果欄模式在表格寬約 900px 上下切換比例，欄寬會跳一次（R1 建議 3，未改）。
- Result 表頭原本置中，現在靠左，與按鈕組對齊。

## 審查後修正（R1 建議 1、5）
- `ChecklistCellInput.tsx` 貼上：改以 `el.value` 切字串（舊資料 `\r\n` 在 textarea 中被正規化為 `\n`，以 prop 值切會錯位一格）。
- 測試腳本 returnItp 斷言去掉恆真的 `|| includes('/itp')`。
- 重跑：tsc、eslint exit 0；npm test 173／0；瀏覽器實測 49 PASS／0 FAIL。

## 審查
R1 PASS（見 REVIEW）。
