# PQP 手機資料表水平溢出修正 — 2026-09-29

使用者要求：處理上一批記錄的「PQP 手機資料表溢出」發現。先讀最新 BACKLOG 與交接紀錄，在隔離環境
重現並定位原因，再做最小修正——資料表超出寬度時應在表格容器內橫向捲動，不把整個頁面撐寬；搜
尋、篩選、分頁及操作按鈕在手機上仍需清楚可用；不用整頁 `overflow:hidden` 掩蓋問題，不刪除欄位
或裁掉重要內容；保留既有資料、排序、篩選、權限及操作行為。優先限定 PQP；若根因在共用
`DataTable`，只修改必要部分，並挑另一個使用相同元件的模組做回歸，不擴大重排所有模組。

## 讀交接紀錄

讀了 `http-tests-and-mobile-header-2026-09-29-handoff.md` 與 BACKLOG.md 對應段落：上一批修完
BACKLOG #38（App Shell 頁首）後，順手發現 `/pqp` 頁面在 390px 仍有約 42px 殘餘水平溢出，DOM 檢
查指向一個 8 欄資料表，中英文皆發生（語言無關），記錄為「額外發現、未修」，明確排除在 #38 範
圍外。這正是本批要處理的項目。

## 重現

建立新的隔離環境種子腳本 `backend/scripts/verification/seed_pqp_mobile_table_overflow_review.py`
（帳號 `pmt_full`，`pqp:view:all`／`contractors:view:all`，6 筆 PQP，涵蓋
`WorkflowEngine.TRANSITIONS["PQP"]` 的全部 5 種真實狀態＋1 筆重複，標題刻意用長字串確保表格在
任何寬度下都會超寬）。隔離環境中英文 × 375/390/820/1440px 量測
`document.documentElement.scrollWidth - clientWidth`：

| | 375px | 390px | 820px | 1440px |
|---|---|---|---|---|
| 中文 | 57px | 42px | 0px | 0px |
| 英文 | 57px | 42px | 0px | 0px |

修正前的關鍵線索：**同一份資料下，57px／42px 這兩個數字完全固定，不隨語言或視窗寬度變化**，直
到視窗寬度本身超過某個門檻（介於 420～432px 之間）後才變成 0——這代表溢出量其實是「頁面根層
級的可捲動寬度是一個固定像素值（後續查出是 432px），視窗越窄則差額越大」，而不是「表格內容隨
語言/資料量變寬」這種正常的響應式溢出。這個特徵後來成為排除表格本身、鎖定另一個根因的關鍵。

## 定位根因（不是共用 DataTable 缺少捲動容器）

逐層量測從 `<table>` 往上每一層祖先的 `scrollWidth`／`clientWidth`：

- `components/ui/table.tsx` 的 `Table`：自帶 `<div className="relative w-full overflow-auto">`
  包裝，正確把表格裁切在容器寬度內（`scrollWidth` 1170~2449px 依模組而定，`clientWidth` 精確等
  於容器可視寬度）。
- `components/Shared/ModuleShell.module.css` 的 `.content`：本來就有 `overflow-x: auto`，同樣
  正確裁切。
- 再往上（`.container`、`main`、`.mainColumn`、`.shell`、`body`）**逐層量測 `scrollWidth` 全部
  精確等於 `clientWidth`，沒有任何一層在洩漏溢出**。

換句話說，表格自己的橫向捲動裁切從頭到尾都是正常運作的，`.content` 的 `overflow-x: auto` 也不
是本批需要新增的東西——**問題完全不在這條看得到的祖先鏈上**，唯獨 `document.documentElement`
（`<html>`）本身仍固定回報多出 42–57px，而 `<body>` 是 0。

進一步排查（用 `position: fixed`/`absolute` 元素掃描 + `getBoundingClientRect`）找到真正來源：
`DataTablePagination.tsx` 的 4 個分頁導覽按鈕（第一頁／上一頁／下一頁／最後一頁）內部都放了一
個 Tailwind `sr-only`（螢幕閱讀器專用可視文字，`position: absolute; width:1px; height:1px;
clip: rect(0,0,0,0); ...`）span 作為按鈕的無障礙名稱，但外層的 `<Button>`（`components/ui/
button.tsx`）**沒有設定 `position: relative`**。

