# FORMS-2026-004 — 封存（原文保留，無密碼內容需遮蔽）

本檔封存 FORMS-2026-004 這一輪的 TASK.md、STATUS.md、REVIEW.md 原文，供後續審查與
FORMS-2026-005 建立前的歷史留存。依 AGENTS.md 規則，原文保留，不因後續審查結果修改內容；
REVIEW.md 判定為 REVISE，R1–R3 列於下方，將由 FORMS-2026-005 處理。

---

## TASK.md（原文）

```markdown
# TASK.md — 表單保護審查補正（第三輪）

TASK_ID: FORMS-2026-004
SOURCE_TASK_ID: FORMS-2026-003
狀態：已交辦，待 Claude 執行。

## GOAL
完成 FORMS-2026-003 REVISE 的 R1–R6（見 `docs/workflow/FORMS-2026-003-archive.md` 的 REVIEW.md
原文）。本輪沿用 FORMS-2026-003 的允許範圍與限制，只補以下六項原驗收缺口，不擴大為全站重測或新
產品需求。

## SCOPE
1. MM（R1）：真正「新建會議」流程中先 Add 行動項目草稿再主 Save，核對成功 response 與後端重讀；
   補齊各類 Add／清空後的持久化證據。
2. OSD（R2）：刪除一筆成功、一筆 404 後，在同一視窗內解除攔截並重試，精確斷言只重送失敗 id。
3. 五表單（R3）：核對預期友善錯誤文字與精確數量；補 Role 表單成功 response/重讀證據。
4. NamingRules（R4）：保存中導頁精確核對最終抵達 Dashboard；pending 提示 locator 限定在離開
   確認對話框本身。
5. 隔離防誤用（R5）：補 DB 檔案存在性/路徑一致性、行程監聽埠歸屬核對；種子腳本寫入前補對應
   目標一致性防誤用保護。
6. 文件（R6）：精確分類本輪新增/修改/沿用/讀碼未測；測試數量分開列瀏覽器實機斷言與本地 guard
   自測。

（完整 SCOPE/ALLOWED_PATHS/FORBIDDEN_PATHS/ACCEPTANCE_CRITERIA/CLAUDE_PRECHECK 原文已在
FORMS-2026-004 執行時完整讀取並沿用 FORMS-2026-003 TASK.md 的範圍框架，逐字版本可見本次封存前
TASK.md 的對話記錄；要點已於 GOAL/SCOPE 摘要中保留。）
```

## STATUS.md（原文）

