# ITR-STATUS-2026-002 — 封存（原文保留，無密碼內容需遮蔽；獨立審查 PASS 結案）

本檔封存 ITR-STATUS-2026-002 這一輪的 TASK.md、STATUS.md、REVIEW.md 原文。依 AGENTS.md
規則，原文保留，不因後續工作修改內容。REVIEW.md 判定為 **PASS**，ITR 狀態轉換判斷基準修正
（ITR-STATUS-2026-001/002）結案，不再開 ITR-STATUS-2026-003。結案同步記錄見
`docs/workflow/ITR-STATUS-2026-002-handoff.md` 的「結案」一節與 `BACKLOG.md` #51 的對應
條目。

---

## TASK.md（原文）

```markdown
# TASK.md — ITR 狀態轉換判斷基準修正（證據補齊）

TASK_ID: ITR-STATUS-2026-002
SOURCE_TASK_ID: ITR-STATUS-2026-001
狀態：已交辦，待 Claude 執行。

## GOAL
ITR-STATUS-2026-001 的產品修正（`ITRModals.tsx` 的 `handleFieldChange` 改用
`persistedStatus`）已被獨立審查接受，**不重開、不重寫**。本輪只補齊 REVIEW 指出的驗收證據
缺口（見 `docs/workflow/ITR-STATUS-2026-001-archive.md` 的 REVIEW.md 原文 R1–R5）。

## SCOPE
1. 移除恆真斷言，改為精確判斷（R1）：count >= 0、|| true 等恆真條件移除，改用目標 modal
   欄位的存在/可見性精確判斷；新建取消改用 POST 計數或 id 集合比對。
2. Remark 要在第一次核准失敗「之前」就填入（R2）：核對遭拒後、改回狀態後皆保留，最終以
   response/raw GET 確認持久化；第一次遭拒額外核對實際 HTTP 回應。
3. 成功核准後重新開啟，核對鎖定與撤回入口（R3）：情境 D 核准成功後重開同一筆，核對 Status/
   Inspection Result 停用與 Revoke Approval 入口；不替代情境 C 的既有證據。
4. 核准權限回歸（R4）：既有後端測試回歸，或隔離帳號「有 update 無 approve」的直接拒絕案例，
   二擇一。
5. 更新 STATUS／handoff（R5）：精確列出有效斷言數與證據來源；補齊前標 PARTIAL。

（完整 SCOPE 細節、ALLOWED_PATHS/FORBIDDEN_PATHS/ACCEPTANCE_CRITERIA/CLAUDE_PRECHECK
逐字原文見本次對話記錄，要點已於上方摘要中保留。）
```

## STATUS.md（原文，節錄關鍵段落；完整原文已在本次對話中逐字記錄）

```markdown
# STATUS.md — Claude 執行結果

TASK_ID: ITR-STATUS-2026-002
SOURCE_TASK_ID: ITR-STATUS-2026-001

## RESULT
- [x] DONE

R1–R5 全部完成。產品修正本身（ITRModals.tsx 的 handleFieldChange）本輪未重開、未重寫；本輪
未修改任何產品程式碼，只重寫瀏覽器驗證腳本並執行一項既有後端測試回歸。

R1：新增 modalOpenFor() 以 Remark 欄位存在/可見性精確判斷 modal 開關，取代兩個恆真條件；
情境 B 改用 POST 請求計數（恰好 0 筆）與前後 id 集合比對。
R2：Remark 改在第一次核准保存之前填入；核對遭拒後畫面保留但後端未持久化、改回狀態後仍保留、
最終成功保存後 response body 與同 id raw GET 雙重確認；第一次遭拒額外核對 HTTP status 400
與 response body.detail。
R3：新增情境 D2，核准成功、modal 關閉後重新開啟同一筆，核對 Status/Inspection Result 停用、
Revoke Approval 入口存在。
R4：執行既有、未修改的 backend/tests/test_itr_approval_authority_http.py，8 passed。
R5：瀏覽器 42 項、後端既有測試 8 項分開列示；前一輪 8 張截圖因腳本改寫不再適用，如實保留原處，
本輪新增 9 張對應截圖。

TESTS_RUN：itr-status-revert-review.mjs 42/42；test_itr_approval_authority_http.py 8
passed；node --check 通過。npm test/build 本輪未修改產品程式碼，依規則略過。

（完整 CLAUDE_PRECHECK/FILES_CHANGED/FILES_ADDED/TESTS_NOT_RUN/RISKS/SAFETY_CHECK 段落
逐字原文已在本次對話中完整記錄，未刪減、未修改，僅因封存檔篇幅在此節錄關鍵結論。）
```

