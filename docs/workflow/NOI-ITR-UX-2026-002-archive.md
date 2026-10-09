# NOI-ITR-UX-2026-002 — 封存（原文保留；獨立審查 PASS 結案）

本檔封存 NOI-ITR-UX-2026-002 這一輪的 TASK.md、STATUS.md、REVIEW.md 原文。依 AGENTS.md
規則，原文保留，不因後續工作修改內容。REVIEW.md 判定為 **PASS**，NOI-ITR-UX 純審閱系列
（NOI-ITR-UX-2026-001/002）結案。下一批 NOI-ITR-NAV-2026-001 將正式修復這裡確認的導航
缺陷（屬於產品修正，不是純審閱）。

---

## TASK.md（原文，節錄要點；完整原文見本次對話記錄）

```markdown
# TASK.md — NOI↔ITR 關聯審閱：載入狀態與返回流程證據補齊

TASK_ID: NOI-ITR-UX-2026-002
SOURCE_TASK_ID: NOI-ITR-UX-2026-001
狀態：已交辦，待 Claude 執行。本批為純審閱，不修改產品程式碼。

## GOAL
NOI-ITR-UX-2026-001 的問題 1（導航缺陷）已被接受，不重開。本輪只補 R1（載入中/失敗狀態
未實機驗證）與 R2（返回流程未實機驗證，且問題 2 的分類需更正）。

## SCOPE
1. R1：實際延遲/模擬失敗 Related Documents 請求，截圖核對 loading/error/empty 三者區別，
   解除攔截後確認恢復。
2. R2：沿用已重現的導航缺陷，實際按瀏覽器返回，記錄真實結果；修正「只能重新搜尋」等
   未驗證敘述。
3. 問題 2 分類更正：複驗 ITR 與原始 ITR 標題相同，改列「已觀察到的 UX 辨識改善」，不稱
   缺陷，不得用編號大小推定原始/複驗關係。
4. 不新增第三項發現。不修改產品。

（完整 ALLOWED_PATHS/FORBIDDEN_PATHS/ACCEPTANCE_CRITERIA/CLAUDE_PRECHECK 逐字原文見本次
對話記錄，要點已於上方摘要中保留。）
```

## STATUS.md（原文，節錄關鍵段落；完整原文已在本次對話中逐字記錄）

```markdown
# STATUS.md — Claude 執行結果

TASK_ID: NOI-ITR-UX-2026-002
SOURCE_TASK_ID: NOI-ITR-UX-2026-001

## RESULT
- [x] DONE

R1/R2 與問題 2 的分類更正全部完成。本批未修改任何產品程式碼；問題 1（導航缺陷）未重新
驗證、未重開，直接沿用前一輪結論。

R1 實測：loading="Loading..."、error="Failed to load related documents."（模擬 500，
明確標註）、empty="No related documents yet."（真實無資料）——三者明確可區分。解除攔截後
皆確認恢復正常顯示。

R2 實測：沿用已確認的導航缺陷，實際按瀏覽器返回，URL 回到 /noi 列表頁，但「Edit NOI」
彈窗不會自動重開，需再點一次該筆 NOI；撤回前一輪「只能重新搜尋」的未驗證說法。另有手動
從 ITR 清單開啟/關閉的對照組。

問題 2 改列「已觀察到的 UX 辨識改善」，撤回用編號大小推定原始/複驗關係的措辭。問題 1
維持原分類「已重現的缺陷」，未重新驗證。

本輪未新增第三項發現。

（完整 CLAUDE_PRECHECK/隔離環境驗證/FILES_CHANGED/FILES_ADDED/RISKS/SAFETY_CHECK 段落
逐字原文已在本次對話中完整記錄，未刪減、未修改，僅因封存檔篇幅在此節錄關鍵結論。）
```

---

## REVIEW.md（原文，完整保留）

