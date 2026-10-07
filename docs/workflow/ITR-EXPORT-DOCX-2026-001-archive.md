# ITR-EXPORT-DOCX-2026-001 — 封存（TASK / STATUS / REVIEW 逐字快照，封存時尚未審查）

封存日期：2026-10-05。本輪在獨立審查完成前先封存（含同輪內追加的附件照片嵌入），使用者接著
問「哪些業務模組會需要匯出給業主或廠商」，討論後選擇先做 NOI，開新批 NOI-EXPORT-DOCX-2026-001。
REVIEW.md 封存時仍是待審空白模板。

## TASK.md（逐字）

````markdown
# TASK.md — ITR 匯出正式 Word（.docx）報告

TASK_ID: ITR-EXPORT-DOCX-2026-001
SOURCE_TASK_ID: ITR-INPUT-UX-IMPLEMENT-2026-006

## 狀態
已交辦，Claude 執行中。使用者問「這可以匯出word嗎」，我說明專案已有 NCR／KM 的 .docx 匯出先例
（BACKLOG #18 pilot），並提醒這是後端工作、比純前端改動範圍大，使用者回「要」確認要做。

## 重要說明：本批涉及後端程式碼
前幾輪 ITR-INPUT-UX-IMPLEMENT 系列明確把後端列為 FORBIDDEN_PATHS，因為範圍是純前端渲染調整。
本批是**新能力**，依性質必須動後端（新增匯出端點與 service 方法），**不是**違反前幾輪的範圍限制
——那些限制只對那幾輪的任務本身有效，不是對整個 ITR 模組的永久禁令。

## PRECHECK（已讀碼確認）
- 既有先例：`backend/routers/ncr.py` 的 `GET /{ncr_id}/export-docx`（`response_class=StreamingResponse`，
  僅需 `RoleChecker(NCR_VIEW)`）呼叫 `services/ncr_service.py` 的 `NCRService.export_docx()`，
  內部用 `core/docx_builder.py` 共用模組組出文件（`new_document`／`add_masthead`／
  `add_section_heading`／`add_field_grid`／`add_field_box`／`add_sign_off_grid`／
  `finalize_response` 等），不是把 HTML 印出樣板轉檔（python-docx 直接建構，htmldocx 處理不了
  CSS-grid 版面，BACKLOG.md 已有這段紀錄）。KM 模組（`services/km_service.py`）也有同樣模式可對照。
- `core/docx_builder.py` 目前**沒有**通用的「多欄位、逐列重複、儲存格內多行文字」表格 helper——
  `add_field_grid` 是固定的 label/value 2欄配對版面，不適合 Checklist 的 # / Item / Criteria /
  Situation / Result 五欄資料表（尤其 Situation 需要在 docx 儲存格內保留換行，等同這次 round
  001/006 在網頁與列印預覽上已經解決過的同一個問題，這次換成 docx 儲存格版本）。本批需要在
  `docx_builder.py` 新增一個通用的 `add_data_table(doc, headers, rows)` helper（`rows` 每個儲存格
  若含 `\n` 需拆成同一儲存格內的多個段落，不是把換行字元原樣塞進單一段落——docx 儲存格的換行必須
  用多個 paragraph 表示，直接塞 `\n` 字元不會在 Word 裡顯示成真正的換行）。
- `ITR` 後端模型／service 既有可用件：`ITRService.get_itr(itr_id, scope=scope)`（已做 scope 檢查，
  比照 NCR 的 `record_in_scope` 模式）；`models.ITR.checklists`（SQLAlchemy relationship，
  `foreign_keys="Checklist.itrId"`，直接存取 `itr.checklists` 即可拿到關聯的 Checklist 清單，不需要
  額外呼叫 `get_itr_with_checklists`，也不需要新寫查詢）；`Checklist.detail_data` 是 JSON 字串，
  需要 parse 出 `items`（與前端 `ITRPrintPreview` round 006 的 parse 邏輯對應，後端用
  `json.loads`）。
- Related ITP 在後端目前**也沒有**對應的即時推導（跟前端 round 003 之前的狀況一樣，是純前端
  `useMemo`，後端沒有等價邏輯）——本批匯出 docx 需要在後端重新做一次同樣的推導：
  `noi = db.query(models.NOI).filter_by(referenceNo=itr.noiNumber).first()`，再用
  `noi.itpNo` 去找 `models.ITP`（`referenceNo` 比對），取得 `referenceNo`／`description`。這不是
  重複勞動到後端業務邏輯層——是補齊後端原本沒有的對應能力，純讀取不寫入，不影響任何既有資料。
