# 材料送審第一版規格（MATERIAL-SUBMITTAL-V1，待 GPT 審查）

- 日期：2026-10-08
- 性質：**可實作、可驗收的第一版規格，交 GPT 審查後才開始實作。** 本步不改產品、不建 migration，也不覆寫進行中的部署 TASK／STATUS／REVIEW。
- 依據：
  - `DECISIONS.md` 中各條「材料送審：…」決策；
  - 規劃文件 `QA-EXPANSION-MATERIAL-SUBMITTAL-PLAN-2026-10-08.md`（方向 PASS）；
  - 本次讀碼（位置見各節）。
- 已確認、不再重問：
  - 單一入口；材料限定所屬專案；一單一種材料。
  - 改版沿用原號、同一張卡片，歷史保留。
  - 內部不審批；外部結果四種；現行核准版規則。
  - 預計回覆日依專案日曆天數；同一批人員負責。
- **審查意見依使用者最新指示暫不納入**：第一版不設計意見欄位，也沒有意見必填規則。外部回覆的內容以「回覆文件」附件保存。
- 標記：【決策】＝已確認；【建議】＝本規格的設計選擇，可由審查調整；【讀碼】＝現有程式事實。

---

## 1. 範圍

**做**
- 側欄單一入口「材料送審」，頁內分兩個分頁：「送審」「材料資料」。「送審」分頁可切換看板與列表。
- 材料資料：只屬於所屬專案，同專案內可重複選用。
- 送審：
  - 一份送審對應一種材料；版次從 Rev 0 開始。
  - 每個版次都有凍結的快照和附件，並有一個外部結果。
  - 卡片同時顯示現行核准版和最新版次狀態。
- 專案設定：每個專案可設定「材料送審回覆天數」。
- 權限、專案範圍與稽核紀錄，都沿用既有機制。

**不做**
- 內部審批、審查意見欄位。
- 跨專案材料庫、跨專案選用或複製。
- 一單多材料、逐項核准。
- 拖曳改狀態、到期提醒排程、列印範本、手機最佳化。
- 與 ITP、NOI、OSD 的連動，以及進場或施工放行的推論。
- 其他品管模組的擴充。

---

## 2. 桌面主要畫面與操作流程（草圖）

### 2.1 入口與頁面骨架
- 側欄：放在「品質管控」群組，排在 PQP 之後、ITP 之前。只有具備 `material:view:all` 權限的人看得到（做法同 KM，`AppLayout.tsx:120`）【建議】。
- 路由：`/material-submittals`（`App.tsx` 新增 lazy route）。

```
┌ 材料送審 ───────────────────────────────────────────────────────────────┐
│ 專案 [▼ 專案A]   [送審] [材料資料]                       [+ 新增送審]    │
│ ┌ 篩選 ──────────────────────────────────────────────────────────────┐ │
│ │ 關鍵字[____]  分類[▼]  承包商[▼]  最新狀態[▼]  □只看逾期   檢視:[看板|列表] │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│  （看板或列表，見 2.2／2.3）                                              │
└─────────────────────────────────────────────────────────────────────────┘
```
- 必須先選定專案。無專案範圍限制的帳號（例如 admin）也一樣，因為材料限定所屬專案【決策】。下拉選單只列出使用者有權限的專案。

### 2.2 看板（依「最新版次狀態」分欄）
```
│ 草稿        │ 外部審查中      │ 修正後再送   │ 拒絕        │ 已核准                 │
│┌──────────┐│┌──────────────┐│┌───────────┐│┌──────────┐│┌──────────────────────┐│
││防火填塞材  │││鍍鋅鋼管 SCH40 │││...        │││...       │││不鏽鋼螺栓 M12          ││
││A牌 FS-200 │││B牌｜承包商X   │││           │││          │││C牌｜承包商Y            ││
││承包商X     │││…-MSA-000013  │││           │││          │││…-MSA-000009           ││
││…-MSA-12   │││最新 Rev 2 審查中│││           │││          │││最新 Rev 1 附意見核准    ││
││最新 Rev 0  │││現行核准 Rev 1   │││           │││          │││現行核准 Rev 1（附意見） ││
││草稿        │││回覆日 10/20 逾期│││           │││          │││                      ││
│└──────────┘│└──────────────┘│└───────────┘│└──────────┘│└──────────────────────┘│
```
- 卡片內容：
  - 材料名稱＋型號／規格（截斷）、廠牌｜承包商、送審編號；
  - 「最新 Rev n＋狀態」；
  - 「現行核准 Rev m（核准／附意見核准）」，沒有時顯示「尚無核准版」；
  - 預計回覆日，只在外部審查中顯示，逾期以紅色標示。
