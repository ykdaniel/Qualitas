# OPTIMISTIC-LOCK-2026-001 B5 STATUS（版本必填）

- **基準**：378e6cf1（正式站）。**提交的父 commit＝ae7b79fd**（主要調度同意；它和 378e6cf1 只差文件：BACKLOG #65 上線紀錄、#66，以及 D2 STATUS）。BACKLOG 已把本批的 #64 與 1102 行註記疊在 ae7b79fd 的版本上。工作樹 scratchpad/ol-b5。
- **凍結指紋**（backend＋react-app，排除 node_modules／dist／__pycache__ 與預覽啟動檔）：`de168ac036de7a60`（R2 PASS、3.11 r2 之後）。
- **一起提交**：B4 STATUS 的上線紀錄（2026-10-20 14:12Z，正式站 378e6cf1）。

## 1. 實際修改
| 檔案 | 內容 |
|---|---|
| backend/core/config.py | `ROW_VERSION_REQUIRED`（環境變數，預設 false） |
| backend/core/concurrency.py | `claim_row_version`：沒帶版本時，若開關開啟，在任何寫入之前丟 `Refusal("VERSION_REQUIRED")`；開關關閉照舊放行＋warning。`warn_missing` 改為 `exempt`（不比對、不記錄、不拒絕）；`bump_row_version` 走豁免。開關在呼叫當下讀取，所以 NAS 改 .env 後重啟即生效 |
| backend/core/refusals.py | `refusal_http`：VERSION_REQUIRED 固定 400（同 VERSION_CONFLICT 固定 409 的寫法），KM 的 409 與 documents 的 CONFLICT_CODES 都不影響 |
| backend/services/itr_service.py | `update_itr`：拿掉舊 `_version` 的比對與寫回；**保留** `_version` 的剝除（已核准 ITR 的保護依賴它）；沒帶或讀不懂的 detail_data 不再重寫，保留原值；`warn_missing_version` 改為 `version_exempt`。重新檢驗的 detail_data 初值改為 `{}`。revoke 的註解 |
| backend/routers/itr.py | 批次更新改用 `version_exempt=True`（BACKLOG #64） |
| backend/services/km_service.py | Word 匯入改用 `version_exempt=True` |
| react-app/src/context/LanguageContext.tsx（CRLF） | `refusal.code.VERSION_REQUIRED` 中英 |
| react-app/src/utils/refusal.ts | `correctable()` 排除 VERSION_REQUIRED（不顯示「請修正後再存」） |
| react-app/src/utils/rowVersion.ts | 只改說明 |
| react-app/src/context/ContractorsContext.tsx、IAMContext.tsx | 刪除（死碼，沒有任何 import） |
| backend/tests/conftest.py | 在載入 core.config 前設 `ROW_VERSION_REQUIRED=false`，開發者的 .env 不會影響整套測試 |
| backend/tests/isolation.py（R1 P3-2，主要調度已核准） | 測試子行程的環境也先設 false，再套各測試的 extra |
| react-app/src/utils/numberGenerator.ts（R1 P3-4，主要調度已核准） | 只改註解（不再提已刪除的 ContractorsContext） |
| backend/tests/test_optimistic_lock_http.py | 舊 `_version` 測試改寫為「剝除、不再比對」；新增：已核准 ITR 帶 `_version` 發行（開／關）、重新檢驗 detail_data 為 `{}`、開關開啟時一般存檔 18 種＋KM＋材料＋7 處次要寫入都回 400 且資料不變、批次與 KM 匯入照樣通過、bump／exempt 不被拒、refusal_http 固定狀態碼 |
| backend/tests/test_refusal_dialog_2026_002_http.py、test_itr_approval_events_http.py | `_version` 的斷言改用 row_version |
| react-app/tests-unit/refusal.test.ts | PARAMS 加 VERSION_REQUIRED；中英文訊息與「不顯示修正提示」 |
| react-app/tests-unit/rowVersion.test.ts | 只改測試名稱（store 仍回送 `_version`，伺服器會剝掉） |
| DECISIONS.md、DESIGN、BACKLOG.md | 第 1～3 點改寫、第 6 點新增；DESIGN §2、§3、§5、§6；BACKLOG #64、1102 行的舊註記 |