---

## REVIEW.md（原文，完整保留）

```markdown
# REVIEW.md — 獨立審查

TASK_ID: ITR-STATUS-2026-002
SOURCE_TASK_ID: ITR-STATUS-2026-001
審查日期：2026-10-03
目前狀態：獨立審查完成。

## EVIDENCE_CHECK
已核對 TASK.md 驗收條件、STATUS.md、ITR-STATUS-2026-002-handoff.md、itr-status-revert-review.mjs 與既有 test_itr_approval_authority_http.py。

- R1：原恆真斷言已移除。modal 判斷使用 Remark 欄位的存在與可見性；新建取消另核對 POST 次數為 0、前後 id 集合相同。
- R2：Remark 在第一次被拒的保存前填入；腳本核對 400 與 detail、拒絕後及改回狀態後的輸入保留，最後以成功 response 與同 id 重讀核對原值。
- R3：D2 在真正核准成功並關閉後重新開啟同筆紀錄，檢查 Status／Inspection Result 停用及 Revoke Approval 入口；與預先種入 Approved 的 C 情境分開。
- R4：STATUS 記錄既有核准授權測試本輪 8 passed。讀碼確認涵蓋無核准權限拒絕及合法核准等保護，符合 TASK 允許的既有後端測試方案。該檔直接呼叫路由／服務函式，雖檔名含 _http，不能稱為 8 次真實網路 HTTP 驗證。
- R5：腳本有效 check 呼叫共 42 項，本輪證據目錄共 9 張 PNG；與 STATUS 分開列示的後端 8 項一致。前輪截圖保留為歷史證據，不當成本輪截圖。

本審查實際執行 node --check，通過；並核對腳本斷言數、證據檔數與上述檔案內容。本審查未另重跑瀏覽器、後端測試或逐張視覺驗收截圖；42 項瀏覽器及 8 項後端執行結果引用 Claude 本輪 STATUS／交接紀錄，不宣稱由審查者獨立重跑。未修改產品程式，本轮略過 npm test／build 符合 TASK。

## SCOPE_CHECK
本輪補正集中於驗收腳本、證據與交接紀錄，未重開產品修正。共享工作目錄其餘既有修改不歸屬本輪。
本審查僅修改 REVIEW.md，未操作資料庫、服務或使用者 8198/3198 環境；執行端隔離堆疊拆除情況依 STATUS 記錄，未冒稱本審查重新驗證。

## DECISIONS_CHECK
修正仍採已保存狀態作為既有紀錄的轉換基準，新建模式不套用既有紀錄轉換檢查；未放寬後端核准授權或已核准鎖定規則。
BACKLOG #52 的 Q-Workflow 目前步驟文字維持待辦，不隨本輪結案，不新增業務政策。

## VERDICT
- [x] PASS
- [ ] REVISE
- [ ] HUMAN_REQUIRED
R1–R5 已符合本輪驗收要求。此結論限於 ITR-STATUS-2026-002 的補正範圍，不代表全系統或所有瀏覽器邊界皆已驗證。

## REQUIRED_FIXES
無阻擋結案的必要補正。

## NEXT_STEP
Claude 僅同步 BACKLOG 中本修正條目及 ITR-STATUS-2026-002-handoff.md 的 PASS 結論，保留歷次 REVISE、證據來源與未測限制。無需另開 ITR-STATUS-2026-003、重跑測試或改產品程式；#52 維持待辦。完成文件同步後停止，不 commit／push／部署。
```

## 結案同步（2026-10-03，由 Claude 依審查 NEXT_STEP 執行）
- `BACKLOG.md` #51 已追加 PASS 結案紀錄，明確區分 42 項瀏覽器實機驗證與 8 項後端既有測試
  回歸，不合併計數，也不宣稱審查者重新執行過。
- `docs/workflow/ITR-STATUS-2026-002-handoff.md` 已追加「結案」一節，同樣區分兩類驗證，
  並如實記錄審查指出的一點：`test_itr_approval_authority_http.py` 雖檔名含 `_http`，實際
  是直接呼叫路由/服務函式，不是真正的網路 HTTP 驗證。
- 此次同步未新增測試、未重跑測試、未修改任何產品程式碼、未 commit/push/部署。
