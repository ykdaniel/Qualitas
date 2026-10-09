# MATERIAL-SUBMITTAL-M1 — STATUS（Claude 執行結果，待獨立審查）

TASK_ID: MATERIAL-SUBMITTAL-M1-2026-001
範圍依據：`MATERIAL-SUBMITTAL-M1-TASK.md`；驗收清單：規格 `docs/planning/MATERIAL-SUBMITTAL-V1-SPEC-2026-10-08.md` §9.4。
根目錄 `DEPLOY-EXEC-2026-001` 的 TASK／STATUS／REVIEW 未改動。**未提交、未推送、未部署。**

## RESULT
- [x] DONE（M1 範圍實作與隔離測試完成，交獨立審查；**不自填 PASS**）
- [ ] PARTIAL
- [ ] BLOCKED

## 本輪實際修改
- 修改既有檔案（`git diff --stat`，不含另案已審的 `core/docx_builder.py`）：
  - `backend/models.py` +127：四張 migration_owned 表，`Project.material_reply_days`。
  - `backend/db_migrations.py` +185：第 21 步 `_create_material_submittal_schema`、`MATERIAL_INDEXES`、完整驗證。CRLF 檔，新增行同為 CRLF。
  - `backend/schemas.py` +92：專案的 `materialReplyDays`（StrictInt ≥0 或 null）、Material 相關 schema（camelCase、`extra=forbid`）。
  - `backend/core/perms.py` +8：三個權限碼。CRLF 已逐位元組還原，見「問題與處理」。
  - `backend/core/validators.py` +2：`check_project_references` 納入 Material 與 MaterialSubmittal。CRLF 已還原。
  - `backend/main.py` +4／−2：註冊 materials router。
- 新增檔案：
  - `backend/routers/materials.py`
  - `backend/services/material_service.py`
  - `backend/repositories/material_repository.py`
  - `backend/tests/test_materials_http.py`（33 項）
  - `backend/tests/test_material_schema_migration.py`（11 項）
- 文件：
  - 規格 §9（索引唯一清單、404 與 vendor 範圍規則、結果未知的處理、M1 有效驗收清單）；
  - §3.5／§7 更正功能改為已確認、安排於 M2；
  - `DECISIONS.md` 新增「材料送審：誤登外部結果的更正」；
  - 本批 TASK／STATUS／REVIEW 與 handoff。
- 檔案雜湊：`MATERIAL-SUBMITTAL-M1-evidence/file-hashes.txt`（全套測試前取得；測試後重新比對完全相同）。

## 驗收對照（§9.4）
| AC | 結果 | 證據性質 |
|---|---|---|
| AC-R3-1 空資料庫 | 通過：四張表、11 個索引（欄位、唯一性、WHERE）、projects 新欄位；四個唯一索引另以規格原文寫死比對；四張表不由 create_all 建立 | 實測（subprocess 啟動） |
| AC-R3-2 舊資料庫升級 | 通過：舊資料庫由**基準 commit `056c245c` 的舊程式**實際啟動建立；升級後 contractors、ncr、projects 原欄位不變，audit_logs 只有新增 | 實測 |
| AC-R3-3 重複啟動 | 通過：第二次啟動後 sqlite_master 完全相同 | 實測 |
| AC-R3-4 失敗回報 | 通過，五種情況都中止啟動，資料與錯誤物件保留、未被替換：缺欄位、缺 NOT NULL、同名索引欄位錯誤、one_open 缺 WHERE、唯一索引改為非唯一 | 實測 |
| AC-R3-5 回退 | 通過：在升級後的資料庫上，舊程式可以啟動並新增、更新專案；再升級回來，材料資料仍在 | 實測 |
| AC-R3-6 天數 | 通過：接受 null／0／14；拒絕 -1／1.5／"14"／true | HTTP 實測 |
| AC-R3-7 命名與多餘欄位 | 通過：回應為 camelCase；多餘欄位或受控欄位（id、createdBy、createdAt、projectId on PUT）回 422，零寫入 | HTTP 實測 |
| AC-R3-8 列表 | 通過：缺 projectId 回 422；limit=2 時 total 仍為 5；limit=501 回 422 | HTTP 實測 |
| AC-M1-1′ | 通過：不可見或不存在的 projectId 回 404，零寫入；名稱空白或為 null 回 422 | HTTP 實測 |
| AC-M1-2 | 通過：只屬 P1 的使用者，GET 與 PUT P2 的材料、列 P2，都回 404；列表只有 P1 | HTTP 實測 |
| AC-M1-4 | 通過：可設定、清除；新專案預設為 null；其他欄位的更新不影響此值 | HTTP 實測 |
| AC-M1-5 | 通過：無權限回 403；只有 view 時寫入回 403；**vendor 範圍帳號即使誤配全部 material 權限，四個端點都回 403**；DELETE 回 405 | HTTP 實測 |
| AC-M1-6 | 通過：新增與修改都寫入 AuditLog；`log_audit` 注入失敗時回 500，且材料、稽核、專案三表與失敗前完全相同 | HTTP 實測 |
| AC-M1-7 專案引用保護 | **僅在 service 層驗證**：`ProjectService.delete_project` 對有材料的專案拋出 `ValueError("…Material…")`，專案仍在。**HTTP 限制**：`DELETE /api/projects/{id}` 的 router 沒有攔截此 ValueError，正式環境由全域例外處理回 **500**（非 4xx）。這是既有行為，所有被引用模組都一樣，M1 未修改。**不宣稱完整的 HTTP 驗收通過** | service 實測；HTTP 未驗、已知為 500 |
| AC-M1-8 model 與清單一致 | 通過：create_all 建出的索引定義等於 `MATERIAL_INDEXES` | 實測 |