- 前端既有先例：`react-app/src/services/api.ts` 的 `exportNcrDocx()`（`responseType: 'blob'`，
  下載觸發 `<a download>`）、`kmService.ts` 的 `exportDocx()`。ITR 目前沒有對應的
  `exportItrDocx()`，也沒有觸發按鈕。

## SCOPE
1. **後端**：
   - `backend/core/docx_builder.py` 新增 `add_data_table(doc, headers: list[str], rows: list[list[str]])`
     ——通用多欄資料表，每個儲存格依 `\n` 拆成多個段落，不是新增 ITR 專屬的表格函式（讓之後其他
     模組若有類似需求也能直接用）。
   - `backend/services/itr_service.py` 新增 `ITRService.export_docx(self, itr_id: str, scope=None)`：
     - 用 `self.get_itr(itr_id, scope=scope)` 取得 ITR（None 時 raise ValueError，router 轉 404，
       比照 NCR 模式）。
     - 用 `add_masthead` 印標題／文件編號／狀態；`add_field_grid` 印基本資料（Reference no／
       Subject／Inspection Date／Version／Due Date／Close-out Date／NOI no／Contractor／
       Related ITP／NCR no／Status／Raised By）——Related ITP 用上方 PRECHECK 描述的推導邏輯算出。
     - 對 `itr.checklists` 裡每一筆，parse `detail_data.items`，用新的 `add_data_table` 印出
       # / Item / Criteria / Situation / Result 五欄（Result 轉成人類可讀文字，比照前端
       `checklistResult.classifyResult` 的判斷規則，在後端用等價的簡單字串比對重寫一次，不 import
       前端程式碼）。
     - 自由文字欄位（referenceStandards／foundLocation／detailsDescription／... ／remark）用
       `add_field_box`，比照 NCR 的寫法，只印有值的欄位。
     - `add_sign_off_grid` 印 Prepared/Reviewed/Approved By 簽名欄，比照 NCR。
     - `finalize_response(doc, filename_base)` 收尾回傳 `StreamingResponse`。
   - `backend/routers/itr.py` 新增 `GET /{itr_id}/export-docx`（`response_class=StreamingResponse`，
     `RoleChecker(ITR_VIEW)`，呼叫 `itr_service.export_docx()`，`ValueError` 轉 404）。
2. **前端**：
   - `react-app/src/services/api.ts` 新增 `exportItrDocx(itrId: string, filename: string)`，完全比照
     `exportNcrDocx` 的寫法（GET blob → 建立 `<a>` → 觸發下載 → revoke URL）。
   - `ITRModals.tsx` 的 `FormActions` 工具列（目前有 Print／Approval History 等按鈕的那一排）加一顆
     「Export Word」按鈕，呼叫 `exportItrDocx(existingItem.id, formData.itrNumber || 'ITR')`；
     未儲存的新記錄（`existingItem?.id` 不存在）不顯示這顆按鈕（跟 Print 按鈕目前的顯示邏輯保持
     一致，需讀碼確認 Print 按鈕目前的顯示條件並沿用同一個條件，不是自己發明新的顯示規則）。

## ALLOWED_PATHS
- `backend/core/docx_builder.py`（新增通用 helper）
- `backend/services/itr_service.py`
- `backend/routers/itr.py`
- `react-app/src/services/api.ts`
- `react-app/src/components/ITR/ITRModals.tsx`
- `react-app/src/context/LanguageContext.tsx`（若需要新增按鈕文字翻譯鍵）
- `react-app/tests-browser/`（驗收腳本）
- `docs/workflow/`
- `TASK.md` / `STATUS.md` / `REVIEW.md`

## FORBIDDEN_PATHS
- `backend/services/ncr_service.py`、`backend/services/km_service.py`——既有先例唯讀參考，不修改。
- `ChecklistSnapshotModal.tsx`、`ChecklistPrintTemplate.tsx`、`ITRPrintPreview` 既有渲染邏輯——
  这次是新增 docx 匯出，不是改既有的網頁列印功能。
