import { NOIItem } from '../store/noiStore';
import { NCRItem } from '../store/ncrStore';
import { ITRItem } from '../store/itrStore';
import { ChecklistRecord } from '../store/checklistStore';

// FATItem interface for type checking
interface FATItem {
  id: string;
  equipment: string;
  supplier: string;
  [key: string]: any;
}

// ITPItem interface for type checking
interface ITPItem {
  id: string;
  vendor: string;
  [key: string]: any;
}

// PQPItem interface for type checking
interface PQPItem {
  id: string;
  vendor?: string;
  [key: string]: any;
}

// OBSItem interface for type checking
interface OBSItem {
  id: string;
  vendor?: string;
  [key: string]: any;
}

// FollowUpItem interface for type checking
interface FollowUpItem {
  id: string;
  vendor?: string;
  [key: string]: any;
}

// AuditItem interface for type checking
interface AuditItem {
  id: string;
  vendor?: string;
  [key: string]: any;
}

/**
 * 檢查刪除 ITP 時的關聯數據
 */
export const checkITPReferences = (itpId: string, noiList: NOIItem[]): {
  hasReferences: boolean;
  references: { type: string; count: number }[];
} => {
  const noiReferences = noiList.filter(noi => noi.itpNo === itpId);

  return {
    hasReferences: noiReferences.length > 0,
    references: [
      { type: 'NOI', count: noiReferences.length }
    ]
  };
};

/**
 * 檢查刪除 NOI 時的關聯數據
 */
export const checkNOIReferences = (
  noiId: string,
  noiReferenceNo: string,
  itrList: ITRItem[],
  ncrList: NCRItem[]
): {
  hasReferences: boolean;
  references: { type: string; count: number }[];
} => {
  // ITR references NOI by noiNumber field (連結到產生此 ITR 的 NOI)
  const itrReferences = itrList.filter(itr => itr.noiNumber === noiReferenceNo);
  // NCR references NOI through noiNumber field (連結到觸發此 NCR 的 NOI)
  const ncrReferences = ncrList.filter(ncr => ncr.noiNumber === noiReferenceNo);

  return {
    hasReferences: itrReferences.length > 0 || ncrReferences.length > 0,
    references: [
      { type: 'ITR', count: itrReferences.length },
      { type: 'NCR', count: ncrReferences.length }
    ]
  };
};

/**
 * 檢查刪除 NCR 時的關聯數據
 */
export const checkNCRReferences = (
  ncrId: string,
  ncrNumber: string,
  itrList: ITRItem[]
): {
  hasReferences: boolean;
  references: { type: string; count: number }[];
} => {
  const itrReferences = itrList.filter(itr => itr.ncrNumber === ncrNumber);

  return {
    hasReferences: itrReferences.length > 0,
    references: [
      { type: 'ITR', count: itrReferences.length }
    ]
  };
};

/**
 * 檢查刪除 ITP 時是否被 Checklist 引用
 */
export const checkITPChecklistReferences = (
  itpId: string,
  checklistList: ChecklistRecord[]
): {
  hasReferences: boolean;
  references: { type: string; count: number }[];
} => {
  const checklistReferences = checklistList.filter(item => item.itpId === itpId);

  return {
    hasReferences: checklistReferences.length > 0,
    references: [{ type: 'Checklist', count: checklistReferences.length }]
  };
};

/**
 * 檢查刪除 ITR 時是否被 Checklist 引用
 */
export const checkITRChecklistReferences = (
  itrId: string,
  checklistList: ChecklistRecord[]
): {
  hasReferences: boolean;
  references: { type: string; count: number }[];
} => {
  const checklistReferences = checklistList.filter(item => item.itrId === itrId);

  return {
    hasReferences: checklistReferences.length > 0,
    references: [{ type: 'Checklist', count: checklistReferences.length }]
  };
};

/**
 * 檢查刪除 Contractor 時的關聯數據
 * Contractor 被多個模組引用，需全面檢查
 */
