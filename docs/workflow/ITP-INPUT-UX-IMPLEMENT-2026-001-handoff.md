# ITP-INPUT-UX-IMPLEMENT-2026-001 — Inspection Plan 項目面板版面改善 handoff

實作 `ITP-INPUT-UX-2026-001`（PASS）Finding 1，並納入使用者後續補充的完整版面
需求。**只修改 `react-app/src/components/ITP/ITPAdvancedEditor.tsx` 這一個
產品檔案**；日期標籤語意（Finding 2）、Subject 必填（Finding 3）**不在本批
範圍**，未觸碰。

## 修改內容對照使用者需求

1. **桌面編輯視窗約 1000–1100px，受 viewport 限制；窄螢幕接近全寬**——外層
   容器 `max-w-2xl`（672px）改為 `max-w-[1100px]`，保留既有 `w-full` 與
   `max-h-[90vh]`。隔離環境實測：1280px 寬視窗下面板實際寬度 1100px（整數值
   斷言核對，見 `run.log` desktop1）；375px 窄螢幕下面板寬度 343px（扣除外層
   `p-4` 的左右各 16px 留白，等於視窗扣除邊距後的全寬，見 `run.log` narrow1）。
2. **壓縮 Event No./Phase/Insert After 區塊**——`p-5`→`p-3`、`gap-6`→`gap-3`、
   標籤 `mb-2`→`mb-1`、輸入框 `h-10`→`h-9`、Insert After 子區塊
   `border-t pt-4 mt-2`→`pt-2 mt-1`。對照截圖可見這個區塊明顯變矮。
3. **Activity／Standard／Criteria 各自獨立成一個整列區塊**——原本 Standard
   與 Criteria 共用右欄、與左欄 Activity 左右對半擠壓的 `grid grid-cols-2`
   拆開；三者現在各自是 `<div>` 包住的獨立滿版區塊，依序垂直排列。每個區塊
   內部的 EN／中文欄位用 `grid grid-cols-1 sm:grid-cols-2 gap-3`：桌面
   （≥640px）並排，窄螢幕堆疊。隔離環境實測：桌面下 Activity 與 Standard
   兩個標籤的起始 x 座標相同（都是整列開頭，不是左右兩欄，見 `run.log`
   desktop2）；窄螢幕下 Activity 的 EN/CH 兩個 textarea 的 x 座標相同、CH 在
   EN 下方（確認真的堆疊，見 `run.log` narrow2）。
4. **長文字欄位改為多行、可向下擴展**——Activity／Standard／Criteria／Check
   Time／Method／Frequency 的 EN/CH 欄位全部從 `<input>` 改為
   `<textarea rows={3} ... resize-y>`，樣式比照原輸入框的邊框/圓角/字級。
   Criteria 的逐條新增（`handleCriteriaAdd`）／刪除（`handleCriteriaRemove`）
   互動完全沿用既有函式，只是外觀容器改為多行文字區。Record 欄位維持單行
   `<input>`（內容通常是短文件編號）。
5. **內容區捲動、標題與 Apply/Cancel 保持可見**——既有的 `max-h-[90vh]
   flex flex-col` + Header `shrink-0` + Body `flex-1 overflow-y-auto`
   這個結構本來就正確，本批改寬改高版面後**重新驗證**仍然成立：捲動面板
   內容到最底部，Header 仍在頂部可見、Apply/Cancel 仍在底部可見且可點擊，
   最後一個欄位（Verification Points）的下緣在 Apply/Cancel 按鈕的上緣之上
   （沒有被蓋住）——見 `run.log` desktop3/desktop4、narrow3，數值化的
   bounding box 核對，不是只憑肉眼看截圖。

## 證據檔案索引

全部產出於 `docs/workflow/ITP-INPUT-UX-IMPLEMENT-2026-001-evidence/`，
Playwright 腳本 `react-app/tests-browser/itp-input-ux-implement-review.mjs`
可重複執行，**10 checks executed, 10 PASS, 0 FAIL**（`run.log`）。

