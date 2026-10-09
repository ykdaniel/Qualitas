# FORMS-2026-005 — 表單保護審查補正（第四輪，收尾，R1–R3）

延續 FORMS-2026-004，處理獨立審查第三次 REVISE 判定的 R1–R3（完整原文見
`docs/workflow/FORMS-2026-004-archive.md`）。本輪範圍刻意很小：R2–R5（MM 新建路徑、OSD 同視窗
重試、五表單文字斷言、NamingRules 導頁、隔離防誤用）**未重開**，未重跑整套 213 項瀏覽器驗證；
只處理 REVIEW 指出的三個收尾項目。

## R1 — MM 清空草稿路徑補齊 response/重讀/反向證明（已完成）

`forms-leave-guard-review-meetingminutes-subdraft.mjs` 的 scenario 4（填入行動項目草稿、明確
清空、再 Save）在 FORMS-2026-004 時只斷言 `apiCalls.length === 1`，沒有驗證該次保存的
response，也沒有驗證「放棄的草稿真的沒被寫入」——只驗證了「送出一次請求」，不能證明保存真的
成功、也不能排除草稿被意外寫入某處的可能。

本輪重寫 scenario 4：在已保存的會議記錄上，**同時**修改一個會持久化的欄位（會議標題，改為
`FORMS-2026-005 MM Explicit-Clear Test`）與明確清空行動項目草稿（先填入
`ABANDONED DRAFT — must never be saved`，再清空），按一次 Save。核對：

- 這一次保存（PUT）的 response status 2xx、body 的 `title` 確實反映新標題；
- response body 整體（`JSON.stringify`）不包含放棄的草稿文字；
- 以 raw GET 用同一筆記錄的 id 重讀，確認新標題已真正持久化，且記錄整體不含放棄的草稿文字；
- 另以 raw GET 查詢這筆會議對應的 FollowUp 清單，確認放棄的行動項目**沒有**被意外建立成一筆
  FollowUp（排除「草稿雖未在主表單出現，卻被某個旁路寫入」的可能）。

由於 scenario 4 本輪改變了這筆記錄的標題，scenario 4b（原本以舊標題 `FORMS-2026-004 MM
New-Meeting Test` 查找同一筆記錄）的查找文字同步更新為新標題，否則會因找不到該筆記錄而逾時
失敗——這是配合 scenario 4 行為改變的必要連動修正，不是獨立的新缺陷修正。

已充分驗證的 Add 路徑（scenario 2 的真正新建流程、scenario 4b 的既有記錄 Add-then-PUT）本輪
未重做。

`forms-leave-guard-review-meetingminutes-subdraft.mjs`：**51/51 通過**（原 44 項 + 本輪新增
7 項）。

## R2 — 證據輸出目錄不再共用，既有 004 證據已分流保存（已完成）

**問題**：六支場景腳本的 `OUT` 常數在 FORMS-2026-002 時取名為
`/private/tmp/claude-501/forms-2026-003-evidence`，之後 FORMS-2026-003/004 兩輪都沿用同一個
路徑與同一組檔名，導致後一輪的截圖會直接覆寫前一輪留在這個本機暫存目錄裡的舊檔案（repo 內
`docs/workflow/FORMS-2026-00N-evidence/` 的已封存證據本身不受影響，只是這個*暫存*輸出目錄被
多輪共用）。FORMS-2026-004 執行完畢後，產生的截圖從未被另外複製進
`docs/workflow/FORMS-2026-004-evidence/`，只留在上述暫存目錄裡。

**本輪處理**：

1. 盤點暫存目錄 `/private/tmp/claude-501/forms-2026-003-evidence` 裡現有的 51 個 `.png`
   檔案，比對目前六支場景腳本原始碼實際會輸出的檔名清單（48 個），交集的 **48 個**檔名完全
   吻合、且修改時間全部落在 `2026-10-03 17:25:57`–`17:30:03`（本輪對話中 FORMS-2026-004 瀏覽器
   驗證實際執行的時間窗）——判定這 48 個屬於 FORMS-2026-004，複製進新建的
   `docs/workflow/FORMS-2026-004-evidence/`，並寫 `INDEX.md` 索引（檔名/腳本/場景對照）。
