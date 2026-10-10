# MEETING-TABS-2026-001 — STATUS（R9 已收回；目前＝R8）

TASK_ID: MEETING-TABS-2026-001 · ROUND: R6 · R1/R2：ff8c6481／0d6a09bc；R3：577813bd／7eb7dd2f；R4–R5：9ec8cf6a／dbb11d66；R6：96c81b56／f83ba745；R7：a8fd54cf／9c06cc8f（＋d7200991 正式站查詢紀錄）；R8：1466df11／86932e29；R9：8aa5cd33／35e64cfa，**已由 fbce7383 revert**；未推送、未部署。基準：MEETING-FIX 提交後的 HEAD。

## 修改
| 檔案 | 內容 |
|---|---|
| `backend/models.py`／`schemas.py`／`db_migrations.py` | 新增可空欄位 `meetingEndTime`（model 1 行、Base／Update 各 1 行、`_add_missing_columns` 在 audits.agenda 後 `_add_column_if_missing`，CRLF 保留）。無預設值；舊資料讀為 null |
| `backend/services/meeting_minutes_service.py` | `carry_forward_discussion_log`：下次會議只帶未結事項＋其大類／子類＋全部進度，標 `carried`，編號不變；已結事項不帶；讀舊兩層格式（無 kind：level 1／帶點編號＝事項，其餘＝大類；舊 topic／discussion／decision 合併）。`create_new_occurrence` 改用它（原本清空），並清掉 meetingEndTime |
| `react-app/src/components/MeetingMinutes/discussionLog.ts`（新） | 討論事項純函式：讀任何格式、樹狀排序、編號、增刪（帶入列不可刪；有帶入列時不重編號，否則刪除後重編）、進度增刪（帶入的不可刪）、未結數、上層標題 |
| `DiscussionRegister.tsx`（新） | 表格：# ／Discussions / Actions／Action by／Target Date / Status；大類 n.0、子類灰底；事項內可加帶日期進度；進行中／已結案／全部篩選；帶入事項標「前次帶入」、內文與舊進度唯讀 |
| `MeetingMinutesModals.tsx` | 滿版＋返回鍵＋5 分頁（數字：與會人數、未結事項數、行動項目數）；各分頁只隱藏不卸載（切換不丟輸入或待上傳檔案）；基本資訊加結束時間、記錄人可從人員清單選；與會人員改表格 Company／Name／Position；未按新增的輸入擋存檔時自動切到該分頁；原寫死中文提示改翻譯鍵；`common.pleaseSelect` 修正 |
| `MeetingMinutes.tsx` | payload 加 meetingEndTime；「已結案項目」清單改用 discussionLog.ts（兩種格式都讀） |
| `MeetingMinutesPrintTemplate.tsx`／`.print.css` | 列印改成公司格式：SUBJECT／DATE／VENUE & TIME（起～訖）／RECORDED BY／出席人員 Company／Name／Position；討論事項表 #／DISCUSSIONS / ACTIONS／Action by／Target Date / Status，大類、子類灰底，進度日期＋內容，帶入的舊進度灰字；簽核改「記錄人」 |
| `react-app/src/store/meetingMinutesStore.ts` | 型別：kind／level 0–2／targetDate／updates／carried；meetingEndTime |
| `LanguageContext.tsx` | 新增 22 個 meetingMinutes.* 鍵＋`common.pleaseSelect`、`common.deleteConfirmMessage`（中英）；改 5 個標籤（Subject 主題、Start Time 開始時間、Venue、Recorded By 記錄人、Position）。`common.deleteConfirmMessage` 原本不存在，NOI／OSD／OBS／會議記錄的刪除確認都顯示鍵名，這次一併有字 |
| 測試 | `backend/tests/test_meeting_minutes_carry_forward_http.py`（新，5 項）；`test_meeting_minutes_service.py` 舊斷言「不帶討論紀錄」依新決定改為帶入；`tests-unit/meetingDiscussionLog.test.ts`（新，7 項）；`tests-browser/meeting-tabs-review.mjs`（新）；`meeting-fix-review.mjs` 配合分頁（Subject 標籤、行動項目在分頁上） |
| `backend/scripts/verification/seed_meeting_tabs_review.py`（新） | 隔離環境／使用者預覽 seed：MOM-DEMO-001 舊兩層草稿、MOM-DEMO-002 依公司截圖的已發布會議（含未結事項與進度，可「建立下次會議」看帶入）、MOM-DEMO-003 舊兩層已發布 |

