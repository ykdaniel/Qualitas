# OPTIMISTIC-LOCK-2026-001 — B4（ITR 視窗＋Checklist 快照面板）

- **TASK_ID**：OPTIMISTIC-LOCK-2026-001（本輪＝B4）。
- **基準**：608c14c4（最終候選：e651f87a → KM-DOCS D1 三個 commit → ITR 文件 f3242dc9 → B3b 重放）。工作樹 scratchpad/ol-b4。
- **使用者 2026-10-18 晚，經協調中心轉達**：「B4 範圍照上面做」。ITR 前端規定：範圍先經使用者確認。

## 範圍（只動前端；版面、欄位、按鈕都不變）
1. **ITR.tsx**：
   - 開啟時記住版本，並以 openSession 搭配 id 當 key。
   - 存檔、發行（包含已核准再發行的 type／status 寫入）帶上版本。
   - 新建時用回傳的版本；只在同一次打開時才寫回版本。
   - reloadRecord。
2. **ITRModals.tsx**：
   - 撤回核准、開 NCR 帶上版本。
   - 每一處存檔被拒都提供重新載入。
   - Checklist 面板：打開時記下該 Checklist 的版本；儲存和 Reopen 都送出這個版本；Reopen 之後改用重新載入的版本。
   - 409 後重抓並重新打開面板（panelSession 讓面板重新掛載）。
3. **ChecklistSnapshotModal.tsx**（CRLF）：存檔、Reopen 被拒時提供重新載入（onReload）。
4. **store/itrStore.ts**（CRLF）：updateITR 回傳存好的記錄。
5. **測試**：tests-unit/recordVersion.test.ts 加 1 項。
- **附帶**：驗證 B3a 移過來的「Checklist Reopen 後再存」。ITR 舊的 `detail_data._version` 檢查在前端送出 row_version 後就不再用到，B5 再從後端移除。

## 完成條件
R1、隔離預覽（兩個分頁同一筆 ITR：存檔、發行、撤回、Checklist 面板各試一次 409 和重新載入）、使用者確認、以 608c14c4 為父在本地 commit。
