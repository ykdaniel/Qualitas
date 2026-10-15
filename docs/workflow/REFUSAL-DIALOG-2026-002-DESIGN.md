# REFUSAL-DIALOG-2026-002 設計（第 2 批：存檔被拒）

> 盤點基準：正式站 `09f6a688`（REF-PROJECT-SEQ B2 已上線）。唯讀盤點，未改程式。行號以 09f6a688 為準；B3 提交後開工前重新核對。
> 使用者 2026-10-14 已選定第 4 節的三個決定。

## 1. 沿用第 1 批（不需再決定）
- 共用元件：`RefusalDialog`（App.tsx:113 掛一次）、`showRefusal(err, action)`、`showCodedRefusal`、`describeRefusal`／`describeCoded`、`refusal.*` 鍵；後端 `Refusal`／`RefusalHTTPException`／`refusal_http`／`permission_denied`／handler。
- 規則：4xx 標題「無法儲存」＋原因；5xx／網路標題「儲存失敗」＋通用句；沒有代碼時中文介面「通用句＋英文原文」、英文介面原文；401 不顯示；成功提示維持 sonner。
- `tests-unit/refusal.test.ts` 會檢查「後端每個代碼在中英文都有翻譯、佔位符都是後端會送的 params」，新增代碼必須同步更新 PARAMS 表。

## 2. 盤點結果（09f6a688）

### 2.1 已經改好、從草稿移除
- **Follow-up**：存檔失敗**不會**關視窗、內容不會遺失（草稿的懷疑不成立），而且已用 `showRefusal(err,'save')`（FollowUpIssue.tsx:332）。
- **FAT 編輯視窗**（FAT.tsx:621）、**IAM 範圍**（UserScopeSection.tsx:190，僅限帶代碼時）已用 `showRefusal`。

### 2.2 目前的顯示方式
| 模組／路徑 | 目前 | 問題 |
|---|---|---|
| NCR、OBS、NOI、Material（saveFlow） | 小提示 `saveFlow.failedKeep`「尚未保存，您填寫的內容都已保留。{原因}」；視窗不關 | 原因為原文；422 合成一句 |
| OSD、會議記錄（saveFlow） | 同上**加上**頁面橫幅（store 寫 `error`） | 重複顯示 |
| ITR 存檔／首次發行 | `itr.saveNotConfirmed` 小提示＋頁面橫幅 | 重複顯示 |
| ITR 已核准後再發行 | 寫死英文 `Failed to publish ITR.` | 原因丟掉 |
| ITR 上傳附件失敗 | 寫死英文 `Failed to upload some files for …`，視窗照關 | — |
| ITR 撤回核准 | 對話框內紅框，原文或 axios 原文 | — |
| ITR 開 NCR／複檢／連結 Checklist | `toast.error(detail)` | 422 時把陣列丟進小提示 |
| ITR Checklist 結果存檔 | 小提示（原文）**加上**面板內紅框（原文） | 重複顯示；422 陣列 |
| Checklist 重開、範本存檔／重開 | 面板紅框原文；`getErrorMessage` 小提示 | 原文；store 寫 `error` |
| ITP 存檔／發行／狀態 | `getErrorMessage` 小提示＋頁面橫幅 | 重複顯示 |
| ITPDetail 頁存檔／發行 | 寫死英文 `Failed to save/publish document.` | 原因丟掉 |
| PQP 存檔／發行 | 表單內紅字＋頁面橫幅 | 重複顯示 |
| Audit 精靈存草稿／送出 | 表單內紅框；store 把錯誤包成 `new Error(文字)` | 狀態碼與代碼在 store 就丟掉 |
| 稽核範本 | 409 有自己的句子，其餘通用句 | — |
| NOI 批次新增 | `noi.bulkAddFailed`（**鍵不存在，畫面顯示鍵名**）＋ axios 原文＋頁面橫幅 | — |
| 會議記錄新一期 | `toast.error(detail)` | 422 陣列 |
| 會議記錄快速作廢 | `getErrorMessage` 小提示＋橫幅 | 重複顯示 |
| FAT 詳細內容存檔 | `err.message`（axios 原文） | 原因丟掉 |
| 承包商、專案 | 通用句「儲存失敗」 | 原因丟掉 |
| 承包商人員、IAM 帳號／角色 | `getErrorMessage` 小提示 | 原文 |
| IAM 建立帳號後綁承包商失敗 | 原文小提示，視窗照關（帳號已建立） | — |
| KM 存檔 | 通用句（409 版本衝突也看不到） | 原因丟掉 |
| KM 匯入 .docx | `alert()`，原文／axios 原文 | — |
| KPI 權重 | `detail ‖ err.message` | 422 陣列 |
| 文件編碼規則 | 表單內紅字，寫死中文＋原文（陣列 JSON 化） | B3 期間由 NOI 工作階段獨佔此檔 |
| 安全設定（2FA） | 寫死英文＋原文 | 422 陣列 |
| 上傳附件 409 | 後端沒有代碼（file_router.py:246、:310；刪除 :460 已有） | 英文原文 |

