# AUDIT-BUTTONS-2026-001 — REVIEW（R2 獨立審查）

- 審查者：Claude（獨立審查，GPT 額度用盡，由使用者指定）
- TASK_ID: AUDIT-BUTTONS-2026-001
- ROUND: R2（R1 為 REVISE，原文見 `AUDIT-BUTTONS-2026-001-R1-REVISE-REVIEW-archive.md`）
- 審查日期：2026-10-11
- 基準：候選樹 = `git archive 86932e29`（目前 HEAD）+ `evidence/G.patch`，解在 `$TMPDIR`。
- 所有判定都以審查者自己跑出的結果為準，STATUS 只作對照。

## EVIDENCE_CHECK

### 1. 補丁
| 項目 | 結果 |
|---|---|
| G.patch SHA-256 | `24e5d9fe1e774e1b4b12e49b71f7e316bb5789c9324c0d0ddf9c01141cf95778`，**與 STATUS 一致**。G-R1.patch 仍是 `8b9fa113…`，與 R1 相同 |
| 套用到 `git archive 86932e29` | `--check` 通過，可乾淨套上 |
| 檔案數 | **15 個**，與 R1 相同。DECISIONS、validators、noi、MeetingMinutes 都不在補丁內 |
| 與工作樹比對 | 15 個檔案全部逐位元組相同（`LanguageContext.tsx` 也相同，`git diff HEAD` 只有 `stepAgenda` 中英 2 行） |
| CRLF | audit_service.py 658/658、routers/audit.py 133/133、AuditWizard.tsx 1254/1254、auditStore.ts 141/141、LanguageContext.tsx 3088/3088，**全部保留 CRLF** |
| 檔案權限（R1 必改 2） | G.patch 已**沒有任何 old mode／new mode**；工作樹 `LanguageContext.tsx` 為 `-rw-r--r--`，index 為 100644，`git diff HEAD --summary` 沒有 mode 變更。**已解決** |
| R1→R2 差異 | 和 R1 候選樹相比只改了 4 個檔案：`AuditAgendaEditor.tsx`（午餐邏輯）、`LanguageContext.tsx`（基準不同造成，本輪的行沒有變）、`audit-agenda-check.mjs`（`fill` 後 focus＋blur）、`audit-buttons-check.mjs`（新增 7b 三項）。後端與其他前端檔案和 R1 完全相同，所以 R1 對後端與其他前端的結論仍然有效 |

### 2. 後端
- 和 R1 完全相同：kind 白名單（400 在 404 之前，判斷不看資料）、預設 report、plan／checklist 與列印模板一致、`AuditAgendaEntry.kind` 驗證、`_comparable` 的舊列相容（不會繞過其他欄位的鎖定）、Word 午餐灰底。R1 的結論沿用。
- 候選樹重新跑：8 個測試檔 **109 passed**（`DATABASE_URL=sqlite:////tmp/claude-501/abrev2/db/test.db`，Python 3.14.6）。

### 3. 前端：R1 必改 1（午餐邏輯）
- **新的寫法**
  - `update` 只改值。
  - 日期欄 `onBlur` 呼叫 `commitDate`，拿 `committedDate` ref（每列上一次確定的日期）來比較：
    - 列移到一個還沒有任何列的日子，就補一列午餐；
    - 原本那天如果已經沒有行程，就移除那天**仍是預設值**的午餐列（`isUntouchedLunch`：12:00–13:00、Lunch Time、其他欄位空白）；
    - 午餐列自己改日期不處理；
    - 日期沒變不處理。
  - 讀碼結果：邏輯正確。`committedDate` 以 id 為鍵，儲存後重新排序也不受影響。
- **審查者實測**（隔離環境 8321/3321，探針腳本放在 `$TMPDIR`）

  | 情境 | 結果 | 判定 |
  |---|---|---|
  | 鍵盤輸入 `10012026`，輸入過程中 | 沒有午餐列 | 通過 |
  | 輸入後離開欄位 | 只有一列 `2026-10-01` 午餐 | 通過 |
  | 再用鍵盤改成 10/03，按步驟列離開 | 只剩 `10/03` 一列午餐，`10/01` 的預設午餐已移除 | 通過 |
  | zh-TW 介面，同一天有兩列行程，其中一列按 ↑ 三次後離開 | 原本那天仍有行程，所以午餐保留；新的一天只補一列 | 通過 |
  | 清空日期 | 那天的預設午餐被移除，不會補新的 | 通過 |
  | 改過的午餐（remarks=keep） | 保留 | 通過（7b 有測） |
  | 刪除某天唯一的行程 | 午餐列留下（這是使用者主動刪除，可接受，見下方建議） | 觀察 |

  **R1 的垃圾午餐列和移走行程後的孤立午餐列都已解決。**
- **新問題：離開日期欄時表格變高，同一下點擊會失效（必改）**
  - **原因**：使用者在日期欄輸入新的一天後，直接用滑鼠按下面的按鈕。按下滑鼠的瞬間觸發 blur，`commitDate` 補上一列午餐，表格多一列、版面同步下移。等到放開滑鼠時，按鈕已經不在游標下面，瀏覽器就不會對按鈕送出 click。
  - **實測 1**：在 ahb-agenda-1 第 3 步，用鍵盤把一列改到新的一天，然後直接按「新增一列」。結果只補了午餐列，**沒有新增行程列**；按鈕 y 座標從 626 移到 678。
  - **實測 2**：新稽核只有一列、footer 沒有貼底時，用鍵盤輸入日期後直接按「儲存草稿」。結果補了午餐列，但 **PUT／POST 請求數為 0，也沒有任何提示**，儲存被吞掉。要再按一次才會存。
  - **對照**：行程夠長、footer 已經貼在視窗底部時，「儲存草稿」不會移動，第一下就有 PUT。所以只要目標按鈕位在表格下方、而且會跟著表格移動，就會發生。
  - **影響**：沒有資料損壞，leaveGuard 仍會提示有未儲存的修改。但這是常見操作（改完日期馬上按存檔或新增一列），按了沒反應，屬於 R2 寫法新帶出來的退步。
  - 現有 7b 測試是先點「稽核項目」輸入框離開日期欄，不會碰到這個情況，所以沒測出來。
