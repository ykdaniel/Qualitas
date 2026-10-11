# AUDIT-BTNFIX-2026-001 — REVIEW

TASK_ID: AUDIT-BTNFIX-2026-001
ROUND: R1（審查對象：C1 `056c2fa5…`、C2 `034a053b…`，現存為 `evidence/C1-R1-reviewed.patch`、`evidence/C2-R1-reviewed.patch`）

結果：**PASS**（獨立 Claude 審查，2026-10-11）

## 必改
無。

## 建議（不擋合併）與處理
| # | 建議 | 處理 |
|---|---|---|
| 1 | `DATA_TABLE_TEXT_EN` 的型別是 `Record<string,string>`，所以 `keyof` 等於 string，打錯鍵時型別檢查擋不住；帶參數時 `fill(undefined)` 會丟例外，整張表掛掉。 | **已改**：改為 `as const satisfies Record<string, string>`，打錯鍵會變成 tsc 錯誤。 |
| 2 | 狀態欄的註解是從承包商欄複製過來的，內容不符。 | **已改**：改寫狀態欄的註解。 |
| 3 | 既有問題：共用 Button 有 `disabled:pointer-events-none`，灰色刪除鈕的 `title` 提示（請先作廢）滑鼠移上去永遠不會出現。可以改放到外層 div 的 title。 | **已改（使用者 2026-10-11 選「要，滑鼠移上去顯示提示」）**：外層 div 加上 `title={canDelete ? undefined : hint}`，瀏覽器檢查新增 3 項。 |
| 4 | 測試證明力的界線：<br>• 狀態欄篩選 Void 在 HEAD 上也會 PASS，只能當回歸防護。<br>• 單元測試的退回路徑只渲染了 Pagination。<br>• NOI、OSD、會議記錄的截圖都是空表。 | 記錄。審查者另外用有資料的 IAM 使用者清單實測：中文分頁、選取列數、標題選單、篩選框都正常，沒有原始鍵名。 |
| 5 | HEAD 已經推進到 `f21e3716`。審查者確認兩份 patch 在新 HEAD 上可以乾淨套用，tsc 為 0，`npm test` 168 項全部通過。 | 提交時以當時的 HEAD 為基準重做，用暫存 index 提交，不 force。 |

## 建議 1、2、3 修改後的驗證
- 修改後的 patch 是 C1 `3f703be3…`、C2 `09c07a8e…`。和審查版本相比，只差上面 3 處，以及測試新增的 3 項，以 interdiff 確認。
- 開發複本：
  - tsc 為 0。
  - eslint 為 0。
  - `npm test` 164 項全部通過。
  - 瀏覽器檢查重跑（全新的 3324）：**32 項全部 PASS**，含 3 項滑鼠提示檢查，見 `evidence/browser-check.txt`。
- 最終候選（AUDIT-BUTTONS cand-final + C1 + C2）：tsc 為 0，`npm test` 148 項全部通過，build 為 0，見 `evidence/final-candidate-frontend-checks.txt`。

## 審查者驗證摘要
- **patch 一致性**：base + C1 + C2 和開發複本逐檔相同。
- **換行與權限**：CRLF 和 LF 都維持原樣，沒有 mode 變更。
- **C1、C2 分離**：兩者分得乾淨；只套 C1 也能通過 tsc 和測試。
- **找不到鍵、沒有 Provider**：一律退回英文，不會顯示原始鍵名。
- **hooks 規則**：hook 在提前 return 之前呼叫，符合規則。
- **共用 DataTable 的行為**：
  - searchPlaceholder 的語意不變。
  - 17 處 ColumnHeader、5 處 checkDateOrder 都通過型別檢查，行為和原本相同。
- **#36**：選「全部」時，TanStack 會移除這個篩選，所以不會進到篩選條件。
- **#41**：外層 div 只擋 click。可用的刪除鈕按 Enter 正常。
- **唯讀橫幅**：顯示條件和 readOnly 完全一致，原因的優先順序正確。
- **#68**：行為和 update() 改日期時的處理一致。
- **對照組**：對照組的失敗涵蓋了所有修正項目。

## 複審（只看變更的部分，2026-10-11）：**PASS**，原本的 PASS 維持
- `as const satisfies`：只改型別、不改行為。審查者以同樣寫法驗證，打錯的鍵會得到 TS2345。
- 外層 div 的 title：審查者在 3324 用 elementFromPoint 實測。
  - 停用時，按鈕中心、邊緣和按鈕旁的空白處都會顯示提示；td 的 padding 不會。
  - 可用時，只會出現「刪除」，不會和提示同時出現。
  - 讀屏念出的名稱和修改前相同。
- 兩份 patch 都沒有 mode 變更，columns.tsx 仍是 CRLF。tsc、eslint 為 0，`npm test` 164 項全部通過，瀏覽器檢查 32 項全部通過。
- 建議（不擋合併）：headless 截不到瀏覽器原生的提示框，請使用者預覽時手動把滑鼠移上去看一次。
