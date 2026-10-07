# ITP「產生 Checklist」權限入口 + 發布確認彈窗 — 交接紀錄

2026-09-28，Claude Code 實作並執行以下驗證。未 commit/push/部署。

延續同一輪「建立 ITP → 編寫檢驗計畫 → 核准 → 產生 Checklist 範本」真實畫面操作找出的 4 項 UI/UX 改善建議，本批依使用者指示只實作第 1、4 項；第 2 項（空白檢驗項目）僅維持既有觀察、不新增必填規則；第 3 項（複製項目）留待下一批。

## 問題重現（實作前）

真實隔離瀏覽器操作觀察到：

1. Generate Checklist 按鈕完全未依 `checklist:create:all` 顯示或隱藏，沒有此權限的帳號仍看得到、點得到；點擊後失敗時，toast 直接顯示後端原始權限碼字串（`Operation not permitted. Required: checklist:create:all`）。
2. Publish 使用瀏覽器原生 `window.confirm()`，訊息是固定文字，沒有顯示這次實際的目標版次／狀態，也無法區分「真的要發布」與「其實只是補做附件的重試」。

## 本批修正

### 1. Generate Checklist 權限入口

- `ITPDetailModalProps` 新增 `canCreateChecklist?: boolean`（對應 `checklist:create:all`），由 `ITP.tsx` 以 `hasPermission('checklist:create:all')` 傳入——與既有 `canApprove`/`canVoid`/`canCreate`/`canUpdate` 同一套模式，後端授權完全未變動。
- 沒有此權限：按鈕整個不顯示（不是停用），做法與其他權限入口一致。
- 有權限但尚未保存（`!itpId`）或沒有檢驗項目（`advancedItems.length === 0`）：按鈕保留顯示但停用，並在旁邊與 `title` 提示中同時顯示明確中文原因（「請先保存此 ITP，才能產生 Checklist。」／「請先新增至少一項檢驗項目，才能產生 Checklist。」）。
- 操作期間權限失效（真實情境：另一個管理員在使用者填寫期間收回權限）：`handleGenerateChecklist` 的 catch 區分 HTTP 403（`getErrorStatusCode(err) === 403`）——顯示新增的友善翻譯 `itp.generateChecklistPermissionLost`，不再把 `err?.response?.data?.detail`（原始權限碼字串）直接丟給使用者；其他錯誤（網路、5xx、驗證錯誤）維持走既有 `getErrorMessage`。這個函式本來就不會關閉視窗或清空輸入，失敗後表單與已輸入的檢驗計畫內容原封不動。

### 2. Publish 確認彈窗

- 移除 `window.confirm(...)`，改用既有 `ConfirmModal` 元件（與既有「未儲存變更」彈窗同一套，支援現有中英文語系）。
- `handlePublish` 拆成 `handlePublishClick`（驗證表單、計算 payload/detailPayload、用既有的 `getNextRevision(formData.rev || '')` 算出目標版次——與原本寫入邏輯完全同一個呼叫，不是另外重算——並判斷 `skipRecordWrite`）與 `handlePublishConfirmed`（實際送出）兩段；`handlePublishClick` 只準備資料並開啟彈窗，不送任何請求。
- 依 `itpId` 與 `skipRecordWrite`（沿用既有 `isUnchangedSincePriorWrite`，即偵測「這次的 payload 跟上次成功寫入的完全一樣」）分成三種文案，全部使用實際算出的版次：
  - **新建（`itpId` 為空）**：「此為新建 ITP，確認後將以 {rev}、狀態 Approved 建立。」——不提「從 X 版更新為 Y 版」，因為根本沒有已存在的版次。
  - **既有紀錄、真的要發布（`skipRecordWrite` 為否）**：「確定要發布嗎？版次將從 {fromRev} 更新為 {toRev}，狀態將變更為 Approved。」
  - **僅補做附件的重試（`skipRecordWrite` 為是——即主資料／明細與上次成功寫入完全相同）**：「主資料與版次已於先前發布時保存，本次僅重新嘗試上傳尚未完成的附件，不會再次變更版次或狀態。」——不會誤稱會再次發布或跳版。
- 取消（`handlePublishCancel`）只清空彈窗狀態，不送出任何請求。
- 避免重複送出：確認按鈕一被點擊，`handlePublishConfirmed` 立刻 `setPublishConfirm(null)` 讓彈窗從畫面消失，第二次點擊已經沒有按鈕可點；Publish 按鈕本身的 `disabled={saving || !!publishConfirm || ...}` 涵蓋非同步請求進行中的視窗。
- 既有的授權、保存與失敗保留輸入機制（`applyOutcome`、`lastWrittenPayloadKey`）完全未變動。

## 本輪檔案

產品：
- `react-app/src/components/ITP/ITPModals.tsx`
- `react-app/src/components/ITP/ITP.tsx`（新增一行 `canCreateChecklist={hasPermission('checklist:create:all')}`）
- `react-app/src/context/LanguageContext.tsx`（新增 EN/ZH 對應 key：`itp.generateChecklist*`、`itp.publishConfirm*`）

驗證資產（未提交，比照本輪慣例保留在工作目錄）：
- `backend/scripts/verification/seed_itp_checklist_publish_uiux_review.py`
- `react-app/tests-browser/itp-checklist-publish-uiux-review.mjs`

