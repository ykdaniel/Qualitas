# MATERIAL-SUBMITTAL-M5 — handoff（部署準備 R1，待獨立審查）

**一句話**：材料功能的部署準備已完成，**沒有部署**：
- 部署範圍確定為 056c245c 加上已審 overlay（後端 24 檔、前端 24 檔），48 檔都對得上審查時的雜湊，沒有混入其他未審修改；
- 前端候選已建構並通過檢查；
- 已在拋棄式資料庫上用 Python 3.11 演練升級 → 只回退程式 → 再升級，全部 PASS；
- 備份、啟動失敗的處理與回退分級都寫在方案裡；
- Python 3.11 後端全套的結果見 STATUS。

具體的 NAS 指令要等 DEPLOY-EXEC 預檢 r3 的結果，之後另行送審。

## 審查請看
- `MATERIAL-SUBMITTAL-M5-deploy-plan.md`（主文件）
- `MATERIAL-SUBMITTAL-M5-STATUS.md`
- `backend/scripts/verification/m5_upgrade_rollback_rehearsal.py`（只用於驗證）
- 證據 `MATERIAL-SUBMITTAL-M5-evidence/`：
  - `reviewed-hash-reconciliation.txt`
  - `upgrade-rollback-rehearsal.txt`
  - `frontend-candidate-checks.txt`
  - `frontend-candidate-dist-sha256.txt`
  - `py311-backend-full-suite.txt`

## 請審查者特別看
1. §2 的範圍判定，以及 `projectStore.ts` 換行改變的處理（照審查通過的版本部署）。
2. §6：migration 不保證是單一交易。這一點的描述，以及「先換回舊映像、不自動刪除物件」的處理是否足夠。
3. §7 的 L1／L2 分界，以及前後端必須一起回退。
4. 演練的比較方式：只以舊欄位比較，並明列預期會變化的表；這樣是否足以證明「沒有動到既有資料」。

## 證據界線
- 演練使用拋棄式資料庫，不是正式資料的副本。
- 正式環境狀態未知，要等預檢 r3。
- 不推送、不部署，正式服務不切換。
