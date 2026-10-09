# MATERIAL-SUBMITTAL-M3 — STATUS（Claude 執行結果，待獨立審查）

TASK_ID: MATERIAL-SUBMITTAL-M3-2026-001
範圍：`MATERIAL-SUBMITTAL-M3-TASK.md`；規格 `docs/planning/MATERIAL-SUBMITTAL-V1-SPEC-2026-10-08.md`（§2、§5 M3、§9.3）。
前一批封存：`MATERIAL-SUBMITTAL-M2-R1-PASS-*-archive.md`（M2 STATUS 封存前已依審查更正過時文字並標 DONE／PASS）。根目錄 DEPLOY-EXEC 控制文件未改。
**未提交、未推送、未部署。不自填 PASS。**

## RESULT
- [x] DONE（M3 前端範圍實作與驗證完成，交獨立審查）
- [ ] PARTIAL
- [ ] BLOCKED

## 本輪實際修改
**新增（前端）**
- `react-app/src/services/materialApi.ts`：M1／M2 API 的型別與包裝（camelCase）。
- `react-app/src/utils/materialSubmittal.ts`：純函式。
  - `classifyWriteFailure`：只有 4xx 視為確定拒絕；無回應、逾時、5xx 都是「結果未知」。
  - `reconcileResult`／`reconcileCorrection`：結果未知時重新讀取，判斷為 saved／notSaved／savedDifferent／unconfirmed。
  - `versionSummary`：最新送審版與現行核准版分開。
  - `addCalendarDays`：日曆天、不順延，只作預覽，以後端為準。
  - `allowedActions`：只隱藏不可能的按鈕，後端仍會重新檢查。
- `react-app/tests-unit/materialSubmittal.test.ts`：11 項。
- `react-app/src/components/MaterialSubmittal/`：
  - `MaterialSubmittal.tsx`：頁面、專案選擇、兩個分頁、送審列表（篩選、已載入／總數、載入更多）、材料分頁。
  - `SubmittalDetailModal.tsx`：最新與現行並列、版次切換、快照、草稿編輯、與材料資料的差異提示、附件、全部登錄紀錄、歷程、操作。
  - `RevisionFiles.tsx`：附件依版次、依分類顯示，依權限與狀態顯示操作；任何失敗後都以伺服器實際清單為準。
  - `ResultDialogs.tsx`：登錄結果採兩段式；更正必填原因；兩者都處理結果未知的情況。
  - `Dialogs.tsx`：材料、新增送審（只列本專案材料，或就地新增）、送交（自動帶入回覆日、可改，未設定天數時必填）、新版次。
  - `parts.tsx`：狀態徽章（附意見核准與核准的顏色不同）、VersionPair、Modal、Notice、Field。
  - `materialText.ts`：中英文字。**不修改 `LanguageContext.tsx`**：該檔帶著已部署的 ITP 修改，而且是 CRLF；其 +4 行差異都是先前的 ITP 文字，M3 沒有新增任何一行。

**修改（前端，均為 LF）**
- `App.tsx` +2：新增 `/material-submittals` 路由。
- `components/Shared/AppLayout.tsx` +8／−3：「品質管控」群組的 PQP 之後加入「材料送審」；只有 `material:view:all` 看得到，做法同 KM。
- `components/DocumentNamingRules/DocumentNamingRules.tsx` +7／−3：新增 `msa` 規則；說明文字取自 `materialText`。

**新增（驗證工具，只用於隔離環境）**
- `react-app/tests-browser/material-m3-vite-launcher.mjs`（3310 → 8310）。
- `backend/scripts/verification/seed_material_m3_review.py`、`seed_material_m3_review_noperm.py`：只能在隔離環境執行；密碼從環境變數讀取，沒有寫死或預設值。

雜湊：`MATERIAL-SUBMITTAL-M3-evidence/file-hashes.txt`。

## 驗證（證據：`MATERIAL-SUBMITTAL-M3-evidence/`）
**自動檢查**（`frontend-checks.txt`，每項都是指令本身的 EXIT CODE，未經管線）：
| 項目 | 結果 |
|---|---|
| `npm test`（Node 單元測試） | **147 pass／0 fail，EXIT 0**（原 136 項，新增 11 項） |
| `npx tsc --noEmit -p .` | EXIT 0 |
| `npx eslint`（M3 新增與修改的檔案，`--max-warnings 0`） | EXIT 0 |
| `npx vite build --outDir $TMPDIR/m3-build` | EXIT 0（輸出到暫存目錄，未覆寫 `react-app/dist`） |
- 全專案的 lint 有其他檔案的既有錯誤與警告，與 M3 無關，所以只檢查 M3 的檔案。這一點如實列出，不宣稱全專案 lint 乾淨。

