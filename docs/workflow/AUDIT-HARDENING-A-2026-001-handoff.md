# AUDIT-HARDENING-A-2026-001 — 交 GPT 獨立審查（R1）

請以獨立審查者身分審查 `AUDIT-HARDENING-A-2026-001` R1，結論寫入 `docs/workflow/AUDIT-HARDENING-A-2026-001-REVIEW.md`（PASS／REVISE／HUMAN_REQUIRED）。

**請讀：**
- `docs/workflow/AUDIT-HARDENING-A-2026-001-TASK.md`
- `docs/workflow/AUDIT-HARDENING-A-2026-001-STATUS.md`
- `docs/workflow/AUDIT-HARDENING-A-2026-001-evidence/`
- **審查用差異：`AUDIT-HARDENING-A-2026-001-evidence/A-backend.patch`**（SHA-256 `9d39a318…4b91`，含新測試檔），各檔最終雜湊見 `A-final-file-sha256.txt`。
- 不要直接用工作樹的 `git diff`：之後的 B 批（`AUDIT-HARDENING-B-2026-001`）會在同幾個檔案上繼續修改（例如後端加 Void 鎖），工作樹會同時包含兩批的變更。

根目錄 TASK／STATUS／REVIEW 是另一個任務（DEPLOY-EXEC-2026-001），不在本輪範圍。

**範圍：** 內部稽核 Audit 模組，只改後端 6 項（回報清單 #3、#4、#5、#6、#7、#12）：
1. 建立時禁止 Closed／Void／未知狀態。
2. 更新時忽略 auditNo。
3. 改用 strict_dates：date 不可 NULL、`''` 仍允許，開始日不可晚於結束日；讀取 schema 不再驗證日期。
4. 先取寫入鎖再取號，並加入 `_DOC_TYPE_TABLES`。
5. 不採用用戶端 id；`IntegrityError` 回 409、日期錯誤回 422、其他錯誤回 400；明確 rollback。
6. Closed 鎖比較 JSON 欄位，NULL 與 `''`／`[]` 視為相同；沒有實質變更就不寫入。

**請特別判斷：**
- 建立時允許的狀態：Claude 選擇「有後續轉換的狀態」（Draft、Planned、In Progress、Completed），沒有選「只允許 Draft／Planned」，理由見 TASK。
- 「Closed 紀錄沒有實質變更時不寫入、不產生 UPDATE 稽核紀錄」這項行為變化。
- 完整測試（2381 passed）跑的是最後一次修改 Closed 鎖之前的版本。最終版本只重跑了 24 個相關測試檔（1109 passed）。
- Python 3.11 尚未測試，部署前要補。

未提交、推送或部署。
