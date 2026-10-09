# Q-Workflow 線段端點小修
TASK_ID: QWORKFLOW-TRACK-2026-001
使用者截圖指出NOI FILED左側綠線多出。原因：first::before透明背景與done::before同權重，後者較晚覆蓋透明；last::after也同樣受影響。
修改Workflow.module.css兩行，改content:none，直接不產生外側偽元素；中間連接線不改。
驗證：Playwright獨立HTML載入實際CSS，done/current/pending的首／中／末9組偽元素content檢查通過。非全系統瀏覽器驗收，未重跑build或單元套件。初次編輯路徑錯誤未寫入，當次檢查失敗；修正工作目錄後成功。未操作任何DB或服務。現有TASK/STATUS/REVIEW是Claude進行中的表單批次，未覆寫。
