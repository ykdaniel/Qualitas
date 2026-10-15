# REFUSAL-DIALOG-2026-002 — STATUS

TASK_ID: REFUSAL-DIALOG-2026-002

## 2026-10-14 盤點
- 唯讀盤點（基準 09f6a688，用 git archive 匯出，未改任何 checkout），見 DESIGN 第 2 節。
- 使用者選定 D1／D2／D3（DESIGN 第 4 節）。

## 2026-10-14 2a 前端（第一段，未提交）
- 排序：協調中心排序並轉達使用者確認，2a 先改 B3 不碰的前端（DESIGN 6.1）。
- 工作目錄：detached worktree `scratchpad/rd2a`，基準 09f6a688。主 checkout 沒動。
  - `react-app/node_modules` 是指向主 checkout 的符號連結，只讀取，不納入提交。
- 實際修改：24 個檔加上 1 個新測試檔，清單見 `REFUSAL-DIALOG-2026-002-evidence/2a-diffstat.txt`，內容見 DESIGN 6.2。
- 備份：sidecar patch 存在 `evidence/2a-frontend-wip.patch`，供 B3 之後三方合併使用。
- CRLF：
  - ChecklistSnapshotModal、AuditWizard、auditStore、itrStore、pqpStore 都以二進位模式修改，已確認仍全為 CRLF。
  - itrStore 一度被文字模式改成 LF，已從 HEAD 還原後重做。

### 實測（2a-*.txt）
- `tsc --noEmit`：exit 0。
- `npm test`：204 項，203 項通過。
  - 失敗 1 項是 `refusalSave.test.ts` 的「新翻譯鍵存在於兩種語言」：LanguageContext 要等 B3 之後才加鍵（DESIGN 6.3），這是預期中的失敗。
- `npm run lint`：40 problems（10 errors、30 warnings）。
  - 改過的檔逐一和 HEAD 比較，數量都沒有增加；ITRModals 一度多出 `no-useless-catch`，已修正。
  - 這 40 個在 09f6a688 就已經存在（各檔數量和 HEAD 相同）。

### 依設計改變的斷言（不是放寬）
- `saveFlow.test.ts`：
  - 寫入失敗的 outcome 多了 `error`，現在同時比對它是原本那個 error（`assert.equal`）。
  - `presentOutcome` 的 failed：從「error 小提示」改為 `{ close: false, refusal: { error } }`，並斷言沒有 notice。

### 第一段當時未做的項目
都已在第二段完成，見下方。

## 2026-10-14 2a 第二段（基準 097ae3b8，未提交）
- **工作目錄**：detached worktree `scratchpad/rd2a2`。第一段的 patch 用 `git apply --3way` 套上，沒有衝突。
- **前端**：
  - LanguageContext 新增鍵：3 個共用鍵、6 個代碼共 14 條、Audit 日期 4 條（dateField.date／end_date、dateIssue.start_after_end，中英文）。
  - 改 NOI、ITP（含 itpStore／noiStore）；refusal.ts 加變體。
  - dateIssues.ts 加 `start_after_end`。這個檔不在原本核准的清單上，只改一個詞，見下方預覽發現；協調中心已於 2026-10-14 追認。
  - RefusalDialog.module.css 補條列符號。
- **後端**：6 個共用代碼與 12 個 router 的對應，見 DESIGN 7.3。
- **CRLF**：所有 CRLF 檔都保留（審查者逐檔比對）。

### 實測
- tsc：exit 0。
- npm test：210/210。
- 後端新測試 `tests/test_refusal_dialog_2026_002_http.py`：18 passed（本機 3.14，拋棄式 DATABASE_URL）。
- 本機 3.14 跑相關後端測試：2803 passed、3 skipped（後端程式凍結後跑）。
- **3.11 全套**：
  - 第一次跑：Docker 掛不到 /private/tmp，pip 失敗，一個測試都沒跑，**作廢**。
  - 第二次跑：複製到 Docker 掛得到的目錄 `epic-franklin-b7c5b5/.suite-tree-rd2a2`（內容 hash 記在 2a-suite-tree-hash.txt）。跑的期間預覽發現了 Audit 422 標籤的問題，前端因此又改過，所以**這次也要重跑**。
  - 最終這次要等使用者決定 (a)／(b) 後，在凍結的 tree 上重跑。