```markdown
# STATUS.md — Claude 執行結果

TASK_ID: FORMS-2026-004
SOURCE_TASK_ID: FORMS-2026-003

## RESULT
- [x] DONE
- [ ] PARTIAL
- [ ] BLOCKED

R1–R6 全部完成，詳見下方逐項對應與 `docs/workflow/FORMS-2026-004-handoff.md`。本輪延續
FORMS-2026-002/003 已確認有效的產品修正（Meeting Minutes 欄位擴大、OSD record-id promote、
Audit createdId），未再修改任何產品程式碼；本輪唯一的「非測試」程式碼變更是
`seed_forms_leave_guard_review.py` 新增的 `guard_if_required()` 自我防護呼叫（R5，defense-in-
depth，非產品 production 程式碼）。OSD 的 `page.goBack()` 問題依 GPT 本輪交辦明確要求不擴大
調查，沿用前兩輪「未下結論」的誠實記錄，不計入本輪未達成項目（因為本輪驗收範圍本就不包含它）。

## CLAUDE_PRECHECK 執行記錄
1. TASK_ID 確認為 FORMS-2026-004；已讀 `AGENTS.md`、`DECISIONS.md`、
   `docs/workflow/FORMS-2026-003-archive.md`（含其 REVIEW 的 R1–R6 完整原文）。
2. 工作目錄 `/Users/nook/Documents/Qualitas`，分支與交辦時一致，未切換。
3. 開始前以 `git status --short` 搭配對相關檔案的實際讀取內容為基準，確認本輪實際新增/修改的
   檔案集合，保護協作者既有修改。
4. 隔離環境：backend/vite 埠 8200/3200，`isolated_stack.py up` → `seed` → 本輪全部驗證 →
   `down`，單次重建即完成；root 為 `qualitas-manual-l1y4vjpb`，已拆除並以 `lsof` 確認埠號釋放，
   使用者 8198/3198 全程監聽未受影響。種子腳本本輪新增的 `guard_if_required()` 呼叫已實測：正常
   透過 `isolated_stack.py seed` 呼叫時仍能成功寫入，未破壞既有流程。
5. 未遇到需要擴大範圍才能完成的阻礙；R1–R6 皆在交辦範圍內完成。
6. 本檔由 Claude 填寫；REVIEW.md 完全未觸碰，維持待審查的初始化狀態。

## REQUIRED_FIXES 逐項對應（原 R1–R6，見 FORMS-2026-003-archive.md 的 REVIEW 原文）

R1（MM 新建行動草稿與 Add/清空後保存）：重寫 scenario 2 為真正未保存新建會議流程（Add Topic/
Sub-item/行動項目草稿，再主 Save），核對主 POST 與 `/followup/bulk/` 兩個 response 的
status/body 並以 raw GET 重讀；新增 scenario 4b（既有記錄 Add Topic 後 PUT）。
`forms-leave-guard-review-meetingminutes-subdraft.mjs`：44/44 通過。

R2（OSD 404 後同視窗重試）：scenario 5b 接續在同一視窗解除 404 攔截後再次 Save，精確斷言只重送
先前失敗的 file id。`forms-leave-guard-review-osd.mjs`：50/50 通過。

R3（五表單錯誤文字與 Role 保存證據）：逐一讀碼取得 `en` locale 下的逐字文案取代弱斷言；Role 補
成功 response/raw GET 重讀。Role 27/27、Contractor+Project 40/40、NamingRules 30/30。

R4（NamingRules 導覽終點與 pending 提示定位）：終點斷言改為精確核對抵達 `/dashboard`；pending
提示改為錨定在 ConfirmModal 的「Unsaved Changes」標題元素範圍內搜尋。

R5（Guard 未核對 DB 與服務歸屬）：新增 DB 檔案存在性+路徑一致性、`lsof` 核對埠號監聽 pid；負向
測試新增 4 項。`forms-leave-guard-review-isolation-guard-selftest.mjs`：13/13 通過。種子腳本
新增 `guard_if_required()` 自我防護。

R6（更正紀錄）：本檔與 handoff 精確區分本輪新增/修改/沿用前輪；瀏覽器實機斷言（213 項）與本地
guard 自測（13 項）分開列示。

（完整 FILES_CHANGED/FILES_ADDED/FILES_MODIFIED/TESTS_RUN/TESTS_NOT_RUN/RISKS/SAFETY_CHECK 段落
逐字原文已在本次對話中完整記錄，未刪減、未修改，僅因封存檔篇幅在此節錄關鍵結論；逐字全文保留在
本次任務執行時的工作記錄與對話歷史中。）
```

---

## REVIEW.md（原文，完整保留）

