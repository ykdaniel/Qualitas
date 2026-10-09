# MATERIAL-SUBMITTAL-M6 — STATUS（R1，待獨立審查）

TASK_ID: MATERIAL-SUBMITTAL-M6-2026-001
ROUND: R1。前身 TABLE-2026-001 R1 尚未審查就併入本輪（封存為 `MATERIAL-SUBMITTAL-TABLE-R1-SUPERSEDED-*-archive.md`）。
本輪進行中，使用者多次調整需求，最後決定「材料模組只作為核准材料登錄簿」，並說「全部處理」。以下只描述**最終版本**；各階段的畫面與數字保留在 `browser-acceptance.txt` 中作為歷程。
根目錄 DEPLOY-EXEC 控制文件與使用者預覽 8240／3240 未動。**未提交、推送或部署。不自填 PASS。**

## RESULT
- [x] DONE（交獨立審查）

## 決策（DECISIONS「材料：只作為核准材料登錄簿」及其補充，皆由使用者在對話中確認）
- **登錄簿**：只登錄已經由外部核准的材料。必填欄位為名稱、承包商、核准日、核准結果（核准或附意見核准）。登錄後可以修改，並保留修改紀錄。不提供刪除。
- **舊送審 API**：移除路由，程式碼只保留在備份中。資料表不變，單筆詳細（含結果歷程）保留。
- **權限**：只留「查看核准材料」與「登錄與編輯核准材料」，`material:record_result:all` 從清單移除。權限代碼不改。
- **重複登錄**：同專案中名稱、廠牌、型號都相同時提示，但可以繼續。
- **名稱與網址**：統一為「材料／Material」；網址為 `/materials`，舊網址自動導向。
- **照片**：只在編輯表單中增刪，核准材料視窗為唯讀；儲存時若會刪除照片先確認。
- **列印與匯出**：單筆列印（含照片）；清單匯出 Excel（依目前篩選，匯出全部筆數）。
- **儀表板**：卡片顯示總數與本月新增。

## 最終修改
**後端**（沿用既有資料表，**不需要新的 migration**）
| 檔案 | 內容 |
|---|---|
| `routers/material_submittals.py` | 只留 4 條路由：`GET /approved`（篩選：關鍵字、分類、承包商、結果、`registeredFrom`；分頁）、`GET /{id}`（單筆詳細與結果歷程）、`POST /register`、`PUT /{id}/register`。舊送審路由全部移除。 |
| `services/material_submittal_service.py` | 只留詳細、核准清單、登錄、修改。登錄在一次交易內完成材料、編號、Rev 0 與首筆結果。修改時材料欄位直接改並寫稽核紀錄；結果欄位追加更正紀錄（原紀錄保留）；值沒變就不寫入。 |
| `schemas.py` | 新增 `MaterialRegisterCreate`／`MaterialRegisterUpdate`／`MaterialApprovedItem`／`MaterialApprovedPage`；移除舊流程用的 schema 與輔助函式。 |
| `core/perms.py`（CRLF，逐位元組修改） | 移除 `MATERIAL_RECORD_RESULT`；描述改為「查看核准材料」「登錄與編輯核准材料」。 |
| `core/attachment_access.py` | 新增 `photo` 類別；`IMAGE_ONLY_CATEGORIES`（照片只收圖片）；`NEVER_LOCKED_CATEGORIES`（登錄簿的照片不受狀態鎖定）；材料不再有分類專屬權限（全部需要 manage）。 |
| `routers/file_router.py`（CRLF，逐位元組修改） | 照片類別以實際偵測到的類型判斷，不是圖片就回 400。 |
| 測試 | `test_material_submittals_http.py` 改寫為登錄簿測試共 19 項：路由清單只剩登錄簿、舊路由回 404／405 且不寫入、登錄與驗證、權限、範圍與承包商、稽核失敗時整筆回滾、修改（材料欄位與結果更正）、append-only、單筆詳細、核准清單（只列現行核准版、篩選、分頁、結果、`registeredFrom`）、照片。`test_attachment_authorization_http.py` 改為以 manage 判斷，並涵蓋照片只收圖片、不受鎖定。`test_materials_http.py` 移除 record_result。 |
| `scripts/verification/seed_material_register_review.py`（新增，只用於隔離環境） | 透過登錄簿建立帳號、專案、208 筆紀錄與照片。取代舊的 m3／m4／m6 種子（已備份後移除）。 |

