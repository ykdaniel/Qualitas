# PRINT-EXPORT-UI-2026-001 — REVIEW（獨立審查）

TASK_ID: PRINT-EXPORT-UI-2026-001 · ROUND: R1 · 2026-10-11
審查者：**獨立 Claude 審查代理**（GPT 額度用完，使用者指示改用 Claude 審查）。代理不是本輪的實作者，只有唯讀權限，自己重跑了檢查。

## VERDICT
**PASS**

## EVIDENCE_CHECK
- 代理重跑的結果：`npx tsc --noEmit` exit 0；`npm test` 144 pass／0 fail。
- ESLint 跑了 11 個改動檔，1 error＋6 warnings，全在本輪沒改的行：MeetingMinutes:494、FollowUp／PQP 未使用的 `styles`、ITR:117-118、NCR:329/360。這和 STATUS 記錄的一致。
- 換行：`NOIDetailModal.tsx`（661 行）、`LanguageContext.tsx`（2990 行）都還是 100% CRLF，和 HEAD 相同。其他 9 個檔原本是 LF，現在仍是 LF。diff 行數：NOI +18／−3，LanguageContext +4／−0，ITR +19／−5。
- i18n：兩個新 key 在 en 和 zh 都有，沒有重複的 key。
- 隔離環境的瀏覽器實測代理無法重現，只確認了程式碼的行為說得通。

## SCOPE_CHECK
- 改動符合 TASK：只有 NOI／ITR 的 `handleExportDocx` 動到邏輯，其餘都是 lucide 圖示，另有 4 行 i18n 和隔離驗收用的啟動器（3291→8291）。
- `AuditWizard.tsx` 雖然有未提交的修改，但那是 AUDIT-PRINT-2026-001 工作階段的，本輪沒動。

## FINDINGS
沒有 high 或 medium 等級的問題。
- Rules of Hooks：兩個新 `useState` 都在提前 return 之前。NOI 在第 263 行；ITR 在第 277 行，早於約第 688 行的 `if (showPrintPreview)`。
- 兩個 handler 跟 NCR 的 `handleExportDocxClick` 寫法相同：用 `!existingItem?.id || exportingDocx` 防連點，`finally` 一定會恢復按鈕狀態，失敗顯示 `common.exportFailed`。
- `exportItrDocx`／`exportNoiDocx`（api.ts:578/590）遇到非 2xx 回應會 reject，所以 catch 會被執行到。interceptor 不會另外跳提示，所以錯誤訊息不會出現兩次。
- 圖示 import 沒有重複或名稱衝突，size 16 和 ITP／Checklist 一致。

## NON-BLOCKING NOTES（都不是本輪造成的，留待之後決定）
1. NOI／ITR 的 Word 按鈕在儲存中仍可按（NCR 會用 `saving || exportingDocx` 停用）。儲存途中匯出，可能拿到舊資料。
2. ITR 的檢查表有未存修改（`panelDirty`）時仍可匯出，Word 用的是伺服器上已儲存的資料。
3. catch 只跳提示，沒有用 `logger` 記錄錯誤（NCR 也一樣）。
4. 匯出成功下載的流程、其他 8 個模組的圖示畫面，都只讀過程式碼，沒實際打開看（STATUS 已如實標示）。
5. NOI 和 NCR 用的 exportWord 翻譯 key 不同，NCR 匯出中顯示「儲存中」：屬 TASK 明確不做的 #2／#3。

## 結論
PASS。可以照協調中心規則做本地 commit 並回報 hash；部署要排在 ITR 之後，部署前先找協調中心和使用者確認。

---

# R2 REVIEW（2026-10-11）：儲存中也停用 Word 匯出
審查者：**獨立 Claude 審查代理**（唯讀，非實作者）。

## VERDICT
**PASS**

