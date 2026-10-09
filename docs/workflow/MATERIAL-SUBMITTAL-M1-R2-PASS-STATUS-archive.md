# MATERIAL-SUBMITTAL-M1 — STATUS（R2 補正輪，待獨立審查）

TASK_ID: MATERIAL-SUBMITTAL-M1-2026-001
ROUND: R2。上一輪 STATUS／REVIEW 原文封存於 `MATERIAL-SUBMITTAL-M1-R1-REVISE-{TASK,STATUS,REVIEW,handoff}-archive.md`。
根目錄 `DEPLOY-EXEC-2026-001` 的控制文件未改。**未提交、未推送、未部署、未進 M2。不自填 PASS。**

## RESULT
- [x] DONE（R1–R3 已補正；交獨立審查）
- [ ] PARTIAL
- [ ] BLOCKED

## 本輪實際修改（只有這些）
| 檔案 | 內容 |
|---|---|
| `backend/db_migrations.py` | **R1**：`_normalize_where` 改為 `_where_tokens`。只忽略 token 之間的空白，以及「非引號」關鍵字與識別字的大小寫；字串常值與帶引號的識別字**逐字保留**。順序不同、括號不同、引號不同等「意思可能相同」的寫法一律視為不符，中止啟動。**R2**：新增 `_type_problem`，要求精確的宣告型別：String 為 `VARCHAR`（或 `VARCHAR(n)`），Text 為 `TEXT`，Integer 為 `INTEGER`（這也保證 INTEGER PRIMARY KEY 是 rowid 別名）。NUMERIC／REAL／BLOB／無型別／NVARCHAR／INT／BIGINT 都拒絕。`projects.material_reply_days` 也必須正好是 `INTEGER`。整檔仍是 CRLF（1680／1680 行） |
| `backend/tests/test_material_schema_migration.py` | 測試端的 `norm_where` 改為只合併空白，**不改大小寫、不改引號**，與正式程式的比對方式不同。新增反例與行為測試，見下 |
| `docs/workflow/MATERIAL-SUBMITTAL-M1-TASK.md` | **R3**：更正功能改為「使用者已確認，安排於 M2；M1 不實作」，並加上 ROUND 標記 |
| `docs/workflow/MATERIAL-SUBMITTAL-M1-REVIEW.md` | 重設為 R2 待審（原審查已封存） |

其他 9 個 M1 檔案的雜湊與上一輪 `file-hashes.txt` 相同（比對見 `r2-file-hashes.txt`）。

## 新增的反例與行為測試
- **R1（4 種錯誤條件，各自中止啟動）**：`('draft','submitted')`（審查者的實測案例）、`('Submitted','Draft')`、`('Draft')`、`"status" IN (…)`。
  - 中止後，錯誤索引原樣保留，沒有被替換；既有的版次列也不變。
- **R1 的合法變化**：只有空白與關鍵字大小寫不同（`status  in (  'Draft' ,'Submitted' )`），可以正常啟動。
- **R1 的實際行為**：正確的索引能擋下同一送審的第二個 Draft 或 Submitted，以及把已結版次改回 Draft 的動作；已結版次不計入；不同送審各自獨立。
- **R2**：
  - `materials.name` 宣告為 NUMERIC／REAL／BLOB／無型別／INT／NVARCHAR 時，6 種情況都中止啟動。事先寫入的 `'00123'` 在中止前後的值與 `typeof` 都相同，沒有被改寫。
  - `result_entries.id` 宣告為 `INT PRIMARY KEY` 時中止。
  - `projects.material_reply_days` 為 `BIGINT` 時中止。
  - 合法的 VARCHAR／TEXT／INTEGER 由空資料庫、升級、重複啟動等既有測試涵蓋，都可以通過。

## 執行結果（證據：`docs/workflow/MATERIAL-SUBMITTAL-M1-evidence/`）
| 檔案 | 內容 | 結果 |
|---|---|---|
| `r2-counterexamples-against-prefix-verifier.txt` | 暫時把三處驗證邏輯換回**修正前**的寫法，只跑新的反例測試 | **8 failed／4 passed**，退出碼非 0：審查指出的兩類漏洞（小寫常值、6 種錯誤型別、INT PK、BIGINT）都會失敗，證明反例有效。另外 4 項在舊邏輯下本來就會擋下。執行後以位元組副本還原，SHA-256 核對與修正版相同（`a0f2c9df…60b2e6`） |
| `r2-m1-tests.txt` | 修正後，M1 兩個測試檔的完整 `-v` 輸出 | **58 passed，退出碼 0**（migration 25、HTTP 33），Python 3.14.6 |
| `r2-file-hashes.txt` | 本輪最終的來源雜湊與 CRLF 檢查 | 只有 `db_migrations.py`、`test_material_schema_migration.py` 改變 |

- 依審查 NEXT_STEP，**沒有重跑 38 分鐘的全套測試**：本輪修改只限材料 migration 的驗證程式與它的測試。上一版全套結果 `full-suite-attempt2.txt`（2261 passed／3 skipped，退出碼 0）保留，作為**上一版本**的證據，不代表本版。
- 上一輪的反向檢查（`mutation-checks.txt`）未重跑。

## 限制（沿用，未變）
- AC-M1-7 專案引用保護只在 service 層驗證；`DELETE /api/projects/{id}` 遇到引用仍經全域例外處理回 500（既有行為），不算 HTTP 驗收通過。
- 未在 Python 3.11 執行（部署前必做）。
- 驗證程式只支援 SQLite（與 ITR 事件表相同），其他資料庫會中止啟動。

## 下一步
交獨立審查；PASS 後才進 M2。
