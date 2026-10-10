# AUDIT-POLISH-2026-001 — REVIEW（獨立審查）

審查者：獨立 Claude 審查代理（GPT 額度用盡，使用者 2026-10-09 於對話中指定）

TASK_ID: AUDIT-POLISH-2026-001
ROUND: R2（R1 REVISE 已封存為 `AUDIT-POLISH-2026-001-R1-REVISE-REVIEW-archive.md`）
審查範圍：只核對 R1 REQUIRED_FIXES 第 1 項是否正確修正，以及 R2 相對 R1 有沒有其他變動或退步。R1 其他範圍已在 R1 判定可接受，本輪不重審。

## EVIDENCE_CHECK
審查者自己重新跑過或比對過的項目（實測）：
- **D.patch 與 D-R1.patch 的差異**：`diff D-R1.patch D.patch` 的結果只有兩類：
  1. AuditWizard.tsx 新增 `isPlainEnter`（含 3 行註解），並把四個 `onKeyDown` 改成呼叫它。其餘差異只是後面 hunk 行號往後移 5 行，內容沒有變。
  2. 新增 `react-app/tests-browser/audit-ime-enter-check.mjs`。

  檔案清單只多了這個新檔。`r1-to-r2-AuditWizard.diff` 和這個結果一致。
- **候選樹 = HEAD + D.patch**：用 `git archive 6be70c12 backend react-app/src` 加上 `git apply D.patch`（只取 backend/ 與 react-app/src/）重建一份，和 `py311-src/backend`、`py311-src/react-app/src` 做 `diff -rq`，**完全相同**。
  - 工作樹中 D.patch 涉及的 11 個檔案，也逐一和重建樹 `cmp` 相同。
  - AuditWizard.tsx 的 sha256 是 `410022b5…c87c`，和 `r2-frontend-checks.txt` 記錄的一致。
- **部署產物確實是 R2**：
  - `frontend/src-export` 和 `py311-src/react-app/src` 相同。
  - `dist/assets/Audit-CCqM4Jjj.js` 裡有編譯後的條件 `a.key==="Enter"&&!a.nativeEvent.isComposing&&a.keyCode!==229`。
  - 這個檔案的 sha256 和 `upload/dist-manifest.sha256` 相同。
  - `frontend/` 和 `upload/` 底下的 `frontend-candidate.tgz` sha256 相同，也和 `uploads.sha256` 相同。
  - backend overlay 的兩個檔案 sha256 和工作樹相同（R2 沒有改後端）。
- **CRLF**：AuditWizard.tsx、auditStore.ts、LanguageContext.tsx、FollowUpIssue/columns.tsx、audit_service.py 在 HEAD 和工作樹都是全部 CRLF，沒有任何純 LF 行。新增的 mjs 是 LF，和其他 tests-browser 腳本一致。
- **前端檢查**（審查者自跑）：`tsc --noEmit` exit 0；`npm test` 144／144 pass；`eslint src/components/Audit src/store/auditStore.ts` exit 0。
- **後端測試會讀的前端檔**：`grep` backend/tests，只有 `test_itr_revoke_approval_acceptance.py` 會讀 `LanguageContext.tsx`。`test_integration_real_db.py` 只是註解提到 `NCR.tsx`。R2 沒有動 LanguageContext.tsx，所以 STATUS「R2 不影響後端測試」的推論成立。

**修正本身（讀碼判斷）**：`isPlainEnter = e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229`
- **Chrome／Edge（Chromium）**：用 Enter 確認選字的 keydown 是 `isComposing=true`、`keyCode=229`，兩個條件都會擋下。
- **Firefox**：組字中的 keydown 是 `isComposing=true`、`keyCode=229`，會擋下。
- **Safari（WebKit）**：先觸發 compositionend，再送出 `isComposing=false`、`keyCode=229` 的 keydown。R1 漏掉的就是這個情況，現在由 `keyCode !== 229` 擋下。這也對應 HEAD `onKeyPress` 在 229 時不會觸發的行為，R1 指出的退步已消除。
- **一般 Enter**（`key='Enter'`、`keyCode=13`、`isComposing=false`）仍會通過：
  - 新增項目 task 欄：`addCustomItem()`；
  - 編輯 task 欄：`saveEdit()`；
  - 編輯 clause 欄與第 5 步搜尋框：`preventDefault()`，避免隱式送出表單。

  四處都只換了條件，動作本身沒有變。
- **第 5 步搜尋框在輸入法狀態下會不會隱式送出**：
  - HEAD 這裡原本就是 `onKeyDown`，而且無條件 `preventDefault`。R1／R2 改成組字時不 `preventDefault`。
  - Blink、Gecko、WebKit 的隱式送出都綁在 Enter 的 **keypress** 預設動作上。輸入法消耗掉的 Enter（keyCode 229 或 isComposing）不會再送出 keypress（這和 R1 審查所說「HEAD 的 onKeyPress 在 229 時不觸發」是同一件事）。所以組字時不 `preventDefault` 也不會觸發 `<form onSubmit={handleSubmit}>`。
  - 和 HEAD 比，桌面瀏覽器沒有新增的隱式送出路徑。只有一個理論上的例外：某些 Android 虛擬鍵盤在沒有組字時，送出 `keyCode=229` 的 Enter keydown 之後仍然接著送 keypress。這種情況 R2 不會 `preventDefault`，但 HEAD 會。本系統以桌面使用為主，列為殘留風險，不阻擋。

