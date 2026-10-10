# REVIEW.md — 獨立審查

TASK_ID: DOCX-PATH-GUARD-2026-001
審查日期：2026-10-07
審查者：GPT

## EVIDENCE_CHECK
- 已核對 TASK/STATUS、產品 diff、兩份完整測試原始碼與修復前後輸出。審查未重跑測試、未操作任何運作中環境。
- 目前 helper 及兩份測試的 SHA-256 均符合 after-fix 記錄。before/after 的測試雜湊相同；產品差異僅 containment 判定。
- 修復前有效執行為 9 failed/23 passed；失敗包含六個同前綴路徑、圖片嵌入、ITR/NCR HTTP。初次 fixture 缺 submit 的失敗已區隔，不作安全缺口證據。
- 修復後 32 passed/103 warnings、exit 0。正常URL解析與根內圖片保留；同前綴兄弟及越界 symlink 被拒絕。
- HTTP 測試經 FastAPI 測試客戶端、真實認證/更新/匯出路由、自有 SQLite 和假圖片，並核對Word媒體內容雜湊；不是正式站或部署環境驗證。

## SCOPE_CHECK
產品變更限定 resolve_local_upload_path，未改服務匯出邏輯或資料契約。commonpath 比 startswith 正確區分目錄元件，realpath 保留既有 symlink 解析；ValueError 拒絕。保留未提交工作，不改写歷史。NOI 匯出任務仍 REVISE，不能由本任務通過而連帶結案。

## DECISIONS_CHECK
未改權限、資料範圍、ITP必填或手機排程。此PASS僅針對目錄前綴缺口，不是整套匯出安全/版面/正式環境驗收，也不是部署授權。

## VERDICT
- [x] PASS
- [ ] REVISE
- [ ] HUMAN_REQUIRED

## REQUIRED_FIXES
無阻擋項目。封存前文件微調：STATUS 所述直接測試檔應為30例（29個路徑案例＋1個嵌入案例），HTTP2例，共32；不要寫成直接測試檔總共29例。這不影響實際32項通過證據，不需重跑。

## NEXT_STEP
1. 修正上述計數文案，逐字封存TASK/修正後STATUS/本REVIEW，保留證據，不另開補測輪。
2. 本次最小修復已有相稱回歸覆蓋，不要求完整後端、前端或匯出版面套件；若交付版本仍為已核對內容，不需為形式再重跑。
3. 準備獨立部署交接（只準備，不執行）：目標後端服務/容器、目前版本待確認、此次helper雜湊、必要的載入/重啟方式、舊檔備份及回退方法、部署後只用合法測試資料的匯出冒煙檢查。不得打包整個混合工作樹或順帶上線其他未審變更。實際部署待使用者明確指示。
4. 正式環境尚未經本次查核；本機PASS不代表線上已修復或證實目前線上版本。保留8240/3240與8198/3198，不查正式敏感檔案、不提交推送部署。NOI待辦與ITP政策分開處理。
