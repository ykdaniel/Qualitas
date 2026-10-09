# Phase 1 / PR1 — `<RelatedDocuments />` 共用元件

> 這是跨模組 workflow 計畫的第一個 PR。目標是讓使用者在任何一張 ITP / NOI / ITR / NCR 的詳情頁，都能一眼看到與它相關的上下游文件，而且可以直接點過去。**這個 PR 不動資料庫 schema，只用已經存在的 foreign key**。

## 目標 (Scope)

1. 新增後端 endpoint：`GET /{module}/{id}/related` — 對應 ITP / NOI / ITR / NCR 四個模組各一個
2. 新增前端共用元件：`<RelatedDocuments entityType entityId />`
3. 掛到 ITP / NOI / ITR / NCR 四個模組的詳情頁 / modal

## 非目標 (Non-goals)

**這個 PR 不做的事情**（避免 scope creep）：
- 不新增任何 foreign key 欄位（`ITP.pqp_id`、`NCR.itr_id` 留給 PR2/PR3）
- 不做「Create from」按鈕（留給 PR4）
- 不處理 OBS / FAT / FollowUp（這三個模組目前沒有進主流程鏈，留給 PR5 評估）
- 不做 PQP 和 KM（PQP 要等 PR3 補 FK，KM 是參考文件庫不進流程）
- 不做事件 log、不做規則、不做通知（Phase 2+）

---

## 後端設計

### 1. 關聯圖（Relationship Graph）— 單一事實來源

新開 `backend/workflows/relationships.py`，用 Python 宣告式地描述模組之間的關聯。**未來新增 FK 只要改這一個檔案**，所有 `/related` endpoint 自動吃到。

```python
# backend/workflows/relationships.py
# (示意，實際會寫成可 iterate 的 dataclass)

RELATIONSHIPS = {
    'itp': {
        'upstream':   [],                  # PR3 會加 pqp
        'downstream': ['noi_via_itp'],
    },
    'noi': {
        'upstream':   ['itp_from_noi'],
        'downstream': ['itr_via_noi', 'ncr_via_noi'],
    },
    'itr': {
        'upstream':   ['noi_from_itr'],
        'downstream': [],                  # PR2 會加 ncr_via_itr
    },
    'ncr': {
        'upstream':   ['noi_from_ncr'],    # PR2 會加 itr_from_ncr
        'downstream': [],
    },
}
```

每條 traversal 是一個 function `(db, source_entity) -> list[RelatedEntity]`，用現有的 SQLAlchemy relationships（例如 `itp.nois`、`noi.itr_ref`）走圖。

### 2. 走圖邏輯

遞迴向上或向下走，最多 `max_depth=3` 層（避免無窮迴圈或暴量查詢）。走到的每一個節點都加到 flat list 裡，標上 `level` 和 `direction`。

**為什麼用 flat list**：前端拿到之後可以自己決定怎麼群組顯示（依 entity type、依 level、依時間）。後端不需要決定 UX。

### 3. 共用 service

新開 `backend/services/related_service.py`：

```python
class RelatedService:
    def get_related(
        self,
        db: Session,
        entity_type: str,   # 'itp' | 'noi' | 'itr' | 'ncr'
        entity_id: str,
        max_depth: int = 3,
    ) -> dict:
        """
        回傳 { 'upstream': [...], 'downstream': [...] }
        每個元素是序列化後的 RelatedEntity。
        """
```

### 4. Router

**設計抉擇**：每個模組自己掛 endpoint，不開新的 `/related/*` prefix。理由：
- 權限驗證可以沿用該模組現有的 `ITP_VIEW` / `NOI_VIEW` 等 perm
- URL 結構和現有 API 一致（`/itp/{id}/xxx`、`/noi/{id}/xxx`）
- Router 檔案已經按模組切好，插一個 endpoint 最小改動

四個模組各加一個 endpoint：
- `GET /itp/{itp_id}/related` — 權限 `ITP_VIEW`
- `GET /noi/{noi_id}/related` — 權限 `NOI_VIEW`
- `GET /itr/{itr_id}/related` — 權限 `ITR_VIEW`
- `GET /ncr/{ncr_id}/related` — 權限 `NCR_VIEW`

每個 endpoint 內部都呼叫同一個 `RelatedService.get_related(entity_type, entity_id)`，差別只是 entity_type 的字串不同。

### 5. 回應格式

