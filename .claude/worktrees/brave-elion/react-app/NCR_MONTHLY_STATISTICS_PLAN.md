# NCR 月度統計追蹤計劃

## 一、需求分析

### 1.1 目標
追蹤每個月 NCR 的統計數據，包括：
- 每月新增的 NCR 數量
- 每月關閉的 NCR 數量
- 每月各狀態的分布
- 月度趨勢分析

### 1.2 數據來源
- **Raise Date** (`raiseDate`): 用於統計每月新增的 NCR
- **Close-out Date** (`closeoutDate`): 用於統計每月關閉的 NCR
- **Status**: 用於統計每月各狀態的分布

---

## 二、技術方案

### 2.1 數據結構擴展

#### 方案 A：基於現有數據（推薦）
- **優點**：無需修改數據結構，直接使用 `raiseDate` 和 `closeoutDate`
- **實現**：在組件中按月份分組統計
- **適用場景**：當前數據已有日期欄位

#### 方案 B：添加月度快照表
- **優點**：可以保存歷史統計快照，不受數據刪除影響
- **缺點**：需要額外的數據結構和維護邏輯
- **適用場景**：需要長期歷史記錄

**建議採用方案 A**，因為：
1. NCR 已有 `raiseDate` 和 `closeoutDate` 欄位
2. 實現簡單，無需額外數據結構
3. 可以動態計算，實時反映當前數據

---

### 2.2 統計維度設計

#### 核心統計指標
1. **月度新增數量** (Monthly New)
   - 根據 `raiseDate` 按月份分組
   - 統計每個月新增的 NCR 數量

2. **月度關閉數量** (Monthly Closed)
   - 根據 `closeoutDate` 按月份分組
   - 統計每個月關閉的 NCR 數量

3. **月度狀態分布** (Monthly Status Distribution)
   - 按月份和狀態分組
   - 統計每個月 Open/Closed 的數量

4. **月度趨勢** (Monthly Trend)
   - 顯示過去 N 個月的趨勢
   - 可視化新增/關閉的變化

#### 可選統計指標
5. **月度平均關閉時間** (Average Close Time)
   - 計算每個月關閉的 NCR 的平均處理時間
   - 公式：`(closeoutDate - raiseDate)` 的平均值

6. **月度按類型分布** (Monthly Type Distribution)
   - 按月份和 Type 分組統計
   - 顯示 Design/Material/Workmanship/Document 的分布

7. **月度按承包商分布** (Monthly Vendor Distribution)
   - 按月份和承包商分組統計
   - 顯示各承包商的 NCR 數量

---

## 三、UI/UX 設計

### 3.1 統計區塊布局

