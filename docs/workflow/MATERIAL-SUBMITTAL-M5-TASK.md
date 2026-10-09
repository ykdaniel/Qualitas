# MATERIAL-SUBMITTAL-M5 — TASK（R2：依 M6 最終版重做部署準備並上線）

TASK_ID: MATERIAL-SUBMITTAL-M5-2026-001
ROUND: R2。R1 控制文件與 deploy-plan 已逐字封存為 `MATERIAL-SUBMITTAL-M5-R1-SUPERSEDED-*-archive.md`（R1 依舊版 M6 範圍，已過時）。
SOURCE: 使用者 2026-10-09 於對話中：「可以部署了」，並在 Claude 說明風險後選擇「先做 M5 必要步驟再部署」（見 M6 REVIEW「使用者決定」）。M6 R2 未經獨立審查。

## 範圍
1. 部署範圍：正式站基準（056c245c，待預檢確認）＋**只有材料相關**檔案。DOCX 單檔部署（DEPLOY-EXEC）不併入；ITP 前端 7 檔已上線，前端候選須包含以免倒退。
2. Python 3.11 全套（repo 目錄結構），候選樹。
3. 演練腳本改為登錄簿 API／2 個權限／第 22 步；在拋棄式資料庫與**正式資料庫的複本**上演練升級、重啟、只回退程式、再升級。
4. 前端候選建置（基準＋overlay）。
5. 正式站：唯讀預檢 → 資料庫一致性備份 → 上傳後端 → 使用者以 sudo 重建後端 → 驗證啟動 → 切換前端 → 對外核對。需要 sudo 的步驟由使用者在自己的終端機執行，Claude 不取得密碼。

## 限制
- 不混入未審或非材料修改；不推送；未經要求不提交。保留 8240／3240、8198／3198 與隔離環境 8310／3310。
- 正式站冒煙不新增業務資料。檢查失敗即停止並回報。
- 取得正式資料庫複本只用於本機演練；存放於 `~/Documents/Qualitas-deploy-artifacts/MATERIAL-SUBMITTAL-M5/`（700），不提交、不外傳。
