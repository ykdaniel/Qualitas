# ITP-SUBJECT-WIDTH-2026-001 — handoff（R2 補正，待獨立審查）

**一句話**：補 R1——兩欄斷點（≤1024px）時 Version 占滿最後一列，用 ITP 專用樣式的 opt-in class，未改共用 `formGrid`；1024 新增／編輯與 1366 回歸已實測。未提交、未部署。

## 審查請看
1. 程式：`ITP.module.css` 新增 `.versionFullRowWhenTwoColumns`（只在 `max-width: 1024px` 內 `grid-column: 1 / -1`）；`ITPModals.tsx` Version 容器加此 class。
2. 檢查：`ITP-SUBJECT-WIDTH-2026-001-R2-evidence/{tsc,build,eslint-changed-files}.txt`（全部 exit 0；lint 0 warnings）。
3. 瀏覽器：STATUS 的表格與截圖 `01`–`03`。
4. 第 1 輪紀錄：`ITP-SUBJECT-WIDTH-2026-001-R1-REVISE-*-archive.md`；第 1 輪證據 `ITP-SUBJECT-WIDTH-2026-001-evidence/`。

## 未測
1366 編輯畫面（同元件同 class）、1920（本輪 CSS 不生效）、手機、中文介面、鍵盤 Tab 順序。

## 環境
8280／3280 保留待審；8240／3240、8198／3198 未觸碰。未提交、推送、部署。
