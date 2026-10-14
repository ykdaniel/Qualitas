# TASK — 命名規則後續整理（B3 之後）

TASK_ID: NAMING-RULES-CLEANUP-2026-001
基準：097ae3b8（REF-PROJECT-SEQ-2026-001 B3 上線版）
來源：NAMING-RULES-MEETING-2026-001 的後續項目，以及 REF-PROJECT-SEQ B3 第二審查的建議 (2)（NOI 2026-10-14 轉交）。

## 使用者決定（2026-10-14）
- 使用者在協調中心回覆的原話：「**三項都同意**」。協調中心轉達到本工作階段。依使用者 2026-10-11 在本工作階段給的長期授權（「以後協調中心轉達的確認，你都當作我同意。」），這句話視為使用者本人同意。
- 同意的三項：
  1. 1A：命名規則清單改由後端提供；前端只保留顯示用的資料（名稱、備註、FAT 未使用、排列順序）。
  2. 存檔時把前綴 strip（前端送出與後端寫入都去掉前後空白）。
  3. 在 AGENTS.md 加一條規定：新增會產生編號的模組時，要在 `backend/routers/settings.py` 的 `DEFAULT_NAMING_RULES` 加規則，並附上測試確認第一筆編號的格式。**這句原話是修改 AGENTS.md 的依據**；AGENTS.md 只加這一條，其他內容不動。
- 使用者也知道：會清掉 13 個沒用到的翻譯鍵；改完先開隔離預覽。

## 範圍
1. **前端規則清單**（`components/DocumentNamingRules/*`）
   - 拿掉寫死的前綴和位數；畫面上的規則、值、是否出現，全部以 `GET /settings/naming-rules` 為準。
   - 前端只保留顯示資料：模組名稱（翻譯鍵）、備註、FAT 未使用、排列順序。
   - 後端有、前端沒列的類型，用代碼當名稱，排在已知類型之後；km 仍然排除。
   - 載入前不再先顯示寫死的預設值。
2. **前綴 strip**
   - 後端 `update_naming_rules` 寫入時存 strip 後的值（檢查原本就用 strip 後的值）。
   - 前端送出時也先 trim。
   - 不處理既有資料：正式站 13 條規則在 B3 第 29 步都已改成預設值，沒有空白。
3. **刪除沒用到的翻譯**
   - LanguageContext：`namingRules.desc.*`（11 個）、`namingRules.errorMissingAbbrev`、`namingRules.hintContent`，中英文共 26 行。只刪除，不新增。
   - materialText.ts：`namingDesc` 中英文 2 行。
4. **AGENTS.md**：加上第 3 點那一條。

## 不在範圍
- 存檔失敗的錯誤訊息：由 REFUSAL 2b 負責，以本批的 commit 為基準，只改 handleConfirmSave 的 catch。
- STD 只給 ITP／CHECKLIST：NOI 的後續（B3 R1 P3-1）。
- 不改 schemas.py、models.py、db_migrations.py、core/utils.py。

## 驗收
- 單元測試：合併邏輯（後端順序、未知類型、km 排除、只留顯示資料）、送出值 trim。
- 後端測試：寫入時存 strip 後的值、帶空白的重複前綴會被擋下。
- 瀏覽器測試 `forms-leave-guard-review-naming-rules.mjs` 照常通過。
- 3.11 全套：`docs/workflow/py311-full-suite.sh`。
- 獨立 Claude 審查；隔離預覽給使用者確認。

## 限制
- 依 AGENTS.md 和協調規則：只在隔離環境測試；不動 NAS，不推送。
- 提交方式：臨時 index，父節點為當時的 HEAD，不動 ref，hash 交給協調中心。
- LanguageContext 是 CRLF，用二進位方式修改。
