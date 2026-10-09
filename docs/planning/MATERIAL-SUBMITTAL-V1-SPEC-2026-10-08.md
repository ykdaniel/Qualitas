# 材料送審第一版規格 r2（MATERIAL-SUBMITTAL-V1，補正 R1–R4，待獨立審查）

- 日期：2026-10-08
- 版本：
  - r1 審查結果 REVISE（`MATERIAL-SUBMITTAL-V1-SPEC-2026-10-08-review.md`）。r1 原文封存為 `…-r1-REVISED.md`。
  - 本版只補 R1–R4。已接受的畫面與業務方向不重做，已確認的決策不重問。
- 性質：規格。**不啟動 M1、不改產品、不建 migration**，也不覆寫進行中的部署 TASK／STATUS／REVIEW。後端預檢 r3 的 PASS 維持。
- 標記：【決策】＝`DECISIONS.md` 已確認；【建議】＝本規格的設計選擇；【讀碼】＝現有程式事實；【待使用者確認】＝見 §7。
- **誤登更正**：使用者已同意（§7），安排於 M2。
- **審查意見暫不納入**【決策】：不設意見欄位。外部回覆內容以回覆文件附件保存。

## r1 → r2 變更摘要
| 審查項 | 本版處理 | 位置 |
|---|---|---|
| R1 附件權限與分段保存 | 依分類區分權限（僅限新 entity）；Draft、Submitted、有結果三種狀態的完整鎖表；上傳與刪除改為「先鎖、重讀、再寫」；兩段式保存失敗時的處理與重試 | §3.4、§4.4、AC-R1-* |
| R2 子資源、範圍、一致性 | 父子歸屬的驗證順序；material_id 先回 404 再回 400；受控欄位白名單；寫入鎖＋交易內重讀＋條件更新＋部分唯一索引；現行核准版改為推導 | §3.2、§4.2、§4.3、§4.5、AC-R2-* |
| R3 schema 與首版範圍 | 新表與新欄位一律 snake_case，API 以 camelCase 對映；具名 migration（migration_owned）、升級、重複執行、失敗與回退；日期與天數型別；**移除刪除送審與回收編號**（同時移除刪除材料）；列表的 project_id 必填與分頁總數 | §3.1、§3.6、§3.7、§4.2、AC-R3-* |
| R4 誤登更正 | 「更正登錄」與「撤銷外部核准」分開；結果登錄改為只追加的紀錄（不刪證據）；已有後續版次時阻止更正；併發防護；現行核准版依規則重新推導；提供歷程 API 與畫面 | §3.5、§4.2、§2.4、AC-R4-*、§7 |

---

## 1. 範圍

**做**（與 r1 相同，僅移除刪除功能）
- 單一入口，頁內分「送審」「材料資料」兩個分頁；送審可切換看板與列表。
- 材料限定所屬專案，同專案可重複選用。
- 一份送審對應一種材料；同號、同一張卡改版，歷史內容與附件都保留。
- 內部只準備、送交與登錄外部結果。
- 外部結果四種；現行核准版規則。
- 預計回覆日依專案的日曆天數計算。
- 誤登更正（使用者已同意，§7；M2 實作）。

**不做**
- 內部審批、審查意見欄位。
- 跨專案材料庫或複製。
- 一單多材料、拖曳改狀態、提醒排程、列印、手機最佳化。
- 與其他模組連動、進場或施工放行推論。
- **刪除送審、回收編號、刪除材料**【建議：r2 移出首版】。
- 登錄**撤銷外部核准**（業主或顧問事後撤回核准）【建議：首版不做，§3.5】。

---

## 2. 桌面主要畫面與操作流程

§2.1–§2.3（入口、頁面骨架、看板、列表）**沿用 r1，已接受**，只有下列兩點更動：
- 看板與列表的資料都來自分頁 API。畫面顯示「已載入 N／共 T 筆」；N < T 時顯示「載入更多」，看板不得把第一頁當成全部（§4.2）。
- 詳細頁移除「刪除送審」按鈕。

### 2.4 詳細頁的歷程（r2 調整：結果改為多筆登錄紀錄）
```
── 歷程 ─────────────────────────────────────────────────────────────────
Rev 1  送交 9/15（王小明）  回覆日 9/29
       ├ 登錄 #1  核准         決定者：業主乙（9/25）  登錄：李小華 9/26 14:02   〔已被更正〕
       └ 登錄 #2  修正後再送   決定者：業主乙（9/25）  登錄：李小華 9/26 16:40   〔現行〕
                   更正原因：誤選結果，業主回覆實為修正後再送
       回覆文件：reply-0925.pdf（9/26 李小華）
Rev 2  送交 10/6（王小明）   外部審查中，回覆日 10/20
```
- 每一筆登錄都保留顯示：結果、決定者、外部日期與編號、登錄人與時間、是否已被更正、更正原因。原本的登錄**不刪除、不覆寫**。
- 「更正登錄」按鈕只在以下條件全部成立時出現：
  - 該版次是最新版，且已有結果；
  - 使用者有 `material:record_result:all`；
  - 該送審沒有後續版次【決策】。