### 2.3 後端（09f6a688）
- 已有代碼 25 個（第 1 批 16 個＋B2 的 PROJECT_REQUIRED、NOT_PROJECT_MEMBER、PROJECT_ALREADY_CHOSEN、ADMIN_NO_PROJECT_SELECTION、PROJECT_REQUIRED_FOR_CREATE、SHARED_TEMPLATE_ADMIN_ONLY、LINK_OTHER_PROJECT，以及 FAT_SUPPLIER_REQUIRED／NOT_FOUND）。
- B3（進行中，未提交）新增：PROJECT_CODE_MISSING、PROJECT_CODE_REQUIRED、PROJECT_CODE_INVALID、PROJECT_CODE_RESERVED、PROJECT_CODE_DUPLICATE。本批不得重複或另取同義代碼。
- `ScopeForbidden`（core/scope.py:40）仍是純文字 403，4 種訊息。
- 422 來源：Pydantic 驗證，與 noi／ncr／obs／audit router 的日期錯誤（`http_detail()`，帶 `code`）。

## 3. 後端代碼（草案；開工前以 B3 之後的 HEAD 再比對）
共用：
- `SCOPE_FORBIDDEN`（params: reason，4 種）
- `INVALID_TRANSITION`（params: docType, from, to）
- `RECORD_LOCKED`（params: docType, number, status）
- `REFERENCE_NOT_FOUND`（params: docType, field, value）
- `ASSIGNEE_UNAVAILABLE`
- `VERSION_CONFLICT`（ITR 樂觀鎖、KM 409、材料 409）
- `DUPLICATE_NAME`（承包商、專案名稱目前回 500 的情況改 400；專案**代碼**重複沿用 B3 的 PROJECT_CODE_DUPLICATE）
- 上傳附件 409 的 `ATTACHMENT_LOCKED`（沿用既有 kind 變體）

模組專屬：
- NCR：`NCR_CLOSE_MISSING_FIELDS`、`NCR_CLOSE_NOT_VERIFIED`、`NCR_CLOSE_NEEDS_OWNER_APPROVAL`
- NOI：`NOI_CLOSE_OPEN_ITRS`、`NOI_CLOSE_OPEN_NCRS`（`NOI_CONTRACTOR_LOCKED` 視 B3 拿掉「改承包商重新編號」後是否仍存在再定）
- ITR：`ITR_APPROVE_NO_CHECKLIST`、`ITR_APPROVE_CHECKLIST_NOT_PASSED`
- Checklist：`CHECKLIST_RESULTS_MISMATCH`、`CHECKLIST_RESULTS_LOCKED`

其餘（ITR 約 25 條、IAM 密碼規則等）暫不加代碼，以「通用句＋英文原文」顯示。

## 4. 使用者決定（2026-10-14）
- **D1 422**：也用彈跳視窗。`describeRefusal` 對陣列 detail 改為：訊息「有欄位內容不正確，請修正後再儲存：」＋每欄一行 `items`（沿用 `describeSaveError` 的欄位名與日期代碼翻譯）。
- **D2 PQP／Audit 紅字**：被拒或失敗只用彈跳視窗。Audit 的 `saveError` 紅框移除（它只顯示存檔錯誤）；auditStore 改為把原始錯誤往上丟。PQP 的 `saveError` 只保留 `pqp.saveBeforePublish` 與 `pqp.recordSavedPartialFailure` 兩種提醒。
- **D3 內容已保留**：`showRefusal(err, 'save', { keepsInput: true })`，只有視窗確實沒關的呼叫端傳入。被拒（4xx）：「您填寫的內容都已保留，修正後再按儲存即可。」；失敗（5xx／網路）：「無法確認是否已儲存，您填寫的內容仍保留在這裡；請重新整理清單確認後再試。」。
  - 因此 saveFlow 的 `SaveOutcome.failed` 要保留原始 error（目前只留文字）。

