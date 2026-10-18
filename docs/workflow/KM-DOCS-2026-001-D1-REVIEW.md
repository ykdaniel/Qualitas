# REVIEW.md — 審查結果

TASK_ID: KM-DOCS-2026-001-D1
ROUND: 1（2026-10-18，獨立審查代理人，唯讀；worktree km-d1，基準 e651f87a）
判定：**REVISE → 已修正，待 R1 複核或主要調度認可**

## R1 發現與處置
| # | 發現 | 處置 |
|---|---|---|
| P1-1 | 公司層文件的檔案可被只持 document:*（含承包商帳號）者經 `/api/files` upload／delete／by-entity／get／download 讀寫，繞過 km:*；`attachment_access` 把 `document_version` 固定對應 document:*，`is_company_wide` 又讓所有帳號對公司版次 in-scope。 | **已修**：`core/attachment_access.permission_entity_type(db, entity_type, entity_id)`——公司層版次回 `km`，專案層回 `document_version`；file_router 五個端點的權限檢查都改用它。測試：`test_version_upload_stores_both_files_extracts_word_text_and_checks_types` 補 approver（只有 document:*）對公司版次 download／by-entity／upload／delete 皆 403（PERMISSION_DENIED 列 km:update:all）、viewer（只有 km:view）可下載公司 PDF；專案版次維持 document:*（approver 200、viewer 403）。 |
| P2-1 | `bind_files` 與 `add_version` 的狀態檢查在 `begin_write_transaction` 之前且未 refresh，與 `transition` 併發時可把檔案綁到剛核准的版次。 | **已修**：兩處改為先取寫鎖、`db.refresh` 後再判斷。 |
| P2-2 | 經 `/api/files` 上傳的 word／pdf 只過通用白名單，PNG 可當 pdf 綁成發行 PDF。 | **已修**：`bind_files` 檢查 `att.mime_type`（pdf 必須 application/pdf、word 必須 Word MIME）。測試：PNG 標 pdf 上傳成功但補綁回 400。 |
| P2-3 | `add_reference` 併發重複觸發唯一索引 IntegrityError → 500。 | **已修**：捕 IntegrityError、rollback、回傳既有引用。 |
| P2-4（註記） | `add_reference` 不驗來源記錄存在／範圍；viewer 可建引用並使草稿不可刪。 | 不改：D5 接線時在來源模組側驗證；已寫入 TASK／DESIGN §10。 |
| P3-1 | `transition` 先驗 `to` 再查權限，無權者對不合法 `to` 得 409 而非 403。 | **已修**：進入前先 `require(user, scope, "update")`；approve 步驤仍另查。 |
| P3-2 | 公司層 `to="draft"` 自 archived 回到 current，字面不符。 | **已修（說明）**：router docstring 與程式註解寫明 draft＝解封回原狀態，`to="current"` 自 archived 亦可。 |
| P3-3 | `AttachmentResponse.file_url` 指向 `/api/files/download`，km-only 使用者對公司文件需走 `/api/documents/.../download`。 | P1-1 修正後公司文件的 `/api/files/download` 也以 km:view 放行，問題消失；D2 仍建議用 `/api/documents` 的下載端點。 |

## R1 確認無發現
專案文件跨專案 404（record_in_scope＋apply_scope）；下載 realpath 守衛；已發行版次鎖（bind／files upload／delete／add_version）；權限先於狀態；檔案失敗 rollback＋刪檔；編號在寫鎖內且與 KM 共用計數器；claim_row_version 於 update 與 transition；狀態機；搜尋 outer join 現行版；第 33 步冪等（審查者自建缺欄表連跑兩次驗證）；遷移腳本冪等、不 import main；分層、refusal 代碼、log_audit strict、CRLF、命名規則＋首號測試、ROW_VERSION_TABLES。

## 修正後驗證
- `tests/test_documents_http.py` 13 passed（含新增斷言）；受影響套件重跑 354 passed；3.11 全套第 2 輪 2905 passed／0 failed（第 1 輪 5 failed 為 3.11-slim 的 MIME 資料庫問題，已修，見 STATUS）。
