# AUDIT-POLISH-2026-001 — STATUS（R2，待獨立審查）

TASK_ID: AUDIT-POLISH-2026-001
ROUND: R2。R1 獨立審查結果為 REVISE（1 項必修）。R1 的 TASK、STATUS、REVIEW 原樣封存為 `AUDIT-POLISH-2026-001-R1-REVISE-*-archive.md`，R1 的差異改名為 `evidence/D-R1.patch`。
基準是 HEAD `6be70c12`。本輪差異見 `evidence/D.patch`（R2，SHA-256 `a24e9616…3d31`），部署候選樹 = HEAD + D.patch，已確認與工作樹的相關檔案逐一相同。另一個工作階段的材料改動沒有包含在內。
**未提交、推送或部署。不自填 PASS。**

## RESULT
- [x] DONE（交 R2 獨立審查）

## R2 補正（只處理 R1 REVIEW 的 REQUIRED_FIXES 第 1 項）
- **問題**：R1 把 `onKeyPress` 改成 `onKeyDown`，只檢查 `isComposing`。Safari 用 Enter 確認中文輸入法選字時，會先觸發 compositionend，再送出一個 `isComposing=false`、`keyCode=229` 的 keydown，所以 R1 的防護擋不住，相對 HEAD 是退步。
- **修正**：新增 `isPlainEnter(e)`，條件是 `e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229`。精靈的四個 Enter 處理都改用它：新增項目的 task 欄、編輯項目的 clause 欄與 task 欄、第 5 步的搜尋框。完整差異見 `evidence/r1-to-r2-AuditWizard.diff`，只有 `AuditWizard.tsx` 這幾行。
- **驗證**（`evidence/r2-browser-checks.txt`）：
  - 新腳本 `react-app/tests-browser/audit-ime-enter-check.mjs` 在 Chromium 中模擬事件（這裡沒有 Safari，Safari 的事件順序以 `keyCode 229` 加 `isComposing false` 重現）。結果：Safari 的選字 Enter 不會新增項目、文字保留；Chrome 的選字 Enter 不會新增項目；一般 Enter 會新增項目並清空欄位。三項都 PASS。**沒有在真的 Safari 加輸入法上實測。**
  - 回歸：`audit-polish-check.mjs` 9 項全部 PASS；列印仍是第 4 步 9 頁、第 5 步 13 頁。
  - `r2-frontend-checks.txt`：`tsc` exit 0、單元測試 144/144、eslint 0 個問題。
- 後端沒有變動。Python 3.11 完整測試在 R1 候選樹上跑完：**2379 passed、16 skipped，exit 0**（`evidence/py311-full-suite.txt`，2026-10-09T16:10:49Z 結束）。R2 只改了 `AuditWizard.tsx`；後端測試會讀取的前端檔只有 `LanguageContext.tsx`，R2 沒有改它。R2 審查也確認這個推論成立。

## 修改檔案
| 檔案 | 內容 |
|---|---|
| `react-app/src/components/Audit/Audit.tsx` | `SCHEDULE_VENDOR_LIMIT`／`SETTLED_STATUSES` 移到模組層級（原本的 eslint 警告因此消失），並加入 Void；`parseLocalDate`；`pastUnfinishedVendors` 改為對所有承包商計算；星期依語系顯示；deep link 與 `closeWizard`（透過連結打開的紀錄，關閉時 `navigate(-1)`）；傳入 `canUpdate`、`locale`；移除未使用的 `auditId`；精靈開著時列印隱藏背後的頁面內容。 |
| `react-app/src/components/Audit/AuditWizard.tsx` | `canUpdate` 參數；`openedId` 固定紀錄 id；`createdWithoutUpdate` 唯讀加提示；`localToday`；搜尋不分大小寫；日期提示改用翻譯鍵，並移出 state updater；寫死的中文提示改用翻譯鍵；存檔錯誤顯示原因；移除成功畫面與 `isSubmitted`；狀態不再有空值後備值；`pickerContractors` 保留已停用的承包商；`onKeyDown` 加 `isComposing` 防護；列印 class；Findings 與備註的純文字列印區塊。 |
| `react-app/src/components/Audit/ScheduleMatrix.tsx` | `locale`；空狀態改為「沒有承包商列」時顯示，文字翻譯。 |
| `react-app/src/components/Audit/VendorStatsPanel.tsx` | 副標題改用翻譯鍵。 |
| `react-app/src/store/auditStore.ts` | 新增、更新失敗不再設定頁面的 `error`（刪除失敗仍會設定，因為頁面橫幅是刪除錯誤唯一的顯示位置）。 |
| `react-app/src/context/LanguageContext.tsx` | 新增 11 個翻譯鍵（中英各一份）。 |
| `react-app/src/components/FollowUpIssue/columns.tsx` | `AUDIT` → `/audit?openId=<auditNo>`。 |
| `backend/services/audit_service.py` | #13：綁定承包商的帳號建立 Audit 時，承包商名稱改用自己承包商的名稱，編號依此產生。 |
| `backend/core/strict_dates.py` | 只改說明文字。 |
| `backend/tests/test_audit_contractor_options_http.py` | 弱斷言改成直接檢查角色權限；新增 #13 測試。 |
| `backend/tests/test_audit_hardening_http.py` | `after_rollback` listener 在 finally 移除。 |
| 新增 `backend/scripts/verification/seed_audit_polish_review.py`、`react-app/tests-browser/audit-print-check.mjs`、`audit-polish-check.mjs` | 隔離環境的種子資料與兩個瀏覽器檢查腳本。 |

