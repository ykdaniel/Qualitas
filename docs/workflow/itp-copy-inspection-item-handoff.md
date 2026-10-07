# ITP 檢驗項目「複製」— 交接紀錄

2026-09-28，Claude Code 實作並執行以下驗證。未 commit/push/部署。

延續同一輪 UI/UX 改善清單的第 3 項（前一批已完成第 1、4 項——Generate Checklist 權限入口、Publish 確認彈窗，見 [itp-generate-checklist-publish-uiux-handoff.md](itp-generate-checklist-publish-uiux-handoff.md)）。本批只做「複製檢驗項目」，沿用既有畫面風格，不新增必填規則、不改授權或保存政策。

## 修正內容

`react-app/src/components/ITP/ITPAdvancedEditor.tsx`：

- 每筆可編輯項目的操作欄（Op.，`!readOnly` 才顯示，跟既有 Edit／Delete 同一個區塊）新增「複製」按鈕（`Copy` icon）。
- `handleCopyClick(item)`：用 `JSON.parse(JSON.stringify(item))` 對來源項目做完整深層複製（包含 `activity`/`standard`/`criteria`/`vp` 等巢狀物件與陣列），開啟與「新增項目」完全相同的編輯面板（`editingItem` 狀態、同一個彈窗 UI），讓使用者自行修改內容。
  - 新項目的 `id` 用既有的 `calculateNextId(phase, insertAfter)` 算，`insertAfter` 預設為來源項目的 id（複本預設插在來源後面），最終編號在 Apply 時依既有邏輯重新排序，跟正常新增項目一致。
  - `record`（連結的 ITR／Checklist 記錄編號）明確清成 `'-'`——來源項目的 `record` 代表「這個項目已經有對應的檢驗紀錄」，直接複製到一個尚未發生的新項目上會誤導使用者以為新項目已經被記錄過，這點原始需求沒有明講但屬於既有欄位語意，本批做了這個保守決定並在程式註解與此文件中記錄，不是後端政策變更。
- Apply／Cancel 完全沿用既有的 `handleSaveItem`／`setEditingItem(null)`：Apply 才把新項目併入 `items`（新建 ITP 尚未保存時純本地狀態；既有 ITP 則沿用目前的 Save/Publish 保存方式，都沒有改動），Cancel 不寫入、不新增。
- 複本內容獨立：既有的所有欄位修改函式（`handleChange`／`handleCriteriaChange`／`handleVPChange`）本來就是用 spread 建立新物件／新陣列，不會就地修改巢狀內容；再加上複製當下的 JSON 深層複製，確保修改複本的 Criteria、Verification Points 等內容不會回頭影響來源項目——已用真實畫面操作驗證（見下）。
- 唯讀模式：複製按鈕跟 Edit／Delete 一樣被整個操作欄的 `{!readOnly && (...)}` 包住，沒有另外加開關，因此唯讀模式下不會出現複製入口。

## 修改前 / 修改後

- 修改前：每筆項目只有 Edit（鉛筆）和 Delete（垃圾桶）兩個操作；要新增相似項目必須從空白表單重新輸入所有欄位。
- 修改後：多一個 Copy（複製）圖示；點擊後開啟同一個「新增項目」編輯面板，已經帶入來源的 Activity／Standard／Criteria／Check Time／Method／Frequency／Verification Points，使用者只需修改差異處，Apply 才真正加入；來源項目本身完全不受影響。

## 已執行驗證

