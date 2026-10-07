# ITP 整體 UI/UX — 第二批（列印標題／保存狀態／語系統一）交接紀錄

2026-09-29，Claude Code 實作並執行以下驗證。未 commit/push/部署。

延續 [ITP 整體 UI/UX 審閱](itp-uiux-review-2026-09-28.md) 選出的最重要 3 項改善，也是原三項建議中尚未實作的最後一批（第一項「Generate Checklist 權限」、第四項「Publish 確認」已於[前一批](itp-generate-checklist-publish-uiux-handoff.md)完成；第三項「複製項目」已於[另一批](itp-copy-inspection-item-handoff.md)完成；[Record 連結導錯](itp-record-link-fix-handoff.md)是審閱過程中額外發現的功能性 bug，已在本批之前單獨修完）。本批只做這 3 項，先不加功能、不改程式邏輯以外的東西。

## 修改前 / 修改後

### 1. 編輯畫面縮減列印用大標題

- **修改前**：進入「檢驗計畫」分頁，整組列印抬頭（Logo 區、INSPECTION & TEST PLAN 大標、文件編號、版次）永久佔用畫面上方約三分之一高度，且不隨表格捲動消失。
- **修改後**：改成一列精簡的頁首（文件編號＋主旨＋版次），跟著分頁籤固定在頂端；原本的完整列印抬頭區塊改為 `hidden print:block`——畫面上完全不顯示，只有真正列印時才會出現，**列印版面的 JSX、CSS class 完全沒有更動**，只是多包了一層顯示/隱藏切換。
- 截圖：[01-plan-tab-top-compact-header-status-bar.png](screenshots/itp-batch2-uiux-2026-09-29/01-plan-tab-top-compact-header-status-bar.png)（分頁剛開啟）、[02-plan-tab-scrolled-header-stays-compact.png](screenshots/itp-batch2-uiux-2026-09-29/02-plan-tab-scrolled-header-stays-compact.png)（捲動 40% 後，對比[修改前的同一情境截圖](screenshots/itp-uiux-review-2026-09-28/04-plan-tab-scrolled-header-still-fixed.png)，原本佔滿螢幕的大標題已經不在畫面上，換成精簡列）。
- 檔案：`react-app/src/components/ITP/ITPAdvancedEditor.tsx`。

### 2. 持續可見的保存狀態，依主資料／檢驗計畫／附件各自的實際保存結果呈現

- **修改前**：畫面上沒有任何持續顯示的保存狀態；只有關閉視窗時才會因為有未保存變更跳出確認框。
- **修改後**：分頁籤下方新增一列常駐的狀態徽章——「主資料」「檢驗計畫」「附件」三個獨立徽章，各自反映**該部分最近一次實際的保存結果**（已保存／尚未保存／尚未確認／保存失敗／尚未處理），不管目前在哪個分頁都看得到：
  - 修改主資料欄位 → 只有「主資料」變成「尚未保存」，「檢驗計畫」「附件」不受影響。
  - 在項目編輯面板按「套用」（既有的、針對既有紀錄的即時保存行為，本批未改動其保存時機）→ 依這次 PUT 是否真的成功，把「檢驗計畫」設為「已保存」或「保存失敗」，不是假設一定成功。
  - 加入待上傳附件但尚未保存 → 只有「附件」變成「尚未處理」。
  - 主資料／檢驗計畫寫入成功，但附件那步失敗（真實會發生的情境，例如網路問題）→ 「主資料」「檢驗計畫」顯示已保存，「附件」顯示保存失敗——**不會因為前兩步成功就把整筆顯示成「已保存」**，也不會因為附件失敗就誤導使用者以為主資料或計畫也沒存到。
  - 主資料保存成功但檢驗計畫的保存結果無法確認時（既有的 `mainSavedDetailUnconfirmed` 情境），現在明確反映成「主資料：已保存／檢驗計畫：尚未確認」兩種不同狀態，而不是單一個籠統的失敗訊息。
- **保存時機完全沒有改變**——沒有新增自動保存、沒有改變 Save／Publish／Apply 各自原本什麼時候送出請求，這批只是把「結果」用持續可見的方式呈現出來。
- 截圖：[01-plan-tab-top-compact-header-status-bar.png](screenshots/itp-batch2-uiux-2026-09-29/01-plan-tab-top-compact-header-status-bar.png) 上方可見「主資料：已保存」「檢驗計畫：已保存」「附件：已保存」三個徽章。
- 檔案：`react-app/src/components/ITP/ITPModals.tsx`（新增 `mainStatus`/`planStatus`/`attachmentsFailed` 狀態與 `ItpMainSavedError` 類別）、`react-app/src/components/ITP/ITP.tsx`（`onApplyItems` 改回傳成功與否，`throw new Error(...)` 改成 `throw new ItpMainSavedError(...)`，讓 Modal 端能正確分辨「主資料已存、計畫未確認」跟「整個都失敗」兩種不同情況）。

### 3. 項目面板與主要操作按鈕統一使用現有語系機制

- **修改前**：項目編輯面板（Event No.、Activity、Standard、Criteria、Verification Points、Sub-Con／Main Con／Employer 等）12 個欄位標籤全部是英文；footer 的 Print／Add New Item／Publish 按鈕也是英文（跟同一畫面上已經是中文的「儲存」「取消」不一致）。
- **修改後**：這些標籤與按鈕文字全部改用既有的 `useLanguage()`／`t()` 中英切換機制，新增對應的 EN/ZH 翻譯 key。**Activity 欄位本身的中／英文內容輸入（兩個獨立輸入框）完全沒有合併或減少，只是輸入框上方的「標籤文字」跟著介面語言走**——中文介面下看到「檢驗活動（中／英）」，兩個輸入框還是分別讓使用者填中文跟英文內容。
- 截圖：[03-item-panel-localized.png](screenshots/itp-batch2-uiux-2026-09-29/03-item-panel-localized.png)，對比[修改前的同一畫面](screenshots/itp-uiux-review-2026-09-28/06-item-edit-panel-english-only-labels.png)。
- 檔案：`react-app/src/components/ITP/ITPAdvancedEditor.tsx`（新增 `useLanguage` 引用）、`react-app/src/components/ITP/ITPModals.tsx`（Print／Add New Item／Publish 三顆按鈕）、`react-app/src/context/LanguageContext.tsx`（新增 `itp.itemPanel.*`、`itp.action*`、`common.apply` 等 key）。

