# ITR-STATUS-2026-002 — ITR 核准遭拒狀態誤判修正（證據補齊）

延續 ITR-STATUS-2026-001，處理獨立審查 REVISE 判定的 R1–R5（完整原文見
`docs/workflow/ITR-STATUS-2026-001-archive.md`）。**產品修正本身（`ITRModals.tsx` 的
`handleFieldChange` 改用 `persistedStatus`）本輪未重開、未重寫**——審查已明確接受這個修正
方向，本輪只補齊驗收證據的有效性。

## R1 — 移除恆真斷言，改為精確判斷（已完成）

`itr-status-revert-review.mjs` 原本有兩個不會失敗的斷言：

- A1 的 `count() >= 0`（計數恆為非負數，不論 modal 開或關都成立）。
- A3 的 `count() === 0 || true`（`|| true` 讓整個條件恆真，不論成功或失敗都成立）。

本輪改為：新增 `modalOpenFor()` 輔助函式，用「Remark 欄位是否存在且可見」作為精確判斷依據
（Remark 欄位只存在於這個編輯 modal 內部，不會出現在背後的列表頁）——A1 之後斷言 modal **仍**
開啟（`modalOpenFor()` 為真），A3 成功保存之後斷言 modal **已**關閉（`modalOpenFor()` 為假）。
這兩個方向現在都是會真的失敗的條件（例如若 Remark 欄位因為某個迴歸意外消失或意外殘留，斷言
會如實失敗，不像原本的恆真寫法完全不會反映任何真實狀態）。

情境 B（新建模式取消）原本用 `!(body.some(r => r.description === ''))` 間接推論「沒有新增
孤兒紀錄」——改為兩項直接證據：(a) 用 `page.route` 攔截整個情境 B 期間的 `POST /api/itr/`
請求並計數，取消後斷言恰好 0 筆；(b) 取消前後分別對 `/api/itr/` 做 raw GET，取出完整 id
集合，斷言兩次集合完全一致（大小相同且每個 id 都存在於另一邊）。

## R2 — Remark 在第一次核准失敗「之前」填入（已完成）

原本的腳本在核准已經遭拒之後才填 Remark，只能證明「之後改狀態不會清掉 Remark」，不能證明
「保存失敗時保留所有既有輸入」這個更完整的宣稱。

本輪調整順序：在情境 A 一開始，設定 Inspection Result=Pass、Status=Approved **之前**先填好
Remark（`ITR-STATUS-2026-002 verification remark (typed before the rejected save)`）。接著
核對：

1. 第一次核准遭拒**之後**，Remark 欄位內容仍在（畫面）；raw GET 確認後端**沒有**把 Remark
   寫入（因為整個保存被 400 拒絕，是單一失敗交易，不會部分寫入）——明確區分「畫面上保留的
   輸入」與「後端實際持久化的值」這兩件不同的事，不混為一談。
2. 把 Status 改回 In Progress **之後**，Remark 欄位內容仍在（畫面）。
3. 最終成功保存後，以 PUT response body **與**同一個 id（`isr-itr-1`）的 raw GET 重讀，
   雙重確認 Remark 真的被持久化，且是最初（失敗前）填入的那個值，不是中途重新輸入的。

第一次核准遭拒的這次保存，額外核對**實際 HTTP 回應**：`lastPutResponse.status === 400`、
`response.body.detail` 文字與 toast 顯示的文字一致——不再只核對畫面上的 toast 文字。

## R3 — 成功核准後重新開啟，核對鎖定與撤回入口（已完成）

情境 D（已有 Pass Checklist 的 In Progress ITR）核准成功、modal 關閉後，本輪新增 **D2**：
重新開啟同一筆（`QTS-ISRP1-ITR-000002`），核對：

- Status／Inspection Result 下拉皆為停用狀態——證明 `isLocked` 在「剛剛才真正從 In Progress
  保存成功為 Approved」這個全新的基準上正確生效，不是只在「一開始就被種成 Approved」的紀錄
  （情境 C）上才生效。
- 畫面出現「Revoke Approval」操作入口（`t('itr.revokeApproval')`，英文文案 "Revoke
  Approval"）。

情境 C（直接種入已是 Approved 狀態的既有紀錄）保留原樣，兩者並存、互不替代——C 證明「一開始
就是 Approved 的紀錄」仍受保護，D2 證明「剛剛才變成 Approved 的紀錄」也受保護，這是兩個不同
起點各自需要的證據。未修改任何產品程式碼來製造「同視窗繼續保存」機制；核准成功後 modal 關閉、
需要重新打開這個既有設計維持不變。

## R4 — 核准權限回歸（已完成，方案 a：既有測試回歸）

讀 `backend/tests/` 找到既有、專門針對 ITR 核准權限的測試檔
`test_itr_approval_authority_http.py`，其中：

- `test_plain_editor_cannot_update_itr_into_approved`：具 `itr:update:all` 但不具
  `itr:approve:all` 的帳號，嘗試把一筆已滿足核准條件（有 Pass Checklist）的 ITR 更新為
  Approved，斷言被拒絕（403）。
- `test_nobody_can_revert_approved_via_normal_update`：已核准的 ITR，透過一般 update 路徑
  嘗試改回其他狀態，無論有沒有核准權限都被拒絕（必須走 Revoke Approval）。
- 另外 6 項涵蓋核准者可核准、Approved 鎖定的 detail_data、Checklist 解除連結/刪除等相關
  保護。

