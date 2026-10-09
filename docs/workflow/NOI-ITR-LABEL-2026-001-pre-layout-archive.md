# TASK.md

# TASK.md — NOI Related Documents 複驗 ITR 標示

TASK_ID: NOI-ITR-LABEL-2026-001
SOURCE_TASK_ID: NOI-ITR-NAV-2026-002
狀態：Codex 已接手完成實作與接續驗證，待獨立審查。本批為產品修正，修改前後端程式碼，不動資料庫 schema。

## GOAL
NOI 的 Related Documents 清單中，複驗 ITR 與原始 ITR 目前顯示完全相同（`create_
reinspection()` 既有設計：逐字複製 subject/description），使用者無法從清單本身分辨
哪筆是複驗。本輪只加一個清楚的「複驗」標示，判斷依據是既有的 `ITR.isReInspection`
欄位，不用文件編號大小、日期或標題相同去推測。保留原文件編號、標題、狀態不變。

## PRECHECK 已確認事項（不得重新臆測）
- 後端 `RelatedEntity`（`backend/schemas.py` 行 1657-1668）目前沒有任何複驗相關欄位。
- `related_service.py` 的 `_serialize()`（行 160-191）回傳的是純 dict，不是
  `RelatedEntity` 物件；FastAPI 透過 `response_model=schemas.RelatedEntitiesResponse`
  在回應時才用 Pydantic 驗證/序列化這個 dict。這代表：只要 dict 裡缺少某個 Optional
  欄位，Pydantic 會自動補 `None`，不會噴錯——所以可以只在 `entity_type == 'itr'` 時
  才加這個 key，其他類型完全不用動。
- `ITR.isReInspection`（`backend/models.py` 行 298）是既有欄位，`Boolean,
  default=False`，不需要任何 migration。
- 所有四個模組（ITP/NOI/ITR/NCR）的 `/{id}/related` 端點共用同一個
  `schemas.RelatedEntitiesResponse`／`RelatedEntity`（`backend/routers/{itp,noi,itr,
  ncr}.py` 皆是 `response_model=schemas.RelatedEntitiesResponse`），所以 schema 改動
  影響全部四個呼叫端，必須確認非 ITR 類型的既有回應形狀不受影響。
- `backend/tests/test_related_service.py` 的 `test_serialized_entry_shape`
  （行 177-192）對 **NOI** 類型的回傳 dict 做了精確的 `set(keys) ==` 比對——只要新欄位
  只在 `entity_type == 'itr'` 時才加進 dict，這個既有測試不會被影響，不需要修改它。
- 前端 `RelatedEntity` 型別（`react-app/src/types/related.ts`）與
  `RelatedDocuments.tsx` 是全專案唯一引用這個型別的地方（已用 grep 確認），影響範圍
  完全侵限於這一個共用元件內部。
- `relatedService.ts` 是純轉發（`api.get` 直接回傳 `data`），不需要修改。
- i18n 既有 `related.*` 系列 key 分別在 `LanguageContext.tsx` 的 en 區塊（約行 1424-
  1428）與 zh 區塊（約行 2829-2833），新增一個 `related.reinspection` key 到這兩個區塊
  即可，不是翻譯補全工程。

## SCOPE
1. `backend/schemas.py`：`RelatedEntity` 新增 `isReInspection: Optional[bool] = None`。
2. `backend/services/related_service.py`：`_serialize()` 只在 `entity_type == 'itr'`
   時，於回傳 dict 加入 `"isReInspection": bool(getattr(entity, 'isReInspection',
   False))`。其他 entity_type 的回傳 dict 完全不變（不加這個 key）。
3. `backend/tests/test_related_service.py`：新增一個測試（不修改既有
   `test_serialized_entry_shape`），斷言 ITR 類型的關聯項目裡 `isReInspection` 欄位
   對一般 ITR 是 `False`、對複驗 ITR 是 `True`，且 NOI/NCR/ITP 類型的項目裡完全沒有
   這個 key。
4. `react-app/src/types/related.ts`：`RelatedEntity` 新增
   `isReInspection?: boolean | null;`。
5. `react-app/src/components/ui/RelatedDocuments.tsx`：在 `RelatedList` 的每一列，
   當 `entry.entityType === 'itr' && entry.isReInspection` 為真時，顯示一個清楚的
   「複驗」標示（例如 badge 旁或 refLine 旁的小標籤）。**不得修改** `refLine`／
   `titleLine`／status 的既有渲染邏輯或取值方式——原文件編號、標題、狀態維持原樣，
   只是多加一個視覺標示。
6. `react-app/src/context/LanguageContext.tsx`：新增 `related.reinspection` 這一個
   key 到 en 與 zh 兩個區塊（例如 en: "Re-inspection"，zh: "複驗"）。不新增、不修改
   任何其他既有 key。
7. 在獨立隔離環境驗證（見 ACCEPTANCE_CRITERIA），沿用既有
   `seed_noi_itr_ux_review.py`（已有一組同名標題的原始／複驗 ITR，不需要新種子）。

## ALLOWED_PATHS
- `backend/schemas.py`
- `backend/services/related_service.py`
- `backend/tests/test_related_service.py`
- `react-app/src/types/related.ts`
- `react-app/src/components/ui/RelatedDocuments.tsx`
- `react-app/src/components/ui/RelatedDocuments.module.css`（若標示需要最小樣式，限
  新增一個 class，不得修改既有 class 的樣式規則）
- `react-app/src/context/LanguageContext.tsx`（限新增 `related.reinspection` 一個
  key 到 en／zh 兩區塊）
