# REVIEW — IAM-USER-COMPANY-LABEL-2026-001

日期：2026-10-11　審查者：獨立 Claude 審查 agent（只讀，未改任何程式檔）　基準：HEAD ecb196bb（TASK 寫的 232137ff 之後只多了 LIST-FILTER-FIX R2 的 commit，跟本任務的檔案沒有衝突）

## 結論：PASS

沒有阻擋上線的問題。下面 7 點都是低或資訊級，可以之後再處理，不必另開一輪。

## 執行內容（實測）
- 後端（Python 3.14，拋棄式 `DATABASE_URL=sqlite:///$TMPDIR/iamrev.*/t.db`、`LOG_DIR` 也放在暫存目錄）：
  `pytest` 跑 test_user_company_label_http、test_user_service、test_iam_user_security_http、test_iam_admin_role_boundary_http、test_obs_engineer_approval_identity、test_iam_admin_takeover_http、test_user_active_only_filter、test_login_no_env_password、test_seeder_permission_persistence、test_seeder_admin_initialisation，結果 **369 passed／0 failed**（09:00）。開發資料庫 backend/qualitas.db 的 sha1 前後都是 afa93c3cb43611c0，沒有變動。
  注意：這次測試跑在共用的工作目錄上，裡面也有其他工作階段還沒 commit 的修改（Audit 等）。
- 前端：`tsc --noEmit -p .` 通過（exit 0）；eslint 檢查 UserModal.tsx、UserScopeSection.tsx，0 個問題；`node scripts/run-unit-tests.mjs` 結果 169 pass／0 fail。
- 換行符號：user_service.py 523 行全是 CRLF（HEAD 是 510/510），LanguageContext.tsx 3328 行全是 CRLF，test_user_service.py 167 行全是 CRLF；models.py 和 UserModal.tsx 維持 LF。本任務在 LanguageContext.tsx 只新增 8 行 `iam.*`（中、英各 4 行），diff 的其餘 +132 行屬於 Audit 工作階段。
- 讀過的程式：models.py 的 `User.display_company`、user_service.py 的 create_user／update_user 全部、obs_service.py 的 `_approver_label` 和它的呼叫路徑、schemas.User 以及所有 response_model、core/security.get_current_user、iamStore 的 create／update payload、contractorsStore、db_seeder（走 crud.create_user）、所有呼叫 POST /iam/users 的測試、腳本和瀏覽器腳本。也用 grep 找過全後端與前端的 `display_company`、`formatUserLabel`。

## 確認沒有問題的地方
- 空白與 None：建立帳號時 `(company_name or "").strip()`，None、""、"   " 都回 400，存入的是去除空白後的值。更新時 `v is not None` 先把 null 當成「沒有送」，再去除空白，然後才跟資料庫原值比較，所以只差前後空白的重送不算變更，也不會寫稽核紀錄。
- 400 和 403 的順序：update 的「不得清空公司」檢查放在三個 403 檢查之後，非 Admin 改 Admin 帳號時仍先拿到 403。create 的公司檢查在 lock 和 Admin 角色 403 之前（見第 6 點），但是 RoleChecker 的 403（沒有 IAM 權限）在 router 依賴層就擋下，比 service 更早。既有預期 403 的測試都已經補上 company_name，也都通過了。
- 承包商名稱重複：`Contractor.name` 是 unique 欄位，`.first()` 不會遇到兩家同名公司。停用的承包商（status=inactive）仍然會用它的縮寫，這是合理的，因為公司沒變。被硬刪的承包商找不到時，會照原文顯示。
- `object_session` 為 None 時（例如沒有掛在 session 上的物件，或既有的單元測試）回傳原文，不會出錯。各 response_model 都在請求的 session 還開著時序列化；`get_current_user` 使用同一個 db session，所以 /auth/user/profile 也能拿到縮寫。
- autoflush：`_user_audit_snapshot` 不讀 display_company；update_user 在 commit 之後由 router 序列化時才查詢。OBS 的 `_apply_engineer_approval_identity` 在呼叫 `_approver_label` 之前，已經先執行 `db.query(models.User)`（同樣會 autoflush），而且這時 `d` 只是 dict，還沒寫到 ORM 物件上。所以新增的查詢不會帶來新的 flush 時機。
- 其他呼叫端：`formatUserLabel` 的 NCR、OBS、FollowUp 都只是顯示字串。IAM 清單的 Company 欄沒有欄位篩選，搜尋框也不搜公司，所以改成顯示縮寫後沒有篩選或搜尋失效的問題。db_seeder 走 crud.create_user，不經過 service，種子 admin 照舊沒有公司，屬於舊帳號情況，可以照常編輯。
- 前端：iamStore.updateUser 會把 null 原樣送出，後端視為沒有送，所以舊帳號可以停用、重設密碼；新增帳號的 payload 是 `company || null`，送出前已去除空白。`required` 放在 `fieldset disabled={readOnly}` 裡面，唯讀模式下瀏覽器不會驗證。只有空白的輸入可以通過原生 required，但會被 handleSubmit 的去除空白與檢查擋下並顯示 toast。datalist 用 unique 的 name 當 key。i18n 4 個鍵中、英都有。元件結構符合 AGENTS.md（hooks、事件處理、render 的順序）。
- 種子腳本 seed_iam_company_label_review.py 要求 `QUALITAS_REQUIRE_ISOLATED_DB=1` 並呼叫 `guard_if_required()`，只會寫入隔離資料庫。

## 發現（全部是低或資訊級，不擋 PASS）

