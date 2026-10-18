# OPTIMISTIC-LOCK-2026-001 B3a STATUS

- **基準**：b8fb529e。工作樹 scratchpad/ol-b3。尚未提交。
- **使用者確認**：2026-10-18（台灣時間），協調中心「主要調度」轉達「B3a 可以」。
- **凍結（給使用者預覽）**：2026-10-18，指紋 7927c3a85119bde4（算法同 B1，另外排除 .olb3-vite-launcher.mjs、.vite-olb3/）。審查 R1 REVISE → R2 REVISE（一行）→ R3 PASS。
- **標示**：「實測」＝實際跑過；「讀碼」＝只讀程式確認；「未測」＝沒有驗證。

## 1. 實際修改（只動前端）
| 檔案 | 內容 |
|---|---|
| hooks/useRecordVersion.ts | 新增 `createSerialWrites`／`useSerialWrites`：寫入依序執行；前一個失敗不會擋住下一個 |
| store/itpStore.ts（CRLF） | `updateITPDetail` 改用回傳的 ITP 更新清單並回傳記錄（原本丟掉回應，改用不帶搜尋條件的 fetchITPs 重抓） |
| ITP/ITP.tsx | 版本、openSession、serialWrite；新增時用回傳的版本；存檔時主檔→計畫依序寫入，各用前一次回傳的版本；逐項套用經 serialWrite；計畫寫入遇到 409 時另外跳出附重新載入的拒絕對話框；reloadRecord 回到視窗最初打開的分頁；視窗加 key |
| ITP/ITPModals.tsx | 加 onReloadRecord，2 處 showRefusal 帶上 |
| ITP/ITPDetail.tsx | 載入時取版本（loadToken 重新載入）；`putVersioned` 帶版本並記住回傳的版本；發行、儲存、逐項存檔都經 serialWrite；3 處 showRefusal 帶 onReload（重新載入整頁） |
| Checklist/Checklist.tsx（CRLF） | 版本、openSession；編輯器加 key；存檔、Reopen 帶版本；reloadRecord |
| FAT/FAT.tsx | 編輯、明細兩個視窗共用 FAT 版本（openFor）；reloadRecord(id, which) 重新開啟原來那個視窗；兩個視窗都加 key 和 onReloadRecord |
| FollowUpIssue/FollowUpIssue.tsx | 改走 followUpStore.updateFollowUp 並帶版本；fetchManualIssues 回傳成功的清單或 null；只有手動事項提供重新載入；視窗加 key |
| Audit/AuditTemplatesPanel.tsx | show() 取版本；存檔後改用回傳的版本；取消時用清單裡的版本；reloadTemplate |
| Audit/AuditWizard.tsx（CRLF）、Audit.tsx | onReloadRecord(id)：精靈新建的稽核也能重新載入（B2 R1 P3-5） |
| tests-unit/recordVersion.test.ts | 加 2 項：serial writes 不會同時送出相同版本，失敗不擋下一個；itpStore.updateITPDetail 用回傳值、不重抓 |

## 2. 順修（既有 bug，協調中心要求各列一行）
- **順修 1**：Checklist Reopen 用的是過期 closure，拿到 Reopen 之前的記錄（舊狀態、舊版本）→ 改用 updateRecord 的回傳值。
- **順修 2**：ITPDetail 獨立頁的寫入沒有帶版本，而且逐項存檔可能和儲存、發行同時送出 → 全部帶版本並依序執行。
- **順修 3**：itpStore.updateITPDetail 丟掉回應，改用不帶搜尋條件的清單重抓（會丟掉頁面的搜尋，可能被較新的請求蓋掉，或靜默失敗）→ 改用回應。ITP 存檔最後的清單重抓也改成帶搜尋（R1 P3-1）。
- **順修 4**（R1 P2-1）：Checklist 用 `?openId` 打開時沒有取版本。

## 3. 驗證
| 項目 | 結果 |
|---|---|
| tsc | **實測** 無錯誤 |
| npm 單元測試 | **實測** 231 passed |
| eslint（修改的檔案） | **實測** 沒有 error；warning 都是既有的 |
| CRLF | **實測** itpStore 172/172、Checklist 1066/1066、AuditWizard 1482/1482 |
| 獨立審查 | R1 REVISE（小）→ R2 REVISE（一行：ITPDetail 切換語言會重抓）→ **R3 PASS**；見 REVIEW |
| **隔離預覽自測**（後端 8377、前端 3377；seed：../preview/seed_ol_b3a_preview.py；另一個分頁的存檔用 fetch 帶目前版本模擬） | **實測**，以下各項都通過： |
| ITP 列表視窗 | 儲存：主檔→計畫 v0→2，沒有 409；另一邊先存 → 409 → 重新載入 → 再存 v3→5，對方的備註保留 |
| ITPDetail 獨立頁 | 發行（Pending）：v9→11、Rev2.0、Approved，兩次寫入沒有 409；另一邊先存 → 儲存文件 409 → 重新載入整頁 → 再存成功 |
| Checklist 範本 | 409 → 重新載入 → 編輯器重開並顯示對方的活動 → 再存成功（v2） |
| FAT 編輯視窗 | 409 → 重新載入 → **編輯**視窗重開並顯示對方的地點 → 再存成功 |
| FAT 明細視窗 | 409 → 重新載入 → **明細**視窗重開並顯示對方的備註 → 再存成功（v4） |
| FollowUp | 409 → 重新載入 → 視窗重開並顯示對方的描述 → 再存成功（v2） |
| 稽核範本 | 連存兩次 v1→2（編輯區不關，沒有自己撞 409）；另一邊先存 → 409 附重新載入 → 顯示對方的內容 → 再存成功（v4） |
| ITP 逐項套用的串接 | 單元測試覆蓋（serial writes 測試）；預覽時請使用者用快速連按確認 |
| 發現 | Checklist 頁只列範本，ITR 名下實例的 Reopen 從這頁點不到（在 ITR 快照面板，已移到 B4）；順修 1 仍保留在程式裡。檢查表已改為範本的 409 流程 |


## 上線紀錄
- **2026-10-18 08:53Z（台灣 16:53）**：B1＋B2＋B3a 與 ATTACH-SECTION-UX 一起上線，正式站＝e651f87a（協調中心「主要調度」通知）。
- 遷移：18 張表加上 row_version；ITR 從 `_version` 帶入 1 筆；0 個 ERROR。
- 前端 bundle：index-DBcZOuF1.js。
