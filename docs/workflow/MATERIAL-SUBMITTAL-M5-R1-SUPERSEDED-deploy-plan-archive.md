# MATERIAL-SUBMITTAL-M5 — 部署準備方案（R1，待審；不是執行授權）

TASK_ID: MATERIAL-SUBMITTAL-M5-2026-001
狀態：**只是準備。** 材料功能尚未上線。本方案沒有連 NAS 寫入、沒有提交、沒有部署。
具體的 NAS 指令要等正式環境的預檢結果，定案後另行送審（§8）。

---

## 1. 前置條件（全部滿足才可能進入切換）
| # | 條件 | 現況 |
|---|---|---|
| P1 | 根目錄 DEPLOY-EXEC-2026-001 的後端預檢 r3（雜湊閘門指令）由使用者執行，且報告無 FAIL／ERROR | **未執行**（等使用者） |
| P2 | DEPLOY-EXEC 的 DOCX 後端單檔部署：先完成或由使用者決定取消。M5 的基準樹已包含 DOCX overlay（§2），但材料變更**不併入** DOCX 單檔部署 | 未部署 |
| P3 | 確認正式站後端程式＝056c245c（＋DOCX overlay，若 P2 已完成）。若預檢發現漂移，§2 的基準與本方案的演練全部重做 | 待 P1 |
| P4 | 本方案獨立審查 PASS | 待審 |
| P5 | 依 P1 的結果寫出具體切換／回退指令，並另行審查 PASS | 未開始 |
| P6 | 登入後冒煙由使用者執行；Claude 不輸入正式站密碼 | — |

## 2. 部署範圍（只有已審檔案）
- **基準**：`056c245ca3ff630f74bfc7af86233e7cbc7dc51b`，以 git archive 取得，不含工作樹的任何修改。
- **後端 overlay**，24 檔：
  - DOCX 3 檔（`docx_builder.py`＋2 個測試，屬 DEPLOY-EXEC）；
  - 材料 21 檔：修改 12、新增 9，清單見 `evidence/reviewed-hash-reconciliation.txt`。
- **前端 overlay**，24 檔：
  - 7 個已上線的 ITP 檔（DEPLOY-SCOPE-INVENTORY 候選）；
  - 材料 17 檔。
- **完整性**：
  - overlay 等於「相對 HEAD 有變更的 backend／react-app/src 檔案」，只排除驗證用的 seed 腳本，不多不少。
  - **48 檔全部等於最後一次審查時的雜湊**（`reviewed-hash-reconciliation.txt`）。
  - 逐檔閱讀共用檔（main、perms、scope、utils、validators、settings、App、AppLayout、DocumentNamingRules、ProjectModal、api、projectStore、models、schemas、db_migrations、attachment_access、file_router）的差異後確認：除了材料以外沒有其他任務的修改。
- **不部署**：
  - `backend/scripts/verification/`（seed 腳本與本輪的演練腳本）、`react-app/tests-*`、`docs/`；
  - 工作樹中其他任務的檔案（例如 `seed_itp_*`、`seed_noi_*`、各 vite launcher）；
  - DataTable 待辦（尚未開工）。
- **附註**：`projectStore.ts` 在 M4 被改成 LF 換行（HEAD 是 CRLF），實際內容差異只有 2 行。審查通過的雜湊就是 LF 版本，本方案照原樣部署，不另改換行（改了雜湊就會變，需要重審）。
- **候選產物**（本機，未上傳）：`~/Documents/Qualitas-deploy-artifacts/MATERIAL-SUBMITTAL-M5/`
  - `export-candidate/`：後端，附 `export-candidate-manifest.sha256`；
  - `export-base/`：回退演練用的舊版；
  - `frontend-dist/`：104 檔，`index.html` SHA-256 `3a45562b…a0f`，清單見 `evidence/frontend-candidate-dist-sha256.txt`。

