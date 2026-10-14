# FAT-SUPPLIER-NULL-2026-001 STATUS

TASK_ID: FAT-SUPPLIER-NULL-2026-001
worktree `focused-fermat-46fe7e`，基準 `26e454d9`（樹＝`2589c8d6`）。使用者 2026-10-13 在隔離預覽 3263 看完，回覆「FAT 可以」（協調中心轉達）；以臨時 index 提交，父節點 `2589c8d6`，未推送。

## 重現（修正前，實測）
隔離環境 `isolated_stack.py up --port 8263`（不使用 8198／3198、8240／3240），種子 `backend/scripts/verification/seed_fat_supplier_null_review.py`，步驟腳本 `evidence/repro.sh`＋`evidence/probe_fat_api.py`（admin 每次執行產生的密碼從執行目錄讀，不印出）。結果 `evidence/repro-before-fix.txt`：
1. `seed base`：專案 FSN-P1、承包商 FSN-V1「FAT Supplier Co」／FSN-V2「FAT Gone Co」、FAT FSN-OK（V1）、FSN-GONE（V2）。`GET /api/fat/` → 200。
2. `GET /api/fat/?search=Supplier` → **500** `'property' object has no attribute 'ilike'`。
3. 情況 1：`POST /api/fat/` supplier `""` → **500**（response 的 supplier 驗證失敗），但資料**已寫入**、vendor_id NULL；之後 `GET /api/fat/` → **500**。
4. 情況 2：supplier `"No Such Co"` → 同上（500、已寫入、列表 500）。
5. 更新 FSN-OK supplier `""`／`"No Such Co"` → 500，vendor_id 被改成 NULL，列表 500。
6. 情況 3：直接在資料庫刪除 FSN-V2（API 會擋被引用的承包商）→ FSN-GONE 的 vendor_id 懸空，`GET /api/fat/` 與 `GET /api/fat/FSN-GONE` → **500**。
7. 更新 supplier／equipment／startDate／endDate 為 null → 全部 500，且都已寫入 NULL，列表 500。

## 本輪實際修改
- `backend/schemas.py`
  - `FATUpdate`：新增 `reject_null`，`equipment`／`startDate`／`endDate` 明確送 null → 422（不送＝不變，與以前相同）。
  - `FAT`（回應）：`equipment`／`supplier`／`startDate`／`endDate` 改為可 null；覆寫 `check_dates`（能正規化就正規化，不能就照存的值回傳，不報錯）與 `check_date_ranges`（讀取時不檢查先後）。`FATBase`／`FATCreate` 不變，新建時的檢查照舊。
- `backend/services/fat_service.py`
  - 新增模組層 `_supplier_vendor_id(db, supplier)`：空字串／空白／null → `Refusal('FAT_SUPPLIER_REQUIRED')`；查無承包商 → `Refusal('FAT_SUPPLIER_NOT_FOUND', name=...)`。仍經由 `_resolve_vendor_id`（既有測試的 patch 點不變）。
  - `create_fat`：在交易開始前檢查（被拒時什麼都不寫，也沒有 audit）。**承包商帳號（scope.vendor_id）不檢查**：它的紀錄本來就一律被 `enforce_create_scope` 改成自己的承包商，維持原行為。
  - `update_fat`：送了 supplier 才檢查；`except Refusal` 只 rollback 再拋出，不記 error log。
- `backend/routers/fat.py`：create／update 加 `except Refusal → refusal_http(e, 400)`。
- `backend/repositories/fat_repository.py`：搜尋改為 `FAT.vendor_ref.has(Contractor.name.ilike(...))`。
- `react-app/src/components/FAT/FAT.tsx`
  - 列表搜尋 filter：各欄位以 `(value ?? '')` 比對，null 不再崩潰。
  - `FATEditModal.handleSave` 的 catch：由 `toast.error(err.message)`（只會顯示 "Request failed with status code 400"）改為 `console.error` ＋ `showRefusal(err, 'save')`。
  - **R2（使用者決定，協調中心 2026-10-13 轉達：審查 #1「拿掉預設，必填」）**：`handleSaveFATDetails` 新建分支拿掉 `activeContractors`／`defaultSupplier`，`supplier: updates.supplier || ''`。沒選供應商時前端不另擋，交給後端回 `FAT_SUPPLIER_REQUIRED`，只由 `FATEditModal.handleSave` 的 `showRefusal` 顯示一次。新建流程的其他行不動（NOI B2 範圍）。
- `react-app/src/components/FAT/columns.tsx`：供應商欄沒有值時顯示 `-`。
- `react-app/src/context/LanguageContext.tsx`：只新增 `refusal.code.FAT_SUPPLIER_REQUIRED`／`FAT_SUPPLIER_NOT_FOUND` 中英各 1 鍵（CRLF 保留）。
- 測試
  - 新增 `backend/tests/test_fat_supplier_null.py`（40 個案例；每個都在 `PRAGMA foreign_keys` 關／開兩種資料庫上跑：關＝本 app 的 SQLite，刪承包商後 vendor_id 懸空；開＝SET NULL 生效）。涵蓋：三種情況的讀取、legacy 缺欄位／日期順序錯／格式錯、搜尋、新建與修改的三種拒絕且資料與 audit 不變、null equipment／日期 422、孤兒紀錄可改其他欄位與修復供應商、承包商帳號維持原行為。
  - `react-app/tests-unit/refusal.test.ts`：新增 FAT 兩個 code 的中英文案測試；PARAMS 對照表登記兩個新 code。