## 已執行驗證

- `npx tsc --noEmit`：通過，無型別錯誤。
- `npm test`：91 passed（與本輪前相同，無新增/刪除單元測試，無回歸）。
- `vite build`（輸出到 `$TMPDIR`，非 `react-app/dist`）：通過。
- 隔離環境（`isolated_stack.py up/seed/down`，`vite_multi.mjs` 固定於 3099/8099）、真實登入、真實畫面、真實 API、真實資料庫，一次乾淨全跑（`itp-checklist-publish-uiux-review.mjs`）：
  1. 無 `checklist:create:all` 的帳號（`icp_nockl`）：Generate Checklist 按鈕數量為 0（整個不顯示）。
  2. 有權限、0 個檢驗項目的既有紀錄：按鈕顯示但停用，畫面上有明確中文原因文字。
  3. 有權限、1 個檢驗項目：按鈕可點擊，點擊後真實成功建立 Checklist（`POST /checklist/`），真實導向 `/checklist?openId=...`，資料庫該 ITP 對應的 Checklist 筆數由 0 變 1。
  4. **真實（非模擬）操作期間權限遺失**：頁面載入後，直接對隔離資料庫 `role_permissions` 表刪除該角色的 `checklist:create:all` 那一列，再點擊按鈕——真實後端在下一次請求時回真實 403；toast 文字為新增的友善訊息，確認不含 `checklist:create:all` 或 `Operation not permitted` 字樣；視窗與檢驗項目維持原樣。
  5. Publish 確認彈窗 — 新建紀錄：開啟「新增」表單，切到檢驗計畫分頁直接點 Publish（`defaultVendor`／既有專案已可通過驗證），彈窗文字為「此為新建 ITP，確認後將以 Rev2.0、狀態 Approved 建立。」；點取消後資料庫沒有新增任何符合探測條件的紀錄（0→0）。
  6. Publish 確認彈窗 — 既有紀錄：對 `rev=Rev1.0` 的既有紀錄點 Publish，彈窗文字為「確定要發布嗎？版次將從 Rev1.0 更新為 Rev2.0，狀態將變更為 Approved。」；確認後資料庫確實變成 `Approved`／`Rev2.0`。
  7. Publish 確認彈窗 — 附件重試變體：**這一步的附件上傳失敗是用 Playwright route 攔截模擬的（`route.fulfill(status:500)`），不是真實網路故障**，目的只是重現「主資料/明細已成功寫入、附件待補」這個狀態；先讓一次 Publish 的主資料成功但附件失敗，再次點 Publish，彈窗文字為「主資料與版次已於先前發布時保存，本次僅重新嘗試上傳尚未完成的附件，不會再次變更版次或狀態。」——確認沒有出現「更新為」等暗示會再次跳版的字樣。

## 重跑方式（從 backend/ 目錄）

```sh
python3 scripts/verification/isolated_stack.py up --port 8099 --vite-port 3099 --vite-script <vite_multi.mjs 路徑> --env SMTP_HOST= --env SMTP_USER= --env SMTP_PASSWORD= > stack.json
python3 scripts/verification/isolated_stack.py seed --root <root> --script scripts/verification/seed_itp_checklist_publish_uiux_review.py
node ../react-app/tests-browser/itp-checklist-publish-uiux-review.mjs stack.json
python3 scripts/verification/isolated_stack.py down --root <root>
```

`vite_multi.mjs` 這份共用腳本的埠號是寫死的 3099/8099，`isolated_stack.py up` 的 `--port`/`--vite-port` 參數必須跟它一致，否則 vite 會 proxy 到錯的後端埠（本輪第一次啟動時就因為埠不一致而連不上，重開後才對齊）。

## 未驗證／範圍外（如實記錄）

- 第 2 項（空白檢驗項目可送出）本批刻意不加任何必填規則或確認彈窗，維持現況，只是先前已記錄為觀察。
- 第 3 項（新增項目時無法複製上一筆內容）完全未觸碰，留待下一批。
- 新建紀錄 Publish 情境的表單只用了 `defaultVendor` 自動帶入的預設承包商與預設專案，未測試多專案／無預設承包商時使用者手動選擇後再 Publish 的路徑。
- 附件重試變體的觸發方式是模擬的路由攔截，不是真實的網路中斷或伺服器錯誤；真實網路故障下 `skipRecordWrite` 的判斷邏輯本身未變動（沿用既有 `isUnchangedSincePriorWrite`），本批未針對這個機制本身重新驗證，只驗證了新增的彈窗文案在該狀態下正確顯示。
- 沒有測試「確認彈窗開啟期間，使用者連續快速點擊 Publish 按鈕本身兩次」這個更早的競爭情境（彈窗開啟後 Publish 按鈕已因 `disabled={... || !!publishConfirm}` 停用，理論上涵蓋，但未特別用真實快速雙擊重現）。

## Claude 接手時注意

- 工作區存在其他協作者尚未提交的修改（包含 backend 大量檔案）；本輪未 stash/reset/checkout，未動這些檔案，只改了上面列出的 3 個產品檔案 + 2 個新增的驗證資產。
- 本輪未 commit、push 或部署。
