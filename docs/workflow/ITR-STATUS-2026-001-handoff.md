# ITR-STATUS-2026-001 — ITR 核准遭拒後狀態轉換誤判修正

來源：2026-10-03 Q-Workflow→NOI→ITR 業務操作審閱（本次對話內直接審閱，未走
TASK/STATUS/REVIEW 流程，findings 直接交辦修復）。FORMS 表單保護補正系列已於
FORMS-2026-005 獨立審查 PASS 結案（`docs/workflow/FORMS-2026-005-archive.md`），本批為
結案後第一個新任務，TASK_ID: ITR-STATUS-2026-001。

## 問題

既有 In Progress 的 ITR、未連結任何 Checklist。使用者在「Quality Assessment」把 Inspection
Result 設為 Pass、Status 設為 Approved，按 Save。後端正確拒絕（`Cannot approve ITR without
any linked checklists`），raw GET 確認後端仍是 `status: "In Progress"`。但接下來使用者想把
Status 改回 In Progress 修正，畫面卻跳出：

> 「已核准的 ITR 無法直接改回進行中，須先由具核准權限者撤回核准（Revoke Approval）」

此時 Status 下拉顯示「Approved」，但後端從未真正核准成功——使用者被困在一個畫面宣稱已核准、
實際上沒有的假狀態裡，Approve 方向被 Checklist 規則擋、改回 In Progress 方向被這個誤判的
Revoke 提示擋，唯一出路是放棄整筆編輯（關閉視窗選「Leave」）重新打開。

## 根因

讀碼確認：`react-app/src/components/ITR/ITRModals.tsx` 的 `handleFieldChange`（約第
371–396 行）在狀態切換檢查時，用的是畫面上**尚未保存**的 `formData.status`：

```ts
// 修正前
if (field === 'status' && formData.status) {
    const validation = validateStatusTransition(formData.status, value, ITRStatusTransitions);
    ...
}
```

而同一個檔案裡 `isLocked`（約第 345–358 行）判斷「這筆 ITR 是否已核准鎖定」時，特別用的是
**已保存**狀態 `existingItem?.status`，並且留了一段很明確的註解解釋原因（選了 Approved 但
還沒保存時，不能被當成已核准）。`handleFieldChange` 卻沒有套用同一個原則。

`react-app/src/utils/statusValidation.ts` 裡 `ITRStatusTransitions` 對 `Approved→In
Progress` 這條規則的註解甚至明寫：「這些路徑在正常表單下不可能被觸發，因為 UI 的 Status 下拉
一旦已持久化為 Approved 就會被 `isLocked` 禁用」——這個假設預設了「`formData.status` 會是
Approved，代表這筆 ITR 一定已經真的保存為 Approved」，但這次重現證明：`formData.status` 在
使用者只是**選了**但**還沒保存成功**時就已經是 Approved，與 `existingItem?.status`（真正的
後端狀態）可能完全不同步。

另外讀碼確認：新建 ITR 模式（`existingItem` 不存在）下，Status 下拉同樣完整渲染、未被
`isLocked` 停用（`isLocked = persistedStatus === 'Approved' || ...`，新建模式下
`persistedStatus` 是 `undefined`，恆為 `false`）——使用者在新建一筆從未保存過的 ITR 時，一樣
可以選 Approved 再改回，一樣會踩中同一個誤判。

## 修正

`handleFieldChange` 改為用 `persistedStatus`（即 `existingItem?.status`，與 `isLocked` 同一
個變數）作為轉換檢查的「目前狀態」基準；`persistedStatus` 不存在（新建模式，這筆紀錄根本還
沒被保存過）時，直接略過轉換檢查——新建模式下的第一次選擇是自由選擇，不是「轉換」，沒有
「從哪個狀態轉換過去」這回事。

```ts
// 修正後
if (field === 'status') {
    if (persistedStatus) {
        const validation = validateStatusTransition(persistedStatus, value, ITRStatusTransitions);
        if (!validation.allowed) {
            toast.warning(validation.message || t('common.invalidStatusTransition'));
            return;
        }
    }
    if (value === 'Approved' && linkedChecklists.some(c => c.status === 'Fail')) {
        setApprovalWarning({ show: true, pendingStatus: value });
        return;
    }
}
```

### 為何不需要處理「同視窗保存成功後的基準更新」

交辦時特別要求先核對「既有、新建、同視窗保存成功後」三種情境各自的基準。前兩種已如上處理；
第三種讀碼確認在目前架構下**不存在**：`react-app/src/components/ITR/ITR.tsx` 的
`handleSaveITRDetails`（第 213–216 行）與 `doPublish`（透過同一個 handler）在**任何**成功
寫入後都會直接 `setIsEditModalOpen(false)`，modal 一律關閉，不會停留在同一個已掛載的實例上
繼續編輯。也就是說：一個 modal session 裡最多只會成功保存一次，而那一次成功就會結束這個
session——不存在「保存成功、modal 留在原地、`existingItem` 需要被更新成最新值、使用者接著
再改 Status」這種情境。因此本批未新增「上次成功保存的狀態」追蹤機制，只是把基準從
`formData.status` 換成 `existingItem?.status`，與 `isLocked` 完全一致。

