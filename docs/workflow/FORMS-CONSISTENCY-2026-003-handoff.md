# FORMS-CONSISTENCY-2026-003 — R1/R2 補正（第二輪）

延續 FORMS-CONSISTENCY-2026-002（REVISE，完整原文見
`docs/workflow/FORMS-CONSISTENCY-2026-002-archive.md`）。本輪只處理 R1/R2，**保留**
已接受的九條返回路徑、保存中狀態、唯讀與樣式比對，未重做。

## 對使用者的改善（本輪新增）

**ITR 保存失敗時，不再把後端的原始錯誤細節直接丟給使用者看。** 之前 ITR 遇到伺服器
錯誤（HTTP 500），畫面會直接顯示後端回傳的原始技術訊息；現在和 NOI／NCR 一樣，顯示
統一的友善文案「Not saved — everything you entered is kept. Server error (HTTP
500). Try again later or contact an administrator.」，輸入內容、按鈕恢復、單一錯誤
提示的既有行為都沒有改變。

## R1 — ITR 保存錯誤映射

**根因**：`ITR.tsx` 的 `handleSaveITRDetails` catch 區塊原本自己手動從
`error.response.data.detail` 取值直接 toast，沒有經過 `describeSaveError` 這個
NOI/NCR 共用的工具。`describeSaveError` 對 5xx **永遠**回傳固定的友善文案（絕不顯示
回應本文，因為 5xx 可能帶著驗證 dump 或堆疊資訊），4xx 則維持顯示後端給的具體 detail
文字（例如權限不足的具體原因）。

**修正**（`react-app/src/components/ITR/ITR.tsx`）：
```tsx
} catch (error: any) {
    toast.error(t('saveFlow.failedKeep', { message: describeSaveError(error, t) }), { duration: 10000 });
    // 既有 re-throw 保留，維持 modal 開啟、輸入不遺失
    throw error;
}
```
`throw error;`、檔案上傳部分失敗的既有獨立 toast（200-211 行附近）完全未動——「保存
成功但部分檔案上傳失敗」的既有部分保存語意不受影響，因為那段邏輯本來就不會進入這個
catch。

**測試修正**（`forms-consistency-review.mjs` Part D）：原本的斷言只判斷「文字非空、
不以 `{` 開頭、不含 Traceback」，這個寬鬆標準連「直接顯示原始 detail」都能通過（因為
我自己模擬的 detail 字串本身也是一句可讀英文，不是 JSON）。改為：
- 精確比對三模組在同一種模擬 500 情境下的 toast 文字**逐字相同**；
- 明確斷言 toast 文字不包含模擬送出的原始 detail 字串（新增了一個獨特的識別片語
  "this exact sentence must NEVER reach the toast" 到模擬 detail 裡，確保萬一真的
  洩漏會被抓到）。

## R2 — 身份證據與文件收尾

**身份核對**：`freshDeepLinkPage` 原本用 `page.getByText(marker, {exact:false})`
搜尋整個頁面文字——如果 modal 疊在列表上方而列表本身還留在 DOM 裡，這個搜尋可能
誤判（列表裡剛好也有同樣文字的那一列）。改為新增 `findFieldWithValue()` 共用輔助
函式：逐一讀取 modal 內每個 `input[type=text]`／`textarea` 的 `inputValue()`，找出
值包含 marker 的那個欄位——只讀表單欄位本身，不搜尋頁面文字。這個輔助函式同時也
取代了 Part E 原本重複的一份類似邏輯（消除重複程式碼）。

**精確目標 PUT**：Part C 與 Part F 的 `page.waitForResponse` 原本只比對
`/api/{module}/`（任何打到這個模組端點的 PUT 都會被誤判為「這次保存的回應」），改為
比對 `/api/{module}/{mod.openId}`，精確鎖定正在編輯的那一筆紀錄。回應 body 若含
`id` 欄位，額外斷言等於 `mod.openId`。

