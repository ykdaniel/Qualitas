# REVIEW — OBS-PRINT-PHOTOS-2026-001（+ closed lock）

TASK_ID: OBS-PRINT-PHOTOS-2026-001
審查者：獨立 Claude（Agent，只讀；沒有改程式、沒有啟動伺服器）
基準：worktree `cranky-sinoussi-b7a144`，分支 `fix/obs-print-photos`，對照 632cf475

## R1 結論：PASS

沒有必須修正的問題。列印排版與 Closed／Void 鎖定都符合 TASK；STATUS 經讀碼與證據核對正確。

### 核對要點
- **排版**：`PhotoSection` 先放改善前（defectPhotos）再放改善後（improvementPhotos），`afterBelowBefore` 全為 true。`.photo-row` 為 `1fr 1fr`：1 張落在左欄、右欄空白，不放大不置中（inprogress-2-1、void-1-1）；3 張排成 2+1（open-3-3）；框固定 72mm、`object-fit: contain`。0 張顯示 field-box／guide「（尚無照片 No photos）」（open-2-0）。
- **分頁**：`.photo-keep`（段標題 + 第一列；上段含「6. 照片」）、`.photo-row`、`.photo-item` 為 `break-inside: avoid`，`.subhead` 為 `break-after: avoid`。open-3-3 的「改善後 After」與第一列一起移到第 3 頁；closed-2-2 第 2 頁放下 2+2 且有餘白。
- **CSS 洩漏**：新增／修改選擇器都在 `.obs-print-root` 下；移除的 `.photo-grid` 在 OBS 內已無引用，OSD／NCR／Material 的同名 class 各自 scoped，未動。
- **鎖定**：`filesLocked` 只看 `existingItem?.status`（與 ITR isLocked 相同），新增時不鎖；三個 FileAttachment 的上傳、待上傳／已存／舊格式的 ✕ 都隱藏，預覽照常；reopen 存檔後 modal 關閉，重開時依新狀態解鎖（`unlocked-after-reopen.png`）；說明文字與 TASK 一致。存檔流程、結案照片檢查、SaveFollowUpBanner 未改。
- **前後端不一致**：STATUS 對 `core/attachment_access.py` 的描述正確（Closed 只鎖兩種照片，`attachment` 開放；Void 後端不鎖，列於 PENDING_STATE_DECISIONS）。
- **範圍**：tracked 改動只有 OBS.print.css、OBSModals.tsx、OBSPrintTemplate.tsx；LanguageContext、NOI、後端程式、COORDINATION.md、根目錄 TASK/STATUS/REVIEW 未動；OBSModals.tsx 維持 LF、100755。
- 審查者執行：tsc exit 0；eslint（兩個改動檔）exit 0；npm test 173／0。

### 非阻擋建議與處理
| # | 建議 | 處理 |
|---|------|------|
| 1 | 兩段都 0 張時整節不印（原行為），TASK 的「0 張顯示框」可能也涵蓋這種情況 | 未改，交使用者決定 |
| 2 | 既有流程問題：同一次存檔「結案 + 加照片」時，紀錄先寫成 Closed，接著上傳照片被後端 409 擋；本輪後畫面會顯示鎖定、待上傳照片沒有 ✕，但重試按鈕仍在且會再被擋 | 632cf475 就存在，範圍外；回報協調中心建議另開 BACKLOG |
| 3 | seed 沒有防呆，直接執行會寫入預設 DB | 已修：未設 DATABASE_URL／QUALITAS_UPLOAD_ROOT 時拒絕（實測 exit 1） |
| 4 | 測試腳本註解寫 Resolved（實為 Open）；`printCalled` 欄位無意義 | 已修：改註解、移除該欄位，重跑實測 |
| 5 | 證據目錄有空的 `.claude/` 資料夾 | 已刪 |
| 6 | 照片順序新的在前（`/api/files` 依 uploaded_at 由新到舊） | 原行為，交使用者決定 |
| 7 | 只測 Chromium；第 1–5 節很短時第一列可能與文字同頁 | STATUS 已揭露 |

修正 3、4、5 只動 seed、測試腳本與證據，未動產品程式；修正後重跑瀏覽器實測，結果與 R1 相同（6 個列印情境全符合、鎖定 6 項符合）。