- `npx tsc --noEmit`：通過。
- `npm test`：91 passed（無新增/變動的單元測試，無回歸）。
- `vite build`（輸出到 `$TMPDIR`）：通過。
- 隔離環境（`isolated_stack.py up/seed/down`，`vite_multi.mjs` 固定 3099/8099）、真實登入、真實畫面、真實 API、真實資料庫，一次乾淨全跑（`react-app/tests-browser/itp-copy-item-review.mjs`，沿用上一批 `seed_itp_checklist_publish_uiux_review.py` 的 `icp_full` 帳號與 `icp-itp-with-items` 紀錄）：
  1. 對既有紀錄的項目點複製：開啟同一個「Add New Inspection Item」面板，Activity 欄位已帶入來源文字。
  2. 點取消：畫面上項目數量不變（仍是原本 1 筆），資料庫 `detail_data` 未變動（沒有送出任何寫入）。
  3. 點複製、修改 Activity 與 Criteria 內容後 Apply：來源項目文字維持原樣未被更動，新複本以獨立內容出現，新項目取得全新編號（A1 → 複本為 A2，非沿用來源 id A1）。
  4. 實際 Save：真實資料庫 `detail_data` 同時保有原項目與修改後的獨立複本，各自內容正確；重新整理、從清單重新開啟該紀錄後，兩個項目仍各自獨立存在，內容正確（排除只是前端暫存的假象）。
  5. 唯讀模式：本批未另外起一個唯讀帳號重新畫面驗證，是用程式碼核對——複製按鈕與既有 Edit／Delete 共用同一個 `{!readOnly && ...}` 區塊，不是新增的獨立開關，邏輯上與已驗證過的 Edit／Delete 隱藏行為一致。
  6. **新建（尚未保存）ITP 模式**：開啟「新增」表單、切到檢驗計畫分頁，本地新增一筆項目（過程中資料庫 ITP 筆數不變，itpId 全程為 null）；對這筆本地項目點複製、修改內容、Apply——原本地項目與複製後的本地項目都正確顯示、內容互不影響，過程中資料庫仍沒有任何新建的 ITP 紀錄；再對複本點複製後點取消，項目數量沒有多出來（維持 2 筆）；最後按 Save，真實建立一筆新 ITP 紀錄，`detail_data` 中兩個項目（Original Local Item／Local Copy Edited）各自內容獨立、正確保存。

## 重跑方式（從 backend/ 目錄）

```sh
python3 scripts/verification/isolated_stack.py up --port 8099 --vite-port 3099 --vite-script <vite_multi.mjs 路徑> --env SMTP_HOST= --env SMTP_USER= --env SMTP_PASSWORD= > stack.json
python3 scripts/verification/isolated_stack.py seed --root <root> --script scripts/verification/seed_itp_checklist_publish_uiux_review.py
node ../react-app/tests-browser/itp-copy-item-review.mjs stack.json
python3 scripts/verification/isolated_stack.py down --root <root>
```

沿用上一批（Generate Checklist／Publish 確認彈窗）的種子腳本，因為帳號權限與紀錄夾具（`icp_full`、`icp-itp-with-items`）剛好符合本批需求，沒有另外新增種子腳本。

## 未驗證／範圍外（如實記錄）

- 唯讀模式下複製按鈕確實隱藏，這點本批只用程式碼核對推論（與 Edit／Delete 同一段既有邏輯），未另外起一個唯讀帳號在真實畫面上重新截圖驗證。
- 沒有測試「複製一個本身就是複製出來、尚未 Apply 的暫存項目」這種巢狀情境（複製按鈕只出現在已經 Apply 進 `items` 陣列的項目列上，正在編輯中的暫存項目本來就沒有複製入口，這是既有畫面結構決定的，非本批新增限制）。
- `record` 欄位清空為 `'-'` 是本批的保守預設決定（避免複本誤稱已有檢驗紀錄），原始需求文字沒有明確指定這個欄位的處理方式，如果之後業務判斷應該保留來源的 `record`，需要另外確認再調整。
- 拖曳排序（`GripVertical`／`handleDrop`）與複製功能的互動（例如複製後立刻拖曳複本）未特別測試，沿用既有排序邏輯，未變動。

## Claude 接手時注意

- 工作區存在其他協作者尚未提交的修改；本輪未 stash/reset/checkout，未動這些檔案，只改了 `ITPAdvancedEditor.tsx` 一個產品檔案，並新增一份驗證腳本（未提交）。
- 本輪未 commit、push 或部署。
