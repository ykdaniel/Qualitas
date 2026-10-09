# IAM 登入帳號顯示與搜尋

## 本批修正

後端 users API 有 username，但 IAM store 原本只留下 `full_name || username` 作為 name，顯示姓名存在時登入帳號因此遺失。四條資料整理路徑（fetchUsers／fetchData／createUser／updateUser）均補上獨立 username。

使用者清單在姓名下顯示登入帳號；兩者相同時不重複顯示，帳號可換行避免長字串撐寬。搜尋加入帳號比對，不新增權限、後端端點或翻譯。

讀碼另確認 `UserModal` 原先以顯示姓名初始化 form.name，而 store 更新會將 payload.name 寫入 username。當 full_name 不等於 username 時，即使管理者只想改其他欄位也可能連帶送出錯誤帳號。本批將初始值改成獨立 username；不改帳號編輯政策、不修改 full_name。

## 檔案

- `react-app/src/store/iamStore.ts`
- `react-app/src/components/IAM/columns.tsx`
- `react-app/src/components/IAM/UserManagement.tsx`
- `react-app/src/components/IAM/UserModal.tsx`
- `react-app/tests-unit/iamUsername.test.ts`

## 證據與限制

新增資料契約測試先重現 username 全部遺失（undefined）。修正後測試覆蓋同名不同帳號、沒有顯示姓名、停用帳號，以及四條 store 資料整理路徑。前端單元測試 110 passed（108 既有加 2 項）；完整型別檢查與 build 通過。

建置過程找出其他三條未補欄位的路徑，已修正後重新通過。表單初始化修正另重跑最終 build。沒有使用真實瀏覽器或修改測試帳號，本輪 UI 顯示／搜尋與表單送出整條流程未做畫面驗收，不把 store 測試稱為端到端證據。後端未變動、未跑後端套件。

保留協作者其他修改，沒有操作開發或使用者 3198 的資料、沒有啟停服務，未 commit／push／部署、未使用 stash／reset／checkout。

## 後續畫面驗收（2026-09-30，獨立執行）

另啟獨立 8202／3202 堆疊，使用既有 `seed_iam_review.py` 與瀏覽器 `iam.localhost:3202`，以 iam_manager 登入。下列為本輪真實畫面操作，非上一輪單元測試：

- 清單同時顯示 `Scope Target` 與 `scope_target`；搜尋登入帳號 `scope_target` 後僅剩該使用者一列。
- 點開該列，表單 Name 的值為真正帳號 `scope_target`。
- 僅修改 email 為 `scopet.updated@example.com` 並填寫變更原因，Save 成功關閉視窗。
- 清單及整頁重新載入後都保留 `Scope Target`／`scope_target`，並顯示新信箱。
- 隔離 DB 唯讀查詢確認 username=`scope_target`、full_name=`Scope Target`、email=`scopet.updated@example.com`。

未發現新缺陷、未修改產品程式；本輪沒有重跑單元測試或建置，110 項與 build 是上一輪證據。本輪未驗收新增帳號、唯讀帳號、同姓名多使用者的畫面操作或手機排版。

本輪自建堆疊已拆除，8202／3202 埠已釋放，驗收分頁已關閉；未對 8198／3198 或開發環境執行任何操作。