## R2（依 R1 審查與使用者追加決定）
- 使用者 2026-10-11 追加：列印正文直式 A4、只有照片附頁橫式 A4，每頁 2×2；下次會議只帶有未結事項的大類／子類（空標題不帶）；「主持人」直接改稱「記錄人」。
- 列印方向的根因：ITP 的列印樣式有不具名 `@page { size: landscape }`，同一工作階段載入過 ITP 後會蓋掉本模組不具名的 `@page { size: A4 }`，使用者截圖即為此狀況。改為具名頁面（同 Audit）：`@page mom`（A4 直式）、`@page mom-photos`（A4 橫式），並移除本模組的不具名 @page；列印時隱藏其他 body 子元素與 `#itr-single-print-root`。
- 照片附頁：附件中的圖片（mime 或副檔名）依上傳時間排序，每頁 4 張 2×2、說明「照片 n＋檔名」；附件表標註「見照片附頁」；列印前等待圖片載入（最多 8 秒）。
- R1 必改 1：刪除列時回傳新舊編號對照，進度草稿與新增列上層跟著改寫或清除（`removeEntryWithMap`）。
- R1 必改 2：前後端都把「沒有 level 但有 owner／status」的扁平列（2026-08-29～31 存的格式）判成事項，存檔與帶入都保留負責人與狀態。
- R1 建議 3：有孤兒列或重複編號時不重編號（不丟列、不重複）。
- R1 建議 4：討論事項區移到 disabled fieldset 外，已發布／作廢也能切換進行中／已結案／全部。
- R1 建議 5：照使用者決定，空標題不帶。
- R1 建議 6：離開提醒忽略空白的新增列與進度草稿。
- 驗證：後端 46 passed；`npm test` 154 passed／0（新增 3 項邊界）；tsc 乾淨；隔離環境 `meeting-print-orientation-check.mjs` **8/8**（先載入 ITP 的橫式 @page 再列印：PDF 3 頁＝直、橫、橫，5 張照片依上傳順序且全部載入，`print-a4-with-photos.pdf`）、`meeting-tabs-review.mjs` **49/49**、MEETING-FIX 回歸 **39/39**。

- R2 審查 PASS 後：照片頁高度依建議 186mm → 184mm，列印檢查重跑 8/8。

## R3（使用者在隔離環境 3360 試用後，經協調中心轉達，2026-10-11）
- 使用者原話：「我會議記錄例 會有起始日期 每週的日期記錄更新內容」；看編輯畫面後覺得「太混亂」，選定「本週更新／編輯結構」兩種模式。本工作階段向使用者確認：起始日期放事項本文上方；日期格式「21 Jul 2026」。會議記錄沒有 Word 匯出（只有列印），本輪只改列印。
- 事項加 `raisedDate`（存在 discussionLog JSON，不改 schema）：新事項預設本次會議日期，舊資料空白；下次會議帶入時保留（後端 carry_forward 加 raisedDate）。
- `DiscussionRegister.tsx` 改兩種模式：
  - 本週更新（預設）：只列開啟表單時的未結事項（本週改成已結的仍留在畫面上直到關閉）；事項本文唯讀，上方起始日期；以前的更新「日期＋內容」灰字；每項一個「本週」欄（日期預設會議日、可改），直接寫入本次會議那一筆更新，清空即移除，存檔才寫入；狀態下拉。
  - 編輯結構：新增／刪除大類、子類、事項，修改內容、Action by、目標日期、起始日期、狀態；進行中／已結案／全部篩選；新增列。帶入列內文唯讀、不可刪。
  - 已發布／作廢：兩種模式都唯讀（模式與篩選鈕可切換）。
  - 原本的「新增進度」按鈕與 updateDrafts 機制移除（本週更新直接存在 discussionLog，離開提醒自然涵蓋）。
