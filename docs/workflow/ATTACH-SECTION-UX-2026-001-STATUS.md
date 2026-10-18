# ATTACH-SECTION-UX-2026-001 — STATUS

執行者：Claude（「ITR模組檢查」工作階段）。派工與排程：「主要調度」。
範圍確認：使用者 2026-10-17（台灣晚上）「ATTACH-SECTION-UX 範圍照上面做，相關文件另案」；預覽確認 2026-10-18「ITR 附件區預覽可以，請提交」（皆由主要調度轉達）。

## 問題
ITR 視窗的 4 個附件區（缺失／改善照片、最新圖面、校正證書、附件）：
- 收起後看不出有沒有內容，也不像被收起（卡片下方留空白、箭頭太小）。
- 有附件的區塊也預設收起：預設展開只看紀錄欄位裡的舊格式字串，伺服器附件表的檔案不算。
- 從 Print 預覽回來後，手動收展會被重設。

## 修改（4 個檔案）
| 檔案 | 內容 |
|---|---|
| `react-app/src/components/Shared/CollapsibleSection.tsx` | 新增選用 props：`count`、`unsavedLabel`、`summary`（只在收起時顯示）、受控 `expanded`／`onToggle`、`expandLabel`／`collapseLabel`。整列標題就是切換鈕（`aria-expanded`；展開時才設 `aria-controls`）；收起時只剩一列。全專案只有 ITR 使用（git grep 核對）。 |
| `react-app/src/components/Shared/CollapsibleSection.module.css`（新） | 標題列樣式：hover 底色、20px 箭頭會旋轉、0 筆時標題淡化、橘色「未儲存」標籤、收起摘要（縮圖 40px／檔名）、480px 以下隱藏「展開／收合」字樣。不動共用的 `FormShell.module.css`。 |
| `react-app/src/components/ITR/ITRModals.tsx` | 只動 4 個附件區塊，另加：一次 `getEntityFiles('itr', id)` 取得各類別數量與摘要（`syncTokens` 變動時重抓；未知或載入失敗時不顯示數量）；收展狀態提升到 modal（Print 回來仍保留）；預設：新建只展開照片區，既有 ITR 有內容（伺服器附件或舊格式）的區塊展開，使用者手動收展優先；「n 項未儲存」＝待上傳加上待刪除。 |
| `react-app/src/context/LanguageContext.tsx`（CRLF） | ITR 區段新增中英各 3 鍵：`itr.attach.unsaved`、`itr.attach.expand`、`itr.attach.collapse`。只 +6 行，全檔仍為 CRLF。 |

未動：FileAttachment、FormShell.module.css、saveFlow／SaveFollowUpBanner／retryFiles（REFUSAL 2b）、RelatedDocuments（另案）。其他 8 個使用 FileAttachment 的模組沒有收合功能，不受影響。

## 驗證
- 實測（隔離環境 8292／3292，基準 247ee771＋本修改，Claude 內建瀏覽器）：
  - 有附件：數量正確；有內容的區塊預設展開，空區塊收起。
  - 收起摘要：照片區顯示 3 張縮圖；文件區顯示前 3 個檔名＋「+n」。
  - 0 筆：淡色單列，高度 49px，不留空白。
  - 加入待上傳檔：該區顯示「(0) | 1 unsaved」。
  - 刪除 1 個附件：顯示「(4) | 1 unsaved」，摘要中不再出現該檔。
  - Print 回來：收展狀態與「未儲存」標記保留。
  - 存檔後重開：證書 (1) 自動展開、附件 (4)。
  - 只有舊格式照片：照片區 (1) 展開。
  - 新建 ITR：只有照片區展開。
  - 375px 寬：無橫向捲動，標題換行正常。
- 讀碼（未實測）：附件清單載入失敗時不顯示數量；新 ITR 第一次存檔後，以 key 重新掛載並重新判斷預設展開。
- 在提交基準（69edeac5，與 6f68c768 對這 4 檔內容相同）上：`tsc --noEmit` 通過；eslint 只有原本 2 個 unused-vars 警告，無新增；`npm test` 217/217；`vite build` 通過。
- 獨立 Claude 審查：PASS。
  - 已修：未變動時不重新繪製；重載失敗時清空數量；`aria-controls` 只在展開時設定；舊格式照片在摘要中顯示為縮圖。
  - 未修（外觀或少見情況）：展開時標題底線兩側多延伸 8px；清單載入失敗時，「未儲存」只計待上傳，不計待刪除。
- 純前端：不需後端測試，也不需 Python 3.11。

## 重放
- 開發基準 247ee771；依序重放到 1b37ce9d、69edeac5，都以 3-way 乾淨套用。
- 提交父為 6f68c768（使用臨時 index，不推送、不動 ref）。
- sidecar patch sha256 73123cf9…a7f1。
