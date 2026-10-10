# REVIEW.md — 獨立審查

TASK_ID: ITP-CRITERIA-LAYOUT-2026-001
審查日期：2026-10-07

## EVIDENCE_CHECK
- 已核對 TASK、STATUS、Claude 交接、兩個產品檔 git diff、browser-results.md、前端檢查輸出，並目視查看寬桌面與清單頁編輯器截圖（01、08）。本審查未重跑瀏覽器或測試。
- 兩個產品檔目前 SHA-256 與 tsc/eslint 紀錄一致。tsc/build exit 0；unit-test 紀錄 129 pass、0 fail；限定兩檔的 eslint 為 0 errors、11 warnings，exit 0，不代表全專案 lint 通過。
- 截圖支持 Criteria 左 EN／右中文與成組呈現。四入口、幾何量測、Cancel、儲存後完整字串比對依 browser-results.md 的執行者紀錄接受；該檔是整理後紀錄，非保存的原始自動化執行輸出，不冒稱審查者獨立重現。
- 往返只測 ITPDetail、ITPAdvancedEditor 只在 1366 驗排列、手機未測皆有揭露。對本批只改 JSX 容器/class、未改事件綁定的範圍足夠，不要求擴大回歸。

## SCOPE_CHECK
- 兩檔產品差異只涉及 Phase grid 與 Criteria 外框/雙欄容器/data attribute，textarea value/onChange、rows、resize、刪除事件維持原樣。
- 未更動 Activity/Standard、保存、資料結構、排序、核准、英文必填。未因縮短表單降低字體或 textarea 行數。

## DECISIONS_CHECK
- 英文必填與 BACKLOG #36 衝突仍未決策，本 PASS 不包含認可該規則。
- 手機延期；DOCX 修復未部署、NOI 匯出 REVISE 的獨立狀態不變。

## VERDICT
- [x] PASS
- [ ] REVISE
- [ ] HUMAN_REQUIRED

## REQUIRED_FIXES
產品修正：無。
文件收尾：STATUS/handoff 的 lint 結果明列「限定兩檔，0 errors / 11 warnings，exit 0」，避免將 exit 0 描述為沒有警告；不要求清除這些警告或重跑測試。

## NEXT_STEP
- 完成上述文件收尾後，逐字封存本輪 TASK、修正後 STATUS、REVIEW；不另開補正輪，不重跑已接受驗收。
- 只拆除本輪自建 8260/3260（先核對 stack 身分），保留 8240/3240、8198/3198 與其資料。
- 未授權 commit/push/部署。等待使用者試用回饋，不自行新增 UI 範圍。
