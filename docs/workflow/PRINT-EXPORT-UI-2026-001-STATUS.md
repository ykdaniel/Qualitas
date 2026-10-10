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
- 獨立審查。
- 未提交、未推送、未部署。協調中心（「登入測試」工作階段）要求：提交只做本地 commit 並回報 hash；部署前先找協調中心排隊（ITR 尚未部署，本批不可先部署）。
