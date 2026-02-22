import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { getNamingRules, updateNamingRules, NamingRuleApi } from '../../services/api';
import styles from './DocumentNamingRules.module.css';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createColumns, NamingRuleItem } from './columns';

export interface NamingRule {
  id: string;
  moduleName: string;
  prefix: string;
  sequenceDigits: number;
  description: string;
}

const DEFAULT_RULES: NamingRule[] = [
  { id: 'itp', moduleName: 'ITP', prefix: 'QTS-RKS-[ABBREV]-ITP-', sequenceDigits: 6, description: '專案-RKS-廠商縮寫-ITP-6位流水號' },
  { id: 'noi', moduleName: 'NOI', prefix: 'QTS-RKS-[ABBREV]-NOI-', sequenceDigits: 6, description: '專案-RKS-廠商縮寫-NOI-6位流水號' },
  { id: 'itr', moduleName: 'ITR', prefix: 'QTS-RKS-[ABBREV]-ITR-', sequenceDigits: 6, description: '專案-RKS-廠商縮寫-ITR-6位流水號' },
  { id: 'ncr', moduleName: 'NCR', prefix: 'QTS-RKS-[ABBREV]-NCR-', sequenceDigits: 6, description: '專案-RKS-廠商縮寫-NCR-6位流水號' },
  { id: 'obs', moduleName: 'OBS', prefix: 'QTS-RKS-[ABBREV]-OBS-', sequenceDigits: 6, description: '專案-RKS-廠商縮寫-OBS-6位流水號' },
  { id: 'pqp', moduleName: 'PQP', prefix: 'QTS-RKS-[ABBREV]-PQP-', sequenceDigits: 6, description: '專案-RKS-廠商縮寫-PQP-6位流水號' },
  { id: 'followup', moduleName: 'Follow up Issue', prefix: 'QTS-RKS-[ABBREV]-FUI-', sequenceDigits: 6, description: '專案-RKS-廠商縮寫-FUI-6位流水號' },
  { id: 'fat', moduleName: 'FAT', prefix: 'QTS-RKS-[ABBREV]-FAT-', sequenceDigits: 6, description: '專案-RKS-廠商縮寫-FAT-6位流水號' },
  { id: 'audit', moduleName: 'Audit', prefix: 'QTS-RKS-[ABBREV]-AUD-', sequenceDigits: 6, description: '專案-RKS-廠商縮寫-AUD-6位流水號' },
  { id: 'checklist', moduleName: 'Checklist', prefix: 'QTS-RKS-[ABBREV]-CHK-', sequenceDigits: 6, description: '專案-RKS-廠商縮寫-CHK-6位流水號' },
];



const DocumentNamingRules: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [rules, setRules] = useState<NamingRuleItem[]>(DEFAULT_RULES);
  const [saved, setSaved] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredRules = rules.filter(rule =>
    rule.moduleName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    rule.prefix.toLowerCase().includes(searchQuery.toLowerCase()) ||
    rule.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    const fetchRules = async () => {
      // ... (fetch logic remains same, just showing context)
      try {
        const apiRules: NamingRuleApi[] = await getNamingRules();
        const map = new Map<string, NamingRuleApi>();
        apiRules.forEach((r) => {
          map.set(r.doc_type.toLowerCase(), r);
        });
        setRules(
          DEFAULT_RULES.map((rule) => {
            const apiRule = map.get(rule.id.toLowerCase());
            if (!apiRule) {
              return { ...rule };
            }
            return {
              ...rule,
              prefix: apiRule.prefix,
              sequenceDigits: apiRule.sequence_digits,
            };
          })
        );
      } catch (e) {
        // 若後端尚未提供或發生錯誤，維持預設規則
        console.error('Failed to load document naming rules', e);
      }
    };

    fetchRules();
  }, []);

  const handlePrefixChange = (id: string, value: string) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, prefix: value } : r));
    setSaved(false);
  };

  const handleSequenceDigitsChange = (id: string, value: number) => {
    const n = Math.max(1, Math.min(6, Math.floor(value) || 1));
    setRules(prev => prev.map(r => r.id === id ? { ...r, sequenceDigits: n } : r));
    setSaved(false);
  };

  const handleSave = async () => {
    try {
      const payload = rules.map((rule) => ({
        doc_type: rule.id,
        prefix: rule.prefix ?? '',
        sequence_digits: Math.min(6, Math.max(1, Number(rule.sequenceDigits) || 6)),
      }));
      await updateNamingRules(payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      console.error('Failed to save document naming rules', e);
      const err = e as { response?: { data?: { detail?: string }; status?: number }; message?: string };
      const msg = err.response?.data?.detail ?? err.message ?? '請確認後端已啟動（port 3001）且網路連線正常。';
      alert(`命名規則儲存失敗：${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
    }
  };

  const getExample = (rule: NamingRuleItem): string => {
    const seq = String(1).padStart(rule.sequenceDigits, '0');
    return rule.prefix.replace('[ABBREV]', 'A') + seq;
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button type="button" className={styles.backButton} onClick={() => navigate('/')}>
            ← {t('common.back')}
          </button>
          <h1 className={styles.title}>{t('namingRules.title')}</h1>
          <p className={styles.subtitle}>{t('namingRules.subtitle')}</p>
        </div>
        <div className={styles.headerRight}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder={t('common.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.tableWrap}>
          <DataTable
            title={t('namingRules.title')}
            actions={
              <button className={styles.saveButton} onClick={handleSave}>
                {saved ? t('namingRules.saved') : t('namingRules.save')}
              </button>
            }
            columns={createColumns(handlePrefixChange, handleSequenceDigitsChange, getExample)}
            data={filteredRules}
            searchKey=""
            getRowId={(row) => row.id}
          />
        </div>
        <p className={styles.hint}>
          <strong>{t('namingRules.hint')}：</strong> {t('namingRules.hintContent')}
        </p>
      </div>
    </div>
  );
};

export default DocumentNamingRules;
