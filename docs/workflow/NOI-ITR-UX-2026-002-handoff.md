# NOI-ITR-UX-2026-002 — 載入狀態與返回流程證據補齊

延續 NOI-ITR-UX-2026-001，處理獨立審查 REVISE 判定的 R1/R2（完整原文見
`docs/workflow/NOI-ITR-UX-2026-001-archive.md`）。純審閱批次，不修改產品程式碼。問題 1
（導航缺陷）維持原分類「已重現的缺陷」，**不重新驗證、不重開調查**。

## R1 — 實際驗證 loading／error／empty 三種畫面（已完成，三者文字皆可明確區分）

**方法**：在自建隔離環境，對 `GET /api/noi/{id}/related`（讀碼確認
`react-app/src/services/relatedService.ts` 的實際路徑）：

- **loading**：攔截請求、刻意延遲回應，在請求仍 pending 時截圖。
- **error**：攔截請求、回傳模擬的 500（body 明確標註
  `"Simulated 500 for NOI-ITR-UX-2026-002 verification — NOT a real backend failure"`，
  不冒稱真實後端拒絕）。
- **empty**：`QTS-NIUP1-NOI-000001`（真正沒有任何關聯 ITR 的既有情境，非模擬）。

**實測結果（逐字記錄，未加工）**：

| 情境 | 畫面文字 | 截圖 |
|---|---|---|
| loading（模擬延遲） | `Loading...` | `r1a-loading-SIMULATED-delay.png` |
| error（模擬 500） | `Failed to load related documents.` | `r1b-error-SIMULATED-500.png` |
| empty（真實無資料） | `No related documents yet.` | `r1c-empty-REAL-no-data.png` |

三句文字彼此完全不同、語意清楚，**容易區分**，沒有發現會讓使用者誤判的情況（例如不會把
「載入中」誤認成「沒有資料」）。

**解除攔截後的恢復驗證**：

- loading 情境：釋放延遲的 Promise 後（不再攔截），畫面正確顯示關聯資料——見
  `r1a-after-delay-released-recovered.png`。
- error 情境：解除攔截後，**用現有方式**（關閉並重新開啟同一筆 NOI，即一次真正的重新
  載入，不是新增任何重試機制）確認畫面正確顯示關聯資料——見
  `r1b-after-unroute-reopened-recovered.png`。

## R2 — 實際操作瀏覽器返回，記錄真實結果（已完成）

### R2a：沿用已知的導航缺陷，實際按瀏覽器返回

1. 開啟 `QTS-NIUP1-NOI-000003`（REINSPECTION），點擊 Related Documents 裡的第一筆 ITR
   （`QTS-NIUP1-ITR-000003`）——見 `r2a-01-noi-open-before-click.png`。
2. 如 NOI-ITR-UX-2026-001 已確認：落地在 `http://127.0.0.1:.../itr`（未篩選的 ITR
   總清單，不是該筆紀錄本身）——見 `r2a-02-after-click-on-itr-list.png`。**這一步沿用
   前一輪結論，本輪未重新驗證這個缺陷本身。**
3. **實際按瀏覽器返回按鈕**（`page.goBack()`），記錄：
   - 返回後的 URL：`http://127.0.0.1:.../noi`（NOI **列表頁**本身）。
   - 畫面上是否有「Edit NOI」彈窗：**沒有**——只看到 NOI 列表頁，彈窗沒有自動重新開啟。
   - 截圖：`r2a-03-after-browser-back.png`。

**更正後的精確描述**：瀏覽器返回**確實能把使用者帶回 `/noi` 這個頁面**（不是停留在
`/itr` 或跳到別的無關頁面），但**不會自動重新打開**剛才在編輯的那一筆 NOI（`Edit NOI`
彈窗）。使用者要繼續剛才的操作，需要**再點一次**該筆 NOI 的列（如果列表排序/篩選/捲動
位置沒有變動，這一步只是「再點一次」，不是「重新搜尋」——本輪未發現需要重新輸入搜尋
條件或整個清單消失的情況，前一輪「只能重新搜尋」這個說法沒有實機證據支持，予以撤回）。
這個結果**沒有**被問題 1 的導航缺陷直接阻斷到「完全回不去」的程度——瀏覽器自己的
history 機制讓使用者至少能回到正確的列表頁，只是不會重新打開那個特定的編輯彈窗。

### R2b：對照組——手動從 ITR 清單開啟、關閉後的落點

1. 直接從 `/itr` 清單手動找到 `QTS-NIUP1-ITR-000004`（複驗那一筆）並點開——見
   `r2b-01-manually-opened-target-itr.png`。
2. 關閉該筆 ITR 的編輯彈窗，記錄落地的 URL：`http://127.0.0.1:.../itr`（回到 ITR 清單
   本身）——見 `r2b-02-after-closing-manually-opened-itr.png`。

這一步是單純對照「ITR 編輯彈窗本身關閉後的行為」（落回 ITR 自己的清單，符合預期，這條
路徑本來就沒有經過 NOI，不涉及任何返回 NOI 的行為），用來跟 R2a 的「透過 NOI 點進來、
再用瀏覽器返回」路徑做對比，不是另一個新發現。

## 問題 2 分類更正（不重新調查，僅修正措辭）

NOI-ITR-UX-2026-001 把「複驗 ITR 與原始 ITR 標題相同」列為「已重現的缺陷」，經審查指出
不成立：標題相同是 `create_reinspection()`（既有設計，逐字複製 `subject`/
`description`）的直接結果，**資料本身沒有錯**，使用者仍可透過文件編號、狀態、日期分辨，
只是不夠直覺。本輪將這一項**改列為「已觀察到的 UX 辨識改善」**，不再稱為缺陷。

同時撤回「只能靠比較文件編號大小」這類暗示使用者應該用編號大小去**推定**原始/複驗關係
的措辭——文件編號大小只是本輪種子資料剛好呈現出的現象（新建的複驗 ITR 編號比較大），
不是系統保證的規則，也不是使用者應該依賴的判斷依據。真正的判斷依據是既有的
`isReInspection`/`originalItrId` 欄位（目前未被顯示層讀出來用，這部分觀察維持不變，只是
改稱「可以更好」而非「這是個錯誤」）。

**問題 1（導航缺陷）維持原分類「已重現的缺陷」，本輪未重新驗證、未重開調查，直接沿用**
`docs/workflow/NOI-ITR-UX-2026-001-handoff.md` 的完整重現步驟、根因、最小改善方案。

## 本輪未新增任何第三項發現

依交辦明確要求，本輪只處理上述 R1/R2 與問題 2 的分類更正，過程中未發現任何需要另外
回報的新現象。

## 隔離與可重跑資產

- `backend/scripts/verification/seed_noi_itr_ux_review.py`（沿用 NOI-ITR-UX-2026-001
  的版本，本輪未修改）。
- `react-app/tests-browser/noi-itr-ux-review.mjs`（新建，隔離瀏覽器審閱腳本——性質是
  「操作並記錄實際觀察」，不是通過/失敗的斷言測試；每一行 `log()` 就是證據本身）。
- `docs/workflow/NOI-ITR-UX-2026-002-evidence/`（10 張截圖，本輪審閱產生）。

## 埠號釋放

隔離堆疊（backend/vite 8200/3200，root 為 `qualitas-manual-po4nva6q`）已於完成後以
`isolated_stack.py down` 拆除，並以 `lsof` 確認埠號釋放；使用者 8198（backend）/3198
（vite）全程監聽未受影響。
