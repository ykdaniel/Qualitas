# STATUS — ITP-VP-CODES-2026-001

TASK_ID: ITP-VP-CODES-2026-001
來源：協調中心「主要調度」2026-10-17 派工，使用者同意。之後兩次定案：舊值處理採甲；使用者決定「Q 清成空白，併入 2b 那次 sudo 一起上」。
負責：ITP 工作階段。

## Commit（只在本地，沒有推送）

- 基準：REFUSAL 2b-1 `247ee771ea3761837dd8ca7c102ad74d38a929b3`。detached worktree 在 `/Users/nook/Documents/Qualitas-wt-itp-vp-codes`，沒有動任何分支 ref。
- `65280cae`：VP 下拉改為完整代碼、保留舊值、VPBadge 樣式（父 `247ee771`）。
- `5ba6bd26`：Q 退役——啟動遷移步驟 30、前端不再保留 Q、圖例補 S／N/A（父 `65280cae`）。
- `2cb81745`：審查後續——rollback 測試、VPBadge 註解拿掉 Q（父 `5ba6bd26`）。**最終 HEAD＝`2cb81745`。**
- 可重放 patch（3 個 commit）：`~/Documents/Qualitas-deploy-artifacts/ITP-VP-CODES-2026-001/itp-vp-codes.patch`，sha256 `c7702924…f404d6366`。2b-1 重建時，用 `git am` 套到新基準。

## 修改的檔案

| 檔案 | 改動 |
|---|---|
| `react-app/src/components/ITP/VPBadge.tsx` | `VP_CODES`（H／W／R／S／N/A）；共用的 `VPOptions`：格內既有值不在清單時加一個「<值> (legacy)」選項，照原樣顯示、存檔不變；`RETIRED_CODES = ['Q']` 不保留；`VP_LEGEND_EXTRA`（S、N/A 的中英說明）；S、N/A 樣式；舊值灰色；寬度改為 `min-w-8 px-1`（列印 `min-w-6 px-0.5`）；字面值「-」與空值顯示相同。CRLF。 |
| `react-app/src/components/ITP/ITPAdvancedEditor.tsx` | VP 下拉改用 `<VPOptions/>`；圖例 tooltip 接上 `VP_LEGEND_EXTRA[language]`。CRLF。 |
| `react-app/src/components/ITP/ITPDetail.tsx` | 同上。LF（原本就是）。 |
| `backend/db_migrations.py` | 步驟 30 `_clear_itp_vp_q`：獨立函式加在檔尾，`run_migrations` 第 29 步後只加一行註冊，不動既有步驟。CRLF。 |
| `backend/tests/test_itp_vp_q_migration.py` | 新檔，4 個測試（含失敗時 rollback 並在下次啟動重試）。 |

**圖例鍵待 2b-2 後移入 LanguageContext**：`VP_LEGEND_EXTRA` 是暫放在元件裡的本地常數。「(legacy)」也是英文常數。

## 遷移步驟 30（回滾時用來反查）

- **旗標**：`migration_flags.flag_name = 'itp_vp_q_cleared_v1'`，和資料變更在同一個 transaction 寫入。
- **audit**：`audit_logs.action = 'CLEAR_VP_Q'`，`entity_type = 'ITP'`，`username = 'system-migration'`；每份有改動的 ITP 一筆。
  - `old_value` = `{"vp_value": "Q", "cells": n, "cell_list": [{"phase", "id", "role"}…]}`
  - `new_value` = `{"vp_value": "", "cells": n}`
- **啟動 log**：`ITP VP Q cleared: <n> templates, <m> cells`。失敗時 log `Could not clear ITP VP code Q: …`，什麼都不寫，下次啟動重試。
- **規則**：只動 detail_data a／b／c 各項的 sub／teco／employer／hse 中，值 `.strip().upper() == "Q"` 的格，改成 `""`。
  - 其他值（W/R、I、■、□、※、「-」、N/A、文字）一律不動，其他鍵也不動（例如 `checklist`）。
  - 沒有 Q 的 ITP、或 detail_data 不是有效 JSON 的 ITP，完全不重寫。
- **回滾**：部署暫存會先備份 DB。如果只要還原 Q，可依 `cell_list` 把對應格寫回 "Q"；旗標要留著，否則下次啟動又會清掉。

## 上線（結案 2026-10-17）

- **上線時間：2026-10-17 15:52Z（台灣 23:52）**，由協調中心部署，併入 2b 那次 sudo 重建。正式站＝分支 HEAD `1b37ce9d`；本批 3 個 commit 以 2b-2 `a411072d` 為底重放為 `02dba424`／`57e100ad`／`1b37ce9d`（原 worktree commit `65280cae`／`5ba6bd26`／`2cb81745` 不推送）。
- **啟動 log（協調中心轉述）：** `ITP VP Q cleared: 35 templates, 1431 cells`，0 ERROR；前端 bundle `index-c5DPYlfw.js` 含 legacy 字樣。
- **ITP 工作階段在上線後唯讀核對正式站：**
  - 旗標 `itp_vp_q_cleared_v1` 的完成時間是 2026-10-17T15:52:11Z。
  - audit `CLEAR_VP_Q` 有 35 筆，`old_value.cells` 合計 1431。
  - a／b／c 中值為 Q 的格剩 0 格、0 份。
  - itp 仍為 144 份。
  - 首頁 index 為 `index-c5DPYlfw.js`。
