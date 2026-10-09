# MATERIAL-SUBMITTAL-M3 — REVIEW

TASK_ID: MATERIAL-SUBMITTAL-M3-2026-001
REVIEW_DATE: 2026-10-08

## VERDICT
- [ ] PASS
- [x] REVISE
- [ ] HUMAN_REQUIRED

版面與業務方向維持，不重做；先完成下列附件前端補正，再進 M4。

## 核對範圍與證據
- 閱讀 TASK、交接、API 層相關呼叫、結果重讀純函式、操作對話框、列表與版次附件元件。
- 已保存的前端檢查顯示 147 項單元測試、tsc、限定檔案 lint、build 通過；目前所有 file-hashes.txt 記錄的檔案雜湊相符。本次未重跑完整檢查，也未重新啟動隔離堆疊。
- 下列 R1 使用實際 RevisionFiles 經 TypeScript 轉譯後的輕量 hook harness 驗證，不是瀏覽器實測。R2、R3 為明確控制流程的讀碼結論，需要補正輪以瀏覽器驗證。

## REQUIRED_FIXES

### R1 — 版次切換時附件可能串版（P1）
位置：RevisionFiles.tsx:29–40；SubmittalDetailModal.tsx:166。

RevisionFiles 沒有 revision key，切換時會沿用 files state；load 的非同步結果也未檢查目前 revisionId 或请求世代。先載入 A、再切 B，若 B 的回應先到、A 後到，A 的附件會覆蓋 B 的清單，卻配上 B 的版次標題及操作權限。即使順序正常，新回應抵達前也仍顯示舊清單。

獨立 harness 結果：當前 props 為 B，B 回應後才放行 A 回應，最終 files 為 A-file；見 evidence/reviewer-attachment-race.txt。未聲稱後端範圍保護被繞過。

修正：切換版次清除／隔離附件狀態，顯示載入狀態；所有載入路徑含上傳／刪除後刷新，都拒絕過期回應。驗收延遲 A 回應、切 B 並先返回 B、最後返回 A，仍只能顯示 B；載入或失敗時不能讓舊版附件帶著新版操作權限出現。

### R2 — 附件寫入失敗提示會被刷新清掉（P2）
位置：RevisionFiles.tsx:29–36、47–68。

上傳／刪除 catch 設 error，但 finally 呼叫 load；只要 GET 成功，load 立即 setError(null)。例如上傳被拒絕或逾時，附件清單重新讀取成功，最終畫面不再顯示失敗／結果未知的訊息。讀取成功不能證明先前寫入成功。

修正：分開讀取錯誤與寫入結果；刷新清單不清掉寫入提示，直到明確操作或確認。驗收上傳、刪除各一個明確拒絕情境，以及至少一個結果未知情境，GET 成功後訊息仍準確可見。結果未知不可直接寫成確定失敗。

### R3 — 結果重試會忽略新選取的回覆文件（P2）
位置：ResultDialogs.tsx:185、193，save／sendResult 的分流。

初次結果遭拒或重讀確定 notSaved 後，file input 仍可選取新檔案並 setPending；但「重試登錄」直接呼叫 sendResult，完全不處理 pending。結果若成功，對話框關閉、版次鎖定，而使用者剛選的檔案沒有上傳。

修正：明確區分已上傳文件與新選文件。可在只重送結果的模式停用新增選檔並說明，或支援先上傳新選文件再送結果；不得重傳已成功上傳的文件，也不能靜默丟棄 pending。已確認 saved／savedDifferent 後同樣不應留下可選檔卻無法保存的假操作。

驗收：文件 A 已上傳、結果未保存；進入重試後尝試選 B，畫面及實際請求符合選定方案，A 不重複、B 不被靜默略過。

## NEXT_STEP
1. 保存本輪 M3 控制文件為 R1-REVISE，再建立補正輪；不動根目錄部署控制文件，不改後端政策，不進 M4。
2. 只修上述三項，補具體非同步／附件重試測試及隔離瀏覽器證據。原有四種結果保存情境做受影響回歸即可，不重跑後端全套。
3. 執行相關前端單元測試、tsc、變更檔 lint，更新最終雜湊與 STATUS／handoff 交審。若修改範圍有擴大，再依實際影響補檢查。
4. 文件編號頁分頁問題維持獨立待辦，不混入本輪。手機延期、Python 3.11 部署前驗證等既有限制維持。
