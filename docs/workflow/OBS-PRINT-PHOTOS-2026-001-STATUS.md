# STATUS — OBS-PRINT-PHOTOS-2026-001（照片成對＋排序＋結案鎖定）

TASK_ID: OBS-PRINT-PHOTOS-2026-001
基準：worktree `cranky-sinoussi-b7a144`，分支 `fix/obs-print-photos`（HEAD 仍是 632cf475，沒有提交）。
工作樹內容依序對齊到 07248220、15612688（REFUSAL b1）。做法是套用基準之間的差異；有重疊的 OBS.tsx、obsStore.ts 用 `git merge-file` 三方合併，沒有衝突。過程中沒有用 checkout、reset 或 stash。
**以下差異一律以 15612688 為準**：`git diff 15612688 -- <檔案>`。

## 現在的修改（相對 15612688）

### 後端
| 檔案 | 內容 |
|------|------|
| `backend/models.py` | `OBS.photoOrder = Column(Text, nullable=True)`：照片配對順序，存 JSON。 |
| `backend/db_migrations.py`（CRLF） | `_add_missing_columns` 的 obs 區塊加一行 `_add_column_if_missing(conn, "obs", "photoOrder", "TEXT")`。只新增可為空的欄位，不改舊資料；既有紀錄的值是 NULL，代表用預設順序。 |
| `backend/schemas.py` | `parse_obs_photo_order(v, strict)`：格式為 `{"defectPhoto":[鍵…], "improvementPhoto":[鍵…]}`，每欄最多 500 個鍵，每個鍵 1～120 字。讀取時（OBSBase／OBS）遇到壞資料一律當 None，不報錯；寫入時（OBSCreate、OBSUpdate）格式不對就拒絕（422）。`photoOrder` 欄位只加在這三個 OBS schema。 |
| `backend/core/attachment_access.py` | 依協調中心指定逐字加入 `OBS_LOCKED_STATUSES = frozenset({"Closed","Void"})` 和 `obs_locked(status)`，和 REFUSAL 的 OBS-ATTACH-LOCK 一致。`lock_reason`、`lock_refusal` 都沒有改。 |
| `backend/services/obs_service.py`（CRLF） | (1) create／update 時把 `photoOrder` 序列化成 JSON。(2) 新增 `OBSAttachmentsLocked(Refusal)`：code `ATTACHMENT_LOCKED`，文字 "Cannot change attachments of a {status} OBS: the record is locked."，params `{"kind":"record","docType":"OBS","status":…}`。(3) update_obs：已儲存狀態 `obs_locked()`（Closed／Void），而且這次不是 reopen 時，只要 defectPhotos、improvementPhotos、attachments、photoOrder 任一欄位以資料比對有變就拒絕。NULL、""、[] 都算沒有檔案；photoOrder 會去掉空清單再比較。所以表單整筆重送、值沒變時會放行。(4) 原本 Closed 才生效的 `_LOCKED_OBS_FIELDS` 只剩 productDisposition，規則和錯誤訊息（400）照舊；照片欄位改由 (3) 處理。 |
| `backend/routers/obs.py`（CRLF） | update 遇到 `OBSAttachmentsLocked` 時，用 `refusal_http(e, 409)` 回傳（`RefusalHTTPException`，含 code 和 params）。 |
| `backend/tests/test_obs_photo_order.py`（新） | 44 個測試，涵蓋：存檔與讀回；不帶 photoOrder 的存檔不動原值；create；Closed／Void 各自改四個欄位都被拒（8 組，並確認錯誤文字、code、params、fields，以及資料庫沒有被改）；整筆重送不算改動；Closed 在同一次存檔 reopen 時可以改四個欄位；reopen 後下一次存檔也可以改；Open 不鎖；router 回 409 RefusalHTTPException；`obs_locked` 各狀態；寫入時拒絕的格式 8 種；讀取壞資料退回 None；migration 會在既有資料庫加上欄位。 |
| `backend/tests/test_obs_service.py` | `test_update_closed_obs_rejects_evidence_change` 的斷言改成新的鎖定訊息和 code（照片欄位的拒絕改由新鎖處理）。另外新增 `test_update_closed_obs_still_rejects_product_disposition_change`，確認 productDisposition 的舊規則仍然有效。 |