- 任何 ITR 的核准／鎖定／Reopen／保存邏輯——匯出是純讀取功能，不得新增任何寫入路徑。
- 開發資料庫、使用者 8198/3198、`stash`/`reset`/`checkout`。
- commit／push／部署。

## ACCEPTANCE_CRITERIA
1. 點擊「Export Word」，瀏覽器下載一個 `.docx` 檔案，檔名含 ITR 編號。
2. 用 python-docx（或其他方式）讀回剛下載的 `.docx`，確認基本資料（Reference no／Subject／
   NOI no／Related ITP／Status 等）與畫面上一致。
3. 有連結且已填寫 Checklist 項目的 ITR，匯出的 docx 裡有完整的 Item/Criteria/Situation/Result
   表格，Situation 的多行內容在 docx 儲存格裡確實是多個段落（不是擠成一行、也不是把 `\n` 原樣
   印成不可見字元）。
4. 沒有連結 Checklist 的 ITR，匯出不報錯，docx 裡沒有空表格。
5. 沒有登入權限／非該 ITR scope 的使用者呼可這個端點，回 403/404（比照 NCR 既有的 scope 保護，
   不得繞過）。
6. `npx tsc --noEmit` 無錯誤；後端若有型別/語法檢查比照既有慣例跑過；`npm run lint` 前端基線不變。
7. 獨立隔離環境驗證（前端真實瀏覽器下載＋後端直接呼叫 export_docx 或用 requests 打 API 驗證內容）；
   未操作使用者 8198/3198 或開發資料庫；未 commit/push/部署；REVIEW.md 留待獨立審查。
````

## STATUS.md（逐字，含同輪追加的附件照片內容）

````markdown
# STATUS.md — Claude 執行結果

TASK_ID: ITR-EXPORT-DOCX-2026-001
SOURCE_TASK_ID: ITR-INPUT-UX-IMPLEMENT-2026-006

## RESULT
- [x] DONE
- [ ] PARTIAL
- [ ] BLOCKED

## 追加（同一輪內）：附件照片嵌入 docx
第一版 docx 匯出完全沒有處理任何附件/照片，使用者發現後問「還有呢」，確認要補上，回「改」後直接
在同一輪補完，不另開新 TASK_ID（屬於同一個「匯出 Word」功能尚未真正完整的延續，不是新需求）。

- `backend/core/docx_builder.py` 再新增一個通用 helper `add_file_list`（列出非圖片類附件的檔名，
  用於圖面/證書/一般附件——這些檔案不一定是圖片，`add_photo_section` 的 `run.add_picture()` 對
  PDF 等非圖片格式會靜默失敗顯示「圖片載入失敗」，所以圖面/證書/一般附件改用列檔名而非嘗試內嵌）。
- `backend/services/itr_service.py` 的 `export_docx`：新增 `_attachment_paths()`（完全比照
  `NCRService.export_docx` 的 `_photo_paths` 寫法——legacy JSON 欄位／`detail_data` 內的 JSON
  鍵 + `Attachment` 資料表兩種來源都撈，解析成本機檔案路徑），對 Defect/Improvement Photos 呼叫
  既有的 `add_photo_section`（真的把圖片嵌進 docx）；對 Drawings/Certificates/一般 Attachments
  呼叫新的 `add_file_list`（列檔名）。兩個區塊都有「完全沒有附件時不印出空區塊」的防呆（比照
  Checklist 表格那段已經做過的同樣防呆模式）。
- 種子腳本 `seed_itr_input_ux_review.py` 追加：在隔離環境的 upload 目錄寫入一個真實的 1x1 PNG
  檔案，並新增一筆 `Attachment` 記錄（`category="defectPhoto"`，掛在 ITR2 上），讓驗證腳本真的
  跑過一次「有實體檔案、真的被嵌進 docx」的路徑，不是只確認「空清單時不會壞」。

### 實測（同一隔離環境，重新 seed＋重新呼叫）
```
11 checks executed, 11 PASS, 0 FAIL  （沿用既有 11 項斷言，全部仍通過）
```
額外手動核對（不在既有腳本斷言清單內，直接檢查下載回來的 .docx 檔案本身）：
- 直接解壓 .docx（它本質是一個 zip 檔）確認 `word/media/image1.png` 真的存在——圖片是真的被嵌進去
  的，不是只有檔名文字。
