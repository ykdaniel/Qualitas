# B3 migration rehearsal — 正式資料庫複本（2026-10-14）

只放統計和對照表摘要；不含任何紀錄內容。

## 做法
- **來源**：協調中心提供的 `prod-snapshot-20261014.db`，SHA-256 `913f94c0…a5f18762e`。
  - 原檔只讀取、沒有開寫入模式；演練前後雜湊相同。
- **演練環境**：複製一份到本工作階段的 scratchpad 隔離目錄（不在 repo 內），在複本上依正式啟動順序執行：
  1. `models.create_all_except_migration_owned`
  2. `db_migrations.run_migrations()`（含第 27、28、29 步）
- **重跑測試**：再執行一次 `run_migrations()`，統計結果完全相同（各 flag 只跑一次）。
- **收尾**：演練完已刪除兩份複本（`copy.db`、`work.db`）。

## 第 27 步：共用 ITP 改成 STD 號
| 項目 | 演練前 | 演練後 |
|---|---|---|
| 沒有專案的 ITP | 144 | 144 |
| 　系統編的號：`QTS-` 開頭 | 61 | 0 |
| 　系統編的號：`TEST-` 開頭 | 1 | 0 |
| 　系統編的號：沒有號碼 | 1 | 0 |
| 　`QTS-RKS-STD-ITP-` | 0 | **63** |
| 　外部號（不改號） | 81 | 81 |
| `external_doc_no` 有值 | 欄位不存在 | **81** |
| 有專案的 ITP | 0 | 0 |
| ITP 內容雜湊<br>（description、detail_data、rev、status、vendor_id、project_id、attachments） | `bfb22626…` | `bfb22626…`（**相同**） |
| 指向共用 ITP 的 `noi.itpNo`（系統號） | 1 | 0 |
| 　改成指向 STD 號 | 0 | 1 |
| 找不到 ITP 的 `noi.itpNo` | 0 | 0 |
| ITP 來源的 Follow-up | 0 | 0 |
| `itr.detail_data` 含 itpNo | 0 | 0 |
| `itp_renumber_map` | 資料表不存在 | **63 筆**<br>新號 `QTS-RKS-STD-ITP-000001` 到 `000063`；舊號為 NULL 的 1 筆 |
| audit `RENUMBER_STD` | 0 | 63 |
| audit `COPY_EXTERNAL_DOC_NO` | 0 | 81 |
| `PRAGMA integrity_check` | ok | ok |

## 第 28 步：專案代碼唯一索引
- 專案：1 個（Hailong，代碼 HL），沒有重複代碼。
- 新增索引 `ux_projects_code_upper`。

## 第 29 步：命名規則和序號起點
- **命名規則**：13 筆規則從 `QTS-RKS-[ABBREV]-<TYPE>-` 改成 `QTS-RKS-[PROJECT]-<TYPE>-`。
  - 正式站原本就有 13 筆，含 meeting、msa，所以沒有新建。
  - audit 新增 13 筆 `UPDATE`，舊前綴寫在 old_value。
- **序號起點**：（Hailong, '*', 類型）沿用舊承包商 HL 的計數，因為兩者前綴文字相同：

| 類型 | 起點 |
|---|---|
| AUDIT | 5 |
| CHECKLIST | 2 |
| ITR | 2 |
| NCR | 1 |
| NOI | 4 |
| OBS | 1 |
| ITP | 75（第 27 步設定） |

- **('STD', '*', 'ITP')**：63。

## 演練後各類型的下一個號碼
用 `preview_reference_no` 查，不取號。

| 類型 | 下一號 |
|---|---|
| ITP | QTS-RKS-HL-ITP-000076 |
| NOI | QTS-RKS-HL-NOI-000005 |
| ITR | QTS-RKS-HL-ITR-000003 |
| NCR | QTS-RKS-HL-NCR-000002 |
| OBS | QTS-RKS-HL-OBS-000002 |
| PQP | QTS-RKS-HL-PQP-000001 |
| FOLLOWUP | QTS-RKS-HL-FUI-000001 |
| AUDIT | QTS-RKS-HL-AUD-000006 |
| CHECKLIST | QTS-RKS-HL-CHK-000003 |
| OSD | QTS-RKS-HL-OSD-000001 |
| MEETING | QTS-RKS-HL-MOM-000001 |
| MSA | QTS-RKS-HL-MSA-000001 |
| QWORKFLOW | Q-WorkFlow-HL-000001 |
| 共用 ITP 範本 | QTS-RKS-STD-ITP-000064 |
| 共用 Checklist 範本 | QTS-RKS-STD-CHK-000001 |

- 既有的 `Q-WorkFlow-` 號（1 筆，舊的全域格式）保留，不改號。
