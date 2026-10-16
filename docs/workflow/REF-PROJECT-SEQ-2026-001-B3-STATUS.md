# STATUS.md — Claude 執行結果

TASK_ID: REF-PROJECT-SEQ-2026-001-B3
ROUND: 1（2026-10-14）
基準：09f6a688（協調中心指定）；尚未提交。

## RESULT
- [x] DONE（待部署）：
  - R1 獨立審查：PASS with notes，P2 和 P3 已修；
  - 第二審查（naming rules）：PASS with notes；
  - 3.11 全套第 2 輪：2771 passed、0 failed；
  - 使用者在 3296 看完後回覆「第 3 批可以」（由協調中心轉達，2026-10-14）。原始文件號欄位的位置不變。

## 使用者決定（本輪）
DECISIONS 第 11 點。
- 共用 Checklist 範本比照 ITP，用 `QTS-RKS-STD-CHK-`。
- Q-WorkFlow 用 `Q-WorkFlow-<代碼>-######`。
- 既有號碼都不改。

## 本輪修改：產品程式

### 後端
| 檔案 | 內容 |
|---|---|
| `core/constants.py` | `SYSTEM_CODE='QTS'`、`COMPANY_CODE='RKS'`、`SHARED_CODE='STD'`。 |
| `core/utils.py` | **取號改成依專案**（D2）：<br>• `generate_reference_no(db, vendor, type, project_id=...)`：一定要傳 `project_id`，沒傳會 TypeError；傳 None 代表共用範本，代碼用 STD。<br>• 序號 key 是（專案 id 或 'STD', '*', 類型），類型一律存成大寫，所以 'meeting'、'MEETING' 共用同一個計數。<br>• 前綴：命名規則有 `[PROJECT]` 就套用規則；沒有規則或規則還是舊格式時，退回 `QTS-RKS-<代碼>-<類型>-`。不會產生不含專案的號碼。<br>• self-heal 用新前綴比對資料表裡的最大號，`_DOC_TYPE_TABLES` 補上 FOLLOWUP、QWORKFLOW。<br>• 新增 `numbering_code`：專案沒有代碼時拒絕（400 `PROJECT_CODE_MISSING`）。<br>• `preview_reference_no`、`reference_pattern`、`reclaim_reference_no` 改成（db, 類型, 專案）。<br>• QWORKFLOW 類型：前綴 `Q-WorkFlow-<代碼>-`，不看命名規則。 |
| `services/*`（noi、itr、ncr、obs、osd、pqp、followup、meeting_minutes、checklist、itp、audit、material_submittal） | 所有取號都傳入建立時已確定的專案。<br>• itr：建立、開 NCR、重新檢驗、連結 Checklist，以及重新檢驗時複製的 Checklist。<br>• audit：建立、修改。<br>• meeting：reclaim 改用會議的專案。<br>• Checklist 範本：`project_id=None`，所以是 STD。 |
| `services/itr、followup、meeting_minutes、checklist` | 建立時**先** `begin_write_transaction` 再取號（範圍追加 B）。其他模組原本就有寫入鎖，或用 `lock_*_for_write`，已逐一核對。 |
| `services/noi_service.py` | • 修改：拿掉「改承包商就重新編號」。已有文件引用時，仍然禁止改承包商。<br>• `preview_reference_no(project_id, scope)`：用和建立相同的方式決定專案（`enforce_create_scope`），回傳完整號碼，**拿掉遮罩**。<br>• Q-WorkFlow：有專案就用 `Q-WorkFlow-<代碼>-######`；只有沒有專案的舊 NOI，才沿用舊的全域 MAX+1。 |
| `routers/noi.py` | `GET /noi/next-reference`：<br>• 參數從 `contractor` 改成選填的 `project_id`；<br>• 管理者在「所有專案」下回 400 `PROJECT_REQUIRED_FOR_CREATE`；<br>• 不在自己範圍內的專案回 403。 |
| `services/project_service.py`、`routers/projects.py` | 專案代碼（D14）：<br>• 規則：必填、2–8 碼英數字、存成大寫、不分大小寫唯一、`STD` 保留。<br>• 違反時回 400，代碼分別是 `PROJECT_CODE_REQUIRED`、`INVALID`、`RESERVED`、`DUPLICATE`，參數為 `projectCode`。<br>• 修改時只有帶了 code 才檢查。<br>• 代碼可以改；序號 key 是專案 id，所以改代碼後序號接續。 |
| `routers/settings.py` | • 預設規則改成 `QTS-RKS-[PROJECT]-<TYPE>-`，共 13 種。<br>• 存檔檢查：必須含 `[PROJECT]`、不准 `[ABBREV]`，km 例外。<br>• 錯誤訊息維持既有的 HTTPException 寫法；改用 i18n 不在本批範圍。 |
| `models.py`、`schemas.py` | • ITP 新增 `external_doc_no`（schema 長度上限 500）。<br>• 新資料表 `ItpRenumberMap`。 |
| `services/itp_service.py`、`repositories/itp_repository.py` | • `external_doc_no` 去掉前後空白，空字串存成 NULL。<br>• 清單搜尋也比對 `external_doc_no`。 |
| `db_migrations.py`（共用檔） | • **新增欄位**：`itp.external_doc_no`。<br>• **第 27 步**：共用 ITP 改成 STD 號、同步引用、寫對照表、複製原始文件號、設定序號起點。<br>• **第 28 步**：專案代碼唯一索引 `ux_projects_code_upper`，建在 `UPPER(TRIM(code))`，只涵蓋非空值；已有重複代碼時記 error，不建索引。<br>• **第 29 步**（flag `naming_rules_project_format_v1`）：<br>　- 13 種規則補齊；沒通過新檢查的規則改成預設值，舊前綴寫進 audit（NamingRule `UPDATE`／`CREATE`）。<br>　- 新前綴文字和舊承包商前綴相同時（例如專案 HL 和承包商 HL），把舊計數設為該專案的序號起點；只會往上調。<br>• linkedChecklists 的產號傳入 ITR 的專案。 |