### 2.5 操作流程（r1 已接受，只補充第 4 步失敗時的提示、新增第 6 步）
4. **登錄外部結果**：對話框分兩段送出。
   - (a) 上傳回覆文件，可以不上傳。
   - (b) 送出結果。
   - (a) 成功、(b) 失敗時，對話框保持開啟，提示「回覆文件已上傳，結果尚未登錄」，並列出已上傳的檔案。按「重試登錄」只重送 (b)，不重新上傳。
   - 關閉後重新開啟時，從伺服器讀回此版次已有的回覆文件，不要求再上傳（§4.4）。
6. **更正登錄**【決策，M2】：
   - 在詳細頁按「更正登錄」，重新選擇結果與外部欄位，並填寫更正原因（必填）。
   - 送出後新增一筆登錄並成為現行；原登錄標示「已被更正」。

---

## 3. 資料模型

### 3.1 命名與型別【建議，依 `AGENTS.md`：新 Model 欄位用 snake_case】
- 新表與新欄位一律 snake_case；既有表的 camelCase 欄位不改。
- API 的 JSON 一律 camelCase。Pydantic schema 以 `alias_generator=to_camel`、`populate_by_name=True` 自動對映（例如 `rev_no` ↔ `revNo`）；前端只看到 camelCase。
- 輸入用的 schema 一律 `extra="forbid"`，未列欄位回 422。
- 日期：
  - API 以 `date` 型別驗證，非 `YYYY-MM-DD` 或不存在的日期回 422；資料庫存 `YYYY-MM-DD` 字串，與既有模組一致。
  - 時間戳記存 UTC ISO 字串。
- `projects.material_reply_days`：null 或 ≥0 的整數。API 使用 `StrictInt`，負數、小數或字串回 422。不設預設值【決策】。
- SQLite 外鍵目前未啟用【讀碼：`core/validators.py:260` 註記 PRAGMA foreign_keys 未設定】。因此**所有歸屬與引用檢查都在 service 層進行**，不依賴資料庫外鍵生效。外鍵仍照樣宣告。

### 3.2 資料表（全部 snake_case）

**`materials`**：材料資料，可修改。
| 欄位 | 型別／約束 |
|---|---|
| id | VARCHAR PK |
| project_id | VARCHAR NOT NULL，FK projects.id；index `ix_materials_project_id` |
| category, name(NOT NULL), brand, model, specification, manufacturer, supplier | VARCHAR |
| created_by, created_at, updated_by, updated_at | VARCHAR |

**`material_submittals`**：送審，一張卡。
| 欄位 | 型別／約束 |
|---|---|
| id | VARCHAR PK |
| project_id | VARCHAR NOT NULL；index |
| vendor_id | VARCHAR NOT NULL，FK contractors.id；index |
| material_id | VARCHAR NOT NULL，FK materials.id；index |
| document_number | VARCHAR NOT NULL；unique `ux_material_submittals_document_number` |
| latest_rev_no | INTEGER NOT NULL（快取） |
| latest_status | VARCHAR NOT NULL（快取：Draft／Submitted／Approved／ApprovedWithComments／ReviseAndResubmit／Rejected） |
| current_approved_rev_no | INTEGER NULL（快取；**不設外鍵**，避免與版次表循環引用；由 §3.3 的規則推導） |
| current_approved_result | VARCHAR NULL（快取：Approved／ApprovedWithComments） |
| created_by, created_at, updated_at | VARCHAR |

**`material_submittal_revisions`**：版次，存快照。
| 欄位 | 型別／約束 |
|---|---|
| id | VARCHAR PK |
| submittal_id | VARCHAR NOT NULL，FK material_submittals.id；index |
| project_id, vendor_id | VARCHAR NOT NULL（必須等於上層送審；供附件範圍判斷） |
| rev_no | INTEGER NOT NULL；unique `ux_msr_submittal_rev`(submittal_id, rev_no) |
| status | VARCHAR NOT NULL（Draft／Submitted／四種結果之一；值等於現行登錄的結果，見 §3.5） |
| snap_category, snap_name, snap_brand, snap_model, snap_specification, snap_manufacturer, snap_supplier, spec_reference | 快照 |
| submitted_date, expected_reply_date, expected_reply_date_auto | VARCHAR(date) |
| submitted_by_user_id, submitted_by_name, submitted_at | VARCHAR |
| created_by, created_at | VARCHAR |
| **部分唯一索引** `ux_msr_one_open`(submittal_id) WHERE status IN ('Draft','Submitted') | 同一送審最多一個未結版次（SQLite 與 PostgreSQL 都支援部分索引） |

**`material_submittal_result_entries`**：外部結果登錄，**只能追加**（R4）。
| 欄位 | 型別／約束 |
|---|---|
| id | INTEGER PK AUTOINCREMENT（id 不重用，同 `itr_approval_events`） |
| revision_id, submittal_id, project_id, vendor_id | VARCHAR NOT NULL；index `ix_msre_revision_id` |
| seq | INTEGER NOT NULL；unique `ux_msre_revision_seq`(revision_id, seq)（1＝初次登錄，2 起為更正） |
| entry_type | VARCHAR NOT NULL：`initial`／`correction` |
| result_code | VARCHAR NOT NULL（四選一） |
| external_decision_maker(NOT NULL), external_decision_org, external_decision_title, external_reply_date(NOT NULL), external_doc_no | VARCHAR |
| logged_by_user_id, logged_by_name, logged_at | VARCHAR NOT NULL |
| supersedes_entry_id | INTEGER NULL（更正時指向被取代的那一筆） |
| superseded_by_entry_id | INTEGER NULL（被更正時填入；**唯一允許的一次性更新**，由條件更新保證） |
| correction_reason | TEXT NULL |

