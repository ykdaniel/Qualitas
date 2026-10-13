# TASK — OBS-PRINT-PHOTOS-2026-001（+ closed lock）

TASK_ID: OBS-PRINT-PHOTOS-2026-001
日期：2026-10-12
來源：協調中心（工作階段「調度中心 登入測試」）轉達使用者決定。
基準：分支 `fix/obs-print-photos`。起初基於 632cf475，之後依協調中心指示改為 07248220，最後是 15612688（REFUSAL b1）。

## 一、列印版照片排版
使用者原話：「照片上為改善前 下為改善後 照片不一定是兩張也有可能是１張而已 這種情況怎麼辦」；「只有 1 張」選方案 A。

1. 照片區分上下兩段：上段「改善前 Before」放 defectPhotos；下段「改善後 After」放 improvementPhotos。
2. 每段一列兩張：
   - 2 張：左右並排，各半寬。
   - 1 張（方案 A）：維持半寬、靠左，大小與 2 張相同；右半留白，不放大、不置中。
   - 3 張以上：每列兩張往下排。
   - 0 張：顯示「（尚無照片 No photos）」框，沿用 field-box／guide 樣式。
3. 分頁：照片不切半，每張照片與每一列 break-inside: avoid；段標題不單獨留在頁尾（break-after: avoid）；A4 一頁放得下改善前 2 張 + 改善後 2 張；照片保持比例（object-fit: contain）。
4. 只改列印版；OBS 不新增 Word 匯出；畫面上傳區排版不動。
5. 中文字串照模板寫法直接寫在 JSX，不動 LanguageContext.tsx。

## 二、Closed／Void 鎖定照片與附件（協調中心 2026-10-12 追加，使用者回「好」）
- OBS 的**已儲存**狀態（不是表單上未存的值）是 Closed 或 Void 時：觀察照片、改善照片、附件的上傳按鈕與刪除 ✕ 都不顯示；照片仍可點開預覽、可列印。
- 區塊上方一行說明：「已結案，照片與附件已鎖定 / Closed — photos and attachments are locked」；Void 用「已作廢，照片與附件已鎖定 / Void — photos and attachments are locked」。
- 對照 ITR 的 isLocked（persistedStatus === 'Approved' || 'Void'）。Closed 改回其他狀態（reopen）並存檔後，鎖定要解除。
- 後端不改；若上傳 409 與前端判斷不一致，在 STATUS 註明。

## 三、使用者對 R1 三個待決事項的決定（2026-10-12，協調中心轉達，使用者原話：「依照你的建議」）
- (a) 改善前、改善後都沒有照片時，整個第 6 節不印：維持原狀。
- (b) 照片排序改成先上傳的排前面（uploaded_at 由舊到新），列印與畫面一致：本批一起做。
- (c) 前後端鎖定範圍不一致：本批前端維持現在的做法（比後端嚴）；後端對齊（Closed／Void 全擋）由協調中心排到之後的批次，本批不改後端。
- 既有問題「同一次存檔結案＋加照片 → 409、重試仍被拒」：列入 BACKLOG（建議先上傳再改狀態），本批不做。

## 四、列印改為左右成對（2026-10-12，協調中心轉達；取代第一節第 1、2 點的上下兩段排法）
使用者看完 3392 的原話：「改善前改善後分開印 沒辦法比對」。協調中心提出兩個方案，使用者選了「左右成對」。
- 表頭一列：左邊「改善前 Before」，右邊「改善後 After」。
- 每一列一組：左邊放改善前第 n 張，右邊放改善後第 n 張。順序沿用 oldestFirst（舊格式在前，已上傳的由舊到新）。
- 兩邊張數不同時，缺照片的格子顯示「無對應照片 / No corresponding photo」。只有一邊有照片時（例如還沒改善的 Open OBS），也照樣排成左右兩欄，另一邊每格都顯示「無對應照片」。
- 每一列不可跨頁斷開（break-inside: avoid）。兩邊都沒有照片時，維持現在的處理方式（整節不印）。
- OBS 沒有 Word 匯出或其他照片輸出（已確認），所以不用做；畫面上的兩個上傳欄位不改。

