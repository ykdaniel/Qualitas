# ITR-EXPORT-DOCX-2026-001 — 交接摘要

「這可以匯出word嗎」確認要做。比照專案裡 NCR/KM 既有的 .docx 匯出模式（`core/docx_builder.py`
共用 helper），本批**第一次**涉及後端程式碼（新增端點與 service 方法，純讀取無寫入）。
後端內容驗證 11/11、前端 UI 驗證 3/3 全部通過。

## 做了什麼
- 後端新增 `GET /itr/{id}/export-docx`，產生正式 .docx 報告：基本資料表（含後端重新推導一次的
  Related ITP）＋**每筆連結 Checklist 的完整 Item/Criteria/Situation/Result 表格**（這是重點——
  之前連網頁列印預覽都沒有這塊，現在 docx 也有了）＋自由文字欄位＋簽名欄。
- `docx_builder.py` 新增兩個通用 helper（`add_paragraph`、`add_data_table`），不是 ITR 專屬，
  之後其他模組要做類似匯出可以直接用。
- 前端加一顆「Export Word」按鈕（只在已儲存的記錄上顯示，未儲存的新記錄沒有這顆——因為沒有 id
  可以呼叫匯出端點）。
- **追加**：使用者問「還有呢」，發現第一版完全沒處理附件照片，確認要補後直接在同一輪做完——
  Defect/Improvement Photos 真的嵌進 docx（用種子資料的一張真實 PNG 實測，解壓 .docx 確認
  `word/media/image1.png` 真的存在，不是只有檔名文字）；Drawings/Certificates/一般 Attachments
  因為不保證是圖片（PDF 等內嵌會失敗），改成列出檔名。兩種情況都有「完全沒有附件時不印空區塊」
  的防呆，已用 ITR1（完全無附件）實測確認。

## 證據
`docs/workflow/ITR-EXPORT-DOCX-2026-001-evidence/` 裡直接有下載下來的 .docx 檔案本身可以打開看，
加上兩份跑測記錄。用 python-docx 解析回來確認：Related ITP 正確顯示（不是空白）、Situation 儲存格
真的是多個段落（保留換行）、Result 顯示「合格 Pass」這種人類可讀文字，未判定項目顯示
「未填寫 Not filled」。

## 未測的部分（誠實列出）
沒有另外造一筆完全沒連結 Checklist 的記錄實測「不渲染」——這點是從程式邏輯直接確認的（空清單迴圈
不執行），不是分開跑一次實測；也沒有另外測非本人 scope 的使用者呼叫這個新端點會不會被擋（沿用的
是既有、已被其他端點驗證過的 scope 檢查機制）。

未碰 NCR/KM 既有的匯出邏輯；未新增任何寫入路徑；未操作使用者 8198/3198；未 commit/push/部署。
REVIEW.md 留待獨立審查。