**合成測試是否有意義**：
- 腳本在真實的 React 頁面上派送原生 KeyboardEvent，並覆寫 `keyCode`／`which`。React 的 SyntheticKeyboardEvent 在 keydown 時讀的是 `nativeEvent.keyCode`，所以這樣覆寫確實會經過 `isPlainEnter`。
- 三個情境分別只開一個條件：只有 229、只有 isComposing、都沒有。可以獨立證明兩個條件各自有效，正向的一般 Enter 也有驗到。
- 限制：
  - 只測了新增項目的 task 欄。編輯 task／clause 欄和第 5 步搜尋框共用同一個函式，屬於讀碼確認。
  - 腳本裡的 `count` 函式沒有用到。
  - 腳本裡的帳密是隔離環境的種子測試值，和既有腳本相同。

  以上都不影響結論。
- STATUS 明確寫出「沒有在真的 Safari 加輸入法上實測」，也說明 Safari 的事件順序是用 `keyCode 229` 加 `isComposing false` 重現的。這符合 R1 的要求（無法實測就標成讀碼），陳述誠實。

**Python 3.11 完整測試**：
- R2 沒有改後端，後端測試唯一會讀的前端檔也沒改。所以 R1 候選樹上的 3.11 結果可以沿用到 R2，**推論合理**。
- 但 `Qualitas-deploy-artifacts/AUDIT-POLISH-2026-001/py311-full-suite.txt` 目前（審查時間 2026-10-09 23:35 CST）只記錄到 `pip_exit=0`，**沒有 pytest 結果**。檔案時間是 23:23，看起來還在跑。
- STATUS R2 段寫「3.11 的結果仍然適用」，但結果其實還沒出來，用詞過早。STATUS 證據段寫的「執行中」才是準確的。這一點不影響本輪修正的判定，但仍是部署前提，見 NEXT_STEP。

## SCOPE_CHECK
- R2 相對 R1 只改了 AuditWizard.tsx 的四個 Enter 條件（加上共用的 `isPlainEnter`），另外新增一個瀏覽器檢查腳本。沒有其他程式變動，符合 R1 NEXT_STEP「R2 只核對這一處修正」的範圍。
- R1 的建議是兩個必修處（new-item task、edit task）加上兩個 preventDefault 處也一併修改。R2 四處都已改用同一個函式，比必修範圍多做的部分正是 R1 建議的。
- 回歸證據（`r2-browser-checks.txt`）：`audit-polish-check.mjs` 9 項 PASS；列印第 4 步 9 頁、第 5 步 13 頁，和 R1 相同。
- 工作樹裡另一個 session 的 material 模組改動（materials.py、material_service.py、schemas.py、test_material*.py 等）不在 D.patch 內，候選樹也沒有包含，不在本輪範圍。審查者沒有動到這些檔案。

## DECISIONS_CHECK
- R2 沒有新增或變更業務規則，D.patch 也不含 DECISIONS.md。
- 這次修正是恢復 HEAD `onKeyPress` 原有的「輸入法選字 Enter 不觸發動作」行為，不涉及任何未確認的政策。
- 符合 AGENTS.md：沒有新增裸 fetch、沒有 console.log、保留 CRLF、沒有 commit／push／部署。

## VERDICT
- [x] PASS
- [ ] REVISE
- [ ] HUMAN_REQUIRED

## REQUIRED_FIXES
無。

**不阻擋、供參考**：
- STATUS R2 段「3.11 的結果仍然適用」建議改成「3.11 完整測試在 R1 候選樹上執行中，後端在 R2 沒有變動，結果出來後可直接沿用」，並在結果出來後補上通過數字。
- `audit-ime-enter-check.mjs` 裡沒有用到的 `count` 可以刪掉。若之後要加強，可以把 edit task 欄和第 5 步搜尋框也納入同一個腳本。
- 殘留風險：某些 Android 虛擬鍵盤沒有組字時，Enter 也送 keyCode 229。這種情況下 Enter 不會新增項目（仍可按「+」），第 5 步搜尋框理論上也可能隱式送出。本系統以桌面使用為主，不要求處理。

## NEXT_STEP
- **部署前提**：`py311-full-suite.txt` 必須記錄到 pytest 完整通過（exit 0，沒有 failed／error）才可以部署。結果出來後在 STATUS 補上數字；如果有失敗，停止部署並回報。
- 3.11 通過後，依使用者 2026-10-07 的常態授權（PASS 加上準備完成就 commit／push／deploy），只部署本輪審查過的範圍：
  - commit 只納入 D.patch 列出的檔案；
  - 不要納入另一個 session 的 material 模組改動；
  - 不做會建立資料的 smoke test。
- 已準備好的部署產物（`upload/`、`nas-prep-output-r2.txt`）已經核對過，確認是 R2 版本，可以直接使用。