- `discussionLog.ts`：`currentUpdateIndex`／`setCurrentUpdate`（本次會議那一筆，不動帶入的）、`formatMinutesDate`（YYYY-MM-DD → 21 Jul 2026，其他原樣）。
- 列印：起始日期在事項本文上方；會議日期、起始日期、進度日期、目標日期、簽核日期改「21 Jul 2026」；列表的會議日期欄同樣格式。
- 新鍵（中英）：modeWeekly、modeStructure、thisWeek、raisedDate、weeklyEmpty。LanguageContext 工作樹另有 Audit 未提交的 2 行（audit.wizard.stepAgenda），提交時只 stage 本輪的 10 行。
- R3 審查 PASS 後依建議再修 4 點：本週欄先選日期再打字時保留所選日期；只有空白不建立／清成空白即移除；在編輯結構刪除重編號時，本週模式的「開啟時未結」清單與暫存日期跟著改編號；有輸入的新增列切回本週模式前先確認（新鍵 discardNewRow 中英）。同一事項多筆本次（非帶入）更新只會出現在 R2 版存的資料，R2 版未上線正式站，不處理。
- 驗證（最終）：後端 46 passed（帶入保留 raisedDate）；`npm test` 156 passed／0；tsc 乾淨；隔離環境 8344／3344：分頁 **64/64**（含兩種模式、起始日期預設、本週欄、先選日期再打字、只有空白不存、帶入後結構模式唯讀）、列印方向 **8/8**、MEETING-FIX 回歸 **39/39**，皆已 down。

## R4（使用者在 3360 看 R3 後，經協調中心轉達，2026-10-11）
- 使用者：「不能整再一起嗎？」→ 選「每項旁邊 ✏️，點了就地編輯」；並要求「this week 字眼可以移除」。
- `DiscussionRegister.tsx` 改為單一畫面（拿掉本週更新／編輯結構切換）：
  - 預設只顯示未結事項；上方「顯示已結案」勾選與「＋ 新增類別」。本次開啟時未結、本次才結案的事項仍顯示並保留更新欄；以前就結案的事項沒有更新欄。
  - 事項平常唯讀：起始日期、內容、以前的更新（灰字）、更新欄（日期＋輸入，無「本週」標籤，提示「新增進度…」）；Action by、目標日期為文字；狀態下拉直接改。
  - ✏️：只有該列變輸入框（內容、Action by、目標日期、起始日期），✓ 套用、✕ 取消；同時只開一列（開啟時其他列不顯示 ✏️／🗑／新增鈕）。🗑 先確認（`confirmDeleteRow`）。帶入列：內容與起始日期唯讀，Action by／目標日期可改，不可刪。
  - 類別／子類列：標題 ✏️ 修改；類別列有「＋ 新增子類」「＋ 新增事項」，子類列有「＋ 新增事項」。新增的列在其上層最後一列之後直接以編輯狀態出現，✓ 前不寫入 discussionLog，✕ 不留任何東西。
  - 已發布／作廢：無 ✏️、🗑、新增鈕、更新欄，全部唯讀（「顯示已結案」仍可勾）。
