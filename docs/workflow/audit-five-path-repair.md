# 五條已實測路徑的稽核交易修正

2026-09-22，由本次接手的協作者直接實作與驗證。不是全系統稽核完成聲明。

**文件更新（2026-09-23）**：第三批（ITP／Checklist／KM／Project）已完成並驗證，內容在文末。第一、二批（PQP／OBS／OSD／FAT／Contractor）維持原樣、本輪未動。

## 範圍

- PQP、OBS、OSD、FAT：只修正建立。
- Contractor：只修正更新。
- 其他更新、刪除、PQP 發布，以及其他模組均未在本批修正；授權、狀態與業務政策維持既有行為。

## 修正

Repository 在上述方法增加可選的 `commit=True`，預設仍立即提交。服務傳入 `commit=False`，先 flush 資料，再加入 strict 稽核，最後提交一次；例外由服務 rollback。PQP／OBS／OSD 取號前使用既有 `begin_write_transaction`，流水號與建立資料同一交易。FAT 使用 UUID，沒有新增流水號機制。

稽核仍使用原有動作、欄位與內容格式。本批修的是保存與回滾邊界，沒有補造歷史遺失資料，也沒有擴充稽核內容或聲稱所有附件內容均已去識別。

## 驗證方式

新增 `backend/tests/test_reviewed_audit_paths_http.py`。最小 FastAPI 應用掛載真實登入與五個模組路由；每個測試使用暫存檔案型 SQLite、每個請求獨立 Session，資料斷言使用新的 Session。不匯入 `main`，不啟動開發服務、排程或 seeder。

- 修改前：五項成功保存稽核的測試全部失敗，HTTP 200、業務資料存在，但對應稽核查無資料。
- 修改後：驗證成功時稽核、操作者與資料一起保存，而且只提交一次。
- 稽核呼叫、稽核物件建構、稽核 flush、commit 四種失敗，在五條路徑逐項驗證：資料、序號及稽核不變，服務明確 rollback，下一次請求可以成功。
- 無權限請求被拒且不改資料。
- Repository 未傳 commit 時的預設立即提交仍可由另一個 Session 讀到。

## 限制

未測正式環境、其他資料庫、瀏覽器與全套業務測試。沒有新增並行測試；取號沿用既有寫入鎖。既有工作區修改與行尾格式保留，未 commit、push 或部署。

## 本次最終測試結果

本次協作者實際執行：**264 passed、0 failed**，250.98 秒。包含新測試 40 項，以及 PQP／OBS／OSD／FAT service、integrity_fixes、integration_real_db、scope_all_modules、date_write_guard_http，總計 9 個測試檔。測試有既有相依套件棄用警告，未在本輪整理。這是相關集合，並非完整後端套件；前端未修改，未跑前端或瀏覽器測試。

## 第二批：同五個模組其餘寫入路徑（2026-09-22）

本批補齊 PQP／OBS／OSD／FAT 的更新及刪除、PQP 發布、FAT 明細更新、Contractor 建立及刪除，共 12 條路徑。連同第一批，這五個服務內現有的上述寫入方法均使用 strict 稽核和一次提交；不代表其他模組或所有追溯需求完成。

- Repository 預設 `commit=True` 不變；服務使用 `commit=False`，發生例外明確 rollback。
- PQP 發布的歷史快照、版本更新、PUBLISH 稽核一起保存或回滾；刪除的主列、歷史快照清除與 DELETE 稽核也是同一交易。
- PQP 發布原本在更新後才取稽核的舊狀態，會誤記為 Approved；現在先保存發布前狀態。
- 權限、資料範圍、狀態鎖及 Contractor 被引用時不可刪除等既有政策未改。沒有補造歷史稽核，也沒有新增並行鎖或聲稱解決發布版號競爭。

### 第二批驗證

新增 `test_remaining_audit_paths_http.py`，沿用第一批的真實登入、最小應用真實路由與暫存 SQLite fixture，不匯入 main。

