# MATERIAL-SUBMITTAL-M6 — REVIEW

TASK_ID: MATERIAL-SUBMITTAL-M6-2026-001
ROUND: R1
REVIEWER: GPT
DATE: 2026-10-09

## VERDICT
- [ ] PASS
- [x] REVISE
- [ ] REJECT

核准材料登錄簿的方向符合最新 DECISIONS。舊送審動作路由已移除，結果歷程保留方式可接受；但儲存重試、圖片驗證、篩選與統計仍有實際問題，不能依目前測試數量判定 PASS。本次不審查 M5，不改產品、不提交、不推送、不部署。

## REQUIRED_FIXES

### R1 [P1] 儲存重試可能新增第二筆材料，且連點沒有完整防護
位置：`react-app/src/components/MaterialSubmittal/RegisterDialog.tsx:93–104,116–119,143–180`。

三個可重現情境：
1. 新增紀錄成功但照片失敗；使用者修改名稱再重試。written.key 不同而不 reuse，但 editing 仍為 false，writeRecord 再次 POST，產生另一個編號／材料。既有紀錄不應因照片重試變成第二筆。
2. POST 已送出但回覆遺失／5xx。畫面只提示及刷新，沒有禁止再次新增、識別已建立紀錄或冪等機制；再次 Save 仍 POST。即使重複提示出現，也不能取代對前次寫入結果的確認。
3. 查重 await 完成前才 setSaving(true)，也沒有同步的 in-flight guard。兩次快速點擊均可通過，送出兩個 POST。

獨立 probe 執行實際 RegisterDialog 與 runSaveFlow（React hooks、API、周邊 UI 用可控替身，非瀏覽器）：情境 1 creates=2/updates=0；情境 2 Save 未停用且 POST=2；情境 3 POST=2。見 reviewer-r1-form-probe.*。

修正：從查重開始就防重入；首筆已寫入後固定同一個 id，改欄位應更新該筆；未知結果須有明確的查核／恢復路徑或冪等機制，不能盲目重送新增。修改表單的比較基準也要跟最後成功寫入的內容同步（例如 A→B 已寫入但照片失敗，再改回 A，不能因與最初值相同就漏送回復）。
驗收：以上三案，以及修改後再改回原值、部分照片成功後重試；精確斷言紀錄數、編號、最終內容與附件數，不只看 toast。

### R2 [P2] 「照片只收圖片」可被副檔名／MIME 冒充繞過
位置：`backend/routers/file_router.py:103–152,254–256`。

新檢查使用 _validate_upload_mime 的回傳值，但該函式未識別內容時會相信副檔名／client MIME；此外所有 RIFF 都判為 WebP。獨立隔離 HTTP 實測：純文字 fake.png 回 200，RIFF/WAVE 內容 audio.webp 也回 200，兩者都不是圖片。現有只測 PDF 的拒收不足；測試 PNG 常數本身也只是簽章加零值，不能證明圖片可解碼。

修正：對 material_rev/photo 在寫入前驗證真實圖片內容及格式，不能靠名稱或 client MIME 放行；RIFF 必須辨識 WebP，不可接受 WAVE。限定新照片功能的改動，保留其他模組契約。
驗收：合法可解碼圖片可上傳；改名文字、偽 MIME、WAVE、損毀圖片被拒絕且無檔案／Attachment 殘留；多檔中一個非法時不得部分寫入。

### R3 [P2] 重複提示只查前 500 筆，查詢失敗也被當成沒有重複
位置：`RegisterDialog.tsx:130–140`。

findDuplicates 只讀一頁 q=name 的廣泛比對。當超過 500 筆名稱／規格等符合 q，真正同名稱、廠牌、型號的紀錄在後頁時完全不提示。catch 回 [] 也把「未完成檢查」偽裝成「無重複」。
修正：用完整分頁或伺服器精確查重，不得只取第一頁；查重失敗須如實提示、提供重試或明確繼續，不可靜默忽略。仍維持使用者可選擇繼續登錄，不能改成唯一性限制。
驗收：真正重複位於第 501 筆以後、非同專案不提示、排除自己、查詢失敗，以及繼續／取消兩分支。

