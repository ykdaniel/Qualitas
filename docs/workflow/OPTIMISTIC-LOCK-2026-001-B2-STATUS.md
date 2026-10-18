# OPTIMISTIC-LOCK-2026-001 B2 STATUS（視窗第一組＋「重新載入這筆」）

- **基準**：27839efd。工作樹 scratchpad/ol-b2。尚未提交。
- **使用者確認**：2026-10-18（台灣時間），協調中心「主要調度」轉達「B2 可以」。
- **凍結（給使用者預覽）**：2026-10-18，程式碼指紋 0b5e807aeb54e391。算法和 B1 相同（backend、react-app 底下所有檔案，排除 node_modules、dist、__pycache__，以及預覽用的 .olb2-vite-launcher.mjs、.vite-olb2/）。審查 R1 REVISE → R2 PASS with notes（R2 的 P3 已修）。
- **標示**：「實測」＝實際跑過；「讀碼」＝只讀程式確認；「未測」＝沒有驗證。

## 1. 實際修改（只動前端，後端不動）
| 檔案 | 內容 |
|---|---|
| hooks/useRecordVersion.ts（新檔） | `createRecordVersion()`：open／current／saved。`useRecordVersion(initial?)` 用 useState 初始化一次 |
| utils/refusal.ts | `isVersionConflict`；RefusalOptions 加 `onReload`、`reloadDiscardsInput` |
| store/refusalStore.ts | entry 帶 onReload、reloadDiscardsInput |
| Shared/RefusalDialog.tsx（+ .module.css） | VERSION_CONFLICT 而且有 onReload 時多一顆「重新載入這筆」。表單的情況先在對話框內確認（取消／捨棄並重新載入）；確認狀態以 refusal id 判斷，新的拒絕不會沿用 |
| context/LanguageContext.tsx（CRLF） | 加 refusal.reload、reloadConfirm、reloadConfirmYes、reloadCancel，中英各一，共 8 行 |
| NCR.tsx、NCRModals.tsx | 開啟時取版本；update 帶版本、成功後更新；新增後用回傳的版本；reloadRecord 依搜尋重抓清單後重新打開；視窗 2 處 showRefusal 帶 onReload |
| OBS.tsx、OBSModals.tsx | 同上（2 處） |
| NOI.tsx、modals/NOIDetailModal.tsx（CRLF） | 同上；重抓清單時保留搜尋與狀態篩選（2 處） |
| OSD.tsx、OSDModals.tsx | 同上（2 處） |
| MeetingMinutes.tsx、MeetingMinutesModals.tsx | 第一次寫入、延後的 Published／Void 第二次寫入、表單內的作廢都用目前版本並更新。列表上的作廢用該列的版本，409 後直接重抓清單（`reloadDiscardsInput: false`）。視窗 3 處 |
| PQP.tsx、PQPModals.tsx | update（含新增）與視窗內的發行；重抓清單時保留搜尋（2 處） |
| Audit.tsx、AuditWizard.tsx（CRLF） | 精靈用 `useRecordVersion(existingItem?.row_version)` 自己記住版本；「存草稿」與「儲存」都帶版本並更新；Audit 頁的 reloadRecord（2 處） |
| MaterialSubmittal.tsx、RegisterDialog.tsx | `updateRegistered(..., current.rowVersion)`：current 是最後一次寫入的結果，否則是開啟時的那筆。reloadRecord 用 listApproved(q＝文件編號) 找回這筆後重新打開 |
| tests-unit/recordVersion.test.ts（新檔） | 4 項：版本在開啟、存檔後的變化；isVersionConflict；showRefusal 傳遞 onReload 與 reloadDiscardsInput（401 照樣丟棄）；中英文字都存在 |

