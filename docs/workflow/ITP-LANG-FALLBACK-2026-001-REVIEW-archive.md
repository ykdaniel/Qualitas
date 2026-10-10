# REVIEW.md — 獨立審查

TASK_ID: ITP-LANG-FALLBACK-2026-001
審查日期：2026-10-07

## EVIDENCE_CHECK
- 核對 TASK、共用函式、單元測試、三個 UI 呼叫端、種子隔離保護、browser-results.md 與前端執行輸出。五個受測檔的目前 SHA-256 與紀錄一致。
- preferEnglishText 以 trim 判斷但回傳原字串，英文優先、空白英文退回有內容中文，舊字串與雙空值維持既有行為。新增測試涵蓋優先順序、原文不變、空值及舊格式。
- tsc/build exit 0，單元 136 pass/0 fail，限定五檔 lint 0 errors/12 warnings；不表示全專案 lint 通過。
- browser-results.md 列出兩入口選項、新舊 Checklist 六項建立結果與獨立 GET 比對、來源 detail_data 雜湊及舊 Checklist 不變。這是執行者保存的整理證據，非本審查重新操作，也不是完整原始網路封包；本批結合程式與單元證據接受，不要求重跑。

## SCOPE_CHECK
- ITPModals 只改 Activity/Criteria 取值，保留編號、順序、分隔、無 Criteria 時 Activity 替代及保存流程。
- 兩編輯器 Insert After 採同一 helper；沒有新增 Standard 對應、翻譯、來源回填或核准修改。
- 種子在 database import/Session 前執行隔離 guard，密碼由環境變數提供。

## DECISIONS_CHECK
- 符合已确认的中英擇一填寫政策與本批英文優先 fallback 指示。
- 手機延期；其他已封存任務及未部署修復的狀態不因本 PASS 改變。

## VERDICT
- [x] PASS
- [ ] REVISE
- [ ] HUMAN_REQUIRED

## REQUIRED_FIXES
無。本批未發現阻擋結案的問題。

## NEXT_STEP
逐字封存 TASK/STATUS/REVIEW，不另開補正輪、不重跑測試。核對身分後只拆除本批專用 8270/3270，保留使用者 8240/3240、8198/3198。未授權提交、推送或部署。等待使用者試用回饋。
