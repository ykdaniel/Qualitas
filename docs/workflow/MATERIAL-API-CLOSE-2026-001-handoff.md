# MATERIAL-API-CLOSE-2026-001 — handoff（R1，待獨立審查）

依使用者選定的方案 A，`/api/materials` 移除新增與修改，只留查詢；材料主檔只由核准材料登錄簿寫入。後端 3 檔＋2 個測試，無 migration、無前端。測試：本機 311 passed、Python 3.11 44 passed。請看 STATUS 的修改表與 `test_material_api_is_read_only`。