- 模組表單：`RegisterAdder` 改為 `RegisterEdit`；離開提醒與擋存檔改用 `isEditDirty`（新列有輸入，或既有列有變更才算）。
- 翻譯：新增 showClosed、editRow、applyRow、confirmDeleteRow（中英）；`updateContent` 改「新增進度…／Add progress…」；移除不再使用的 modeWeekly、modeStructure、weeklyEmpty、discardNewRow、addUpdate、thisWeek（皆本任務先前新增）。LanguageContext 工作樹仍有 Audit 的 2 行，提交時只 stage 本輪區塊。
- R4 審查 PASS 後依建議：本次新增的事項計入「本次開啟時未結」，本次才結案仍留在畫面；刪除單一事項的確認文字只問該事項（新鍵 confirmDeleteItem）。
- 使用者再補充（協調中心轉達）：「Add 按鈕太大、要符合欄寬」→ 新增大類／子類／事項改為小型按鈕（12px、不換行、不撐欄）；「鉛筆也太大，有啥額外用途」→ 選 B：✏️／🗑 改 14px 淡灰色小圖示，平常隱藏，該列 hover 或鍵盤 focus 才出現，觸控裝置（hover: none）常駐；「文字框依照內容調整」→ 事項內容、進度、類別標題、新增列的輸入框都改成依內容自動長高（空白一行高、無捲軸，隱藏分頁切出時重新量測）；更新欄日期框與輸入框同高。列印不受影響。新增 `DiscussionRegister.module.css`。
- 驗證（最終）：`npm test` 156 passed／0；tsc 乾淨；隔離環境 8344／3344：分頁 **92/92**（另含：800 與 1400 寬度下所有按鈕在欄內、無欄位溢出、按鈕單行 ≤26px；圖示平常透明、hover 與鍵盤 focus 顯示、✏️ ≤22px；更新框空白一行高、多行長高無捲軸、清空縮回；編輯框依內容高度）、列印方向 **8/8**、MEETING-FIX 回歸 **39/39**。觸控裝置常駐顯示只讀碼確認（`@media (hover: none)`），未在實機測試。
- R5 審查 PASS 後依建議：字型載入完成後再量一次文字框高度；`.autoText` 提高權重（不依賴樣式表載入順序）。最終重跑分頁 92/92、列印 8/8、MEETING-FIX 39/39，npm test 156/0、tsc 乾淨。
- R4 初版驗證：`npm test` 156 passed／0；tsc 乾淨；隔離環境 8344／3344：分頁 **76/76**（單一畫面、預設不顯示已結、新增直接編輯並聚焦、✏️ 單列、✕ 不變、✓ 套用、刪除確認後重編號、更新欄無標籤與提示文字、帶入列 ✏️ 只能改 Action by、已發布無任何編輯控制與更新欄、未套用的新列擋存檔並切回分頁）、列印方向 **8/8**、MEETING-FIX 回歸 **39/39**，皆已 down。後端本輪未改。

## R6（使用者：「按下＋add category; Add 應該直接帶出序列號」，經協調中心轉達）
- 新增列的 # 欄改顯示將取得的編號（類別 n.0、子類 x.y、事項 x.y 或 x.y.z），淡色，套用後轉正常；與 ✓ 時 addEntry 使用同一個 nextNo，一定一致。
- 編號行為：✕ 不佔號（下次同號）；沒有帶入列時，刪除後重新連號（例：刪 1.2，原 1.3 變 1.2）；有帶入列時編號一律不動，刪除留下空號，下一個是最大號＋1，不重用空號（例：刪 2.2，2.3 不變，下一個 2.4）。
- 測試環境：本工作階段的 vite 啟動器改用獨立依賴快取 `node_modules/.vite-meeting-review`——與協調中心 3360 預覽共用 `node_modules/.vite` 時，互相重新最佳化造成「504 Outdated Optimize Dep」，頁面載入失敗（第一次重跑兩次都卡在這裡）。
- 驗證：tsc 乾淨；隔離環境：分頁 **102/102**（含上列編號行為）、列印 8/8、MEETING-FIX 39/39。獨立審查 R6 PASS。

## R7（使用者：「會議記錄內的每件事項都是要追蹤的，Action by 就是指定人員」→ 選「拿掉，以討論事項為準」，經協調中心轉達）
- 表單拿掉「行動項目」分頁（剩 4 個）：移除 Follow-up 草稿／即時建立／查詢已開 Follow-up 的程式；存檔流程不再建立 Follow-up（延後狀態只剩「有待上傳附件」一種情況）。
- 舊資料：已由會議記錄開出的 Follow-up（sourceModule=MEETING）不刪不改，在 Follow Up 模組照常可看可追蹤，點來源仍可開回會議（Follow Up 既有的 ?openId= 深連結）。**正式站（協調中心 2026-10-11 唯讀查詢，sqlite3 -readonly）：followup 中 sourceModule=MEETING 為 0 筆；meeting_minutes 只有 2 筆（QTS-NA-MEETING-000001 rev 1.0 Published、discussionLog "[]"；rev 2.0 Draft、discussionLog NULL），皆無討論事項，舊格式寫回與「空白下次會議」退回前一版在正式站都沒有實際資料受影響。**
- 後端 `POST /followup/bulk/` 與 `validate_followup_source_reference` 的 MEETING 分支：**保留不動**。理由：不影響使用；舊 Follow-up 的來源驗證仍需要 MEETING 分支（編輯舊 Follow-up 時會再驗）；bulk 端點移除屬 API 變更，需另案核對呼叫端與測試。前端已無任何呼叫 bulk 的地方。
- 清單頁新增「未結事項」檢視，與「已結案項目」並列（會議清單／未結事項／已結案項目）：
  - 未結：每個系列只取最新一次（rev 最大，同 rev 取較晚更新），作廢會議不算；已結：所有非作廢會議（結案事項不會再被帶入，所以只出現一次）。
  - 欄位：#、事項（上方灰字為大類／子類）、Action by、起始日期、目標日期、狀態、來源會議（編號＋版次＋標題）。
  - 篩選：Action by 下拉（自由文字值去重）、「只看逾期」；搜尋框也作用於事項。
  - 逾期（目標日期早於今天且未結）：紅字＋「逾期」標籤，排序在前，其次依目標日期。
  - 點列開啟該會議。
