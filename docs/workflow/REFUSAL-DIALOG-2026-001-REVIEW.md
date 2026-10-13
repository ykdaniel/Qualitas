# REFUSAL-DIALOG-2026-001 REVIEW

TASK_ID: REFUSAL-DIALOG-2026-001（第 1 批：共用彈跳視窗＋刪除流程）
審查者：獨立 Claude 審查代理（本工作階段開出，唯讀；GPT 審查依協調看板規則 6 暫停）
審查範圍：`git diff 07248220`（branch `feature/refusal-dialog-b1`）＋未追蹤的新檔；DESIGN 第 3–5 節；AGENTS.md。

## R1 結論：PASS with notes（沒有阻擋項）

### 應修（2）
| # | 問題 | 處理 |
|---|---|---|
| S1 | DESIGN 3.2 第三點（Audit 橫幅的 ×、OBS／OSD／會議記錄沒有按鈕的橫幅，都改成只用於載入失敗並附「重試」）沒有做，STATUS 也沒記為延後 | **延後到第 2 批**，已記入 STATUS 與 TASK。理由：OSD、會議記錄的 store 在存檔失敗時仍會寫入這個橫幅（add／update 屬第 2 批）。現在加「重試」，存檔失敗時又會出現「重試＝重新載入清單」的誤會；等第 2 批讓存檔也改用彈跳視窗後，再一起改。這批不會變差：刪除已經不會寫入橫幅 |
| S2 | 參數為 null（舊資料沒有編號）時，文字會留下 `{number}` | **已修**：`flatParams` 把 null／空字串顯示為「—」；新增單元測試 |

### 細項（nit）
| 項目 | 處理 |
|---|---|
| 後端測試自建 app，拿掉 main.py 的 handler 測試仍會過；沒有 NOI DELETE 的 HTTP 測試 | **已補**：靜態檢查 main.py 有註冊 handler（讀檔，不 import main）；新增 NOI 被 ITR 引用的 DELETE 測試 |
| 單元測試「每個代碼都有文字」太寬鬆，佔位符沒有對照後端參數 | **已補**：代碼與參數對照表（和後端代碼集合必須完全相同）、每個佔位符都要在後端參數中、ATTACHMENT_LOCKED 四種 kind 各自有文字 |
| AnyPermissionChecker 的多個權限是「其中一項」，文字寫成「需要 a、b」 | **已修**：多個權限時用 `PERMISSION_DENIED.anyOf`（「需要下列其中一項：…」） |
| 中文多一個空格：「會議記錄 的狀態為」「…紀錄 的來源 ITR」；PQP 按鈕是「Publish」不是「發行」 | **已修**：「這筆會議記錄的狀態為…」「是下列紀錄的來源 ITR：…」「請用「Publish」…」 |
| 沒有代碼的 403 帶說明時，顯示通用句加英文原文，與 DESIGN 3.1 第 4 點不同 | **刻意保留**：ScopeForbidden、「Not available to contractor-scoped accounts.」這類 403 的原文比「您沒有權限」更具體。DESIGN 3.1 第 4 點已補註 |
| `describeCoded` 回 null 時，視窗不顯示但 `current` 還在，會吃掉一次 Esc | **已修**：沒有可顯示的內容時，視窗自己關閉，不掛鍵盤監聽 |
| 沒人用的翻譯鍵：`noi.deleteBlocked`、`noi.citedBy.*`、`contractors.personnel.blocksDelete`、`itp.deleteError` | **保留不刪**：LanguageContext 是共用檔，REF-PROJECT-SEQ 會大改；刪除只會增加合併衝突。留給之後清理 |
| ITP／ITR／NCR／NOI 的刪除 catch 沒有 `console.error` | **已補** |
| `from core.refusals import …` 夾在 fastapi import 之間 | 不改（只是風格） |
| itp／projects 新的 `except ValueError`：若 strict `log_audit` 丟出 ValueError，會變成 400 | 不改：其他刪除路由本來就這樣處理，影響可忽略 |
| `t()` 用 `String.replace`，名稱含 `$&` 會被改寫 | 既有問題，不屬本批 |

### 審查者已驗證（摘要）
- 每個改到的英文 `detail` 都和原本一字不差。
- `Refusal` 是 ValueError 的子類別，ScopeForbidden 不會被新的 `except ValueError` 接走。
- handler 會保留 headers，參數都可以序列化成 JSON。
- `dependencies.py` 只改了兩個 403。
- `lock_reason`、`check_references_before_delete`、RoleChecker 的其他呼叫端行為都不變。
- 換行格式（CRLF／LF）沒有混用，也沒有整檔被改寫的情形。
- 15 個 store 的刪除動作，每個呼叫端都有接錯誤並呼叫 `showRefusal`，沒有地方依賴刪除時寫入的 `error`。
- 刪除成功時的流程不變。
- 視窗的焦點、Esc、Tab、z-index 與 401 處理都正確。
- 中英文鍵都齊全，佔位符和後端參數一致。
- 審查者實際執行：tsc、前端單元測試 184／184、eslint、`test_refusal_codes_http.py` 26 passed。

### 審查者未驗證
瀏覽器實測、後端全套測試、Python 3.11、KM 與 FileAttachment 刪除失敗的實際觸發。

## R1 修正後（主工作階段自行驗證，未再送審）
- 前端單元測試 185／185；tsc 通過；eslint 沒有新增問題。
- `test_refusal_codes_http.py` 28 passed（新增 NOI DELETE、main.py handler 註冊兩項）。
- 修正範圍只限上表標「已修／已補」的項目，沒有改到其他邏輯。
