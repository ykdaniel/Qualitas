# MATERIAL-SUBMITTAL-M1 — TASK

TASK_ID: MATERIAL-SUBMITTAL-M1-2026-001
ROUND: R2（補正 M1 審查 REVISE 的 R1–R3：partial index 條件比對、欄位型別驗證、本句文案）
SOURCE: GPT 於材料 V1 規格 r2 PASS 後交辦，使用者轉交（2026-10-08）。核准範圍：只開放 M1 開發。
規格：`docs/planning/MATERIAL-SUBMITTAL-V1-SPEC-2026-10-08.md`（r2 ＋ §9 收尾）；審查：`…-review.md`「r2 獨立審查補註」。
獨立於根目錄 `DEPLOY-EXEC-2026-001` 的 TASK／STATUS／REVIEW（不覆寫）。

## 範圍（M1）
- 新 schema：materials、material_submittals、material_submittal_revisions、material_submittal_result_entries（migration_owned），以及 projects.material_reply_days。
- 具名 migration `_create_material_submittal_schema`（run_migrations 第 21 步），依 §9.1 的唯一索引清單建立並驗證。
- 權限碼：material:view／manage／record_result。
- 材料 API：新增、查詢、修改（無刪除）；projectId 必填；不可見回 404；帶 vendor 範圍的帳號回 403。
- 專案回覆天數：`PUT /api/projects/{id}` 的 `materialReplyDays`。
- 有材料或送審的專案不能刪除（`check_project_references`）。
- 隔離測試；驗收以規格 §9.4 為準。

## 不在範圍
- 送審、版次、結果、附件、更正（M2 之後）；前端（M3、M4）；任何刪除功能；部署。
- 不混入 DOCX 單檔部署；不修改其他模組的範圍行為。

## 限制
- 不碰開發資料庫、8240／3240、8198／3198；不使用 stash／reset／checkout。
- 未經要求不提交、不推送、不部署。
- 更正功能：使用者已確認（`DECISIONS.md`「材料送審：誤登外部結果的更正」），安排於 M2；M1 不實作。
