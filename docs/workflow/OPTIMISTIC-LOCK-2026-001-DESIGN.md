# OPTIMISTIC-LOCK-2026-001 設計（全模組樂觀鎖）— 第一階段：唯讀盤點＋提案

> **基準**：分支 HEAD 6f68c768（＝正式站 69edeac5 加文件與 ci.yml）。
> **做法**：用 git archive 匯出成唯讀副本，由兩個唯讀代理盤點，**沒有改任何程式**。
> **來源**：BACKLOG #3。使用者 2026-10-18 同意「依建議的改」，經協調中心「主要調度」派工。本文件交協調中心轉使用者選擇後，才進第二階段。

## 0. 一句話結論
- 建議採 **(b) 新增整數版本欄位 `row_version`**。
- 方案 (a)「以 updated_at 比對、不需 migration」在這個專案**做不到**：大多數表沒有 updated_at；有的那幾張，值多半是**前端自己送的**、只到日期，或只到秒。要用 (a) 也得先在十幾張表補上「由伺服器維護的時間欄」，等於一樣要加欄位，卻比整數版本號更脆弱。

## 1. 盤點結果

### 1.1 資料庫與鎖
- **資料庫**：SQLite（`DATABASE_URL` 預設 `sqlite:///./qualitas.db`），單一 uvicorn worker。所有寫入共用一把整個資料庫的寫入鎖。
- **既有的「寫入鎖」**：`lock_itr_for_write`、`lock_ncr_for_write`、`lock_material_submittal_for_write`、`begin_write_transaction`、`lock_for_admin_change`，做法都是執行一句沒有實際效果的 UPDATE，搶到寫入鎖。
  - 在 SQLite 上，先搶到任一把鎖，再重讀、比對、寫入，整段就是原子的。
  - 但大部分模組更新前**沒有搶鎖**，「先讀再比對」之間有空檔，會有競態。
- **欄位遷移的機制**：專案用啟動時的 `db_migrations._add_column_if_missing` 補欄位，不用 alembic。材料相關的表由遷移自己管理，新欄位要同時加進 `_create_material_submittal_schema`。

### 1.2 各表現有的時間與版本欄位
| 類別 | 模組 |
|---|---|
| **沒有任何可用欄位** | NCR、NOI、ITP、OBS、OSD、Audit、Contractor、Role、Project（只有 created_at）、User（只有 created_at）、命名規則 |
| **有 updatedAt，但由前端送值**（不能當版本） | PQP（publish 時才由伺服器寫，而且只到日期）、MeetingMinutes、FollowUp（讀取時還被截成日期） |
| **由伺服器寫 updated_at** | FAT（每次寫入、微秒）、KPI 權重（微秒）、AuditTemplate（內容沒變時不更新）、ContractorPersonnel（**只到秒**）、Material／MaterialSubmittal（只有欄位真的變動時才更新） |
| **已經有版本號** | KM `version_no`（只到秒的 updated_at 加整數版本）、ITR `detail_data._version`（JSON 裡的整數） |
| **同名但不是併發用的「version」** | PQP `version`（業務版次 Rev1.0）、AuditTemplate `version`（自由文字）、Checklist `version`（範本內容計數） |

- 這幾張表的「version」都是業務資料，新欄位因此不能再叫 `version`，建議叫 `row_version`。

### 1.3 現有的三種做法
| 模組 | 做法 | 問題 |
|---|---|---|
| ITR | 先搶鎖、refresh，再比對 `detail_data._version`。不同就丟 `VERSION_CONFLICT`（目前回 **400**），每次 update 都加 1 | **前端從來沒有刻意送 `_version`**，只是 store 合併 detail_data 時剛好帶上，所以清單一舊就失準。revoke、create-ncr 不會加 1。批次更新不檢查，但會加 1 |
| KM | `version_no` 比對後加 1，衝突回 409 | **沒有搶鎖**，比對和寫入之間有空檔，兩個同時存的請求會都通過。import-docx 不帶版本。前端 409 之後版本號沒更新，重試會一直 409 |
| 材料送審 | 伺服器端搶鎖，加上條件式 UPDATE 檢查影響列數；clientRequestId 防止重複建立 | **沒有前端版本**，從舊畫面存檔會照樣蓋掉（每個欄位都是後存的贏） |

