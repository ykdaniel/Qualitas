# DEPLOY-SCOPE-INVENTORY-2026-001 — 部署範圍盤點（本機唯讀，未部署）

日期：2026-10-07（約 16:05–16:20Z）。執行者：Claude。未操作 NAS／正式站，未提交、推送、部署，未改產品程式。
證據目錄：`docs/workflow/DEPLOY-SCOPE-INVENTORY-2026-001-evidence/`。
標示：**［本機實測］**＝在本機以指令或建置驗證；**［推定］**＝依紀錄推論；**［未知］**＝未核對。

## 1. 基準：上一次前端部署對應哪個原始碼

- 最新提交 HEAD = `056c245c`（本機分支 `ui/sidebar-shell-preview`，比遠端追蹤分支領先 122 個提交，未推送）。
- 以 `git archive HEAD react-app` 匯出到暫存目錄（node_modules 以符號連結共用本機版本），`npm run build` 成功。產出 102 個檔案，與 2026-10-07 20:50（台北）上傳 NAS 的部署包 `qualitas-frontend-20261007b.tgz` **逐檔 SHA-256 完全相同**。［本機實測］
  - 證據：`frontend-HEAD-056c245c-build-sha256.txt`、`frontend-deployed-bundle-20261007b-sha256.txt`、`build-HEAD-056c245c.log`。
- 結論：上一次上傳的前端部署包＝HEAD `056c245c` 的前端原始碼建置結果。［本機實測］
- **正式站目前實際提供的前端是否仍是這個部署包：［未知］**（上傳當時僅確認兩個資產 URL 回 200，屬舊證據；本批未遠端核對）。
- 注意：這個基準本身包含 2026-10-07 早上未經獨立審查就部署的 ITP 編輯視窗與列表頁改動（見 `unrecorded-work-reconciliation-2026-10-07.md`，GPT 判為「可接受為現況，不等於整體驗收」）。它們已在基準內，**不是**本次新增部署範圍。

## 2. 目前工作樹相對 HEAD 的全部變更

`git status`／`git diff --ignore-cr-at-eol --stat`：

| 檔案 | 狀態 | 屬於部署？ | 來源批次（皆 PASS） |
|---|---|---|---|
| `react-app/src/components/ITP/ITPDetail.tsx` | 修改 | 前端 | ITP-CRITERIA-LAYOUT、ITP-REQUIRED-POLICY、ITP-LANG-FALLBACK |
| `react-app/src/components/ITP/ITPAdvancedEditor.tsx`（CRLF） | 修改 | 前端 | 同上 |
| `react-app/src/components/ITP/ITPModals.tsx` | 修改 | 前端 | ITP-LANG-FALLBACK、ITP-SUBJECT-WIDTH R1＋R2 |
| `react-app/src/components/ITP/ITP.module.css` | 修改 | 前端 | ITP-SUBJECT-WIDTH R2 |
| `react-app/src/components/Shared/FormShell.module.css` | 修改 | 前端（共用，只新增 class） | ITP-SUBJECT-WIDTH R1 |
| `react-app/src/context/LanguageContext.tsx`（CRLF） | 修改 | 前端 | ITP-REQUIRED-POLICY |
| `react-app/src/utils/itpItemValidation.ts` | 新增（未追蹤） | 前端 | ITP-REQUIRED-POLICY、ITP-LANG-FALLBACK |
| `backend/core/docx_builder.py` | 修改 | 後端 | DOCX-PATH-GUARD（產品 PASS） |
| `react-app/tests-unit/itpItemValidation.test.ts`、`backend/tests/test_docx_path_guard*.py` | 新增 | **否**（測試） | 各批次 |
| `backend/scripts/verification/seed_*`、`react-app/tests-browser/*-launcher.mjs` | 新增 | **否**（隔離驗收工具） | 各批次 |
| `BACKLOG.md`、`DECISIONS.md`、`TASK/STATUS/REVIEW.md`、`docs/workflow/*` | 修改／新增 | **否**（文件） | — |

