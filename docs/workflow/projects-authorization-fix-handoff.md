# Projects 管理授權修正 — 交接紀錄

2026-09-28，Claude Code 實作並執行以下驗證。未 commit/push/部署。

延續 [稽核五路徑修正報告](audit-five-path-repair.md) 的「Project 角色名稱授權」發現——當時只核對、提出方案 A/B/C，未擅自實作；本輪依使用者明確指示採用**方案 A**。

## 核對現況（重現依據）

`routers/projects.py::_require_admin`（修正前）：
```python
def _require_admin(current_user=Depends(get_current_user)):
    role_name = getattr(getattr(current_user, "role", None), "name", None) or getattr(current_user, "role_name", None)
    if role_name not in ("admin", "Admin", "ADMIN", "system_admin"):
        raise HTTPException(status_code=403, detail="Admin role required")
    return current_user
```
直接比對角色**名稱**字串，完全不經過 IAM 權限碼系統（`RoleChecker`）。三個寫入端點（`POST`/`PUT`/`DELETE /projects/`）都用這個依賴把關。

**確認影響**（讀碼＋既有測試證據，本輪未另外起停一次隔離後端重現——已有 `test_itp_checklist_km_project_audit_http.py` 修正前版本的 `test_project_write_needs_the_admin_role_name_not_a_permission_code` 通過紀錄，明確釘住這個舊行為；`seed_shared_admin_review.py`／`shared-admin-review.mjs` 也已有 2026-09-24 針對這個舊行為的既有測試資產）：
- 前端 `Contractors.tsx`（Projects 唯一管理入口）「新增 Project」按鈕的判斷是 `hasPermission('contractors:manage:all')`——跟後端檢查的完全是兩件事。
- 持有 `contractors:manage:all`、角色名稱不是那四個字串的使用者：畫面看得到按鈕、填完表單送出會被 403，訊息跟他實際權限無關。
- 角色名稱剛好是 `Admin`（或大小寫變體／`system_admin`）但沒有任何權限碼的使用者：仍可寫入 Projects。

## 最小修正

`routers/projects.py`：移除 `_require_admin`，三個寫入端點改用 `Depends(RoleChecker(CONTRACTOR_MANAGE))`——`CONTRACTOR_MANAGE`（`contractors:manage:all`）是既有權限碼，`routers/contractors.py` 自己的 create/update/delete 早就在用同一個；未新增任何權限碼，未修改 `db_seeder.py` 或任何角色的權限配置。`user_id`/`username` 改傳 `current_user.id`/`current_user.username`（原本 `_admin.id`/`_admin.username`，變數名稱跟著改，行為相同）。

讀取端點（`GET /projects/`、`GET /projects/{id}`）、資料範圍過濾、`services/project_service.py` 內的稽核與引用刪除保護（`validators.check_project_references`）完全未觸碰。

## 更新既有測試（反映政策已更正，非配合測試放寬權限）

- `backend/tests/test_itp_checklist_km_project_audit_http.py`：舊版明確測試並釘住「角色名稱門檻」這個現在已知是缺陷的行為（`test_project_write_needs_the_admin_role_name_not_a_permission_code`、`project` 案例走專屬的 `admin_client`）。已改為：測試角色 `AuditWriter2` 直接授予 `contractors:manage:all`（既有、非新增的權限碼，且正是這次修正實際要求的權限——不是為了規避測試而多給的無關權限），所有案例（含 `project`）統一走同一個持有權限的 client；新增兩項測試取代舊的：
  - `test_project_write_uses_contractors_manage_permission_not_role_name`：把 `AuditWriter2` 的角色名稱**改成**一個完全不像管理員的字串，確認建立 Project 仍然成功——證明角色改名不影響資格。
  - `test_project_write_rejected_for_an_admin_named_role_without_the_permission`：另建一個角色名稱字面就是 `Admin`、但零權限碼的帳號，確認建立 Project 被拒（403），資料與稽核不變。
  - `test_permission_refusal_changes_nothing` 的 `project` 案例從「另外處理」併回主要參數化清單（現在跟其他模組同一套權限撤銷測試）。
