# FORMS-2026-004 — 表單保護審查補正（第三輪，R1–R6）

延續 FORMS-2026-003，處理獨立審查第二次 REVISE 判定的 R1–R6（完整原文見
`docs/workflow/FORMS-2026-003-archive.md`）。本輪聚焦「補齊證據本身是否真的證明了所宣稱的事」：
既有產品修正（Meeting Minutes 欄位擴大、OSD record-id promote、Audit createdId）全數保留未動，
只補強驗證方式與一項種子腳本的自我防護（R5 的 defense-in-depth，非產品程式碼）。

## R1 — MM 真正「新建會議」Add 路徑未被證明（已完成）

FORMS-2026-003 的「新建路徑」案例實際上先把會議存成已有記錄，再透過既有記錄專用的
`addActionItemNow`（立即 POST 一筆 FollowUp）新增行動項目——這條路徑本來就有獨立測試（原
scenario 3），並不是 `actionItemsDraft`（新建會議專用、本地暫存、隨主保存一次性 bulk-create）
真正被覆蓋。本輪重寫 scenario 2：在**真正未保存**的新建會議表單中，依序點擊「Add Topic」「Add
Sub-item」「+（行動項目草稿的新增按鈕，對應 `addActionItemDraft`）」，確認三個輸入框都被清空
（已被收進本地草稿狀態），再按一次主 Save，核對：

- 主 POST `/api/meeting-minutes/` 的 response status 2xx、body 的 `discussionLog` 已包含新增
  的主題與子項目；
- `/api/followup/bulk/` 的 response status 2xx、body 包含剛新增的行動項目標題，且
  `sourceReferenceNo` 正確指向這筆新會議剛產生的 documentNumber；
- raw GET `/api/meeting-minutes/{id}` 與 `/api/followup/?sourceModule=MEETING&sourceReferenceNo=...`
  （bypass UI/store）皆確認上述內容真的持久化，不是只有樂觀畫面顯示。

另補 scenario 4b：在**既有記錄**上 Add Topic 後按 Save（PUT，與新建會議的 POST 走不同程式碼
路徑），同樣核對 response body 與 raw GET 重讀。

`forms-leave-guard-review-meetingminutes-subdraft.mjs`：**44/44 通過**（原有 1a–4 的 23 項 +
本輪新增的 scenario 2 重寫與 scenario 4b，共新增 21 項斷言）。

## R2 — OSD 404 後佇列保留，但未在同一視窗重試（已完成）

FORMS-2026-003 的 scenario 5b 在首次刪除（一成功一 404）後只用 raw GET 確認 404 的檔案還在，
隨即結束——這能證明「404 沒被誤判成功」，但不能證明「同一視窗內的重試」真的只重送失敗的那一筆、
不會重送已成功刪除的那一筆（因為 404 本來就不會真的刪除後端檔案，即使重試邏輯整個壞掉、把
已成功的 id 也重新送一次 DELETE，這個檔案本來就已經不存在，單純用「404 檔案還在」這個斷言測不
出重送行為本身）。

本輪在同一個瀏覽器視窗內接續：解除 404 攔截，記錄新的 DELETE 呼叫（改用一個只記錄、不攔截的
route），再次點擊 Save。精確斷言：

- 只送出恰好一筆 DELETE，且目標正是先前 404 的那個 file id（不是已成功刪除的那個）；
- 視窗在重試成功後關閉；
- raw GET 重讀確認該檔案現在真的消失了。

`forms-leave-guard-review-osd.mjs`：**50/50 通過**（原有 44 項 + 本輪 scenario 5b 新增的重試
段落 6 項）。

## R3 — 五表單錯誤文字仍是弱斷言（已完成）

逐一讀碼五個表單各自的錯誤處理，找出瀏覽器 locale（`en`）下實際會顯示的**逐字**文案，取代原本
「非空字串即可」「`includes(模擬偵測字串)`」這類弱斷言：

