# NOI-EXPORT-DOCX-2026-001 — 交接摘要

選了「先做 NOI」。比照 ITR 匯出模式做完，後端 10/10（兩筆記錄分開驗）、前端 3/3 全部通過。

## 做了什麼
- 後端新增 `GET /noi/{id}/export-docx`，產生正式通知單 docx：基本資料表（Reference No／
  Contractor／Package／**Related ITP 直接讀真實欄位，不用像 ITR 那樣額外推導**——NOI 的 itpNo
  本身就是真 FK）／Checkpoint／日期時間／聯絡人／狀態／備註。
- 附件改用**列檔名**而非內嵌圖片——NOI 的附件分類允許圖片/PDF/Word/Excel 混合，不是純圖片。
- 刻意**沒有**加 Checklist 表格——讀碼確認 NOI 自己的畫面完全沒用到那個關聯，那是 ITR 才要呈現
  的內容。
- 前端加「Export Word」按鈕，重用了 ITR 那輪的翻譯鍵（避免為了改名牽動 ITR 檔案，技術上鍵名前綴
  是 `itr.` 但語意通用，不是誤用）。

## 證據
`docs/workflow/NOI-EXPORT-DOCX-2026-001-evidence/` 有兩筆記錄分別匯出的 .docx 檔案（一筆有附件、
一筆完全沒有），可以直接打開看。python-docx 解析確認：Related ITP 正確顯示、附件檔名正確列出且
**沒有**內嵌圖片（符合設計）、沒有附件時不印空區塊。

## 未做的事
未改 ITR/NCR/KM 既有匯出邏輯；未新增任何寫入路徑；未操作使用者 8198/3198；未 commit/push/部署。
REVIEW.md 留待獨立審查。

你之前列的其他候選（ITP／PQP／Meeting Minutes／FAT）都還沒動，要繼續哪個再說一聲。
