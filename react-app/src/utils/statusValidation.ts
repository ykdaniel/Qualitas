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
 * NOI 狀態轉換規則 (aligned with backend WorkflowEngine)
 * Backend: Open → [In Progress, Reject, Void]
 *          In Progress → [Resolved, Reject, Void]
 *          Resolved → [Closed, Void]
 *          Reject → [Open, Void]
 *          Closed → []
 */
export const NOIStatusTransitions: Record<string, string[]> = {
  'Open':        ['In Progress', 'Reject', 'Void'],
  'In Progress': ['Resolved', 'Reject', 'Void'],
  'Resolved':    ['Closed', 'Void'],
  'Reject':      ['Open', 'Void'],
  'Closed':      [],
  'Void':        [],
};

// Legacy array format for validateStatusTransition helper (kept for backward compat)
export const NOIStatusTransitionList: StatusTransition[] = [
  { from: 'Open',        to: 'In Progress', allowed: true },
  { from: 'Open',        to: 'Reject',      allowed: true },
  { from: 'In Progress', to: 'Resolved',    allowed: true },
  { from: 'In Progress', to: 'Reject',      allowed: true },
  { from: 'Resolved',    to: 'Closed',      allowed: true },
  { from: 'Reject',      to: 'Open',        allowed: true },
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
  { from: 'In Progress', to: 'Void', allowed: true },
  // 2026-09-19: backend now blocks ANY status change away from Approved via
  // the normal update path, unconditionally — only the dedicated
  // revoke-approval action (ITR_APPROVE-gated, requires a reason) may move
  // an ITR out of Approved. The UI's status dropdown is also disabled
  // outright once persisted-Approved (see ITRModals.tsx's isLocked), so
  // these are unreachable through the normal form; kept accurate here as a
  // defense-in-depth check, not as documentation of a still-open path.
  { from: 'Approved', to: 'Reject', allowed: false, message: '已核准的 ITR 無法直接改為拒絕，須先由具核准權限者撤回核准（Revoke Approval）' },
  { from: 'Approved', to: 'In Progress', allowed: false, message: '已核准的 ITR 無法直接改回進行中，須先由具核准權限者撤回核准（Revoke Approval）' },
  { from: 'Approved', to: 'Void', allowed: false, message: '已核准的 ITR 無法直接作廢，須先由具核准權限者撤回核准（Revoke Approval）' },
  { from: 'Reject', to: 'In Progress', allowed: true },
  { from: 'Reject', to: 'Approved', allowed: true },
  { from: 'Reject', to: 'Void', allowed: true },
  { from: 'Void', to: 'In Progress', allowed: false, message: '已作廢的 ITR 無法變更狀態' },
  { from: 'Void', to: 'Approved', allowed: false, message: '已作廢的 ITR 無法變更狀態' },
  { from: 'Void', to: 'Reject', allowed: false, message: '已作廢的 ITR 無法變更狀態' },
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
): { valid: boolean; message?: string; invalidFields: string[] } => {
  const invalidFields: string[] = [];
  let firstMessage: string | undefined;

  for (const rule of rules) {
    if (rule.excludedIfStatus && rule.excludedIfStatus.map(s => s.toLowerCase()).includes(status.toLowerCase())) {
      continue;
    }

    let isRequired = rule.required;
    if (rule.requiredIfStatus) {
      isRequired = rule.required || rule.requiredIfStatus.map(s => s.toLowerCase()).includes(status.toLowerCase());
    }

    if (isRequired) {
      const value = data[rule.field];
      if (value === undefined || value === null || value === '') {
        invalidFields.push(rule.field);
        if (!firstMessage) firstMessage = rule.message;
      }
    }
  }

  return { valid: invalidFields.length === 0, message: firstMessage, invalidFields };
};

/**
 * NOI 欄位驗證規則 configuration
 */
export const NOIValidationRules: FieldValidationRule[] = [
  { field: 'contractor', required: true, message: 'common.selectContractor' },
  { field: 'issueDate', required: true, message: 'common.selectDate' },
  { field: 'itpNo', required: true, excludedIfStatus: ['Reject'], message: 'noi.validation.missingITP' },
  { field: 'package', required: true, message: 'noi.validation.missingPackage' },
  { field: 'inspectionDate', required: true, message: 'noi.validation.missingInspectionDate' },
  { field: 'inspectionTime', required: true, message: 'noi.validation.missingInspectionTime' },
  { field: 'checkpoint', required: true, message: 'noi.validation.missingCheckpoint' },
  { field: 'eventNumber', required: true, message: 'noi.validation.missingEventNumber' },
  { field: 'contacts', required: true, message: 'noi.validation.missingContacts' },
  { field: 'phone', required: true, message: 'noi.validation.missingPhone' },
  { field: 'email', required: true, message: 'noi.validation.missingEmail' },
  { field: 'ncrNumber', required: true, message: 'noi.validation.missingNcrSelection' },
];
