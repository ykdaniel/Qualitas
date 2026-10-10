# CONTRACTOR-OPTIONS-2026-001 — REVIEW（獨立審查）
審查者：獨立 Claude 審查代理（GPT 額度用盡，使用者 2026-10-09 於對話中指定）

TASK_ID: CONTRACTOR-OPTIONS-2026-001
ROUND: R2（R1 REVISE 已封存為 `CONTRACTOR-OPTIONS-2026-001-R1-REVISE-REVIEW-archive.md`）

本輪只審 R1 的三項必修和 R2 的差異。R1 已接受的部分（後端端點、範圍、store 和各模組、狀態大小寫、Audit 切換、CRLF）沒有重審。

## EVIDENCE_CHECK
**候選樹和 patch 的一致性**
- 把 HEAD `c8bba156` 匯出到暫存目錄，套用 `evidence/F.patch`，`git apply --check` 和實際套用都成功。套用結果的 `backend/`、`react-app/` 和候選樹 `Qualitas-deploy-artifacts/CONTRACTOR-OPTIONS-2026-001/cand` 逐檔比對完全相同（排除 node_modules、快取、db）。
- `F.patch` 和 `F-R1.patch` 的差異只有四處，和說明相符：
  1. NOIDetailModal 的 guard 段落（以及因此位移的 hunk 行號和 index 雜湊）；
  2. `test_contractor_options_http.py` 新增 2 個測試，fixture 多了 `to-deactivate`、`no-role` 兩個帳號，並把 `Session` 交給測試；
  3. `contractor-options-check.mjs` 新增 3b 段離開提醒檢查；
  4. schemas.py hunk 前補上 `diff --git` 標頭。
- 沒有其他後端產品程式或前端檔案改動。共用的 `LeaveGuard.tsx` 和 HEAD 逐位元組相同。NOIDetailModal 仍是 CRLF。
- 工作樹裡的 NOIDetailModal、新測試檔、瀏覽器腳本、contractorsStore、routers/noi.py 和候選樹相同。

**必修 1：guardedFormData 的做法**
- 有恢復 HEAD 的行為。新紀錄的三個聯絡欄位一開始是 `system`，交給 `useDraftGuard` 時以 `''` 比對。基準值是第一次 render 的 `''`，非同步帶入後仍是 `''`，所以表單不會變成已修改。開新 NOI、不改任何東西就按取消，會直接關閉。
- 真的修改仍會被偵測到：
  - 使用者改聯絡欄位：`handleFieldChange` 把來源改成 `user`，之後照實際值比對；
  - 改其他欄位：照常比對；
  - 換承包商：`contractor` 欄位本身和基準值不同。
- 逐一檢查的邊界情況：
  - **改成和帶入值完全相同的內容**：欄位已是 `user`，實際值和基準 `''` 不同，仍會跳提示。這是偏保守的誤報，不會漏判，可以接受。
  - **使用者把帶入的值清成空白**：比對結果和基準相同，不跳提示。這是新紀錄，取消就是整份丟掉，資料庫裡本來就沒有東西，沒有遺失使用者資料，可以接受。
  - **使用者沒動過、但因換承包商而改變的 `system` 欄位**：由 `contractor` 欄位的變更涵蓋，正確。A→B→A 換回原承包商時，`contractor` 回到基準，`system` 欄位仍以 `''` 比對，所以不算修改。這時實際上也沒有使用者變更，正確。
  - **來源不會從 `user` 退回 `system`**：`setContactSource` 只有 `handleFieldChange` 一處，而且只會設成 `user`。所以使用者改過的欄位，之後不會被遮蔽。
  - **既有紀錄**：三個欄位一開始就是 `user`，`guardedFormData` 和 `formData` 相同，guard 的語意和 HEAD 完全一樣。
  - **儲存流程**：NOI 沒有使用 `markSaved`。關閉時的 `release()`，以及「已儲存但附件未完成」時保持開啟的路徑，R2 都沒有改，guard 在這些情況的行為和 R1、HEAD 相同。
  - 沒有其他程式路徑會在使用者不知情時改動聯絡欄位（只有帶入函式和承包商切換兩處）。

**必修 2：瀏覽器驗證**
- `r2-browser-contractor-options.txt` 是在隔離環境用候選樹、全新資料庫跑的，13／13 PASS，涵蓋三項：
  - 空白新紀錄（電話已帶入 02-1111-2222）按取消：沒有提示，0 個 POST；
  - 改備註後按取消：出現提示，截圖 `noi-guard-after-edit.png` 可見 Unsaved Changes 對話框；
  - 改電話後按取消：出現提示。
- `r2-guard-check-against-R1.txt` 用 R2 的腳本跑 R1 的 NOIDetailModal，第一項 FAIL，證明新檢查抓得到 R1 的問題。這次執行在 FAIL 後就中止了，沒有總結列，也沒有 exit code。合理推測是視窗沒關，第二次按「Add New NOI」被遮住而逾時。
- **發現：檢查「視窗是否關閉」的斷言實際上沒有作用。** 腳本的 `modalOpen()` 找的是內容含 `'Add New NOI'` 的 `h2`，但新紀錄視窗的標題是 `noi.addTitle` = **`Add NOI`**（`LanguageContext.tsx:318`；`forms-consistency-review.mjs` 的 `addTitleExact` 和截圖都是 `Add NOI`）。所以 `modalOpen()` 永遠回傳 false。另外，STATUS 寫「比照 Part A2：標題、取消按鈕……」，但 3b 段並沒有檢查標題。
- 這個缺陷不影響結論：
  - 行為本身有間接證明。R2 執行時，第一次取消後再按清單頁的「Add New NOI」能正常開啟，接著填備註、跳提示。如果第一個視窗沒關，這次點擊會被遮住，就像 R1 那次執行中止一樣。
  - 對 R1 的偵測也成立。既然 `modalOpen()` 永遠是 false，電話也帶入了、POST 是 0，那 R1 的 FAIL 只可能來自 `promptCount() > 0`，也就是正好抓到 R1 的錯誤提示。
  - 不過斷言本身要修正，見 NEXT_STEP。
