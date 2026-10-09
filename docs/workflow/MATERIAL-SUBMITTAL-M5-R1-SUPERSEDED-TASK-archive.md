# MATERIAL-SUBMITTAL-M5 — TASK（部署準備）

TASK_ID: MATERIAL-SUBMITTAL-M5-2026-001
ROUND: R1
SOURCE: GPT 於 M4 R2 PASS 後交辦，使用者轉交（2026-10-09）。前一批 M4 的 R1-REVISE 與 R2-PASS 控制文件已逐字封存（`MATERIAL-SUBMITTAL-M4-R2-PASS-*-archive.md`），證據保留。
規格：`docs/planning/MATERIAL-SUBMITTAL-V1-SPEC-2026-10-08.md` §3.6、§5 M3/M4/M5（M5 部署方案須單獨列出：具名 migration、啟動失敗的處理、程式回退但保留資料）；r1 §5 批次 M5。
獨立於根目錄 `DEPLOY-EXEC-2026-001` 的 TASK／STATUS／REVIEW（不覆寫）。

## 範圍（只做準備，不部署）
1. Python 3.11 驗證：在乾淨的候選樹上執行後端全套測試。
2. 部署範圍盤點：只納入 M1–M4 已審檔案；逐檔核對與最後一次審查時的雜湊；不混入工作樹中其他未審修改。
3. 資料備份與回退方案：列出 schema 變更、啟動失敗的處理，以及「程式回退、保留資料」的做法；以拋棄式資料庫演練升級與回退。
4. 現場切換方案的框架：具體的 NAS 指令要等正式環境預檢結果出來後才能定案，並另行送審。

## 不在範圍
- 實際部署、切換正式服務、推送或提交。
- 修改產品程式（包括改用 DataTable，那是另一個待辦：`docs/planning/MATERIAL-SUBMITTAL-TABLE-DATATABLE-NOTE-2026-10-09.md`）。
- 重做 M1–M4。
- 文件編號規則頁的分頁問題。

## 限制
- 保留既有部署任務 DEPLOY-EXEC-2026-001（PARTIAL）與其根目錄控制文件；保留使用者預覽 8240／3240。
- 不連 NAS 寫入；不索取或保存正式站密碼；不新增免密 sudo。
- 不使用 stash／reset／checkout；正式站冒煙不得新增業務資料。
