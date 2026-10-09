# FORMS-2026-004 證據索引

本目錄的 48 張截圖是 FORMS-2026-005 執行時，從本機暫存目錄
`/private/tmp/claude-501/forms-2026-003-evidence`（FORMS-2026-004 執行當時六支場景腳本寫死的
輸出路徑——沿用了 FORMS-2026-003 當時取的目錄名稱，命名本身是歷史遺留，但這一批檔案的實際內容
是 FORMS-2026-004 這一輪產生的）複製進來的。

## 判定依據

該暫存目錄裡原有 51 個 `.png` 檔案。比對目前（FORMS-2026-004/005）六支場景腳本原始碼裡實際會
輸出的截圖檔名清單，其中 **48 個檔名完全對應**，且這 48 個檔案的修改時間全部落在
`2026-10-03 17:25:57`–`2026-10-03 17:30:03`（本輪 FORMS-2026-004 瀏覽器驗證實際執行的時間窗，
與本輪對話中的操作時間一致）——判定這 48 個屬於本輪，複製進本目錄。

## 無法確認屬於本輪的檔案（未複製，如實標註）

以下 3 個檔案留在原暫存目錄，**未**複製進來，也未改名、未冒充為本輪證據：

- `osd-11-nav-blocked-while-pending.png`（2026-10-03 16:52:45）
- `osd-09-delete-partial-404.png`（2026-10-03 16:57:56）
- `mm-02-clean-save-succeeds.png`（2026-10-03 16:59:56）

這三個檔名不存在於目前任何場景腳本的原始碼中，且時間早於本輪執行窗口約 26–33 分鐘；比對
`docs/workflow/FORMS-2026-003-handoff.md` 的敘述（例如其「Errors and fixes」一節提到 OSD 腳本
曾因場景重新編號而把重複檔名以 `sed` 改成 `osd-11-`/`osd-12-`/`osd-13-`），這些檔名與
FORMS-2026-003 當時（較早）的腳本版本相符，判斷是更早一輪（FORMS-2026-003 或更早）殘留在同一個
暫存目錄裡的舊檔案，而不是 FORMS-2026-004 的證據。**本索引不宣稱 repo 內
`docs/workflow/FORMS-2026-003-evidence/` 的既有封存證據遭到覆寫**——目前查證只支持「本機暫存
輸出目錄被多輪共用、留下舊檔案」，沒有證據顯示 repo 內已封存的 003 證據本身被覆蓋或遺失。

## 檔案與場景對照

| 檔名 | 腳本 | 場景 |
|---|---|---|
| mm-01a-blocked-title-only.png | meetingminutes-subdraft | 1a 行動項目標題未確認阻擋 |
| mm-01b-blocked-assignee-only.png | meetingminutes-subdraft | 1b 行動項目指派人單獨阻擋 |
| mm-01c-blocked-attendee-company-only.png | meetingminutes-subdraft | 1c 與會者公司單獨阻擋 |
| mm-01d-blocked-topic-only.png | meetingminutes-subdraft | 1d 討論主題未確認阻擋 |
| mm-01e-blocked-subitem-owner-only.png | meetingminutes-subdraft | 1e 討論子項目 owner-only 阻擋 |
| mm-01f-blocked-subitem-status-only.png | meetingminutes-subdraft | 1f 討論子項目狀態改離預設阻擋 |
| mm-02-new-meeting-added-then-saved.png | meetingminutes-subdraft | 2（R1）真正新建會議 Add Topic/Sub-item/行動項目草稿後 Save |
| mm-03-added-then-saved.png | meetingminutes-subdraft | 3 既有記錄 addActionItemNow 後主 Save |
| mm-04-explicit-clear-then-saved.png | meetingminutes-subdraft | 4 明確清空草稿後 Save（R1 範圍，FORMS-2026-005 待補 response/重讀） |
| mm-04b-existing-topic-added-then-saved.png | meetingminutes-subdraft | 4b 既有記錄 Add Topic 後 PUT |
| osd-01-no-change-close.png | osd | 1 無變更關閉 |
| osd-04-after-normal-save.png | osd | 3 正常保存後 |
| osd-06-after-retry.png | osd | 4 模擬失敗後重試 |
| osd-07-new-record-partial-failure.png | osd | 5 新記錄附件部分失敗 |
| osd-08-after-partial-retry.png | osd | 5 部分失敗重試後 |
| osd-09-delete-partial-404-then-retried.png | osd | 5b 刪除一成功一 404，同視窗重試後 |
| osd-13-readonly-closed-record.png | osd | 7 唯讀 Closed 記錄 |
| naming-01-no-change-navigate.png | naming-rules | 1 無變更導頁 |
| naming-02-dirty-navigate-prompt.png | naming-rules | 2 有變更導頁提示 |
| naming-03-after-normal-save.png | naming-rules | 3 正常保存後 |
| naming-04-after-reload-reread.png | naming-rules | 3 重新載入重讀 |
| naming-04b-nav-blocked-while-pending.png | naming-rules | 3b 保存中導頁被阻擋 |
| naming-04c-nav-resumed-after-save.png | naming-rules | 3b 保存完成後自動恢復導頁 |
| naming-05-save-failure.png | naming-rules | 4 模擬保存失敗 |
| naming-06-after-retry-reread.png | naming-rules | 4 重試後重讀 |
| naming-07-readonly.png | naming-rules | 唯讀帳號檢查 |
| contractor-01-no-change-close.png | contractor-project | Contractor 1 無變更關閉 |
| contractor-02-dirty-close-prompt.png | contractor-project | Contractor 2 有變更關閉提示 |
| contractor-03-after-normal-save-reopen.png | contractor-project | Contractor 3 正常保存後重開 |
| contractor-04-save-failure-toast.png | contractor-project | Contractor 4 模擬失敗 toast |
| contractor-05-after-retry-reopen.png | contractor-project | Contractor 4 重試後重開 |
| project-01-no-change-close.png | contractor-project | Project 1 無變更關閉 |
| project-02-dirty-close-prompt.png | contractor-project | Project 2 有變更關閉提示 |
| project-03-after-normal-save-reopen.png | contractor-project | Project 3 正常保存後重開 |
| project-04-save-failure-toast.png | contractor-project | Project 4 模擬失敗 toast |
| project-05-after-retry-reopen.png | contractor-project | Project 4 重試後重開 |
| role-00-created.png | role | 建立拋棄式測試角色 |
| role-01-no-change-close.png | role | 1 無變更關閉 |
| role-02-dirty-close-prompt.png | role | 2 有變更關閉提示 |
| role-03-after-normal-save-reopen.png | role | 3 正常保存＋response/重讀 |
| role-04-save-failure-toast.png | role | 4 模擬失敗（逐字 toast 文字） |
| role-05-after-retry-reopen.png | role | 4 重試後重開 |
| role-06-readonly-check.png | role | 5 唯讀帳號檢查 |
| audit-01-blocked-save-draft.png | audit-subdraft | 1 未確認項目阻擋 Save Draft |
| audit-03-cleared-then-saved.png | audit-subdraft | 2 清空草稿後保存 |
| audit-04-added-then-saved.png | audit-subdraft | 3 Add 後保存 |
| audit-05-blocked-existing-item-edit.png | audit-subdraft | 4 既有項目 inline-edit 未確認阻擋 |
| audit-06-inline-edit-cancelled-then-saved.png | audit-subdraft | 4 取消 inline-edit 後保存 |

共 48 筆，對應六支場景腳本（MM/OSD/NamingRules/Contractor+Project/Role/Audit）當時執行時各自
產生的截圖。