- 確認「Photographic Record」「Defect Photos」這些標題文字出現在文件裡。
- 確認 ITR2 本身沒有圖面/證書/一般附件時，「Attachments」這個區塊**沒有**被印出來（防呆成立）。
- 確認 ITR1（完全沒有任何附件，連 defect/improvement photo 都沒有）匯出的 docx 裡完全沒有
  「Photographic Record」這個標題——不會印出一個空的照片區塊。

截圖/檔案：`docs/workflow/ITR-EXPORT-DOCX-2026-001-evidence/itr2-export-with-photo.docx`
（可以直接用 Word 打開，看得到嵌入的測試圖片）。

## 本輪變更範圍（含後端——本批性質需要，非違反前幾輪限制）
- `backend/core/docx_builder.py`：新增兩個通用 helper——`add_paragraph`（單純段落，給沒有專屬
  helper 的自由文字用，避免呼叫端直接存取底線開頭的內部函式）、`add_data_table`（多欄逐列資料表，
  儲存格內容依 `\n` 拆成多個段落以保留真正換行——docx 儲存格裡塞原始 `\n` 字元不會顯示成換行，
  這點跟網頁/列印的情況不一樣，必須拆成多個 paragraph）。兩者皆為通用 helper，不是 ITR 專屬，之後
  其他模組需要類似功能可以直接複用。
- `backend/services/itr_service.py`：新增 `ITRService.export_docx(itr_id, scope=None)`——比照
  `NCRService.export_docx` 的寫法。內容涵蓋：標題／文件編號／版次／狀態、基本資料表（含
  **後端重新推導一次**的 Related ITP——後端原本沒有這個推導邏輯，比照前端 round 003/005 的
  NOI→ITP 查找方式補上，純讀取不寫入）、**每一筆連結 Checklist 的完整 Item/Criteria/Situation/
  Result 表格**（這是這次最主要的新增內容——之前即使網頁列印預覽補了這塊，docx 匯出從頭就不存在）、
  自由文字欄位、簽名欄。
- `backend/routers/itr.py`：新增 `GET /{itr_id}/export-docx`（`RoleChecker(ITR_VIEW)`，純讀取，
  scope 檢查沿用 `ITRService.get_itr` 既有邏輯，`ValueError` 轉 404——與 NCR 的既有端點完全同一套
  权限/錯誤處理模式，沒有新發明）。
- 前端：`react-app/src/services/api.ts` 新增 `exportItrDocx()`（比照 `exportNcrDocx` 的 blob
  下載寫法）；`ITRModals.tsx` 在 Print 按鈕旁加一顆「Export Word」，**僅在 `existingItem?.id`
  存在時顯示**——這點與 TASK.md 原本寫的「沿用 Print 按鈕的顯示條件」不同：讀碼後發現 Print 按鈕
  本身沒有這個限制（因為它只是打開一個用現有 formData 畫出來的預覽，不打後端），但 Export Word
  要呼叫真實的後端端點，未儲存的新記錄沒有 id 可以呼叫，所以改成更嚴謹的條件，不是機械式照抄
  Print 的顯示規則；新增翻譯鍵 `itr.exportWord`（英中皆有）。

新增驗收資產：`backend/scripts/verification/verify_itr_export_docx.py`（真實 HTTP 請求＋
python-docx 解析下載回來的 .docx 內容）、
`react-app/tests-browser/itr-export-docx-review.mjs`（前端按鈕與下載行為）。

## 實測（隔離環境）

### 後端內容驗證（真實登入＋HTTP 請求＋python-docx 解析下載檔案）
ITR2（已連結、已判定 Pass、Situation 含換行與結尾標記）：
```
11 checks executed, 11 PASS, 0 FAIL
```
- 文件編號、連結的 NOI 編號、**後端即時推導的 Related ITP**（`QTS-IUX2-ITP-000001`，不是空白）、
  承包商名稱都正確出現在 docx 裡。
- 找到 Checklist 資料表（表頭含 Item/Result）。
- Situation 儲存格確實是**多個段落**（3 段，對應種子資料的 3 行），不是擠成一行；完整文字含結尾
  標記。
- Result 儲存格顯示「合格 Pass」人類可讀文字，不是存檔代碼 `O`。

