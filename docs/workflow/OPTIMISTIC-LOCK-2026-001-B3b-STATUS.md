# OPTIMISTIC-LOCK-2026-001 B3b STATUS

- **基準**：e651f87a（B3a）。工作樹 scratchpad/ol-b3b。尚未提交。
- **使用者確認**：2026-10-18（台灣時間晚上），協調中心「主要調度」轉達「B3b 可以」。
- **凍結（給使用者預覽）**：2026-10-18，指紋 7380dc4c3c00608b（算法同 B1，另外排除 .olb3b-vite-launcher.mjs、.vite-olb3b/）。審查 R1 REVISE（小）→ R2 PASS with notes（RoleModal 按鈕文字已順手改）。
- **另外一起提交**：B1、B2、B3a 三份 STATUS 補上的上線紀錄。本批沒有動 LanguageContext.tsx 和 refusal.test.ts。
- **KM**：KM 視窗將由 KM-DOCS D2 移除；本批只做主檔 409 的重新載入和 kmStore 錯誤原樣丟出（協調中心 2026-10-18）。

## 1. 實際修改（只動前端）
| 檔案 | 內容 |
|---|---|
| store/contractorsStore.ts（CRLF） | fetchContractors 成功時清掉 error |
| store/projectStore.ts（CRLF） | fetchProjects 成功時清掉 error |
| store/iamStore.ts（CRLF） | 新增 `saveUserScope(id, scope, rowVersion)`：送出帳號的版本，把回傳的版本寫回 users 清單 |
| store/kmStore.ts | addKM／updateKM 不再包成 `new Error(message)`，改為原樣丟出；移除不再使用的 import |
| Contractors/Contractors.tsx | 承包商、專案各自的版本與 openSession；`openProject`；`reloadContractor`／`reloadProject`；兩個視窗加 key 和 onReloadRecord |
| Contractors/ContractorModal.tsx、ProjectModal.tsx | 加 onReloadRecord，showRefusal 帶上 |
| Contractors/ContractorPersonnel.tsx | editing 帶 row_version（startEditing）；更新時送出版本；啟用／停用用列上的版本；load 回傳清單或 null；`reloadAfterConflict`：重新進入編輯，或只重抓清單（啟用／停用不需確認） |
| IAM/UserManagement.tsx | 帳號版本與 openSession；`handleAddNew`；`reloadRecord`；更新、建立後都記住回傳的版本；視窗加 key；把 recordVersion 傳給視窗 |
| IAM/UserModal.tsx | 接收 recordVersion 和 onReloadRecord；新建帳號後的範圍寫入走 saveUserScope、用建立回傳的版本；把兩個 prop 傳給 UserScopeSection |
| IAM/UserScopeSection.tsx | 範圍存檔走 saveUserScope，送出共用的版本，並記住回傳的版本；showRefusal 帶 onReload |
| IAM/RoleManagement.tsx、RoleModal.tsx | 版本、openSession、handleAddNew、reloadRecord、key、onReloadRecord |
| KM/KMModals.tsx | 主檔存檔 409 時，用 `setLoadAttempt` 重讀 |
| tests-unit/recordVersion.test.ts | 加 1 項：saveUserScope 寫回版本；承包商、專案抓取成功時清掉 error；KM 的錯誤保持為 axios 錯誤 |

## 2. 順修（既有 bug）
- **順修 1**：iamStore 在 setUserScope 成功後沒有把新版本寫回清單，之後重開這個帳號存檔會自己撞 409 → 由 saveUserScope 寫回。
- **順修 2**：contractorsStore／projectStore 抓取成功時沒有清掉 error，一次失敗之後就一直被判定為失敗 → 成功時清掉。
- **順修 3（預防性）**：kmStore 的 addKM／updateKM 把 axios 錯誤包成新的 Error，status 和 code 都丟了 → 原樣丟出。目前沒有呼叫端（KM 視窗走 writeKMMain／kmService），所以沒有實際影響（R1 P3-5）。
- **注意（R1 P3-6）**：IAM 視窗裡，帳號或範圍任一區塊 409 後的「重新載入這筆」會整個視窗重開，另一區塊還沒存的修改也會一起捨棄（對話框的確認已涵蓋）。

## 3. 驗證
| 項目 | 結果 |
|---|---|
| tsc | **實測** 無錯誤 |
| npm 單元測試 | **實測** 232 passed |
| eslint（修改的檔案） | **實測** 只有 KMModals.tsx 第 479 行 `prefer-const`，這是既有的（不在本批修改的範圍內） |
| CRLF | **實測** contractorsStore 155/155、projectStore 99/99、iamStore 293/293 |
| 獨立審查 | R1 REVISE（小）→ **R2 PASS with notes**；見 REVIEW |
| **隔離預覽自測**（後端 8378、前端 3378；seed：../preview/seed_ol_b3b_preview.py；另一個分頁的存檔用 fetch 模擬） | **實測**，以下各項都通過： |
| IAM 帳號＋範圍共用版本 | 同一個視窗先存範圍（v0→1）、再存帳號（v1→2），沒有 409；存範圍後關閉、重開、再存帳號（v3→4），沒有 409（順修 1 的證明）；另一邊先存 → 409 → 重新載入 → 視窗重開並顯示對方的公司欄位 |
| 人員：列上編輯 | 另一邊先改職稱 → ✓ → 409 → 重新載入（先確認）→ 這一列以存檔的內容重新進入編輯（剛才輸入的電話已捨棄）→ 再存成功（v2） |
| 人員：停用 | 另一邊先改 → 停用 → 409 → 重新載入**不需確認**，清單直接更新 |
| KM 主檔 | 另一邊先改標題 → 儲存 → 409 → 重新載入（先確認）→ 視窗重讀並顯示對方的標題 → 再存成功（version_no 3） |
| 承包商、專案、角色 | 讀碼（和 NCR 同一模式）；預覽時請使用者補看 |
