# 後端預檢腳本審查
TASK_ID: DEPLOY-EXEC-2026-001
日期：2026-10-08
VERDICT: REVISE（僅後端預檢腳本；不撤回前端切換方案 PASS）

直接讀取 backend-precheck.sh；未在 NAS 執行。模擬正常與少數負向案例不足以覆蓋以下真實缺口。

## REQUIRED_FIXES
R1 — 失敗必須反映退出碼，啟動器須真正驗 hash。
Python 印 OVERALL FAIL 後未 sys.exit 非零；shell 無 pipefail，tee 和最後 echo 可把失敗變成功。請保留報告但準確傳遞 Python/收集失敗退出碼，禁止最後 echo 覆蓋。交給使用者的指令必須機器比對完整已核准 SHA-256，僅成功後才執行，不可先印 hash 就立即跑。修改後 hash 必須重算，不沿用舊值。

R2 — 秘密輸出不能只防 Env。
程式直接印 image/container Cmd、Entrypoint、compose command/entrypoint、除了 args 之外整份 build 設定，這些可能含 token、帶密碼 URL、inline Dockerfile 或 build secrets。H_CONT/H_IMG 也將原始 stderr 不經過濾寫入報告。改成必要欄位明確 allowlist；命令與敏感設定只在記憶體比對，輸出相同/不同與欄位名，未知錯誤僅列階段和退出碼。模擬秘密須包含 Cmd/Entrypoint/build/error，不只 environment。

R3 — 熱修檢查不可截斷或只查副檔名。
DIFF_APP 使用 head -n 80，且只對 CODE_EXT 副檔名判斷。第 81 行、無副檔名、/app 外 site-packages/設定/entrypoint 的修改都可能漏報 PASS。完整解析 docker diff，不截斷；僅對明確可接受的 runtime/cache 項目作窄範圍豁免，其餘差異列待確認/FAIL。掛載遮蔽程式或 helper 時，也不能拿 image hash 掩蓋現場差異。

R4 — G4 重建設定相容比對不足。
目前未強制核對 entrypoint/user/working_dir/port bindings 等，環境比對只驗 compose 指定值；繼承 image 的同名環境鍵若被改值會被放過。以 image defaults + compose override 建立預期，再與 running 比較（含全部 env 的有效值；不印值）。對當前部署相關設定逐項確認，不支持的設定或缺資料不得默認 PASS。執行器、image、掛載等需驗證，不只是列印。新增對 entrypoint/port/user/workdir/繼承環境值不一致與缺資料的負向自測。

## NEXT_STEP
先修正腳本並保存自測輸出，再交獨立審查；尚未核准前不要要求使用者 sudo 執行 NAS 舊副本。前端已部署狀態維持，後端未部署。
如實把脚本稱為診斷預檢：會建立/刪除臨時容器並寫報告，非完全零狀態變更。不得清理共用 /tmp/__pycache__；測試只用本次獨有目錄。不要為補正重新部署或變更正式權限。

---

## r2 獨立審查補註（2026-10-08，以本段為最新結論）
TASK_ID: DEPLOY-EXEC-2026-001
VERDICT: REVISE（僅 R4 尚有誤判 PASS；不撤回前端切換方案或 DOCX 修復的 PASS）

審查腳本 SHA-256：`6d92caeff95811cc86b16a68cd06fb897dc4c54bb40c27d69fa8b41eee562fe9`。
已讀 r2 腳本、說明、15 案自測清單及 harness。R1 的退出碼與啟動 hash 閘門、R2 的命令/Env/build/stderr 輸出修正、R3 的完整 diff 與 code mount 檢查，本輪原要求已處理，不要求重新設計或重跑已接受的案例。本結論不表示對所有可能設定及秘密形式作全面認證。

獨立驗證：直接抽取最終腳本內原樣 Python 分析程式，以合成 inspect/compose/diff/helper 資料執行，未接觸 Docker、NAS 或正式服務。正常對照為 PASS；下列五種負向输入也均 exit 0 / OVERALL PASS。這是分析程式可重現的漏洞，不是已證明正式容器存在同樣差異。
證據：`DEPLOY-EXEC-2026-001-evidence/backend-precheck-r2-independent-review/probe.py` 與 `results.txt`。

### REQUIRED_FIXES（只補 R4）

