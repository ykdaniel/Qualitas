# ITP 整體 UI/UX 審閱 — 2026-09-28

隔離環境真實畫面審閱，帳號 `uiux_reviewer`，一筆含 15 個檢驗項目、跨 A/B/C 三階段的代表性 ITP。本輪只審閱、未修改任何程式碼。原本只交付一個私人 Artifact 連結（`https://claude.ai/artifact/Jo89EWum3UDtwDDN5FPgf8`，含互動排版與修改後示意圖），依指示改為同時存入本檔案 + 截圖目錄，方便協作者查看。

**狀態：下面 3 項改善已全數實作完成**（2026-09-29，見 [第二批交接紀錄](itp-uiux-batch2-handoff.md)），額外發現的 Record 連結 bug 也已修正（見 [Record 連結導錯修正](itp-record-link-fix-handoff.md)）。

## 審閱方式

- 資料規模：15 個檢驗項目，A/B/C 三階段，含多筆 Criteria、不同 Verification Point 組合。
- 真實連結：2 個項目連結到真實存在的 ITR／Checklist 記錄，測試「Record」點擊的實際去向（因而發現了下面「額外發現」的真實 bug）。
- 檢查重點：目前步驟／下一步／已保存狀態是否清楚；Apply／Save／Publish／Generate Checklist 是否好懂好找。

## 最重要的 3 項改善

### 1. 檢驗計畫分頁被固定不動的「列印用大標題」永久佔用畫面

「檢驗計畫」分頁一開啟，上方立刻出現整組列印抬頭（Logo 區、INSPECTION & TEST PLAN 大標、文件編號、版次），高度約佔螢幕三分之一——而且這個區塊**不會隨表格捲動而消失**，不管往下滑到第 5 筆還是第 15 筆項目，它一直原地佔著。

證據：對同一份 15 項計畫，捲動表格內部容器到 40% 深度前後截圖比對，這個標題區塊像素級不動——它其實是給「列印」用的版型，被直接搬進互動編輯畫面裡常駐顯示。

- 修改前（分頁剛開啟）：[03-plan-tab-top.png](screenshots/itp-uiux-review-2026-09-28/03-plan-tab-top.png)
- 修改前（捲動 40% 後，標題仍在原位）：[04-plan-tab-scrolled-header-still-fixed.png](screenshots/itp-uiux-review-2026-09-28/04-plan-tab-scrolled-header-still-fixed.png)
- 修改前（捲到底部，footer 按鈕排列）：[05-plan-tab-bottom-and-footer.png](screenshots/itp-uiux-review-2026-09-28/05-plan-tab-bottom-and-footer.png)

怎麼改（示意見 Artifact）：列印抬頭只在「列印」時才需要，編輯畫面改成一列精簡的頁首（文件編號＋主旨＋版次），連同分頁籤一起固定在頂端，把省下的空間全部讓給真正要操作的表格。列印功能與版型本身不動，只是不再常駐佔用編輯畫面。

### 2. 整段編輯過程看不到「有沒有保存」

不管是在「基本資訊」改欄位，還是在「檢驗計畫」新增、複製、刪除項目，畫面上**沒有任何持續顯示的「尚未保存」提示**。使用者唯一會被告知有未保存變更的時機，是「按下關閉」的那一刻才跳出確認視窗——在那之前，畫面看起來跟已經保存完全一樣。

證據：程式內部確實有追蹤「是否已變更」的狀態（`isDirty`），但只用在關閉視窗時判斷要不要跳確認框，沒有在畫面上呈現成任何看得到的標記。

- 修改前：[02-general-tab-no-unsaved-indicator.png](screenshots/itp-uiux-review-2026-09-28/02-general-tab-no-unsaved-indicator.png)

怎麼改（示意見 Artifact）：分頁籤旁常駐一個「尚未保存」小標籤（有變更才出現），footer 補一行「最後保存時間」。兩個分頁共用同一份保存狀態，不管在哪個分頁改東西都看得到，不用等到關閉才知道。

### 3. 同一個編輯畫面裡，中英文標籤混用不一致

整個 App 的導覽列、清單頁、「基本資訊」分頁都是繁體中文；但點開任何一個檢驗項目的編輯面板，**欄位標籤（Event No.、Activity、Standard、Criteria、Verification Points、Sub-Con／Main Con…）全部是英文**，footer 的按鈕也是中英夾雜（產生 Checklist、ADD NEW ITEM 全大寫、Publish、儲存、取消）。

- 修改前：[06-item-edit-panel-english-only-labels.png](screenshots/itp-uiux-review-2026-09-28/06-item-edit-panel-english-only-labels.png)

怎麼改（示意見 Artifact）：把項目編輯面板、footer 按鈕的「標籤文字」全部走既有的中英語系切換機制，不新增語言、不改變任何欄位本身能填中英雙語內容的能力——只是面板「外殼」的文字跟著使用者選的語言走。**Activity 欄位本身的中英文內容輸入（en/ch 兩個輸入框）維持不變，不因介面中文化而合併成一格。**

## 額外發現：Record 連結導錯（真實功能性 bug，已列入待辦並在後續批次修正）

點擊一個真正連到 ITR 的「Record」連結時，畫面卻導去了「Checklist 範本庫」並顯示「沒有符合條件的資料」。原因是判斷連結該去 Checklist 還是 ITR 的規則是看值「開頭是不是 QTS」，但系統裡 ITR、ITP、Checklist 的文件編號全部都以 `QTS-` 開頭，導致誤判——這不是測資巧合，正式編號規則下就會發生。

- 截圖：[07-record-link-misrouted-to-empty-checklist-list.png](screenshots/itp-uiux-review-2026-09-28/07-record-link-misrouted-to-empty-checklist-list.png)
- 修正狀態：**已於下一批（2026-09-28，同日）修正**，詳見 [itp-record-link-fix-handoff.md](itp-record-link-fix-handoff.md)。

## Record 欄位用途查證（未改行為，僅記錄依據）

依畫面輸入端（datalist 帶入 `itrList.documentNumber`）、顯示端（點擊嘗試導向對應 ITR/Checklist，找不到會提示）、列印範本欄位標題「Record」，以及後端 `ITP.detail_data` 完全不透明（無驗證）四項證據交叉確認：**這格記的是「這個項目對應到哪一份既有文件」，是既有介面拿來做文件查找／導覽用的，不是預定表單/紀錄要求**。後端沒有任何驗證，因此不能宣稱每一個既有值都必然對應到一份真的存在的證據文件（可能是過期、手動輸入錯誤、或引用了已刪除的紀錄）。複製檢驗項目時清空這欄的既有作法維持不變。

## 互動版報告

完整互動排版（含「修改後」示意圖、方法卡片等視覺呈現）仍保留在私人 Artifact：<https://claude.ai/artifact/Jo89EWum3UDtwDDN5FPgf8>（僅本人可見，供個人參考；正式交接以本檔案 + 截圖目錄為準）。
