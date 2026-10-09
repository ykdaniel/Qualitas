# Phase 1 / PR1b — Q-WorkFlow Dashboard Card + `/workflow` 頁面

> PR1 的延伸。PR1 只做了在每個詳情 modal 底部顯示關聯文件；PR1b 把「跨模組流程進度」抽象成一個獨立的觀念（一條 Q-WorkFlow），在 Dashboard 加一張監控卡，並新開一個 `/workflow` 頁面列出全部 workflow。

## 目標 (Scope)

1. 新增後端 service：`WorkflowService` — 計算每條 workflow 的當前 stage 和停留時間
2. 新增後端 endpoint：`GET /workflow/` 和 `GET /workflow/{noi_id}`
3. 新增前端：Dashboard 上的 `<QWorkflowCard />`，顯示 Top 3 需要關注的 workflow + stage 統計
4. 新增前端：`/workflow` 頁面列出全部 workflow（可分頁、可篩選 stage）

## 非目標 (Non-goals)

- **不改 schema**。stage 是用現有的 status 欄位 + FK 即時計算出來的
- **不做精確的「停留於當前階段」時間**。PR1b 先用「workflow 開始至今」的時間（`NOI.issueDate → today`）當作 dwell time 排序依據。真正的 stage transition timestamp 等 Phase 2 的 business event log 做完再補
- **不做通知 / 告警**。這張卡只是視覺化，點擊才會導航
- **不做 workflow 編輯**。使用者不能手動改 stage，完全由 status 欄位推導
- **不碰 PQP / OBS / FAT / FollowUp**。這些模組不進入 workflow 鏈
- **不做 ITP 作為起點的 workflow**。這個 PR 鎖定「一條 workflow = 一張 NOI + 它的 ITR/NCR」，因為：
  - ITP 是檢驗計畫範本，生命週期很長（一張 ITP 可能對應幾十張 NOI），用 ITP 當起點會讓「進度」失去意義
  - NOI 才是一次具體的檢驗動作，有明確的開始（issueDate）和結束（所有下游 ITR/NCR 都結案）

---

## 核心概念：什麼是一條 Q-WorkFlow？

**一條 Q-WorkFlow = 一張 NOI + 它所有下游的 ITR / NCR**

- 起點：NOI 建立的那一刻（`NOI.issueDate`）
- 終點：所有下游 ITR / NCR 都 Closed 或 Void
- Parent 資訊（ITP / 廠商）只做顯示用，不影響 stage 計算

一張 ITP 可能對應多條 workflow（每張 NOI 各一條），一張 ITP 也可能零條 workflow（還沒排檢驗）。

---

## Stage 模型

NOI 根節點版，四階段：

| # | Stage | 判斷條件 | 顏色 |
|---|---|---|---|
| 1 | **Scheduled** | NOI 存在，但沒有任何下游 ITR，也沒有任何下游 NCR | 🔵 藍 |
| 2 | **Inspecting** | 至少一張下游 ITR 存在，且至少一張還在進行中（非 Closed / Void / Pass） | 🟡 黃 |
| 3 | **NCR Open** | 任一張下游 NCR 狀態為 Open / In Progress | 🔴 紅 |
| 4 | **Closed** | 所有 ITR 都 Closed/Void/Pass，且所有 NCR 都 Closed/Void，且 NOI.status 為 Closed/Void | 🟢 綠 |

**Stage 計算順序**（由後往前找第一個符合的）：
1. 先看有沒有 Open NCR → `NCR Open`
2. 否則看有沒有進行中的 ITR → `Inspecting`
3. 否則看是不是全部 closed → `Closed`
4. 其餘 → `Scheduled`

這個順序讓「有問題的最優先」— NCR Open 永遠蓋過 Inspecting 狀態。

---

## Dwell Time（停留時間）

**PR1b 簡化版**：`dwell_days = today - NOI.issueDate`

這個不是「停留在當前 stage 的時間」，而是「workflow 開始至今的時間」。精確度犧牲來換實作簡單，因為：
- 目前沒有 stage transition 的歷史紀錄
- AuditLog 雖然有 status 變更紀錄，但要從裡面還原 stage 轉換規則很複雜
- Phase 2 的 business event log 才是處理這個的正確地方

「需要關注」= dwell_days 降冪排序，取前 3（但先排除 stage = Closed 的 workflow）。

**已知限制（寫進卡片的 tooltip）**：「停留天數」目前是指 workflow 從開始至今的總時間，不是停在當前階段的時間。Phase 2 會改成精確版本。

---

## 後端設計

### 1. 新 Service

路徑：`backend/services/workflow_service.py`

