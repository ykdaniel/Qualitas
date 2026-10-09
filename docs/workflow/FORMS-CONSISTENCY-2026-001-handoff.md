# FORMS-CONSISTENCY-2026-001 — NOI/ITR/NCR 表單操作一致性查核

延續 QWORKFLOW-LAYOUT-2026-001（待審查，封存不代表 PASS，原文見
`docs/workflow/QWORKFLOW-LAYOUT-2026-001-archive.md`）。本輪實際操作三個表單查核一致性，
找到 3 項可重現落差並做最小修正，1 項判斷為不需修正（NCR 保存證據鏈其實已一致，只是我
自己的種子資料一開始缺必填欄位），1 項為測試腳本本身的歷史堆疊假影，非產品問題。

## 對使用者的改善（先說結論）

1. **唯讀時不再誤稱「Edit ITR」**：ITR 被核准鎖定（Approved）後，之前畫面標題仍顯示
   「Edit ITR」，讓使用者以為還能編輯；現在正確顯示「View ITR」，和 NOI（View NOI）、
   NCR（NCR Details）一致。
2. **唯讀時關閉按鈕文字一致**：同樣情境下，關閉按鈕之前固定顯示「Cancel」；現在正確
   顯示「Close」，和 ITR 原本就有、但因另一個獨立的程式判斷缺陷而失效的既有設計意圖
   一致。
3. **保存中的回饋更清楚、更安全**：ITR 按下 Save 後，之前按鈕文字完全不變（一直是
   「Save」），使用者看不出系統正在處理；現在會顯示「Saving...」，和 NOI/NCR 一致。
   同時，ITR 保存中的 Cancel/Close 按鈕之前**完全沒有被停用**——使用者這段時間點了也
   沒反應（因為離開保護本身會擋下，但畫面上看不出來，像是壞掉了）；現在會正確顯示為
   停用狀態，和 NOI/NCR 一致，不會讓人誤以為按鈕沒反應。

## 查核方法

在獨立隔離環境，用**真實長主旨與完整欄位**（不是空白或短文字）實際操作：
- `fc_full`：對 NOI/ITR/NCR 各有 view/create/update/approve 權限的帳號。
- `fc_readonly`：對三者都只有 view 權限的帳號。
- 每個模組各有一筆「可編輯」（Open / In Progress）與一筆「鎖定」（NOI Closed / ITR
  Approved / NCR Closed）的既有紀錄，鎖定紀錄連 `fc_full` 也無法編輯（NOI 的 Closed
  本來就無條件唯讀；ITR 的 Approved 本來就無條件隱藏 Save；NCR 的 Closed 則是刻意不給
  `fc_full` 帳號 `ncr:close:all`，讓它跟前兩者一樣示範「有一般更新權限、但缺更高一層
  解鎖權限」的情境）。

## 發現與修正（3 項，皆為最小、純文字/屬性層級的修正）

### 發現 1＋2：ITR 唯讀時標題與關閉按鈕命名不一致

**根因**：`ITR.tsx` 傳給 `ITRModals.tsx` 的 `readOnly` prop 只反映權限
（`readOnly={!hasPermission('itr:update:all')}`），**沒有**把 `isLocked`
（Approved/Void）這個鎖定狀態算進去——跟 NOI／NCR 自己的 `canEdit`/`readOnly` 計算
（本來就把各自的鎖定狀態算進去）不一樣。`ITRModals.tsx` 裡標題原本完全沒有
view/edit 的分支（`itr.viewTitle` 這個 i18n key 甚至從未存在過），Cancel/Close 按鈕的
三元判斷式雖然存在（`readOnly ? close : cancel`），但因為 `readOnly` 本身沒把鎖定狀態
算進去，在 Approved 記錄上永遠走到 `cancel` 分支。