依 CSS 規範，一個 `position: absolute` 元素若沒有任何定位祖先（`relative`/`absolute`/
`fixed`/`sticky`），其 containing block 會一路上溯到「初始容器」（約等於 `<html>`）。這個
`sr-only` span 因為沒有指定 `top`/`left` 等 inset 值，會保留它「在正常文件流中原本會出現的位
置」——而它原本會出現的位置，是**分頁列在未被 `.content` 裁切前、依表格完整寬度自然排列**的位
置（因為分頁列的文字，例如英文 "0 of 6 row(s) selected. Rows per page 10 Page 1 of 1 Go to
first..." 沒有換行，天生就會撐出跟表格一樣寬的自然版面）。於是這個 span 依「未裁切的完整版
面」算出的座標，直接算進 `document.documentElement` 自己的可捲動範圍——**繞過了 `.content` 明
明有效的 `overflow-x: auto` 裁切**，因為它的 containing block 根本不是 `.content`，而是頁面
根層級。這正好解釋了為什麼 `body`/`.content`/`.shell` 全部乾淨，卻只有 `<html>` 回報溢出，也解
釋了為什麼溢出量是「固定值」——因為它取決於分頁列在完整表格寬度下的自然排版位置，跟目前視窗
寬度或語言（只要文字沒換行）都無關。

**驗證因果關係（先用 JS 直接改 DOM，不動原始碼）**：對 4 個按鈕的父層強制加上
`style.position = 'relative'`，重新量測：

```
BEFORE patch  {"htmlScrollW":432,"htmlClientW":390}
AFTER patch   {"htmlScrollW":390,"htmlClientW":390}
```

確認因果關係成立後才落地成正式修正。

## 修正

`react-app/src/components/Shared/DataTable/DataTablePagination.tsx`：4 個分頁按鈕各自的
`className` 加上 `relative`（`"h-8 w-8 p-0"` → `"relative h-8 w-8 p-0"`，`"hidden h-8 w-8 p-0
lg:flex"` → `"relative hidden h-8 w-8 p-0 lg:flex"`），讓 `sr-only` span 的定位基準回到按鈕自
身，不再外洩到頁面根層級。

**範圍刻意限制在這一個檔案**：

- 未修改 `components/ui/button.tsx`（共用 `Button` 元件本身）——範圍只限這 4 顆分頁按鈕，不影
  響全站其他上百處使用 `Button` 的地方。
- 檢查過 `DataTableViewOptions.tsx`／`DataTableColumnHeader.tsx`／`DataTable.tsx`，皆沒有同樣
  的 `sr-only`＋無定位祖先模式，未變動。
- `.content` 既有的 `overflow-x: auto`、`Table` 自帶的 `overflow-auto` 包裝，兩者本來就運作正
  常，未變動、未新增任何 CSS。

## 本輪驗證

### 隔離環境重現與修正效果對照

同一份 `pmt_full` 種子資料，中英文 × 375/390/820/1440px：

| | 修正前（42–57px 溢出） | 修正後 |
|---|---|---|
| 整頁 `scrollWidth - clientWidth` | 42px（390）／57px（375） | **0px（全部 8 種組合）** |
| 表格自身容器 | 已有捲動能力（`scrollParentScrollWidth` > `clientWidth`） | 不變，仍正常可捲動 |

**視覺對照**（截圖，隔離環境擷取）：用 Edit 工具暫時還原掉 4 個 `relative` className（未使用
`git checkout`/`stash`），在同一個執行中的 Vite dev server 上分別對修正前／修正後狀態截圖，再
用 Edit 工具重新套用修正：

- `before-pqp-after-page-hscroll-attempt-390.png` / `after-pqp-after-page-hscroll-attempt-390.png`：
  對整個頁面執行 `window.scrollTo({left: 60, top: ...})`（模擬使用者對頁面本身橫向捲動）——修
  正前頁面真的被拖著橫移，連頁首（Welcome／PQP 麵包屑）都被裁切、露出左側空白；修正後
  `window.scrollX` 嘗試設為 60 後仍讀回 0（頁面本身完全沒有可捲動範圍，無事發生）。
- `after-pqp-table-scrolled-right-390.png`：修正後，直接操作**表格自己的捲動容器**（非頁面）
  捲到最右，可以正常看到 Operations 欄（刪除圖示），頁首／麵包屑/使用者資訊全程維持在原位不
  受影響——證明「表格容器內橫向捲動」這個預期行為本來就正常，本批沒有動到它。