### 前端
- **`services/api.ts`、`NOIDetailModal.tsx`（CRLF）**：預計編號改用目前專案查詢，不再依承包商，也不再遮罩。提示文字使用新鍵 `noi.expectedReferenceHintProject`。
- **`Contractors/ProjectModal.tsx`（＋CSS）**：
  - 專案代碼改為必填，輸入時轉成大寫並檢查格式和 `STD`；
  - 顯示這個專案的號碼範例；
  - 修改既有代碼時提示「新單據用新代碼、序號接續、已發出的號碼不變」；
  - 存檔錯誤：有拒絕代碼就用 `showRefusal`，其他顯示 toast。
- **`DocumentNamingRules/*`**：
  - 預設規則改成 `[PROJECT]`；
  - 新增 `prefixProblem`，檢查方式和後端相同；
  - 範例號碼用目前專案代碼，「所有專案」時用 ABC；
  - 說明改用新鍵。
- **ITP（`ITPModals.tsx`、`columns.tsx`、`itpStore.ts`）**：
  - 新增「原始文件號」欄位，放在「文件編號／承包商」的下一列，獨占一整列。**版面待使用者在預覽時確認。**
  - 共用範本只有管理者能編輯，沿用 B2 的唯讀規則。
  - 清單在文件編號下方以小字顯示原始文件號；搜尋走後端。
- **`LanguageContext.tsx`（只新增鍵）**：
  - `refusal.code.PROJECT_CODE_MISSING`、`REQUIRED`、`INVALID`、`RESERVED`、`DUPLICATE`
  - `noi.expectedReferenceHintProject`
  - `namingRules.errorMissingProject`、`errorAbbrevRetired`、`hintContentProject`
  - `itp.externalDocNo`、`externalDocNoPlaceholder`
  - 舊的 `hintContent`、`errorMissingAbbrev`、`expectedReferenceHint`、`namingRules.desc.*` 不再使用，但保留；清理不在本批範圍，見 TASK 範圍追加 A「不吸收」。

### 已知、未處理
- **`crud.py` 的舊 `generate_reference_no`**：沒有任何呼叫端，依「不擴大範圍」原則不刪，留給後續清理。
- **第 25 步之前的舊 NOI**：如果還沒有 Q-WorkFlow 列，啟動時的 backfill 仍然用全域 `Q-WorkFlow-######` 補。正式站所有 NOI 都已經有列，演練時 backfill 沒有新增任何列。
- **內部呼叫沒有專案時**（`scope=None` 的測試和 migration 路徑）：取號會得到 STD。實際的建立流程都必須有專案（B2）。

