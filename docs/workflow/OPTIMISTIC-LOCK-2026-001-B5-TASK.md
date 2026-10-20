# OPTIMISTIC-LOCK-2026-001 B5 TASK（版本必填）

- **基準**：378e6cf1（正式站，B4＋KM-DOCS D2＋#65）。工作樹 scratchpad/ol-b5。
- **授權**：使用者 2026-10-20 經「主要調度」轉述：「B5 八點照建議，觀察期 3 天由 GPT 看 log」。檔案清單由主要調度核准（同日）。
- **獨佔**：itr_service.py、ITRModals、LanguageContext、refusal.test.ts 在 B5 提交前由本批獨佔。itr_service.py 只動 update_itr、重新檢驗的 detail_data 初值、revoke 的註解；不動 link_checklist 和複檢的其他段落。schemas.py:687 未用欄位這次不動。

## 範圍
- **後端**：
  - core/config.py：`ROW_VERSION_REQUIRED`（環境變數，預設 false）
  - core/concurrency.py：開關開啟時，沒帶版本就丟 `VERSION_REQUIRED`；`exempt` 參數；`bump_row_version` 走豁免
  - core/refusals.py：VERSION_REQUIRED 固定 400
  - services/itr_service.py、routers/itr.py：拿掉舊 `_version` 檢查並保留剝除；批次更新豁免
  - services/km_service.py：Word 匯入豁免
- **前端**：
  - LanguageContext.tsx（CRLF）：中英翻譯
  - utils/refusal.ts：`correctable()` 排除 VERSION_REQUIRED
  - utils/rowVersion.ts：只改說明
  - 刪除 context/ContractorsContext.tsx、context/IAMContext.tsx（沒有任何 import）
- **測試**：
  - conftest.py：預設關閉開關
  - test_optimistic_lock_http.py：開關開啟的專門測試，以及舊 `_version` 的改寫
  - test_refusal_dialog_2026_002_http.py、test_itr_approval_events_http.py：`_version` 斷言改用 row_version
  - tests-unit/refusal.test.ts、rowVersion.test.ts
- **文件**：DECISIONS（第 1～3 點、新增第 6 點）、DESIGN、BACKLOG（#64、1102 行的舊註記）、B4 STATUS 上線紀錄

## 陷阱（R1 必須檢查）
- `itr_service.py` `update_itr` 裡的 `incoming_detail.pop("_version", None)` **必須保留**。
- 前端存檔會送回整份 detail_data，裡面含 `_version`。
- 已核准 ITR 的保護只接受「剝掉 `_version` 後是空的」detail_data；拿掉這一步，每次存已核准的 ITR 都會被擋。
- 要有 HTTP 測試證明：已核准的 ITR 帶 `{"_version": n}` 發行，開關開或關都成功；夾帶其他內容仍被擋。

## 完成條件
- tsc、npm、eslint、CRLF。
- 3.11 全套（開關關閉）。
- 開關開啟的專門測試全部通過。
- 獨立審查 R1，並檢查陷阱。
- 隔離預覽：開關開啟，各模組照常存檔不會被擋；不帶版本送出時看到「請重新整理」。
- 使用者確認後，用臨時 index 本地提交，交 hash 給主要調度。
- 上線時開關保持關閉；GPT 觀察 log 3 天為零後才在 NAS 打開（見 STATUS「上線後要做的事」）。
