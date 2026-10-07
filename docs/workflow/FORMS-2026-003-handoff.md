# FORMS-2026-003 — 表單保護審查補正（第二輪，R1–R6）

延續 FORMS-2026-002，處理獨立審查 REVISE 判定的 R1–R6（完整原文見
`docs/workflow/FORMS-2026-002-archive.md`）。本輪聚焦「補齊證據精確度」：既有產品修正（Meeting
Minutes 欄位擴大、OSD record-id promote、Audit createdId）全數保留未動，只補強驗證方式本身。

## R1 — Meeting Minutes 四類子草稿逐一重現（已完成）

FORMS-2026-002 只實機測試了「行動項目指派者」「與會者公司」兩個非主要欄位案例，討論主題與討論子項目
完全未測（僅讀碼確認邏輯對稱）。本輪新增：

- **討論主題**（`newTopicTitle`，唯一欄位）：輸入後不按 Add，主保存阻擋、零請求、文字保留。
- **討論子項目 owner-only**（`content` 留空，`owner` 填值）：需先透過「新增」建立一筆已確認的主題
  （非測試對象，僅為了讓子項目欄位可見），再測子項目草稿本身——阻擋、零請求、文字保留。
- **討論子項目 status-only**（`status` 從預設 `'Open'` 改為 `'Closed'`，`content`/`owner` 皆留空）：
  驗證「改離預設值」本身即視為已輸入，阻擋、零請求；改回 `'Open'` 後確認不再誤擋。

四類子草稿（與會者、行動項目、討論主題、討論子項目）現在都有「非主要欄位單獨觸發阻擋」的實機證據，
`forms-leave-guard-review-meetingminutes-subdraft.mjs` 23/23 斷言通過。

## R2 — OSD 附件部分成功/刪除/404 完整覆蓋（已完成）

FORMS-2026-002 只證明「新建成功後重試不重複 POST」，成功類別只用 `uploadCalls.includes()`
存在性判斷（非精確計數），刪除與 404 完全未測。本輪新增：

- **成功類別的 response + 重讀**：defectPhoto 上傳成功後，直接斷言其 response status 2xx、body
  恰好列出一筆檔案，並另外透過 `GET /api/files/by-entity` 重讀確認真的能查到。
- **重試只送失敗類別（精確計數）**：重試階段的 upload 攔截器記錄所有呼叫，斷言陣列恰好
  `["attachment"]`——defectPhoto 完全沒有再被呼叫，不是「可能有也可能沒有」的存在性判斷。
- **重試前改欄位仍保存到同一 id**：重試前修改 `poNumber`，重試完成後透過 raw GET 確認該欄位已
  持久化在與第一次相同的記錄 id 上。
- **刪除部分成功/失敗 + 404**：對既有記錄上傳兩個附件，刪除時攔截其中一個回傳 404、另一個放行；
  斷言恰好送出兩筆刪除請求、成功刪除的檔案在重讀時真的消失、404 的檔案仍然存在（未被誤判為已刪除）。

`forms-leave-guard-review-osd.mjs` 新增場景 5（擴充）與 5b，整支腳本 44/44 斷言通過。

## R3 — 真正的「保存中」導頁 + 五表單回應/錯誤精確度（已完成，含一項誠實的未驗證記錄）

**保存中導頁**：FORMS-2026-002 的版本先解除延遲、等保存完成，才點擊導頁連結——只證明了「保存完成後
可以導頁」。本輪調查發現 OSD 編輯器是固定滿版 modal，視覺上完全遮住側欄（經螢幕截圖與強制點擊實測
確認：即使用 `force: true`，瀏覽器自身的 hit-testing 仍會把點擊吃給 modal 遮罩，不是 Playwright
的 actionability 檢查問題）——也就是說，OSD 這類 modal 表單，使用者本來就無法在編輯中點擊側欄導頁，
與 LeaveGuard 無關，是正常的 modal UX。因此改在 **DocumentNamingRules**（整頁編輯器，側欄沒有遮罩）
驗證「真正保存中導頁」：

1. 保存請求仍 pending 時點擊側欄 Dashboard。
2. 斷言 URL 未變、且畫面上出現第二層「Unsaved Changes」確認對話框，其確認按鈕顯示 pending 的
   「Saving...」文字（而非逕自判讀某個同樣寫著「Saving...」的表單自身按鈕）。
