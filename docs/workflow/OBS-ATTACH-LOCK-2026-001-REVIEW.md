# OBS-ATTACH-LOCK-2026-001 REVIEW

TASK_ID: OBS-ATTACH-LOCK-2026-001
審查者：獨立 Claude 審查代理（本工作階段開出，唯讀）。範圍：`git diff 15612688`＋本批文件。

## R1 結論：PASS with notes

| 等級 | 項目 | 處理 |
|---|---|---|
| High | 前端先寫紀錄再上傳（`saveFlow.ts:68／83／97`），OBSModals 結案檢查又把待上傳的照片算進去（`OBSModals.tsx:217-261`）。在同一次存檔中結案或作廢並增刪檔案，紀錄先變成 Closed／Void，之後的檔案步驟全部 409，重試也不會成功，結案佐證被繞過。原本的類別鎖下，兩種照片就已經有這個問題；本批讓一般附件和 Void 也會發生 | 主工作階段已讀碼確認。**使用者 2026-10-13 選方案 (a)**（比照 NCR：有待上傳／待刪除的檔案時不能同一次結案或作廢，請先存檔上傳）；協調中心也依常設授權選 (a)。由 OBS-PRINT-PHOTOS 實作，列為本批的**上線前置條件**（TASK） |
| Medium | OBS-PRINT 隱藏上傳／刪除之前，approver 仍看得到已結案 OBS 的上傳控制項，上傳一般附件會得到 409 | 上線順序維持 OBS-PRINT → OBS-ATTACH-LOCK |
| Low 1 | 上傳的 409 沒有帶 `ATTACHMENT_LOCKED` 代碼（只有刪除有），各類型都一樣 | 既有情況，屬 REFUSAL-DIALOG 第 2 批 |
| Low 2 | 沒有測試釘住 OBS 的 code 與 params | **已補**：`test_attachment_of_a_closed_or_void_obs_is_locked` |
| Low 3 | 歷史不明類別的刪除測試原本用 OBS 驗證類別鎖的 deny-by-default，現在走整筆鎖，該路徑失去覆蓋；註解也過時 | **已補**：改成 ncr（類別鎖）／obs（整筆鎖）兩組參數 |

審查者已驗證：
- `obs_locked` 和約定的文字逐字相同。
- 檢查順序正確：先 `NEVER_LOCKED_CATEGORIES`，再 OBS 分支。
- 兩個上傳路徑和一個刪除路徑都經過 `lock_reason`／`lock_refusal`。
- 後端沒有其他地方依賴被移除的規則。
- 決策文件、測試與程式一致。
- 實際執行：437 passed（兩個附件測試檔）、14 passed（`-k` 子集）。

審查者未驗證：瀏覽器端對端、前端單元測試、OBS-PRINT 那一批。
