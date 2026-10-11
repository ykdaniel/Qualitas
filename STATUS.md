# STATUS.md — Claude 執行結果

TASK_ID: ITP-CHECKLIST-RETURN-2026-001
ROUND: 1＋審查後補正（2026-10-11）

## RESULT
- [x] DONE（待獨立審查）
- [ ] PARTIAL
- [ ] BLOCKED

## 本輪修改（分支 `fix/itp-checklist-return`，基準 `a80799f`）
| 檔案 | 內容 |
|---|---|
| `react-app/src/utils/itpReturnLink.ts`（新） | 兩個網址產生函式：`checklistFromItpPath(recordsNo, itpId)` 產生 `/checklist?openId=…&from=itp&returnItp=<ITP id>`（無 itpId 時維持舊形狀）；`itpReopenPath(itpId)` 產生 `/itp?reopenItp=<id>`。 |
| `ITPAdvancedEditor.tsx` | 新增選填 prop `itpId`；Records 連結改用 `checklistFromItpPath`。 |
| `ITPModals.tsx` | 傳 `itpId` 給編輯器；Generate Checklist 導頁改用 `checklistFromItpPath`；新增選填 prop `initialTab`（預設 'general'）決定視窗開啟分頁。 |
| `ITP.tsx` | 新增 `?reopenItp=` 處理：清單載入後只套用一次（ref 防重入）、移除參數、以 'plan' 分頁開啟該 ITP；不設 `openedViaDeepLinkRef`，關閉後停在列表。找不到 id 時顯示提示。`handleEdit` 多一個分頁參數（預設 'general'），Add New 重設為 'general'。 |
| `Checklist.tsx` | Back（`handleBack`）：`from=itp` 且有 `returnItp` 時 `navigate(itpReopenPath(id), { replace: true })`；其餘情況維持原 `navigate(-1)`。 |
| `LanguageContext.tsx` | 新增 `itp.reopenNotFound` 中英文字串。 |
| 審查後補正（ITP.tsx） | 依審查建議 3：清單為空時，只有在看過一次載入（loading=true）之後才判定「已載入」，讓抓取失敗或空專案也會消耗 `reopenItp` 並顯示提示，不會一直留在網址。 |
| 審查後補正（`react-app/tests-unit/itpReturnLink.test.ts`，新） | 依審查建議 5：4 個單元測試，涵蓋無 itpId 的舊網址形狀、特殊字元編碼、reopen 網址只指向 /itp。 |
| 驗證工具（新） | `backend/scripts/verification/seed_itp_checklist_return_review.py`、`verify_itp_checklist_return_browser.py`、`react-app/tests-browser/itp-checklist-return-vite-launcher.mjs`（埠 8291/3291）。 |
| 任務文件 | 前一輪三份檔封存為 `docs/workflow/DEPLOY-EXEC-2026-001-CLOSED-*-archive.md`；本輪 TASK／STATUS。 |

未改後端、未改 `/itp/:id`（ITPDetail 頁）、未改 `from=itr` 行為。

## 執行證據（實測，`docs/workflow/ITP-CHECKLIST-RETURN-2026-001-evidence/`）
- `tsc --noEmit`：exit 0。`vite build`：exit 0（`tsc.txt`，補正後重跑）。
- 前端單元測試 `npm test`：pass 148 / fail 0（基準 144＋新增 4，`unit-summary.txt`）。
- ESLint（僅改動的 5 個檔）：1 error / 3 warnings，與基準 `a80799f` 同檔完全相同（既有的 `openId` 深連結 set-state-in-effect 1 項、3 個未使用變數警告）。新增的 reopen 段落同屬該規則，以單行 `eslint-disable-next-line` 並註明理由（與既有深連結相同的一次性 URL 參數模式），新增 lint 問題為 0。
- 隔離環境瀏覽器實測（`isolated_stack.py`，新建暫存資料庫，埠 8291/3291，Playwright Chromium 141）：補正後重建環境重跑，13 項全部 PASS（`browser-scenarios.txt`，截圖 1–5）：
  - 1a–1e：ITP 視窗 Records 連結 → Checklist（網址帶 returnItp）→ Cancel → 回到同一份 ITP-A 視窗、停在 Inspection Plan 分頁、網址參數已移除 → 關閉後停在 ITP 列表。
  - 2：既有 `?openId=` 深連結開 ITP-B，關閉後仍回到前一頁（回歸）。
  - 3：舊形狀連結（`from=itp` 無 returnItp）維持 history-back（回歸）。
  - 4a–4c：Generate Checklist → Cancel → 回到 ITP-A、Inspection Plan 分頁。
  - 5：不存在的 reopen id → 顯示提示、不開視窗。
  - 6a–6b：reopen 之後，一般點列與 Add New 仍從 General Information 開始（回歸）。
- 隔離環境已 `down` 並移除；基準比較用的暫時 worktree 已移除。

## 已知限制／未測
- 審查建議 1（讀碼推論，未實測）：在 Checklist 頁按「瀏覽器的上一頁」而不是頁面上的 Cancel，仍只回到 ITP 列表；另外經 Cancel 返回後，歷史紀錄會有兩筆 /itp，關閉視窗後按瀏覽器上一頁要多按一次才離開 ITP。本輪不改，因為改法需要在離開 ITP 前改寫目前的歷史紀錄，會與 LeaveGuard（useBlocker）互動，風險較高；如需要另開任務。
- 審查建議 2（讀碼推論）：`returnItp` 在整個 Checklist 頁停留期間都在網址上；若在 Checklist 頁內改開其他紀錄、存檔回列表後再按 Cancel，仍會回到原 ITP。改動前同情境是 navigate(-1) 離開頁面，非回歸。
- 審查建議 4（讀碼推論，正常操作碰不到）：人為構造同時帶 `openId` 與 `reopenItp` 的網址時，兩個 effect 各自從舊參數刪除，可能把另一個參數加回網址。
- 正式站未部署、未在正式站實測。
- 原本若是經由 `?openId=` 深連結開的 ITP 視窗，從 Checklist 返回後會以「reopen」方式開啟，關閉時停在 ITP 列表，不再回到最初的來源模組（讀碼判斷，未另測）。
- Checklist 範本「Save Template」後的行為未改：仍回到 Checklist 列表，不會自動回 ITP（範圍外）。
- 回到 ITP 時重新從伺服器資料開啟視窗；離開前若有未存修改，沿用既有離開提示（LeaveGuard）處理，本輪未改也未另測。
- 依賴安裝：`npm ci` 因 repo 既有 eslint peer 衝突失敗，改用 `npm ci --legacy-peer-deps`（未改 package 檔）。
- 本輪於雲端全新 clone 上以 `git checkout -b` 建分支（無協作者未提交修改）；AGENTS.md 的「不使用 checkout」是保護協作者工作區，本環境無此風險，仍在此註明。
