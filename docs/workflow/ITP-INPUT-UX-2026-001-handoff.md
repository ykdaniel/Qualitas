# ITP-INPUT-UX-2026-001 — ITP 輸入體驗查核 handoff

純審閱批次，**未修改任何產品程式碼**（新增了隔離測試種子腳本與證據擷取腳本，
屬驗證資產，不是產品程式碼）。實際操作 ITP 基本資料與 Inspection Plan 兩個
區塊，使用有實際長度的檢驗內容，找出三項發現。沿用既有的「複製」功能實際操作
過，評論聚焦好不好用，不是有沒有（見下方「既有能力沿用確認」）——但**獨立審查
已指出**：本輪確認的是複製入口與預填畫面正確，**不等於**已完整驗證「複製後
修改內容、按 Apply、保存、重新開啟後內容仍正確」這整條流程；這條更完整的流程
驗證是下一個實作批次的驗收範圍，不是本輪已經做完的事。

`docs/workflow/ITP-INPUT-UX-2026-001-evidence/run.log` 裡「Activity full
value length=0」這行**更正**：是證據擷取腳本本身對 Copy 面板開啟後的欄位
定位不準確（抓到了錯的 input），**不是**產品把輸入內容清空或遺失的證據——
同一次操作的截圖清楚顯示欄位裡確實有完整長文字，只是單行輸入框視覺上裁切
顯示不下。這個 `0` 不代表任何資料缺失，log 原始內容保留不刪改，在此補註。

## 既有能力沿用確認（不列為發現）

Inspection Plan 每一列檢驗項目已有「複製」圖示按鈕
（`ITPAdvancedEditor.tsx:108-117,448-458`），實際操作：點擊既有項目（含兩筆
Criteria）的 Copy，面板立即開啟並完整預填來源項目所有欄位內容、自動編號下一個
Event No.（A2）、「Insert After」預設接在來源項目之後，使用者只需調整需要變動
的部分再按 Apply。這個既有流程本身運作正常、預填正確，**不是本輪的發現**；
下方 Finding 1 提到的欄位寬度問題在複製流程中一樣會出現，但那是欄位本身的問題，
不是複製功能的問題。

## Finding 1 — Inspection Plan 項目面板的內容欄位全部是單行輸入框，長文字會被截斷（介面問題，可直接改善）

**操作證據**：在 Inspection Plan 對既有項目點擊 Copy，面板預填來源項目的
Activity／Standard／Criteria／Check Time／Method 等欄位，這些欄位的實際內容
長度與真實工程規範文字相當（80-140 字元），但面板裡每個欄位都是固定高度的
單行 `<input>`（例如 `ITPAdvancedEditor.tsx:529`
`<input className="... h-10 ..." value={editingItem.activity.en} ...>`），
文字一旦超過輸入框可視寬度就會被裁切，使用者只看得到開頭片段，要核對或編輯
後半段內容必須點進欄位用方向鍵或選取整段文字才看得到。截圖：
[`finding1-copy-panel-truncated-fields.png`](./ITP-INPUT-UX-2026-001-evidence/finding1-copy-panel-truncated-fields.png) ——
Activity「Verify rebar material certificates and mil...」、Standard「ACI
318-19 Chapter 20; Project Specific...」、兩筆 Criteria、Check Time、Method
全部在可視範圍內被截斷。對照之下，**表格列表本身的呈現沒有這個問題**——同一筆
資料在列表裡是完整換行顯示（見 Inspection Plan 表格畫面，`ITPAdvancedEditor.
tsx:396-411` 的儲存格用 `<div>`/`<ul>` 自然換行，不是單行裁切）；問題只出在
新增/編輯/複製共用的這個輸入面板本身。

**改善方案**：將 Activity／Standard／Criteria／Check Time／Method／Frequency
這幾組 EN/CH 欄位從固定高度的 `<input>` 改為可視多行的 `<textarea>`（或至少
自動依內容高度調整的 textarea，樣式比照既有輸入框的邊框/圓角），讓使用者在
填寫與核對時能直接看到完整內容，不必逐欄位點進去捲動確認。這個改法範圍明確
（只動 `ITPAdvancedEditor.tsx` 這個面板裡約 6 組欄位的 input→textarea），不
影響資料結構（`InspectionItem` 的欄位型別本來就是純字串，不需要改 schema），
可以直接變成下一批 TASK 的 SCOPE。

## Finding 2 — i18n key `itp.submissionDate` 的顯示文字是「Updated Date」，與 key 名稱不一致（觀察到的現況，語意與修正範圍待確認）

**操作證據**：General Information 分頁裡，綁定 `formData.submissionDate`、
新建時預設今天日期（`ITPModals.tsx` 新建流程）的那個欄位，英文介面實際顯示的
標籤文字是「**Updated Date**」。截圖：
[`finding2-submissiondate-mislabeled.png`](./ITP-INPUT-UX-2026-001-evidence/finding2-submissiondate-mislabeled.png)。
查證：`react-app/src/context/LanguageContext.tsx:1126`
`'itp.submissionDate': 'Updated Date'`，中文版 `LanguageContext.tsx:2513`
`'itp.submissionDate': '更新日期'`。