- 「已核准」欄同時放核准與附意見核准，兩者**徽章不同**，附意見核准不顯示成無條件核准【決策】。
- 可切換為「依分類分組」，欄位即本專案出現過的分類值【建議】。
- 點卡片開詳細頁。**不能拖曳**。

### 2.3 列表
欄位：送審編號、材料名稱、分類、廠牌／型號、承包商、最新版次、最新狀態、現行核准版（含結果徽章）、送件日、預計回覆日、最後更新。
- 以 `Shared/DataTable` 為基礎，可排序、可匯出 Excel（`ExportButton`）。
- 看板與列表使用同一支 API、同一組篩選條件，筆數必須一致。

### 2.4 詳細頁（抽屜或大型 modal）
```
┌ …-MSA-000013  鍍鋅鋼管 SCH40 ─────────────────── 現行核准：Rev 1（核准）┐
│ 版次：[Rev 0][Rev 1][Rev 2●]     最新：Rev 2 外部審查中（回覆日 10/20）   │
│ ── 送審內容（Rev 2 快照，唯讀） ─────────────────────────────────────── │
│ 分類／名稱／廠牌／型號／規格／製造商／供應商／送審依據（規範章節、圖說）    │
│ ⓘ 與目前材料資料不同：型號（快照不會被改寫）                              │
│ ── 送審附件（Rev 2） ── 型錄｜技術資料｜證明文件｜試驗報告｜其他（送出後唯讀）│
│ ── 外部結果（Rev 2） ── 尚未登錄              [登錄外部結果]               │
│ ── 歷程 ── Rev 0 送出 9/1 王小明 → 修正後再送（顧問甲 9/10，登錄：王小明 9/11）│
│            Rev 1 送出 9/15 → 核准（業主乙 9/25，登錄：李小華 9/26）          │
│            Rev 2 送出 10/6 王小明，回覆日 10/20（調整自 10/13）                │
│ [建立新版次]（只在最新版已有結果時可用）  [刪除送審]（只在從未送出時）        │
└───────────────────────────────────────────────────────────────────────┘
```
- 預設顯示最新版次。切換版次時顯示**該版的快照與附件**，不以目前的材料資料取代【決策】。
- 草稿版次可以編輯快照欄位和附件。「從目前材料資料更新」按鈕只在草稿時出現【建議】。

### 2.5 操作流程
1. **新增送審**（對話框）：
   - 選專案（預設為目前專案）和承包商。
   - 材料可以「選本專案既有材料」（只列本專案），也可以「就地新增」，最少填名稱，廠牌、型號選填。
   - 填送審依據後建立。系統給號 `…-MSA-000013`，建立 Rev 0 草稿；快照從材料資料複製。
2. **編輯草稿、上傳附件**：附件綁在這個版次（見 3.4）。
3. **送交業主／顧問**（對話框）：
   - 填送件日期，預設今天。
   - 預計回覆日自動帶入「送件日＋專案天數」（日曆天，不順延），可以修改【決策】。專案未設定天數時必須手動填寫【建議】。
   - 確認後版次凍結，狀態改為「外部審查中」。
4. **登錄外部結果**（對話框）：
   - 結果四選一：核准、附意見核准、修正後再送、拒絕。
   - 填外部決定者（人名、單位、職稱）、外部回覆日期、外部文件編號（選填），可上傳回覆文件。
   - 系統另外記錄登錄人與登錄時間【決策】。
   - 核准或附意見核准時，此版成為現行核准版。
5. **建立新版次**：最新版已有結果時才能建立。
   - Rev n+1 草稿的快照從上一版複製；附件**不**自動帶入【建議，見 6】。
   - 在新版審查期間，卡片上的現行核准版維持不變【決策】。

---

## 3. 資料模型、版次快照、現行核准版與附件關係

