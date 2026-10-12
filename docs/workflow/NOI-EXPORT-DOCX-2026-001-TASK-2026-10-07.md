# TASK.md — NOI 匯出正式 Word（.docx）通知單

TASK_ID: NOI-EXPORT-DOCX-2026-001
SOURCE_TASK_ID: ITR-EXPORT-DOCX-2026-001

## 狀態
已交辦，Claude 執行中。使用者問「哪些業務模組會需要匯出給業主或廠商」，討論後選擇先做 NOI
（NOI 本質就是發給承包商/業主的檢驗通知，先天就該有正式匯出）。

## PRECHECK（已委派 Explore agent 讀碼確認）
- **NOI 模型**（`backend/models.py` 202-252 行）：無 `documentNumber`，業務編號是 `referenceNo`；
  `itpNo` 是對 `itp.referenceNo` 的**真實 FK**（不像 ITR 那樣是死欄位，NOI 這裡不需要像 ITR
  round 003/005 那樣另外做 NOI→ITP 推導，直接讀 `noi.itpNo` 即可）；`vendor` 不是欄位，是透過
  `vendor_ref` 算出的 `contractor` 計算屬性；`attachments` 是 legacy Text JSON 欄位；
  `foundLocation`／`discipline` 雖然是模型欄位，但**畫面上完全沒有顯示**（`NOIDetailModal.tsx`
  找不到任何渲染），本批比照畫面實際顯示的欄位為準，不納入這兩個未顯示的欄位。
- **Service 層**：`NOIService.get_noi(noi_id, scope=None)`（`noi_service.py` 62-73 行）已有
  scope 檢查，直接複用，跟 `ITRService.get_itr` 同一種寫法；`self.repo.db` 可用。**沒有**既有的
  附件路徑解析 helper，需要自己寫一個（比照 `ITRService.export_docx` 內的 `_attachment_paths`
  closure，簡化成 NOI 只有一種 `"attachment"` 分類）。確認過 `noi_service.py`／`routers/noi.py`
  完全沒有任何 `export_docx`/`export-docx`，是全新功能。
- **Router**：`routers/noi.py` 已 import `NOI_VIEW`、`get_noi_service`；既有讀取端點是
  `@router.get("/{noi_id}/", response_model=schemas.NOI)`（注意 NOI 自己的路由慣例結尾有斜線，
  跟 ITR 的 `/{itr_id}`（無斜線）不同）。新端點比照 ITR 的寫法：
  `@router.get("/{noi_id}/export-docx", response_class=StreamingResponse)`（不加結尾斜線，
  跟 ITR 的 `export-docx` 子路由命名一致，前端呼叫時完全比照這個路徑，不自己發明）。需要新增
  `from fastapi.responses import StreamingResponse` import（目前沒有）。
- **附件**：NOI 在畫面上只有**一種**附件分類（`FileAttachment` 的 `category="attachment"`，
  `entityType="noi"`，`NOIDetailModal.tsx` 477-489 行），且 `FileAttachment` 預設 `accept`
  同時允許圖片／PDF／Word／Excel（不是純圖片）——所以這次**全部用 `add_file_list`（列檔名）**，
  不用 `add_photo_section`（那是假設內容一定是圖片，NOI 這裡不成立）。
- **沒有 Checklist 表格**：NOI 的 `checklists` relationship 在 NOI 自己的前端完全沒有被使用
  （`NOIDetailModal.tsx` 沒有任何 checklist 相關渲染，只有通用的 `<RelatedDocuments>` 跨模組
  連結列表）——這次**不**比照 ITR 加 Checklist 表格，那個關聯在架構上是「NOI 觸發的檢驗最後掛在
  ITR 上」，不是 NOI 自己要呈現的內容。
- **沒有既有的單筆列印模板可以參考**：`NOIPrintTemplate.tsx` 是**批次／多筆分組**列印（依承包商
  分組、欄位集合也不同），結構上跟單筆 ITR 的 docx 不是同一回事，本批的欄位選擇以
  `NOIDetailModal.tsx` 畫面上實際顯示的欄位為準（見下方 SCOPE 清單），不參考那個批次模板。
- **畫面顯示欄位清單**（`NOIDetailModal.tsx`，依畫面順序）：Reference No／Contractor／NCR
  Reference／Package（Subject）／Related ITP（`itpNo`）／Issue Date／Inspection Date／Due
  Date／Inspection Time／Event No／Checkpoint／Contacts／Phone／Email／Status／Close-out
  Date／Remark。
