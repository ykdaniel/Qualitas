# OPTIMISTIC-LOCK-2026-001 B3a REVIEW

## R1（獨立審查代理，2026-10-18）— REVISE（小）
- **審查代理確認正確的部分**：
  - serialWrite 的串接：每個工作都在執行當下才讀版本；中途 409 不會用錯版本寫入。
  - 新記錄的路徑。
  - 順修 1（Checklist Reopen）、順修 2（ITPDetail 寫入帶版本並依序執行）、順修 3（updateITPDetail 用回應更新）都正確。
  - FAT、FollowUp、Audit 都正確。
  - 範圍內每一個存檔都帶版本（只有 P2-1 例外）。
- **審查代理自己驗證**：tsc 無錯誤；單元測試 231；eslint 沒有 error；CRLF 和檔案權限都沒變。

| # | 等級 | 內容 | 處理 |
|---|---|---|---|
| P2-1 | P2 | Checklist 用 `?openId` 打開時（從 ITP 產生範本、ITPDetail 的 Record 連結、ITR 連結）沒有取版本、沒有換 open session → 存檔不帶版本、靜默略過鎖；B5 之後會被直接拒絕 | **已修**：deep-link 打開時也取 `recordVersion.open(found.row_version)` 並換 session；宣告移到 effect 之前 |
| P2-2 | P2 | ITP 視窗按儲存（上傳附件中）時又套用了項目，這個寫入排在後面；視窗關閉、另開 C 之後才執行，把 A 的版本寫進 C 的表單（C 可能假 409；版本號剛好相同時，舊表單會靜默覆蓋） | **已修**：每次打開記下 session（formSessionRef）；逐項寫入在執行前和寫回版本前都檢查 session，不是同一次打開就不寫、也不動版本；儲存期間計畫編輯器設為唯讀 |
| P3-1 | P3 | 存檔最後的 refetch() 仍然沒帶搜尋 | **已修**：改成 `refetch({ search: debouncedSearch })`；STATUS 順修 3 的說明一併更正 |
| P3-2 | P3 | 計畫寫入 409 時（主檔已存），還會跳出「無法確認」的 toast；而且計畫編輯在畫面上會被既有的 effect 重設 | **不改**（既有的行為；409 時拒絕對話框已提供重新載入），記入 STATUS |
| P3-3 | P3 | 主檔寫入後從清單取版本 | **已修**：updateITP 改為回傳記錄，直接用回傳的版本 |
| P3-4 | P3 | ITPDetail 重新載入失敗時沒有提示；標題空白時不會覆蓋本機的編輯 | **已修**：失敗時提示 refusal.reloadFailed；標題一律以伺服器為準（空白也一樣）。回應亂序的防護不做 |
| P3-5 | P3 | FollowUp 存檔後頁面清單的版本要等重抓才會更新 | **已修**：followUpStore.updateFollowUp 回傳記錄，頁面立即把結果寫進清單；註解更正 |
| P3-6 | P3 | 稽核範本重新載入期間草稿仍可編輯 | **不改**（只是外觀） |
| P3-7 | P3 | ITP 重新載入回到的是最初打開時的分頁，不是使用者當下所在的分頁 | STATUS 說明更正 |

## R2（同一位審查代理，2026-10-18）— REVISE（一行）
- **P2-1、P2-2 確認已修**：沒有任何路徑能讓之前視窗的寫入動到目前視窗的版本。存檔自己排入的工作不會比視窗活得久；reloadRecord 會換新 session。審查代理也記了一個已知邊界：存檔期間套用項目、又在寫入開始前打開別筆，這個項目會被略過，需要很少見的操作順序，不需處理。
- **P3-1、3、5 確認**。
- **新的 P2（P3-4 的修法造成）**：ITPDetail 載入 effect 的 deps 加了 `t`，而語系 provider 每次 render 都會產生新的 `t`，所以切換語言就會重抓整筆 ITP，靜默蓋掉使用者還沒存的標題與項目，baseline 也被重設（離開提醒失效）。
  - **已修**：`t` 改用 ref 讀取（在 effect 裡更新），從 deps 移除；載入只在 id 或 loadToken 改變時執行。tsc 無錯誤、單元測試 231。

## R3（同一位審查代理，2026-10-18）— PASS
- ITPDetail 的語言切換造成重抓的問題已修：載入只在路由 id 改變或「重新載入這筆」時執行。
- B3a 修改的檔案中，沒有任何 effect 會因為 `t` 改變而重抓資料：本批的 diff 沒有把 `t` 加進任何 deps；既有含 `t` 的 4 處都不會抓資料。
- tsc 無錯誤；單元測試 231；ITPDetail 的 eslint 沒有 error。R1 P2-1、P2-2 與 R2 確認的 P3 修正仍然有效。