### 3.1 新增資料表【建議；欄位命名沿用專案既有的 camelCase 欄位＋snake_case 外鍵慣例，`models.py` OSD 為例】

**`materials`（材料資料，可修改）**
| 欄位 | 型別 | 說明 |
|---|---|---|
| id | String PK | uuid |
| project_id | FK projects.id **NOT NULL**, index | 所屬專案【決策】。不提供跨專案選用 |
| category | String, null | 分類（自由文字；選單只列本專案已使用的值）【建議】 |
| name | String NOT NULL | 名稱 |
| brand / model / specification / manufacturer / supplier | String, null | 廠牌、型號、規格、製造商、供應商（自由文字）【建議，見 6】 |
| createdBy / createdAt / updatedBy / updatedAt | String | 操作人與時間 |

**`material_submittals`（送審，一張卡）**
| 欄位 | 型別 | 說明 |
|---|---|---|
| id | String PK | |
| project_id | FK projects.id NOT NULL, index | 必須等於材料的 project_id（後端驗證） |
| vendor_id | FK contractors.id NOT NULL, index | 承包商。用於編號縮寫和廠商範圍【建議，見 6】 |
| material_id | FK materials.id NOT NULL（ON DELETE RESTRICT 語意，由 service 擋） | 一單一種材料【決策】 |
| documentNumber | String unique, index | `generate_reference_no(db, vendor, 'MSA')`，同號直到結束【決策】 |
| latestRevisionNo | Integer | 冗餘欄位，供看板查詢 |
| latestStatus | String | 冗餘：Draft／Submitted／Approved／ApprovedWithComments／ReviseAndResubmit／Rejected |
| currentApprovedRevision_id | FK material_submittal_revisions.id, null | 現行核准版 |
| createdBy / createdAt / updatedAt | String | |

**`material_submittal_revisions`（版次＝送審快照＋外部結果）**
| 欄位 | 型別 | 說明 |
|---|---|---|
| id | String PK | |
| submittal_id | FK material_submittals.id NOT NULL, index | |
| project_id / vendor_id | 冗餘自上層 | 讓附件的專案範圍（`entity_in_scope`）和 `record_in_scope` 可以直接判斷 |
| revNo | Integer NOT NULL；(submittal_id, revNo) unique | 0, 1, 2… |
| status | String NOT NULL | Draft → Submitted → 四種結果之一。附件鎖依此欄位判斷（`attachment_access.lock_reason` 讀 `record.status`）【讀碼】 |
| snap_category / snap_name / snap_brand / snap_model / snap_specification / snap_manufacturer / snap_supplier | String | 快照。草稿時可編輯，送出後不可修改 |
| specReference | Text, null | 送審依據（規範章節、圖說、契約條款），屬於快照 |
| submittedDate | String(YYYY-MM-DD) | 送件日 |
| submittedByUserId / submittedByName / submittedAt | String | 送件操作人與操作時間 |
| expectedReplyDate | String | 實際採用的預計回覆日 |
| expectedReplyDateAuto | String, null | 依專案天數算出的值。與 expectedReplyDate 不同，即表示送件時有調整 |
| resultCode | String, null | Approved／ApprovedWithComments／ReviseAndResubmit／Rejected【決策】 |
| externalDecisionMaker / externalDecisionOrg / externalDecisionTitle | String | 外部決定者【決策：與登錄人分開】 |
| externalReplyDate | String | 外部回覆日期 |
| externalDocNo | String, null | 外部文件編號 |
| resultLoggedByUserId / resultLoggedByName / resultLoggedAt | String | 系統登錄人與時間 |
| createdBy / createdAt | String | |

**`projects` 新增欄位**：`materialReplyDays`（Integer, null）。不設預設值【決策：不自行設定天數】。

### 3.2 狀態與規則
```
版次:  Draft ──送交──▶ Submitted ──登錄結果──▶ Approved | ApprovedWithComments | ReviseAndResubmit | Rejected（終態）
```
- 同一份送審**同時最多一個未結版次**（Draft 或 Submitted）。只有最新版能送交或登錄結果；最新版有結果後，才能建立下一版【建議】。
- 版次一旦 Submitted，快照與送審附件就不能再改。結果登錄後，整個版次唯讀。這由後端驗證，不只靠前端。
- 現行核准版：
  - 登錄 Approved 或 ApprovedWithComments 時，`currentApprovedRevision_id` 設為該版。
  - 登錄 ReviseAndResubmit 或 Rejected 時，不變動【決策】。
  - 新版處於 Draft 或 Submitted 時，也不變動【決策】。
