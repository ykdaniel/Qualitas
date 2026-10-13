# STATUS.md — Claude 執行結果

TASK_ID: NOI-DEFECTS-2026-001
ROUND: 1，加審查後補正，加 #8 收緊（2026-10-12）

## RESULT
- [x] DONE：獨立審查 R2 PASS；R2 之後依使用者決定加做 #8，R3 PASS。後端全套通過；使用者 2026-10-12 在 3293 看過預覽，回覆「NOI 可以」（由協調中心轉達）。
- [ ] PARTIAL
- [ ] BLOCKED

## 本輪修改（分支 `ui/sidebar-shell-preview`，工作樹，未 commit）

| 檔案 | 內容 |
|---|---|
| `backend/services/noi_service.py` | **update_noi**：原本由 `repo.update()` 自行 commit，之後 audit 只 add、沒有 commit，結果遺失。改成：<br>• 欄位直接寫回紀錄<br>• `log_audit(strict=True)`<br>• flush，只 commit 一次<br>• 失敗就 rollback<br>**delete_noi**：同樣改成 Q-WorkFlow 清除、刪除、strict audit 一次 commit。另外在檢查引用之前先 `begin_write_transaction` 加 `reload_locked`；紀錄已被刪就 rollback 並回 False。<br>新增 `preview_reference_no()` 與 `delete_check()`。 |
| `backend/core/utils.py` | 新增 `preview_reference_no()`：<br>• 和 `generate_reference_no()` 用同一套前綴、命名規則、位數、self-heal；<br>• 不寫入，不推進序號。 |
| `backend/core/validators.py` | 把計數抽成 `count_noi_references()`。`check_noi_references()` 的拒絕訊息與順序不變。 |
| `backend/routers/noi.py` | 新增兩個端點：<br>• `GET /noi/next-reference?contractor=`：需 NOI_CREATE；承包商範圍的使用者只能查自己的承包商，查別家回 403。<br>• `GET /noi/{id}/delete-check`：需 NOI_DELETE；範圍外或不存在回 404；回傳 `{referenceNo, canDelete, references[{type,count}]}`。 |
| `backend/tests/test_noi_audit_delete_update_http.py`（新） | 新增 12 項測試，見「執行證據」。 |
| `backend/tests/test_noi_service.py` | 3 個 mock 測試改成斷言新寫法：<br>• commit 一次；<br>• 呼叫 `db.delete`；<br>• 不呼叫 `repo.update` / `repo.delete`；<br>• `strict=True`。 |
| `react-app/src/components/NOI/NOI.tsx` | **按刪除**：先呼叫 delete-check。<br>• 有引用：toast 顯示「無法刪除 X：仍被以下文件引用：1 筆 ITR、…」，不開確認框；<br>• 檢查本身失敗：照常開確認框，最後由後端擋；<br>• 重複點擊會被擋下。<br>**確認刪除**：加上 try/catch/finally，失敗原因由 store 放進錯誤 banner。<br>**其他**：確認框按鈕原本寫死英文，改用翻譯預設值；移除不再使用的 ITR、NCR store 讀取。 |
| `react-app/src/components/NOI/modals/NOIDetailModal.tsx`（CRLF） | 新增 NOI、且已選承包商時，參考編號欄顯示「{編號}（預計）」，並加上說明文字。<br>• 換承包商會重新查；<br>• 既有紀錄、唯讀、沒有 NOI 新增權限時不查；<br>• 查詢失敗時退回顯示「系統自動帶入」。 |
| `react-app/src/services/api.ts` | 新增 `getNoiNextReference`、`getNoiDeleteCheck`。 |
| `react-app/src/context/LanguageContext.tsx`（CRLF，共用檔） | 新增鍵：<br>• `noi.expectedReferenceNo`<br>• `noi.expectedReferenceHint`<br>• `noi.deleteBlocked`<br>• `noi.citedBy.*`（5 個）<br>中英文各一份，只有新增行。 |
| 驗證工具（新，不提交產品程式） | `react-app/tests-browser/noi-defects-vite-launcher.mjs`（埠 3293，獨立 cacheDir）。 |

CRLF 檔已逐一確認保留（CRLF 數等於 LF 數）：
- 後端：utils.py、validators.py、routers/noi.py、noi_service.py、test_noi_service.py
- 前端：NOIDetailModal.tsx、LanguageContext.tsx

## 執行證據

**實測：先在舊程式重現**
新測試 `test_noi_audit_delete_update_http.py` 在修改前跑，3 項失敗：
- 刪除沒有 audit；
- 修改沒有 audit；
- audit 失敗時刪除仍然生效。

**實測：修改後**
- 新測試 12 項全過：
  - 刪除、修改都留下 audit；
  - 刪除在 audit 或 commit 失敗時整筆回滾；
  - 修改在 audit 或 commit 失敗時整筆回滾，涵蓋一般欄位與「改承包商」重新編號兩種情況，也確認序號表沒有被吃掉；
  - delete-check 列出 5 種引用、權限正確、不存在回 404；
  - 預計編號等於下一次建立實際拿到的號碼，連問兩次不佔號，承包商範圍正確。
- 審查代理在 R2 跑 `tests/test_noi*.py` 加 `tests/test_ncr_audit_atomic_http.py`：103 passed，0 failed。
- 前端：
  - `npx tsc --noEmit` exit 0；
  - eslint（NOI.tsx、NOIDetailModal.tsx、api.ts）無問題；
  - `npm test` 173 pass，0 fail。

