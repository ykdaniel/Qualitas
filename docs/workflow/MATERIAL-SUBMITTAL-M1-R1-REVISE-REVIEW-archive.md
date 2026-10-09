# MATERIAL-SUBMITTAL-M1 — REVIEW

TASK_ID: MATERIAL-SUBMITTAL-M1-2026-001
REVIEW_DATE: 2026-10-08

## VERDICT
- [ ] PASS
- [x] REVISE
- [ ] HUMAN_REQUIRED

M1 範圍維持；暫不進 M2、不部署。兩個阻擋點均為已存在錯誤 schema 的驗證漏判，不代表正常新建資料庫已發生損壞。

## 已核對的證據
- 11 個 M1 檔案目前 SHA-256 全部與 file-hashes.txt 相符。
- 已保存的乾淨全套輸出為 2261 passed、3 skipped、exit 0（2268.53 秒）；本次未重跑全套，也未將執行者的測試當成獨立重跑。
- 檢視材料 API 的權限、專案範圍、受控欄位與 strict audit 交易，以及 HTTP／migration 測試。
- 獨立以隔離輔助工具啟動子程序，三個記憶體 SQLite 案例直接呼叫正式 migration 及 verifier；證據：MATERIAL-SUBMITTAL-M1-evidence/reviewer-schema-probe.txt。未改產品檔案、未使用開發／預覽資料庫。

## REQUIRED_FIXES

### R1 — 保留 partial index 條件中文字常值的語意（P1）
位置：backend/db_migrations.py:329–334；測試檔的 norm_where 也有相同問題。

_normalize_where 把整段 SQL 轉小寫並移除所有空白，連引號內的狀態常值也改了。實測將 ux_msr_one_open 改為 WHERE status IN ('draft','submitted') 後，重新執行 migration 仍成功、verifier 回傳 []；同一 submittal_id 可成功插入兩筆不同 rev_no 的 Draft。這與「同時只有一個未結版次」的索引要求不同。

請採保守的條件驗證，保留字串常值大小寫與內容；無法確認等價的條件應中止，不自行替換或修復既有索引。新增獨立反例測試，不能再用相同的破壞性正規化比較預期值。驗收：錯誤小寫條件會拋 MigrationError；正確索引仍能阻擋同一送審的第二個 Draft／Submitted，正常建立及重複執行保持成功。

### R2 — 正確驗證欄位型別（P2）
位置：backend/db_migrations.py:357–360。

目前只以是否含 INT 分兩類，所有不含 INT 的型別都會被視為可接受的文字欄位。實測預先建立 name NUMERIC NOT NULL 的 materials 表，其餘定義照正式 DDL，再執行 migration 兩次，皆成功且 verifier 回傳 []；寫入字串 00123 後，實際讀出 (123, integer)。啟動驗證沒有擋住會改變業務資料的錯誤結構。

請依 SQLite 真正的型別／affinity 與必要的精確型別要求檢查；文字欄位不能只判斷「不是 INT」。新增 NUMERIC／REAL／BLOB 等錯誤文字欄位反例，確認中止且不改寫既有資料；合法 VARCHAR／TEXT 仍能通過。INTEGER PRIMARY KEY 若依賴 rowid／自動編號語意，也須核對精確 INTEGER，不能把所有含 INT 的宣告視為等價。

### R3 — 同步任務中的過時確認狀態（文件小項）
MATERIAL-SUBMITTAL-M1-TASK.md 最後仍寫「更正功能待使用者確認」。使用者已確認且 DECISIONS 已登錄，改成「已確認，安排於 M2；M1 不實作」。不重新詢問使用者。

## 非本輪阻擋事項
- 專案引用拒絕目前只驗證 service 層；既有 HTTP 500 問題維持如實列明，不要求本批擴大修改。
- Python 3.11 仍為部署前必要驗證，不把本機 Python 3.14 的成功當作已完成。
- 更正功能的業務決策已確認，不屬本批實作。

## NEXT_STEP
1. 以本 TASK_ID 加輪次標記保存本輪 M1 TASK／STATUS／REVIEW，再建立 M1 補正輪；不覆寫根目錄部署控制文件。
2. 只補 R1、R2 及 R3 文案；不擴張 M2。
3. 跑新增的反例／行為測試與 M1 兩個測試檔，保存完整結果、退出碼及最終來源雜湊。若修改維持材料 migration verifier 的範圍，不要求重跑 38 分鐘全套；原全套結果保留為先前版本證據。
4. 更新 M1 STATUS／handoff 交獨立審查，通過後再進 M2。
