# AUDIT-TEMPLATES-2026-001 — REVIEW

TASK_ID: AUDIT-TEMPLATES-2026-001
ROUND: R3（審查對象：G.patch `37a590e2…`，基準 HEAD `1dc87c2a`）

結果：**PASS**（獨立 Claude 審查，2026-10-11）。R1、R2 的審查結果都是 REVISE，原文見 `-R1-REVISE-REVIEW-archive.md`、`-R2-REVISE-REVIEW-archive.md`。

## R2 必改的複核
1. **取消勾選類型後，表單殘留：已修正。**
   - 審查者在 8325 重跑 R2 的重現腳本，兩種情況（選條文後取消勾選、選單題後取消勾選）都重現不出來：表單清空，「+」加入 0 題。
   - 另外驗證「從模板加入時一定會補上類型名稱」：先用 API 清空 `selected_templates`，再加入全部或單題，儲存後都是 `["ISO 9001:2015"]`。
2. **批次挑題誤刪模板已刪除題目的複本：已修正。**
   - 模板刪掉第 1 題後套用，按鈕顯示「新增 1、移除 0」，舊複本仍在。
   - 取消勾選類型時，仍會依決策移除全部未填寫的複本。

## 新程式是否弄壞其他東西：沒有
- `pickedClause` 依賴 `selectedTypes`，每次 render 都會重算，但裡面沒有 setState，不會造成迴圈，實測也沒有錯誤。
- 已選的條文在題目變動時維持選中，只會正確標示「已加入」。
- AutoGrowTextarea：ResizeObserver 會在卸載時 disconnect；實測把視窗寬度從 1400 縮到 900 再拉回 1400，內容都沒有被裁掉。
- 刪除的翻譯鍵已經沒有任何引用；新增的翻譯鍵 en、zh 都有；409 會顯示翻譯過的訊息。
- 後端：題目欄位收到 list 或 object 回 422；2000／2001 字的邊界、損壞的資料列都有測試。小事：布林值 `true` 會被存成 "True"，不需處理。

## 建議（不擋合併）
- 建議 2（模板改名後先取消舊名稱，名稱和題目會脫鉤）記為已知限制，審查者同意。

## 審查者的驗證
- patch 和候選樹逐檔相同；22 個檔案、新增 10 個；沒有 mode 變更；CRLF 都保留；不含其他工作階段的修改。
- pytest：207 passed、14 skipped；以唯讀 GIT_DIR 跑模板的 http 和 migration 測試：17 passed。
- tsc、eslint 為 0，`npm test` 169 項全部通過。
- 在全新 stack 上，audit-templates-check 全部通過。新增的 3b 斷言在 R2 程式上會 FAIL，代表這幾項檢查確實有效。
