# TASK — Checklist 範本編輯表格版面（方案 A）

TASK_ID: CHECKLIST-TEMPLATE-LAYOUT-2026-001
SOURCE: 使用者 2026-10-12 於協調中心選定方案 A（原話「先做 A」），由協調中心交辦本工作階段。
細節（2026-10-12 本工作階段，使用者選定）：
- Enter：只自動折行，Enter 不插入換行（列印版與 ITR 快照把換行顯示成空格，保持一致）；舊資料原有換行照常顯示。
- 輸入外觀：細框輸入框（白底、1px 淺灰框、圓角 6px，聚焦時藍框）。
- Actual Situation：一起改成同樣外觀、會自動長高的輸入框。

## 問題（使用者截圖）
畫面：Checklist Template Library 的範本編輯表格（`/checklist?openId=…&from=itp&returnItp=…`）。
1. Criteria 欄固定 200px、單行 input，內容被截斷（例如「Manufacturer, size ar…」），而 Criteria 通常比 Item 長。
2. Item 欄佔掉其餘寬度，內容短，右側大量留白。
3. Item 是底線 input、Criteria 是灰底框，外觀混用，列偏高。

## 範圍（`react-app/src/components/Checklist/`）
1. 欄寬改成比例：範本模式 Item 約 35%、Criteria 約 55%，# 與刪除鈕窄欄。顯示結果欄（showResultColumns）時另訂比例，不得擠壞。
2. Item、Criteria（以及 Actual Situation）改成依內容自動長高的多行輸入框，不截斷；共用 `Audit/AutoGrowTextarea.tsx`（不修改該檔）。
3. 統一輸入外觀，縮小列距。

## 不在範圍
方案 B（拆 ITP 代碼欄、分組）、方案 C（拖曳排序、中英分格）；資料格式、後端、列印版（ChecklistPrintTemplate.tsx）、ITR 快照（ChecklistSnapshotModal.tsx）、共用 ResultSelect 元件。

## 不得影響
- 範本模式 readOnly 規則（裸範本不能有結果；歷史資料範本唯讀）。
- 顯示結果欄時的 Actual Situation 與 Result。
- 存檔 payload。
- 從 ITP 進入時的 returnItp 返回。
- 1024 寬沒有水平爆版。

## 驗收
- tsc、eslint（改動檔）、npm test 通過。
- 隔離環境瀏覽器實測（範本模式、結果欄模式、1024 寬）並留截圖。
- 獨立 Claude 審查 PASS。
- 使用者於隔離預覽確認後，提交到本分支並把分支名與 hash 交協調中心；不推送、不開 PR、不部署。
