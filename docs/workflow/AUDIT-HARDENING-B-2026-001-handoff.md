# AUDIT-HARDENING-B-2026-001 — 交 GPT 獨立審查（R1）

請以獨立審查者身分審查 `AUDIT-HARDENING-B-2026-001` R1，結論寫入 `docs/workflow/AUDIT-HARDENING-B-2026-001-REVIEW.md`（PASS／REVISE／HUMAN_REQUIRED）。

**請讀：**
- 同目錄的 `-TASK.md`、`-STATUS.md`
- 證據目錄 `-evidence/`
- **審查用差異：`AUDIT-HARDENING-B-2026-001-evidence/B.patch`**（SHA-256 `90ba94c7…3636`）

**與 A 批的關係：**
- B 批疊在 A 批（`AUDIT-HARDENING-A-2026-001`，後端，也在等審查）之上。工作樹同時包含兩批變更，請不要直接用工作樹的 `git diff`。
- A 批若 REVISE 而修改 `audit_service.py`，B 的後端補丁可能要重新產生。

**範圍（使用者已在對話中選定做法，見 TASK）：**
- #1 存草稿後回填 Audit No。
- #2 切換專案時重新載入清單。
- #8 沒有更新權限時唯讀，刪除需要刪除權限。
- #9 狀態下拉依工作流程限制、加入 Void；Void 唯讀，前後端都鎖。
- #10 第 5 步搜尋框按 Enter 不送出。
- #11 專案下拉改為選專案 id，新增時預設帶入目前專案，舊紀錄依名稱對應。
- 順手處理：刪除按鈕不再同時打開該列；刪除失敗有錯誤處理。

**請特別判斷：**
- 舊紀錄依名稱自動補上 `project_id`（下次存檔時生效）是否可接受。
- 前端狀態轉換表是後端 `WorkflowEngine` 的手動鏡像（比照 ITP 既有做法）。
- 只有 audit 權限的帳號看不到承包商清單：這是發現但未修的問題。
- 完整後端測試沒有重跑，Python 3.11 未測。

未提交、推送或部署。