```python
class WorkflowService:
    def __init__(self, db: Session):
        self.db = db

    def list_workflows(
        self,
        skip: int = 0,
        limit: int = 50,
        stage: Optional[str] = None,
        vendor_id: Optional[str] = None,
    ) -> List[dict]:
        """回傳 workflow 清單，已 eager-load ITR/NCR 避免 N+1。"""

    def get_stats(self) -> dict:
        """回傳各 stage 的 workflow 計數，用於 Dashboard 卡頂部統計列。"""
        # { "scheduled": 5, "inspecting": 8, "ncr_open": 3, "closed": 12, "total": 28 }

    def get_needs_attention(self, limit: int = 3) -> List[dict]:
        """回傳 dwell_days 降冪前 N 條（排除 Closed）。"""

    def _compute_stage(self, noi: models.NOI) -> str:
        """依 _ENTITY_STATUS_GROUPS 判斷 stage。純函式，好單元測試。"""
```

### 2. Stage 判斷輔助

把 ITR / NCR 的 status 字串分類成 `in_progress` / `closed` 兩組，放在 `workflow_service.py` 頂部 constants 裡：

```python
# "結案" 的 ITR / NCR 狀態 — 不會讓 workflow 停在 Inspecting / NCR Open
_ITR_TERMINAL_STATUSES = frozenset({"Closed", "Void", "Pass", "Approved"})
_NCR_TERMINAL_STATUSES = frozenset({"Closed", "Void"})
```

**要你確認**：上面這兩組 status 字串是不是涵蓋了所有「已結案」的狀態？現有資料裡還有沒有其他字串需要加進來？

### 3. Router

路徑：`backend/routers/workflow.py`（新檔）

```python
router = APIRouter(prefix="/workflow", tags=["Workflow"])

@router.get("/stats", response_model=schemas.WorkflowStats)
def get_workflow_stats(
    service: WorkflowService = Depends(get_workflow_service),
    _: User = Depends(RoleChecker(NOI_VIEW)),
):
    return service.get_stats()

@router.get("/needs-attention", response_model=list[schemas.WorkflowSummary])
def get_needs_attention(
    limit: int = 3,
    service: WorkflowService = Depends(get_workflow_service),
    _: User = Depends(RoleChecker(NOI_VIEW)),
):
    return service.get_needs_attention(limit=limit)

@router.get("/", response_model=list[schemas.WorkflowSummary])
def list_workflows(
    skip: int = 0,
    limit: int = 50,
    stage: str | None = None,
    service: WorkflowService = Depends(get_workflow_service),
    _: User = Depends(RoleChecker(NOI_VIEW)),
):
    return service.list_workflows(skip=skip, limit=limit, stage=stage)
```

權限用 `NOI_VIEW`（因為 workflow 的根是 NOI）。

### 4. 效能

你說資料量「很多」，所以：

- **list_workflows()** 用 `selectinload(NOI.itrs)` + `selectinload(NOI.ncrs)` 一次把所有子節點拉下來，避免 N+1
- **分頁強制**：`limit` 預設 50，最大 200
- **Stats 查詢**：不走 `list_workflows()`，直接用 SQL aggregate（`GROUP BY stage` 不行因為 stage 是算出來的，但可以用 EXISTS subquery 各 stage 各一條 SQL）
- **不加快取**：PR1b 先裸跑。如果 Stats 或 Needs-Attention 慢到 > 500ms，再加 in-memory TTL cache（`functools.lru_cache` with expiry）

### 5. Pydantic schema

加到 `schemas.py` 底部：

```python
class WorkflowSummary(BaseModel):
    noi_id: str
    noi_reference_no: str | None
    noi_package: str | None
    itp_reference_no: str | None    # parent ITP，顯示用
    vendor_name: str | None
    stage: str                      # 'scheduled' | 'inspecting' | 'ncr_open' | 'closed'
    dwell_days: int
    issue_date: str | None
    downstream_itr_count: int
    downstream_ncr_count: int
    open_ncr_count: int

class WorkflowStats(BaseModel):
    total: int
    scheduled: int
    inspecting: int
    ncr_open: int
    closed: int
```

### 6. 測試

`backend/tests/test_workflow_service.py`，用 in-memory SQLite + 真實 relationships（沿用 PR1 的測試風格）：

- `_compute_stage` 純函式測試：四種 stage 各一個 case
- 邊界：NOI 有 ITR 但都 Closed + NCR Open → stage 應為 NCR Open（NCR 優先）
- 邊界：NOI 沒有子節點 → Scheduled
- 邊界：NOI 的 ITR 有 Pass 有 Pending → Inspecting
- `get_stats` 計數正確
- `get_needs_attention` 排序正確，且排除 Closed

---

## 前端設計

### 1. Dashboard Card

路徑：`react-app/src/components/Dashboard/QWorkflowStatsCard.tsx`（新檔）

跟現有 `NCRStatsCard.tsx`、`PQPStatsCard.tsx` 風格一致。內容：

```
┌─ Q-WorkFlow 進度總覽  ────────── [查看全部 →] ┐
│                                                │
│  總計 28 條 workflow                           │
│  ● 5 Scheduled  ● 8 Inspecting  ● 3 NCR Open   │
│  ● 12 Closed                                   │
│                                                │
│  ⚠ 需要關注 (3)                                │
│  ┌────────────────────────────────────────┐   │
│  │ NOI-2025-0042  Weld inspection         │   │
│  │ ● NCR Open · 停留 12 天                │   │
│  │ ─●─●─●─○  Scheduled→Insp→NCR→Closed   │   │
│  └────────────────────────────────────────┘   │
│  ...                                           │
└──────────────────────────────────────────────┘
```