```json
{
  "upstream": [
    {
      "entityType": "noi",
      "id": "noi-abc",
      "referenceNo": "NOI-2025-0042",
      "title": "Site welding inspection",
      "status": "Scheduled",
      "vendorName": "ACME Corp",
      "level": 1,
      "primaryDate": "2025-04-15"
    },
    {
      "entityType": "itp",
      "id": "itp-xyz",
      "referenceNo": "ITP-2025-007",
      "title": "Structural welding ITP",
      "status": "Approved",
      "vendorName": "ACME Corp",
      "level": 2,
      "primaryDate": "2025-02-01"
    }
  ],
  "downstream": []
}
```

- `level`：離來源幾層（1 = 直接鄰居，2 = 鄰居的鄰居）
- `primaryDate`：每個 entity 取最有意義的一個日期（ITP 用 submissionDate、NOI 用 inspectionDate、ITR 用 testDate、NCR 用 raiseDate）
- `title`：取 `description` / `subject` 等最具識別性的欄位（各模組 fallback 規則在 service 裡統一定義）

---

## 前端設計

### 1. 共用元件

路徑：`react-app/src/components/ui/RelatedDocuments.tsx`

```tsx
interface RelatedDocumentsProps {
    entityType: 'itp' | 'noi' | 'itr' | 'ncr';
    entityId: string;
    /** 開啟相關文件時要做什麼 — 預設 navigate 到詳情頁 */
    onOpen?: (entityType: string, entityId: string) => void;
}

export const RelatedDocuments: React.FC<RelatedDocumentsProps> = (props) => { ... }
```

### 2. API client

`react-app/src/services/relatedService.ts`（新檔）：

```ts
export async function fetchRelated(
    entityType: EntityType,
    entityId: string,
): Promise<{ upstream: RelatedEntity[]; downstream: RelatedEntity[] }>
```

### 3. UI 樣式

**初版佈局提案**（要你 review）：

```
┌─ 關聯文件 ─────────────────────────────────┐
│                                              │
│  ▲ 上游                                      │
│  ┌────────────────────────────────────────┐ │
│  │ [ITP]  ITP-2025-007  Structural...     │ │
│  │        ● Approved · 2025-02-01         │ │
│  │ [NOI]  NOI-2025-0042  Site welding...  │ │
│  │        ● Scheduled · 2025-04-15        │ │
│  └────────────────────────────────────────┘ │
│                                              │
│  ▼ 下游 (3)                                  │
│  ┌────────────────────────────────────────┐ │
│  │ [ITR]  ITR-2025-0013  Welding test     │ │
│  │        ● Pass · 2025-04-16             │ │
│  │ [ITR]  ITR-2025-0014  Re-inspection    │ │
│  │        ● Pending · —                    │ │
│  │ [NCR]  NCR-2025-003  Weld porosity     │ │
│  │        ● Open · 2025-04-16             │ │
│  └────────────────────────────────────────┘ │
│                                              │
└──────────────────────────────────────────────┘
```

- 上下游分兩段，用 ▲/▼ 區分
- 每筆顯示：模組 badge + referenceNo + title + status + 日期
- 點擊整列 → 導航到對應模組的詳情頁
- 空狀態顯示「尚無關聯文件」

**要你確認的 UX 問題**：
- 顯示多深？我建議上下游各 2 層（也就是從 ITR 往上看得到 NOI 和 ITP），太深會塞爆
- 要不要按模組分頁籤？還是就是一個滾動 list？
- 要顯示在詳情 modal 的哪裡？底部？右側？新 tab？

### 4. 掛載點

- `ITP.tsx` 詳情 modal 的底部（或新 tab）
- `NOI.tsx` 詳情 modal
- `ITR.tsx` 詳情 modal
- `NCR.tsx` 詳情 modal

每個地方都只要加一行 `<RelatedDocuments entityType="itp" entityId={itp.id} />`。

---

## 需要改動的檔案清單

### 後端

| 檔案 | 改動 |
|---|---|
| `backend/workflows/__init__.py` | **新增**（空檔） |
| `backend/workflows/relationships.py` | **新增** — 關聯圖 + traversal 函式 |
| `backend/services/related_service.py` | **新增** — `RelatedService` |
| `backend/core/dependencies.py` | 加一個 `get_related_service()` DI |
| `backend/schemas.py` | 加 `RelatedEntity` pydantic schema |
| `backend/routers/itp.py` | 加 `GET /{id}/related` |
| `backend/routers/noi.py` | 加 `GET /{id}/related` |
| `backend/routers/itr.py` | 加 `GET /{id}/related` |
| `backend/routers/ncr.py` | 加 `GET /{id}/related` |
| `backend/tests/test_related_service.py` | **新增** — 單元測試 |

### 前端