| 表單 | 程式碼位置 | 實際文案（本輪核對後用於斷言） |
|---|---|---|
| OSD（主資料失敗） | `saveErrors.ts` describeSaveError 5xx 分支 → `saveFlow.failedKeep` | `Not saved — everything you entered is kept. Server error (HTTP 500). Try again later or contact an administrator.` |
| OSD（部分成功：附件失敗） | `OSDModals.tsx` applyOutcome 的 `saved-incomplete` 分支（硬編碼中文前綴，不經 `t()`） | `主資料已保存，但附件處理尚未完成：Server error (HTTP 500). Try again later or contact an administrator.` |
| Contractor | `ContractorModal.tsx` 的 bare `catch { toast.error(t('common.saveFailed')) }` | `Save Failed`（固定字串，完全不讀錯誤內容） |
| Project | `ProjectModal.tsx`，同上 | `Save Failed` |
| Role | `RoleManagement.tsx`/`RoleModal.tsx` 的 `getErrorMessage(err, "An error occurred")`，5xx 固定分支 | `伺服器處理資料時發生錯誤（HTTP 500），請稍後重試或聯絡管理員。 / Server error (HTTP 500), please retry later or contact an administrator.` |
| DocumentNamingRules | `DocumentNamingRules.tsx` 的非 403 分支，直接拼接 `detail` | `命名規則儲存失敗：${模擬的 detail 內容}`（此表單**不**像其他表單一樣隱藏 5xx body——**更正（FORMS-2026-005）**：這只是讀碼確認到的既有程式行為，不代表這是經核准的刻意政策或已被認可為「友善」；`DECISIONS.md` 沒有任何條目核准這個差異，本輪不因此修改程式本身，只是如實描述現況） |

同時補 Role 的成功 response status/body 與 raw GET 重讀（FORMS-2026-003 的版本只驗證了 request
的 postData 與 UI 重新開啟，從未驗證真正的 PUT response 或繞過 store 的重讀）。

`forms-leave-guard-review-role.mjs`：**27/27 通過**。
`forms-leave-guard-review-contractor-project.mjs`：**40/40 通過**（文字斷言收緊，案例數不變）。
`forms-leave-guard-review-naming-rules.mjs`：**30/30 通過**（含下方 R4 的導頁精確化）。

## R4 — NamingRules 導頁終點與 pending 提示定位不夠精確（已完成）

原本的斷言只檢查「URL 不包含 `/document-naming-rules`」——導到任何其他頁面（包含錯誤頁）都會
誤判通過。改為精確核對最終 URL 以 `/dashboard` 結尾（也就是真正點擊的那個連結）。

pending 提示原本用 `page.getByRole('button', {name:/^Saving/i})` 搜尋**整個頁面**，可能誤配表單
自身的 Save 按鈕（它在保存中也會顯示「Saving...」文字）。改為先用
`page.getByRole('heading', {name: 'Unsaved Changes'})`（對應 `LeaveGuard.tsx` 傳給
`ConfirmModal` 的 `title={t('common.unsavedChanges')}`）鎖定真正的離開確認對話框容器（往上兩層
`<div>` 祖先，對應 `ConfirmModal.tsx` 的 `modalHeader` → `modalContent` 結構），再在這個範圍內找
「Saving...」按鈕——這樣即使頁面上同時有表單自己的 Saving 按鈕，也不會被誤配。（最初嘗試用 CSS
class 字首比對，但 Vite 預設的 CSS Modules 命名是依檔案內容雜湊的 `_<local>_<hash>_<行號>`，不是
依檔名，字首比對會隨樣式檔內容變動而失效，改用語意化的標題文字錨點更穩定。）

## R5 — 隔離防誤用未核對 DB 與埠號歸屬（已完成）

`forms-leave-guard-review-isolation-guard.mjs` 新增兩項核對（在 FORMS-2026-003 已有的
marker/state/pid 存活檢查之上）：

1. `stack-state.json` 記錄的 `db` 路徑必須存在、必須是一般檔案，且必須真的位於宣稱的 `root` 之內
   （不能是指向別處的字串）。
2. 對 `backend_port`/`vite_port`，用 `lsof -nP -iTCP:<port> -sTCP:LISTEN -t` 找出**此刻真正**
   監聽該埠的 pid，必須與 `stack-state.json` 記錄的該行程 pid 一致——「pid 存活」不再等同於
   「這個 pid 就是監聽目標埠的那個行程」。

`forms-leave-guard-review-isolation-guard-selftest.mjs` 新增 4 項負向測試（DB 檔案不存在、DB
路徑在宣稱的 root 之外、埠號無人監聽但 pid 存活、埠號被無關 pid 佔用），並修正正控制組：原本的
正控制只填了測試自身的 pid、沒有 DB 檔案、也沒有真正監聽，本輪的正控制改為同時提供一個真實存在
的假 DB 檔案，並透過依賴注入（`listeningPid` 參數，預設走真正的 `lsof`，測試時注入一個誠實的
假函式）讓測試在不需要真正綁定網路埠的情況下，仍能驗證「guard 真的核對了埠號歸屬」這件事本身。
**13/13 通過**（原 9 項 + 本輪新增 4 項）。

