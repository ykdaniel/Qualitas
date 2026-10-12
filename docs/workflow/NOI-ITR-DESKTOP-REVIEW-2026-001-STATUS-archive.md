# STATUS.md — Claude 執行結果

TASK_ID: NOI-ITR-DESKTOP-REVIEW-2026-001

## RESULT
- [x] DONE（審閱報告完成，待獨立審查；本文件不填 PASS）
- [ ] PARTIAL
- [ ] BLOCKED

## 前一任務狀態（保留）
`ITP-SUBJECT-WIDTH-2026-001` R2 PASS 已封存（R1-REVISE、R2-PASS 皆保留，本輪開始前核對雜湊一致）。

## 本批產出（未改產品程式碼）
- 審閱報告：`docs/workflow/NOI-ITR-DESKTOP-REVIEW-2026-001-findings.md`（三項發現＋其他觀察＋未測）。
- 截圖：`docs/workflow/NOI-ITR-DESKTOP-REVIEW-2026-001-evidence/01`–`07`。
- 新增隔離種子 `backend/scripts/verification/seed_noi_itr_desktop_review.py`（真實長度資料、含 ITP、三種 NOI 情境）與啟動器 `react-app/tests-browser/noi-itr-desktop-review-vite-launcher.mjs`。
- 產品程式（`react-app/src`、`backend` 非 scripts）：**未修改**。

## 三項發現（摘要）
| # | 標題 | 分類 | 證據 | 重複性 |
|---|---|---|---|---|
| 1 | 選來源單據只看得到編號（NOI 的 ITP、ITR 的 NOI） | UX 改善 | 實測選項文字 | 未見既有項目 |
| 2 | 已有 ITR 的 NOI 可再建並行普通 ITR，無提示 | 待確認業務規則＋UX | 實測建立成功＋API；後端檢查為讀碼 | 未見；與 #32 相關不同 |
| 3 | Event #／Checkpoint 需手打，ITP 已有資訊 | UX 改善（Checkpoint 取值屬待確認規則） | 實測 | 與 P4 方向部分重疊 |

## 驗證範圍
- 實測：新建 NOI（選廠商／ITP、填欄位、必填提示、保存）、重新開啟、從 ITR 現有入口以 NOI 建立 ITR（自動帶入）、對已有 ITR 的 NOI 再建 ITR、三種 NOI 情境的 Related Documents。
- 未重跑：既有權限、聯絡資訊帶入、導航、保存驗收。
- 未測：手機、NCR 照片 UX（延期）；Q-Workflow／NOI 結案在雙 ITR 下的行為；中文介面；鍵盤操作；正式站。

## 資料寫入（僅隔離環境）
新 NOI `QTS-FHS-NOI-000001`、新 ITR `QTS-FHS-ITR-000001`（掛在 NOI-000002 下，為發現 2 的實測證據）。

## 環境
- 本批 8290／3290（run `b22ccf95`）：依指示於核對身分後拆除（結果見下）。
- 8240／3240、8198／3198 未觸碰。未提交、推送、部署。

## 2026-10-07 收尾（依 REVIEW REQUIRED_FIXES，未重跑、未另開補正輪）
- findings.md／handoff.md 三處文案更正：多筆普通 ITR 不推定只有一筆有效（是否限制待業務確認）；手填 Event # 改為「可能不一致，正式關聯契約與影響未確認」；未擷取 toast 註明只是觀察限制，不等於沒有成功提示。原措辭以「依審查更正」註記保留。