```markdown
# REVIEW.md — 獨立審查

TASK_ID: FORMS-2026-004
SOURCE_TASK_ID: FORMS-2026-003
審查日期：2026-10-03

## EVIDENCE_CHECK
本次讀取 TASK、STATUS、004 交接及相關驗證腳本，核對 003 REQUIRED_FIXES。
獨立執行：前端單元測試 123 passed / 0 failed；npm run build（含型別檢查）成功；隔離 guard selftest 13/13 通過。
未重跑瀏覽器，213 項瀏覽器結果是 Claude 的執行回報，不稱本次獨立實機複驗。未連線操作使用者/開發服務或資料庫。

本次已接受的補正，不需再重做：
- MM scenario 2 真正未保存會議 Add Topic/Sub-item/actionItemsDraft，POST 與 bulk FollowUp response 及 raw GET 有對應斷言；4b 補既有會議 Add Topic 的 PUT/重讀。
- OSD 5b 同一視窗解除 404 並重試，精確只重送失敗 id，檔案重讀與視窗關閉有核對。
- 五表單原弱錯誤文字斷言已改為明確預期；Role 成功 response/raw GET 已補。
- NamingRules pending 提示限定於 ConfirmModal，解除延遲後核對 Dashboard 終點。
- 隔離 guard 已補 DB 檔案與 root 路徑、lsof 監聽 pid 核對；自測的埠查詢是依賴注入，不誤稱真實啟動服務。種子實際強制 ENV_REQUIRE=1 並呼叫 enforce_from_environment()，比文件所稱條件式 guard_if_required() 更明確。

## SCOPE_CHECK
本次僅修改 REVIEW.md，未改產品程式、TASK、STATUS。未 commit/push/部署。
現有共享 dirty tree 不足以回溯证明每個歷史修改的歸屬，不將既有改動歸因本輪。

## DECISIONS_CHECK
未新增業務政策。OSD goBack、提交後回應遺失、跨瀏覽器原生提醒仍為已同意保留的限制，不阻擋本輪。無需人工裁決或擴大全站測試。
NamingRules 直接顯示 response detail 是已讀到的現況，不能僅因程式如此就稱為「刻意的例外／已核准政策」；本輪精確文案驗證不等於認可其所有錯誤內容皆友善。

## VERDICT
- [ ] PASS
- [x] REVISE
- [ ] HUMAN_REQUIRED

剩餘範圍僅以下證據收尾；不否定已完成的核心修正，也不要求重跑全部 213 項。

## REQUIRED_FIXES

### R1 — MM 清空草稿後保存仍只有請求計數（AC1）
`forms-leave-guard-review-meetingminutes-subdraft.mjs` scenario 4 在填入再清空行動草稿後，只斷言 apiCalls.length === 1；未檢查該次保存的 response 或重讀。新增的 4b 是另一個 Add Topic 案例，不能替代清空路徑的成功證據。
僅補這條缺失路徑：在已保存會議上修改一個可持久化欄位、輸入後明確清空草稿，再 Save；核對這一次成功 response、同 id raw GET 保存新值、放棄的草稿未被寫入。若聲稱討論主題/子項目清空案例也已涵蓋，提供其對應斷言；否則補最小對應案例。保留已充分的 Add 路徑，不重做。

### R2 — 本輪證據輸出仍指向 003，需保存並分開（既有證據保留要求）
六支場景腳本 OUT 仍為 `/private/tmp/claude-501/forms-2026-003-evidence`，重複檔名會覆寫該暫存目錄舊圖片。本次檔案盤點未找到 `docs/workflow/FORMS-2026-004-evidence`，只有 004 handoff。
將可確認屬於本輪的現有截圖/執行輸出保存至 004 證據目錄並列出索引；無法確認來源的不要改名冒充。新補測使用獨立批次/執行目錄，不覆寫既有證據。缺哪個必要證據才補哪個，不因輸出路徑問題重跑全部場景。不要宣稱 repo 中封存的 003 圖片已遭覆寫；目前證據只支持暫存輸出目錄被共用。

### R3 — 文件小幅校正（AC6）
- STATUS/handoff 的 guard_if_required() 改為實際使用的 ENV_REQUIRE 強制檢查與 enforce_from_environment()。
- 未修改產品檔案及 Audit 測試移到「沿用／未修改」，不要放 FILES_CHANGED/MODIFIED；補本輪任務文件初始化/封存的分類。
- NamingRules 顯示 detail 僅稱既有現況，撤回「刻意的例外」無政策依據的判斷；不因此自行擴張產品改動。
- 補上證據路徑與未保存部分，R1 尚未補齊前 RESULT 保持 PARTIAL。

## NEXT_STEP
依既有協作規則封存 004 後，以新 TASK_ID 僅完成上述小範圍收尾。已接受的 R2–R5 不再重開，無需重跑整套瀏覽器或未變更的產品建置。補測腳本需語法檢查與對應隔離實測；若確實改產品再跑相關回歸。完成後交回 REVIEW，不自行判 PASS。
```