**後端全套（實測，最終版，包含 #8）**
- 指令：`python3 -m pytest -q -p no:cacheprovider tests`，本機 Python 3.14。
- 結果：**2555 passed，3 skipped，0 failed，exit 0**，耗時 51 分 17 秒。紀錄在 `NOI-DEFECTS-2026-001-evidence/backend-full-suite-summary.txt`。
- 注意：
  - 這次是在協調中心把分支前推到 0766d7d3（PR #9，含後端 `workflows/relationships.py`）之前開始跑的，所以只涵蓋本批，不含 PR #9 的後端。
  - Python 3.11 的全套由協調中心在部署候選上執行。

**隔離環境瀏覽器實測**
環境：`isolated_stack.py`，8293／3293，種子 `seed_noi_itr_desktop_review.py`，以隔離管理員帳號登入，中文介面。
- 新增 NOI：參考編號欄顯示「QTS-FHS-NOI-000001（預計）」與說明；換成 Southern MEP 後變成「QTS-SMI-NOI-000001（預計）」。
- 刪除 000002（1 筆 ITR）：toast 顯示「無法刪除…仍被以下文件引用：1 ITR…」，沒有開確認框。
- 補正後刪除 000003：toast 顯示「1 筆 NCR、2 筆 ITR」。
- 刪除 000001（沒有引用）：開確認框「確定要刪除這筆 NOI QTS-NDR1-NOI-000001 嗎？」，按鈕為「取消／刪除」；取消，沒有實際刪除。
- 網路紀錄：next-reference、delete-check 都回 200。
- 同一頁的 `/api/ncr/` 回 500，原因在種子資料：NCR 狀態寫成 "Opening"、rev 和 submit 為 null，回應驗證失敗。與本輪無關。

## 已知限制／未測

**未測**
- 實際刪除一筆 NOI 的 audit，只在 HTTP 測試驗證過，瀏覽器沒有按到底。
- 多人同時建立時「預計號碼順延」的情境，只由設計說明，沒有實測。

**資訊揭露 #8：已在本批收緊（R3，使用者 2026-10-12 決定）**
- **原本的影響**：
  - 有 NOI 新增權限、只限定專案、沒有限定承包商的使用者，能看到任一承包商的下一個 NOI 流水號。
  - 流水號依「專案代碼常數＋承包商縮寫」計算，跨所有專案共用一條，刪除後也不會倒回。
  - 所以等於能推出該承包商歷來在所有專案（包括看不到的專案）一共開過多少張 NOI。
  - 看不到 NOI 內容、所屬專案、日期。
- **原提案的做法沒有效果**：原提案是「contractor 必須在可見選項內」。但 Contractor 沒有綁專案，`/contractors/options` 只過濾承包商範圍的使用者，所以這類使用者本來就看得到全部承包商，條件永遠成立，等於沒收緊。
- **改用的做法（使用者選定）**：`GET /noi/next-reference` 回傳 `{referenceNo, pattern}`。
  - 不受限的使用者：回傳預計編號。
  - 承包商範圍的使用者：只能查自家承包商，查別家回 403；回傳預計編號。
  - 只限定專案的使用者：`referenceNo: null`，只回 `pattern`，例如 `QTS-ABC-NOI-######`。畫面顯示「QTS-ABC-NOI-######（存檔後產生）」，看不到流水號。
- **改動**：
  - `core/utils.py`：抽出 `_reference_format()`，新增 `reference_pattern()`；`generate_reference_no` 未動。
  - `noi_service.preview_reference_no`、`routers/noi.py`。
  - 前端：`api.ts`（`NoiNextReference` 型別）、`NOIDetailModal.tsx`。
  - `LanguageContext.tsx`：新增 1 個鍵 `noi.referencePattern`，中英各一份；已事先通知協調中心。
- **測試**：
  - 承包商範圍的使用者：比對完整回應內容。
  - 新增 `test_a_caller_limited_to_projects_sees_only_the_format_never_the_count`：先建 3 張 NOI，只限定專案的使用者兩家承包商都只拿到 pattern；管理者仍拿到 000004。
  - NOI 測試檔 22 項通過。
  - 前端：tsc、eslint 無問題，npm test 173 項全過。
- **隔離環境實測**（重建後的 8293／3293）：
  - 種子裡的 `site_engineer`（專案 NDR-P1，沒有限定承包商）：新增表單顯示「QTS-FHS-NOI-###### (assigned on save)」。在預覽窗格的寬度下，英文字尾會被截斷。
  - 管理員：顯示「QTS-FHS-NOI-000001（預計）」。

- **剩餘風險（R3 審查）**：遮罩只關掉了「預覽」這條路。只限定專案的使用者仍可透過以下方式得到同樣的數量資訊：
  - 建立 NOI，回應裡有真實號碼；
  - 改承包商，觸發重新編號；
  - 看自己專案的既有 NOI 號碼。
  - 要完全關閉，必須把序號改成按專案分開計，屬於架構決策，待使用者決定是否列入 BACKLOG。

**其他後續項目（不在本批）**
- NCR 刪除的 audit 同樣會遺失，已另開待辦。
- ITR／Checklist／NCR 建立時引用 NOI 有競態：先檢查 NOI 存在，之後才寫入，沒有先取得寫鎖。
- delete_noi 只在 reload 之前檢查範圍。
- 前端死碼 `cascadeDelete.checkNOIReferences`。
- 其他模組的「預計編號」等使用者看過 NOI 再決定。
