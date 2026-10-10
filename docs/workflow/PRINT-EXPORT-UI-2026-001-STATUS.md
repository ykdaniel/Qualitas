# PRINT-EXPORT-UI-2026-001 — STATUS（Claude 執行結果）

TASK_ID: PRINT-EXPORT-UI-2026-001 · ROUND: R1 · 2026-10-10（ITR 部分 2026-10-11 補上）

## RESULT
- [x] DONE（實作與驗證完成；尚待獨立審查）
- [ ] PARTIAL
- [ ] BLOCKED

## 本輪實際修改（僅前端）
| 檔案 | 修改 |
|---|---|
| `components/NOI/modals/NOIDetailModal.tsx` | 新增 `exportingDocx` 狀態與 `handleExportDocx`（try/catch → `toast.error(common.exportFailed)`、finally 復原、匯出中停用按鈕並顯示 `common.exporting`）；列印／Word 按鈕加圖示 |
| `components/NCR/NCRModals.tsx` | 列印、Word 按鈕加圖示（匯出邏輯未動） |
| `components/OSD/OSDModals.tsx`、`OBS/OBSModals.tsx`、`FollowUpIssue/FollowUpIssue.tsx`、`FAT/FAT.tsx`、`MeetingMinutes/MeetingMinutesModals.tsx`、`MaterialSubmittal/ApprovedMaterialModal.tsx` | 列印按鈕加 `Printer` 圖示 |
| `components/PQP/PQPModals.tsx` | 編輯視窗與檢視視窗的列印按鈕加圖示 |
| `components/ITR/ITRModals.tsx` | 2026-10-11：ITR 工作階段已提交（5b2c67e3、4bdc49ec）後才改。新增 `exportingDocx` 與 `handleExportDocx`（同 NOI 寫法）；編輯視窗的列印／Word 按鈕與列印預覽視窗的列印按鈕加圖示（+19／−5） |
| `context/LanguageContext.tsx` | 新增 `common.exporting`、`common.exportFailed`（en／zh 各 2 行）。ITR 的 `itr.*` 4 行已由 ITR 工作階段在 4bdc49ec 提交，本檔現在未提交的只有本輪 4 行 |
| `react-app/tests-browser/print-export-ui-vite-launcher.mjs` | 本輪隔離驗收用 Vite 啟動器（3291 → 8291） |

## 執行證據
- **實測**：`npx tsc --noEmit` exit 0；`npm test` 144 pass／0 fail（修正換行後重跑）。
- **實測**：ESLint 跑了 9 個改動檔，1 error＋4 warnings 都在未改動的行（MeetingMinutes 第 494 行的不規則空白、FollowUp／PQP 未使用的 `styles`、NCR 的 hook 相依），屬既有問題。
- **實測（隔離環境）**：`isolated_stack.py up --port 8291 --vite-port 3291`，種子 `seed_noi_itr_desktop_review.py`，以管理員身分開 QTS-NDR1-NOI-000002：
  - 底部按鈕列顯示「🖨 Print」「📄 Export Word」圖示。
  - 在頁面內把 docx 請求改導到不存在的路徑（404）後點兩次 Export Word：出現紅色 toast「Export failed. Please try again.」，請求只送出 1 次，沒有未處理的例外。
  - 成功下載路徑未點（避免在瀏覽器下載檔案）；呼叫 `exportNoiDocx` 的參數與修改前相同。
  - 環境已用 `down` 拆除（ok, removed）。
- **實測（隔離環境，2026-10-11，同一種子）**：開 QTS-NDR1-ITR-000001：列印／Export Word 有圖示；模擬匯出 404 後連點兩次 → 出現 toast「Export failed. Please try again.」、請求只送 1 次；按 Print 打開列印預覽視窗，Print 按鈕有圖示（未按下，避免開系統列印對話框）。`tsc` exit 0、`npm test` 144／0；ESLint 對 ITRModals.tsx 只有 2 個既有警告（`ncrList`／`obsList` 未使用）。環境已 `down`。
- **讀碼（未實測）**：其他模組的圖示屬同樣的單行 JSX 加法，型別檢查通過；沒有逐一開畫面。
- **旁支發現（非本輪）**：隔離環境中 `GET /api/ncr/` 回 500，原因是種子腳本建的 NCR `status='Opening'`、`rev`／`submit` 為 NULL，不符合 NCR 回應 schema。是測試種子資料的問題，不是產品程式。

## 過程事故（已修復）
用 Python 文字模式改檔時，`NOIDetailModal.tsx` 與 `LanguageContext.tsx` 的 CRLF 被轉成 LF（diff 一度膨脹到數千行）。已確認 HEAD 兩檔皆 100% CRLF，轉回後 diff 只剩實際修改（21 行／8 行），ITR 工作階段的 4 行原樣保留。

## 待辦
- ~~獨立審查~~：R1 Claude 審查 PASS，已於 97bf3723 本地提交（未推送）。部署由協調中心排程。

---