- 修改前 12 條成功操作均回 200，但新 Session 查不到稽核，12 項測試全部失敗。
- 12 條路徑分別驗證稽核保存、操作者與動作、一次 commit；PQP 額外核對歷史及發布前後狀態。
- 每條路徑注入稽核呼叫、稽核建構、稽核 flush、commit 四種失敗，核對資料、歷史快照、序號及稽核不變，並可乾淨重試。
- 12 條路徑驗證權限拒絕且資料不變。
- 10 項驗證 Repository 預設仍立即提交。
- 三個舊 mock 測試只更新 delete 呼叫契約為 `commit=False`，保留原刪除／歷史清理斷言。

首次相關執行為 142 passed、3 failed；失敗皆是上述舊 mock 仍期待沒有 commit 參數。新增 HTTP 72 項全部通過。當次 pytest 已載入舊斷言後才編輯測試，因此不以該次執行代表最終測試版本；修正後另外重跑完整相關集合，最終結果另記如下。

第二批最終相關集合：**346 passed、0 failed**，289.19 秒。10 個檔案：兩個 audit_paths HTTP 測試檔、PQP／OBS／OSD／FAT service、integrity_fixes、integration_real_db、scope_all_modules、date_write_guard_http。新檔共 82 項。11398 個警告未在本輪整理。這是本次直接執行結果，不是完整後端套件；沒有前端變更，也未跑瀏覽器。

本輪未啟動開發服務、未匯入 main、未執行 commit／push／部署。測試資料與輸出位置使用暫存目錄；沒有宣稱僅凭本次測試結果即可確認整個系統的稽核或業務審閱完成。

## 第三批：ITP／Checklist／KM／Project（2026-09-23）

範圍：上一輪交辦但尚未處理的四個模組。先核對目前程式與既有測試，確認實際缺口，再修正。

- **ITP**：`create_itp`／`update_itp`／`delete_itp`／`update_itp_detail` 四條路徑，都是先由 repository 提交、稽核只 `db.add()` 沒有再提交的同一種問題（跟第一、二批的 PQP／OBS／OSD／FAT 同一種缺口）。
- **Checklist**：`update_checklist`／`delete_checklist` 在更早的 §17 範本與實例隔離強化（2026-09-19）時已經修過、直接繞過 repository 並自行單一交易提交，這次核對過**確認已經是對的、沒有重複修**。`create_checklist` 沒有修到，仍是舊寫法，這次補上。
- **KM**：`create_article`／`update_article`／`delete_article` 原本**完全沒有呼叫 `log_audit`**——不是「稽核遺失」，是從未寫過稽核；也沒有 `user_id`／`username` 參數可傳。這次補上稽核呼叫與參數，並讓路由把登入者傳進去。
- **Project**：`create_project`／`update_project`／`delete_project` 同樣**從未呼叫 `log_audit`**，服務層沒有 `user_id`／`username` 參數。這次比照 KM 補上。**Project 的寫入端點本身用角色「名稱」字串比對（`"admin"／"Admin"／"ADMIN"／"system_admin"`）把關，不是權限碼**——這件事本輪只核對、記錄現況，不擅自變更，方案另外列在下面。

### 修正

Repository 的 `create`／`update`／`delete`（Checklist 只有 `create`）新增可選 `commit=True`，預設仍立即提交；服務傳 `commit=False`，flush 之後才建立 strict 稽核，最後一次提交；任何例外由服務自己 rollback。ITP 取號前補上既有的 `begin_write_transaction`（跟 PQP／OBS／OSD 同一個模式，序號與建立資料同一交易；Checklist／KM／Project 不用取號，不需要）。KM／Project 的 `user_id`／`username` 從路由的 `current_user` 傳入服務。

稽核內容沿用既有的動作、欄位與格式（CREATE／UPDATE／DELETE／UPDATE_DETAIL；`old_value`／`new_value` 用既有的 `model_dump()` 或欄位快照）。這批修的是保存與回滾邊界（以及 KM／Project 補上原本完全沒有的稽核），沒有補造歷史遺失資料，沒有擴充稽核內容，也沒有動 ITP／Checklist／KM／Project 既有的權限、範圍、狀態鎖或業務規則。

### 驗證方式