```
┌─────────────────────────────────────────────────┐
│  NCR 月度統計                                    │
├─────────────────────────────────────────────────┤
│  [時間範圍選擇器]                               │
│  - 選擇月份範圍（例如：最近 6 個月）            │
│  - 或選擇特定月份                                │
├─────────────────────────────────────────────────┤
│  [月度統計卡片]                                 │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐         │
│  │ 本月 │ │ 上月 │ │ 本月 │ │ 上月 │         │
│  │ 新增 │ │ 新增 │ │ 關閉 │ │ 關閉 │         │
│  │  12  │ │  15  │ │   8  │ │  10  │         │
│  └──────┘ └──────┘ └──────┘ └──────┘         │
├─────────────────────────────────────────────────┤
│  [趨勢圖表]                                     │
│  ┌─────────────────────────────────────────┐   │
│  │  NCR 月度趨勢圖                           │   │
│  │  [折線圖或柱狀圖]                        │   │
│  │  顯示過去 N 個月的新增/關閉趨勢          │   │
│  └─────────────────────────────────────────┘   │
├─────────────────────────────────────────────────┤
│  [月度詳細表格]                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ 月份 │ 新增 │ 關閉 │ Open │ Closed │   │
│  ├─────────────────────────────────────────┤   │
│  │ 2026-01 │ 12 │  8  │  4  │   8   │   │
│  │ 2025-12 │ 15 │ 10  │  5  │  10   │   │
│  │ 2025-11 │ 10 │  8  │  2  │   8   │   │
│  └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

### 3.2 組件結構

```
NCR.tsx
├── 現有統計區塊（總體統計）
├── 月度統計區塊（新增）
│   ├── MonthlyStatisticsSection
│   │   ├── TimeRangeSelector（時間範圍選擇器）
│   │   ├── MonthlySummaryCards（月度摘要卡片）
│   │   ├── MonthlyTrendChart（趨勢圖表，可選）
│   │   └── MonthlyDetailTable（月度詳細表格）
```

---

## 四、實現步驟

### 階段 1：基礎統計功能（優先級：高）

#### 4.1 創建月度統計工具函數
**文件**：`react-app/src/utils/monthlyStatistics.ts`

```typescript
// 功能：
// 1. 按月份分組 NCR 數據
// 2. 計算每月新增數量（基於 raiseDate）
// 3. 計算每月關閉數量（基於 closeoutDate）
// 4. 計算每月狀態分布
```

#### 4.2 在 NCR 組件中添加月度統計
**文件**：`react-app/src/components/NCR/NCR.tsx`

```typescript
// 添加：
// 1. monthlyStatistics useMemo（計算月度統計）
// 2. selectedMonthRange state（選擇的時間範圍）
// 3. MonthlyStatisticsSection 組件
```

#### 4.3 添加月度統計 UI
- 時間範圍選擇器（下拉選單或日期選擇器）
- 月度統計卡片（顯示當前/上月的關鍵指標）
- 月度詳細表格（顯示每個月的詳細數據）

---

### 階段 2：趨勢可視化（優先級：中）

#### 4.4 添加圖表庫（可選）
**選項**：
- **Recharts**（推薦）：輕量、易用、React 友好
- **Chart.js**：功能豐富
- **Victory**：美觀但較重

#### 4.5 實現趨勢圖表
- 折線圖：顯示新增/關閉趨勢
- 柱狀圖：顯示月度對比
- 可切換顯示不同指標

---

### 階段 3：高級功能（優先級：低）

#### 4.6 多維度統計
- 按承包商分組的月度統計
- 按類型分組的月度統計
- 按狀態分組的月度統計

#### 4.7 導出功能
- 導出月度統計為 CSV
- 導出月度統計為 PDF 報告

#### 4.8 歷史快照（如果採用方案 B）
- 每月自動生成統計快照
- 保存歷史統計數據
- 支持查看歷史月份統計

---

## 五、數據處理邏輯

### 5.1 月份提取函數

```typescript
// 從日期字符串提取年月
const extractYearMonth = (dateString: string): string => {
  // "2026-01-25" -> "2026-01"
  if (!dateString) return '';
  return dateString.substring(0, 7);
};

// 獲取月份範圍
const getMonthRange = (months: number): string[] => {
  // 返回過去 N 個月的年月列表
  // 例如：["2026-01", "2025-12", "2025-11", ...]
};
```

### 5.2 月度統計計算

```typescript
interface MonthlyStats {
  month: string;           // "2026-01"
  newCount: number;        // 該月新增數量
  closedCount: number;     // 該月關閉數量
  openCount: number;        // 該月結束時的 Open 數量
  closedAtMonthEnd: number; // 該月結束時的 Closed 數量
}

const calculateMonthlyStats = (
  ncrList: NCRItem[],
  monthRange: string[]
): MonthlyStats[] => {
  // 按月份分組統計
  // 返回每個月的統計數據
};
```

---

## 六、UI 組件設計

### 6.1 時間範圍選擇器

```typescript
<select value={monthRange} onChange={handleMonthRangeChange}>
  <option value="3">最近 3 個月</option>
  <option value="6">最近 6 個月</option>
  <option value="12">最近 12 個月</option>
  <option value="all">全部</option>
