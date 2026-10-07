# NOI-CONTACT-AUTOFILL-2026-003 — 測試精確度補正 handoff

承接 `docs/workflow/NOI-CONTACT-AUTOFILL-2026-002-archive.md` 的 REVISE。產品修正
（R1 提示條件）與隔離 guard（R3）**已被接受，本輪未修改任何產品程式碼**，只強化
驗證腳本的斷言精確度（a/b/d/g）與修正幾處文件措辭。

## 新增/強化的斷言（本輪實際改動，a/b/d/g）

### a — 逐欄比對已知值，不是只判斷非空
`noi-contact-autofill-review.mjs` 新增 `KNOWN_CONTRACTOR_INFO` 對照表（廠商A／
廠商B 取自 `db_seeder.py` 的預設種子值；No-Phone 廠商取自本輪種子）。原本
`aContacts.length > 0` 這類「有值就算過」的斷言，改為逐欄 `===` 精確比對預選
廠商（廠商A）的已知值：`張三`／`02-1234-5678`／`vendor-a@example.com`。

### b — 換廠商目標固定為已知值，且斷言保留提示的實際文案
原本 `otherContractor` 是「清單裡第一個不是目前廠商的選項」，換到哪家廠商不
確定，只能用「有變化」這種弱斷言（`b6` 舊版：`afterSwitchPhone !== beforeSwitchPhone || afterSwitchEmail !== beforeSwitchEmail`，
電話或 Email 任一改變就算過，可能漏掉只改對一半或改成錯誤值的情況）。改為：
- 固定換到「廠商B」（已知值），Phone/Email 改為逐欄 `===` 精確比對廠商B 的
  已知值（`02-2345-6789`／`vendor-b@example.com`）。
- 新增斷言：保留提示的 toast（`[data-sonner-toast]`）確實可見，且文字內容
  包含正確具名的欄位「Contact Person」與確認語句「confirm it still applies
  to the new contractor」，不是只假設有跳 toast。

### d — 核對「先前廠商」提示的實際文字，不是只數元素個數
原本只斷言 `hintNear(emailInput).count() === 1`，沒有核對文字內容到底寫了
什麼。改為額外讀出 `<small>` 的 `textContent`，逐字核對等於
`t('noi.contactFromPreviousContractor')` 的英文譯文
「This value is from a previously selected contractor.」。

### g — 真正等待延遲回應抵達，並新增「選定廠商後正常帶入」情境
2026-002 版本解除 gate 後只是 `waitForTimeout(800)` 固定等待，沒有確認請求
真的成功、選項真的出現。改為：
1. 解除 gate **前**先用 `page.waitForResponse()` 註冊對
   `/api/contractors/` GET 請求的等待；解除 gate 後 `await` 這個
   promise，斷言 `response.ok()`（本輪實測狀態碼 200）。
2. 用 `page.waitForFunction()` 等待 `<select>` 的 `options.length` 真的變多
   （不是猜測已經到了），並斷言「廠商A」確實出現在選項清單裡。
3. 在此之後才做原本的「手改值保留、廠商未被自動選取」斷言。
4. **新增**：實際選定一個已經載入進來的廠商（廠商A），確認：
   - 手動輸入的 Contact Person 仍然保留（user 狀態，不受選取影響）。
   - 尚未被手動碰過的 Phone／Email（仍是 system 狀態）正確、精確帶入廠商A
     的已知值（`02-1234-5678`／`vendor-a@example.com`）。
   這是 2026-001 的 TASK scope 就要求、但 2026-002 的腳本從未真正執行到的
   「選定廠商後正常帶入尚未手改欄位」情境。

## 沿用上一輪、本輪邏輯未變動的既有斷言（c/e/f）

以下情境的斷言邏輯**本輪完全沒有修改**，只是因為與 a/b/d/g 在同一個連續
瀏覽器 session 裡依序執行（c 接在 b 之後、e/f 是各自獨立但沿用同一支腳本檔
案），重新跑一次腳本時連帶重新執行，不是獨立重新設計或擴大範圍：

- **c**（換到 Phone 欄位本身是空值的廠商，確認舊值被清空）：邏輯未變。
  這個「換到空值廠商時 system 欄位會被清空」的行為，**本身是
  NOI-CONTACT-AUTOFILL-2026-001 就已經實作、已審查接受的邏輯**
  （`systemFields.forEach` 一律用 `selected?.field || ''` 覆蓋，не是只在有值
  時才覆蓋）——2026-002 新增的是**驗證**這個情境，不是新修的行為；本輪沿用
  同一份描述，不得寫成「本輪新修復」。
- **e**（既有紀錄的空白欄位，換廠商後仍維持空白）：邏輯未變。
- **f**（保存後用全新 browser context 重新開啟同一筆記錄，獨立重讀三欄值）：
  邏輯未變。**用詞校正**：此情境實際上是透過表單裡**唯一的 marker 文字**
  （`NCAF-SAVE-MARK`）在列表裡定位並重新開啟同一筆測資，**不是**直接讀出
  並比對這筆記錄底層的 `id` 欄位（畫面上本來就不會顯示 `id`）。先前的文件
  措辭寫成「保存後同 id 獨立重讀」容易讓人誤以為斷言了 `id` 本身，本輪訂正
  為如實描述：靠唯一 marker 重新定位、重讀畫面欄位值，這對這份測資而言足以
  證明是同一筆記錄，但不是對 `id` 欄位的直接斷言。

