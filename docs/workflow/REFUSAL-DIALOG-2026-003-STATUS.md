# REFUSAL-DIALOG-2026-003 — STATUS（2b）

TASK_ID: REFUSAL-DIALOG-2026-003

## 2026-10-17 盤點與排序
- 基準 124f6c14。detached worktree `scratchpad/rd2b`：sandbox 不讓寫入 .git/worktrees，所以建立時在 sandbox 外執行。
- 前後端唯讀盤點完成，檔案清單經協調中心「主要調度」核准，拆成 2b-1／2b-2（DESIGN 第 1 節）。

## 2b-1（實作中，未提交）
- 修改內容見 DESIGN 第 2–4 節。
- **依設計改變的斷言（不是放寬）**：`tests/test_ref_project_seq_b3_http.py` 的 `test_losing_a_race_for_the_same_code_is_the_same_coded_400_not_a_500`。
  - 原本斷言 projects.name 的 IntegrityError 會原樣傳出 `_code_clash`。
  - 現在 projects.name 的衝突改回 400 `DUPLICATE_NAME`（原本會變成 500，是本批要修的缺陷），所以改成斷言它變成 DUPLICATE_NAME（含英文句和 params），並用 projects.id 的衝突確認「其他錯誤仍原樣傳出」。
- **BACKLOG**：新增 #54–#57，是協調中心指示寫入的四項「不做」。
- **DECISIONS**：「存檔被拒與失敗的彈跳視窗」條目，包含 ITR Q1 (a) 與 Checklist 結果已鎖定的提示行。

### 實測（R1 前，指紋 cf27177c599565cc）
- tsc：exit 0。npm test：217/217。
- 後端新測試 29/29。本機 3.14 相關既有測試：1582 passed（`2b1-local-related-suites.txt`）。

### 審查 R1：PASS WITH NOTES（沒有 P1）
- **P2-1（ITR）**：用狀態下拉選單選 Approved 或 Void 再按「儲存」，如果還有待上傳的檔案，會停在一個永遠不會成功的重試。建議在 handleSave 也加上 Q1 的檢查。這屬於 ITR 前端修改，已送協調中心轉給使用者確認，等回覆。
- **已修**：
  - P3-1：名稱重複只認 UNIQUE 衝突，不再把 NOT NULL 誤判成重複（專案、承包商、角色都收緊），並補了測試。
  - P3-2：fat.py 移除沒用到的 import。
  - P3-3：建立帳號後範圍沒有存好時，改用新鍵 `iam.scope.createdButScopeFailed` 說明帳號已建立，原因放在第二行。
  - P3-4：KM 匯入成功的提示保留換行。
  - P3-6：補 HTTP 與服務層測試：NOI_CONTRACTOR_LOCKED、NCR_CLOSE_NOT_VERIFIED、NCR_CLOSE_NEEDS_OWNER_APPROVAL、km update、fat create。
- **一併改**：NOI_CONTRACTOR_LOCKED 的 params 從英文的「1 ITR(s)」改成 `references:[{type,count}]`，和 DELETE_REFERENCED 相同，彈窗會用使用者的語言條列。
- **BACKLOG #58**：P3-7，關閉 2FA 時輸錯密碼沒有提示，是本批之前就存在的問題。
- **留給 2b-2**：P3-2 的 lock_reason 死碼、P3-8 命名規則的手動腳本。
- **不改**：P3-5（部分完成的提示原因仍是英文，原設計就是如此）。

### P2-1（使用者 2026-10-17 選 (a)）
- ITRModals 的 handleSave：狀態改成 Approved 或 Void，而且還有待處理的檔案時，先擋下並顯示 `itr.statusChangeNeedsSaveFirst`（中英文新鍵）。
- 已記入 DECISIONS 第 6 點，並寫好 PREVIEW-CHECKLIST 的草稿（ITR-1、ITR-2）。

### 審查 R2：PASS（見 REVIEW）
