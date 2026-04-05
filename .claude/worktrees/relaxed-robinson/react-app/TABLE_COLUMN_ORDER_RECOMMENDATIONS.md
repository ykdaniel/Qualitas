# 表格欄位順序建議

## 統一原則

1. **#** - 序號（固定最左）
2. **識別欄位** - Reference no. / Document Number（最重要的識別信息）
3. **Status** - 狀態（關鍵信息，應在顯眼位置）
4. **關聯欄位** - Contractor/廠商（承包商信息）
5. **日期欄位** - 按時間順序排列（Issue Date → Inspection Date → Close-out Date）
6. **關聯編號** - ITP no., NOI no., NCR no. 等（相關文檔引用）
7. **描述性欄位** - Description, Subject, Type 等
8. **其他欄位** - Rev, Submit, Remark 等
9. **Operations** - 操作按鈕（固定最右）

---

## 各組件建議順序

### 1. NOI (Notice of Inspection)
**建議順序：**
```
#, Reference no., Status, Contractor, Package, ITP no., Issue Date, Inspection Date, Inspection Time, Event #, Checkpoint, Operations
```

**理由：**
- Reference no. 是最重要的識別信息，應在 Status 之前
- Contractor 和 Package 是關鍵分類信息，應在日期之前
- ITP no. 是關聯信息，應在日期之前
- 日期按時間順序：Issue Date → Inspection Date → Inspection Time

**當前順序：**
```
#, Status, Reference no., Contractor, Package, Issue Date, Inspection Date, Inspection Time, ITP no., Event #, Checkpoint, Operations
```

---

### 2. ITP (Inspection Test Plan)
**建議順序：**
```
#, Document Number, Status, 廠商, Description, Rev, Submit, Operations
```

**理由：**
- Document Number 是識別信息，應在最前
- Status 是關鍵狀態，應在廠商之前
- 廠商是分類信息，應在描述性欄位之前

**當前順序：**
```
#, 廠商, Document Number, Description, Rev, Submit, Status, Operations
```

---

### 3. ITR (Inspection Test Report)
**建議順序：**
```
#, Reference no., Status, Contractor, NOI no., NCR no., Inspection Date, Close-out Date, Subject, Rev, Operations
```

**理由：**
- Reference no. 是識別信息
- Status 是關鍵狀態
- Contractor 是分類信息
- 關聯編號（NOI no., NCR no.）應在日期之前
- 日期按時間順序

**當前順序：**
```
#, Reference no., Status, Inspection Date, Close-out Date, Rev, NOI no., Contractor, Subject, NCR no., Operations
```

---

### 4. NCR (Non-Conformance Report)
**建議順序：**
```
#, Reference no., Status, Contractor, Type, Subject, Raise Date, Close-out Date, Found By, Raised By, Product Disposition, Product Integrity related, Permanent Product Deviation, Impact to O&M, Operations
```

**理由：**
- Reference no. 是識別信息
- Status 是關鍵狀態
- Contractor 是分類信息
- Type 和 Subject 是描述性信息，應在日期之前
- 日期按時間順序
- 人員信息（Found By, Raised By）應在日期之後
- 產品相關欄位放在最後

**當前順序：**
```
#, Reference no., Status, Raise Date, Close-out Date, Type, Contractor, Subject, Found By, Raised By, Product Disposition, Product Integrity related, Permanent Product Deviation, Impact to O&M, Operations
```

---

### 5. OBS (Observation)
**建議順序：**
```
#, Reference no., Status, Contractor, Type, Subject, Raise Date, Close-out Date, Found By, Raised By, Product Disposition, Operations
```

**理由：**
- 與 NCR 類似的邏輯
- 保持與 NCR 的一致性

**當前順序：**
```
#, Reference no., Status, Raise Date, Close-out Date, Type, Contractor, Subject, Found By, Raised By, Product Disposition, Operations
```

---

### 6. FAT (Factory Acceptance Test)
**建議順序：**
```
#, Document Number, Status, 廠商, Description, Rev, Submit, Remark, Operations
```

**理由：**
- 與 ITP 類似的邏輯
- 保持一致性

**當前順序：**
```
#, 廠商, Document Number, Description, Rev, Submit, Status, Remark, Operations
```

---

## 統一模式總結

### 模式 A：有 Reference no. 的組件（NOI, ITR, NCR, OBS）
```
#, Reference no., Status, Contractor, [關聯編號], [日期欄位], [描述性欄位], [其他欄位], Operations
```

### 模式 B：有 Document Number 的組件（ITP, FAT）
```
#, Document Number, Status, 廠商, Description, [其他欄位], Operations
```

---

## 優先級建議

1. **高優先級**：
   - Reference no. / Document Number 應在 Status 之前（最重要的識別信息）
   - Status 應在 Contractor/廠商之前（關鍵狀態信息）
   - Contractor/廠商 應在日期之前（分類信息）

2. **中優先級**：
   - 關聯編號（ITP no., NOI no., NCR no.）應在日期之前
   - 日期欄位按時間順序排列

3. **低優先級**：
   - 描述性欄位的具體順序可以根據業務需求調整