ITR1（有一個未判定項目＋一個從未編輯過的項目）：額外手動核對該筆的表格內容（同一支驗證腳本的
斷言是為 ITR2 寫的，套用在 ITR1 上會有 3 項「文件編號/標記/Pass」斷言理所當然不符，不是真的失敗；
實際列印出的表格內容另外直接 dump 確認）：
```
['1', 'Rebar cover thickness', '40mm +/-5mm per S-301 Rev.C', 'Rebar cover checked at 8 locations along', '未填寫 Not filled']
['2', 'Formwork alignment', 'Plumb within 6mm per storey', 'UNTOUCHED-ITEM-MARK-keep-me', '未填寫 Not filled']
```
確認未判定項目顯示「未填寫 Not filled」（不是空白或代碼），第二個從未編輯過的項目內容也正確保留。

### 前端 UI 驗證（真實瀏覽器）
```
3 checks executed, 3 PASS, 0 FAIL
```
- 已儲存的 ITR 上「Export Word」按鈕存在，點擊後觸發真實的 `.docx` 檔案下載（副檔名確認）。
- 未儲存的新 ITR 上**沒有**這顆按鈕（避免對不存在的記錄呼叫匯出端點）。

**未測的部分（如實列出）**：沒有另外造一筆「完全沒有連結 Checklist」的種子記錄來實測「沒有連結時
這個區塊完全不渲染」——這點是從程式邏輯直接確認的（`for checklist in (itr.checklists or [])`，
空清單時迴圈不執行，不會印出任何標題或表格），不是分開跑一次實測；沒有另外測試非該 ITR scope 的
使用者呼叫這個端點會不會正確擋下（新端點的 scope 檢查邏輯跟既有的 `read_itr` 端點用的是同一個
`ITRService.get_itr(itr_id, scope=scope)`，屬於已經被其他端點驗證過的既有機制，不是本批新寫的
授權邏輯）。

## 證據
`docs/workflow/ITR-EXPORT-DOCX-2026-001-evidence/`：
- `itr2-export.docx`／`itr1-export.docx`——實際下載下來的 .docx 檔案本身，可以直接用 Word 打開看。
- `run-backend-itr2.log`——後端內容驗證腳本完整輸出。
- `run-frontend.log`——前端按鈕/下載驗證腳本完整輸出。
- `QTS-IUX2-ITR-000001.docx`——前端腳本透過真實點擊下載觸發的檔案。

## 前端檢查
- `npx tsc --noEmit`：無錯誤。
- `npm run lint`：13 errors / 21 warnings，基線不變。

## 後端檢查
- 三個修改檔案（`docx_builder.py`／`itr_service.py`／`itr.py`）皆以 `ast.parse` 語法檢查通過；
  隔離環境後端程序啟動正常、真實呼叫新端點成功回應，等同實際跑過一次。沒有另外跑完整的既有
  pytest 套件（本批新增的是全新、獨立的方法/端點，不修改任何既有函式的行為，風險侷限在新增程式碔
  本身）。

## 隔離環境
`isolated_stack.py up/seed/down`，backend port 8280、vite port 3280，與使用者 8198/3198 無關，
執行前後 `lsof -i :8198 -i :3198` 確認使用者本機開發環境全程未被影響；測試完畢已正常 `down` 回收。
未使用 `stash`/`reset`/`checkout`。

## 範圍確認
- 未修改 `services/ncr_service.py`、`services/km_service.py`（既有先例唯讀參考）。
- 未修改任何 ITR 核准/鎖定/Reopen/保存邏輯——匯出端點純讀取，沒有新增任何寫入路徑。
- 未操作使用者 8198/3198 或開發資料庫。
- 未 commit／push／部署。
- REVIEW.md 留待獨立審查。
````

## REVIEW.md（逐字，封存時仍待審）

````markdown
# REVIEW.md — 獨立審查

TASK_ID: ITR-EXPORT-DOCX-2026-001
SOURCE_TASK_ID: ITR-INPUT-UX-IMPLEMENT-2026-006
審查日期：待審

## EVIDENCE_CHECK
（待審）

## SCOPE_CHECK
（待審）

## DECISIONS_CHECK
（待審）

## VERDICT
- [ ] PASS
- [ ] REVISE
- [ ] HUMAN_REQUIRED

## REQUIRED_FIXES
（待審）

## NEXT_STEP
（待審）
````
