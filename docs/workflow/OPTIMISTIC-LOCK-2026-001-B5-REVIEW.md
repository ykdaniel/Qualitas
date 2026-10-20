# OPTIMISTIC-LOCK-2026-001 B5 REVIEW

## R1（獨立審查代理，2026-10-20）— PASS with notes
- **陷阱（強制檢查）**：成立。
  - `update_itr` 仍會剝除 `_version`：字串會先解析成 dict 再剝，dict 也會剝。
  - 已核准 ITR 的保護沒變。
  - 帶 `{"_version": n}` 發行在開關開、關兩種情況下都成功；夾帶其他內容仍被擋。
  - 「沒帶 detail_data 就不重寫」不影響任何呼叫端，只有 test_itr_approval_events_http:337 依賴舊行為，已改。
- **審查代理確認正確的部分**：
  - `claim_row_version` 在寫入和 log 之前就拒絕；26 個呼叫點遇到拒絕都會完整回滾，包括 document transition 先改了 doc 的情況、material 先 flush 的情況。
  - 每個 router 都經由 `refusal_http` 回 400：KM 原本強制 409、documents 用 CONFLICT_CODES，兩者都被覆蓋成 400。
  - 開關在呼叫當下讀取，沒有循環 import。`load_dotenv` 預設不覆蓋已有的環境變數。
  - 前端所有寫入都帶版本，包括新的公司文件畫面。
  - LanguageContext CRLF 3625/3625；`correctable()`、PARAMS 都正確；沒有人 import 已刪除的兩個檔；BACKLOG #64 位置正確。
- **審查代理自己跑的**：本機 3.14 定點測試 134＋365 passed；tsc、eslint 乾淨；npm 241/241。

| # | 等級 | 內容 | 處理 |
|---|---|---|---|
| P3-1 | P3 | DESIGN:77 的 log 字串寫成 `optimistic-lock: ... saved without row_version`，和程式不同；GPT 照它 grep 會一直是零，誤以為可以打開開關 | **已修**：改成 `row_version missing: <table> <id>` |
| P3-2 | P3 | 測試子行程（isolation.py 的白名單環境）不繼承 conftest 的設定，又會 `load_dotenv`；開發者 .env 若開了開關，5 個子行程測試會失敗 | **已修**：`isolated_env` 先設 false，再套 extra（isolated_stack 仍可用 `--env` 打開）。多動的這個檔已先通知主要調度 |
| P3-3 | P3 | KM 舊資料 `version_no` 是 NULL：開關打開後永遠存不了，只能靠 Word 匯入 | **不改**：使用者已接受這個風險（DECISIONS 第 3 點、B5 決定第 5 點）；寫進 STATUS |
| P3-4 | P3 | itr_service:524 的拒絕訊息還寫「只有版本計數可以改」；numberGenerator.ts 的註解還提到已刪除的 ContractorsContext | **已修**：訊息改為「已鎖定，請用發行建立新版」（測試只比對前半句，前端不解析這句）；註解改寫（numberGenerator 已先通知主要調度） |
| 註記 | — | B4 之前的舊分頁，在開關關閉期間不再有衝突偵測 | 依決定；B4 已上線，影響很小 |

修正後：定點測試 76 passed；tsc 0；npm 241/241。3.11 全套 r2 在修正後的樹上重跑（r1 是修正前的樹，已中止並刪除）。

## R2（同一位審查代理，2026-10-20）— PASS
- isolation.py 的順序正確：先設 false，再套 extra，所以 `isolated_stack --env ROW_VERSION_REQUIRED=true` 仍可打開。後面「isolation 變數一定贏」的區塊不碰這個設定。沒有任何測試或腳本在 extra 裡帶這個鍵。test_startup_isolation_guard:126 只檢查某些鍵不存在，不受影響。
- P3-1、P3-4 成立（測試比對的前半句沒變）；P3-3 依使用者決定不改，已寫進 STATUS。
- 主要調度 2026-10-20 核准 isolation.py、numberGenerator.ts 兩處清單外小修。
