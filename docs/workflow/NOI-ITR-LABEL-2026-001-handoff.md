# STATUS.md — 接手執行結果

TASK_ID: NOI-ITR-LABEL-2026-001
SOURCE_TASK_ID: NOI-ITR-NAV-2026-002

## RESULT
DONE（2026-10-04，Codex 接續 Claude 未完成實作；待獨立審查，不自行判 PASS）。

## 修改及接手
Claude 已完成本批 schema 欄位、service ITR flag、前端型別／徽章／語系／樣式及 service 測試初稿。
Codex 保留上述修改，補正 Pydantic 序列化：非 ITR 的 isReInspection 原本會被補為 null，現在以 RelatedEntity 的局部 wrap serializer 移除這個新欄位，其他既有 nullable 欄位保留。新增回應模型測試並完成隔離瀏覽器驗證。前端條件改為嚴格 === true。

## FILES_CHANGED（本批合計，非整份共享 git diff）
- backend/schemas.py
- backend/services/related_service.py
- backend/tests/test_related_service.py
- react-app/src/types/related.ts
- react-app/src/components/ui/RelatedDocuments.tsx
- react-app/src/components/ui/RelatedDocuments.module.css
- react-app/src/context/LanguageContext.tsx
- TASK.md（接手紀錄）、STATUS.md

## FILES_ADDED
- react-app/tests-browser/noi-itr-label-review.mjs
- docs/workflow/NOI-ITR-LABEL-2026-001-takeover.md
- docs/workflow/NOI-ITR-LABEL-2026-001-handoff.md
- docs/workflow/NOI-ITR-LABEL-2026-001-evidence/（1 張截圖與實際執行 logs）

## FILES_DELETED
無 repo 檔案刪除；本輪臨時憑證與 stack JSON 已清除。

## TESTS_RUN
- 後端 tests/test_related_service.py：11 passed（記憶體 SQLite）。包含 Claude 新增 service flag 測試及 Codex 回應序列化測試：ITP/NOI/NCR 不帶新 key，ITR false/true 正確保留。
- 前端 tsc --noEmit：通過（最終前端修改後執行）。
- npm test：123 passed / 0 failed（嚴格 boolean 呈現條件補正前執行；補正後另跑 tsc/build 與真實瀏覽器）。
- npm run build：通過。
- npm run lint：失敗，13 errors／21 warnings，詳 evidence/lint.log。不宣稱全域檢查皆通過，不歸因給協作者。
- 自建隔離環境瀏覽器：11 個實際斷言通過。HTTP original=false、reinspection=true、NCR 無新 key；畫面原始無標示／複驗有標示／原標題狀態保留／NCR 無誤標；分別點兩筆 ITR 開正確文件；NCR 保持 /ncr 無 query。
- 實際查看 related-badges.png，標籤與原文件編號／標題／狀態並列可讀。

## TESTS_NOT_RUN / RISKS / LIMITATIONS
- 中文與手機未另跑實機；中英文 key 皆存在，但本輪只實測英文桌面。
- 非 ITR 欄位省略：真實 HTTP 測 NCR，ITP/NOI 以回應模型序列化測試覆蓋，未另建這兩種 HTTP 關聯情境。
- 共用 RelatedDocuments 的 ITR 標籤可作用於其他使用此元件的入口；本輪瀏覽器僅測 NOI，其他呼叫端未逐頁測試。API 為相容新增欄位，其他 entity 輸出保留。
- 未重跑完整後端套件、其他業務鏈、權限拒絕及 dirty/Stay；本批沒有改導航或保護邏輯。

## 執行中修正
首次 pytest 在 repo 根目錄因 database import 失敗；改在 backend 工作目錄跑，11 passed。
首次隔離服務在工具執行結束後不再存活，防護腳本拒絕瀏覽器操作；未繞過防護。拆除該堆疊，改以同一父程序完成 up/seed/browser/down，11 項通過。

## SAFETY_CHECK
本輪僅操作自己建立的兩個暫時堆疊，皆由 isolated_stack.py down 拆除；最後 lsof 確認 8200/3200 無監聽。未操作使用者 8198/3198 或開發資料庫，未 stash/reset/checkout、commit/push/部署。保留共享工作目錄其他修改。REVIEW.md 保持待獨立審查。


## 接續驗證與修正（2026-10-04，手機／中文）
- 新增 `react-app/tests-browser/noi-itr-label-mobile-review.mjs`；先實測英文 375px，發現標籤右界 384px，且被祖先 refLine（右界約148px）裁切，中心命中失敗。失敗 log 與截圖保留於 evidence/mobile/before.log、before-en-375.png。
- 修正 `RelatedDocuments.module.css`：640px 以下改為兩欄，狀態／日期移至第二欄下一列，編號與複驗標籤可換行。不改導航、授權或資料規則。
- 全新隔離堆疊重測英文375px、中文375px、中文1280px，每組4項：標籤在viewport及裁切祖先內、中心未遮蓋、原始ITR未誤標、點擊開正確複驗ITR。12/12通過，非沿用先前11項結果。
- 實際查看英文375px截圖，編號、標籤、標題、狀態／日期皆可辨識。另保存中文手機／桌面截圖，幾何與操作皆由腳本斷言。
- 本次新增腳本語法檢查及 production build 通過。CSS補正未重跑單元測試、後端測試及全域lint；先前lint失敗仍保留，不宣稱所有檢查皆通過。
- 限制：本次僅NOI關聯面板，不代表其他入口或所有螢幕尺寸已驗證。上述「中文與手機未測」屬接手初輪限制，已由本補充的明確矩陣取代。
- 本次兩個自建堆疊（重現與修正後）皆拆除，臨時state檔刪除；使用者8198/3198及開發資料庫未操作。REVIEW.md仍待獨立審查，不自行填PASS。


## 斷點補查與補正（2026-10-04，本次接續）
- 重現：英文641px（剛超過640px斷點）複驗標籤右界423px超過refLine右界374px；中心命中仍true，證明只有中心命中不足以排除部分裁切。保留breakpoints/before.log及before-en-641.png。
- 產品變更僅RelatedDocuments.module.css：將refLine的flex-wrap／white-space:normal／overflow-wrap:anywhere移至所有寬度生效。640px以下的狀態另列仍維持；原資料與导航邏輯不變。
- 驗證腳本noi-itr-label-mobile-review.mjs擴為中英文×375/640/641/820/1280，共10組、40個實際斷言，全新隔離環境全數通過。每組確認badge完整位於viewport及裁切祖先內、中心未遮蓋、原始紀錄不誤標、點擊開啟正確ITR。
- 已實際查看修正後英文641px截圖，編號、複驗標籤、標題及狀態／日期可讀。證據存於NOI-ITR-LABEL-2026-001-evidence/breakpoints/。
- node --check與npm run build（包含tsc）本次通過。單元、後端與lint未重跑；既有lint失敗仍未處理。本次CSS補正不以先前測試冒稱全域通過。
- 本次兩個自建堆疊皆完成down，最後確認8200/3200無監聽；未操作使用者8198/3198及開發資料庫，未commit/push/部署。
- TASK頂部由過期的「待Claude執行」改為「Codex已接手，待獨立審查」。REVIEW原樣保留待審。沒有新增另一項功能或重開NAV系列。
