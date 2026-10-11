# AUDIT-BUTTONS-2026-001 — REVIEW（R1 獨立審查）

- 審查者：Claude（獨立審查，GPT 額度用盡，由使用者指定）
- TASK_ID: AUDIT-BUTTONS-2026-001
- ROUND: R1
- 審查日期：2026-10-11
- 基準：候選樹 = `git archive ce7cc83a` + `evidence/G.patch`（解在 `$TMPDIR`）。目前 HEAD 已前進到 `f83ba745`，該提交只改了 Meeting Minutes 檔案（含 LanguageContext 的 meeting 字串），沒有動到後端。
- 所有判定都以審查者自己跑出的結果為準，STATUS 只作對照。

## EVIDENCE_CHECK

### 1. 補丁
| 項目 | 結果 |
|---|---|
| G.patch SHA-256 | `8b9fa1138726231615ecc74ee332e3baff8d723b09652912622fba53a0e2c583`，**與 STATUS 一致** |
| 套用到 `git archive ce7cc83a` | 乾淨套上 |
| 對 HEAD `f83ba745` 跑 `--check` | 通過；實際套用也乾淨 |
| 檔案數 | **15 個**，與 TASK／STATUS 列的相同。DECISIONS.md、validators.py、noi 相關檔、MeetingMinutes 相關檔都不在補丁內 |
| 與工作樹比對 | 14 個檔案和工作樹逐位元組相同。只有 `LanguageContext.tsx` 不同，原因是工作樹裡有其他工作階段未提交的 meeting 字串修改。本輪在這個檔案只改了 `audit.wizard.stepAgenda` 中英各 1 行（`git diff HEAD` 已確認） |
| CRLF | 候選樹中 audit_service.py（658/658 行）、routers/audit.py（133/133）、AuditWizard.tsx（1254/1254）、auditStore.ts（141/141）、LanguageContext.tsx（3090/3090）**全部仍是 CRLF**。其他 LF 檔仍是 LF |
| **檔案權限** | **G.patch 的 `LanguageContext.tsx` 帶了 `old mode 100644 / new mode 100755`。** ce7cc83a 和 HEAD 都是 100644，工作樹的檔案目前是 `-rwxr-xr-x`。這個權限變更不在 TASK 範圍內，STATUS 也沒有寫到（見 REQUIRED_FIXES 2） |

### 2. 後端（讀碼，並在候選樹實測）
- **kind 白名單**：router 用 `kind: str = Query("report")`，值不在 `AUDIT_DOCX_KINDS` 內就回 400，檢查在呼叫 service 之前。實測結果：
  - `summary`、`REPORT`、空字串、`../plan` 都回 400，`detail` 會列出允許的值。
  - 不存在的 id 帶 `kind=bogus` 回 400；帶 `kind=checklist` 回 404。
  - 400 的判斷完全不看資料，所以不會洩漏紀錄是否存在或是否在使用者的範圍內，這樣的先後順序合理。
  - service 內的 `_DOCX_KINDS[kind]` 只有 router 會呼叫，不會被繞過。
- **既有契約**：不帶 kind 時回傳 report，內容和明確帶 `kind=report` 一樣，檔名也一樣是 `{auditNo}.docx`（有測試）。所以舊前端不受影響。
- **plan／checklist 是否和列印一致**：逐段比對了 `AuditPrintTemplate` 和 `export_docx`。
  - 標題相同：內部稽核計畫 INTERNAL AUDIT PLAN、稽核查檢表 AUDIT CHECKLIST。
  - plan 都是第 1–4 段，再加「5. 計畫簽核」，5.1 主任稽核員帶姓名，5.2 專案經理帶姓名。
  - checklist 都是：稽核資訊 3 列（編號／專案、廠商／地點、日期 `~`／主任稽核員）；查檢項目 5 欄，結果欄是三個 ☐，備註留白；簽核 3.1／3.2。
  - 兩者一致。
- **AuditAgendaEntry.kind**：只接受 `''` 和 `'lunch'`；`null` 會轉成 `''`。實測 `Lunch`、`' lunch'`、`session`、`1`、`True`、`['lunch']`、`{}` 全部回 422。
- **`_comparable`**：只在 key 是 agenda、且列是 dict 時補上 `{"kind": "", **row}`。如果原本已經有 kind，會保留原值，其他欄位不受影響。另外寫了探針測試確認：
  - 舊格式（沒有 kind）的 Closed 稽核原樣重存 → 200。
  - 同一筆改了 item → 400。
  - 加一列午餐 → 400。
  - 已存 `kind=lunch` 的列改成 `''` → 400。
  - 結論：**其他欄位的鎖定沒有被繞過**。
- **Word 午餐列灰底**：`_shade` 會先移除舊的 `w:shd` 再寫入 `E5E7EB`。`zip(table.rows[1:], agenda)` 能一列對一列，因為 agenda 的每個 dict 都會產生一列。實測只有午餐列有灰底。