- Action by 維持自由文字（可填外部公司）。
- DECISIONS.md 新增「會議記錄：以討論事項追蹤，不再從會議開 Follow-up」，註明取代先前任務文件中的「Action by 與 Follow Up 分開」。
- 翻譯：新增 viewOpenItems、noOpenItems、overdue、overdueOnly、allOwners、colSourceMeeting；移除已不用的 actionItemsSection、actionTitle、actionItemsHint、noActionItems、actionItemPending、stepActionItems、closedItemsTopic、closedItemsMeeting、itemOwner、topicDiscussion（中英各 10）。
- 測試：`discussionLog.ts` 新增 `latestPerSeries`／`collectRegisterItems`＋2 項單元測試；`meeting-tabs-review.mjs` 新增 1b（6 筆未結、逾期在前且紅字、依 Action by 篩 3 筆、只看逾期 1 筆、已結 3 筆、點列開會議）、分頁改 4 個；`meeting-fix-review.mjs` 移除行動項目情境（原 2 的行動項目斷言、整個情境 3、情境 5 的行動項目），情境 4 改用 API 建立草稿。
- 驗證：tsc 乾淨；`npm test` 158 passed／0；隔離環境：分頁 **110/110**、列印 **8/8**、MEETING-FIX 回歸 **28/28**（較前少，因行動項目情境已移除）。
- R7 審查 REVISE 後修正：
  - 【必改】事項檢視原本建立在已被後端搜尋（只比對會議編號／標題）篩過的清單上：標題搜尋可能只剩舊版次而把已結事項列為未結，搜尋事項內文則永遠為空。改為事項檢視不送搜尋給後端、載入完整清單，搜尋只在前端比對事項（內文、Action by、大類、會議編號）。原「已結案項目」檢視也有同樣問題，一併修正。
  - 【建議】舊程式建立的下次會議討論紀錄是空的（當時不帶入；正式站那筆週期性會議即是），未結總覽改為取每個系列「最新且有討論紀錄」的一次（`registerSourcePerSeries`），避免前一次的未結事項消失。限制：若使用者刻意把最新一次清空，總覽會顯示前一次的未結事項。
  - 【建議】切換未結／已結檢視時清空 Action by 與「只看逾期」篩選。
- 使用者再補充（協調中心轉達）：「第一筆內容沒有縮排」→ 有起始日期的事項，內容在起始日期下方，與進度更新同樣縮排（畫面 12px、列印沿用 .update-text）；沒有起始日期的舊事項不縮排。
- 驗證（最終）：tsc 乾淨；`npm test` 159 passed／0；隔離環境：分頁 **113/113**（新增：搜尋事項內文可找到、內容與進度縮排一致、列印縮排）、列印 **8/8**、MEETING-FIX 回歸 **28/28**。

