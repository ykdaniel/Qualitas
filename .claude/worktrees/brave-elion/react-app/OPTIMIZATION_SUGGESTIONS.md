# 代碼優化建議

## 1. 使用統一的編號生成工具函數

### 問題
多個組件（NCR, ITR, NOI）中重複定義了 `getVendorAbbreviation` 或 `getContractorAbbreviation` 函數，但已經有統一的工具函數 `utils/numberGenerator.ts`。

### 建議
- 移除組件中的重複函數定義
- 統一使用 `utils/numberGenerator.ts` 中的 `getContractorAbbreviation`

### 影響文件
- `components/NCR/NCR.tsx` (2處)
- `components/ITR/ITR.tsx` (2處)
- `components/NOI/NOI.tsx` (1處)

---

## 2. Context 更新邏輯優化

### 問題
Context 中的 `add`, `update`, `delete` 函數使用了舊的 state 值，可能導致狀態更新不一致。

### 建議
使用函數式更新（functional updates）來確保使用最新的 state：

```typescript
// 當前（可能有問題）
const addNCR = (ncr: Omit<NCRItem, 'id'>) => {
  const newNCR: NCRItem = {
    ...ncr,
    id: Date.now().toString(),
  };
  setNcrList([...ncrList, newNCR]); // 使用舊的 ncrList
  return newNCR;
};

// 優化後
const addNCR = (ncr: Omit<NCRItem, 'id'>) => {
  const newNCR: NCRItem = {
    ...ncr,
    id: Date.now().toString(),
  };
  setNcrList(prev => [...prev, newNCR]); // 使用函數式更新
  return newNCR;
};
```

### 影響文件
- `context/ITRContext.tsx`
- `context/NCRContext.tsx`
- `context/ITPContext.tsx`
- `context/NOIContext.tsx`

---

## 3. 提取重複的過濾邏輯為自定義 Hook

### 問題
多個組件都有類似的過濾邏輯（vendor/contractor filter + search query）。

### 建議
創建 `hooks/useFilteredList.ts`：

```typescript
export const useFilteredList = <T>(
  list: T[],
  searchQuery: string,
  filterValue: string,
  filterKey: keyof T,
  searchFields: (keyof T)[]
) => {
  return useMemo(() => {
    let filtered = list;

    // 過濾
    if (filterValue !== 'all') {
      filtered = filtered.filter(item => item[filterKey] === filterValue);
    }

    // 搜尋
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(item =>
        searchFields.some(field => {
          const value = item[field];
          return value?.toString().toLowerCase().includes(query);
        })
      );
    }

    return filtered;
  }, [list, searchQuery, filterValue, filterKey, searchFields]);
};
```

---

## 4. 提取統計計算邏輯

### 問題
多個組件都有類似的統計計算邏輯。

### 建議
創建 `utils/statistics.ts`：

```typescript
export const calculateStatusStatistics = <T>(
  list: T[],
  statusKey: keyof T,
  statusMap: Record<string, string>
) => {
  return useMemo(() => {
    const counts: Record<string, number> = {};
    list.forEach(item => {
      const status = (item[statusKey] as string)?.toLowerCase() || '';
      const mappedStatus = statusMap[status] || status;
      counts[mappedStatus] = (counts[mappedStatus] || 0) + 1;
    });
    return counts;
  }, [list, statusKey, statusMap]);
};
```

---

## 5. 使用 useCallback 優化函數

### 問題
一些事件處理函數沒有使用 `useCallback`，可能導致不必要的重新渲染。

### 建議
對頻繁使用的函數使用 `useCallback`：

```typescript
const handleEdit = useCallback((id: string) => {
  setCurrentNoiId(id);
  setIsModalOpen(true);
}, []);

const handleDelete = useCallback((id: string) => {
  // ...
}, [noiList, itrList, ncrList]);
```

---

## 6. 統一 Operations 按鈕組件

### 問題
Operations 欄位的按鈕結構在多個組件中重複。

### 建議
創建 `components/common/OperationsButtons.tsx`：

```typescript
interface OperationsButtonsProps {
  onEdit: () => void;
  onDetails: () => void;
  onDelete: () => void;
  relatedButtons?: Array<{ label: string; onClick: () => void; count?: number }>;
  isEditing?: boolean;
  onSave?: () => void;
  onCancel?: () => void;
}
```

---

## 7. 優化 Context Provider 的 value

### 問題
Context Provider 的 value 對象每次渲染都會創建新對象，導致所有消費者重新渲染。

### 建議
使用 `useMemo` 包裝 value：

```typescript
const value = useMemo(
  () => ({ ncrList, addNCR, updateNCR, deleteNCR, getNCRList, getNCRByVendor }),
  [ncrList]
);
```

---

## 8. 類型安全改進

### 問題
一些地方使用了 `as any` 類型斷言。

### 建議
- 定義完整的類型
- 使用類型守衛（type guards）
- 避免使用 `any`

---

## 優先級

1. **高優先級**：
   - Context 更新邏輯優化（可能導致 bug）
   - 使用統一的編號生成工具函數（代碼重複）

2. **中優先級**：
   - 提取重複的過濾邏輯
   - 優化 Context Provider 的 value

3. **低優先級**：
   - 使用 useCallback
   - 統一 Operations 按鈕組件
   - 提取統計計算邏輯
