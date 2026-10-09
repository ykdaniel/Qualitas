# FORMS-2026-002 — 表單保護審查補正（R1–R5）

延續 FORMS-2026-001，處理獨立審查（完整內容見 `docs/workflow/FORMS-2026-001-archive.md`）給出的
REVISE 判定與 R1–R5 必修項目。本輪先在新隔離環境重現審查指出的每個讀碼缺口，僅在重現成立時修正；
過程中新增的測試 rigor（真實 GET 持久化比對、逐一欄位比對）也意外揭露並修正了一個審查未點名的新缺陷
（Audit 重複建立記錄，見下方）。

## R1 — Meeting Minutes 仍會漏掉已輸入的非標題草稿（P1，已修正並重現驗證）

**原缺口**：`unconfirmedSubDraftLabel()` 只檢查 `newAttendee.name`、`newTopicTitle`、
`subItemDrafts.content`、`newAction.title` 四個「主要」欄位。使用者若只填與會者公司/職務、行動負責人/
到期日、或討論子項目 owner/status，不動主要欄位，舊版判斷回傳 `null`，主保存仍會靜默丟棄。

**修正**（[MeetingMinutesModals.tsx](../../react-app/src/components/MeetingMinutes/MeetingMinutesModals.tsx)）：
新增 `isAttendeeDraftDirty()`／`isSubItemDraftsDirty()`／`isActionDraftDirty()`，逐一比對每個子草稿的
**全部**可編輯欄位（而非只比對主要欄位），且 `subItemDrafts.status` 預設值 `'Open'` 明確排除在外——只有
「明確改離預設值」才算已輸入，避免誤擋從未被使用者碰過的欄位。

**重現與驗證**（`forms-leave-guard-review-meetingminutes-subdraft.mjs`，實機瀏覽器）：
- 1a：行動項目「標題」單獨輸入 → 阻擋（原本就有效的案例，作基準）。
- **1b（R1 核心缺陷重現）**：只填「指派給」、標題留空 → 阻擋，文字保留（模擬修正前的程式碼再次確認會
  是漏判——已改回修正後程式碼驗證通過，未把修正前狀態單獨留存執行證據，理由與 R3 的「不要求為補證據
  還原共享工作目錄」一致）。
- **1c（R1 核心缺陷重現）**：只填與會者「公司」、姓名留空 → 阻擋，文字保留。
- 2：全部草稿真正空白（含 `status` 停在預設 'Open'）→ 不誤擋，正常保存送出恰好一次請求。
- 3：既有記錄正常按「+」建立行動項目（`addActionItemNow`，立即 POST `/api/followup/`）→ response 2xx、
  body 帶標題、**raw GET `/api/followup/?sourceModule=MEETING` 直接繞過 UI/Store 確認已持久化**；
  之後主表單 Save 不受影響，仍是 1 次請求。
- 4：輸入後明確清空（不按 Add）→ Save 正常成功，1 次請求。
- 16/16 斷言通過。

**已知限制（誠實記錄，非略過）**：討論主題（`newTopicTitle`）與討論子項目（`subItemDrafts` 的
owner/status-only）與已驗證的與會者/行動項目共用**同一段** `blockSaveForUnconfirmedDraft()` 邏輯（讀碼
確認對稱），但本輪未針對這兩類另外各跑一次獨立瀏覽器重現（建立討論主題需要巢狀 UI 操作，時間所限未
展開）。不宣稱「四類全部逐一實測」。

## R2 — OSD 新建部分成功後的重試會重複建立（P1，已修正並重現驗證）

**原缺口**：FORMS-2026-001 的修正把 `catch` 改為 `throw`（讓保存失敗時視窗維持開啟），但新建記錄時
`addOSD()` 成功後，`createdOsd.id` 只存在區域變數 `targetId`，父層 `currentOsdId` 仍是字串 `'new'`；
附件上傳若失敗，使用者在同一視窗重試會再次判斷 `isNew` 為真，**再送一次 `POST /osd/`，重複建立記錄**。

