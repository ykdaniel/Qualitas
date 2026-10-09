# MATERIAL-SUBMITTAL-M1 — handoff（R2 補正輪，待獨立審查）

**一句話**：R1 審查的三項都已補正：
- partial index 條件比對時，字串常值改為逐字保留；
- 欄位型別改為精確比對；
- TASK 文案已更新。

修正前的驗證邏輯跑新反例會失敗 8 項，修正後 M1 兩個測試檔 58 passed、退出碼 0。未重跑全套，也沒有進入 M2。不自填 PASS。

## 審查請看
- `MATERIAL-SUBMITTAL-M1-STATUS.md`（R2）。
- 程式：`backend/db_migrations.py` 的 `_where_tokens`、`_type_problem`，以及 `_material_schema_problems` 中呼叫這兩者的地方。
- 測試：`backend/tests/test_material_schema_migration.py` 檔尾的 R1／R2 區段，以及改寫後的 `norm_where`。
- 證據：
  - `r2-counterexamples-against-prefix-verifier.txt`
  - `r2-m1-tests.txt`
  - `r2-file-hashes.txt`
- 上一輪原文：`MATERIAL-SUBMITTAL-M1-R1-REVISE-*-archive.md`。

## 證據界線
- 全套測試只有上一版本（2261 passed）；本版只跑 M1 兩個測試檔，這是依審查指示。
- Python 3.11 尚未驗證。
- 專案刪除透過 HTTP 回 500 的既有限制不變。
