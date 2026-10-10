# AUDIT-HARDENING-B-2026-001 — STATUS（R1，待獨立審查）

TASK_ID: AUDIT-HARDENING-B-2026-001
ROUND: R1。工作樹的基準是 HEAD `52986ac2` 加上 A 批（等待審查，`AUDIT-HARDENING-A-2026-001-evidence/A-backend.patch`）。本輪差異另存為 `B.patch`，只包含 B 批的變更。根目錄控制文件、開發資料庫、8240／3240、8198／3198 都沒有動。
**未提交、推送或部署。不自填 PASS。**

## RESULT
- [x] DONE（交 R1 獨立審查）

## 修改檔案
| 檔案 | 內容 |
|---|---|
| `react-app/src/components/Audit/AuditWizard.tsx` | 加入狀態轉換對照（比照 ITPModals.tsx 的 `ITP_STATUS_TRANSITIONS`）、可建立的狀態、鎖定的狀態、狀態標籤。Audit No 移出 formData 改用獨立 state，存草稿後回填（不放 formData，避免離開提醒誤判有未存變更）。`savedStatus` 決定狀態選項與鎖定。專案下拉改選 id，新增時預設目前專案，舊紀錄依名稱對應。payload 送 `project_id`。唯讀時兩個存檔函式直接返回。第 5 步搜尋框擋 Enter。 |
| `react-app/src/components/Audit/Audit.tsx` | 依 `currentProject` 重新抓清單；既有紀錄 `readOnly = !hasPermission('audit:update:all')`（Closed／Void 的鎖由精靈自己依狀態判斷）；刪除欄位傳入 `audit:delete:all`；刪除確認加 try/catch/finally。 |
| `react-app/src/components/Audit/columns.tsx` | `canDeletePermission` 參數；沒有權限時停用並顯示 `audit.deleteNoPermissionHint`；`stopPropagation`；狀態篩選加 Void。 |
| `react-app/src/store/auditStore.ts` | `AuditItem` 加 `project_id`。 |
| `react-app/src/context/LanguageContext.tsx` | 新增 `audit.deleteNoPermissionHint`（中、英）。 |
| `backend/services/audit_service.py` | `_LOCKED_STATUSES`（由工作流程推導：沒有下一步的狀態，即 Closed／Void），`update_audit` 的鎖改用它，錯誤訊息改為 closed or void。 |
| `backend/tests/test_audit_void_lock_http.py`（新） | 5 項：Void 之後任何變更都是 400 且不寫入、精靈形狀的原樣重送不寫入、Void 仍可刪除、未鎖定的紀錄仍可編輯、`project_id` 在建立與更新時都會存並影響清單篩選。 |
| `backend/scripts/verification/seed_audit_hardening_b_review.py`（新）、`react-app/tests-browser/audit-hardening-b-vite-launcher.mjs`（新） | 隔離環境用的種子資料與 Vite 啟動檔（3320 → 8320）。 |

CRLF 檔案（AuditWizard.tsx、columns.tsx、auditStore.ts、LanguageContext.tsx、audit_service.py）維持 CRLF；diff 只顯示實際改動的行。

## 證據（`AUDIT-HARDENING-B-2026-001-evidence/`）
- `B.patch`（SHA-256 `90ba94c7…3636`）：本輪完整差異。後端部分是「A 批最終狀態 → 現在」：先把 `A-backend.patch` 套到 HEAD 還原 A 批狀態，雜湊與 `A-final-file-sha256.txt` 相同後才做 diff。
- `browser-acceptance.txt` 與兩張截圖：隔離環境實測，3 個帳號、15 項，全部 PASS（逐項見檔案）。
- `backend-tests.txt`：Void 鎖、A 批 hardening、service、scope 矩陣、date write guard，共 **231 passed**，exit 0。
- `frontend-checks.txt`：`tsc` exit 0；單元測試 **144/144**；eslint 只有 1 個 HEAD 既有的警告（`Audit.tsx` 的 `FINISHED_STATUSES`，該行未動）；`vite build` 成功（輸出到暫存目錄，沒有動專案的 dist）。

## 行為變化（審查請注意）
- 有 `audit:view` 但沒有 `audit:update` 的人，以前打開紀錄可以編輯（存檔時被後端 403），現在直接唯讀。
- 有 `audit:create` 沒有 `audit:delete` 的人，刪除按鈕停用並提示沒有權限。
- 舊紀錄若只有 `project_name`、且名稱對得上某個專案：畫面顯示該專案，**任何人下次存檔都會補上 `project_id`**，紀錄因此出現在該專案的篩選清單。名稱對不上的維持原樣（下拉顯示「請選擇」，`project_name` 不變）。
- 編輯既有紀錄時改專案會送出新的 `project_id`；受專案範圍限制的帳號移到範圍外會被後端拒絕（`enforce_update_scope`，沿用既有規則）。
- 新紀錄只能從 Draft／Planned／In Progress／Completed 開始；既有紀錄只能選工作流程允許的下一步。

## 發現、未修
- **只有 audit 權限的帳號看不到承包商清單**：`/api/contractors/` 需要 `contractors:view:all`（實測 403）。精靈的承包商下拉是空的，所以這種帳號建立的 Audit 沒有承包商，編號前綴變成 `NA`。這是權限設計問題，不是本批造成；要不要讓 Audit 精靈改用不需要該權限的承包商清單，需要使用者決定。
- 受多個專案限制的帳號在「全部專案」下新增、又沒選專案時，後端回 403，精靈只顯示通用的存檔失敗（沒有在瀏覽器實測；精靈內錯誤訊息屬 C 批）。

## 未做／限制
- 完整後端測試沒有重跑（B 批後端只改 `update_audit` 的鎖定條件，已由上述 231 項涵蓋）。
- Python 3.11 未測（Colima 沒在跑），部署前必須補。
- 本輪的瀏覽器操作需要綁定本機埠，沙箱不允許（EPERM），所以起停隔離環境、灌種子資料的指令是在沙箱外執行；只用了暫存目錄與 3320／8320。