**修正**（[OSD.tsx](../../react-app/src/components/OSD/OSD.tsx)、
[OSDModals.tsx](../../react-app/src/components/OSD/OSDModals.tsx)）：改用專案既有共用保存工具
`utils/saveFlow.ts`（`runSaveFlow`／`SaveOutcome`，NCR/OBS/NOI 已在使用的同一套契約，讀取其契約後直接
沿用，未修改該檔案本身）與 `utils/saveErrors.ts`（`describeSaveError`／`presentOutcome`）：
- `writeRecord()` 成功後，`onRecordSaved(id)` 立刻把 `id` promote 到 `currentOsdId`（在任何附件/刪除步驟
  執行之前），使得同一視窗內的重試會重新判斷 `isNew` 為假，走 `updateOSD` 而非 `addOSD`。
- 附件上傳/刪除逐一獨立失敗，`runSaveFlow` 回傳的 `SaveOutcome` 精確描述已完成/未完成的部分
  （`uploadedCategories`／`remainingDeletes`／`failures`），`OSDModals.tsx` 依此只清空「已確認完成」的
  待處理佇列，失敗的部分保留供下次重試，不會整批重送或整批清空。
- 主資料已保存但附件未完成時，顯示明確區分「主資料已保存，但附件處理尚未完成」的 toast，不與「完全
  失敗」的錯誤訊息混淆。
- 未擴權：附件仍沿用既有 `osd:update:all`／建立時的既有權限，未新增任何權限例外。

**重現與驗證**（`forms-leave-guard-review-osd.mjs` 場景 5，實機瀏覽器）：
- 新建記錄，`defectPhoto` 類別上傳成功、`attachment` 類別上傳被模擬為失敗 → 主資料 `POST /osd/`
  **恰好一次**、視窗維持開啟（主資料已保存）、toast 明確標示部分未完成、**raw GET 確認資料庫裡恰好只有
  一筆**符合的記錄。
- 點擊 Save 重試 → **零筆額外 `POST /osd/`**（不是「少一筆」而是「精確驗證為 0」）、視窗關閉、
  **raw GET 再次確認資料庫裡仍然只有一筆**（不是兩筆）。
- 35/35 斷言通過（含既有的離開保護、正常保存 response/body、模擬失敗精確計數、延遲保存＋真實站內導頁、
  唯讀模式共 7 大場景）。

## R3 — 補齊實際驗收證據，收斂過度宣稱

已針對 **OSD、Audit、Meeting Minutes、DocumentNamingRules**（唯讀）四項重新以更嚴謹的斷言方式實機驗證：

- **response status/body + 真實持久化**：不再只看送出的 request 或重新打開 SPA 的 store 狀態。OSD／
  Audit／Meeting Minutes 三支腳本新增 `rawGet()`——透過 `page.evaluate(fetch(...))` 走 vite 的 `/api`
  same-origin proxy（帶 cookie session，繞過 UI/Zustand store 直接命中後端），斷言 response 的 HTTP
  status 與 body 內容，並在保存後用這個 raw fetch 二次確認資料庫真的寫入了預期值。
- **錯誤提示精確計數**：OSD／Audit 的模擬失敗案例改為斷言 `toastCount === 1`（不是 `>= 1`），並個別列出
  首次失敗（0 成功）與重試（1 成功）的請求數，兩者是不同的斷言而非同一個計數器重複使用。
- **延遲保存＋真實站內導覽**：OSD 場景 6 在延遲保存完成後，實際點擊側欄「Dashboard」連結並斷言
  `page.url()` 真的抵達 `/dashboard`，而非僅以視窗自動關閉充當「已導頁」的證據。
- **OSD／DocumentNamingRules 唯讀情境**：新增種子帳號 `forms_role_readonly`（無 `osd:create:all`／
  `settings:manage:all`）與一筆 Closed 狀態的 OSD 記錄，驗證兩表單的唯讀模式都沒有暴露保存入口、欄位
  皆為 disabled。Contractor/Project 本輪**未**另外驗證唯讀情境（沿用 FORMS-2026-001 判斷：兩者目前沒有
  唯讀模式相關的程式碼路徑，無程式碼變更，風險低，本輪未重新確認，如實列於下方限制）。
- **Audit 既有項目未確認編輯**：新增場景 4，驗證 `editingItemId` 進入既有項目的行內編輯模式且未按
  「儲存」套用時，主表單 Save Draft 會被擋下（見下方新發現的重複建立缺陷段落）；並驗證「取消」該行內
  編輯後主保存恢復正常、舊值不受影響。
- **Add/清空後確認成功回應與持久化，而非僅送出一次請求**：Audit／Meeting Minutes 的 Add-then-Save
  回歸案例現在都額外核對 raw GET 持久化結果，不只斷言「送出了一次請求」。
