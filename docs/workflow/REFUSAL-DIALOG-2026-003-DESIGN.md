# REFUSAL-DIALOG-2026-003 設計（第 2 批 2b）

> 基準 124f6c14。盤點用兩個唯讀代理（後端、前端），2026-10-17。2a 的規則（D1／D2／D3、選項 (a)、keepsInput 只用於表單的「儲存」）照舊適用，見 REFUSAL-DIALOG-2026-002-DESIGN。

## 1. 協調中心排序（2026-10-17）
- 拆成 2b-1 和 2b-2，兩批各自送審、各自提交；2b-2 的父節點是 2b-1。
  - 2b-1：後端全部，加上前端的翻譯、彈窗與 store，包括 ITR。
  - 2b-2：橫幅統一、清理翻譯鍵、tests-browser。
- 3.11 全套只跑 2b-2 的最終 tree。預覽一次，在 2b-2 完成後。兩批一起部署。
- 其他決定：
  - 會議記錄 Rev 重複用 `MEETING_REV_DUPLICATE`。
  - 「ITR status cannot be empty.」不加代碼。
  - test_ref_project_seq_b3 的斷言依設計修改。
  - 「不做」的四項寫進 BACKLOG（#54–#57）。
  - 權限 403 併入 2b-1。

## 2. 2b-1 後端
### 2.1 router 不再回 500（補接 ValueError，改用 refusal_http）
- itp：create、update_itp_detail
- pqp：create、delete
- obs：create、delete
- osd：create、delete
- meeting_minutes：create
- km：create、update、delete
- fat：create／update（原本只接 `Refusal`，改成 `ValueError`）、details、delete
- contractors：create、update，以及人員 2 處（plain → refusal_http）
- audit templates：409 改用 refusal_http
- `DateValidationError` 等更具體的 except 仍放在 `except ValueError` 前面。
- 沒有代碼的錯誤，回應和原本的 400 相同（`{"detail": …}`）。

### 2.2 代碼（英文 detail 一字不改；沒有既有訊息的，新寫英文句）
| 代碼 | 狀態碼 | 位置 | params |
|---|---|---|---|
| DUPLICATE_NAME | 400（稽核範本 409） | 承包商名稱（原本 500，新句 "A contractor named '…' already exists."）、專案名稱（原本 500，`_code_clash` 加 name）、人員 3 處、角色（建立時的預先檢查；改名原本 500，`_role_clash`）、帳號 Email／帳號（4 處 RefusalHTTPException）、稽核範本（`AuditTemplateConflict(Coded)`） | docType（contractor／project／personnel／role／user／auditTemplate）、name、帳號另帶 field（email／username） |
| MEETING_REV_DUPLICATE | 400 | meeting_minutes_service 的 Rev 重複 | number、rev |
| ATTACHMENT_LOCKED | 409 | file_router 上傳 2 處（改用 lock_refusal） | 沿用 kind 變體 |
| NCR_CLOSE_MISSING_FIELDS | 400 | assert_closure_conditions | fields、labelsZh、labelsEn、reason（none／noPhoto／createDirect）、photoProblems |
| NCR_CLOSE_NOT_VERIFIED | 400 | 同上 | — |
| NCR_CLOSE_NEEDS_OWNER_APPROVAL | 400 | 同上 | disposition |
| NOI_CLOSE_OPEN_ITRS | 400 | update_noi | number、count |
| NOI_CLOSE_OPEN_NCRS | 400 | update_noi | number、count、ncrs |
| NOI_CONTRACTOR_LOCKED | 400 | update_noi | number、cited |
| ITR_APPROVE_NO_CHECKLIST | 400 | _validate_approval | — |
| ITR_APPROVE_CHECKLIST_NOT_PASSED | 400 | 同上 | checklists（「CHK-1 (Ongoing)」形式） |
| ITR_APPROVE_PASS_UNSUPPORTED | 400 | 同上 | checklists（單號） |
| CHECKLIST_RESULTS_LOCKED | 400 | update_checklist | number、status |
| CHECKLIST_RESULTS_INCONSISTENT | 400 | update_checklist | number、status、problems（英文） |
| PERMISSION_DENIED | 403 | `PermissionDenied`（ITP 核准）與 `NCRCloseNotPermitted` 改成 `Coded`，router 本來就經 refusal_http | permissions |

## 3. 2b-1 前端
- **翻譯**：LanguageContext 新增 17 條代碼的中英文（含變體 DUPLICATE_NAME.email／.username、NCR_CLOSE_MISSING_FIELDS.noPhoto／.createDirect），以及 docType personnel、audittemplate。`dateField.date` 改成通用的「日期／Date」（R3 P3-1）。
- **refusal.ts**：
  - 新增兩個變體：DUPLICATE_NAME.<field>、NCR_CLOSE_MISSING_FIELDS.<reason>。
  - `LOCK_CODES`（RECORD_LOCKED、CHECKLIST_RESULTS_LOCKED）的提示行只寫「已保留」。
  - 「404／VERSION_CONFLICT 不顯示提示行」的說明移到 `correctable` 上方（R3 P3-2）。