CRLF 檔案（AuditWizard.tsx、auditStore.ts、LanguageContext.tsx、FollowUpIssue/columns.tsx、audit_service.py）維持 CRLF。

## 證據（`AUDIT-POLISH-2026-001-evidence/`）
- **列印**（`print-check.txt`；`print-before/`、`print-after/` 有 PDF 與頁面圖）：60 個查檢項目、長篇 Findings，以列印模式輸出 A4。

  | 步驟 | 修正前 | 修正後 |
  |---|---|---|
  | 第 4 步（查檢表） | 1 頁，只有 5／60 個項目，背後清單文字也在 PDF 裡 | 9 頁，60／60 個項目，沒有背後清單 |
  | 第 5 步（報告） | 1 頁，4／60 個項目，Findings 0／30 句 | 13 頁，60／60 個項目，Findings 30／30 句，60 格備註完整 |
  | 第 3 步（計畫） | 內容本來就只有 1 頁 | 不再含背後清單 |

- **瀏覽器檢查**（`browser-polish-check.txt`，9 項全部 PASS，`audit-polish-check.mjs`）：
  - 只有 Void 過期紀錄的承包商不再被標成過期未完成，有過期 Draft 的承包商仍會被標；
  - 中文介面的副標題、月份（2026年10月）、標題輸入框提示都正確；
  - 已停用承包商的紀錄，承包商下拉仍選在 Retired Co；
  - 結束日早於開始日存檔時，顯示「無法儲存：end_date: Start date must be before or equal to end date」；
  - 只有建立權限的帳號建立後，精靈轉為唯讀並顯示提示；
  - 第 5 步搜尋不分大小寫；
  - deep link `?openId=AHB-DRAFT-1` 打開正確的紀錄，參數也從網址移除（見列印腳本的輸出）。
  - 以上用專案內的種子腳本從頭重建一次，結果相同（9／9，列印 9 頁與 13 頁）。
- **後端**：Audit 相關 6 個測試檔共 **236 passed**（`backend-tests.txt`）。`test13-against-HEAD.txt`：新的 #13 測試在 HEAD 的程式上失敗、其他通過，證明它抓得到問題。Python 3.11 完整測試結果見下方 R2 補正一節。
- **前端**（`frontend-checks.txt`）：`tsc` exit 0；單元測試 144／144；Audit 模組 eslint 0 個問題；`vite build` 成功。FollowUpIssue/columns.tsx 有 1 個 eslint 錯誤是 HEAD 原本就有的，沒有動。

## 行為變化
- 存檔失敗的訊息改成「無法儲存：<原因>」，不再顯示「請檢查網路連線」。
- 只有建立權限的人：第一次存草稿後精靈變成唯讀；送出（Submit）新紀錄則照舊關閉精靈。
- 透過連結打開的 Audit，關閉精靈時會回到上一頁（同 NOI／ITR）。
- 列印改為多頁完整輸出；列印時精靈的步驟按鈕與存檔按鈕本來就隱藏，第 4 步每個項目的編輯／刪除圖示仍會印出（沿用原畫面，沒有另做列印版面）。

## 未做／限制
- 「清單重新抓取時變成重複新增」的修正只有讀碼確認，沒有重現；觸發條件是精靈開著時清單剛好重新抓取，而且新清單裡沒有這筆紀錄。
- Follow Up 跳到 Audit 的連結只有讀碼確認，沒有在瀏覽器點過；deep link 本身已實測。