### 1.4 會改到同一列、必須一起加版本的「次要寫入」
- **ITR**：revoke-approval（改狀態）、create-ncr（寫 ncrNumber）、batch-update。
- **PQP**：publish。
- **ITP**：`PUT /itp/{id}/detail`（計畫）。
- **FAT**：`PUT /fat/{id}/details`。
- **KM**：import-docx。
- **User**：`PUT /iam/users/{id}/scope`。登入、2FA 這類系統寫入**不應**加版本。
- **會議記錄**：同一次存檔裡的第二次寫入（延後的狀態），要用第一次回傳的版本。
- **附件上傳或刪除**：只寫 attachments 表，**不動**母單的那一列，所以不用加版本。
- **排程器**：只讀不寫。

### 1.5 前端
- **目前狀況**：只有 KM 會明確送版本。PQP 會把 `updatedAt` 改成今天的日期再送出。
- **改的時候要留意的地方**：
  - 很多 store 的 normalize 會把欄位丟掉：contractors、projects、iam users／roles、checklist、AuditTemplatesPanel、KPI。
  - 有些地方存完不回寫結果：ITP 計畫、FAT details、ITPDetail 頁、FollowUp 頁、KPI。
  - 有些視窗存完不關、可以連續存，第二次存檔必須用回傳的新版本：Audit 存草稿、會議記錄、PQP 和 ITP 的部分完成、AuditTemplatesPanel、ITPDetail、命名規則、KPI。
- **彈窗**：VERSION_CONFLICT 已經有中文（「{docType} {number} 已被其他人修改。請重新載入後再修改一次。」），而且依 2a 規則不加「內容已保留」那一行。彈窗目前只有「我知道了」，**沒有「重新載入」的動作**。

## 2. 方案比較
| | (a) 以 updated_at 比對 | (b) 新增整數 `row_version`（建議） |
|---|---|---|
| **需不需要加欄位** | 要：大多數表沒有 updated_at，前端送值的那幾張也得改由伺服器維護，所以一樣要在十幾張表加欄位 | 要：約 20 張表各加一欄 `row_version INTEGER NOT NULL DEFAULT 0`，走既有的 `_add_column_if_missing`，啟動時自動補上 |
| **比對可靠度** | 字串時間會受精度影響（KM、人員只到秒，同一秒存兩次會判斷錯）、時區、格式；FollowUp 讀出來只有日期 | 整數相等，沒有歧義 |
| **原子性** | 也得用條件式 UPDATE 或先搶鎖 | `UPDATE t SET row_version=row_version+1 WHERE id=? AND row_version=?`，影響 0 列就是衝突。SQLite 不搶鎖也安全，換成 Postgres 一樣成立 |
| **對舊資料** | 舊列沒有時間，要回填 | 預設 0，不用回填。ITR 由 `_version` 帶入一次、KM 沿用 `version_no` |
| **對既有 API 呼叫端** | 和 (b) 相同（見第 3 節） | 回應多一個欄位，請求可選擇帶上，不影響現有呼叫 |

**建議用 (b)**，並統一實作如下：
- **核心 helper**：`core/concurrency.py`，提供兩個函式。
  - `claim_row_version(db, model, id, expected)`：在寫入交易的第一句 DML 用條件式 UPDATE 加 1。影響 0 列時，丟 `Refusal("VERSION_CONFLICT", 原英文句, docType, number)`。
  - `bump_row_version(db, obj)`：給次要寫入或系統寫入用，只加 1、不比對。
- **router**：`VERSION_CONFLICT` 一律回 **409**（ITR 目前是 400，要改；前端兩種都能處理）。
- **NCR**：router 會先讀一次，造成 identity map 裡的資料過時，claim 之後要 `refresh`。
- **KM**：`version_no` 就是它的 row_version，改用 claim 的方式，補上原本的競態，import-docx 也要加 1。
- **ITR**：`_version` 改成欄位，啟動時從 detail_data 帶入一次。detail_data 裡的 `_version` 仍然接受一段時間，相容舊前端。

