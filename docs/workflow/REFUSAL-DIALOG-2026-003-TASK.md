# REFUSAL-DIALOG-2026-003 — 存檔被拒改用彈跳視窗（第 2 批 2b）

TASK_ID: REFUSAL-DIALOG-2026-003（第 2 批的 2b。2a＝REFUSAL-DIALOG-2026-002，3ff86ad0，2026-10-15 14:11Z 上線）
SOURCE:
- 使用者 2026-10-12 的需求：刪除或存檔被拒都改用彈跳視窗。
- 2a 的 D1／D2／D3 與選項 (a) 照舊適用（REFUSAL-DIALOG-2026-002-DESIGN 第 4、6、7 節）。
- 2b 的明確項目來自 REFUSAL-DIALOG-2026-002-TASK 第 43–52 行，使用者已核過。
- 協調中心「主要調度」2026-10-17 指示以 124f6c14 開工。
- 使用者 2026-10-17 決定把第 9 項併入 2b，原話：「ITR 上傳附件失敗改成 saveFlow 加琥珀色橫幅，併入 2b；動 ITR 前端前先告訴我範圍」。
基準：124f6c14（父節點 3ff86ad0，只多了協調文件，沒有程式差異）。

## 目前階段
**盤點中。** 第 9 項（ITR）已經使用者確認並先行實作；其餘項目等檔案與函式清單排序完成後才開工。

## 範圍
1. **潛在的 500**（router 沒有接 ValueError）：
   - create：itp（create、update_itp_detail）、pqp、obs、osd、meeting_minutes。
   - km router 沒有 try。
   - fat：create／update 只接 Refusal，update_fat_detail 只接 ScopeForbidden。
   - delete 沒有 try：pqp、obs、osd、fat。
   - 改法：一律接 ValueError，改用 `refusal_http`（沒有代碼的錯誤，回應和原本的 400 相同）。補 HTTP 測試。
2. **DUPLICATE_NAME**：承包商（目前回 500）、專案名稱、稽核範本（409）、承包商人員、角色、帳號。英文 detail 不改。
3. **上傳附件 409 帶 ATTACHMENT_LOCKED**：file_router 的 upload，沿用 `lock_refusal` 的 kind 變體。
4. **模組專屬代碼**：NCR 結案、NOI 結案、ITR 核准、Checklist 結果。開工前以 124f6c14 核對訊息與位置。
5. **其他前端改用彈窗**：
   - 承包商、專案、人員；IAM 的帳號、角色、範圍。
   - KM 存檔與 .docx 匯入（拿掉 `alert()`）；KPI；安全設定。
   - Checklist 範本存檔與重開；FAT 詳細內容；AuditTemplatesPanel（DUPLICATE_NAME 有代碼後再改）。
   - **DocumentNamingRules**：以 NAMING-RULES-CLEANUP 的版本為準，只改 handleConfirmSave 的 catch，並更新 `tests-browser/forms-leave-guard-review-naming-rules.mjs` 第 4 段。
   - 相關 store 存檔失敗時不再寫入 `error`；auditTemplateStore 改為原樣丟出 axios 錯誤。
6. **橫幅統一**：Audit（×）、OBS、OSD、會議記錄的頁面橫幅只用於清單載入失敗，並附「重試」。
7. **清理沒用到的翻譯鍵**：刪除前逐一 grep 確認真的沒人用。
8. **2a 審查留下的 P3**：
   - R3 P3-1：`dateField.date` 改成通用的「日期／Date」。
   - R3 P3-2：refusal.ts 的說明移到 `correctable` 上方。
   - R1 P3-4：tests-browser 裡 3 支舊的手動腳本要更新。
9. **ITR 上傳附件失敗改成 saveFlow 加琥珀色橫幅**（使用者 2026-10-17 決定）：
   - 目前的行為：上傳失敗時寫死英文小提示，視窗照樣關閉。
   - 改成：和 NCR 一致。記錄已經存好時視窗不關，用琥珀色 `SaveFollowUpBanner` 說明哪些檔案沒完成，並提供重試。
   - 使用者 2026-10-17 已確認範圍（「ITR 範圍照上面做，Q1 選 (a) 先擋下、提示先儲存再發行」）：
     - 只改 ITR.tsx（handleSaveITRDetails、新增 handleRetryITRFiles／settle）、ITRModals.tsx（handleSave、applyOutcome、retryFiles、followUp 橫幅、5 個附件區的 syncToken、handlePublish 檢查、doPublish 結果處理），以及 LanguageContext（`itr.publishNeedsSaveFirst`、`saveFlow.category.drawing`／`.certificate`）。
     - itrStore 不改。ITR 的欄位、版面、Checklist 面板、撤回、開 NCR、複檢都不動。
   - **Q1 (a)**：第一次發行時，如果還有待上傳或待刪除的檔案，就先擋下，提示請先儲存再發行（核准後附件會鎖定）。已寫入 DECISIONS。
   - 預覽清單要加兩組步驟：「發行時仍有待上傳檔案被擋下」、「部分檔案失敗後重試」。

## 不在範圍
- 前端送出前的檢查、成功提示：不變。
- NCR 清單刪除鈕要往右捲才看得到（另案）。
- H 項（停掉後端測 5xx）：延後。

## 限制
- 和 2a 相同：
  - 改程式前把檔案與函式清單送協調中心「主要調度」排序。
  - 共用檔（LanguageContext〔CRLF〕、refusals.py、refusal.test.ts）依協調中心安排。
  - 只在隔離環境測試；不使用 8198/3198、8240/3240。
  - 不刪測試、不放寬斷言。
  - 3.11 全套用 docs/workflow/py311-full-suite.sh，在 sandbox 外跑，跑在凍結的 tree。
  - 獨立審查 PASS → 隔離預覽給使用者確認 → 用臨時 GIT_INDEX_FILE 做本地提交，hash 交協調中心。不推送、不開 PR、不放 NAS 暫存。