- **現行登錄**：同一版次中 `superseded_by_entry_id IS NULL` 的那一筆。最多一筆，由 §4.5 的條件更新保證。
- 依 ORM `before_update`／`before_delete` 事件，除了 `superseded_by_entry_id` 從 NULL 變成一個值之外，其他更新與刪除一律拒絕。做法同 `ITRApprovalEvent`【讀碼：`models.py:317-372`】。

**`projects` 新欄位**：`material_reply_days INTEGER NULL`。

### 3.3 現行核准版（推導規則，R2／R4）
- **定義**：同一送審中，**現行登錄**為 Approved 或 ApprovedWithComments 的版次之中，`rev_no` 最大的那一版【決策：新版核准後成為現行版；修正後再送或拒絕不影響】。
- 每次登錄或更正結果時，在同一個交易內依上述定義**重新計算**，並寫入 `current_approved_rev_no`／`current_approved_result`。不以「恢復舊值」的方式處理，因此不會蓋掉之後已核准的版次。
- 由此可保證：快取指到的版次屬於同一份送審，且具有有效的核准結果。AC 會比對快取值與重新計算的值。

### 3.4 附件（R1）
- entity type：`material_rev`；entity_id 是版次 id。分類如下：
  - 送審附件：`catalogue`、`technicalData`、`certificate`、`testReport`、`other`；
  - 回覆文件：`replyDocument`。
- **依分類區分權限（只適用 `material_rev`）**：
  - 查看：全部分類都需要 `material:view:all`。
  - 上傳或刪除：送審分類需要 `material:manage:all`；`replyDocument` 需要 `material:record_result:all`。
  - 整合方式：
    - `attachment_access` 新增 `CATEGORY_UPDATE_PERMISSIONS = {"material_rev": {"replyDocument": RECORD_RESULT}, …}`；
    - `require_attachment_permission(user, entity_type, action, category=None)` 只在 entity_type 有這張表時依分類取用權限；
    - **其他 entity type 的行為完全不變**（以既有測試回歸確認）。
- **狀態鎖**（後端；沿用 `lock_reason` 的兩種機制【讀碼：`attachment_access.py:118-150`】）：

| 版次狀態 | 送審附件（5 類） | replyDocument |
|---|---|---|
| Draft | 可上傳／刪除（manage） | **禁止**：`_LOCKED_CATEGORIES[("material_rev","Draft")] = {"replyDocument"}` |
| Submitted | **禁止**：`_LOCKED_CATEGORIES[("material_rev","Submitted")] = 5 類` | 可上傳／刪除（record_result） |
| 四種結果 | 禁止 | 禁止：`_UNCONDITIONAL_LOCKED_STATUSES["material_rev"] = 4 種結果` |

- 更正登錄不會解鎖附件。因此首版**無法在更正時替換回覆文件**，如需說明，寫在更正原因中【建議；限制列於 §6】。
- 範圍：在 `_ENTITY_MODELS` 中把 `"material_rev"` 對應到版次 model。版次帶有 project_id／vendor_id，可沿用 `entity_in_scope` 與 `attachment_target`【讀碼：`core/scope.py:177-200`】。

### 3.5 誤登更正（R4；**使用者已於 2026-10-08 同意，見 §7 與 `DECISIONS.md`；安排於 M2**）
- **兩種情況要分開**：
  - **更正登錄**：系統裡登錄錯了，例如選錯結果或打錯日期。外部的實際決定沒有改變。首版處理這一種。
  - **撤銷外部核准**：業主或顧問事後撤回原本的核准，這是一個新的外部事件。**首版不做**。若需要，另行設計（可能是一種新的事件類型），不能用「更正登錄」代替【建議】。
- **更正做法**：新增一筆 `entry_type=correction` 的登錄，`supersedes_entry_id` 指向被取代的那一筆；原登錄的 `superseded_by_entry_id` 指向新登錄。原登錄、回覆文件、操作人與時間都保留，**不刪除任何證據**。
- 更正可以改成四種結果中的任一種，也可以修正決定者、日期與編號。首版**不提供**「撤回登錄、回到 Submitted」【建議；如需要列入 §7 一併確認】。
- **已有後續版次時阻止更正**【決策】：只要該送審存在 rev_no 更大的版次（任何狀態），就回 409「已有後續版次，不能直接更正」。理由：後續版次是依原結果建立的。若更正舊版，可能改變當時能否建立新版的前提，也可能改變現行核准版的推導。
- 版次 `status`＝現行登錄的 result_code。更正後，在同一個交易內依 §3.3 重新計算現行核准版。由於只允許更正最新版，且不存在後續版次，重新計算**不會改寫其他版次的歷史結果，但可能重新選定較早的版次為現行核准版**（例如更正後此版不再是核准類結果）。
- 更正原因：**必填**【決策】。
- 權限：`material:record_result:all`，與初次登錄相同，不另設權限【決策：有權限者可更正】。

