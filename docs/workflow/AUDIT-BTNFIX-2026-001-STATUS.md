# AUDIT-BTNFIX-2026-001 — STATUS（R1 審查 PASS；3.11 全部通過；已本地提交）

TASK_ID: AUDIT-BTNFIX-2026-001
ROUND: R1

## 基準與做法
- 基準為 HEAD `d78e9023`。這一版的 Audit 程式碼與 AUDIT-BUTTONS 的 commit `9afcb977` 相同，`9afcb977` 之後的 commit 只改了會議記錄。
- repo 工作樹中有 AUDIT-TEMPLATES 尚未提交的修改，也會動到 AuditWizard.tsx 和 LanguageContext.tsx。所以本輪在 repo 外的獨立複本開發（`git archive` 基準版本），沒有動工作樹。
- 分成兩個 commit：
  - **C1**：共用 DataTable 和日期警告的雙語化。`evidence/C1-shared-datatable-i18n.patch`，SHA-256 `056c2fa5…efaff9`，12 個檔案，新增 2 個。
  - **C2**：Audit 修正，疊在 C1 上。`evidence/C2-audit-fixes.patch`，SHA-256 `034a053b…de00e9`，6 個檔案，新增 2 個。
- 基準 + C1 + C2 和開發複本逐檔相同，已用 `git apply` 驗證。兩份 patch 都只有新增檔案的 `create mode 100644`，既有檔案沒有 mode 變更。CRLF 檔案（DataTable 的 4 個檔案、NOIDetailModal、columns、AuditWizard、LanguageContext）修改後仍是 CRLF。
- 尚未提交。

## RESULT
- [x] 獨立審查 PASS；建議 1、2 已處理；建議 3（灰色刪除鈕的提示）依使用者選擇加上，複審 PASS（見 REVIEW）。
- 現行 patch：C1 `3f703be3…`、C2 `09c07a8e…`。審查時的版本保留為 `C1-R1-reviewed.patch`、`C2-R1-reviewed.patch`。

## C1：共用 DataTable、日期警告雙語化（只換文字，不改行為）
| 檔案 | 內容 |
|---|---|
| `Shared/DataTable/useDataTableText.ts`（新） | `useDataTableText()`，透過 `dataTable.*` 鍵翻譯。找不到鍵，或表格不在 LanguageProvider 內（例如單元測試）時，退回原本的英文字串，**不會顯示原始鍵名**。英文退回字串存放在 `DATA_TABLE_TEXT_EN`。 |
| `DataTablePagination.tsx` | 選取列數、每頁列數、第 x／y 頁，以及 4 個 sr-only 的翻頁說明。 |
| `DataTableViewOptions.tsx` | View 按鈕、「Toggle columns」。欄位 id 照舊顯示，沒有改。 |
| `DataTableColumnHeader.tsx` | Sort Asc／Desc、Hide Column、Filter、Select...、All、`Filter {title}...`。hook 放在提前 return 之前，符合 hooks 規則。 |
| `DataTable.tsx` | `searchPlaceholder` 不再預設寫死 "Filter..."：呼叫端沒有傳時，才用翻譯後的預設值。Contractors 自己傳入的 placeholder 不受影響。 |
| `utils/dateValidation.ts` | `checkDateOrder` 新增選用參數 `t`。有傳 t 時，使用 `common.dateOrderWarning`；沒傳 t 或找不到鍵時，維持原本的英文句子。 |
| NOI（`NOIDetailModal`）、OSD（`OSDModals`）、FAT、Audit（`AuditWizard`） | 5 個呼叫點都補上 `t`，每處只改一行。 |
| `LanguageContext.tsx` | 新增 17 個 `dataTable.*` 鍵和 `common.dateOrderWarning`，en 和 zh 都有。 |
| `tests-unit/dataTableText.test.ts`（新） | 4 項測試：<br>• en、zh 都有全部的鍵，佔位符一致。<br>• 中文分頁。<br>• 找不到鍵或沒有 Provider 時，顯示英文、不顯示鍵名。<br>• 日期警告：中文；沒有 t 或找不到鍵時為英文。 |

## C2：Audit 修正
| 項目 | 修改 |
|---|---|
| #36 承包商欄篩選 | `columns.tsx` 的承包商和狀態兩欄，篩選條件改為 `!value \|\| cell === value`，也就是完全相符。<br>原本的 `value.includes(cell)` 對字串做子字串比對：沒有承包商的稽核（`''`）任何選項都會符合，部分名稱也會符合。 |
| #41 灰色刪除鈕 | 操作欄的外層 div 加上 `onClick={e => e.stopPropagation()}`；依使用者選擇，停用時外層 div 也帶 `title`，滑鼠移上去會提示原因（請先作廢／沒有刪除權限）。按鈕停用時不會收到點擊，原本寫在按鈕上的 stopPropagation 不會執行。點同一列的其他欄位，仍會開啟精靈。 |
| 唯讀橫幅 | `AuditWizard.tsx` 在步驟列下方顯示 `readOnlyReason` 橫幅（鎖頭圖示、琥珀色，`data-readonly-banner`）。依優先順序：<br>1. 已結案 Closed<br>2. 已作廢 Void<br>3. 已建立但無更新權限（沿用原本的 createdNoUpdateNotice，取代原本那塊提示）<br>4. 沒有修改權限<br>新增 3 個翻譯鍵，en 和 zh 都有。 |
| #68 刪除行程時的午餐 | `AuditAgendaEditor.removeRow`：刪掉的是某天最後一個行程時，一併移除那天仍是預設內容的午餐。使用者改過的午餐保留；當天還有其他行程時，午餐也保留。 |
| `seed_audit_btnfix_review.py`（新） | 承包商「Second Vendor」和它的 AHB-SV-1；沒有承包商的 AHB-NOVENDOR-1（contractor `""`，和舊資料一樣）；帳號 btnfix_lists，可檢視 Audit、NOI、OSD、會議記錄。 |
| `audit-btnfix-check.mjs`（新） | 29 項，見下方證據。 |

