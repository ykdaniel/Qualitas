# STATUS — RELATED-DOCS-OPEN-2026-001

ROUND: 1（2026-10-12）
RESULT: DONE（獨立審查 PASS）

## 本輪修改（分支 `fix/related-docs-open-record`，基準 `ui/sidebar-shell-preview` `5bba6665`）
| 檔案 | 內容 |
|---|---|
| `react-app/src/components/ui/RelatedDocuments.tsx` | 預設點擊由 `navigate(ENTITY_ROUTE[type])` 改為 `navigate(`${ENTITY_ROUTE[type]}?openId=<id>`)`（以 URLSearchParams 編碼）。 |
| `react-app/src/components/NOI/modals/NOIDetailModal.tsx` | 移除 `onOpen` 覆寫（原本只有 ITR 帶 openId），改用預設；移除不再使用的 `useNavigate` import 與變數。CRLF 換行維持。 |
| 審查後補正（註解） | `RelatedDocuments.tsx` 的 `onOpen` 說明改為新預設行為；`backend/workflows/relationships.py` 在 `EDGES` 前加註「關聯一律跨模組」的前提（前端依賴此前提）。僅註解，無行為變更。 |
| 驗證工具（新） | `backend/scripts/verification/seed_related_docs_open_review.py`、`verify_related_docs_open_browser.py`、`react-app/tests-browser/related-docs-open-vite-launcher.mjs`（埠 8292/3292）。 |

## 執行證據（`docs/workflow/RELATED-DOCS-OPEN-2026-001-evidence/`）
- `tsc --noEmit` exit 0；`vite build` exit 0（`tsc-build.txt`）。
- `npm test`：173 pass / 0 fail（`unit-summary.txt`）。
- ESLint（兩個改動檔）：1 error，為 `RelatedDocuments.tsx:78` 既有的 set-state-in-effect（未改動的行）；`NOIDetailModal.tsx` 基準與改後皆 0 問題。
- 隔離環境瀏覽器（`isolated_stack.py`，新建暫存資料庫，Playwright Chromium）7 項全部 PASS（`browser-scenarios.txt`，截圖 1–3）：
  - 1a–1d：NOI 視窗 → Related Documents 的 ITP → 開啟「該筆」ITP（不是列表）、網址參數已移除 → 關閉回到 NOI 頁。
  - 2a–2b：ITP 視窗 → 相關 NOI → 開啟該筆 NOI → 關閉回到 ITP 頁。
  - 3：一般進入 /itp 不開任何視窗（回歸）。
- 修正前同一腳本實測：1b FAIL（停在 ITP 列表），即使用者回報的現象（該次輸出未另存證據檔）。
- 隔離環境已 down 並移除。

## 已知限制／未測
- NOI → ITR、ITR → NOI、NCR ↔ NOI 未另建資料實測；ITR 目標的網址形狀與原本 NOI 覆寫產生的相同（讀碼）。四個目標頁的 openId 處理皆以 id 比對（讀碼）。
- 目標紀錄不在目前專案篩選範圍內時，仍只顯示列表（既有 openId 行為，未改）。
- 關閉後回到來源頁列表，不會重新開啟來源紀錄視窗（既有行為）。

## 獨立審查
PASS（未參與實作的 agent，只讀）。非阻擋建議已處理：過時註解、證據說明、EDGES 前提註解。其餘列為已知限制：目標不在清單時無提示（既有）、其他方向僅讀碼、隔離測試密碼為 repo 既有慣例。
