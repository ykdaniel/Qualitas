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

- **2b-1 本地 commit**：247ee771（父 124f6c14，63 個檔，tree c6bbf50a）。分支 ref 不動，等使用者看完預覽。

## 2b-2（以 247ee771 為父；已提交 a411072d）
- 修改內容見 DESIGN 第 5 節。
- tsc：0。npm test：217/217。改過的前端檔，lint 問題數都 ≤ 2b-1 commit；OBS 和會議記錄各 1 個 set-state-in-effect 是既有的。

### 2b-2 驗證
- **凍結**：2026-10-17T09:15Z，指紋 52b01f19e66e66f5。預覽期間 react-app 底下多了 `.rd3-vite-launcher.mjs` 和 `.vite-rd2b/`；排除這兩項後指紋相同，它們不提交，預覽結束後已刪除。
- **3.11 全套**：`evidence/2b2-py311-full-suite.txt`，2026-10-17 09:20–10:23Z，跑在凍結的 rd2b（HEAD 124f6c14 加 2b-1、2b-2 的工作區修改）。結果 2825 passed、17 skipped，pytest_exit=0、pip_exit=0。
  - 09:15Z 那次因為 colima 沒有執行，一個測試都沒跑，已改名為 `2b2-py311-full-suite-void-colima-down.txt`，作廢。
- **審查**：R1 PASS WITH NOTES（見 REVIEW）。
- **預覽**：localhost:3375／8375。使用者 2026-10-17 晚上確認「2b 預覽（3375）可以」（協調中心轉達）。預覽已經關閉。
- **2b-1 commit**：247ee771 定案，不重建。

## 上線與結案（2026-10-17）
- **2b-2 本地 commit**：a411072d（父 247ee771，25 個檔，tree b905dfbf，指紋 52b01f19e66e66f5，和 3.11 跑的 tree 相同）。
- **上線**：2026-10-17 15:52Z（台灣 23:52），由協調中心部署，和 ITP-VP-CODES 同一次重建。
  - 正式站＝分支 HEAD **1b37ce9d**：a411072d 之上重放 ITP 的 3 個 commit。
  - 協調中心回報：啟動 0 ERROR；前端 bundle index-c5DPYlfw.js 含新代碼；合併後的 tree 跑 3.11 全套 2829 passed。
  - 未做登入後的功能測試。
- **R1 P3-2**（提示行加 `data-refusal-note`）：記入 BACKLOG #60（NOI 用了 #59）。
- **工作目錄清理**：rd2b worktree 已經移除，preview 的埠也都已關閉。
- **本任務（REFUSAL-DIALOG-2026-003，第 2 批 2b）結案。**
