# MATERIAL-SUBMITTAL-M6 — STATUS（R2，待獨立審查）

TASK_ID: MATERIAL-SUBMITTAL-M6-2026-001
ROUND: R2。R1 的 TASK／STATUS／REVIEW／handoff 已逐字封存為 `MATERIAL-SUBMITTAL-M6-R1-REVISE-*-archive.md`（以 `cmp` 確認與原檔相同）。
本輪只處理 R1 REVIEW 的 REQUIRED_FIXES R1–R7。根目錄部署控制文件、開發資料庫、使用者預覽 8240／3240 與 8198／3198 都沒有動。
**未提交、推送或部署。不自填 PASS。**

## RESULT
- [x] DONE（交 R2 獨立審查）

## 做法（使用者在對話中同意：「開始，照你說的做」）
- 結果未知的重送：新增請求帶 `clientRequestId`，後端以它辨識重送，回傳第一次建立的那筆（材料表新增欄位、唯一索引、migration）。
- 舊權限：migration 移除 `material:record_result:all` 及其角色指派，其他權限、角色、使用者都不動。

## 逐項補正
| 項目 | 修改 | 驗證（測試／probe／瀏覽器） |
|---|---|---|
| **R1** 重複新增 | **後端**：`register` 收到已用過的 `clientRequestId`（同專案）時，直接回傳那筆，不寫入、不寫稽核；兩個同 id 請求同時到達時，唯一索引 `(project_id, client_request_id)` 讓一筆成功，另一筆回傳它；同 id 但承包商不同回 409；id 格式不符回 422。<br>**前端** `RegisterDialog`：<br>① 同步的 in-flight 防護，從查重開始就生效，按鈕同時停用；<br>② 每個表單一個 request id，每次新增都帶；<br>③ 一旦有紀錄（新建或依 id 取回），之後的儲存一律是修改該筆，比較基準是**最後寫入的內容**；<br>④ 結果未知後提示「可直接再按儲存，不會重複新增」，並鎖定承包商。 | HTTP：同 id 回傳同一筆（快照不變）、之後修改、他案獨立、無 id 照舊；同 id 改承包商 409、格式 422；4 個執行緒同時送出 → 1 筆。<br>`r2-form-probe`（真實表單與 saveFlow，假伺服器，非瀏覽器）16/16：照片失敗後改名重試、A→B→A、回應遺失後重試、連點、修改模式 A→B→A，皆精確斷言紀錄數、請求、最終內容、附件數。<br>Chrome：連點只送 1 次；回應遺失後重試，同一 request id 取回同一筆並修改；照片失敗後重試修改同一筆。 |
| **R2** 照片 | `file_router`：`material_rev/photo` 改以 Pillow 實際解碼判斷（`verify()` 加完整 `load()`），只接受 PNG、JPEG、GIF、WebP，存的 MIME 用解碼結果；超大像素炸彈視為錯誤。其他類別與其他模組的上傳規則**不變**（同一個 WAVE 檔在 catalogue 仍照舊收下，測試中有斷言）。 | HTTP：改名文字、無副檔名的偽 MIME、RIFF/WAVE 命名 .webp、只有簽章、截斷 PNG、損毀 JPEG、PDF 改名都回 400，且沒有新增檔案或資料列；多檔中一個非法則整批不寫；真 PNG／JPEG／GIF／WebP 通過，MIME 依解碼結果。<br>審查者的 HTTP probe 原樣重跑：fake.png 改為 400（該 probe 斷言 200 以重現缺陷，因此「失敗」，符合預期）。<br>Chrome：表單上傳偽 PNG 被拒，訊息清楚，沒留下資料列或檔案。 |
| **R3** 查重 | 新增 `GET /material-submittals/duplicates`（需 view；承包商帳號 403；專案範圍外 404）：伺服器取該專案**所有**現行核准紀錄，名稱、廠牌、型號以 trim 加 casefold 比對，排除編輯中的那筆，以及同一表單 request id 建立的那筆。前端查重失敗時跳出「無法完成重複檢查」，可取消後再儲存重新檢查，或「略過檢查並儲存」。仍然只警告，不阻擋。 | HTTP：520 筆同名在前，真正重複在第 521 筆（已確認超過一頁 500 筆）→ 找得到；排除自己；型號不同不算；他案不算；同表單 id 排除；權限與範圍。<br>probe：重複時取消與繼續、查詢失敗後重新檢查與略過。<br>Chrome：大小寫與空白不同仍找到 000001；查重失敗的對話框。 |
| **R4** 儀表板 | 新增 `GET /material-submittals/stats`：不給專案時統計呼叫者**所有可見專案**（伺服器端，依範圍），可篩承包商，可算 `registeredFrom` 之後新增的數量。卡片改為一次請求；載入中、失敗（附重試）、成功的 0 分開顯示；承包商清單未取得前不計算（不會出現過早的 0）。 | HTTP：203 個額外專案（預設專案清單只回 200）時，統計含第 205 個專案的材料；真正的 0；承包商；單專案；只計核准；範圍與權限。<br>Chrome：單專案 211；所有專案在第一次失敗時顯示「Could not load」加重試，重試後為 212。 |
| **R5** Excel | `DataTable` 新增**可選的** `onColumnFiltersChange`（只通知，不改顯示；其他模組沒傳就沒有作用）。匯出時先依上方搜尋與結果標籤取回**全部頁**，再用同一個 TanStack 引擎與同一組欄位定義套用表頭篩選（`filterRowsLikeTable`）。 | 單元測試：700 筆中，結果加兩個文字欄位的組合篩選結果與手算一致，且包含第 200 筆以後的資料；空篩選與 ALL。<br>Chrome：只載入 200／208 時，「附意見核准」加「bulk ITEM 2」加搜尋「Bulk」→ 畫面 0 筆，Excel 只有 1 筆 Bulk item 200；審查者的例子（全部標籤加欄位結果 AWC）→ 畫面 21 筆，Excel 22 筆，全為 AWC。 |
| **R6** 載入更多 | `createListGuard`：每次重新載入是一個新世代，舊世代的回應丟棄；載入更多同時只跑一次（同步判斷），按鈕顯示「載入中」並停用；舊請求晚結束不會解鎖新的；追加時依 id 去重；失敗時提示，按鈕保留可重試。 | 單元測試：guard 的世代、防重入與晚到解鎖，以及 appendUnique。<br>Chrome：回應延遲時連點 3 次只送 1 次，結果 208 筆；延遲中切到 AWC，舊頁晚到被丟棄，仍為 22 筆；失敗後重試成功。 |
| **R7** 舊權限 | `db_migrations` 第 22 步：刪除 `material:record_result:all` 的角色指派與權限本身（同一交易），並把兩個材料權限的描述更新為現行文字。冪等；屬盡力而為，失敗只記錄、不擋啟動（舊權限已無任何功能）。 | migration 測試（實際啟動兩次）：預置舊權限、舊描述，以及「QA lead」（舊權限＋view＋manage＋ncr）、「Result only」（只有舊權限）、admin 的指派。結果：材料權限只剩兩個；QA lead 保留 view、manage、ncr；Result only 變成沒有權限；角色、使用者與其他指派完全不變；描述已更新；第二次啟動不再變動。<br>HTTP：只有舊權限代碼的使用者，對所有材料端點都是 403。 |