**修正**（`react-app/src/components/ITR/ITRModals.tsx`）：
```tsx
const displayAsReadOnly = readOnly || isLocked;
// 標題：
<h2>{displayAsReadOnly ? t('itr.viewTitle') : existingData || existingItem ? t('itr.editTitle') : t('itr.addTitle')}</h2>
// Cancel/Close：
{displayAsReadOnly ? t('common.close') : t('common.cancel')}
```
只用於**顯示文字**，不改變任何欄位是否可編輯（既有的 `disabled={isLocked}` 逐欄位判斷
維持不變）、不改變 Save 按鈕是否顯示（`!isLocked && !readOnly` 維持不變）、不改變任何
權限或業務規則。新增 `itr.viewTitle` i18n key（en: "View ITR"，zh: "檢視 ITR"），比照
`itr.editTitle`/`noi.viewTitle` 既有命名慣例，沒有改動任何其他既有 key。

### 發現 3：ITR 保存中的按鈕回饋不一致

**根因**：`ITRModals.tsx` 的 Save 按鈕文字固定是 `t('common.save')`，沒有
`saving ? ... : ...` 這種既有於 NOI/NCR 都有的三元判斷；Cancel/Close 按鈕完全沒有
`disabled={saving}`（NOI/NCR 兩者都有）。

**修正**：
```tsx
// Save 按鈕：
{saving ? t('common.saving') || 'Saving...' : t('common.save')}
// Cancel/Close 按鈕新增：
disabled={saving}
```

### 附帶修正：NCR Save 按鈕用錯 i18n key（零視覺差異，但語意錯誤）

`NCRModals.tsx` 的 Save 按鈕保存中文字寫的是 `t('obs.saving')`（OBS 模組的 key，明顯是
複製貼上殘留），不是 `t('common.saving')`。兩個 key 目前中英文**剛好**都是相同字串
（"Saving..." / "儲存中..."），所以沒有造成任何畫面上看得到的差異，但這是語意錯誤、
脆弱的隱性依賴（以後只要有人改了 `obs.saving` 的文字，NCR 的 Save 按鈕會在不相關的人
不知情的情況下跟著跑掉）。已改為 `t('common.saving')`，零風險、零視覺差異的純修正。

## 查核後判斷「不需修正」的項目

### NCR 保存中按鈕狀態一開始看起來不一致——其實是我自己的種子資料缺必填欄位

第一輪實測時，NCR 的 Save 按鈕在保存中**完全沒有被停用**，看起來像是第三個獨立的
AC2 落差。深入查證後發現：NCR 的種子資料一開始缺少 `type`／`severity`／`discipline`／
`referenceStandards`／`foundLocation`／`foundBy`／`raisedBy`／`assignedTo`／`deviation`
這些 `ncrFormSchema.ts` 裡 `reqStr`/`fkUser` 的「開立必填」欄位——點擊 Save 時前端的
client-side 驗證直接攔下，跳出「請補齊必填欄位」的提示，**保存請求根本沒有送出**，
所以不會進入任何「保存中」狀態，Save 按鈕自然也不會被停用。這不是 NCR 的保存狀態
UI 比 NOI/ITR 落後，而是我自己的測資不完整。補齊種子資料後重測，NCR 的保存中狀態
（文字變 "Saving..."、Save 與 Cancel 皆停用）和 NOI 完全一致。**沒有修改任何產品
程式碼**，只修正了 `backend/scripts/verification/seed_forms_consistency_review.py`
這份隔離測試種子腳本本身。

## 查核後確認為既有、刻意保留、不同於彼此的設計（未修改）

- NOI／NCR 在「可編輯」狀態下的 Cancel 按鈕本來就是 "Cancel"，和 ITR 同狀態下的
  "Cancel" 一致——只有「鎖定/唯讀」狀態下才該顯示 "Close"，這點本輪的修正已對齊。
- ITR 的 Revoke Approval 子對話框使用 `danger` 樣式、文案是 "Revoke"
  而非 "Save"／"Cancel"——這是刻意的、不同業務操作不應該被強迫統一外觀，本輪沒有
  碰這部分。
