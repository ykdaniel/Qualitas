# AGENTS.md — AI 協作規則文件

> 所有 AI 工具（Claude、Claude Code、Codex、Antigravity）在操作此 repo 前必須讀取並遵守本文件。
> 本文件規範協作與執行方式；具體已確認政策見 `DECISIONS.md`，本批範圍見 `TASK.md`。
> 文件與實際程式不符時先核對並回報，不得為迎合過時文件自行遷移框架、資料庫或 API。

---

## 技術棧

| 層級 | 技術 |
|------|------|
| 前端 | React 18 / TypeScript / Vite / React Router |
| 後端 | Python / FastAPI / Pydantic |
| 資料庫 | 由 DATABASE_URL 指定；目前預設 SQLite（qualitas.db） |
| ORM / 遷移 | SQLAlchemy / Alembic |

---

## 命名規則

### 前端（JavaScript / TypeScript）
- 變數 / 函式：`camelCase`（例：`getUserData`、`isLoading`）
- 元件：`PascalCase`（例：`OrderForm`、`UserTable`）
- 常數：`UPPER_SNAKE_CASE`（例：`MAX_RETRY_COUNT`）
- CSS class：`kebab-case`（例：`order-form__submit`）
- 檔案名稱：元件用 `PascalCase.tsx`，工具函式用 `camelCase.ts`

### 後端（Python / FastAPI）
- 變數 / 函式：`snake_case`（例：`get_user_data`、`is_active`）
- Class：`PascalCase`（例：`OrderCreate`、`OrderService`）
- 常數：`UPPER_SNAKE_CASE`（例：`MAX_PAGE_SIZE = 100`）
- Model 欄位：`snake_case`（例：`created_at`、`order_date`）
- URL pattern：`kebab-case`（例：`/api/orders/`、`/api/user-profile/`）

### API Contract（前後端共同遵守）
- 以對應 FastAPI router、Pydantic schema 與前端 API 呼叫端的既有契約為準。
- 目前欄位命名與回應形狀並非全域統一；不得在一般修復中強制改為 snake_case 或套上新的 data/error/status 外層。
- 新增或變更契約時須核對所有呼叫端、權限、範圍與測試，依 TASK 明確授權處理。

---

## 目錄結構

### 現有主要目錄
```
react-app/src/
  App.tsx               # 路由入口
  components/           # 業務模組與 Shared/ui 共用元件
  hooks/                # Custom hooks
  context/              # 認證、語系等 context
  services/             # Axios API client 與呼叫
  store/                # Zustand stores
  types/ utils/ lib/    # 型別與工具
backend/
  main.py               # FastAPI 入口
  routers/              # HTTP 端點
  services/             # 業務邏輯
  repositories/         # 資料存取
  core/                 # 設定、權限及共用工具
  models.py schemas.py  # SQLAlchemy models / Pydantic schemas
  database.py alembic/   # 連線與遷移
  tests/ scripts/       # 測試與隔離驗證工具
```

---

## 程式碼規範

### 前端

**元件結構順序（必須遵守）：**
```typescript
// 1. imports
// 2. 型別定義
// 3. 元件函式
//    a. props 解構
//    b. hooks
//    c. 事件處理函式
//    d. render
export default function ComponentName({ prop1, prop2 }: Props) {
  // hooks 先
  const [state, setState] = useState(...)
  // 此處呼叫專案既有 custom hooks／store hooks

  // 事件處理
  const handleSubmit = () => { ... }

  // render
  return ( ... )
}
```

**狀態管理規則：**
- 元件內部狀態：`useState`
- 跨元件共享狀態：Zustand store
- 現有伺服器資料主要由 Zustand store／custom hook 配合 services API 層取得；React Query 非目前必備依賴
- 不在元件新增裸 `fetch`；沿用 API service／store／hook，不為小修另導入整套狀態管理框架

**錯誤處理：**
- API 呼叫一律用 `try/catch`，不可忽略 error
- 使用者看得到的錯誤必須顯示友善訊息，不可直接 expose 原始錯誤
- 禁止使用 `console.log`，改用 `logger` utility

