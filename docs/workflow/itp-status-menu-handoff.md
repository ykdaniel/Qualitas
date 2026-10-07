# ITP 狀態下拉與後端不一致 — 交接紀錄

2026-09-28，Claude Code 實作並執行以下驗證。未 commit/push/部署。

## 問題核對（實測，非僅引用舊報告）

先重新核對目前程式碼，不是引用先前批次的結論：

- `backend/core/utils.py::WorkflowEngine.TRANSITIONS["ITP"]`（後端唯一的合法轉換依據）：
  ```
  Draft → [Pending, Void]
  Pending → [Approved, Approved with comments, Revise & Resubmit, Void]
  Approved → [Approved with comments, Void, Pending]
  Approved with comments → [Pending, Revise & Resubmit, Void]
  Revise & Resubmit → [Pending, Void]
  Void → []
  ```
  `"Rejected"` 與 `"No submit"` **完全沒有出現**在這個表裡（不是任何狀態的來源，也不是任何狀態的目標）。
- `WorkflowEngine.validate_transition`：同狀態原值重送一律合法；否則用 `rules.get(current_status, [])` 查合法目標——查不到的 `current_status`（含 `Rejected`／`No submit`／任何未知歷史值）一律回傳空清單，也就是這些狀態本身**也不是**合法的轉換來源，只能原值重送。
- 修正前的 `react-app/src/components/ITP/ITPModals.tsx` 狀態 `<select>`：不論目前狀態為何，一律無條件提供 `Revise & Resubmit`／`Rejected`／`Pending`／`No submit` 四個選項（`Approved`／`Approved with comments`／`Void` 已由前一批的核准／作廢授權批次加上權限判斷，但同樣沒有依「目前狀態的合法目標」過濾）。也就是說即使是後端已知的合法狀態（如 `Approved with comments`），從它出發也會被錯誤地提供 `Approved` 這個選項——但 `TRANSITIONS["Approved with comments"]` 並不包含 `"Approved"`（方向不對稱，只有 `Approved → Approved with comments` 合法，反向不合法），選了會被後端 400 拒絕。

以上為本輪重新讀碼＋隔離環境實測confirmed，不是重複先前報告。

## 修正範圍（最小修正，未動後端）

- `react-app/src/components/ITP/ITPModals.tsx`：新增 `ITP_STATUS_TRANSITIONS`（逐字對應後端 `TRANSITIONS["ITP"]`，僅供前端顯示過濾用，未同步機制，若後端表未來變動需手動同步）。狀態下拉只提供：
  1. 目前狀態本身（原值重送／如實顯示，即使是後端不認得的歷史值）。
  2. 從目前狀態出發、後端合法轉換到的目標，且若目標是 `Approved`／`Approved with comments` 需 `canApprove`、目標是 `Void` 需 `canVoid`（沿用前一批已有的權限判斷，未新增權限規則）。
- 若目前狀態是完全無法辨識的字串（不在上述任何已知狀態清單中），額外注入一個對應該值的選項並顯示提示文字「此紀錄的狀態不在本畫面已知的範圍內，直接如實顯示，不會被轉換成其他數值」——不清洗資料、不預設成 Pending。
- 未修改 `core/utils.py` 的 `TRANSITIONS` 表、未修改任何路由或服務層邏輯、未新增權限碼、未變更提醒時程或業務狀態定義。

## 檔案

- `react-app/src/components/ITP/ITPModals.tsx`（狀態下拉過濾邏輯）
- `react-app/src/context/LanguageContext.tsx`（新增 `itp.status.unrecognized`／`itp.status.unrecognizedHint` 中英文字串）
- `react-app/src/components/IAM/UserScopeSection.tsx`（上一批 IAM Data Scope 收尾時的文件用詞更正：`retryScope` 註解原稱「按鈕停用所以不可能有未保存編輯」，實際核對後發現專案核取方塊與承包商下拉在 `scopeError` 期間並未被停用，已更正為如實描述，未改變行為）
- 新增 `backend/scripts/verification/seed_itp_status_menu_review.py`
- 新增 `react-app/tests-browser/itp-status-menu-review.mjs`

## 已執行驗證

- `tsc --noEmit`：通過。
- `npm test`：91 passed（沿用上一輪協作者新增的 project_id 測試，本輪未再新增單元測試——純前端選項過濾邏輯，已用隔離瀏覽器實測覆蓋）。
- Vite production build：通過（寫入 `react-app/dist`，該目錄已在 `.gitignore`，不影響版本控制）。
- 隔離環境真實登入、真實畫面、真實 API、真實資料庫：首輪 26 項斷言全數通過，涵蓋：
  - Pending 狀態下拉提供的選項與後端合法目標集合完全一致（`Approved`／`Approved with comments`／`Revise & Resubmit`／`Void`，各自依權限判斷），`Rejected`／`No submit` 皆不再出現。
  - `Approved with comments` 出發不再誤提供 `Approved`（不對稱轉換已正確排除），但仍正確提供 `Pending`／`Revise & Resubmit`／`Void`。
  - `Void`（終態）下拉只剩 `Void` 自己。
  - 歷史 `Rejected`／`No submit` 紀錄：下拉只顯示各自本身，如實反映「這兩個狀態本身也無法轉出」。
  - 完全未知的歷史狀態字串：如實顯示＋明確提示，未被改成 Pending。
  - 合法轉換（Pending → Revise & Resubmit）透過真實畫面成功並寫入資料庫。
  - 無 `itp:approve:all`／`itp:void:all` 的帳號：畫面上看不到 `Approved with comments`／`Void` 選項；直接呼叫 API 嘗試進入 `Void` 仍被後端 403 拒絕，資料庫未變。
  - 回歸：一般欄位編輯、同狀態原值重送、Publish（含核准權限帳號）皆維持正常運作。

