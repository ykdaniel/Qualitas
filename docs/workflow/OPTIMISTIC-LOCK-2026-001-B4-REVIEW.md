# OPTIMISTIC-LOCK-2026-001 B4 REVIEW

## R1（獨立審查代理，2026-10-18）— PASS with notes
- **審查代理確認正確的部分**：
  - ITR.tsx：每個寫入都帶 `recordVersion.current()`（更新、新建、已核准再發行）；版本只在寫入成功且同一次打開時才更新；新建後停在同一視窗的 remount 與附件保留和以前一樣；視窗 key 只在打開、新建、重新載入時改變；handleEdit 的 deps 穩定，deep-link effect 不會重跑。
  - 後端：只有 update、revoke、create-ncr 會檢查並遞增 ITR 版本；Checklist 存檔、連結、附件都不會，所以 ITR 視窗不會被自己拒絕；舊的 `_version` 只在沒有 row_version 時才檢查。
  - Checklist 面板：版本在打開時記下，之後的清單重抓不會改它；key 不含 row_version；Reopen 帶版本並改用重新載入的版本；面板關閉時「未存」旗標歸零。
- **審查代理自己驗證**：tsc 無錯誤；單元測試 233；eslint 0 error（2 個 warning 是本批沒動的 `ncrList`/`obsList`）；CRLF 522/522、203/203；ITR.tsx、ITRModals.tsx 維持 LF。

| # | 等級 | 內容 | 處理 |
|---|---|---|---|
| P3-1 | P3 | 檢查表第 3 步「A 撤回 → B 也撤回 → 409」做不出 409：後端先檢查「不是 Approved」再檢查版本，B 拿到的是 400 業務拒絕 | **已修**：改成 A 對已核准的再發行一次（仍 Approved、版本變新）→ B 撤回 → 409；並註明撤回與 Raise NCR 的業務拒絕不會有重新載入鈕 |
| P3-2 | P3 | 面板存檔後，清單重抓還沒回來（或重抓失敗）就再打開同一個面板，會拿到舊版本，下次存檔撞到自己的 409 | **已修**：saveInstance 把回傳的那筆立刻放進清單（`setInstances`），再收起面板。**預覽實測**：存檔後立刻再展開、再存 → 沒有 409 |
| P3-3 | P3 | 面板 409 後「重新載入」的 GET 期間，使用者若打開另一個 Checklist，回來時會把那個面板收起或重新掛載，丟掉輸入 | **已修**：新增 `expandedRef`，GET 回來時若目前展開的已不是這一個就什麼都不做 |
| P3-4 | P3 | 重試附件的拒絕不可能是版本衝突，掛的重新載入鈕永遠不會出現 | **已修**：拿掉 |
| P3-5 | P3 | Reopen 被拒時，重新載入仍詢問「會捨棄修改」，但鎖住的面板沒有可捨棄的輸入；面板重新載入失敗的提示寫「請重新打開」，實際面板仍開著 | 前者**已修**（`reloadDiscardsInput: false`）；後者只是文案，要改得動 LanguageContext（CRLF），本批不改，記為註記 |
| P3-6 | 註記 | 新建 ITR、附件未完成時沒有重新載入（`currentItrId` 還是 null） | 不改：要有人在幾秒內改同一筆新 ITR 才會發生 |

修正後：tsc 無錯誤；npm 233/233；eslint 0 error；ChecklistSnapshotModal CRLF 522/522。預覽再測：面板 409 →重新載入→顯示另一分頁的值→再存成功。

## R2（同一位審查代理，2026-10-18）— PASS
- **P3-1**：改寫後的步驟會走到版本檢查（itr_service.py:827），能做出 409。
- **P3-2**：PUT 和 GET 都用 `schemas.Checklist`，回傳的那筆和清單列形狀一樣；`setInstances` 和收起面板在同一次 render；存檔失敗時在 `setInstances` 之前就丟出，面板保留輸入。
- **P3-3**：GET 回來一定在之後的 task，點擊的 state 與 effect 早已套用，ref 不會是舊值；收起、改開別的、關掉再開同一個，三種情況都正確。
- **P3-4、P3-5**：成立；剩下 6 處重新載入都在真正寫入紀錄的拒絕上。
- **審查代理自己驗證**：tsc 無錯誤；單元測試 233；eslint 0 error；CRLF 522/522。
- **新觀察（既有問題，不是 B4 造成，不擋合併）**：面板存檔後，在清單重抓回來前再展開同一列，重抓回來時舊面板的 `onClose()` 會把剛打開的面板收起，那一個 GET 期間輸入的內容會丟。B4 之前順序就是這樣。建議之後讓 saveInstance 不等 refreshInstances（存好的那筆已在清單），或 onClose 只在仍是同一個面板時收起。→ 已寫成 BACKLOG #63。