```markdown
# REVIEW.md — 獨立審查

TASK_ID: NOI-ITR-UX-2026-002
SOURCE_TASK_ID: NOI-ITR-UX-2026-001
審查日期：2026-10-03

## EVIDENCE_CHECK
已核對 TASK、STATUS、handoff 與 noi-itr-ux-review.mjs 全文；查看 loading/error/empty、兩張恢復、瀏覽器返回及手動關閉 ITR 截圖。另執行 node --check，通過。本審查未另啟隔離環境或重跑瀏覽器，操作結果及拆除情況引用本輪執行紀錄並與截圖交叉核對。

- R1：loading 與模擬 500 截圖分別顯示 Loading... 與 Failed to load related documents.，真實空資料顯示 No related documents yet.；恢復截圖顯示關聯紀錄重新出現。模擬與真實資料情境已分開標示。
- R2：腳本實際 page.goBack，返回截圖為 NOI 列表且沒有 Edit NOI 彈窗；另有手動開啟／關閉 ITR 的對照。前輪「只能重新搜尋」已撤回。本結論限本輪三筆資料的 Chromium 情境，不推論所有篩選／分頁／草稿恢復行為。
- 問題 2 已改列 UX 辨識改善，不把同名標題視為資料錯誤或用編號大小推定複驗關係。
- 本批是觀察審閱，腳本並非通過／失敗斷言套件；接受操作記錄與截圖證據，不將 10 張截圖換算為 10 項測試通過。原始碼裡的 log 陳述本身不是執行證據，須與執行紀錄／截圖共同使用。

## SCOPE_CHECK
沒有要求本輪實作產品修正；導航缺陷沿用前輪結論，為取得返回證據再次走過入口，不視為另開調查。未新增第三項發現。
本審查僅修改 REVIEW.md，未操作資料庫、服務或使用者環境。

## DECISIONS_CHECK
未新增授權、狀態門檻或業務政策。PASS 代表審閱工作完成，不代表已知導航缺陷已修復。

## VERDICT
- [x] PASS
- [ ] REVISE
- [ ] HUMAN_REQUIRED
R1/R2 與分類更正已滿足本批要求，純審閱結案。

## REQUIRED_FIXES
無阻擋本批結案的必要補正。

## NEXT_STEP
同步本輪 PASS 並封存後，下一個修復任務聚焦「NOI 關聯 ITR 點擊後開啟指定紀錄」。沿用既有 deep-link 與離開保護，核對 Cancel／成功保存／瀏覽器返回行為；不自動擴大到全站關聯導航、不新增複驗徽章、不修改授權或後端業務規則。新任務獨立記錄與驗證，保留本輪觀察限制。
```

---

## 補存：完整 TASK / STATUS 快照（來源：對話逐字稿，非摘要重建）

原封存的 TASK / STATUS 段落為摘要節錄，且引用「本次對話記錄」這個日後會失效的
參照。以下從本次對話的逐字稿檔案重新取出並補存當時完整內容，逐字核對無誤；
保留上文摘要不刪除，PASS 判定不變。

### TASK.md 完整快照

````markdown
# TASK.md — NOI↔ITR 關聯審閱：載入狀態與返回流程證據補齊

TASK_ID: NOI-ITR-UX-2026-002
SOURCE_TASK_ID: NOI-ITR-UX-2026-001
狀態：已交辦，待 Claude 執行。本批為純審閱，不修改產品程式碼。

## GOAL
NOI-ITR-UX-2026-001 的問題 1（點擊 Related Documents 的 ITR 導向未篩選總清單，不開啟
該筆紀錄）已被獨立審查接受為已重現缺陷，**不重開**。本輪只補 REVIEW 指出的 R1（載入中/
失敗狀態未實機驗證）與 R2（返回流程未實機驗證，且問題 2 的分類需更正）。

