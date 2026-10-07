# NOI-CONTACT-AUTOFILL-2026-002 — R1-R3 補正 handoff

承接 `docs/workflow/NOI-CONTACT-AUTOFILL-2026-001-archive.md` 的 REVISE，只處理
REVIEW.md 的 R1-R3，核心實作（逐欄位 system/user 來源追蹤、新建同步帶入、system
欄位換廠商覆蓋、保留提示、清除廠商不連動清空）保留不重寫。

## R1 — 修正空白欄位的誤導來源提示

`NOIDetailModal.tsx` 三處來源提示的顯示條件，從只檢查
`contactSource[field] === 'system'` 改為 `contactSource[field] === 'system' && formData[field]`
（即 system 狀態**且**欄位目前有值才顯示）。影響範圍：

```diff
- {contactSource.contacts === 'system' && (
+ {contactSource.contacts === 'system' && formData.contacts && (
```
（`phone`／`email` 同樣修改。）

驗證：見下方證據索引 g4-g6（新建表單在廠商清單尚未到達、三欄位皆空時，完全不
顯示提示）與 c4（換到一家 Phone 欄位本身是空的廠商後，Phone 清空且不顯示提示）。

## R2 — 補足可複查的驗證證據，修正非同步說明

### 證據來源：全新 Playwright 腳本，而非上一輪的手動瀏覽器操作

上一輪用 Browser pane 互動操作驗證，沒有留下任何可被審查者獨立重跑或核對的檔案
——這正是 REVIEW.md 指出的問題。本輪改用
`react-app/tests-browser/noi-contact-autofill-review.mjs`：
- 沿用既有 `forms-leave-guard-review-isolation-guard.mjs` 的 `verifyIsolatedTarget`，
  防止誤連使用者環境（8198/3198）或殘留/偽造的 stack 狀態。
- 通過/失敗數為執行期動態累計（`totalChecks`/`failures`），不是原始碼
  `assertTrue(` 呼叫點的靜態計數。
- 可重複執行：`node tests-browser/noi-contact-autofill-review.mjs <stack.json路徑>`，
  需設定 `NOI_CONTACT_AUTOFILL_PASSWORD` 環境變數。

### 執行結果

**37 checks executed, 37 PASS, 0 FAIL**。完整 log：
[`NOI-CONTACT-AUTOFILL-2026-002-evidence/run.log`](./NOI-CONTACT-AUTOFILL-2026-002-evidence/run.log)。

### 情境與證據檔案對照（TASK.md SCOPE 第 3 點 a-g）

| 情境 | 說明 | 截圖 |
|---|---|---|
| a | 新建 NOI，預選廠商同步帶入三欄位，只有實際有值的欄位顯示提示 | [a-new-noi-prefill.png](./NOI-CONTACT-AUTOFILL-2026-002-evidence/a-new-noi-prefill.png) |
| b | 新建後**手動清空**一個已帶入的欄位再換廠商：該欄位保持空白、不被覆蓋、不顯示提示（R2 明確要求的新情境，既有紀錄空白案例不能代替） | [b1-blanked-before-switch.png](./NOI-CONTACT-AUTOFILL-2026-002-evidence/b1-blanked-before-switch.png) / [b2-blanked-after-switch.png](./NOI-CONTACT-AUTOFILL-2026-002-evidence/b2-blanked-after-switch.png) |
| c | 換到一家 **Phone 欄位本身是空的**廠商：原本有值的 system 欄位確實被清空成空字串（R2 明確要求的新情境） | [c-switched-to-blank-contractor.png](./NOI-CONTACT-AUTOFILL-2026-002-evidence/c-switched-to-blank-contractor.png) |
| d | 清除廠商選擇：值與狀態不變，提示改為「先前廠商的資料」 | [d-contractor-cleared.png](./NOI-CONTACT-AUTOFILL-2026-002-evidence/d-contractor-cleared.png) |
| e | 開啟既有紀錄（`contacts` 原本空白），換廠商後仍維持空白 | [e-existing-record-blank-field.png](./NOI-CONTACT-AUTOFILL-2026-002-evidence/e-existing-record-blank-field.png) |
| f | 保存後，用**全新的 browser context**（重新登入）開啟**同一筆 `id`**，獨立讀出三個欄位，核對與保存前一致 | [f1-before-save.png](./NOI-CONTACT-AUTOFILL-2026-002-evidence/f1-before-save.png) / [f2-reread-after-save.png](./NOI-CONTACT-AUTOFILL-2026-002-evidence/f2-reread-after-save.png) |
| g | 延遲 `/api/contractors/` 回應後開啟「新建 NOI」：空欄位不顯示任何來源提示；之後讓回應抵達，已手動輸入的欄位不被覆蓋，廠商也不會事後自動選上 | [g1-modal-open-during-delay.png](./NOI-CONTACT-AUTOFILL-2026-002-evidence/g1-modal-open-during-delay.png) / [g2-after-late-list-arrival.png](./NOI-CONTACT-AUTOFILL-2026-002-evidence/g2-after-late-list-arrival.png) |

g 情境用 Playwright 的 `page.route('**/api/contractors/**', ...)` 實際攔截並延遲
該請求的回應，不是用程式碼邏輯推論代替操作；UI 本身沒有阻擋「清單載入前開啟
新建表單」這個流程（`g1` 證明 Add New NOI 按鈕在清單仍在載入時仍可點擊）。

