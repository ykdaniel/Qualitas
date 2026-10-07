# QWORKFLOW-UX-2026-001 — Q-Workflow 列表顯示目前步驟文字

來源：`BACKLOG.md` #52（2026-10-03 Q-Workflow→NOI→ITR 業務操作審閱時觀察到的純記錄項目）。
ITR-STATUS 系列已於 ITR-STATUS-2026-002 獨立審查 PASS 結案
（`docs/workflow/ITR-STATUS-2026-002-archive.md`）。

## 問題

Q-Workflow 列表的 9 個檢查點欄位在一般桌面寬度下仍需橫向捲動才能看完；每列只有一串彩色圓點
（灰＝未到、綠＝完成、橘＝目前卡點），「橘色＝目前卡點」的語意只寫在滑鼠懸停才看得到的 title
屬性裡（例如 `title="Inspected · current"`），畫面上沒有任何一行文字直接說「目前步驟是
什麼」。

## 修正

`react-app/src/components/Workflow/Workflow.tsx` 的表格裡，只有 `stickyCol`（Q-WorkFlow
編號，`left:0`）與 `stickyCol2`（NOI，`left:140px`）兩欄是 `position: sticky`，一般頁面寬度
下不需橫向捲動即可見；`subjectCol`（檢驗項目）刻意不是 sticky（既有 CSS 註解說明是為了把
空間留給 9 個檢查點），不當作初始可見範圍。新文字加在 `stickyCol2`（NOI 儲存格）既有內容
下方多一行：

```tsx
const currentStepText = (w: WorkflowSummary): string | null => {
    const current = w.checkpoints.find(cp => cp.state === 'current');
    if (current) {
        return `${t('workflow.currentStep')}: ${checkpointLabel(current.key as CheckpointKey)}`;
    }
    const allDone = w.checkpoints.length > 0 && w.checkpoints.every(cp => cp.state === 'done');
    if (allDone) {
        return checkpointLabel('accepted');
    }
    return null;
};
```

讀碼確認 `backend/services/workflow_service.py` 的 `_evaluate_checkpoints`：只有兩種真實
形狀——(a) 恰好一個檢查點是 `current`，其餘按順序 done/pending；(b) 全部規則都滿足時
`current_idx` 是 `None`，全部 9 個（含 `accepted`）都渲染成 `done`。上面的函式完全對應這兩種
形狀，第三個分支（兩者皆非）在目前後端邏輯下不會真的發生，純粹是防呆，不會顯示任何猜測文字
（絕不會出現「等待檢驗」這類臆測字樣）。

新增唯一一個翻譯 key：`workflow.currentStep`（英文 "Current step"、中文「目前步驟」）。未
修改進度計算規則、未新增後端欄位、未修改 `handleCheckpointClick`／`handleRowClick`／排序／
bucket 篩選／完成度百分比欄位／既有授權行為。

CSS 新增 `.currentStepLine`（`Workflow.module.css`）：字體 11px、灰色、`white-space: normal`
+ `overflow-wrap: break-word`，讓文字在既有 sticky 欄位的 `max-width`（200–260px）內換行，
不撐寬欄位、不造成頁面層級新增水平捲動。

## 隔離環境驗證

**種子**：`backend/scripts/verification/seed_qworkflow_currentstep_review.py`（**隔離測試
種子腳本**——會實際寫入測試資料，不是唯讀腳本；需要 `QUALITAS_REQUIRE_ISOLATED_DB=1` 與
`QWORKFLOW_UX_REVIEW_PASSWORD` 環境變數，無硬編碼密碼）建立五組情境，橫跨兩個專案：

1. `QTS-QWUP1-NOI-000001`（LOW）— 完全沒有 ITR，`current` 應為 `wh_inspection`
   （"Inspected"）。
2. `QTS-QWUP1-NOI-000002`（MID）— 一筆 inspectionResult=Fail 的 ITR、無 NCR，`current`
   應為 `ncr`（"NCR Review"）。
3. `QTS-QWUP1-NOI-000003`（DONE）— ITR Pass 且 status=Approved（滿足 `_rule_itr_terminal`）、
   無 NCR，應為全部 done、完成度 100%、顯示 "Accepted"。
