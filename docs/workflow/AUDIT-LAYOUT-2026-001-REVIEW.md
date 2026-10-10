# AUDIT-LAYOUT-2026-001 — REVIEW（獨立審查）

審查者：獨立 Claude 審查代理（GPT 額度用盡，使用者 2026-10-09 於對話中指定）

TASK_ID: AUDIT-LAYOUT-2026-001
ROUND: R2（R1 REVISE 已封存為 `AUDIT-LAYOUT-2026-001-R1-REVISE-REVIEW-archive.md`）

本輪只審 R1 的 REQUIRED_FIXES 1～3，以及 R1 到 R2 之間有沒有其他改動或退步。R1 已確認的部分（步驟改號、合併後的欄位與綁定、唯讀鎖定、列印內容、i18n、CRLF）沒有重審。

## EVIDENCE_CHECK

### REQUIRED_FIXES 1：進度條頭尾標籤被切掉 — 已修正
- 程式碼：進度條外層由 `max-w-5xl mx-auto` 改成 `max-w-4xl mx-auto px-10`，標籤加上 `hidden sm:block`。和 `r1-to-r2-AuditWizard.diff` 一致。
- 寬度推算（標籤是絕對定位，以 40px 的圓圈為中心）：
  - 證據量到的英文標籤寬度：Project Info 約 66px、Personnel & Scope 約 108px、Checklist Setup 約 90px、Execution & Review 約 112px。最長的 "Execution & Review" 每邊比圓圈多出約 36px。
  - `px-10` 的 40px 是固定值，跟視窗寬度無關，所以頭尾標籤一定落在進度條本身的範圍內（約留 4px）。進度條外面還有浮層的內距（`px-4`＝16px，768px 以上是 `md:px-8`＝32px）。換成 Windows 的 Segoe UI 這類稍寬的字型，多出幾 px 也還在安全範圍。中文標籤 4 個字，約 48px，每邊只多出約 4px，不受影響。
  - 實測值和推算吻合：1024 寬時 Project Info 在 91px 開始、Execution & Review 在 956px 結束；1440 寬時是 299～1164px。進度條在 896px 上限內置中，兩種寬度的最後一個標籤都在進度條右緣內約 4px。
- 640～768px 放 4 個標籤會不會重疊：最窄的 640px 時，浮層內容寬 608px（如果系統顯示固定捲軸，再少約 15px），扣掉 `px-10` 剩 513～528px。4 個圓圈共 160px，剩下的平均分給 3 段連接線，相鄰圓圈中心距約 158～163px。相鄰兩個標籤至少需要的中心距是兩者寬度和的一半，最大的一組（Checklist Setup＋Execution & Review）約 101px。所以至少還有約 56px 的空隙，不會重疊。
- 640px 以下隱藏標籤：可以接受。390 寬時 4 個標籤加起來約 376px，本來就放不下（R1 版實測就互相壓到並超出畫面）。每一步的內容區都有自己的標題（`step1`、`stepPersonnelScope`、`step4` 的 h2，第 4 步是 `executionTitle` 的 h1），手機使用者仍然知道自己在哪一步。`hidden` 和 `sm:block` 的套用順序正確，絕對定位的 span 本來就會被當成 block，`sm:block` 不改變 640px 以上的呈現。
- 截圖（審查者親自看過）：`r2-screens/step1-1024.png` 的 "Execution & Review" 完整，最後的 "w" 沒被切到，左邊的 "Project Info" 也完整。`step1-390.png` 只顯示 1～4 的數字和短連接線，沒有溢出。

### REQUIRED_FIXES 2：版面檢查的寫法 — 已修正
- `audit-layout-check.mjs` 現在用 `input[name=auditDocNo]` 往上找 `.fixed` 浮層，量它的 `scrollWidth - clientWidth`，也保留頁面本身的量法。另外逐一取看得到的進度條標籤，檢查 `getBoundingClientRect()` 的左右都在 `[0, innerWidth]` 之內，標籤隱藏時如實寫「labels hidden」。
  - 標籤是浮層的子元素，超出右邊會算進浮層的 `scrollWidth`。超出左邊不會算進去，但標籤邊界檢查有 `left < 0` 補上。兩項合起來可以涵蓋 R1 的問題。
- `layout-check-against-R1.txt`：用修正後的腳本跑 R1 版元件，1024 寬時浮層溢出 4px，"Execution & Review" 從 916px 開始（約 112px 寬，右緣超出 1024），兩項都 FAIL。390 寬時浮層溢出 20px，標籤超出畫面，也 FAIL。1440 寬時 PASS。這和 R1 審查者手算的結果一致，證明新檢查確實抓得到 R1 的問題。
- `r2-isolated-run-report.txt`：全新資料庫，版面檢查最先跑（AHB-DRAFT-1 還沒被改成 Void，R1 的次要問題也解決了）。結果 13／13 PASS：1440 和 1024 寬時浮層和頁面都是 0px，4 個標籤都在畫面內；390 寬時 0px，標籤隱藏。