另外，種子腳本 `seed_forms_leave_guard_review.py` 本輪新增明確的自我防護（在建立
`SessionLocal()` 之前）：**修正（FORMS-2026-005）**——實際新增的是先檢查
`os.environ.get(ENV_REQUIRE) != "1"` 時直接拒絕，再呼叫 `core.startup_guard` 的
`enforce_from_environment()`（重新核對 `DATABASE_URL`/`LOG_DIR`/upload root 是否真的落在
`QUALITAS_TEST_DB_ROOT` 之內），**不是**呼叫 `guard_if_required()`——後者本身只是「若
`ENV_REQUIRE` 不等於 `"1"` 就直接放行、什麼都不檢查」的條件式包裝，而本輪要的是「不等於 `"1"`
就直接拒絕」，所以改為直接核對旗標再呼叫 `enforce_from_environment()`，比沿用
`guard_if_required()` 更明確地拒絕而非靜默放行。FORMS-2026-003 時這個腳本完全依賴呼叫方
（`isolated_stack.py seed` 注入的 prelude）替它做隔離檢查，自己完全沒有防護——若有人忘記透過
`isolated_stack.py` 呼叫、直接 `python seed_forms_leave_guard_review.py` 並且環境裡的
`DATABASE_URL` 設錯，腳本原本會毫無防備地寫入。這是對種子腳本本身的 defense-in-depth 補強，
沒有修改 `isolated_stack.py` 或 `core/startup_guard.py` 本體（兩者皆唯讀，沿用既有能力）。

## R6 — 紀錄準確性（已完成）

本檔與 `STATUS.md` 精確區分「本輪新增」「本輪修改」「沿用前輪」；測試數量分開列「瀏覽器實機
斷言」（本輪在乾淨重建的隔離堆疊上執行：MM 44、OSD 50、NamingRules 30、Contractor+Project 40、
Role 27、Audit 22，合計 **213 項**）與「本地 guard 自測」（不需隔離堆疊、純函式層級：
isolation-guard-selftest **13 項**），不再合併成單一總數代替逐項驗收結論。

## 本輪未完成/未驗證項目（誠實列出，沿用前兩輪的既有限制，未擴大調查）

- **OSD 的 `page.goBack()` 行為**：本輪未重新調查，沿用 FORMS-2026-003 的「未下結論」記錄，GPT
  的本輪交辦也明確要求不擴大此項調查。
- **Contractor/Project 讀碼確認無唯讀程式碼路徑**：沿用 FORMS-2026-003 的讀碼證據，本輪未另外
  建立第三組帳號做瀏覽器層級重複驗證。
- **提交後回應遺失、原生跨瀏覽器 `beforeunload` 對話框行為**：TASK.md 明列可保留的限制，未驗證。

## 測試結果（本輪重新執行）

- `npm test -- --run`：**123 passed, 0 failed**。
- `npm run build`（含 tsc）：**成功**。
- 瀏覽器實機斷言（本輪在乾淨重建的隔離堆疊上執行，與本地 guard 自測分開計數）：
  - `forms-leave-guard-review-meetingminutes-subdraft.mjs`：44/44
  - `forms-leave-guard-review-osd.mjs`：50/50
  - `forms-leave-guard-review-naming-rules.mjs`：30/30（含唯讀場景）
  - `forms-leave-guard-review-contractor-project.mjs`：40/40
  - `forms-leave-guard-review-role.mjs`：27/27（含唯讀場景）
  - `forms-leave-guard-review-audit-subdraft.mjs`：22/22（本輪無新場景，重新執行確認沿用
    FORMS-2026-002 建立的案例依然通過）
  - 合計 **213 項**瀏覽器實機斷言。
- 本地 guard 自測（不需隔離堆疊，純函式層級）：
  - `forms-leave-guard-review-isolation-guard-selftest.mjs`：**13/13**。

## 隔離與可重跑資產

沿用 FORMS-2026-001/002/003 建立的 9 支 `forms-leave-guard-review*.mjs`（7 支場景腳本 + 1 支
共用隔離防誤用模組 + 1 支該模組的自我測試）與 1 支 vite launcher；種子腳本本輪新增
`ENV_REQUIRE` 強制檢查＋`enforce_from_environment()` 呼叫（見 R5；更正：FORMS-2026-005 修正此
處措辭前誤稱為 `guard_if_required()`，實際呼叫的函式不同，見上方 R5 段落的更正說明），其餘未
改動。皆無硬編碼密碼，重跑方式沿用
`seed_forms_leave_guard_review.py` 頂部 docstring 的說明。

## 埠號釋放

本輪使用的隔離堆疊（backend 8200 / vite 3200，root 為
`/private/var/folders/l3/76bnxp9x47159snm4w96_r6w0000gn/T/qualitas-manual-l1y4vjpb`）已於完成後
以 `isolated_stack.py down` 拆除，並以 `lsof` 確認埠號已釋放；使用者的 8198（backend）/3198
（vite）全程監聽未受影響，已核對（下方 git diff 之外另有 lsof 核對記錄於本次對話）。
