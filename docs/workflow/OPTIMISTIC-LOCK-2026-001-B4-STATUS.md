# OPTIMISTIC-LOCK-2026-001 B4 STATUS（ITR）

- **基準**：608c14c4。工作樹 scratchpad/ol-b4。尚未提交。
- **使用者確認**：2026-10-20「B4 可以」（主要調度轉達；主要調度也已在 3379 代為實測四種情境全部通過）。
- **一起提交**：BACKLOG #62、#63；B3b STATUS 的上線紀錄（2026-10-20 12:06Z，正式站 608c14c4）。
- **凍結指紋**（backend＋react-app，排除 node_modules／dist／__pycache__ 與預覽啟動檔）：`1aaf1a72db959071`（R2 PASS 後）。提交後會在 git archive 上重算比對。

## 1. 實際修改（只動前端）
| 檔案 | 內容 |
|---|---|
| store/itrStore.ts（CRLF） | updateITR 回傳存好的 ITR（含新的 row_version） |
| ITR/ITR.tsx | 版本、openSession；handleEdit／handleAddNew 記住版本並換 session；存檔：更新帶版本，新建用回傳的版本，兩者都只在同一次打開時寫回；已核准再發行的寫入帶版本，被拒時附重新載入；reloadRecord（依搜尋重抓清單）；視窗 key＝id 加 openSession；傳入 recordVersion 和 onReloadRecord |
| ITR/ITRModals.tsx | 接收 recordVersion 和 onReloadRecord；撤回核准、開 NCR 帶上版本；存檔、重試、發行、撤回、開 NCR 被拒時都附重新載入（7 處）；refreshInstances 回傳清單或 null；Checklist 面板：openPanel 記下版本（panelVersions）、儲存和 Reopen 送出這個版本、Reopen 後改用重新載入的版本、reloadInstance（409 後重抓並以 panelSession 重新掛載面板）；面板 key 加上 panelSession；R1 後：面板存檔把回傳的那筆立刻放進清單，reloadInstance 只在仍展開同一個面板時才套用，重試附件不掛重新載入 |
| ITR/ChecklistSnapshotModal.tsx（CRLF） | 新增 onReload；存檔與 Reopen 的 showRefusal 帶上（Reopen 不詢問捨棄，因為鎖住的面板沒有輸入） |
| tests-unit/recordVersion.test.ts | 加 1 項：updateITR 只送出明確傳入的版本，並回傳新版本 |

## 2. 設計說明
- **Checklist 面板的版本**：在面板**打開時**記下，而不是存檔當下才從清單讀取。這個 ITR 視窗裡其他動作（連結另一個範本等）會重抓 Checklist 清單；如果改從清單讀，舊面板會拿到新版本，存檔時就會蓋掉別人的修改。面板的 key 也**不**加上 row_version：否則清單一重抓，面板就會重新掛載，靜默丟掉還沒存的輸入。409 後的重新載入改用 panelSession 讓面板重新掛載。
- **撤回、開 NCR 之後**：既有流程是撤回後關閉視窗並重抓清單、開 NCR 後離開這頁，所以視窗不會拿著舊版本繼續存。

## 3. 驗證
| 項目 | 結果 |
|---|---|
| tsc | **實測** 無錯誤 |
| npm 單元測試 | **實測** 233 passed |
| eslint（修改的檔案） | **實測** 沒有 error |
| CRLF | **實測** ChecklistSnapshotModal 522/522、itrStore 203/203 |
| 獨立審查 R1 | PASS with notes；P3-1～P3-5 已修（見 B4-REVIEW.md），修正後 tsc／npm 233／eslint／CRLF 重跑通過 |
| 獨立審查 R2 | **PASS**（見 B4-REVIEW.md） |
| 隔離預覽自測 | **實測** 全部通過，見第 4 節 |

## 4. 隔離預覽自測（2026-10-18，8379/3379；分頁 B 以同一登入的 fetch 模擬）
| 情境 | 結果 |
|---|---|
| ITR 存檔：B 先改 → A 存檔 | 409「被別人改過」＋「重新載入這筆」→ 確認捨棄 → 重開後看得到 B 的內容 → 再存成功 |
| ITR 發行：B 先改 → A 發行 | 409 → 重新載入 → 發行成功（Approved） |
| ITR 撤回：B 撤回再發行（仍 Approved、版本變新）→ A 撤回 | 409 ＋「重新載入這筆」→ 捨棄並重新載入 → 撤回成功（In Progress） |
| ITR 撤回：B 已撤回 → A 撤回 | 業務拒絕「不是 Approved，沒東西可撤回」（不是版本衝突，所以沒有重新載入鈕，符合設計） |
| Checklist 面板存檔：B 先改 → A 存檔 | 409「Checklist … 被別人改過」＋「重新載入這筆」→ 捨棄並重新載入 → 面板重開 → 再存成功 |
| Checklist Reopen 後直接存檔 | 不會誤報 409（Reopen v0→v1，存檔 v1→v2） |
| （R1 修正後）面板存檔後立刻再展開、再存 | 不會撞自己的 409 |
| （R1 修正後）面板 409 → 重新載入 | 面板顯示另一分頁的值，再存成功 |

自測後已用 `scratchpad/preview/reset_ol_b4_preview.py`（只寫隔離資料庫）把三筆 ITR 與兩筆 Checklist 狀態恢復成種子狀態（ITR-1 In Progress、ITR-2 Approved、ITR-3 In Progress；chk-000002 Ongoing、chk-000003 Pass）。

**順手發現（既有問題，不在本批）→ 已寫成 BACKLOG #62：** ITR 裡 Checklist 面板的 Remark 欄可以輸入，但 `ITRModals.tsx` `saveInstance` 從來沒把 `remarks` 送出（608c14c4 就是這樣；後端 Checklist 也沒有 remark 欄位），所以輸入的備註存檔後會消失。

**R2 新觀察（既有問題）→ 已寫成 BACKLOG #63：** 面板存檔後在清單重抓回來前再展開同一列，舊面板的 `onClose()` 會把它收起，那一個 GET 期間的輸入會丟（B4 之前就這樣，見 B4-REVIEW.md R2）。
