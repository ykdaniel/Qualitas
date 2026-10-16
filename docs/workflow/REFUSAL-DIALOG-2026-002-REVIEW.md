# REFUSAL-DIALOG-2026-002 — REVIEW（2a）

TASK_ID: REFUSAL-DIALOG-2026-002（2a）
審查者：獨立 Claude 審查代理（不是實作者本身）。唯讀審查 detached worktree `rd2a2`（基準 097ae3b8）的 `git diff HEAD` 與新增檔案。

## R1 — PASS WITH NOTES（沒有 P1）
- **P2**：保留內容的提示行和訊息互相矛盾。VERSION_CONFLICT 或 404 時，訊息要使用者「重新載入」，提示行卻說「修正後再按儲存」。**已修**：`refusal.ts` 新增 `correctable()`，這兩種情況不加提示行，並補了測試。
- **P3-1**：頁面在送出前自己判定失敗（沒有 error）時，提示行顯示「無法確認是否已儲存」。實際上幾乎不會發生，**不修**。
- **P3-2**：「只上傳照片」和「重試檔案」的按鈕不是「儲存」，提示行仍寫「按儲存」，只是用詞問題，**不修**。
- **P3-3**：PQP 發行一開始就清掉「部分附件未完成」的提醒。**已修**：發行時不再清掉。
- **P3-4**：tests-browser 裡 3 支手動腳本還在描述舊的小提示。**留給 2b**。
- **P3-5**：REFERENCE_NOT_FOUND 的中文寫「編號」，但值有時是 UUID 或設備名稱。可以接受，**不修**。
- **審查者確認**：
  - 前端：
    - 各存檔路徑：失敗時視窗不關、只顯示一次彈窗、成功時不出現彈窗。
    - 部分成功沒有被當成被拒。
    - keepsInput 的使用範圍符合 DESIGN。
    - store 拿掉 try/catch 後語意不變，`error` 的讀取者不受影響。
  - 後端：
    - router 的修改純屬機械替換。
    - 英文 detail 逐字相同。
    - ScopeForbidden 不是 ValueError，仍然回 403。
    - params 可以轉成 JSON。
  - 翻譯：中英文的 refusal.* 鍵各 91 個，佔位符和後端參數一致。
  - CRLF 全部保留。沒有放寬任何斷言。沒有改到範圍外的東西。
- **審查者的執行結果**：
  - tsc：exit 0。
  - npm test：208/208。
  - 本機 3.14 跑相關後端測試：246 passed。
- **審查者未驗證**：3.11 全套、瀏覽器 UI、真正的 5xx 與網路錯誤。

## R2 — PASS
- 只審 P2 與 P3-3 的修正：都正確、沒有回歸，R1 之後後端沒有任何修改。
- 仍會顯示提示行的情況：SCOPE_FORBIDDEN、PERMISSION_DENIED、400、409（無代碼）、422 顯示「修正後再按儲存」；5xx、網路錯誤顯示「無法確認是否已儲存」。
- tsc：exit 0。npm test：209/209。

## R3 — PASS WITH NOTES（沒有 P1、P2）
**範圍**：只審 R2 之後的修改，包括：
- 預覽發現的 Audit 422 標籤：dateField.date／end_date、dateIssue.start_after_end，以及 dateIssues.ts。
- 條列符號。
- 使用者選的 (a)：RECORD_LOCKED 改用 `refusal.keptInputOnly`。

**確認**
- Audit 的 422：audit_service 沒有傳 client_fields，所以錯誤一定落在 end_date，「結束日期：早於開始日期」永遠正確。
- 提示行的判斷順序正確：404／VERSION_CONFLICT 不顯示 → 5xx 顯示「無法確認」→ RECORD_LOCKED 只顯示「已保留」→ 其餘顯示「修正後再按儲存」。
- CRLF：LanguageContext 3635/3635 行。
- 中英文鍵集合相同：refusal.* 各 92 個、dateField.* 各 14 個、dateIssue.* 各 16 個。
- R2 之後後端沒有任何修改。
- tsc：exit 0。npm test：211/211。

**P3（都不在 2a 修，程式已凍結，3.11 全套就是跑這個 tree）**
- **P3-1**：`dateField.date` 是全域標籤，譯成「開始日期」。Checklist 的 `date`、Audit agenda 列的 `date` 欄位如果出現 422，也會顯示「開始日期」。這種情況很少見，意思只差一點。建議改成通用的「日期／Date」，Audit 那一行不受影響。**留給 2b**。
- **P3-2**：refusal.ts 裡「404／VERSION_CONFLICT 不顯示提示行」那段說明，現在放在 `codeOf` 上方，應該移到 `correctable` 上方。**留給 2b**。
- **P3-3**：預覽用的 `react-app/.rd2-vite-launcher.mjs`、`react-app/.vite-rd2a2/` 不在 gitignore 裡。**處理方式**：用臨時 GIT_INDEX_FILE 提交時明確排除，預覽結束後刪除。

## 結論
R1 PASS WITH NOTES → R2 PASS → R3 PASS WITH NOTES（只有 P3）。凍結的 tree（內容 hash 0ffba3ce…）上的 3.11 全套結果見 STATUS。