### R4 [P2] 「所有專案」統計並非全部，載入失敗可能顯示成功的 0
位置：`react-app/src/components/Dashboard/MaterialStatsTile.tsx:30–48`；`react-app/src/store/projectStore.ts` fetchProjects；`react-app/src/services/api.ts:225`；`backend/routers/projects.py:40–48`。

加總各 project total 的算式本身正確，但 projectList 來自不帶分頁參數的 /projects/，預設只回 200 筆。獨立隔離 HTTP probe 建立 203 個可見專案，默认請求只回 200，後頁還有 3。因此目前總數只能代表首批專案。另 projectList 初始空白時 Promise.all([]) 立即產生 ok/0；fetchProjects 失敗只存 store.error，卡片不讀取，會一直顯示 0。

修正：確認可見專案全集已成功取得後才計算，或提供沿用範圍權限的聚合端點；分清載入、空集合、失敗，重試要能重新載入專案。仍需套用承包商篩選，不能只為管理員計算。
驗收：超過 200 個可見專案（後頁有材料）、專案列表延遲與失敗／重試、確實沒有專案、單專案與承包商切換；不完整／失敗不得顯示已完成的 0。

### R5 [P2] Excel 沒有遵守表格欄位的「目前篩選」
位置：`react-app/src/components/MaterialSubmittal/MaterialSubmittal.tsx:68,98–106,170`；`columns.tsx`；共用 DataTable 的 columnFilters。

欄位標頭提供材料、廠牌、承包商、結果等篩選，狀態只保存在 DataTable 內。匯出只收到 q 與 result chip，不知道欄位篩選。例如上方選「全部」、欄位結果只選「附意見核准」，畫面只見該結果，但 Excel 仍匯出兩種結果。現有 208 列的成功證據只驗證未篩選匯出，沒有涵蓋這項契約。

修正：材料頁的有效篩選需能提供給匯出，並套用到所有分頁資料，不能只匯出載入的 200 筆；如擴充共用 DataTable，使用可選介面保持其他模組行為。
驗收：欄位結果＋文字欄位＋上方搜尋的組合篩選，符合項目分布於多頁時，Excel 全部且僅包含符合項目。

### R6 [P2] 載入更多的舊回應可能混入新篩選，連點會重複追加
位置：`MaterialSubmittal.tsx:70–77,173–176`。

effect 首頁查詢有 alive 保護，但 load(offset) 沒有。先載入更多、再切換搜尋／結果，旧請求晚回會將舊篩選資料 append 到新清單，並覆寫 total。按鈕沒有 loading／同步防重入，兩次同 offset 查詢也會各自追加同一批卡片。

修正：所有清單請求使用一致的篩選識別／世代與失效處理，載入更多防重入；只接受當前查詢及預期分頁結果。
驗收：延遲舊分頁回應後切換篩選，不混資料；連點只追加一次；失敗可重試；筆數與唯一 id 正確。此項為讀碼確認，未用瀏覽器重現。

### R7 [P2] 舊權限只從常數移除，既有資料庫的權限清單仍會顯示
位置：`backend/core/perms.py:73–75`、`backend/db_seeder.py:101–107`、`backend/repositories/user_repository.py:154–156`、`backend/routers/iam.py:228–237`。

ALL_PERMISSIONS 移除 record_result 不會刪除或停用既有 Permission；seeder 只新增缺少項，/permissions/ 仍直接列資料庫的所有紀錄。在已有 M1–M5 schema/權限的資料庫上，舊 record_result 仍在權限選單，既有描述也不會更新。這不是旧路由仍可用的漏洞，但未達「權限只留查看與維護、從清單移除」的要求。

修正：明確處理已存在的舊權限之可選清單／停用方式，保留既有角色其餘授權，不擅自硬刪角色或其他模組權限。不能只驗乾淨 seed。
驗收：預置舊 record_result 及角色指派後，核对權限清單只顯示兩種材料權限、保留 view/manage 與其他模組指派，舊權限無法提供新功能權限。此項為程式路徑確認，未執行完整啟動或升級流程。

