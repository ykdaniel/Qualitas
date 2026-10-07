# NOI-ITR-UX-2026-001 — NOI↔ITR 關聯辨識與返回流程審閱

純審閱批次，不修改產品程式碼。來源：使用者直接交辦（2026-10-03），延續 Q-Workflow→NOI→ITR
系列業務操作審閱。

## 既有文件核對（避免重做）

讀 `BACKLOG.md` 全文與以下既有交接文件後，確認以下為已知、已記錄、不重複的既有限制：

- **`BACKLOG.md` #32**（2026-09-20）：已明確記錄
  `backend/workflows/relationships.py` 的「Related-documents graph」只有
  `ITP<->NOI`、`NOI<->ITR`、`NOI<->NCR` 三條邊；`ITR->NCR`、`ITR->複驗ITR`、
  `NCR->ITR` **沒有邊**，所以 ITR 或 NCR 自己的 Related Documents 面板無法反向導向到
  對方。這是本輪審閱一開始就確認過的既有已知限制，**不是本輪新發現**，不重複回報。
- `docs/workflow/ITR-STATUS-2026-002-archive.md`、
  `docs/workflow/QWORKFLOW-UX-2026-002-archive.md`：本系列前兩批次，分別處理 ITR 核准
  狀態誤判、Q-Workflow 目前步驟文字，與本輪審閱範圍（NOI→ITR 關聯辨識）不重疊。

本輪審閱聚焦在**既有文件未記錄過**的部分：NOI 自己的 Related Documents 面板（`NOI<->ITR`
這條邊確實存在）在實際操作時，使用者能否辨識/找到/返回。

## 審閱方法

隔離環境（`backend/scripts/verification/seed_noi_itr_ux_review.py`，**隔離測試種子
腳本**——會實際寫入測試資料，不是唯讀腳本）建立三種 NOI：

1. `QTS-NIUP1-NOI-000001`（NO-ITR）— 完全沒有 ITR。
2. `QTS-NIUP1-NOI-000002`（ONE-ITR）— 一筆正常（非複驗）ITR。
3. `QTS-NIUP1-NOI-000003`（REINSPECTION）— 原始 ITR 失敗（`inspectionResult=Fail`、
   `status=Reject`）、一筆 NCR（`itrNumber` 指回原始 ITR、`reInspectionNumber` 指向
   複驗 ITR）、一筆複驗 ITR（`isReInspection=True`、`originalItrId` 指回原始
   ITR、`reInspectionCount=1`）。複驗 ITR 的 `subject`/`description` **刻意**與原始 ITR
   完全相同——這不是湊巧，是讀碼確認
   `backend/services/itr_service.py` 的 `create_reinspection()`（第 1252 行起）本來就是
   把原始 ITR 的 `subject`/`description` **逐字複製**到新的複驗 ITR 上，這是既有、本批
   未觸碰的行為，本輪只是如實重現這個真實資料形狀，不是刻意設計一個極端案例。

實際登入隔離環境操作畫面（非純讀碼），逐一打開三個 NOI 的編輯視窗，觀察 Related Documents
區塊的實際呈現與點擊行為。

## 發現（最多兩項，依影響排序）

### 問題 1：點擊 Related Documents 裡的 ITR，不會開啟該筆紀錄，而是跳到未篩選的 ITR 總清單

**分類：已重現的缺陷（非 UX 建議、非待確認業務規則）**

**重現步驟**：
1. 開啟 `QTS-NIUP1-NOI-000003`（REINSPECTION）的 Edit NOI 視窗，捲動到 Related
   Documents 區塊。
2. 點擊 Downstream 清單裡任一筆 ITR（例如 `QTS-NIUP1-ITR-000004`，In Progress 那筆）。

