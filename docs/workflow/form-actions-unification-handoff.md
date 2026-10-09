# 表單按鈕統一 — 2026-09-29

使用者要求：所有模組表單內按鈕的位置、大小與顏色一致。本輪實際修改前端，未改後端或業務政策。

## 共用規範

- `react-app/src/components/Shared/FormActions.tsx`：明確的四個插槽 `tools / secondary / cancel / primary`。DOM/鍵盤順序與畫面一致：工具在左，工作流程操作、取消、儲存在右，儲存最右。條件顯示、callback、disabled、type、form 關聯由呼叫端保留。
- `FormActions.module.css`：主要動作 40px 高、14px 字、8px 圓角、16px 圖示。按內容決定寬度，不把長文案壓成兩行；工具與一般操作白底，發布等工作流程動作金色描邊，儲存深金色，刪除／作廢／撤回紅色。hover / disabled / keyboard focus 共用。
- 窄畫面分工具列與主要操作列，各自可換行；列印時不顯示操作列。
- 表格列內圖示操作統一 32px；欄位旁 TBC/NA/加入日期等輔助操作採 32px 緊湊款。頁籤、狀態選擇器、富文字工具列、照片覆蓋刪除控制與標題關閉圖示保留原用途，不當成儲存按鈕強行放大。
- `FormShell.module.css` 的 save/cancel/print/TBC/NA 按鈕轉接共用樣式，避免未來出現兩套標準。
- `ConfirmModal` 新增純呈現的 `intent`，預設 danger；ITP/ITR 發布確認明確傳 primary。確認事件與判斷不變，不依翻譯文字猜測危險動作。

## 套用範圍

PQP、ITP 主彈窗／獨立詳細頁／項目編輯面板、Checklist 範本頁、ITR 與 Checklist 實例面板、NOI 單筆與批次、NCR、OBS、OSD、FAT 主表／明細／預覽、FollowUp、Meeting Minutes、Audit wizard、KM 編輯、Contractors、Projects、IAM 使用者／角色／刪除確認／Data Scope 子表單、KPI 權重、文件編號規則、安全性設定，以及共用 ConfirmModal。

Checklist 範本頁與 ITP 獨立詳細頁原本在上方的主要動作移到表單底部。文件編號規則的保存亦由表格上方移至下方。子區塊的獨立保存維持在該區塊底部，不改保存時機。新增列等情境動作仍就近放在其內容區。

本輪沒有改任何事件處理、權限判斷、網路 payload、資料驗證或自動保存策略；並未把只讀表單開放成可編輯。

## 本輪驗證

1. 型別檢查 `tsc --noEmit` 通過。
2. 前端單元測試 91 passed；這些是既有回歸，不當作視覺證據。
3. Vite production build 通過，輸出至 `/tmp/qualitas-form-actions-build`，未寫入 react-app/dist。
4. 新增共用元件 FormActions.tsx 的 ESLint 通過，未聲稱全專案 lint 零問題。
5. `react-app/tests-browser/form-actions-review.mjs`：隔離後端、真實 admin 登入、真實頁面，最後完整重跑 **169 項斷言通過**。涵蓋 15 個模組主表單、Projects/Role、NOI bulk、ITP 詳細頁及項目面板、命名規則／Security／KPI；檢查實際 computed height/color/font/radius、DOM 取消→保存順序、按鈕不超出工具列、ITP 600px 中文及 375px 英文、print media 隱藏，以及開啟／取消沒有業務寫入請求。
6. 既有 `project-create-review.mjs`：在同一隔離堆疊建立專用測資後重跑 **22 項通過**，實際驗證 FAT/ITP 建立與保存、取消、權限/範圍拒絕、載入失敗重試及輸入保留。
7. 修改前檔案另存暫存快照，以 TypeScript AST 比對 **27 個 TSX 檔案**的所有 button 非樣式屬性（事件、type、disabled、form 等）集合相同；這是靜態補充證據，不等於全部流程實測。

沒有重跑全後端、所有模組的完整建立/核准/刪除流程或所有唯讀角色矩陣。FAT 明細、ITR 實例面板、危險確認等個別動作主要以型別檢查／保留事件契約佐證，本輪並未逐一提交操作。頁籤與各模組原本的中英混用文案不在此次改動範圍。

測試過程：初次隔離堆疊因啟動命令退出而結束，經工具拆除後以保持存活的父程序重建；測試腳本曾選到被項目彈窗遮住的外層取消，以及初始化語系蓋掉英文設定，均修正測試定位／初始化後再完整重跑。未將失敗嘗試列入成功結果。

## 截圖（隔離資料）

- [ITP 桌面](screenshots/form-actions-2026-09-29/itp-desktop.png)
- [ITP 窄畫面](screenshots/form-actions-2026-09-29/itp-narrow.png)
- [ITP 英文手機寬度](screenshots/form-actions-2026-09-29/itp-english-phone.png)
- [PQP](screenshots/form-actions-2026-09-29/pqp.png)
- [NCR](screenshots/form-actions-2026-09-29/ncr.png)
- [Checklist](screenshots/form-actions-2026-09-29/checklist.png)
- [Contractors](screenshots/form-actions-2026-09-29/contractors.png)

## Claude 接續

新增／调整表單操作時使用 FormActions 的插槽與 actionStyles 的語意樣式，不另加藍綠紫背景或個別 margin 推按鈕。工具動作放 tools、發布放 secondary、取消放 cancel、保存放 primary；不要用 CSS order 造成鍵盤順序不同。保留既有 disabled 與權限條件。

驗收腳本使用 `isolated_stack.py` 及 `project-create-vite.mjs`（8198/3198），密碼從隔離堆疊 `admin-password` 讀取，不寫死。修改本輪程式時可重跑對應驗證。不要還原共享工作區其他修改。

未使用 stash/reset/checkout，未 commit/push/部署，未操作開發資料庫／uploads／日誌。隔離測試全部結束後拆除。