## 使用者指定的五個審查重點
1. **舊路由**：router 確實只留 approved、detail、register、update register。路由全集斷言＋移除動作請求後資料 snapshot 不變，足以支持舊動作關閉；404/405 在「路由不存在」測試中接受兩者合理。本次獨立重跑該測試通過；不是放寬權限測試。
2. **Register edit 歷程**：以最新登錄簿決策判斷可接受。原結果不覆寫，追加 entry，保存前後鏈結、操作人與時間，並有 strict audit 同交易；獨立重跑更正與稽核失敗回滾兩測試通過。固定文字只是操作類型，不可宣稱使用者填了更正原因。不要重新強加已取消的更正對話框。
3. **照片與鎖**：manage/view、專案範圍與 vendor 拒絕仍在；照片例外只對 material_rev/photo，其他核准證據仍锁定。圖片內容限制未達成，見 R2。
4. **/api/materials 寫入**：建議一併關閉 POST／PUT。新介面已不使用，它可以新增無核准資訊的主檔，也可只修改主檔而不改登錄簿快照，形成兩套內容。這不是越權：仍有 manage/scope 防護，也不會憑空產生核准清單項目。原 TASK 曾明示保留、最終 STATUS 又列待決定，因此本審查將關閉建議列為範圍收斂事項，不把未確認的新政策冒充既定驗收；若採用，補上路由與零寫入測試，資料表及既有資料保留。
5. **統計**：逐專案 total 加總不受材料分頁影響；但可見專案集合不完整、失敗誤顯示零，需 R4。registeredFrom 用 created_at 而非 approved_date，與「本月新增」一致；跨時區月界仍未實測。

## STATUS 事件紀錄
紀錄包含誤執行 main 的原因／時間、schema 與權限影響、使用者同意還原的陳述、備份來源、還原前保全、永久遺失的舊備份及新增日誌，披露足夠，不能簡化成「完全無影響」。

獨立唯讀核對：保全 before/after 兩檔雜湊均符合 MANIFEST；兩檔 integrity_check 均 ok；材料表由 0 變 4，permissions 70→73；021515 回復來源與 before 副本逐位元組相符；174144 不存在、174147 仍存在。未修改或重新還原開發資料庫，沒有執行 main。當時的使用者同意及當時已還原的狀態依交接陳述，不偽稱本輪重新執行還原。

## 證據與限制
- file-hashes.txt 29 筆當前檔案全部 MATCH：reviewer-r1-hashes.txt。
- 獨立隔離 HTTP probes：reviewer-r1-probes.py／.txt，2 passed、EXIT 0。這兩項是「缺陷重現條件成立」，不是產品驗收通過：偽圖片 200，專案預設 200/203。
- 路由移除、結果追加、audit 回滾：reviewer-r1-route-history-tests.txt，3 passed、EXIT 0。
- 表單 probe：reviewer-r1-form-probe.mjs／.txt，真實表單及 saveFlow 配合 hooks/API 替身；非瀏覽器。首次 probe build 因測試適配器未處理 JSX runtime 失敗，修正執行器後完成，原錯誤輸出保留。
- R3、R5、R6、R7 為讀碼確認；未冒稱瀏覽器實測。
- 提交者 FINAL 檔案記載 139 frontend、291＋51 backend 通過；這些檔案只有摘要，未獨立重跑整套，不稱為本審查的全套通過。Chrome FINAL ROUND 是提交者證據。
- 所有獨立後端執行均用臨時 SQLite 與 uploads，不啟動 main、不操作使用者預覽服務；沒有進行 M5 檢查。

## NEXT_STEP
逐字保留本輪 TASK／STATUS／REVIEW，再只針對 R1–R7 補正及增加對應負向／延遲測試。保留失敗與重現證據，區分讀碼、模擬與瀏覽器驗證。更新來源雜湊並交 R2 審查；M6 PASS 前不以過時的 M5 產物部署。本輪不要求重跑完整後端套件；依實際修改範圍執行針對性回歸。
