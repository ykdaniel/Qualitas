# STATUS — IAM-USER-COMPANY-LABEL-2026-001

日期：2026-10-11　工作階段：IAM　基準：HEAD 232137ff　狀態：實作完成，等待審查與使用者看畫面

## 本輪修改
| 檔案 | 內容 |
|---|---|
| backend/models.py | `User.display_company`：綁定承包商時用該承包商縮寫，沒有縮寫就用全名；沒有綁定時，用 company_name 到公司清單比對名稱，有縮寫就顯示縮寫，否則照原文顯示。新增 import `object_session`。 |
| backend/services/user_service.py | `create_user`：公司去除前後空白後不可為空（400 "Company name is required"），存入去除空白後的值。`update_user`：送來的 company_name 先去除空白；變成空字串時回 400 "Company name cannot be cleared"。沒有送 company_name 的更新不受影響，舊帳號可以停用、重設密碼。檔案維持 CRLF。 |
| react-app/src/components/IAM/UserModal.tsx | 公司欄位從下拉選單改成文字欄位加上 datalist（公司清單的名稱，選項旁顯示縮寫）；新增帳號或已經有公司的帳號必填；舊帳號沒有公司時只顯示黃色提示，不擋存檔；送出前去除空白。 |
| react-app/src/components/IAM/UserScopeSection.tsx | 「承包商（選填）」下方新增說明 `iam.scope.contractorHint`。 |
| react-app/src/context/LanguageContext.tsx | 新增 `iam.companyHint`、`iam.companyRequired`、`iam.companyMissing`、`iam.scope.contractorHint`，中、英各一份，共 8 行，保留 CRLF。 |
| backend/tests/test_user_company_label_http.py | 新增 8 個測試（每個依 3 種 Admin 拼法各跑一次）。 |
| backend/tests/test_iam_user_security_http.py、test_login_no_env_password.py、test_seeder_permission_persistence.py、test_user_service.py | 建立帳號的測試資料補上 company_name。 |
| backend/scripts/verification/seed_iam_company_label_review.py | 隔離環境的審查用種子資料（只會寫入隔離資料庫）。 |

## 執行證據（實測）
- 後端：`python3 -m pytest` 跑 test_user_company_label_http、test_user_service、test_iam_user_security_http、test_iam_admin_role_boundary_http、test_obs_engineer_approval_identity、test_iam_admin_takeover_http、test_user_active_only_filter，結果 **346 passed**；使用拋棄式 DATABASE_URL，開發資料庫 qualitas.db 的雜湊前後相同。
- 新測試用在修改前的程式上（以 `git archive HEAD` 匯出到暫存目錄）：**15 failed／9 passed**。失敗的是 5 個新規則測試 × 3 種拼法；通過的是本來就應該通過的 3 個（舊帳號可停用、可重設密碼、綁定承包商沒有縮寫時顯示全名）。
- 前端：`tsc --noEmit` 通過；單元測試 164 pass／0 fail；eslint 對修改的 2 個檔案 0 警告。
- 隔離環境 8361／3361（isolated_stack.py，run 57d5c24a…），用內建瀏覽器實際操作：
  - IAM 清單的 Company 欄顯示 HL、C、RKS、TBC；沒有公司的帳號顯示 “-”。
  - 舊帳號（Legacy User）編輯時出現黃色提示；改成停用並存檔成功，畫面顯示 Inactive。
  - 「承包商（選填）」下方的說明有顯示。
  - 新增帳號不填公司：瀏覽器擋下（欄位 validity=false），視窗沒有關閉；datalist 顯示 Hailong=HL、TBC、廠商A=A、廠商B=B、廠商C=C。
  - 手打 TECO：建立成功，display_company=TECO。
  - NCR 新增表單的指派人選單：「王小明 / HL」「李四 / C」「陳大華 / RKS」「TBC Person / TBC」「teco_person / TECO」；停用的帳號不出現。

## 未測
- Python 3.11 全套測試（部署前由協調中心依流程執行）。
- OBS 簽核人實際核准一次，確認寫入的快照是縮寫；只讀過程式碼，`_approver_label` 使用的就是 display_company。
- Follow-up 指派人選單：只讀過程式碼，和 NCR 一樣使用 formatUserLabel。

## 審查後修正（2026-10-11，獨立審查 PASS 後處理低級發現 1、2、3 的一部分）
- 發現 1：UserModal 的黃色提示改成只在 `display_company` 也是空的時候才顯示。綁定承包商但沒填公司的舊帳號，選單上會顯示承包商縮寫，所以不再顯示「只會顯示名字」。
- 發現 2：user_service.update_user 遇到資料庫原本就沒有公司、又送來空白 company_name 時，把這個欄位當作沒送，不再回 400；新增測試 `test_blank_company_resent_for_account_without_one_is_not_a_change`。
- 發現 3（部分）：models.py 中 `User.company_name` 的過時註解已更新。iamStore.ts、api.ts、schemas.py 的註解，以及沒有用到的 `iam.companyNamePlaceholder` 留待之後清理；schemas.py 目前由其他工作階段修改中。
- 重跑結果：test_user_company_label_http、test_user_service、test_iam_user_security_http、test_obs_engineer_approval_identity，**132 passed**；開發資料庫沒有變動。tsc、eslint 都通過。user_service.py 維持全檔 CRLF（525/525）。
- 未處理：發現 4（iam-review.mjs、verify_iam_backend.py 這兩支舊腳本沒有填公司）、發現 5（效能，目前規模影響可以忽略）、發現 6（行為記錄，不需要修改）、發現 7（提示文字要不要補一句，等使用者決定）。

## 收尾（2026-10-11，使用者指示「把低優先的註解和舊腳本也順便清掉」）
- 發現 3：更新 schemas.py（UserBase.company_name、User.display_company）、iamStore.ts、api.ts 的註解，只改註解；刪除沒有用到的 `iam.companyNamePlaceholder`（中、英各 1 行，已用 grep 確認沒有任何引用）。
- 發現 4：tests-browser/iam-review.mjs §1 新增帳號時補填「公司」，§4b 的註解改成公司欄位已改為 input；scripts/verification/verify_iam_backend.py 建帳號時補上 company_name。
- schemas.py、LanguageContext.tsx 只提交本任務的行，Audit 尚未提交的修改留在工作樹。