## 重跑方式（從 backend/ 目錄）

```sh
python scripts/verification/isolated_stack.py up --vite-script <既有的 vite_multi.mjs 或本輪 project-create-vite.mjs> > stack.json
python scripts/verification/isolated_stack.py seed --root <root> --script scripts/verification/seed_itp_status_menu_review.py
node ../react-app/tests-browser/itp-status-menu-review.mjs stack.json
python scripts/verification/isolated_stack.py down --root <root>
```

## 補充核對（2026-09-28，同日第二輪）

使用者要求核對一個邊界：合法目標是否依「已保存的原狀態」計算，而不是每次隨使用者操作變動的表單當下選值。

**核對結果：原本確實依表單當下選值計算，是一個真實缺陷。** 已修正並實測：

- `ITPModals.tsx` 原本用 `const currentStatus = formData.status || 'Pending'` 同時做兩件事：(a) 綁定 `<select value>`，(b) 計算 `legalTargets`。問題在 (b)：`formData.status` 是使用者當下（可能尚未儲存）的選擇，一旦改變，下拉選項會立刻依「剛選的新值」重新計算，而不是依「資料庫實際的原狀態」。
- 修正：拆成兩個變數。`baselineStatus = existingItem?.status || 'Pending'`（既有紀錄用實際已保存的狀態；**新建**則依目前建立流程的起始狀態 `'Pending'`——與 `handleAddNew` 的預設值一致，不是另外定義新規則）僅用於計算 `legalTargets`／`isUnrecognized`／選項清單；`currentStatus = formData.status`（表單當下選值）只用於 `<select value>` 綁定，不再參與選項計算。
- 實測（隔離環境，同一個未儲存的畫面操作內）：`ism-itp-approved-w-comments`（原狀態 `Approved with comments`，合法目標為 `Pending`／`Revise & Resubmit`／`Void`，不含 `Approved`）→ 在畫面上選擇合法目標 `Pending`（未儲存）→ 重新讀取下拉選項 → 選項與選擇前**完全相同**，`Approved` 依然不存在——證實選了合法目標但不儲存，不會解鎖原狀態不允許的下一步。資料庫全程未變。

## 補充核對：歷史未知狀態的兩種情境分開驗證

- **畫面保留原值與提示**：先前批次已測（見上）。
- **實際修改一般欄位、原狀態重送是否保存成功**：先前**未測過**，本輪補測：對 `ism-itp-legacy-unknown`（狀態 `LegacyUnknownStatus123`）修改「主旨」欄位、狀態原值重送，點擊儲存 → **成功**，資料庫確認主旨已更新且狀態仍是原本的未知值，未被覆寫或清洗。這是因為後端 `WorkflowEngine.validate_transition` 對「新狀態＝原狀態」一律視為合法，與新狀態是否被辨識無關；此行為屬既有後端邏輯，本輪未修改。

## 未驗證／獨立待辦（如實記錄，不宣稱已涵蓋）

- 本輪只跑了與本次修改直接相關的隔離瀏覽器測試與型別/單元/建置檢查，**未重跑完整後端套件**（後端程式碼本身完全未修改，無新後端邏輯需要後端測試覆蓋）。
- `ITP_STATUS_TRANSITIONS` 是前端手動維護、對應後端表的一份複本，**沒有自動同步機制**——後端 `core/utils.py::WorkflowEngine.TRANSITIONS["ITP"]` 未來若變動，這裡需要手動跟著改，否則會重新出現前後端不一致。
- `"Draft"` 狀態在目前的建立/更新流程中實際上不會被設定（`handleAddNew` 一律以 `Pending` 起始），本輪未新增其翻譯字串或作為可選目標；只有在某筆歷史紀錄真的是 `Draft` 時才會依「目前狀態原值」規則正確顯示。未特別造這類測資獨立驗證，只有邏輯上與其他已測的「未知/歷史狀態」路徑相同函式覆蓋。
- 未處理、也未在本輪範圍內：ITP 新增流程對多專案帳號缺專案選擇的既有缺口（已由另一批協作者處理，見 [FAT／ITP 專案選擇交接紀錄](fat-itp-project-selection-handoff.md)）；附件上傳權限邊界問題（見 ITP deferred-create 批次報告，未變動）。

## Claude 接手時注意

- 工作區存在其他協作者尚未提交的修改（多專案選擇、停用帳號新指派、排程提醒收件人）；本輪只讀取、未還原、未 stash/reset/checkout，也沒有把這些檔案的既有 diff 當成本輪修改上報。
- 本輪未 commit、push 或部署。
