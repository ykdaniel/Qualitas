# REVIEW — CHECKLIST-TEMPLATE-LAYOUT-2026-001

TASK_ID: CHECKLIST-TEMPLATE-LAYOUT-2026-001

## R1：PASS（2026-10-12，獨立 Claude 審查，只讀）
逐項核對結論：
1. 存檔 payload 與資料格式不變：兩個 onSave 分支、isBareTemplate、readOnly、showResultColumns 都不在 diff；三欄 onChange 仍為 `newItems[idx].x = value`。實測 payload 欄位一致。
2. readOnly：項目表格仍在 `<fieldset disabled={readOnly}>` 內，textarea 同受停用；ResultSelect 仍帶 `disabled={readOnly}`。實測歷史範本與唯讀帳號全部 `:disabled`。
3. ChecklistCellInput：Enter 阻擋含 IME 放行（isComposing／229）；貼上換行轉空格、選取取代與游標正確；undefined 值顯示空字串、掛載時不回寫，未編輯的既有資料不會被改。
4. CSS：colgroup 欄數與表頭一致；1440／1024 實測無溢出；2×2 覆寫只在本 CSS module 的 `.resultCell` 下，不影響 ITR 快照；移除的 `.criteriaBox`／`.underlineInput` 已無引用。
5. CRLF：Checklist.tsx、Checklist.module.css 仍全檔 CRLF，diff 只含改動行，檔案權限不變。
6. 範圍：後端、context、ITR、Audit、store、列印版、ResultControls 皆無 diff。
7. seed／測試腳本：有隔離守衛，密碼只從環境變數讀，只以 `sqlite3 -readonly` 讀隔離資料庫，自有埠與 cacheDir。
審查者重跑：tsc exit 0、eslint exit 0、npm test 173／0。

必須修：無。
建議與處理：
1. 貼上位置以 prop 值切字串，舊資料含 `\r\n` 時會錯位 → **已修**（改用 `el.value`）。
2. 拖放文字不經 onPaste、程式寫入後該次貼上無法 Ctrl+Z → 未改，列為已知（STATUS）。
3. 1024 寬結果欄模式三欄平分、900px 上下欄寬跳動 → 未改，列為已知。
4. Result 表頭由置中改為靠左（與按鈕組對齊） → 預覽時向使用者說明。
5. 測試斷言 `|| p.url().includes('/itp')` 太寬 → **已修**（只認 reopenItp）。
6. 提交時避開 `react-app/node_modules`（symlink）與 `.vite-chklayout-3372/` → 提交時逐檔加入。

修正後重跑：tsc、eslint exit 0；npm test 173／0；瀏覽器實測 49 PASS／0 FAIL（evidence/browser-check.txt 已更新）。兩處修正皆屬審查建議的機械性修改，未再送審。

## 使用者預覽確認（2026-10-12）
使用者在隔離預覽 3372（chk_layout）看過範本畫面與 CHK-000003 歷史資料唯讀畫面後，於協調中心表示「Checklist 可以」（協調中心轉達）。提交後交協調中心，部署由協調中心與 NOI-DEFECTS、NCR-DELETE-AUDIT 合批，以正式站 0766d7d3 為基準重建。
