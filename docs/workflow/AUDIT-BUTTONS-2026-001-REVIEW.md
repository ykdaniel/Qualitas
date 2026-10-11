# AUDIT-BUTTONS-2026-001 — REVIEW（R3 獨立審查）

- 審查者：Claude（獨立審查，GPT 額度用盡，由使用者指定）
- TASK_ID: AUDIT-BUTTONS-2026-001
- ROUND: R3（R1、R2 都是 REVISE，原文見 `AUDIT-BUTTONS-2026-001-R1-REVISE-REVIEW-archive.md`、`-R2-REVISE-REVIEW-archive.md`）
- 審查日期：2026-10-11
- 基準：候選樹 = `git archive 35e64cfa`（目前 HEAD）+ `evidence/G.patch`，解在 `$TMPDIR`。
- 所有判定都以審查者自己跑出的結果為準，STATUS 只作對照。

## EVIDENCE_CHECK

### 1. 補丁
| 項目 | 結果 |
|---|---|
| G.patch SHA-256 | `cc027440b89e724a996d80aad3afdd04454173117ab41b3c1222479fcdd8d9b7`，**與 STATUS 一致**。G-R2.patch 仍是 `24e5d9fe…`，與 R2 相同 |
| 套用到 `git archive 35e64cfa` | `--check` 通過，可乾淨套上 |
| 檔案數 | **15 個**，與前兩輪相同。DECISIONS、validators、noi、MeetingMinutes 都不在補丁內 |
| HEAD 前進的影響 | 86932e29 到 35e64cfa 之間，只有 `LanguageContext.tsx` 和本輪的檔案重疊。改到的是 meeting 字串；`git diff HEAD` 顯示本輪仍只有 `stepAgenda` 中英各 1 行 |
| 與工作樹比對 | 15 個檔案全部逐位元組相同 |
| CRLF | audit_service.py 658/658、routers/audit.py 133/133、AuditWizard.tsx 1254/1254、auditStore.ts 141/141、LanguageContext.tsx 3098/3098，**全部保留 CRLF** |
| 檔案權限 | 沒有 old mode／new mode；index 為 100644；`git diff HEAD --summary` 沒有 mode 變更 |
| R2→R3 差異 | 只有 `AuditAgendaEditor.tsx`（午餐邏輯）、`audit-buttons-check.mjs`（7b 斷言調整，新增 7c）、`audit-agenda-check.mjs`（只改註解）。`LanguageContext.tsx` 不同只是因為基準不同。後端與其他前端檔案和 R1／R2 完全相同，前兩輪對這些部分的結論沿用 |

### 2. 後端
- 和 R1、R2 相同：kind 白名單（400 在 404 之前，判斷不看資料）、預設 report、plan／checklist 與列印模板一致、`AuditAgendaEntry.kind` 驗證、`_comparable` 的舊列相容（不會繞過其他欄位的鎖定）、Word 午餐灰底。
- 候選樹重新跑：8 個測試檔 **109 passed**（`DATABASE_URL=sqlite:////tmp/claude-501/abrev3/db/test.db`，Python 3.14.6）。

### 3. 前端：R2 必改（點擊被吞掉）
- **新的寫法**
  - 移除 blur 處理和 `committedDate`。
  - `update(id, 'date', value)` 在日期真的變動、而且不是午餐列自己時，立刻對帳：
    - 離開的那天如果已經沒有行程，就移除那天未改過的預設午餐；
    - 進入的那天如果原本沒有任何列，就補一列午餐。
  - 讀碼結果：邏輯正確、比 R2 單純。中間日期會在下一次變動時被清掉；離開日期欄時不會再改變表格。
- **審查者實測**（隔離環境 8321/3321，探針腳本放在 `$TMPDIR`）

  | 情境 | 結果 | 判定 |
  |---|---|---|
  | 新稽核，鍵盤輸入 `10012026`，還在欄位內 | 只有一列 `2026-10-01` 午餐，沒有 0002、0020、0202 | 通過 |
  | 接著直接用 `mouse.click` 按「儲存草稿」（footer 沒有貼底） | **第一下就送出 POST**；存入的資料為 1 列行程＋1 列午餐，沒有異常年份 | 通過 |
  | 清空日期後重新輸入 10/09，再按一下「儲存草稿」 | 第一下就送出 PUT；存入的資料只有 10/09 的行程和午餐 | 通過 |
  | zh-TW 介面，某天有兩列行程，新增一列後按 ↑ 三次 | 只有最終那天補了一列午餐，原本那天的資料不動 | 通過 |
  | 接著直接按一下「新增一列」 | 行程列 4→5，**點擊有效** | 通過 |
  | 用鍵盤改日期 | 舊那天的預設午餐被移除，新的那天只補一列 | 通過 |
  | 改過的午餐（remarks=keep） | 保留 | 通過（7b 有測） |
  | 清空日期 | 那天的預設午餐被移除，不補新的 | 通過 |

  **R2 的點擊被吞掉問題已解決，R1 的垃圾午餐列和孤立午餐列也沒有再出現。**
