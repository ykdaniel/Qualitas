# MEETING-FIX-2026-001 — STATUS（R2，獨立審查 PASS）

TASK_ID: MEETING-FIX-2026-001 · ROUND: R2 · 本地提交，未推送、未部署。

## RESULT
- [x] DONE（交獨立審查）
- [ ] PARTIAL

## 修改
| 檔案 | 內容 |
|---|---|
| `react-app/src/components/MeetingMinutes/MeetingMinutes.tsx` | 存檔改用共用 `runSaveFlow`／`sameWrite`（同 OBS／OSD）：第一次寫入成功就把 `'new'` 換成實際 id，之後再按儲存只會更新（內容沒變則不寫）、不再新建。目標狀態為 Published／Void 且有待上傳附件或待建行動項目時，先以 Draft 寫入，附件與行動項目完成後才送狀態。行動項目改為逐筆建立，成功一筆移除一筆，失敗即停，重試只送剩下的（不再用 bulk 端點，避免半套成功後重複）。payload 加 `rev`。新增 `handleVoidFromModal`：只送 `{status:'Void'}`。剛由本表單建立的紀錄，建立者可用建立權限完成剩餘步驟（`createdHereId`，後端權限檢查不變） |
| `react-app/src/components/MeetingMinutes/MeetingMinutesModals.tsx` | `onSave` 回傳 `MeetingSaveResult`；未完成時保留剩餘附件／行動項目，表單上方顯示提示（含會議編號與未完成步驟）並 toast；附件上傳成功後以 `syncToken` 清掉待上傳清單。已存在紀錄的行動項目區也顯示「尚未建立」的剩餘草稿。作廢按鈕改呼叫 `onVoid`。`submitActionItemsDraft`（bulk）改為 `toActionItemPayload`，單筆新增也共用 |
| `react-app/src/context/LanguageContext.tsx` | 只新增 5 個 `meetingMinutes.*` 鍵（英／中各 5 行，CRLF 保留，`diff --stat` 10 insertions） |
| R2 修正 | 只有建立權限的帳號只帶行動項目時不延後狀態；會議編號取不到先 GET 補取，仍無則不建 Follow Up；後端只在 rev 確實變更時把 IntegrityError 轉 400；每次存檔先清舊提示；未完成步驟分隔符與狀態名稱依語系 |
| `backend/services/meeting_minutes_service.py` | `update_meeting_minutes`：寫入時撞 (documentNumber, rev) 唯一索引 → rollback → ValueError（router 既有對應 400）；更新內容沒帶 `rev` 時照舊往外拋 |
| `backend/tests/test_meeting_minutes_rev_http.py`（新，3 項） | 改成同系列已用的 rev → 400、資料不變、之後仍可存；可用 rev 照存；Published 只送狀態可作廢 |
| `backend/scripts/verification/seed_meeting_fix_review.py`（新） | 隔離環境種子（密碼取自環境變數） |
| `react-app/tests-browser/meeting-fix-review.mjs`、`meeting-fix-vite-launcher.mjs`（新） | 隔離環境瀏覽器驗收（8344／3344） |

## 驗證（實測）
- 後端（本機 Python 3.14，`.venv_fix`）：`test_meeting_minutes_rev_http.py`＋`test_meeting_minutes_service.py` **15 passed**。
- 舊版重現：HEAD 後端複本＋新測試 → `test_editing_rev_…` **失敗，未處理的 `sqlite3.IntegrityError: UNIQUE constraint failed: meeting_minutes.documentNumber, meeting_minutes.rev`**（正式環境即 500）；另 2 項通過。
- R2（依審查修正後重跑）：後端 meeting 測試 **15 passed**（`backend-meeting-tests.txt`）；`test_followup_service`／`test_followup_validation`／`test_integration_real_db` **25 passed**；tsc 乾淨。
- 隔離環境瀏覽器（isolated_stack.py，8344／3344，臨時資料庫，結束已 `down`）：R2 **39 項全部通過**（完整輸出 `browser-acceptance.txt`，截圖同目錄）。R1 為 34 項（無情境 5）。
  - 情境 2：新建 Published＋附件＋2 行動項目，第一次上傳注入 503 → 只建 1 筆（create 請求 status=Draft）、2 個行動項目已建、表單不關、提示含編號；再按儲存 → 無 create、無重複行動項目、附件 1 個、狀態 Published、表單關閉。
  - 情境 1：舊的整筆作廢 payload 後端回 400（即原 bug）；表單內作廢只送 `{"status":"Void"}`，成功並關閉。
  - 情境 3：第二個行動項目注入 503 → 只建第一個、剩下的顯示「Not created yet」；重試只送 1 個，兩個各 1 筆。
  - 情境 4：rev 改 1.1 有送出並保存；另一次會議改成 1.1 → 顯示「Rev '1.1' already exists…」，表單不關，原 rev 不變。
  - 情境 5（R2 新增）：只有建立權限的帳號新建 Published＋1 行動項目 → 1 個 create 帶 Published、0 個 PUT、行動項目已建、表單關閉。
- 前端：`tsc --noEmit` 無錯誤；`npm test` 144 passed／0 failed。
- ESLint（CI 未跑 lint）：`MeetingMinutes.tsx` 深連結 effect 出現 `set-state-in-effect` 1 筆（HEAD 該檔未報；OBS.tsx 同一寫法同樣報錯，全 repo 此規則 30 筆）；`MeetingMinutesModals.tsx:521` 全形空白為既有問題。
- `test_attachment_hardening_http.py`／`test_attachment_authorization_http.py`：在本沙箱執行兩次都卡住無輸出（約 40 分、10 分後停止），**未取得結果**；本輪未改附件程式，交由部署前 3.11 全套確認。
- **未做**：Python 3.11 全套（依慣例由部署前最終候選執行）；正式站未動。

## 審查
獨立 Claude 審查（見 REVIEW）：R1 REVISE（只有建立權限的帳號帶行動項目新建 Published 會卡在 Draft＋4 項建議）→ R2 PASS。

## 已知限制（不擋 PASS）
只有建立權限的帳號新建 Published＋行動項目時，若某個行動項目建立失敗，會議已是 Published、表單唯讀，剩餘項目顯示「尚未建立」但無法按儲存；提示仍寫「按儲存完成」。比舊版（重試會重複建立會議）好；需由有權限者到 Follow Up 補建。可於下一批調整提示文字。

## 上線注意
前端＋後端 1 檔，需重建後端；無 schema／migration 變動。