| 用途 | 檔案 |
|---|---|
| 桌面（1280px）面板頂部，Copy 既有長內容項目 | [`after-desktop-top.png`](./ITP-INPUT-UX-IMPLEMENT-2026-001-evidence/after-desktop-top.png) |
| 桌面捲動到底部，驗證 Header/Footer 不遮擋最後欄位 | [`after-desktop-bottom.png`](./ITP-INPUT-UX-IMPLEMENT-2026-001-evidence/after-desktop-bottom.png) |
| 窄螢幕（375px）面板頂部，EN/CH 堆疊 | [`after-narrow-top.png`](./ITP-INPUT-UX-IMPLEMENT-2026-001-evidence/after-narrow-top.png) |
| 窄螢幕捲動到底部 | [`after-narrow-bottom.png`](./ITP-INPUT-UX-IMPLEMENT-2026-001-evidence/after-narrow-bottom.png) |
| 複製既有項目→修改長文字→Apply 前（修改內容仍在） | [`roundtrip1-modified-before-apply.png`](./ITP-INPUT-UX-IMPLEMENT-2026-001-evidence/roundtrip1-modified-before-apply.png) |
| 保存整份 ITP 後，**全新瀏覽器 context** 重新開啟同一筆紀錄，修改後內容仍一致 | [`roundtrip2-reread-after-save.png`](./ITP-INPUT-UX-IMPLEMENT-2026-001-evidence/roundtrip2-reread-after-save.png) |

**「修改前」對照**：本批未另外用 git stash 等方式重建舊版畫面截圖（WIP 分支上
`ITPAdvancedEditor.tsx` 本身已有大量此批次之前就存在、未提交的其他改動，
stash 這個檔案會跳回比「這批之前」更早的未知版本，對照基準會失真，也不符合
既有「不用 stash 做範圍隔離」的協作慣例）。**桌面「修改前」沿用上一輪
ITP-INPUT-UX-2026-001 的既有截圖**：
[`../ITP-INPUT-UX-2026-001-evidence/finding1-copy-panel-truncated-fields.png`](../ITP-INPUT-UX-2026-001-evidence/finding1-copy-panel-truncated-fields.png)
——同一個 Copy 入口、同一筆測資，可直接與本輪 `after-desktop-top.png` 對照。
**窄螢幕「修改前」沒有可用的既有截圖**（上一輪純審閱沒有測過窄螢幕）；如實
記錄這個限制，不補一張用猜測重建的「修改前」窄螢幕畫面。

## 回應獨立審查對上一輪「複製流程驗證不完整」的指摘

上一輪只驗證了 Copy 入口與預填畫面正確；本輪的 roundtrip1/2 補上完整流程：
複製既有項目 → 在新版面板裡把 Activity EN 改成一段新的長文字 → 點 Apply →
點 Save 保存整份 ITP → **用全新登入的瀏覽器 context**（不共用前一個 page 的
任何前端狀態）重新開啟同一筆 ITP 紀錄 → 確認修改後的文字確實出現在重新讀出
的畫面裡（`roundtrip3`，比對前 60 字元）。這條完整流程本輪有實測證據，不是
只驗證面板打開瞬間的預填畫面。

## 全程未做的事（依 TASK.md 範圍限制）

- 未修改 `itp.submissionDate` 或任何其他既有 i18n key 的顯示文字。
- 未新增或修改任何必填驗證規則。
- 未修改 `InspectionItem`／`EMPTY_ITEM` 的資料結構或型別。
- 未修改 `handleChange`／`handleCriteriaChange`／`handleCriteriaAdd`／
  `handleCriteriaRemove`／`handleSaveItem`／`calculateNextId`／
  `handleCopyClick`／拖曳排序等既有函式的行為邏輯——只有呼叫這些函式的輸入
  元件從 `<input>` 換成 `<textarea>`，事件物件的 `.value` 讀取方式不變，
  不需要改函式簽章。
- 未修改後端程式碼。
- 未操作使用者 8198/3198 或開發資料庫。
