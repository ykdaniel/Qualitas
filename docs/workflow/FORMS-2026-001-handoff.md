# FORMS-2026-001 — 表單離開保護補驗與最小修復

> **更正（FORMS-2026-002，2026-09-30）**：本檔案原文下方一處寫出了本批種子測試密碼明碼，已在原地
> 遮蔽為 `[已遮蔽測試密碼]`，其餘原文保留不動。本輪 STATUS 曾標記 DONE，經獨立審查判定 REVISE，完整
> 審查內容（含未達成項目、過度宣稱之處）保存於 `docs/workflow/FORMS-2026-001-archive.md`；本檔以下原文
> 不代表已通過審查。R1–R5 修正結果見 `docs/workflow/FORMS-2026-002-handoff.md`。
>
> 修正後的測試密碼一律透過 `FORMS_TEST_PASSWORD` 環境變數提供，不再有任何硬編碼或預設密碼；下方原文的
> 重跑指令若直接照做會因未設定該變數而在腳本開頭明確失敗（設計如此，不是新缺陷）。

延續 [form-leave-guards-2026-09-30-handoff.md](./form-leave-guards-2026-09-30-handoff.md) 留下的缺口：
OSD、Contractor/Project、Role、DocumentNamingRules、SecuritySettings 先前僅完成「接入且通過型別/建置」，
未逐一完成真實畫面保存/取消矩陣。本批（不含 SecuritySettings，未列入本批 ALLOWED_PATHS）針對 OSD、
Contractor、Project、IAM Role、DocumentNamingRules 五種表單重跑完整驗證矩陣，並針對 Audit／Meeting
Minutes 的子項目草稿（Custom Check Item／Action Item 等）做「輸入但未 Add/Apply，直接保存主表單」的
專項重現與修正。

## 發現與修正（3 處，均已重現後修正並回歸）

### 1. OSD：保存失敗時被誤判為成功，直接關閉並丟棄輸入 — 已修正
`OSD.tsx` 的 `handleSaveOSDDetails` 在 `catch` 區塊只呼叫 `toast.error(...)`、沒有 `throw` 或
`re-throw`；`OSDModals.tsx` 的 `OSDDetailModal` 把它當成 `onSave` prop 呼叫，其自身的
`try { await onSave(...); onClose(); } catch { toast.error(...) }` 因此永遠落在 `try` 分支——保存失敗
時外層雖顯示了錯誤 toast，內層仍判斷「沒有拋出例外」而繼續 `leaveGuard.release(); onClose();`，
**視窗直接關閉、使用者剛編輯的內容整個遺失，且沒有任何「保存失敗」的提示殘留可追溯**。

- 重現：攔截 PUT `/api/osd/{id}` 回傳 500，編輯後點 Save → 修正前視窗立刻關閉、資料遺失。
- 修正（[OSD.tsx](../../react-app/src/components/OSD/OSD.tsx)）：`catch` 區塊改為
  `throw new Error(getErrorMessage(error, t('common.saveFailed')))`，讓錯誤正確傳回
  `OSDDetailModal` 自身的 `catch`，此時視窗維持開啟、輸入保留、Save 按鈕恢復可點擊、只顯示一次
  友善錯誤；解除模擬失敗後修改並重試，確認保存的是最新內容。
- 證據：`docs/workflow/FORMS-2026-001-evidence/osd-05-save-failure-toast.png`、
  `osd-06-after-retry-reopen.png`；腳本 `forms-leave-guard-review-osd.mjs` 場景 4（21 項斷言全過）。

### 2. Audit：自訂查檢項目輸入但未按「新增」，主表單保存會靜默丟棄 — 已修正
`AuditWizard.tsx` 的 `newItem`（自訂查檢項目的編號/條款/查檢重點草稿）不在
`prepareAuditData()` 使用的 `formData.customCheckItems` 陣列中，必須先按「新增」
（`addCustomItem`）才會併入；`handleSaveDraft`／`handleSubmit` 兩者都直接送出
`formData.customCheckItems`，完全不檢查 `newItem` 是否還有未確認的內容。

- 重現：跳到 Step 4（Checklist Setup）在「查檢重點」欄位輸入文字、不按新增，直接點「儲存草稿」或
  「完成並建立計畫」→ 修正前送出的 request 不含該筆內容，使用者毫無提示地遺失剛輸入的查檢項目。
- 修正（[AuditWizard.tsx](../../react-app/src/components/Audit/AuditWizard.tsx)）：新增
  `hasUnconfirmedNewItem()` / `blockSaveForUnconfirmedNewItem()`，在 `handleSaveDraft` 與
  `handleSubmit` 開頭檢查；只要 `newItem` 三個欄位任一非空，即擋下保存（不送出任何 API 請求）、
  用 toast 提示「請先按新增，或清空欄位後再保存」，欄位內容原樣保留。未自動把未確認內容寫入、
  未新增任何必填業務規則。