## R2 差異複查（照片排序改為先上傳的在前）

審查者：獨立 Claude（Agent，只讀）。範圍：TASK 第三節 (b)、STATUS「R2」。

### R2 結論：REVISE（1 項必須修正）
- **必須修正 1**：同一類別同時有舊格式（字串）照片和已上傳照片時，畫面順序是「已存檔（由舊到新）→ 待上傳 NEW → 舊格式」（FileAttachment.tsx 原本的輸出順序），列印卻是「舊格式 → 已存檔」，違反「列印與畫面一致」。舊格式照片一定早於集中上傳，建議 `oldestFirst` 時改成「舊格式 → 已存檔 → 待上傳」，只影響有傳這個 prop 的地方，並在實測加上混合的情況。

### 通過的部分
- 排序正確：正式環境只有 file_router.py:338 寫入 `uploaded_at`（`datetime.now(timezone.utc).isoformat()`），格式從 7d691b7c 起沒變過。微秒為 0 時省略小數也不影響字串比較（`+` < `.`），和 SQLite BINARY 排序一致。排序穩定，且不改動傳入的陣列。
- FileAttachment：`oldestFirst` 預設 false，其他 9 個使用處不受影響；useEffect 依賴加了固定的 prop，不會多抓；CRLF 保留；外部傳入 `attachments` 的路徑不排序（OBS 沒有使用）。
- 只有已上傳照片時，畫面與列印順序一致（證據第 3 段）。結案照片檢查只算數量；刪除與 syncToken 重抓都保留順序。
- FileAttachment 的 eslint error 是基準就有的：以 `--stdin` 跑基準版本，第 78 行有同一個 error，R2 沒有碰那段程式。
- tsc exit 0；改動檔 eslint exit 0；npm test 177／0；範圍內沒有動 LanguageContext、api.ts、NOI 檔、後端程式。

### 非阻擋建議與處理
| # | 建議 | 處理 |
|---|------|------|
| 1 | 既有問題：畫面按 ✕ 刪除已存檔照片、還沒存檔就列印，列印仍會印出那張照片（handlePrintClick 沒有排除 deletedFileIds） | 基準就有，未修；回報協調中心列入 BACKLOG |
| 2 | attachmentOrder.ts 的註解「正好是伺服器順序反過來」與「時間相同時維持原順序」矛盾 | 已修 |
| 3 | `oldestFirst` 的說明應註明不排序外部傳入的 `attachments` | 已修 |
| 4 | 實測沒有涵蓋舊格式照片混合的情況 | 已補：seed 第 7 筆、腳本第 3 段 |

修正內容見 STATUS「R2 複查後修正」。

## R3 複查（R2 REVISE 第 1 項的修正）

審查者：同一位獨立 Claude（Agent，只讀）。

### R3 結論：PASS
- R2 必須修正 1 已修好：同一類別有舊格式照片和已上傳照片時，畫面與列印都是「舊格式 → 已上傳（由舊到新）」。browser-check.json 000004：Legacy、before-1、before-2、Legacy、after-1，列印逐一比對 `src` 相同；截圖 order-legacy-tab.png、legacy-mixed-page-2.png 一致。
- `oldestFirst=false` 的其他模組與基準相同：`{oldestFirst && renderLegacy()}` 在 false 時不輸出；舊格式區塊仍在原位置，內部 18 行與基準逐行相同（key、alt、style、onClick、✕ 條件都一樣）。
- `renderLegacy` 在 render 當下執行，readOnly、onRemoveLegacy、onPreview 行為不變；OBS 鎖定時舊格式照片的 ✕ 照舊隱藏。
- FileAttachment.tsx 401 行全為 CRLF，+35／−24，沒有權限變動；OBSModals.tsx 維持 LF。
- 審查者執行：tsc exit 0；改動檔 eslint 無問題（FileAttachment 只有基準就有的 set-state-in-effect，與 632cf475 對照相同）；npm test 177／0；seed py_compile 通過。