## R2（2026-10-11）：儲存中也停用 Word 匯出
來源：R1 審查的 NON-BLOCKING #1。使用者指示「儲存中也停用 Word 匯出，順便一起修」。修改前已通知協調中心並獲同意；基準是 HEAD ef8fef13（含 ITR 的 db9d2991、fcc83c62）。

### 修改（各 2 處，+2／−2）
- `components/ITR/ITRModals.tsx`（LF）：`handleExportDocx` 的防呆加上 `|| saving`；Word 按鈕改為 `disabled={saving || exportingDocx}`。
- `components/NOI/modals/NOIDetailModal.tsx`（CRLF，以二進位方式修改）：同上。改完 661／661 行仍是 CRLF。
- 寫法和 NCR 的 `disabled={saving || exportingDocx}` 一致。沒有新增翻譯鍵。

### 證據
- **實測**：`npx tsc --noEmit` exit 0；`npm test` 144 pass／0 fail。
- **實測（隔離環境 8291／3291，同一種子，已 `down`）**：在頁面內把非 GET 的 `/itr`、`/noi` 請求延遲 5 秒再送出。
  - ITR QTS-NDR1-ITR-000001：按 Save 之前 Export Word `disabled=false`；按下後 1 秒，Save 顯示「Saving...」，Export Word `disabled=true`（截圖中為灰色）；PUT 200。
  - NOI QTS-NDR1-NOI-000001：結果相同，PUT 200。
  - console 錯誤只有登入前的 401，以及已知的種子 `/api/ncr/` 500。
- 工作樹裡其他未提交的後端／文件修改（CHECKLIST-TEMPLATE-CLEAN、NOI 刪除參照等）屬於其他工作階段，不屬本輪。

---

## R3（2026-10-11）：R2 審查的三個非阻擋項目
來源：R2 REVIEW 的 NON-BLOCKING #1、#2，以及 R1 的 #3。使用者指示「這三點也一起修」。修改前已通知協調中心並獲同意；基準是 HEAD 21f96f38。

### 修改
- `components/ITR/ITRModals.tsx`（LF，+6／−3）：
  1. Word 匯出在撤回（`revoking`）、Raise NCR／Re-inspect（`spawning !== null`）進行中停用。按鈕的 `disabled` 和 handler 的防呆都加上這兩個條件。
  2. `handleExportDocx` 開頭加上 `blockedByUnsavedChecklist('itr.checklistUnsavedAction')`。檢查表有未存修改時擋下匯出並提示，和 Print／Raise NCR／Re-inspect 一致。用的是 ITR 工作階段已提交的函式與翻譯鍵，沒有新增翻譯鍵。
  3. catch 加上 `console.error('ITR Word export failed:', err)`。
- `components/NOI/modals/NOIDetailModal.tsx`（CRLF，以二進位方式修改，+2／−1）：catch 加上 `console.error('NOI Word export failed:', err)`。
- `components/NCR/NCRModals.tsx`（LF，+2／−1）：catch 加上 `console.error('NCR Word export failed:', err)`。
- **logger 說明**：AGENTS.md 要求用 logger utility，但前端目前沒有這個工具（已全 repo 搜尋確認）。這裡沿用 Audit 既有的 `console.error` 寫法（AuditWizard 的 Word 匯出失敗處理），協調中心同意。只記錯誤物件；登入靠 httpOnly cookie，axios 錯誤物件裡沒有 token 或個資。

### 證據
- **實測**：`npx tsc --noEmit` exit 0；`npm test` 144 pass／0 fail；ESLint 對三個檔只有既有警告（ITR 的 `ncrList`／`obsList`、NCR 的 hook 相依），0 error。
- **實測（隔離環境 8291／3291，同一種子，已 `down`）**：在隔離資料庫用 API 建了一張空白範本，連到 QTS-NDR1-ITR-000001（產生 QTS-FHS-CHECKLIST-000001）。
  - 展開檢查表、輸入 Location 讓它有未存修改，再按 Export Word：出現提示「Checklist QTS-FHS-CHECKLIST-000001 has unsaved changes…then try again.」，docx 請求 0 次。
  - 在檢查表按 Cancel → Leave 放棄修改，再按 Export Word（已在頁面內改成必定 404）：送出 1 次請求，console 出現 `ITR Word export failed: AxiosError: Request failed with status code 404`（含堆疊），之後按鈕恢復為 `Export Word`、`disabled=false`。
  - QTS-NDR1-ITR-000002（Reject／Fail）：把非 GET 請求延遲 5 秒後按 Raise NCR，1 秒內 Export Word 呈 `disabled`（同時 Raise NCR 顯示 Saving…、Re-inspect 停用）。
  - **未實測**：撤回（`revoking`）。種子資料沒有已核准的 ITR，只讀過程式碼，用的是同一個 `disabled` 條件。NOI／NCR 的 console.error 也只讀碼，和 ITR 是同一種一行寫法。
  - 旁支：延遲 5 秒後送出的 Raise NCR POST 回 400（後端拒絕建立 NCR；拆除前沒查原因，和匯出無關）。CSRF 測試時的 403、已知種子 `/api/ncr/` 的 500，都不屬本輪。
