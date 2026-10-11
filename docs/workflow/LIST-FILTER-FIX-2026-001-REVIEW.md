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

---

# R2 REVIEW（2026-10-11）：NCR、ITP、PQP、FAT、IAM
審查者：**獨立 Claude 審查代理**（唯讀，非實作者）。

## VERDICT
**PASS**

## EVIDENCE_CHECK
- diff 共 5 檔、+9／−9，每處都改成 `return !value || row.getValue(id) === value;`。換行和 HEAD 一致：NCR、PQP、FAT、IAM 是 CRLF，ITP 是 LF，各檔的 CRLF 行數與總行數都沒變。代理重跑 `tsc` 與 5 個檔的 ESLint，exit 都是 0。
- 9 個篩選都是單選 Select：都有 `filterOptions`，DataTableColumnHeader:104-107 只會設成字串，選 ALL 時為 `""`。各頁 `searchKey` 都是 `""`，沒有走自由輸入文字框。
- 型別：
  - IAM 頁的資料來自 `iamStore`（UserManagement.tsx:22）。`role` 是 `role_name || 'user'`，後端 user_service.py:166 給 `user.role.name`，和選項的 `r.name` 同源。`status` 是 `'active'`／`'inactive'` 字串。
  - ITP、PQP、FAT 的 vendor／supplier 是後端的 `vendor_ref.name`，和選項的 `c.name` 同源。
  - 沒有布林、數字或物件型別的欄位。
- 反向風險（資料值剛好是選項值的子字串）：
  - PQP 讀取時不會正規化，舊資料可能還是 Rejected、Pending、Draft。但這些都不是任何選項的子字串，舊寫法本來就比對不到，不算退步。ITP 的 Draft、FAT 與 NCR 的狀態也一樣。
  - 改完後被排除的只有原本的錯誤比對：'Approved' 被當成「Approved with comments」、'active' 被當成 inactive、空字串符合每個選項，以及承包商名稱互為子字串的情況。
- 沒有任何地方把這些欄位的篩選值設成陣列。

## FINDINGS
沒有屬於本次 diff 的問題。

## 旁支發現的確認（FAT）
**屬實**：`schemas.FAT.supplier: str`（schemas.py:1739）不接受 None，但沒有 `vendor_ref` 時 `models.FAT.supplier` 是 None（models.py:1027）。以下情況都會讓 vendor_id 變成 NULL：
- create／update 傳入空字串或查不到的名稱，`_resolve_vendor_id` 回傳 None（core/utils.py:456-459）。
- FK 設定 `ondelete="SET NULL"`，承包商被刪時。

`GET /api/fat/` 使用 `response_model=list[schemas.FAT]`，只要有一筆 NULL，整個清單就會回 500。建議另開任務。

## NON-BLOCKING NOTES（都是既有問題）
1. FAT 的 status 為 null 時，表格顯示成 Scheduled（`|| 'Scheduled'`），但選 Scheduled 篩不到這筆。新舊寫法都一樣，因為 model 預設值是 Scheduled，實際發生機率低。
2. PQP 的 Void、ITP 的 Draft 沒有對應的篩選選項。
3. ITP vendor、PQP status、FAT status、IAM role 這 4 欄只讀過程式碼、沒有實測。寫法與已實測的欄位相同，型別也已確認，可以接受。