1. **低｜react-app/src/components/IAM/UserModal.tsx:53、212–215｜綁定承包商的舊帳號，黃色提示內容不正確**
   情境：以前的說明文字 `iam.companyNamePlaceholder` 寫著「已綁定廠商的使用者可留空」，所以很多綁定承包商的帳號 company_name 是空的。這類帳號的 display_company 來自綁定的承包商（例如 HL），選單上其實會顯示「名字 / HL」。但是編輯時，黃色提示卻說「選單上只會顯示名字」，會讓管理者誤會。
   建議：只在 `!existingUser.display_company` 時顯示黃色提示，或者把文字改成不提選單效果，例如「此帳號尚未填公司，請選擇或輸入」。

2. **低｜backend/services/user_service.py:264–266、286–287｜舊帳號（company_name 為 NULL）收到 `company_name: ""` 會被拒絕**
   情境：資料庫裡是 None，比較 `None != ""` 會被當成變更，於是回 400「Company name cannot be cleared」。目前的 UI 對舊帳號送的是 null，所以不會觸發。但如果之後有呼叫端（腳本，或另一個「整筆重送」的表單）照原樣送空字串，舊帳號的停用或改名就會被擋，錯誤訊息也不對，因為根本沒有東西被清空。
   建議：去除空白後如果是空字串，而且資料庫原值本來就是空的（None 或只有空白），就把這個欄位從 `requested` 拿掉。也可以補一個測試：舊帳號送 `company_name: ""` 加 `is_active: false`，應該回 200。

3. **低｜backend/models.py:697–699；react-app/src/store/iamStore.ts:17–18；react-app/src/services/api.ts:329–333；backend/schemas.py:1363–1366、1388–1389｜註解過時**
   這些註解仍然寫著「承包商帳號顯示承包商全名」，以及承包商帳號的 company_name「stays unset/ignored」，跟新規則（顯示縮寫、所有新帳號都必須填公司）不一致。schemas.py 目前有其他工作階段在修改，可以之後再一起改。`iam.companyNamePlaceholder`（「已綁定廠商的使用者可留空」）已經沒有任何地方使用，但內容跟新規則矛盾，可以考慮刪除，或之後清理。

4. **低｜react-app/tests-browser/iam-review.mjs §1（約 47–66 行）、§4b 的註解；backend/scripts/verification/verify_iam_backend.py:66–73｜舊的驗證腳本沒有跟上新規則**
   iam-review.mjs §1 用畫面新增帳號時沒有填公司，現在會被 required 擋下，POST 不會送出。§4b 的註解說公司是 `<select>`，但現在已經是 input，不過它是挑「最後一個符合的 select」，實際上不受影響。verify_iam_backend.py 建立 john_doe 時沒有 company_name，現在會收到 400 並印出 FAIL。這兩支都是過去輪次的檢查腳本，沒有放進 CI。
   建議：下次重跑之前補上公司欄位，或在 STATUS 註明已經過時。

5. **資訊｜backend/models.py:743｜GET /iam/users 會對每個使用者多查一次**
   每個沒有綁定承包商、但有填 company_name 的使用者，都會多一次查詢（`Contractor.name` 有 index）。綁定承包商的使用者原本就有 vendor_ref 的 lazy load。NCR、OBS、FollowUp 的選單也是呼叫這支 API。以目前幾十個帳號的規模，影響可以忽略。如果帳號數量變成上百個，可以改成在 router 或 repository 一次查好名稱對縮寫的對照表，再傳進去。`_approver_label` 讀 display_company 兩次，所以會查兩次，也可以改成先存到區域變數。如果要更保險，可以把查詢包在 `with session.no_autoflush:` 裡面，避免這個 property 以後在 flush 途中被呼叫。

6. **資訊｜backend/services/user_service.py:194–196｜建立帳號時 400 比 Admin 角色的 403 先檢查**
   情境：有 IAM 建帳號權限的非 Admin，嘗試建立 Admin 角色的帳號，而且沒有填公司，會先拿到 400「Company name is required」，不是 403。這跟既有的 email／username 重複（400）也在 403 之前的做法一致，不會洩漏任何資訊，也沒有測試因此失敗，所以不需要修改。這裡只是記錄行為。

7. **資訊｜設計面｜綁定承包商的帳號仍然必須填公司，但標籤顯示的是綁定的承包商**
   這是使用者核准的 C 方案（「與綁定承包商無關」）。但是畫面上沒有說明「有綁定承包商時，選單顯示的是綁定的承包商」。如果帳號綁定 A 公司，卻填了 B 公司，管理者看到的會是 A，可能會困惑。目前的測試 `usermgr`（綁定 HL、公司填 Stale Label）就是這種情況，顯示的是 HL。建議之後在 `iam.companyHint` 或 `iam.scope.contractorHint` 加上一句說明。是否加入由使用者決定，不屬於這一輪。

## 範圍確認
本任務的 hunk 只有：models.py 的 import 和 display_company（AuditTemplate 那段屬於 Audit 工作階段）、user_service.py 的 3 段、UserModal.tsx、UserScopeSection.tsx 的 1 行、LanguageContext.tsx 的 8 行 `iam.*`、4 個既有測試補上 company_name、新的測試檔和種子腳本。沒有改 schema，沒有 migration，也沒有改既有資料，和 TASK 的範圍一致。

## 實作端處理（IAM 工作階段，2026-10-11）
發現 1、2 已修正；發現 3 已更新 models.py 的註解，其餘註解留待之後清理；發現 4–7 未處理，原因見 STATUS。修正只動了上述 hunk，相關測試 132 passed。修正後沒有再送審：修改都是審查建議的直接實作，加起來不到 10 行。