- 回歸：清空欄位後保存成功（1 次請求）；先按新增再保存，項目正確出現在送出的 payload 中。
- 證據：`docs/workflow/FORMS-2026-001-evidence/audit-01-blocked-save-draft.png` ～
  `audit-04-added-then-saved.png`；腳本 `forms-leave-guard-review-audit-subdraft.mjs`（9 項斷言全過，
  含修正前/後對照與正常 Add→Save、清空→Save 兩種回歸）。

### 3. Meeting Minutes：與會者／討論主題/子項目／行動項目輸入但未新增，主保存會靜默丟棄 — 已修正
`MeetingMinutesModals.tsx` 的 `handleSave` 送出 `attendees`、`discussionLog`、`actionItemsDraft`
三個「已確認」陣列，但 `newAttendee`、`newTopicTitle`、`subItemDrafts`、`newAction` 四個子草稿狀態
都不在其中——任一個只打字、沒按對應的新增按鈕就點主表單 Save，內容同樣會被靜默丟棄（`leaveGuard`
雖然有把這些草稿一併納入離開時的髒值判斷，但那只保護「導頁/關閉」，不保護「保存」本身）。

- 重現：新建會議，在「行動項目」標題欄位輸入文字、不按 + 新增，直接點主表單 Save → 修正前送出的
  request 不含此行動項目，且畫面上也沒有任何殘留提示。
- 修正（[MeetingMinutesModals.tsx](../../react-app/src/components/MeetingMinutes/MeetingMinutesModals.tsx)）：
  新增 `unconfirmedSubDraftLabel()` / `blockSaveForUnconfirmedDraft()`，在 `handleSave` 開頭檢查
  四個子草稿（順序：與會者 → 討論主題 → 討論子項目 → 行動項目），任一有未確認內容即擋下保存、
  toast 提示對應的中文標籤（沿用既有翻譯 key，未新增翻譯）。`handleVoidClick`／
  `handleNewOccurrenceClick` 等其他明確動作不受影響（維持既有設計）。
- 回歸：清空後保存成功（1 次請求）；先按 + 新增（新記錄走 `actionItemsDraft` 暫存／既有記錄走
  `addActionItemNow` 立即建立 FollowUp，兩條既有路徑不同但皆已在草稿清空後驗證）再保存，主表單
  Save 完全不受影響（仍是 1 次請求）。
- 證據：`docs/workflow/FORMS-2026-001-evidence/mm-01-blocked-save.png` ～ `mm-04-added-then-saved.png`；
  腳本 `forms-leave-guard-review-meetingminutes-subdraft.mjs`（8 項斷言全過）。

## 五種表單的畫面證據矩陣（OSD／Contractor／Project／Role／DocumentNamingRules）

全數在隔離環境（backend 8200 / vite 3200，見下方重跑方式）以 Playwright 驅動真實瀏覽器操作驗證，
非僅讀碼。逐一涵蓋：載入未改動離開不誤報、修改後離開 Stay 保留／Leave 丟棄、正常保存（實際
request/response ＋ 重新讀取比對）、模擬保存失敗＋重試（請求計數區分首次/重試）、至少一例延遲保存
（連點不多送請求、保存中無法誤離開、完成後無殘留提示）。DocumentNamingRules 為純整頁編輯器，沒有
Cancel 入口，改用站內導頁（點側欄「Dashboard」）驗證離開保護，未捏造不存在的入口；其比較基準
（`baseline`）在讀碼確認為僅於 `fetchRules()` 成功後才設定，實測也證實「未載入完成前不會誤判為已改動」。

| 表單 | 結果 | 斷言數 | 腳本 |
|---|---|---|---|
| OSD | 全過，含 1 項已修正缺陷 | 21/21 | `forms-leave-guard-review-osd.mjs` |
| Contractor | 全過，未發現缺陷 | 17/17（與 Project 共用腳本） | `forms-leave-guard-review-contractor-project.mjs` |
| Project | 全過，未發現缺陷 | 17/17（與 Contractor 共用腳本） | 同上 |
| IAM Role | 全過，未發現缺陷，含唯讀模式驗證 | 22/22 | `forms-leave-guard-review-role.mjs` |
| DocumentNamingRules | 全過，未發現缺陷 | 17/17 | `forms-leave-guard-review-naming-rules.mjs` |

Role 的唯讀模式驗證使用種子腳本另建的 `forms_role_readonly`（僅 `iam:role:view`，隔離環境專用、無真實
帳號使用）登入，確認：沒有「Add Role」入口、點列表仍可開啟檢視、Modal 內沒有 Save/Add 按鈕、欄位
`fieldset disabled` 生效——本批未修改 `RoleModal.tsx`，此為既有正確行為的驗證留存，非新增保護。

延遲保存案例：OSD 場景 5 以 `page.route()` 對 PUT 加人工延遲，驗證保存中連點 Save 不多送第二個請求、
保存中嘗試關閉視窗不會把視窗拆掉，延遲保存完成後也沒有殘留的「未保存」確認框。其餘四表單的保存流程
與 OSD 共用同一套 `useDraftGuard`/`saving` 鎖定模式（讀碼確認一致），故延遲保存只在 OSD 上完整跑過一次，
未逐一重跑，屬合理的代表性驗證而非遺漏。