**瀏覽器驗收**（`browser-acceptance.txt`，含 3 張截圖）：
- 在本批專屬的隔離環境進行：後端 8310、vite 3310、獨立資料庫與日誌；結束後已 `down` 並刪除暫存目錄。8240／3240 照常運作，沒有碰。
- 側欄與權限：
  - 有權限時，入口在 PQP 之後；沒有權限的帳號看不到入口，直接開網址顯示無權限，API 回 403。
  - 只有查看權限的帳號：沒有新增、操作或上傳入口。
- **最新送審版與現行核准版**：列表、卡片欄位與詳細頁表頭都並列顯示，例如「最新 Rev 2 外部審查中｜現行 Rev 1 核准」。附意見核准有獨立的徽章。
- **§9.3 保存與重試**，用只針對結果端點的測試攔截程式模擬：
  1. 請求沒送到伺服器：重新讀取後判斷「尚未保存，可以重試」，並提示「回覆文件已上傳，結果尚未登錄」，只提供「重試登錄」。重試成功後，回覆文件仍只有 1 份。
  2. 已保存但回應遺失（更正）：重新讀取後判斷「已保存」，並隱藏儲存按鈕，不會重送。原登錄標示「已被更正」，新登錄為現行並附原因；現行核准版依規則推導回 Rev 1。
  3. 連重新讀取也失敗：顯示「無法確認登錄結果……系統不會自動重送」。紀錄顯示結果請求只送出一次；伺服器上 0 筆登錄。
  4. 伺服器明確拒絕（另一人搶先登錄）：照實顯示伺服器回覆的拒絕原因。
- 送交：週六送件、14 天，自動帶入並由伺服器存為 2026-10-17。
- 新版次、草稿編輯、快照差異提示；新增送審的材料選單只列本專案的材料；就地新增材料可建立送審；材料分頁依專案分開。
- 文件編號規則頁有 MSA 列。

## 本輪發現並修正
- 回覆文件的分類標題顯示成原始鍵名 `cat.replyDocument`：文字檔漏了這個鍵。tsc 沒抓到，因為鍵名是用模板字串組出來再轉型的。已補上，瀏覽器確認顯示「回覆文件」。
- 歷程中的「· 1 〔已被更正〕」語意不清，改為「已更正 1 次」。
- 寫程式時修正：
  - 結果未知、重新讀取後原本會直接關閉對話框，使用者看不到確認訊息；改為只更新背後的詳細頁、保留對話框。
  - 結果已確認保存後，隱藏「儲存」按鈕。
  - 剛上傳完回覆文件就送結果時，「已上傳」旗標會讀到舊狀態（閉包問題），已修正。
  - lint 指出 effect 中直接呼叫 setState 的寫法，改為在 promise 回呼中設定狀態，並以 alive 旗標避免舊請求覆蓋新資料。

## 觀察到、未處理（與 M3 無直接關係）
- **文件編號規則頁的分頁**：下一頁按鈕無法翻到第 2 頁（程式點擊和座標點擊都試過），第 11、12 列（OSD、MSA）只能用搜尋找到。推測原因是該表格每次重繪都重建資料陣列，導致分頁被重設；**根因未查證**。OSD 在 M3 之前就是第 11 列，應屬既有問題。本輪沒有修改。
- 限權帳號的 console 出現 ITP、NCR 等模組列表的 403，來源是全站共用的預先載入，與 M3 無關。

## 未驗證／限制
- 看板、拖曳、專案回覆天數的設定表單：M4。
- **Python 3.11 未驗證**（部署前必做）；**最新版本後端沒有重跑全套**（沿用 M2 的說明）。
- 瀏覽器驗收只做桌面寬度（1366×900）；手機版依任務延期。
- 結果未知的情境用測試攔截程式模擬，不是實際斷網；是否已保存的判斷都以重新讀取的伺服器資料為準。

## 下一步
交 M3 獨立審查。PASS 後才進 M4；不部署。