- NOI 的 Closed 狀態無條件唯讀（連有 `noi:approve:all` 的帳號都不能編輯）、ITR 的
  Approved 狀態無條件隱藏 Save（連有 `itr:approve:all` 的帳號都不能直接編輯，要先
  Revoke）、NCR 的 Closed 狀態則是權限門檻式唯讀（有 `ncr:close:all` 才能編輯）——
  三者鎖定機制本來就不同，這是既有、合理的業務差異，本輪沒有強迫三者行為一致，只
  統一了「鎖定時畫面怎麼標示自己是唯讀」這個純顯示層面的一致性。

## 測試發現但判定為「測試本身的問題」、非產品缺陷的項目（如實記錄）

### Part F 執行過程中一度出現的 ITR 保存 400 錯誤

第一輪完整執行時，Part F（深連結進入後保存）對 ITR 的保存出現
`PUT /api/itr/fc-itr-open` 400，訊息為
`"NOI with reference number 'QTS-FCP1-NOI-000001' not found"`。追查發現：我的種子
資料把 NOI 的 `referenceNo` 手動寫成 `"QTS-FCP1-NOI-000001"`（用專案代碼
當前綴），但 `noi_service.py` 的既有邏輯（約行 237-268）會在**每次更新**時核對
目前的 `referenceNo` 字首是否符合「依目前廠商縮寫自動產生」的格式（`QTS-{廠商縮寫}
-NOI-`）；不符合就**重新產生一個新的 referenceNo**。因為我手動指定的格式本來就跟
系統自動產生的格式不一致，Part C 對 NOI 的第一次真實保存就觸發了重新編號，把
`QTS-FCP1-NOI-000001` 換成了 `QTS-FCV-NOI-000001`；而 ITR 種子資料裡的 `noiNumber`
欄位仍指著舊的文字值，導致後續 ITR 保存時找不到對應的 NOI，被後端拒絕。

這**不是**一個 UI 操作一致性問題，也不是本輪授權範圍內的後端業務邏輯問題
（`noi_service.py` 的這個重新編號行為本身合理——避免編號格式跟實際廠商對不上——只是
我的種子資料一開始就用了一個會觸發這個重新編號分支的格式）。正常透過畫面建立的 NOI，
`referenceNo` 一開始就是用同一套 `generate_reference_no()` 產生，不會有這個落差。
已修正種子腳本本身（改用 `"QTS-FCV-NOI-xxxxx"` 格式），修正後 Part F 對三個模組的
深連結保存全部成功（HTTP 200），不是產品程式碼的問題，**未修改任何後端或前端產品
程式碼**來處理這一點。

### 最終一輪仍殘留的 1 項 FAIL：NCR 關閉深連結記錄的「離開目的地」斷言

`noi-itr-nav-review.mjs` 同一支腳本沿用的既有慣例裡，Part F 用單一 `page` 物件連續
對三個模組各做 4 個子步驟（開啟→關閉、開啟→瀏覽器返回、開啟→保存），**沒有在模組
之間重置瀏覽器 history**。因為每個子步驟都是 `page.goto(...)`（真實硬導航，會在
history 疊加新紀錄，不會清空），`navigate(-1)` 回到的是「這個 `page` 物件截至目前
為止，實際發生過的上一筆 history 紀錄」，而不是「使用者語意上認知的、剛才從哪裡
點進來」。NCR 是 Part F 迴圈裡最後一個模組，執行到它的時候，`page` 的 history
已經累積了前面 NOI／ITR 兩個模組共 8 個子步驟的進出紀錄；巧合的是，緊鄰在 NCR 這次
deep-link push 之前的那一筆紀錄，本身就是另一次 `/ncr`（ITR 的 F4 保存落點）——所以
`navigate(-1)` 回到的剛好也是 `/ncr`，讓「關閉後有沒有離開 `/ncr` 自己」這個過於
嚴格的斷言失敗。

