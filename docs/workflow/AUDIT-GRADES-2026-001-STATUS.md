# AUDIT-GRADES-2026-001 — STATUS（R1，待審查）

TASK_ID: AUDIT-GRADES-2026-001
ROUND: R1
- 基準 HEAD `89671cbb`（已包含 AUDIT-TEMPLATES 的 `f01f0aba`、`1a90c04f`）。
- 差異見 `evidence/G.patch`（由 `make-patch.sh` 產生，SHA-256 見 `evidence/patch-sha256.txt`）。
  - `LanguageContext.tsx` 以 HEAD 為底，套用 `i18n_grades.py`，不含其他工作階段的修改；其他檔案只有本任務的修改。
- **共用檔**：只有 LanguageContext.tsx 和 DECISIONS.md（新增一條），都已事先通知協調中心。
- **schemas.py 沒有修改**：不加白名單，舊值 `fail`、`pending` 讀寫照常，已關閉的稽核原樣重存不會被判定為有修改。
- 尚未提交，也尚未上線。

## RESULT
- [ ] 待獨立審查

## 修改
| 檔案 | 內容 |
|---|---|
| `react-app/src/components/Audit/AuditWizard.tsx` | 第 5 步：<br>• 每題 4 個結果按鈕（符合／正面／主要／次要；title 雙語，`data-grade`，`aria-pressed`）。再點一次已選的結果會清除。<br>• 舊資料的 `fail` 顯示「不符合（未分級）」標籤（`data-ungraded-fail`）。<br>• 統計卡片由 4 張改為 6 張：總項目、完成率（「已評 N」）、四級各一張。<br>• 頁尾圖例：四級；有舊 fail 時另列「不符合（未分級）」；未評。<br>• `isFilledItem` 改為四級加 fail 都算已填（模板取消勾選時要保留的題目）。<br>• 移除沒用到的 `AlertCircle`。CRLF。 |
| `react-app/src/components/Audit/AuditPrintTemplate.tsx`、`Audit.print.css` | 三份列印：<br>• 結果文字改為四級；舊 fail 顯示「不符合（未分級） Fail」；未評顯示「未評 Not graded」。<br>• 報告摘要列出 Pass、Positive、Major、Minor、未評，有舊 fail 時才多一欄。<br>• 查檢表和報告的項目表拆成「條文內容」「查檢重點」兩欄，欄寬比例和 Word 相同。<br>• 查檢表的勾選框改為四級。 |
| `react-app/src/context/LanguageContext.tsx` | `statFail`、`legendWarning`、`legendFail` 改為 `statPositive`、`statMajor`、`statMinor`、`legendNotGraded`、`legendUngraded`、`legendPositive`、`legendMajor`、`legendMinor`；新增 `audit.grades.*Short`；`statCompleted` 改為「已評」。en、zh 都有。CRLF。 |
| `backend/services/audit_service.py` | Word 匯出：<br>• `AUDIT_GRADES`、`_RESULT_TEXT`（四級加 fail）、`_UNGRADED_TEXT`。<br>• 計數：四級和 fail 算已評，完成率＝已評 ÷ 全部。<br>• 摘要表格同列印。<br>• 查檢表和報告的項目表拆欄，欄寬固定（報告 0.8／1.4／4.4／3.8／2.2／3.0／1.8 cm，查檢表 0.8／1.4／5.0／4.4／2.8／3.0 cm）。<br>• CRLF。 |
| `backend/tests/test_audit_export_docx_http.py` | 測試資料改成四級各一題、舊 fail、pending、無結果，共 7 題。驗證摘要（含 Fail (ungraded)）、各列文字、拆欄後的表頭與欄寬、查檢表的四級勾選框、非字串結果算未評，以及只有存在舊 fail 時才出現那一欄。 |
| `backend/scripts/verification/seed_audit_grades_review.py`（新） | AHB-GRADES-1（In Progress）和 AHB-GRADES-CLOSED-1（Closed），各 7 題。 |
| `react-app/tests-browser/audit-grades-check.mjs`（新） | 17 項，見證據。 |
| `react-app/tests-browser/audit-all-buttons-check.mjs` | 第 5 步和狀態矩陣改成四級按鈕；第 4 步的列印和 Word 檢查改成拆欄和四級勾選框（+131／−41）。 |
| `DECISIONS.md` | 新增「稽核結果四級與查檢表欄位」一條。 |

## 證據（`AUDIT-GRADES-2026-001-evidence/`）
- `frontend-checks.txt`：tsc、eslint（3 個檔案）、`npm test` 169/169、build，都是 0。
- `backend-tests.txt`：8 個 Audit 測試檔，94 passed、1 skipped（需要 git 的舊程式升級測試）。
- `browser-check.txt`：`audit-grades-check.mjs` 在全新的隔離 stack（3321）上，**ALL PASS（17 項）**：
  - 統計卡片：7 題，71%，已評 5。
  - 圖例：四級，不符合（未分級）1，未評 2。
  - 按鈕：每題 4 個按鈕，已存的結果對應正確。
  - 舊 fail 標籤：顯示；改評 Major 後消失，完成率不變。
  - 評一題未評的題目後為 86%；再點一次已選的結果會清除。
  - 儲存後的 status 正確。
  - 列印：報告摘要的數字和拆欄、查檢表的四級勾選框。
  - Word：報告和查檢表都正確，沒有 Attention。
  - 有舊 fail 的稽核：Word 和列印都有「不符合（未分級）」那一欄。
  - Closed 稽核：按鈕停用，點擊沒有反應。
  - 英文介面：按鈕和圖例為英文。
