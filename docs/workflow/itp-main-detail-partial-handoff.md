# ITP 主資料成功／明細失敗的保存呈現與重試 — 交接紀錄

2026-09-28，Claude Code 實作並執行以下驗證。未 commit/push/部署。

## 先重現（隔離環境，實際請求序列）

編輯一筆既有 ITP 紀錄，**只改主旨欄位**（不動檢驗計畫，避免與「新增/編輯項目即時自動保存明細」這條獨立路徑混淆——`ITPAdvancedEditor` 的 Add/Edit/Delete/Apply 會透過 `onApplyItems` 立即呼叫 `PUT /itp/{id}/detail`，與主 Save 按鈕的保存流程是分開的兩件事），攔截讓 `PUT /itp/{id}/detail` 失敗，點擊「儲存」。

**修正前的實際行為**（真實請求序列＋資料庫核對）：
- `PUT /itp/{id}/` → `200`（主資料**已保存**）。
- `PUT /itp/{id}/detail` → 攔截失敗。
- 畫面提示：**「Network Error」**——只是把底層例外訊息直接丟出來，沒有說明主資料其實已經保存，容易被誤解為整筆都沒保存。
- 視窗保留、輸入保留、儲存鈕恢復可用——這幾點在先前批次已經是對的，本輪只有「提示文字」本身是問題。

## 最小修正（本輪已更正一次判斷邏輯）

`react-app/src/components/ITP/ITP.tsx`：既有紀錄更新分支（`else if (!skipRecordWrite)`）內，把 `updateITPDetail` 包一層 `try/catch`。

**中途發現並更正的錯誤判斷**：第一版曾依「`detailErr.response` 是否存在」分成「有回應＝確定拒絕（可稱「未保存」）」與「無回應＝結果未確認」兩種措辭。這個判斷**不成立**：收到 HTTP 回應只證明後端有回覆，不能證明沒有寫入——`services/itp_service.py::update_itp_detail` 是先 `commit()` 才 log/回傳，若 commit 之後、組回應之前發生任何例外，用戶端一樣會收到 500，但寫入其實已經完成。模擬 500 只證明「有回應」這個分支的程式碼會被執行到，並不能證明「該端點確實在寫入前拒絕」。

**更正後的最小修正**：不區分有無回應，**一律**使用保守措辭「主資料已保存；檢驗計畫的保存結果尚未確認，請確認後重試」，且**不**附加、也不顯示原始例外文字或原始回應內容（不會出現裸的「Network Error」，也不會把 500 的原始 body 當說明）。本輪未逐一核對 `update_itp_detail` 每個例外分支相對於 `commit()` 的先後順序以區分「確實寫入前拒絕」的特定情況，因此不擴大調查，統一採用這個保守提示。

丟出例外讓後面的附件階段（Phase 2）完全不會被執行到，因此：
- 附件待處理佇列（`pendingFiles`/`deletedFileIds`）不會被清空或標記完成——因為根本沒有程式碼路徑會在這個失敗分支去動它們。
- `isDirty` 維持 `true`（因為 `applyOutcome`／`setIsEditModalOpen(false)` 都在這個 throw 之後才會執行到，不會被呼叫）。

未新增大型共用 hook，未修改後端交易、權限或狀態機——`updateITP`／`updateITPDetail` 呼叫順序、`skipRecordWrite` 的既有比對機制皆未變動。

## 重試行為（如實記錄，已更正措辭）

- 因為 `onSave` 是 throw（不是 `return`），`ITPModals.tsx::handleSave` 裡的 `setLastWrittenPayloadKey(payloadKey)` **不會**被呼叫，所以重試時 `skipRecordWrite` 一定是 `false`——重試會**重新送出**`updateITP`（主資料）與 `updateITPDetail`（明細）兩者，不只是明細。
  - 好處：重試前使用者若又修改了其他欄位，會一併正確保存最新內容（已實測）。
  - **已觀察到重複寫入與稽核**：重試會對主資料再送一次 `PUT`，實測確認後端會因此多寫一筆 `UPDATE` 稽核紀錄。**其他副作用未驗證**——例如是否有其他監聽此稽核事件的下游流程、是否有並發寫入下的競態疑慮等，本輪沒有檢查，不宣稱「無害」。不在本批範圍內新增任何去重機制。

## 檔案

- `react-app/src/components/ITP/ITP.tsx`（`onSave` 既有紀錄分支加上明細失敗的專屬 catch）
- `react-app/src/context/LanguageContext.tsx`（新增 `itp.mainSavedDetailUnconfirmed` 中英文字串；曾一併新增又移除的 `itp.mainSavedDetailFailed`，見上方「中途發現並更正的錯誤判斷」）
- 新增 `backend/scripts/verification/seed_itp_main_detail_partial_review.py`
- 新增 `react-app/tests-browser/itp-main-detail-partial-review.mjs`

## 已執行驗證（本輪〔措辭更正〕實際重跑的部分）

