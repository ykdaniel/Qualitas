# AUDIT-TEMPLATES-2026-001 — REVIEW（R2：REVISE，存檔）

TASK_ID: AUDIT-TEMPLATES-2026-001
ROUND: R2（審查對象：G.patch `1460efd3…`，基準 HEAD `1dc87c2a`）
審查者：獨立 Claude 審查，2026-10-11。結果：**REVISE**

## 必改
1. **取消勾選類型後，已選的條文還留在新增表單裡，按「+」仍會加入那個類型的題目。**
   - 位置：`AuditWizard.tsx` 的 pickedClause、addCustomItem。
   - 實測（8325）：選 4.1（全部）→ 取消勾選 ISO → 按 +，加入了 2 題，但儲存後 `selected_templates` 是空的，和題目對不上。
   - 建議修法：pickedClause 只從 selectedTypes 中找模板；取消勾選時重設表單；從模板加入題目時，確保類型名稱在 selectedTemplates 裡。
2. **批次挑題「套用」會刪掉模板已刪除題目的未填複本，按鈕卻顯示「移除 0」。**
   - 位置：applyTemplatePick 的 kept。
   - 實測：模板刪掉第 1 題後，在稽核中套用挑題，「Q one」被移除了。這違反 DECISIONS「修改模板不影響已帶入的稽核」。
   - 建議修法：kept 和 removes 只處理目前模板裡還有的題目。

## 建議
1. 「離開分頁後再導覽不會提示」這項檢查用的是 `p.goto`（整頁重新載入），所以永遠會通過，應改用 app 內的連結。
2. 模板改名後的殘留情況：先取消舊名稱的晶片，題目就失去對應的類型名稱。
3. AutoGrowTextarea 只在值改變時重算高度，視窗變窄後內容會被裁掉。
4. 沒用到的翻譯鍵：`pickQuestion`、`audit.wizard.selectISOClause`、`audit.wizard.customClause`。
5. 重名時的 409 直接顯示後端的英文訊息，應改成友善的中文訊息。
6. 部分註解仍寫著舊設計；`fillText` 只是 `t` 的別名。
7. 後端：`strip_text` 收到非字串會存下來而不是回 422；沒有 2000／2001 字的邊界測試；讀取 schema 允許 items 裡有非物件元素。
8. STATUS 的檔案數寫錯（實際是 22 個檔案、新增 10 個）。

## R1 必改複核
- 必改 1：通過。
- 必改 2：大致通過，殘留情況見建議 2。

## 審查者的驗證
- patch 和候選樹一致；沒有 mode 變更；不含其他工作階段的修改；CRLF 都保留。
- ISO 的 JSON：116 題、59 條、id 不重複、每題都有標題。
- pytest：205 passed、14 skipped；需要 git 的遷移測試 6 passed。
- tsc、eslint 為 0，`npm test` 169 項全部通過。
- 在 8325 上：templates-check 33 項通過、ime-check 3 項通過；另以 probe 腳本重現了兩項必改。
