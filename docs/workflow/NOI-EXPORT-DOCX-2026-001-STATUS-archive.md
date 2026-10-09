# STATUS.md — Claude 執行結果

TASK_ID: NOI-EXPORT-DOCX-2026-001
SOURCE_TASK_ID: ITR-EXPORT-DOCX-2026-001

## RESULT
- [x] DONE
- [ ] PARTIAL
- [ ] BLOCKED

## 本輪變更範圍
- `backend/services/noi_service.py`：新增 `NOIService.export_docx(noi_id, scope=None)`——比照
  `ITRService.export_docx` 的寫法，但依 PRECHECK 讀碼結論做了兩個刻意的差異：
  - **Related ITP 不需要推導**：`noi.itpNo` 本身就是對 `itp.referenceNo` 的真實 FK（不像 ITR
    的 `itpNo` 是從未存檔的死欄位），直接讀取即可，沒有 NOI→ITP 的額外查找邏輯。
  - **沒有 Checklist 表格**：讀碼確認 NOI 的 `checklists` relationship 在 NOI 自己的前端完全沒
    被使用（`NOIDetailModal.tsx` 沒有任何 checklist 相關渲染），這個關聯在架構上屬於「NOI 觸發
    的檢驗最後掛在 ITR 上」，不是 NOI 自己要呈現的內容，所以沒有比照 ITR 加這塊。
  - 附件用 `add_file_list`（列檔名）而非 `add_photo_section`（內嵌圖片）——NOI 唯一的附件分類
    `accept` 同時允許圖片／PDF／Word／Excel，不是純圖片，用內嵌圖片的 helper 對非圖片檔案會靜默
    顯示「載入失敗」。
- `backend/routers/noi.py`：新增 `GET /{noi_id}/export-docx`（`RoleChecker(NOI_VIEW)`，純讀取，
  `ValueError` 轉 404，與 ITR／NCR 既有端點同一套模式）。
- 前端：`react-app/src/services/api.ts` 新增 `exportNoiDocx()`（比照 `exportItrDocx`）；
  `NOIDetailModal.tsx` 在既有的 Print 按鈕旁加「Export Word」，`existingItem?.id` 才顯示。
  **翻譯鍵刻意重用**：沒有新增 `noi.exportWord`，直接沿用 ITR 那輪已經加的 `itr.exportWord`
  （文字是通用的「Export Word」/「匯出 Word」，跟模組無關）——因為要把這個鍵改名成通用的
  `common.exportWord` 必須連帶修改 `ITRModals.tsx`，但 `ITRModals.tsx` 在本批 FORBIDDEN_PATHS
  裡，所以選擇重用既有鍵這個風險最低的做法，技術上鍵名前綴是 `itr.` 但語意上兩個模組共用同一個
  通用詞彙，不是誤用。

新增驗收資產：`backend/scripts/verification/seed_noi_export_docx_review.py`（兩筆 NOI：一筆欄位
全部填滿＋真實附件，一筆完全沒有附件，用來驗證「沒有附件時不印空區塊」）、
`backend/scripts/verification/verify_noi_export_docx.py`（真實 HTTP + python-docx 解析）、
`react-app/tests-browser/noi-export-docx-review.mjs`（前端按鈕/下載）。

## 實測（隔離環境）

### 後端內容驗證
NOI1（欄位全填＋真實附件）：
```
6 checks executed, 6 PASS, 0 FAIL
```
- 登入、下載、content-type 皆正確。
- 「Attachments」區塊標題出現，附件的真實檔名 `seed-noi-attachment.png` 確實被列出。
- 解壓 .docx 確認**沒有**任何內嵌圖片（`word/media/` 底下沒有檔案）——證實附件是用列檔名的方式，
  不是嘗試內嵌圖片，符合設計決定。
- 額外手動核對：`QTS-NDX1-NOI-000001`／`QTS-NDX1-ITP-000001`（Related ITP，直接讀欄位非推導）／
  `Pinnacle Steel Works`／`Tan Wei Ming`／`0955-111-222`／`Steel Column Erection`／Remark 全文
  都正確出現在 docx 裡。

NOI2（完全沒有附件、沒有連結 ITP）：
```
4 checks executed, 4 PASS, 0 FAIL
```
- 確認**沒有**「Attachments」區塊標題被印出來——沒有附件時不會印出一個空殼區塊。

### 前端 UI 驗證
```
3 checks executed, 3 PASS, 0 FAIL
```
- 已儲存的 NOI 上「Export Word」按鈕存在，點擊觸發真實 `.docx` 下載。
- 未儲存的新 NOI 上沒有這顆按鈕。

## 證據
`docs/workflow/NOI-EXPORT-DOCX-2026-001-evidence/`：
- `noi1-export.docx`／`noi2-export-no-attachments.docx`——實際下載的 .docx 檔案本身。
- `run-backend-noi1.log`／`run-backend-noi2.log`／`run-frontend.log`——三支驗證腳本的完整輸出。
- `QTS-NDX1-NOI-000001.docx`——前端腳本透過真實點擊下載觸發的檔案。

## 前端檢查
- `npx tsc --noEmit`：無錯誤。
- `npm run lint`：13 errors / 21 warnings，基線不變。

## 後端檢查
- `noi_service.py`／`routers/noi.py` 皆以 `ast.parse` 語法檢查通過；隔離環境後端程序啟動正常、
  真實呼叫新端點成功回應。沒有另外跑完整既有 pytest 套件（本批新增獨立方法/端點，不修改任何既有
  函式行為）。

## 隔離環境
`isolated_stack.py up/seed/down`，backend port 8280、vite port 3280，與使用者 8198/3198 無關，
執行前後 `lsof -i :8198 -i :3198` 確認使用者本機開發環境全程未被影響；測試完畢已正常 `down` 回收。
未使用 `stash`/`reset`/`checkout`。

## 範圍確認
- 未修改 `services/itr_service.py`、`services/ncr_service.py`、`services/km_service.py`、
  `ITRModals.tsx`（既有先例/既有翻譯鍵唯讀參考，連帶使用但不修改）。
- 未加 Checklist 表格、未新增 NOI→ITP 推導邏輯（讀碼確認都不需要）。
- 未操作使用者 8198/3198 或開發資料庫。
- 未 commit／push／部署。
- REVIEW.md 留待獨立審查。
