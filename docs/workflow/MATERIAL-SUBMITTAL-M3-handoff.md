# MATERIAL-SUBMITTAL-M3 — handoff（R2 補正輪，待獨立審查）

**一句話**：審查的 R1–R3 都已補正，版面沒有重做：
- 切換版次時，舊回應會被丟棄、舊清單不會殘留；
- 寫入被拒絕或結果未知的提示，不會因為重新讀取而被清掉；
- 重試時會先上傳新選的文件，已上傳的不重傳。

前端檢查：單元測試 156 pass、tsc、lint、建置的退出碼都是 0。隔離環境的瀏覽器驗證涵蓋延遲回應、寫入失敗後重新讀取、新選文件重試，以及四種保存情境的回歸。不自填 PASS，不進 M4、不部署。

## 審查請看
- `MATERIAL-SUBMITTAL-M3-STATUS.md`（R2）。
- `react-app/src/utils/materialAttachmentState.ts`，以及 `tests-unit/materialAttachmentState.test.ts`。
- `RevisionFiles.tsx`（閘門＋reducer）、`SubmittalDetailModal.tsx`（以版次 id 作 key）、`ResultDialogs.tsx`（save／retry 的流程與選檔狀態）。
- 證據：
  - `r2-browser-acceptance.txt`、`r2-frontend-checks.txt`、`r2-file-hashes.txt`、`r2-teardown.txt`；
  - 上一輪的 `browser-acceptance.txt` 與審查者的 `reviewer-attachment-race.txt` 保留；
  - 上一輪控制文件：`MATERIAL-SUBMITTAL-M3-R1-REVISE-*-archive.md`。

## 證據界線
- 延遲與斷線都用測試攔截程式模擬，是否保存以伺服器資料為準。
- 只驗證桌面寬度。
- 文件編號規則頁分頁問題、Python 3.11、後端全套：維持原有限制。

## R2 獨立審查更新（2026-10-08）

TASK_ID: MATERIAL-SUBMITTAL-M3-2026-001

本次使用者轉交 R2 獨立審查已完成，結論 **PASS（M3 R1–R3 補正範圍）**。詳細依據及未驗證界線見 `MATERIAL-SUBMITTAL-M3-REVIEW.md`；獨立執行紀錄見 evidence/reviewer-r2-checks.txt 與 reviewer-r2-components.txt。上方「待審」為原交審紀錄，現以本節及 REVIEW 為準。此次只新增審查證據與更新控制文件，未修改產品程式、未進 M4、未部署。交審原文另存為 `MATERIAL-SUBMITTAL-M3-R2-submitted-*-archive.md`。
