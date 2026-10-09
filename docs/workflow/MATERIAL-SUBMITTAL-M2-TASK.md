# MATERIAL-SUBMITTAL-M2 — TASK

TASK_ID: MATERIAL-SUBMITTAL-M2-2026-001
SOURCE: GPT 於 M1 R2 PASS 後交辦，使用者轉交（2026-10-08）。前一批：`MATERIAL-SUBMITTAL-M1-R2-PASS-*-archive.md`。
規格：`docs/planning/MATERIAL-SUBMITTAL-V1-SPEC-2026-10-08.md`（r2 ＋ §9；§3.5／§7 的更正規則已確認）。決策：`DECISIONS.md` 各條「材料送審：…」。
獨立於根目錄 `DEPLOY-EXEC-2026-001` 的 TASK／STATUS／REVIEW（不覆寫）。

## 範圍（M2，後端）
- 送審：建立（選本專案材料，或就地新增最少資料）、列表（卡片欄位，projectId 必填，回傳 total）、詳細（全部版次與全部登錄）。
- 版次：草稿快照編輯、送交（回覆日依專案日曆天數自動計算，可覆寫；天數未設定時必填）、建立新版次（同號、同一張卡）。
- 外部結果：四種；決定者與登錄人分開記錄；只追加的登錄表；依規則推導現行核准版。
- 誤登更正（已確認）：有 record_result 權限者可更正最新版；原因必填；原登錄保留；有後續版次時禁止。
- 版次附件：entity `material_rev`；依分類區分權限；三種狀態的鎖；上傳與刪除在寫入前取得鎖並重新判斷。
- 權限、專案範圍、帶 vendor 範圍的帳號一律拒絕（含附件端點）、父子歸屬、交易與併發保護、稽核。
- 編號規則 `MSA`（後端預設規則與 self-heal 對照表）。

## 不在範圍
- 前端（M3、M4；含 DocumentNamingRules 前端清單）、刪除功能、內部審批、撤回登錄、撤銷外部核准、提醒、部署。
- 不新增未確認的政策（例如回覆日期先後的限制、附件必填）。

## 限制
- 不碰開發資料庫、8240／3240、8198／3198；不使用 stash／reset／checkout；未經要求不提交、推送、部署。
- 不混入 DOCX 單檔部署。Python 3.11 驗證在部署前（M5）完成。