### 前端
| 檔案 | 內容 |
|------|------|
| `react-app/src/utils/obsPhotoOrder.ts`（新） | 照片的鍵：`att:<id>`，舊格式照片用 `legacy:<FNV-1a>:<k>`。`orderPhotos(舊格式, 已上傳, 已存順序)`：先照已存的順序排；沒有列在順序裡的照片接在後面，依預設順序（舊格式在前，已上傳的由舊到新）；已經不存在的鍵忽略。`moveKey()` 用來上下移動。 |
| `react-app/src/utils/attachmentOrder.ts`（新，R2 起） | `oldestFirst()`：依 uploaded_at 由舊到新排序，供 obsPhotoOrder 使用。 |
| `react-app/src/components/OBS/OBSPhotoPairs.tsx`、`.module.css`（新） | 照片分頁的成對版面。表頭是「改善前 Before｜改善後 After」，兩欄各自有「+ 上傳照片 / Upload」。每列標「第 n 組 / Pair n」。每張已存的照片有 ↑、↓、✕，點照片可以預覽。新選、還沒上傳的照片標 NEW，只有 ✕；這時會顯示提示「新選的照片（NEW）存檔後可調整順序」。缺照片的格子顯示「無對應照片 / No corresponding photo」。待上傳照片的預覽在同一個 effect 裡建立和釋放 object URL，StrictMode 下也安全。 |
| `react-app/src/components/OBS/OBSModals.tsx` | 觀察照片、改善照片兩個 FileAttachment 換成 OBSPhotoPairs，「附件」維持原本的 FileAttachment。已上傳照片改在這裡取得（存檔後依 syncTokens 重新取得）。↑↓ 會改表單的 `photoOrder`（標記為 dirty），隨「儲存」一起送出。上傳和 ✕ 在 `filesReadOnly` 時隱藏；↑↓ 在 `readOnly`、`filesLocked` 或新增紀錄時隱藏。列印時重新取得照片，排除這次編輯中已刪除的，再依同一個順序配對，所以列印和畫面一致，也順便修好了「刪除後還沒存檔就列印，仍會印出被刪的照片」那個既有問題。鎖定說明（Closed／Void）沿用 R1 的做法。 |
| `react-app/src/components/OBS/OBSPrintTemplate.tsx`、`OBS.print.css` | 左右成對（R4），並在每列加「第 n 組 Pair n」。照片框高度 65mm。實測：68mm 時，3 組＋頁尾需要 275mm，超過 A4 可用的 271mm；改成 65mm 後 3 組和頁尾在同一頁。 |
| `react-app/src/components/OBS/obsFormSchema.ts`、`react-app/src/store/obsStore.ts`（CRLF）、`react-app/src/components/OBS/OBS.tsx` | 表單和型別加入 `photoOrder`；OBS.tsx 的存檔 payload 加一行 `photoOrder: details.photoOrder ?? undefined`（沒有排過序時不送）。obsStore 與 OBS.tsx 已和 REFUSAL b1 三方合併。 |
| `react-app/src/components/Shared/FileAttachment.tsx` | **與 15612688 相同**。R2 加的 oldestFirst prop 已經移除，因為 OBS 照片不再經過這個元件。 |
| `react-app/tests-unit/obsPhotoOrder.test.ts`（新）、`attachmentOrder.test.ts`（新） | 8 個加 4 個單元測試。 |

### 結案／作廢時還有待處理的檔案（BACKLOG「OBS close+upload 409」，協調中心追加，採 (a)，比照 NCR）
| 檔案 | 內容 |
|------|------|
| `react-app/src/components/OBS/OBSModals.tsx`（onValid） | (1) 這次存檔的目標狀態是 Closed 或 Void，而且還有待上傳（兩種照片和一般附件）或待刪除的檔案時，一律擋下，什麼都不寫入。提示用和 NCR、OBS 既有照片檢查相同的 `toast.warning`：結案顯示「請先存檔上傳／刪除檔案，再結案。本次未儲存任何內容。 / Save the file uploads / deletions first, then close. Nothing was saved.」，作廢顯示對應的作廢版本；同時切到照片與附件分頁。(2) 結案照片檢查只計算已存檔的照片（伺服器上的檔案扣掉這次刪除的，加上舊格式照片），待上傳的不算。(3) 共用的 `utils/saveFlow.ts` 沒有改。 |