## 隔離環境驗證

**種子**：`backend/scripts/verification/seed_itr_status_revert_review.py`（**隔離測試種子
腳本**——會實際寫入測試資料，不是唯讀腳本；需要 `QUALITAS_REQUIRE_ISOLATED_DB=1` 與
`ITR_STATUS_REVIEW_PASSWORD` 環境變數，無硬編碼密碼）建立四組情境：

1. `QTS-ISRP1-ITR-000001` — In Progress、未連結 Checklist（核心重現對象）。
2. `QTS-ISRP1-ITR-000002` — In Progress、已直接種入一筆 status=Pass 的 Checklist instance
   （繞過 UI 填寫流程，只為證明「核准條件真的滿足時」核准仍然成功，不重新測試 Checklist
   填寫本身）。
3. `QTS-ISRP1-ITR-000003` — 已持久化 status=Approved。
4. 新建模式不需要種子資料，直接在瀏覽器腳本裡點「Add New ITR」。

每組都連結到各自獨立的 NOI（`ITRModals.tsx` 的 `handleSave` 會先擋下沒有 `noiNumber` 的
ITR，這點與本批修正無關，是既有前端必填檢查，種子需要配合建立 NOI 才能走到 Save）。

**瀏覽器驗證**：`react-app/tests-browser/itr-status-revert-review.mjs`，在自建隔離堆疊
（backend/vite 8200/3200）上執行，**27/27 通過**：

- **情境 A（核心重現＋修正驗證）**：選 Approved 保存被拒 → raw GET 確認後端仍 In Progress、
  inspectionResult 未寫入 → 同一視窗內改回 In Progress（**不**再跳出撤回核准警告，這是本次
  修正的直接證明）→ 同時輸入的 Remark 保留 → 成功保存 → raw GET 確認 status 與 Remark 都
  正確持久化。
- **情境 B（新建模式）**：新建 ITR 預設 In Progress、Status 下拉未被鎖定 → 選 Approved 不
  觸發警告 → 改回 In Progress 也不觸發警告 → 放棄不保存，確認未產生孤兒紀錄。
- **情境 C（已真正核准的紀錄仍受保護）**：Status／Inspection Result 下拉皆為停用狀態
  （`isLocked` 行為未被本次修正弱化）→ Publish（建立下一版）仍正常成功（寫入 `type` 欄位，
  與本批修正無關的既有流程，僅作回歸確認）。
- **情境 D（Checklist 規則本身未被動到）**：已有 Pass Checklist 的 ITR，選 Approved 保存
  仍正常成功並持久化。

**其他回歸**：`npm test -- --run` → 123 passed, 0 failed；`npm run build`（含 tsc）→ 成功。
後端完全未修改，依規則略過後端 pytest 套件。

**未測限制（誠實列出）**：

- `itr:approve:all` 權限本身未另外用一組沒有此權限的帳號做即時瀏覽器驗證——讀碼確認
  Status 下拉本身不受此權限閘門（純後端強制），本批修正只動了轉換檢查的「基準」變數，完全
  沒有觸碰任何權限判斷式，結論依讀碼推論，非即時實測。
- Checklist「填寫並標記 Pass」的 UI 流程本身（例如逐項勾選、N/A 判斷）未被重新走過——情境 D
  的 Checklist 是直接種入已經是 Pass 狀態的 instance，只用來確認「核准成功路徑」沒被破壞，
  不是重新驗證 Checklist 本身的填寫/判定邏輯（那是既有、本批未觸碰的功能）。
- 問題 2（Q-Workflow 列表缺少可直接辨識的目前步驟文字）僅記錄於 BACKLOG.md #52，依交辦明確
  不在本批實作。

## 隔離與可重跑資產

- `backend/scripts/verification/seed_itr_status_revert_review.py`（隔離測試種子腳本，新建）
- `react-app/tests-browser/itr-status-revert-review.mjs`（隔離瀏覽器驗證腳本，新建）
- `docs/workflow/ITR-STATUS-2026-001-evidence/`（8 張截圖，本輪驗證產生）

## 埠號釋放

隔離堆疊（backend/vite 8200/3200，root 於驗證過程中因重新播種重建兩次，最終 root 為
`qualitas-manual-jrcthmbn`）已於完成後以 `isolated_stack.py down` 拆除，並以 `lsof` 確認
埠號釋放；使用者 8198（backend）/3198（vite）全程監聽未受影響。