**R2 追加：材料展示架**（使用者提出並選定版型，併進 R2，見 TASK）
| 修改 | 驗證 |
|---|---|
| 後端：核准清單與登錄、修改的回應，每筆多帶 `coverPhotoPath`（最早上傳且未刪除的照片路徑，由既有的 `/api/files/download/` 依原權限提供）與 `photoCount`；以一次查詢取得整頁。<br>前端：材料頁工具列加「表格／展示架」切換（記在瀏覽器 localStorage，讀不到就用表格）；新元件 `MaterialShelf`（加上 `MaterialShelf.module.css`）依分類分層（依名稱排序，「未分類」排最後），樣品卡顯示照片（lazy 載入）、名稱、廠牌／型號、核准結果，多張照片時顯示張數，沒有照片顯示「尚無照片」；點卡片開啟既有的材料視窗。展示架時表格**保持掛載但隱藏**，所以表頭篩選會保留，展示架顯示的是 `filterRowsLikeTable` 套用後、與表格相同的資料。 | HTTP：第一張照片與張數、刪除照片後跟著變、登錄與修改的回應也有、無照片時為 null／0、路徑可由下載路由取得（無權限的使用者拿不到）。<br>單元測試：`shelfLevels` 的分類排序、未分類排最後、層內順序、空白分類。<br>Chrome：分層與層板、照片與「2 photos」、無照片佔位、點卡片開視窗、AWC 標籤、表頭篩選在切換前後一致、中文介面、重新整理後仍記得選擇（`browser-acceptance.txt`「R2 — SHELF VIEW」，截圖 4 張）。 |

另外：
- 材料表結構：`material_submittals.client_request_id`（可為空），加上唯一索引 `ux_material_submittals_client_request`（第 12 個 MATERIAL_INDEX）。M1 之後才有材料表的資料庫，會由第 21 步以「沒有才新增」補上欄位（測試：M5 形狀的表，資料保留，第二次啟動不變）。
- 種子 `seed_material_register_review.py`：每 10 筆中有 1 筆為「附意見核准」，讓篩選結果分布在 200 筆分頁的兩側（只用於隔離環境）。
- 文字：新增 `unknownRetrySafe`、`duplicateCheckFailedTitle`、`duplicateCheckFailed`、`saveWithoutCheck`（中英）；移除不再使用的 `unknownOther`。