- 點「查看全部」→ navigate 到 `/workflow`
- 點單一 workflow → navigate 到 `/noi` 並開該 NOI 的 detail modal（用 query param，沿用現有模式）
- 顯示 Top 3；少於 3 條要關注時顯示 "No workflows need attention right now"

### 2. `/workflow` 頁面

路徑：`react-app/src/components/Workflow/Workflow.tsx`（新檔）+ 其 CSS module

內容：
- 頂部：stage 篩選 chip 列（All / Scheduled / Inspecting / NCR Open / Closed）
- 主體：表格列出所有 workflow，欄位 = [NOI Ref, Package, ITP Ref, Vendor, Stage, Dwell, Issue Date, ITR count, Open NCR count]
- 可排序（預設 dwell_days 降冪）
- 可分頁
- 每列點進去 → navigate 到 NOI detail modal

**不做**：這個頁面**不做**搜尋（reuse 現有 NOI 頁的搜尋就夠了）、**不做**匯出（Phase 5 再說）。

### 3. 路由 + 導航

- `App.tsx` 加 `<Route path="/workflow" element={<Workflow />} />`
- Sidebar（找到對應元件）加一個「Q-WorkFlow」入口
  - 要你確認：放在哪個順序？我建議放在「Dashboard」之後、「ITP」之前，因為它是跨模組的 overview

### 4. API client + 型別

- `react-app/src/services/workflowService.ts`（新檔）
- `react-app/src/types/workflow.ts`（新檔）
- 沿用 PR1 的風格：`api` axios instance，TS interface 對應後端 schema

### 5. i18n

在 `translation.json` 加 `workflow.*` keys：
- `workflow.title` / `workflow.totalCount` / `workflow.stage.scheduled` / ... / `workflow.needsAttention` / `workflow.dwellDays` / `workflow.viewAll` / `workflow.emptyAttention`

---

## 改動的檔案清單

### 後端
| 檔案 | 改動 |
|---|---|
| `backend/services/workflow_service.py` | **新增** |
| `backend/routers/workflow.py` | **新增** |
| `backend/core/dependencies.py` | 加 `get_workflow_service` |
| `backend/schemas.py` | 加 `WorkflowSummary` + `WorkflowStats` |
| `backend/main.py` | 註冊 workflow router |
| `backend/tests/test_workflow_service.py` | **新增** |

### 前端
| 檔案 | 改動 |
|---|---|
| `react-app/src/components/Dashboard/QWorkflowStatsCard.tsx` | **新增** |
| `react-app/src/components/Dashboard/QWorkflowStatsCard.module.css` | **新增** |
| `react-app/src/components/Workflow/Workflow.tsx` | **新增** |
| `react-app/src/components/Workflow/Workflow.module.css` | **新增** |
| `react-app/src/services/workflowService.ts` | **新增** |
| `react-app/src/types/workflow.ts` | **新增** |
| `react-app/src/App.tsx` | 加 `/workflow` route |
| 現有 Dashboard 頁（看是哪個檔）| 掛上 `<QWorkflowStatsCard />` |
| Sidebar 元件 | 加「Q-WorkFlow」入口 |
| `public/locales/{en,zh}/translation.json` | 加 `workflow.*` keys |

---

## Commit 切分

1. **Commit A — 後端**：`workflow_service.py` + `workflow.py` router + schemas + DI + tests
2. **Commit B — 前端共用**：`workflowService.ts` API client + `types/workflow.ts` + `/workflow` 頁面 + 路由
3. **Commit C — Dashboard 整合**：`QWorkflowStatsCard` + 掛到 Dashboard + Sidebar 入口 + i18n

每個 commit 都能獨立 review。

---

## 需要你拍板的事情

在我開始寫 code 之前，請回答：

1. **ITR terminal statuses** — 我列的是 `{Closed, Void, Pass, Approved}`。還有沒有其他字串代表「ITR 已經結案、不用再跟進」？
2. **NCR terminal statuses** — 我列的是 `{Closed, Void}`。需要加 `Resolved` 之類的嗎？
3. **Sidebar 位置** — 「Q-WorkFlow」入口放在 Dashboard 之後 / ITP 之前，OK 嗎？
4. **「需要關注」排除條件** — 我目前是「排除 stage = Closed」。要不要也排除 stage = Scheduled？（理由：剛建立的 NOI 還沒人去做不算「停留」，但這是一個判斷）
5. **點擊 workflow** — 我目前是 navigate 到 `/noi` 列表頁並帶 query param 開該 NOI modal。現有 NOI 頁支援這個 query param 嗎？還是要我另外加？
6. **Dashboard 卡要用「單一大圖」還是「分塊」** — 我目前想的是「統計列 + Top 3 卡片疊起來」，但 Dashboard 上的其他卡（NCRStatsCard 之類）可能風格不同。要不要我先去 screenshot 現有 Dashboard 看一下風格再決定？

回答完這六題，我開工。
