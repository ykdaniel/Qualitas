# AUDIT-PRINT-2026-001 — REVIEW（R3 獨立審查）

- 審查者：獨立 Claude 審查（GPT 額度用盡，使用者指定）
- TASK_ID: AUDIT-PRINT-2026-001
- ROUND: R3（R1、R2 為 REVISE，原文見 `AUDIT-PRINT-2026-001-R1-REVISE-REVIEW-archive.md`、`-R2-REVISE-REVIEW-archive.md`）
- 審查日期：2026-10-10（UTC 16:10 前後）
- 基準：部署候選 = `git archive 688d87b3` + `evidence/G.patch`（R3）。另以 `git archive HEAD`（`127d187e`）交叉套用。

## EVIDENCE_CHECK

**實測**＝本審查自行執行；**讀碼**＝只讀程式判斷。

1. **補丁與留存（實測）**
   - 三份補丁的 SHA-256：
     - `G.patch`：`7c7284e2…74fe`，和 STATUS 相符，共 6 個檔案。
     - `G-R2.patch`：`0a7b9519…a545`，和 R2 審查時相同。
     - `G-R1.patch`：`173b2e1a…cefa`。
   - R2 的 REVIEW 已留存為 archive（勾選 REVISE）。
   - `G.patch` 在 `688d87b3` 和 `127d187e` 上都能乾淨套上，6 個檔案都和工作樹逐位元組相同。
   - R2 → R3 的差異只有 `Audit.print.css`（隱藏規則改寫、`@page audit` 加 `!important`、註解）和檢查腳本。後端和 R2 完全相同，兩個後端檔案的 SHA-256 前 16 碼為 `9121011db169b1fe` 和 `90122160b2d04423`。
   - `audit_service.py` 和 `AuditWizard.tsx` 都維持 CRLF。
2. **重跑瀏覽器檢查（實測）**
   - 我用 `cand-live3` 自己啟動隔離環境：8320/3320，`isolated_stack.py up`，全新資料庫，種子 hardening_b + export_docx。`cand-live3` 的 `backend/` 和 `react-app/src` 都和「688d87b3 + G.patch R3」相同。用完已經 `down`，連接埠也確認釋放。
   - `audit-print-template-check.mjs` **17 項 ALL PASS**，和 evidence 一致：
     - 計畫 1 頁、查檢表 1 頁、報告 2 頁。
     - 每一頁都是 595×842，而且都有文字。
   - `browser-check-control-on-R2.txt`（對照組）證明新的 PDF 檢查確實抓得到 R2 的空白頁。
3. **R2 必改 2：頁面設定隔離（實測，用 `preferCSSPageSize` 輸出 PDF）**
   - 開過下列頁面再回 Audit 列印報告，全部是 2 頁、A4 直向，第 1 頁有內容，字數和直接列印相同：
     - ITP 清單
     - ITP 詳細頁
     - Checklist
     - KM
     - NOI
   - 只開 ITP、以及 ITP → Audit → ITP，兩者都是 Letter 橫向，Audit 不會影響 ITP。
   - 開過 Audit 之後列印 Dashboard，內容正常（Letter），`#root` 沒有被隱藏。
   - **已修正。**
4. **R2 必改 1：空白第 1 頁，仍有一條路徑會出現（實測）**
   - **Audit → ITR → 再回 Audit 列印報告：3 頁，第 1 頁 0 字元（空白），第 2、3 頁才是內容。**
   - 依序開過 NCR、OSD、OBS、PQP、FAT、材料、會議紀錄、NOI、ITR、ITP、ITP 詳細頁、Checklist、KM 之後再列印，結果也一樣。
   - 原因：`ITR.module.css` 在 `@media print` 裡有 `#itr-single-print-root { display: block !important; … }`。
     - 它是 ID 選擇器，specificity 是 (1,0,0)。
     - R3 的 `body:has(> .audit-print-root) > :not(.audit-print-root)` 只有 (0,2,1)，兩者都是 `!important`，所以 ITR 的規則勝出。
     - 結果 `index.html` 那個空的 `#itr-single-print-root` 又恢復成 block，在具名頁面下自己佔了一頁。
     - 實測：開過 ITR 後列印時，`#itr-single-print-root` 的 computed display 是 `block`，子元素 0 個。
   - 驗證改法：在同一個畫面加上 `body:has(> .audit-print-root) > #itr-single-print-root:empty { display: none !important; }`（specificity (1,2,1)）後，變成 2 頁、第 1 頁有內容。
   - ITR 是常用模組，同一個分頁先開 ITR、再去 Audit 列印是很普通的操作。這正是本輪要修的空白頁問題，所以**阻擋**。
   - 檢查腳本只預先載入 NCR、ITP、Checklist，沒有載入 ITR，所以沒有抓到。
   - 我查過其他 body 層級的列印容器：`#noi-batch-print-root`、`#itp-print-root`、`#checklist-print-root` 都只在該模組列印時由 React 渲染，不會常駐在 body。常駐的只有 `index.html` 的 `#itr-single-print-root`。（讀碼）
