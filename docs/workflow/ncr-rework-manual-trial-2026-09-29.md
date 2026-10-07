# NCR Rework 畫面試用（2026-09-29）

本輪僅操作獨立隔離環境，未修改產品程式碼。與使用者的 8198/3198 環境分離，使用後端 8202、前端 3202，瀏覽器以 ncr.localhost 隔離登入 cookie。

## 實際操作與證據

- 使用既有 seed_ncr_review.py 建立的 ncr_closer 帳號（具備建立、更新、結案權限，無核准權限）；帳號未限定專案，本輪不驗證資料範圍。
- 真實畫面建立唯一測試 NCR：QTS-NCC-NCR-000001，主旨「隔離試用－鋼筋間距改善結案」。此為獨立 NCR，未連結 ITR；畫面有未連結 ITR 的提醒。
- 填入 Rework、立即改善、直接原因、根因、矯正與預防措施、Recurrence=No、複檢編號 TEST-REINSPECT-001、驗證說明。所有內容僅為測試資料，複檢編號不是實際檢驗證據。
- 加入自行產生的純色 PNG 測試圖片作為 Improvement Photo，並同時設 Effectiveness Verified=Yes 後保存，畫面拒絕，明確提示須先保存照片、再設定 Yes，且本次未保存。此處只觀察到 UI 提示，未另外比對拒絕當下的 DB。
- 保留同一視窗與輸入，將驗證改 Pending 後保存成功；重開同一 NCR，確認改善照片及複檢編號、驗證說明仍在。
- 再改 Effectiveness Verified=Yes 並保存成功；列表顯示 Closed、結案日期 2026-09-29。
- 唯讀查詢隔離 DB 確認同一單號 status=Closed、productDisposition=Rework、effectivenessVerified=Yes、recurrence=No；根因、矯正與預防措施文字及複檢編號均與輸入一致。

## 結論與範圍

此一 Rework 路徑由 Open 完成 Closed，沒有阻斷；未手動經過 In Progress/Resolved，不宣稱所有狀態轉換皆已驗證。

UX 候選：新改善照片與驗證 Yes 不能同次保存，需要 Pending 保存照片、重開、Yes 再保存。既有提示可引導完成且輸入保留，屬操作步驟改善候選，並非本輪確認的資料遺失或權限缺陷。若另批改善，必須保留後端「已保存且屬於本 NCR 的有效照片」檢查；不能將尚未完成的上傳當作結案證據。

未涵蓋 Repair/Use As Is 核准分支、缺結案權限、結案後編輯限制、真實 ITR 關聯或照片實際工程內容；未跑自動化套件。本輪沒有修改翻譯、業務規則或既有資料。Claude 不需重做已完成的 ITR 修正。