- `latestRevisionNo`／`latestStatus` 與版次在同一個交易內更新。
- 沒有任何「內部核准」狀態或端點【決策】。
- 快照與材料資料的關係：
  - 建立版次時，從材料資料（Rev 0）或上一版（Rev n+1）複製快照。
  - 之後修改材料資料，**不會**回寫任何快照。
  - 詳細頁比較兩者，顯示差異欄位名稱。

### 3.3 預計回覆日
- `expectedReplyDateAuto = submittedDate + project.materialReplyDays`（日曆天，不排除週末假日，不順延）【決策】。
- 送交時可以覆寫 `expectedReplyDate`【決策】。專案天數為 null 時，Auto 也是 null，`expectedReplyDate` 必填【建議】。
- 送件後能不能再調整：第一版不提供【建議，見 6】。

### 3.4 附件
- 沿用 `/api/files`（`routers/file_router.py`）。新 entity type 為 `material_rev`，`entity_id` 是版次 id。附件**綁版次，不綁送審**，所以每版各有自己的附件，舊版附件保留可查【決策】。
- 要同步修改的四處【讀碼】：
  - `_VALID_ENTITY_TYPES`（`file_router.py:89-90`）；
  - `ENTITY_PERMISSIONS`（`attachment_access.py:40-55`，對應 view＝`material:view:all`、update＝`material:manage:all`）；
  - `ALLOWED_CATEGORIES`（同檔 85-93）；
  - `_ENTITY_MODELS`（`core/scope.py:177-200`，對應 `MaterialSubmittalRevision`）。
- 分類【建議】：`catalogue`、`technicalData`、`certificate`、`testReport`、`other`（送審附件），以及 `replyDocument`（外部回覆文件）。
- 鎖定【建議，沿用 `lock_reason` 的兩種機制】：
  - `_LOCKED_CATEGORIES[("material_rev","Submitted")]`：鎖住五種送審分類，只開放 `replyDocument`。
  - `_UNCONDITIONAL_LOCKED_STATUSES["material_rev"]`：四種結果狀態全部鎖定。結果送出時一併上傳的回覆文件，必須在狀態改變**之前**完成上傳（見 4.2 的登錄流程）。
  - Draft：五種送審分類開放；`replyDocument` 不開放。
- 第一版不提供「沿用上一版附件」；需要時請重新上傳【建議，見 6】。

### 3.5 稽核
- 材料的建立與修改、送審建立、版次建立、送交、登錄結果、刪除，都以 `log_audit(..., strict=True)` 寫入 `AuditLog`，內容包含 old／new 值【讀碼：`core/utils.py:324-379`】。
- 操作人與時間另外保存在版次欄位，供畫面上的歷程使用【決策：各自留存】。

### 3.6 建表方式【讀碼】
- 新表由啟動時的 `models.create_all_except_migration_owned`（`main.py:138`）建立，與 OSD、Meeting Minutes 新表的做法相同。
- `projects.materialReplyDays` 用 `db_migrations._add_column_if_missing` 新增。
- 編號：
  - `routers/settings.py` 的 `DEFAULT_NAMING_RULES` 加入 `{"doc_type":"msa","prefix":"QTS-RKS-[ABBREV]-MSA-","sequence_digits":6}`；
  - `core/utils.py` 的 `_DOC_TYPE_TABLES` 加入 `'MSA': ('material_submittals','documentNumber')`；
  - 前端同步修改 `DocumentNamingRules.tsx:14-24`。
- 這些屬於實作批次，本步不建立。

---

## 4. API、專案範圍與權限

### 4.1 權限碼【建議】
| 代碼 | 用途 |
|---|---|
| `material:view:all` | 查看材料、送審、附件；側欄入口 |
| `material:manage:all` | 維護材料資料；建立送審或版次；編輯草稿；送交；上傳或刪除草稿附件；刪除從未送出的送審 |
| `material:record_result:all` | 登錄外部結果（含上傳回覆文件） |

