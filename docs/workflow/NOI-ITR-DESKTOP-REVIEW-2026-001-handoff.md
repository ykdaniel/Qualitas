# NOI-ITR-DESKTOP-REVIEW-2026-001 — handoff（待獨立審查）

**一句話**：以第一次使用的現場工程師角度走查新建 NOI → 重開 → 由 ITR 現有入口接續建立 ITR，提出三項發現；未改產品程式。

## 審查請看
- 報告：`NOI-ITR-DESKTOP-REVIEW-2026-001-findings.md`
- 截圖：`NOI-ITR-DESKTOP-REVIEW-2026-001-evidence/01`–`07`
- 種子：`backend/scripts/verification/seed_noi_itr_desktop_review.py`

## 建議優先順序
1. **發現 2**（已有 ITR 的 NOI 可再建並行普通 ITR，無提示）：建立時無提示，NOI 下可見兩筆不同編號的普通 ITR；兩筆是否都有效、是否應限制待業務確認（不推定只有一筆有效）；需先請使用者決定「一個 NOI 是否只允許一筆普通 ITR」。
2. **發現 1**（來源選單只顯示編號）：改動最小、風險低，直接減少選錯來源。
3. **發現 3**（Event #／Checkpoint 重打）：價值高但涉及 Checkpoint 取值規則，與 P4 部分重疊。

## 請判斷
- 三項分類與證據等級是否恰當（發現 2 的後端無檢查為讀碼）。
- 「其他觀察」中是否有應升級的項目（例如 NOI Subject 寬度與 ITP 同類）。

## 環境
8290／3290 依指示拆除；8240／3240、8198／3198 未觸碰。未提交、推送、部署。
