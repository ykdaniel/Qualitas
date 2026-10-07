# 共用表單 UI／UX：響應式與操作列可見性

日期：2026-09-29。延續使用者「各模組一致、好操作」要求，接續 `form-actions-unification-handoff.md`。本輪未更動後端、權限、狀態轉換或保存邏輯；未 commit／push／部署。

## 本輪變更

- `Shared/FormShell.module.css`：手機（640px 以下）欄位單欄、減少外圍留白、輸入字體 16px；平板兩欄、桌面三欄。Grid 使用 `minmax(0, 1fr)`，避免長內容撐開欄位。內容區可縮小及捲動，標題區不被壓縮。分頁可水平捲動，關閉及分頁按鈕增加鍵盤焦點外框。
- 使用上述共用 closeButton 的 12 個 TSX 檔案補上既有語系的關閉名稱（aria-label／title）；未變更 onClick、disabled 或 button type。
- `NCR/NCRModals.tsx` 主表單、`FAT/FAT.tsx` 明細表單：將最後的 FormActions 移到 modalBody 外，與內容區並列，長內容捲動時儲存／取消保持可見。FAT 新增行仍留在內容區。原有按鈕事件、唯讀及保存中條件保留。
- `ITR/ITRModals.tsx`：連結 Checklist 區塊窄畫面上下排列、選单限制在容器寬度內；解決長範本選項造成整個表單水平溢出。沒有改變連結動作。

## 實際發現與證據

修改前以 375×812 開啟 NOI 新增表單，實際 grid 為兩欄（baseline 模式記錄與截圖）。實作後跨模組驗證另外發現 NCR 操作列隨內容捲走、ITR Checklist 選單撐寬表單；分別定位並修正，不以隱藏內容遮蓋問題。

## 本輪驗證

- `tests-browser/form-ux-responsive-review.mjs`：60 項斷言通過。NOI／PQP／FAT／NCR／OBS／OSD／ITR／FollowUp／Meeting Minutes 九個新增表單，在 375×812 核對單欄、內容無水平溢出、關閉名稱、底部操作列位於視窗內、內容捲動時位置不變、取消不送出業務寫入。另以 NOI 核對 800px 兩欄、1440px 三欄及鍵盤焦點；FAT 明細加入 12 行本地項目後核對底部操作列可見、捲動不移位、取消無寫入。
- FAT 明細測試的前置條件會在隔離資料庫建立專用 FAT 紀錄；前置建立成功另有斷言，未計入上述 60 項。不宣稱整支腳本零寫入。
- `tests-browser/form-actions-review.mjs`：原按鈕統一的 169 項介面回歸通過，含多模組桌面表單、窄畫面中英文按鈕排列、列印隱藏操作列。
- TypeScript 型別檢查通過、前端單元測試 91 passed、Vite 建置通過（輸出至 /tmp，不覆寫開發 dist）。
- 真實隔離後端與 Chromium；未操作開發資料庫、上傳目錄或開發服務。後端未改，未重跑後端套件。

## 限制與交接

這是代表性表單排版驗證，不是全產品／所有角色或業務流程驗收。未測實體手機、Safari、螢幕閱讀器、手機鍵盤開啟後視窗尺寸；鍵盤焦點只在 NOI 代表案例實測。FAT 明細維持原有寬表格及表格內水平捲動，不宣稱已改為手機卡片。

本輪保留工作區協作者修改，未使用 stash／reset／checkout。後續請延續共用 FormShell／FormActions，不另建一套按鈕規則。無需重跑既有已完成的政策修正。

## 真實截圖

- [NOI 修改前](screenshots/form-responsive-2026-09-29/before-noi.png)
- [NOI 修改後](screenshots/form-responsive-2026-09-29/after-noi.png)
- [NCR 操作列](screenshots/form-responsive-2026-09-29/after-ncr.png)
- [ITR 窄畫面](screenshots/form-responsive-2026-09-29/after-itr.png)
- [FAT 長明細操作列](screenshots/form-responsive-2026-09-29/after-fat-details.png)

隔離堆疊已由專用 teardown 工具拆除，測試資料與伺服器已清理。