- **彈窗**（keepsInput 只用在表單的「儲存」按鈕）：
  | 檔案 | 改法 |
  |---|---|
  | ContractorModal、ProjectModal | 加 keepsInput |
  | ContractorPersonnel | run() |
  | UserModal | axios 錯誤改用彈窗加 keepsInput；表單自己的檢查維持小提示；建立後綁承包商失敗是部分完成，維持小提示，但原因改用 describeSaveError |
  | RoleModal | 同 UserModal 的規則 |
  | UserScopeSection | 一律用彈窗 |
  | KMModals | 存檔加 keepsInput；「主檔已存、章節失敗」維持；附件上傳改用彈窗 |
  | KMDetail | 匯入改用彈窗，成功和匯出的 alert 改成小提示 |
  | KPI、SecuritySettings（4 處） | 改用彈窗 |
  | Checklist | 範本存檔加 keepsInput；重開不加 |
  | FAT | 詳細內容存檔、編輯都加 keepsInput |
  | AuditTemplatesPanel | 加 keepsInput |
  | DocumentNamingRules | catch 改成 showRefusal 加 keepsInput；前端驗證的紅字維持 |
  | FollowUpIssue | 加 keepsInput |
  | ITP／PQP | 附件上傳失敗的原因改用 describeSaveError |
- **store**：
  - checklistStore、fatStore、contractorsStore、projectStore、followUpStore 存檔失敗不再寫 `error`。checklistStore 的 error 原本會誤觸 Dashboard 的 Checklist 狀態。
  - auditTemplateStore 改成原樣丟出 axios 錯誤。

## 4. 2b-1 的 ITR（第 9 項；使用者 2026-10-17 確認範圍，Q1 (a)）
- **ITR.tsx**：
  - handleSaveITRDetails 改用 runSaveFlow，搭配 lastWriteRef 和 sameWrite。
  - 新 ITR 已經寫入、但檔案還沒完成時，留在原本的視窗，重試時針對已存的那筆。
  - settle 負責收尾：全部完成後，新 ITR 切到剛建立的那筆並顯示 createdKeepOpen；既有 ITR 則關閉視窗。
  - 新增 handleRetryITRFiles（只重做檔案）。
- **ITRModals.tsx**：
  - 新增 applyOutcome、retryFiles、followUp 狀態，以及 SaveFollowUpBanner。
  - 5 個附件區加上 syncToken。
  - handlePublish 在還有待處理檔案時先擋下，提示 `itr.publishNeedsSaveFirst`。
  - doPublish 處理回傳的結果：failed 時跳彈窗，saved-reload-failed 時顯示警告。
- **LanguageContext**：新增 `itr.publishNeedsSaveFirst`、`saveFlow.category.drawing`／`.certificate`。
- **不動**：itrStore、ITR 的欄位與版面、Checklist 面板、撤回、開 NCR、複檢。

## 5. 2b-2（以 2b-1 commit 247ee771 為父）
- **橫幅統一**：Audit（× 改成「重試」，呼叫 fetchAudits）、OBS、OSD、會議記錄的頁面橫幅只用於清單載入失敗，改成和 NCR 相同的 `<span>` 加「重試」（OBS／OSD 帶目前的搜尋字串，會議記錄帶 listSearch）。auditStore 的 add／update 不再清空 `error`（`clearError` 留在 store 的介面上）。
- **清理翻譯鍵**（LanguageContext，CRLF，刪 70 行）：
  - saveFlow.failedKeep、itr.saveNotConfirmed（含上方 6 行說明註解）、itr.revokeFailed、checklist.saveFailedKeep、checklist.reopen.failed。
  - audit.wizard.saveFailedPrefix／saveError／submitError、pqp.saveError、noi.deleteBlocked、noi.citedBy.*（5 個）、contractors.personnel.blocksDelete／saveFailed。
  - itp.deleteError／addError／updateError／detail.saveError／detail.saveErrorGeneric／generateChecklistFailed、itr.saveError、workflow.loadError、common.deleteFailed。
  - iam.deleteError／scope.loadFailed／scope.saveFailed、kpi.weightsSaveFailed、audit.templates.duplicateName／saveFailed。
  - 每個鍵刪除前都 grep 確認 src 內沒有使用，也沒有用動態方式組出這些前綴的鍵。km.chaptersSaveUnconfirmed 仍在使用，保留。
- **後端死碼**：core/attachment_access.lock_reason（R1 P3-2）已經沒有呼叫者，刪除，並把說明併入 lock_refusal。
- **tests-browser 8 支**（R1 P3-4、P3-8）：forms-consistency-review、forms-consistency-itr-save-wording-review、forms-leave-guard-review-osd、forms-leave-guard-review-naming-rules（第 4 段）、forms-leave-guard-review-contractor-project、forms-leave-guard-review-role、contractor-personnel-review、audit-templates-check。
  - 舊的小提示和表單內紅字預期，改成檢查彈窗的標題、訊息和提示行，並確認沒有 sonner 錯誤小提示。
  - contractor-personnel-review 原本對刪除承包商的預期在第 1 批就已經過時，改成 CONTRACTOR_DELETE_HAS_PERSONNEL 的彈窗。
  - 8 支都通過 `node --check`；需要隔離環境才能實跑，本批沒有實跑。