## SCOPE
1. **R1：實際驗證 loading／error／empty 三種畫面的區別**
   - 在自建隔離環境，針對 `RelatedDocuments` 發出的 `fetchRelated` 請求（打
     `/api/{module}/{id}/related` 這類端點，實際路徑以讀碼確認為準），分別：
     - **延遲**回應幾秒，截圖抓到畫面停在 loading 狀態時的實際文字/樣式。
     - **模擬失敗**（例如攔截該請求回傳 500 或直接讓請求失敗），截圖抓到 error 狀態的
       實際文字/樣式。
     - 與既有情境 A（`QTS-NIUP1-NOI-000001`，真正無關聯資料）的 empty 狀態畫面並列比較。
   - 三張截圖（loading/error/empty）都要清楚標示「這是模擬出來的情境」（例如截圖檔名或
     紀錄裡寫明是延遲/攔截模擬的），不得暗示或宣稱這是真實後端拒絕或真實網路延遲。
   - 解除攔截後，用現有的方式（例如重新整理頁面或重新打開該筆 NOI）確認畫面能正常恢復
     顯示正確的關聯資料，不需要為此新增任何重試功能或新的前端機制。
   - 不需要為了這個驗證重跑整條業務鏈或其他模組。
2. **R2：實際操作瀏覽器返回，記錄真實結果；修正未驗證的推論敘述**
   - 沿用 NOI-ITR-UX-2026-001 已重現的「點擊 Related Documents 的 ITR 導向
     `/itr` 未篩選總清單」這個缺陷（不重新驗證這個缺陷本身，直接沿用），接著**實際按
     瀏覽器的返回按鈕**，記錄：
     - 返回後的實際 URL 是什麼；
     - 是否回到原本那筆 NOI（`QTS-NIUP1-NOI-000003` 或其他測試情境）的畫面；
     - 如果回到 NOI 列表，「Edit NOI」那個視窗/彈窗是否自動重新開啟同一筆，還是列表頁
       本身（視窗已關閉，需要使用者自己再點一次那筆 NOI 才能重新打開）；
     - 如果上述自動鏈路因為已知的導航缺陷（問題 1）而無法完整執行到預期終點，明確標示
       「因為問題 1 這個缺陷，返回鏈路在這裡被阻斷」，不要用「應該會怎樣」之類的推測
       取代實際觀察到的畫面。
   - 如果瀏覽器返回之後，使用者還需要額外操作才能回到原本在看的那筆 NOI（例如需要再點
     一次該列），明確記錄「需要幾步」「是哪幾步」，不籠統寫「只能重新搜尋」這種先前被
     審查指出未經驗證的說法——除非返回後**實際測試發現**真的連列表上的搜尋/捲動都找不到
     （理論上不會，NOI 清單本來就在，只是沒有自動重開那個 modal），才能這樣寫。
   - 本輪的返回流程操作，額外測試：從 ITR 清單手動找到目標 ITR 並點開、再關閉，記錄
     關閉後落在哪個畫面（是否回到 ITR 清單、還是別的地方），作為「使用者自己手動完成
     整個來回」這個路徑的對照證據。
3. **問題 2 分類更正（不重新調查，只改措辭）**：
   - NOI-ITR-UX-2026-001 把「複驗 ITR 與原始 ITR 標題相同」列為「已重現的缺陷」，審查
     指出這個分類不成立——標題相同是 `create_reinspection()` 既有設計（逐字複製
     subject/description）的直接結果，資料本身沒有錯，使用者仍可透過文件編號/狀態/
     日期分辨，只是不夠直覺。本輪把這一項的分類改為「**已觀察到的 UX 辨識改善**」，
     不稱為缺陷，也不得用「同名」或「編號大小」本身去推定原始／複驗關係（這只是
     現象描述，不是判斷依據——真正的判斷依據是既有的 `isReInspection`/`originalItrId`
     欄位，這部分措辭維持不變）。
   - 問題 1（導航缺陷）維持原分類「已重現的缺陷」，不重新驗證、不重開調查，直接沿用
     NOI-ITR-UX-2026-001 的結論。
