# MATERIAL-SUBMITTAL-M6 — handoff（R1，待獨立審查）

**一句話**：材料模組依使用者在對話中逐項確認的決定（DECISIONS「材料：只作為核准材料登錄簿」及其補充），改為**核准材料登錄簿**：
- 舊送審 API 移除路由；權限只留查看與維護；
- 登錄與修改表單與其他模組一致，有重複提示，刪照片前確認；
- 唯讀的材料視窗（左邊照片、右邊資料）與單筆列印；
- 清單匯出 Excel；儀表板卡片；
- 網址為 `/materials`，名稱為「材料／Material」；
- 清除不再使用的程式。

不需要新的 migration。前端檢查的退出碼都是 0（139 tests）；後端 291＋51 passed；Chrome 實測。

另有一個**事件**：開發資料庫曾被誤寫，已經使用者同意還原（見 STATUS）。

## 審查請看
- `DECISIONS.md` 中的登錄簿決策與補充
- `MATERIAL-SUBMITTAL-M6-TASK.md`（兩次範圍調整）、`-STATUS.md`
- 後端：`routers/material_submittals.py`、`services/material_submittal_service.py`、`schemas.py`、`core/perms.py`、`core/attachment_access.py`、`routers/file_router.py`
- 測試：`test_material_submittals_http.py`（改寫）、`test_attachment_authorization_http.py`、`test_materials_http.py`
- 前端：`MaterialSubmittal.tsx`、`RegisterDialog.tsx`、`ApprovedMaterialModal.tsx`、`Photos.tsx`、`MaterialPrintTemplate.tsx`、`Material.print.css`、`Dashboard/MaterialStatsTile.tsx`、`Dashboard.tsx`、`App.tsx`、`AppLayout.tsx`
- 證據：`MATERIAL-SUBMITTAL-M6-evidence/`（請以 FINAL ROUND 一節為準）

## 請審查者特別看
1. 舊路由移除後的路由清單，以及「舊路由回 404／405 且不寫入」的測試。
2. 修改結果欄位時，以 "Register edit" 追加更正紀錄，是否足夠。
3. 照片不受狀態鎖定；其他證據仍然鎖定。
4. `/api/materials` 主檔 API 仍可新增與修改，是否應該一併關閉。
5. 儀表板卡片的範圍：選「所有專案」時，逐一加總可見專案的統計。