新增 `backend/tests/test_itp_checklist_km_project_audit_http.py`，沿用第一、二批 `test_reviewed_audit_paths_http.py` 的寫法：最小 FastAPI 應用掛載真實登入與四個模組路由，暫存檔案型 SQLite，每個請求獨立 Session，資料斷言用新的 Session；不匯入 `main`，不啟動開發服務、排程或 seeder。因為 Project 的把關是角色名稱，測試另外準備了一個名稱正好是「Admin」的角色專門用於 Project 案例。

- **重現先於修正**：對 ITP 與 KM 各自把服務層暫時還原成修正前的寫法（ITP 用 `git diff` 反向套用整個檔案的變更，KM 因為同一檔案裡混了無關的既有改動、改用手動還原 `create_article` 方法本體這一段），確認「成功保存時稽核筆數為 0」「四種失敗注入時服務沒有主動 rollback」會讓對應測試失敗，然後才把程式改回修正後的版本、確認測試通過。Checklist 與 Project 沿用同一份修正邏輯（跟 ITP／KM 分屬同一種缺口：ITP／Checklist 是「稽核有寫但沒保存」，KM／Project 是「從未寫過稽核」），沒有對這兩個再重複整套還原驗證，只讓它們過同一份測試矩陣。
- 修改前：ITP 5 項測試失敗（成功保存的稽核比對、四種失敗注入的 rollback 斷言各一項）；KM 同樣 5 項失敗，錯誤現象一致（`assert rollbacks` 得到空清單，因為服務根本沒有寫稽核可失敗）。
- 修改後：四個模組的成功保存（稽核與資料同一次提交）、四種失敗注入（稽核呼叫本身、稽核物件建構、稽核 flush、commit 各自失敗時，資料、序號、稽核全部不變，服務明確 rollback，下一次請求可以乾淨重試）、成功時只提交一次、Repository 未傳 `commit` 時預設仍立即提交（可被另一個 Session 讀到）都逐項驗證。ITP／Checklist／KM 額外驗證無權限請求被拒且不改資料；Project 另外用一項測試記錄「一般權限帳號（沒有、也沒有對應的 Project 權限碼可以持有）呼叫建立得到 403『Admin role required』且資料不變」——這條只是釘住目前的把關方式，不代表這是正確或已核准的政策。
- 新測試 32 項全部通過。連同既有相關測試（`test_reviewed_audit_paths_http.py`、`test_remaining_audit_paths_http.py`、ITP／Checklist（12 個檔）／KM（4 個檔）／Project service、`scope_all_modules`、`integrity_fixes`、`integration_real_db`、`date_write_guard_http`，共 27 個檔）重跑：第一次執行有 1 項失敗——`test_project_service.py` 一個既有的 mock 單元測試斷言 `repo.delete()` 的舊呼叫契約（沒有 `commit=False`），跟第一、二批遇到的情況一樣，是契約變更該更新的既有測試，不是新缺陷；更新該行斷言後，最終相關集合：**578 passed、0 failed**，450.79 秒。

### Project 角色名稱授權——只核對，不擅自決定

`routers/projects.py::_require_admin` 直接比對登入者角色的「名稱」字串是否為 `admin`／`Admin`／`ADMIN`／`system_admin` 之一，完全不經過 IAM 的權限碼系統（`RoleChecker`）。核對到的具體影響：

- **前端已經假設不是這樣**：`Contractors.tsx`（Projects 目前唯一的管理入口，跟承包商同一頁）唯一的權限判斷是 `hasPermission('contractors:manage:all')`，新增／編輯按鈕依這個權限顯示。也就是說，一個持有 `contractors:manage:all`、但角色名稱不是那四個字串的使用者，畫面上看得到「新增 Project」的按鈕、填完表單送出，會得到後端 403「Admin role required」——這個訊息跟他實際持有的權限完全無關，使用者會做不完這件工作也不知道為什麼。
- **跟系統既有的「最後管理員」保護邏輯是兩套獨立的判斷**：`services/user_service.py::UserRepository.is_admin_role_name`（IAM 帳號安全那一輪，2026-09-20）用 NFKC 正規化＋大小寫不敏感的方式判斷「角色名稱是不是 admin」，只認 `admin` 一種拼法；`_require_admin` 是另一段獨立寫死的四字串比對，多認一個 `system_admin`、寫法也不同。同一個「是不是管理員」的問題，這個系統目前有兩套彼此不知道對方存在的判斷邏輯。
- **沒有 `projects:*` 這個權限命名空間**：目前系統裡其他每一個業務模組都有自己的 `view/create/update/delete`（有些還有 `approve`），唯獨 Project 完全沒有專屬權限碼。