- `regress/`：其他既有的 Audit 檢查在 GRADES 候選上全部通過，結果如下表。

  - `audit-all-buttons-check` 已依新的第 5 步更新：
    - 改成新的四級按鈕、統計和圖例。
    - 狀態矩陣涵蓋四個結果按鈕。
    - 舊 fail 的標籤和摘要欄。
    - 列印和 Word 改用四級的文字。
  - 連續 2 次在全新 stack（3323）上執行，都是 **211 PASS、0 FAIL、3 待確認、0 SCRIPT-ERROR**；3 項待確認和以前相同（#14、#39、#103）。

  | 檢查 | 結果 |
  |---|---|
  | `audit-templates-check` | 36 |
  | `audit-buttons-check` | 31 |
  | `audit-agenda-check` | 17 |
  | `audit-print-template-check` | 18 |
  | `audit-export-docx-check` | 7 |
  | `audit-layout-check` | 16 |
  | `audit-ime-enter-check` | 3 |

## R1 審查後（2026-10-11）
- 獨立審查 R1：**PASS**（無必改），見 REVIEW。順手處理的建議：
  - 列印 `resultText` 只查 RESULT_TEXT 自身的 key，status 為 `'__proto__'`／`'constructor'` 時不再碰到 prototype（原本 `'__proto__'` 會讓列印崩潰）。
  - 第 5 步統計只算物件題目，和列印／Word 的過濾條件相同。
  - 過時註解、多餘空行。
  - `audit-grades-check` 加上 Word 摘要的實際數字（開放中與已結案稽核），以及「清除結果時 updatedAt 變成今天」。
- 使用者看過預覽後的決定（DECISIONS 已補）：
  - 1024 寬統計卡「窄螢幕改成 3×2」：`grid-cols-3 xl:grid-cols-6`。`audit-grades-check` 新增第 4 段，在 1024 寬檢查兩排、無橫向捲軸、無截字，在 1400 寬檢查一排。
  - 未評數量「放圖例就好」：不另做卡片。
  - 兩支測試原本用 `grid-cols-6` 找統計卡，改成以 `[data-stat=pass]` 的父元素定位。
- 候選版基準改為 **e880abb7**：協調中心通知下一批上線後正式站等於 e880abb7。
  - `git archive e880abb7` 加上 G.patch（sha256 見 patch-sha256.txt），套用乾淨。
  - 8 個檔案和工作樹逐一 cmp 相同。
  - 位置：`~/Documents/Qualitas-deploy-artifacts/AUDIT-GRADES-2026-001/cand-e880`。
- 在 cand-e880 上的實測結果：
  - 前端：tsc 0、eslint 0、unit 169/169、vite build 0（index-Cffl8vzT.js）。
  - 後端：audit 測試 94 passed、1 skipped（`DATABASE_URL=sqlite:///:memory:`）。
  - 瀏覽器回歸（`regress-e880/`）：

    | 檢查 | 結果 |
    |---|---|
    | grades | 19 |
    | templates | 36 |
    | buttons | 31 |
    | agenda | 17 |
    | print-template | 18 |
    | export-docx | 7 |
    | layout | 16 |
    | ime-enter | 3 |
    | all-buttons | 211 PASS／0 FAIL／3 待確認（同前）／0 SCRIPT-ERROR |

- R2 差異複查 **PASS**。之後依建議補強 `audit-grades-check` 第 2、4 段，以及 all-buttons 的檔頭說明（只改測試）。在 cand-e880 重跑 `audit-grades-check` 19/19。G.patch 重產後，和 cand-e880 比對 IDENTICAL。

- 使用者 2026-10-11 在 3322（cand-e880）看過第 5 步的 3×2 版面後回覆「OK」。
- 3.11 全套：協調中心在使用者確認之前，就先在 cand-e880 上用只讀掛載開跑，結果寫在 `py311-full-hub.txt`。

- **3.11 全套（協調中心在 cand-e880 上執行，layout /q）**：**2528 passed、17 skipped、pytest_exit=0**（12:11–13:03Z），輸出在 `evidence/py311-full-hub.txt`。
- 提交前 HEAD 已前進到 e0eff62c（ITP 的 2 個 commit，只改 ITP 的 3 個檔案）。和 G.patch 的 10 個檔案沒有重疊，所以 G.patch 在 HEAD 上套用乾淨。

## 下一步
提交（臨時 index）→ 把 hash 交給協調中心部署：後端只部署 `services/audit_service.py`；前端用協調中心的 hub-build-itp，也就是 cand-e880 加上已上線的 ITP 3 個檔。