### 3.6 具名 migration（R3）【建議，沿用 `db_migrations` 的既有做法，不換框架】
- 四張新表都標記 `info={"migration_owned": True}`，啟動時的 `create_all_except_migration_owned` **不會**建立它們【讀碼：`models.py:1064-1069`】。
- `db_migrations.run_migrations()` 新增第 21 步 `_create_material_submittal_schema()`，做法同 `_create_itr_approval_events_table()`【讀碼：`db_migrations.py:156-230`】：
  1. `CREATE TABLE IF NOT EXISTS`：四張表，完整欄位、NOT NULL、FK 宣告、表內 UNIQUE。
  2. `CREATE [UNIQUE] INDEX IF NOT EXISTS`：**以 §9.1 的唯一清單為準**（r2 原文以下列舉有誤，保留供對照）：
     - `ix_materials_project_id`
     - `ix_material_submittals_project_id`
     - `ix_material_submittals_vendor_id`
     - `ux_material_submittals_document_number`
     - `ix_msr_submittal_id`
     - `ux_msr_submittal_rev`
     - `ux_msr_one_open`（部分索引）
     - `ux_msre_revision_seq`（另含 `ix_msre_revision_id`）
  3. `projects.material_reply_days`：以 inspector 檢查，不存在才 `ALTER TABLE projects ADD COLUMN material_reply_days INTEGER`。
  4. **驗證**：每張表都具備 model 的全部欄位，上述索引全部存在，`projects` 已有新欄位。任一項失敗就 `raise MigrationError`，**中止啟動**（與 ITR 事件表相同）。不 DROP、不重建、不改寫任何列。
- 冪等：每條語句都是 IF NOT EXISTS 或先檢查再執行，沒有「已完成」旗標。重複執行不會有任何改變；前一次中途失敗時，下次啟動補齊即可。
- **回退策略**：
  - 只回退程式（換回前一版映像），**保留**新表、新欄位與新業務資料，不 DROP。
  - 舊程式的 model 不含這些表，也不含 `projects.material_reply_days`。該欄位可為 null，舊程式新增或更新專案時不受影響。
  - 之後再升級時，migration 直接沿用既有的表與資料。
  - 部署前照例備份資料庫，作為最後手段。不提供會刪除資料的 downgrade。
- 種子與測試：測試用 `Base.metadata.create_all` 建立全部表（同既有慣例）；另外有 migration 專用測試（AC-R3-*）。

### 3.7 受控欄位（R2）
- **建立後不能更改**（任何 API 都不接受）：
  - 送審的 project_id、vendor_id、material_id、document_number；
  - 版次的 submittal_id、project_id、vendor_id、rev_no；
  - 材料的 project_id。
- **只由伺服器寫入**（client 不得指定；輸入 schema 沒有這些欄位，帶入時因 `extra=forbid` 回 422）：
  - 送審的 latest_*、current_approved_*；
  - 版次的 status、submitted_by_*、submitted_at、expected_reply_date_auto；
  - 全部登錄欄位中的 logged_by_*、logged_at、seq、supersedes／superseded_by；
  - 所有 created_*／updated_*。
- 快照欄位只能在 Draft 時，透過 `PUT …/revisions/{revId}` 的白名單 schema 修改。

---

## 4. API、範圍、權限與一致性

### 4.1 權限碼（沿用 r1）
`material:view:all`、`material:manage:all`、`material:record_result:all`。專案天數設定沿用 `PUT /api/projects/{id}`（`CONTRACTOR_MANAGE`）。

### 4.2 端點（r2）
| 方法 | 路徑 | 權限 | 規則 |
|---|---|---|---|
| GET | `/materials?projectId&q&category&limit&offset` | view | **projectId 必填**；回 `{items,total,limit,offset}` |
| POST | `/materials` | manage | projectId 必填，套用 `enforce_create_scope` |
| GET／PUT | `/materials/{id}` | view／manage | 範圍外回 404；PUT 白名單（不含 projectId） |
| GET | `/material-submittals?projectId&latestStatus&category&vendorId&q&overdue&limit&offset` | view | **projectId 必填**；回 `{items,total,limit,offset}`；limit 預設 200、上限 500 |
| POST | `/material-submittals` | manage | §4.3 的 material 規則；建立送審、Rev 0 與編號 |
| GET | `/material-submittals/{id}` | view | 含全部版次、每版的全部登錄（含已被更正的）、差異欄位名稱 |
| PUT | `/material-submittals/{id}/revisions/{revId}` | manage | 只限 Draft，白名單快照欄位 |
| POST | `…/revisions/{revId}/submit` | manage | body：submittedDate(date)、expectedReplyDate?(date) |
| POST | `…/revisions/{revId}/result` | record_result | body：resultCode、externalDecisionMaker、externalDecisionOrg?、externalDecisionTitle?、externalReplyDate(date)、externalDocNo? |
| POST | `…/revisions/{revId}/result-corrections` | record_result | 【決策，M2】body：expectedCurrentEntryId、上列結果欄位、correctionReason |
| POST | `/material-submittals/{id}/revisions` | manage | body：expectedLatestRevNo |
| ~~DELETE~~ | ~~`/material-submittals/{id}`、`/materials/{id}`~~ | — | **r2 移出首版** |

- 所有 `{id}`／`{revId}` 動作的**驗證順序**（R2），任何一步失敗都不寫入任何資料：
  1. 權限（403）；
  2. 讀取送審並 `record_in_scope`（不可見回 404）；
  3. 取得送審寫入鎖（§4.5）並重新讀取；
  4. 讀取版次，條件為 `id=revId AND submittal_id=id`，不符回 404；
  5. 檢查不變條件：版次的 project_id／vendor_id 必須等於送審，不符回 409，並記錄 error log；
  6. 狀態與業務規則（409／400）；
  7. 寫入、`log_audit(strict=True)`、commit。稽核寫入失敗時整筆回滾。

