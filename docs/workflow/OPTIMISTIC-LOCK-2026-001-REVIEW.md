# OPTIMISTIC-LOCK-2026-001 REVIEW — B1

## R1（獨立審查代理，2026-10-18）— PASS with notes
- **範圍**：6f68c768 之上未提交的 B1 全部變更（後端、store、測試、文件）。
- **審查代理自己驗證的項目**：
  - 焦點測試 78 passed。
  - 遷移實驗：用拋棄式資料庫建好 B1 之前的表形狀（拿掉 19 張表的 row_version、清掉旗標），再跑 `run_migrations()` 兩次。結果：欄位都補回 NOT NULL；ITR 的 `_version` 7 帶入成 7、NULL 帶入成 0；`_material_schema_problems` 回傳 `[]`；19 個 model 都能用 ORM 讀出。
  - 前端：tsc 無錯誤；單元測試 223 passed。
  - CRLF：沒有整檔改寫。
  - 既有測試只改了 STATUS 說明的兩處，而且沒有放寬。
- **結論**：沒有 P1 或 P2。claim 放的位置都正確；宣稱的每條路由都回 409；材料遷移在既有資料庫上安全；前端不會夾帶版本；測試證明的內容和宣稱的一致。

| # | 等級 | 內容 | 處理 |
|---|---|---|---|
| P3-1 | P3 | FollowUp、MeetingMinutes 在 claim 之後被拒時，service 沒有 rollback。資料不會被寫，但寫入鎖要等請求結束才放 | **已修**：兩個 except 都 rollback。新測試 `test_a_refusal_after_the_claim_rolls_back_in_the_service`（被拒之後 `db.in_transaction()` 是 False） |
| P3-2 | P3 | KM 稽核紀錄的 old_value.version_no 記成加 1 之後的值 | **已修**：old_val 在 claim 之前擷取。KM 測試加驗 old_value.version_no＝1 |
| P3-3 | P3 | `updateITPDetail` 傳 null 時，會被變成 `{}`（理論上可能清空計畫） | **已修**：不是物件就原樣送出。單元測試加驗 null 照原樣送出 |
| P3-4 | P3 | 31a 加欄位失敗時只記 warning，之後每次讀取都會 500 | **已修**：補完欄位後逐表確認，仍缺就 `MigrationError` 停止啟動（表不存在則跳過）。新測試 `test_migration_stops_start_up_when_the_column_cannot_be_added` |
| P3-5 | P3 | 給 B3／B4 的提醒：create-ncr 回傳的是 NCR，不是 ITR；同一次存檔先 updateUser 再 setUserScope、或先 revoke／開 NCR 再存 ITR，第二次呼叫要用第一次回傳的版本 | 記入 B3、B4 的待辦（見 STATUS 第 5 節） |
| P3-6 | P3 | NCR 結案權限用的是 router 先讀、可能過期的狀態（原本就有的問題） | **已修**：結案權限檢查移到 claim 加 refresh 之後，判斷改用寫入鎖下重讀的狀態 |
| P3-7 | P3 | 稽核紀錄的 old_val 多了 row_version 一欄 | 不改（只是外觀，差異式稽核不會出現） |

- **另外修正**（R1 之後自己發現）：test_followup_service 的 mock 會把物件的 `__table__` 換掉，claim 因此讀到假的表。`core/concurrency._target` 改用 `mapper.local_table`，正式程式的行為相同，不改測試。

## R2（同一位審查代理，2026-10-18）— PASS
- **修正都確認到位且正確**：P3-1、2、3、4、6 與 `_target` 的改動。沒有新的 P1 或 P2。
- **審查代理自己驗證的項目**：
  - 13 個焦點測試檔共 181 passed。
  - 前端：tsc 無錯誤；單元測試 224 passed。
  - 遷移實驗重跑：ITR 帶入 7／0，材料結構沒有問題，19 個 model 都能讀出。
  - CRLF 和 LF 都維持原樣。
- **新的 P3 註記（不需處理）**：
  1. 因為 P3-6 改了順序，沒有結案權限的人用舊版本把 NCR 存成 Closed 時，現在先回 409 VERSION_CONFLICT，而不是 403。這是合理的。
  2. 結案檢查改了順序，但沒有專門針對新順序的測試；既有的 test_ncr_close_permission_http.py 照樣通過。

## R3（同一位審查代理，2026-10-18）— PASS
- **範圍**：3.11 r1 那 4 個失敗的修正，包括 models 欄位順序、材料 claim 移到「沒有變更就 return」之後，以及 3 處測試設定調整。
- **結論**：都正確，沒有放寬任何斷言，沒有新的 P1 或 P2。test_material_schema_migration 反而比原本更嚴格（舊欄位逐值比對，並另外驗 row_version＝0）。
- **審查代理自己驗證的項目**：
  - 受影響的 6 個測試檔共 122 passed。
  - 另寫一個暫存的材料 HTTP 測試（放在工作樹之外），1 passed。用舊版本同時改 brand、結果代碼、外部文件編號時，回 409，而且什麼都沒寫：版本、修訂、材料主檔、修訂狀態、current_approved_result 都沒變，也沒有新增更正紀錄。沒有變更的存檔則回 200，版本不變。
- **P3 註記**：在材料這一處，claim 不再是交易裡的第一個寫入。這是安全的，因為 `_locked` 已經先拿到材料的寫入鎖。審查代理建議加註解，但沒有要求。**本批不改**：程式碼裡已經有一句說明待寫入的變更會跟著 commit 或 rollback；為了讓 3.11 r2 驗證的樹就是要提交的樹，不再動後端。
