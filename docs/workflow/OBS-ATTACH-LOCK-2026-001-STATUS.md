# OBS-ATTACH-LOCK-2026-001 STATUS

TASK_ID: OBS-ATTACH-LOCK-2026-001
分支：`obs-attach-lock`（worktree nostalgic-roentgen-d70ba9），基準 `15612688`（REFUSAL-DIALOG 第 1 批）。只改後端與文件。

## 本輪實際修改
- `backend/core/attachment_access.py`
  - 新增 `OBS_LOCKED_STATUSES`／`obs_locked()`，內容與協調中心給的版本逐字相同，供 OBS-PRINT-PHOTOS 共用。
  - `lock_refusal` 在 `NEVER_LOCKED_CATEGORIES` 之後加 OBS 分支：Closed／Void 時所有類別的上傳、刪除都被擋，回 `kind=record`、`docType=OBS`。
  - 移除 `_LOCKED_CATEGORIES` 的 `("obs","Closed")`。
  - docstring 的鎖定表與 `PENDING_STATE_DECISIONS` 拿掉「OBS Void」「OBS Closed 只鎖兩類」，並把剩下的 LIMIT 說明改成只講 NCR。
- `DECISIONS.md`：新增一條「OBS 結案或作廢後照片與附件全部鎖定」，只加這一段。
- 測試（**改到的既有段落列在這裡，供協調中心和 NOI 的 D6 修改對齊**）：
  - `tests/test_attachment_authorization_http.py`
    - `CATEGORY_LOCKS`：刪除 3 筆 obs。
    - `test_a_closed_ncr_or_obs_locks_only_the_photo_categories_its_own_rules_lock` 改名為 `test_a_closed_ncr_locks_only_the_photo_categories_its_own_rules_lock`（只剩 NCR）。
    - 新增 `OBS_CATEGORIES`、`test_a_closed_or_void_obs_locks_every_photo_and_attachment`（Closed／Void × 3 類別；上傳與刪除都 409；改回 Open 後恢復）、`test_obs_locked_is_the_one_status_check`，放在 `test_the_same_records_are_open_to_uploads_while_they_are_not_locked` 之前。
    - `test_PENDING_DECISION_states_without_an_attachment_policy_are_not_locked_yet` 的參數拿掉 obs／Void。
  - `tests/test_attachment_hardening_http.py`
    - `test_an_EMPTY_category_is_dropped_…`：obs 的預期由 200 改為 409。
    - `test_on_a_closed_record_a_historical_unknown_category_cannot_be_deleted_but_an_open_record_can`：改成 ncr／obs 兩組參數。ncr 是類別鎖，驗證 deny-by-default 的路徑；obs 是整筆鎖。
    - `test_LIMIT_a_photo_can_still_be_added_to_a_closed_obs_or_ncr_by_labelling_it_attachment` 改名為 `test_LIMIT_a_photo_can_still_be_added_to_a_closed_ncr_by_labelling_it_attachment`，加上 OBS 兩類別都是 409 的斷言。
  - `tests/test_refusal_codes_http.py`：新增 `test_attachment_of_a_closed_or_void_obs_is_locked`（code、params、英文 detail）；fixture 的權限加上 `obs:update:all`。
- 不在本批：`services/obs_service.py`（OBS 紀錄本身的照片欄位）、前端，都由 OBS-PRINT-PHOTOS 處理（協調中心選 A）。

## 證據（實測）
- 附件相關：`test_attachment_authorization_http.py`、`test_attachment_hardening_http.py`、`test_refusal_codes_http.py`、`test_ncr_closure_photos_http.py` → 492 passed。
- 審查後補的測試：`test_refusal_codes_http.py` 加上 hardening 的歷史類別測試 → 32 passed。
- 後端全套：Python 3.14，沙箱外執行 → **2608 passed、1 skipped、0 failed**（55 分鐘）。這次在審查後補測試之前就開始跑；補的那兩個測試已另外跑過，見上一項。
- 沒有跑 Python 3.11（由協調中心在合批時跑）。前端沒有改，所以沒有跑前端測試。沒有做瀏覽器實測：本批只改後端；畫面上的鎖定說明由 OBS-PRINT 負責，刪除被擋時的彈跳視窗文字已由第 1 批的單元測試涵蓋。

## 前置條件
OBS-PRINT-PHOTOS 的「結案／作廢時擋下待上傳或待刪除的檔案」必須先上線（見 TASK）。