### 4.3 material_id 與專案（R2）
- 建立送審時，body 帶 `materialId` 或 `newMaterial{name,…}`，兩者擇一，都有或都沒有回 422。
- `materialId` 的判斷順序：
  1. 依呼叫者範圍查詢，**不可見回 404**；
  2. 可見，但 `material.project_id ≠ body.projectId`，回 **400**「材料屬於其他專案」；
  3. 符合才建立。
- 專案範圍內只看得到自己專案的使用者，在第 1 步就會得到 404。只有可見多個專案的帳號才可能走到 400。這與既有「範圍外一律 404」的原則一致。
- `newMaterial` 在同一個交易內建立，project_id 等於送審的 projectId。

### 4.4 附件寫入的競態與兩段式保存（R1）
- **上傳**（`file_router.upload_files`）：
  - 現況：先檢查狀態鎖，再讀檔與驗證，最後寫入【讀碼】。
  - 對 `material_rev` 的調整：檔案驗證完成之後、寫入磁碟和資料庫之前，先取得**該版次所屬送審的寫入鎖**，再 `expire_all()`，**重新讀取版次並重新執行範圍檢查與 `lock_reason`**，通過才寫入並 commit；失敗則刪除已寫的檔案並回滾（既有的清理邏輯）。
  - 其他 entity type 不變。
- **刪除**：做法同 NCR 的 `lock_ncr_for_write`【讀碼：`file_router.py:368-381`】。對 `material_rev` 先取得寫入鎖，再重新讀取附件與版次，然後判斷。
- 送交、登錄結果、更正與建立新版次都取得**同一把鎖**。因此：
  - 上傳若在「送交」commit 之後才進入寫入，重新判斷時會看到 Submitted，送審分類回 409；
  - 「送交」若先等到上傳 commit，送交本身不依附件，不受影響。
- **兩段式保存**：
  - 回覆文件以 `replyDocument` 上傳到 Submitted 的版次，成功後就是伺服器上的正式附件。
  - 登錄結果失敗時，這些附件仍屬於 Submitted 的版次（有 record_result 權限者可以刪除），**不會重複上傳**：前端以伺服器回傳的附件清單為準。
  - 結果成功後，版次進入結果狀態，附件鎖定。

### 4.5 併發與交易一致性（R2）
- 寫入鎖 `lock_material_submittal_for_write(db, submittal_id)`：
  - SQLite：對該送審做 `UPDATE material_submittals SET id=id WHERE id=:i`；
  - 其他資料庫：`SELECT … FOR UPDATE`；
  - 之後一律 `expire_all()` 並重新讀取。做法同 `lock_ncr_for_write`【讀碼：`core/utils.py:296-306`】。
- **送交**：條件更新 `UPDATE … SET status='Submitted' … WHERE id=:rev AND status='Draft'`，rowcount 必須為 1，否則回 409。
- **初次登錄**：鎖內重新檢查以下條件，任一不符就回 409：
  - 版次為最新版且 status＝Submitted；
  - 尚無任何登錄；
  - 寫入 seq=1；`ux_msre_revision_seq` 為唯一索引，作為最後防線。
  
  接著條件更新版次 `WHERE status='Submitted'`，再重新計算現行核准版。
- **更正**：鎖內重新檢查：
  - 是最新版；
  - 沒有後續版次；
  - `expectedCurrentEntryId` 等於現行登錄的 id。

  接著條件更新：`UPDATE …entries SET superseded_by_entry_id=:new WHERE id=:old AND superseded_by_entry_id IS NULL`，rowcount 必須為 1，否則回 409（雙擊或兩人同時更正，只有一個會成功），再重新計算現行核准版。
- **建立新版次**：鎖內重新檢查：
  - `expectedLatestRevNo` 等於目前的 latest_rev_no；
  - 最新版已有結果。

  `ux_msr_one_open` 部分唯一索引與 `ux_msr_submittal_rev` 唯一索引作為最後防線；違反時回 409，不產生重複版次。
- **建立送審**：沿用 `begin_write_transaction` ＋ `generate_reference_no(db, vendor, 'MSA')`，編號與送審、Rev 0 在同一個交易內完成【讀碼】。
- 以上所有寫入都與 `log_audit(strict=True)` 在同一個交易內，任一失敗就整筆回滾。

### 4.6 專案範圍（沿用 r1，補充）
- 所有列表與詳細查詢都套用 `apply_scope`／`record_in_scope`，範圍外回 404。
- 列表必須帶 `projectId`。**不可見或不存在的 projectId 一律回 404**（含建立時）；無範圍限制的帳號也只能依請求的專案篩選（§9.2）。
- **帶承包商（vendor）範圍的帳號：首版本模組一律拒絕（403）**，即使誤配了 material 權限也一樣（§9.2）。

---

## 5. 分批實作與驗收（r2）

批次順序仍是 M1–M5，r1 的分批方式已接受。下列各條取代 r1 的 AC；r1 中未被取代的 AC 繼續有效，但 AC-M1-3、AC-M2-11 隨刪除功能一起移除。

