# REVIEW — NAMING-RULES-CLEANUP-2026-001

審查者：獨立 Claude 審查代理，由「document naming rules」工作階段啟動。只讀，沒有改任何檔案。GPT 審查暫停中。
審查對象：獨立 worktree 的未提交改動，對 097ae3b8。

## R1 判定：PASS with notes（沒有必改）

### 審查者實測
- `npx tsc --noEmit`：exit 0；`npm test`：200/0；eslint（3 處）：無輸出。
- `pytest tests/test_settings_naming_rules.py`：10/10（本機 3.14，`$TMPDIR` 資料庫）。
- 換行符：settings.py 和 LanguageContext.tsx 改前改後都是 CRLF，沒有只有 LF 的行。
- LanguageContext：−26／+0，刪除的正好是指定的鍵。AGENTS.md：+1／−0。

### 核對結論
- 前端 `RULE_DISPLAYS` 的 13 個 id 與後端 `DEFAULT_NAMING_RULES` 完全一致。「前端認得、後端沒有」的規則不顯示，也有測試涵蓋。
- 存檔後用 PUT 回應重建狀態，`changedRules` 會歸零，離開提示會正確解除；存檔期間 fieldset 停用，回應不會覆蓋使用者正在改的值。
- FAT：不送出、不做前綴檢查，但仍參加重複前綴檢查。
- 前綴 trim：前後端一致；後端更新和新增兩條路徑都已修改。
- 刪除的翻譯鍵在 src、tests-unit、tests-browser、backend 都沒有地方用到，也沒有用字串組出鍵名的情況；materialText 的 zh／en 鍵集合由型別綁定，tsc 通過。
- 瀏覽器測試的 trim 檢查確實有效（比對的是含引號的完整字串，而且依賴用 PUT 回應重建狀態）。

### 發現與處理
| # | 嚴重度 | 內容 | 處理 |
|---|---|---|---|
| 1 | 建議 | materialText.ts zh 區塊殘留 `// naming rule` 註解，現在標在無關的鍵上 | **已改**：刪除該行 |
| 2 | 備註 | `changedRules` 比對未 trim 的值，只多空白也會被當成變更 | **已改**：改用 trim 後比對，並加單元測試 |
| 3 | 備註 | API 只回不歸本頁管的規則時，表格是空的、沒有說明 | 不改：GET 會補規則，實際碰不到 |
| 4 | 備註（之前就有） | 後端重複前綴檢查只比對 payload 內的規則 | 不改：前端已擋 FAT，風險小 |
| 5 | 備註（範圍外） | `shared-admin-review.mjs:46` 還在用 `[ABBREV]`，B3 後必定失敗 | 記為後續（見 STATUS） |
| 6 | 備註（之前就有） | `osdPrefixField` 實際抓的是 PQP 列，名字誤導 | 不改：測試本身正確 |
| 7 | 備註 | 「只差空白的重複前綴」測試在舊程式也會通過 | 已知：作為防退化；真正證明修正的是 `stores_the_prefix_trimmed` |

### 修正後重跑（作者）
tsc exit 0、eslint 0、npm test 200/0、瀏覽器測試 35/35。