### 非阻擋建議與處理
| # | 建議 | 處理 |
|---|------|------|
| 1 | `tests-browser/obs-print-photos-check.mjs` 用 eslint 檢查會有 `no-undef`（process）與 `no-console`；`npm run lint` 只檢查 src，其他 tests-browser 腳本也一樣 | STATUS 已註明 eslint exit 0 只涵蓋 src 與 tests-unit |
| 2 | 刪除後還沒存檔就列印，待刪除照片仍會印出（基準就有） | 回報協調中心列入 BACKLOG |

## R4 差異複查（左右成對）

審查者：獨立 Claude（Agent，只讀，未啟動伺服器）。

### R4 結論：PASS
- TASK 第四節全部符合：
  - 表頭一列「改善前 Before｜改善後 After」。
  - 第 n 列左邊是 before[n]、右邊是 after[n]。000003、000004 的左右欄順序與分頁一致。
  - 缺照片的格子顯示「無對應照片 / No corresponding photo」，虛線框與照片框同高（72mm＋padding＋border = `calc(72mm + 10px)`）。
  - 只有一邊有照片時照樣排成兩欄。
  - 節標題、表頭和第 1 組放在同一個 `.photo-keep`，每列都不分頁。
  - 兩邊都沒有照片時整節不印（讀碼確認，這輪沒有實測 0／0）。
  - 順序沿用 OBSModals 傳入的 oldestFirst。
- 程式：pairCount 為 0 時被 `hasPhotos` 擋住，就算直接呼叫也不會拋錯；只有一邊有照片時另一格是 undefined，顯示「無對應照片」；列印清單是靜態的，用索引當 key 沒問題。
- CSS：新增、修改的選擇器都在 `.obs-print-root` 下，其他模組的同名 class 各有自己的 scope；已刪除的規則在 OBS 內沒有人使用。
- 範圍：這輪只改了 OBSPrintTemplate.tsx、OBS.print.css 和檢查腳本；LanguageContext、api.ts、NOI 檔案、後端程式都沒有動。
- 審查者執行：tsc exit 0；兩個 OBS 檔的 eslint exit 0；npm test 177／0。

### STATUS「已知」兩點
- (a) 3 組照片剛好填滿一頁時，頁尾單獨佔一頁：屬實。STATUS 原本寫「版面原本就有」，但沒有證據，已改寫。
- (b) 第 4 組以後換頁時，表頭不會重印：讀碼確認屬實，這輪沒有實測。
- 兩點都是外觀問題，不阻擋，預覽時告訴使用者。

### 非阻擋建議
1. 頁尾單獨一頁：可以把照片高度 72mm 調小（例如 68mm），重跑 PDF 確認。
2. 表頭不重印：可以在每格加小字編號，或改用 `<thead>`（需要實測巢狀 thead 在 Chrome 會不會重印）。這和協調中心等使用者回答的「列印每列加第 n 組」是同一件事。
3. 檢查腳本的順序比對先拿掉了空格，所以只比順序不比位置；位置靠另一項「pairs」輸出補上。
4. 證據裡沒有 0／n（只有改善後）和 4 組以上的情境。程式兩邊對稱，讀碼看沒有問題。
5. 用臨時 GIT_INDEX_FILE 提交時，不要把 `react-app/node_modules`（symlink）加進去。

## R5 審查（編輯畫面成對＋排序＋鎖定補齊）

審查者：獨立 Claude（Agent，只讀，未啟動伺服器）。基準以 `git diff 15612688` 比對。審查時，「結案／作廢遇到待處理檔案」（TASK 第六節）還沒加入，這部分交由 R6 審查。

### R5 結論：REVISE（1 項必須修正）
- **必須修正 1**：存檔成功但有檔案步驟失敗時，畫面上會重新出現已刪除的照片。
  - 原因：storedPhotos 只在 recordId 或 syncTokens 改變時重新取得；applyOutcome 把 deletedFileIds 改成 remainingDeletes，但只對上傳完成的類別遞增 syncToken。
  - 情境：刪掉一張照片，同時另一類別的上傳失敗。照片已在伺服器刪除，但會以破圖重新出現，而且還能按；再刪一次會回 404，形成重試迴圈。
  - 屬於回歸：基準的 FileAttachment 會在本地把刪除的檔案移除，現在的元件沒有。列印不受影響。