**方案（三選一，或先做 C 當作跟其他方案無關的小整理，交由你決定，本輪未實作任何一項）**：

- **方案 A——沿用 `contractors:manage:all`**：把 `_require_admin` 換成 `RoleChecker(CONTRACTOR_MANAGE)`。跟前端目前的假設完全一致，不需要新增權限碼，改動最小。代價：「能管承包商」跟「能管 Projects」永久綁在一起，以後如果要分開授權（例如有人該管 Projects 但不該碰承包商資料），還要再拆一次。
- **方案 B——新增專屬的 `projects:manage:all`**：跟系統裡其他模組的命名慣例一致，長期最乾淨。需要：新增權限常數、寫進 `db_seeder.py` 的權限清單、決定現有哪些角色（至少目前依賴「角色叫 Admin」這個巧合在管理 Projects 的帳號）要被授予這個新權限、改路由。這是政策變更（誰在改動之後還能不能管 Projects 会真的改變），需要你先決定要不要連帶做一次遷移或人工授權，而不是我自己決定。
- **方案 C——保留角色名稱把關，但改用系統既有的 `is_admin_role_name`**：最小改動，只是把 `_require_admin` 裡那段獨立寫死的四字串比對，換成呼叫已經在用的同一個判斷函式（同時解決「`system_admin` 沒有對應的另一半保護邏輯」這個小的不一致）。**不解決**「完全繞過權限系統」這個根本問題，只是不再有兩套互相不知道對方存在的「什麼算管理員」定義。可以獨立於 A／B 之外先做，也可以不做。

我的建議是方案 B 最符合這個系統其他模組的一致做法，但因為會實際改變誰能做這件事，需要你先決定；如果暫時不想做政策變更，方案 A 改動最小且能立刻讓前端的假設成立；方案 C 是不涉及授權政策、隨時可做的小整理。

**已依你的決定實作方案 A（2026-09-28）**：`routers/projects.py` 的 `_require_admin`（比對角色名稱字串）已移除，三個寫入端點改用 `RoleChecker(CONTRACTOR_MANAGE)`——與 `Contractors.tsx` 前端「新增 Project」按鈕原本就在用的 `hasPermission('contractors:manage:all')` 一致，兩端現在檢查同一件事。未新增權限碼，未動 `db_seeder.py` 或任何角色的權限配置，讀取／範圍／稽核／引用刪除保護（`check_project_references`）維持原樣。詳細驗證結果見 [Projects 授權修正交接紀錄](projects-authorization-fix-handoff.md)。

### 限制

未測正式環境、其他資料庫、瀏覽器與全套業務測試。沒有新增並行測試（ITP 取號沿用既有的 `begin_write_transaction` 寫入鎖）。KM 的 `import_docx` 內部呼叫了這次修過的 `update_article`，所以現在會連帶產生一筆稽核，但呼叫端沒有把操作者傳進去，稽核會記成沒有操作者——這是本輪修正後才看得到的一個小殘留缺口，本輪沒有動它，留待之後處理，不是新引入的問題。既有工作區其他協作者的修改保留，未 commit、push 或部署。

### 本次最終測試結果

**578 passed、0 failed**，450.79 秒（27 個檔案：兩個新舊 audit-path HTTP 測試檔、ITP／Checklist（12）／KM（4）／Project service、`scope_all_modules`、`integrity_fixes`、`integration_real_db`、`date_write_guard_http`）。這是相關集合，不是完整後端套件；前端未修改，未跑前端或瀏覽器測試。`backend/uploads` 內容雜湊與基準一致；`backend/logs/app.log`（本輪結束時 22068755 位元組）與 `backend/qualitas.db`（修改時間變成 09-23 08:00:00）在本輪期間又有成長——本輪的所有測試都用暫存檔案型 SQLite、不匯入 `main`，沒有一次直接寫入這兩個檔案，來源維持先前歷次記錄的「未確認」，本輪沒有另外調查。