2. 另外 3 個檔名（`osd-11-nav-blocked-while-pending.png`、`osd-09-delete-partial-404.png`、
   `mm-02-clean-save-succeeds.png`）不存在於目前任何腳本原始碼中、時間早於上述執行窗口
   26–33 分鐘，且檔名樣式對應 `docs/workflow/FORMS-2026-003-handoff.md` 描述過的更早期腳本
   版本——判定這些是更早一輪（FORMS-2026-003 或更早）殘留在同一暫存目錄裡的舊檔案，**未**
   複製、未改名、未冒充為本輪或 004 的證據，如實記錄在 `FORMS-2026-004-evidence/INDEX.md` 裡。
   本輪不宣稱 repo 內已封存的 `FORMS-2026-003-evidence/` 本身遭覆寫——目前查證只支持暫存輸出
   目錄被共用，沒有證據顯示 repo 內已封存的證據被覆蓋或遺失。
3. 六支場景腳本的 `OUT` 常數改為
   `process.env.FORMS_REVIEW_EVIDENCE_DIR || '/private/tmp/claude-501/forms-2026-005-evidence'`
   ——預設值已是本輪專屬目錄，且提供環境變數覆寫機制，未來每輪若需要也可用環境變數指定自己的
   輸出目錄，不再預設共用同一個路徑。
4. 本輪為補 R1 重新執行的 MM 腳本，輸出到新的 `/private/tmp/claude-501/forms-2026-005-evidence`
   （以 `FORMS_REVIEW_EVIDENCE_DIR` 指定），其中只有 scenario 4 的截圖
   （`mm-04-explicit-clear-then-saved.png`）是本輪真正新增的內容，已複製進新建的
   `docs/workflow/FORMS-2026-005-evidence/` 並寫索引；其餘重跑的場景截圖與
   `FORMS-2026-004-evidence/` 裡已保存的內容相同，未重複存放。

## R3 — 文件小幅校正（已完成）

- `docs/workflow/FORMS-2026-004-handoff.md` 裡描述種子腳本防護的文字，原稱
  `guard_if_required()`，更正為實際呼叫的函式：先以
  `os.environ.get(ENV_REQUIRE) != "1"` 直接拒絕，再呼叫
  `core.startup_guard.enforce_from_environment()`（讀碼重新核對
  `seed_forms_leave_guard_review.py` 確認）。更正採用附加說明的方式（標註
  「更正（FORMS-2026-005）」），原文保留未刪除，依 AGENTS.md「舊有交接文件只能補充更正或密碼
  遮蔽，不得刪除原始歷史」的慣例處理。種子腳本本身（`seed_forms_leave_guard_review.py`）與
  `isolated_stack.py` 本輪**未修改**——這只是修正描述文字，不是修改程式本身。
- `docs/workflow/FORMS-2026-004-handoff.md` 裡 NamingRules 的 detail 顯示那一行，原稱「刻意的
  例外」，更正為：這只是讀碼確認到的既有程式行為，`DECISIONS.md` 沒有任何條目核准這是刻意政策
  或已認可為友善；本輪不因此修改 `DocumentNamingRules.tsx` 本身（那會是業務/UX 決策，超出本輪
  授權範圍）。
- FORMS-2026-004 的 `STATUS.md`（現已封存於 `docs/workflow/FORMS-2026-004-archive.md`，依
  AGENTS.md 規則為唯讀、原文保留不改）裡 FILES_CHANGED/FILES_MODIFIED 誤將未修改的產品檔案
  （OSD.tsx、OSDModals.tsx、AuditWizard.tsx、MeetingMinutesModals.tsx）與未修改的測試腳本
  （Audit 的 subdraft 腳本）列在裡面——本輪不修改已封存的 004 STATUS，改為在本輪（005）
  STATUS.md 裡採用正確分類（見下方 FILES_CHANGED 僅列本輪實際新增/修改，未修改的檔案歸入
  「沿用／未修改」一節，不混在變更清單裡），並在此處明確記錄這項更正，供後續審查對照。

