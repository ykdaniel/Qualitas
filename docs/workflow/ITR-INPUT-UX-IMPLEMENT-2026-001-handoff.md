# ITR-INPUT-UX-IMPLEMENT-2026-001 — 交接摘要

實作完成，21/21 實機檢查通過。只改了一個檔案：
`react-app/src/components/ITR/ChecklistSnapshotModal.tsx`（ITR 內嵌 Checklist 的 Situation 欄位）。

## 做了什麼
- 可編輯時：Situation 從單行 input 改成 `textarea rows={3} resize-y`，可垂直拖曳調高。
- 唯讀／鎖定時：改成純文字 `<div white-space:pre-wrap>`，**不是**disabled 的 textarea——disabled
  表單元件在瀏覽器裡無法 focus/選取/複製，純文字 div 才能真正做到「可讀全文、可選取複製、但不能
  編輯」。鎖定狀態下這個區域附近也完全沒有 Save 按鈕，沒有任何路徑能觸發保存。
- 欄寬：Criteria 從 `w-1/4` 縮到 `w-1/6`，釋出的空間給 Situation（`min-w-[260px]`，盡量寬），
  Result 固定 `w-52` 保持清楚可操作。

## 驗收結果（21/21 PASS，獨立隔離環境 Playwright 實測）
1. 長中英文＋換行＋特殊字元（`<tag> & "quoted"`）填寫正常。
2. 保存成功、PUT 200；全新 context 重新打開後逐字相符（246 字元對 246 字元）；另一個從未編輯的
   item 維持原值不受影響。
3. 編輯後按 Cancel（含共用離開確認），重新打開看到的是上一次存檔值，不是剛打的草稿。
4. 鎖定（ITR Approved）狀態：沒有 textarea、改用純文字 div、完整換行內容讀得到、
   `white-space:pre-wrap` 確認換行保留、沒有 Save 按鈕。
5. 桌面 1280px 正常；窄螢幕 375px 頁面本身不產生整頁水平溢出（這項使用者有要求，已滿足）。**但
   誠實說明**：375px 下 Items 表格本身維持既有的橫向捲動（這是修改前就有的表格設計，不在本批範圍
   內），Situation/Result 欄要在表格自己的框內往右滑才看得到——不是「完全不用捲動」，已在
   STATUS.md 用截圖證據說清楚，避免誇大腳本的 `isVisible()` 通過的意義。
6. 模擬保存失敗（攔截 PUT 回 500）：輸入內容保留，錯誤訊息顯示，移除攔截後重試成功——沿用既有
   `handleSave` 的 try/catch，沒有新寫錯誤處理。

## 前端檢查
`tsc --noEmit` 全專案無錯誤；`lint` 基線 13 errors/21 warnings（與上一輪記載一致，本次修改檔案
沒有新增問題）；未重跑 `build` 或既有單元測試套件（範圍與改動幅度相稱，TASK.md 已預先說明）。

## 未做的事
附件收合、ITRModals 主表單重排、Related ITP、資料庫 schema、全站翻譯、ITP 系列——均在使用者原文
明確排除範圍內，本批未碰。未 commit/push/部署，隔離堆疊已正常拆除，使用者 8198/3198 全程未受影響。

證據：`docs/workflow/ITR-INPUT-UX-IMPLEMENT-2026-001-evidence/`（4 張截圖 + run.log）。
REVIEW.md 留待獨立審查。