## 5. 分批建議
- 2a：共用（refusal.ts／refusalStore／RefusalDialog／saveFlow／presentOutcome）、saveFlow 模組、ITR、ITP、PQP、Audit；共用代碼；store 不寫橫幅。
- 2b：其餘模組與次要動作、模組專屬代碼、上傳 409 代碼、翻譯鍵清理。
- 是否拆批依協調中心排序與 B3 的檔案重疊決定。

## 6. 協調中心排序（2026-10-14）與 2a 的實作

### 6.1 排序
- 拆成 2a／2b；2a 上線後才開 2b。
- 2a 先以 09f6a688 為基準改「B3 不碰的前端」（使用者經協調中心確認）。
- 要等 B3 提交後，以新 HEAD 三方合併再做的：
  - 前端：ITP/*、itpStore、NOI（NOIDetailModal、NOI.tsx、noiStore）、Contractors/*、DocumentNamingRules/*、api.ts、LanguageContext、refusal.test.ts。
  - 後端：全部。
- 「document naming rules」的「存檔錯誤改用 i18n」併入 2b。

### 6.2 2a 已完成（09f6a688 上，未提交）
**共用**
- `utils/refusal.ts`：
  - `describeRefusal(..., options)` 新增 `keepsInput`，結果多一個 `note`：4xx 用 `refusal.keptInput`；5xx、網路或非 HTTP 錯誤用 `refusal.keptInputUnconfirmed`；只限 `save`。
  - 422 改為 `message: refusal.fieldErrors` 加 `items`（逐欄）。
- `utils/saveErrors.ts`：抽出 `fieldErrorLines`（`describeSaveError` 同樣使用它，結果不變）；`presentOutcome` 在 failed 時回 `refusal: { error }`，不再發小提示。
- `utils/saveFlow.ts`：`SaveOutcome.failed` 帶原始 `error`（選填：頁面在送出前自己判定失敗、沒有 error 時，彈窗顯示「未預期的錯誤」）。
- `store/refusalStore.ts`：`showRefusal(err, action, { keepsInput })`。
- `RefusalDialog.tsx`／`.module.css`：顯示 `note`。

**`keepsInput` 的規則**
- 只用在「表單的『儲存』按鈕失敗、視窗沒關」的情況：NCR／OBS／OSD／會議記錄／材料／PQP 存檔、Audit 存草稿與送出、ITR 存檔與首次發行、ITR Checklist 結果存檔。
- 發行、作廢、撤回、重開、新一期、開 NCR、複檢、連結這類動作不加，因為「修正後再按儲存」對它們不適用。

**各模組**
| 檔案 | 改法 |
|---|---|
| NCRModals | presentOutcome 的 refusal → 彈窗（keepsInput）；存檔／重試檔案／「只上傳照片」的 catch → 彈窗 |
| OBSModals | 同 NCR |
| OSDModals、osdStore | 同上；store 的 add／update 不寫 `error` |
| MeetingMinutes、MeetingMinutesModals、meetingMinutesStore | 存檔 → 彈窗（keepsInput）；視窗內作廢、清單快速作廢、新一期 → 彈窗；store 不寫 `error`；頁面的 failed 結果帶 error |
| RegisterDialog（材料） | presentOutcome 的 refusal → 彈窗（keepsInput）。**例外**：結果未知（`lastWriteUnknown`）時，維持原本的 `unknownRetrySafe` 警告並重新載入，因為它的說法（「同一筆不會重複新增」）比通用句準確 |
| ITR.tsx、itrStore | 存檔 → 彈窗（keepsInput），取代 `itr.saveNotConfirmed`；已核准再發行 → 彈窗（取代寫死的英文）；store 不寫 `error` |
| ITRModals | 撤回、開 NCR、複檢、連結 Checklist → 彈窗；Checklist 結果存檔不再發小提示（由面板顯示） |
| ChecklistSnapshotModal（CRLF） | 結果存檔失敗 → 彈窗（keepsInput），紅框只留前端的「N/A 需填原因」；重開失敗 → 彈窗，`reopenError` 紅框移除 |
| PQPModals、PQP.tsx、pqpStore | D2：存檔失敗 → 彈窗（keepsInput）；發行失敗 → 彈窗；`saveError` 只留 `saveBeforePublish` 與 `recordSavedPartialFailure`；store 的 add／update／publish 不寫 `error`（getHistory 不動） |
| AuditWizard（CRLF）、auditStore（CRLF） | D2：`saveError` 紅框移除，存草稿與送出 → 彈窗（keepsInput）；store 改為原樣丟出 axios 錯誤（不再包成 `new Error`） |

### 6.3 B3 之後才加的翻譯鍵（LanguageContext，CRLF，只新增）
| 鍵 | en | zh |
|---|---|---|
| `refusal.fieldErrors` | Some fields are not valid. Correct them and save again: | 有欄位內容不正確，請修正後再儲存： |
| `refusal.keptInput` | Everything you entered is still here: correct it and press Save again. | 您填寫的內容都已保留，修正後再按儲存即可。 |
| `refusal.keptInputUnconfirmed` | Could not confirm whether it was saved. What you entered is still here; reload the list to check before trying again. | 無法確認是否已儲存，您填寫的內容仍保留在這裡；請重新整理清單確認後再試。 |

zh 的兩句是使用者 D1／D3 選定時看到的原文。

### 6.4 從 2a 移出（另記）
- **AuditTemplatesPanel**：409「名稱重複」目前有專用中文訊息。後端的 `DUPLICATE_NAME` 代碼要等 2b 才加，現在改用彈窗會退化成「通用句＋英文原文」，所以移到 2b。
- **ITR 上傳附件失敗**（寫死英文、視窗照關）：記錄已經存好，屬於「部分完成」，不是被拒。修正需要把 ITR 改成 saveFlow 加琥珀色橫幅，另案處理或放進 2b，請使用者決定。
- **會議記錄「加入人員名單」失敗**（AttendeePicker）：與會者已經加上，只有名單那一筆失敗，維持原本的小提示。
- 不再使用的鍵（`saveFlow.failedKeep` 在 NOI 改完後、`itr.saveNotConfirmed`、`itr.revokeFailed`、`checklist.saveFailedKeep`、`checklist.reopen.failed`、`audit.wizard.saveFailedPrefix`、`pqp.saveError`）：在 2b 清理。

## 7. 2a 第二段（基準 097ae3b8，協調中心 2026-10-14 核准後端清單）

### 7.1 接到新 HEAD
- 第一段的 patch 用 `git apply --3way` 套到 097ae3b8（detached worktree `scratchpad/rd2a2`），25 個檔都沒有衝突：B3 沒改到它們。

### 7.2 前端（第二段新增）
- **LanguageContext**（CRLF，只新增）：
  - 6.3 的 3 個鍵。
  - 6 個代碼的中英文，共 14 條，含變體：SCOPE_FORBIDDEN 的 5 個 reason、RECORD_LOCKED 的 publish／qualityFields／evidence。
- **refusal.ts**：
  - `variantOf` 加上 `SCOPE_FORBIDDEN.<reason>`，以及 `kind ≠ record` 時的 `RECORD_LOCKED.<kind>`。
  - 前端不認得的 reason 或 kind，退回不帶變體的那一句。
- **NOI**：NOIDetailModal（CRLF）的存檔失敗改用彈窗（keepsInput）。NOI.tsx 批次新增也改用彈窗（keepsInput），順便修掉 `noi.bulkAddFailed` 鍵不存在的問題。noiStore 的 addBulkNOI 不再寫 `error`。
- **ITP**：
  - ITPModals：存檔改用彈窗（keepsInput）、發行改用彈窗。「主資料已存、計畫未確認」（ItpMainSavedError）不是被拒，維持小提示。「產生 Checklist」在 403 時維持專用句，其他情況改用彈窗。
  - ITP.tsx：「套用項目」改用彈窗。
  - ITPDetail：存檔（keepsInput）、發行、項目存檔改用彈窗，取代寫死的英文。
  - itpStore：add／update／updateDetail 不再寫 `error`。
- **tests-unit**：`refusal.test.ts` 的 PARAMS 加 6 碼；`SCOPE_FORBIDDEN` 由 helper 拋出，所以加進 codes。`refusalSave.test.ts` 加 3 項，用真實字典比對。

### 7.3 後端（6 個共用代碼，英文 detail 一字不改）
| 代碼 | 狀態碼 | 位置 | params |
|---|---|---|---|
| SCOPE_FORBIDDEN | 403 | `core/scope.py` ScopeForbidden（5 處） | reason：noWorkingProject、projectRequired、projectOutsideScope、moveProjectOutsideScope、reassignContractor |
| INVALID_TRANSITION | 400 | ncr、itr、pqp、obs、osd、followup、meeting_minutes、checklist（寫法 A）；itp、noi（寫法 B）；audit（寫法 C） | docType、fromStatus、toStatus |
| RECORD_LOCKED | 400 | NOI 結案、ITR Void、Audit 結案或作廢、FollowUp 結案、會議記錄 Published 或 Void（kind=record）；PQP Approved（publish）；NCR Closed 品質欄位（qualityFields）；OBS Closed 改善證據（evidence） | docType、number、status、kind |
| REFERENCE_NOT_FOUND | 400 | `core/validators.validate_reference_exists`（所有 wrapper 都經過它）；itr_service 的 NOI／NCR 檢查；checklist_service 的 ITP by id；noi_service 的 ITP 範圍檢查。超出範圍和真的不存在的回應完全相同 | docType、field、value |
| ASSIGNEE_UNAVAILABLE | 400 | `core/assignees.py`（NCR、FollowUp） | field |
| VERSION_CONFLICT | ITR 400／KM 409 | itr_service 樂觀鎖；km_repository；km_service 改用 `refusal_http(e, 409)` | docType、number |

**機制**
- `core/refusals.py` 新增 `Coded` 基底。`Refusal(Coded, ValueError)` 的行為不變。
- `ScopeForbidden(Coded, Exception)` 刻意**不是** ValueError，避免被 router 的 `except ValueError` 轉成 400。
- `refusal_http` 看到 `Coded` 就輸出帶 code 的回應；其他錯誤和原本的 `HTTPException(status, str(e))` 完全相同。

**router**
- ncr、noi、itr、itp、pqp、obs、osd、audit、followup、meeting_minutes、checklist、fat 這 12 個 router 中，所有 `HTTPException(status_code=400|403, detail=str(e))` 都換成 `refusal_http(e, 400|403)`。
- 沒有帶 code 的錯誤，回應完全不變，有測試確認。404 和 409 的行不動。

**沒有加代碼的**
- 原文附有特別提示的拒絕，維持「通用句＋英文原文」：ITR Approved 的 blocked fields、ITR detail_data、Checklist Pass/Fail、Checklist 父 ITR 鎖定、ITR 連結／開 NCR／複檢時被鎖定、NOI 被鎖時不能開 ITR。
- 材料的 Conflict、會議記錄 Rev 重複、AuditConflict：留到 2b。

### 7.4 2b 必須列入的項目（協調中心要求）
- 潛在的 500：itp、pqp、obs、osd、meeting_minutes 的 create router 沒有接 ValueError；km router 沒有 try，create 遇到 ValueError 會變成 500；fat 的 create／update 只接 Refusal，update_fat_detail 只接 ScopeForbidden。
- DUPLICATE_NAME（承包商、專案、稽核範本、人員、角色、帳號）。
- 上傳附件 409 的 ATTACHMENT_LOCKED。
- 模組專屬代碼：NCR／NOI 結案、ITR 核准、Checklist 結果。
- 承包商、專案、人員、IAM、KM、KPI、安全設定、文件編碼規則（以 naming rules 的提交為基準）、Checklist 範本、FAT 詳細內容、AuditTemplatesPanel。
- 橫幅統一、清理沒用到的翻譯鍵。
- 待使用者決定：ITR 上傳附件失敗要不要改成 saveFlow。