## 本輪修改：測試
- **新增 `tests/test_ref_project_seq_b3_http.py`**，共 28 個測試，涵蓋：
  - 每個專案從 1 起算，兩個專案不撞號；
  - 號碼不含承包商；
  - 同前綴時接續舊號；
  - 共用範本用 STD；
  - 改代碼後序號接續；
  - 沒有代碼的專案不能取號；
  - 同一交易內連續取號（13 種類型），以及大小寫不同的類型共用計數；
  - 專案代碼的 8 種拒絕情形、存成大寫；
  - 唯一索引不分大小寫；
  - 命名規則的檢查和預設值；
  - 第 29 步：改寫、補齊、audit、序號起點、只跑一次；
  - 第 27 步：排序、引用、對照表、audit、內容雜湊、external_doc_no 只寫入空值、序號起點、只跑一次；
  - external_doc_no 的搜尋和清空；
  - Q-WorkFlow 格式；
  - next-reference：完整號碼、不在範圍內回 403、所有專案回 400、不佔號；
  - **4 個競態測試**（ITR、Follow-up、會議記錄、Checklist 範本）。
- **競態測試的反向驗證**：把各模組的 `begin_write_transaction` 換成空函式後，4 個測試都會失敗；恢復後都通過。
- **共用 helper `tests/conftest.py`**：測試建立的 Project 如果 code 是 None，就從 id 產生代碼，例如 PA、P1，模擬管理者已經設好代碼的狀態（D14 規定每個專案都有代碼）。
  - 要測「沒有代碼」的情境，就明確寫 `code=""`，例如 B3 測試裡的 PN。
  - 透過 API 建立的專案不受影響，仍然必須帶代碼。
  - 子程序類的測試（seeder）不會載入 conftest，所以在測試裡直接給代碼。

### 依設計改變的斷言（D2、D14、TASK 第 3、7、8 點）
| 測試檔 | 改變 |
|---|---|
| `test_noi_create_atomic_http.py` | • Q-WorkFlow 從 `Q-WorkFlow-000001` 改成 `Q-WorkFlow-PA-000001`（第 7 點）。<br>• 一次建立會寫 2 個計數（NOI 和 QWORKFLOW），所以 `sequences` 從 1 改成 2。<br>• legacy backfill 那條斷言不變。 |
| `test_noi_qworkflow_backfill_rule_http.py` | 一般建立的 Q-WorkFlow 改成 `Q-WorkFlow-PA-000001`。 |
| `test_noi_contractor_lock_http.py` | 3 個「改承包商或縮寫就重新編號」改成「號碼不變」（第 3 點）；已有文件時禁止改承包商的鎖不變。 |
| `test_noi_audit_delete_update_http.py` | • next-reference 的 3 個測試改成依專案、完整號碼、不遮罩（第 8 點）。<br>• 回滾測試的「改承包商後號碼含 -BET-」改成「號碼不變」。 |
| `test_settings_naming_rules.py` | • 「缺 `[ABBREV]` 時拒絕」改成「缺 `[PROJECT]` 時拒絕」。<br>• 新增「`[ABBREV]` 拒絕」和「km 例外」。<br>• 重複前綴、合法規則的範例改用 `[PROJECT]`。 |
| `test_integration_real_db.py` | • 沒有專案時取號為 STD。<br>• NOI 改在有代碼的專案下建立，得到 `QTS-RKS-AS-NOI-000001`。<br>• 「承包商決定前綴」改名為「承包商不再決定前綴」，共用計數。 |
| `test_audit_contractor_scope_http.py` | 稽核號從 `-AB-` 改成 `QTS-RKS-<專案代碼>-AUD-000001`；「不從其他承包商的計數取號」不變。 |
| `test_material_submittals_http.py` | `QTS-V1-MSA-000001` 改成 `QTS-RKS-P1-MSA-000001`。 |
| `test_checklist_service.py`、`test_followup_service.py`、`test_meeting_minutes_service.py` | mock 呼叫的參數加上 `project_id`，或改成新的 reclaim 參數順序。 |
| `test_itp_checklist_km_project_audit_http.py`、`test_materials_http.py` | 透過 API 建立專案時帶 `code`（D14）。 |
| `test_seeder_permission_persistence.py` | 子程序建立的專案帶 `code`。 |
| 前端 `tests-unit/namingRules.test.ts` | 範例號碼改用 `[PROJECT]`；新增 `prefixProblem` 測試。 |
| 前端 `tests-unit/refusal.test.ts` | PARAMS 補上 5 個代碼。 |