4. **不得新增第三項發現**：本輪只處理上述 R1/R2 與分類更正，不得因為在操作過程中注意到
   其他現象就另外列為新問題；若真的發現阻擋本輪 R1/R2 驗證本身的真實缺陷，先在 STATUS
   回報說明，不自行擴大範圍處理。
5. **不修改產品**：沿用前一輪限制，本批不改 `react-app/src/**`、`backend/**` 任何一行
   （除隔離測試種子腳本外）。

## ALLOWED_PATHS
- backend/scripts/verification/**（可沿用或微調既有 `seed_noi_itr_ux_review.py`，隔離
  測試種子腳本）
- react-app/tests-browser/**（若需要攔截/延遲請求來源自動化操作，新建或沿用隔離腳本；
  也可用互動式操作＋截圖的方式完成，不強制要求寫 Playwright 腳本）
- docs/workflow/NOI-ITR-UX-2026-002-handoff.md（新建）
- docs/workflow/NOI-ITR-UX-2026-002-evidence/**（新建，截圖）
- STATUS.md

## FORBIDDEN_PATHS
- react-app/src/**、backend/**（除上方明列的隔離測試種子腳本外）：本批純審閱，不修改。
- TASK.md、REVIEW.md、DECISIONS.md、AGENTS.md、所有既有 `docs/workflow/*-archive.md`、
  `docs/workflow/NOI-ITR-UX-2026-001-handoff.md`（前一輪 handoff，唯讀，不覆寫；本輪
  新增內容寫入 002 handoff）：執行者唯讀。
- 不重新驗證或重新調查問題 1（導航缺陷）本身，直接沿用前一輪結論。
- 不補翻譯、不新增狀態門檻或權限政策、不改授權或業務政策。
- 不操作或拆除使用者 8198/3198、日常開發 5173 及其後端；只用自建隔離環境。
- 不 stash/reset/checkout、不還原協作者修改、不 commit/push/部署。

## ACCEPTANCE_CRITERIA
1. R1：有三張截圖分別對應 loading（延遲模擬）、error（失敗模擬）、empty（真實無資料
   情境），每張都標明是否為模擬情境；文字內容各自記錄下來核對是否容易區分；解除攔截後
   確認畫面恢復正常顯示關聯資料的實機證據。
2. R2：有實際按瀏覽器返回按鈕後的 URL 與畫面截圖；明確記錄是否回到原 NOI、「Edit NOI」
   視窗是否自動重開；若因問題 1 導致鏈路中斷，明確標示在哪裡中斷，不用推測代替觀察。
3. 問題 2 的分類在 STATUS/handoff 裡明確改為「已觀察到的 UX 辨識改善」，不稱為缺陷，且
   不使用「同名/編號大小即可判斷原始複驗關係」這類措辭。
4. 不新增第三項發現；問題 1 的描述與分類維持前一輪結論，不重新驗證。
5. 完成後僅拆除本輪自建隔離堆疊並核對埠號釋放；不操作使用者 8198/3198。

## CLAUDE_PRECHECK
1. 核對 TASK_ID=NOI-ITR-UX-2026-002；讀 AGENTS.md、DECISIONS.md、
   `docs/workflow/NOI-ITR-UX-2026-001-archive.md`（含其 REVIEW 原文 R1/R2 完整內容）。
2. 核對工作目錄與目前分支，不自行切換。
3. 讀 `react-app/src/services/relatedService.ts`（或對應 fetch 呼叫處）確認
   `fetchRelated` 實際打的 API 路徑，再決定怎麼攔截/延遲這個請求。
4. 使用 `isolated_stack.py` 建立新環境（可沿用既有種子腳本的三種 NOI 情境，不需要重新
   設計資料）；實際操作並截圖取證 R1/R2。
5. 完成後由 Claude 填 STATUS.md（同 TASK_ID）；REVIEW.md 留待獨立審查，不自行勾 PASS。
````

### STATUS.md 完整快照

````markdown
# STATUS.md — Claude 執行結果

TASK_ID: NOI-ITR-UX-2026-002
SOURCE_TASK_ID: NOI-ITR-UX-2026-001

## RESULT
- [x] DONE
- [ ] PARTIAL
- [ ] BLOCKED

R1/R2 與問題 2 的分類更正全部完成，詳見下方與
`docs/workflow/NOI-ITR-UX-2026-002-handoff.md`。**本批未修改任何產品程式碼**（除隔離
測試種子腳本/審閱腳本外）；問題 1（導航缺陷）未重新驗證、未重開，直接沿用前一輪結論。

## CLAUDE_PRECHECK 執行記錄
1. TASK_ID 確認為 NOI-ITR-UX-2026-002；已讀 `AGENTS.md`、`DECISIONS.md`、
   `docs/workflow/NOI-ITR-UX-2026-001-archive.md`（含其 REVIEW 的 R1/R2 完整原文）。
2. 工作目錄 `/Users/nook/Documents/Qualitas`，分支與交辦時一致，未切換。
3. 讀 `react-app/src/services/relatedService.ts` 確認 `fetchRelated` 實際打
   `GET /{entityType}/{id}/related`，據此設計攔截/延遲的目標 URL pattern。
4. 使用 `isolated_stack.py` 建立新環境，沿用 NOI-ITR-UX-2026-001 已建立的三種 NOI 種子
   （未修改種子腳本），新建 `noi-itr-ux-review.mjs` 實際操作並記錄 R1/R2 的真實觀察。
5. 完成後拆除隔離堆疊並以 `lsof` 確認埠號釋放；未遇到需要擴大範圍才能完成的阻礙。

## R1 — loading／error／empty 實測結果（逐字記錄）

| 情境 | 取得方式 | 畫面文字 |
|---|---|---|
| loading | 攔截請求、刻意延遲回應後截圖 | `Loading...` |
| error | 攔截請求、回傳模擬 500（body 明確標註為模擬） | `Failed to load related documents.` |
| empty | 真實無關聯資料的既有情境（非模擬） | `No related documents yet.` |

三句文字彼此不同、語意清楚，**容易區分**，未發現會讓使用者誤判的情況。解除攔截後，
loading 情境釋放延遲、error 情境關閉重開同一筆 NOI，皆確認畫面正確恢復顯示真實關聯資料
（截圖見 handoff）。

## R2 — 瀏覽器返回實測結果（逐字記錄，撤回未驗證推論）

沿用已確認的導航缺陷（點擊 Related Documents 的 ITR 落地在未篩選的 `/itr` 總清單），
實際按瀏覽器返回按鈕：

- 返回後 URL：`/noi`（NOI 列表頁本身，不是停在 `/itr` 或跳到無關頁面）。
- 「Edit NOI」彈窗：**沒有**自動重新開啟，只看到列表頁。
- **更正後的精確描述**：使用者需要「再點一次」該筆 NOI 才能繼續操作，**不是**「重新
  搜尋」——前一輪「只能重新搜尋」的說法沒有實機證據支持，本輪撤回這個說法。瀏覽器自己
  的 history 機制確實能把使用者帶回正確的列表頁，只是不會重開特定的編輯彈窗。

另外測試手動從 `/itr` 清單直接開啟目標 ITR、再關閉，落地在 `/itr` 清單本身（符合預期，
這條路徑未經過 NOI，作為對照組，不是新發現）。

## 問題 2 分類更正
「複驗 ITR 與原始 ITR 標題相同」改列為「**已觀察到的 UX 辨識改善**」，不再稱為缺陷——
標題相同是 `create_reinspection()` 既有設計（逐字複製 subject/description）的直接結果，
資料本身沒有錯。同時撤回「可用文件編號大小推定原始/複驗關係」這類措辭，改為明確指出
真正的判斷依據是既有的 `isReInspection`/`originalItrId` 欄位（目前顯示層未讀出來用，
這部分觀察維持不變）。

## 問題 1（維持原分類，未重新驗證）
「點擊 Related Documents 的 ITR 導向未篩選總清單，不開啟該筆紀錄」維持「已重現的缺陷」
分類，完整重現步驟/根因/最小改善方案見
`docs/workflow/NOI-ITR-UX-2026-001-handoff.md`，本輪未重複驗證。

## 本輪未新增第三項發現
依交辦明確要求，過程中未發現需要另外回報的新現象。

## 隔離環境驗證
- 種子：沿用 `backend/scripts/verification/seed_noi_itr_ux_review.py`（本輪未修改）。
- 新建 `react-app/tests-browser/noi-itr-ux-review.mjs`：操作並記錄實際觀察的審閱腳本
  （非通過/失敗斷言），完整執行一次，10 張截圖取證。
- 隔離堆疊（backend/vite 8200/3200，root `qualitas-manual-po4nva6q`）已拆除，`lsof`
  確認埠號釋放；使用者 8198/3198 全程未受影響。

## FILES_CHANGED
無。本批未修改任何產品程式碼（`react-app/src/**`、`backend/**` 的既有檔案皆未變更）。

## FILES_ADDED
- `docs/workflow/NOI-ITR-UX-2026-001-archive.md` — 封存 NOI-ITR-UX-2026-001 的原始
  TASK/STATUS/REVIEW。
- `react-app/tests-browser/noi-itr-ux-review.mjs`（隔離瀏覽器審閱腳本）。
- `docs/workflow/NOI-ITR-UX-2026-002-handoff.md`（本輪交接文件）。
- `docs/workflow/NOI-ITR-UX-2026-002-evidence/`（10 張截圖）。

## FILES_DELETED
無。

## TESTS_RUN
本批為操作審閱，`noi-itr-ux-review.mjs` 性質是「操作並記錄實際觀察」的腳本，不是
通過/失敗斷言測試；完整執行一次，所有觀察皆已 log 並附截圖，見上方與 handoff。

## RISKS / LIMITATIONS
- R2 的瀏覽器返回行為只在 Chromium（Playwright 預設）測試過，未測試其他瀏覽器的返回
  行為是否一致。
- 本檔與 `docs/workflow/NOI-ITR-UX-2026-002-handoff.md` 僅反映本批範圍的審閱結果，不
  代表整個 NOI/ITR/NCR 鏈路已完成全面驗收。

## SAFETY_CHECK
- 未修改 `TASK.md`（本輪由 Claude 依使用者指示建立）、`DECISIONS.md`、`AGENTS.md`、任何
  既有 `docs/workflow/*-archive.md`、`docs/workflow/NOI-ITR-UX-2026-001-handoff.md`
  （前一輪 handoff，唯讀未覆寫）。`REVIEW.md` 已重置為待審查的交辦初始化狀態，**未自行
  填入任何審查結論**。
- 未修改任何產品程式碼；未補翻譯、未新增任何狀態門檻或權限政策、未改授權或業務政策。
- 未操作或拆除使用者 8198/3198、日常開發 5173 及其後端；只操作自建隔離堆疊（8200/3200，
  已拆除，以 `lsof` 確認埠號釋放，且核對 8198/3198 全程仍在監聽、未受影響）。
- 未使用 stash/reset/checkout；未還原協作者既有修改；未 commit/push/部署。
- 未將任何測試帳密寫入 repo——種子腳本沿用既有 `NOI_ITR_UX_REVIEW_PASSWORD` 環境變數
  機制（本輪重新以 `openssl rand -base64 18` 產生，審閱完成後已刪除暫存檔），本檔與
  交接文件均未出現明碼密碼。
````
