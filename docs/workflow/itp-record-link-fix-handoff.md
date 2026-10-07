# ITP「Record」連結導錯修正 — 交接紀錄

2026-09-28，Claude Code 實作並執行以下驗證。未 commit/push/部署。

延續 [ITP 整體 UI/UX 審閱](itp-uiux-review-2026-09-28.md) 額外發現的功能性 bug——點擊一個真正連到 ITR 的「Record」連結，卻被導去空的「Checklist 範本庫」。本批只修這一件事，不加入其他功能。

## 問題重現（修正前）

`ITPAdvancedEditor.tsx`（列表頁彈窗）與 `ITPDetail.tsx`（`/itp/:id` 獨立頁面，`App.tsx` 有真實路由，非死碼）的 Record 欄位點擊處理，原本都是：

```ts
if (item.record.includes('CHK') || item.record.startsWith('QTS')) {
    navigate(`/checklist?openId=${item.record}&from=itp`);
    return;
}
// 否則當作 ITR 處理
```

系統裡 ITR、ITP、Checklist、NOI 的文件編號**全部**以 `QTS-` 開頭（例如 `QTS-RLF-ITR-000001`），所以只要 Record 填的是一個真正的 ITR 文件編號，就會被這條規則誤判成 Checklist，導向一個查無此筆資料的空清單，沒有任何說明。這不是測資巧合，是正式編號規則下必然發生的問題。

## 最小修正

新增 `react-app/src/utils/itpRecordLink.ts`，`resolveItpRecordLink(value)`：不再用字串前綴猜測文件類型，而是**真的去查**——同時對 `GET /itr/?search=<value>` 和 `GET /checklist/?search=<value>&include_instances=true` 各發一次請求（`include_instances` 是必要的：預設清單只回傳空白範本，不含已連結 ITR 的 Checklist 實例，漏掉會誤判成「找不到」），從回傳結果中篩出**完全相符**的 `documentNumber`／`recordsNo`（search 端點本身是子字串模糊比對，不能直接當作命中），依實際查到的結果分類：

- 剛好在其中一邊查到唯一一筆 → 回報是 ITR 還是 Checklist，導到正確的入口。
- 兩邊合計查到超過一筆（例如編號在 ITR 和 Checklist 剛好撞號）→ 回報「多筆相符，無法判斷」，不猜、不任意選一種。
- 兩邊都查無資料 → 回報「找不到」。
- 其中一邊回應 403（沒有該模組的查看權限）且沒有從另一邔查到任何相符結果 → 回報「沒有權限查看」，不會被誤講成「找不到」（找不到暗示文件不存在，但真正的原因可能只是這個帳號看不到）。

`ITPAdvancedEditor.tsx`、`ITPDetail.tsx` 的點擊處理都改呼叫這個共用函式，並新增一個「正在查詢中」的按鈕狀態（因為現在是一次真正的網路查詢，不再是同步的本地比對）。ITR/Checklist 各自原本的導覽方式（`onViewRecord` 回呼／`navigate('/itr')` 提示、`navigate('/checklist?openId=...')` 深連結）完全不變，只是「決定要往哪邊導」這一步换成真的查詢結果。

**未改動**：編號規則本身（`QTS-` 前綴慣例維持不變）、既有資料（不清洗、不重新編號任何既有 Record 值）、後端任何驗證邏輯、`ITR_VIEW`/`CHECKLIST_VIEW` 權限碼。

## 本輪檔案

產品：
- `react-app/src/utils/itpRecordLink.ts`（新增）
- `react-app/src/components/ITP/ITPAdvancedEditor.tsx`
- `react-app/src/components/ITP/ITPDetail.tsx`

驗證資產（未提交）：
- `backend/scripts/verification/seed_itp_record_link_fix_review.py`
- `react-app/tests-browser/itp-record-link-fix-review.mjs`

## 已執行驗證

- `npx tsc --noEmit`：通過。
- `npm test`：91 passed，無回歸。
- `vite build`：通過。
- 隔離環境真實登入、真實畫面、真實 API、真實資料庫，一次乾淨全跑：
  1. **真正的 ITR 文件編號**（`QTS-RLF-ITR-000001`，開頭是 QTS 但不是 Checklist）：點擊後正確導向 ITR 入口（`/itr`），不再誤導向 Checklist。同一情境在列表頁彈窗與獨立 `/itp/:id` 頁面兩個入口都驗證過。
  2. **真正的 Checklist 文件編號**（`QTS-RLF-CHK-000001`）：修正後依然正確導向並實際開啟該筆 Checklist（截圖確認開啟的是「Real checklist for record-link test」這筆，FORM ID 正確），兩個入口都驗證過。
  3. **查無此文件**（`QTS-RLF-ITR-999999`，從未存在過）：停留在 ITP 頁面，跳出「Record document data not found.」，沒有被誤導向任何一邊。
  4. **真實撞號情境**（刻意讓一個 ITR 和一個 Checklist 共用同一個文件編號 `QTS-RLF-AMBIGUOUS-000001`）：跳出「Multiple documents match... cannot tell which one this Record refers to.」，沒有隨意選一種導過去。
  5. **沒有 ITR 查看權限的帳號**點擊一個真實存在的 ITR 記錄：跳出「You do not have permission to view this record.」，不是誤講成「找不到」，也沒有被導去 Checklist。

## 重跑方式（從 backend/ 目錄）

```sh
python3 scripts/verification/isolated_stack.py up --port 8099 --vite-port 3099 --vite-script <vite_multi.mjs 路徑> --env SMTP_HOST= --env SMTP_USER= --env SMTP_PASSWORD= > stack.json
python3 scripts/verification/isolated_stack.py seed --root <root> --script scripts/verification/seed_itp_record_link_fix_review.py
node ../react-app/tests-browser/itp-record-link-fix-review.mjs stack.json
python3 scripts/verification/isolated_stack.py down --root <root>
```

## 未驗證／範圍外（如實記錄）

- 排查過程中發現 `ITPDetail.tsx`（獨立 `/itp/:id` 頁面）的 `detail_data` 解析邏輯只認得舊式 `{a:[],b:[],c:[]}` 巢狀物件格式，跟列表頁彈窗共用的 `utils/itpParser.ts`（同時支援巢狀物件與扁平陣列兩種格式）不一致——這是兩個 ITP 編輯介面之間既有的格式落差，跟本次 Record 連結修正無關，本批未觸碰，只在種子腳本裡另外用舊格式包一筆測試資料來驗證這個獨立頁面。如果之後要處理，需要另外開一批。
- 未重跑 ITR／Checklist 模組本身的完整測試套件（本批只新增一個共用工具函式與兩個檔案的點擊處理，未觸碰後端或這兩個模組其餘前端邏輯）。
- 「查詢中」的按鈕狀態（loading）只做了基本的重入防護（`if (resolvingRecord) return`），未針對連續快速點擊不同 Record 連結的競爭情境另外測試。

## Claude 接手時注意

- 工作區存在其他協作者尚未提交的修改；本輪未 stash/reset/checkout，未動這些檔案。
- 本輪未 commit、push 或部署。
