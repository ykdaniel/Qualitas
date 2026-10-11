# AUDIT-GRADES-2026-001 — REVIEW

TASK_ID: AUDIT-GRADES-2026-001
ROUND: R1
審查者：獨立 Claude 審查 subagent。全新 context，只讀 TASK、STATUS、G.patch（R1）和佐證；另外自己開 8325/3325 隔離 stack 實測。
結論：**PASS**

## 必改
無。

## 建議（處理情形見 STATUS「R1 審查後」）
1. 列印 `RESULT_TEXT[s]` 是普通物件查表。
   - status 為 `'__proto__'` 時會拿到 Object.prototype，React 丟錯、wizard 被卸載；status 為 `'constructor'` 時那列結果是空白。
   - 只有直接呼叫 API 才能寫入這種值，而且 HEAD 已經有這個問題。
   - **已修**：只查自身 key。
2. Wizard 統計把非物件題目也算進總數；列印／Word 會先濾掉，兩邊數字不同。HEAD 已經有這個問題。**已修**：wizard 用同一個過濾條件。
3. 1024 寬時 6 張統計卡溢出。
   - **已依使用者選擇修正**：窄螢幕 3×2。
   - 狀態欄 `w-64` 讓備註欄在 1024 寬變窄，維持現狀。
4. TASK 第 7 點寫「統計卡片…列出未評」，實作是放在圖例。**使用者選「放圖例就好」**，DECISIONS 已補寫清楚。
5. 過時註解「(pass / fail)」。**已修**。
6. 測試覆蓋：
   - Word 檢查只比對字串，沒有驗數字；沒有驗清除後的 updatedAt。**已補**。
   - `audit-all-buttons-check` 的舊 title：工作樹版本已經更新，211 PASS。
7. 小問題：
   - 兩行連續空行。**已修**。
   - 清除結果時 status 存成 `''`、updatedAt 變成今天，報告上會出現「未評」配今天日期。語意上可以接受，維持現狀。

## 審查者已驗證（摘要）
- **patch**：R1 patch 套在 89671cbb 上乾淨，和 cand-review 完全相同；只動 10 個檔案；DECISIONS 只新增本條。
- **LanguageContext**：用 HEAD 加 `i18n_grades.py` 重建，和 cand 的檔案逐位元相同。
- **檔案格式**：CRLF 與檔案權限和 HEAD 一致。
- **欄寬**：Word 17.4 cm；列印 100%。兩邊比例一致。
- **摘要版面**：Word 的 field grid 和列印的 colSpan 版面對應正確。
- **讀取結果的地方**：只有 AuditWizard、AuditPrintTemplate、`export_docx` 三處。
- **後端**：audit 測試 216 passed、1 skipped。
- **前端**：tsc 0、eslint 0、unit 169/169。
- **瀏覽器**：`audit-grades-check` 17/17。
- **奇怪 status 探測**：15 種，wizard、列印、Word 三邊數字一致。唯一不一致的是第 1 點 `'constructor'` 那一列的結果文字。

---

ROUND: R2（只審 R1 PASS 之後的差異：R1-to-R2-delta.diff；完整 patch 的 base 改為 e880abb7）
審查者：另一個全新 context 的獨立 Claude 審查 subagent。另外開了 3325/8325 隔離 stack 實測，結束後已執行 down。
結論：**PASS**

## 必改
無。

## 已驗證（摘要）
- **patch**：在 `git archive e880abb7` 上套用乾淨，結果和 cand-e880 相同。R2 的全部改動都在 delta 內。
- **CRLF**：保持原樣。
- **列印結果文字**：`'__proto__'`／`'constructor'` 會回到「未評」。
- **非物件題目**：wizard、列印、Word 三邊數字一致（實測：總數 2、50%、Pass 1）。
- **3×2 版面**：
  - 768、800、900、1024、1100、1279 寬，中英文都是 3×2。
  - 1280、1366、1400、1600 寬都是一排。
  - 都沒有溢出、截字或頁面橫向捲軸。
- **新斷言會在出錯時失敗**：
  - 版面：改回六欄會被抓到。
  - Word 摘要：完全相等比對。
  - updatedAt：第 1 題只被點過一次，就是清除那一下。
  - all-buttons：鎖定與按鈕組都用精確比對。
- **tsc／eslint**：0。
- **audit-grades-check**：19/19。

## 建議與處理
- 第 2 段（已結案稽核的 Word 摘要）原本只檢查 3 個值。**已改成整份摘要完全相等比對**。
- 第 4 段原本只在 1400 寬檢查一排、沒查截字。**已改用 1280 寬（最窄的一排寬度），並檢查截字**。
- all-buttons 檔頭的 reset 腳本說明互相矛盾。**已改正**。
- 改完後在 cand-e880 重跑 audit-grades-check，結果 19/19。G.patch 已重產，sha256 見 patch-sha256.txt。
- R1 範圍內、R2 沒有變動的部分維持現狀，之後另外評估：
  - 手動寫壞 JSON 時，表格仍會列出非物件題目的列。
  - 768 寬時查檢表的表頭被擠成直排。
