# CHECKLIST-TEMPLATE-CLEAN-2026-001 — STATUS（R1，待獨立審查）

TASK_ID: CHECKLIST-TEMPLATE-CLEAN-2026-001 · ROUND: R1 · 未提交、推送或部署。不自填 PASS。

## RESULT
- [x] DONE（交獨立審查）
- [ ] PARTIAL

## 修改
| 檔案 | 內容 |
|---|---|
| `backend/services/checklist_service.py` | 新增 `blank_inspection_detail_data`：保留項目結構（id／item／criteria）與說明欄位；清除逐項 situation／result、簽名、檢驗日期、複檢日期、NCR、合格勾選、計數；移除 itrId／itrNumber／recordsNo／noiNumber。無法解析或非物件時原樣回傳 |
| `backend/services/itr_service.py` | `link_checklist`：`detail_data` 改經上述 helper；新檢查單 `date` 改為空字串（不再照抄範本日期）。只改匯入與這兩行；等「ITR模組檢查」提交 5b2c67e3 後才改，未混入其修改 |
| `backend/db_seeder.py` | 新資料庫的預設範本「Stakeout 放樣」改為乾淨範本（status Ongoing、inspectionDate 空、detail 不含 recordsNo）；原本以 Pass＋2024 日期建立，且在 migration 之後執行，第 23 步清不到 |
| `backend/db_migrations.py` | 第 23 步 `_clean_legacy_bare_template_results`：migration_flags 一次性；只處理「帶結果的空白範本」（Pass／Fail、計數 > 0、逐項有結果或觀察、itrNumber 有值）→ 狀態 Ongoing、計數 0、itrNumber NULL、detail_data 經 helper；每筆寫稽核（CLEANUP_TEMPLATE_RESULTS，含新舊值）；同一交易寫旗標；失敗只記錄、不留半套、下次啟動重試 |
| `backend/tests/test_checklist_template_cleanup.py`（新，7 項） | helper 保留／清除／不臆測；只清該清的（含只有 itrNumber 或只有觀察文字的範本），乾淨範本與已連結檢查單逐欄不變；稽核內容；只跑一次；失敗零寫入且可重試；連結後的新檢查單從空白開始（含 date）、範本本身不變；種子範本為乾淨範本 |
| `DECISIONS.md` | 新增三項決定 |
| `BACKLOG.md` | #22 狀態更新與正式站唯讀核對結果 |

## 驗證（`CHECKLIST-TEMPLATE-CLEAN-2026-001-evidence/`）
- 本機 Python 3.14：`test_itr*`＋`test_checklist*` **421 passed**（最後一次，含日期與種子修正）；先前另有 migration 啟動測試 240 passed（`backend-tests.txt`）。
- Python 3.11（`py311-tests.txt`，最後一段＝HEAD 127d187e＋5 檔）：收集 2443；啟動路徑 4 passed；`test_itr*`＋`test_checklist*` **421 passed**；EXIT 0。前兩段（日期／種子修正前）與 Colima 無回應、`-k` 篩選失誤的經過均保留。
- **部署前最終候選完整 3.11**（2026-10-11，`py311-final-candidate-after-audit-print.txt`）：候選＝正式站（4bdc49ec＋AUDIT-PRINT audit_service 9121011d）＋本批 4 檔；目錄結構 /q/backend＋/q/react-app；**2419 passed、16 skipped、0 failed**。第一次誤把 backend 放在容器根目錄（/work），startup_guard 判定執行目錄與專案重疊而 99 failed，屬環境錯誤，紀錄保留在部署素材目錄、不作為驗收依據。
- **正式資料庫複本演練**（`rehearsal-prodcopy.txt`，3.11，複本取自 2026-10-09）：第一次啟動只清 CHK-000001、CHK-000006（Ongoing／0／無 ITR 參照／舊日期清空），2 筆稽核，旗標寫入；CHK-000002 不變；第二次啟動零變化；integrity ok；本機複本雜湊不變。修正後重跑結果相同。
- **隔離環境＋瀏覽器**（`browser-acceptance.txt`，截圖 4 張；Chrome 與 Claude 內建瀏覽器）：清理後的舊範本以一般「編輯範本」顯示、項目保留；由範本產生的檢查單——卡片無檢驗日期、狀態 Ongoing、檢驗日期空白、地點與備註沿用範本、2 個項目觀察與結果空白；資料庫中簽名全空、無 ITR／編號參照；範本本身不變。過程中發現並修正上述「種子範本」與「date 照抄」兩點。

## 上線注意
- 部署會改正式資料（2 筆範本），部署前做資料庫一致性備份；回退程式不會還原資料，必要時以備份或稽核舊值手動恢復。
- 後端 4 檔（db_migrations、db_seeder、checklist_service、itr_service）＋1 測試；無前端變更。

## 部署基準
「ITR模組檢查」將部署 4bdc49ec（不含 NOI 的 127d187e）；本輪改的後端檔在 4bdc49ec 與 127d187e 完全相同（db_seeder.py 亦未被兩者改動），可直接疊上；部署前須重做正式站雜湊預檢。