## 2. 設計說明
- **已核准 ITR 的 allowed_keys 保留 `detail_data`**：盤點曾建議拿掉，但舊頁面發行時可能只送一個帶 `_version` 的 detail_data，拿掉會被當成「改了鎖定欄位」擋下。保留，靠「剝除後必須是空的」把關。
- **detail_data 沒帶就不寫**：以前每次都寫回（為了加舊標記）；現在只在頁面有送時才合併寫入，讀不懂或 null 的保留原值（和以前一樣）。
- **VERSION_REQUIRED 不提供「重新載入這筆」**：舊頁面重新載入一筆救不了，要整頁重新整理。

## 3. 驗證
| 項目 | 結果 |
|---|---|
| tsc | **實測** 0 錯 |
| npm 單元測試 | **實測** 241 passed |
| eslint（修改的前端檔） | **實測** 0 error |
| CRLF | **實測** LanguageContext 3625/3625 |
| 後端定點測試（本機 3.14） | **實測** test_optimistic_lock_http、test_km_docx_import、test_refusal_dialog_2026_002_http、test_itr_approval_events_http 全過 |
| 3.11 全套（開關關閉） | **實測** r2（R1 修正後的樹，HEAD 378e6cf1＋本批未提交修改）：**2933 passed、17 skipped、0 failed**，pytest_exit=0，2026-10-20 14:45–15:44Z。證據：OPTIMISTIC-LOCK-2026-001-B5-evidence/py311-full-r2.txt。r1 是修正前的樹，已中止並刪除 |
| 獨立審查 R1 | PASS with notes；P3-1、P3-2、P3-4 已修，P3-3 依使用者決定不改（見 B5-REVIEW.md） |
| 獨立審查 R2 | **PASS** |

## 4. 隔離預覽自測（8380/3380，開關開啟）
| 情境 | 結果 |
|---|---|
| 不帶版本直接呼叫 API（NCR） | 400 `VERSION_REQUIRED`，英文句正確 |
| ITR-1 存檔、發行 | 成功（v0→1→2，Approved），沒有拒絕 |
| ITR-2（已核准、資料留著 `_version`）再發行 | 成功（v3→4）。新頁面只送 type／status／row_version |
| 模擬舊頁面：已核准 ITR 帶 `{"_version": 3}` 的 detail_data 發行 | 成功（v4→5）——陷阱已守住 |
| ITR-2 撤回核准（畫面） | 成功（v6，In Progress） |
| 模擬舊頁面：存檔時把 row_version 拿掉 | 彈窗「ITR …… 沒有存檔：這個頁面的資料版本太舊，請重新整理頁面後再存一次」（英文介面顯示英文句）；只有 OK；版本不變 |

自測後已用 `scratchpad/preview/reset_ol_b5_preview.py`（只寫隔離資料庫）把 ITR-1 恢復 In Progress、ITR-2 恢復 Approved（帶舊標記）。

## 5. 上線後要做的事（給 GPT「主要調度」）
1. 部署時 **不要** 設 `ROW_VERSION_REQUIRED`（預設 false，行為和現在一樣）。本批不改 .env、docker-compose。
2. 觀察正式站 log（LOG_DIR 的 app.log 與容器輸出）裡的 `row_version missing:`，正常使用 **3 天**。每一筆都會寫出表名與 id，可追查是哪個頁面或腳本。
3. 3 天都是零 → 開啟開關需改 **NAS 的 backend/.env** 加 `ROW_VERSION_REQUIRED=true` 並重啟後端。這屬 GPT 的 NAS 操作，**要使用者授權**。
4. 回退：把它改回 false（或刪掉）並重啟，不用重新部署。
5. 開啟後若有人回報「頁面版本太舊」：請他重新整理頁面；若重新整理後仍出現，代表有呼叫端沒帶版本，查 log 的表名與 id。

## 6. 已知風險（使用者已接受）
- 舊 KM 文章的 `version_no` 是 NULL 時，開關開啟後無法存檔（R1 P3-3）。
- D2 上線後舊 KM 已唯讀（`/km/legacy`，`<KM readOnly />`，新增／編輯／刪除都關掉；`/km` 已是文件登錄），實際沒有畫面上的寫入路徑。已讀碼核對 App.tsx 與 KM.tsx。

## 7. 順手觀察（不在本批，給 KM 那邊）
- 正式站的 backend/Dockerfile 沒有安裝 pandoc，KM 的「匯入 Word」應該會失敗。既有測試都是假的 pandoc。
- pandoc 不加 `-s` 時只輸出片段，而 `soup.body` 會是 None，可能導致匯入內容變成空的。
- 未在正式站驗證；KM 編輯即將由文件登錄取代。
