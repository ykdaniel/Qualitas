# DEPLOY-SCOPE-INVENTORY-2026-001 — 部署範圍盤點 v2（本機唯讀，未部署）

日期：2026-10-07。執行者：Claude。未操作 NAS／正式站，未提交、推送、部署，未改產品程式。
v1 經審查 REVISE（R1–R3），原文逐字保留於 `DEPLOY-SCOPE-INVENTORY-2026-001-inventory-v1-REVISED.md`。
證據：`docs/workflow/DEPLOY-SCOPE-INVENTORY-2026-001-evidence/`；本機保全：`~/Documents/Qualitas-deploy-artifacts/DEPLOY-SCOPE-INVENTORY-2026-001/`（見 §6）。
標示：**［本機實測］**／**［推定］**／**［未知］**。

## v1 → v2 修正
- R1：撤回「本機其他未提交或未推送內容：無」；釐清本機部署包＝HEAD 建置不等於正式站版本已確認；「8 個實質差異」降為輔助分類，不作為整包安全或語意等價的證明。
- R2：撤回以記憶檔「只替換 dist 內容」作為已確認的上線程序，改列遠端預檢與切換、回退的必要條件（不猜遠端指令）。
- R3：本機產物保全已完成（§6）；「部署用提交」改為可選，不是部署必要條件。

## 1. 基準
- 基準提交（完整）：`056c245ca3ff630f74bfc7af86233e7cbc7dc51b`（本機分支 `ui/sidebar-shell-preview`）。
- ［本機實測］`git archive` 匯出基準提交前端並建置，102 個產出檔與本機保存的部署包 `qualitas-frontend-20261007b.tgz` 逐檔 SHA-256 相同。
- 這只證明「本機保存的部署包」與「本機基準建置」一致。**不能**證明：該包當時完整上傳成功、正式站目前提供的就是它、或它是正式站唯一的來源。**正式站前端目前版本：［未知］。**
- 基準提交比本機的遠端追蹤參照領先 122 個提交（未推送）。這些提交的內容屬於基準，**未經全面驗收**（其中包含早先未經獨立審查就部署的 ITP 改動，見 `unrecorded-work-reconciliation-2026-10-07.md`）。

## 2. 工作樹相對基準的變更
［本機實測］相對基準提交的工作樹變更：前端 7 檔（6 修改、1 新增 `itpItemValidation.ts`）、後端 `backend/core/docx_builder.py`；其餘為測試、隔離種子、啟動器與文件（不進部署產物）。`package.json`／`package-lock.json` 未變。
- 這只描述「工作樹相對基準」的差異；**不能**據此推論本機沒有其他未推送內容——122 個領先提交本身就是未推送內容（屬基準，見 §1）。

| 檔案 | 來源批次（皆 PASS） |
|---|---|
| `react-app/src/components/ITP/ITPDetail.tsx` | ITP-CRITERIA-LAYOUT、ITP-REQUIRED-POLICY、ITP-LANG-FALLBACK |
| `react-app/src/components/ITP/ITPAdvancedEditor.tsx`（CRLF） | 同上 |
| `react-app/src/components/ITP/ITPModals.tsx` | ITP-LANG-FALLBACK、ITP-SUBJECT-WIDTH R1＋R2 |
| `react-app/src/components/ITP/ITP.module.css` | ITP-SUBJECT-WIDTH R2 |
| `react-app/src/components/Shared/FormShell.module.css` | ITP-SUBJECT-WIDTH R1 |
| `react-app/src/context/LanguageContext.tsx`（CRLF） | ITP-REQUIRED-POLICY |
| `react-app/src/utils/itpItemValidation.ts`（新增） | ITP-REQUIRED-POLICY、ITP-LANG-FALLBACK |
| `backend/core/docx_builder.py` | DOCX-PATH-GUARD（產品 PASS；部署依 v3） |

