# Q-Workflow 列序號
TASK_ID: QWORKFLOW-ROWNUM-2026-001
使用者直接指示新增 # 以辨識筆數。本次獨立小修不覆寫Claude正在進行的FORMS-CONSISTENCY-2026-002任務三檔。

Workflow.tsx新增#欄，依當前filtered排序index+1顯示；筛選後從1重新計數。完成／空清單colSpan同步增加；未載入完成或error時不顯示筆數，成功後顯示filtered.length。CSS僅加序號欄與筆數文字，語系僅加visibleCount中英文key。不改文件編號、資料或API。

驗證：本次build含TypeScript檢查，結果見同輪回報。未重跑隔離瀏覽器／單元套件，僅顯示層小修。既有qworkflow-columns-review.mjs的14欄與nth定位屬上一版驗證，新增#後不能直接引用其通過結果；本次未改該既有腳本。未操作任何DB或環境服務，未commit/push/部署。