**前端**
| 檔案 | 內容 |
|---|---|
| `MaterialSubmittal.tsx` | 版面與其他模組一致：專案依右上角選單，左邊為結果標籤（筆數由伺服器統計），右邊為搜尋、「匯出 Excel」、「新增材料」，下方為 DataTable；只有在還有未載入的資料時才顯示「已載入 N／共 T」。 |
| `columns.tsx` | 欄位依序為 #、參考編號、核准結果、承包商、材料、分類、廠牌、型號、規格、核准日。 |
| `RegisterDialog.tsx` | 結構與 OSD 表單一致：FormShell、必填提示、三個區塊、FileAttachment、FormActions、runSaveFlow、未儲存離開確認。另有重複提示（可繼續）、儲存時的照片刪除確認、確認答案不重複詢問。結果未知時重新讀取清單，避免重複登錄。 |
| `ApprovedMaterialModal.tsx` | 唯讀：左邊照片（主圖加縮圖列，全螢幕可切換與縮放），右邊為核准資訊與材料資料；底部按鈕為列印、關閉、修改。 |
| `MaterialPrintTemplate.tsx`、`Material.print.css`（新增） | 單筆列印版型（雙語、核准資訊、材料資料、依據、照片），樣式由 OSD 列印版型衍生。 |
| `Photos.tsx` | 主圖加縮圖列與全螢幕檢視（‹ ›、← →、縮放、雙擊 2 倍、原圖）。 |
| `Dashboard/MaterialStatsTile.tsx`（新增）、`Dashboard.tsx` | 「核准材料總數／本月新增」卡片，有獨立的載入與錯誤狀態，依專案與承包商篩選，需要 material:view。 |
| `App.tsx`、`AppLayout.tsx`、`DocumentNamingRules.tsx` | 路由改為 `/materials`，舊網址導向；側邊欄 id 與路徑；編號規則的模組名稱改為 Material。 |
| `materialApi.ts`、`utils/materialSubmittal.ts`、`parts.tsx`、`materialText.ts` | 只留登錄簿用得到的部分；移除 97 個未使用的文字鍵；文字中不再出現「送審」。 |
| 移除（已逐字備份並附 MANIFEST） | `SubmittalBoard`、`SubmittalDetailModal`、`Dialogs`、`ResultDialogs`、`RevisionFiles`、`materialAttachmentState`，以及看板、附件狀態與分類渲染的測試。 |
| 回到 HEAD | `api.ts`、`projectStore.ts`、`ProjectModal.tsx` 的 git diff 為空。 |

雜湊見 `MATERIAL-SUBMITTAL-M6-evidence/file-hashes.txt`。`LanguageContext.tsx` 不變；`perms.py` 與 `file_router.py` 仍為 CRLF。

## 驗證（`MATERIAL-SUBMITTAL-M6-evidence/`）
- 前端 `frontend-checks.txt`：npm test **139 pass／0 fail**（移除的流程工具測試已刪除），EXIT 0；tsc EXIT 0；變更檔 eslint EXIT 0；vite build EXIT 0。
- 後端 `backend-material-tests.txt`（本機 Python）：
  - attachment＋migration **291 passed，EXIT 0**；
  - material_submittals＋materials **51 passed，EXIT 0**。
- 瀏覽器 `browser-acceptance.txt`「FINAL ROUND」一節，Chrome 在隔離環境實測，截圖 9 張：
  - 舊網址導向新網址；結果標籤；載入更多；
  - 匯出 Excel：攔截下載，解析得到 208 列、15 欄，涵蓋未載入的資料；
  - 唯讀視窗；列印內容與版面；
  - 重複提示後選擇繼續；儲存時的照片刪除確認；
  - 儀表板卡片；中文介面；900px 寬。

## 事件紀錄：開發資料庫被誤寫（已還原）
- 2026-10-09 02:15：為確認匯入是否正常，執行了 `python3 -c "import schemas, main"`，**沒有設定 DATABASE_URL**，於是對開發資料庫 `backend/qualitas.db` 執行了完整啟動流程（自動備份、migration、seeding）。
- 影響（以唯讀方式比對）：
  - 新增 4 張空的材料表與 `projects.material_reply_days` 欄位；
  - permissions 70→73，admin 角色 +3；
  - 其他資料表沒有變化。
- 處理：經使用者同意後，以自動備份 `backups/qualitas_20261009_021515.db`（執行前的完整狀態）還原。雜湊與備份相同，integrity_check 為 ok。還原前的狀態另存於 `~/Documents/Qualitas-deploy-artifacts/MATERIAL-SUBMITTAL-M6/dev-db-incident-2026-10-09/`。
- **無法復原**：備份輪替刪除了 `backups/qualitas_20260919_174144.db`（3 秒後的 `…174147.db` 仍在）；`backend/logs/` 多了數行紀錄。
- 已更新記憶，避免再次發生：import 檢查不得包含 `main`。

## 未驗證／限制
- 後端全套沒有重跑，只跑了受影響的 4 個測試檔。
- `/api/materials` 材料主檔 API（新增、修改）仍然存在：介面已不使用，但可以直接呼叫。是否關閉待決定。
- 手機寬度（小於 900px）未驗證。
- 「本月新增」以登錄時間計算，不是核准日。

## 對 M5 的影響
部署範圍、權限數量（3→2）與 API 都已改變。M5 的範圍盤點、候選樹、3.11 全套（須使用 repo 目錄結構）與演練都要重做。演練腳本 `m5_upgrade_rollback_rehearsal.py` 仍使用舊路由與 3 個權限的假設，**必須改寫**。

## 下一步
交獨立審查。不部署。
