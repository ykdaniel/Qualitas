# ITR-INPUT-UX-IMPLEMENT-2026-004 — 交接摘要

使用者看了鎖定狀態下的 Checklist 快照畫面截圖後主動問「這部分還可以怎麼做比較好」，我提了兩項
低風險建議，使用者回覆「好」確認。只改了一個檔案，7/7 實測通過。

## 做了什麼
`ChecklistSnapshotModal.tsx`：
1. 鎖定（ITR Approved/Void）時，面板預設直接開在「Checklist Items」分頁，不再停在
   「General Information」——Reference no./Activity 在外層摺疊列本來就看得到，使用者通常是要查
   Situation/Result。
2. 鎖定時原本疊在一起的兩段提示（「這是唯讀快照」＋「因為 ITR 已核准而鎖定」）合併成一個提示框，
   沒新增任何翻譯鍵，文案都是原本就有的。未鎖定狀態、以及 Checklist 自己 Pass/Fail 時的 Reopen
   提示區塊完全沒動。

## 證據
隔離環境（唯讀互動，沒點擊任何會變更資料的按鈕）7/7 PASS，截圖與 log 在
`docs/workflow/ITR-INPUT-UX-IMPLEMENT-2026-004-evidence/`。`tsc` 無錯誤，lint 基線不變。

## 一個題外話
驗證過程中發現**上一個**（已銷毀的）隔離測試堆疊裡，ITR2 的 Approved 狀態在我沒有主動操作的情況下
被改成了 In Progress——查了 access log 確實有一筆 revoke-approval 的請求，但不是我的腳本或手動
操作送出的，懷疑是某個會在我編輯檔案後自動操作瀏覽器的機制誤觸。純粹是一次性隔離測試資料庫裡的事，
跟使用者的真實資料無關，已整組銷毀重建，已在 STATUS.md 記錄供你知悉。

## 未做的事
未改 `ITRModals.tsx`/其他檔案；未改 Reopen/判定邏輯；未操作使用者 8198/3198；未 commit/push/部署，
隔離堆疊已拆除。

REVIEW.md 留待獨立審查。