- 業務上由同一批人負責【決策】，因此權限碼只分成「維護與送交」和「登錄結果」兩個操作。指派給同一個角色即可，不強制分工。
- 新代碼加入 `core/perms.py` 的 `ALL_PERMISSIONS`。admin 啟動時自動取得全部代碼；其他角色在 IAM 指派（`db_seeder.py:96-141`）【讀碼】。
- 專案天數的設定沿用既有的專案編輯（`PUT /api/projects/{id}`，`CONTRACTOR_MANAGE`），在 `ProjectUpdate` 新增 `materialReplyDays`，前端加在 `Contractors.tsx` 的專案編輯表單【讀碼＋建議】。

### 4.2 端點（prefix `/api`；router 新檔 `routers/materials.py`、`routers/material_submittals.py`；邏輯放 services）
| 方法 | 路徑 | 權限 | 規則 |
|---|---|---|---|
| GET | `/materials?project_id&q&category` | view | `project_id` 必填；套用 scope |
| POST | `/materials` | manage | `enforce_create_scope`；`project_id` 必填 |
| GET／PUT | `/materials/{id}` | view／manage | 範圍外回 404；PUT 不可改 project_id |
| DELETE | `/materials/{id}` | manage | 有任何送審引用時回 409 |
| GET | `/material-submittals?project_id&status&category&vendor_id&q&overdue` | view | 回傳卡片所需欄位（最新版摘要＋現行核准版摘要） |
| POST | `/material-submittals` | manage | body：project_id、vendor_id、`material_id` 或 `new_material{name,…}`、specReference。材料必須同專案，否則回 400。建立送審＋Rev 0 草稿＋編號 |
| GET | `/material-submittals/{id}` | view | 含全部版次（快照、結果、操作人）與差異欄位名稱 |
| PUT | `/material-submittals/{id}/revisions/{revId}` | manage | 只能編輯 Draft 的快照與 specReference；其他狀態回 409 |
| POST | `/material-submittals/{id}/revisions/{revId}/submit` | manage | body：submittedDate、expectedReplyDate?。檢查是否為最新版、Draft、名稱必填 |
| POST | `/material-submittals/{id}/revisions/{revId}/result` | record_result | body：resultCode（四選一）、externalDecisionMaker（必填）、externalDecisionOrg、externalDecisionTitle、externalReplyDate（必填）、externalDocNo。只限最新版且為 Submitted |
| POST | `/material-submittals/{id}/revisions` | manage | 最新版必須已有結果；建立 Rev n+1 草稿 |
| DELETE | `/material-submittals/{id}` | manage | 只有 Rev 0 且為 Draft 時可刪；用 `reclaim_reference_no` 歸還編號；其他情況回 409 |

- 狀態變更走上表的專用動作端點，不使用整筆 PUT。參考 ITR `revoke-approval`、PQP `publish` 的做法【讀碼＋建議】。
- 登錄結果時，前端依序：上傳回覆文件（此時版次仍是 Submitted，`replyDocument` 開放）→ 呼叫 `/result`。
- 錯誤：
  - 領域拒絕回 400／409，範圍外回 404，權限不足回 403。
  - 不把原始例外回傳給 client（`AGENTS.md`）。
  - 寫入都用 `begin_write_transaction`，編號與狀態在同一個交易內完成【讀碼】。

### 4.3 專案範圍
- 三張表都有 `project_id`。列表、單筆、子資源與附件都套用 `apply_scope`／`record_in_scope`／`entity_in_scope`【讀碼：`core/scope.py`】。範圍外一律回 404，不洩漏是否存在。
- 材料限定專案【決策】：
  - 建立送審或版次時，後端驗證 `material.project_id == submittal.project_id`；
  - 材料選單 API 必須帶 `project_id`；
  - 無範圍限制的帳號也不能跨專案選用。
- 廠商範圍：送審與版次都有 `vendor_id`，可沿用既有的廠商過濾。`materials` 沒有 vendor_id，帶廠商範圍的帳號若被授予 `material:view:all`，會看到該專案的全部材料資料【建議：第一版不授權承包商帳號，見 6】。

---

## 5. 分批實作順序與驗收條件

每一批都獨立 PASS 後才進下一批。測試使用隔離環境，不碰開發資料庫或使用者的預覽環境。全部 PASS 且部署準備完成後，依既有授權部署；前端不重複部署既有版本。