- **未核對：** 沒有登入正式站畫面實際操作。
- **清理：** 隔離環境 3393／8393 已關閉，run 目錄已刪除；worktree `~/Documents/Qualitas-wt-itp-vp-codes`（含 node_modules symlink）已移除；vite 快取 `react-app/node_modules/.vite-itp-template-revision`、`.vite-itp-cards` 已刪除。

## 上線影響

使用者 2026-10-17 晚上答覆：「我的意思是沒有 Q 這個檢查點」。協調中心解讀為 (a)：Q 不是合法的檢驗點代碼，35 份（含外部文件）一律清成空白，遷移的篩選條件照現狀不改。

- 上線後第一次啟動時，步驟 30 會清除 **35 份 ITP、1431 格**。預期 log：`ITP VP Q cleared: 35 templates, 1431 cells`；如果數字不同，要先查明原因。
- 其中 **226 個項目清除後整列沒有任何檢驗點**（四格都是空白或「-」）。這是預期結果，日後逐份補上正確代碼。
- 受影響範本清單：`~/Documents/Qualitas-deploy-artifacts/ITP-VP-CODES-2026-001/q-cells-preview.md`，保留下來供回溯。每格的位置也記在 audit `CLEAR_VP_Q` 的 `cell_list`。

## 正式站 VP 代碼用量（唯讀）

2026-10-17 台灣傍晚，用 `sqlite3 -readonly`（`mode=ro`）查正式站 144 份 ITP，範圍是 a／b／c 全部項目的四欄。

| 代碼 | 格數 | ITP 份數 | 出現的角色 |
|---|---|---|---|
| W | 2364 | 119 | 四欄皆有 |
| **Q** | **1431** | **35** | 四欄皆有 |
| H | 1331 | 105 | 四欄皆有 |
| R | 1322 | 83 | 四欄皆有 |
| （空白） | 1155 | 80 | 四欄皆有 |
| - | 437 | 35 | 四欄皆有 |
| W/R | 379 | 45 | employer、hse |
| ■ | 43 | 3 | sub、teco、employer |
| N/A | 24 | 2 | 四欄皆有 |
| I | 21 | 2 | sub |
| □ | 11 | 3 | employer |
| ※ | 10 | 3 | hse |
| S | 0 | 0 | — |

**Q 清除預覽**（唯讀，判定規則與步驟 30 相同）：`~/Documents/Qualitas-deploy-artifacts/ITP-VP-CODES-2026-001/q-cells-preview.md`。
- 合計 35 份、1431 格（sub 340／Main 374／Employer 397／HSE 320）。
- 其中 30 份是外部文件編號，16 份是廠商工廠試驗 ITP；只有 5 份是 QTS-RKS 範本。
- 含 Q 的 511 個項目中，有 226 個項目清除後四格都沒有任何檢驗點。這一點已請協調中心轉給使用者，在 sudo 前確認。

## 驗證（實測、讀碼、未測分開列）

- **實測** `npx tsc --noEmit -p .`：exit 0。
- **實測** eslint 三個前端檔：0 error（11 個 warning 都是既有的沒用到的 import）。
- **實測** `npm test`：217/217 pass。
- **實測** 本機 `pytest tests/test_itp_vp_q_migration.py tests/test_checklist_template_cleanup.py`：10 passed（Python 3.14，只作為快速檢查）。
- **實測** Python 3.11 全套（`docs/workflow/py311-full-suite.sh`，HEAD `5ba6bd26`）：**2828 passed、17 skipped，pytest_exit=0**，耗時 1:01:53。證據：`docs/workflow/ITP-VP-CODES-2026-001-evidence/py311-full-suite-5ba6bd26.txt`。第一次因為 Docker socket 不在而沒有執行，已重跑。
- **實測** Python 3.11 針對 `2cb81745` 單獨跑 `tests/test_itp_vp_q_migration.py`＋`tests/test_checklist_template_cleanup.py`：11 passed。證據：`…-evidence/py311-focused-2cb81745.txt`。`2cb81745` 只多了一個測試和一行註解，所以全套沒有重跑。
- **實測** 隔離環境 3393／8393，程式為 `5ba6bd26`，run 目錄 `/private/var/folders/l3/76bnxp9x47159snm4w96_r6w0000gn/T/qualitas-manual-yyofu2sy`：
  - 啟動 log 有 `ITP VP Q cleared: 0 templates, 0 cells`（新資料庫，遷移在 seeder 之前執行）。
  - 在示範範本 QTS-RKS-STD-ITP-000002 填入 A1 = Q／W/R／I／■、A2 = 四格 Q（其中一格是 " q "）、A3 = H／-／空白／※，刪掉旗標後在隔離 DB 執行步驟 30。結果：A1 = 空白／W/R／I／■，A2 = 四格空白，A3 不變；1 筆 CLEAR_VP_Q audit，cell_list 為 5 格。
  - 前一版（`65280cae`）實測：兩處編輯面板的舊值顯示「<值> (legacy)」；只改 sub 存檔，其他格全部保留。
  - 比對用的鋼筋範本已重新匯入：000003 現行、000004 修訂版。
- **未測**：列印預覽；`5ba6bd26` 的圖例 tooltip 只讀碼，沒有在瀏覽器 hover。
- **獨立審查**：`65280cae` PASS；`5ba6bd26` PASS（見 REVIEW）；`2cb81745` 是審查後的修正，沒有再送審。

## 未追蹤檔

- worktree：`react-app/node_modules`（symlink）、`react-app/tests-browser/itp-vp-codes-vite-launcher.mjs`。
- 主 checkout：`backend/scripts/verification/seed_itp_template_revision_review.py`、`react-app/tests-browser/itp-template-revision-vite-launcher.mjs`、本檔、REVIEW、evidence。