1. **先比較原值，再遮蔽輸出。** 腳本第 341–342 行把 user/working_dir 經 safe_ref/safe_path 轉換後才比較。預期 `/app/a:b`、實際 `/app/c:d` 均變成 `<redacted>`，竟判相等。改為記憶體內原值比較；若格式不支援，明確 FAIL。遮蔽函式僅負責輸出，不得参与相等判定。同步檢查其他採相同模式的欄位（network、image、container_name 等），加一例「不同原值均被遮蔽」的回歸。

2. **必要欄位缺失不得轉為預設值通過。** 第 169 行把缺少 HostConfig 轉成 `{}`，後面又把不存在的 PortBindings、RestartPolicy 當正常預設；測試刪除整份 HostConfig 仍 PASS。另刪除 image/container 的 Env 後也 PASS。請在比對前驗證必要結構、鍵存在及型別，區分合法 null/空集合與缺鍵。至少補 HostConfig 缺失、Env 缺鍵的負向測試；不要僅用「沒有 service/labels」代表所有缺資料情境。

3. **不可將部分 HostConfig 比對稱為重建設定已相容。** 第 412–415 行只檢查有限清單，未宣告的 `HostConfig.Memory=536870912` 仍 PASS；RestartPolicy 只比 Name，`on-failure` 預期無重試上限、現場 MaximumRetryCount=5 也 PASS。請比完整 restart policy，並對會因重建丟失的非預設執行設定建立明確檢查範圍（例如 memory/CPU、security options、ulimits、logging 設定）；無法可靠解讀的非預設值應 FAIL/人工確認，不得默認通過。不必為通過加入新支援，拒絕未知差異即可。補上述兩個已重現案例，並明確列出無法自動確認的範圍。

### NEXT_STEP
保留 r2 與本輪證據，只補上述 R4 三項及針對性自測，保存最終 hash、退出碼與 FAIL 原因；不用重跑產品測試、前端部署或原本 15 案全部流程。更新 NAS 新副本與啟動 hash 後再交獨立審查，尚未核准前不要求使用者 sudo 執行。前端登入後冒煙仍待完成；後端未部署；任務 PARTIAL。根目錄 REVIEW.md 的前端 PASS 不變。

---

## r3 獨立審查（2026-10-08，以本段為最新結論）
TASK_ID: DEPLOY-EXEC-2026-001
VERDICT: PASS（後端診斷預檢腳本可執行；不是正式環境門檻 G 已通過，也不是後端部署完成）

核准腳本 SHA-256：`7f51580e787206a551cfde53d485800e12ad5e418608301c55a25a3a1b179218`。

### 驗證依據
- 讀取 r3 腳本與說明、合成測試程式及真實 Docker 的 7 案保存結果。
- 原值比較與輸出遮蔽分離；必要 inspect 欄位缺漏判失敗；restart 比較名稱與 MaximumRetryCount。
- HostConfig 改為與同映像、同 daemon 的未啟動參照容器逐鍵比對，非 compose 管理的差異停止；涵蓋上一輪記憶體限制等漏檢。文件已列自動檢查的限制。
- 獨立重跑最終腳本分析程式的 37 案合成探測，exit 0、mismatches=0；上一輪五個誤判均按預期失敗。bash 語法檢查通過。輸出存於 `DEPLOY-EXEC-2026-001-evidence/backend-precheck-r3-independent-review/results.txt`。
- 真實 Docker 7 案與 NAS Python 3.8 的結果屬執行者留存證據，本輪未重新操作 Docker 或 NAS，不把它們列為獨立重跑。R1–R3 已接受部分不重做。

### REQUIRED_FIXES
無阻擋項。

### NEXT_STEP
1. 可使用說明文件內帶完整 SHA-256 機器比對的 r3 啟動指令，由使用者在自己的終端機輸入 sudo 密碼，執行診斷預檢。不索取或保存密碼。
2. Claude 讀取報告，核對退出碼、每項判定及臨時/參照容器清理結果。任何 FAIL、ERROR、未知差異或清理失敗即停止；不得為通過自行放寬規則。
3. 即使預檢全 PASS，也須依現場結果完成具體後端切換/回退方案及 override 僅改 image 的比對，再交獨立審查；依既有持續授權執行後續已核准部署，無須再次詢問相同授權。
4. 前端不重複部署，登入後唯讀冒煙仍待完成；後端尚未部署，整體任務仍 PARTIAL。根目錄前端 REVIEW 的既有 PASS 不改。
5. 材料規劃使用獨立文件，與本次部署控制文件及預檢判定分開。