## EVIDENCE_CHECK
- diff 只有兩個檔案，各 +2／−2：`handleExportDocx` 的防呆加上 `|| saving`，以及 `disabled={saving || exportingDocx}`。沒有其他改動。
- 換行：NOIDetailModal.tsx 661／661 行都是 CRLF，和 HEAD 相同；ITRModals.tsx 是 LF，也和 HEAD 相同。
- 代理自己重跑 `npx tsc --noEmit`，exit 0。`npm test` 和瀏覽器實測沒有重跑，以 STATUS R2 的紀錄為準。

## FINDINGS
沒有 high 或 medium 等級的問題。
- 宣告順序：ITR 的 `saving` 在第 386 行宣告，handler 在第 681 行，都在提前 return（第 693 行）之前。NOI 的 `saving` 在第 251 行，handler 在第 265 行。沒有 TDZ 問題。
- `saving` 的範圍：ITR 是 handleSave＋doPublish，NOI 是 handleSave＋retryFiles。每個 `setSaving(true)` 都有 `finally { setSaving(false) }`，按鈕不會卡在停用狀態。ITR 發行時也禁止匯出，這是合理的。
- 和 NCR 的按鈕寫法一致（NCRModals.tsx:1310）。handler 防呆比 NCR 多擋 `saving`，比 NCR 更嚴，沒有壞處。

## NON-BLOCKING NOTES
1. ITR 在 Revoke（`revoking`）、Raise NCR／Re-inspect（`spawning`）進行中，Word 仍然可以按。這不在範圍內，NCR 也沒有這種防護。
2. R1 的 #2（ITR 有 `panelDirty` 時仍可匯出）和 #3（catch 沒有用 logger 記錄）仍然沒處理。

---

# R3 REVIEW（2026-10-11）：撤回／產生中停用匯出、未存檢查表擋下匯出、匯出失敗記錄錯誤
審查者：**獨立 Claude 審查代理**（唯讀，非實作者）。

## VERDICT
**PASS**

## EVIDENCE_CHECK
- diff 只動三個檔：ITR +6／−3、NOI +2／−1、NCR +2／−1，和 STATUS R3 一致。
- 換行：NOIDetailModal.tsx 662 行全是 CRLF（HEAD 661 行，加 1 行），新增的行以 `\r\n` 結尾；ITR、NCR 仍是 LF。
- 代理重跑：`tsc` exit 0；三個檔的 ESLint 0 error，4 個 warning 都是既有的。`npm test` 與瀏覽器實測以 STATUS 為準。

## FINDINGS
沒有 high 或 medium 等級的問題。
- `spawning`（:377）、`revoking`（:385）都宣告在 handler（:681）和提前 return（:696）之前。`setSpawning` 在 Raise NCR／Re-inspect 都由 `finally` 設回 null（:635、:665）。`setRevoking` 不論成功或失敗都會設回 false（:601、:609）。按鈕不會卡在停用狀態。
- `blockedByUnsavedChecklist`（:527）：檢查表乾淨時回傳 false；有未存修改時只跳 warning 再回傳 true，沒有其他副作用。翻譯鍵 `itr.checklistUnsavedAction` 在 HEAD 已有中英文（:388、:1923）。檢查順序是先做不出聲的忙碌防呆、再跳提示，所以忙碌時連點不會重複跳提示。
- console.error：`src` 裡沒有 logger 工具。`.eslintrc.json:15` 的 `no-console` 規則允許 warn 和 error，寫法和 AuditWizard.tsx:491 一致。repo 裡沒有 `Authorization` 標頭；三個匯出都是 GET，不會帶 CSRF header，所以錯誤物件裡沒有 token。
- NCR 只多了錯誤記錄，行為沒變。

## NON-BLOCKING NOTES
1. 撤回期間停用匯出只讀過程式碼、沒實測。撤回對話框本來就蓋在畫面上，實際影響很小。
2. repo 已有 44 處 `console.error`，但 AGENTS.md 要求的 logger 工具不存在。建議另開任務：補一個 logger，或修訂 AGENTS.md。