## 反向檢查（`MATERIAL-SUBMITTAL-M1-evidence/mutation-checks.txt`）
- 逐一移除 9 項保護，都有對應測試失敗（CAUGHT）。
- 發現並補上一個缺口：清單與 model 同時拿掉 WHERE 時原本抓不到。補上後重新檢查，確認 CAUGHT。
- 每次修改後都以位元組副本還原，並核對 SHA-256。
- 依指示，本輪收尾**沒有重跑**這些反向檢查。

## 全套測試
- **第 1 次：作廢**（`full-suite-attempt1-VOID.txt`）。執行期間與反向檢查暫時修改 `models.py`／`db_migrations.py` 的時間重疊；它在完成前被停止，沒有輸出，不採用。
- 第 1 次作廢後，確認被修改的保護都已回到原始碼，並記錄全部 M1 檔案的雜湊。
- **第 2 次：乾淨**（`full-suite-attempt2.txt`，完整輸出）。
  - 結果：**2261 passed、3 skipped，退出碼 0**，耗時 37 分 48 秒，Python 3.14.6，pytest 9.0.2。
  - 3 個 skipped 都在既有檔案（`test_isolated_stack_tool` 2 項、`test_validation_fixes` 1 項）；M1 的 44 項全部執行並通過。
  - 執行後再比對 M1 檔案雜湊，與執行前完全相同。

## 問題與處理
1. 以 Python 文字模式改寫 `core/perms.py`、`core/validators.py`，造成 CRLF 被轉成 LF，整檔都顯示為修改。已逐位元組轉回 CRLF。目前兩檔每行都是 CRLF，diff 只剩 +8／+2。
2. 第一版證據說明寫錯了哪個測試失敗（已在證據檔中更正），並據此補上前述缺口。
3. 檔案雜湊清單第一次產生時，zsh 沒有展開變數，已改用陣列重新產生（檔內有註記）。

## 未做／限制
- 未在 Python 3.11 執行。部署前（M5）必須完成。
- 專案刪除透過 HTTP 回 500 的既有限制（見 AC-M1-7）。若要改成 4xx，需另案處理，並涵蓋所有模組。
- M2 之後的送審、版次、結果、附件、更正都沒有實作；沒有任何刪除功能；沒有前端。
- 未碰開發資料庫、8240／3240、8198／3198；測試只使用 tmp 下的資料庫。
- 材料程式沒有混入 DOCX 單檔部署：DOCX 部署只使用已審的 `core/docx_builder.py`，與 M1 檔案沒有重疊。

## 下一步
- 交獨立審查。審查 PASS 後才進入 M2（含已確認的更正功能）。部署依 M5。
