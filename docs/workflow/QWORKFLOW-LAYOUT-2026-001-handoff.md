# STATUS — Q-Workflow 摘要版面
TASK_ID: QWORKFLOW-LAYOUT-2026-001
RESULT: DONE，待獨立審查

## FILES_CHANGED
- Workflow.tsx：Q-Workflow/NOI編號與目前步驟、既有completion_percent整合左側固定欄；移除原獨立右側百分比欄，保留unverified證據提示；新增done/current/pending圖例。Subject取值與欄位保留。
- Workflow.module.css：232px固定摘要欄，編號可換行與選取，圖例樣式。
- LanguageContext.tsx：僅新增流程完成度與三項圖例的中英文必要key。
- TASK/STATUS/REVIEW及封存交接文件。
## FILES_ADDED
- react-app/tests-browser/qworkflow-layout-review.mjs
- docs/workflow/NOI-ITR-LABEL-2026-001-pre-layout-archive.md（上一批待審查，封存不代表PASS）
- 本批handoff及evidence資料夾。
## TESTS_RUN
- 隔離真實後端與UI：中英文×375/820/1440px，48項通過。確認圖例、Subject保留、11%原值及流程完成度標題、摘要在橫向起點／終點完整可見與命中、無頁面橫溢、NOI節點導頁。
- 既有qworkflow-currentstep-review.mjs：39項通過，含11%/22%/100%/Void、專案切換及NOI導頁。
- npm test 123 passed；npm run build（含tsc）成功。初次於repo根目錄執行npm沒有package.json而失敗，改至react-app後成功。
- 已查看英文1440截圖；截圖為橫向捲到終點狀態，Subject部分移到sticky摘要後方屬水平捲動，不表示刪除Subject。
## TESTS_NOT_RUN / RISKS
- 未重跑後端（無修改）、全域lint；既有lint失敗未修，不宣稱所有checks通過。
- 未新增ITR/NCR導頁／權限驗證，導航原碼未改；Subject長文仍沿用原本截斷及title提示，不聲稱長文已完整展開。
- 小螢幕詳細節點仍需表格內水平捲動，摘要固定可讀。
## SAFETY_CHECK
自建8200/3200已down；不操作開發DB或使用者8198/3198；未stash/reset/checkout、commit/push/部署，保留協作者修改。REVIEW留待獨立審查。


## 使用者視覺回饋後調整
使用者指出前版難看：改為編號與百分比徽章同排，NOI與目前步驟降低字級／對比，移除每列重複的流程完成度文字（保留百分比title及aria-label）。桌面固定欄272px；實測手機272px會遮住節點點擊，已改回232px並重測。Subject、原比例算法、節點導航不變。
本次48項中英文375/820/1440實機測試通過，build含tsc通過。既有39項與單元測試未再重跑，不列為本次新證據。截圖／log於evidence/refined；已查看英文桌面截圖。兩個自建堆疊皆拆除，使用者環境與資料未動。


## 最新指示：分欄呈現（取代合併摘要方案）
使用者明確要求分欄：最終順序Q-Workflow／NOI／Subject／目前步驟／流程完成度／9節點。只固定Q-Workflow，保留Subject與證據未驗證提示；無新業務判斷。此前summary合併方案與其畫面測試僅留歷史，不再代表最終版。
新增qworkflow-columns-review.mjs，中英文×375/820/1440共54項通過：14欄、編號與NOI分離、Subject存在、11%獨立、完成度欄名、圖例、無頁面橫溢與NOI節點導航。build含tsc成功；未重跑單元／後端／lint。截圖與log存columns/，已查看英文桌面截圖。隔離堆疊已拆除，未操作使用者環境。手機需在表格內水平捲動才能看其他欄位，此為分欄版設計，不再宣稱所有摘要同時可見。