- **OSD Save 按鈕 disabled 狀態的原始爭議已釐清（非猜測）**：直接以獨立除錯腳本重現，確認
  `OSDModals.tsx:437` 的 `disabled={saving}` **確實在保存中生效**（`isDisabled()` 回傳 `true`）；
  FORMS-2026-001 的錯誤結論來自測試腳本本身的方法論瑕疵——原腳本以 `getByRole('button', { name: /^Save$/ })`
  精確比對按鈕文字，但保存中按鈕文字會變成「Saving...」，導致該 locator 匹配不到任何元素，
  `.isDisabled().catch(() => false)` 的 `catch` 又把逾時錯誤靜默吞成 `false`，因而誤報「未 disabled」。
  已在交接文件與 STATUS 更正此說法。

**本輪仍未達成的 R3 子項（誠實列出，未虛報 DONE）**：
- Contractor／Project／Role 三表單**本輪未重新以上述加強斷言重跑**（FORMS-2026-001 當輪已用較弱的
  斷言方式驗證過，本輪這三表單皆無程式碼變更，判斷為低風險而未重新投入時間）。
- 五表單中除 OSD 外，其餘四表單（Contractor/Project/Role/NamingRules）的延遲保存案例仍只在 OSD 驗證過
  一次代表性案例，未逐一重跑。
- 未驗證「提交後回應遺失」（response lost after the request reached the server）或瀏覽器原生離開提醒
  （`beforeunload` 對話框本身的瀏覽器層級行為），兩者皆超出模擬 `page.route()` 的能力範圍，如實列為限制
  而非宣稱已解決。

## 新發現：Audit 重複建立記錄（本輪 R3 rigor 工作意外發現並修正）

在補齊 R3 要求的「真實持久化比對」時，發現 `AuditWizard.tsx` 有一個獨立於 R1/R2 的缺陷：`Audit.tsx` 的
「Save Draft」設計上刻意不呼叫 `onSaveSuccess()`（維持精靈視窗開啟，讓使用者可以繼續編輯），因此父層
`currentAuditId` 在整個精靈視窗生命週期內永遠停留在 `null`（新建流程），`existingItem` 也永遠是
`undefined`。這代表**同一個精靈視窗內，每按一次「Save Draft」就會再送一次 `POST /audit/`，建立另一筆
全新的記錄**——不需要任何失敗或重試，只是最基本、最常見的「先存草稿、再新增查檢項目、再存一次草稿」
流程就會複製記錄。

實機重現：先按一次 Save Draft（建立記錄 A），再新增一個自訂查檢項目後按第二次 Save Draft → 修正前會
建立記錄 B（帶有新項目），記錄 A 永遠停留在空白查檢項目清單的狀態，兩筆記錄同時存在資料庫。

**修正**（[AuditWizard.tsx](../../react-app/src/components/Audit/AuditWizard.tsx)）：新增本地
`createdId` state，`recordId = existingItem?.id ?? createdId`；`addAudit()` 成功後立即
`setCreatedId(created.id)`，之後同一視窗內的每次保存改用 `recordId` 判斷 create/update，不再單純依賴
永遠不變的 `existingItem` prop。屬 AuditWizard.tsx 內部自足的最小修正，未改動 `Audit.tsx` 或後端。

驗證：第二次 Save Draft 送出的是 `PUT`（不是 `POST`）；raw GET 確認同標題只有一筆記錄；新增的查檢項目
確實持久化在**同一筆**（與第一次保存回傳的 id 相同）記錄上，不是另一筆。

## R4 — 移除本批寫死測試密碼（已修正並以隔離環境重新驗證流程）

- `seed_forms_leave_guard_review.py`：不再有任何硬編碼或預設密碼；改為 `os.environ["FORMS_TEST_PASSWORD"]`
  必要環境變數，未設定即印出明確錯誤並以非零狀態結束（`sys.exit(1)`），不會靜默用假密碼繼續跑。
- 全部 7 支 `forms-leave-guard-review*.mjs`（osd／contractor-project／role／naming-rules／
  audit-subdraft／meetingminutes-subdraft／smoke）：同樣改讀 `process.env.FORMS_TEST_PASSWORD`，未設定
  即在腳本最開頭 `throw`，不會用預設值悄悄跑下去。