## 3. 已審版本與目前檔案
［本機實測］上表 8 個產品檔＋3 個測試檔，目前 SHA-256 皆等於各自最後 PASS 批次證據中的雜湊（11／11）。
［推定］批次之間沒有其他人改動，依對話紀錄推定；審查者每輪看的是當時相對基準的累積 diff。

## 4. 候選前端建置
- ［本機實測］候選＝基準提交乾淨匯出＋覆蓋上述 7 個前端檔（逐檔核對雜湊），`npm run build` 成功，102 個產出檔；清單見 `frontend-candidate-build-sha256.txt`。
- **部署差異範圍以「固定基準提交＋7 個來源檔（雜湊清單）＋完整候選產物清單」為準。**
- 輔助分類（只用於解釋，不作為安全或語意等價證明）：把產出內容中的 `-8碼雜湊.js/.css` 正規化後比對基準建置，94 個相同或只差引用雜湊，8 個內容不同（`FormShell.css`、`FormShell.module.js`、`ITP.css`、`ITP.js`、`ITPDetail.js`、`index.js`、`index.css`、`itpParser.js`），以字串比對可對應到已 PASS 改動的關鍵字。此方法無法排除字串比對以外的差異。
- 68 個資產檔名改變（主 bundle 雜湊連動），`index.html` 內容不同：上線時幾乎整組資產都會換新檔名（影響 §5 的切換要求）。

## 5. 前端上線：預檢、切換、回退的必要條件（**未核對現場，不提供遠端指令**）
記憶檔記載的「只替換 dist 內容、不刪目錄」**不作為已確認程序**；它是過去的做法紀錄，現場是否仍適用未核對。

**5.1 遠端唯讀預檢（上線前必過）**
1. 服務根目錄：前端容器實際提供的目錄與掛載方式（repo 的 compose 為 `./react-app/dist:/usr/share/nginx/html:ro` bind mount；NAS 現場未核對）。
2. 正式站目前檔案：服務根目錄內**所有檔案的內容雜湊清單**（不只檔名），與 `frontend-deployed-bundle-20261007b-sha256.txt` 比對；不同就停止並回報，回退基準改用現場實際內容。
3. 快取：現場 nginx 設定（repo 版本 `index.html` 為 no-cache、`/assets/` 為 `expires 1y` + `immutable`）與 Cloudflare 對 HTML／資產的快取行為；已知事故：資產上傳完成前先請求新檔名，曾讓 Cloudflare 快取 404 約 3 分鐘。
4. 權限：NAS 解壓後的檔案權限問題（umask 0077）已有前例，預檢需確認目錄與檔案的擁有者與模式。

**5.2 切換要求**
- 新 `index.html` 生效時，它引用的所有資產必須已存在且可讀：**資產先到位、入口最後切換**；或若現場支援，以版本目錄整體切換（原子切換）。具體做法需依 5.1 結果決定。
- **保留舊雜湊資產**：已開啟的舊頁面仍會延遲載入舊分塊；切換時不先刪除舊資產，待確認無影響後再清理。
- 新資產上傳完成前，不得以瀏覽器或 curl 請求新檔名（避免快取 404）。
- 切換後核對：候選清單中的每個檔案都存在於服務根目錄且內容雜湊相符；**允許保留舊雜湊資產，不為了讓清單完全相等而刪除它們**。並確認首頁 200、`/api/` 可達。（2026-10-07 依 R2 PASS 審查收尾更正。）

**5.3 回退**
- 以 5.1 取得的**現場完整內容備份**為回退基準；不假定 `20261007b` 就是目前版本。
- 回退同樣遵守「資產先到位、入口最後切換」。
- 回退後重做內容雜湊核對。

## 6. 本機準備（已完成）
［本機實測］保全目錄 `~/Documents/Qualitas-deploy-artifacts/DEPLOY-SCOPE-INVENTORY-2026-001/`：repo 外、非暫存、不入 git；目錄 700、檔案 600；不含帳密、不含 node_modules（已掃描）。

