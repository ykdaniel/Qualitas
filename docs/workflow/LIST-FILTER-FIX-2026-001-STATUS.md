# LIST-FILTER-FIX-2026-001 — STATUS（Claude 執行結果）

TASK_ID: LIST-FILTER-FIX-2026-001 · ROUND: R1 · 2026-10-11
SOURCE: 協調中心（「登入測試」工作階段）交辦，表示使用者已授權協調中心直接安排。源頭是 AUDIT-BTNFIX-2026-001 STATUS「其他觀察」的兩項既有缺陷。

## RESULT
- [x] DONE（實作與驗證完成；待獨立審查）

## 先確認的前提
- 欄位篩選 UI（`Shared/DataTable/DataTableColumnHeader.tsx`，HEAD 版）有兩種：
  - 有 `filterOptions` 時是**單選** `Select`，`setFilterValue(value === "ALL" ? "" : value)`，值是單一字串。
  - 沒有時是自由輸入的文字框。
- 下列所有 `value.includes(row.getValue(id))` 的欄位都有 `filterOptions`，也就是單選、值為字串。所以 `includes` 實際上是字串的子字串比對：
  - 沒有值的列（`''`）在任何選項下都會被選進來。
  - 名稱片段（例如 `Formosa`）會被當成符合完整名稱。
- 沒有任何頁面用程式或網址把欄位篩選設成陣列：`DataTable` 的 `columnFilters` 初始值是 `[]`，只有 header 的 Select、文字框和 DataTable 的搜尋框會呼叫 `setFilterValue`。所以不存在多選。改成完全相符後，單選的使用方式不變。
- 「全部」會設成 `''`，TanStack 遇到空字串會自動移除該篩選。另外加 `!value ||` 作為保險，寫法和 Audit 的 BTNFIX 一致。

## 本輪修改
| 檔案 | 修改 |
|---|---|
| `components/NOI/columns.tsx`（CRLF） | 狀態欄：`return !value \|\| row.getValue(id) === value;` |
| `components/ITR/columns.tsx`（CRLF） | 狀態欄：同上 |
| `components/OSD/columns.tsx`（LF） | 狀態欄＋承包商欄：同上 |
| `components/OBS/columns.tsx`（CRLF） | 狀態欄＋承包商欄：同上 |
| `components/NOI/NOI.tsx` | 刪除確認視窗標題 `t('common.deleteConfirmTitle')` → `t('common.confirmDeleteTitle')`（1 行） |
| `react-app/tests-browser/list-filter-fix-vite-launcher.mjs`（新） | 本輪隔離驗收用：3292 → 8292，獨立 cacheDir `.vite-listfilter-3292`（驗收後已刪除該快取資料夾） |

- **FollowUp 不用改**：狀態欄本來就是 `===`；來源欄是自訂判斷（`!value` 放行、`Follow-up` 對應空值、其餘 `===`），兩欄都已經是完全相符。
- **第 2 點（缺翻譯）的做法與交辦不同**：
  - 全 repo 只有 `NOI.tsx:439` 用到 `common.deleteConfirmTitle`。OSD 和會議記錄頁都沒有用到；先前在這兩頁看到的警告，應該是瀏覽 NOI 後留在 console 的。
  - 翻譯檔已經有意思相同的 `common.confirmDeleteTitle`（Confirm Delete／確認刪除），中英都有。
  - 所以改呼叫端使用既有鍵，不新增重複的鍵，也不必動有三個工作階段未提交修改的 `LanguageContext.tsx`。
- 共用 DataTable 沒有動。
- 各檔都用二進位方式修改，原本的換行（CRLF／LF）都保留。

## 證據
- **實測**：
  - `npx tsc --noEmit` exit 0；`npm test` 164 pass／0 fail。
  - ESLint 對 5 個檔只有 1 個 error，是 `NOI.tsx` 約第 145 行既有的 `react-hooks/set-state-in-effect`，不在本輪修改的行。
- **實測（隔離環境 8292／3292，獨立 cacheDir，種子 `seed_noi_itr_desktop_review.py`，已 `down`）**：
  - OSD、OBS：用 API 各建 3 列，承包商分別是 `Formosa Heavy Structural Engineering Co., Ltd.`、`''`、`Formosa`。
    - OSD：承包商篩選選「Formosa Heavy…」→ 只剩 QTS-FHS-OSD-000001，空白和 `Formosa` 兩列被排除。改回「All」→ 3 列都回來。
    - OBS：同樣篩選 → 只剩 QTS-FHS-OBS-000001。
  - ITR 狀態：Reject → 只剩 QTS-NDR1-ITR-000002；In Progress → 000001、000003 兩列。
  - NOI 狀態：Closed → No data found；Open → 3 列。
  - NOI 刪除確認：標題顯示「Confirm Delete」，console 沒有 `deleteConfirmTitle` 警告；按 Cancel 關閉，沒有刪除。
- **未實測**：
  - 修正前的對照組（在 HEAD 上跑同樣步驟）沒有做。依程式碼推論，修正前 `'Formosa Heavy…'.includes('')` 和 `.includes('Formosa')` 都是 true，會顯示 3 列。
  - OSD／OBS 的狀態欄只讀過程式碼，和 NOI／ITR 的狀態欄是同一行寫法。
  - 中文介面沒有另外切換驗證，標題用的是既有鍵，中英文都已存在。

## 待辦
- 獨立 Claude 審查 → 暫存前把 stat 傳給協調中心 → 本地提交並回報 hash。不推送、不部署。