## R8（使用者：「第一張圖應該放到第二張圖一起」——類別列上的新增按鈕移到上方工具列，經協調中心轉達）
- 上方工具列依序「＋ 新增大類｜＋ 新增子類｜＋ 新增事項」（小尺寸）；類別／子類列不再放新增按鈕。已發布／作廢不顯示工具列。
- 新增子類／事項的預設位置：最後點過（滑鼠按下或鍵盤 focus）的那一列所屬的標題——點的是事項就取其上層，新增子類則取該標題的大類；沒點過就放在最後一個大類下。點過的位置在刪除重編號時跟著改。
- 新列 # 欄：淡色預計編號，下方一個小的「所屬」下拉（子類只列大類；事項列大類與子類），改了就重算預計編號、新列移到該標題最後一列之後。
- 沒有任何大類時，新增子類與新增事項停用，tooltip「請先新增大類」。
- 翻譯新增 parentRow（所屬／Under）、needCategoryFirst（中英）。
- 驗證：tsc 乾淨；`npm test` 159／0；隔離環境：分頁 **119/119**（新增：工具列三鈕順序、無大類時停用與提示、標題列無新增鈕、點 1.1.1 後新增事項預設在 1.1→1.1.2、改所屬為 1→1.3）、MEETING-FIX 回歸 **28/28**、列印方向第一次 **逾時失敗**（列印未在 15 秒內觸發，第 56 行 waitForFunction），隨後同一份程式重跑兩次皆 **8/8**；R8 未改列印程式，判斷為新啟動環境載入圖片較慢的偶發，紀錄保留。
- R8 審查 PASS 後依建議：✓ 新增後「最後點過的位置」改為新標題（或新事項的上層），下一次新增預設放那裡；停用的新增鈕改 aria-disabled（可用鍵盤聚焦，按下時以提示訊息說明「請先新增大類」，不新增）；預設所屬若不在下拉選項中改用第一個選項。
- 驗證（最終）：tsc 乾淨；`npm test` 159／0；分頁 **121/121**（新增：鍵盤按停用鈕顯示原因且不新增、新增大類後下一次預設放在它下面）、列印 **8/8**、MEETING-FIX 回歸 **28/28**。

## R9 已收回（2026-10-11）
- **使用者 2026-10-11 決定暫不放照片，已 revert。** 經過：使用者看 R9 後想把照片放進文字中間（R10，選了「內容分段」格式與「拿掉討論照片附頁」），隨後在協調中心改為「暫時不要文字匡內貼入照片」，並確認「討論事項完全不放照片」（本工作階段 AskUserQuestion 再次確認同一答案）。R10 未開始實作。
- 收回方式：`fbce7383`（Revert "…R9"），內容與 `git revert 8aa5cd33` 相同；因 LanguageContext.tsx 工作樹有 Audit 未提交的 2 行，`git revert` 會拒絕，改以反向修補只套用到暫存區與工作樹（未用 stash／reset，未改寫歷史）。R9 動到的 15 個檔案，提交後與 R8（86932e29）逐檔完全相同；attachment_access.py、file_router.py（CRLF）、meeting_minutes_service.py 皆回到 R8。R9 文件提交 35e64cfa 保留（下方 R9 段與 evidence 中的 photos-* 檔為當時紀錄）。
- 照片維持原做法：在「附件」分頁上傳，列印放在橫式照片附頁。日後要恢復 R9：revert fbce7383。
- 收回後驗證（＝R8 行為）：後端 meeting／followup／integration **46 passed**；`npm test` **159／0**；tsc 乾淨；隔離環境 8344／3344：分頁 **121/121**、列印 **8/8**、MEETING-FIX **28/28**，皆已 down。