| 內容 | 說明 |
|---|---|
| `bundles/qualitas-frontend-20261007b.tgz` | 上次上傳的前端包（＝基準建置） |
| `bundles/qualitas-frontend-20261007.tgz`、`qualitas-frontend-dist.tar.gz`、`qualitas-backlog.tar.gz` | 同日較早的部署包與 BACKLOG 包；後兩者來源提交未記錄，僅供歷史參考 |
| `candidate/qualitas-frontend-candidate-056c245c-plus7.tgz` | 候選前端建置；解壓後 102 檔內容＝候選清單 |
| `candidate/frontend-candidate-overlay.patch`、`candidate/source/` | 7 個前端來源檔的 diff 與原檔，加上 `docx_builder.py` |
| `manifests/` | 基準建置、候選建置、20261007b 的雜湊清單；來源雜湊；兩份建置紀錄 |
| `README.txt`、`COPY-VERIFICATION.txt` | 基準提交完整 ID；每個檔案複製前後雜湊（20 筆 OK） |

- 過程更正：第一次打包候選產物時，因關閉沙盒後暫存路徑不同，產生了 0 位元組的空檔並被複製；已發現並以正確來源重做，解壓驗證 102 檔內容相符。`COPY-VERIFICATION.txt` 以 VOID 行保留這次紀錄。
- 原始檔（scratchpad、證據目錄、暫存建置目錄）皆保留未刪。
- 部署用提交：**可選**。固定完整基準提交 ID＋patch＋來源與產物雜湊即可追溯，不是部署必要條件；本輪未提交。

## 7. 三類待辦

**本機已完成**
- 基準建置與部署包一致性核對；候選建置與清單；patch、來源雜湊；產物保全與複製核對（§6）。

**待遠端核對（唯讀；授權已成立，依使用者直接確認）**
- 前端：§5.1 四項（服務根目錄與掛載、現場內容雜湊、快取設定、權限）。
- 後端：依 `DOCX-PATH-GUARD-2026-001-deploy-handoff.md` v3 §3 預檢與門檻 G。
- 依預檢結果定出具體的前端切換與回退指令，交審後才執行。

**授權狀態（2026-10-07 更正：已由使用者在對話中直接確認）**
- 使用者在對話中直接確認：每批獨立審查 PASS 且部署準備完成後，即提交、推送及部署；不固定時間；第一次遠端操作前後不必逐批再問。**包含部署所需的遠端唯讀預檢。**（與 `DECISIONS.md`「每批 PASS 後完成準備即提交、推送及部署」一致；此前文件中「Claude 未看到使用者陳述、將先確認」的說法予以撤回。）
- 授權**不等於審查通過**：本盤點 R1–R3 補正仍待 GPT 審查；PASS 前不做預檢以外的任何遠端操作，也不切換。
- 執行條件（使用者同時指定）：不得混入未審修改、不得推送全部未審提交、不得強制推送；任何檢查失敗即停止並回報。
- 冒煙檢查範圍（使用者指定）：**排除 Generate Checklist 及其他新增業務資料的操作**；只做唯讀檢查，以及既有合法紀錄的匯出。
- 建置產物：直接使用已保全且核對過雜湊的候選包 `candidate/qualitas-frontend-candidate-056c245c-plus7.tgz`；不另做跨機器重建。
- 部署用提交：可選（見 §6）。

**部署前仍須完成（不因授權跳過）**
- 後端修復的 Python 3.11 相容性驗證（v3 §9）。本機目前沒有 Python 3.11，Docker（colima）未啟動；需要一個可丟棄的 3.11 環境才能執行，做法另行提出。
- GPT 審查本盤點 R1–R3 為 PASS。
- 遠端唯讀預檢（前端 §5.1、後端 v3 §3＋門檻 G）→ 依結果定出具體切換與回退步驟。

**已知未測**
- 後端修復在 Python 3.11 的相容性（v3 §9）——部署前必須完成。
- 在其他機器建置能否重現候選清單——依使用者指示不需處理，直接使用已保全的候選包。