**實際畫面**：點擊後，畫面從「Edit NOI」彈窗直接跳到 `/itr` 頁面，顯示的是**系統裡全部
ITR 的清單**（本次測試帳號看到的是全部 3 筆 ITR，不是只篩選出這筆 NOI 相關的），沒有自動
展開/高亮剛才點的那一筆，也沒有任何篩選條件帶過去。見
`02-reinspection-noi-related-documents-identical-titles.png`（點擊前）與
`03-after-click-lands-on-unfiltered-itr-list.png`（點擊後——注意畫面上被反白的是
`QTS-NIUP1-ITR-000003`，不是剛才實際點擊的 `-000004`，這個反白純粹是清單本身排序/顯示的
巧合，與點擊行為無關，進一步證明這次導航完全沒有帶任何「使用者剛才點了哪一筆」的狀態）。

**對使用者的影響**：使用者從 NOI 想確認「這筆關聯的 ITR 現在狀況如何」，點下去卻被丟到一個
不相關、未篩選的總清單，必須自己重新搜尋/捲動找到正確的那一筆——尤其當系統裡 ITR 筆數很多、
或像複驗情境一樣有好幾筆文件編號相近的紀錄時，這個「自己再找一次」的成本會更高。這與
Q-Workflow 畫面裡的 checkpoint 節點點擊（會用 `?openId=` 正確 deep-link 開啟特定紀錄）是
明顯不一致的體驗——同一個系統裡，有一種點擊方式做得到精準導航，Related Documents 面板卻
做不到。

**根因（讀碼確認）**：`react-app/src/components/ui/RelatedDocuments.tsx` 的 `handleOpen`
（第 100 行起）：

```ts
const handleOpen = useCallback(
    (target: RelatedEntity) => {
        if (onOpen) {
            onOpen(target.entityType, target.id);
            return;
        }
        navigate(ENTITY_ROUTE[target.entityType]);
    },
    [onOpen, navigate],
);
```

`NOIDetailModal.tsx`（第 481 行）呼叫 `<RelatedDocuments entityType="noi"
entityId={existingItem.id} />` 時**沒有傳入 `onOpen`**，所以永遠落到
`navigate(ENTITY_ROUTE[target.entityType])` 這個預設分支——也就是單純
`navigate('/itr')`，不帶任何 id 或篩選參數。元件本身其實已經預留了 `onOpen` 這個
escape hatch（見元件開頭的 props 定義與檔案頂部註解「navigate-on-click as the default
with an `onOpen` escape hatch」），只是 NOI 這個呼叫端沒有使用。

**最小改善方案**：`NOIDetailModal.tsx` 呼叫 `<RelatedDocuments>` 時傳入
`onOpen={(entityType, id) => navigate(`/${entityType}?openId=${encodeURIComponent(id)}`)}`
（或等效寫法），沿用 Q-Workflow checkpoint 節點已經在用的同一套 `?openId=` deep-link
慣例——`ITR.tsx`／`NOI.tsx` 本身都已經支援消費這個參數（`useEffect` 讀 `searchParams.get
('openId')` 自動開啟對應 modal），不需要新增後端 API 或新的前端機制，純粹是把既有的
`onOpen` 參數接上既有的 deep-link 慣例。這個改法同時也能順便改善「返回原流程」（見下方
問題 2 的討論）：若未來要讓關閉 ITR 回到 NOI，deep-link 進入是前提。

**本輪未動手修**：依交辦「本批不改產品」，僅回報，不實作上述方案。

### 問題 2：複驗 ITR 與原始 ITR 在 Related Documents 清單裡標題完全相同，無從一眼分辨

**分類：已重現的缺陷**

**重現步驟**：開啟 `QTS-NIUP1-NOI-000003`（REINSPECTION）的 Edit NOI 視窗，捲動到
Related Documents 區塊的 Downstream 清單。