### 驗證工具
- `backend/scripts/verification/seed_obs_print_photos_review.py`：9 筆 OBS。改善前／改善後的照片張數為 Open 2/0、In Progress 2/1、Resolved 2/2、Closed 2/2、Open 3/3、Void 1/1、舊格式混合（1+2／1+1）、Open 4/3、Open 0/2。沒有隔離環境的 DATABASE_URL 和 QUALITAS_UPLOAD_ROOT 時拒絕執行。
- `react-app/tests-browser/obs-print-photos-vite-launcher.mjs`：8392/3392，cacheDir 放在系統暫存目錄。
- `react-app/tests-browser/obs-print-photos-check.mjs`：瀏覽器實測，分 6 段，見下。

## 執行證據（實測，基準 15612688）
- `npx tsc --noEmit -p .`：exit 0。
- `npx eslint --max-warnings 0`：OBSModals、OBSPrintTemplate、OBSPhotoPairs、obsFormSchema、obsPhotoOrder、attachmentOrder 和兩個單元測試，exit 0。OBS.tsx 第 94 行有 1 個 `set-state-in-effect`，**15612688 原本就有**（用 `--stdin` 檢查基準版本，同一行同一個錯誤），本輪只在第 154 行加了一行。obsStore.ts 沒有問題。
- `npm test`：197 pass／0 fail。
- 後端：`pytest tests/test_obs_photo_order.py tests/test_obs_service.py tests/test_obs_engineer_approval_identity.py tests/test_obs_engineer_approval_migration.py` 共 82 passed（R8 之後）（使用拋棄式 DATABASE_URL）。完整後端測試：見下方「完整後端測試」。
- 瀏覽器實測：隔離環境 8392/3392（基準 15612688），重建並 seed 後執行整支腳本，共 47 項，結果在 `OBS-PRINT-PHOTOS-2026-001-evidence/browser-check.json`。
  1. **列印**（9 種情境）：表頭都是「改善前 Before｜改善後 After」；每列有「第 n 組 Pair n」；每列 2 格，每格都是半寬，左格貼齊左緣，所有格子一樣高（照片 245px = 65mm，object-fit: contain）；節標題、表頭和第 1 組在同一個不分頁的區塊。各情境的配對：
     - 1／2／3／4 組都正確。4/3 的第 4 組右格是「無對應照片」。
     - 2/0 是「照片｜—」×2；0/2 是「—｜照片」×2；2/1 的第 2 組右格是 —；舊格式混合是 3 組，第 3 組右格是 —。
  2. **PDF 分頁**（pdftotext 逐頁檢查）：1、2、3 組都是 2 頁，照片全在第 2 頁，3 組時頁尾也在第 2 頁。4 組是 3 頁，第 3 頁有第 4 組和頁尾。**沒有只剩頁首、頁尾的空白頁。** 截圖：void-1-1-pages.png、closed-2-2-pages.png、open-3-3-pages.png、open-4-3-pages.png。
  3. **照片分頁和列印逐格一致**：舊格式混合、4 組、2/0 三種情境都是 true。舊格式混合的第 1 組是兩張舊格式照片（tab-legacy-mixed.png、tab-4-pairs.png、tab-2-0.png）。
  4. **鎖定**：
     - Closed／Void：顯示鎖定說明，上傳 0、↑ 0、↓ 0、✕ 0，點照片仍然可以預覽（lock-closed.png、lock-void.png）。Resolved：上傳 3、↑ 4、↓ 4、✕ 4。
     - API：Closed 改 photoOrder、Void 改 photoOrder、Void 改 attachments，都回 409，body 為 `{"detail":"Cannot change attachments of a Closed/Void OBS: the record is locked.","code":"ATTACHMENT_LOCKED","params":{"kind":"record","docType":"OBS","status":…}}`。Void 送出和原值相同的 defectPhotos、Closed 送 photoOrder null（和原值相同），都回 200。被拒之後 photoOrder 仍然是 null。
  5. **調整順序**：Open 3/3 按改善前第 1 張的 ↓，畫面變成「before-2｜after-1」「before-1｜after-2」「before-3｜after-3」。存檔後 photoOrder 存成 `{"defectPhoto":["att:…","att:…","att:…"]}`，重新開啟後順序相同（tab-reordered.png），列印逐格和畫面一致（reordered-3-3.pdf）。
  6. **Reopen**：Closed 在還沒存檔時仍然是鎖定的（依已儲存狀態）；存檔後重新開啟，上傳、↑↓、✕ 都恢復。
  7. **新選照片**：多出「NEW｜—」那一列；NEW 只有移除按鈕，沒有 ↑↓；提示文字有顯示（tab-pending-new.png）。
  8. **結案／作廢時還有待處理的檔案**（第 7 段）：
     - 7a：Resolved 加一張待上傳照片後把工地工程師改成 Approved（變成 Closed）並存檔 → 顯示結案版提示；沒有任何寫入請求（POST／PUT 都是 0）；狀態仍是 Resolved；照片數沒變；表單仍開著（close-pending-refused.png）。
     - 7b：先只存照片（照片數 2 → 3），再另一次存檔結案 → Closed，照片 3 張。第一步存檔時狀態從 Resolved 變成 Open，原因是 seed 直接寫入 Resolved，但「品質工程師 Approved＋工地工程師 Pending」依前端推算是 Open；這是測試資料的問題，和本修改無關。
     - 7c：作廢時有待上傳照片 → 被擋，0 寫入，仍是 In Progress；作廢時有待刪除照片 → 被擋，0 寫入，照片數沒變。
     - 7d：沒有待處理檔案時作廢 → Void。
     - 7e：Open 存檔帶待上傳照片 → 照片上傳成功（2 → 3），狀態不變。
     - 7f：同一次存檔「改照片順序＋兩位工程師都核准（Closed）」→ 成功結案，新的 photoOrder 也存下來了（存檔前狀態是 Open，所以不會被鎖擋下）。
  9. **存檔成功但有檔案步驟失敗**（第 8 段，R5 必須修正 1）：Open 3/3 刪掉一張改善前照片，同時新增一個附件，並刻意讓上傳回 500 → 存檔成功但附件步驟失敗，表單仍開著。伺服器上的改善前照片從 3 張變 2 張，畫面上被刪的 before-2 沒有再出現（saved-incomplete-no-reappear.png）。
  10. **新增 OBS**（第 9 段）：存檔前選的照片顯示「NEW｜—」，沒有 ↑↓，提示有出現。