- `react-app/src` 下沒有其他未追蹤檔案；`backend` 的應用程式目錄（core／routers／services／repositories／models／schemas／main）除 `docx_builder.py` 外無變更。`package.json`、`package-lock.json` 未變。［本機實測］

## 3. 已 PASS 版本與目前檔案是否一致（是否混有未審修改）

逐檔比對目前 SHA-256 與「最後一個改到該檔、且已 PASS 的批次」證據中記錄的雜湊：**11／11 相同**。［本機實測］

| 檔案 | 目前 SHA-256（前 12） | 對照證據 |
|---|---|---|
| ITPDetail.tsx | `44ac3c092207` | ITP-LANG-FALLBACK `tsc.txt` |
| ITPAdvancedEditor.tsx | `88c2e931a597` | ITP-LANG-FALLBACK |
| itpItemValidation.ts | `fba64764d8b4` | ITP-LANG-FALLBACK |
| itpItemValidation.test.ts | `2c78294ebc15` | ITP-LANG-FALLBACK |
| ITPModals.tsx | `51c74352bfcd` | ITP-SUBJECT-WIDTH R2 |
| ITP.module.css | `945e50ee318f` | ITP-SUBJECT-WIDTH R2 |
| FormShell.module.css | `3e9aa40c7d6c` | ITP-SUBJECT-WIDTH R1 |
| LanguageContext.tsx | `eeca6b2d8ca0` | ITP-REQUIRED-POLICY |
| docx_builder.py | `0e43664f4e60` | DOCX-PATH-GUARD `pytest-after-fix.txt` |
| test_docx_path_guard.py | `4222b14bdc40` | DOCX-PATH-GUARD |
| test_docx_path_guard_http.py | `8251ca31b871` | DOCX-PATH-GUARD |

限制：雜湊相同證明「目前檔案＝審查時的檔案」；各批審查者看的是當時相對 HEAD 的累積 diff。批次與批次之間沒有其他人改動，是依對話紀錄推定。［推定］

## 4. 候選前端建置：整包會變什麼

方法：`git archive HEAD react-app` 匯出到另一個暫存目錄，只覆蓋上表 7 個前端檔案（複製後逐檔比對雜湊），`npm run build`（成功）。與 HEAD 建置逐檔比對：［本機實測］
- 資產檔名改變 68 個：因為 `LanguageContext.tsx` 在主 bundle，主 bundle 雜湊一變，引用它的分塊檔名跟著變。
- 將檔案內容中的「`-8碼雜湊.js/.css`」正規化後再比：**94 個內容相同或只差引用的雜湊；真正有程式差異只有 8 個**，全部對應到已 PASS 的改動：

| 產出（去雜湊名） | 差異（以字串比對確認） | 來源 |
|---|---|---|
| `FormShell.css`、`FormShell.module.js` | `formGroupSpan2` | SUBJECT-WIDTH R1 |
| `ITP.css`、`ITP.js` | `versionFullRowWhenTwoColumns`、`data-criteria-row` 等 | SUBJECT-WIDTH R2、CRITERIA、LANG-FALLBACK |
| `ITPDetail.js` | `data-criteria-row` 等 | CRITERIA、REQUIRED、LANG-FALLBACK |
| `index.js` | 翻譯鍵 `eitherLanguageRequired*` | REQUIRED-POLICY |
| `index.css` | 新增 utility：`bg-slate-50/60`、`text-[#b91c1c]`（無刪除） | CRITERIA 外框、REQUIRED 提示 |
| `itpParser.js`（共用分塊） | 打包器把 `itpItemValidation` 併入（含 `trim()!==""`） | REQUIRED、LANG-FALLBACK |