## R1 之後的修正（R1：PASS with notes）
| 項目 | 處理 |
|---|---|
| **P2-1** project_service.py 行尾被改成 LF | 用二進位模式改回 CRLF；`git diff --stat` 從 +133／−103 變成 +42／−2。 |
| **P2-2** 部署檢查和回滾步驟 | 補在下方「上線影響」。 |
| **P3-2** 稽核補號時，前端送 `project_id: null` 會取到 STD | 改成 `processed_data.get("project_id") or db_audit.project_id`。 |
| **P3-3** 會議刪除已提交，但 reclaim 失敗時 audit 會遺失 | reclaim 包成盡力而為，失敗時只記 warning，DELETE 的 audit 照寫。<br>新增測試：刪除沒有代碼的專案裡的 Draft 會議，仍然有 audit。<br>反向驗證：拿掉 try 後，這個測試會失敗。 |
| **P3-4** 唯一性檢查沒有 TRIM；兩人同時存同一代碼時回 500 | 檢查改成 `UPPER(TRIM(code))`，和索引一致。<br>撞到索引的 IntegrityError 改成 400 `PROJECT_CODE_DUPLICATE`（`_code_clash`），其他錯誤不變。<br>新增單元測試。 |
| **P3-5** `external_doc_no` 的 `index=True` 在既有資料庫不會建立 | 拿掉 `index=True`，因為 ILIKE `%x%` 用不到索引，新舊資料庫因此一致。 |
| **P3-6** 原本是空 prefix 的規則，被改寫時 audit 記成 CREATE | 動作明確傳入，既有列一律記 `UPDATE`，old_value 記原值。 |
| **P3-8** B3 測試第 228 行斷言太鬆 | 拿掉多餘的 `or`。 |
| **隔離預覽時自己發現：啟動時 seeder 會重建已改號的示範 ITP** | 啟動順序是先 migration 再 seeder。seeder 用種子號（`QTS-RKS-HL-ITP-000001`／`000002`）判斷示範 ITP 是否已存在；第 27 步把它們改成 STD 號後，seeder 會用舊號再建一份重複的共用範本。正式資料庫複本演練只跑了 migration，沒跑 seeder，所以沒發現。<br>**修正**：`db_seeder._seeded_itp_exists` 也檢查 `itp_renumber_map.old_referenceNo`。<br>新增測試：先 seed，再跑第 27 步，再 seed 一次，不會出現 HL 舊號。<br>反向驗證：拿掉這個檢查，測試就失敗。 |
| **協調中心在預覽時發現：全新資料庫上，示範共用 ITP 仍是 HL 號** | 全新資料庫啟動時，第 27 步先跑（當時沒有 ITP，flag 已設），seeder 之後才用寫死的 `QTS-RKS-HL-ITP-000001`／`000002` 建立示範 ITP。這兩筆是共用範本（沒有專案），卻不在 STD 序列裡，之後也不會再被改號。正式站的這兩筆早就存在，第 27 步會照常改號，所以不受影響。<br>**修正**：<br>• seeder 建立示範 ITP 時改用 STD 計數取號（`generate_reference_no(..., project_id=None)`），id 固定為 `seed-itp-<種子號>`。<br>• 判斷是否已存在時，比對固定 id、舊種子號，以及 `itp_renumber_map`。<br>**新增測試**：在全新資料庫上先跑第 27 步再 seed，不會出現 project_id 為 NULL 的 HL 號 ITP；示範 ITP 是 STD 000001、000002；再次啟動不會重建。<br>**原有的正式站情境測試**改成預先放入兩筆 HL 號、隨機 id 的列。<br>**反向驗證**：換回前一版 seeder，全新資料庫的測試會失敗。<br>**預覽種子**：自己的 STD 範例改用 000003，避免和示範 ITP 撞號。 |
| **P3-1、P3-7、P3-9、P3-10** | **不在本批處理**，列入後續：<br>• P3-1：沒有專案的非範本單據改成拒絕取號；會改變內部呼叫的行為，需另行評估。<br>• P3-7：backfill 依專案取號。<br>• P3-9：新專案沿用同名舊承包商的計數。<br>• P3-10：拒絕 id 為 "STD" 的專案。<br>以上都是正式站目前碰不到的潛在問題。 |