### 3. 前端（讀碼，並在 8321/3321 隔離環境實測）
- **每一步的按鈕**：第 1 步沒有按鈕；第 2 步只有「上一步」；第 3、4、5 步分別是「上一步＋列印稽核計畫／查檢表／報告＋匯出 Word」，都有圖示，卡片內已經沒有按鈕。這和 NCR 的 FormActions tools 寫法一致。
- **Word 按鈕只在已儲存的紀錄出現**：新紀錄在第一次儲存草稿後才出現。只能檢視的使用者看 Closed 紀錄時仍有這個按鈕。
- **handleExportDocx 仍會檢查未儲存的修改**：審查者自己測試，改一欄之後按 Word，會跳出提示「有尚未儲存的修改。請先按「儲存草稿」再匯出…」，而且 **export-docx 請求數為 0**。
- **sticky 與列印**：用 print media 模擬的結果：
  - header `display:none`；footer 內的 `.bar` 是 `display:none`，外層 sticky 容器高度為 0。
  - overlay 變成 `static`／`overflow visible`，內層 padding 為 0。
  - portal 列印回歸測試（print-template 三種 kind）全部通過。
  - `overflow-clip` 沒有讓卡片變成捲動容器，Tailwind 4 支援這個寫法。
  - 未發現影響列印或其他版面。
- **步驟列動畫**：圓圈和連接線都已拿掉 transition 與 hover 放大。實測步驟列內所有元素的 transitionDuration 都是 0s。
- **第 4 步標題**：顯示為「配置查檢表」，已不再重複。
- **中英文字串**：只改 `stepAgenda`，en 為 Audit Plan、zh 為 稽核計畫。列印和 Word 裡的「4. 稽核行程 Agenda」段名沒有改，符合 TASK 第 2 點。
- **欄寬**：日期 150、開始 156、結束 156、受稽核對象 150、稽核員 120、備註 150、操作欄 52，表格最小寬度 1210。
  - 實測：1400 寬時稽核項目欄的輸入框 310px，800 寬時 252px，且表格在框內橫向捲動；開始、結束的輸入框 132px，時間完整顯示為「09:00 AM」「12:00 PM」。
  - 審查者自己的截圖可以確認。
- **午餐預設邏輯（主要問題）**：腳本列出的 7 個情境都通過。另外寫了探針，發現下面兩個邊界情況：
  - **A. 鍵盤輸入日期會產生垃圾午餐列（必改）。**
    - 原因：`update(date)` 在每一次 `onChange` 都會判斷「是否為新的一天」。Chrome 的 `<input type="date">` 在使用者逐字輸入或按方向鍵時，每一步都會送出一個有效的中間日期。
    - 實測 1：在空白日期欄用鍵盤輸入 `10012026`，產生 4 列午餐：`0002-10-01`、`0020-10-01`、`0202-10-01`、`2026-10-01`。
    - 實測 2：把已有日期的列用鍵盤改成 10/03，又多出 5 列：`2026-01-01`、`2026-10-03`、`0002-10-03`、`0020-10-03`、`0202-10-03`。
    - 實測 3：zh-TW 介面在日期欄按兩次 ↑，每一步都多一列（`2027-10-01`、`2028-10-01`）。
    - **儲存草稿後，這些列真的寫進了資料庫**，因為後端接受 `0002-10-01`。實測存入 10 列午餐、1 列行程。
    - 目前的測試全部用 `fill()` 一次設定整個值，所以沒有測出這個問題。
  - **B. 孤立的午餐列。** 新增第一列時會在開始日補一列午餐；之後把這唯一的一列改到別天，新的那天會補午餐，但原來那天的午餐留下，那天就只剩一列午餐。這正是使用者要求檢查的邊界情況，目前的設計沒有處理。
  - **其他邊界情況正常**：
    - 清空日期不會補午餐。
    - 改午餐列自己的日期不會再補。
    - 同一天有多列時只補一次。
    - 刪除的午餐不會跑回來。
    - 舊資料打開時不會被改寫。
    - 唯讀時整個 fieldset 停用。

### 4. 審查者自己跑的測試
- **後端**（候選樹，`DATABASE_URL=sqlite:///$TMPDIR/abrev/db/test.db`，Python 3.14.6）：STATUS 列的 8 個測試檔 **109 passed**，exit 0。另外的探針測試 5 passed，已刪除，只放在候選樹內。
- **前端**（候選樹）：tsc 0；eslint `--max-warnings 0`（5 個檔案）0；vite build 0，輸出到 `$TMPDIR`。
- **瀏覽器**：隔離環境 **8321/3321**。用 `isolated_stack.py` 啟動；vite launcher 是從 3320 版本複製並改成 3321／8321，放在候選樹內，cacheDir 指向 `$TMPDIR`，沒有寫入 repo 的 node_modules。
  - `audit-buttons-check.mjs`：**ALL PASS，24 項**，數值與 STATUS 相同。
  - 回歸測試每支都在全新環境上跑：agenda、print-template、export-docx、layout、smoke-all、polish、ime-enter **全部 ALL PASS，exit 0**，共 93 項 PASS、0 FAIL。
  - 邊界探針：見上面的 A、B 兩項。
  - 每次用完都以 `isolated_stack.py down` 關閉，回報 `removed`。最後確認 8321、3321 都沒有程序在監聽。沒有碰 8320/3320、8198/3198、8240/3240，也沒有連正式站。