**實際畫面**（`02-reinspection-noi-related-documents-identical-titles.png`）：清單裡兩筆
ITR 都顯示綠色「ITR」徽章＋標題「Rebar spacing inspection」，文字一字不差。唯一能分辨的
線索是：(a) 文件編號 `QTS-NIUP1-ITR-000003` vs `-000004`（數字大小需要自己比較，沒有
「原始」/「複驗」字樣提示該怎麼解讀）；(b) 狀態 `Reject` vs `In Progress`；(c) 日期
`2026-09-20` vs `2026-09-25`。沒有任何徽章、標籤或文字明確說「這是複驗」「這是原始失敗
紀錄」。

**對使用者的影響**：使用者第一眼看到兩筆同名 ITR，必須自己推理（透過比較文件編號大小或
狀態）才能確定哪一筆是原始失敗紀錄、哪一筆是複驗結果——如果這個 NOI 甚至有多次複驗（
`reInspectionCount` > 1，理論上可能發生），清單裡會出現三筆以上同名 ITR，辨識難度更高。
這與本次任務的核心需求「尤其複驗 ITR 要能跟原始 ITR 分清楚」直接相關。

**根因（讀碼確認）**：`backend/services/itr_service.py` 的 `create_reinspection()`
把原始 ITR 的 `subject`/`description` 逐字複製到新的複驗 ITR（這是既有、合理的設計——
複驗本來就該檢驗同一件事）；而 `backend/services/related_service.py` 的 ITR 顯示 meta
（`title_fields=("subject","description")`）沒有把 `isReInspection`/`reInspectionCount`
這些既有欄位（`models.py` 裡已經有）納入顯示或 `RelatedEntity` 的回傳資料——不是資料
不存在，是沒有被這個面板讀出來顯示。

**最小改善方案**：`related_service.py` 組 ITR 的 `RelatedEntity` 時，若該筆
`isReInspection` 為真，在 `title` 前面加一個簡短前綴（例如「Re-inspection ·
{原本的 title}」），或在前端 `RelatedDocuments.tsx` 的 `RelatedList` 多渲染一個小徽章；
兩種做法都只需要讀取既有欄位，不需要新增資料庫欄位或改變核准/業務規則，純粹是顯示層的
補充。

**本輪未動手修**：依交辦「本批不改產品」，僅回報，不實作上述方案。

## 其他觀察（不計入上方兩項，附帶記錄）

- **三種載入狀態的區分**：讀碼確認 `RelatedDocuments.tsx` 對 loading／empty／error 三種
  狀態各自用不同 CSS class（`.loading`、`.empty`、`.errorMsg`），其中 `.errorMsg` 是
  紅色（`#b91c1c`），與另外兩者（都是灰色調，`.loading` 是 `#64748b`、`.empty` 是
  `#94a3b8`）有明顯色彩區隔；但 `.loading` 與 `.empty` 彼此只有些微灰階深淺差異、無圖示，
  主要靠文字本身（「Loading...」vs「No related documents yet.」）區分。本輪**未**透過
  實際延遲網路請求的方式在畫面上重現並截圖這個差異（只有 NO-ITR 情境的 empty 狀態截圖，
  見 `04-no-itr-noi-empty-related-documents.png`），屬於讀碼推論，不是實機確認，不計入
  上方兩項正式發現，列為本輪未完成的觀察項。
- **返回原流程**：問題 1 已經說明點擊會離開 NOI 的編輯視窗、跳到 `/itr` 清單，且沒有
  任何「返回 NOI」的麵包屑或連結；使用者得自己點側邊欄 NOI、重新搜尋剛才那筆 NOI。這是
  問題 1 的直接延伸，不另立為第三項。

## 隔離與可重跑資產

- `backend/scripts/verification/seed_noi_itr_ux_review.py`（隔離測試種子腳本，新建）。
- `docs/workflow/NOI-ITR-UX-2026-001-evidence/`（5 張截圖，本輪審閱產生）。

## 埠號釋放

隔離堆疊（backend/vite 8200/3200，root 為 `qualitas-manual-s2y5ncx1`）已於完成後以
`isolated_stack.py down` 拆除，並以 `lsof` 確認埠號釋放；使用者 8198（backend）/3198
（vite）全程監聽未受影響。
