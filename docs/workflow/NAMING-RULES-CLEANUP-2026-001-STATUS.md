# STATUS — NAMING-RULES-CLEANUP-2026-001

基準：097ae3b8（獨立 detached worktree，不在共用 checkout 改）。範圍見同 ID 的 TASK。

## 本輪實際修改
| 檔案 | 改動 |
|---|---|
| `AGENTS.md` | +1 行（後端 Model 規範）：新增會產生文件編號的模組時，要在 `DEFAULT_NAMING_RULES` 加規則並附測試。依據：使用者原話「三項都同意」（見 TASK）。其他內容不動。 |
| `backend/routers/settings.py` | `update_naming_rules` 寫入時存 strip 後的前綴，更新和新增兩條路徑都改；檢查邏輯不變。CRLF 保留。 |
| `backend/tests/test_settings_naming_rules.py` | +2 測試：①存 strip 後的值（既有列＋新列）；②只差空白的重複前綴會被擋（防退化）。 |
| `react-app/src/components/DocumentNamingRules/namingRules.ts` | `mergeRules` 改為 `buildRules`：只顯示 API 回傳的規則，已知類型依頁面順序，未知類型以代碼接在後面，km 排除。新增 `toPayload`：trim、排除 unused、位數限制在 1–6。`changedRules` 改用 trim 後的前綴比對（審查備註 2）。 |
| `react-app/src/components/DocumentNamingRules/DocumentNamingRules.tsx` | `DEFAULT_RULE_DEFS` 改成 `RULE_DISPLAYS`，只留名稱鍵、備註、unused 和順序，不再寫死前綴與位數；初始狀態為空，載入前顯示「載入中」；存檔改送 `toPayload`，並用 PUT 回應重建頁面狀態。 |
| `react-app/src/components/DocumentNamingRules/DocumentNamingRules.module.css` | +`.loadingCell`（CRLF 保留）。 |
| `react-app/src/context/LanguageContext.tsx` | 只刪除 26 行：`namingRules.desc.*`（11 個）、`errorMissingAbbrev`、`hintContent`，中英文各一份。不新增。CRLF 保留。 |
| `react-app/src/components/MaterialSubmittal/materialText.ts` | 刪 `namingDesc` 中英文 2 行，以及沒有對象的 `// naming rule` 註解（審查建議 1）。 |
| `react-app/tests-unit/namingRules.test.ts` | 以 `buildRules`、`toPayload` 的測試取代 `mergeRules` 測試；`changedRules` 加上「只多空白不算變更」。 |
| `react-app/tests-browser/forms-leave-guard-review-naming-rules.mjs` | **B3 遺漏**：B3（097ae3b8）把規則改成 `[PROJECT]`、拒絕 `[ABBREV]`，但這支測試還在用 `QTS-RKS-[ABBREV]-…`。所以在 097ae3b8 上，它在「3. normal save」就會失敗：確認視窗出不來，因為前端檢查會擋下 `[ABBREV]`。本批把 11 處改成 `[PROJECT]`，並在正常存檔情境加 2 項 trim 檢查（送出值已 trim、存檔後輸入框顯示存進去的值）。協調中心同意併在本批。 |

不提交：`react-app/tests-browser/naming-rules-cleanup-vite-launcher.mjs`（本機啟動器）、`react-app/node_modules`（指向主 checkout 的 symlink）。

## 執行證據
| 項目 | 結果 | 類型 |
|---|---|---|
| `npx tsc --noEmit` | exit 0 | 實測 |
| eslint（DocumentNamingRules、materialText.ts、namingRules.test.ts，`--max-warnings 0`） | 0 | 實測 |
| `npm test` | 200 passed、0 failed | 實測 |
| `pytest tests/test_settings_naming_rules.py`（本機 3.14，DATABASE_URL 指向 `$TMPDIR`） | 10 passed | 實測 |
| 反向驗證：把 settings.py 換回 097ae3b8 版跑同一組測試 | `stores_the_prefix_trimmed` 失敗（1 failed、9 passed），之後已還原 | 實測 |
| 瀏覽器測試 `forms-leave-guard-review-naming-rules.mjs`（隔離 8361／3361，seed_forms_leave_guard_review） | 35/35 PASS，含唯讀帳號 | 實測 |
| 在 097ae3b8 版本上跑同一支舊測試 | 「3. normal save」TimeoutError（確認視窗未出現），證明是 B3 遺漏 | 實測 |
| Python 3.11 全套（`docs/workflow/py311-full-suite.sh`），跑在最終樹的副本 `/Users/nook/Documents/Qualitas/.claude/worktrees/jovial-ardinghelli-eff8b2/.py311-nrc-tree`（backend＋react-app，不含 node_modules）。副本與最終樹 `diff -rq`（排除 `__pycache__`）：**無差異**。結果檔的 head 欄是該 worktree 的 HEAD，不是 097ae3b8，以本列說明為準。第一次直接跑 scratchpad 的樹時，Docker 掛不到 `/private/tmp`，容器裡的 backend 是空的、pip 失敗、沒有跑任何測試，所以那次不算；腳本已由協調中心修正。 | **2773 passed、17 skipped、0 failed**，pytest_exit=0（Python 3.11.17，2026-10-14 12:40–13:38Z），見 evidence/py311-full-suite.txt；跑完已刪除副本 | 實測 |
| 隔離預覽給使用者確認（3361） | 待 3.11 完成後通知協調中心 | 待補 |

## 後續（不在本批）
- `react-app/tests-browser/shared-admin-review.mjs:46` 還在用 `QTS-REVIEW-[ABBREV]-NCR-`，而且沒有走確認視窗，在 B3 之後必定失敗，建議另案清理（審查備註 5）。
- 存檔失敗訊息改用拒絕對話框：REFUSAL 2b，以本批 commit 為基準，只改 `handleConfirmSave` 的 catch。
- STD 只給 ITP／CHECKLIST：NOI 的後續（B3 R1 P3-1）。
