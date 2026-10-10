# TASK.md — 部署範圍盤點（只準備，不部署）

TASK_ID: DEPLOY-SCOPE-INVENTORY-2026-001
SOURCE: GPT 於 `NOI-ITR-DESKTOP-REVIEW-2026-001` PASS 後交辦，使用者轉交（2026-10-07）。

## 前一任務狀態
- `NOI-ITR-DESKTOP-REVIEW-2026-001`：PASS；三項文案已依 REVIEW 收尾，TASK／STATUS／REVIEW 已逐字封存（`docs/workflow/NOI-ITR-DESKTOP-REVIEW-2026-001-*-archive.md`）。三項 NOI 建議**不實作**。

## SCOPE（本機唯讀盤點＋文件）
1. 承接既有 DOCX 部署交接 v3（`docs/workflow/DOCX-PATH-GUARD-2026-001-deploy-handoff.md`），不重寫已接受方案。
2. 列出已 PASS 的 ITP 改善、依賴檔案與目前版本。
3. 核對這些檔案是否混有未審修改；前端 build 打包整個來源，不能只憑幾個檔案 PASS 就宣稱整包可部署。
4. 明列可納入、須排除、尚未查明的變更；提出可審查的建置來源方案；正式站版本未核對標未知。

## FORBIDDEN
操作遠端（NAS、正式站）；提交、推送、部署；修改產品程式；動用保留環境（8240／3240、8198／3198）；stash／reset／checkout。

## ACCEPTANCE_CRITERIA
- 盤點文件可獨立審查：每個結論標明實測（本機）／推定／未知。
- 回報部署準備還缺哪些具體條件。REVIEW.md 待獨立審查。

## 使用者授權更新（2026-10-07）
使用者已選定每批 PASS 且準備完成後提交、推送及部署，詳見 DECISIONS.md。原文保留作歷史範圍紀錄；後續部署不再需要重複詢問授權。當前 REVIEW 的 R1–R3 仍须補正，未完成前不執行切換；部署執行另立可追溯任務，先完成必要唯讀預檢，不混入未審內容。