</select>
```

### 6.2 月度統計卡片

```typescript
<div className={styles.monthlySummaryCards}>
  <div className={styles.summaryCard}>
    <div className={styles.cardLabel}>本月新增</div>
    <div className={styles.cardValue}>{currentMonth.newCount}</div>
  </div>
  <div className={styles.summaryCard}>
    <div className={styles.cardLabel}>上月新增</div>
    <div className={styles.cardValue}>{lastMonth.newCount}</div>
  </div>
  <div className={styles.summaryCard}>
    <div className={styles.cardLabel}>本月關閉</div>
    <div className={styles.cardValue}>{currentMonth.closedCount}</div>
  </div>
  <div className={styles.summaryCard}>
    <div className={styles.cardLabel}>上月關閉</div>
    <div className={styles.cardValue}>{lastMonth.closedCount}</div>
  </div>
</div>
```

### 6.3 月度詳細表格

```typescript
<table className={styles.monthlyTable}>
  <thead>
    <tr>
      <th>月份</th>
      <th>新增</th>
      <th>關閉</th>
      <th>Open</th>
      <th>Closed</th>
      <th>關閉率</th>
    </tr>
  </thead>
  <tbody>
    {monthlyStats.map(stat => (
      <tr key={stat.month}>
        <td>{formatMonth(stat.month)}</td>
        <td>{stat.newCount}</td>
        <td>{stat.closedCount}</td>
        <td>{stat.openCount}</td>
        <td>{stat.closedAtMonthEnd}</td>
        <td>{calculateCloseRate(stat)}%</td>
      </tr>
    ))}
  </tbody>
</table>
```

---

## 七、實施優先級

### 高優先級（立即實施）
1. ✅ 創建月度統計工具函數
2. ✅ 在 NCR 組件中添加月度統計計算
3. ✅ 添加月度統計 UI 區塊（卡片 + 表格）
4. ✅ 添加時間範圍選擇器

### 中優先級（後續實施）
5. ⏳ 添加趨勢圖表（如果用戶需要）
6. ⏳ 添加按承包商/類型的月度統計

### 低優先級（可選）
7. ⏸️ 導出功能
8. ⏸️ 歷史快照功能

---

## 八、技術考量

### 8.1 性能優化
- 使用 `useMemo` 緩存月度統計計算結果
- 只在 `ncrList` 或 `monthRange` 變化時重新計算

### 8.2 數據完整性
- 處理缺失日期數據（`raiseDate` 或 `closeoutDate` 為空）
- 處理日期格式不一致的情況
- 驗證日期有效性

### 8.3 用戶體驗
- 默認顯示最近 6 個月的統計
- 提供清晰的月份標籤（例如："2026年1月"）
- 空數據時顯示友好提示

---

## 九、文件結構

```
react-app/src/
├── utils/
│   └── monthlyStatistics.ts        # 月度統計工具函數（新建）
├── components/
│   └── NCR/
│       ├── NCR.tsx                 # 添加月度統計區塊
│       └── NCR.module.css          # 添加月度統計樣式
└── types/
    └── statistics.ts               # 統計相關類型定義（可選）
```

---

## 十、下一步行動

1. **確認需求**：確認是否需要圖表可視化
2. **選擇方案**：確認採用方案 A（基於現有數據）還是方案 B（歷史快照）
3. **開始實施**：按照優先級逐步實施

---

## 十一、示例代碼結構

### 月度統計工具函數示例

```typescript
// utils/monthlyStatistics.ts

export interface MonthlyStats {
  month: string;
  newCount: number;
  closedCount: number;
  openAtMonthEnd: number;
  closedAtMonthEnd: number;
  closeRate: number;
}

export const calculateMonthlyStats = (
  ncrList: NCRItem[],
  months: number = 6
): MonthlyStats[] => {
  // 實現邏輯
};

export const getCurrentMonth = (): string => {
  // 返回當前年月 "YYYY-MM"
};

export const formatMonthLabel = (month: string): string => {
  // "2026-01" -> "2026年1月"
};
```

---

## 十二、注意事項

1. **時區處理**：確保日期處理考慮時區
2. **數據一致性**：確保 `raiseDate` 和 `closeoutDate` 的數據完整性
3. **邊界情況**：處理跨年、閏年等情況
4. **性能**：大量數據時考慮分頁或虛擬滾動
5. **可擴展性**：設計時考慮未來可能添加的統計維度