- **證據檔不一致**：evidence 裡的 `step3-footer.png`、`lunch-step3.png`、`agenda-width-800.png` 中，開始、結束欄寬約 112px（舊的 `w-28`），時間被截成「0 AM」「30 PM」。這和同一資料夾 browser-check.txt 記錄的 132px 輸入框不符，也和審查者在同一候選樹上拍到的截圖（156px 欄寬、時間完整）不符。可見這批截圖不是從最終候選樹拍的（見 REQUIRED_FIXES 3）。
- **Python 3.11**：尚未執行，**列為部署前提**。

## SCOPE_CHECK
- 修改內容符合 TASK 的範圍：kind 參數與白名單、plan／checklist 的 Word、agenda 的 kind 與午餐灰底、舊列的比對相容、底部按鈕、改名、第 4 步標題、sticky、移除動畫、午餐預設、欄寬、測試。
- 模板庫沒有混進來，留給 AUDIT-TEMPLATES-2026-001。
- 範圍外的只有一項：`LanguageContext.tsx` 的檔案權限變更 100644→100755。
- 工作樹裡其他工作階段的修改（MeetingMinutes、meeting 測試等）都不在 G.patch 內。

## DECISIONS_CHECK
- DECISIONS.md 沒有和 Audit 按鈕、匯出種類、agenda 午餐相關的既有政策，也沒有衝突。「版型與其他模組一致」的精神是符合的：按鈕位置和 NCR 的 FormActions tools 相同。
- 這輪沒有把未確認的業務規則升格為政策。午餐預設來自使用者的明確需求。
- AGENTS.md：
  - 沒有新增 migration（agenda 是 JSON 欄位）；沒有改 production 設定；沒有 hardcode 秘密。
  - router 用 HTTPException，service 沒有讓原始例外外洩。
  - 前端 API 經由 `services/api.ts`。
  - `console.error` 是原本就有的寫法，不是本輪新增。
  - CRLF 有保留。
  - 沒有 commit、push 或部署。

## VERDICT
- [ ] PASS
- [x] REVISE
- [ ] HUMAN_REQUIRED

## REQUIRED_FIXES
1. **午餐預設在日期欄每一次 onChange 都觸發（AuditAgendaEditor.tsx 的 `update`）**
   - 問題：使用者用鍵盤輸入或用方向鍵調整日期時，會產生 `0002-…`、`0020-…`、`0202-…`、中間月份等垃圾午餐列，而且會被存進資料庫。
   - 修法：只在日期「確定」後才補午餐，例如在日期欄 `onBlur` 時比較聚焦前後的值；或用其他等效方式，確保中間值不會補列。
   - 同時處理邊界 B（孤立午餐）。兩個做法擇一：
     - (a) 自動補上、而且使用者還沒改過的午餐列，在它那天已經沒有其他行程列時一併移除；
     - (b) 保留目前的行為，但要在 STATUS 寫明，並由使用者確認可以接受。
   - 補上瀏覽器測試：用 `keyboard.type`／`ArrowUp` 改日期（en-US 和 zh-TW 各一）、把某天唯一的行程列移到別天，並斷言存入的午餐列數量與日期。
2. **G.patch 不要帶 `LanguageContext.tsx` 的權限變更（100644→100755）**：提交前改回 100644，例如 `chmod 644` 或在 index 去掉執行權限，並重新產生 G.patch 和 SHA-256。
3. **重新產生 evidence 截圖**：`step3-footer.png`、`lunch-step3.png`、`agenda-width-800.png` 要從最終候選樹重拍，讓截圖裡的欄寬和 browser-check.txt 的數值一致；其他截圖也一併用最終候選樹重拍。

## NEXT_STEP
- 實作端依 REQUIRED_FIXES 1–3 修正，產出 R2 的 G.patch、SHA-256、後端／前端／瀏覽器證據（含新的鍵盤日期測試），交 R2 獨立審查。
- 邊界 B 若選 (b)，要先取得使用者確認，再寫進 STATUS。
- 部署前提（R2 通過之後）：
  - 在最終候選樹上跑 **Python 3.11**。
  - 部署時**先重建後端，再切換前端**。如果新前端先上線、舊後端還在，舊後端會忽略 `?kind=`，結果「-Plan／-Checklist」檔名下載到的會是完整報告。
  - 不需要 migration。