- 預覽 launcher：`react-app/tests-browser/fat-supplier-null-vite-launcher.mjs`（3263 → 8263，cacheDir `.vite/fat-supplier-null`）。
- 種子與證據：`backend/scripts/verification/seed_fat_supplier_null_review.py`（隔離環境限定，模式 base／drop-contractor／legacy）；`docs/workflow/FAT-SUPPLIER-NULL-2026-001-evidence/`。
- CRLF：`fat_service.py`、`routers/fat.py`、`fat_repository.py`、`columns.tsx`、`LanguageContext.tsx` 以二進位方式改寫，保留 CRLF；`git diff --stat` 只有實際改的行。

## 證據
- 實測（API，隔離環境）：`evidence/repro-after-fix.txt`，同一套步驟：搜尋 200；情況 1／2 新建 400 並帶 code，資料庫沒有新增；修改 400，vendor_id 不變；情況 3 列表與單筆 200、supplier null；null equipment／日期 422 且不寫入；legacy 列（無供應商、無設備與日期、日期順序錯、`2026/10/01`）列表 200。
- 新測試在舊程式（`git archive HEAD` 複本）上：`evidence/pytest-new-tests-on-OLD-code.txt` → 30 failed、10 passed（通過的是行為不變的案例：缺 supplier 欄位 422、正常新建、承包商帳號 3×2）。
- 後端相關測試（Python 3.14，拋棄式 DATABASE_URL）：`evidence/pytest-fat-related.txt` → test_fat_supplier_null、test_fat_service、test_reviewed_audit_paths_http、test_remaining_audit_paths_http、test_refusal_codes_http、test_schemas、test_scope_all_modules → **208 passed**。
- 後端全套（Python 3.14，沙箱外）：2734 passed、1 skipped，見下方「全套」。
- 前端：`tsc --noEmit` exit 0（`evidence/frontend-tsc.txt`）；`npm test` 198/198（`evidence/frontend-npm-test.txt`）；eslint（FAT.tsx、columns.tsx）exit 0；`vite build` exit 0，輸出到暫存目錄，bundle 含 `FAT_SUPPLIER_NOT_FOUND`（`evidence/frontend-vite-build.txt`）。worktree 的 `react-app/node_modules` 是指向主 checkout 的 symlink，提交前移除。
- 瀏覽器實測（審查後，隔離 8263／3263，seed base＋drop-contractor＋legacy，admin 登入，中文介面）：FAT 列表 6 筆都顯示，承包商被刪與無供應商的兩筆供應商欄顯示 `-`；搜尋「co」正常過濾、不崩潰；開啟承包商被刪的那筆、不選供應商直接儲存 → 彈窗「無法儲存／請選擇供應商：從清單中選一個承包商。」，編輯視窗保留。
- R2 瀏覽器實測（同一個 3263，重新整理）：「新增 FAT」供應商欄一開始是「請選擇承包商」；填專案、設備名稱後不選供應商按儲存 → 彈窗只出現一次「無法儲存／請選擇供應商：從清單中選一個承包商。」，視窗保留；network 只有一個 `POST /api/fat/ → 400`；列表仍 6 筆。選「FAT Supplier Co」再存 → 成功，列表 7 筆。
- R2 後重跑前端：tsc 0、eslint 0、npm test 198/198、vite build 0（bundle index-CUH2BTdD.js 含兩個 code）。
- 未測：Python 3.11（協調中心合批時跑）。

## 全套
- 後端全套（Python 3.14，沙箱外，拋棄式 DATABASE_URL，`-x`）：**2734 passed、1 skipped、0 failed**（54 分 31 秒，`evidence/pytest-full-py314.txt`）。在 R1 程式上跑（審查前開始）；之後只改了 `schemas.py` 的 FAT 回應 docstring（行為不變）和前端，所以結果仍適用。
- 沒有跑 Python 3.11（協調中心合批時跑）。

## 後續（不在本批）
- `FATUpdate` 沒有日期格式與先後檢查（`FATCreate` 有）：更新仍可存入 `2026/10/01` 或開始晚於結束。讀取端已容錯，不會再讓列表 500；寫入端是否要擋，待決定。
- 其他模組是否也會把 vendor_id 悄悄寫成 NULL（`_resolve_vendor_id` 查無時回 None）：未檢查。
- （已由 R2 處理）審查 #1 的預設供應商。
- 合併注意：NOI B2 若在 `handleSaveFATDetails` 的 create 分支加 `showRefusal`，而 `FATEditModal.handleSave` 的 catch 也呼叫 `showRefusal`，同一個錯誤會開兩次彈窗（後一次蓋掉前一次，內容相同）。合併時兩邊擇一。
