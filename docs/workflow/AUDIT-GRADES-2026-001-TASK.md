# AUDIT-GRADES-2026-001 — TASK（稽核結果四級＋查檢表欄位拆分）

TASK_ID: AUDIT-GRADES-2026-001
ROUND: R0（規格，尚未實作）

## 來源
2026-10-11 使用者在 3322 預覽查檢表列印時提出：「列印怎麼把條文重點跟問題放在一起，而且結果只有 Pass Postive Major Minor」。

## 已定案（使用者 2026-10-11 選擇）
1. **查檢項目表的欄位**：拆成「條文編號｜條文內容｜查檢重點｜結果｜備註」，兩欄並排。查檢表、報告（列印）和 Word 都改。
2. **結果改為四級，全面適用**：Pass／Positive／Major／Minor 用於第 5 步的評分按鈕、統計卡片、進度、查檢表與報告的列印和 Word。原本的「不符合 Fail」和「注意 Attention」不再提供。
3. **舊資料的「不符合 fail」**：不自動改資料，照舊算不符合，顯示為「不符合（未分級）」。編輯時由稽核員改選 Major 或 Minor；已結案的稽核維持原樣。
4. **還沒評的題目**：空白，算「未評」，不計入進度。舊資料的「注意 pending」也視為未評。

## 已定案（使用者 2026-10-11 第二批選擇）
5. **中文名稱**：符合 Pass、正面發現 Positive、主要不符合 Major、次要不符合 Minor。
6. **完成率**：已評題數除以全部題數。四級中任一級都算已評；舊資料的「不符合（未分級）」也算已評；未評的不算。
7. **不新增符合率**：統計卡片和報告摘要列出 Pass、Positive、Major、Minor、不符合（未分級，只在有舊資料時出現）、未評各自的數量，以及完成率。不需要定義哪些結果算符合。
- 查檢表（空白版）的勾選框改為四級。

## 盤點：哪些地方讀寫稽核結果（2026-10-11，唯讀搜尋整個 repo，依協調中心要求）
目前的值是 `'pass'`、`'fail'`、`'pending'`，或沒有值。所有計數的地方都把「不是 pass／fail」的視為 pending。完成率在 3 處用同一條公式：整數四捨五入的 `(total − pending) / total`。

**會從結果算數字的地方（只有這 3 處，加上 1 個判斷）**
1. `AuditWizard.tsx` 第 5 步：
   - `stats`：完成率、已完成數、Pass／Fail 數與長條。
   - 頁尾圖例：Pass／Warning／Fail 的數量。
2. `AuditPrintTemplate.tsx`：`auditProgress` 和計數，用在報告第 5 段的摘要（Total、Progress、Pass、Fail、Attention）。
3. `audit_service.export_docx`：同樣的計數和完成率，用在 Word 報告第 5 段的摘要。
4. `AuditWizard.tsx` 的 `isFilledItem`：pass／fail 或有備註，就算「已填寫」，用來決定取消模板時保留哪些題目、挑題視窗鎖定哪些題目。**這裡要把新的四級都算進去。**

**只顯示或寫入結果文字的地方**
- 第 5 步的 3 個結果按鈕（測試用 title 當選擇器）、備註欄。
- 列印的 `RESULT_TEXT`、報告各列的結果、查檢表的空白勾選框。
- Word 的 `_RESULT_TEXT`、報告各列、查檢表的勾選框。
- LanguageContext 裡的 `audit.wizard.stat*`、`legend*`、`audit.templates.keptFilled`。

**沒有用到結果的地方**
- Dashboard（`useDashboardStats.ts` 的 pass rate 屬於 Checklist 模組）、KPI（前端和後端）、Owner Performance、scheduler：**完全不讀稽核資料**。
- Audit 清單、VendorStatsPanel、ScheduleMatrix、AuditStatusIcon、逾期判斷：只用稽核本身的狀態（Draft／Closed…），不讀題目結果。
- BTNFIX 的欄位篩選篩的是稽核狀態，第 5 步的篩選只依條文和文字。**兩者都沒有依結果篩選。**
- 稽核沒有 CSV 匯出；`findings` 只會被編輯、列印和匯出 Word。

**後端驗證**
- `schemas.py` 的 `custom_check_items` 是 `Any`，**沒有結果值的白名單**，新值可以直接存。
- `_comparable`（已關閉／作廢的鎖定）比對整份 JSON，對結果值沒有特別處理：原樣重存不會被判定為修改，改了結果才算修改。
- 所以如果不加白名單，舊資料的讀寫天然相容；如果要加白名單，必須接受舊的 `fail`／`pending`／空值，並照 agenda kind 的做法處理（schemas 是共用檔，動手前要先通知協調中心）。

**會受影響的測試**
- `test_audit_export_docx_http.py`：摘要、各列文字、完成率的進位案例、查檢表勾選框。
- `audit-all-buttons-check.mjs`、`audit-print-template-check.mjs`、`audit-templates-check.mjs`：按鈕 title、統計卡片、列印和 Word 的文字要一致。
- 驗證用的 seed：`seed_audit_export_docx_review.py`、`seed_audit_polish_review.py`。

## 要請使用者決定的計算規則（已由使用者在第 5～7 點決定）
目前系統只顯示「完成率」和各結果的數量，**沒有任何地方計算符合率**。所以只需要決定：
1. **完成率**：分子是四級中任一級的題目數，分母是全部題目（舊的 fail 也算已評）。建議沿用。
2. **摘要和統計卡片**：分別列出 Pass、Positive、Major、Minor、不符合（未分級，只有舊資料才出現），以及未評的數量。
3. **要不要新增「符合率」**：如果要，Positive 是否算符合（建議算）、Major 和 Minor 是否都算不符合（建議都算）、分母要不要排除未評的題目（建議排除）。不新增的話，就不需要這些規則。

## 範圍（初估）
- 前端：AuditWizard 第 5 步（按鈕、統計、篩選、進度）、AuditPrintTemplate／Audit.print.css（三份列印的查檢表欄位與結果）。
- 後端：`audit_service`（Word 的結果文字、統計、進度）、可能的 schema 驗證（結果值白名單）。
- 測試：既有的 export／print 檢查，改為新的四級與欄位。
- DECISIONS 新增一條（結果分級屬於稽核規則）。

## 順序
接在 AUDIT-TEMPLATES R2 之後進行。兩者都會改到 AuditWizard，而且查檢表的欄位拆分要以 R2 的長條文為準。