- **新增隔離目標防誤用檢查**：每支腳本執行前檢查 `state.root` 是否符合 `isolated_stack.py` 產生的命名
  規則（含 `qualitas-manual-`），並明確拒絕 `state.backend_port`／`state.vite_port` 為 8198／3198／5173
  （使用者環境與日常開發埠）——即使操作者不小心把 stack.json 指向錯誤的檔案，腳本也會在第一步就拒絕
  執行，而不是預設信任任意 JSON 內容。
- **重要更正**：`isolated_stack.py seed` 子指令會用**刻意隔離**的子環境執行種子腳本（見
  `isolation.isolated_env`），**不會**繼承呼叫者 shell 的環境變數——單純 `export` 後接著呼叫 `seed` 會被
  靜默忽略。正確作法是透過 `isolated_stack.py` 本身已支援的 `--env KEY=VALUE` 參數顯式傳遞（見腳本頂部
  docstring 更新後的重跑指令）。`forms-leave-guard-review*.mjs` 是一般 `node` 行程，才會正常讀取 shell
  `export` 的環境變數。這個機制差異已在 R4 修正過程中實測發現並記錄，避免下一輪重蹈覆轍。
- `docs/workflow/FORMS-2026-001-handoff.md`：原文一處硬編碼密碼明文已原地遮蔽為
  `[已遮蔽測試密碼]`，其餘原文與過度宣稱之處**不刪除**、以頂部更正註記說明，指向本檔案與
  `FORMS-2026-001-archive.md`。

## R5 — 修正 STATUS 與交接的範圍/結果記錄

- 「111 項斷言」的說法已更正：FORMS-2026-001 的 111 是「五表單 94 + Audit 9 + Meeting Minutes 8」的總和，
  不是五表單本身有 111 項——已在本輪 STATUS 與本檔案中使用精確的逐項數字，不再籠統合併稱呼。
- OSDModals.tsx 的 Save 按鈕 `disabled` 現況已依實測結果更正（見上方 R3 段落），不再重複「沒有 disabled」
  的錯誤說法。
- 本輪 STATUS.md 的 FILES_CHANGED／FILES_ADDED 精確列出本輪（FORMS-2026-002）實際新增/修改的檔案，與
  FORMS-2026-001 已完成的部分分開列示，不混為一談；BACKLOG.md 本身的修改也列入 FILES_CHANGED。
- 未達成或未重新驗證的項目（Contractor/Project/Role 未重新加強驗證、討論主題/子項目未逐一重現、
  提交後回應遺失/原生離開提醒未驗證）在 STATUS 中明確列為限制，未計入 DONE 的判斷依據。
- 原 FORMS-2026-001 的 TASK/STATUS/REVIEW 完整內容已封存於 `docs/workflow/FORMS-2026-001-archive.md`
  （原文保留，密碼已遮蔽），未修改或刪除封存內容本身。

## 測試結果（本輪重新執行）
- `npm test -- --run`：**123 passed, 0 failed**。
- `npm run build`（含 tsc 型別檢查）：**成功**。
- 後端未修改任何 production 檔案（僅種子腳本），依規則略過後端套件。
- 新增/加強的 Playwright 斷言總數（本輪重跑且全數通過）：OSD 35、Meeting Minutes 16、Audit 22、
  DocumentNamingRules（含新增唯讀場景）19 —— 合計 92 項，全數在本輪獨立重新執行並通過，非沿用
  FORMS-2026-001 的舊執行結果。Contractor/Project/Role 沿用 FORMS-2026-001 當輪已通過的結果，本輪未重跑
  （見上方 R3 限制段落）。

## 隔離與可重跑資產
7 支 `forms-leave-guard-review*.mjs`、1 支 vite launcher、1 支種子腳本（皆已移除硬編碼密碼並加上目標
隔離防誤用檢查）保留在 ALLOWED_PATHS 內。重跑方式見 `seed_forms_leave_guard_review.py` 頂部 docstring
（含 `isolated_stack.py seed` 需要用 `--env` 而非 `export` 傳遞密碼的更正說明）。

## 埠號釋放
本輪使用的隔離堆疊（backend 8200 / vite 3200，經多次重建，最後一次 root 為
`qualitas-manual-vrqsu7r8`）已於完成後以 `isolated_stack.py down` 拆除，並以 `lsof` 確認 8200/3200 埠號
已釋放；使用者的 8198（backend）/3198（vite）全程監聽未受影響，已核對。