### REQUIRED_FIXES 3：重新產生並重跑 — 已完成
- E.patch 的 SHA-256 是 `4beeabb5…1b14`，和 STATUS 寫的相同。
- 審查者自己用 `git archive d4950aec` 匯出兩份，分別套上 E-R1.patch 和 E.patch 後比對。兩者只差：
  - `AuditWizard.tsx`：進度條的 class、2 段說明註解，以及列印摘要裡 3 個舊步驟註解的更正。
  - `audit-layout-check.mjs`：溢出檢查和標籤檢查。
  - `audit-polish-check.mjs:93` 的結果標籤，以及 `audit-smoke-all.mjs:85/93` 的註解和 A9 標籤，都把「step-5」改掉。
  - 沒有其他改動。`LanguageContext.tsx`、`audit-print-check.mjs`、`audit-ime-enter-check.mjs` 和 R1 完全相同。
- 部署候選 `Qualitas-deploy-artifacts/AUDIT-LAYOUT-2026-001/src-export/react-app` 的 `src/` 和 `tests-browser/`，跟 HEAD 套上 E.patch 的結果逐位元組相同（`diff -rq` 沒有差異）。工作樹裡已追蹤的前端檔也一樣，只多出未追蹤的 `.claude/` 和幾個 `*-vite-launcher.mjs`，不在候選裡。
- 兩個原始碼檔仍是 CRLF（1123／1123 行、2976／2976 行），SHA-256（`24c72255…05d9`、`62017528…1e26`）和 `r2-frontend-checks.txt` 相同。
- 審查者在工作樹重跑：`tsc --noEmit` exit 0；`npm test` 144／144；`eslint src/components/Audit` exit 0。
- 列印：`r2-print/` 頁數是 1／9／11，第 3、4 步各 60 個項目。審查者用 `pdftotext` 比對 R1 和 R2 三份 PDF 的文字，md5 完全相同，內容沒有改變。
- 回歸：小項檢查 9／9、輸入法 Enter 3／3、整體測試 22／22，都 PASS。NAS 暫存區已換成 R2 候選（`nas-prep-output-r2.txt`，live 仍是 AUDIT-POLISH）。

### 退步檢查
- `mb-8`：標籤隱藏時，進度條下方仍保留 32px 空白，和原本標籤佔用的位置一樣。390 寬截圖的間距正常，不算退步。
- 點擊範圍：按鈕（`w-10 h-10`、`onClick`）沒有改。標籤本來就不能點，隱藏也不影響。`px-10` 不會蓋到其他元素。
- 列印：進度條在 `no-print` 裡面，列印文字和 R1 相同。
- JSX 前的 `//` 註解是寫在括號內的運算式裡，語法合法，tsc 和 eslint 都通過。

### 次要觀察（不要求修，可順手處理）
- `audit-layout-check.mjs` 第 1 行的檔頭註解還寫 "no horizontal page scroll"。STATUS「修改檔案」表格裡對這支腳本的描述，也還是 R1 的「沒有橫向捲動」，沒提到浮層溢出和標籤邊界。
- 標籤檢查用數字文字找按鈕，已完成的步驟會顯示勾勾、沒有數字，所以會被略過。目前只在第 1 步量，沒有問題。如果以後要在後面的步驟重用，要改用別的找法。
- 640px 以下標籤已隱藏，`px-10` 其實可以只在 `sm:` 以上加。320px 寬時連接線會縮成 0（圓圈仍放得下、不溢出）。影響很小，不要求修。

## SCOPE_CHECK
- R1 到 R2 只動了進度條（含註解）、列印摘要的 3 個註解，以及 3 支測試腳本的檢查和標籤文字，都在 R1 REQUIRED_FIXES 和次要建議的範圍內。資料欄位、存檔、鎖定、權限、列印內容和流程都沒變，也沒有動後端。
- 工作樹裡另一個工作階段的材料模組改動（`backend/*`、`BACKLOG.md` 等）不在 E.patch，也不在部署候選裡。審查者沒有碰這些檔案。審查者只寫了本檔，暫存比對檔放在 session scratchpad。

## DECISIONS_CHECK
- 使用者定案的兩件事：加寬到 1400px 並改成 3 欄，以及合併第 2、3 步。R2 沒有改變這兩項。只有進度條本身回到 `max-w-4xl`，外框仍是 `max-w-[1400px]`。
- 640px 以下只顯示數字是 R1 所列「手機標籤擠在一起」的修正方式（R1 REQUIRED_FIXES 2 允許「可以一起修」），沒有把未確認的業務規則變成政策。

## VERDICT
- [x] PASS
- [ ] REVISE
- [ ] HUMAN_REQUIRED

## REQUIRED_FIXES
無。

## NEXT_STEP
可以依既有的部署授權（PASS 後已完成準備即可部署），用 NAS 暫存區的 R2 候選部署前端。這次只改前端，不需要重建後端，也不需要 Python 3.11 檢查。部署後確認 live index 已更新，並在 1024 寬看一次第 1 步的進度條。上面的次要觀察可以下次再順手處理，不影響本輪。