- 沒有重跑 `forms-consistency-review.mjs`，改用同等檢查。我接受這個理由：那支腳本需要自己的 12 個模組種子資料、隔離防護和密碼環境變數，而本輪只需要 NOI 新紀錄取消這一段。3b 段的判斷項目（是否出現提示、是否關閉、POST 數）和 Part A2 相同，前提是先把上面的關閉斷言修好，並補上標題檢查。

**必修 3：後端測試**
- `r2-backend-related-tests.txt` 有完整輸出：Python 3.14，7 個相關測試檔共 **126 passed**。
- 我在候選樹自己重跑 `test_contractor_options_http.py`：**10 passed**。
- 新測試的設計正確：
  - `to-deactivate`：先登入取得 token（`login` 有斷言 200），再透過 fixture 的 `Session` 把 `is_active` 改成 False 並 commit。`core.security.SessionLocal` 已經 monkeypatch 成同一個 Session，認證時讀得到新狀態。兩個端點都回 401，符合 `authenticate_access_token` 和 `AnyPermissionChecker` 的停用判斷。
  - `no-role`：`role_id=None`。options 只需要 `get_current_user` + `get_scope`，所以是 200；聯絡端點的 `AnyPermissionChecker` 對 `not user.role` 回 403。兩者都正確。
  - （非阻擋）停用測試在停用前沒有先斷言一次 200，401 是靠同檔其他測試的相同登入模式間接排除「token 本身無效」。建議順手補一行。

**前端檢查（審查者自己重跑）**
- 在工作樹執行（相關檔案和候選樹相同）：`tsc --noEmit` exit 0，`npm test` 144／144，`eslint NOIDetailModal.tsx` exit 0。和 `r2-frontend-checks.txt` 一致。

**Python 3.11**
- evidence 裡還沒有結果。部署暫存區的 `py311-full-suite.txt` 只有表頭和 `pip_exit=0`，沒有 pytest 的結果列，可能還在跑或已中斷。這是部署前提，不構成本輪 REVISE 的理由，見 NEXT_STEP。

## SCOPE_CHECK
- R2 的改動只限 R1 必修的範圍：NOIDetailModal 的 guard 輸入、一個後端測試檔、一個瀏覽器腳本。後端產品程式和 R1 相同，沒有動到共用 `LeaveGuard.tsx`。
- 沒有看到提交、推送或部署；也沒有操作開發資料庫或 8198/3198，瀏覽器和測試都在隔離環境、全新資料庫上執行。
- 工作樹裡另一個 session 的材料模組修改不在本輪範圍，也沒有混進 F.patch 或候選樹（已用 HEAD + F.patch == 候選樹確認）。

## DECISIONS_CHECK
- R2 沒有新增或改變業務規則。「系統帶入不算使用者修改」是恢復 HEAD 原有的行為，不是新政策。
- 依 DECISIONS「每批 PASS 後完成準備即提交、推送及部署」，部署前要完成必要測試。本專案的 Python 3.11 檢查仍是前提（見 NEXT_STEP）。
- 和 DECISIONS.md 沒有衝突。

## VERDICT
- [x] PASS
- [ ] REVISE
- [ ] HUMAN_REQUIRED

## REQUIRED_FIXES
無需再開補正輪。產品程式已正確修正 R1 的問題，三項必修都有實質證據支持。

PASS 的前提條件（**提交和部署前必須完成**，只動測試和證據，不改產品程式）：
1. **Python 3.11**：要把完整後端測試的實際輸出（含 passed／failed 結果列）放進 evidence。R2 後端產品程式和 R1 相同，所以 R1 候選樹的那次執行可以沿用，但另外要在 3.11 跑 R2 的 `tests/test_contractor_options_http.py`（10 個測試），輸出一起放進 evidence。只要有任何失敗，就不得部署。
2. **修正瀏覽器腳本的關閉斷言**：
   - `contractor-options-check.mjs` 的 `modalOpen()` 改成比對實際標題 `Add NOI`（例如 `h2` 的文字完全等於 `Add NOI`）；
   - 開啟後加一行斷言標題是 `Add NOI`，讓「比照 Part A2」名副其實；
   - 在候選樹上重跑，輸出存進 evidence（預期 13／13 或更多 PASS），STATUS 的描述也要照實修正。

非阻擋建議：
- 停用帳號的測試在停用前先斷言一次 options 是 200。
- 對 R1 的驗證在 FAIL 後中止，沒有總結列。之後這類「用新檢查跑舊版本」的證據，建議把 stderr 和 exit code 一併存下來。

## NEXT_STEP
- 完成上面兩項前提後，依既有的 PASS 後部署授權，以候選樹（HEAD + F.patch，前端和後端都有）做部署準備：
  - 範圍核對；
  - 唯讀預檢；
  - 備份和回退準備；
  - 後端要重建，因為有新端點。
- 部署後的冒煙檢查（不建立資料）：
  - 只有模組權限的帳號在 NCR 新增表單看得到承包商；
  - 開新 NOI 會帶入聯絡資料，不改就取消時不跳提示；
  - Audit 頁看得到狀態為 `Active` 的承包商。
- 只能部署 F.patch 的範圍，工作樹裡材料模組的未審修改不得混入。