## `/api/materials` 的 POST／PUT（審查建議，**尚未決定，本輪未實作**）
| 方案 | 內容 | 影響 |
|---|---|---|
| A（建議） | 移除 POST／PUT 路由，只留 GET，加上路由清單與零寫入測試；資料表與資料保留。 | 介面已不使用；之後主檔只能經由登錄簿修改，不會出現兩套內容。 |
| B | 維持現狀，在 DECISIONS 註明主檔可能和登錄簿快照不同。 | 不用改程式；但可以直接呼叫 API 建立沒有核准資訊的主檔。 |
| C | 讓主檔的 PUT 同步修改登錄簿快照。 | 會有兩條寫入路徑，稽核與更正規則要重新設計，不建議。 |

## 驗證紀錄（`MATERIAL-SUBMITTAL-M6-evidence/`）
- 前端 `frontend-checks.txt`「R2 — after the shelf view」一節（最後一次）：npm test **144 pass／0 fail**，EXIT 0；tsc EXIT 0；變更檔 eslint EXIT 0；vite build EXIT 0。
- 後端 `backend-material-tests.txt`「R2」一節（本機 Python 3.14.6；沒有重跑完整套件）：
  - material_submittals＋materials **59 passed，EXIT 0**；
  - attachment authorization（整檔，因 file_router 有改）＋material schema migration（整檔，因第 21／22 步有改）**294 passed，EXIT 0**。
  - 加入展示架之後，material_submittals＋materials 重跑 **60 passed，EXIT 0**。attachment／migration 沒有重跑：file_router、db_migrations、models 在 294 passed 那次之後都沒有再改（見雜湊）。
- 表單 `r2-form-probe.mjs`／`.txt`：16 passed，NODE_EXIT=0（真實表單與 saveFlow；hooks、API、UI 為替身；非瀏覽器）。
- 審查者 probe 原樣重跑：
  - `r2-reviewer-r1-probe-rerun.txt`：表單 probe 因 adapter 缺少 R2 新增的 API 而 build 失敗（EXIT 1，預期中），其情境已由 r2-form-probe 涵蓋；
  - `r2-reviewer-r1-http-probes-rerun.txt`：照片改為 400，故該斷言失敗（EXIT 1，預期中）；專案分頁 probe 仍是 200／3，這是 `/api/projects` 本身的行為，儀表板已不依賴它。
- 瀏覽器 `browser-acceptance.txt`「R2 ROUND」一節（Chrome，新建的隔離環境 8310／3310，在頁面內注入網路錯誤），截圖 `r2-*.jpg/png` 共 5 張。
- 來源雜湊：`file-hashes.txt`「R2」一節。

## 歷次失敗與事件（保留）
- R1 的開發資料庫事件見封存的 R1 STATUS，本輪沒有接觸開發資料庫。
- 本輪過程中的失誤（都已修正）：
  - `DataTable.tsx` 原為 CRLF，第一次以文字模式寫回時整檔換行改變，已恢復為 CRLF，git diff 只剩 4 行；
  - 第一次瀏覽器延遲測試把 HTTP 方法寫成小寫 `get`，規則沒有套用，該次結果作廢，改為 `GET` 後重做；
  - `MaterialStatsTile` 第一版在 effect 中同步 setState，被 eslint 擋下，改為依請求 key 推導顯示狀態。

## 未驗證／限制
- 後端只跑了受影響的 4 個測試檔，沒有跑完整套件。
- 照片驗證依賴 Pillow：目前由 `requirements.txt` 的 `qrcode[pil]` 間接安裝，沒有另外寫進 requirements。iPhone 的 HEIC 照片 Pillow 無法解碼，會被拒絕（訊息會列出可接受的格式）。
- 手機寬度沒有在瀏覽器檢視（展示架在 600px 以下改為兩欄，未實測）；R1／R3 新訊息的中文版沒有在瀏覽器看過（展示架的中文版有看過）。
- 展示架只顯示**已載入**的資料（與表格相同，超過 200 筆需按「載入更多」）；同一分類很多時，該層會很長（測試資料中 Bulk 有 197 張卡）。
- 「本月新增」以登錄時間計算，跨時區的月份邊界沒有實測（同 R1）。
- Excel 依伺服器順序（參考編號）輸出，不跟隨畫面上的欄位排序（R5 要求的是篩選）。

## 對 M5 的影響
材料表新增欄位與索引（12 個）、migration 新增第 22 步、多了 2 個端點、使用 Pillow。M5 的範圍盤點、候選樹、3.11 全套（repo 目錄結構）與演練都要在 M6 PASS 後重做；演練腳本 `m5_upgrade_rollback_rehearsal.py` 仍是舊版，必須改寫。

## 下一步
交 R2 獨立審查。不部署。