- **PDF 只留在本機，不提交**（協調中心決定）。路徑是 `/Users/nook/Documents/Qualitas/.claude/worktrees/cranky-sinoussi-b7a144/docs/workflow/OBS-PRINT-PHOTOS-2026-001-evidence/`，共 10 份：closed-2-2.pdf、inprogress-2-1.pdf、legacy-mixed.pdf、open-0-2.pdf、open-2-0.pdf、open-3-3.pdf、open-4-3.pdf、reordered-3-3.pdf、resolved-2-2.pdf、void-1-1.pdf。提交的證據只有 PNG（由這些 PDF 以 pdftoppm 60dpi 轉出）和 browser-check.json。
- 手機 375px：照片分頁兩欄並排，沒有橫向溢出（document 寬 375）（tab-mobile-375.png）。

## R5 審查後修正（REVISE 1 項＋建議 1、4）
- **必須修正 1**：存檔成功但有檔案步驟失敗時，被刪的照片會重新出現。修法：`applyOutcome` 在這種結果下，把這次已經刪除成功的 id（deletedFileIds 扣掉 remainingDeletes）從照片分頁的 storedPhotos 拿掉；原因是畫面只會重新取得「上傳有完成」的那一類照片。第 8 段實測確認不會再出現。
- **建議 1**：新增 OBS 時也顯示「存檔後可調整順序」的提示。條件從 `canReorder` 改成 `canChangeFiles`（第 9 段實測）。
- **建議 4**：舊格式照片（data: URL）的雜湊加上快取，表單每次 render 不再重算。上限原本 200 筆，依 R6 建議 1 降為 40。
- 修正後：tsc 0；eslint 0（OBSModals、OBSPhotoPairs、obsPhotoOrder）；npm test 197/0；重建隔離環境，整支瀏覽器腳本 44 項都符合。

