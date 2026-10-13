# REVIEW.md — 獨立審查

TASK_ID: NOI-DEFECTS-2026-001

- 審查者：獨立 Claude 審查代理（general-purpose 子代理，唯讀）。GPT 審查依 2026-10-11 協調規則暫停。
- 審查日期：2026-10-12
- 範圍：工作樹 diff（後端 4 檔＋測試 2 檔、前端 4 檔）。不是部署驗收。

## R1：REVISE
- **P1（必修）**：`tests/test_noi_service.py` 有 3 個 mock 測試仍然斷言 `repo.update` / `repo.delete` 有被呼叫，因此失敗。
  - 執行結果：`tests/test_noi*.py` 加 `test_ncr_audit_atomic_http.py`，96 passed，3 failed。
- **P2**：
  - 缺少 update 失敗時的回滾測試，尤其是「改承包商」重新編號的路徑。
  - delete 在檢查引用之前沒有先取得寫鎖（原本就有的競態）。
- **P3**：
  - 既有紀錄如果沒有 referenceNo，會誤顯示「（預計）」。
  - toast 裡的類型名稱沒有在地化。
  - 連點刪除會重複發出檢查請求。
  - `checkNOIReferences` 成了死碼。
  - 只受專案範圍限制的使用者可以預覽任何承包商的編號（資訊揭露，低）。
- **已核對無誤**：
  - update／delete 的交易與 rollback 路徑；
  - validators 重構行為不變；
  - preview 和 generate 計算一致；
  - 路由順序；
  - 權限與範圍；
  - 前端錯誤處理；
  - CRLF 保留。

## 補正
P1、P2（兩項）、P3 #4–#6 已處理，詳見 STATUS。P3 #7、#8 列為後續項目。

## R2（只審補正部分）：PASS
- 執行結果：`tests/test_noi*.py` 加 `tests/test_ncr_audit_atomic_http.py`，103 passed，0 failed。
- tsc、eslint 都沒有錯誤。
- 7 個 CRLF 檔都保留了換行格式。
- 非阻擋的後續項目：
  1. ITR／Checklist／NCR 建立時引用 NOI，競態只關了一半，因為引用端沒有先取得寫鎖。
  2. delete_noi 在 reload 之後沒有再檢查一次範圍。
  3. 死碼、承包商編號預覽的範圍、NCR 刪除 audit 遺失。

## R3（只審 #8 收緊的差異）：PASS
- 背景：R2 之後，使用者決定在本批一併收緊 #8。原提案的做法沒有效果（見 STATUS），使用者改選「只限定專案的使用者只顯示格式」。
- 執行結果：`tests/test_noi*.py` 加 `tests/test_ncr_audit_atomic_http.py`，104 passed，0 failed。
- tsc、eslint 都沒有錯誤。
- 7 個 CRLF 檔都保留了換行格式。
- 讀碼核對 `_reference_format` 和 `generate_reference_no`：有命名規則、沒有命名規則、`sequence_digits` 為 None 或 0，這幾種情況都一致；`generate_reference_no` 本身沒有被改動。
- **剩餘風險（架構層面，不擋）**：遮罩只關掉了「預覽」這條路。只受專案範圍限制的使用者還有其他方式拿到同一個數量資訊：
  - 建立一張 NOI，回應裡就有真實號碼；
  - 有 NOI_UPDATE 時，把一張沒被引用的 NOI 改成別家承包商，會重新編號；
  - 自己專案的既有 NOI，號碼本身就顯示建立當時在全域序號中的位置。
  - 要完全消除，序號必須改成按專案分開計，這牽涉號碼格式和既有資料。**預覽遮罩只是降低洩漏，不是完全關閉。**
- 測試缺口（不擋）：號碼一致性只在「沒有 DocumentNamingRule」的情況下測過；建議補「自訂 prefix＋4 碼」和「sequence_digits 為 None」兩種規則的比對測試。
