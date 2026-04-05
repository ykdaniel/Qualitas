import React from 'react';
import { useNOI } from '../context/NOIContext';
import { useITP } from '../context/ITPContext';
import { useNCR } from '../context/NCRContext';
import { useITR } from '../context/ITRContext';

/**
 * 跨模組查詢工具組件
 * 用於在相關模組中顯示關聯記錄的連結或按鈕
 */

interface RelatedRecordsProps {
  type: 'ITP' | 'NOI' | 'NCR' | 'ITR' | 'FAT';
  referenceValue: string;
  onNavigate?: (module: string, id: string) => void;
}

export const RelatedRecordsButton: React.FC<RelatedRecordsProps> = ({ 
  type, 
  referenceValue, 
  onNavigate 
}) => {
  const { noiList } = useNOI();
  const { itpList } = useITP();
  const { ncrList } = useNCR();
  const { itrList, getITRByNOI, getITRByNCR } = useITR();

  const getRelatedRecords = () => {
    switch (type) {
      case 'ITP':
        // Find NOIs that reference this ITP
        const noiRefs = noiList.filter(noi => noi.itpNo === referenceValue);
        return { type: 'NOI', records: noiRefs };
      
      case 'NOI':
        // Find ITRs that reference this NOI
        const itrRefs = getITRByNOI(referenceValue);
        return { type: 'ITR', records: itrRefs };
      
      case 'NCR':
        // Find ITRs that reference this NCR
        const itrNcrRefs = getITRByNCR(referenceValue);
        return { type: 'ITR', records: itrNcrRefs };
      
      default:
        return { type: '', records: [] };
    }
  };

  const related = getRelatedRecords();
  
  if (related.records.length === 0) {
    return null;
  }

  return (
    <button
      onClick={() => {
        if (onNavigate && related.records.length > 0) {
          // Navigate to first related record or show list
          onNavigate(related.type, related.records[0].id);
        }
      }}
      style={{
        padding: '4px 8px',
        background: '#8b5cf6',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        fontSize: '12px',
        cursor: 'pointer',
      }}
      title={`查看 ${related.records.length} 個相關的 ${related.type} 記錄`}
    >
      查看相關 {related.type} ({related.records.length})
    </button>
  );
};

/**
 * 獲取關聯記錄的統計信息
 */
export const useRelatedRecordsStats = (type: string, referenceValue: string) => {
  const { noiList } = useNOI();
  const { itrList, getITRByNOI, getITRByNCR } = useITR();
  const { ncrList } = useNCR();

  const stats = React.useMemo(() => {
    switch (type) {
      case 'ITP':
        const noiCount = noiList.filter(noi => noi.itpNo === referenceValue).length;
        return { NOI: noiCount };
      
      case 'NOI':
        const itrCount = getITRByNOI(referenceValue).length;
        return { ITR: itrCount };
      
      case 'NCR':
        const itrNcrCount = getITRByNCR(referenceValue).length;
        return { ITR: itrNcrCount };
      
      case 'FAT':
        // 目前沒有其他模組引用 FAT
        // 未來如果有模組引用 FAT，可以在這裡添加統計
        return {};
      
      default:
        return {};
    }
  }, [type, referenceValue, noiList, itrList, ncrList]);

  return stats;
};