3. 解除延遲後，**不再有任何後續點擊**，斷言被攔截的導頁會自己完成（`blocker.proceed()` 的既有
   機制），並且剛才 pending 的保存值確實持久化。

`forms-leave-guard-review-naming-rules.mjs` 新增場景 3b，整支腳本（含既有唯讀場景）28/28 斷言通過。

OSD 腳本本身則保留一段**誠實記錄而非斷言**：嘗試過用 `page.goBack()`
作為「真正站內導覽」的替代觸發方式，但由於建立瀏覽歷史的方式是 `page.goto()`（硬重新整理，非 SPA
內部轉場），`goBack()` 在這個測試設置下也是硬導覽，無法判斷「useBlocker 沒攔截 POP 導覽」究竟是
LeaveGuard 的真實缺口還是測試本身沒有建立出 SPA 內部的路由轉場——**本輪未對此下結論**，只記錄調查
過程與限制，留給下一輪如果需要可用更乾淨的方式（例如改用側欄之外還能同時保持 SPA 路由狀態的導覽
入口）重新釐清。

**五表單回應/錯誤精確度**：

- **Contractor/Project**：新增 response status/body 斷言（`scope`/`code` 欄位值核對），以及精確
  `toastCount === 1`（取代 `>=1`）與「非空、非 undefined」的 toast 文字核對。40/40 斷言通過。
- **NamingRules**：新增保存 response status/body 斷言（確認回傳的規則陣列中 `pqp` 項目的
  `prefix` 真的等於剛存的值）。
- **OSD**：已在 R2 段落的 toast 精確文字核對中一併處理（`主資料已保存，但附件處理尚未完成：...`
  完整字串核對，不是 `includes('Simulated 500') || length > 0` 這種只要非空就過的弱斷言）。

**Contractor/Project 唯讀適用性**：讀碼確認
[ContractorModal.tsx](../../react-app/src/components/Contractors/ContractorModal.tsx)、
[ProjectModal.tsx](../../react-app/src/components/Contractors/ProjectModal.tsx) 完全沒有
`readOnly` 相關程式碼；[Contractors.tsx:219](../../react-app/src/components/Contractors/Contractors.tsx)
的 `onRowClick={(row) => handleEdit(row)}` 沒有任何權限檢查——只要能看到列表（由
`contractors:view:all` 控制列表存取）就能開啟編輯視窗並看到可用的 Save 按鈕，真正的存取控制只在
「新增」按鈕（`hasPermission('contractors:manage:all')`，見 Contractors.tsx:188）與後端。這是
「唯讀模式不適用」的具體程式證據，本輪未新增任何授權限制（不在本批範圍，也不屬於 TASK 要求的缺陷
修正），僅如實記錄供後續參考。

## R4 — 隔離防誤用檢查核對實際目標一致性（已完成）

FORMS-2026-002 的檢查只比對 `state.root` 字串是否含 `qualitas-manual-`、排除三個已知埠號——這些
都只是信任呼叫者傳入的 JSON 欄位本身，JSON 可以是過期的、手改的、或單純寫錯的。

新增共用模組
[forms-leave-guard-review-isolation-guard.mjs](../../react-app/tests-browser/forms-leave-guard-review-isolation-guard.mjs)，
`verifyIsolatedTarget()` 改為核對 `isolated_stack.py` **自己**在磁碟上留下的紀錄（與該工具自身
`_validated_root`/`_load_state` 驗證邏輯對應的同一組檔案）：

1. 埠號仍排除 8198/3198/5173。
2. `${root}/.qualitas-isolated-run` marker 檔案必須存在，且 `tool`/`run_id` 符合 schema。
3. `${root}/stack-state.json` 必須存在，其 `run_id`/`root` 必須與 marker 吻合。
4. `stack-state.json` 列出的每個行程 pid，用 `process.kill(pid, 0)` 核對**此刻真的在跑**，不是
   單純讀到一個數字就信。
