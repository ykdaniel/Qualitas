# ITR-INPUT-UX-IMPLEMENT-2026-003 — 交接摘要

產品程式碼變更，13/13 實測通過。使用者在對話中確認做三件事（都選了）：

## 1. Related ITP 死欄位 → 即時推導的唯讀顯示
拿掉下拉，改成從 NOI→ITP 即時算出來的唯讀欄位。實測證實核心問題已解決：選定 NOI 當下、以及全新
瀏覽器 context 重新打開，顯示的值**完全一致**（舊版下拉是「建立當下有值、重開後消失」）。
已知限制：列印預覽還沒跟著改（獨立元件沒有 NOI/ITP 清單可用），但也沒有比現在更差，留到下一批。

## 2. 品質評估搬到 Checklist 後面＋四個附件區塊可收合
Inspection Result/Status/Close-out Date/Remark 整塊移到 Linked Checklists 之後、照片/附件之前；
新建一個最小的共用 `CollapsibleSection` 元件，四個附件類區塊（照片、圖面、校驗證書、一般附件）
包進去，有內容的預設展開、沒內容的預設收合。上傳/刪除等既有行為完全沒動。

## 3. NOI 來源視覺標示
Subject/Contractor/Inspection Date/Related ITP 連結 NOI 時顯示「From NOI」小字提示，複用既有的
`.fieldHint` 樣式，沒新增 CSS。

## 證據
隔離環境（backend 8280/vite 3280，與使用者 8198/3198 無關）13/13 PASS，截圖與 log 在
`docs/workflow/ITR-INPUT-UX-IMPLEMENT-2026-003-evidence/`。`tsc` 無錯誤，lint 基線 13
errors/21 warnings 未增加。

## 未做的事
Related ITP 的列印預覽未同步更新（已知限制，已在 STATUS.md 說明）；
`itr.relatedITP`/`itr.selectITP` 既有中文翻譯缺口未補（不在範圍）；round 001/002 的 Checklist
Situation 完整保存/鎖定流程未重測（本輪沒碰那段邏輯）；未改任何後端或存檔契約；未 commit/push/
部署，隔離堆疊已拆除，8198/3198 全程未受影響。

REVIEW.md 留待獨立審查。