## 本輪未完成/未驗證項目（沿用既有限制，未擴大調查）

- OSD 的 `page.goBack()` 行為、提交後回應遺失、原生跨瀏覽器 `beforeunload` 提醒：沿用既有限制，
  本輪未調查。
- R2–R5（FORMS-2026-002/003/004 已接受的修正）本輪未重新驗證，依交辦明確不重開。

## 測試結果（本輪）

- `forms-leave-guard-review-meetingminutes-subdraft.mjs`：**51/51 通過**（本輪唯一重新執行的
  場景腳本；其餘五支腳本本輪未修改場景邏輯，僅改了 `OUT` 常數本身，未重新執行）。
- `node --check`：本輪所有被修改的 `.mjs` 檔案（六支場景腳本的 OUT 常數變更 + MM 腳本的 R1
  重寫）皆已通過語法檢查。
- `npm test` / `npm run build`：**本輪未修改任何產品程式碼**（react-app/src/**、backend/**
  皆未變更），依 TASK.md 第 4 條驗收標準略過重跑。
- 隔離堆疊：backend/vite 8200/3200，root `qualitas-manual-fdh1brxv`，`up` → `seed` → 執行 MM
  腳本 → `down`，已拆除並以 `lsof` 確認埠號釋放；使用者 8198/3198 全程監聽未受影響。

## 隔離與可重跑資產

沿用既有 9 支 `forms-leave-guard-review*.mjs` 與 1 支 vite launcher、1 支種子腳本；本輪只修改
MM 場景腳本本身（R1）與全部六支場景腳本的 `OUT` 常數（R2），其餘未改動。皆無硬編碼密碼。

## 結案（獨立審查 PASS，2026-10-03）

FORMS-2026-005 經獨立審查判定 **PASS**，見 `REVIEW.md`（TASK_ID: FORMS-2026-005）。表單保護
補正系列（FORMS-2026-001 至 005）到此結案，**不再開 FORMS-2026-006**。

審查明確區分兩種驗證，不混為一談：

- **執行者（Claude）本輪回報的實機瀏覽器驗證**：`forms-leave-guard-review-
  meetingminutes-subdraft.mjs` 在本輪自建隔離環境（backend/vite 8200/3200）中實際執行，
  **51/51 通過**（見上方「測試結果」一節）。
- **審查者（獨立審查）本次自行執行的腳本／證據核對**：對 `docs/workflow/FORMS-2026-004-
  evidence/` 的 48 張 PNG 逐檔做 SHA-256 雜湊比對，確認與來源暫存檔案內容一致（只證明搬移
  過程內容未被竄改，不等於重新驗證這些截圖所代表的場景本身）；對
  `docs/workflow/FORMS-2026-005-evidence/` 的 1 張 PNG 與索引做同樣核對；對本輪修改的六支
  `.mjs` 檔案執行 `node --check`；核對 004 handoff 的兩處用語更正（`ENV_REQUIRE` +
  `enforce_from_environment()`、撤回「刻意的例外」）是否確實落實。審查者本次**未**重新執行
  瀏覽器驗證，不將上述腳本/證據審查結果冒稱為獨立的實機複驗。

PASS 判定的範圍與限制（審查原文已明確指出，一併保留，不過度推論）：

- PASS 不代表可自動部署，也不代表系統內所有模組均已完整驗證。
- 歷次 REVISE（FORMS-2026-001/002/003/004 各自的 REQUIRED_FIXES）與各輪原始證據、
  `docs/workflow/FORMS-2026-00N-archive.md` 全數保留未改寫，不因最終 PASS 而刪除或美化先前
  的缺口記錄。
- 以下既有限制維持「已知未驗證」狀態，PASS 不代表它們已被解決：OSD 的 `page.goBack()` 行為、
  提交後回應遺失、原生跨瀏覽器 `beforeunload` 對話框行為。這些若需要處理，留待後續需求另行
  交辦，不在本系列既有範圍內自動展開。

本次文件結案僅同步 BACKLOG #50 與本檔的結案狀態，未新增測試、未重跑整套驗證、未修改任何產品
程式碼、未 commit/push/部署。