5. 呼叫者傳入的 `state`（即 argv[2] 指到的 stack.json）裡的埠號，必須與磁碟上 `stack-state.json`
   記錄的埠號一致——不能呼叫者講一套、磁碟上是另一套。

任何一步不符就 `throw`，沒有任何讓步或預設通過的路徑。新增
[forms-leave-guard-review-isolation-guard-selftest.mjs](../../react-app/tests-browser/forms-leave-guard-review-isolation-guard-selftest.mjs)
作為負向證明：8 個刻意建構的錯誤情境（禁用埠號、缺 root、缺 marker、缺 state、run_id 不符、
pid 未存活、埠號不一致）全部正確拒絕，另有 1 個「完全自洽的假目標」正控制組必須通過（證明防誤用
檢查不是逢請求必拒絕）。全部**只對腳本自己在 `$TMPDIR` 下建立的假目錄操作**，未對使用者 8198/3198
或開發 5173 執行任何拒絕測試。9/9 斷言通過。全部 7 支 `forms-leave-guard-review*.mjs` 已改用
這個共用模組（取代各自原本較弱的內嵌檢查）。

## R5 — （原 R6）紀錄準確性

本檔與下方 STATUS.md 精確區分「本輪新增」「本輪修改」「沿用前輪」三種狀態，不再把沿用的腳本或
vite launcher 列為新增；BACKLOG.md 本身的修改也列入變更清單。R1/R2/R4 的描述不再使用「附完整回歸
證據」這類涵蓋性字眼，只陳述實際覆蓋到的案例。保存中導頁一節明確標示 OSD 的 `goBack()` 調查結果
為「未下結論」而非確認的發現，避免重蹈 FORMS-2026-002 把「保存後導頁」誤稱為「保存中導頁」的錯誤。

## 本輪未完成/未驗證項目（誠實列出）

- **OSD 的 `page.goBack()` 行為**：未能判定是測試設置問題還是 LeaveGuard 真實缺口，未下結論，見
  R3 段落。若要釐清，需要用不經過 `page.goto()` 硬重新整理的方式建立瀏覽歷史。
- **Contractor/Project 讀碼確認無唯讀程式碼路徑**，但未透過建立第三組測試帳號在瀏覽器中實際驗證
  「確實如讀碼所說，任何有 view 權限的帳號都能看到可用的 Save 按鈕」——這點本身風險低（讀碼證據
  已經很直接：完全沒有 `readOnly` 關鍵字），故未額外花時間用瀏覽器重複證明。
- **提交後回應遺失、原生跨瀏覽器 `beforeunload` 對話框行為**：TASK.md 明列可保留的限制，本輪未
  驗證，不在本批範圍內。
- **共用元件 LeaveGuard.tsx/ConfirmModal.tsx 本輪未修改**，故 TASK 要求的「若修改則需 KM/ITP
  回歸」不適用，非略過。

## 測試結果（本輪重新執行）
- `npm test -- --run`：**123 passed, 0 failed**。
- `npm run build`（含 tsc）：**成功**。
- 本輪新增/加強且重新執行並通過的瀏覽器斷言：OSD 44、Meeting Minutes 23、Audit 22、
  DocumentNamingRules（含唯讀）28、Contractor+Project 40、隔離防誤用自我測試 9——合計 166 項，
  全數在本輪乾淨重建的隔離堆疊上獨立執行通過。Role 腳本本輪也重新執行確認未受影響（22/22 通過，
  無相關程式碼變更）。

## 隔離與可重跑資產
9 支 `forms-leave-guard-review*.mjs`（7 支場景腳本 + 1 支共用隔離防誤用模組 + 1 支該模組的
自我測試）、1 支 vite launcher、1 支種子腳本，皆無硬編碼密碼，重跑方式沿用
`seed_forms_leave_guard_review.py` 頂部 docstring 的說明（`isolated_stack.py seed` 需要用
`--env` 而非 `export` 傳遞密碼）。

## 埠號釋放
本輪使用的隔離堆疊（backend 8200 / vite 3200，經多次重建，最後一次 root 為
`qualitas-manual-6yb0vooz`）已於完成後以 `isolated_stack.py down` 拆除，並以 `lsof` 確認埠號
已釋放；使用者的 8198（backend）/3198（vite）全程監聽未受影響，已核對。
