# 停用帳號新指派限制 — Claude 接手紀錄

2026-09-28，Codex 實作。政策依使用者本輪確認：禁止新指派給停用帳號；保留歷史與無關編輯；不自動轉派。

## 範圍與規則

本輪保護真正對應 IAM User 外鍵的兩個負責人欄位：
- NCR `assignedTo`
- FollowUp `assignedToUserId`

建立或改成不同 id：必須是存在、啟用的使用者，否則400，訊息不區分不存在與停用。驗證在取號／寫入前執行。更新先確認原紀錄可見；範圍外仍404。
欄位未送出、原 id 重送：不重新要求原負責人啟用。清空維持既有允許行為，不新增強制轉派。
有權限者改派給啟用帳號沿用既有 UPDATE 稽核；沒有改稽核交易設計。

前端兩個負責人選單只提供啟用帳號；原負責人若停用仍顯示並標示「已停用 / Inactive」，該選項 disabled。讀不到使用者清單或原帳號不在清單中時，保留原 id 的顯示選項，不清空、不猜測其狀態。

## 檔案

- 新增 `backend/core/assignees.py`：共用新指派驗證。
- `backend/services/ncr_service.py`：create/update 呼叫；保留既有所有其他修改。
- `backend/services/followup_service.py`：create/update 呼叫；bulk 呼叫 create，因此也套用。
- `react-app/src/components/NCR/NCRModals.tsx`
- `react-app/src/components/FollowUpIssue/FollowUpIssue.tsx`
- 新增 `backend/tests/test_active_assignee_http.py`：真實登入、路由、暫存SQLite，透過新Session比對所有資料表。
- 新增隔離種子 `backend/scripts/verification/seed_active_assignee_review.py`
- 新增瀏覽器 `react-app/tests-browser/active-assignee-review.mjs`

ITR 的 Raise NCR 另有直接建模路徑，讀碼確認該路徑不設定 assignedTo，也不接受此欄位；本輪未修改它。

## 驗證

- 新增HTTP測試11項：建立拒絕停用／不存在、歷史停用後無關編輯及原值重送、改派／清空、拒絕時全表內容不變、FollowUp bulk 單筆拒絕、範圍與基本權限仍生效。
- 瀏覽器12個實際斷言通過：兩模組各驗證歷史停用標示／原選擇保留／不可新選停用者／其他停用者不列出／啟用者可選／新建沒有停用選項。
- 前端91項單元測試、tsc與build通過；build寫入 /tmp/qualitas-assignee-build。
- 首次後端執行因本機缺 httpx 無法收集測試；在 /tmp/qualitas-assignee-venv 建立 system-site-packages 暫存環境，依 requirements-dev 安裝 httpx>=0.27,<0.28，沒有改專案依賴檔。
- 後端相關回歸最終結果見本檔末尾；不宣稱完整後端驗收。

## 後續範圍／限制

- OBS 簽核人及 NCR/OSD 等自由文字姓名、datalist 建議不是 User 外鍵；不以相同姓名猜身分。本輪沒有禁止自由文字輸入，也沒有變更其業務政策。不要宣稱「所有人員欄位都已修」。
- 沒有修改 IAM 使用者管理清單；管理員仍可查看停用帳號。
- FollowUp bulk 既有逐筆提交，前面成功、後面拒絕可能部分完成；本輪沒有改成整批原子交易，測試只驗證停用指派的那筆被拒絕。
- 未驗證帳號停用與指派提交同時發生的競爭條件；檢查的是本次查詢看到的啟用狀態。
- 本輪瀏覽器未完整走 NCR 結案、FollowUp所有儲存失敗情境；後端HTTP涵蓋此次保存規則。
- 原有跨模組 getUsers 權限不足問題仍是獨立待辦。

## 重跑

後端（repo 根目錄）：
```sh
PYTHONPATH=backend DATABASE_URL='sqlite:///:memory:' SMTP_HOST='' SMTP_USER='' SMTP_PASSWORD='' /tmp/qualitas-assignee-venv/bin/python -m pytest backend/tests/test_active_assignee_http.py backend/tests/test_ncr_service.py backend/tests/test_followup_service.py backend/tests/test_ncr_field_improvements.py backend/tests/test_ncr_close_permission_http.py backend/tests/test_scheduler.py backend/tests/test_scheduler_active_recipients.py -q
```

瀏覽器使用前一批 `project-create-vite.mjs`（3198/8198），透過 isolated_stack.py up 建立暫存DB，seed本輪 seed_active_assignee_review.py，再把stack JSON傳給 active-assignee-review.mjs。密碼從隔離工具的 INITIAL_ADMIN_PASSWORD / admin-password 讀取，沒有固定密碼。完成後 down。

不要 stash/reset/checkout，也不要把共有檔案所有未提交 diff 當成本輪修改。未 commit/push/部署。

最終相關後端回歸：**100 passed，1633 warnings，43.67秒**。未跑全後端套件。