### 批次 M1：後端資料與材料資料 API
**內容**
- 三張表的 model 與 `projects.materialReplyDays`；權限碼。
- 編號規則（`MSA`、`_DOC_TYPE_TABLES`、預設規則）。
- `/materials` CRUD 與範圍檢查，加上 pytest。

**驗收**
- AC-M1-1：建立材料時缺 `project_id` 回 400 或 422。專案範圍外的 project_id 回 403（`ScopeForbidden`）。
- AC-M1-2：使用者只屬專案 A 時，GET／PUT／DELETE 專案 B 的材料回 404；列表只回 A。
- AC-M1-3：被送審引用的材料不能刪除（409）。
- AC-M1-4：`materialReplyDays` 可透過 `PUT /projects/{id}` 設定或清除；沒有預設值。
- AC-M1-5：舊資料庫啟動後新表與新欄位都存在，既有資料不變（隔離環境中的啟動測試）。

### 批次 M2：送審、版次、結果、附件（後端）
**內容**：第 4.2 節送審相關端點、狀態規則、現行核准版、附件整合（四處白名單與鎖）、稽核，加上 pytest。

**驗收**
- AC-M2-1：建立送審得到 `…-MSA-000001` 與 Rev 0 Draft；快照等於材料資料。
- AC-M2-2：使用其他專案的材料建立送審，回 400。
- AC-M2-3：送出後再修改快照或材料資料，GET 該版的快照仍為送出時的值。
- AC-M2-4：專案天數 14、送件日為 2026-10-03（週六）時，`expectedReplyDateAuto` 為 2026-10-17，不順延。送件時覆寫為 2026-10-20，兩個值都保存。天數為 null 且沒有填寫時回 400。
- AC-M2-5：resultCode 只接受四種值，其他回 422。缺少外部決定者或外部回覆日期回 422。
- AC-M2-6：登錄結果後，`resultLoggedBy*` 等於呼叫者，`externalDecisionMaker` 等於輸入值，兩者分開保存。
- AC-M2-7：Rev 1 核准後建立 Rev 2 並送出，現行核准版仍是 Rev 1。Rev 2 被登錄為修正後再送或拒絕，現行仍是 Rev 1。Rev 2 被登錄為附意見核准，現行改為 Rev 2，`resultCode` 保持 ApprovedWithComments。
- AC-M2-8：最新版是 Draft 或 Submitted 時，建立新版回 409；對非最新版送出或登錄回 409。
- AC-M2-9：附件規則：
  - Draft 版可以上傳或刪除送審分類；
  - Submitted 版的送審分類回 403 或 409，只有 `replyDocument` 可以；
  - 已有結果的版次全部鎖定；
  - 範圍外的附件回 404。
- AC-M2-10：沒有 `record_result` 權限呼叫 `/result` 回 403；沒有 `manage` 權限呼叫其他寫入端點回 403。
- AC-M2-11：只有 Rev 0 Draft 能刪除送審，刪除後編號被歸還；其他情況回 409。
- AC-M2-12：系統內沒有任何內部核准端點或狀態。程式搜尋與 API 清單測試都找不到。

### 批次 M3：前端列表、詳細頁與流程對話框
**內容**
- 側欄入口（權限閘）、路由、頁面骨架、專案選擇。
- 「材料資料」分頁（列表、表單）。
- 「送審」分頁的列表視圖。
- 詳細頁（版次切換、快照、附件、外部結果、歷程）。
- 四個對話框（新增、送交、登錄結果、新版次）。
- zustand store、中英 i18n、Vitest 單元測試。

**驗收**
- AC-M3-1：沒有 view 權限時，側欄不顯示入口；直接進入網址時，畫面顯示權限不足，API 回 403。
- AC-M3-2：新增送審時，材料選單只列目前專案的材料；就地新增最少只要名稱。
- AC-M3-3：送交對話框依專案天數自動帶入回覆日，可修改；專案未設定時必須填寫。
- AC-M3-4：切換到舊版次時，顯示該版的快照與附件，並標示與目前材料資料不同的欄位。
- AC-M3-5：附意見核准的徽章和文字與核准不同（如「附意見核准」），不顯示成「已核准」。
- AC-M3-6：沒有任何審查意見欄位。