4. `QTS-QWUP1-NOI-000004`（VOID-ITR）— 只有一筆 status=Void 的 ITR，依
   `_rule_wh_inspection` 的既有排除規則，應與情境 1 算出完全相同的形狀（`current` 仍是
   `wh_inspection`）。
5. `QTS-QWUP2-NOI-000001`（第二個專案）— 與情境 1 同形狀，但在不同專案，用於專案切換測試。

**瀏覽器驗證**：`react-app/tests-browser/qworkflow-currentstep-review.mjs`，在自建隔離堆疊
（backend/vite 8200/3200）上執行，**18/18 通過**。關鍵設計：每一項斷言都先從該列檢查點欄位
自己的 `title` 屬性（`data-checkpoint` 元素）讀出「ground truth」（這是既有、本批未修改的
顯示機制），再核對新增的文字是否與這個 ground truth 一致——不是拿一個獨立猜測的期望值去比對，
這樣才能真正證明「新文字忠實反映既有狀態」，不是碰巧兩邊都猜對。

- 情境 1/2：低/中完成度顯示不同的檢查點名稱，且各自與該列檢查點欄位本身的 title 一致；兩者
  文字確實不同（不是寫死的固定字串）。
- 情境 3：顯示恰好 "Accepted"，不帶「Current step:」前綴，且該列檢查點欄位本身確認沒有任何
  `current` 狀態的 cell（ground truth 驗證全部 done）。
- 情境 4：與情境 1 顯示**完全相同**的文字（因為兩者的 ground truth 確實相同），且顯示文字
  本身**不**出現「Void」字樣——證明沒有因為資料裡混了 Void ITR 就另外加工或猜測文字，單純
  如實反映既有已計算的狀態。
- 桌面（1440px）與手機（375px）寬度下，`document.documentElement.scrollWidth -
  clientWidth` 皆為 0px，確認沒有新增頁面層級水平捲動（表格本身既有的橫向捲動不受影響、
  不在此檢查範圍內）。
- 切換到第二個專案後，第一個專案的列（連同其舊文字）完全消失，第二個專案的列顯示自己正確的
  文字；切回「All Projects」後，第一個專案的列重新出現且文字正確，不殘留、不卡在切換時的
  舊值。
- 點擊檢查點節點（`wh_inspection`）仍正確開啟對應的 NOI 紀錄（畫面上看得到該 NOI 的
  Reference No 輸入框顯示正確值）。

**其他檢查**：`node --check` 通過；`npm test -- --run` → 123 passed, 0 failed；
`npm run build`（含 tsc）→ 成功。後端未修改任何程式，依規則略過後端 pytest 套件。

## 未測限制

- 僅驗證了 LOW/MID/DONE/VOID-ITR 四種檢查點形狀，未逐一驗證 9 個檢查點各自輪流當
  `current` 時的文字（例如 `moc`/`improvement`/`reinspection`/`close_ncr`）——這些都走
  完全相同的 `checkpointLabel(current.key)` 呈現邏輯，沒有理由認為其中某個 key 會有不同
  行為，但本輪沒有逐一窮舉建立對應種子資料實測每一個。
- 中文（zh）locale 下的顯示文字未另外用瀏覽器實測，僅確認 `LanguageContext.tsx` 裡新增的
  `workflow.currentStep` 翻譯值本身存在（讀碼確認），邏輯與英文路徑完全共用同一段程式碼，
  風險低但未逐語系實機驗證。

## 隔離與可重跑資產

- `backend/scripts/verification/seed_qworkflow_currentstep_review.py`（隔離測試種子腳本，
  新建）。
- `react-app/tests-browser/qworkflow-currentstep-review.mjs`（隔離瀏覽器驗證腳本，新建）。
- `docs/workflow/QWORKFLOW-UX-2026-001-evidence/`（5 張截圖，本輪驗證產生）。

## 埠號釋放

隔離堆疊（backend/vite 8200/3200，root 為 `qualitas-manual-dado2a9o`）已於完成後以
`isolated_stack.py down` 拆除，並以 `lsof` 確認埠號釋放；使用者 8198（backend）/3198
（vite）全程監聽未受影響。