### M1：schema、migration、材料資料 API
- **AC-R3-1 空資料庫**：啟動後四張表、8 個索引（含部分唯一索引）與 `projects.material_reply_days` 全部存在。四張表**不是**由 `create_all` 建立：以 migration_owned 旗標測試確認。
- **AC-R3-2 舊資料庫升級**：以不含新表的舊 schema（含既有專案與資料）啟動。新表與新欄位建立後，既有資料逐表的筆數與抽樣值不變。
- **AC-R3-3 重複執行**：連續啟動兩次，第二次沒有任何 schema 變更，也沒有錯誤。
- **AC-R3-4 失敗回報**：預先建立一張缺少欄位的 `material_submittals`，啟動時拋出 MigrationError 並中止，訊息列出缺少的欄位，該表不被 DROP。
- **AC-R3-5 回退**：
  - 升級並寫入材料與送審後，以舊版程式（無新 model）啟動，既有模組（含專案的新增與更新）正常運作。
  - 再升級回來時，新資料仍在。
- **AC-R3-6 天數驗證**：`materialReplyDays` 接受 null、0、14；拒絕 -1、1.5、"14"（422）。
- **AC-R3-7 命名**：新表與新欄位全部是 snake_case；API 回應全部是 camelCase；輸入多餘欄位回 422。
- **AC-R3-8 列表參數**：材料與送審列表缺 projectId 回 422；回傳中的 total 等於該專案符合條件的全部筆數，不是只有第一頁。
- 沿用 r1 的 AC-M1-1、AC-M1-2、AC-M1-4。

### M2：送審、版次、結果、附件、更正
**父子與範圍（R2）**
- **AC-R2-1**：`POST /material-submittals/{A}/revisions/{B 的 revId}/submit`（A、B 同專案）回 404，A 與 B 都零寫入：版次、送審、AuditLog 前後相同。
- **AC-R2-2**：跨專案的 revId 回 404；只屬專案 A 的使用者，對專案 B 的送審 id 回 404。
- **AC-R2-3**：以單元測試偽造版次的 project_id 與上層不一致時，回 409，零寫入，並寫 error log。
- **AC-R2-4**：materialId 不可見回 404；可見但屬其他專案回 400；兩者都零寫入。
- **AC-R2-5**：PUT 版次時帶 `projectId`、`status`、`submittedByName` 或 `latestStatus`，回 422。

**併發與交易（R2）**
- **AC-R2-6**：兩個請求同時建立新版次，恰好一個成功，另一個回 409，資料庫只有一個未結版次。
- **AC-R2-7**：同一版次同時兩次初次登錄，恰好一筆 seq=1，另一個回 409。
- **AC-R2-8**：以 mock 讓 `log_audit` 在登錄結果時失敗，版次狀態、登錄紀錄、送審快取都維持原狀。
- **AC-R2-9**：在任何操作序列之後，`current_approved_rev_no` 都等於依 §3.3 重新計算的結果（以屬性測試或列舉序列檢查）。

**現行核准版（取代 r1 AC-M2-7，分成三個獨立情境，每個情境各自從頭建立資料）**
- **AC-R2-10a**：Rev 1 核准 → 建立並送交 Rev 2 → Rev 2 登錄「修正後再送」→ 現行核准版仍是 Rev 1（Approved）。
- **AC-R2-10b**：Rev 1 核准 → 建立並送交 Rev 2 → Rev 2 登錄「拒絕」→ 現行核准版仍是 Rev 1。
- **AC-R2-10c**：Rev 1 核准 → 建立並送交 Rev 2 → Rev 2 登錄「附意見核准」→ 現行核准版改為 Rev 2，結果為 ApprovedWithComments。
- **AC-R2-10d**：Rev 2 在 Draft 或 Submitted 時，現行核准版是 Rev 1。

**附件（R1）**：權限 × 狀態矩陣，共 4 組帳號 × 3 種狀態 × 2 類分類 × 上傳與刪除。
- **AC-R1-1**：view-only 在任何狀態上傳或刪除任何分類都回 403；下載與列表可以。
- **AC-R1-2**：manage-only：
  - Draft：送審分類可以；replyDocument 回 403（權限優先於狀態鎖）。
  - Submitted 與有結果：送審分類回 409。
- **AC-R1-3**：record_result-only：
  - 送審分類一律回 403；
  - replyDocument 在 Draft 回 409、Submitted 可以、有結果回 409。
- **AC-R1-4**：manage＋record_result：
  - Draft：送審分類可以，replyDocument 回 409；
  - Submitted：送審分類回 409，replyDocument 可以；
  - 有結果：全部回 409。
- **AC-R1-5**：其他 entity type（例如 osd、ncr）的附件權限與鎖定行為，用既有測試回歸，全部不變。
- **AC-R1-6 競態**：在上傳請求驗證檔案之後、取得鎖之前插入送交（以測試掛鉤控制時序）。上傳回 409，磁碟上沒有遺留檔案，也沒有附件列。刪除同理。
- **AC-R1-7 兩段式**：
  - 回覆文件上傳成功，`/result` 以 mock 失敗：附件留在 Submitted 的版次，UI 提示「回覆文件已上傳，結果尚未登錄」。
  - 重試只呼叫 `/result` 並成功，附件總數不變（沒有重複上傳）。
  - 關閉後重新開啟對話框，會列出這些既有附件。