5. **其餘部分（R2 已驗證，本輪沒有變動）**
   - 完成率三處一致（13%、58%），檢查已重跑通過。
   - 只有條文的題目、printJob、廠商名稱備援、抬頭寫法：檢查已重跑通過。
6. **Python 3.11（實測）**
   - `cand-live2` 兩個後端檔案的 SHA-256 前 16 碼，和 R3 候選相同（`9121011db169b1fe`、`90122160b2d04423`）。
   - 兩個檔案的 mtime 都是 2026-10-10T23:41:10+0800（即 15:41:10Z），早於 3.11 開始的 15:43:05Z。
   - 但 `py311-full-suite.txt` 在 UTC 16:14 仍只到 `pip_exit=0`，**尚未完成**。
7. **文件（讀碼）**
   - TASK 的範圍說明已更新，新增了 R2、R3 追加範圍，和實際改動一致。
   - STATUS 的「行為變化」寫「先開過其他模組再列印，不會再是空白頁」，在開過 ITR 的情況下不成立。

## SCOPE_CHECK

- R3 只改了 `Audit.print.css` 和檢查腳本，在 R2 審查要求的範圍內。
- 部署候選仍以 `688d87b3` 為基準，沒有混入 HEAD 上其他工作階段的 ITR、NOI 改動。
- 下面的修正只需要動 `Audit.print.css` 和檢查腳本，後端不變，所以 3.11 結果可以沿用，前提是它跑完並且通過。
- 審查期間我只用自己啟動的隔離環境（已關閉），並在 scratchpad 產生 PDF；沒有碰 8198/3198、8240/3240 或正式站。

## DECISIONS_CHECK

- 沒有違反現行決策。
- 完成率改成四捨五入，是使用者的選擇，記在 TASK。
- 部署可以適用「每批 PASS 後完成準備即提交、推送及部署」，前提是 PASS 並且 3.11 通過。

## VERDICT

- [ ] PASS
- [x] REVISE
- [ ] HUMAN_REQUIRED

## REQUIRED_FIXES

1. **開過 ITR 再列印 Audit，仍然有空白第 1 頁**
   - 在 `Audit.print.css` 的 `@media print` 加一條 specificity 高於 `#itr-single-print-root` 的規則，例如 `body:has(> .audit-print-root) > #itr-single-print-root { display: none !important; }`。已實測有效：2 頁，第 1 頁有內容。
   - 或者讓既有的通用規則帶有 ID 等級的 specificity（例如 `> :not(.audit-print-root, #_)`）。這個寫法比較取巧，請在註解說明原因。
   - CSS 註解要寫明：其他模組會用 ID 加 `!important` 把常駐的兄弟節點設回 block。
2. **檢查腳本**
   - 在 PDF 檢查前預先載入的模組中加入 **ITR**。建議直接比照本審查，把有列印 CSS 的模組都載入一遍：NCR、OSD、OBS、PQP、FAT、材料、會議紀錄、NOI、ITR、ITP、ITP 詳細頁、Checklist、KM。
   - 並保留對照組：用新的檢查跑 R3 候選，應該在 ITR 情境 FAIL。
3. **3.11**
   - 等 `py311-full-suite.txt` 跑完並且 pytest_exit=0，才能部署後端。
   - 雜湊比對已確認一致；修正 1、2 不動後端，所以這次結果可以沿用。
4. **文件與證據**
   - 修正後重新產生 `G.patch`、更新 SHA-256，並更新 STATUS「行為變化」中空白頁的說法。
   - 重跑 tsc、eslint、build、`audit-print-template-check.mjs` 和三支回歸測試，證據放進 evidence。

**非阻擋建議**：無新增。Safari 和 Firefox 仍未實測，STATUS 已註明。

## NEXT_STEP

1. 實作者完成修正 1～4。這次範圍很小，只動 CSS 一條規則和檢查腳本。
2. 依規則把本 R3 的 REVIEW 封存，STATUS 更新為 R4，交 R4 獨立審查。
3. R4 PASS，並且 3.11 已通過之後，依 DECISIONS 的持續授權，以 `688d87b3` 加最終的 `G.patch` 部署前端並重建後端。