- `backend/scripts/verification/seed_shared_admin_review.py` / `react-app/tests-browser/shared-admin-review.mjs`：既有的 `fake_admin_perms`（角色名 "NotAdmin"，持有權限）與 `real_admin_role`（角色名 "Admin"，零權限）兩個帳號**完全沒有改動**，只更新測試對這兩個帳號的**預期結果**（原本預期前者被拒、後者放行；現在反過來）。新增兩筆 Project 種子資料（一筆有 ITP 引用、一筆無引用）用於驗證引用刪除保護與一般刪除路徑。

## 已執行驗證

- 後端相關測試：`test_itp_checklist_km_project_audit_http.py` 重跑，**34 passed**。
- 隔離環境真實登入、真實畫面、真實 API、真實資料庫（`shared-admin-review.mjs`，含本次新增與既有共用的 Document Naming Rules／Contractors／KPI 三段一併跑過，均無回歸）：
  1. 角色名稱非 Admin、持有 `contractors:manage:all`（`fake_admin_perms`）：建立 Project 成功（200），資料庫確實新增，稽核紀錄的操作者正確記為該帳號本人。
  2. 角色名稱為 `Admin`、零權限（`real_admin_role`）：建立 Project 被拒（403，訊息為 `Operation not permitted. Required: contractors:manage:all`），資料庫無新增。
  3. 未帶任何登入憑證的請求：401，無新增。
  4. 持有權限的帳號更新既有 Project：成功，資料庫反映修改。
  5. 引用刪除保護：持有權限的帳號嘗試刪除一筆被真實 ITP 引用的 Project，仍被擋下（回應為既有的 500 + 說明文字，這個狀態碼是修正前就存在的既有行為，與本次授權修正無關，未變動）；該 Project 確認仍存在。
  6. 同一帳號刪除一筆無引用的 Project：成功，資料庫確認已刪除。
  7. 前端入口一致性：`fake_admin_perms` 看得到「Add Project」按鈕，`real_admin_role` 看不到——與後端要求的權限碼一致（此按鈕的判斷式本來就沒有改，是後端追上了前端既有的假設）。

角色改名測試（`test_project_write_uses_contractors_manage_permission_not_role_name`）在後端 pytest 完成，未在隔離瀏覽器重複驗證同一件事。

## 重跑方式

後端：
```sh
cd backend
DATABASE_URL="sqlite:////tmp/whatever.db" .venv_fix/bin/python -m pytest tests/test_itp_checklist_km_project_audit_http.py -q
```

隔離瀏覽器（從 backend/ 目錄）：
```sh
python scripts/verification/isolated_stack.py up --vite-script <既有的 vite_multi.mjs> > stack.json
python scripts/verification/isolated_stack.py seed --root <root> --script scripts/verification/seed_shared_admin_review.py
node ../react-app/tests-browser/shared-admin-review.mjs stack.json
python scripts/verification/isolated_stack.py down --root <root>
```

## 未驗證／範圍外（如實記錄）

- 未重跑完整後端套件（本輪只動了 `routers/projects.py` 一個檔案，相關測試已覆蓋）。
- 前端未修改任何程式碼——`Contractors.tsx` 的按鈕判斷式本來就是對的，本輪只是讓後端追上；因此沒有 `tsc`/單元測試/build 需要重跑。
- Edit（點列開啟）與刪除圖示（垃圾桶）在 Projects／Contractors 分頁目前都是**無條件顯示**，靠後端擋（跟 Contractors 分頁自己是同一套既有設計，本輪未變動、未擴大範圍去加前端層級的唯讀/隱藏邏輯）。
- 方案 B（新增 `projects:manage:all` 專屬權限）與方案 C（角色名稱判斷統一）維持未實作，如 `audit-five-path-repair.md` 原文所述，若未來要分開授權「管承包商」與「管 Projects」再議。

## Claude 接手時注意

- 工作區存在其他協作者尚未提交的修改（多專案選擇、停用帳號新指派、排程提醒收件人、ITP 狀態選單、ITP 主資料/明細保存措辭）；本輪未 stash/reset/checkout，未動這些檔案。
- 本輪未 commit、push 或部署。
