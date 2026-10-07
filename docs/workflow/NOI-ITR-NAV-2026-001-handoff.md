# NOI-ITR-NAV-2026-001 — NOI Related Documents 點擊 ITR 導航修復

延續 NOI-ITR-UX-2026-001/002 已確認並 PASS 結案的導航缺陷（完整原文見
`docs/workflow/NOI-ITR-UX-2026-002-archive.md`）。本輪為產品修正，修改前端程式碼。

## 根因（PRECHECK 確認，修復前已核對原始碼）

- `RelatedDocuments.tsx` 的 `handleOpen`（約行 104-109）本來就有 `onOpen` escape hatch：
  有提供時呼叫 `onOpen(target.entityType, target.id)`；未提供時才落回
  `navigate(ENTITY_ROUTE[target.entityType])`（純文字路由，不帶 id）。
- `NOIDetailModal.tsx` 呼叫 `<RelatedDocuments entityType="noi" entityId={...} />`（原第
  481 行）未傳入 `onOpen`，因此一律落回無 id 的清單導航——這就是缺陷的唯一根因。
- `target.id` 是後端 `RelatedEntity.id`（`backend/schemas.py` 行 1657-1668），為內部
  record id，不是 `referenceNo`/文件編號；`ITR.tsx` 的 `?openId=` 消費 effect（行
  79-92）用 `itrList.find(item => item.id === openId)` 比對，型別與語意完全一致。

## 修復內容（僅此一處，未新建任何機制）

`react-app/src/components/NOI/modals/NOIDetailModal.tsx`：

1. import `useNavigate`（from `react-router-dom`），在元件內建立 `const navigate =
   useNavigate();`。
2. 將 `<RelatedDocuments>` 呼叫改為：
   ```tsx
   <RelatedDocuments
       entityType="noi"
       entityId={existingItem.id}
       onOpen={(entityType, id) => navigate(`/${entityType}?openId=${encodeURIComponent(id)}`)}
   />
   ```

沒有修改 `RelatedDocuments.tsx`（`onOpen` escape hatch 本來就存在，只是呼叫端沒接上）、
沒有修改 `ITR.tsx`／`NOI.tsx` 的既有 deep-link／返回機制、沒有修改後端
`related_service.py`／`schemas.py`。

## 既有返回機制（沿用，未新建）

- `NOI.tsx`：`openedViaDeepLinkRef`（行 134-135）在透過 `?openId=` 開啟時設為 true；
  `onClose`（行 410-417）檢查此 ref，為 true 時呼叫 `navigate(-1)`，否則走原本的
  `setIsModalOpen(false)` 關閉。
- `ITR.tsx` 有完全對稱的機制：`openedViaDeepLinkRef`（行 72-78）、消費 effect（行
  79-92）、`onClose`（行 382-400）同樣在 deep-link 開啟時呼叫 `navigate(-1)`。
- 本輪只是讓 NOI 點擊關聯 ITR 時改用 `?openId=` 這條既有入口，進入 ITR.tsx 之後，關閉／
  瀏覽器返回的落點完全由 ITR.tsx 這個既有機制決定，本輪沒有新增、沒有修改這段邏輯。
- NOI 表單的 `useDraftGuard`（`NOIDetailModal.tsx` 行 185）註冊的離開保護，透過
  `LeaveGuardProvider` 全站 `useBlocker`，在表單 dirty 時會攔截包括這次新增的
  `navigate()` 呼叫——這是既有攔截範圍，本輪沒有額外處理、也沒有繞過它。

## 隔離環境驗證（已完成，全部實測通過）

- 環境：`isolated_stack.py up --port 8200 --vite-port 3200`，vite 啟動腳本為新建的
  `react-app/tests-browser/noi-itr-nav-vite-launcher.mjs`（明確綁定 8200/3200，不是
  沿用既有 `project-create-vite.mjs`——那個腳本 hardcode 使用者自己的 3198/8198+
  strictPort，若直接沿用會跟使用者的真實環境衝突，第一次嘗試已實際遇到 `vite_failed`
  才發現這點，因此改為新建一個只換埠號的版本）。
- 種子：沿用既有 `backend/scripts/verification/seed_noi_itr_ux_review.py`（**未修改**），
  產生 NOI-ITR-UX-2026-001/002 已用過的三種情境（NO-ITR／ONE-ITR／REINSPECTION）。
- 驗證腳本：新建 `react-app/tests-browser/noi-itr-nav-review.mjs`——這是**通過/失敗斷言
  腳本**（與前兩輪的純觀察腳本不同，本輪有實際產品修正，需要可驗證的斷言）。

### 實測結果（14 項斷言，全數 PASS）

