# MATERIAL-SUBMITTAL-M3 — STATUS（R2 補正輪，待獨立審查）

TASK_ID: MATERIAL-SUBMITTAL-M3-2026-001
ROUND: R2。上一輪的 TASK／STATUS／REVIEW／handoff 已逐字封存為 `MATERIAL-SUBMITTAL-M3-R1-REVISE-*-archive.md`；REVIEW 已重設為待審。
根目錄 DEPLOY-EXEC 控制文件未改。**未提交、未推送、未部署、未進 M4；不改後端政策、不跑後端全套。不自填 PASS。**

## RESULT
- [x] DONE（R1–R3 已補正並驗證，交獨立審查）
- [ ] PARTIAL
- [ ] BLOCKED

## 本輪實際修改（只處理審查的 R1–R3；版面不重做）
| 檔案 | 內容 |
|---|---|
| `react-app/src/utils/materialAttachmentState.ts`（新增） | 純函式：`createLoadGate`（只接受目前版次的最新一次請求）、`filesReducer`（讀取錯誤與寫入結果分開；切換版次就清空清單；重新讀取成功只清讀取錯誤、不清寫入提示）、`planResultSave`（有新選文件就先上傳，再送結果）、`canPickReplyFiles`（只在儲存仍能上傳時才開放選檔） |
| `react-app/tests-unit/materialAttachmentState.test.ts`（新增） | 9 項：延遲回應、版次內的新舊請求、切換時清空、上傳與刪除被拒絕後重新讀取、結果未知後重新讀取、提示的清除時機、重試計畫、選檔開放的狀態 |
| `components/MaterialSubmittal/RevisionFiles.tsx` | **R1**：每個載入都向閘門取號，舊回應一律丟棄；載入中顯示「載入中…」，不顯示前一版的附件。**R2**：寫入結果另存；被拒絕時顯示伺服器原因，結果未知時另有文字；按「知道了」或開始下一次寫入才清除。改用 reducer。 |
| `components/MaterialSubmittal/SubmittalDetailModal.tsx` | **R1**：`<RevisionFiles key={rev.id} …>`，每個版次各自一個實例 |
| `components/MaterialSubmittal/ResultDialogs.tsx` | **R3**：「重試登錄」改走 `save()`，有新選文件就先上傳；已上傳的文件已不在待上傳清單中，不會重傳。每次上傳嘗試後清空檔案欄位。有待上傳文件時明確提示。依狀態開放或停用選檔；結果確定後不顯示選檔欄位。 |
| `components/MaterialSubmittal/materialText.ts` | 新增「刪除失敗」「上傳／刪除結果未知」「載入中」「知道了」「已選新文件」等文字；「回覆文件已上傳」的提示改為符合新行為（原句「只會重送結果」已不正確） |
| `backend/scripts/verification/seed_material_m3_review.py` | 只用於隔離環境：為 MSA-1 每個版次各加一筆測試附件紀錄，讓切換版次時的錯版可以被看見 |

`LanguageContext.tsx` 仍未被 M3 修改，雜湊與上一輪相同。最終雜湊見 `MATERIAL-SUBMITTAL-M3-evidence/r2-file-hashes.txt`；相較上一輪只有上表的前端檔案改變（另有新增檔）。

## 驗證（證據：`MATERIAL-SUBMITTAL-M3-evidence/`）
**自動檢查**（`r2-frontend-checks.txt`，每項都是指令本身的 EXIT CODE）：
- `npm test`：**156 pass／0 fail，EXIT 0**（上一輪 147 項，新增 9 項）。
- `npx tsc --noEmit -p .`：EXIT 0。
- `npx eslint`（M3 新增與修改的檔案，`--max-warnings 0`）：EXIT 0。
- `npx vite build`（輸出到暫存目錄）：EXIT 0。

**瀏覽器驗證**（`r2-browser-acceptance.txt`）：使用新的隔離環境（8310／3310），結束後已 down，見 `r2-teardown.txt`；8240／3240 仍在運作。
- **R1**：
  - Rev 0 的清單延遲 2.5 秒；先點 Rev 0、0.1 秒後點 Rev 1。Rev 0 的舊回應到達之後，畫面仍是 Rev 1 的 id，只有 `rev1-catalogue.pdf`。
  - 切回 Rev 0 時正確顯示 `rev0-catalogue.pdf`。
  - Rev 1 載入中時顯示「載入中…」，不顯示 Rev 0 的附件。
- **R2**（每種情況都在重新讀取清單成功之後檢查）：
  - 上傳被拒絕（.exe）：提示「上傳失敗：File type … is not allowed」仍在。
  - 上傳結果未知（伺服器已保存、回應遺失）：清單顯示檔案已上傳，提示仍為「無法確認上傳是否完成…」，沒有被改寫成確定失敗。
  - 刪除被拒絕（版次已在其他地方送交）：提示「刪除失敗：…locked」仍在，檔案仍在清單中；按「知道了」之後才消失。
- **R3**：
  - A 已上傳、結果未保存之後，再選 B 並按「重試登錄」。請求順序是**先上傳 B、再送結果**。
  - 伺服器上回覆文件為 A、B 各一份，結果登錄 1 筆：A 沒有重傳，B 沒有被略過。
- **四種保存情境的回歸**（受影響範圍）：
  - 無法確認：選檔停用，不會自動重送。
  - 重新確認後為尚未保存：可重試，選檔開放。
  - 明確拒絕：照實顯示伺服器原因。
  - 已保存但回應遺失（更正）：隱藏儲存按鈕；原登錄保留；現行核准版依規則推導。

## 歷次紀錄（保留）
- R1 交審：自動檢查全部 EXIT 0、單元測試 147 項；瀏覽器驗收見 `browser-acceptance.txt`。
- 審查 REVISE（R1 附件錯版、R2 寫入提示被清除、R3 重試漏掉新選文件），原審查已封存。審查者的重現證據為 `reviewer-attachment-race.txt`。

## 未驗證／限制（沿用）
- 看板、專案回覆天數設定表單：M4。
- 文件編號規則頁的分頁問題：維持獨立待辦，未混入本輪。
- 只驗證桌面寬度；手機版延期。
- Python 3.11 未驗證（部署前必做）；最新版本後端沒有重跑全套。
- 延遲與斷線都用測試攔截程式模擬；判斷是否保存一律以重新讀取的伺服器資料為準。

## 下一步
交 M3 R2 獨立審查；PASS 後才進 M4。不部署。

## R2 獨立審查更新（2026-10-08）

TASK_ID: MATERIAL-SUBMITTAL-M3-2026-001

本次使用者轉交 R2 獨立審查已完成，結論 **PASS（M3 R1–R3 補正範圍）**。詳細依據及未驗證界線見 `MATERIAL-SUBMITTAL-M3-REVIEW.md`；獨立執行紀錄見 evidence/reviewer-r2-checks.txt 與 reviewer-r2-components.txt。上方「待審」為原交審紀錄，現以本節及 REVIEW 為準。此次只新增審查證據與更新控制文件，未修改產品程式、未進 M4、未部署。交審原文另存為 `MATERIAL-SUBMITTAL-M3-R2-submitted-*-archive.md`。