## 讀碼確認／已知
- 前端還沒有把 409 ATTACHMENT_LOCKED 翻成中文：Closed／Void 時畫面已經隱藏所有改照片的控制，正常操作不會碰到這個 409。要顯示翻譯，得等 REFUSAL 的翻譯機制套到 OBS 的存檔錯誤；這次沒有動 LanguageContext。
- 檔案 API（/api/files 上傳／刪除）在 OBS Void 時仍然不鎖，Closed 時「附件」類別仍然開放。這屬於 OBS-ATTACH-LOCK 的範圍，本輪不改。本輪只鎖 OBS 紀錄本身的四個欄位。
- 新選照片存檔前不能排序（協調中心已同意）。存檔後依預設規則排在最後。
- （R5 建議 2 → R7，協調中心決定）照片／附件四個欄位只有在 reopen 到非鎖定狀態（實際上只有 Open）時才放行；Closed→Void 那一次存檔改這些欄位會被擋（409）。新增 `reopens_files = is_reopening and not obs_locked(d.get('status'))`，加 3 個測試（含 4 個欄位的參數化），瀏覽器第 3 段也加了 API 檢查：Closed→Void 同時改附件 → 409，狀態仍是 Closed。productDisposition 維持現有規則，已由協調中心記進 BACKLOG。
- （R7 建議 → R8，協調中心決定併入本批）空白的 status 一律視為沒有改狀態：
  - `schemas.OBSUpdate` 的 `blank_status_is_no_change` 把 "" 和純空白轉成 None。
  - update_obs 把值為 None 的 status 從 d 拿掉，所以送 null 也不會再把狀態寫成 NULL。
  - 新增測試：正規化；Closed＋空白 status＋四個欄位 → 409（2×4 組）；Closed＋空白 status＋productDisposition → 400；空白和 null 都不會寫入空狀態；router 回 400。
  - 瀏覽器 API 檢查：Closed＋空白 status＋改附件 → 409，狀態仍是 Closed；改 productDisposition → 400，狀態仍是 Closed。
  - R8 建議（範圍外，已回報協調中心）：OBSCreate 收到空白 status 仍會存成空字串；空白或 null status 時，稽核紀錄的 new_value 會出現 `"status": None`。兩者都是基準就有的行為。
- （R5 建議 3）已存的照片欄位如果不是合法 JSON（資料損壞），比較時用原字串；但讀取時會被解析成 []，所以 Closed 或 Void 的這種紀錄用表單存檔一律回 409，除非同一次存檔 reopen。Closed 和基準行為相同（舊規則回 400）；Void 是新行為。這是保守的設計，刻意這樣做。
- （R5 建議 5）`core/attachment_access.py` 開頭的說明還寫著 OBS 由 `_LOCKED_OBS_FIELDS` 鎖、只有 Closed，已經過時，留給 OBS-ATTACH-LOCK 那批一起改。
- 只測了 Chromium。列印時「改善前｜改善後」表頭不會每頁重印，改以每列的「第 n 組」辨識（使用者已選這個方案）。

## 完整後端測試
- 最終程式碼（包含 R8），在沙箱外執行：`DATABASE_URL=sqlite:///<拋棄式目錄>/obs-full-pytest.db python3 -m pytest -q -p no:cacheprovider`
- 結果：**2670 passed, 1 skipped**，花了 50 分 30 秒，exit 0。warnings 都是既有的 Pydantic／datetime deprecation 警告。
- 本機是 Python 3.14；審查員另外用 `ast.parse(feature_version=(3,11))` 確認改動的檔案在語法上相容 3.11。
- 在沙箱裡執行會卡住（我和審查員都遇過），推測是有測試要綁定本機 port，所以改在沙箱外跑；資料庫和上傳目錄都用拋棄式的。

## 先前各輪（R1～R4，細節見 REVIEW 與 docs/workflow 歷史）
R1：上下兩段＋Closed／Void 前端鎖定。R2／R3：先上傳的排前面，舊格式在前。R4：列印改左右成對。R5（本次）：編輯畫面成對、↑↓ 排序存到 photoOrder、後端 Closed／Void 鎖四個欄位、每列標第 n 組、65mm、基準改為 15612688。R1～R4 的證據圖已被本輪重新產生的檔案取代。

## 審查
R1 PASS；R2 REVISE（1 項）→ 已修正；R3 PASS；R4 PASS；R5 REVISE（1 項）→ 已修正；R6 PASS（見 REVIEW）。R6 之後把雜湊快取上限從 200 改為 40（R6 建議 1，只改一個常數）；R7 PASS（Closed→Void 不算 reopen）；R8 PASS（空白 status 視為沒有改狀態）。

## 使用者確認與提交
- 2026-10-13：使用者在 3392 看過後回覆「OBS 可以」（協調中心轉達）。
- 提交方式：用臨時 GIT_INDEX_FILE，以 15612688 的 tree 為底，父節點是 15612688；只放本批的檔案，證據只放 PNG 和 JSON；不推送，不動任何 ref。完整 hash 交給協調中心。部署由協調中心安排，和 OBS-ATTACH-LOCK 合成同一個候選版。