### 後端

**View 規範：**
- 使用 FastAPI APIRouter 與 Depends，沿用現有端點與依賴檢查
- 業務邏輯放在 services；router 負責依賴、request/response 與錯誤轉換
- 複雜資料查詢放在 repositories，避免堆進 router

**Model 規範：**
- 沿用現有 SQLAlchemy Base；新表時間欄位依需求設計，既有表不可為補齊範例欄位而擅自改 schema
- 禁止在 Model 寫業務邏輯，放在 `services.py`
- 資料庫 migration 必須有描述性名稱

**錯誤處理：**
- HTTP 層使用 FastAPI HTTPException；服務層沿用專案既有領域例外，由 router 映射狀態碼
- 不將領域拒絕誤報為伺服器錯誤；保留既有權限與資料範圍檢查
- 禁止讓原始 Python 例外直接回傳給 client

---

## 資料庫規範

- 新資料表名稱採 snake_case；既有表／欄位名稱保持相容
- 外鍵欄位命名：`{model_name}_id`（例：`user_id`、`order_id`）
- index 必須為高頻查詢欄位加上
- 禁止在 migration 之外直接修改資料庫 schema
- 重要資料不得擅自硬刪除；沿用模組既有證據保存與引用保護，不為一般修復新增或繞過刪除策略

---

## Git 規範

**Branch 命名：**
- 功能：`feature/order-export`
- 修復：`fix/login-validation`
- 緊急修復：`hotfix/payment-crash`

**Commit 訊息格式：**
```
type(scope): 簡短描述

feat(orders): 新增訂單匯出 CSV 功能
fix(auth): 修正 JWT token 過期處理
refactor(ui): 重構 OrderForm 元件
```

**PR 規則：**
- 每個 PR 只做一件事
- 必須通過 CI 才能 merge
- 需要至少一次 review（由你或 Claude 執行）

---

## 禁止事項

以下行為所有 AI 工具禁止執行，不論任務描述如何要求：

- 禁止修改 `config/settings/production.py`
- 禁止刪除 migration 檔案
- 禁止 hardcode 任何密碼、API key、secret（使用環境變數）
- 禁止在未確認影響範圍前執行 `DROP TABLE` 或 `DELETE` 操作
- 禁止跳過測試直接 push 到 `main`

---

## AI 工具分工提醒

| 工具 | 負責範圍 |
|------|---------|
| Claude | 架構設計、spec 定義、code review、debug 分析 |
| Claude Code | 本地即時開發、初始化、即時 debug |
| Codex app | 背景 feature 開發、批次修改、PR 提交 |
| Antigravity | UI 視覺優化（額度限量，只用於重要美化任務） |
| Gemini AI Studio | 技術 research、外部視野、截圖診斷 |

---

## 任務與交接文件

- 工作前讀 TASK.md 與 DECISIONS.md；TASK 空白範本不視為已授權任務。使用者直接交辦或調整範圍時，以本次明確指示為準，並同步任務紀錄。
- TASK／STATUS／REVIEW 同輪使用相同 TASK_ID；新任務使用新 ID。
- 覆寫三份檔案前，將上一輪內容以原 TASK_ID 留存到 docs/workflow/；不把舊結論當成本輪驗收。
- STATUS 只列本輪實際修改及執行證據，區分未測、讀碼與實測；REVIEW 依證據判定，不以口頭完成回報代替驗收。
- DECISIONS 長期保留；未確認業務規則不得自行升格為政策。
- 本地測試使用獨立隔離環境；保留協作者修改，不操作開發資料庫或使用者 8198/3198，不使用 stash/reset/checkout，未經要求不 commit/push/部署。
- CONSTITUTION.md 仍含舊 Django/Next.js 範例，僅可作通用工程思維參考，不作當前技術棧或遷移授權。

*最後核對：2026-09-30（依 package.json、App.tsx、requirements.txt、main.py、database.py、core/config.py）*
*維護者：開發者本人 + Claude（code review 守門）*