## 證據（`AUDIT-BTNFIX-2026-001-evidence/`）
- `frontend-checks.txt`：開發複本上 tsc、eslint（`--max-warnings 0`，13 個檔案）、單元測試（164 項全部通過，含新增 4 項）、build 都是 0。
- `browser-check.txt`：`audit-btnfix-check.mjs` 在全新的隔離 stack（8324/3324，cacheDir `.vite-btnfix-3324`）上，**ALL PASS（32 項，含 3 項滑鼠提示）**，exit 0。
  - #36：Second Vendor 只剩 AHB-SV-1；Review Vendor 每一列都是 Review Vendor，沒有「-」；改回「全部」後筆數還原；狀態欄篩選 Void 只剩 Void。
  - #41：
    - audit_full 點灰色刪除鈕不開精靈；點同一列其他欄位仍會開。
    - Void 列可用的刪除鈕跳出確認、不開精靈，按取消後資料仍在。
    - audit_viewer 點灰色刪除鈕不開精靈、不跳確認。
  - 唯讀橫幅：
    - Closed 和 Void 各自顯示對應原因，切到第 4 步仍在。
    - 可編輯的 Draft 第 1 步和第 5 步都沒有橫幅。
    - audit_viewer 開 Draft 顯示「沒有修改權限」，開 Closed 以「已結案」為原因。
    - audit_viewer 新增稽核時，存檔前沒有橫幅，存檔後顯示「已建立、無更新權限」。
    - 英文介面為英文。
  - #68：新的一天新增一列再刪除，午餐一併移除；同一天還有其他行程時，午餐保留；改過的午餐（remarks keep）保留。
  - 中文化：
    - 日期警告：「稽核結束日（2026-09-01）早於稽核開始日（2026-10-01）」。
    - Audit 清單的分頁、每頁列數、選取列數、檢視為中文；欄位標題選單為升冪排序、降冪排序、隱藏此欄、篩選、全部；檢視選單為「顯示欄位」。
    - NOI、OSD、會議記錄清單都是中文分頁，沒有英文殘留或原始鍵名。
    - 英文介面的 NOI 清單仍為英文。
- `browser-check-control-on-HEAD.txt`（對照組）：同一支腳本跑在未修正的 HEAD 上，前 24 項有 **15 項 FAIL**，4 個修正項目都有抓到，exit 1。最後一步在找中文的「檢視」按鈕時逾時，因為未修正版顯示的是「View」。
- 截圖 `shots/`：
  - `banner-ahb-ahb-closed-1.png`、`banner-ahb-ahb-void-1.png`、`banner-no-permission.png`
  - `contractor-filter-second-vendor.png`、`agenda-edited-lunch-kept.png`、`date-warning-zh.png`
  - `audit-list-zh.png`、`audit-header-menu-zh.png`
  - `NOI-list-zh.png`、`OSD-list-zh.png`、`MeetingMinutes-list-zh.png`、`NOI-list-en.png`

## 其他觀察（不在本輪範圍）
- NOI、OSD、FollowUp、ITR、OBS 的 `columns.tsx` 也是 `value.includes(row.getValue(id))` 這種寫法，有同樣的潛在問題。本輪依範圍只修 Audit，建議另外排程處理。
- 測試時主控台出現 `common.deleteConfirmTitle` 缺翻譯的警告，en 和 zh 都缺。這是 NOI／OSD／會議記錄頁原本就有的問題，和本輪無關。

## 3.11 與提交
- **3.11 全套測試：2457 passed、16 skipped，pytest_exit=0**（`evidence/py311-full-suite-final.txt`，07:05Z–08:00Z，python:3.11-slim）。
  - 候選樹：AUDIT-BUTTONS cand-final（正式站 AGENDA + NOI + BUTTONS）+ C1 `3f703be3` + C2 `b97d7db3`。
  - 3.11 開跑後，C2 改為 `09c07a8e`，只多了刪除鈕提示（columns.tsx）和瀏覽器檢查的 3 項，都是前端；後端檔案沒有變，所以這次 3.11 的結果仍然有效。
  - 最終候選換成 C2 `09c07a8e` 後，tsc、單元測試 148/148、build 都是 0（`evidence/final-candidate-frontend-checks.txt`）。
- **提交**：以提交當下的 HEAD 為基準，用暫存 index 提交 C1、C2 和文件三個 commit，沒有 force。C1 + C2 已經套用到工作樹，TEMPLATES R2 疊在上面繼續做。
- **尚未做**：開隔離環境給使用者看、交給協調中心排部署（順序 NOI → AUDIT-BUTTONS → AUDIT-BTNFIX）。
