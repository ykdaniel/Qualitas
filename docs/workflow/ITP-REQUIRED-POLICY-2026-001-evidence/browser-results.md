# ITP-REQUIRED-POLICY-2026-001 — 瀏覽器驗收實際結果（2026-10-07，約 15:00–15:10Z）

環境：隔離堆疊 backend `127.0.0.1:8270`、vite `127.0.0.1:3270`（run `fc3f0a50`，目錄 `qualitas-manual-ra667pd8`）；種子 `seed_itp_input_ux_review.py`，帳號 `itpux_full`（一次性密碼存 scratchpad，不入 repo）。
瀏覽器：Claude 內建瀏覽器（桌面預設寬度）。前端為工作樹版本（雜湊見 `tsc.txt` 等檔頭）。未使用 8240／3240、8198／3198。
方法：頁面內 JavaScript 以原生 setter 寫入 textarea 並派送 `input` 事件，按面板 Apply，判斷面板是否仍開著、四個欄位值是否與輸入相同，並讀取 toast。以下為工具回傳的實際結果（節錄）。

輸入順序為 [Activity EN, Activity 中文, Standard EN, Standard 中文]：

| 情境 | 輸入 | 預期 |
|---|---|---|
| both-empty | `'' '' '' ''` | 阻擋 |
| whitespace-only | `'  '`、`'\n\t '`、`'　'`（全形空白）、`' '` | 阻擋 |
| activity-ok-standard-blank | `'Act EN' '' '  ' ''` | 阻擋（兩欄各自必填） |
| english-only | `'Act EN only' '' 'Std EN only' ''` | 允許 |
| chinese-only | `'' '活動僅中文' '' '標準僅中文'` | 允許 |
| both-languages | `'Act EN' '活動' 'Std EN' '標準'` | 允許 |

## 1. `/itp/:id` 面板（`ITPDetail`）
- 新增模式 6 情境、編輯 B1 模式 6 情境：**12／12 符合**。三種阻擋情境皆 `blocked`、`inputsPreserved = true`，toast 為「Activity and Standard each need English or Chinese (at least one) before applying.」；三種允許情境皆 `applied`。
- 截圖 `01`：新增面板只填空白字元 → 阻擋，toast 與欄位標示「English or Chinese — at least one」（介面語言為英文）。
- 之後以強制重新載入捨棄這些未儲存的本機變更（重新載入後項目只剩 A1、B1）。

## 2. 只填中文：Apply → Save → 重開（`ITPDetail`）
- 新增項目：Activity 中文 `只填中文的檢驗活動：\n核對進場鋼筋之標示牌與出廠證明。`、Standard 中文 `　僅中文標準：CNS 560 鋼筋混凝土用鋼筋\n第二行說明 `（開頭全形空白、結尾半形空白），英文皆空。
- Apply → 面板關閉，產生 A2；Save Document → toast「Saved successfully!」。
- 強制重新載入 → 開 A2：`activityCH_exact = true`、`standardCH_exact = true`，開頭全形空白與結尾空白都保留，各含 1 個換行；英文兩欄仍為空字串（未自動複製或補值）。
- 清單頁 `ITPAdvancedEditor` 開同一筆 A2：中文兩欄逐字相同、英文為空。

## 3. 清單頁「Edit ITP」→ Inspection Plan（`ITPAdvancedEditor`）
- 新增模式 6 情境、編輯 B1 模式 6 情境：**12／12 符合**（阻擋皆保留輸入）。截圖 `02`：空白新增 → 阻擋。
- **既有行為（本批未改）**：清單頁彈窗的 `handleItemsChange`（`ITPModals.tsx:256`）在面板 Apply 時就以 `onApplyItems` 立即寫入伺服器，與主表單 Save 分開。因此本節三個「允許」的新增情境（A3 只英文、A4 只中文、A5 兩者）與編輯 B1 的最後一個情境（兩者皆填）**已寫入隔離資料庫**；我原以為未按 Save 即不寫入，此判斷錯誤。重新載入後表格顯示：A3「Act EN only／Std EN only」、A4「活動僅中文／標準僅中文」、A5 與 B1「Act EN | 活動／Std EN | 標準」——同時證明清單頁入口「只填中文」經 Apply 寫入後重新載入仍完整顯示。

## 4. 發現（非驗證，本批未修改）
- `Insert After` 選單只顯示 `item.activity.en`：只填中文的 A2、A4 顯示為「A2 -」「A4 -」（實測）。
- `ITPModals.tsx` 的 Generate Checklist（約第 460 行）只取 `activity.en` 與 `criteria[].en`：只填中文的項目產生的 Checklist 項目仍有 `[項目編號]` 前綴，但**中文活動描述未帶入**（只剩項目編號），**中文 Criteria 也未帶入**（讀碼確認，未實測產生）。（2026-10-07 依審查更正：原寫「產生空白的 Checklist 項目文字」不精確。）
- 後端：讀碼未發現 ITP 項目 Activity／Standard 的驗證，無衝突。

## 未驗證／限制
- 中文介面下的標示文字「英文或中文至少填一項」只確認翻譯鍵存在，未切換語言截圖。
- 驗收使用內建瀏覽器預設桌面寬度，未做寬度矩陣（本批不重跑版面驗收）；手機延期。
- 量測為頁內 JavaScript，非保存的自動化測試；規則本身另有單元測試 `tests-unit/itpItemValidation.test.ts`。
- 隔離資料庫中 B1 已被改為測試文字，另多了 A2–A5（僅隔離環境）。