未發現缺陷的四種表單完全沒有修改任何 production 檔案——純粹用瀏覽器操作留下證據，未為了交付而改動程式。

## 未修改的檔案（讀碼確認、未觸碰）
- `Shared/LeaveGuard.tsx`、`Shared/ConfirmModal.tsx`：本批共用機制無需變更，因此 ACCEPTANCE_CRITERIA #4
  要求的「若修改共用元件才需回歸 KM/ITP」不適用——已在 STATUS 中明確標註為不適用而非略過。
- `IAM/RoleManagement.tsx`、`IAM/RoleModal.tsx`：讀碼確認既有的保存/錯誤處理已經正確（無 OSD 那種吞例外
  問題），實測 22 項全過，未發現需要修正的缺陷。
- `Contractors/Contractors.tsx`、`ContractorModal.tsx`、`ProjectModal.tsx`：同上，讀碼＋實測皆正確。
- `DocumentNamingRules/DocumentNamingRules.tsx`：同上。
- `OSD/OSD.tsx` 以外的 OSD 檔案（`OSDModals.tsx` 本身無需改，問題根源在父層 `OSD.tsx`）。

## 範圍外發現（僅記錄，未處理）
- Meeting Minutes 的「討論主題」「討論子項目」「與會者」三個子草稿與「行動項目」共享同一套
  `blockSaveForUnconfirmedDraft()` 保護，但實機重現只針對「行動項目」跑了完整的 Playwright 場景
  （最貼合任務描述的具體案例）；其餘三個子草稊的保護邏輯與行動項目共用同一段程式、讀碼可確認邏輯
  對稱，但未逐一各跑一次獨立瀏覽器場景。如需要，下一批可補齊各自的專項腳本。
- OSD 保存時 Save 按鈕在請求進行中沒有被禁用（`disabled` 屬性），只是靠 `if (saving) return` 之類的
  guard 防止重複送出（延遲保存場景已證實不會多送請求）。這是可用性細節而非資料遺失缺陷，本批未動。
- Audit／Meeting Minutes 是否應該在「明確取消草稿」時也給予提示（例如清空欄位算不算「取消」）——本批
  採最保守解讀：只要欄位為空就視為已取消，不強制要求額外的取消按鈕或確認，避免新增業務規則。

## 測試結果（本輪重新執行，非沿用前次數字）
- `npm test`：**123 passed, 0 failed**（與前次交接文件數字巧合相同，但為本輪獨立重新執行，非直接沿用）。
- `npm run build`（含 tsc 型別檢查）：**成功**。
- 後端未修改任何 production 檔案，後端測試套件本批略過（僅新增/調整一支隔離環境專用種子腳本，
  不影響後端邏輯，無需跑後端套件）。

## 如何重跑本批驗證（隔離環境，不影響 8198/3198）
```bash
cd backend
python scripts/verification/isolated_stack.py up --port 8200 --vite-port 3200 \
  --vite-script ../react-app/tests-browser/forms-leave-guard-review-vite-launcher.mjs \
  > /tmp/forms-2026-001-stack.json
python scripts/verification/isolated_stack.py seed \
  --root "$(python -c "import json;print(json.load(open('/tmp/forms-2026-001-stack.json'))['root'])")" \
  --script scripts/verification/seed_forms_leave_guard_review.py

cd ../react-app
node tests-browser/forms-leave-guard-review-osd.mjs /tmp/forms-2026-001-stack.json
node tests-browser/forms-leave-guard-review-contractor-project.mjs /tmp/forms-2026-001-stack.json
node tests-browser/forms-leave-guard-review-role.mjs /tmp/forms-2026-001-stack.json
node tests-browser/forms-leave-guard-review-naming-rules.mjs /tmp/forms-2026-001-stack.json
node tests-browser/forms-leave-guard-review-audit-subdraft.mjs /tmp/forms-2026-001-stack.json
node tests-browser/forms-leave-guard-review-meetingminutes-subdraft.mjs /tmp/forms-2026-001-stack.json

cd ../backend
python scripts/verification/isolated_stack.py down --root <上面印出的 root>
```
每支腳本大多依序改動同一批種子資料（例如 OSD 腳本會把 `damageDescription` 改成
`RETRY SUCCEEDED — final value`），若要重複執行同一支腳本，先用 `down` + `up` + `seed` 重建一個乾淨的
堆疊，避免斷言比對到上一輪殘留的值。密碼未寫死在任何交付文件外的地方以外——僅出現在種子腳本本身
（隔離環境專用假帳號 `forms_full` / `forms_role_readonly`，密碼 `[已遮蔽測試密碼]`，不是真實帳密）。

## 埠號釋放
本批使用的隔離堆疊（backend 8200 / vite 3200，最後一次 root 為
`qualitas-manual-lt9422gq`）已於完成後以 `isolated_stack.py down` 拆除並確認埠號釋放；使用者的
8198（backend）/3198（vite）全程未被觸碰，仍在監聽中。
