/**
 * 狀態一致性檢查工具
 */

export interface StatusTransition {
  from: string;
  to: string;
  allowed: boolean;
  message?: string;
}

/**
 * NOI 狀態轉換規則
 */
export const NOIStatusTransitions: StatusTransition[] = [
  { from: 'Open', to: 'Closed', allowed: true },
  { from: 'Closed', to: 'Open', allowed: true },
  { from: 'Open', to: 'Reject', allowed: true },
  { from: 'Under Review', to: 'Reject', allowed: true },
  { from: 'Reject', to: 'Open', allowed: true },
];

/**
 * ITP 狀態轉換規則
 */
export const ITPStatusTransitions: StatusTransition[] = [
  { from: 'Pending', to: 'Approved', allowed: true },
  { from: 'Pending', to: 'Rejected', allowed: true },
  { from: 'Approved', to: 'Void', allowed: true },
  { from: 'Rejected', to: 'Approved', allowed: true },
  { from: 'Rejected', to: 'Void', allowed: true },
];

/**
 * ITR 狀態轉換規則
 */
export const ITRStatusTransitions: StatusTransition[] = [
  { from: 'In Progress', to: 'Approved', allowed: true },
  { from: 'In Progress', to: 'Reject', allowed: true },
  { from: 'Approved', to: 'Reject', allowed: false, message: '已批准的 ITR 不能改為拒絕' },
  { from: 'Reject', to: 'Approved', allowed: true },
];

/**
 * NCR 狀態轉換規則
 */
export const NCRStatusTransitions: StatusTransition[] = [
  { from: 'Opening', to: 'Closed', allowed: true },
  { from: 'Closed', to: 'Opening', allowed: true },
];

/**
 * 檢查狀態轉換是否允許
 */
export const validateStatusTransition = (
  currentStatus: string,
  newStatus: string,
  transitions: StatusTransition[]
): { allowed: boolean; message?: string } => {
  // 如果狀態相同，允許
  if (currentStatus.toLowerCase() === newStatus.toLowerCase()) {
    return { allowed: true };
  }

  const transition = transitions.find(
    t => t.from.toLowerCase() === currentStatus.toLowerCase() &&
      t.to.toLowerCase() === newStatus.toLowerCase()
  );

  if (!transition) {
    // 如果沒有定義的轉換規則，預設允許（向後兼容）
    return { allowed: true };
  }

  return {
    allowed: transition.allowed,
    message: transition.message
  };
};

/**
 * 檢查相關記錄的狀態一致性
 */
export const checkRelatedStatusConsistency = (
  parentType: 'ITP' | 'NOI',
  parentStatus: string,
  childType: 'NOI' | 'ITR',
  childStatus: string
): { consistent: boolean; message?: string } => {
  // 如果父記錄是 Void，子記錄應該也被標記
  if (parentType === 'ITP' && parentStatus.toLowerCase() === 'void') {
    return {
      consistent: false,
      message: 'ITP 已標記為 Void，相關的 NOI 應該被處理'
    };
  }

  // 如果 NOI 是 Closed，相關的 ITR 應該已完成
  if (parentType === 'NOI' && parentStatus.toLowerCase() === 'closed') {
    if (childType === 'ITR' && childStatus.toLowerCase() === 'in progress') {
      return {
        consistent: false,
        message: 'NOI 已關閉，但相關的 ITR 仍在進行中'
      };
    }
  }

  return { consistent: true };
};

/**
 * 欄位驗證規則介面
 */
export interface FieldValidationRule {
  field: string;
  required: boolean;
  requiredIfStatus?: string[]; // 只有在這些狀態下才必填
  excludedIfStatus?: string[]; // 在這些狀態下不必填（優先權高於 required）
  message: string; // 錯誤訊息 Key 或文字
}

/**
 * 驗證欄位是否符合規則
 */
export const validateRequiredFields = (
  data: any,
  status: string,
  rules: FieldValidationRule[]
): { valid: boolean; message?: string } => {
  for (const rule of rules) {
    // 檢查是否應該忽略此規則
    if (rule.excludedIfStatus && rule.excludedIfStatus.map(s => s.toLowerCase()).includes(status.toLowerCase())) {
      continue;
    }

    // 檢查是否符合必填條件
    let isRequired = rule.required;
    if (rule.requiredIfStatus) {
      isRequired = rule.required || rule.requiredIfStatus.map(s => s.toLowerCase()).includes(status.toLowerCase());
    }

    if (isRequired) {
      const value = data[rule.field];
      if (value === undefined || value === null || value === '') {
        return { valid: false, message: rule.message };
      }
    }
  }
  return { valid: true };
};

/**
 * NOI 欄位驗證規則 configuration
 */
export const NOIValidationRules: FieldValidationRule[] = [
  {
    field: 'contractor',
    required: true,
    message: 'common.selectContractor'
  },
  {
    field: 'issueDate',
    required: true,
    message: 'common.selectDate'
  },
  {
    field: 'itpNo',
    required: true,
    excludedIfStatus: ['Reject'], // 拒絕狀態下不強制要求 ITP
    message: 'noi.validation.missingITP'
  }
];