### 審查
- R1：PASS WITH NOTES；R2：PASS。見 REVIEW。
- R2 之後的修改（Audit 日期標籤、dateIssues、條列符號、選項 (a)）已送 R3，結果見下方「凍結」一節。

### 預覽（隔離環境 8374／3374，rd2_reviewer 已登入）
- 實測（rd2_reviewer，中英文介面）：
  - PQP 已核准：RECORD_LOCKED.publish。
  - 會議記錄 Published→Draft：INVALID_TRANSITION。
  - ITR 版本衝突：沒有「內容已保留」提示行。
  - Audit Void→Draft：彈窗出現，精靈紅框已移除，Esc 只關彈窗。
  - Audit 422：「結束日期：早於開始日期」。
  - ITR 未連結 Checklist 就 Publish：通用句加英文原文。
  - PQP 新增後直接按 Publish：紅字「請先儲存再發布」。
  - 以上都只跳出一個彈窗、視窗不關、內容保留、頁面頂部沒有橫幅。
- 用 API 實測：
  - rd2_noproject 建立紀錄 → SCOPE_FORBIDDEN（noWorkingProject）。
  - rd2_inspector 核准 ITR → 403，沒有代碼。
- **預覽發現**：Audit 422 原本顯示「end_date：有問題」，因為欄位名稱和問題代碼都沒有翻譯。已補翻譯，並加一項單元測試。
- 給使用者的試用清單：`REFUSAL-DIALOG-2026-002-PREVIEW-CHECKLIST.md`。

### 使用者決定（2026-10-14，由協調中心轉達）：選 (a)
- 紀錄已鎖定（RECORD_LOCKED，任何 kind）時，提示行只寫「您填寫的內容都已保留。」（新鍵 `refusal.keptInputOnly`），不提示修正後再存。
- 其他拒絕不變：一般 4xx 仍是「修正後再按儲存即可」；5xx／網路仍是「無法確認是否已儲存」；404 和 VERSION_CONFLICT 不顯示提示行。
- 預覽實測（PQP 已核准）：顯示「您填寫的內容都已保留。」。
- 加 1 項單元測試，並在真實字典的測試中加一項斷言。npm test 211/211。

### 凍結（2026-10-14T14:25Z）
- 內容 hash：rd2a2 與複製出來的 `.suite-tree-rd2a2` 都是 0ffba3ce…（`2a-final-suite-tree-hash.txt`）。
- 最終證據：
  - `2a-final-tsc.txt`：exit 0。
  - `2a-final-npm-test.txt`：211/211。
  - `2a-final-lint-per-file.txt`：每個改過的檔，問題數都 ≤ HEAD。
  - `2a-final-lint-summary.txt`：全專案 40 個，是既有的。
- **3.11 全套最終一次（2026-10-14 14:25–15:25Z）**：`2a-py311-full-suite-final.txt`。2789 passed、17 skipped，**pytest_exit=0**，pip_exit=0。執行完後內容 hash 仍是 0ffba3ce…，凍結之後沒有任何修改。
- 之前那次（2789 passed、17 skipped、pytest_exit=0）跑的是 Audit 標籤修正前的 tree，已改名為 `2a-py311-full-suite-superseded-pre-audit-labels.txt`，僅供參考。
- R3：PASS WITH NOTES，只有 P3。P3-1、P3-2 留給 2b；P3-3 在提交時排除，預覽結束後刪除。

### 合併到 9da76d9f（NAMING-RULES-CLEANUP 提交後的分支 HEAD；2026-10-14）
- 依協調中心指示，把凍結的 rd2a2 修改（65 個檔）用 `git apply --3way` 套到 9da76d9f，放在 detached worktree `scratchpad/rd2a3`。**沒有衝突**。
- LanguageContext 的修改和 NAMING 刪掉的 13×2 個鍵在不同行，兩邊都保留；CRLF 3609/3609。
- tsc：exit 0。npm test：212/212（NAMING 多加了 1 項）。見 `2a-merge-9da76d9f-check.txt`。
- 3.11 全套由協調中心在合併後的候選版重跑。
- 提交會從 rd2a3 用臨時 GIT_INDEX_FILE 建立，父節點是 9da76d9f，等使用者確認預覽之後才做。

### 待辦
- 清單 H 項（停掉後端測 5xx）：協調中心指示先不做，等使用者看完其他項目、確認之後再說。
