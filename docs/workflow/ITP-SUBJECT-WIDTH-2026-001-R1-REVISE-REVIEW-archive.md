# REVIEW.md — 獨立審查

TASK_ID: ITP-SUBJECT-WIDTH-2026-001
審查日期：2026-10-07

## EVIDENCE_CHECK
已核對 TASK、產品 git diff 與 browser-results.md。Subject 沿用同一 input/value/onChange，只調整位置與 span；保存與 Cancel 的執行者紀錄可接受，本審查未重跑。1366/1920 新增與編輯的排列已有記錄。1024 的新空格是執行者實測發現，不是推測。

## SCOPE_CHECK
加寬方向符合要求；但 TASK SCOPE 3 要求其他欄位合理補位，避免無意義空欄。兩欄桌面版面新增 Version 旁空格仍待補齊。1024 視窗不等同手機，不以手機延期排除這項本批引入的問題。

## DECISIONS_CHECK
此為版面實作選擇，不需使用者業務決策。維持單行 Subject、既有保存及其他欄位規則。

## VERDICT
- [ ] PASS
- [x] REVISE
- [ ] HUMAN_REQUIRED

## REQUIRED_FIXES
R1：僅在 ITP 基本資料目前兩欄的 breakpoint，讓 Version 占滿最後一列，消除孤立半列空格。三欄仍維持 Updated Date / Due Date / Version；Subject 維持整列。用 ITP 限定樣式或明確 opt-in class，不修改共用 formGrid 或波及其他模組。
驗證 1024 桌面視窗的新增及編輯（Version 全列、Subject 全列、無溢出）；1366 做一次三欄版面快速回歸。保存邏輯未改則不重跑已接受的保存/Cancel 或整套單元測試。相關檢查結果據實列示。

## NEXT_STEP
逐字封存本輪 TASK/STATUS/REVIEW，再開補正輪，只處理 R1。可沿用核對身分後的 8280/3280；使用者 8240/3240、8198/3198 不動。手機仍延期，不提交推送部署。不擴大至其他 UI 改善。
