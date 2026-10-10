# AUDIT-HARDENING-A-2026-001 — STATUS（R1，待獨立審查）

TASK_ID: AUDIT-HARDENING-A-2026-001
ROUND: R1。基準：工作期間協作者提交了 `52986ac2`（只動 DOCX 三個檔），本輪改動在其上的工作樹。根目錄 TASK／STATUS／REVIEW（DEPLOY-EXEC-2026-001）、開發資料庫、8240／3240、8198／3198 都沒有動。
**未提交、推送或部署。不自填 PASS。**

## RESULT
- [x] DONE（交 R1 獨立審查）

## 修改檔案（只有後端）
| 檔案 | 內容 |
|---|---|
| `backend/services/audit_service.py` | 建立：狀態檢查、嚴格日期、不採用用戶端 id、先取寫入鎖再取號、單一交易＋明確 rollback、`IntegrityError`→`AuditConflict`。更新：丟棄 `auditNo`、嚴格日期（只檢查有變動的欄位）、Closed 鎖改用 `_comparable` 比較、Closed 沒有實質變更時直接回傳（不寫入、不留稽核紀錄）、明確 rollback。 |
| `backend/routers/audit.py` | 建立與更新：`DateValidationError`→422、`AuditConflict`→409；建立端點補 `ValueError`→400。 |
| `backend/schemas.py` | `AuditBase` 移除寬鬆日期驗證與開始／結束順序檢查（讀取 schema 不再因一筆壞資料拋錯）；`AuditCreate` 加嚴格日期欄位驗證。 |
| `backend/core/strict_dates.py` | 新增 `AUDIT_DATE_FIELDS`、`AUDIT_REQUIRED_DATE_FIELDS`（`date` 不可 NULL，`''` 仍允許）、`AUDIT_ORDER_RELATIONS`；更新模組說明。 |
| `backend/core/utils.py` | `_DOC_TYPE_TABLES` 加 `'AUDIT': ('audits', 'auditNo')`。 |
| `backend/tests/test_audit_service.py` | 建立測試補 `date=""`（原本省略 date，在真實資料庫會 500）；Closed 重送測試改為斷言不寫入。 |
| `backend/tests/test_audit_hardening_http.py`（新） | 33 項，真實登入＋路由、拋棄式 SQLite 檔、以新 session 讀回驗證。 |

`audit_service.py`、`routers/audit.py`、`core/utils.py` 原本是 CRLF，維持 CRLF（`git diff --stat` 只顯示實際改動行）。

## 逐項結果（皆為實測，見證據）
| # | 修正 | 測試 |
|---|---|---|
| 3 | 建立時 Closed／Void／未知／小寫 `closed`／空字串 → 400，紀錄、稽核紀錄、序號都沒有寫入；Draft／Planned／In Progress／Completed 可建立 | `test_create_refuses_dead_end_or_unknown_status`、`test_create_accepts_every_status_with_a_way_forward` |
| 4 | 精靈第二次儲存送 `auditNo: ''` → 200，編號不變；手動改號被忽略，稽核紀錄的 new_value 不含 auditNo | `test_second_save_with_blank_audit_no_keeps_the_number`、`test_update_cannot_rename_the_number` |
| 5 | 建立：順序顛倒、`garbage`、`2026-02-30`、時間戳、`null`、缺 date 欄 → 422 且不寫入；`date=''` 草稿仍可建立。更新：順序顛倒、`2026-13-01`、非日期、`date: null` → 422 且不寫入；舊資料原值重送（格式錯＋順序顛倒）不擋；清單與單筆讀取遇到壞資料回 200，原值不動 | `test_create_refuses_bad_dates_with_422` 等 6 項 |
| 6 | 先取鎖再取號（呼叫順序斷言）；計數器落後資料表時取到 000002 不撞號；6 個執行緒同時建立 → 6 個不同編號、0 錯誤 | `test_write_lock_is_taken_before_the_sequence_is_read`、`test_counter_behind_the_table_does_not_collide`、`test_concurrent_creates_get_distinct_numbers` |
| 7 | 送已存在的 `id` → 200 且得到新 id；編號衝突 → 409 且不寫入 | `test_client_supplied_id_is_ignored`、`test_number_collision_is_409_and_writes_nothing` |
| 12 | 以 GET 內容完整重送 Closed → 200；以精靈形狀（NULL 欄位送 `''`／`[]`）重送 → 200 且資料表、稽核紀錄完全不變；真的變更 → 400 | `test_closed_full_resave_is_a_no_op_but_a_real_change_is_refused`、`test_closed_wizard_shaped_resave_over_null_columns_writes_nothing` |
| — | 稽核紀錄寫入失敗 → 500，有明確 rollback，紀錄／稽核紀錄／序號完全不變（建立、更新） | `test_audit_log_failure_rolls_everything_back` |

## 證據（`AUDIT-HARDENING-A-2026-001-evidence/`）
- `A-backend.patch`＋`A-final-file-sha256.txt`：本輪完整差異與最終檔案雜湊（B 批開始前保存；之後工作樹會再被 B 批修改）。
- `new-tests-against-HEAD.txt`：同一份新測試套在舊版產品程式（`git archive 4ad06cbf backend`，只放入新測試檔；Audit 相關 6 個檔與 `52986ac2` 雜湊相同）→ **26 failed、7 passed**。其中並發測試在 HEAD 真的撞號（`UNIQUE constraint failed: audits.auditNo`）。如實說明：HEAD 的 rollback 測試失敗只是因為沒有「明確 rollback」，HEAD 的資料本來就不會留下（交易在 session 關閉時回滾）。
- `audit-related-tests-final.txt`：最終版本，所有提到 Audit／strict_dates／編號產生的測試檔（24 個）。結果：**1109 passed、1 skipped**，exit 0（約 26 分鐘）。
- `full-suite-pre-final-edit.txt`：完整後端測試 **2381 passed、3 skipped**（Python 3.14，約 50 分鐘）。這次跑的是最後一次 Closed 鎖修改（NULL 與 `''` 視為相同、沒有變更就不寫入）之前的版本；該修改只動 `audit_service.py` 的 Closed 分支，已由上面的相關測試重跑涵蓋。完整測試沒有對最終版本重跑。

## 行為變化（審查請注意）
- 建立時的日期改為嚴格格式：時間戳（如 `2026-10-01T09:00`）以前會被截成日期，現在 422。前端 `<input type="date">` 只送 `YYYY-MM-DD`，不受影響。
- 建立時不可用 Closed／Void。前端精靈新紀錄若選 Closed 會得到 400，目前前端只顯示通用錯誤訊息（前端 #9，B 批）。
- Closed 紀錄沒有實質變更的重送不再寫入，也不再產生一筆 UPDATE 稽核紀錄（以前會）。
- 讀取：資料庫裡日期格式錯或順序顛倒的 Audit 以前會讓清單 500，現在原值回傳。沒有新增 `date_issues` 欄位（不改回應契約）。

## 未做／限制
- **Python 3.11 未測**：Colima 沒在跑（docker socket 無法連線），本輪沒有啟動。依 DECISIONS，部署前必須補跑。
- 未在瀏覽器實測（本輪只改後端；前端行為由 B 批處理）。
- 正式站是否已有被清空 auditNo 的紀錄：未查。
- #13 與待決策事項（Close／Void 權限、Void 唯讀）未處理，見 TASK。