## 本輪執行結果

**48 checks executed, 48 PASS, 0 FAIL**（上一輪 37 項 + 本輪新增 11 項：
a1b、b7a、b7b、d3a、d3b 取代舊的單一 count 斷言並拆成兩項、g_resp、
g_opts1、g_opts2、g9、g10、g11）。完整 log：
[`NOI-CONTACT-AUTOFILL-2026-003-evidence/run.log`](./NOI-CONTACT-AUTOFILL-2026-003-evidence/run.log)。

與上一輪（`NOI-CONTACT-AUTOFILL-2026-002-evidence/`）的既有截圖**分開存放**
在獨立的 `NOI-CONTACT-AUTOFILL-2026-003-evidence/` 目錄，不覆蓋上一輪的檔案；
本輪截圖是用強化後的腳本重新產生的最新畫面（c/e/f 的畫面內容與上一輪相同，
因為對應的操作步驟沒有變，但檔案本身是本輪重新執行、重新截圖的）。

| 情境 | 本輪新增/強化的斷言 | 截圖（本輪） |
|---|---|---|
| a | a1b + 逐欄精確比對（取代 a2-a4 的非空判斷） | [a-new-noi-prefill.png](./NOI-CONTACT-AUTOFILL-2026-003-evidence/a-new-noi-prefill.png) |
| b | 固定換到廠商B + 逐欄精確比對（取代舊 b6）+ 保留提示 toast 文案核對（b7a/b7b） | [b1-blanked-before-switch.png](./NOI-CONTACT-AUTOFILL-2026-003-evidence/b1-blanked-before-switch.png) / [b2-blanked-after-switch.png](./NOI-CONTACT-AUTOFILL-2026-003-evidence/b2-blanked-after-switch.png) |
| c | 邏輯未變，沿用既有斷言 | [c-switched-to-blank-contractor.png](./NOI-CONTACT-AUTOFILL-2026-003-evidence/c-switched-to-blank-contractor.png) |
| d | 提示文字逐字核對（d3a/d3b 取代舊的單一 count 斷言） | [d-contractor-cleared.png](./NOI-CONTACT-AUTOFILL-2026-003-evidence/d-contractor-cleared.png) |
| e | 邏輯未變，沿用既有斷言 | [e-existing-record-blank-field.png](./NOI-CONTACT-AUTOFILL-2026-003-evidence/e-existing-record-blank-field.png) |
| f | 邏輯未變，沿用既有斷言（描述已訂正為「唯一 marker 定位」，見上） | [f1-before-save.png](./NOI-CONTACT-AUTOFILL-2026-003-evidence/f1-before-save.png) / [f2-reread-after-save.png](./NOI-CONTACT-AUTOFILL-2026-003-evidence/f2-reread-after-save.png) |
| g | 真正等待回應抵達 + 選項出現（g_resp/g_opts1/g_opts2）+ 新增選定廠商後正常帶入（g9-g11） | [g1-modal-open-during-delay.png](./NOI-CONTACT-AUTOFILL-2026-003-evidence/g1-modal-open-during-delay.png) / [g2-after-late-list-arrival.png](./NOI-CONTACT-AUTOFILL-2026-003-evidence/g2-after-late-list-arrival.png) / **[g3-selected-after-late-arrival.png](./NOI-CONTACT-AUTOFILL-2026-003-evidence/g3-selected-after-late-arrival.png)（新增截圖）** |

## 本輪未重新執行的檢查（明確說明原因，不是遺漏）

本輪未修改任何產品程式碼（`NOIDetailModal.tsx`／`LanguageContext.tsx`／
`FormShell.module.css`／`seed_noi_contact_autofill.py` 皆未變動），因此依
TASK.md 明確指示，**未**重新執行 `npx tsc --noEmit`／`npm run build`／
`node scripts/run-unit-tests.mjs`／`npm run lint` 這套完整檢查——這些結果
不會因為只改動驗證腳本與文件而改變，重跑屬於不必要的範圍擴張。
**lint 基線維持上一輪（2026-002）本輪重新執行過的 13 errors / 21 warnings**
（本輪未重跑，沿用 2026-002 的實測結果；若之後任何一輪真的改動了產品程式碼，
下一輪仍須重新執行並如實記錄）。

## 其他文件措辭校正

- 不再用「lazy initializer」描述 `useState(getInitialData())`：這個寫法在
  每次 render 時都會呼叫 `getInitialData()`，只是 React 只採用**第一次**
  render 的回傳值作為初始 state，後續 render 呼叫的回傳值被捨棄——這不是
  `useState(() => ...)` 那種只有在首次初始化才會被呼叫的真正 lazy
  initializer。晚到資料不會觸發重新初始化的行為結論本身不受此用詞校正影響。
- handoff 範例一律用 `$NOI_CONTACT_AUTOFILL_PASSWORD` 環境變數參照，不內嵌
  實際密碼字串（即使是測試密碼）。例如：
  ```
  NOI_CONTACT_AUTOFILL_PASSWORD="$NOI_CONTACT_AUTOFILL_PASSWORD" \
    python3 scripts/verification/isolated_stack.py seed \
    --root <run-dir> --script scripts/verification/seed_noi_contact_autofill.py
  ```