### 批次 M4：看板、篩選、專案天數設定與瀏覽器驗收
**內容**
- 看板（依最新狀態分欄，可改為依分類分組）、篩選、逾期標示、看板與列表切換。
- 專案編輯表單加入回覆天數。
- 隔離環境的瀏覽器驗收腳本。

**驗收**
- AC-M4-1：同一組篩選下，看板卡片數＝列表筆數＝API 回傳筆數。
- AC-M4-2：同一份送審改版後仍是同一張卡片（同一個 id 與編號），卡片顯示「最新 Rev n」與「現行核准 Rev m」。
- AC-M4-3：外部審查中且回覆日早於今天時，卡片與列表都標示逾期。
- AC-M4-4：卡片不能拖曳；改狀態只能透過詳細頁的動作。
- AC-M4-5：桌面寬度（≥1280）下版面不重疊；看板欄位可以橫向捲動。
- AC-M4-6：用 `seed_*` 隔離種子跑完整流程（Rev 0 修正後再送 → Rev 1 核准 → Rev 2 審查中 → Rev 2 附意見核准），有截圖與 network 證據。

### 批次 M5：部署
- 依既有部署流程：唯讀預檢、備份、回退準備、部署、唯讀冒煙（不新增正式業務資料）。
- 後端部署會帶出新表與新欄位，需在部署方案中單獨列出 schema 變更與回退方式。

---

## 6. 尚未確認的項目：最小建議與影響

| 項目 | 最小建議 | 影響 |
|---|---|---|
| 廠商角色（承包商、供應商、製造商、廠牌） | 送審掛既有的「承包商」（必填）；廠牌、製造商、供應商以材料上的自由文字欄位保存 | 編號縮寫與廠商範圍可沿用現有機制；以後若要廠牌主檔，需另做資料轉移 |
| 材料分類清單 | 自由文字＋本專案已使用值的建議清單 | 拼寫可能不一致；以後若要固定清單，需清理資料 |
| 送件後調整預計回覆日 | 第一版不提供（只在送交時調整） | 外部延期時無法更新，逾期標示會持續；需要時另開小批次（含權限與原因） |
| 送交時附件是否必填 | 第一版不強制，送交對話框顯示「無附件」警告 | 可能送出空的送審；改成必填只是一條驗證 |
| 新版次帶入上一版附件 | 不帶，重新上傳 | 多一點操作；帶入功能需要附件複製規則 |
| 承包商帳號是否使用 | 第一版不授權承包商帳號 | 材料表沒有 vendor_id，授權後可看到同專案全部材料 |
| 到期提醒、作廢、列印 | 第一版不做 | 依使用者後續指示 |

### 真正阻擋實作的問題（集中只有一題，影響 M2）
**登錄錯外部結果時怎麼辦？**
例如把「修正後再送」誤登為「核准」，會直接改變現行核准版。
- **建議**：
  - 提供「撤銷登錄」：需有 record_result 權限並必填原因，參考 ITR `revoke-approval` 的做法。
  - 撤銷後版次回到 Submitted，現行核准版回到登錄前的值；原登錄內容保留在稽核紀錄中。
- **若不提供**：誤登只能靠直接改資料庫修正，這違反 `AGENTS.md` 的資料原則。

其餘項目都已有最小建議，不阻擋 M1–M4。

---

## 7. 讀碼依據
- `backend/models.py`：OSD（473-518）、Project（610-632）、`create_all_except_migration_owned`（1064-1069）
- `backend/main.py:138-141`（建表與 `run_migrations`）
- `backend/db_migrations.py`（`_add_column_if_missing`、`_create_itr_approval_events_table`）
- `backend/core/utils.py`：`generate_reference_no` 462-537、`_DOC_TYPE_TABLES` 598-608、`log_audit` 324-379
- `backend/routers/settings.py:11-24`、`routers/projects.py:62-80`、`schemas.py:1088-1105`
- `backend/core/attachment_access.py:40-55, 57-93, 118-150`
- `backend/core/scope.py:60-200`
- `react-app/src/components/Shared/AppLayout.tsx:55-87,120`、`services/api.ts:226-241`、`components/Contractors/Contractors.tsx`（專案編輯）