## R9（使用者：「會議記錄討論中如果要文字匡貼上照片可以嗎」→ 選「貼在哪筆就掛在哪筆，縮圖顯示」、列印「正文標註＋照片附頁」，經協調中心轉達）
- 輸入：在「新增進度」欄（掛在本次那一筆進度）或 ✏️ 編輯中的事項內文（掛在事項本身）按 Cmd/Ctrl+V 貼上剪貼簿圖片、拖曳圖片到該文字框，或按旁邊的小相機圖示選檔（可多選）。只收圖片。本次進度若還沒有文字，貼照片會建立一筆只有照片的進度（日期＝該欄日期，預設會議日）。
- 存放（後端 2 處＋1 處）：沿用會議記錄附件上傳，新附件類別 `discussionPhoto`（`core/attachment_access.py`：ALLOWED_CATEGORIES 與 IMAGE_ONLY_CATEGORIES 各加一項）——類型（實際解析圖片）、20MB、`meeting:update` 權限、範圍、Published／Void 鎖定全部沿用既有檢查。歸屬只存附件 id 在 discussionLog JSON：事項的 `photos[]`、每筆進度的 `photos[]`；JSON 不存 base64、不存 URL；不改 schema、不加資料表。
- 何時可貼：已存在的草稿（上傳需要會議 id）且有 `meeting:update`。新建未存的會議貼上會提示「請先儲存成草稿，再加入照片」，不上傳。已發布／作廢唯讀。
- 畫面：縮圖 64px 顯示在該筆文字下方，點了放大（沿用 ImagePreviewOverlay）。✏️ 編輯中可移除事項本文的照片；本次那筆進度的照片隨時可移除；以前的（含帶入的）唯讀。
- 帶入（New Occurrence）：後端 carry_forward 連同事項與進度的 `photos` 一起複製 JSON —— 引用同一個附件 id，不複製檔案；帶入的照片唯讀、不可移除。
- 協調中心三點：
  1. 跨版次權限：下一版次的專案／廠商照抄自來源，附件讀取依附件所屬會議（來源版次）檢查範圍，所以在兩版次的專案／廠商相同時，看得到 2.0 的帳號讀得到 1.0 的照片（**前提：若在 2.0 草稿把廠商或專案改成別的，只看得到新廠商的帳號會讀不到 1.0 的照片，縮圖顯示「照片無法顯示」——不會外洩，只是看不到**）；作廢不影響讀取（作廢只鎖上傳／刪除）。已測：有廠商範圍的帳號在 1.0 作廢前後都能取 metadata 與下載；其他廠商 404。缺口與處理：若 1.0 被刪除（草稿或作廢可刪），有範圍的帳號會讀不到 → **後端拒絕刪除「照片仍被其他會議顯示」的會議（400）**。
  2. 刪除語意：帶入的照片在 2.0 不可移除（UI 無 ×），不會刪檔。自己這次貼的：移除立即刪檔（從未存檔）；之前已存檔的：移除後存檔成功才刪檔（best effort）。**後端另加防線：會議的 discussionPhoto 若仍被其他會議的討論紀錄引用，刪除附件回 409**，檔案保留——例如 1.0 仍是草稿時移除一張已帶到 2.0 的照片，1.0 只拿掉引用、檔案留著（已實測）。
  3. 孤兒附件：貼上即上傳（需要會議 id，且能即時顯示縮圖）；這次上傳但沒存檔就按取消／返回（經離開確認）或建立下次會議放棄變更時，前端逐一刪除這些附件（best effort）。只有瀏覽器直接關閉、斷線，或刪除請求失敗時會留下孤兒 discussionPhoto（不被任何紀錄引用，不顯示），接受並註記。