## 3. 對既有呼叫端的影響
- **沒有帶版本的請求**（舊前端、腳本、批次更新）。**建議分兩段收緊**：
  1. 第一段：沒帶版本就**放行並 bump**，同時記一筆 warning log（`optimistic-lock: <docType> <id> saved without row_version`），方便看出還有哪些地方沒改。
  2. 第二段：所有前端都改完、log 一段時間沒有新的 warning 之後，Update 改為**必須**帶版本。批次更新、系統寫入除外。
- **批次更新**（ITR batch-update）：照舊不比對，但會 bump。也可以讓每筆各自帶版本，建議先不做。
- **狀態轉換的專用端點**（revoke、publish、create-ncr）：建議**接受選填的 `row_version`**，有帶就比對，一律 bump。前端從開著的表單呼叫時就帶上。
- **附件上傳或刪除**：不用改（不動母單的列）。但「先存記錄、再傳檔案」的 saveFlow 要用第一次寫入**回傳的新版本**，「重試檔案」不寫記錄、不帶版本。
- **啟動遷移**：直接用 SQL 改列，不加版本。只有分頁開著跨過一次重啟的情況才會遇到，影響很小，不處理。

## 4. 前端行為（請使用者選）
- **收到 409 VERSION_CONFLICT 時**，共用彈窗顯示既有的中文句子，視窗不關。可以選：
  - **(i) 只顯示訊息**（現狀）：使用者自己關掉視窗、重新打開。最簡單，但 KM 現在就是這樣，使用者容易一直按儲存、一直衝突。
  - **(ii) 建議**：彈窗多一顆「**重新載入這筆**」。按下後先確認「您這次的修改會被捨棄」，再關閉表單、重新抓清單並重新打開這筆。共用元件做一次，各模組只要提供「重新打開」的方法。
  - **(iii)「載入最新並保留我的輸入」**：每個表單都要寫合併邏輯（哪些欄位用我的、哪些用新的；附件、子表如 discussionLog、advancedItems 都要處理）。工作量大，也容易出錯。**建議先不做**，之後有需要再挑個別模組評估。
- **存檔成功後**：store 用回應裡的新 row_version 更新那一列；存完不關的視窗同步更新自己持有的版本。

## 5. 分批建議
| 批 | 內容 | 預估 |
|---|---|---|
| **B1 後端＋store** | core/concurrency.py；約 20 張表加 `row_version`（遷移＋models＋讀寫 schema）；各模組 update 和第 1.4 節的次要寫入改用 claim／bump；VERSION_CONFLICT 統一 409；沒帶版本先放行並記 warning；ITR／KM 轉換；store 的 normalize 保留 row_version、存完回寫；補 HTTP 測試。**前端只動 store 和 api 型別，不動視窗** | 後端約 25 個檔、前端 store 約 15 個檔；測試 1 個新檔＋少量既有測試調整 |
| **B2 視窗第一組** | NCR、OBS、NOI、OSD、會議記錄（含同一次存檔的第二次寫入）、材料、PQP（不再覆寫 updatedAt）、Audit 精靈：送出 row_version，存完不關的視窗更新版本；加上第 4 節選定的彈窗行為 | 約 16 個前端檔 |
| **B3 視窗第二組** | ITP（清單視窗＋ITPDetail 頁＋計畫寫入）、Checklist（範本編輯器＋ITR 快照面板）、FAT（編輯＋details）、FollowUp、KM（改用新的衝突處理、409 後的處理）、主檔類（承包商、專案、人員、IAM 帳號與角色、稽核範本） | 約 20 個前端檔 |
| **B4 ITR 視窗** | ITR 改送 row_version（含發行、撤回、開 NCR）。**等 ATTACH-SECTION-UX 提交後再碰 ITRModals.tsx**，動之前依規定先把範圍交給使用者確認 | 約 3 個檔 |
| **B5 收緊** | warning log 一段時間沒有新的之後，Update 改為必須帶版本 | 小 |
| （另議）| 命名規則（整份規則一次替換）、KPI 權重：只有管理者會改，併發機會低，**建議不做或最後做** | — |