## 3. 對正式資料庫的變更（新後端第一次啟動時自動執行）
啟動順序依 `main.py`：
1. 啟動時自動備份到 `backend/backups/qualitas_<時間>.db`，只保留最新 7 份。
2. `create_all_except_migration_owned`：材料 4 表屬 migration_owned，這一步不會建立它們。
3. `run_migrations` 第 21 步 `_create_material_submittal_schema`：
   - 建立 `materials`、`material_submittals`、`material_submittal_revisions`、`material_submittal_result_entries`；
   - 建立 11 個具名索引（`MATERIAL_INDEXES`），其中包含 `ux_msr_one_open` 這個部分唯一索引；
   - 若 `projects` 沒有 `material_reply_days`，執行 `ALTER TABLE projects ADD COLUMN material_reply_days INTEGER`（可為 null，沒有預設值）；
   - 最後完整驗證 schema，不符就 `MigrationError`，中止啟動。
4. Seeder：
   - 新增 3 個權限代碼 `material:view:all`、`material:manage:all`、`material:record_result:all`；
   - admin 角色同步為全部權限。**其他角色不會自動取得材料權限**，需要由管理員在 IAM 指派（部署後設定，屬業務決定）。
5. 延遲寫入：第一次讀取文件編號規則時，會補上 `msa` 這筆規則列（`GET /api/settings/naming-rules`）。

演練結果（§5 phase B）：在舊資料上升級時，舊表中只有 `permissions` 與 `role_permissions` 有變化（以舊欄位比較），其餘既有資料完全相同。

## 4. 備份（切換前；第 2 段指令待 P5 定案）
| 項目 | 做法 | 理由 |
|---|---|---|
| B1 資料庫 | 切換前用 SQLite online backup（`sqlite3 … ".backup"` 或 Python `Connection.backup`）產生一致的副本，放在本次部署專用的工作目錄（700），**不放在 `backend/backups/`**；記錄 SHA-256 與 `PRAGMA integrity_check` 的結果 | 啟動時的自動備份只保留 7 份，重啟幾次就會被輪替掉；`shutil.copy2` 在服務運作中不保證一致 |
| B2 上傳檔 | `uploads/` 的完整檔案清單與雜湊 | migration 不會動到上傳檔；只留清單，用來在回退時證明沒有變化 |
| B3 後端程式 | NAS 上 `backend/` 的程式快照（排除 db、uploads、backups、logs、.env），另外把目前的映像加上 `qualitas-backend:pre-m5-<TS>` 標籤 | 程式回退時直接換回舊映像，不必重新建置 |
| B4 前端 | 沿用 DEPLOY-EXEC 的做法：備份 `dist`，切換時只新增資產，`index.html` 以原子方式替換 | 已在正式站驗證過 |
| B5 離站副本 | B1 是否複製一份到本機或加密保存：**請使用者決定**（資料庫含密碼雜湊；記憶中已註明 NAS 上的備份沒有加密） | 資料敏感 |

## 5. 升級與回退演練（已執行；拋棄式資料庫；Python 3.11 容器）
證據：`evidence/upgrade-rollback-rehearsal.txt`。腳本：`backend/scripts/verification/m5_upgrade_rollback_rehearsal.py`。腳本只接受 `/rehearsal/` 下的資料庫，必須設定 `M5_REHEARSAL=1`。
- **A（舊版）**：空白資料庫啟動，用舊 API 建立專案與承包商；確認沒有材料表。
- **B（新版第一次啟動，即 migration）**：
  - 恰好新增 4 張材料表；
  - 舊表中只有 permissions 與 role_permissions 有變化；
  - 3 個權限代碼存在；
  - `material_reply_days` 是可為 null 的 INTEGER；
  - 11 個索引都存在。
- **B2**：用新 API 設定回覆天數為 10，建立並送交一筆送審，預計回覆日＝+10 天。
- **B3（新版重啟）**：所有表的內容完全不變（migration 可重複執行）。
- **C（只回退程式，保留資料）**：
  - 舊版可以在已升級的資料庫上啟動，材料表沒有被動到，只有 `role_permissions` 變化（admin 依舊版的權限清單重新同步）；
  - 舊 API 可以列出與更新專案，`material_reply_days` 仍是 10；
  - 文件編號規則可讀取；
  - 材料路由回 404，資料仍在。
- **D（再次升級）**：
  - 回退前寫入的送審仍可列出與讀取，狀態與日期正確；
  - 回退期間的專案改名也保留；
  - admin 重新取得 3 個材料權限。

