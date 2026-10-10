# TASK.md — 部署執行（核定範圍）

TASK_ID: DEPLOY-EXEC-2026-001
SOURCE: GPT 於 `DEPLOY-SCOPE-INVENTORY-2026-001` R2 PASS 後交辦，使用者轉交（2026-10-07）。部署授權：使用者已在對話中直接確認（每批 PASS 且準備完成即提交、推送、部署，含遠端唯讀預檢），亦記於 `DECISIONS.md`。

## 前一任務
`DEPLOY-SCOPE-INVENTORY-2026-001`：R2 PASS，收尾後封存為 `docs/workflow/DEPLOY-SCOPE-INVENTORY-2026-001-R2-PASS-*-archive.md`。

## 核定範圍
- 前端：已保全候選包 `~/Documents/Qualitas-deploy-artifacts/DEPLOY-SCOPE-INVENTORY-2026-001/candidate/qualitas-frontend-candidate-056c245c-plus7.tgz`（基準 `056c245ca3ff630f74bfc7af86233e7cbc7dc51b`＋7 個已審前端檔）。
- 後端：`backend/core/docx_builder.py`（DOCX-PATH-GUARD），依 `DOCX-PATH-GUARD-2026-001-deploy-handoff.md` v3。

## 步驟
1. 啟動既有 Colima，以官方 Python 3.11 可丟棄容器跑兩個 DOCX path guard 測試檔；不掛正式資料或帳密；保存映像識別、來源雜湊、完整輸出、退出碼。不安裝 Homebrew Python。**3.11 未通過不得部署後端。**
2. 遠端唯讀預檢：前端服務目錄、掛載、內容雜湊、快取、權限；後端依 v3 §3 與門檻 G。
3. 依現場結果整理具體切換與回退步驟，交獨立審核。通過且準備完成後直接部署（不再詢問相同授權）；前後端可分開。
4. 冒煙：唯讀檢查與既有合法紀錄匯出；不新增正式業務資料（不按 Generate Checklist）。

## 限制
不混入未審變更；不推送全部基準提交；不強制推送；任何檢查失敗即停止並回報。保留 8240／3240、8198／3198。不改產品程式。