### 通過的部分（摘要）
- TASK 第五節逐項符合：畫面成對、↑↓ 只在自己那一欄、photoOrder 存到後端且畫面和列印一致、鍵的格式、退回 oldestFirst、Closed／Void 回 409 ATTACHMENT_LOCKED 且 params 正確、`obs_locked` 與指定內容逐字相同、update_obs 鎖四個欄位、productDisposition 回 400 不變、列印標第 n 組並用 65mm、1～4 組沒有空白頁、FileAttachment 與 15612688 相同。
- 後端：
  - normalize 與 schema 覆寫，審查者實際呼叫確認過。
  - 表單整筆重送不會誤判有改動。
  - router 的 except 順序正確。
  - migration 有測試。
  - 語法相容 Python 3.11（以 ast.parse(feature_version=(3,11)) 檢查）。
- 前端：effect 的 alive 旗標、legacyOf 的索引對應、待上傳照片的 object URL、新增紀錄、leaveGuard、handlePrintClick 都正確。
- CRLF：5 個 CRLF 檔案全檔仍是 CRLF；其他檔案和基準一樣是 LF；沒有檔案權限變更。
- 範圍：LanguageContext、api.ts、file_router、FileAttachment、Shared 目錄、NOI 都沒有改。
- 審查者執行：tsc 0；npm test 197/0；eslint 只有 OBS.tsx:94，基準就有；OBS 相關 pytest 62 passed；完整後端測試約 30 分鐘沒有輸出，已中止。

### 非阻擋建議與處理
| # | 建議 | 處理 |
|---|------|------|
| 1 | 新增 OBS 時沒有「存檔後可調整順序」提示 | 已修（條件改為 canChangeFiles，第 9 段實測） |
| 2 | Closed→Void 的那次存檔也算 reopen，會放行四個欄位（現有規則） | STATUS 已註明，交協調中心決定 |
| 3 | 已存資料損壞時，Closed／Void 表單存檔回 409（保守設計） | STATUS 已註明 |
| 4 | 舊格式照片每次 render 都重算雜湊 | 已修（雜湊加快取） |
| 5 | attachment_access.py 開頭說明已過時 | 留給 OBS-ATTACH-LOCK |
| 6 | STATUS 的完整後端測試還沒有結果 | 改在沙箱外重跑，結果補進 STATUS |
| 7 | seed 防呆只檢查環境變數 | 維持現狀（一律透過 isolated_stack 執行） |

## R6 delta 複查（R5 修正＋結案／作廢遇到待處理檔案）

審查者：同一位獨立 Claude（只讀）。

### R6 結論：PASS
- **R5 必須修正 1 已修好**：applyOutcome 在 saved-incomplete 時，把這次刪除成功的 id 從 storedPhotos 移除。全部失敗和部分失敗兩種情況都正確；後者有第 8 段實測，前者以讀碼確認。
- **R5 建議 1、4 已修好**：提示的條件改成 `hasPending && canChangeFiles`（第 9 段實測）；雜湊加了快取。
- **TASK 第六節**：
  - 待處理檔案的檢查放在所有 await、setSaving、onSave 之前。第 7a、7c 段實測寫入請求為 0。
  - 已鎖定的紀錄不可能有待處理檔案，所以不會被誤擋。
  - 改回 Open 的存檔不受影響（7e）；photoOrder 和結案放在同一次存檔不會被擋（7f）。
  - 結案照片檢查只算已存檔的照片。
  - 共用的 saveFlow.ts 沒有改。
- **和 NCR 的做法對照**：
  - 相同處：寫入前就擋、不算待上傳的照片、用 toast.warning、切換分頁、分兩次存檔。
  - OBS 比較嚴的地方：任何待處理檔案都擋，作廢也擋（TASK 6.2）。
  - 抓取失敗時，OBS 改用已載入的清單判斷，屬於保守的處理。
- **範圍與換行**：只多改了 OBSModals.tsx；CRLF 檔案沒有混用換行；NCR、LanguageContext、api.ts、Shared、file_router 都沒有動。
- **審查者執行**：tsc 0；npm test 197/0；改動檔 eslint 0；讀過 browser-check 全部 44 項和相關截圖。