### 「沒有非同步晚到情境」說法的更正

上一輪 STATUS/TASK 寫「`getActiveContractors()` 是同步呼叫，沒有非同步晚到情境」
——這句不精確。如實描述如下：

- `getActiveContractors()` 本身確實是同步的 store getter。
- 但 `fetchContractors()`（把資料放進 store 的動作）是**非同步**的；
  `AppProviders.tsx` 會先渲染 `children`、再觸發這個非同步載入
  （見 `preload()` 內 `await Promise.allSettled([useContractorsStore.getState().fetchContractors(), ...])`，
  這段本身就是在 `children` 已經掛載之後才執行）。
- `NOIDetailModal` 的 `getInitialData()`／`getInitialContactSource()` 只在
  `useState` 的初始化當下執行**一次**（React 的 lazy initializer 語意），不會
  因為廠商清單晚到而重新執行。
- 實際行為（g 情境已實測確認）：若使用者在清單載入完成前就打開「新建 NOI」，
  三個聯絡欄位與廠商下拉會先維持空白；清單之後抵達時，**不會**回頭自動選取
  廠商或帶入聯絡資訊；若使用者在這段空窗期已經手動輸入了什麼，之後也不會被
  覆蓋。
- 這是**現狀的既有限制**，本輪只负责如實驗證並記錄，**沒有新增任何「晚到資料
  自動回填／追上」的機制**（這套「來源比對＋最新狀態確認」機制本身仍是
  ITP-AUTOFILL-INTERACTION-2026-002 設計文件裡尚未定案、超出範圍的項目）。

### STATUS 的證據分級

見 `STATUS.md` 的「驗證證據分級」一節：明確區分本輪重新執行並留存證據的項目、
沿用上一輪執行者回報但本輪未重跑的項目、與尚未測試的項目。lint／tsc／build／
單元測試皆為本輪重新執行的結果，不沿用上一輪數字（即使數字相同也是重新測出來
的，不是抄舊的）。

## R3 — 種子腳本真正執行隔離檢查

`seed_noi_contact_autofill.py` 原本只檢查 `QUALITAS_REQUIRE_ISOLATED_DB == "1"`
這個字串，沒有呼叫任何會真的去驗證 `DATABASE_URL`/`LOG_DIR`/上傳目錄的函式。
修正為：在 `import database`（會建立 DB 連線物件）之前，先呼叫既有
`core.startup_guard.guard_if_required()`（沿用 `seed_active_assignee_review.py`
等既有腳本的既有順序：先 import guard、assert 字串、呼叫 guard，之後才
`import database`）。

### 實測證明（不是只讀程式碼就假設會擋）

**錯誤設定會被擋下**：

```
$ QUALITAS_REQUIRE_ISOLATED_DB=1 QUALITAS_RUN_ROOT=/tmp/some-fake-root \
  DATABASE_URL="sqlite:///./qualitas.db" NOI_CONTACT_AUTOFILL_PASSWORD=Test12345! \
  PYTHONPATH=. python3 scripts/verification/seed_noi_contact_autofill.py
...
core.startup_guard.UnsafeDatabaseError: DATABASE_URL 'sqlite:///./qualitas.db' is a
relative path: it would resolve inside the working directory (the project), not in a
throwaway directory.
```

**正確的隔離設定會通過**（直接呼叫 `guard_if_required()` 的最小重現）：

```
$ python3 -c "
import tempfile, os
root = tempfile.mkdtemp(prefix='qualitas-test-')
os.environ['QUALITAS_REQUIRE_ISOLATED_DB'] = '1'
os.environ['QUALITAS_TEST_DB_ROOT'] = root
os.environ['DATABASE_URL'] = f'sqlite:///{root}/stack.db'
os.environ['LOG_DIR'] = root
os.environ['QUALITAS_UPLOAD_ROOT'] = root + '/uploads'
import sys; sys.path.insert(0, '.')
from core.startup_guard import guard_if_required
guard_if_required()
print('GUARD PASSED for safe path:', root)
"
GUARD PASSED for safe path: /tmp/claude-501/qualitas-test-48ypwwi0
```

**本輪 R2 的隔離環境本身也是透過這個修正後的腳本成功 seed 的**（見
`run.log`／本文件的 37 項通過結果），等於在真實的 `isolated_stack.py seed`
流程下也驗證過一次，不只是獨立小範例。

## 未新增/未修改（刻意保留，避免與 R1-R3 以外的範圍混淆）

- `react-app/src/context/LanguageContext.tsx`、
  `react-app/src/components/Shared/FormShell.module.css`：上一輪已接受的新增
  （3 個 i18n key、`.fieldHint` 樣式），本輪**未修改**。
- `NOIDetailModal.tsx` 裡 `getInitialData`、`getInitialContactSource`、
  Contractor `onChange` 的欄位覆蓋/保留邏輯、`handleFieldChange` 的來源標記
  邏輯：已審查接受，本輪**未重寫**，只動了三處提示的顯示條件。
- 「主檔資料晚到＋最新狀態確認」機制：本輪只驗證並記錄現狀行為，**未實作**
  任何新機制。
