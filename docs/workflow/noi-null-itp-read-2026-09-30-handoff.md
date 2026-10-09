# NOI 歷史 ITP 空值造成讀取失敗

## 來源與確認

承接 Claude 在 Q-Workflow 導向驗收中記錄的 NOI 清單失敗。先前 Codex 的 `seed_workflow_pagination_review.py` 未填 `itpNo`，確實造成不完整測資；同時確認讀取契約本身無法處理資料庫允許存在的 NULL。

新增隔離 SQLite／真實 ASGI 路由測試：一筆正常 NOI 加一筆直接植入的歷史 NULL ITP 參照。修正前，清單及單筆 GET 都拋出回應驗證錯誤（兩項失敗）；新建 NULL 的拒絕測試原本即通過。這不代表已在正式資料發現同類異常，也不宣稱正常建立介面會產生它。

## 修正

- 僅於後端讀取 schema `schemas.NOI` 覆寫 `itpNo: str | None`，保留 NULL，不跳過紀錄、不代填、不清洗資料。`NOICreate` 必填字串與更新規則保持原樣。
- 前端 `NOIItem.itpNo` 型別同步允許 NULL；現有表單初始化已使用 `|| ''`，本批未改操作行為。
- 分頁種子脚本填入前置種子已建立的 ITP 編號。另實際在記憶體 DB 執行此腳本，逐筆驗證 201 筆 NOI 符合讀取 schema、201 筆 Q-Workflow 皆存在。

## 本輪驗證

- `test_noi_legacy_itp_read_http.py`（最初 3 項）＋ `test_noi_service.py` ＋ `test_noi_create_atomic_http.py`：28 passed。
- 後續新增的分頁種子測試單獨執行：1 passed。合計 29 個不同測試通過，非一次完整套件結果。
- 前端型別檢查與 production build 通過。未重跑前端單元測試，未做瀏覽器驗收，未跑完整後端套件。
- 沒有操作開發或使用者試用 DB，沒有啟動新伺服器，沒有拆除 8198／3198。未 commit／push／部署，未使用 stash／reset／checkout。

本批不處理 NOI 應否強制 ITP 核准等業務規則，也不擴大調整其他 nullable 欄位。