- **其他前端項目**：每一步的按鈕、Word 只在已儲存的紀錄出現、未儲存時擋下 Word 匯出、sticky 與列印、移除步驟列動畫、第 4 步標題、欄寬、中英文字串，都和 R1 相同，`audit-buttons-check` 重新跑也都通過。

### 4. 審查者自己跑的測試（R2 候選樹）
- **後端**：109 passed，exit 0。
- **前端**：tsc 0；eslint `--max-warnings 0`（5 個檔案）0；vite build 0，輸出到 `$TMPDIR`。
- **瀏覽器**：隔離環境 **8321/3321**，由 `isolated_stack.py` 啟動。vite launcher 是複製 3320 版本後改成 3321／8321，放在候選樹內，cacheDir 指向 `$TMPDIR`。
  - `audit-buttons-check.mjs`：**ALL PASS，27 項**，含 7b 三項，exit 0。
  - 回歸測試每支都在全新環境上跑：agenda、print-template、export-docx、layout、smoke-all、polish、ime-enter **全部 ALL PASS，exit 0**，共 93 項 PASS、0 FAIL。
  - 邊界探針：見上面第 3 節。
  - **關閉**：其中一次 `down` 無法確認 vite 程序的身分而沒有刪除目錄；查過該程序已經不存在，再跑一次 `down` 就回報 `removed`。其餘每次都是 `removed`。最後確認 8321、3321 都沒有程序在監聽。沒有碰 8320/3320、8198/3198、8240/3240，也沒有連正式站。
- **證據**
  - 截圖已改成 R2 候選樹產生的，`agenda-width-800.png` 的開始、結束欄 156px、時間完整，和 log 一致。**R1 必改 3 已解決。**
  - 對照組 `browser-check-control-on-R1.txt`：R1 候選在 7b 三項都 FAIL，exit=1，可以證明新測試抓得到 R1 的 bug。
  - 小瑕疵（不必改）：STATUS 證據段的截圖清單少列了 `agenda-width-1400.png`；午餐小節仍寫「7 項」，沒有把 7b 三項列進去。
- **Python 3.11**：尚未執行，**列為部署前提**。

## SCOPE_CHECK
- R2 只改了午餐邏輯和對應的測試，加上權限還原與重拍截圖，都在 R1 必改範圍內。
- 其餘範圍和 R1 相同，都符合 TASK；模板庫沒有混進來；沒有範圍外的修改。

## DECISIONS_CHECK
- DECISIONS.md 沒有和本輪相關的既有政策，也沒有衝突。
- 「未改過的預設午餐跟著最後一個行程移除」屬於 R1 審查提出的選項 (a)，是預設值的維護行為，不是新的業務規則。
- AGENTS.md：沒有新增 migration、沒有改 production 設定、沒有 hardcode 秘密；CRLF 保留；沒有 commit、push 或部署。

## VERDICT
- [ ] PASS
- [x] REVISE
- [ ] HUMAN_REQUIRED

## REQUIRED_FIXES
1. **離開日期欄造成版面移動，讓同一下點擊失效（AuditAgendaEditor.tsx 的 `commitDate`，掛在 onBlur）**
   - 問題：從日期欄直接按「新增一列」或「儲存草稿」時（footer 沒有貼底的情況），那一下會被吞掉，沒有任何反應或提示。
   - 修法（擇一，或其他等效做法）：
     - (a) 改回在 `onChange` 處理，但每次都做「對帳」：新的一天補一列午餐；離開的那天如果已經沒有行程，就移除未改過的預設午餐。這樣輸入過程中的中間日期會自己清掉，輸入完成時就只剩一列，不需要依賴 blur，按鈕也不會在點擊時移動。7b 的「輸入過程中沒有午餐列」斷言要改成「最後只有一列、沒有年份 < 1000 的列」。
     - (b) 保留 blur，但讓補列不要在按下與放開滑鼠之間發生，例如延到 click 處理完之後再補列。這個做法要自行證明可靠。
   - 補上瀏覽器測試：
     - 在 footer 沒有貼底的短行程上，鍵盤輸入新的一天後直接按「儲存草稿」，斷言送出 1 次 PUT／POST，且存入的資料只有一列午餐；
     - 鍵盤輸入新的一天後直接按「新增一列」，斷言有新增行程列；
     - 現有 7b 三項（或依 (a) 調整後的版本）。

## 建議（不必改）
- 刪除某天唯一的行程時，那天的預設午餐會留下。因為是使用者主動刪除，可以接受；如果想和「移走」的行為一致，可以一起對帳，但不強制。
- STATUS 證據段的小瑕疵見上方第 4 節。

## NEXT_STEP
- 實作端修正 REQUIRED_FIXES 1，產出 R3 的 G.patch、SHA-256 和證據（含上面的新測試；用 R2 候選跑新測試作對照組，應該失敗），交 R3 獨立審查。
- 部署前提（通過之後）：
  - 在最終候選樹上跑 **Python 3.11**。
  - 部署時**先重建後端，再切換前端**，否則舊後端會忽略 `?kind=`，下載「-Plan／-Checklist」拿到的會是完整報告。
  - 不需要 migration。