這是**測試腳本本身共用瀏覽器分頁、沒有在模組之間重置導航歷史**造成的假象，不是
NCR 既有 `navigate(-1)` 機制本身的問題——NOI-ITR-NAV-2026-002（已 PASS）已經用
乾淨的、每個場景獨立重新導航的方式驗證過這同一條既有機制，結論成立；本輪 Part F
的 F1（深連結開啟正確紀錄）／F2（URL 不殘留 `openId`）皆對 NCR 正確通過，只有這一條
過嚴的「有沒有離開自己」檢查在共用 history 的情境下不準確。基於本輪時間範圍，
**沒有**重寫測試腳本去隔離每個模組的瀏覽器 history（這會是額外的測試基礎工程，
超出「操作查核」本身的時間預算），如實記錄此限制，不隱藏這個 FAIL、也不誤稱為
產品缺陷。

## 隔離環境驗證（依本輪實際執行紀錄）

- 環境：`isolated_stack.py up --port 8200 --vite-port 3200`，沿用既有
  `noi-itr-nav-vite-launcher.mjs`（8200/3200，非使用者 8198/3198）。
- 新建 `backend/scripts/verification/seed_forms_consistency_review.py`：
  `fc_full`／`fc_readonly` 兩個帳號、NOI/ITR/NCR 各一筆可編輯＋一筆鎖定的紀錄，長
  主旨與完整欄位。
- 新建 `react-app/tests-browser/forms-consistency-review.mjs`：Part A（按鈕幾何／
  樣式比對）、Part B（鎖定紀錄命名）、Part C（保存中狀態）、Part D（模擬 500 失敗）、
  Part E（無權限帳號）、Part F（深連結進出）。
- **修正前**（`FORMS-CONSISTENCY-2026-001-evidence/before/`，16 張截圖）：4 項
  FAIL（ITR 標題、ITR 保存中文字、ITR 保存中 Cancel 未停用、後來追查為種子問題的
  ITR 400）。
- **修正後**（`FORMS-CONSISTENCY-2026-001-evidence/after/`，16 張截圖）：僅剩上述
  已說明的 1 項測試腳本假影 FAIL，其餘全數 PASS。

## 前端檢查

- `tsc --noEmit`：通過，0 錯誤。
- `npm run lint`：13 個錯誤、21 個警告（與修改前基線相同；本輪修改的
  `ITRModals.tsx`／`NCRModals.tsx`／`LanguageContext.tsx` 皆不在既有錯誤清單裡，
  目前無證據顯示這些既有錯誤與本輪改動有關，**不推論「絕不可能由本輪造成」**，也
  不歸因給其他協作者）。
- `npm test`（`scripts/run-unit-tests.mjs`）：123/123 全部通過，0 失敗。
- 隔離瀏覽器驗證：腳本共 32 處 `assertTrue` 呼叫；依本輪最終執行紀錄 31 PASS、
  1 FAIL（上述已說明的測試腳本假影）。

## 隔離堆疊拆除

已以 `isolated_stack.py down` 拆除，`lsof` 確認 8200/3200 已釋放；使用者 8198/3198
全程監聽未受影響。暫存密碼檔與 stack JSON 已刪除，未讀出或記錄密碼內容到任何文件。

## 變更檔案

- `react-app/src/components/ITR/ITRModals.tsx`（唯讀顯示判斷、Save/Cancel 按鈕文字
  與狀態，共約 15 行變更）。
- `react-app/src/components/NCR/NCRModals.tsx`（1 行：i18n key 修正）。
- `react-app/src/context/LanguageContext.tsx`（新增 `itr.viewTitle` 一個 key 到
  en／zh 兩區塊）。
- `backend/scripts/verification/seed_forms_consistency_review.py`（新建隔離測試
  種子腳本）。
- `react-app/tests-browser/forms-consistency-review.mjs`（新建隔離瀏覽器驗證腳本）。
- `docs/workflow/QWORKFLOW-LAYOUT-2026-001-archive.md`（封存上一批，待審查原文）。
- `docs/workflow/FORMS-CONSISTENCY-2026-001-handoff.md`（本檔）。
- `docs/workflow/FORMS-CONSISTENCY-2026-001-evidence/`（before/after 各 16 張截圖）。
