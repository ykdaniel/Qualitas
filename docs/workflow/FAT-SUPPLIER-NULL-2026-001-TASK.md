# FAT-SUPPLIER-NULL-2026-001 — FAT 沒有供應商（或缺欄位）時列表 API 回 500

TASK_ID: FAT-SUPPLIER-NULL-2026-001
SOURCE: 使用者 2026-10-13 直接交辦（協調中心看板「待辦（未排）」第 1 條，2026-10-11「列印和 Word 模組位置檢查」發現）。協調中心 2026-10-13 核准檔案清單，並把另外發現的兩項併入本批。
基準：`ui/sidebar-shell-preview` HEAD `2589c8d6`（`main` `26e454d9` 的樹相同）。worktree `focused-fermat-46fe7e`。

## 問題
- FAT 的供應商是承包商名稱（`models.FAT.supplier` = `vendor_ref.name`，Python property）。回應 schema `supplier: str` 不接受 null。
- vendor_id 會在三種情況下被悄悄寫成 NULL 或失去對應：(1) 送出的供應商是空字串（更新時也包括 null）；(2) 名稱查不到承包商；(3) 承包商被刪除（API 會擋被引用的承包商，但資料庫外部刪除仍會發生）。
- 結果：GET /api/fat/ 整個 500，FAT 頁面打不開；GET /api/fat/{id} 也 500。新建／修改本身也回 500，但資料已經寫入（使用者重試會產生重複資料）。
- 正式站 fat 表目前 0 筆，暫無實際影響。

## 範圍
1. 讀取：FAT 回應能顯示沒有供應商的資料，不讓整個清單壞掉。
2. 寫入：新建或修改時，supplier 為空字串、空白、null，或找不到對應的承包商，回 400，並附 coded refusal（`core/refusals.py`）：`FAT_SUPPLIER_REQUIRED`、`FAT_SUPPLIER_NOT_FOUND`（params `name`）。不再把 vendor_id 悄悄寫成 NULL。前端顯示中文彈窗。
3. 協調中心併入：
   - (a) `GET /api/fat/?search=` 會 500：`fat_repository.py` 用 `models.FAT.supplier.ilike`，但 supplier 是 property，不是欄位。改為搜尋承包商名稱。
   - (b) `FATUpdate` 允許 `equipment`／`startDate`／`endDate` 送 null 並寫入資料庫，回應 schema 卻要求這三欄是 str，同樣讓列表 500。寫入端擋下（422）；讀取端容錯，既有的 null 資料不再讓列表 500。
4. 前端 FAT 頁面遇到供應商為空時不出錯（列表搜尋原本會呼叫 `null.toLowerCase()`）。
5. 後端測試涵蓋三種變成 NULL 的情況；前端跑 tsc、npm test、vite build。

## 不在範圍
- `react-app/src/store/fatStore.ts`（協調中心指示不動；NOI REF-PROJECT-SEQ B2 會改）。`FATItem.supplier` 型別仍是 `string`，前端以執行期處理 null。
- FAT.tsx 的 create 路徑（`handleSaveFATDetails`）、新增按鈕 gate、專案欄：屬 NOI B2。
- 寫入端日期格式與日期先後檢查：`FATUpdate` 本來就沒有，本批只擋 null（見 STATUS「後續」）。
- 其他模組（OSD、NCR…）是否也會把 vendor_id 悄悄寫成 NULL：未檢查。

## 排序（協調中心）
本批先上線，NOI B2 在後。B2 不改 `fat_service.py`、`schemas.py`、`routers/fat.py`；FAT.tsx 與 LanguageContext 的 hunk 不同，由協調中心 merge-file 合併。