- 列印：該筆文字後加「（見照片 See photo 1、2）」；照片附頁（橫式 A4、2×2）編號：討論事項照片在前，依事項順序（事項本文→各筆進度），說明「照片 Photo n｜1.1｜21 Jul 2026」（日期為事項起始日或進度日期）；附件分頁的圖片接在後面續號（說明為檔名），附件清單同步標註續號。照片沒有另外的「說明」欄位（貼上的圖片檔名多半無意義），未提供。
- 測試：後端 `tests/test_meeting_minutes_photos_http.py`（新，5 項：只收圖片＋未知類別、帶入為同 id 不複製、有範圍帳號跨版次可讀且作廢後仍可讀、其他廠商 404、被引用的照片 409／會議 400、解除引用後可刪）；單元測試 `addPhotos／removePhoto／allPhotoIds／numberPhotos`；瀏覽器 `tests-browser/meeting-photos-review.mjs`（新）。
- 測試帳號（seed）加了 `meeting:delete:all`，以便驗證刪除防線。
- 未改：`tests/test_attachment_hardening_http.py` 的 FRONTEND_CATEGORIES 說明表仍只列 meeting:attachment（其斷言不受影響：discussionPhoto 不在 ALL_KNOWN）；此兩支附件測試在本沙箱無法執行，交 3.11 全套。
- R9 審查 PASS 後依建議補孤兒清理缺口：(a) 表單卸載時（例如離開確認後切到其他模組的路由攔截）也清掉這次上傳且未送出存檔的照片；送出存檔的照片 id 先記下，存檔成功或進行中都不會被清；(b) 🗑 刪除事項時，其（非帶入）照片一併列入存檔後刪除；(c) 同一次存檔「移除照片＋發布／作廢」時，先寫成草稿、刪檔、最後才設狀態（刪檔改為等待完成），避免被鎖定拒絕留下孤兒。上傳期間若刪別列造成重編號，照片可能掛到錯的事項（審查列為邊緣情況，未處理）；「新建→存檔未完成」後需重開才能貼照片（資訊）；有 update 權限者可手寫 JSON 引用別場照片使其無法刪除（只擋刪除、不外洩，資訊）。
- 驗證（最終）：照片 **31/31**（新增：移除＋發布同次存檔刪檔、🗑 事項連帶刪檔、路由離開清理、仍在用的照片不受影響）、分頁 **121/121**、列印 **8/8**、MEETING-FIX **28/28**、`npm test` 160／0、tsc 乾淨。
- 驗證（R9 初版）：後端 meeting／followup／integration **51 passed**；`npm test` 160／0；tsc 乾淨；隔離環境：照片 **26/26**（未存會議不上傳並提示、貼上縮圖並載入、相機鈕、移除本次上傳即刪檔、✏️ 貼到事項本文、存檔 JSON 只存 id 且附件 2 筆、點縮圖放大、貼上後返回放棄即刪檔、列印標註與附頁說明、PDF 直／橫、帶入同 id 無複製、2.0 可顯示且不可移除、1.0 不可刪、1.0 移除後檔案仍在）、分頁 **121/121**、列印 **8/8**、MEETING-FIX **28/28**。

## 舊資料會不會被改寫
讀取時一律在前端轉成新格式（不改資料庫）。舊格式**草稿**開啟後按儲存，會以新格式寫回（內容、狀態、負責人不變，已實測）；已發布／作廢紀錄鎖定、不會被改寫（實測儲存按鈕不存在、資料庫內容不變）。後端帶入也讀舊格式。

## 驗證（實測）
- 後端（本機 3.14）：meeting 三檔＋integration＋followup **45 passed**（含舊資料庫刪欄位後跑 `_add_missing_columns` 補回、舊紀錄讀出 null）。
- 前端：tsc 乾淨；`npm test` **151 passed／0**（新 7 項）。ESLint：MeetingMinutes.tsx 深連結 effect 1 條 set-state-in-effect（MEETING-FIX 已記）；Modals 原有全形空白錯誤已隨改寫消失。
- 隔離環境瀏覽器（8344／3344，臨時資料庫，結束已 down）：
  - `meeting-tabs-review.mjs` **49 項全部通過**（`tabs-acceptance.txt`，截圖 7 張）：滿版、5 分頁順序、返回鍵、Meeting Type「-- Please select --」；新建三層＋進度（日期預設會議日）＋與會人員＋起訖時間存檔形狀；未加入的進度擋存檔並切回討論分頁；切分頁後待上傳檔案仍在；舊草稿讀取與寫回；舊已發布唯讀不改；下次會議只帶未結事項、編號不變、帶入列唯讀不可刪、新增進度與結案後原會議不變；列印含 SUBJECT／VENUE & TIME／RECORDED BY／DISCUSSIONS / ACTIONS／15:00 ~ 17:15／1.0／1.1.1；中文分頁名、「-- 請選擇 --」、記錄人、結束時間；無前端錯誤（HTTP 403 為該測試帳號無其他模組權限的儀表板請求，已排除）。
  - MEETING-FIX 回歸 `meeting-fix-review.mjs` **39 項全部通過**（`meeting-fix-regression.txt`）。
  - 截圖 05a／07 中分頁底線停在「基本資訊」是 0.15 秒 CSS 轉場時截圖；已用 DOM 確認 aria-selected 與 class 正確。
- **未做**：Python 3.11 全套；附件權限兩支測試（同 MEETING-FIX，沙箱卡住）；Word 匯出不在範圍（本模組原本就沒有）。

## 上線注意
有 schema 變動（`meeting_minutes.meetingEndTime`，啟動時自動補欄位，可空）。前端＋後端，需重建。疊在 AGENDA 之後需以當時正式站重做候選（協調中心已說明）。