| 驗收項目 | 斷言內容 | 結果 |
|---|---|---|
| AC1a | 點擊原始 ITR（`QTS-NIUP1-ITR-000003`），開啟的紀錄確實是這一筆（核對
  Reference no. 欄位值），不是複驗那一筆 | PASS |
| AC1a | URL 的 `?openId=` 已被 ITR.tsx 的消費 effect 清除（確認走 deep-link 路徑） | PASS |
| AC1a | 關閉該筆 deep-link 開啟的 ITR 後，落回 `/noi`（既有 `navigate(-1)` 機制） | PASS |
| AC1b | 同一筆 NOI，點擊複驗 ITR（`QTS-NIUP1-ITR-000004`），開啟的紀錄確實是這一筆，
  不是原始那一筆——兩者分別驗證，不是「永遠開第一筆」 | PASS |
| AC3 | 從 deep-link 開啟的 ITR 直接按瀏覽器真實返回（非點擊關閉），落回 `/noi` | PASS |
| AC2 | NOI 表單有未保存變更時點擊關聯 ITR，既有的 Unsaved Changes 離開保護彈窗確實
  出現，導航在使用者確認前被攔截（URL 仍停在 `/noi`，沒有先跳到 `/itr` 再彈窗） | PASS |
| AC2 | 選擇 Stay（取消離開）後，仍停留在原 NOI，剛才輸入的 remark 內容原樣保留 | PASS |
| AC4 | 另一個情境（ONE-ITR，`QTS-NIUP1-NOI-000002`）的 deep-link 也正確開啟對應的
  `QTS-NIUP1-ITR-000002`，確認修復不只在複驗情境下成立 | PASS |
| AC4 | 在 deep-link 開啟的 ITR 上執行成功保存，記錄實際落點（`/noi`，見下方
  RISKS 關於此觀察的限制說明） | 已記錄，非斷言項 |

完整逐字 log 與 7 張截圖見本輪執行紀錄；截圖檔名：`ac1a-01-after-click-original-itr.png`、
`ac1a-02-after-close-original-itr.png`、`ac1b-01-after-click-reinsp-itr.png`、
`ac2-01-unsaved-changes-prompt.png`、`ac2-02-after-stay-input-preserved.png`、
`ac3-01-after-browser-back-from-reinsp-itr.png`、`ac4-01-after-save-deep-linked-itr.png`。

## 前端檢查（已執行，實際數字）

- `tsc --noEmit`：通過，0 錯誤。
- `npm run lint`：**13 個既有錯誤、21 個既有警告**——全部位於本輪未修改的檔案
  （`AppProviders.tsx`、`RelatedDocuments.tsx`、`RichTextEditor.tsx`、
  `useWorkflowData.ts`、`itpParser.ts`），以 `git diff --stat` 核對這些檔案不在本次工作
  目錄已有的未提交修改清單內變動範圍——這些是協作者既有未提交修改中已存在的既有問題，
  不是本輪新增；本輪修改的 `NOIDetailModal.tsx` 未出現在 lint 錯誤清單中。
- `npm test`（`scripts/run-unit-tests.mjs`）：**123/123 全部通過**，0 失敗。

## 風險／限制

- AC4 的「成功保存後落點」只記錄一次真實觀察（`/noi`），**未斷言**此行為一定正確或
  一定如此——保存成功後的導航邏輯本身不屬於本輪修改範圍（本輪只改了點擊進入的那一步），
  這裡只是誠實記錄實測結果供下一輪或審查參考，不代表「已驗證保存流程的落點機制」。
- 本輪只驗證 NOI→ITR 這一條路徑（任務明確要求範圍）。ITP/NCR 的 Related Documents
  呼叫端仍未傳入 `onOpen`，點擊後仍是舊的無 id 清單導航——**這是刻意保留，不是遺漏**
  （任務範圍明確要求「不改其他關聯文件的既有導航」）。
- 瀏覽器返回測試只在 Playwright 預設 Chromium 下驗證，未測試其他瀏覽器。

## 隔離堆疊拆除

- Root：`/private/var/folders/.../qualitas-manual-revn7yku`（backend 8200 / vite 3200）。
- `isolated_stack.py down` 執行成功，`lsof` 確認 8200/3200 已釋放；使用者 8198/3198
  全程在監聽、未受任何影響。

## 新建資產

- `react-app/tests-browser/noi-itr-nav-vite-launcher.mjs`（本輪專用 vite 啟動腳本，
  綁定 8200/3200，不沿用 hardcode 使用者埠號的既有腳本）。
- `react-app/tests-browser/noi-itr-nav-review.mjs`（本輪的通過/失敗斷言驗證腳本）。
- `docs/workflow/NOI-ITR-NAV-2026-001-evidence/`（7 張截圖）。
