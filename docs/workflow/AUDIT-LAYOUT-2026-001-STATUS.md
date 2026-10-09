# AUDIT-LAYOUT-2026-001 — STATUS（R2，待獨立審查）

TASK_ID: AUDIT-LAYOUT-2026-001
ROUND: R2。R1 審查結果為 REVISE（3 項必修）。R1 的 TASK、STATUS、REVIEW 原樣封存為 `AUDIT-LAYOUT-2026-001-R1-REVISE-*-archive.md`；R1 的證據移到 `evidence/r1/`，差異改名為 `evidence/E-R1.patch`。
基準是 HEAD `d4950aec`。R2 差異見 `evidence/E.patch`（SHA-256 `4beeabb5…1b14`）。部署候選是乾淨匯出的 HEAD react-app 套上 E.patch，已確認與工作樹逐位元組相同。
**未提交、推送或部署。不自填 PASS。**

## RESULT
- [x] DONE（交 R2 獨立審查）

## R2 補正（依 R1 REVIEW 的 REQUIRED_FIXES）
1. **進度條最後一個標籤被切掉（768～1088px）**：
   - 進度條改回 `max-w-4xl`，並加上 `px-10`。每個標籤以圓圈為中心，又比圓圈寬，頭尾的標籤會比圓圈多出約 36px，內距讓它們留在精靈內。
   - 640px 以下改成只顯示數字（標籤加 `hidden sm:block`）。手機寬度時 4 個標籤本來就放不下，5 步時也會重疊，這次一併處理，不再列為已知限制。
   - R1 到 R2 只改了 `AuditWizard.tsx` 的進度條（另外把列印摘要的舊步驟註解改正），完整差異見 `evidence/r1-to-r2-AuditWizard.diff`。
2. **`audit-layout-check.mjs` 的溢出檢查**：
   - 改為同時量精靈浮層本身（`scrollWidth - clientWidth`）和整個頁面，並逐一檢查每個看得到的進度條標籤，左右邊界都要在 `[0, innerWidth]` 之內。手機寬度標籤隱藏時，如實顯示「labels hidden」。
   - 用修正後的腳本跑 **R1 版**的 AuditWizard：1024 寬和 390 寬各 FAIL 2 項（浮層溢出 4px／20px，標籤超出畫面），證明新的檢查抓得到問題（`evidence/layout-check-against-R1.txt`）。
3. **重新產生**：新的 E.patch、部署候選（乾淨匯出 HEAD 套上 E.patch，已確認與工作樹相同）、前端檢查、完整的隔離測試與列印。
- 另外順手改了審查提到的過時文字：腳本標籤與註解中的「step-5」，以及列印摘要中的「Step 2/3 Info」註解。

## R2 驗證（`evidence/r2-isolated-run-report.txt`，全新資料庫，版面檢查先跑，資料未被其他腳本修改）
- 版面 **13／13 PASS**：1440／1024／390 寬分別是 3／2／1 欄；浮層和頁面都 0px 溢出；1440 和 1024 寬時 4 個標籤都完整落在畫面內；390 寬時標籤隱藏、只顯示數字。截圖在 `evidence/r2-screens/`，`step1-1024.png` 可以看到「Execution & Review」完整顯示。
- 回歸：小項檢查 9／9、輸入法 Enter 3／3、整體測試 22／22。
- 列印（`evidence/r2-print/`）：第 2 步 1 頁計畫書；第 3 步 9 頁，60／60 個項目；第 4 步 11 頁，60／60 個項目，Findings 30／30 句（文字接起來計算），沒有背後清單。和 R1 相同。
- `r2-frontend-checks.txt`：`tsc` exit 0、單元測試 144／144、eslint 0 個問題。
- NAS 暫存區已改為 R2 候選（`nas-prep-output-r2.txt`）。

## 修改檔案
| 檔案 | 內容 |
|---|---|
| `react-app/src/components/Audit/AuditWizard.tsx` | `WIZARD_STEPS`／`LAST_STEP`（4 步）。進度條依 `WIZARD_STEPS` 產生。`nextStep` 和送出按鈕改用 `LAST_STEP`。第 1 步 3 欄並調整欄位順序。原第 2、3 步合併成 `step === 2`：人員區塊、地點與範圍區塊、列印計畫按鈕、列印用摘要。原第 4、5 步改為第 3、4 步。外框加寬到 1400px，內距、標題、輸入框尺寸縮小。 |
| `react-app/src/context/LanguageContext.tsx` | 新增 `audit.wizard.stepPersonnelScope`（中英）。 |
| `react-app/tests-browser/audit-print-check.mjs`、`audit-polish-check.mjs`、`audit-ime-enter-check.mjs` | 步驟編號改為新的 2／3／4。 |
| `react-app/tests-browser/audit-layout-check.mjs`（新） | 檢查 1440／1024／390 三種寬度：第 1 步的欄數、沒有橫向捲動、進度條 4 步、第 2 步的欄位與列印計畫按鈕都在。 |
| `react-app/tests-browser/audit-smoke-all.mjs`（新，前一次隔離測試寫的） | 涵蓋 A／B／C／POLISH 的 22 項端到端檢查，步驟編號已更新。 |

AuditWizard.tsx 與 LanguageContext.tsx 維持 CRLF。

## R1 的證據（已移到 `evidence/r1/`，以下路徑為 R1 當時的）
- **隔離環境**（`isolated-run-report.txt`）：從乾淨的 HEAD 匯出啟動，加上本輪 2 個前端檔（與工作樹相同），使用全新資料庫。
  - 版面：第一次有 2 項失敗，原因是檢查腳本用欄位設定字串計算欄數，`repeat(1, minmax(0, 1fr))` 被空白切開也算成 3。改成以欄位的實際位置判斷後，重跑 **10／10 PASS**（`layout-check-rerun.txt`）：1440 寬 3 欄、1024 寬 2 欄、390 寬 1 欄，都沒有橫向捲動，進度條 4 步，第 2 步欄位齊全。截圖在 `screens/`。
  - 回歸：小項檢查 9／9、輸入法 Enter 3／3、整體測試 22／22。
  - 列印（`print/`）：
    - 第 2 步（計畫）1 頁，有計畫書標題與範圍內容。
    - 第 3 步（查檢表）9 頁，60／60 個項目。
    - 第 4 步（執行與評估）11 頁，60／60 個項目，沒有背後清單。上一版是 13 頁，因為內距縮小而變少。Findings 用逐行 grep 只數到 27／30 句（換行把片語切開），把文字接起來後是 30／30（`print-findings-joined.txt`）。
- **前端檢查**（`frontend-checks.txt`）：`tsc` exit 0、單元測試 144／144、Audit 模組 eslint 0 個問題、`vite build` 成功。
- **使用者**已在自己的 Chrome（隔離環境）看過第 1、2 步的新版面。

## 行為變化
- 精靈由 5 步變 4 步，第 2 步是「人員與範圍」。資料欄位、存檔、鎖定、權限、列印內容都不變。
- 畫面寬度在 1280px 以上是 3 欄；768～1279px 是 2 欄；手機是 1 欄。

## 未做／限制
- 沒有改後端，所以不需要重建、不需要 sudo，也不需要 Python 3.11 檢查。
- 第 3、4 步的內部排版沒有重新設計。