**更正（獨立審查指出，已核實）**：這只證明 i18n **key 名稱**（`submissionDate`）
與**實際顯示文字**（「Updated/更新」語意）不一致，**不能單憑變數命名推論這個
欄位的業務意義一定是「送審日期」**——真正的語意需要使用者/業主確認。另外，
**撤回**先前「這個 key 只在這一個欄位使用」的說法：核對後確認
`react-app/src/components/ITP/columns.tsx:133` 的 ITP 清單欄位標題
（`<DataTableColumnHeader column={column} title={t('itp.submissionDate')} />`）
**也呼叫同一個 key**；而列印輸出
`react-app/src/components/ITP/ITPPrintTemplate.tsx:33` 用的是完全獨立、**沒有
走 i18n key** 的硬編碼文字 `Date: {headerData.submissionDate}`。也就是說同一個
底層欄位，目前在表單、清單欄位標題（兩者共用同一個 key，顯示文字相同）、列印
輸出（獨立硬編碼「Date」）三處呈現方式不完全一致——不是只有表單這一處的孤立
文字問題。

**修正範圍待確認，不是單純一行翻譯修正**：若要改，需要先確認（a）這個欄位的
真正業務語意、（b）改了 `itp.submissionDate` 這個 key 的文字後，ITP 清單的
欄位標題會跟著變動是否符合預期、（c）列印輸出的硬編碼「Date:」要不要一併對齊。
**撤回**先前「純文字修正、不影響其他地方」的判斷。

## Finding 3 — Subject（主旨）欄位沒有必填驗證，可以存出完全空白主旨的 ITP（需確認的業務規則）

**操作證據**：General Information 畫面裡，三個主要欄位中只有 Contractor 標示
紅色星號必填（`ITPModals.tsx:666`
`<label className={formStyles.requiredLabel}>{t('itp.vendor')}</label>`），
Subject（i18n key 實際是 `itp.description`，顯示文字「Subject」/「主旨」）
沒有星號、也沒有對應的 `newErrors` 檢查（`ITPModals.tsx:239-242` 的驗證函式
只檢查 `formData.vendor`）。實際操作：新建一筆 ITP，Subject 完全不填，直接
點 Save——儲存成功，清單立即多一筆 Subject 欄位空白的紀錄。截圖：
[`finding3a-blank-subject-before-save.png`](./ITP-INPUT-UX-2026-001-evidence/finding3a-blank-subject-before-save.png)（存檔前 Subject 空白、
Save 按鈕可點擊）、
[`finding3b-list-shows-blank-subject-row.png`](./ITP-INPUT-UX-2026-001-evidence/finding3b-list-shows-blank-subject-row.png)（存檔後清單第 2 筆
「QTS-A-ITP-000001」Subject 欄位完全空白）。NOI 模組對應的主旨欄位
（`noi.package`）確實是標示必填的（`NOIDetailModal.tsx` 的 `requiredLabel`）
——這點本身屬實，但**更正（獨立審查指出）**：NOI 必填**不能證明**ITP 也應該
必填，兩者是獨立模組，**撤回**先前暗示「政策不一致＝應該對齊」的推論。

**為什麼歸類為「需確認的業務規則」，不是直接改**：Subject 要不要變成必填，
牽涉到是否會擋到既有某些建立流程（例如某些既有資料或既有操作習慣可能本來就
不填主旨）、以及要不要與 NOI 的必填政策對齊，這是業務決策，不是單純的介面
缺陷，本批依 TASK.md 的限制不擅自把它改成必填，**分類維持待決策，不預設
答案**。若未來確認要改為必填，需涵蓋 API 與各寫入入口、既有空值資料的相容性
處理，不能只在前端加一行驗證就宣稱業務規則已經完成——這部分若要推進，需要
另一個完整授權的 TASK，不是本次審查附帶核可的範圍。

## 隔離環境驗證（已完成，依本輪實際操作紀錄）

- `isolated_stack.py up --port 8240`，新建本輪專屬 launcher
  `react-app/tests-browser/itp-input-ux-vite-launcher.mjs`（8240/3240）。
- 新建 `backend/scripts/verification/seed_itp_input_ux_review.py`：一家
  active 廠商、一筆已有兩個 Phase（A/B）各一筆真實長度檢驗項目的既有 ITP
  紀錄，供 Edit/Copy 操作有真實內容可用。
- 先以互動方式（Browser pane）操作一輪，確認三項發現；之後新建
  `react-app/tests-browser/itp-input-ux-review.mjs`（Playwright，沿用既有
  `verifyIsolatedTarget` 防誤連使用者環境）重跑一次，產出可留存、可複查的
  截圖與 `run.log`，見
  `docs/workflow/ITP-INPUT-UX-2026-001-evidence/`（5 張截圖 + `run.log`）。
- 隔離堆疊已拆除（`isolated_stack.py down`），`lsof` 確認 8240/3240 埠號
  釋放；使用者 8198/3198 全程監聽未受影響。
- 啟動/拆除隔離環境的指令因本機埠號綁定／跨行程存活檢查被沙盒封鎖
  （`EPERM`），以 `dangerouslyDisableSandbox` 執行這幾個明確需要的指令；
  其餘操作維持在沙盒內。

## 全程未做的事（依 TASK.md 範圍限制）

- 未修改任何 ITP 或其他模組的產品程式碼。
- 未變更任何必填規則（Finding 3 只記錄現狀與改善選項，未實作）。
- 未補全站翻譯（Finding 2 只記錄既有 key 的錯誤文字，未修改
  `LanguageContext.tsx`）。
- 未操作使用者 8198/3198 或開發資料庫。
- 未重新研究 NOI 聯絡資訊自動帶入（該系列已 PASS 結案）。