## 五、編輯畫面成對＋可調整順序；update_obs 鎖定補齊（2026-10-12～13，協調中心轉達）
使用者看編輯畫面時問：「那我在這附檔案 怎麼對照？我要怎麼知道哪張相對應哪張？」協調中心給了三個選項，使用者選「成對＋可調整順序」。設計由協調中心核准（方案 B）。
1. 照片分頁改成和列印同一種版面：左欄改善前、右欄改善後，每列標「第 n 組 / Pair n」，缺的那格顯示「無對應照片」，兩欄各自保留上傳按鈕。「附件」欄位不變。
2. 每張照片有 ↑↓，只能在自己那一欄內移動，用來改變配對。順序存在 OBS 自己的新欄位 `obs.photoOrder`（JSON），跟著表單一起儲存，不新增端點。列印、畫面都依這個順序配對（OBS 沒有 Word 匯出）。沒有存過順序的照片，退回 oldestFirst（舊格式在前，已上傳的由舊到新）。
3. 舊格式照片（data: URL）的鍵是 `legacy:<FNV-1a 雜湊>:<第幾次出現>`；已上傳照片的鍵是 `att:<附件 id>`。
4. 新選但尚未上傳的照片，存檔前不能排序，畫面要有提示「存檔後可調整順序」。
5. Closed／Void 不能調整順序：畫面隱藏 ↑↓；後端拒絕，回 409 `ATTACHMENT_LOCKED`，params 為 `{"kind":"record","docType":"OBS","status":…}`，用 REFUSAL b1 的 `core/refusals.py`。
6. 共用判斷 `obs_locked()`／`OBS_LOCKED_STATUSES` 寫進 `backend/core/attachment_access.py`，內容由協調中心指定，要和 REFUSAL 的 OBS-ATTACH-LOCK 逐字相同。
7. update_obs 鎖定補齊（協調中心追加）：依已儲存狀態 `obs_locked()`，鎖 defectPhotos、improvementPhotos、attachments、photoOrder 四個欄位。
   - Closed 在同一次存檔改回 Open（reopen）時照現有規則放行。
   - productDisposition 照現有規則，不改。
   - 拒絕文字："Cannot change attachments of a {status} OBS: the record is locked."
   - 測試要涵蓋：Closed／Void 各自改這四個欄位都被拒絕；reopen 後可以改。
8. 列印（使用者選建議方案）：每列標「第 n 組 / Pair n」，表頭不必每頁重印；照片高度調小，讓 3 組不會把頁尾擠到下一頁。實測 1～4 組，確認沒有幾乎空白的頁面。
9. FileAttachment.tsx 還原成基準版本（不再用於 OBS 照片）；attachmentOrder.ts 保留。
10. 基準：REFUSAL b1 提交後的 15612688，三方合併。

## 六、結案／作廢與待處理檔案（2026-10-13，協調中心追加；正式站既有的 High，BACKLOG「OBS close+upload 409」）
問題：saveFlow 的順序是先寫紀錄，再刪除、再上傳。結案檢查把待上傳照片也算進去，而 status=Closed 和檔案一起送出，結果紀錄先變成 Closed，之後的上傳全部回 409，最後得到一筆沒有照片的 Closed OBS。Void 也一樣。
修法 (a)，比照 NCR：
1. 結案檢查只算已存檔的照片。
2. 目標狀態是 Closed 或 Void，而且有任何待上傳或待刪除的檔案時，擋下不送出，提示「請先存檔上傳／刪除檔案，再結案／作廢」，中英並列。
3. 共用的 saveFlow.ts 不改。
4. 瀏覽器測試：結案和作廢都要測「有待處理時被擋」與「先存檔再結案／作廢會成功」；改回 Open 不受影響；確認 photoOrder 不會因此被誤擋。

## 範圍外
- LanguageContext.tsx、api.ts、NOI 相關檔、COORDINATION.md、根目錄 TASK/STATUS/REVIEW；file_router／lock_reason／lock_refusal（OBS-ATTACH-LOCK 的範圍）。後端只動第五節列出的 OBS 部分。
- 不推送、不部署；部署由協調中心安排。

## 流程
tsc、eslint（改動檔）、npm test → 隔離環境瀏覽器列印實測（0／1／2／3 張）→ 獨立 Claude 審查 PASS → 隔離預覽給使用者看 → 使用者確認後以臨時 GIT_INDEX_FILE 只提交本輪檔案，hash 傳協調中心。
