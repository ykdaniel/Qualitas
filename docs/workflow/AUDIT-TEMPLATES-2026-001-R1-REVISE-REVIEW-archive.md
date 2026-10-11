# AUDIT-TEMPLATES-2026-001 — REVIEW

TASK_ID: AUDIT-TEMPLATES-2026-001
ROUND: R1（G.patch 46ec8718…，基準 241cf0ca）

結果：**REVISE**（獨立 Claude 審查，2026-10-11）

## 必改
1. 模板管理面板只隱藏、不卸載，它的 leave guard 會干擾稽核精靈的關閉確認：
   - 精靈關閉時，會把模板面板未存的修改誤報成「這筆稽核尚未儲存」。
   - 按下「離開」後，`release(id, all)` 會 clear() 清掉所有守衛，模板面板的守衛也一起不見；之後離開頁面不會再提示，模板修改就這樣遺失。
   - 修法：從「模板管理」切換到「稽核記錄」時，先經過 requestAction，確認後重設草稿（或者在面板 dirty 時停用切換）。
   - 補一項瀏覽器檢查。
   - 位置：Audit.tsx:289、AuditTemplatesPanel.tsx:48、AuditWizard.tsx:226、LeaveGuard.tsx:30/36。
2. 模板改名後，取消勾選舊名稱的晶片只會移除名稱，帶入的未填項目被留下，不符合使用者的決定第 2 點。
   - 修法：這筆稽核只要有 `templateId` 等於某模板的項目，就把那個模板視為已勾選；取消勾選時，依 id 移除未填項目。
   - 位置：AuditWizard.tsx:274/290。

## 建議
1. 模板尚未載入時停用晶片。
2. 手動新增項目時，id 改用目前最大值 + 1，避免和帶入的項目 id 撞號。
3. `_template_name` 收到非字串時回 500，應改為 422。
4. `_snapshot` 遇到手動改壞的 items 會出錯，比照讀取端寬鬆解析。
5. 不分大小寫比對名稱的競態，只記錄。
6. 「來自模板」小字的全形冒號移進翻譯鍵；這行小字請使用者確認要不要保留。
7. HTTP 測試只證明後端照原樣保存；帶入、去重、取消勾選的邏輯只有瀏覽器腳本覆蓋。
8. `toggleTemplate` 的計算移進 state updater。

## 宣告的偏差
| 偏差 | 判定 |
|---|---|
| 路由放在 `/api/audit/templates` | 可接受 |
| 欄位名稱 `templateItemId` | 可接受 |
| 以名稱判定勾選狀態 | 部分可接受，見必改 2 |
| 「來自模板」小字 | 待使用者確認 |

## 已驗證
- G.patch 套在 HEAD 上，結果和候選樹逐位元組相同。
- CRLF 維持，沒有 mode 變更。
- ISO 條文 20 條，和精靈的內容逐字相同。
- 啟動順序與第 24 步：讀碼確認，並由測試驗證。
- 新權限只同步給 ADMIN。
- i18n：en 和 zh 都齊全。
- pytest：13 passed + 1 skip（候選樹）；6 passed（repo）；迴歸 107 passed。
- tsc 和 eslint 都是 0。
- 必改 1 是讀碼推論，沒有用瀏覽器重現。
