# MATERIAL-SUBMITTAL-M1 — REVIEW

TASK_ID: MATERIAL-SUBMITTAL-M1-2026-001
ROUND: R2
REVIEW_DATE: 2026-10-08

## VERDICT
- [x] PASS
- [ ] REVISE
- [ ] HUMAN_REQUIRED

M1 R1–R3 補正通過，可依已確認規格進 M2。本結論不代表材料功能可部署，也不改變獨立部署任務的狀態。

## 審查範圍與證據
- 核對 `_where_tokens`、`_type_problem`、專案天數型別驗證及新增 migration 測試；未擴大重審已接受範圍。
- 11 個 M1 來源檔案目前 SHA-256 全部與 r2-file-hashes.txt 相符。與前輪相比僅 migration 與其測試改變。
- r2-m1-tests.txt 完整紀錄為 58 passed、exit 0（migration 25、HTTP 33，Python 3.14.6）。此為已保存執行證據，本次未重跑該套件。
- 獨立記憶體資料庫重新執行正式 migration：正常結構兩次成功；小寫狀態常值的錯誤索引、NUMERIC 材料名稱欄位均拋 MigrationError。先前兩個漏判已消除。輸出與來源雜湊保存於 MATERIAL-SUBMITTAL-M1-evidence/reviewer-r2-probe.txt。
- 未重跑全套；前輪 2261 passed／3 skipped 只作前輪版本證據。

## REQUIRED_FIXES
無阻擋項目。

- R1 已完成：引號內常值保留，保守比對條件；新增錯誤條件中止、合法空白／關鍵字變化及實際唯一性測試。
- R2 已完成：依 model 型別精確驗證 VARCHAR（含長度）、TEXT、INTEGER；錯誤型別與 INTEGER 主鍵、專案天數均有反例。
- R3 已完成：TASK 已標明更正功能使用者確認、安排 M2。

## 證據措辭提醒（不阻擋 PASS）
NUMERIC／REAL 欄位的測試值可能在測試準備 INSERT 時已被 SQLite 轉成數字。測試證明的是 migration 拒絕結構，且未再改變準備完成時的值與 typeof；不可解讀成錯誤欄位曾保留字串 00123，或 migration 能還原先前轉型。STATUS 的「中止前後值與 typeof 相同」描述可保留。

## 保留限制
- Python 3.11 尚未執行，部署前必須完成。
- 專案引用保護只有 service 層驗證；既有 HTTP 500 問題不算已修復或 HTTP 驗收通過。
- 材料完整功能尚待 M2–M4，不混入 DOCX 單檔部署；既有預覽環境保留。

## NEXT_STEP
1. 將本輪 M1 TASK／STATUS／本 REVIEW 逐字封存為 R2-PASS，保留 R1-REVISE；不必重跑已接受測試。
2. 依材料 V1 已確認規格建立獨立 M2 控制文件及待審 REVIEW，不覆寫根目錄 DEPLOY-EXEC 控制文件。
3. M2 實作送審／版次、送交、外部結果與更正、版次附件及相關交易／併發／範圍保護；不加入內部審批、刪除、前端或未確認政策。
4. 更正規則已確認，不再詢問同一問題；測試及交接完成後交獨立審查。
