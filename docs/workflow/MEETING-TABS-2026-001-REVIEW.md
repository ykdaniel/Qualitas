# MEETING-TABS-2026-001 — REVIEW

審查者：獨立 Claude 審查代理（GPT 審查暫停，依協調看板規則 6）。只讀審查，未改檔。

## R1：REVISE
1. 【必改】刪除／重編號後，進度草稿與新增列的上層仍以舊編號記住：草稿看不到卻擋存檔、進度掛到錯的事項、新增列掛錯上層或成孤兒列。
2. 【必改】2026-08-29～31 存的扁平列（無 level、有 owner／status）被判成大類，存檔後負責人與狀態永久遺失；帶入時已結列也被帶過去。
3. 【建議】renumber 遇孤兒列會丟列、遇重複編號會重複子列。
4. 【建議】篩選鈕在 disabled fieldset 內，已發布／作廢看不到已結事項。
5. 【建議，需使用者決定】空的大類／子類每次都帶入且不可刪 → 使用者決定：不帶。
6. 【建議】只開啟空白新增列或進度草稿就觸發離開提醒。
7–9 資訊：hidden 依賴 Tailwind preflight；「主持人」改稱「記錄人」需使用者確認 → 使用者同意；meetingEndTime 清空送不到後端（與 meetingTime 既有行為相同）；分頁無 tabpanel／方向鍵（同 ITP）。

## R2：PASS
1、2 必改與 3、4、6 建議均已修並核對；5 依使用者決定實作。另審使用者追加的列印方向（具名頁面 @page mom／mom-photos，照片附頁 2×2、依上傳時間、列印前等待圖片）：無問題。tsc 乾淨、npm test 154 passed。
不擋 PASS 的建議：照片頁高度 186mm 留點餘裕 → 已改 184mm 並重跑列印檢查 8/8；其他模組不具名 @page 的非尺寸規則（如 KM 頁碼）仍可能套用（Audit 同樣情況，資訊）。

## R3：PASS（起始日期＋本週更新／編輯結構兩種模式）
setCurrentUpdate 邊界、唯讀兩模式、離開提醒與擋存檔、raisedDate 前後端與帶入、列印與日期格式、翻譯鍵、CRLF 均確認正確；tsc 乾淨、npm test 156 passed。
不擋 PASS 的建議（已全部處理）：1 先選日期再打字日期會丟 → 暫存所選日期；2 只有空白會存成更新 → trim；3 openAtStart 以編號記住，重編號後錯位 → 依刪除對照表改編號；4 切回本週會直接清掉已打字的新增列 → 先確認。
資訊：同事項多筆本次更新只來自 R2 版資料（未上線，不處理）；formatMinutesDate 不檢查日數（如 2026-02-31），影響可忽略。

## R4：PASS（單一畫面＋✏️ 就地編輯）
刪除時編號跟隨、新列插入位置、headingShown、帶入列 ✏️ 不寫入內容／起始日期、isEditDirty、已發布全唯讀、移除的翻譯鍵無殘留，均確認。tsc 乾淨、npm test 156 passed。
建議（已處理）：本次新增事項改已結案會立刻消失 → 新事項加入 openAtStart；刪除事項的確認文字依類型區分（confirmDeleteItem）。資訊：新列開著時取消「顯示已結案」若上層被隱藏，新列移到表尾（資料不受影響）。

## R5：PASS（按鈕縮小、✏️／🗑 hover 顯示、文字框自動高度）
nextNo 與 addEntry 編號一致；隱形按鈕可 Tab 聚焦且 focus-within 會顯示，有 aria-label；CSS module 的 tr:hover 只作用在討論區；AutoText 的 ResizeObserver 只看寬度、不循環，隱藏分頁首次顯示會補量；討論區已不用撐寬的舊按鈕。tsc 乾淨、npm test 156 passed。
建議（已處理）：字型晚載入可能少算高度 → document.fonts.ready 後再量一次。資訊（已處理）：.autoText 的 min-height 依賴樣式載入順序 → 改為 .autoText.autoText 提高權重。