## 2. 驗證
| 項目 | 結果 |
|---|---|
| tsc | **實測** 無錯誤 |
| npm 單元測試 | **實測** 228 passed（原本 224，加新的 4 項） |
| eslint（修改的檔案） | **實測** 剩 2 個錯誤，都是基準 27839efd 就有的（OBS.tsx、MeetingMinutes.tsx 的 deep-link effect 裡呼叫 setState），以基準檔重跑 eslint 確認過；另有 4 個既有的 warning |
| CRLF | **實測** AuditWizard 1479/1479、NOIDetailModal 675/675、LanguageContext 3607/3607 |
| **隔離預覽自測**（後端 8376、前端 3376、seed：../preview/seed_ol_b2_preview.py；另一個分頁的存檔用 fetch 帶目前版本模擬） | **實測**，四組都通過： |
| ① NCR | 表單開著時另一邊先存（v0→1）；按儲存 → 「Cannot save…changed by someone else」＋「Reload this record／OK」；按重新載入 → 紅框確認、按鈕變成「Cancel／Discard and reload」→ 確認後表單重新打開；再存成功（v2），另一邊存的備註保留 |
| ② 會議記錄列表作廢 | 另一邊先作廢；本頁清單按作廢 → 409 對話框 → 重新載入**沒有確認步驟**，清單直接更新成 Void，作廢按鈕消失 |
| ③ Audit 存草稿 | 連按兩次存草稿都成功（v0→1→2，沒有自己撞 409）；另一邊改標題後再存草稿 → 409 → 重新載入並確認 → 精靈重開、顯示對方的標題 → 再存草稿成功（v4） |
| ④ 會議記錄表單兩次寫入 | 加一個附件、改成 Published 後儲存 → Draft v0 → v2（先存 Draft、上傳、再寫 Published），沒有 409，視窗關閉 |
| OBS／NOI／OSD／PQP／材料 | 讀碼（和 NCR 同一模式）；預覽時請使用者補看 |
| 獨立審查 R1 | **REVISE**（P1：重新載入期間點開別筆，可能寫錯筆或靜默覆蓋）→ 已修，見第 5 節；R2 待審 |

## 5. R1 之後的修改
- **hooks/useRecordVersion.ts**：
  - 新增 `useOpenSession`：每次打開都換新序號，表單以序號當 key。
  - 新增 `reloadAndReopen`：清單回來時如果序號已經變了，就不碰使用者剛打開的表單；抓取失敗、或這筆已經不在清單裡時，關閉表單並提示原因。
- **8 個頁面全部改用上面兩個 hook**：NCR、OBS、NOI、OSD、PQP、會議記錄、Audit、材料。
  - 材料：重新載入期間連舊的檢視視窗一起關閉；所有打開動作（點列、架上卡片、新增、Edit）都換序號。
- **會議記錄**：延後的狀態寫入遇到 409 時，另外跳出拒絕對話框（附重新載入）。
- **RefusalDialog**：按鈕加 key，確認時焦點會移到「捨棄並重新載入」；確認文字加上 `role="status"`。
- **LanguageContext**：再加 2 個鍵（refusal.reloadGone、refusal.reloadFailed），中英各一，共 4 行（CRLF 3611/3611）。
- **測試**：單元測試加 reloadAndReopen 的四種情況（正常、期間另開、失敗、找不到），共 229 passed。
- **實測**（隔離預覽）：
  - 把清單請求延遲 3 秒，期間點開 NCR-2 → 清單回來後表單仍是 NCR-2，存檔寫入 NCR-2（v0→1），NCR-1 沒有被動到。
  - 正常的重新載入流程照舊（409 → 確認時焦點在「捨棄並重新載入」→ 重開 → 存檔成功）。

## 3. 不做
- PQP 存檔時把 updatedAt 改成今天：維持原狀（協調中心 2026-10-18 決定）。

## 4. 預覽環境
- 後端 8376、前端 http://localhost:3376（用 localhost，避免 cookie 和其他預覽互蓋）。
- 帳號 olb2_reviewer，密碼由開預覽的工作階段處理，不寫在文件裡。
- 自測用掉的資料已重設：會議記錄 1 回到 Published，會議記錄 2 回到 Draft；NCR、Audit 的版本已經增加，不影響操作。
- 檢查表：docs/workflow/OPTIMISTIC-LOCK-2026-001-B2-PREVIEW-CHECKLIST.md。


## 上線紀錄
- **2026-10-18 08:53Z（台灣 16:53）**：B1＋B2＋B3a 與 ATTACH-SECTION-UX 一起上線，正式站＝e651f87a（協調中心「主要調度」通知）。
- 遷移：18 張表加上 row_version；ITR 從 `_version` 帶入 1 筆；0 個 ERROR。
- 前端 bundle：index-DBcZOuF1.js。