- `index.html` 內容不同（引用新主 bundle 雜湊）。
- 證據：`frontend-candidate-build-sha256.txt`、`build-candidate.log`、`frontend-candidate-overlay.patch`（只含上述 7 檔相對 HEAD 的 diff）、`candidate-source-files-sha256.txt`。
- 結論：以「HEAD＋7 個已審檔案」建置，整包相對上次部署包的實質程式差異只有上述 8 個產出，**不含未審修改**。［本機實測］

## 5. 可納入／須排除／尚未查明

**可納入（已 PASS）**
- 前端：ITP-CRITERIA-LAYOUT、ITP-REQUIRED-POLICY、ITP-LANG-FALLBACK、ITP-SUBJECT-WIDTH（R1＋R2）——即上表 7 個前端檔案。
- 後端：DOCX-PATH-GUARD 的 `backend/core/docx_builder.py`，**沿用已接受的部署交接 v3**（單檔衍生映像、門檻 G、回退），不在此重寫。

**須排除**
- 所有測試、隔離種子、啟動器、文件（不進執行映像／前端包）。
- NOI-ITR-DESKTOP-REVIEW 的三項建議（未實作）；NOI-EXPORT-DOCX 的 REVISE 項目（無程式）。
- 本機其他未提交或未推送內容：無（工作樹除上述外無變更）。

**尚未查明［未知］**
- 正式站前端目前版本（是否仍為 `20261007b`）。
- 正式站後端映像版本與 `docx_builder.py` 雜湊（v3 預檢處理）。
- 正式站 NAS 上 `react-app/dist` 是否有部署包以外的檔案。
- 候選建置使用本機 `node_modules`；HEAD 建置與 `20261007b` 位元組相同，表示當下本機環境可重現上次部署包，但不代表其他機器可重現。

## 6. 建議的建置來源方案（可審查）

**前端**
1. 來源＝`git archive 056c245c react-app` 的乾淨匯出，只覆蓋 `frontend-candidate-overlay.patch` 中的 7 個檔案；建置前逐檔比對 `candidate-source-files-sha256.txt`。
2. 建置產物需與 `frontend-candidate-build-sha256.txt` 一致（同環境可重現）；不一致就停止。
3. 為了可追溯，建議（需使用者授權）把這 7 個檔案做成一個「部署用提交」，以提交編號作為建置來源；未授權前，以 patch＋雜湊清單作為來源紀錄。
4. 上線方式沿用既有的「只替換 dist 內容、不刪目錄」流程（記憶檔記載的 NAS 程序）；**上線前先唯讀比對 NAS 上 dist 的檔案清單與 `20261007b` 清單**，不同就停止回報。回退＝放回 `20261007b`。

**後端**：依 `DOCX-PATH-GUARD-2026-001-deploy-handoff.md` v3。

## 7. 部署前還缺的具體條件
1. 使用者對前端、後端分別的明確部署指示（兩者可分開進行）。
2. 正式站唯讀預檢：前端 dist 清單 vs `20261007b`；後端依 v3 §3 預檢與門檻 G（含 compose 專案名／設定檔／env-file）。
3. 是否授權建立「部署用提交」作為可追溯的建置來源（目前 7 檔為未提交工作樹變更）。
4. 回退用部署包的保存位置：`20261007b` 目前在 `/private/tmp/...scratchpad`，屬暫存目錄，可能在重開機後消失；需另存到可長期保存的位置（不入 git）。
5. 正式站冒煙檢查的測試紀錄與範圍：ITP 編輯（Criteria 左右排列、中英擇一必填、Insert After）、ITP 基本資料 Subject；**Generate Checklist 會在正式站建立 Checklist（寫入正式資料）**，需另行同意或排除；後端冒煙依 v3 §5。
6. 後端修復在 Python 3.11 的相容性仍未實測（v3 §9）。
7. 建置環境：若改由其他機器建置，需先證明能重現 `frontend-candidate-build-sha256.txt`。
