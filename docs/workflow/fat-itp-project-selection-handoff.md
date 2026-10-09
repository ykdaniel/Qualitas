# FAT／ITP 新建專案選擇 — Claude 接手紀錄

2026-09-28，由 Codex 實作並執行以下驗證。未 commit/push/部署。

## 完成範圍

- FAT、ITP 新建表單增加專案選單，選項來自既有 `GET /api/projects/`，使用後端 scope 過濾。以 skip/limit=200 讀取分頁，不使用 localStorage 的 Dashboard 篩選當作授權或預設值。
- 不任選第一個專案。留空仍走既有後端規則：單專案帳號自動歸屬、多專案受限帳號拒絕、無範圍帳號保留既有行為。這輪沒有改成所有帳號一律必填。
- FAT 建立 payload 和 ITP store 的 addITP payload 都傳出所選 `project_id`。
- 只在新建時顯示，沒有增加既有紀錄重新指派專案的功能；ITP 成功建立後的附件重試沿用原 id 與選定值。
- 載入中／載入失敗禁止新建保存（ITP 包含 Publish），清單失敗可獨立重試、保留其他輸入。不放寬後端任何權限。

## 本輪檔案（其他既有 diff 不屬於本輪）

產品：
- `react-app/src/hooks/useCreationProjects.ts`（新增，小型選項載入 hook）
- `react-app/src/components/Shared/CreationProjectField.tsx`（新增，中英文選單及失敗提示）
- `react-app/src/components/FAT/FAT.tsx`（新建選單、保存守衛、project_id 傳遞）
- `react-app/src/components/ITP/ITPModals.tsx`（新建選單、Save/Publish 守衛）
- `react-app/src/store/fatStore.ts`（FATItem 型別欄位）
- `react-app/src/store/itpStore.ts`（ITPItem 型別欄位、建立 payload）

驗證資產：
- `react-app/tests-unit/itpStore.test.ts`：新增實際 HTTP adapter payload 的 project_id 斷言。
- `backend/scripts/verification/seed_project_create_review.py`：只允許隔離模式；三種範圍帳號，各有 FAT/ITP view＋create、contractors:view，沒有 update。密碼取隔離工具本次生成的 INITIAL_ADMIN_PASSWORD，不硬編碼。
- `react-app/tests-browser/project-create-vite.mjs`：沿用專案 Vite 設定，只指定隔離 host/ports/API target（8198/3198）。
- `react-app/tests-browser/project-create-review.mjs`：真正 assert，失敗退出非零；直接檢查 request payload 與隔離 DB。

## 已執行驗證

- tsc --noEmit：通過。
- npm test：91 passed（原90＋本輪1）。
- Vite production build：通過，输出到 /tmp/qualitas-project-build，沒有寫入 react-app/dist。
- 新增 hook/選單元件 ESLint：通過；沒有重跑全專案 lint。
- 真實隔離登入、瀏覽器、後端：22 項斷言通過（FAT/ITP 各11項）：
  - 只列出 P1/P2，排除 P3；初始不任選。
  - 選 P2 後建立200，POST 與 DB 的 project_id 都為 P2。
  - 手造 P3 POST 仍403。
  - 取消不新增。
  - 模擬清單503時禁止保存，解除後重試保留輸入。
  - 單專案帳號留空仍建立成功，由後端補 P1。
- 未改後端業務程式，未重跑完整後端或之前的全部保存/Publish瀏覽器套件。

測試初次未成功的原因如實保留：啟動工具等待 `vite up`，第一版測試入口印了別的文字，工具已拆除失敗堆疊；修正入口後成功。測試帳號初版 email 用 example.test 被 profile schema 拒絕，造成新增按鈕不可見；改成 example.com 後完成上述驗收。兩者為本輪測試資產問題，未修改產品驗證規則。

## 重跑方式（從 repo 根目錄）

```sh
python3 backend/scripts/verification/isolated_stack.py up --port 8198 --vite-port 3198 --vite-script "$PWD/react-app/tests-browser/project-create-vite.mjs" --env SMTP_HOST= --env SMTP_USER= --env SMTP_PASSWORD= > /tmp/project-create-stack.json
```

確認輸出 ok=true 後，從 JSON 的 root 取得本輪暫存目錄，執行：

```sh
python3 backend/scripts/verification/isolated_stack.py seed --root <本輪root> --script "$PWD/backend/scripts/verification/seed_project_create_review.py"
node react-app/tests-browser/project-create-review.mjs /tmp/project-create-stack.json
python3 backend/scripts/verification/isolated_stack.py down --root <本輪root>
```

密碼由隔離工具 seed 環境與 browser 讀取本輪 admin-password 檔案取得；不要印出密碼。若測試失敗仍必須 down。

## Claude 接手時注意

- 工作區原本已有大量其他協作者未提交修改；不要 stash/reset/checkout，不能把上述整個檔案的 git diff 都當成本輪改動。
- 舊 `itp-deferred-create-review.mjs` / `fat-save-failure-review.mjs` 以多專案帳號「未選專案」觸發403，現在仍可成立；它們註解中的「表單沒有專案欄位」已過時。之後重跑時更新說明，保留真實後端拒絕案例，不刪掉測試。
- 本輪未單獨驗證：無範圍帳號建立、超過200個專案的真實清單、英文瀏覽器、多專案 Publish/附件部分失敗完整流程、專案清單載入後即被移除的競爭情境。沒有宣稱全量驗收。
- 多專案 FAT/ITP 原先無法選擇歸屬的阻斷已修；跨模組承包商選項權限仍是獨立待辦。Projects 角色名稱授權已於 2026-09-28 修正為 `contractors:manage:all`，詳見 [Projects 授權修正交接紀錄](projects-authorization-fix-handoff.md)。
- 上一輪本助手修過 `backend/scheduler.py`（停用收件人）及其新增測試，已有33項通過，與本輪前端修改分開。