- `tsc --noEmit`：本輪重跑，通過。
- `npm test`：本輪重跑，91 passed（不變，本輪未新增單元測試——純訊息文字與流程控制，已用隔離瀏覽器實測覆蓋）。
- Vite production build：本輪重跑，通過。
- 隔離環境真實登入、真實畫面、真實 API、真實資料庫：本輪**重新跑過整份 `itp-main-detail-partial-review.mjs`**（因為措辭邏輯改了，情境 1f 的預期跟著改），**20 項斷言全數通過**，涵蓋：
  1. 主資料成功／明細遇到**無回應**的網路層失敗（`route.abort()`，連線中斷／逾時同類情況，拿不到任何 HTTP 回應）：畫面提示為「主資料已保存；檢驗計畫的保存結果尚未確認，請確認後重試」——不宣稱「未保存」，也不顯示原始「Network Error」字樣；視窗、輸入、儲存鈕狀態皆保留；資料庫確認主資料欄位確實已寫入。
  2. 主資料成功／明細遇到**模擬 500（一個真實的 HTTP 回應物件，但不代表確定拒絕）**：畫面提示與情境1**完全相同**的保守措辭，同樣不宣稱「未保存」、不顯示原始 500 body——這是本輪更正後才有的斷言，用來證明「有回應」不再被誤判為「確定拒絕」。
  3. 不再修改內容、直接重試：保存成功並關閉視窗，主資料內容不變（重試的主資料 PUT 會重送，見上方「已觀察到重複寫入與稽核」）。
  4. 重試前再次修改內容：重試保存的是**最新**（第二次）修改的內容，不是失敗當下（第一次）的內容。
  5. 附件尚未執行的情境：明細失敗時，`POST /api/files/upload` 呼叫次數為 0，附件資料表無新增紀錄，提示文字不宣稱附件已完成；待處理的附件在後續重試成功後才真正被上傳（證實佇列未被清空／未被誤報完成）。
  6. 一般完整成功流程（無攔截）：正常保存並關閉視窗，回歸無誤。

情境 3、4、5、6 的程式行為本身這一輪沒有再改動（本輪只改了措辭判斷邏輯），但因為是同一支測試腳本整份重跑，上面列的 20 項斷言都是本輪的真實執行結果，不是引用先前批次的舊證據；先前批次（措辭更正前）的 15 項結果已被本輪的 20 項取代，不再單獨引用。

## 重跑方式（從 backend/ 目錄）

```sh
python scripts/verification/isolated_stack.py up --vite-script <既有的 vite_multi.mjs> > stack.json
python scripts/verification/isolated_stack.py seed --root <root> --script scripts/verification/seed_itp_main_detail_partial_review.py
node ../react-app/tests-browser/itp-main-detail-partial-review.mjs stack.json
python scripts/verification/isolated_stack.py down --root <root>
```

## 未驗證／獨立待辦（如實記錄，不宣稱已涵蓋）

- 只跑了與本次修改直接相關的隔離瀏覽器測試與型別/單元/建置檢查，**未重跑完整後端套件**（後端程式碼本身完全未修改）。
- **伺服器實際已提交、但回應在傳回途中遺失**（真正的「已寫入但用戶端不知道」情境）本輪**仍未實測**——`route.abort()` 是連線層直接中斷，並未真正到達後端；`route.fulfill(500)` 也只是模擬「有一個回應」，不是真的讓後端在 commit 之後才失敗。這正是本輪措辭更正的理由（見上），但更正後的統一保守提示涵蓋的是「以上兩種以及其他一切失敗」，本輪沒有、也不需要為了驗證這個特定情境去刻意建構一個「commit 後失敗」的測試——因為不論是哪一種失敗，現在都會顯示同一句保守提示，不需要分別驗證每種失敗原因。
- 未逐一核對 `update_itp_detail`（及未來若有類似分離寫入的其他端點）在每個可能拋出例外的位置相對於 `db.commit()` 的先後順序，因此本輪無法、也沒有嘗試分辨「哪些具體錯誤代表確定寫入前拒絕」——這正是選擇統一保守措辭、不擴大調查的原因。
- 重試時主資料 PUT 的重複寫入與稽核紀錄，本輪**已觀察到**（見上）；除稽核表多一筆紀錄外，其他潛在副作用（如下游監聽此事件的流程、並發情境）**未驗證**，不宣稱無害，本批未新增去重機制。
- 新建（尚未存在於後端）流程的明細保存已在更早的批次改為併入建立請求的單一原子交易（見 `docs/workflow/` 中較早的 ITP deferred-create 相關報告），本輪只處理**既有紀錄**更新時的主資料/明細分離寫入情境，兩者是不同的程式碼路徑，未混用測資或結論。
- 「新增/編輯檢驗計畫項目」透過 `onApplyItems` 的即時自動保存路徑（與主 Save 按鈕分開），本輪為了乾淨地重現「主資料成功、明細失敗」而刻意避開（改為只編輯一般欄位），因此該即時自動保存路徑本身的失敗處理**未在本輪測試範圍內**，如實標註為未驗證。

## Claude 接手時注意

- 工作區存在其他協作者尚未提交的修改（多專案選擇、停用帳號新指派、排程提醒收件人、ITP 狀態選單）；本輪未 stash/reset/checkout，未動這些檔案。
- 本輪未 commit、push 或部署。