## 第二審查（naming rules 工作階段，R1-B）
- **結果**：PASS with notes，沒有必改。內容見 REVIEW.md 最後一節。
- **盤點的 5 點都已落實**：13 種 doc_type、計數鍵與 self-heal、前後端驗證與 km 例外、FAT、會議 rev。
- **兩點建議都不在本批處理**，列入後續：
  1. STD 只允許 ITP 和 CHECKLIST；其他類型沒有專案時回 400。與 R1 P3-1 是同一件事。
  2. `settings.py` 寫入時沒有 strip prefix（檢查時有）。這是 B3 之前就有的問題，B3 之後由 naming rules 工作階段處理。
- **未改的理由**：兩點正式站目前都碰不到；在 3.11 全套跑完之後才改程式碼，就要再跑一輪 55 分鐘的全套。
- **備註**：
  - 第 29 步會把自訂過的舊規則重設成預設值；正式站都是預設值，不受影響。
  - 不再使用的 i18n 鍵（hintContent、errorMissingAbbrev、desc.*）在 B3 之後由 naming rules 工作階段清理。

## 執行證據
- **後端，本機 Python 3.14（僅供開發參考，以 3.11 全套為準）**：
  - 第一輪全套：468 failed、2311 passed、3 skipped。主因是測試建立的專案沒有代碼。
  - 加上 conftest helper 並調整上表斷言後，重跑原本失敗的檔案：見下方「R1 前重跑」。
- **B3 新測試**：28 passed。B2 測試：19 passed。
- **前端**：
  - `tsc --noEmit` 通過；
  - `npm test` 199 passed；
  - 修改過的檔案 eslint 沒有新增警告；剩下的 13 個警告都在這次沒改的 ITP 檔案裡（ITP.tsx、ITPDetail.tsx、ITPAdvancedEditor.tsx），原本就有。
- **正式資料庫複本演練**：見 [std-renumber-rehearsal.md](REF-PROJECT-SEQ-2026-001-B3-evidence/std-renumber-rehearsal.md)，只有統計。
  - 63 筆改號；81 筆原始文件號；內容雜湊相同；引用沒有斷掉；
  - 重跑沒有任何變更；
  - 兩份複本已刪除，原始快照雜湊不變。
- **R1 前重跑**（本機 3.14）：第一輪失敗的 54 個檔案，加上 B3 新測試，**1225 passed、0 failed**（29 分 59 秒）。
- **隔離環境實測**（埠 8296／3296，種子 `scripts/verification/seed_ref_project_seq_b3_review.py`）：
  - API：pm_hl 的預計編號是 `QTS-RKS-HL-NOI-000005`（舊號 000004 之後）；pm_new（專案沒有代碼）回 400 `PROJECT_CODE_MISSING`；admin 在「所有專案」下回 400，選 TECO 時是 `QTS-RKS-TECO-NOI-000001`；建立代碼為 `std` 的專案回 400 `PROJECT_CODE_RESERVED`。
  - 畫面：專案表單（輸入轉大寫、STD 保留提示）、命名規則頁（`[PROJECT]`、範例 ABC、新說明）、ITP 清單和表單（原始文件號）、NOI 新增表單（預計編號和新提示）。
- **3.11 全套第 1 輪**（在 seeder 改用 STD 之前）：**2770 passed、17 skipped、0 failed**，見 [py311-full-suite-r1-before-seeder-std.txt](REF-PROJECT-SEQ-2026-001-B3-evidence/py311-full-suite-r1-before-seeder-std.txt)。
- **3.11 全套第 2 輪**（最終版程式碼，seeder 已改用 STD）：**2771 passed、17 skipped、0 failed**（58 分 44 秒），pytest_exit=0，見 [py311-full-suite-r2.txt](REF-PROJECT-SEQ-2026-001-B3-evidence/py311-full-suite-r2.txt)。
  - 開跑時間 2026-10-14T10:24:54Z。容器在開跑時複製工作樹，之後只改了一個檔：`backend/scripts/verification/seed_ref_project_seq_b3_review.py`（預覽種子腳本，只把範例 STD 號從 000001 改成 000003）。這個檔沒有被任何測試引用；其餘程式和測試都和提交內容相同。

## 使用者預覽（隔離環境 http://127.0.0.1:3296）
- **登入**：內建瀏覽器已用 `admin`（系統管理者）登入。
- **帳號**：

| 帳號 | 角色 |
|---|---|
| `admin` | 系統管理者，可選「所有專案」或指定專案 |
| `pm_hl` | Hailong 成員（代碼 HL） |
| `pm_new` | 「New site」成員，這個專案沒有代碼 |

