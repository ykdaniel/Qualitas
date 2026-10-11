# LIST-FILTER-FIX-2026-001 — REVIEW（獨立審查）

TASK_ID: LIST-FILTER-FIX-2026-001 · ROUND: R1 · 2026-10-11
審查者：**獨立 Claude 審查代理**（唯讀，不是實作者；GPT 額度用完，改用 Claude 審查）。

## VERDICT
**PASS**

## EVIDENCE_CHECK
- diff 共 7 行（6 個 filterFn，加上 NOI.tsx 1 行），launcher 是新檔。換行和 HEAD 一致：NOI／ITR／OBS 的 columns.tsx 是 CRLF，OSD 和 NOI.tsx 是 LF。
- `tsc` exit 0。ESLint：NOI.tsx:144 有既有的 `set-state-in-effect` error（本輪只改了第 439 行）；launcher 有 1 個 `no-console` warning，其他 launcher 也是一樣。
- 篩選 UI：6 個欄位都有傳 `filterOptions`，用的是 HEAD 版 DataTableColumnHeader:104-108 的單選 Select，選「All」時值為 `''`。工作樹裡的 DataTable 和 DataTableColumnHeader 沒有修改，沒有改成多選。這四個模組的 `searchKey` 都是 `""`，所以搜尋框不會走到這些 filterFn。
- 沒有任何地方把這些欄位的篩選值設成陣列，也沒有用網址驅動的篩選。`columnFilters` 初始值是 `[]`。`filterRowsLikeTable` 只有 MaterialSubmittal 在用，它的 filterFn 本來就處理陣列。
- 狀態值的大小寫和寫法固定，和 filterOptions 的 value 完全相同；也沒有哪個合法狀態剛好是另一個狀態的子字串。OSD 和 OBS 的 vendor 與選項都來自承包商名稱，同一個來源。vendor 是 null 時用 `===` 會被排除，這是正確結果。原本的 `includes` 也區分大小寫，所以不會有合法的列被誤排除。
- FollowUp 兩欄本來就是完全相符，和 STATUS 一致。
- `common.confirmDeleteTitle` 中英文都有（:51、:1709），另外還有 9 個元件在用。全 repo 已經沒有 `deleteConfirmTitle`。

## FINDINGS
沒有阻擋或需要修改的問題。

## NON-BLOCKING NOTES（都不是本輪造成的）
1. NCR、ITP、PQP、FAT、IAM、MeetingMinutes、Contractors 的 columns.tsx 仍然用 `value.includes(row.getValue(id))`，有同樣的問題，建議另排一輪處理。Audit 在 HEAD 也還是舊寫法，BTNFIX 的修正還沒合併。
2. NOI 的狀態選項只有 Open、Closed、Reject，工作流程裡的 In Progress、Resolved、Void 目前無法篩選。
3. OSD 和 OBS 的承包商選項只列出啟用中的承包商，已停用承包商的紀錄無法用承包商欄篩選。
4. 修改前的對照組沒有實測，OSD 和 OBS 的狀態欄只讀過程式碼，依讀碼判斷不影響結論。
