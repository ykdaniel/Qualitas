# OPTIMISTIC-LOCK-2026-001 — B3b（主檔、IAM、KM 縮減版）

- **TASK_ID**：OPTIMISTIC-LOCK-2026-001（本輪＝B3b）。
- **基準**：e651f87a（B3a）。工作樹 scratchpad/ol-b3b。
- **協調中心 2026-10-18 決定**：
  - KM 改為文件登錄（KM-DOCS-2026-001，D2 會移除 KMModals），所以 B3b 的 KM 部分縮到兩項：主檔存檔 409 加重新載入、kmStore 錯誤原樣丟出。
  - KM 後端由 KM 討論串負責，本批不動。
  - 若新增 BACKLOG 條目，從 #62 起編。

## 範圍
做法沿用 B2／B3a。
- **承包商**（Contractors.tsx、ContractorModal.tsx）、**專案**（ProjectModal.tsx）：各自記版本並加 key，409 後重新載入；contractorsStore／projectStore 抓取成功時清掉 error（順修）。
- **人員**（ContractorPersonnel.tsx）：
  - 列上直接編輯：開始編輯時記住這一列的版本；409 後重新載入，並以存檔的內容重新進入編輯（會先確認捨棄）。
  - 啟用／停用：用列上的版本；409 後直接重新載入，不需確認。
- **IAM 帳號**（UserManagement、UserModal、UserScopeSection）：
  - 帳號和範圍共用同一個版本（兩個端點動的是同一個 row_version，而且視窗在兩次存檔之間不關）。
  - 新建帳號時，範圍那一次寫入用建立回傳的版本。
  - iamStore 新增 saveUserScope：存好範圍後把新版本寫回清單（順修）。
- **角色**（RoleManagement、RoleModal）：一般的版本加重新載入。
- **KM**（KMModals、kmStore）：主檔存檔 409 時，用視窗本身的重讀（setLoadAttempt）重新載入；kmStore 的 add／update 把 axios 錯誤原樣丟出（順修）。

## 完成條件
tsc、npm、R1、隔離預覽（使用者確認）、以 e651f87a 為父在本地 commit。