- **Export Word 按鈕位置**：`FormActions` 的 `tools` 插槽，跟既有的 `onPrint` 按鈕放在一起
  （549-567 行附近），比照 ITR 用 `existingItem?.id` 判斷是否顯示。

## SCOPE
1. **後端**：
   - `backend/services/noi_service.py` 新增 `NOIService.export_docx(self, noi_id: str, scope=None)`：
     - `self.get_noi(noi_id, scope=scope)`，None 時 raise ValueError。
     - `add_masthead` 印標題／`referenceNo`／`type`（NOI 有沒有版次欄位需確認；若無則不傳 rev，
       `add_masthead` 的 `rev` 參數本來就是 optional）／`status`。
     - `add_field_grid` 印上方 PRECHECK 列出的畫面顯示欄位（Related ITP 直接讀 `noi.itpNo`，
       不需要額外推導）。
     - 自己寫一個 `_attachment_paths(category)` helper（比照 ITR 版本簡化），對 NOI 唯一的
       `"attachment"` 分類呼叫 `add_file_list`（沒有附件時不印空區塊，比照 ITR 已經做過的防呆）。
     - Remark 用 `add_field_box`（或 `add_subsection_heading` + `add_field_box`，比照 ITR）。
     - `add_sign_off_grid` 簽名欄（Prepared/Reviewed/Approved，或依 NOI 業務情境調整角色名稱——
       NOI 本質是「通知」，簽名角色可能跟 ITR 的「製表/複核/核准」不同，需要讀碼或詢問使用者
       確認合理角色名稱；若無強烈業務理由，先比照 ITR 沿用同一組角色名稱，不自創）。
     - `finalize_response(doc, noi.referenceNo or "NOI")`。
   - `backend/routers/noi.py` 新增 `GET /{noi_id}/export-docx`，`RoleChecker(NOI_VIEW)`，呼叫
     `noi_service.export_docx()`，`ValueError` 轉 404；新增 `StreamingResponse` import。
2. **前端**：
   - `react-app/src/services/api.ts` 新增 `exportNoiDocx(noiId, filename)`，完全比照
     `exportItrDocx`。
   - `NOIDetailModal.tsx` 的 `tools` 插槽加一顆「Export Word」按鈕，`existingItem?.id` 才顯示。
   - 新增翻譯鍵（若 `common.exportWord`／`itr.exportWord` 可以共用就共用，不要為同一個按鈕文字
     重複造鍵——讀碼確認現有的 `itr.exportWord` 鍵是否適合改名成通用的 `common.exportWord` 共用，
     或是否要保留模組各自的鍵；以不破壞 ITR 既有翻譯鍵為前提）。

## ALLOWED_PATHS
- `backend/services/noi_service.py`
- `backend/routers/noi.py`
- `react-app/src/services/api.ts`
- `react-app/src/components/NOI/modals/NOIDetailModal.tsx`
- `react-app/src/context/LanguageContext.tsx`（視翻譯鍵決定是否需要新增）
- `react-app/tests-browser/`、`backend/scripts/verification/`（驗收腳本）
- `docs/workflow/`
- `TASK.md` / `STATUS.md` / `REVIEW.md`

## FORBIDDEN_PATHS
- `backend/services/itr_service.py`、`backend/services/ncr_service.py`、
  `backend/services/km_service.py`——既有先例唯讀參考，不修改。
- `backend/core/docx_builder.py` 的既有 helper 簽名——若需要調整只能新增，不得更動既有函式的
  行為（ITR／NCR 已經在用）。
- `NOIPrintTemplate.tsx`（批次列印，無關）、`checklists` 相關任何渲染（本批不加 Checklist 表格）。
- 開發資料庫、使用者 8198/3198、`stash`/`reset`/`checkout`。
- commit／push／部署。

## ACCEPTANCE_CRITERIA
1. 點擊「Export Word」下載 .docx，檔名含 NOI 編號。
2. python-docx 讀回確認基本資料（Reference No／Contractor／Package／Related ITP／Status 等）與
   畫面一致。
3. 有附件的 NOI，匯出的 docx 裡列出附件檔名；沒有附件時不印空區塊。
4. `npx tsc --noEmit` 無錯誤；後端語法檢查通過；前端 lint 基線不變。
5. 獨立隔離環境驗證（後端真實 HTTP 請求＋python-docx 解析內容＋前端真實瀏覽器下載）；未操作
   使用者 8198/3198 或開發資料庫；未 commit/push/部署；REVIEW.md 留待獨立審查。