## 6. 啟動失敗的處理
- 判斷依據：後端日誌出現 `STARTUP ABORTED`／`MigrationError`，或容器反覆重啟，或 `/api/*` 回 502。
- **資料狀態**：
  - migration 的每個語句都是 `IF NOT EXISTS` 或「缺少才新增」，**不會刪除、重建或改寫任何表、索引或資料列**。
  - 但它**不保證整個步驟是單一交易**：中途失敗時，可能已經建立部分空的新表或索引，`projects` 也可能已多一個空欄位。
  - 舊版程式會忽略這些物件（演練 phase C 已證明舊版可以在已升級的資料庫上運作）。
  - 驗證失敗的各種情況（缺欄位、缺少 NOT NULL、同名但欄位錯誤的索引、部分索引的條件錯誤、型別錯誤等）都由 `test_material_schema_migration.py` 覆蓋：啟動中止且資料保留。
- **處理順序**：
  1. 把映像換回 `pre-m5-<TS>`（B3），以舊版程式恢復服務，資料不動。
  2. 讀取錯誤訊息。訊息會列出不符合的物件，修正方式交由人工決定；**不自動刪除任何物件**。
  3. 只有在證實資料損毀時才考慮 §7 的 L2，且必須經使用者同意。

## 7. 回退分級
- **L1：只回退程式，保留資料（預設，已演練）。**
  - 後端換回舊映像；前端把 `index.html` 換回 DEPLOY-EXEC 的現行版本（新版資產保留）。
  - 材料資料與新欄位留在資料庫中，再次升級時就能看到。
  - 已知影響：
    - 回退期間材料功能無法使用（前端選單消失，API 回 404）；
    - admin 暫時失去材料權限，再次升級時會自動恢復；
    - 若有人在回退期間讀取規則頁，`msa` 規則列會留著（舊版可讀，不影響）。
  - 前後端要一起回退。若只回退後端、前端仍是新版，材料頁會出錯。
- **L2：還原整個資料庫（B1）。**
  - 只用於證實的資料損毀。
  - **切換後寫入的所有資料都會遺失**，包括非材料模組的資料。必須由使用者決定，並先另外備份當下的資料庫。

## 8. 切換步驟框架（具體指令待 P1 結果，於 P5 另審）
1. 唯讀核對：程式、映像與 compose 和預檢報告一致；三個容器都是 Up；記錄 `/` 與 `/api/user/profile` 的基準回應。
2. 備份 B1–B4，逐項驗證雜湊與 integrity_check。
3. 上傳後端候選包到工作目錄，核對雜湊，解壓到 staging 後逐檔 `sha256sum -c`。
4. 把 staging 的程式複製到 `backend/`，保留受保護項目（db、uploads、backups、logs、.env），之後 `docker-compose up -d --build backend`（需要 sudo，由使用者在自己的終端機執行）。
5. 觀察啟動日誌：要看到 migration 第 21 步完成、沒有 `STARTUP ABORTED`；`/api/user/profile` 未登入時回 401。
6. 確認後端穩定後，切換前端：沿用 DEPLOY-EXEC §第 2 段的做法（只新增資產，`index.html` 原子替換）。
7. 確認三個容器都是 Up；對外抽樣檢查雜湊。
8. 登入後的唯讀冒煙（使用者執行，**不新增業務資料**）：
   - 開啟材料送審頁，確認專案選單與空清單、列表／看板切換；
   - 開啟文件編號規則頁，確認有 MSA。注意：這一步會寫入 `msa` 規則列，屬於設定資料，不是業務資料；
   - 開啟專案編輯表單，確認有回覆天數欄位，**不儲存**；
   - 確認 ITP 與其他既有頁面正常。
- 順序：**先後端、再前端。** 新後端搭配舊前端可以正常運作：舊前端更新專案時不帶 `materialReplyDays`，後端以 `exclude_unset` 處理，不會清掉已設定的天數。

## 9. 待使用者決定
1. 執行 DEPLOY-EXEC 後端預檢 r3（P1）。
2. DOCX 後端單檔部署是先做，還是取消（P2）。
3. B1 資料庫備份是否複製到本機或加密保存（B5）。
4. 上線後哪些角色要取得材料權限（admin 以外都要手動指派）。
