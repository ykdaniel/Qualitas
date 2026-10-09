# ITR-INPUT-UX-IMPLEMENT-2026-005 — 交接摘要

從「還有什麼需要改」挑的第 1 項：Related ITP 列印預覽同步。只改一行，4/4 實測通過。

## 做了什麼
`ITRModals.tsx` 呼叫 `ITRPrintPreview` 時，把傳入的 `itpNo` 覆寫成 round 003 已經算好的
`relatedItp`（從連結 NOI 即時推導）。`ITRPrintPreview` 元件本身沒動。

## 證據
隔離環境 4/4 PASS：畫面值與列印值逐字相等；沒連結 NOI 時列印正確顯示「-」而不是
undefined/null。截圖在 `docs/workflow/ITR-INPUT-UX-IMPLEMENT-2026-005-evidence/`。

## 現況
ITR-INPUT-UX-2026-001 當初盤點的四項全部處理完畢。只剩 `itr.relatedITP`/`itr.selectITP` 的中文
翻譯缺口沒補（一直刻意排除在範圍外）。

未改任何後端；未操作使用者 8198/3198；未 commit/push/部署。REVIEW.md 留待獨立審查。
