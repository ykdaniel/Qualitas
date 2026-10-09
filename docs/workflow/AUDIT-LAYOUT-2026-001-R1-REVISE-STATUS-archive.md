# AUDIT-LAYOUT-2026-001 — STATUS（R1，待獨立審查）

TASK_ID: AUDIT-LAYOUT-2026-001
ROUND: R1。基準是 HEAD `d4950aec`。差異見 `evidence/E.patch`（SHA-256 `ed576480…83b0`）。部署候選是乾淨匯出的 HEAD react-app 套上 E.patch，已確認與工作樹逐位元組相同。
**未提交、推送或部署。不自填 PASS。**

## RESULT
- [x] DONE（交 R1 獨立審查）

## 修改檔案
| 檔案 | 內容 |
|---|---|
| `react-app/src/components/Audit/AuditWizard.tsx` | `WIZARD_STEPS`／`LAST_STEP`（4 步）。進度條依 `WIZARD_STEPS` 產生。`nextStep` 和送出按鈕改用 `LAST_STEP`。第 1 步 3 欄並調整欄位順序。原第 2、3 步合併成 `step === 2`：人員區塊、地點與範圍區塊、列印計畫按鈕、列印用摘要。原第 4、5 步改為第 3、4 步。外框加寬到 1400px，內距、標題、輸入框尺寸縮小。 |
| `react-app/src/context/LanguageContext.tsx` | 新增 `audit.wizard.stepPersonnelScope`（中英）。 |
| `react-app/tests-browser/audit-print-check.mjs`、`audit-polish-check.mjs`、`audit-ime-enter-check.mjs` | 步驟編號改為新的 2／3／4。 |
| `react-app/tests-browser/audit-layout-check.mjs`（新） | 檢查 1440／1024／390 三種寬度：第 1 步的欄數、沒有橫向捲動、進度條 4 步、第 2 步的欄位與列印計畫按鈕都在。 |
| `react-app/tests-browser/audit-smoke-all.mjs`（新，前一次隔離測試寫的） | 涵蓋 A／B／C／POLISH 的 22 項端到端檢查，步驟編號已更新。 |

AuditWizard.tsx 與 LanguageContext.tsx 維持 CRLF。

## 證據（`AUDIT-LAYOUT-2026-001-evidence/`）
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
