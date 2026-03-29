# AGENTS.md — AI 協作規則文件

> 所有 AI 工具（Claude、Claude Code、Codex、Antigravity）在操作此 repo 前必須讀取並遵守本文件。
> 本文件是唯一事實來源（SSOT）。如有衝突，以本文件為準。

---

## 技術棧

| 層級 | 技術 |
|------|------|
| 前端 | React / Next.js (App Router) |
| 後端 | Python / Django + Django REST Framework |
| 資料庫 | PostgreSQL |
| ORM | Django ORM |

---

## 命名規則

### 前端（JavaScript / TypeScript）
- 變數 / 函式：`camelCase`（例：`getUserData`、`isLoading`）
- 元件：`PascalCase`（例：`OrderForm`、`UserTable`）
- 常數：`UPPER_SNAKE_CASE`（例：`MAX_RETRY_COUNT`）
- CSS class：`kebab-case`（例：`order-form__submit`）
- 檔案名稱：元件用 `PascalCase.tsx`，工具函式用 `camelCase.ts`

### 後端（Python / Django）
- 變數 / 函式：`snake_case`（例：`get_user_data`、`is_active`）
- Class：`PascalCase`（例：`OrderSerializer`、`UserViewSet`）
- 常數：`UPPER_SNAKE_CASE`（例：`MAX_PAGE_SIZE = 100`）
- Model 欄位：`snake_case`（例：`created_at`、`order_date`）
- URL pattern：`kebab-case`（例：`/api/orders/`、`/api/user-profile/`）

### API Contract（前後端共同遵守）
- 所有 API 回應欄位：`snake_case`（前端接到後在 hook 層轉換）
- 統一回應格式：
  ```json
  {
    "data": {},
    "error": null,
    "status": "success"
  }
  ```
- 錯誤回應格式：
  ```json
  {
    "data": null,
    "error": { "code": "VALIDATION_ERROR", "message": "..." },
    "status": "error"
  }
  ```

---

## 目錄結構

### 前端（Next.js App Router）
```
src/
  app/                  # App Router 頁面
    (dashboard)/        # Route group
    api/                # API routes（如有需要）
  components/
    ui/                 # 純 UI 元件（無業務邏輯）
    features/           # 功能元件（含業務邏輯）
  hooks/                # Custom hooks
  lib/                  # 工具函式、API client
  types/                # TypeScript 型別定義
  store/                # 全域狀態（Zustand）
```

### 後端（Django）
```
project/
  apps/
    users/              # 使用者相關
    orders/             # 訂單相關（依業務域切分）
  core/                 # 共用工具、base class
  config/               # settings、urls、wsgi
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
  const { data } = useQuery(...)

  // 事件處理
  const handleSubmit = () => { ... }

  // render
  return ( ... )
}
```

**狀態管理規則：**
- 元件內部狀態：`useState`
- 跨元件共享狀態：Zustand store
- 伺服器狀態（API 資料）：React Query（TanStack Query）
- 禁止在元件內直接呼叫 `fetch`，必須透過 custom hook 或 React Query

**錯誤處理：**
- API 呼叫一律用 `try/catch`，不可忽略 error
- 使用者看得到的錯誤必須顯示友善訊息，不可直接 expose 原始錯誤
- 禁止使用 `console.log`，改用 `logger` utility

### 後端

**View 規範：**
- 優先使用 `ViewSet`，減少重複邏輯
- 邏輯放在 `services.py`，View 只負責 request/response 轉換
- 禁止在 View 直接寫複雜 ORM query，抽出到 `selectors.py`

**Model 規範：**
- 每個 Model 必須有 `created_at` 和 `updated_at`（繼承 `TimeStampedModel`）
- 禁止在 Model 寫業務邏輯，放在 `services.py`
- 資料庫 migration 必須有描述性名稱

**錯誤處理：**
- 使用 DRF 的 `ValidationError`、`PermissionDenied` 等標準例外
- 自訂例外繼承 `APIException`
- 禁止讓原始 Python 例外直接回傳給 client

---

## 資料庫規範

- 所有資料表名稱：`snake_case`（Django 自動處理）
- 外鍵欄位命名：`{model_name}_id`（例：`user_id`、`order_id`）
- index 必須為高頻查詢欄位加上
- 禁止在 migration 之外直接修改資料庫 schema
- 重要資料不可硬刪除，使用 `is_deleted` soft delete

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

*最後更新：2026-03*
*維護者：開發者本人 + Claude（code review 守門）*