- `react-app/tests-browser/`（本輪驗證腳本）
- `docs/workflow/`（本輪 handoff/evidence；上一輪 archive 已於本次對話建立）
- `TASK.md` / `STATUS.md` / `REVIEW.md`

## FORBIDDEN_PATHS
- 任何資料庫 migration／schema 變更（`isReInspection` 是既有欄位，不需要新 migration）
- `backend/workflows/relationships.py`（不新增關聯邊）
- `backend/services/itr_service.py`（不改複驗規則／`create_reinspection()` 邏輯）
- `react-app/src/components/NOI/modals/NOIDetailModal.tsx`、
  `react-app/src/components/NOI/NOI.tsx`、`react-app/src/components/ITR/ITR.tsx`
  （導航機制已在 NOI-ITR-NAV 系列確認並結案，本輪不碰）
- `react-app/src/components/Shared/LeaveGuard.tsx`
- 後端任何權限／授權檢查（router 的 `RoleChecker`／scope 邏輯）
- `LanguageContext.tsx` 裡任何既有 key 的值或其他未翻譯字串（不是本輪的全站翻譯任務）
- `TASK.md`（上一輪）／`DECISIONS.md`／`AGENTS.md`／任何既有 `docs/workflow/
  *-archive.md`／`docs/workflow/NOI-ITR-{UX,NAV}-2026-*-handoff.md`（唯讀）

## ACCEPTANCE_CRITERIA
1. 一般 ITR（非複驗）在 Related Documents 清單中**不會**被誤標為複驗。
2. 複驗 ITR 在清單中清楚顯示複驗標示，判斷依據是 API 回應的 `isReInspection === true`，
   不是編號大小、日期先後或標題相同。
3. 原始 ITR 與複驗 ITR 標題完全相同（既有種子資料的情境）時，兩筆仍可從清單本身
   （標示＋文件編號）辨識出哪筆是複驗、哪筆是原始。
4. 點擊原始 ITR／複驗 ITR 仍各自開啟正確的那一筆紀錄——確認本輪的標示變更沒有連帶
   影響 NOI-ITR-NAV 系列已修復、已結案的點擊導航行為（迴歸測試，不是重新設計）。
5. 點擊 NOI 面板內的 NCR 關聯，行為與加標示前完全相同（沒有 `openId`，落地在未篩選
   的 `/ncr` 清單）——確認本輪沒有連帶影響既有導航。
6. 後端：ITP/NOI/NCR 類型的關聯項目回應裡完全沒有 `isReInspection` 這個 key（不是
   `false`，是整個 key 不存在）；只有 ITR 類型的項目才有這個 key。
7. 執行與實際變更範圍相符的前後端檢查（後端：新增/相關的 pytest；前端：
   `tsc --noEmit`、`npm test`、`npm run lint`），lint 若仍有既有失敗，如實列出確切
   數字與檔案；錯誤位於本輪未直接修改的檔案時，只能說「目前無證據顯示與本輪改動
   有關」，不得推論「絕不可能由本輪造成」，也不得歸因給其他協作者。
8. 不新增任何關聯邊、不改原始標題／refLine／狀態渲染、不改權限或複驗業務規則、不做
   全站翻譯補全。

## CLAUDE_PRECHECK
1. 已讀本檔「PRECHECK 已確認事項」列出的所有程式碼位置，確認屬實（本輪撰寫 TASK.md
   前已逐一用 grep/Read 核對，不是臆測）。
2. 已讀 `docs/workflow/NOI-ITR-NAV-2026-002-archive.md`，確認 NOI-ITR-NAV 系列已
   PASS 結案，本輪不重開、不碰其導航相關檔案。
3. 啟動隔離環境前，確認沿用 8200/3200（非使用者 8198/3198），並沿用既有
   `noi-itr-nav-vite-launcher.mjs`（已綁定正確埠號，若需要新驗證腳本獨立建檔，沿用
   同一個 launcher，不需要新建）。
4. 落筆 TASK.md 前已自我核對 SCOPE 與 ACCEPTANCE_CRITERIA 用詞一致，不得發生上一輪
   「範例程式碼比文字範圍寫得更廣」的自我矛盾——`_serialize()` 的程式碼變更已明確限定
   只在 `entity_type == 'itr'` 分支內新增 key，與文字描述完全一致。

## 接手紀錄（2026-10-04）
使用者授權 Codex 接續 Claude 未完成的同一批，不更換 TASK_ID。保留 Claude 既有修改。
發現 Optional 欄位經回應模型會補 null；補上 RelatedEntity 局部 serializer，僅移除非 ITR 的新欄位，保留其他 nullable 欄位，並驗證回應序列化。此為達成既有 AC6 的必要修正。

## 接續手機驗證（2026-10-04）
使用者要求繼續。同批補測中文與手機；375px 英文實測複驗標籤被 refLine 裁切，允許在既有 RelatedDocuments.module.css 修正小螢幕換行，保留狀態、導航與業務行為。

## 斷點補查（2026-10-04）
使用者再次要求繼續；補測中英文375/640/641/820/1280px。641px英文真實重現裁切，於既有CSS讓refLine所有寬度均可換行，取值與導航不變。


# STATUS.md

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


# REVIEW.md

# REVIEW.md — 獨立審查

TASK_ID: NOI-ITR-LABEL-2026-001
SOURCE_TASK_ID: NOI-ITR-NAV-2026-002
審查日期：（待審查填入）

## EVIDENCE_CHECK
（待審查）

## SCOPE_CHECK
（待審查）

## DECISIONS_CHECK
（待審查）

## VERDICT
- [ ] PASS
- [ ] REVISE
- [ ] HUMAN_REQUIRED

## REQUIRED_FIXES
（待審查）

## NEXT_STEP
（待審查）