### NCR 模組回歸（同一共用元件，不同模組）

額外在同一隔離環境跑 `seed_dashboard_stats_consistency_review.py`（既有種子腳本，`sc_full` 帳
號，NCR 7 筆，7 欄資料表，`scrollWidth` 2201–2449px，比 PQP 更寬）：中英文 × 375/390/820/
1440px 共 8 種組合，整頁溢出全部 0px；筆數與分頁指示器皆正常顯示，確認修正對另一個共用
`DataTable` 元件的模組同樣有效、沒有引入新問題。

### 互動驗證（390px）

- 搜尋欄：輸入精確編號可篩選、清空後還原全部 6 筆。
- 表格自身容器：可橫向捲動到最後一欄（Operations）。
- 分頁「下一頁」按鈕：捲動進可視範圍後仍是原尺寸 32×32px（不是被壓縮或裁切），可正常點擊。
- 列操作（View）：點擊仍可正常開啟詳情彈窗。
- 專案選擇／使用者資訊／登出／導覽：本批完全未觸碰對應程式碼，未重跑其專屬驗證腳本（沿用
  BACKLOG #38 那批已驗證過的行為），本批新增的 44 項斷言全數通過（`ALL PASSED (44 checks)`）。

### 型別／單元測試／建置

- `npx tsc --noEmit`：乾淨無輸出。
- `node scripts/run-unit-tests.mjs`：105 passed，0 failed（未新增測試，本批以隔離瀏覽器實測為
  主要證據，DataTablePagination 是純 UI 互動元件，沒有既有的 node:test 覆蓋這類元件）。
- `npx vite build`（輸出到隔離暫存目錄，非專案 `dist/`）：成功，無錯誤。

### 後端

本批未修改任何後端程式碼，只新增一個獨立的驗證用種子腳本（`seed_pqp_mobile_table_overflow_
review.py`），未重跑後端測試套件。

## 過程中發現、未修（記錄供後續排入）

PQP 列表頁的「Not Submit」狀態徽章顯示未翻譯的原始 i18n key `pqp.status.notSubmitted`（無論中
英文皆如此），而 `Under Review`／`Approved`／`Reject`／`Void` 四種狀態的翻譯都正常顯示。這是跟
本次表格溢出修正完全無關的既有翻譯缺口（`react-app/tests-browser` 截圖 `after-pqp-en-1440.png`
第一列可見），未在本批範圍內處理，未新增獨立 BACKLOG 編號（規模很小，之後處理 PQP 相關 i18n
或狀態顯示批次時可以順手補上這一個 key）。

## Claude 接續

- `DataTablePagination.tsx` 分頁按鈕現在都帶 `relative`；之後如果在同一個檔案新增其他帶
  `sr-only`（或任何 `position: absolute` 子元素）的按鈕，記得同樣要有定位祖先，否則同一類問題
  會再次出現在別的地方。
- 這次診斷手法（「溢出量是否隨視窗寬度/語言變化——固定值代表絕對定位脫離正常文件流，不是內容
  真的撐寬」）如果之後遇到類似「所有可見容器量測都乾淨、但 `document.documentElement` 卻回報
  溢出」的情況，可以直接沿用，不需要重新從頭排查。
- PQP「Not Submit」狀態的 i18n key 缺口（`pqp.status.notSubmitted`）尚未修，見上一節。
- 本批只驗證了 PQP（主要目標）與 NCR（回歸）兩個模組；其餘同樣使用 `DataTable` 的模組
  （KM／NOI／OSD／ITR／FollowUpIssue／IAM／Audit／KPI／ITP／FAT／Contractors／Checklist／
  MeetingMinutes／DocumentNamingRules）理論上會因為根因在共用元件而同樣受益，但未逐一實測，如
  果之後要處理某個模組的響應式問題，可以先確認是否已經因為這次修正而自動解決。

未使用 stash/reset/checkout，保留協作者未提交修改（過程中只用 Edit 工具暫時還原/重新套用 4 個
className 以取得修正前後對照截圖，未使用任何 git 指令）。未 commit/push/部署，未操作開發資料
庫／uploads／日誌。隔離堆疊（backend port 8198／vite port 3198）已於驗證結束後用
`isolated_stack.py down` 拆除，8198／3198 埠已確認釋放。