### 非阻擋建議與處理
| # | 建議 | 處理 |
|---|------|------|
| 1 | 雜湊快取上限 200，大型 data: URL 可能占不少記憶體 | 已改為 40（只改常數；tsc、eslint、npm test 197/0 重跑通過） |
| 2 | 7b 的狀態從 Resolved 變成 Open，是 seed 資料造成的 | STATUS 已說明 |
| 3 | 完整後端測試的結果要補上 | 改在沙箱外重跑中，結果補進 STATUS |

## R7 delta 複查（Closed→Void 不算 reopen）

協調中心決定（常設授權，可回復、低風險）：四個照片／附件欄位只有在「這次存檔的目標狀態不屬於 obs_locked」時才放行。productDisposition 維持現有規則，已記進 BACKLOG。

### R7 結論：PASS（同一位獨立 Claude，只讀）
- 新增 `reopens_files = is_reopening and not obs_locked(d.get('status'))`，鎖定條件改成 `obs_locked(db_obs.status) and not reopens_files`。
  - Closed→Open：放行。
  - Closed→Void：照常檢查，欄位有變就回 409。
  - 不送狀態或送 Closed：和原本一樣。
  - WorkflowEngine 規定 Closed 只能轉成 Open 或 Void，所以實際放行的只有 Open。
- 已存檔是 Void 時行為不變（`is_reopening` 一定是 False）；productDisposition 那條路徑的條件沒變。
- 前端不需要修改。新測試「Closed→Void，照片欄位沒變就可以作廢」涵蓋了表單整筆重送的情況。
- obs_service.py 全檔 303 行都是 CRLF；以 3.11 語法檢查通過。
- 審查者執行：test_obs_photo_order 與 test_obs_service 共 58 passed。

### 非阻擋建議與處理
| # | 建議 | 處理 |
|---|------|------|
| 1 | 基準就有的問題：直接呼叫 API 送 `status: ""` 時，會跳過狀態轉換檢查；`is_reopening` 會把它當成 reopen，於是 Closed 的 OBS 可以改這四個欄位和 productDisposition，狀態還會被寫成空字串。前端不會送空字串。 | 不在本輪範圍，已回報協調中心建議列入 BACKLOG（空字串的 status 當成 None 或直接拒絕） |

## R8 delta 複查（空白 status 視為沒有改狀態）

協調中心決定把 R7 指出的「status 空字串會繞過檢查」併進這批修正。修法是正規化，不是拒絕。

### R8 結論：PASS（同一位獨立 Claude，只讀）
- OBSUpdate 新增 `blank_status_is_no_change`：空字串和純空白都轉成 None。OBSCreate／OBSBase 沒有改。
- update_obs 在 `model_dump` 之後會把值為 None 的 status 拿掉。原因是送 null 時 status 仍會出現在 d 裡，這一步是必要的。
  - 修改前，送 null 會把狀態寫成 NULL；現在狀態維持原值，比較正確。
  - `is_reopening`、`reopens_files` 會把它判為「沒有改狀態」；其他邏輯不讀 status。
- Closed 加上空白 status 時：四個照片／附件欄位照樣回 409（2 種空白 × 4 欄位）；productDisposition 照原本規則回 400。狀態和欄位值都不變。
- 前端一定送非空的 status，不受影響。obs_service.py 全檔 305 行都是 CRLF。用 3.11 語法檢查通過。
- 審查者執行：OBS 相關 79 passed，並實際呼叫 schema 確認行為。

### 非阻擋建議與處理
| # | 建議 | 處理 |
|---|------|------|
| 1 | OBSCreate 收到空白 status 仍會存成空字串（基準就有） | 範圍外，回報協調中心建議記進 BACKLOG |
| 2 | 送空白或 null status 時，稽核紀錄的 new_value 會出現 `"status": None`（基準送 null 時也一樣） | 不改（會動到稽核格式），回報協調中心 |
| 3 | 瀏覽器第 3 段新增的兩個 API 檢查要實測 | 已實測：Closed＋空白 status＋改附件 → 409，狀態仍是 Closed；Closed＋空白 status＋改 productDisposition → 400，狀態仍是 Closed |