export const checkContractorReferences = (
  contractorId: string,
  contractorName: string,
  itpList: ITPItem[],
  ncrList: NCRItem[],
  noiList: NOIItem[],
  itrList: ITRItem[],
  pqpList: PQPItem[],
  obsList: OBSItem[],
  fatList: FATItem[],
  followupList: FollowUpItem[],
  auditList: AuditItem[]
): {
  hasReferences: boolean;
  references: { type: string; count: number }[];
} => {
  // Check all modules that reference contractors by vendor field
  const itpReferences = itpList.filter(item => item.vendor === contractorName);
  const ncrReferences = ncrList.filter(item => item.vendor === contractorName);
  const noiReferences = noiList.filter(item => item.vendor === contractorName);
  const itrReferences = itrList.filter(item => item.vendor === contractorName);
  const pqpReferences = pqpList.filter(item => item.vendor === contractorName);
  const obsReferences = obsList.filter(item => item.vendor === contractorName);
  const fatReferences = fatList.filter(item => item.supplier === contractorName); // FAT uses 'supplier' instead of 'vendor'
  const followupReferences = followupList.filter(item => item.vendor === contractorName);
  const auditReferences = auditList.filter(item => item.vendor === contractorName);

  const references = [
    { type: 'ITP', count: itpReferences.length },
    { type: 'NCR', count: ncrReferences.length },
    { type: 'NOI', count: noiReferences.length },
    { type: 'ITR', count: itrReferences.length },
    { type: 'PQP', count: pqpReferences.length },
    { type: 'OBS', count: obsReferences.length },
    { type: 'FAT', count: fatReferences.length },
    { type: 'FollowUp', count: followupReferences.length },
    { type: 'Audit', count: auditReferences.length }
  ];

  const hasReferences = references.some(ref => ref.count > 0);

  return {
    hasReferences,
    references
  };
};

/**
 * 檢查刪除 FAT 時的關聯數據
 * 目前沒有其他模組引用 FAT，但保留此函數以保持一致性
 * 未來如果有模組引用 FAT，可以在這裡添加檢查邏輯
 */
export const checkFATReferences = (
  fatId: string,
  fatIdentifier: string,
  // 未來可以添加其他模組的列表參數，例如 itrList, noiList 等
): {
  hasReferences: boolean;
  references: { type: string; count: number }[];
} => {
  // 目前沒有其他模組引用 FAT
  // 未來如果有模組引用 FAT（例如 ITR 有 fatNumber 欄位），可以在這裡添加檢查：
  // const itrReferences = itrList.filter(itr => itr.fatNumber === fatIdentifier);

  return {
    hasReferences: false,
    references: []
  };
};

/**
 * 生成刪除確認訊息，包含關聯數據警告
 */
export const generateDeleteMessage = (
  itemType: string,
  itemName: string,
  references: { type: string; count: number }[],
  t: (key: string) => string
): string => {
  const defaultMsg = t('common.confirmDelete').replace('此項目', `此 ${itemType} 項目`);

  if (references.length === 0 || references.every(ref => ref.count === 0)) {
    return defaultMsg;
  }

  const refMessages = references
    .filter(ref => ref.count > 0)
    .map(ref => `${ref.count} ${ref.type === 'NCR' ? t('home.ncr.description') : ref.type === 'ITR' ? t('home.itr.description') : ref.type === 'NOI' ? t('home.noi.description') : ref.type}`)
    .join('、');

  // Since we don't have a specific key for the warning prefix, we'll construct it or add a key
  // Let's assume we use common keys or hardcode the structure for now if a specific key is missing
  // Better approach: use a combined key if possible, but let's stick to the prompt's scope.

  const isZh = t('common.yes') === '是';

  if (isZh) {
    return `確定要刪除此 ${itemType} 項目 (${itemName}) 嗎？\n\n警告：此項目被以下記錄引用：${refMessages}\n刪除後這些引用將失效。`;
  } else {
    return `Are you sure you want to delete this ${itemType} item (${itemName})?\n\nWarning: This item is referenced by the following records: ${refMessages}\nThese references will become invalid after deletion.`;
  }
};
