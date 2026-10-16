# REFUSAL-DIALOG-2026-002 — 存檔被拒改用彈跳視窗（第 2 批）

TASK_ID: REFUSAL-DIALOG-2026-002
SOURCE: 使用者 2026-10-12 的需求（刪除或存檔被拒都改用彈跳視窗）與設計選定（REFUSAL-DIALOG-2026-001-DESIGN 第 7 節：代碼方案 A、5xx／網路也用彈跳視窗、分批、未翻譯時中文通用句＋英文原文）。第 1 批（刪除）已上線（15612688）。草稿來自 nostalgic-roentgen 工作階段（2026-10-13），本工作階段（2026-10-14）以正式站 09f6a688 重新盤點並修正。

## 目前階段
- 2026-10-14：以 09f6a688 唯讀盤點完成（DESIGN 第 2 節）；使用者已選定三個介面決定（DESIGN 第 4 節）。
- **程式尚未開工**：等 REF-PROJECT-SEQ-2026-001-B3（NOI 工作階段）提交後，以協調中心指定的新 HEAD 為基準；開工前重新比對 B3 新增的拒絕代碼與檔案行號。

## 使用者決定（2026-10-14，本工作階段）
- **D1 422 欄位驗證錯誤**：也用彈跳視窗，每個欄位一行條列。
- **D2 PQP／Audit 表單內紅字**：被拒或失敗只用彈跳視窗；Audit 紅框拿掉；PQP 紅框只保留「請先儲存再發行」與「記錄已存、部分附件未完成」兩種提醒。
- **D3 「內容已保留」**：只在視窗確實沒關、內容確實還在時顯示；被拒（4xx）與失敗（5xx／網路）各一種說法。

## 範圍
1. 所有被拒或失敗的存檔改用第 1 批的 `RefusalDialog`（`showRefusal(err, 'save')`）：新增、修改、狀態轉換（核准、發行、作廢、結案、重開、撤回核准），以及次要動作（ITR 開 NCR／複檢／連結 Checklist、Checklist 結果存檔與重開、會議記錄新一期與快速作廢、NOI 批次新增、KPI 權重、文件編碼規則、安全設定、承包商／專案／人員、IAM 帳號／角色／範圍、KM 存檔與匯入、稽核範本）。
2. 失敗時視窗不關、內容保留（D3 的一行提示）；重試只要再按一次「儲存」。
3. store 的 add／update／publish 不再寫入頁面 `error`（OSD、會議記錄、ITR、ITP、PQP、NOI 批次新增），頁面頂部橫幅只留給清單載入失敗。
4. 後端：存檔相關代碼（DESIGN 第 3 節），英文 `detail` 一字不改；上傳附件的 409 補 `ATTACHMENT_LOCKED`。
5. 第 1 批延後項目：Audit（×）、OBS／OSD／會議記錄的橫幅統一為「只用於載入失敗＋重試」；清掉沒人用的翻譯鍵。
6. 修正盤點發現的存檔缺陷（DESIGN 第 2.3 節）。

## 不在範圍
- 部分完成的檔案步驟（記錄已存、部分檔案失敗）：維持視窗內琥珀色 `SaveFollowUpBanner` 與重試（未完成，不是被拒）。
- 前端送出前的必填／格式檢查（欄位旁紅字、警告小提示）：不變。
- 成功提示：維持 sonner。
- NCR 清單刪除鈕要往右捲才看得到（另案）。

## 限制
- 只改本批範圍內的檔案；改程式前把檔案與函式清單送協調中心排序。
- 共用檔（LanguageContext〔CRLF〕、refusals.py、refusal.test.ts、schemas、main.py、DECISIONS）依協調中心安排。
- 本機測試只在隔離環境（isolated_stack.py；不用 8198/3198、8240/3240）；匯入 main 必設拋棄式 DATABASE_URL；不寫正式資料庫。
- 不刪測試、不放寬斷言。後端全套用 `sh docs/workflow/py311-full-suite.sh <tree> <out>`（3.11，沙箱外）。
- 獨立審查 PASS → 隔離預覽給使用者確認 → 臨時 GIT_INDEX_FILE 提交（父節點為當時 ui/sidebar-shell-preview HEAD），不推送、不動 ref，hash 交協調中心；部署由協調中心負責。

## 分批（協調中心 2026-10-14）
- **2a**（本輪）：
  - 共用彈窗：422 條列、「內容已保留」提示行。
  - saveFlow 模組：NCR、OBS、NOI、OSD、會議記錄、材料。
  - ITR、ITP、PQP、Audit 精靈，以及對應的 store。
  - 6 個共用後端代碼。
  - 內容見 DESIGN 第 6、7 節。
- **2b**（2a 上線後才開工），明確項目：
  1. 潛在的 500（router 沒接 ValueError）：itp、pqp、obs、osd、meeting_minutes 的 create；km router（create 沒有 try）；fat 的 create／update（只接 Refusal）與 update_fat_detail（只接 ScopeForbidden）。另外 pqp、obs、osd、fat 的 delete 沒有 try。
  2. DUPLICATE_NAME：承包商、專案、稽核範本、人員、角色、帳號。承包商與專案名稱重複目前回 500。
  3. 上傳附件 409 帶 ATTACHMENT_LOCKED（file_router 的 upload）。
  4. 模組專屬代碼：NCR 結案、NOI 結案、ITR 核准、Checklist 結果。
  5. 其他前端改用彈窗：承包商、專案、人員、IAM（帳號、角色、範圍）、KM（存檔與匯入的 alert）、KPI、安全設定、Checklist 範本、FAT 詳細內容、AuditTemplatesPanel。
     - 文件編碼規則：以 NAMING-RULES-CLEANUP-2026-001 的提交 `9da76d9f`（parent 097ae3b8，由協調中心排入）為基準，只改 handleConfirmSave 的 catch（403 和「命名規則儲存失敗：」那兩支），改成 showRefusal。settings.py 只在 raise／except 加 code。同時要更新 `tests-browser/forms-leave-guard-review-naming-rules.mjs` 第 4 段，它逐字比對「命名規則儲存失敗：Simulated 500 …」。
  6. 橫幅統一：Audit（×）、OBS、OSD、會議記錄的橫幅只用於載入失敗，並附「重試」。
  7. 清理沒用到的翻譯鍵：見 DESIGN 6.4。
     - 一併處理 2a 審查 R3 的 P3：`dateField.date` 改成通用的「日期／Date」；refusal.ts 的說明移到 `correctable` 上方；tests-browser 裡 3 支舊的手動腳本（R1 P3-4）。
  8. 待使用者決定：ITR 上傳附件失敗是否改成 saveFlow 加琥珀色橫幅。