**文件措辭修正**：
- 「新建取消未新增任何資料」：原本只有「畫面關閉」這個證據。本輪在 Part A2 加入
  網路層觀察——監聽該模組建立端點的 POST 請求，斷言整個開啟＋取消過程**送出的
  POST 數量為 0**。這是比「畫面關閉」更直接的證據，但仍然**不是** DB 層級的驗證
  （沒有去查資料庫確認真的沒有新增一筆紀錄）——如實限縮敘述範圍，不聲稱已完成
  DB 層級確認。
- 「新 context 返回路徑測試」：上一輪的措辭已經謹慎（"this is a real product
  regression test, not just a test artifact"這類過度推論字眼本來就沒有用），本輪
  再次確認 handoff 與 STATUS 的用詞限定在「9 條**本輪測試覆蓋到的**路徑在乾淨
  環境下返回正確」，不宣稱「排除所有產品返回問題」——沒有測到的入口（例如從其他
  模組的 Related Documents 進入、或透過 FollowUp 的連結）本輪依然沒有涵蓋，維持
  上一輪已寫明的限制。

## 隔離環境驗證（依本輪實際執行紀錄）

- 環境：`isolated_stack.py up --port 8200 --vite-port 3200`，沿用既有
  `noi-itr-nav-vite-launcher.mjs`。
- 種子：沿用 `seed_forms_consistency_review.py`（本輪未修改）。
- `forms-consistency-review.mjs`：**144 checks executed, 144 PASS, 0 FAIL**（動態
  計數，完整 log 存於 `docs/workflow/FORMS-CONSISTENCY-2026-003-evidence/run.log`）。
  比上一輪 132 項多出 12 項，逐項對應：Part A2 新增的 POST-count 斷言（3 模組×1
  ＝3）、Part C 新增的 PUT 回應 body id 核對（3 模組×1＝3，本輪三模組回應皆含
  `id`）、Part D 新增的「不含原始 detail」斷言（3 模組×1＝3）、Part F 新增的 PUT
  回應 body id 核對（3 模組×1＝3），合計 12 項，與 144-132 的差額完全對應。
- 隔離堆疊已拆除，`lsof` 確認埠號釋放；使用者 8198/3198 全程監聽未受影響。

## 前端檢查

- `tsc --noEmit`：通過，0 錯誤。
- `npm run build`：通過（含 tsc，3.61s，輸出至已 gitignore 的 `react-app/dist/`）。
- `npm run lint`：13 個錯誤、21 個警告，與修改前基線相同；本輪修改的
  `ITR.tsx`／`forms-consistency-review.mjs` 皆不在既有錯誤清單中，目前無證據顯示
  既有錯誤與本輪改動有關，不推論「絕不可能由本輪造成」，也不歸因給其他協作者。
- `npm test`（`scripts/run-unit-tests.mjs`）：123/123 全部通過，0 失敗。

## 變更檔案

- `react-app/src/components/ITR/ITR.tsx`（`handleSaveITRDetails` catch 區塊改用
  `describeSaveError`＋`saveFlow.failedKeep`，新增 1 行 import）。
- `react-app/tests-browser/forms-consistency-review.mjs`（新增
  `findFieldWithValue()` 共用輔助函式；Part D 錯誤文案改精確比對；Part C/F 的 PUT
  等待改精確 record id；Part A2 新增 POST 數量斷言；Part E 改用共用輔助函式去重）。
- `docs/workflow/FORMS-CONSISTENCY-2026-002-archive.md`（封存上一輪 REVISE 原文）。
- `docs/workflow/FORMS-CONSISTENCY-2026-003-handoff.md`（本檔）。
- `docs/workflow/FORMS-CONSISTENCY-2026-003-evidence/`（22 張截圖＋完整
  `run.log`）。

`backend/scripts/verification/seed_forms_consistency_review.py` 本輪未修改。