| 檔案 | 改動 |
|---|---|
| `react-app/src/components/ui/RelatedDocuments.tsx` | **新增** — 共用元件 |
| `react-app/src/components/ui/RelatedDocuments.module.css` | **新增** — 樣式 |
| `react-app/src/services/relatedService.ts` | **新增** — API client |
| `react-app/src/types/related.ts` | **新增** — RelatedEntity 型別 |
| `react-app/src/components/ITP/ITPModals.tsx` | 插入 `<RelatedDocuments />` |
| `react-app/src/components/NOI/modals/NOIDetailModal.tsx` | 插入 `<RelatedDocuments />` |
| `react-app/src/components/ITR/ITRModals.tsx` | 插入 `<RelatedDocuments />` |
| `react-app/src/components/NCR/NCRModals.tsx` | 插入 `<RelatedDocuments />` |
| `react-app/public/locales/{en,zh}/translation.json` | 加翻譯 key（related.upstream、related.downstream、related.empty…） |

---

## 測試策略

### 後端單元測試（`test_related_service.py`）

建一組 fixture：一張 ITP → 兩張 NOI → 每張 NOI 有 2 張 ITR 和 1 張 NCR。測試：
1. 從 ITP 走 downstream → 拿到 2 NOI + 4 ITR + 2 NCR
2. 從 ITR 走 upstream → 拿到 1 NOI + 1 ITP
3. 從 NCR 走 upstream → 拿到 1 NOI + 1 ITP
4. `max_depth=1` 時只拿到直接鄰居
5. 實體不存在時回傳空陣列
6. 實體存在但沒關聯時回傳空陣列

### 前端手動測試

- 在 ITP 詳情 modal 打開元件，看到下游 NOI 清單
- 點下游某張 NOI → 成功導航到 NOI 詳情
- 在 ITR 詳情打開元件，看到上游 NOI 和 ITP
- 空狀態（一張全新的 ITP，沒有任何 NOI）正確顯示

---

## 尚未決定的設計問題（要你拍板）

1. **Max depth**：我建議預設 `2`。也就是從 ITR 看得到 NOI 和 ITP，但看不到「同 NOI 的其他 ITR」。你覺得 2 夠用嗎？還是 1 就好（只看直接鄰居）？

2. **UI 位置**：要顯示在詳情 modal 的哪裡？
   - (i) 底部區塊（捲到最下面會看到）
   - (ii) 右側固定欄位（modal 左右分欄）
   - (iii) 新增一個 tab 頁（主內容 / 關聯文件）
   - 我個人傾向 (i)，因為改動最小、不重排 modal 版面

3. **點擊行為**：點下相關文件時要：
   - (i) 導航到對應模組的詳情頁（會關掉目前 modal）
   - (ii) 新開一個 modal 疊在上面（類似 web 瀏覽器 tab）
   - (iii) 回拋給父元件決定（`onOpen` callback）
   - 我個人傾向 (iii)，每個模組自己決定 — 預設行為是 (i)

4. **OBS / FAT / FollowUp**：這三個模組現在不進主鏈，**這個 PR 完全不碰**它們。但它們的詳情頁要不要也放一個 `<RelatedDocuments />`（即使是空的）？
   - (i) 不放，這三個模組之後（PR5）才補
   - (ii) 放空殼，顯示「尚無關聯文件」，以後補 FK 時自動有內容
   - 我傾向 (i)，不放沒內容的 UI 免得使用者困惑

5. **快取策略**：每次打開 modal 都打 API，還是用 SWR / React Query 快取？
   - 現有 store 是 Zustand，我建議就用 Zustand 的 `useEffect` + in-memory cache，5 秒內重複開同一筆不重打
   - 或直接每次都打，反正這個 endpoint 不重

6. **後端 entity loader**：`RelatedService._load_entity(db, 'itp', id)` 要怎麼寫？
   - (i) 一個 switch/dict 去叫對應的 repository
   - (ii) 用 SQLAlchemy 的 model registry 直接 query
   - 我傾向 (i)，比較白話好 debug

---

## 預計時程切分

這個 PR 可以再切成三個小 commit，方便 review：

1. **Commit A — 後端基礎**：relationships.py + RelatedService + tests（沒接 router）
2. **Commit B — 後端 router**：四個模組的 `/related` endpoint + schemas
3. **Commit C — 前端**：共用元件 + 四個 modal 的掛載點 + i18n

每個 commit 都能獨立 review，有問題的話可以只 rebase 後面沒 merge 的部分。

---

## 需要你回答的事情

在我開始 code 之前：

1. 上面「尚未決定的設計問題」的 1-6 題，給我答案（或說「你決定」也可以，我會照我傾向的選項做）
2. Commit 切分和檔案結構，有沒有你想調整的地方
3. 是否同意在 `/docs/workflow/` 底下累積這個系列的 plan 文件
