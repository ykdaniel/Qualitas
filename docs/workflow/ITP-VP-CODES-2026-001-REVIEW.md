# REVIEW — ITP-VP-CODES-2026-001

TASK_ID: ITP-VP-CODES-2026-001
審查者：獨立 Claude 審查代理（唯讀；GPT 暫停中）
對象：worktree `/Users/nook/Documents/Qualitas-wt-itp-vp-codes` 的 commit `65280cae`（父 `247ee771`）

## 判定：PASS（沒有必改項目）

## 審查代理自己執行的檢查
- 範圍：只改了 `VPBadge.tsx`、`ITPAdvancedEditor.tsx`、`ITPDetail.tsx`，沒有動 LanguageContext。
- 換行：commit 裡 VPBadge.tsx 49/49 行、ITPAdvancedEditor.tsx 695/695 行都是 CRLF；ITPDetail.tsx 父版本原本就是 LF，仍為 LF（0/930）。
- `npx tsc --noEmit -p .`：exit 0。
- eslint（三個檔）：0 error。11 個 warning 都是既有的沒用到的 lucide import。`.eslintrc.json` 沒有開 `react-refresh/only-export-components`，所以匯出 `VP_CODES`／`VPOptions` 不會有 warning。

## 結果
1. 舊值邏輯正確（VPBadge.tsx:9-18）。兩個 `handleVPChange`（ITPDetail.tsx:326、ITPAdvancedEditor.tsx:221）只改 `vp[role]`；每個下拉各自用自己的值產生舊值選項，所以改其他格時，沒動過的舊值會保留。
2. 不會產生重複的選項值：舊值不可能是 ""，也不可能是標準代碼。
3. 字面值「-」：下拉顯示「-」選項，沒有 React 警告；沒動就存回「-」，選「-」則存成 ""。
4. 列印（ITPPrintTemplate.tsx:12、98-101）沒有退步。改成 min-w 後，W/R、N/A 不再溢出。有一個看得到的改變：字面值「-」現在印成淡色破折號，和空白格相同，不再是有框的「-」。這是刻意的。
5. 非必改：某一格改成標準代碼後，原本的舊值選項就會消失；要恢復，只能按 Cancel 取消這次編輯。這符合設計，建議讓使用者知道。
6. 非必改：N/A 樣式加了 `text-xs`，但基本樣式已有 `text-sm`，實際大小取決於 Tailwind 的 CSS 順序。只影響外觀；隔離環境截圖中 N/A 在 32px 內完整顯示。
7. 非必改：大小寫或空白不同的值（例如 "h"、"n/a"、"H "）會顯示為舊值。沒有做任何資料對應，可以接受。

## 處理
第 5–7 項不修。第 5 項在交給使用者預覽時一併說明。

---

## 第二輪：commit `5ba6bd26`（Q 退役：啟動遷移步驟 30、前端、圖例）

審查者：獨立 Claude 審查代理（唯讀）。**判定：PASS（沒有必改項目）**

### 審查代理自己執行的檢查
- db_migrations.py 的 commit 版本 2241 行全部是 CRLF；步驟 30 是加在檔尾的獨立函式，另外只在 run_migrations 第 29 步後加了一行註冊。
- `pytest tests/test_itp_vp_q_migration.py`：3 passed；`tsc --noEmit`：exit 0。

### 確認沒問題的地方
- 清除迴圈（db_migrations.py:2216-2222）寫入前會再確認一次是不是 Q，所以 id 重複只會清掉 Q；沒有 id 的項目也會清。除了 Q，不會改到別的值。
- Transaction：SQLAlchemy ≥ 2.0.36 中，離開 `engine.connect()` 時如果沒有 commit，會自動 rollback。出錯時不會寫一半，下次啟動會重試；旗標和資料在同一個 transaction 寫入。
- JSON 重寫：鍵的順序和數值不變。有改動的列會從 `\uXXXX` 變成直接存 UTF-8（步驟 27 也是這樣），沒有 Q 的 ITP 不會重寫。

### 非必改，以及處理方式
1. `itpParser.ts:62` 也接受舊格式：整個 detail_data 是一個 list。遷移不處理這種格式。→ **已查正式站（唯讀）**：141 份有效的 detail_data 全部是 object，含 "Q" 的剛好 35 份，沒有 list 格式。上線後請核對 log 是不是「35 templates, 1431 cells」。
2. VPBadge.tsx:39 的註解還寫著 Q。→ **已修**（`2cb81745`）。
3. 編輯器裡的 Q 格會顯示「-」，但存的值仍是 Q；沒動就原樣存回。遷移會先清掉所有 Q，後端也不會寫 Q，所以可以接受。→ 不修。
4. 測試沒有涵蓋失敗時的 rollback。→ **已補**（`2cb81745`）：把 audit_logs 改名，讓 INSERT 失敗，確認 detail_data 和旗標都沒變；改回後再跑一次，確認會清掉 Q，而且只寫一筆 audit。
5. 圖例只有 en／zh；如果以後加第三種語言，`filter(Boolean)` 會略過。→ 不修。

`2cb81745` 只改了一行註解，另外新增 1 個測試，沒有送審查代理再看一次。
