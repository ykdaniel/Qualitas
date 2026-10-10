# DEPLOY-SCOPE-INVENTORY-2026-001 — handoff（R2 補正，待獨立審查）

**一句話**：R1–R3 已補：證據界線改正、前端上線改列預檢／切換／回退條件（不猜遠端指令）、本機產物已保全並核對雜湊。未操作遠端、未提交推送部署。

## 審查請看
- 盤點 v2：`DEPLOY-SCOPE-INVENTORY-2026-001-inventory.md`（v1 保留為 `-v1-REVISED.md`）。重點 §1–§2 證據界線、§5 前端條件、§6 保全、§7 三類待辦。
- 本機保全：`~/Documents/Qualitas-deploy-artifacts/DEPLOY-SCOPE-INVENTORY-2026-001/`（`README.txt`、`COPY-VERIFICATION.txt`）。
- 證據：`DEPLOY-SCOPE-INVENTORY-2026-001-evidence/`。

## 請注意
- 候選包第一次打包為空檔，已重做並驗證（VOID 紀錄保留）。
- 部署授權：使用者已在對話中直接確認（每批 PASS 且準備完成即提交推送部署，含遠端唯讀預檢）；授權不等於本輪審查通過。冒煙排除新增業務資料；Python 3.11 須完成；使用已保全候選包。

## 仍待
遠端唯讀預檢（前端 §5.1、後端 v3 §3＋門檻 G）→ 依結果定出具體切換／回退指令並交審 → 才執行。Python 3.11 驗證須於部署前完成。跨機器重建依使用者指示不需處理，直接使用已保全候選包。
