# CHECKLIST-TEMPLATE-CLEAN-2026-001 — TASK（BACKLOG #22 收尾）

TASK_ID: CHECKLIST-TEMPLATE-CLEAN-2026-001 · ROUND: R1
SOURCE: 使用者 2026-10-10「做 #22」。查核後發現 #22 的核心規則（後端拒絕在空白範本寫入結果）已於 §17 hardening（a02807b2）完成並在正式站；剩下的事項由使用者在對話中決定：
1. 正式站兩份留著舊結果的空白範本（QTS-RKS-HL-CHK-000001「Stakeout」、QTS-RKS-RKS-CHK-000006「TESTTTT」，皆 status Pass）→ **清掉舊結果，留作範本**。
2. 連結範本產生檢查單時，檢驗日期、簽名、NCR 編號、複檢日期等每次檢驗不同的頁首欄位 → **重設**。
3. 複檢的新檢查單是否必須連結同一範本 → **不限制，維持現狀**（不改程式）。

## 範圍
- `services/checklist_service.py`：新增 `blank_inspection_detail_data`（保留項目結構與說明欄位；清除逐項結果／觀察、簽名、檢驗與複檢日期、NCR、合格勾選、計數；移除 ITR／NOI／編號參照）。
- `services/itr_service.py` `link_checklist`：`detail_data` 改用上述 helper（**待「ITR模組檢查」工作階段提交其 itr_service.py 修改後再改**，避免混入對方審查範圍）。
- `db_migrations.py` 第 23 步：一次性（migration_flags）清理「帶結果的空白範本」——狀態 Ongoing、計數 0、itrNumber NULL、detail_data 經 helper；每筆寫稽核；不刪任何資料、不碰已連結的檢查單與乾淨範本。
- 測試：`tests/test_checklist_template_cleanup.py`（helper、只清該清的、只跑一次、失敗不留半套）；link_checklist 的回歸測試。
- DECISIONS 記錄三項決定；BACKLOG #22 更新狀態。

## 範圍追加（2026-10-11，隔離環境驗證中發現；同一條規則）
- `db_seeder.py`：預設種子範本「Stakeout 放樣」原以 status Pass、2024 檢驗日期建立（正式站 CHK-000001 的來源），且種子在 migration 之後執行，新資料庫的第 23 步清不到它 → 改為乾淨範本（Ongoing、無檢驗日期）。
- `link_checklist`：新檢查單的 `date` 欄位不再照抄範本（ITR 卡片與檢查單編輯畫面把它當檢驗日期）→ 空字串。
- 使用者要求「先在 Claude 建立隔離的系統確認變更」：隔離環境 8330／3330＋瀏覽器驗證、正式資料庫複本演練。

## 限制
- 不改前端；不刪資料；正式站資料只透過 migration 改動（部署後啟動時執行），部署前做資料庫一致性備份。
- 不提交、推送、部署，除非使用者指示。