## 本輪檔案

產品：
- `react-app/src/components/ITP/ITPAdvancedEditor.tsx`
- `react-app/src/components/ITP/ITPModals.tsx`
- `react-app/src/components/ITP/ITP.tsx`
- `react-app/src/context/LanguageContext.tsx`

驗證資產（未提交）：
- `react-app/tests-browser/itp-batch2-uiux-review.mjs`（重用前一批的 `seed_itp_checklist_publish_uiux_review.py` 種子，帳號權限與紀錄夾具剛好符合本批需求，未另外新增種子腳本）

## 已執行驗證

- `npx tsc --noEmit`：通過。
- `npm test`：91 passed，無回歸。
- `vite build`：通過。
- 隔離環境真實登入、真實畫面、真實 API、真實資料庫，一次乾淨全跑：
  1. 舊的列印大標題（`<h1>INSPECTION & TEST PLAN</h1>`）確認存在於 DOM 但 `isVisible()` 為 false；新的精簡識別列確實可見且顯示正確的文件編號。
  2. Print／Add New Item／Publish 按鈕、項目面板標題與「檢驗活動」欄位標籤都確認已改為中文；「準則」「套用」「取消」等同步生效。
  3. 既有、未修改的紀錄開啟時三個徽章初始狀態皆為「已保存」；修改主資料欄位後**只有**「主資料」變成「尚未保存」，「檢驗計畫」「附件」不受影響。
  4. 在項目面板新增一筆項目並按「套用」（既有的即時保存行為）：「檢驗計畫」依真實 PUT 結果變成「已保存」，此時「主資料」仍維持「尚未保存」（因為主資料的編輯還沒透過主要的「儲存」按鈕送出）——證明兩者確實各自獨立，不是同一個旗標。
  5. 加入一筆待上傳附件：「附件」立即變成「尚未處理」，主資料／檢驗計畫不受影響。
  6. **模擬**附件上傳失敗（用 Playwright route 攔截，非真實網路故障，僅用於重現「主資料與計畫已存、附件失敗」這個狀態）：確認視窗維持開啟（沿用既有「附件階段有錯誤才不自動關閉」的行為，本批未變動），且「主資料：已保存／檢驗計畫：已保存／附件：保存失敗」三個徽章正確分別呈現，**沒有因為前兩步成功就整體顯示已保存**。
  7. 拿掉模擬失敗、真實重試一次：附件真的上傳成功（`errors.length === 0`），視窗依既有行為自動關閉（這是修正前就存在的行為，本批未改動）；直接查真實資料庫確認附件筆數與主資料的欄位修改都確實保存成功。

## 重跑方式（從 backend/ 目錄）

```sh
python3 scripts/verification/isolated_stack.py up --port 8099 --vite-port 3099 --vite-script <vite_multi.mjs 路徑> --env SMTP_HOST= --env SMTP_USER= --env SMTP_PASSWORD= > stack.json
python3 scripts/verification/isolated_stack.py seed --root <root> --script scripts/verification/seed_itp_checklist_publish_uiux_review.py
node ../react-app/tests-browser/itp-batch2-uiux-review.mjs stack.json
python3 scripts/verification/isolated_stack.py down --root <root>
```

## 未驗證／範圍外（如實記錄）

- **列印輸出本身未實際列印驗證**：headless Playwright 無法真的觸發 `window.print()` 產生列印結果，本批只用程式碼核對——原本的列印抬頭區塊（`hidden print:block`）JSX 與 class 完全沒有更動，理論上列印時的輸出應與修改前一致，但沒有真正跑一次列印輸出來比對。
- 表格欄位標題（Event No./Inspection Activity/Standard/Criteria/Check Time/Method/Frequency/Records/Verification Point/Sub./Main/Emp./HSE/Op.）**維持英文，未列入本批**——使用者的指示明確只提到「項目面板與主要操作按鈕」，表格欄位標題是更大範圍的既有畫面，若要處理需另外確認範圍再開一批。
- `ITPDetail.tsx`（`/itp/:id` 獨立頁面路由，跟本批審閱的列表頁彈窗是兩個不同、各自獨立實作的畫面）**完全未觸碰**——它本來就沒有引入 `useLanguage`，欄位標籤、Save/Publish/Add New Item/Print 按鈕也全是英文，跟本批審閱、修正的列表頁彈窗流程是分開的既有落差，不在這輪範圍內。
- 「附件保存失敗後，使用者再次編輯主資料欄位」這類多重交錯情境（例如附件失敗當下同時又去改了主資料）未特別測試，三個狀態各自的判斷邏輯理論上仍會各自正確反映，但未逐一窮舉所有交錯順序。
- 狀態徽章本身的視覺樣式（顏色、圓角膠囊）沒有走設計系統既有的元件庫比對，只是沿用畫面上既有的 Tailwind 色階慣例（emerald/amber/orange/red），未經視覺設計審核。

## Claude 接手時注意

- 工作區存在其他協作者尚未提交的修改；本輪未 stash/reset/checkout，未動這些檔案。
- 本輪未 commit、push 或部署。