**更正（R4；§7 已確認，於 M2 實作）**
- **AC-R4-1**：最新版、沒有後續版次時，更正「核准」為「修正後再送」：
  - 新增 seq=2（correction），seq=1 的 superseded_by 等於新 id；
  - 版次 status 改為 ReviseAndResubmit；
  - 現行核准版依 §3.3 重新計算（若有較早的核准版就回到它，沒有就為 null）。
- **AC-R4-2**：已有後續版次時，更正舊版回 409，零寫入。
- **AC-R4-3**：`expectedCurrentEntryId` 已過期，或雙擊造成第二次請求時，回 409；兩人同時更正，恰好一個成功。
- **AC-R4-4**：原登錄的所有欄位、回覆文件與登錄人都不變；`GET /material-submittals/{id}` 回傳兩筆登錄，標示 superseded 與現行，詳細頁歷程如 §2.4 顯示。
- **AC-R4-5**：更正後附件仍然鎖定，不能新增或刪除回覆文件。
- **AC-R4-6**：沒有 record_result 權限回 403；缺少或空白的更正原因回 422（原因必填已確認）。
- **AC-R4-7**：情境「Rev 1 核准 → Rev 2 核准 → 更正 Rev 2 為拒絕」：現行核准版回到 Rev 1。由推導規則得出，不是回存舊值。

**其他（沿用 r1）**：AC-M2-1、AC-M2-3、AC-M2-4、AC-M2-5、AC-M2-6、AC-M2-8、AC-M2-12。r1 的 AC-M2-9 由 AC-R1-* 取代。

### M3、M4、M5
沿用 r1 的內容與 AC，並做以下調整：
- M3 加上詳細頁歷程的多筆登錄顯示、兩段式失敗提示（AC-R1-7 的 UI 部分），並移除刪除按鈕。
- M4 的 AC-M4-1 改為「卡片數＝已載入筆數；畫面顯示的總數＝API total」。
- M5 的部署方案必須單獨列出：具名 migration、啟動失敗的處理、程式回退但保留資料（§3.6）。

---

## 6. 尚未確認、不阻擋開工的項目（最小建議與影響）
沿用 r1 §6 的表格，有兩處更新：
- 刪除送審、刪除材料：r2 已移出首版。影響是建錯的送審或材料只能保留，或改用以後的作廢功能。
- 更正時不能替換回覆文件（§3.4）。影響是誤傳的檔案會保留；說明寫在更正原因中。

r1 §6 其餘各項（廠商角色、分類清單、送件後調整回覆日、附件是否必填、新版是否帶入附件、承包商帳號、提醒、作廢、列印）維持原本的建議，**沒有因實作而升格為政策**。

---

## 7. 使用者確認結果（2026-10-08：**已同意**；以下為確認的內容，第 5 點為規格範圍建議）
**是否允許有權限的人更正誤登的外部結果？已有後續版次時，先阻止直接更正。**

本規格的提案如下，請確認或調整：
1. 有「登錄外部結果」權限的人，可以更正**最新版**的登錄（例如選錯結果、打錯日期）。更正只修正系統紀錄，**不等於**業主或顧問撤回核准。
2. 原登錄、回覆文件、登錄人與時間全部保留，標示「已被更正」，歷程中都看得到。
3. 已有後續版次時，**不能**直接更正舊版。
4. 更正原因：提案為**必填**。
5. 首版不提供「撤回登錄、回到審查中」，也不提供「登錄業主撤銷核准」。

已記入 `DECISIONS.md`「材料送審：誤登外部結果的更正」。更正功能（`result-corrections` 端點、詳細頁的「更正登錄」與 AC-R4-*）安排在 **M2** 實作；M1 不實作。

---

## 8. 讀碼依據（r2 新增）
- `backend/routers/file_router.py:170-300`（上傳：先檢查鎖，再讀檔與寫入）、`349-392`（刪除：NCR 先鎖再重讀）
- `backend/core/attachment_access.py:40-55, 57-93, 112-150`（`require_attachment_permission` 只依 entity type 判斷；`lock_reason` 讀取 `record.status`）
- `backend/core/utils.py:283-306`（`begin_write_transaction`、`lock_ncr_for_write`）
- `backend/db_migrations.py:156-230`（`_create_itr_approval_events_table`、`MigrationError`）
- `backend/models.py:317-372, 1064-1069`（只追加的事件表、migration_owned）
- `backend/core/validators.py:260`（PRAGMA foreign_keys 未設定）
- r1 的讀碼依據繼續有效（`…-r1-REVISED.md` §7）

---

## 9. M1 開工前收尾（依「r2 獨立審查補註」，2026-10-08）

### 9.1 唯一的具名索引清單（實作與驗證都以此為準；數量由清單產生）
| 名稱 | 表 | 欄位 | 唯一 | 條件 |
|---|---|---|---|---|
| ix_materials_project_id | materials | project_id | 否 | — |
| ix_material_submittals_project_id | material_submittals | project_id | 否 | — |
| ix_material_submittals_vendor_id | material_submittals | vendor_id | 否 | — |
| ix_material_submittals_material_id | material_submittals | material_id | 否 | — |
| ux_material_submittals_document_number | material_submittals | document_number | 是 | — |
| ix_msr_submittal_id | material_submittal_revisions | submittal_id | 否 | — |
| ux_msr_submittal_rev | material_submittal_revisions | submittal_id, rev_no | 是 | — |
| ux_msr_one_open | material_submittal_revisions | submittal_id | 是 | `status IN ('Draft','Submitted')` |
| ix_msre_revision_id | material_submittal_result_entries | revision_id | 否 | — |
| ix_msre_submittal_id | material_submittal_result_entries | submittal_id | 否 | — |
| ux_msre_revision_seq | material_submittal_result_entries | revision_id, seq | 是 | — |

