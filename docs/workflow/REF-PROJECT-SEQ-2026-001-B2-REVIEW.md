# REVIEW.md — 獨立審查

TASK_ID: REF-PROJECT-SEQ-2026-001-B2

- 審查者：獨立 Claude 審查代理（general-purpose 子代理，唯讀）。
- 範圍：工作樹 diff。審查開始時對照 2589c8d6；審查期間合入了 d54be8a8（FAT-SUPPLIER-NULL）。不是部署驗收。

## R1（2026-10-13）：REVISE

### P1-1（必修）：G2「關聯必須同專案」只檢查建立，沒有檢查修改
- 涵蓋：NCR 的 noiNumber／itrNumber、Follow-up 的來源、Checklist 的 noiNumber／itrNumber。
- 影響：管理者在「所有專案」下修改這些單據時，可以把連結改到其他專案的單據。

### P2（建議修）
- **P2-1**：link_checklist 沒有檢查範本和 ITR 是否同專案。B1 期間建立的「專案範本」可以被管理者連到其他專案的 ITR。
- **P2-2**：NOI 引用 ITP 時沒有檢查使用者看不看得到這份 ITP。承包商可以引用別家承包商的共用範本。

### P3（細節）
1. 舊註解和新規則矛盾（itr_service、scope_instance_contractor 測試）。
2. 管理者送 `project_id=""` 時，建立的 ITP 既不是共用範本，也不屬於任何專案。
3. `is_shared_template`（Python，有 strip）和 SQL 條件（沒有 strip）的判斷不一致。
4. 衍生建立（從 ITR 開 NCR、重新檢驗、延續會議、連結 Checklist）不受 D7 限制，需要使用者確認。
5. `LINK_OTHER_PROJECT` 會多透露「這個號碼屬於其他專案」。可以接受，記錄下來。
6. Follow-up 的 FAT 來源用 `equipment` 比對，名稱重複時可能比對錯。既有限制，記錄下來。
7. 測試缺口：ITP delete／detail、Checklist delete、附件 delete 的 403，以及「沒有專案的實例」。
8. 批次新增不是原子操作（既有問題）。

### 已確認沒問題
- 共用範本的讀寫隔離；所有寫入路徑都有管理者限制。
- 管理者建立時必須帶專案，涵蓋所有建立路徑。
- RefusalHTTPException 不會被轉成 500。
- 前端各項修改；CRLF 保留；測試沒有被放寬。
- 審查時實跑：後端 428 passed，前端 tsc 0、npm test 197。

## R1 之後的修正（待 R2）
| 項目 | 修正 |
|---|---|
| P1-1 | **ncr_service.update_ncr**：noiNumber 和 itrNumber 變更時檢查同專案。<br>**followup_service**：新增 `_require_same_project_source`，建立和修改共用；修改時來源有變更才檢查。<br>**checklist_service.update_checklist**：noiNumber 和 itrNumber 變更時檢查同專案。<br>新增測試 `test_changing_a_link_to_another_projects_document_is_refused_on_update`，涵蓋 4 種情境。 |
| P2-1 | **itr_service.link_checklist**：在 record_in_scope 之後，檢查範本和 ITR 是否同專案；共用範本照常放行。新增測試。 |
| P2-2 | **noi_service** 建立和修改：引用的 ITP 必須在使用者範圍內，否則回 not found（400）。**routers/noi.py** 的建立和批次建立補上 ValueError → 400（原本會變成 500，是既有問題）。新增測試。 |
| P3-1 | 更新 itr_service 的兩段註解，以及 scope_instance_contractor 測試的 docstring。 |
| P3-2 | **enforce_create_scope**：允許共用範本的路徑上，空的 project_id 一律轉成 None。新增測試。 |
| P3-3 | `is_shared_template` 拿掉 strip，和 SQL 的 `COALESCE(...) = ''` 判斷一致。 |
| P3-4 | **使用者 2026-10-13 決定**：允許，新單據沿用來源單據的專案（DECISIONS 第 10 點）。不改程式。 |
| P3-7 | 新增測試：ITP detail、Checklist delete、附件 delete 的非管理者 403；沒有專案的實例對成員不可見；空字串 project_id。 |
| P3-5、6、8 | 記錄下來，不改。 |

## R2（只審 R1 之後的修正，2026-10-13）：PASS
- **R1 項目**：P1-1、P2-1、P2-2、P3-1 到 P3-4、P3-7 都逐項核對過。
  - 修改時的同專案檢查只在值有變更時才執行，UI 重送沒變的連結不會被誤擋。
  - 專案為 NULL 的舊資料會略過檢查。
  - NOI 的 ValueError 轉成 400；例外的捕捉順序正確，DateValidationError 仍然回 422。
- **CRLF**：全部保留，包括 routers/noi.py 和合併進來的檔案。
- **FAT 合併**：只有一次 showRefusal，結果正確。
- **實跑**：後端 168 passed；前端 tsc 0、npm test 198。
- **P3 建議**（不影響 PASS，本輪不改）：
  - NOI 建立的 `except ValueError` 可以改用 `refusal_http(e)`；
  - 可以補一條正向測試：舊資料已跨專案（或專案為 NULL）時，原值重送照樣能存檔。