## 6. 測試策略
- **後端 HTTP（每個模組一組，可以參數化）**：
  - 兩個 client 先讀到 row_version＝N，A 帶 N 存檔成功（變成 N+1），B 帶 N 存檔得到 **409 VERSION_CONFLICT**（code、params、英文句都要檢查），而且資料**沒有被改**。
  - 帶正確版本的連續存檔都成功，版本每次加 1。
  - 沒帶版本時放行，版本加 1，並寫 warning log（用 caplog 斷言）。
  - 次要寫入（revoke、publish、create-ncr、ITP／FAT details、KM import、user scope）都會加 1；附件上傳、刪除不會。
- **原子性**（防止「兩個請求都通過」）：用兩個獨立 session 連同一個 SQLite 檔。A 執行 `claim_row_version` 還沒 commit 時，B 也 claim：B 會等寫入鎖；A commit 之後 B 的條件式 UPDATE 影響 0 列，得到 VERSION_CONFLICT。用 `threading.Barrier` 讓兩個請求同時對同一筆 update 也可以，但上面的兩段式寫法結果確定、不會時好時壞，建議用它。
- **前端單元測試**：store 保留並回寫 row_version；saveFlow 的第二次寫入用新版本；彈窗的「重新載入」（如果選 (ii)）。
- **全套**：3.11 全套。既有測試大多不帶版本，在「沒帶版本就放行」的規則下應該照樣通過；B5 收緊時再調整。

## 7. 請使用者決定
1. **方案**：(b) `row_version`（建議），或 (a) updated_at。
2. **沒帶版本的請求**：先放行並記 warning、之後再收緊（建議），或一開始就拒絕。
3. **409 後的動作**：(i) 只顯示訊息；(ii) 加「重新載入這筆」（建議）；(iii) 載入最新並保留我的輸入（建議先不做）。
4. **範圍**：命名規則、KPI 權重要不要做（建議不做）；主檔類（承包商、專案、人員、IAM、稽核範本）要不要放在 B3（建議要）。
5. **分批**：照第 5 節的 B1→B5。

## 8. 使用者決定（2026-10-18，經協調中心「主要調度」轉達）
原話：「樂觀鎖五個決定都照建議值：(b) row_version、缺版本先放行記 warning、409 後加重新載入按鈕、命名規則與 KPI 不做、主檔納入 B3、分批 B1→B5」。

1. **方案**：(b) 新增整數欄位 `row_version`，並用條件式 UPDATE 原子比對。
2. **沒帶版本的請求**：先放行，照樣加 1，同時記 warning log；B5 再收緊為必須帶版本。
3. **409 之後**：共用彈窗加一顆「重新載入這筆」（選項 ii），按下前先確認會捨棄這次的修改。「保留我的輸入」（選項 iii）不做。
4. **範圍**：命名規則和 KPI 權重不做；主檔（承包商、專案、人員、IAM 帳號與角色、稽核範本）放在 B3。
5. **分批**：B1→B5。協調中心另外要求：B1 到 B5 盡量在一週內做完，放行期不要拖長。

## 9. B2 實作時的決定（2026-10-18）
- **PQP 的 updatedAt**：第 5 節 B2 原本寫「不再覆寫 updatedAt」。現在版本靠 row_version，updatedAt 只是列表上顯示的日期；照舊存檔時寫入今天，維持原狀（協調中心 2026-10-18 決定）。
- **表單的版本**：在表單開啟時取一次（hooks/useRecordVersion），存檔成功後換成伺服器回傳的版本。表單開著時不從清單重新取，避免清單在背景重整後，把新版本交給舊表單。
- **列表上的動作**（例如會議記錄作廢）：用該列的版本。409 之後的「重新載入這筆」沒有輸入會丟失，所以不需要確認，直接重抓清單。