- 程式只維護**一份**清單（`db_migrations` 的常數），model 宣告的 `Index` 必須與它一致（由測試比對）。
- migration 的驗證項目：
  - 每個索引的**欄位與順序、是否唯一、部分索引的 WHERE 條件**都要符合，不只檢查名稱存在；
  - 每張表的全部欄位、NOT NULL 與 PK 也要符合。
- 任何不符（例如同名但欄位錯誤的索引、缺少 WHERE、該 NOT NULL 卻可為 null）都拋出 MigrationError、中止啟動，**不 DROP、不改寫任何資料**。

### 9.2 範圍規則（取代 §4.6 的保留寫法）
- 不可見或不存在的 `projectId`：列表、建立、以及任何帶 projectId 的請求，一律回 **404**。
- 無範圍限制的帳號：可以指定任一存在的專案，但每次只看該專案的資料。
- **帶 vendor 範圍的帳號**：本模組所有端點一律回 **403**（專用的依賴檢查，先於業務邏輯），測試會刻意誤配 material 權限來驗證。**不修改其他模組的範圍行為。**
- **附件端點的補充（使用者 2026-10-08 決定採方案 A）**：
  - **依附件 id 或檔案路徑存取**（`GET /api/files/{id}`、`DELETE /api/files/{id}`、`GET /api/files/download/{path}`）：
    - 附件**不存在或在呼叫者範圍外**時回 **404**，且優先於承包商拒絕。這沿用既有附件 API 的資料隱藏原則，不透露 id 是否存在、屬於哪種記錄。
    - 在範圍內的承包商範圍帳號回 **403**（「Not available to contractor-scoped accounts.」）。
  - **上傳與依 entity 列表**（`POST /api/files/upload`、`GET /api/files/by-entity`）：維持既有的「權限優先」順序。承包商範圍帳號不論是否在範圍內，一律回 **403**。
  - 兩種情況承包商帳號都**無法存取**；拒絕刪除時，附件紀錄與檔案都保留。不修改產品程式，不放寬權限或專案範圍。

### 9.3 結果未知的處理（M2／M3 驗收條件，不影響 M1）
- 兩段式保存中，「伺服器明確拒絕」和「結果未知」（逾時、連線中斷）要分開處理。
- 結果未知時，前端**先重新讀取**該版的有效登錄與附件：
  - 已登錄：顯示成功；
  - 確定尚未登錄：顯示「回覆文件已上傳，結果尚未登錄」；
  - 讀不到或無法判斷：顯示「**無法確認登錄結果**」，並且**不自動重送**。
- 重送需由使用者觸發，且必須帶 `expectedCurrentEntryId`（或初次登錄時，由伺服器的唯一性限制拒絕重複）。

### 9.4 M1 的有效驗收清單（只有這些；r1 的刪除與 CRUD 要求一律不適用）
| AC | 內容 |
|---|---|
| AC-R3-1 | 空資料庫啟動：四張表與 §9.1 全部索引都存在（含欄位、唯一性、WHERE 條件），`projects.material_reply_days` 存在；四張表不是由 create_all 建立 |
| AC-R3-2 | 舊資料庫升級：建立新表與新欄位，既有資料不變 |
| AC-R3-3 | 重複啟動：沒有 schema 變更，也沒有錯誤 |
| AC-R3-4 | 失敗回報：既有表缺欄位、同名索引欄位錯誤、one_open 缺 WHERE、必要欄位缺 NOT NULL，四種情況都會中止啟動，且資料保留 |
| AC-R3-5 | 回退：舊版程式（HEAD，不含材料程式）在升級後的資料庫上可以啟動，並能新增與更新專案；再升級回來時，材料資料仍在 |
| AC-R3-6 | `materialReplyDays`：接受 null、0、14；拒絕 -1、1.5、"14" |
| AC-R3-7 | 新表與新欄位為 snake_case；API 為 camelCase；輸入多餘欄位回 422（例如 PUT 帶 projectId） |
| AC-R3-8 | 列表缺 projectId 回 422；total 等於全部筆數（以 limit 小於總數驗證） |
| AC-M1-1′ | 建立材料：projectId 不可見或不存在回 404，且零寫入；名稱空白回 422 |
| AC-M1-2 | 只屬專案 A 的使用者：GET 與 PUT 專案 B 的材料回 404；列表只有 A 的資料 |
| AC-M1-4 | `materialReplyDays` 可透過 `PUT /projects/{id}` 設定與清除，沒有預設值 |
| AC-M1-5 | 權限：沒有 view 回 403；只有 view 時寫入回 403；帶 vendor 範圍的帳號即使有全部 material 權限也回 403；沒有 DELETE 端點 |
| AC-M1-6 | 稽核：新增與修改都寫 AuditLog；`log_audit` 失敗時整筆回滾 |
| AC-M1-7 | 有材料的專案不能刪除（`check_project_references` 納入材料與送審） |
| AC-M1-8 | model 的索引與 §9.1 清單一致（create_all 建出的 schema 與 migration 建出的 schema，索引定義相同） |
