# REFUSAL-DIALOG-2026-003 — REVIEW（2b）

TASK_ID: REFUSAL-DIALOG-2026-003
審查者：獨立 Claude 審查代理，不是實作者本身（GPT 暫停中）。唯讀審查 `scratchpad/rd2b`（基準 124f6c14）。

## 2b-1 R1 — PASS WITH NOTES（沒有 P1）
- **P2-1（ITR）**：用狀態下拉選單改成 Approved 或 Void 再按「儲存」，如果還有待上傳的檔案，會停在一個永遠不會成功的重試。→ 使用者 2026-10-17 選 (a)，在 handleSave 加上檢查（R2 已確認）。
- **P3-1**：名稱重複的比對會把 projects.name 的 NOT NULL 錯誤誤判成重複。→ 已修，只認 UNIQUE 衝突。
- **P3-2**：fat.py 有沒用到的 import（已修）；lock_reason 已經沒有人用（留給 2b-2）。
- **P3-3**：IAM 建立帳號後範圍沒存好時，英文出現全形冒號，也沒說帳號已建立。→ 已修，新增鍵 `iam.scope.createdButScopeFailed`。
- **P3-4**：KM 匯入成功的提示，換行被吃掉。→ 已修，改用 pre-line。
- **P3-5**：部分完成的提示，原因仍是英文。→ 原設計如此，不改。
- **P3-6**：測試缺口。→ 已補：NOI_CONTRACTOR_LOCKED、NCR_CLOSE_NOT_VERIFIED／NEEDS_OWNER_APPROVAL、km update、fat create。
- **P3-7**：關閉 2FA 時輸錯密碼沒有提示，本批之前就存在。→ 記入 BACKLOG #58。
- **P3-8**：命名規則的 tests-browser 腳本。→ 留給 2b-2。
- **審查者確認**：
  - 英文 detail 逐字不變；只有原本回 500 的承包商名稱、專案名稱、角色改名三處是新寫的英文句。
  - router 補上的 except 順序正確，沒有代碼的錯誤回應和原本相同。
  - `Coded` 類別的 MRO 與狀態碼不變。
  - 名稱重複的處理都有 rollback。
  - 上傳 409 的英文原文不變。
  - keepsInput 與部分完成的處理正確；store 讀取 error 的地方不受影響。
  - ITR 的流程與 Q1 檢查正確。
  - 中英文翻譯鍵一致；24 個 CRLF 檔都保留；沒有放寬任何斷言。
- **審查者的執行結果**：tsc 0；npm test 217/217；22 個後端檔 805 passed（3.14）。

## 2b-1 R2 — PASS
- 確認 P2-1 的檢查正確：
  - 新 ITR 已存、但檔案未完成時，同樣會擋下。
  - 已經是 Approved 或 Void 的紀錄，和維持 In Progress／Reject 的存檔，都不受影響。
  - 只改了 handleSave。
- 確認 P3-1／2／3／4／6 正確。
- 確認 NOI_CONTRACTOR_LOCKED 改用 references 後：英文 detail 不變，`references` 由前端翻譯後條列。
- CRLF：LanguageContext 3659/3659，以及 noi、user、contractor、project 的 service 與 fat.py，都仍是 CRLF。
- tsc 0；npm test 217/217；後端 6 個檔 110 passed（3.14）。

## 2b-2
待審。
