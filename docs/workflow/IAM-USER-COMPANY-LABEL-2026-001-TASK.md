# TASK — IAM-USER-COMPANY-LABEL-2026-001

日期：2026-10-11　工作階段：IAM　基準：HEAD 232137ff

## 背景
使用者擔心日後在選單上看到廠商人員的名字，卻不知道對方是哪一家公司，希望顯示成「名字 / 公司英文縮寫」。

## 使用者決定（2026-10-11，IAM 工作階段）
- A：「名字 / 公司」的公司改顯示公司清單（承包商清單）上的縮寫；沒有縮寫時顯示全名。
- C（調整後的版本）：公司名稱必填，與「綁定承包商」無關。
  - 新增帳號必須填寫公司。
  - 編輯時不能把已有的公司清空。
  - 本規則上線前就沒有公司的舊帳號，編輯時只顯示提示，不擋存檔；停用帳號、重設密碼不受影響（協調中心要求）。
- 公司欄位改成「可從清單選，也可直接輸入」（選項 1）。
- 「綁定承包商」旁邊加說明：綁定會限制此帳號只能看到該承包商的資料；只是要顯示公司，請填「公司」（協調中心要求）。

## 範圍
- backend/models.py：只改 `User.display_company`。
- backend/services/user_service.py：建立帳號時檢查公司必填；更新時不得清空公司。
- react-app/src/components/IAM/UserModal.tsx、UserScopeSection.tsx。
- react-app/src/context/LanguageContext.tsx：新增 iam.* 鍵（中、英各 4 個）。
- 測試：新增 backend/tests/test_user_company_label_http.py；既有建立帳號的測試補上 company_name。
- 不改資料庫 schema，不需要 migration，不改既有資料。

## 不在範圍
- 手打文字欄位（NCR 聯絡人、會議出席者等）不會自動帶出公司。
- 已經寫入 OBS 紀錄的核准人文字是當時的快照，不會改變；之後的新核准才會用縮寫。
- 會議記錄編號 `QTS-NA-MEETING-000001` 沒有廠商縮寫的問題，屬於會議記錄模組，另案處理。