本輪**未修改**此測試檔，直接執行確認修正前後行為一致：

```
python3 -m pytest tests/test_itr_approval_authority_http.py -v
```

**8 passed**（實際執行紀錄，非讀碼推論）。這條路徑完全沒有經過 `ITRModals.tsx`（它測試的是
後端 router/service 層），本批的前端修正不可能影響它；執行只是用來滿足「有實際執行紀錄」這個
要求，而不是因為有理由懷疑它會壞。

## R5 — STATUS／handoff 更新（已完成）

本檔與 `STATUS.md` 精確列出本輪有效斷言數（瀏覽器 **42 項**、後端既有測試 **8 項**，兩者
分開列示，不合併成單一數字），以及每項證據的來源（實機隔離環境執行 vs 既有測試回歸執行，
皆為實際執行紀錄，不含任何讀碼推論當作驗收證據）。

前一輪（001）的 8 張截圖因腳本已經改寫（Remark 填入時機、modal 開關判斷方式、取消案例的
攔截方式都變了，對應的畫面狀態也不同）不再適用於本輪斷言內容，如實保留在
`docs/workflow/ITR-STATUS-2026-001-evidence/`（原封存證據，不刪除、不覆蓋），本輪在新建的
`docs/workflow/ITR-STATUS-2026-002-evidence/` 重新產生 9 張對應目前腳本的截圖。

## 測試結果（本輪實際執行）

- `node tests-browser/itr-status-revert-review.mjs` → **42/42 通過**（自建隔離堆疊，
  backend/vite 8200/3200，完成後已拆除並以 `lsof` 確認埠號釋放）。
- `python3 -m pytest tests/test_itr_approval_authority_http.py -v` → **8 passed**（既有
  測試，本輪未修改，僅執行回歸）。
- `node --check tests-browser/itr-status-revert-review.mjs` → 通過。
- 本輪**未修改任何產品程式碼**（`react-app/src/**`、`backend/**` 皆未變更），依 TASK.md
  第 6 條驗收標準明確略過 `npm test`/`npm run build` 重跑。

## 未測限制（沿用自 001，未變更）

- Checklist 填寫/標記 Pass 的 UI 流程本身未被重新走過；情境 D 的 Checklist 是直接種入已是
  Pass 狀態的 instance，只驗證「核准成功路徑」未被破壞，不是重新驗證 Checklist 填寫/判定
  邏輯本身。
- 問題 2（Q-Workflow 缺少可直接辨識的目前步驟文字）僅記入 `BACKLOG.md` #52，依交辦不處理。

## 隔離與可重跑資產

- `react-app/tests-browser/itr-status-revert-review.mjs`（本輪重寫，R1/R2/R3）。
- `backend/scripts/verification/seed_itr_status_revert_review.py`（本輪未修改，沿用
  001 版本）。
- `backend/tests/test_itr_approval_authority_http.py`（既有，本輪未修改，僅執行）。
- `docs/workflow/ITR-STATUS-2026-002-evidence/`（9 張截圖，本輪新增）。

## 埠號釋放

隔離堆疊（backend/vite 8200/3200，root 為 `qualitas-manual-lrfu9hn_`）已於完成後以
`isolated_stack.py down` 拆除，並以 `lsof` 確認埠號釋放；使用者 8198（backend）/3198
（vite）全程監聽未受影響。

## 結案（獨立審查 PASS，2026-10-03）

ITR-STATUS-2026-002 經獨立審查判定 **PASS**，見 `REVIEW.md`（TASK_ID:
ITR-STATUS-2026-002）。**不再開 ITR-STATUS-2026-003**。

審查明確區分兩類證據，不合併成單一數字，也未重新執行：

- **瀏覽器實機驗證**：`itr-status-revert-review.mjs` 在本輪自建隔離環境中實際執行，
  **42/42 通過**（見上方「測試結果」一節）。
- **後端既有測試回歸**：`test_itr_approval_authority_http.py`（既有、未修改）本輪實際執行，
  **8 passed**。審查本身指出該檔直接呼叫路由/服務函式（非真正發出網路請求），雖檔名含
  `_http`，不應稱為「8 次真實 HTTP 驗證」——這點已在本檔與下方如實記錄，不誇大其驗證方式。

審查本次執行了 `node --check` 並核對腳本斷言數、證據檔數與本檔/`STATUS.md` 內容是否一致，
但**未**重新執行瀏覽器或後端測試，也未逐張視覺驗收截圖；上述 42 項與 8 項的執行結果，是審查
引用 Claude 本輪的執行紀錄，不是審查者獨立重跑產生的。

PASS 判定的範圍與限制（審查原文已明確指出，一併保留）：

- 此結論限於 ITR-STATUS-2026-002 的補正範圍，不代表全系統或所有瀏覽器邊界皆已驗證。
- `BACKLOG.md` #52（Q-Workflow 缺少可直接辨識的目前步驟文字）維持待辦，不隨本輪結案而處理，
  也不視為新增業務政策。
- 產品修正方向（`persistedStatus` 作為轉換基準、新建模式略過既有紀錄轉換檢查）維持不變；
  後端核准授權與已核准鎖定規則未被放寬。

本次文件結案僅同步 `BACKLOG.md` #51 的對應條目與本檔的結案狀態，保留歷次 REVISE、證據來源
與未測限制，未新增測試、未重跑任何測試、未修改任何產品程式碼、未 commit/push/部署。
