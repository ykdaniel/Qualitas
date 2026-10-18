# OPTIMISTIC-LOCK-2026-001 — B3a（ITP、Checklist、FAT、FollowUp、稽核範本）

- **TASK_ID**：OPTIMISTIC-LOCK-2026-001（本輪＝B3a）。
- **基準**：b8fb529e（B2）。工作樹 scratchpad/ol-b3。
- **協調中心 2026-10-18 決定**：
  - 拆成 B3a → B3b，B3b 以 B3a 的 commit 為父。
  - ITR 視窗內的 Checklist 快照面板移到 B4。
  - 檔案清單照准；順修的既有 bug 在 STATUS 各列一行。

## 範圍
做法沿用 B2：開啟時取版本、存檔成功後改用回傳的版本、表單以 openSession 當 key、reloadAndReopen 重新載入。另外新增 `useSerialWrites`：可能重疊的寫入依序執行。
- **ITP**：
  - 列表視窗：存檔先寫主檔再寫計畫，計畫用主檔回傳的版本；逐項套用依序執行並串接版本。
  - ITPDetail 獨立頁：發行、儲存、逐項存檔都帶版本並依序執行；409 後重新載入整頁。
  - itpStore.updateITPDetail：改用回傳值更新清單並回傳記錄。
- **Checklist 頁**：範本編輯器存檔、Reopen 帶版本；編輯器加 key；Reopen 改用回傳值（順修）。
- **FAT**：編輯和明細兩個視窗共用一個 FAT 版本，各自 409、各自重新開啟原來那個視窗。
- **FollowUp**：改走 followUpStore.updateFollowUp 並帶版本；fetchManualIssues 回傳成功或失敗；只有手動建立的事項有重新載入。
- **稽核範本**：存檔後編輯區不關，記住回傳的版本；409 後重抓並顯示這個範本。
- **Audit（B2 R1 P3-5）**：精靈新建的稽核也能重新載入（精靈把 id 交給頁面）。
- **不在本批**：B3b（主檔、KM）、B4（ITR 視窗與快照面板）。

## 完成條件
tsc、npm、R1、隔離預覽（使用者確認）、以 b8fb529e 為父在本地 commit。