- **密碼**：不寫進文件，也不貼在對話裡。
  - admin：隔離目錄的 `admin-password`
  - pm_hl、pm_new：同一目錄的 `review-password`
  - 隔離目錄：`/private/var/folders/l3/76bnxp9x47159snm4w96_r6w0000gn/T/qualitas-manual-iksuxres/`
- **要看的畫面**：
  1. **專案表單**（admin，Contractors → Projects → Add Project 或點一個專案）：
     - 代碼必填，輸入會轉成大寫，例如輸入 `std` 會顯示 `STD`，並提示是保留字；
     - 欄位下方顯示號碼範例；
     - 修改既有代碼時會提示「新單據用新代碼、序號接續」。
  2. **命名規則頁**（admin，Settings → Document Naming Rules）：
     - 前綴都是 `QTS-RKS-[PROJECT]-<TYPE>-`；
     - 範例在「所有專案」下顯示 ABC，選了專案時顯示該專案代碼；
     - 頁面下方有 `[PROJECT]` 和 STD 的說明；
     - 前綴拿掉 `[PROJECT]` 或加上 `[ABBREV]` 時，存檔會被擋。
  3. **ITP 原始文件號**（admin，Quality Control → ITP）：
     - 清單：`ITP-SHARED-EXT` 的文件編號下方以小字顯示 `FHS-ITP-2026-017`；
     - 表單：在「文件編號／承包商」下一列，獨占一整列。**這個位置是暫定的，請使用者確認。**
  4. **NOI 預計編號**：
     - 用 pm_hl 在 NOI 頁按 Add New NOI：編號欄顯示 `QTS-RKS-HL-NOI-000005 (expected)`，接在舊號 000004 之後；
     - admin 選 TECO：會是 `QTS-RKS-TECO-NOI-000001`。


- **啟動時一次執行第 27–29 步**，都由 migration_flags 控制、各自單一交易；失敗時只記 log，下次啟動再試。
- **上線後立即生效**：
  - Hailong 的新單據號碼見演練表，例如 NOI 從 `QTS-RKS-HL-NOI-000005` 起；
  - 共用 ITP 範本從 `QTS-RKS-STD-ITP-000064` 起。
- **對照表 CSV**：上線後在正式站匯出：
  ```
  sqlite3 -header -csv <db> "SELECT itp_id, old_referenceNo, new_referenceNo, migrated_at FROM itp_renumber_map ORDER BY new_referenceNo" > itp_renumber_map.csv
  ```
  依協調規則存放，不放進 repo。
- **回滾依據**：
  - `itp_renumber_map`；
  - audit `RENUMBER_STD`、`COPY_EXTERNAL_DOC_NO`、NamingRule `UPDATE` 的舊值。
- **前端**：上線後請硬重新整理。

### 上線後檢查（R1 P2-2）
第 27–29 步失敗時只記 log，不會擋住啟動，所以上線後要逐項確認。任何一項不符就先停止使用，不要開放建單：
1. `migration_flags` 有 `shared_itp_std_renumber_v1` 和 `naming_rules_project_format_v1`。
2. 索引 `ux_projects_code_upper` 存在。
3. `itp_renumber_map` 是 63 筆，`external_doc_no` 有值的是 81 筆（與演練相同）。
4. 啟動 log 沒有 `Could not renumber shared ITPs`、`Could not move naming rules`、`unique index not created`。
5. `document_naming_rules` 的 13 筆前綴都含 `[PROJECT]`。

### 回滾（R1 P2-2）
- **優先**：用部署前的正式資料庫快照，加上 09f6a688 的映像檔，一起回滾。
- **不能直接換回舊映像檔**：第 29 步改過規則之後，舊程式只會替換 `[ABBREV]`，會發出字面上就是 `QTS-RKS-[PROJECT]-…` 的號碼。
- **不用快照時的順序**：
  1. 用 audit `NamingRule UPDATE` 的 old_value 還原 `document_naming_rules`；
  2. 用 `itp_renumber_map` 還原 `itp.referenceNo`、`noi.itpNo`、`followup.sourceReferenceNo`（sourceModule ITP）、`itr.detail_data` 的 itpNo；
  3. 最後才啟動舊映像檔。
- `external_doc_no` 欄位和 `itp_renumber_map` 留著，不影響舊程式。
