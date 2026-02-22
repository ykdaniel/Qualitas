import { Contractor } from '../store/contractorsStore';

/**
 * 統一的編號生成工具函數
 * 從 ContractorsContext 獲取 abbreviation，如果沒有則使用備用邏輯
 */
export const getContractorAbbreviation = (
  contractorName: string,
  contractors: Contractor[]
): string => {
  if (!contractorName) return 'XXX';

  // First, try to get abbreviation from ContractorsContext
  const contractor = contractors.find(c => c.name === contractorName);
  if (contractor && contractor.abbreviation) {
    return contractor.abbreviation.toUpperCase();
  }

  // Extract abbreviation from contractor name
  // For "廠商A" -> "A", "廠商B" -> "B", etc.
  const match = contractorName.match(/廠商([A-Za-z0-9]+)/);
  if (match && match[1]) {
    return match[1].toUpperCase();
  }

  // If no match, try to extract first few uppercase letters or numbers
  const upperCaseMatch = contractorName.match(/[A-Z0-9]+/);
  if (upperCaseMatch) {
    return upperCaseMatch[0].substring(0, 3).toUpperCase();
  }

  // Fallback: use first 3 characters
  return contractorName.substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'XXX';
};

/**
 * 生成編號：格式為 [縮寫]-[類型]-[流水號]
 */
export const generateDocumentNumber = (
  type: 'NOI' | 'NCR' | 'ITR',
  contractorName: string,
  contractors: Contractor[],
  existingNumbers: string[],
  excludeId?: string
): string => {
  const abbreviation = getContractorAbbreviation(contractorName, contractors);

  // Extract sequence numbers from existing numbers that match the format
  const sequenceNumbers = existingNumbers
    .map(num => {
      const match = num.match(new RegExp(`^([A-Z0-9]+)-${type}-(\\d{3})$`));
      if (match) {
        const numAbbreviation = match[1];
        const sequence = parseInt(match[2], 10);
        // Only include if the abbreviation matches
        if (numAbbreviation === abbreviation && sequence > 0) {
          return sequence;
        }
      }
      return 0;
    })
    .filter(num => num > 0);

  // Get next sequence number
  const nextSequence = sequenceNumbers.length > 0
    ? Math.max(...sequenceNumbers) + 1
    : 1;

  // Format as three-digit number
  const sequenceStr = String(nextSequence).padStart(3, '0');

  return `${abbreviation}-${type}-${sequenceStr}`;
};

/**
 * 驗證編號格式
 */
export const isValidDocumentFormat = (
  documentNumber: string,
  type: 'NOI' | 'NCR' | 'ITR'
): boolean => {
  if (!documentNumber || documentNumber === '不可編輯') return false;
  const pattern = new RegExp(`^[A-Z0-9]+-${type}-\\d{3}$`);
  return pattern.test(documentNumber);
};