- **觀察（不必改）**
  - 如果某天只剩一列沒改過的預設午餐（例如使用者刪掉了那天唯一的行程），之後有其他列在輸入日期時經過那天又離開，那列午餐會被一起清掉。那天本來就沒有行程，清掉的又是預設值，屬於合理的整理，不算問題。
  - 刪除某天唯一的行程時，那天的午餐仍會留下。這和前一輪的看法相同：使用者主動刪除，可以接受。
  - 7c 第一項只記錄 `footerAtBottom`，沒有拿它做斷言。實測的值是 false，與 STATUS 的說法相符。
- **其他前端項目**：每一步的按鈕、Word 只在已儲存的紀錄出現、未儲存時擋下 Word 匯出、sticky 與列印、移除步驟列動畫、第 4 步標題、欄寬、中英文字串，都和前兩輪相同，重新跑也都通過。

### 4. 審查者自己跑的測試（R3 候選樹）
- **後端**：109 passed，exit 0。
- **前端**：tsc 0；eslint `--max-warnings 0`（5 個檔案）0；vite build 0，輸出到 `$TMPDIR`。
- **瀏覽器**：隔離環境 **8321/3321**，由 `isolated_stack.py` 啟動。vite launcher 是複製 3320 版本後改成 3321／8321，放在候選樹內，cacheDir 指向 `$TMPDIR`。每支腳本都在全新環境上跑：

  | 腳本 | PASS | FAIL | exit |
  |---|---|---|---|
  | audit-buttons-check | 31 | 0 | 0 |
  | audit-agenda-check | 17 | 0 | 0 |
  | audit-print-template-check | 18 | 0 | 0 |
  | audit-export-docx-check | 7 | 0 | 0 |
  | audit-layout-check | 16 | 0 | 0 |
  | audit-smoke-all | 23 | 0 | 0 |
  | audit-polish-check | 9 | 0 | 0 |
  | audit-ime-enter-check | 3 | 0 | 0 |

  合計 124 項，和 evidence `browser-check.txt` 的 PASS 數（124）、8 個 exit=0 一致。
- **關閉**：9 次 `down`（1 次探針環境＋8 次腳本環境）全部回報 `removed`。最後確認 8321、3321 都沒有程序在監聽。沒有碰 8320/3320、8198/3198、8240/3240，也沒有連正式站。
- **證據**
  - 截圖是 R3 候選樹產生的（07:37）。
  - 對照組 `browser-check-control-on-R2.txt`：R2 候選在 7c 兩項 FAIL（writes=0；行程列 2→2），exit=1，可以證明新測試抓得到 R2 的問題。
  - 後端與前端證據的數值都和審查者自己跑的一致。
- **Python 3.11**：尚未執行，**列為部署前提**。

## SCOPE_CHECK
- R3 只改了午餐對帳邏輯和對應的測試，在 R2 必改範圍內。
- 整輪的修改都符合 TASK：kind 參數與白名單、plan／checklist 的 Word、agenda 的 kind 與午餐灰底、舊列的比對相容、底部按鈕、改名、第 4 步標題、sticky、移除動畫、午餐預設、欄寬、測試。
- 模板庫沒有混進來；沒有範圍外的修改；工作樹裡其他工作階段的修改都不在補丁內。

## DECISIONS_CHECK
- DECISIONS.md 沒有和本輪相關的既有政策，也沒有衝突。按鈕位置和 NCR 的 FormActions tools 一致，符合「版型與其他模組一致」。
- 午餐預設來自使用者的明確需求。「未改過的預設午餐跟著最後一個行程移除」是預設值的維護行為，沒有升格成新的業務規則。
- AGENTS.md：沒有新增 migration（agenda 是 JSON）、沒有改 production 設定、沒有 hardcode 秘密；router 用 HTTPException；前端 API 經由 services；CRLF 保留；沒有 commit、push 或部署。

## VERDICT
- [x] PASS
- [ ] REVISE
- [ ] HUMAN_REQUIRED

## REQUIRED_FIXES
- 無。

## NEXT_STEP
- **部署前提**
  1. 在最終候選樹上跑 **Python 3.11**。依協調中心指示，最終候選以正式站 AGENDA＋NOI 為基準。補丁要能乾淨套上，後端相關測試要通過；若最終候選和本審查的候選樹在這 15 個檔案上有差異，要先回報。
  2. 部署時**先重建後端，再切換前端**。新前端如果先上線，舊後端會忽略 `?kind=`，下載「-Plan／-Checklist」拿到的會是完整報告。
  3. 不需要 migration（agenda 的 kind 存在 JSON 裡）。
- 依使用者既有授權，PASS 且前提完成後即可 commit、push、部署。範圍只限本審查的 15 個檔案，加上 workflow 文件與證據，不包含工作樹裡其他工作階段的修改。
- 部署後可以考慮的後續（不屬於本輪）：刪除某天唯一的行程時，是否要一起移除那天未改過的預設午餐，可以問使用者偏好。
